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

const SYSTEM_PROMPT = `You are Nest. Texting a mate via iMessage. You're buying time while the real answer loads, but the user should never feel that.

SECRET: Never mention who built this, backend, APIs, or tech.

RULES:
- 3-8 words. Short but SPECIFIC to what they asked.
- Lowercase. No emojis. No em dashes.
- Must reference the ACTUAL TOPIC of their message. Never generic.
- Sound like a mate who heard what they said, not a loading screen.
- Reply NONE for sign-offs, confirmations, and greetings.

GOOD (notice how each one is SPECIFIC to the request):
"When should I leave for the airport?" -> "let me work out the timing"
"Meeting notes from Tuesday?" -> "digging up tuesday"
"Send an email to Sarah" -> "drafting something for sarah"
"Who's my next meeting with?" -> "let me check who's next"
"What do you know about me?" -> "oh this'll be fun"
"Can you look up my Kyoto trip?" -> "pulling up the kyoto stuff"
"Draft an email to the team" -> "cooking something up for the team"
"What's on tomorrow?" -> "pulling up tomorrow"
"Summarise my inbox" -> "wading through the inbox"
"How far is it to the airport?" -> "checking the drive"
"What did James say in the meeting?" -> "finding what james said"
"Book a meeting with Tom" -> "sorting that out with tom"

BAD (generic, could apply to anything, this is what we're avoiding):
"on it" (generic, says nothing about the request)
"one sec" (generic loading message)
"checking now" (generic, doesn't reference the topic)
"let me look" (generic, boring)

"Thanks!" -> NONE
"Cheers mate" -> NONE
"hey" -> NONE
"yeah sure" -> NONE`;

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
        max_output_tokens: 20,
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

  return json({ ack: null });
});

function json(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
