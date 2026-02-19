// Incremental ingestion cron + stale job recovery.
//
// 1. Triggers incremental ingestion for all active users
// 2. Detects stalled jobs (running > 5 min) and resumes them — this is the
//    safety net that guarantees 100% completion even if chain calls fail.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || !isServiceRoleToken(token)) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ── Phase 1: Resume stalled jobs ────────────────────────────
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString();

    const { data: stalledJobs } = await supabase
      .from("ingestion_jobs")
      .select("id")
      .eq("status", "running")
      .lt("started_at", staleThreshold);

    let resumed = 0;
    for (const job of stalledJobs ?? []) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/ingest-pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ job_id: job.id }),
        });
        if (resp.ok) resumed++;
        console.log(`[ingest-cron] Resumed stalled job ${job.id} (status=${resp.status})`);
      } catch (e) {
        console.warn(`[ingest-cron] Failed to resume job ${job.id}:`, (e as Error).message);
      }
    }

    if (resumed > 0) {
      console.log(`[ingest-cron] Resumed ${resumed}/${stalledJobs?.length ?? 0} stalled job(s)`);
    }

    // ── Phase 2: Trigger incremental ingestion for all active users
    const { data: users, error } = await supabase
      .from("imessage_users")
      .select("user_id")
      .eq("status", "active")
      .not("user_id", "is", null);

    if (error) throw new Error(`Failed to list active users: ${error.message}`);

    const { data: tokenUsers } = await supabase
      .from("google_oauth_tokens")
      .select("user_id");

    const allUserIds = new Set<string>();
    for (const u of users ?? []) { if (u.user_id) allUserIds.add(u.user_id); }
    for (const u of tokenUsers ?? []) { if (u.user_id) allUserIds.add(u.user_id); }

    console.log(`[ingest-cron] Starting incremental ingestion for ${allUserIds.size} users`);

    const results: Array<{ user_id: string; status: string; job_id?: string; error?: string }> = [];
    const concurrency = 3;
    const userArray = [...allUserIds];

    for (let i = 0; i < userArray.length; i += concurrency) {
      const batch = userArray.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (uid) => {
          try {
            const resp = await fetch(`${supabaseUrl}/functions/v1/ingest-pipeline`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                user_id: uid,
                mode: "incremental",
                sources: ["notes", "emails", "calendar"],
              }),
            });

            const data = await resp.json();
            return {
              user_id: uid,
              status: resp.ok ? "triggered" : "failed",
              job_id: data.job_id,
              error: data.error,
            };
          } catch (e) {
            return {
              user_id: uid,
              status: "failed",
              error: (e as Error).message,
            };
          }
        }),
      );

      results.push(...batchResults);
    }

    const succeeded = results.filter((r) => r.status === "triggered").length;
    const failed = results.filter((r) => r.status === "failed").length;

    console.log(`[ingest-cron] Completed: ${succeeded} succeeded, ${failed} failed, ${resumed} resumed`);

    return jsonResp({
      total_users: allUserIds.size,
      succeeded,
      failed,
      stalled_resumed: resumed,
      results,
    }, 200);
  } catch (e) {
    console.error("[ingest-cron] Error:", (e as Error).message);
    return jsonResp({ error: (e as Error).message }, 500);
  }
});

function isServiceRoleToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function jsonResp(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
