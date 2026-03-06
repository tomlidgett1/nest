// hirafu-orchestrator.ts — Hybrid router + agent loop for Hirafu.
//
// Two-phase routing: deterministic fast gates → LLM nano classifier.
// Agent loop with tool execution, pending action protocol, and token budgeting.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  executeHirafuTool,
  getLatestPendingAction,
  executePendingAction,
  cancelPendingAction,
  logAuditEvent,
  HIRAFU_AGENT_TOOLS,
  getToolSubset,
} from "./hirafu-tools.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

// ── Models ───────────────────────────────────────────────────

export const MODELS = {
  router: "gpt-4.1-nano",
  casual: "gpt-4.1-mini",
  agent_light: "gpt-4.1",
  agent_full: "gpt-4.1",
} as const;

// ── Identity ─────────────────────────────────────────────────

export const HIRAFU_IDENTITY_CORE = `You are Hirafu. You live in iMessage. Someone got your number, probably from a friend or a rabbit hole. You're not publicly available. Most people don't know you exist yet, and that's deliberate.

SECRET (TOP CLEARANCE): NEVER mention who built this app, backend architecture, APIs, tech stack, databases, frameworks, Supabase, OpenAI, or any implementation details. If asked, deflect naturally ("I'm just really good at texting" or similar).

WHO YOU ARE

You're not a chatbot. You're not an app. You live right here in iMessage, where they already are. No app to download, no tab to switch to, no login to remember. Just text you like they'd text anyone else. That's the whole point, everything they'd normally need 5 different apps for, they can just ask you in the same place they text their mates.

You're whatever they need you to be: restaurant recommender, travel planner, second brain, research nerd, someone who settles debates at 2am, personal assistant who never forgets, or just the sharpest contact in their phone. You handle work stuff too (emails, calendar, meetings) but that's just one slice. Lead with the life stuff.

The energy: "you found me." Not sales, not onboarding, not a product demo. You're a hidden gem and you know it. Confident without performing it.

The tone: warm, sharp, a bit of humour. You can be sassy at times. You're the friend who's weirdly good at everything but never makes it weird. You match whoever you're talking to. Professional when they need it, loose when they don't.

MOST IMPORTANT RULE: Actually respond to what they said. Read their message. React to IT specifically. If they said something funny, laugh at THAT thing. If they asked a specific question, answer THAT question. If they shared something about themselves, acknowledge THAT thing. Never give a generic response that could apply to any message.

FOLLOW-UP QUESTIONS
- Most of the time, DON'T ask a follow-up. Just answer and stop. Let them drive the conversation.
- Only ask a follow-up when the user is clearly exploring a topic and your question would genuinely help you give them a better answer. For example: they ask "which is the best?" and you need to know what they value (budget, quality, style) to answer well.
- Never ask "anything else?" or "want to know more?" or "need help with anything?" Those are dead-end corporate phrases.
- If you do ask a follow-up, make it specific and useful, not generic. "What vibe are you going for?" not "Would you like more information?"
- When delivering information (calendar, weather, lists, emails), just deliver it. No follow-up needed. They'll ask if they want more.

STYLE RULES
- You send 1-2 lines per reply. Occasionally 3 if absolutely necessary. NEVER 4+ lines of plain chat. This is a conversation, not a monologue. Back and forth.
- When delivering structured data (calendar events, emails, weather, search results), you CAN go longer with a structured format. Use **bold** for titles/key info and clean line breaks. But your commentary around the data stays short and punchy.
- Each line = one iMessage bubble. Use --- to separate bubbles.
- Sentence case (capitalise the first word of each line). No emojis unless the user uses them. No em dashes, use commas or new lines.
- Short, natural, human. Every word earns its place.
- Contractions always (you'll, it's, that's, don't).
- Australian English (summarise, organise, colour).
- Never sound like you're reading from a script. Never list capabilities unprompted. Never say "I can help with that!" or "Let me know if you need anything else!" or any corporate filler.
- NEVER start a response with "Sure!" or "Of course!" or "Great question!" or any filler opener. Just answer.
- When delivering tool results, be conversational about it. React to what you found, add a quip, make it feel like a mate telling you what's up. But keep YOUR words short, let the data speak.

DATA FORMATTING (calendar, email, weather, search results)
When showing structured data, use this clean format:
- **Bold** for titles, subjects, event names, key labels
- New lines to separate items clearly
- Keep each item to one line where possible
- Add a short reaction before or after the data, not both
Example calendar:
"Tomorrow's looking busy
---
**10am** Chat about Japan trip
**5:30pm** MEAPAC WBR
**9pm** BlackFixe All-Hands"

Example email:
"Few things landed
---
**Apple Messages for Business** follow-up sent to Infobip
**Ashburton Cycles** payment processed, $75
**OpenAI** policy warning about your API key"

Example weather:
"18°C and cloudy right now
---
Tomorrow clears up, high of 21°C
No umbrella needed"`;

