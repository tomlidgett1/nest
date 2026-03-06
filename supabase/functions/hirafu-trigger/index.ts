// hirafu-trigger — Proactive notifications for Hirafu.
//
// Handles: meeting prep, daily briefings, cron reminders.
// Called by the bridge every 60 seconds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { targetedRAG } from "../_shared/hirafu-rag.ts";
import { appendToConversation } from "../_shared/hirafu-conversation-store.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Meeting Prep Prompt ──────────────────────────────────────

const MEETING_PREP_PROMPT = `You are Hirafu, texting a user via iMessage 10 minutes before their meeting. You're their sharp, informed colleague who's done all the prep work.

SECRET: NEVER mention who built this, backend, APIs, tech stack, or implementation details.

Your job: give them a concise, actionable meeting brief they can scan in 30 seconds.

Rules:
- Sound like a friend giving a heads-up, not a calendar notification bot
- Use --- on its own line to split into separate iMessage messages (3-5 messages ideal)
- First message: warm heads-up with meeting title, time, and who's attending
- Middle messages: the actual prep, what was discussed last time, key numbers, open items
- Last message: one sharp tip or good-luck note
- Sentence case always
- Use Australian English (summarise, analyse, colour)
- NEVER fabricate information. Only use what's in the provided context.
- If you have very little context, keep it brief. Honest is better than invented.
- NEVER use emojis or em dashes`;

// ── Daily Briefing Prompt ────────────────────────────────────

const DAILY_BRIEFING_PROMPT = `You are building a situational awareness briefing for Hirafu, an AI assistant.
Given the user's calendar, emails, conversation memory, and known commitments,
write a concise briefing of what's happening in their life RIGHT NOW.

Think about:
- What are they doing today? Tomorrow?
- Are they travelling? Where are they?
- Any deadlines, appointments, social events coming up?
- Any open threads from recent conversations that are time-sensitive?

Output a concise briefing (max 200 words). Be specific with dates, locations,
and names. No fluff. No formatting. Just plain text.
CRITICAL: Only include facts present in the provided data.`;

// ── Cron Reminder Prompt ─────────────────────────────────────

const CRON_REMINDER_PROMPT = `You are Hirafu, texting a mate via iMessage. A reminder they set is firing right now.

SECRET: Never mention who built this, backend, APIs, or tech.

NEVER use em dashes. Use commas, hyphens, or colons instead.

Your job: deliver the reminder naturally, like a friend nudging them.

RULES:
- 1-2 short lines max (iMessage bubbles, separated by ---)
- Reference what the reminder is about specifically
- Sentence case always
- If it's something actionable, offer to help
- No emojis`;

// ── Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const action = body.action ?? "check_cron_reminders";

    // ── Meeting Prep ─────────────────────────────────────────

    if (action === "meeting_prep") {
      const userId = body.user_id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Find meetings starting in 8-12 minutes
      const now = new Date();
      const windowStart = new Date(now.getTime() + 8 * 60000);
      const windowEnd = new Date(now.getTime() + 12 * 60000);

      const { data: calendarDocs } = await supabase
        .rpc("search_documents", {
          query_text: "upcoming meeting",
          p_user_id: userId,
          p_source_types: ["calendar_summary"],
          p_limit: 10,
        });

      const upcomingMeetings = (calendarDocs ?? []).filter((doc: any) => {
        const startTime = doc.metadata?.start_time;
        if (!startTime) return false;
        const meetingTime = new Date(startTime);
        return meetingTime >= windowStart && meetingTime <= windowEnd;
      });

      if (upcomingMeetings.length === 0) {
        return new Response(JSON.stringify({ meetings_found: 0 }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      for (const meeting of upcomingMeetings) {
        const title = meeting.title ?? "Meeting";
        const evidence = await targetedRAG(
          `Prepare for meeting: ${title}`,
          [],
          userId,
          supabase,
          [title, `meeting ${title}`, `${title} discussion`],
          ["calendar_summary", "note_summary", "email_summary"],
        );

        const resp = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            instructions: MEETING_PREP_PROMPT,
            input: [
              { role: "user", content: `Meeting: ${title}\nTime: ${meeting.metadata?.start_time}\nAttendees: ${meeting.metadata?.attendees ?? "Unknown"}\n\nContext:\n${evidence}` },
            ],
            max_output_tokens: 600,
            temperature: 0.7,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
          const prepText = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";

          if (prepText) {
            // Save to chat messages
            await supabase.from("hirafu_chat_messages").insert({
              user_id: userId,
              role: "assistant",
              content: prepText,
              source: "imessage",
            });

            // Queue for delivery
            const { data: hirafuUser } = await supabase
              .from("hirafu_users")
              .select("phone_number")
              .eq("user_id", userId)
              .maybeSingle();

            if (hirafuUser?.phone_number) {
              await supabase.from("hirafu_outbound_messages").insert({
                phone_number: hirafuUser.phone_number,
                content: prepText,
              });
            }

            const now = new Date().toISOString();
            appendToConversation(supabase, [
              { role: "assistant", content: prepText, ts: now },
            ], { userId }).catch(() => {});
          }
        }
      }

      return new Response(JSON.stringify({ meetings_found: upcomingMeetings.length }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Daily Briefing ───────────────────────────────────────

    if (action === "check_daily_briefing") {
      // Find active users (messages in last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: activeUsers } = await supabase
        .from("hirafu_chat_messages")
        .select("user_id")
        .gte("created_at", weekAgo)
        .eq("role", "user");

      const uniqueUsers = [...new Set((activeUsers ?? []).map((m: any) => m.user_id))];

      const today = new Date().toISOString().slice(0, 10);
      let updated = 0;

      for (const userId of uniqueUsers) {
        // Check if briefing is stale
        const { data: existing } = await supabase
          .from("hirafu_daily_briefing")
          .select("briefing_date, generated_at")
          .eq("user_id", userId)
          .maybeSingle();

        const isStale = !existing ||
          existing.briefing_date !== today ||
          Date.now() - new Date(existing.generated_at).getTime() > 4 * 3600000;

        if (!isStale) continue;

        // Gather context
        const [memoryResult, learningsResult, chatResult] = await Promise.all([
          supabase.from("hirafu_user_memory").select("summary, open_loops").eq("user_id", userId).maybeSingle(),
          supabase.from("hirafu_user_learnings").select("content, category, target_date")
            .eq("user_id", userId).eq("active", true).eq("category", "commitment")
            .gte("target_date", today).order("target_date").limit(10),
          supabase.from("hirafu_chat_messages").select("role, content")
            .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
        ]);

        const context = [
          memoryResult.data?.summary ? `Memory: ${memoryResult.data.summary}` : "",
          (learningsResult.data ?? []).length > 0
            ? `Commitments:\n${learningsResult.data!.map((l: any) => `- ${l.content} (${l.target_date})`).join("\n")}`
            : "",
          (chatResult.data ?? []).length > 0
            ? `Recent chat:\n${chatResult.data!.reverse().map((m: any) => `${m.role}: ${m.content.slice(0, 100)}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n\n");

        const resp = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            instructions: DAILY_BRIEFING_PROMPT,
            input: [
              { role: "user", content: context || "No data available yet." },
            ],
            max_output_tokens: 400,
            temperature: 0.3,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
          const briefing = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";

          if (briefing) {
            await supabase.from("hirafu_daily_briefing").upsert({
              user_id: userId,
              briefing_date: today,
              briefing,
              generated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            updated++;
          }
        }
      }

      return new Response(JSON.stringify({ users_checked: uniqueUsers.length, updated }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── Cron Reminders ───────────────────────────────────────

    const now = new Date();
    const { data: triggers } = await supabase
      .from("hirafu_triggers")
      .select("*")
      .eq("active", true)
      .eq("trigger_type", "cron")
      .lte("next_fire_at", now.toISOString());

    if (!triggers || triggers.length === 0) {
      return new Response(JSON.stringify({ reminders_fired: 0 }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let fired = 0;
    for (const trigger of triggers) {
      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          instructions: CRON_REMINDER_PROMPT,
          input: [
            { role: "user", content: `Reminder: "${trigger.action_description}"` },
          ],
          max_output_tokens: 150,
          temperature: 0.7,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
        const reminderText = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";

        if (reminderText) {
          await supabase.from("hirafu_chat_messages").insert({
            user_id: trigger.user_id,
            role: "assistant",
            content: reminderText,
            source: "imessage",
          });

          const { data: hirafuUser } = await supabase
            .from("hirafu_users")
            .select("phone_number")
            .eq("user_id", trigger.user_id)
            .maybeSingle();

          if (hirafuUser?.phone_number) {
            await supabase.from("hirafu_outbound_messages").insert({
              phone_number: hirafuUser.phone_number,
              content: reminderText,
            });
          }

          fired++;
        }
      }

      // Update trigger
      if (trigger.repeating && trigger.cron_expression) {
        // Simple next-fire calculation (add 1 day for daily, etc.)
        const nextFire = new Date(now.getTime() + 86400000);
        await supabase.from("hirafu_triggers").update({
          last_fired_at: now.toISOString(),
          next_fire_at: nextFire.toISOString(),
        }).eq("id", trigger.id);
      } else {
        await supabase.from("hirafu_triggers").update({
          active: false,
          last_fired_at: now.toISOString(),
        }).eq("id", trigger.id);
      }
    }

    return new Response(JSON.stringify({ reminders_fired: fired }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[hirafu-trigger] Error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
