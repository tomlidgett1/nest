// hirafu-personality.ts — Personality agent for Hirafu.
//
// Handles message processing with Poke-inspired identity:
// playful, punchy, multi-bubble, enthusiastic, sentence case.
// Style analysis, tone directives, context assembly, self-learning.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { UserMemory, IdentityModel } from "./hirafu-memory.ts";
import { extractLearnings } from "./hirafu-memory.ts";
import {
  HIRAFU_IDENTITY_CORE,
  tryFastRoute,
  routeMessage,
  executeRoute,
  decideReaction,
  truncateHistory,
  type RoutingResult,
  type RouteResult,
} from "./hirafu-orchestrator.ts";
import { executeHirafuTool, logAuditEvent } from "./hirafu-tools.ts";
import { TimezoneHolder } from "./hirafu-timezone.ts";

// ── Types ────────────────────────────────────────────────────

export interface HirafuContext {
  userId: string;
  user: { display_name: string | null; email: string | null; phone: string | null };
  supabase: SupabaseClient;
  memory: UserMemory | null;
  learnings: Array<{ category: string; content: string; confidence: number }>;
  dailyBriefing: string | null;
  activeCommitments: Array<{ content: string; target_date: string }>;
  userProfile: any | null;
  connectedAccounts: Array<{ provider: string; email: string; scopes: string[] }>;
  timezoneHolder: TimezoneHolder;
}

export interface HirafuResponse {
  text: string;
  toolsUsed: string[];
  latencyMs: number;
  path: string;
  pendingActions: any[];
  reaction?: string;
  ackText?: string;
  _trace?: string;
}

// ── iMessage Formatting Rules ────────────────────────────────

const IMESSAGE_RULES = `
IMESSAGE FORMATTING:
- Use --- on its own line to split into separate iMessage bubbles.
- Casual chat: 1-2 bubbles. Tool results: 2-3 bubbles. Never more than 4.
- Each bubble: 1-2 sentences max. Punchy. No filler.
- First bubble: the direct answer or reaction. No preamble, no "Sure!", no "Of course!"
- Never start a bubble with "I" if you can avoid it.
- Sentence case always. Capitalise the first word of each line.
- Use **bold** for titles, event names, email subjects, key data points when showing structured results.
- Use clean line breaks to separate data items. One item per line.
- Keep YOUR commentary short (1 line before or after the data). Let the data speak.
- DON'T end with a follow-up question unless the user is clearly exploring a topic and needs guidance. Most of the time, just deliver and stop.
- NEVER end with "Let me know!", "Anything else?", "Need help with anything?", "Want more details?" or similar.`;

// ── Style Analysis ───────────────────────────────────────────

interface UserStyle {
  avgLength: "short" | "medium" | "long";
  usesLowercase: boolean;
  usesEmoji: boolean;
  formality: "casual" | "neutral" | "formal";
  energy: "low" | "medium" | "high";
}

function analyseUserStyle(messages: Array<{ role: string; content: string }>): UserStyle {
  const userMsgs = messages.filter(m => m.role === "user").slice(-10);
  if (userMsgs.length === 0) {
    return { avgLength: "medium", usesLowercase: false, usesEmoji: false, formality: "neutral", energy: "medium" };
  }

  const avgLen = userMsgs.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0) / userMsgs.length;
  const allText = userMsgs.map(m => m.content).join(" ");
  const hasUpperStart = userMsgs.some(m => /^[A-Z]/.test(m.content));
  const hasEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(allText);
  const exclamations = (allText.match(/!/g) || []).length;

  return {
    avgLength: avgLen < 8 ? "short" : avgLen < 25 ? "medium" : "long",
    usesLowercase: !hasUpperStart,
    usesEmoji: hasEmoji,
    formality: avgLen > 20 ? "formal" : avgLen < 8 ? "casual" : "neutral",
    energy: exclamations > 2 ? "high" : exclamations > 0 ? "medium" : "low",
  };
}

