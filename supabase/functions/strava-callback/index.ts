// Strava OAuth callback — exchanges auth code for tokens, stores account,
// and triggers historical activity ingestion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exchangeStravaCode } from "../_shared/strava-helpers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const dashboardUrl = Deno.env.get("ONBOARD_WEB_URL") ?? "https://nest.chat";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(req.url);

  // Strava redirects here with ?code=...&scope=...&state=<user_id>
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    const reason = error ?? "missing_code";
    return Response.redirect(`${dashboardUrl}/dashboard?strava=error&reason=${reason}`, 302);
  }

  const userId = state;

  try {
    const { tokens, athlete } = await exchangeStravaCode(code);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify user exists
    const { data: user } = await supabase.auth.admin.getUserById(userId);
    if (!user?.user) {
      return Response.redirect(`${dashboardUrl}/dashboard?strava=error&reason=invalid_user`, 302);
    }

    // Upsert Strava account
    const athleteName = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ");
    const { error: upsertErr } = await supabase
      .from("user_strava_accounts")
      .upsert(
        {
          user_id: userId,
          strava_athlete_id: athlete.id,
          athlete_name: athleteName,
          refresh_token: tokens.refreshToken,
          access_token: tokens.accessToken,
          token_expires_at: new Date(tokens.expiresAt * 1000).toISOString(),
          scopes: url.searchParams.get("scope") ?? "activity:read_all",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,strava_athlete_id" },
      );

    if (upsertErr) {
      console.error("[strava-callback] Upsert failed:", upsertErr.message);
      return Response.redirect(`${dashboardUrl}/dashboard?strava=error&reason=db_error`, 302);
    }

    console.log(`[strava-callback] Linked Strava athlete ${athlete.id} (${athleteName}) for user ${userId}`);

    // Trigger historical ingestion in the background
    fetch(`${supabaseUrl}/functions/v1/ingest-pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        mode: "full",
        sources: ["strava"],
      }),
    }).catch((e) => console.warn("[strava-callback] Ingest trigger failed:", e.message));

    return Response.redirect(`${dashboardUrl}/dashboard?strava=connected`, 302);
  } catch (e) {
    console.error("[strava-callback] Error:", (e as Error).message);
    return Response.redirect(`${dashboardUrl}/dashboard?strava=error&reason=exchange_failed`, 302);
  }
});
