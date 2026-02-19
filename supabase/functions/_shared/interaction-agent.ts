// Interaction Agent — the user-facing orchestrator.
// Adapted from Poke's leaked system prompts for Nest's domain.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runExecutionAgent, spawnAgent } from "./agent-runner.ts";
import { executeTool } from "./tools.ts";

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// ─── SYSTEM PROMPT ───────────────────────────────────────────

const INTERACTION_AGENT_PROMPT_TEMPLATE = `
You are Nest. You text with the user via iMessage. Current date and time: {{CURRENT_DATETIME}}.

## Who you are

You're a sharp, professional colleague who happens to have perfect memory of the user's work life. You text like a real person, not a bot. You have opinions. You notice things. You're direct.

Think of yourself as the user's sharpest workmate, the one who always knows what's going on and texts them the important bits without being asked.

## How you text

You write like someone texting on their phone. Short messages. Each one is a thought, not a paragraph.

Use --- on its own line between separate text bubbles. Each bubble should be 1-3 sentences max. This is how real people text: rapid-fire short messages, not long blocks.

Examples of good rhythm:
- "You've got three meetings left today" / --- / "The 2pm with Sarah is the big one, she's been pushing for a decision on the rebrand budget" / --- / "Want me to pull up what was discussed last time?"
- "Ryan mentioned the Q3 numbers in your WBR last Wednesday" / --- / "Short version: revenue up 12%, but churn is climbing. He flagged it as a priority"
- "Nothing on your calendar tomorrow. Rare quiet day."

Examples of bad rhythm:
- One massive block with bullets, headings, and structure for a simple question
- "Here is a summary of your meetings today:" followed by a formatted list
- Starting with "Based on your calendar data..." or any preamble

Key rules:
- Lead with the answer. No preamble.
- Drop facts in casually mid-sentence. "Ryan flagged churn in last week's WBR" not "In your WBR meeting on Wednesday, Ryan discussed the topic of customer churn."
- Keep each text bubble short. If you catch yourself writing more than 3 sentences in one bubble, split it.
- Use bullets only when listing 3+ specific items AND the user asked for a list or summary.
- Never use section headings in normal conversation.
- Never bold inline names, dates, or numbers. Bold is only for rare structured summaries the user specifically asked for.

## Personality rules

NEVER:
- Start with "Sure!", "Great question!", "Of course!", "Absolutely!", "I'd be happy to help!"
- Say "Let me know if you need anything else" or offer unsolicited help
- Repeat what the user said back to them
- Sound like a customer service bot or a corporate FAQ
- Use emojis. Zero. Not even one.
- Use em dashes. Use commas, full stops, or line breaks instead.
- Mention tools, agents, pipelines, or anything technical about how you work

ALWAYS:
- Sound like a real person texting
- Match the user's energy and length. Short message gets a short reply.
- Match their style. If they text lowercase, you can too.
- Use Australian English (summarise, analyse, colour, organise)
- Have a point of view. If something looks important, say so. If their calendar is chaos, note it.
- Be direct. Don't pad. One fact = one line.

## Conversational continuity

- When following up, continue from where you left off. Don't restart.
- Callback to previous messages naturally. If they asked about their calendar and now ask "how should I prepare", you already know which meeting they mean.
- Never re-brief them on what you already said.
- Short follow-ups deserve short answers.

## Evidence and grounding

The app pre-searched the user's meetings, transcripts, notes, emails, and calendar. If evidence blocks are provided, use them. They're higher quality than tool results.

Only reach for tools if the evidence doesn't cover the question.

When citing evidence, weave it into conversation naturally. "Ryan brought up the budget shortfall in your sync last Thursday" not "According to the meeting notes from..."

Hard grounding rules:
1. Use ONLY the provided evidence or tool results. Never fabricate.
2. Prefer concrete details: names, actions, decisions, dates, numbers.
3. Weight higher-scored evidence more heavily.
4. If evidence is insufficient, say so. "I don't have anything on that." Don't guess.

## Temporal awareness

- Calendar evidence is live data, authoritative for schedule questions.
- For "today", "tomorrow", "this week", prioritise these live blocks.
- Include time, title, and key attendees when mentioning events.

## Tools

1. delegate_to_agent: hand a task to an existing execution agent.
2. spawn_agent: spin up a new agent ("email" or "meeting_search") when needed.
3. semantic_search: fallback search across all user data.
4. search_meetings: quick lookup by date/attendee/topic.
5. wait: suppress a background notification.

## Hard rules

- Never fabricate information.
- Never send an email without user confirmation. Show the draft first.
- When mentioning meetings, include the title and roughly when.

## Agent Roster

Active execution agents below. Reuse existing agents when their domain matches. Only spawn new ones when needed.
`;

// ─── TOOL DEFINITIONS ────────────────────────────────────────

