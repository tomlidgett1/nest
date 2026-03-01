// Strava webhook — receives real-time activity events.
//
// GET  → subscription validation (echoes hub.challenge)
// POST → activity create/update/delete events
//
// Returns 200 instantly; all processing runs in EdgeRuntime.waitUntil().

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStravaAccessToken,
  fetchStravaActivityDetail,
  activityToRow,
  buildStravaActivitySummary,
  stravaContextHeader,
  reverseGeocode,
} from "../_shared/strava-helpers.ts";
import { contentHash, sentenceAwareChunks } from "../_shared/chunker.ts";
import { embedChunks, ChunkToEmbed, truncateForEmbedding } from "../_shared/embedder.ts";
import { insertEmbeddedChunks, softDeleteSource } from "../_shared/ingestion-helpers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRAVA_VERIFY_TOKEN = Deno.env.get("STRAVA_VERIFY_TOKEN") ?? "nest-strava-verify";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── GET: Subscription validation handshake ─────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");

    if (mode === "subscribe" && verifyToken === STRAVA_VERIFY_TOKEN && challenge) {
      console.log("[strava-webhook] Subscription validation OK");
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Activity events ──────────────────────────────────
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let event: {
    object_type: string;
    aspect_type: string;
    object_id: number;
    owner_id: number;
    subscription_id: number;
    event_time: number;
    updates?: Record<string, string>;
  };

  try {
    event = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  console.log(
    `[strava-webhook] Event: ${event.object_type}/${event.aspect_type} ` +
    `object=${event.object_id} owner=${event.owner_id}`,
  );

  // Return 200 immediately — process in background
  EdgeRuntime.waitUntil(processEvent(event));
  return new Response("OK", { status: 200 });
});

async function processEvent(event: {
  object_type: string;
  aspect_type: string;
  object_id: number;
  owner_id: number;
  updates?: Record<string, string>;
}): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up user by Strava athlete ID
  const { data: account } = await supabase
    .from("user_strava_accounts")
    .select("user_id")
    .eq("strava_athlete_id", event.owner_id)
    .limit(1)
    .maybeSingle();

  if (!account) {
    console.warn(`[strava-webhook] No account found for athlete ${event.owner_id}`);
    return;
  }

  const userId = account.user_id;

  // ── Athlete deauthorisation ────────────────────────────────
  if (event.object_type === "athlete" && event.updates?.authorized === "false") {
    console.log(`[strava-webhook] Athlete ${event.owner_id} revoked access`);
    await supabase
      .from("user_strava_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("strava_athlete_id", event.owner_id);
    return;
  }

  // Only process activity events from here
  if (event.object_type !== "activity") return;

  // ── Activity deleted ───────────────────────────────────────
  if (event.aspect_type === "delete") {
    const stravaId = event.object_id;
    console.log(`[strava-webhook] Deleting activity ${stravaId}`);

    await supabase
      .from("strava_activities")
      .delete()
      .eq("user_id", userId)
      .eq("strava_id", stravaId);

    await softDeleteSource(supabase, userId, "strava_summary", String(stravaId));
    await softDeleteSource(supabase, userId, "strava_chunk", String(stravaId));
    return;
  }

  // ── Activity created or updated ────────────────────────────
  if (event.aspect_type === "create" || event.aspect_type === "update") {
    try {
      const { accessToken } = await getStravaAccessToken(supabase, userId);
      const activity = await fetchStravaActivityDetail(accessToken, event.object_id);

      // Reverse geocode start/end locations
      let startLocationName: string | null = null;
      let endLocationName: string | null = null;
      if (activity.start_latlng?.[0] && activity.start_latlng?.[1]) {
        startLocationName = await reverseGeocode(activity.start_latlng[0], activity.start_latlng[1]);
      }
      if (activity.end_latlng?.[0] && activity.end_latlng?.[1]) {
        endLocationName = await reverseGeocode(activity.end_latlng[0], activity.end_latlng[1]);
      }

      // Upsert structured row
      const row = activityToRow(userId, activity, startLocationName, endLocationName);
      await supabase
        .from("strava_activities")
        .upsert(row, { onConflict: "user_id,strava_id" });

      // Re-index for RAG
      const stravaIdStr = String(activity.id);
      await softDeleteSource(supabase, userId, "strava_summary", stravaIdStr);
      await softDeleteSource(supabase, userId, "strava_chunk", stravaIdStr);

      const summary = buildStravaActivitySummary(activity, startLocationName, endLocationName);
      const sportType = activity.sport_type ?? activity.type ?? "Activity";
      const dateStr = new Date(activity.start_date_local ?? activity.start_date)
        .toLocaleDateString("en-AU", {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
          timeZone: "UTC",
        });
      const contextHdr = stravaContextHeader(activity.name, sportType, dateStr);

      const chunks: ChunkToEmbed[] = [];

      chunks.push({
        text: truncateForEmbedding(`${contextHdr}\n---\n${summary}`),
        sourceType: "strava_summary",
        sourceId: stravaIdStr,
        title: `${sportType}: ${activity.name}`,
        chunkIndex: 0,
        contentHash: contentHash("strava_summary", stravaIdStr, "summary"),
        metadata: {
          sport_type: sportType,
          distance_km: Number(((activity.distance ?? 0) / 1000).toFixed(2)),
          moving_time_mins: Math.round((activity.moving_time ?? 0) / 60),
          start_date: activity.start_date_local ?? activity.start_date,
          athlete_count: activity.athlete_count ?? 1,
          start_location: startLocationName,
          end_location: endLocationName,
        },
      });

      if (activity.description && activity.description.length > 50) {
        const descChunks = sentenceAwareChunks(activity.description, contextHdr);
        for (let i = 0; i < descChunks.length; i++) {
          chunks.push({
            text: truncateForEmbedding(descChunks[i]),
            sourceType: "strava_chunk",
            sourceId: stravaIdStr,
            title: `${sportType}: ${activity.name}`,
            chunkIndex: i,
            contentHash: contentHash("strava_chunk", stravaIdStr, "chunk", i),
            parentSourceId: stravaIdStr,
            metadata: { sport_type: sportType, start_location: startLocationName },
          });
        }
      }

      const embedded = await embedChunks(chunks);
      const { inserted } = await insertEmbeddedChunks(supabase, userId, embedded);

      console.log(
        `[strava-webhook] Indexed activity ${activity.id} "${activity.name}" ` +
        `at ${startLocationName ?? "unknown"} (${inserted} embeddings)`,
      );
    } catch (e) {
      console.error(`[strava-webhook] Failed to process activity ${event.object_id}:`, (e as Error).message);
    }
  }
}
