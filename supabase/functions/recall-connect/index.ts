// recall-connect — Calendar connection management for Recall.ai meeting recording.
//
// Follows manage-google-accounts pattern: JWT auth, CORS headers, service role admin.
//
// POST /recall-connect — Connect user's calendar (uses existing Google refresh token)
// GET  /recall-connect — List connected calendars
// DELETE /recall-connect — Disconnect a calendar
//
// Key insight: Nest's existing Google OAuth already has calendar.events scope.
// We pass Nest's GOOGLE_CLIENT_ID/SECRET + user's refresh_token directly to Recall.ai.
// No additional OAuth flow needed — the user just says "yes" in iMessage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createRecallCalendar,
  deleteRecallCalendar,
  getRecallCalendar,
  logRecallApi,
  withRecallLogging,
} from "../_shared/recall-helpers.ts";

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
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // POST with user_id in body (called from tools.ts via service role)
  if (req.method === "POST") {
    return handleConnect(req);
  }

  // JWT auth for GET/DELETE
  const user = await authenticate(req);
  if (!user) return jsonRes({ error: "unauthorised" }, 401);

  if (req.method === "GET") return handleList(user.id);
  if (req.method === "DELETE") return handleDisconnect(req, user.id);

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

// ── POST: Connect calendar ──────────────────────────────────

async function handleConnect(req: Request): Promise<Response> {
  try {
    const { user_id, account_email } = await req.json();
    if (!user_id) return jsonRes({ error: "missing user_id" }, 400);

    // Check if already connected
    const { data: existing } = await admin
      .from("recall_calendars")
      .select("id, recall_calendar_id, status")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing && existing.status === "active") {
      return jsonRes({
        already_connected: true,
        calendar_id: existing.recall_calendar_id,
      });
    }

    // Fetch user's Google account refresh token
    let accountQuery = admin
      .from("user_google_accounts")
      .select("id, google_email, refresh_token")
      .eq("user_id", user_id);

    if (account_email) {
      accountQuery = accountQuery.eq("google_email", account_email);
    } else {
      accountQuery = accountQuery.eq("is_primary", true);
    }

    const { data: account, error: accErr } = await accountQuery.limit(1).maybeSingle();

    if (accErr || !account?.refresh_token) {
      return jsonRes({
        error: "no_google_account",
        hint: "No Google account connected. Please connect a Google account first.",
      }, 400);
    }

    // Create calendar in Recall.ai using Nest's OAuth client + user's refresh token
    const { calendarId, status } = await withRecallLogging(
      admin,
      {
        userId: user_id,
        endpoint: "/api/v2/calendars/",
        method: "POST",
        recallIds: {},
      },
      () => createRecallCalendar(
        googleClientId,
        googleClientSecret,
        account.refresh_token,
        "google_calendar",
      ),
    );

    // Store in our DB
    if (existing) {
      await admin.from("recall_calendars").update({
        recall_calendar_id: calendarId,
        calendar_email: account.google_email,
        status: status === "connected" ? "active" : "syncing",
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await admin.from("recall_calendars").insert({
        user_id,
        recall_calendar_id: calendarId,
        platform: "google_calendar",
        calendar_email: account.google_email,
        status: status === "connected" ? "active" : "syncing",
      });
    }

    // Update pitch status
    await admin.from("v2_user_memory").update({
      recall_pitch_status: "accepted",
      recall_pitched_at: new Date().toISOString(),
    }).eq("user_id", user_id);

    console.log(`[recall-connect] Calendar connected for user ${user_id}: ${calendarId} (${account.google_email})`);

    return jsonRes({
      success: true,
      calendar_id: calendarId,
      email: account.google_email,
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[recall-connect] Connect error:", msg);
    logRecallApi(admin, {
      direction: "outbound",
      endpoint: "/api/v2/calendars/",
      method: "POST",
      error: msg,
    });
    return jsonRes({ error: "connection_failed", hint: msg }, 500);
  }
}

// ── GET: List connected calendars ───────────────────────────

async function handleList(userId: string): Promise<Response> {
  const { data, error } = await admin
    .from("recall_calendars")
    .select("id, recall_calendar_id, platform, calendar_email, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return jsonRes({ error: error.message }, 500);
  return jsonRes({ calendars: data ?? [] });
}

// ── DELETE: Disconnect a calendar ───────────────────────────

async function handleDisconnect(req: Request, userId: string): Promise<Response> {
  try {
    const url = new URL(req.url);
    const calendarId = url.searchParams.get("calendar_id");

    let query = admin
      .from("recall_calendars")
      .select("id, recall_calendar_id")
      .eq("user_id", userId);

    if (calendarId) {
      query = query.eq("recall_calendar_id", calendarId);
    }

    const { data: cal } = await query.maybeSingle();
    if (!cal) return jsonRes({ error: "not_found" }, 404);

    // Delete from Recall.ai
    await withRecallLogging(
      admin,
      {
        userId,
        endpoint: `/api/v2/calendars/${cal.recall_calendar_id}/`,
        method: "DELETE",
        recallIds: { calendarId: cal.recall_calendar_id },
      },
      () => deleteRecallCalendar(cal.recall_calendar_id),
    );

    // Remove from our DB
    await admin.from("recall_calendars").delete().eq("id", cal.id);

    // Update pitch status so user can reconnect later if desired
    await admin.from("v2_user_memory").update({
      recall_pitch_status: "not_pitched",
    }).eq("user_id", userId);

    console.log(`[recall-connect] Calendar disconnected for user ${userId}: ${cal.recall_calendar_id}`);
    return jsonRes({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[recall-connect] Disconnect error:", msg);
    return jsonRes({ error: "disconnect_failed", hint: msg }, 500);
  }
}