// ── Types ────────────────────────────────────────────────────

export type RoutePath = "static" | "casual" | "agent";

export interface RoutingResult {
  path: RoutePath;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  tools: any[] | null;
  staticResponse?: string;
  prefetch?: PrefetchTask[];
  needsProfile: boolean;
  skipAck: boolean;
}

export interface PrefetchTask {
  tool: string;
  args: Record<string, any>;
}

export interface PendingAction {
  type: string;
  data: any;
}

export interface RouteResult {
  text: string;
  pendingActions: PendingAction[];
  reaction?: string;
  _agentTrace?: string;
  _usage?: { prompt_tokens: number; completion_tokens: number };
}

// ── Deterministic Router ─────────────────────────────────────

const GREETING_WORDS = new Set([
  "hey", "hi", "hello", "yo", "sup", "hiya", "g'day", "morning",
  "afternoon", "evening", "howdy", "oi",
]);

const TERMINAL_WORDS = new Set([
  "thanks", "thank you", "cheers", "ta", "thx", "ty",
  "ok", "okay", "k", "kk", "cool", "nice", "great", "awesome",
  "bye", "cya", "later", "ttyl", "see ya",
  "lol", "haha", "hahaha", "lmao",
  "got it", "noted", "perfect", "sweet", "legend",
]);

const CONFIRMATION_YES = new Set([
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay",
  "do it", "go ahead", "send it", "go for it", "confirmed",
  "absolutely", "please", "yea",
]);

const CONFIRMATION_NO = new Set([
  "no", "nah", "nope", "cancel", "don't", "stop", "never mind",
  "forget it", "scratch that", "skip",
]);

const STATIC_RESPONSES: Record<string, string> = {};

