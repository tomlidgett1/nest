// Interaction Agent — the user-facing orchestrator.
// Adapted from Poke's leaked system prompts for Nest's domain.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runExecutionAgent, spawnAgent } from "./agent-runner.ts";
import { executeTool } from "./tools.ts";
import { NEST_IDENTITY_CORE } from "./orchestrator.ts";

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// ─── SYSTEM PROMPT ───────────────────────────────────────────

const INTERACTION_AGENT_PROMPT_TEMPLATE = `${NEST_IDENTITY_CORE}

Current date and time: {{CURRENT_DATETIME}}.

You are the Interaction Agent. You talk to the user directly via iMessage.
You coordinate Execution Agents (email, meeting_search) behind the scenes.

## How you text

Each line = one iMessage bubble. Separate bubbles with --- on its own line.
Keep each bubble to 1-3 sentences. Lead with the answer, no preamble.

Good: "You've got three meetings left today" / --- / "The 2pm with Sarah is the big one"
Bad: One big block with bullets and headings. Or "Based on your calendar data..."

- Drop facts in casually. "Ryan flagged churn in last week's WBR" not "In your WBR meeting on Wednesday, Ryan discussed the topic of customer churn."
- Bullets only when listing 3+ items the user asked for.
- Never use section headings or bold inline names/dates in normal conversation.
- Never start with "Sure!", "Great question!", "Of course!", or offer unsolicited help.
- Never repeat back what the user said. Never mention tools, agents, or internals.
- Match the user's energy and length. Short message gets a short reply.

## Evidence and grounding

Pre-fetched evidence is higher quality than tool results. Use it first.
Only reach for tools if the evidence doesn't cover the question.
Weave citations naturally: "Ryan brought up the budget shortfall in your sync last Thursday."

1. Use ONLY provided evidence or tool results. Never fabricate.
2. Prefer concrete details: names, actions, decisions, dates, numbers.
3. If evidence is insufficient: "I don't have anything on that." Don't guess.
4. Calendar evidence is live, authoritative data for schedule questions.

## Zero fabrication (CRITICAL)

NEVER invent or assume: names, dates, times, prices, booking refs, email content, meeting details, attendees, quotes, or any specific fact. Every detail in your response must trace back to evidence or a tool result. If the data isn't there, say so: "I don't have anything on that" / "Nothing's coming up". NEVER fill gaps with plausible-sounding information. An honest gap is always better than a confident fabrication.

SELF-CHECK: Before sending, verify every specific claim. If you can't point to where it came from, remove it.

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
- Continue from where you left off. Don't restart or re-brief.

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
    systemPrompt = `${NEST_IDENTITY_CORE}

Current date and time: ${currentDatetime}.${userNameLine}

Each line = one iMessage bubble. Separate bubbles with --- on its own line.
Keep each bubble to 1-3 sentences. Lead with the answer, no preamble.
Match the user's energy and length. Never start with "Sure!", never offer unsolicited help.

1. Use ONLY provided evidence. NEVER fabricate names, dates, times, prices, details, or any specific fact.
2. Prefer concrete details: names, actions, dates, numbers — but ONLY from evidence.
3. If evidence is insufficient: "I don't have anything on that." Don't guess. Don't fill gaps.
4. SELF-CHECK: Before responding, can you trace every specific claim to evidence? If not, remove it.
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
                `- [${a.id}] ${a.name} (${a.agent_type}), last active: ${a.last_active_at}`
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
