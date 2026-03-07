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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a debug assistant for the Nest AI messaging platform. You help developers understand why the system made specific decisions for each message.

You will be given a full debug trace (JSON) for a single user message processed by the Nest system. The trace contains:
- **routing**: How the message was routed (static/casual/agent), which model was chosen, and why
- **conversation_history**: The full message array sent to the LLM (system prompt, context injections, recent chat)
- **system_prompt**: The complete system prompt used
- **tool_calls**: Every tool the agent called, with args, results, timing
- **prefetch**: Data pre-fetched in parallel before the agent ran
- **agent_loop**: How many rounds the agent took, whether split models were used
- **usage**: Token counts per API call (prompt_tokens, completion_tokens, cached_tokens)
- **context**: Memory, learnings, identity model, situational context loaded
- **style_analysis**: How the user's message style was analysed (length, formality, energy, sentiment)
- **raw_llm_response**: What the model returned before post-processing
- **response**: The final formatted response sent to the user

When answering questions:
- Be specific and reference actual data from the trace
- Explain the reasoning chain: routing decision → context loading → tool selection → response generation
- If something looks wrong or suboptimal, say so
- Use Australian English (analyse, summarise, colour)
- Be concise but thorough`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { trace, question, history } = await req.json();

    if (!trace || !question) {
      return new Response(JSON.stringify({ error: "trace and question required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const traceStr = JSON.stringify(trace, null, 2);
    const truncatedTrace = traceStr.length > 80_000 ? traceStr.slice(0, 80_000) + "\n...(truncated)" : traceStr;

    const messages: Array<Record<string, string>> = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Here is the full debug trace for the message "${trace.request?.message ?? "unknown"}":\n\n\`\`\`json\n${truncatedTrace}\n\`\`\`` },
      { role: "assistant", content: "I've reviewed the full trace. What would you like to know?" },
    ];

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: question });

    const systemMsg = messages.find((m: any) => m.role === "system");
    const inputMsgs = messages.filter((m: any) => m.role !== "system");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        instructions: systemMsg?.content ?? undefined,
        input: inputMsgs,
        max_output_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[debug-chat] OpenAI ${response.status}:`, err.slice(0, 300));
      return new Response(JSON.stringify({ error: `OpenAI error: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const answer = extractResponseText(data) || "No response";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[debug-chat] Error:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
