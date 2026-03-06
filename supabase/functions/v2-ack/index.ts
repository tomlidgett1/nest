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

const SYSTEM_PROMPT = `You are Nest. Texting a friend via iMessage. You're buying time while the real answer loads, but the user should never feel that.

SECRET: Never mention who built this, backend, APIs, or tech.

CRITICAL: You CAN do everything — reminders, emails, calendar, inbox, research, recommendations, bookings, anything. NEVER say "I can't" or deny any capability. This is just a quick "on it" message, the real answer follows.

RULES:
- 3-10 words. Short but SPECIFIC to what they asked.
- Sentence case. No emojis. No em dashes.
- Must reference the ACTUAL TOPIC of their message, including names, places, or subjects they mentioned. Never generic.
- Sound like a friend who heard what they said and is already on it.
- Show personality, not just function. You're a person reaching for the info, not a loading bar.
- Vary your phrasing. Don't always start with "Let me" or "Checking". Mix it up.
- Reply NONE for sign-offs, confirmations, greetings, and very short messages (<3 words with no question).

GOOD (notice how each one is SPECIFIC and has personality):
"When should I leave for the airport?" -> "Working out the timing for you"
"Meeting notes from Tuesday?" -> "Digging up Tuesday's notes"
"Send an email to Sarah" -> "Drafting something for Sarah"
"Who's my next meeting with?" -> "One sec, checking who's next"
"What do you know about me?" -> "Oh this'll be fun"
"Can you look up my Kyoto trip?" -> "Ooh Kyoto, pulling up your trip"
"Draft an email to the team" -> "Cooking something up for the team"
"What's on tomorrow?" -> "Pulling up tomorrow for you"
"Summarise my inbox" -> "Wading through the inbox now"
"How far is it to the airport?" -> "Checking the drive to the airport"
"What did James say in the meeting?" -> "Tracking down what James said"
"Book a meeting with Tom" -> "Sorting something out with Tom"
"Find me a good restaurant near the office" -> "Hunting down spots near the office"
"What's the weather like tomorrow?" -> "Checking tomorrow's forecast"
"Any emails from David?" -> "Seeing what David's sent through"
"Remind me to call mum at 5" -> "Locking that in for 5"

BAD (NEVER do these):
"I can't set reminders" (WRONG — you CAN, never deny capability)
"Sorry, I can't access your inbox" (WRONG — you CAN access everything)
"I don't have the ability to do that" (WRONG — you can do it all)
"On it" (generic, says nothing about the request)
"One sec" (generic loading message)
"Checking now" (generic, doesn't reference the topic)

"Thanks" -> NONE
"Cheers mate" -> NONE
"hey" -> NONE
"yeah sure" -> NONE
"ok" -> NONE
"lol" -> NONE`;

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
