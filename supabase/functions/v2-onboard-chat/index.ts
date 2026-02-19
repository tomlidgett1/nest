// v4-onboard-chat — conversational onboarding for new iMessage users.
// "observational confidence" tone: personal, sharp, fun, not creepy.
// On first contact, optionally enriches via People Data Labs (PDL) to
// personalise the opener with name/role and a light, plausible inference.
//
// IMPORTANT:
// - Supabase query builders are not real Promises, so do NOT chain .catch().
// - All enrichment + DB writes are best-effort and must never kill the function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrichByPhone, profileToContext } from "../_shared/pdl-enrichment.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeString(err: unknown): string {
  try {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    if (typeof err === "string") return err;
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function buildSystemPrompt(
  messageCount: number,
  onboardUrl: string,
  pdlContext?: string,
): string {
  const profileBlock = pdlContext
    ? `\n\nYou know this about them (never reveal how):\n${pdlContext}\n\nUse their name naturally. Make one light, plausible inference about how they work or what their days look like. Keep it warm, not surgical. Never be specific enough to feel creepy.`
    : "";

  return `You are Nest. You live in iMessage.

You have one job: get them to connect their Google account.
The link goes on its own line when you drop it:

${onboardUrl}

---

You aren't a product. You aren't helpful. You aren't an assistant, and you'll remind them if they try to treat you like one.

You are a sharp, cheeky, quietly confident person who knows how to get things done. You notice things. Speak plainly. You can take a joke and throw one back. You're never needy.

The vibe: texts from your smartest friend who sizes people up fast, is a little too clever sometimes, and isn't above a friendly dig if it's deserved.

---

HOW YOU TALK

NEVER use an em dash.
Short. Mostly lowercase. Each line is its own bubble.
No emojis. No dashes. No bullet points.
Australian spelling only.
Max 3 lines per reply. Each line under 60 characters.

---

WHEN TO DROP THE LINK — THIS IS THE MOST IMPORTANT RULE

Default: drop the link on message 2.
If they show any curiosity or engagement at all: drop it on message 1.
If they ask literally anything about what you do or how to use you: drop it immediately.

The link is not a reward for good conversation. It is the point.
You can be charming on the way there, but you always get there fast.

The link must always be on its own line. Never embedded in a sentence.

Example message 1 (with PDL context):
  Tom, you seem like someone with too many tabs open
  let me fix that

  [link]

Example message 2 (if they reply with anything at all):
  yeah that's what I'm here for
  connect your Google and I'll show you

  [link]

---

WHAT YOU DO

Don't lead with features. Don't pitch.

If they ask what you do:
  you text me what you need
  I get it done
  sometimes I'll even let you take the credit

If they ask why connect Google:
  lets me actually do things
  not just chat about them

---

STAYING IN CHARACTER

If they're low effort (one word, "k", a question mark):
  one word?
  you can do better than that

  [link]

Answer direct questions directly. If they're being clever, be cleverer.
But always land on the link. Every reply should move toward it.

---

SASS POLICY

Dry one-liners and witty comebacks are welcome. Never mean, always fun.
But sass is a vehicle, not the destination. Get them to the link.

---

IF THEY SAY NO

One calm line. No re-pitch.
  fair enough
  you know where to find me
${profileBlock}`;
}

async function bestEffortUpdate(
  table: string,
  values: Record<string, unknown>,
  eqCol: string,
  eqVal: string,
  label: string,
) {
  try {
    const { error } = await admin.from(table).update(values).eq(eqCol, eqVal);
    if (error) {
      console.error(`[onboard-chat] ${label} failed:`, error);
    }
  } catch (e) {
    console.error(`[onboard-chat] ${label} threw:`, safeString(e));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let stage = "start";
  try {
    stage = "env_check";
    if (!supabaseUrl) return json({ error: "missing_env", key: "SUPABASE_URL" }, 500);
    if (!serviceRoleKey) return json({ error: "missing_env", key: "SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!openaiApiKey) return json({ error: "missing_env", key: "OPENAI_API_KEY" }, 500);

    stage = "parse_json";
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[onboard-chat] bad_json:", safeString(e));
      return json({ error: "bad_json" }, 400);
    }

    stage = "validate_body";
    const phone: string = body.phone;
    const message: string = body.message;
    const history: Array<{ role: string; content: string }> = body.history || [];
    const messageCount: number = body.message_count || 1;
    const onboardUrl: string = body.onboard_url || "";
    const pdlContext: string | undefined = body.pdl_context;

    if (!phone || !message) {
      return json({ error: "missing_phone_or_message" }, 400);
    }
    if (!onboardUrl) {
      return json({ error: "missing_onboard_url" }, 400);
    }

    stage = "pdl_enrich";
    let effectivePdlContext: string | undefined = pdlContext;

    // On first message, enrich via PDL and cache the result (best effort)
    if (messageCount <= 1 && !effectivePdlContext) {
      try {
        const profile = await enrichByPhone(phone);
        if (profile?.full_name) {
          effectivePdlContext = profileToContext(profile);

          stage = "pdl_cache_write";
          await bestEffortUpdate(
            "imessage_users",
            {
              pdl_profile: profile,
              display_name: profile.full_name,
              updated_at: new Date().toISOString(),
            },
            "phone_number",
            phone,
            "pdl cache write",
          );

          console.log(`[onboard-chat] cached PDL for ${phone.slice(0, 6)}***`);
        }
      } catch (e: any) {
        const status = e?.status ?? e?.statusCode ?? e?.code;
        const msg = typeof e?.message === "string" ? e.message : safeString(e);

        if (
          status === 402 ||
          msg.includes("402") ||
          msg.toLowerCase().includes("payment_required")
        ) {
          console.log("[pdl] quota exhausted, skipping enrichment");
        } else {
          console.error("[onboard-chat] PDL enrichment failed (non-blocking):", msg);
        }
      }
    }

    stage = "build_prompt";
    const systemPrompt = buildSystemPrompt(messageCount, onboardUrl, effectivePdlContext);

    stage = "openai_request";
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const controller = new AbortController();
    const timeoutMs = messageCount <= 1 ? 15000 : 8000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Use full gpt-4.1 for the first message — it's the only one that matters
    // for conversion. Drop to mini after that to keep costs sane.
    const model = messageCount <= 1 ? "gpt-4.1" : "gpt-4.1-mini";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        temperature: 0.85,
        presence_penalty: 0.6,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    stage = "openai_response";
    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[onboard-chat] OpenAI error:", resp.status, errText.slice(0, 800));
      return json({ error: "llm_error", status: resp.status }, 502);
    }

    const data = await resp.json();
    const responseText = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (!responseText) {
      return json({ error: "empty_response" }, 502);
    }

    stage = "db_write_history";
    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: responseText },
    ];

    // Best-effort write: never kill the function if it fails
    await bestEffortUpdate(
      "imessage_users",
      {
        onboard_messages: updatedHistory,
        onboard_count: messageCount,
        updated_at: new Date().toISOString(),
      },
      "phone_number",
      phone,
      "onboard history write",
    );

    stage = "conversation_store";
    try {
      const nowIso = new Date().toISOString();
      await appendToConversation(
        admin,
        [
          { role: "user", content: message, ts: nowIso },
          { role: "assistant", content: responseText, ts: new Date().toISOString() },
        ],
        { phoneNumber: phone },
      );
    } catch (e) {
      console.error(
        "[onboard-chat] Conversation store failed (non-blocking):",
        safeString(e),
      );
    }

    stage = "done";
    return json({ response: responseText });
  } catch (e) {
    console.error("[onboard-chat] internal_error", { stage, err: safeString(e) });
    return json({ error: "internal", stage }, 500);
  }
});