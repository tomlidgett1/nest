// v2-group-should-respond — Lightweight LLM decision: should Nest respond?
//
// Called by the bridge for group messages that don't explicitly mention Nest.
// Uses gpt-4.1-nano (~100ms, fraction of a cent) to decide if Nest should
// jump in based on recent conversation context.
//
// Returns: { respond: boolean }

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

function extractResponseText(data: Record<string, unknown>): string {
  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output) return "";
  return output
    .filter((o) => o.type === "message")
    .flatMap((o) => (o.content as Array<Record<string, unknown>>) ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text as string)
    .join("");
}

const DECISION_PROMPT = `You are deciding whether "Nest" (an AI participant in a group iMessage chat) should respond to the latest message.

Nest should respond when:
- Someone asks a question to the group that Nest could answer (trivia, weather, recommendations, directions, times, scores, facts)
- Someone is clearly talking to Nest by context (continuing a conversation with Nest, replying to Nest, "what do you think", "up to you")
- Someone asks for help that Nest can provide (look something up, settle a debate, make a recommendation)
- The conversation would naturally benefit from Nest chiming in (e.g. group is stuck deciding something)

Nest should NOT respond when:
- People are having a normal conversation between themselves
- Someone just sent a reaction, emoji, or acknowledgment (lol, haha, nice, ok)
- The conversation is personal/emotional between humans
- Nest just responded recently and doesn't need to pile on
- The message is clearly directed at a specific person (not Nest)
- It would be annoying or intrusive to jump in

Respond with ONLY "yes" or "no". Nothing else.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  try {
    const { messages, current_message } = await req.json();

    // Build a minimal conversation for the decision model
    const recentContext = (messages || [])
      .slice(-8)
      .map((m: { name?: string; role: string; content: string }) => {
        const label = m.name || (m.role === "assistant" ? "Nest" : "Someone");
        return `${label}: ${m.content}`;
      })
      .join("\n");

    const userPrompt = recentContext
      ? `Recent conversation:\n${recentContext}\n\nLatest message: ${current_message}\n\nShould Nest respond?`
      : `Latest message: ${current_message}\n\nShould Nest respond?`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        max_output_tokens: 3,
        temperature: 0,
        instructions: DECISION_PROMPT,
        input: userPrompt,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error:", response.status, await response.text());
      return Response.json({ respond: false });
    }

    const data = await response.json();
    const answer = (extractResponseText(data) || "").trim().toLowerCase();
    const respond = answer.startsWith("yes");

    return Response.json({ respond });
  } catch (err) {
    console.error("v2-group-should-respond error:", err);
    return Response.json({ respond: false });
  }
});
