import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const microsoftClientId = Deno.env.get("MICROSOFT_CLIENT_ID") ?? "";
const microsoftClientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[microsoft-token-broker] Missing Supabase environment variables");
}

if (!microsoftClientId || !microsoftClientSecret) {
  console.error("[microsoft-token-broker] Missing Microsoft OAuth environment variables");
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

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // Allow service-role key to pass user_id directly (for testing/internal use)
  let userId: string;
  const isServiceRole = jwt === serviceRoleKey;
  if (isServiceRole && body.user_id) {
    userId = body.user_id as string;
    console.log("[microsoft-token-broker] Service-role access for user:", userId);
  } else {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (authError || !user) {
      console.error("[microsoft-token-broker] Invalid JWT", authError?.message ?? "unknown");
      return jsonResponse({ error: "unauthorised" }, 401);
    }
    userId = user.id;
  }

  const accountId = body.account_id as string | undefined;
  const microsoftEmail = body.microsoft_email as string | undefined;

  let refreshToken: string | null = null;
  let multiAccountId: string | null = null;

  if (accountId) {
    const { data } = await supabaseAdmin
      .from("user_microsoft_accounts")
      .select("id, refresh_token")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single();
    refreshToken = data?.refresh_token ?? null;
    multiAccountId = data?.id ?? null;
  } else if (microsoftEmail) {
    const { data } = await supabaseAdmin
      .from("user_microsoft_accounts")
      .select("id, refresh_token")
      .eq("microsoft_email", microsoftEmail)
      .eq("user_id", userId)
      .single();
    refreshToken = data?.refresh_token ?? null;
    multiAccountId = data?.id ?? null;
  } else {
    // Default: primary account
    const { data } = await supabaseAdmin
      .from("user_microsoft_accounts")
      .select("id, refresh_token")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .limit(1)
      .single();
    refreshToken = data?.refresh_token ?? null;
    multiAccountId = data?.id ?? null;
  }

  if (!refreshToken) {
    console.error("[microsoft-token-broker] Refresh token not found for", userId);
    return jsonResponse({ error: "refresh_token_not_found" }, 404);
  }

  const refreshResult = await refreshMicrosoftAccessToken(refreshToken);
  if (!refreshResult.ok) {
    return jsonResponse(
      {
        error: "microsoft_refresh_failed",
        status: refreshResult.status,
        detail: refreshResult.detail,
      },
      502,
    );
  }

  // Rotate refresh token if Microsoft issued a new one
  if (refreshResult.refreshToken && refreshResult.refreshToken !== refreshToken) {
    if (multiAccountId) {
      await supabaseAdmin
        .from("user_microsoft_accounts")
        .update({ refresh_token: refreshResult.refreshToken, updated_at: new Date().toISOString() })
        .eq("id", multiAccountId);
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

async function refreshMicrosoftAccessToken(refreshToken: string): Promise<RefreshOk | RefreshFail> {
  const body = new URLSearchParams({
    client_id: microsoftClientId,
    client_secret: microsoftClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "openid email offline_access User.Read Calendars.ReadWrite Mail.ReadWrite Mail.Send Contacts.Read Files.Read.All",
  });

  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
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
    console.error("[microsoft-token-broker] Microsoft refresh failed", response.status, textBody);
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