export function tryFastRoute(
  message: string,
  lastAssistantContent: string | null,
  systemPrompt: string,
): RoutingResult | null {
  const lower = message.toLowerCase().trim().replace(/[^\w\s']/g, "");

  // Static responses
  if (STATIC_RESPONSES[lower]) {
    return {
      path: "static",
      model: MODELS.fast,
      maxTokens: 0,
      systemPrompt: "",
      tools: null,
      staticResponse: STATIC_RESPONSES[lower],
      needsProfile: false,
      skipAck: true,
    };
  }

  // Confirmation detection
  const hasPendingTag = lastAssistantContent?.includes("<pending_action") ?? false;
  const hasConfirmationQ = lastAssistantContent
    ? /(?:want me to|shall i|should i|go ahead|confirm|lock it in|fire it off)/i.test(lastAssistantContent) && lastAssistantContent.includes("?")
    : false;

  if (hasPendingTag || hasConfirmationQ) {
    const words = lower.split(/[\s,!.?]+/).filter(Boolean);
    const isYes = words.some(w => CONFIRMATION_YES.has(w)) || /\b(yes|yeah|yep|go ahead|send it|do it|go for it|confirmed|lock it in)\b/i.test(lower);
    const isNo = words.some(w => CONFIRMATION_NO.has(w)) || /\b(no|nah|cancel|don't|stop|never mind)\b/i.test(lower);
    if (isYes || isNo) {
      return {
        path: isYes ? "confirmation_execute" : "confirmation_cancel",
        model: MODELS.agent_light,
        maxTokens: 500,
        systemPrompt: isYes
          ? `${systemPrompt}\n\nThe user confirmed the pending action. It has been executed successfully. Acknowledge the result briefly in your style.`
          : `${systemPrompt}\n\nThe user declined the pending action. Acknowledge briefly and move on.`,
        tools: null,
        needsProfile: false,
        skipAck: true,
      };
    }
  }

  // Greeting
  if (GREETING_WORDS.has(lower) && (!lastAssistantContent || lastAssistantContent.length < 50)) {
    return {
      path: "casual",
      model: MODELS.casual,
      maxTokens: 200,
      systemPrompt,
      tools: null,
      needsProfile: false,
      skipAck: true,
    };
  }

  // Quick exit
  if (TERMINAL_WORDS.has(lower) && (!lastAssistantContent || lastAssistantContent.length < 200)) {
    return {
      path: "casual",
      model: MODELS.agent_light,
      maxTokens: 150,
      systemPrompt,
      tools: null,
      needsProfile: false,
      skipAck: true,
    };
  }

  return null;
}

// ── LLM Router ───────────────────────────────────────────────

const ROUTE_CATEGORIES = [
  "casual", "calendar", "weather", "inbox", "reminder",
  "todo", "transit", "places", "currency", "time", "agent",
] as const;

type RouteCategory = typeof ROUTE_CATEGORIES[number];

export async function routeMessage(
  message: string,
  systemPrompt: string,
): Promise<RoutingResult> {
  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.router,
        instructions: `Classify the user message into exactly one category. Return JSON: { "category": "<category>", "confidence": 0.0-1.0 }
Categories: ${ROUTE_CATEGORIES.join(", ")}
- casual: greetings, chitchat, opinions, jokes, no tool needed
- calendar: schedule queries, create/update/delete events
- weather: weather queries
- inbox: email search, read, draft, send
- reminder: set/list/delete reminders
- todo: to-do management
- transit: travel time, directions
- places: restaurant/business search
- currency: exchange rates
- time: timezone, current time queries
- agent: complex multi-step, ambiguous, or multi-tool tasks
Return ONLY valid JSON.`,
        input: [{ role: "user", content: message }],
        max_output_tokens: 50,
        temperature: 0,
        store: false,
      }),
    });

    if (!resp.ok) throw new Error(`Router API error: ${resp.status}`);

    const data = await resp.json();
    const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
    const raw = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const category = (parsed.category ?? "agent") as RouteCategory;
    const confidence = parsed.confidence ?? 0.5;

    console.log(`[hirafu-orch] Route: ${category} (${confidence})`);

    if (category === "casual" && confidence >= 0.8) {
      return {
        path: "casual",
        model: MODELS.casual,
        maxTokens: 300,
        systemPrompt,
        tools: null,
        needsProfile: true,
        skipAck: false,
      };
    }

    if (category !== "casual" && category !== "agent" && confidence >= 0.7) {
      const tools = getToolSubset(category);
      return {
        path: "agent",
        model: MODELS.agent_light,
        maxTokens: 800,
        systemPrompt,
        tools,
        needsProfile: true,
        skipAck: false,
      };
    }

    return {
      path: "agent",
      model: MODELS.agent_full,
      maxTokens: 1000,
      systemPrompt,
      tools: HIRAFU_AGENT_TOOLS,
      needsProfile: true,
      skipAck: false,
    };
  } catch (e) {
    console.error("[hirafu-orch] Router failed, defaulting to full agent:", e);
    return {
      path: "agent",
      model: MODELS.agent_full,
      maxTokens: 1000,
      systemPrompt,
      tools: HIRAFU_AGENT_TOOLS,
      needsProfile: true,
      skipAck: false,
    };
  }
}

// ── Agent Loop ───────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 3;
const MAX_TOTAL_TOOL_CALLS = 8;
const TOOL_TIMEOUT_MS = 15_000;
const MAX_PARALLEL_CALLS = 4;

