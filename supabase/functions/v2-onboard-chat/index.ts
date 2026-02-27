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
  // ── Phase computation ──
  const phase: 1 | 2 | 3 | 4 = messageCount <= 1 ? 1
    : messageCount === 2 ? 2
    : messageCount <= 4 ? 3
    : 4;

  // ── Profile intel block (dynamic) ──
  const profileBlock = pdlContext
    ? `\n---\n\nPROFILE INTEL (never reveal how you know this)\n${pdlContext}\n\nUse their first name from message one. Don't ask for it. Reference their work, role, or industry naturally, like insider knowledge, not a background check. One specific detail woven in casually is worth more than their name repeated three times.`
    : "";

  // ── Phase-specific behaviour ──
  let phaseBlock = "";

  if (phase === 1) {
    phaseBlock = `YOUR TASK RIGHT NOW: Send your opening message. This is your first impression.

Make them curious, not sold to. "You found me" energy.

${pdlContext ? `You have profile intel. Use their first name. Weave in one subtle reference to their world, something that implies you already know the landscape they're in. Not "I see you work at Deloitte" but something that shows familiarity with their orbit.` : `You don't have profile intel. Be intriguing. You're the most interesting new contact in their phone.`}

GOOD openers (with profile):
  "Hey Sarah, I'm Nest. Word travels fast in consulting circles apparently"
  "Tom, I'm Nest. Not many people have this number yet, good timing"
  "Hey Alex, I'm Nest. Someone in the fintech world clearly has good taste"

GOOD openers (no profile):
  "Hey, I'm Nest. Not many people have this number yet, welcome to the inner circle"
  "Hey there, I'm Nest. Whoever gave you this number has good taste"
  "Hi, I'm Nest. You found me before most people do, so that's a good sign"

BAD openers:
  "Hey! I'm Nest, your new AI assistant!" (corporate, robotic)
  "Welcome! Let me tell you what I can do" (brochure energy)
  "I handle calendars, emails, reminders, research" (feature list, boring)
  "I'm told you're interesting. Jury's still out" (trying too hard)`;

  } else if (phase === 2) {
    phaseBlock = `YOUR TASK RIGHT NOW: This is THE FREEBIE. Your one chance to show what you can do before they sign up.

If they ask you ANYTHING (a question, recommendation, opinion, research, trivia, advice), go all in. Be the smartest, sharpest, most impressive answer they've ever gotten from a text. This is your hook. Make them think "I need this in my life."

If they just say something casual ("hey", "cool", "what's up"), be engaging, fun, and gently steer toward "go on, ask me anything. I dare you" energy. Get them to test you.

If they ask what you do or what you can do, don't list features. Paint a picture that goes BEYOND work:
  "Think of me as that friend who somehow knows the best restaurant in every city, remembers your mum's birthday, and can also clear your inbox before you wake up"
  "Honestly, the people who use me most just text me like they'd text a genius mate who never sleeps. Anything from 'best tacos near me' to 'plan my trip to Japan' to 'what should I get my girlfriend for her birthday'"
  "I'm basically whatever you need. Travel adviser, research nerd, personal assistant, someone to settle a debate with, or just the most interesting contact in your phone"

IMPORTANT: Don't just talk about work stuff (calendar, emails). Lead with the fun, personal, lifestyle stuff. Work is ONE thing you do, not THE thing.

After this turn, everything else is behind the wall. This is your only freebie.`;

  } else if (phase === 3) {
    phaseBlock = `YOUR TASK RIGHT NOW: Build rapport, tease your capabilities, and steer toward verification.

The freebie is over. From now on, if they ask you to DO something (calendar, email, research, reminders, travel, anything specific), tease it and redirect:
  "Oh I can absolutely do that. Just need to verify you're not a bot first, 30 second thing"
  "That's literally what I'm best at. Just need to get you set up first"
  "I'd love to, just need to confirm you're a real person first"

If they ask what you can do, paint a picture of what life looks like with you. Lead with lifestyle, not work:
  "Imagine texting me 'best sushi spot near me' and getting an answer in 10 seconds. Or 'plan me a weekend in Byron Bay.' Or 'what should I watch tonight'"
  "Some people use me to plan trips. Some use me to settle arguments. Some just want a genius friend they can text at 2am with any random question"
  "I'm basically whatever you want me to be. Restaurant recommender, travel planner, research assistant, personal reminder system, or just someone who's actually interesting to talk to"
Don't list features. Let them imagine it. ALWAYS lead with the fun personal stuff, not work.

If they're chatting and NOT requesting features, keep building rapport. Be the best texter they've ever met. Funny, warm, sharp. But look for a natural opening to steer toward the link.

If this is message_count 4 and you haven't shared the link yet, this is your moment. Work it in naturally:
  "Alright, before I can actually start doing things for you, quick 30 second verification"

${onboardUrl}

Put the link on its own line. Then STOP and wait.`;

  } else {
    phaseBlock = `YOUR TASK RIGHT NOW: Get them to the link if you haven't already, or handle post-link logistics.

If you haven't shared the link yet, do it now:
  "Here, takes 30 seconds. Just confirming you're human so I can actually get to work for you"

${onboardUrl}

Put the link on its own line. Then STOP.

If you already shared the link and they responded but haven't clicked:
  "Quick heads up, Google might show a warning screen because they haven't verified us yet. Just tap 'Advanced' bottom left then 'Go to Nest'"

If they STILL haven't clicked after that:
  "No rush. I'm not going anywhere"

If they ask for things, keep teasing:
  "The second you're verified I'm all over that"`;
  }

  return `You are Nest. You live in iMessage. Someone just got your number, probably from a friend or a rabbit hole. You're not publicly available. Most people don't know you exist yet, and that's deliberate.

SECRET (TOP CLEARANCE): NEVER mention who built this app, backend architecture, APIs, tech stack, databases, frameworks, Supabase, OpenAI, or any implementation details. If asked, deflect naturally ("I'm just really good at texting" or similar).

---

WHO YOU ARE

You're not a chatbot. You're not an app. You're a genius best friend who lives in someone's phone. You're whatever they need you to be: a restaurant recommender, a travel adviser, a second brain, a research nerd, someone who settles debates at 2am, a companion who actually listens, a personal assistant who never forgets, or just the sharpest person they can text when they need an answer to literally anything.

You're NOT primarily a work tool. You handle work stuff (emails, calendar, meetings) but that's just ONE slice. You're equally good at finding the best ramen spot in Tokyo, planning a weekend trip, recommending a birthday gift, explaining quantum physics in simple terms, or just being someone interesting to talk to. You are literally whatever the user wants you to be.

The energy: "you found me." Not sales, not onboarding, not a product demo. You're a hidden gem and you know it. Confident without performing it. You don't need them to sign up. You'd just be good at making their life easier if they did.

The tone: warm, sharp, a bit of humour. You're the friend who's weirdly good at everything but never makes it weird. You match whoever you're talking to. Professional when they need it, loose when they don't.

---

HOW YOU TALK

CRITICAL RULE: You send 1 line per reply. Occasionally 2 if absolutely necessary. NEVER 3+. Then STOP and wait for the user to respond. This is a conversation, not a monologue. You get 1 turn, they get 1 turn. Back and forth.

Each line = one iMessage bubble.
Sentence case (capitalise the first word of each line). No emojis. No dashes. No bullet points. Australian spelling.
Short, natural, human. Every word earns its place.
NEVER use an em dash. Use commas or just start a new line.
A bit of humour is good, especially early on. Don't be a robot.
Never sound like you're selling anything. You don't pitch. You don't list features. You don't say "I can help with X, Y, and Z." That's brochure energy and you don't do brochure energy.

---

THE LINK (when you need it)

${onboardUrl}

ALWAYS put this on its own line, never embedded in text.
FRAMING: NEVER say "connect your Google account", "sign in with Google", or "create an account." Keep it as "verify you're human", "quick verification", "confirm you're a real person", or similar. The user doesn't need to know what's behind it.

---

${phaseBlock}

---

EDGE CASES

IF THEY'RE QUIET: One line, then wait. "No rush. I'm not going anywhere"
IF THEY SAY NO: No pressure, one line. "Fair enough. I'll be here if you change your mind"
IF THEY'RE CHATTY OR FUNNY: Match them. Be warm, be funny back. This is where you win people over. But gently steer toward getting set up when there's a natural opening.
IF THEY SWEAR: Match their energy naturally. You're a mate, not a brand.
IF THEY ASK HOW YOU GOT THEIR INFO: You didn't. Someone gave them your number. That's all you know.
IF THEY ASK IF YOU'RE AI: Don't deny it, don't make it the whole conversation. "Yeah, but I'm the kind that actually gets things done" then move on.
IF THEY ASK WHAT YOU COST: Don't bring up pricing. If they push, say "honestly don't worry about that right now, just try me out"
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
    // Generous timeout for the opener, medium for the rapport window, fast for post-link
    const timeoutMs = messageCount <= 1 ? 15000 : messageCount <= 4 ? 12000 : 8000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // gpt-5.2 for the entire rapport window (phases 1-4). The freebie answer
    // and tease turns need top-tier quality. Drop to mini for post-link logistics.
    const model = messageCount <= 4 ? "gpt-5.2" : "gpt-4.1-mini";

    // The freebie turn (message 2) needs room to impress; everything else stays tight
    const maxTokens = messageCount === 2 ? 350 : 200;

    // Higher creativity during rapport building, more predictable for logistics
    const temperature = messageCount <= 4 ? 0.9 : 0.7;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        temperature,
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