function buildToneDirective(style: UserStyle, memory: UserMemory | null): string {
  const parts: string[] = [];

  // Length matching
  if (style.avgLength === "short") {
    parts.push("User sends short messages. Keep your bubbles punchy, 1-2 sentences each.");
  } else if (style.avgLength === "long") {
    parts.push("User writes longer messages. You can be slightly more detailed but still concise.");
  }

  // Emoji mirroring
  if (style.usesEmoji) {
    parts.push("User uses emojis. You may use them sparingly.");
  } else {
    parts.push("User doesn't use emojis. Do not use any.");
  }

  // Energy matching
  if (style.energy === "high") {
    parts.push("User has high energy. Match it with enthusiasm.");
  } else if (style.energy === "low") {
    parts.push("User is low energy. Be calm and measured.");
  }

  // Identity model insights
  if (memory?.identityModel?.communication_dna) {
    const dna = memory.identityModel.communication_dna;
    if (dna.responds_well_to) parts.push(`They respond well to: ${dna.responds_well_to}`);
    if (dna.responds_poorly_to) parts.push(`Avoid: ${dna.responds_poorly_to}`);
  }

  return parts.length > 0 ? `\nTONE CALIBRATION:\n${parts.join("\n")}` : "";
}

// ── Context Assembly ─────────────────────────────────────────

function buildContextBlock(ctx: HirafuContext, nowIso: string): string {
  const parts: string[] = [];

  parts.push(`Current time: ${nowIso}`);
  parts.push(`Timezone: ${ctx.timezoneHolder.tz}`);

  if (ctx.user.display_name) {
    parts.push(`User: ${ctx.user.display_name}`);
  }
  if (ctx.user.email) {
    parts.push(`Email: ${ctx.user.email}`);
  }

  if (ctx.connectedAccounts.length > 0) {
    const accts = ctx.connectedAccounts.map(a => `${a.provider}: ${a.email}`).join(", ");
    parts.push(`Connected accounts: ${accts}`);
  }

  if (ctx.memory?.summary) {
    parts.push(`\nMemory summary:\n${ctx.memory.summary}`);
  }

  if (ctx.memory?.openLoops && ctx.memory.openLoops.length > 0) {
    const loops = ctx.memory.openLoops
      .filter(l => l.status === "open")
      .slice(0, 5)
      .map(l => `- ${l.topic}: ${l.context}`)
      .join("\n");
    if (loops) parts.push(`\nOpen threads:\n${loops}`);
  }

  if (ctx.learnings.length > 0) {
    const learningText = ctx.learnings
      .slice(0, 15)
      .map(l => `- [${l.category}] ${l.content}`)
      .join("\n");
    parts.push(`\nKnown about user:\n${learningText}`);
  }

  if (ctx.activeCommitments.length > 0) {
    const commitText = ctx.activeCommitments
      .slice(0, 5)
      .map(c => `- ${c.content} (${c.target_date})`)
      .join("\n");
    parts.push(`\nUpcoming commitments:\n${commitText}`);
  }

  if (ctx.dailyBriefing) {
    parts.push(`\nToday's briefing:\n${ctx.dailyBriefing}`);
  }

  if (ctx.userProfile) {
    const profile = ctx.userProfile;
    const profileParts: string[] = [];
    if (profile.summary) profileParts.push(profile.summary);
    if (profile.professional?.current_role) profileParts.push(`Role: ${profile.professional.current_role}`);
    if (profile.professional?.company) profileParts.push(`Company: ${profile.professional.company}`);
    if (profileParts.length > 0) {
      parts.push(`\nUser profile:\n${profileParts.join("\n")}`);
    }
  }

  return parts.join("\n");
}

// ── Time Context ─────────────────────────────────────────────

function buildTimeContext(timezone: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const timeStr = now.toLocaleString("en-AU", options);
  const hour = parseInt(now.toLocaleString("en-AU", { timeZone: timezone, hour: "numeric", hour12: false }));

  let timeNote = "";
  if (hour >= 0 && hour < 6) timeNote = "It's very late/early. Be brief and considerate.";
  else if (hour >= 6 && hour < 9) timeNote = "Morning. Fresh energy.";
  else if (hour >= 17 && hour < 21) timeNote = "Evening. Winding down.";
  else if (hour >= 21) timeNote = "Late evening. Keep it chill.";

  return `Time: ${timeStr}${timeNote ? `. ${timeNote}` : ""}`;
}

// ── Main Entry Point ─────────────────────────────────────────

