import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refreshAccessToken, fetchCalendarTimezone } from "../_shared/gmail-helpers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop() ?? "";

  // add-callback does its own auth (receives original_user_id in body)
  if (req.method === "POST" && path === "add-callback") {
    return handleAddCallback(req);
  }

  // All other endpoints require JWT auth
  const user = await authenticate(req);
  if (!user) return jsonRes({ error: "unauthorised" }, 401);

  if (req.method === "GET") return handleList(user.id);
  if (req.method === "DELETE") return handleDelete(req, user.id);

  return jsonRes({ error: "not_found" }, 404);
});

async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return null;
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
}

async function handleList(userId: string) {
  const { data, error } = await admin
    .from("user_google_accounts")
    .select("id, google_email, google_name, google_avatar_url, is_primary, created_at")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return jsonRes({ error: error.message }, 500);
  return jsonRes({ accounts: data ?? [] }, 200);
}

async function handleAddCallback(req: Request) {
  try {
    const { original_user_id, provider_token, provider_refresh_token } = await req.json();

    if (!original_user_id || !provider_token) {
      return jsonRes({ error: "missing fields" }, 400);
    }

    // Verify the original user exists
    const { data: { user: originalUser }, error: userErr } = await admin.auth.admin.getUserById(original_user_id);
    if (userErr || !originalUser) {
      return jsonRes({ error: "invalid user" }, 400);
    }

    if (!provider_refresh_token) {
      return jsonRes({
        error: "no_refresh_token",
        hint: "Google only issues refresh tokens on first consent. Revoke app access at myaccount.google.com and try again.",
      }, 400);
    }

    // Fetch Google profile using the provider token
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${provider_token}` },
    });
    const profile = await profileRes.json();
    if (!profile.email) {
      return jsonRes({ error: "profile_fetch_failed" }, 502);
    }

    // Guard: check if this Google email is already linked to a different user
    const { data: conflict } = await admin
      .from("user_google_accounts")
      .select("user_id")
      .eq("google_email", profile.email)
      .neq("user_id", original_user_id)
      .maybeSingle();

    if (conflict) {
      console.log(`[manage-google-accounts] Email conflict: ${profile.email} already belongs to user ${conflict.user_id}`);
      return jsonRes({
        error: "email_conflict",
        detail: "This Google account is already linked to a different Nest user.",
      }, 409);
    }

    const { data: upsertData, error: upsertErr } = await admin.from("user_google_accounts").upsert(
      {
        user_id: original_user_id,
        google_email: profile.email,
        google_name: profile.name ?? "",
        google_avatar_url: profile.picture ?? "",
        refresh_token: provider_refresh_token,
        is_primary: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_email" },
    ).select("id").single();

    if (upsertErr) return jsonRes({ error: upsertErr.message }, 500);

    const accountId = upsertData?.id;
    console.log(`[manage-google-accounts] Linked ${profile.email} → ${original_user_id} (account ${accountId})`);

    // Fetch and store timezone (non-blocking)
    (async () => {
      try {
        const { token: accessToken } = await refreshAccessToken(provider_refresh_token);
        const tz = await fetchCalendarTimezone(accessToken);
        if (tz) {
          await admin.from("user_google_accounts")
            .update({ timezone: tz })
            .eq("user_id", original_user_id)
            .eq("google_email", profile.email);
          console.log(`[manage-google-accounts] Stored timezone ${tz} for ${profile.email}`);
        }
      } catch (e) {
        console.warn("[manage-google-accounts] Timezone fetch failed:", (e as Error).message);
      }
    })();

    return jsonRes({
      success: true,
      account: {
        google_email: profile.email,
        google_name: profile.name ?? "",
        google_avatar_url: profile.picture ?? "",
      },
    }, 200);
  } catch (e) {
    console.error("[manage-google-accounts] add-callback error", e);
    return jsonRes({ error: "internal" }, 500);
  }
}

async function handleDelete(req: Request, userId: string) {
  try {
    const { account_id } = await req.json();
    if (!account_id) return jsonRes({ error: "missing account_id" }, 400);

    const { data: account } = await admin
      .from("user_google_accounts")
      .select("id, is_primary")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (!account) return jsonRes({ error: "not_found" }, 404);

    if (account.is_primary) {
      const { count } = await admin
        .from("user_google_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if ((count ?? 0) <= 1) {
        return jsonRes({ error: "cannot_remove_last_account" }, 400);
      }
    }

    const { error: delErr } = await admin
      .from("user_google_accounts")
      .delete()
      .eq("id", account_id)
      .eq("user_id", userId);

    if (delErr) return jsonRes({ error: delErr.message }, 500);

    if (account.is_primary) {
      const { data: next } = await admin
        .from("user_google_accounts")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (next) {
        await admin.from("user_google_accounts").update({ is_primary: true }).eq("id", next.id);
      }
    }

    return jsonRes({ success: true }, 200);
  } catch (e) {
    console.error("[manage-google-accounts] delete error", e);
    return jsonRes({ error: "internal" }, 500);
  }
}


function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
