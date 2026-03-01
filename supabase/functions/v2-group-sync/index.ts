// v2-group-sync — registers group chat participants and triggers PDL enrichment.
// Called by the iMessage bridge whenever a group message arrives.
// Fully idempotent: duplicate calls with the same phones/group are no-ops.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// PDL enrichment removed from sync — happens on-demand in v2-chat-service
// when someone actually engages Nest, not when they're just in the group.

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

// No PDL enrichment here — only participant registration.

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

    for (const phone of phones) {
      if (!phone || phone.length < 7) continue;

      // Check if prospect already exists (dedup)
      const { data: existing } = await supabase
        .from("group_prospects")
        .select("id")
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
          const { data: raceExisting } = await supabase
            .from("group_prospects")
            .select("id")
            .eq("phone_number", phone)
            .maybeSingle();

          if (raceExisting) {
            prospectId = raceExisting.id;
          } else {
            console.warn(`[group-sync] Failed to insert prospect ${phone}: ${insErr.message}`);
            continue;
          }
        } else {
          prospectId = inserted!.id;
          newProspects++;
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

    console.log(`[group-sync] Done: ${newProspects} new, ${existingProspects} existing`);

    return json({
      group_chat_id: groupChatId,
      new_prospects: newProspects,
      existing_prospects: existingProspects,
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