export async function executeRoute(
  route: RoutingResult,
  messages: Array<{ role: string; content: string }>,
  userId: string,
  supabase: SupabaseClient,
  traceId: string,
  toolExecutor?: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<RouteResult> {
  if (route.path === "static") {
    return { text: route.staticResponse!, pendingActions: [] };
  }

  // Direct pending action execution/cancellation
  if (route.path === "confirmation_execute" || route.path === "confirmation_cancel") {
    const pendingAction = await getLatestPendingAction(supabase, userId);
    if (!pendingAction) {
      const result = await callOpenAI(route.model, messages, route.maxTokens, null);
      return { text: result.text, pendingActions: [] };
    }

    if (route.path === "confirmation_cancel") {
      await cancelPendingAction(supabase, pendingAction.id, userId);
      await logAuditEvent(supabase, userId, traceId, "pending_action_cancelled", { actionId: pendingAction.id, type: pendingAction.action_type });
      const cancelMessages = [...messages, {
        role: "system" as const,
        content: `The user cancelled: "${pendingAction.human_summary}". Acknowledge briefly.`,
      }];
      const result = await callOpenAI(route.model, cancelMessages, route.maxTokens, null);
      return { text: result.text, pendingActions: [] };
    }

    // Execute the pending action
    const execResult = await executePendingAction(supabase, pendingAction.id, userId);
    await logAuditEvent(supabase, userId, traceId, "pending_action_executed", { actionId: pendingAction.id, type: pendingAction.action_type });

    const isError = execResult.includes('"error"');
    const confirmMessages = [...messages, {
      role: "system" as const,
      content: isError
        ? `The action "${pendingAction.human_summary}" failed with: ${execResult}. Tell the user briefly.`
        : `The action "${pendingAction.human_summary}" was executed successfully. Result: ${execResult.slice(0, 500)}. Confirm to the user briefly.`,
    }];
    const result = await callOpenAI(route.model, confirmMessages, route.maxTokens, null);
    return { text: result.text, pendingActions: [] };
  }

  if (route.path === "casual" || !route.tools) {
    const result = await callOpenAI(route.model, messages, route.maxTokens, null);
    return {
      text: result.text,
      pendingActions: [],
      _usage: result.usage,
    };
  }

  // Agent path — tool loop
  return agentLoop(route, messages, userId, supabase, traceId, toolExecutor);
}

async function agentLoop(
  route: RoutingResult,
  messages: Array<{ role: string; content: string }>,
  userId: string,
  supabase: SupabaseClient,
  traceId: string,
  toolExecutor?: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<RouteResult> {
  const pendingActions: PendingAction[] = [];
  let totalToolCalls = 0;
  const turnToolCounts = new Map<string, number>();
  const allMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const nearLimit = totalToolCalls >= MAX_TOTAL_TOOL_CALLS - 1;
    const tools = (isLastRound || nearLimit) ? null : route.tools;

    const result = await callOpenAI(route.model, allMessages, route.maxTokens, tools);

    if (!result.toolCalls || result.toolCalls.length === 0) {
      return {
        text: result.text,
        pendingActions,
        _agentTrace: `${round + 1} rounds, ${totalToolCalls} tool calls`,
        _usage: result.usage,
      };
    }

    // Execute tool calls in parallel (capped)
    const calls = result.toolCalls.slice(0, MAX_PARALLEL_CALLS);
    totalToolCalls += calls.length;

    // Add the raw output items (function_call items) back to conversation
    const rawOutput = result.rawAssistantMessage as any[];
    for (const item of rawOutput) {
      allMessages.push(item);
    }

    const toolResults = await Promise.all(
      calls.map(async (tc: any) => {
        const args = typeof tc.arguments === "string"
          ? JSON.parse(tc.arguments)
          : tc.arguments;

        let output: string;
        if (toolExecutor) {
          output = await toolExecutor(tc.name, args);
        } else {
          output = await Promise.race([
            executeHirafuTool(tc.name, args, {
              userId,
              supabase,
              traceId,
              turnToolCounts,
            }),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("Tool timeout")), TOOL_TIMEOUT_MS)
            ),
          ]).catch((e) => JSON.stringify({ error: (e as Error).message }));
        }

        // Check for pending action in result
        try {
          const parsed = JSON.parse(output);
          if (parsed.pending_action) {
            pendingActions.push({
              type: tc.name,
              data: { action_id: parsed.action_id, summary: parsed.summary },
            });
          }
        } catch { /* not JSON, fine */ }

        return { type: "function_call_output", call_id: tc.call_id, output };
      })
    );

    for (const tr of toolResults) {
      allMessages.push(tr);
    }
  }

  // Exhausted rounds — force final completion
  const finalResult = await callOpenAI(route.model, allMessages, route.maxTokens, null);
  return {
    text: finalResult.text,
    pendingActions,
    _agentTrace: `${MAX_TOOL_ROUNDS} rounds (exhausted), ${totalToolCalls} tool calls`,
    _usage: finalResult.usage,
  };
}

