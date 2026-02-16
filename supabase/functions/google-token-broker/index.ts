import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[google-token-broker] Missing Supabase environment variables");
}

if (!googleClientId || !googleClientSecret) {
  console.error("[google-token-broker] Missing Google OAuth environment variables");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    console.error("[google-token-broker] Invalid JWT", authError?.message ?? "unknown");
    return jsonResponse({ error: "unauthorised" }, 401);
  }

  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .single();

  if (tokenError || !tokenRow?.refresh_token) {
    console.error("[google-token-broker] Refresh token not found", tokenError?.message ?? "not_found");
    return jsonResponse({ error: "refresh_token_not_found" }, 404);
  }

  const refreshResult = await refreshGoogleAccessToken(tokenRow.refresh_token);
  if (!refreshResult.ok) {
    return jsonResponse(
      {
        error: "google_refresh_failed",
        status: refreshResult.status,
        detail: refreshResult.detail,
      },
      502,
    );
  }

  if (refreshResult.refreshToken && refreshResult.refreshToken !== tokenRow.refresh_token) {
    const { error: updateError } = await supabaseAdmin
      .from("google_oauth_tokens")
      .update({ refresh_token: refreshResult.refreshToken })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[google-token-broker] Failed to rotate refresh token", updateError.message);
    }
  }

  return jsonResponse(
    {
      access_token: refreshResult.accessToken,
      expires_in: refreshResult.expiresIn,
      token_type: refreshResult.tokenType,
    },
    200,
  );
});

type RefreshOk = {
  ok: true;
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  refreshToken?: string;
};

type RefreshFail = {
  ok: false;
  status: number;
  detail: string;
};

async function refreshGoogleAccessToken(refreshToken: string): Promise<RefreshOk | RefreshFail> {
  const body = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const textBody = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(textBody) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    console.error("[google-token-broker] Google refresh failed", response.status, textBody);
    return {
      ok: false,
      status: response.status,
      detail: textBody.slice(0, 300),
    };
  }

  const accessToken = (payload.access_token as string | undefined) ?? "";
  const expiresIn = Number(payload.expires_in ?? 3600);
  const tokenType = (payload.token_type as string | undefined) ?? "Bearer";
  const rotatedRefreshToken = payload.refresh_token as string | undefined;

  if (!accessToken) {
    return {
      ok: false,
      status: 500,
      detail: "missing_access_token",
    };
  }

  return {
    ok: true,
    accessToken,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    tokenType,
    refreshToken: rotatedRefreshToken,
  };
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