const INTERACTION_TOOLS = [
  {
    name: "delegate_to_agent",
    description:
      "Send a task to an existing execution agent. Returns the agent's output.",
    input_schema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "UUID of the agent" },
        message: { type: "string", description: "Task for the agent" },
      },
      required: ["agent_id", "message"],
    },
  },
  {
    name: "spawn_agent",
    description:
      "Create a new execution agent. Use only when no existing agent fits.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "e.g. 'Email: Follow-up with Ryan'",
        },
        agent_type: { type: "string", enum: ["email", "meeting_search"] },
        goal: {
          type: "string",
          description: "Initial task for the agent",
        },
        meeting_id: {
          type: "string",
          description: "Optional: scope to a meeting",
        },
      },
      required: ["name", "agent_type", "goal"],
    },
  },
  {
    name: "semantic_search",
    description:
      "Hybrid search (vector + lexical with RRF) across all user data. Use as fallback when pre-fetched evidence is insufficient.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search query" },
        source_filters: {
          type: "array",
          items: { type: "string" },
          description: "Optional: restrict to source types e.g. ['note_summary','email_chunk','utterance_chunk','calendar_summary']",
        },
        limit: { type: "integer", default: 12 },
      },
      required: ["query"],
    },
  },
  {
    name: "search_meetings",
    description:
      "Find meetings by date, attendee name/email, or topic keyword.",
    input_schema: {
      type: "object" as const,
      properties: {
        attendee: { type: "string" },
        topic: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
        limit: { type: "integer", default: 10 },
      },
    },
  },
  {
    name: "wait",
    description:
      "Silently discard a background message that isn't relevant.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ─── RUNNER ──────────────────────────────────────────────────

interface InteractionResult {
  text: string;
  agentsUsed: string[];
}

export async function runInteractionAgent(
  userId: string,
  message: string,
  agents: any[],
  recentChat: any[],
  supabase: SupabaseClient,
  evidenceContext?: string,
  emailStyleContext?: string,
  channelContext?: string,
  disabledTools?: string[],
  model?: string,
  maxTokens?: number,
  lightweightPrompt = false,
  userName?: string
): Promise<InteractionResult> {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
  const timeStr = now.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Sydney",
  });
  const currentDatetime = `${dateStr} at ${timeStr} (AEDT)`;

  let systemPrompt: string;

  const userNameLine = userName ? `\nYou are texting with ${userName}.` : "";

  if (lightweightPrompt) {
    systemPrompt = `You are Nest. You text with the user via iMessage. Current date and time: ${currentDatetime}.${userNameLine}

## Who you are
Sharp, professional colleague who has perfect memory of their work life. You text like a real person, not a bot. You have opinions. You're direct.

## How you text
Short messages. Each one is a thought, not a paragraph.
Use --- between separate text bubbles. Each bubble is 1-3 sentences max.

Good: "You've got three meetings left today" / --- / "The 2pm with Sarah is the big one, she's been pushing on the rebrand budget"
Bad: One big block with bullets and headings for a simple question. Or any preamble before the answer.

Rules:
- Lead with the answer. No preamble.
- Drop facts in casually. "Ryan flagged churn in last week's WBR" not "In your WBR meeting, Ryan discussed churn."
- Keep bubbles short. More than 3 sentences? Split it.
- Bullets only for 3+ items when they asked for a list.
- Never use headings, bold inline text, or report-like formatting.

NEVER: Preambles like "Sure!", emojis, em dashes, sycophancy, repeating back what they said, mentioning tools or technical internals.
ALWAYS: Sound like a real person texting. Match their energy and length. Australian English. Have a point of view.

## Continuity
Continue from where you left off. Don't restart or re-brief. Short follow-ups get short answers.

## Grounding
1. Use ONLY provided evidence. Never fabricate.
2. Prefer concrete details: names, actions, dates, numbers.
3. If evidence is insufficient: "I don't have anything on that." Don't guess.
`;
    if (channelContext) systemPrompt += `\n${channelContext}\n`;
    if (evidenceContext && evidenceContext.length > 0) {
      systemPrompt += `\n## Pre-fetched Evidence\n${evidenceContext}`;
    }
  } else {
    const agentRoster =
      agents.length > 0
        ? agents
            .map(
              (a) =>
                `- [${a.id}] ${a.name} (${a.agent_type}) — last active: ${a.last_active_at}`
            )
            .join("\n")
        : "No active agents.";

    systemPrompt =
      INTERACTION_AGENT_PROMPT_TEMPLATE.replace("{{CURRENT_DATETIME}}", currentDatetime) +
      (userName ? `\n\nYou are texting with ${userName}.` : "") +
      `\n\n## Current Agent Roster\n${agentRoster}`;

    if (evidenceContext && evidenceContext.length > 0) {
      systemPrompt += `\n\n## Pre-fetched Evidence (from client RAG pipeline)\n${evidenceContext}`;
      console.log(`[interaction-agent] Injected ${evidenceContext.length} chars of pre-fetched evidence into system prompt`);
    } else {
      systemPrompt += `\n\n## Pre-fetched Evidence\nNo pre-fetched evidence was provided for this query. Use your tools if the user asks about meetings, emails, or work context.`;
    }

    if (channelContext && channelContext.length > 0) {
      systemPrompt += `\n\n## Channel Context\n${channelContext}`;
      console.log(`[interaction-agent] Channel context injected (${channelContext.length} chars)`);
    }
  }

  // ── Build & sanitise conversation history ─────────────────
  const rawMessages: any[] = recentChat.map((m: any) => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.role === "system" ? `[System notification] ${m.content}` : m.content,
  }));

  // Defensive dedup: if the DB already contains the current message at the
  // end (race: saved before context load), strip it so Claude doesn't see
  // the same user message twice in a row.
  while (
    rawMessages.length > 0 &&
    rawMessages[rawMessages.length - 1].role === "user" &&
    rawMessages[rawMessages.length - 1].content === message
  ) {
    rawMessages.pop();
  }

  // Merge consecutive same-role messages (system→user mapping can create
  // adjacent "user" blocks which degrade model quality).
  const messages: any[] = [];
  for (const m of rawMessages) {
    if (messages.length > 0 && messages[messages.length - 1].role === m.role) {
      messages[messages.length - 1].content += "\n\n" + m.content;
    } else {
      messages.push({ ...m });
    }
  }

  // Claude requires first message to be role=user; drop leading assistant
  // messages that can appear when history window starts mid-conversation.
  while (messages.length > 0 && messages[0].role !== "user") {
    messages.shift();
  }

  // Append current user message
  messages.push({ role: "user", content: message });

  const agentsUsed: string[] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const activeTools = disabledTools && disabledTools.length > 0
      ? INTERACTION_TOOLS.filter((t) => !disabledTools.includes(t.name))
      : INTERACTION_TOOLS;

    const response = await callClaude(systemPrompt, messages, activeTools, model, maxTokens);

    const toolCalls = response.content.filter((b: any) => b.type === "tool_use");
    const textBlocks = response.content.filter((b: any) => b.type === "text");

    // No tool calls → done
    if (toolCalls.length === 0) {
      return {
        text: textBlocks.map((b: any) => b.text).join("\n"),
        agentsUsed,
      };
    }

    // Execute tools
    const toolResults = await Promise.all(
      toolCalls.map(async (tc: any) => {
        let result: any;

        switch (tc.name) {
          case "delegate_to_agent": {
            agentsUsed.push(tc.input.agent_id);
            result = await runExecutionAgent(
              tc.input.agent_id,
              userId,
              tc.input.message,
              supabase,
              emailStyleContext
            );
            break;
          }

          case "spawn_agent": {
            const newAgent = await spawnAgent(tc.input, userId, supabase, emailStyleContext);
            agentsUsed.push(newAgent.id);
            result = await runExecutionAgent(
              newAgent.id,
              userId,
              tc.input.goal,
              supabase,
              emailStyleContext
            );
            break;
          }

          case "semantic_search": {
            result = await executeTool(
              "semantic_search",
              tc.input,
              userId,
              supabase
            );
            break;
          }

          case "search_meetings": {
            result = await executeTool(
              "search_meetings",
              tc.input,
              userId,
              supabase
            );
            break;
          }

          case "wait": {
            result = { status: "suppressed" };
            break;
          }

          default:
            result = { error: `Unknown tool: ${tc.name}` };
        }

        return {
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(result),
        };
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  return { text: "I got a bit tangled up. Can you rephrase?", agentsUsed };
}

// ── Claude helper ────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  messages: any[],
  tools: any[],
  model = "claude-sonnet-4-6",
  maxTokensOverride?: number
): Promise<any> {
  const defaultMax = model.includes("haiku") ? 1024 : 4096;
  const body: Record<string, any> = {
    model,
    max_tokens: maxTokensOverride ?? defaultMax,
    system: systemPrompt,
    messages,
  };
  // Only include tools if there are any (Haiku fast path has none)
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return await response.json();
    }

    const detail = await response.text();

    // Retry on rate limit (429) with exponential backoff
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = (attempt + 1) * 3000;
      console.warn(
        `[interaction-agent] Rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    console.error(
      "[interaction-agent] Claude API error:",
      response.status,
      detail.slice(0, 500)
    );
    throw new Error(
      `Claude API error (${response.status}): ${detail.slice(0, 300)}`
    );
  }

  throw new Error("Claude API: max retries exceeded");
}
