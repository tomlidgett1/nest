import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  if (req.method !== "POST") {
    return jsonRes({ error: "method_not_allowed" }, 405);
  }

  // Authenticate: the user must provide their own JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) {
    return jsonRes({ error: "unauthorised", detail: "Missing Authorization header" }, 401);
  }

  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !user) {
    return jsonRes({ error: "unauthorised", detail: "Invalid or expired token" }, 401);
  }

  const uid = user.id;
  const userEmail = user.email ?? "";

  // Require email confirmation as a safety check
  let body: { confirmation?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid_body" }, 400);
  }

  if (!body.confirmation || body.confirmation.toLowerCase() !== userEmail.toLowerCase()) {
    return jsonRes({
      error: "confirmation_mismatch",
      detail: "You must confirm your email address to delete your account.",
    }, 400);
  }

  console.log(`[delete-account] Starting deletion for user ${uid} (${userEmail})`);

  const deletedTables: string[] = [];
  const errors: string[] = [];

  // 1. Delete from tables that DON'T have ON DELETE CASCADE from auth.users
  //    (imessage_users has ON DELETE SET NULL — we want full row removal)
  const manualTables = [
    "v2_triggers",
    "v2_chat_messages",
    "v2_agents",
    "imessage_users",
  ];

  for (const table of manualTables) {
    const { error, count } = await admin
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", uid);

    if (error) {
      console.error(`[delete-account] Failed to delete from ${table}:`, error.message);
      errors.push(`${table}: ${error.message}`);
    } else {
      deletedTables.push(table);
      console.log(`[delete-account] Deleted ${count ?? 0} rows from ${table}`);
    }
  }

  // 2. Delete the auth.users row — cascades to all FK-linked tables:
  //    profiles, folders, tags, notes, note_tags, search_documents,
  //    search_embeddings, email_messages, search_jobs, utterances,
  //    style_profiles, contact_rules, user_preferences, todos,
  //    google_oauth_tokens, user_google_accounts, ingestion_jobs,
  //    person_entities, action_items, v2_agents (now with FK),
  //    v2_chat_messages (now with FK), v2_triggers (now with FK)
  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(uid);

  if (deleteUserErr) {
    console.error(`[delete-account] Failed to delete auth user:`, deleteUserErr.message);
    return jsonRes({
      error: "deletion_failed",
      detail: `Manual cleanup succeeded for [${deletedTables.join(", ")}] but auth.users deletion failed: ${deleteUserErr.message}`,
      partial: true,
    }, 500);
  }

  console.log(`[delete-account] Successfully deleted user ${uid} (${userEmail}) and all associated data`);

  return jsonRes({
    success: true,
    deleted_user: uid,
    manually_cleaned: deletedTables,
    cascaded: "all remaining tables via auth.users ON DELETE CASCADE",
    errors: errors.length > 0 ? errors : undefined,
  }, 200);
});

function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