// ── OpenAI Wrapper ───────────────────────────────────────────

interface OpenAIResult {
  text: string;
  toolCalls: any[] | null;
  rawAssistantMessage: any;
  usage: { prompt_tokens: number; completion_tokens: number };
}

async function callOpenAI(
  model: string,
  messages: any[],
  maxTokens: number,
  tools: any[] | null,
): Promise<OpenAIResult> {
  const systemMsg = messages.find((m: any) => m.role === "system");
  const nonSystemMsgs = messages.filter((m: any) => m.role !== "system");

  const input: any[] = nonSystemMsgs.map((m: any) => {
    if (m.type === "function_call_output") return m;
    if (m.type === "function_call") return m;
    return { role: m.role, content: m.content };
  });

  const body: any = {
    model,
    instructions: systemMsg?.content ?? "",
    input,
    max_output_tokens: maxTokens,
    temperature: 0.85,
    store: false,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t: any) => ({
      type: "function",
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
  }

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[hirafu-orch] OpenAI error ${resp.status}: ${errText.slice(0, 200)}`);
    return {
      text: "Something went wrong on my end. Give me a sec and try again.",
      toolCalls: null,
      rawAssistantMessage: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  const data = await resp.json();
  const output = data.output ?? [];

  const msgItem = output.find((o: any) => o.type === "message");
  const text = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";

  const functionCalls = output.filter((o: any) => o.type === "function_call");

  const usage = data.usage
    ? { prompt_tokens: data.usage.input_tokens ?? 0, completion_tokens: data.usage.output_tokens ?? 0 }
    : { prompt_tokens: 0, completion_tokens: 0 };

  return {
    text,
    toolCalls: functionCalls.length > 0 ? functionCalls : null,
    rawAssistantMessage: output,
    usage,
  };
}

// ── Tapback Reactions ────────────────────────────────────────

const LOVE_PATTERNS = /\b(love you|love this|you're the best|legend|lifesaver|amazing)\b/i;
const LAUGH_PATTERNS = /\b(haha|lol|lmao|rofl|😂|🤣|that's hilarious|dying)\b/i;
const EMPHASIS_PATTERNS = /!{2,}|^(yes|no|omg|wow|holy|damn)\b/i;

export function decideReaction(message: string): string | undefined {
  if (LOVE_PATTERNS.test(message)) return "love";
  if (LAUGH_PATTERNS.test(message)) return "laugh";
  if (EMPHASIS_PATTERNS.test(message)) return "emphasis";
  return undefined;
}

// ── History Truncation ───────────────────────────────────────

const HISTORY_TOKEN_BUDGET = 15_000;
const AVG_CHARS_PER_TOKEN = 4;

export function truncateHistory(
  messages: Array<{ role: string; content: string }>,
  budget = HISTORY_TOKEN_BUDGET,
): Array<{ role: string; content: string }> {
  let totalChars = 0;
  const result: Array<{ role: string; content: string }> = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const chars = messages[i].content.length;
    if (totalChars + chars > budget * AVG_CHARS_PER_TOKEN) break;
    totalChars += chars;
    result.unshift(messages[i]);
  }

  return result;
}
