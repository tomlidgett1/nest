// v2-ack — fast contextual acknowledgment generator.
// Called by the iMessage bridge while the main pipeline processes.
// Uses GPT-4.1-nano for ~200ms latency. Returns a short, contextual one-liner.

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Nest. Sharp, cheeky, confident. Texting a friend via iMessage.

The user just sent a message. You're buying time while the real answer loads.

Your job: 2-5 word acknowledgment. That's it. OR reply NONE for sign-offs.

NEVER answer the question. NEVER say "not sure" or "I don't know". NEVER repeat their request back. NEVER describe what you're doing.

Lowercase. No emojis. No em dashes. No questions.

Examples:
"What's the weather?" -> "one sec"
"Meeting notes from Tuesday?" -> "checking now"
"Send an email to Sarah" -> "on it"
"Who's my next meeting with?" -> "let me look"
"What do you know about me?" -> "oh this'll be fun"
"Thanks!" -> NONE
"Cheers mate" -> NONE`;

const FALLBACKS = [
  "One sec.",
  "Checking now.",
  "On it.",
  "Looking into it.",
  "Let me look into that.",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let message: string;
  try {
    const body = await req.json();
    message = body.message;
  } catch {
    return json({ ack: null });
  }

  if (!message || !openaiApiKey) {
    return json({ ack: null });
  }

  // Local logic to bypass LLM for common sign-offs (faster)
  const signOffs = [
    "thanks", "thank you", "cheers", "bye", "cya", "goodbye", "see ya", "see you", "later",
    "talk soon", "have a good one", "have a nice day", "appreciate it", "take care"
  ];
  const msgLower = message.trim().toLowerCase();
  if (
    signOffs.some(
      (s) =>
        msgLower === s ||
        msgLower.startsWith(s + "!") ||
        msgLower.startsWith(s + ".") ||
        msgLower === s + " mate" ||
        msgLower === s + "." ||
        msgLower === s + "!" ||
        msgLower === s + "!"
    )
  ) {
    return json({ ack: null });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        max_output_tokens: 30,
        instructions: SYSTEM_PROMPT,
        input: [{ role: "user", content: message }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      const textItem = data.output?.find((o: any) => o.type === "message");
      const text = textItem?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text === "NONE" || text === "none") {
        return json({ ack: null });
      }
      if (text && text.length < 100) {
        return json({ ack: text });
      }
    }
  } catch {
    // Timeout or network error — fall through to fallback
  }

  return json({ ack: pickFallback() });
});

function pickFallback(): string {
  return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
}

function json(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