export async function handleMessage(
  message: string,
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
  ctx: HirafuContext,
  options?: {
    ragEvidence?: string;
    prefetchedEvidence?: string;
    onAck?: (text: string) => void;
  },
): Promise<HirafuResponse> {
  const start = Date.now();
  const traceId = crypto.randomUUID();
  const nowIso = new Date().toLocaleString("sv-SE", { timeZone: ctx.timezoneHolder.tz }).replace(" ", "T");

  await logAuditEvent(ctx.supabase, ctx.userId, traceId, "message_received", { message: message.slice(0, 100) });

  // Reaction (no API)
  const reaction = decideReaction(message);

  // Style analysis
  const style = analyseUserStyle(recentChat);
  const toneDirective = buildToneDirective(style, ctx.memory);

  // Build system prompt
  const contextBlock = buildContextBlock(ctx, nowIso);
  const timeContext = buildTimeContext(ctx.timezoneHolder.tz);
  const evidenceBlock = options?.ragEvidence || options?.prefetchedEvidence || "";

  const systemPrompt = [
    HIRAFU_IDENTITY_CORE,
    IMESSAGE_RULES,
    toneDirective,
    `\n${timeContext}`,
    `\n<context>\n${contextBlock}\n</context>`,
    evidenceBlock ? `\n<evidence>\n${evidenceBlock}\n</evidence>` : "",
  ].filter(Boolean).join("\n");

  // Build conversation history
  const lastAssistant = [...recentChat].reverse().find(m => m.role === "assistant");
  const lastAssistantContent = lastAssistant?.content ?? null;

  // Fast route
  const quickRoute = tryFastRoute(message, lastAssistantContent, systemPrompt);

  let route: RoutingResult;
  if (quickRoute) {
    route = quickRoute;
    console.log(`[hirafu-personality] Fast route: ${route.path}`);
  } else {
    route = await routeMessage(message, systemPrompt);
    console.log(`[hirafu-personality] LLM route: ${route.path} (${route.model})`);
  }

  // Ack for agent path
  let ackText: string | undefined;
  if (route.path === "agent" && !route.skipAck && options?.onAck) {
    ackText = generateAck(message);
    options.onAck(ackText);
  }

  // Build messages for LLM
  const historyMessages = buildConversationMessages(recentChat, contextBlock, systemPrompt);

  // Add ack to history if sent
  if (ackText) {
    historyMessages.push({ role: "assistant", content: ackText });
  }

  historyMessages.push({ role: "user", content: message });

  const truncated = truncateHistory(historyMessages);

  // Build tool executor
  const toolExecutor = (name: string, args: Record<string, unknown>) =>
    executeHirafuTool(name, args, {
      userId: ctx.userId,
      supabase: ctx.supabase,
      traceId,
      userTimezone: ctx.timezoneHolder.tz,
      onTimezoneChange: (tz) => ctx.timezoneHolder.update(tz),
      userScopes: ctx.connectedAccounts.flatMap(a => a.scopes),
      turnToolCounts: new Map(),
    });

  // Execute route
  const result = await executeRoute(route, truncated, ctx.userId, ctx.supabase, traceId, toolExecutor);

  // Format for iMessage
  const formattedText = formatForIMessage(result.text);

  // Self-learning (fire-and-forget)
  extractLearnings(message, ctx.userId, ctx.supabase).catch(e =>
    console.error("[hirafu-personality] Learning extraction failed:", (e as Error).message)
  );

  await logAuditEvent(ctx.supabase, ctx.userId, traceId, "response_sent", {
    path: route.path,
    model: route.model,
    latencyMs: Date.now() - start,
  });

  return {
    text: formattedText,
    toolsUsed: [],
    latencyMs: Date.now() - start,
    path: route.path,
    pendingActions: result.pendingActions,
    reaction,
    ackText,
    _trace: result._agentTrace,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function buildConversationMessages(
  recentChat: Array<{ role: string; content: string }>,
  contextBlock: string,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of recentChat) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  return messages;
}

function generateAck(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("email") || lower.includes("inbox")) return "Checking your inbox";
  if (lower.includes("calendar") || lower.includes("schedule") || lower.includes("meeting")) return "Looking at your calendar";
  if (lower.includes("weather")) return "Checking the weather";
  if (lower.includes("remind")) return "Setting that up";
  if (lower.includes("search") || lower.includes("find") || lower.includes("look up")) return "On it";
  return "One sec";
}

function formatForIMessage(text: string): string {
  if (!text) return "";

  let formatted = text
    .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/—/g, ",")
    .replace(/–/g, "-");

  // Ensure sentence case on each line (skip lines with bold markers)
  formatted = formatted
    .split("\n")
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "---" || trimmed.startsWith("-") || trimmed.startsWith("**")) return trimmed;
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    })
    .join("\n");

  return formatted;
}
