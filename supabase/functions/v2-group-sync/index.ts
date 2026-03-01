// v2-group-sync — registers group chat participants and triggers PDL enrichment.
// Called by the iMessage bridge whenever a group message arrives.
// Fully idempotent: duplicate calls with the same phones/group are no-ops.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrichByPhone } from "../_shared/pdl-enrichment.ts";
import type { PDLProfile } from "../_shared/pdl-enrichment.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limits for PDL enrichment
const MAX_PDL_PER_INVOCATION = 5;
const MAX_PDL_PER_HOUR = 50;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let payload: { chat_guid: string; phones: string[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { chat_guid, phones } = payload;
  if (!chat_guid || !Array.isArray(phones) || phones.length === 0) {
    return json({ error: "missing_chat_guid_or_phones" }, 400);
  }

  console.log(`[group-sync] chat_guid=${chat_guid.slice(0, 30)}... phones=${phones.length}`);

  try {
    // ── 1. Upsert group chat ───────────────────────────────────
    const { data: groupChat, error: gcErr } = await supabase
      .from("group_chats")
      .upsert(
        {
          chat_guid,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chat_guid" },
      )
      .select("id")
      .single();

    if (gcErr || !groupChat) {
      console.error("[group-sync] Failed to upsert group_chats:", gcErr?.message);
      return json({ error: "group_upsert_failed" }, 500);
    }

    const groupChatId = groupChat.id as string;

    // ── 2. Process each phone number ───────────────────────────
    let newProspects = 0;
    let existingProspects = 0;
    const pendingEnrichment: Array<{ id: string; phone: string }> = [];

    for (const phone of phones) {
      if (!phone || phone.length < 7) continue;

      // Check if prospect already exists (dedup)
      const { data: existing } = await supabase
        .from("group_prospects")
        .select("id, pdl_enrichment_status, is_nest_user")
        .eq("phone_number", phone)
        .maybeSingle();

      let prospectId: string;

      if (existing) {
        prospectId = existing.id;
        existingProspects++;

        // Update last_seen
        supabase
          .from("group_prospects")
          .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", prospectId)
          .then(() => {})
          .catch(() => {});

        // Queue for enrichment if still pending
        if (existing.pdl_enrichment_status === "pending") {
          pendingEnrichment.push({ id: prospectId, phone });
        }
      } else {
        // New prospect — check if they're already a Nest user
        const { data: imsgUser } = await supabase
          .from("imessage_users")
          .select("id, status")
          .eq("phone_number", phone)
          .maybeSingle();

        const isNestUser = imsgUser?.status === "active";

        const { data: inserted, error: insErr } = await supabase
          .from("group_prospects")
          .insert({
            phone_number: phone,
            is_nest_user: isNestUser,
            imessage_user_id: imsgUser?.id ?? null,
          })
          .select("id")
          .single();

        if (insErr) {
          // Likely a race condition duplicate — try to fetch
          const { data: raceExisting } = await supabase
            .from("group_prospects")
            .select("id, pdl_enrichment_status")
            .eq("phone_number", phone)
            .maybeSingle();

          if (raceExisting) {
            prospectId = raceExisting.id;
            if (raceExisting.pdl_enrichment_status === "pending") {
              pendingEnrichment.push({ id: prospectId, phone });
            }
          } else {
            console.warn(`[group-sync] Failed to insert prospect ${phone}: ${insErr.message}`);
            continue;
          }
        } else {
          prospectId = inserted!.id;
          newProspects++;

          // Queue for PDL enrichment (skip Nest users — they already have profiles)
          if (!isNestUser) {
            pendingEnrichment.push({ id: prospectId, phone });
          }
        }
      }

      // ── 3. Upsert group_chat_members junction ──────────────
      await supabase
        .from("group_chat_members")
        .upsert(
          {
            group_chat_id: groupChatId,
            prospect_id: prospectId,
          },
          { onConflict: "group_chat_id,prospect_id" },
        )
        .then(() => {})
        .catch((e: unknown) =>
          console.warn(`[group-sync] Member upsert failed for ${phone}: ${e}`),
        );
    }

    // ── 4. Update participant count ──────────────────────────
    const { count } = await supabase
      .from("group_chat_members")
      .select("id", { count: "exact", head: true })
      .eq("group_chat_id", groupChatId);

    supabase
      .from("group_chats")
      .update({ participant_count: count ?? phones.length, updated_at: new Date().toISOString() })
      .eq("id", groupChatId)
      .then(() => {})
      .catch(() => {});

    // ── 5. PDL enrichment (rate-limited) ─────────────────────
    let enriched = 0;
    let skippedRateLimit = 0;

    if (pendingEnrichment.length > 0) {
      // Check hourly rate limit
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentCount } = await supabase
        .from("group_prospects")
        .select("id", { count: "exact", head: true })
        .not("pdl_enriched_at", "is", null)
        .gte("pdl_enriched_at", oneHourAgo);

      const hourlyRemaining = MAX_PDL_PER_HOUR - (recentCount ?? 0);
      const batchLimit = Math.min(MAX_PDL_PER_INVOCATION, hourlyRemaining);

      if (batchLimit <= 0) {
        skippedRateLimit = pendingEnrichment.length;
        console.log(`[group-sync] PDL rate limit hit (${recentCount}/${MAX_PDL_PER_HOUR} in last hour), skipping ${skippedRateLimit} enrichments`);
      } else {
        const toEnrich = pendingEnrichment.slice(0, batchLimit);
        skippedRateLimit = pendingEnrichment.length - toEnrich.length;

        for (const { id, phone } of toEnrich) {
          try {
            // Mark as enriching to prevent double-processing
            await supabase
              .from("group_prospects")
              .update({ pdl_enrichment_status: "enriching", updated_at: new Date().toISOString() })
              .eq("id", id);

            const profile = await enrichByPhone(phone);

            if (profile && profile.job_title) {
              await supabase
                .from("group_prospects")
                .update({
                  pdl_profile: profile as unknown as Record<string, unknown>,
                  pdl_enrichment_status: "success",
                  pdl_enriched_at: new Date().toISOString(),
                  display_name: profile.full_name ?? null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);
              enriched++;
              console.log(`[group-sync] PDL: ${profile.full_name} | ${profile.job_title} @ ${profile.job_company_name}`);
            } else if (profile) {
              // Profile found but no job title — still store it
              await supabase
                .from("group_prospects")
                .update({
                  pdl_profile: profile as unknown as Record<string, unknown>,
                  pdl_enrichment_status: "success",
                  pdl_enriched_at: new Date().toISOString(),
                  display_name: profile.full_name ?? null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);
              enriched++;
            } else {
              await supabase
                .from("group_prospects")
                .update({
                  pdl_enrichment_status: "not_found",
                  pdl_enriched_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);
            }
          } catch (e) {
            console.error(`[group-sync] PDL enrichment failed for ${phone}:`, e);
            await supabase
              .from("group_prospects")
              .update({
                pdl_enrichment_status: "error",
                pdl_enriched_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", id)
              .catch(() => {});
          }
        }
      }
    }

    console.log(
      `[group-sync] Done: ${newProspects} new, ${existingProspects} existing, ` +
      `${enriched} enriched, ${skippedRateLimit} rate-limited`,
    );

    return json({
      group_chat_id: groupChatId,
      new_prospects: newProspects,
      existing_prospects: existingProspects,
      enriched,
      rate_limited: skippedRateLimit,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    console.error("[group-sync] Error:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
