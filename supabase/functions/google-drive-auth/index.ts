import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GOOGLE_SCOPES,
  buildIncrementalAuthUrl,
  hasScope,
  mergeScopes,
  parseScopes,
} from "../_shared/google-scopes.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop() ?? "";

  // Google redirects back via GET with ?code=&state=
  if (path === "callback" && (req.method === "GET" || req.method === "POST")) {
    return handleCallback(req);
  }

  if (req.method !== "POST") {
    return jsonRes({ error: "method_not_allowed" }, 405);
  }

  return handleAuthRequest(req);
});

/**
 * POST /google-drive-auth
 * Body: { account_id, redirect_uri }
 * Returns: { auth_url } or { already_granted: true }
 */
async function handleAuthRequest(req: Request) {
  const user = await authenticate(req);
  if (!user) return jsonRes({ error: "unauthorised" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const accountId = body.account_id as string | undefined;
  const redirectUri = body.redirect_uri as string | undefined;

  if (!accountId) {
    return jsonRes({ error: "missing account_id" }, 400);
  }
  if (!redirectUri) {
    return jsonRes({ error: "missing redirect_uri" }, 400);
  }

  const { data: account, error } = await admin
    .from("user_google_accounts")
    .select("id, google_email, scopes")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single();

  if (error || !account) {
    return jsonRes({ error: "account_not_found" }, 404);
  }

  if (hasScope(account.scopes ?? [], GOOGLE_SCOPES.DRIVE_READONLY)) {
    return jsonRes({ already_granted: true }, 200);
  }

  const state = JSON.stringify({ account_id: accountId, user_id: user.id });
  const stateEncoded = btoa(state);

  const callbackUri = `${supabaseUrl}/functions/v1/google-drive-auth/callback`;
  const authUrl = buildIncrementalAuthUrl({
    clientId: googleClientId,
    redirectUri: callbackUri,
    accountEmail: account.google_email,
    additionalScope: GOOGLE_SCOPES.DRIVE_READONLY,
    state: stateEncoded,
  });

  return jsonRes({ auth_url: authUrl, redirect_uri: redirectUri }, 200);
}

/**
 * POST /google-drive-auth/callback
 * Body: { code, state }
 * Exchanges the auth code, merges scopes, updates refresh token if new.
 */
async function handleCallback(req: Request) {
  try {
    let code: string | undefined;
    let stateEncoded: string | undefined;
    let frontendRedirect: string | undefined;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      code = body.code;
      stateEncoded = body.state;
      frontendRedirect = body.redirect_uri;
    } else {
      const url = new URL(req.url);
      code = url.searchParams.get("code") ?? undefined;
      stateEncoded = url.searchParams.get("state") ?? undefined;
    }

    if (!code || !stateEncoded) {
      return jsonRes({ error: "missing code or state" }, 400);
    }

    let state: { account_id: string; user_id: string };
    try {
      state = JSON.parse(atob(stateEncoded));
    } catch {
      return jsonRes({ error: "invalid state" }, 400);
    }

    const { data: account, error: acctErr } = await admin
      .from("user_google_accounts")
      .select("id, google_email, refresh_token, scopes")
      .eq("id", state.account_id)
      .eq("user_id", state.user_id)
      .single();

    if (acctErr || !account) {
      return jsonRes({ error: "account_not_found" }, 404);
    }

    const callbackUri = `${supabaseUrl}/functions/v1/google-drive-auth/callback`;
    const tokenBody = new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: callbackUri,
      grant_type: "authorization_code",
    });

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    if (!tokenResp.ok) {
      const detail = await tokenResp.text();
      console.error(`[google-drive-auth] Token exchange failed (${tokenResp.status}): ${detail.slice(0, 300)}`);
      return jsonRes({ error: "token_exchange_failed" }, 502);
    }

    const tokenData = await tokenResp.json();
    const newRefreshToken = tokenData.refresh_token as string | undefined;
    const grantedScopeStr = tokenData.scope as string | undefined;

    const grantedScopes = parseScopes(grantedScopeStr ?? "");
    const mergedScopes = mergeScopes(account.scopes ?? [], grantedScopes);

    const updatePayload: Record<string, unknown> = {
      scopes: mergedScopes,
      updated_at: new Date().toISOString(),
    };

    if (newRefreshToken && newRefreshToken !== account.refresh_token) {
      updatePayload.refresh_token = newRefreshToken;
    }

    await admin
      .from("user_google_accounts")
      .update(updatePayload)
      .eq("id", account.id);

    console.log(`[google-drive-auth] Scopes updated for ${account.google_email} (account ${account.id})`);

    if (frontendRedirect) {
      return jsonRes({ success: true, redirect: frontendRedirect }, 200);
    }

    const redirectTarget = `${supabaseUrl.replace(".supabase.co", "").includes("localhost") ? "http://localhost:5173" : "https://nest.expert"}/dashboard?drive_auth=success`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectTarget },
    });
  } catch (e) {
    console.error("[google-drive-auth] callback error:", e);
    return jsonRes({ error: "internal" }, 500);
  }
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return null;
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
}

function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
