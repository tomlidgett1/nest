// Personality Agent v3 — iMessage interface layer for Nest.
//
// KEY CHANGE: Tool execution goes directly through tools.ts executeTool()
// instead of Supabase RPC stubs. This eliminates the intermediate
// database function layer and gives us:
//   - Direct Google API calls (faster, fewer hops)
//   - Consistent error handling from tools.ts
//   - All 10 fixes from tools-v3 (timeouts, retries, async indexing, etc.)
//   - New tools: get_email, document_search, create_note, weather_lookup,
//     get_meeting_detail, contacts_manage, send_email

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  routeMessage,
  tryFastRoute,
  executeRoute,
  truncateHistory,
  decideReaction,
  detectPrefetch,
  callOpenAI,
  MODELS,
  type NestUser,
  type RoutingResult,
  type RoutePath,
  type PrefetchTask,
  type RouteResult,
  type PendingAction,
  type ReactionType,
  type OpenAILogContext,
} from "./orchestrator.ts";
import { executeTool } from "./tools.ts";
import { TimezoneHolder } from "./timezone-resolver.ts";
import { embedLearning } from "./conversation-embedder.ts";

// ── Types ────────────────────────────────────────────────────

export interface NestContext {
  userId: string;
  user: NestUser;
  supabase: SupabaseClient;
  memory?: {
    summary: string;
    writingStyle: string | null;
    preferences: Record<string, unknown>;
    openLoops?: Array<{
      topic: string;
      firstMentioned: string;
      lastMentioned: string;
      status: "open" | "resolved" | "stale";
      context: string;
    }>;
    emotionalArc?: string | null;
    relationshipNotes?: string | null;
    keyMoments?: Array<{
      moment: string;
      when: string;
      emotional_tone: string;
      callback_potential: string;
    }>;
    identityModel?: IdentityModel | null;
  } | null;
  evidence?: string;
  emailStyle?: string;
  pdlWelcomeContext?: string;
  userProfile?: Record<string, unknown> | null;
  /** True when the rich profile just became available and the conversation is still young */
  profileIsNew?: boolean;
  /** QA dashboard only — nudges the model to produce a distinct variant */
  _qa_variation?: string;
  /** Persistent learnings from v2_user_learnings */
  learnings?: Array<{
    category: string;
    content: string;
    confidence: number;
    timesReinforced: number;
    emotionalWeight: string;
  }> | null;
  /** Pre-computed daily situational briefing */
  dailyBriefing?: string | null;
  /** Active time-bound commitments (next 7 days) */
  activeCommitments?: Array<{
    content: string;
    targetDate: string;
    expiresAfter: string | null;
    context: string | null;
  }> | null;
  /** Meeting notes pitch status: not_pitched | pitched | accepted | declined */
  recallPitchStatus?: string | null;
  /** Number of today's calendar events that have video meeting links */
  videoMeetingCount?: number | null;
  /** Mutable timezone holder — allows update_user_timezone to take effect mid-request */
  timezoneHolder?: TimezoneHolder;
  /** True when user is messaging 1:1 for the first time after interacting in a group chat */
  groupTransition?: boolean;
}

// ── Identity Model Type ──────────────────────────────────────

export interface IdentityModel {
  personality_patterns?: string[];
  emotional_triggers?: {
    stress_signals?: string[];
    excitement_signals?: string[];
    comfort_signals?: string[];
  };
  communication_dna?: {
    wants_from_nest?: string;
    responds_well_to?: string;
    responds_poorly_to?: string;
    decision_style?: string;
  };
  life_themes?: string[];
  anticipation_patterns?: Array<{
    trigger: string;
    likely_need: string;
    confidence: number;
  }>;
}

export interface NestResponse {
  text: string;
  toolsUsed: string[];
  latencyMs: number;
  path: string;
  pendingActions: PendingAction[];
  reaction: ReactionType;
  ackText?: string | null;
  _trace?: Record<string, unknown>;
}

// ── Message Tags ─────────────────────────────────────────────

type MessageSource = "user" | "trigger" | "context" | "summary_of_conversation";

function tag(source: MessageSource, content: string, sentAt?: string): string {
  const ts = sentAt ?? new Date().toISOString();
  return `<${source} sentAt="${ts}">${content}</${source}>`;
}

// ══════════════════════════════════════════════════════════════
// STYLE MIRRORING ENGINE — 3 layers, zero API calls
// ══════════════════════════════════════════════════════════════

interface StyleSignals {
  avgLength: number;
  maxLength: number;
  lengthBucket: "terse" | "short" | "medium" | "long";
  isLowercase: boolean;
  hasPunctuation: boolean;
  emojiDensity: "none" | "light" | "heavy";
  usesAbbreviations: boolean;
  formality: "casual" | "neutral" | "formal";
  questionStyle: "fragment" | "full";
  energy: "low" | "medium" | "high";
  responseLines: number;
  // Emotion / sentiment signals (Layer 1b)
  sentiment: "frustrated" | "stressed" | "dismissive" | "excited" | "warm" | "neutral" | "uncertain";
  sentimentShift: "declining" | "stable" | "improving";
  urgency: "none" | "mild" | "high";
  engagementTrend: "growing" | "stable" | "shrinking";
}

interface RhythmSignals {
  isRapidFire: boolean;
  isFollowUp: boolean;
  conversationDepth: "shallow" | "medium" | "deep";
  userTurnCount: number;
}

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;
const ABBREV_RE = /\b(u|ur|ur|gonna|wanna|gotta|idk|imo|tbh|ngl|rn|atm|pls|plz|thx|bc|cuz|w\/|b4)\b/i;

function analyseUserStyle(
  currentMessage: string,
  recentChat: Array<{ role: string; content: string }>,
): StyleSignals {
  const userMessages = recentChat
    .filter((m) => m.role === "user")
    .map((m) => m.content.replace(/<[^>]+>/g, "").trim())
    .slice(-5);
  userMessages.push(currentMessage);

  const lengths = userMessages.map((m) => m.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const maxLength = Math.max(...lengths);

  let lengthBucket: StyleSignals["lengthBucket"];
  if (avgLength < 15) lengthBucket = "terse";
  else if (avgLength < 40) lengthBucket = "short";
  else if (avgLength < 100) lengthBucket = "medium";
  else lengthBucket = "long";

  const allText = userMessages.join(" ");
  const alphaChars = allText.replace(/[^a-zA-Z]/g, "");
  const lowerCount = (alphaChars.match(/[a-z]/g) ?? []).length;
  const upperCount = (alphaChars.match(/[A-Z]/g) ?? []).length;
  const isLowercase = alphaChars.length > 0 && lowerCount / alphaChars.length > 0.85;

  const hasPunctuation = userMessages.some((m) => /[.!?;]$/.test(m.trim()));

  const emojiCount = (allText.match(EMOJI_RE) ?? []).length;
  let emojiDensity: StyleSignals["emojiDensity"] = "none";
  if (emojiCount > 3) emojiDensity = "heavy";
  else if (emojiCount > 0) emojiDensity = "light";

  const usesAbbreviations = ABBREV_RE.test(allText);

  let formality: StyleSignals["formality"] = "neutral";
  if (usesAbbreviations || (isLowercase && !hasPunctuation)) formality = "casual";
  else if (!isLowercase && hasPunctuation && avgLength > 60) formality = "formal";

  const lastMsg = currentMessage.trim();
  const questionStyle: StyleSignals["questionStyle"] =
    lastMsg.includes("?") && lastMsg.split(/\s+/).length < 6 ? "fragment" : "full";

  const exclamations = (allText.match(/!/g) ?? []).length;
  const caps = (allText.match(/[A-Z]{2,}/g) ?? []).length;
  let energy: StyleSignals["energy"] = "medium";
  if (exclamations > 2 || caps > 1) energy = "high";
  else if (avgLength < 20 && !hasPunctuation) energy = "low";

  let responseLines: number;
  if (lengthBucket === "terse") responseLines = 2;
  else if (lengthBucket === "short") responseLines = 3;
  else if (lengthBucket === "medium") responseLines = 5;
  else responseLines = 7;

  // ── Sentiment detection ──
  const currentLower = currentMessage.toLowerCase();

  const FRUSTRATED_SIGNALS = /\b(ugh|ffs|wtf|annoying|annoyed|frustrated|useless|broken|wrong|still not|doesn't work|didn't work|can't believe|sick of|tired of|over it|for fuck'?s? sake)\b/i;
  const STRESSED_SIGNALS = /\b(asap|urgent|deadline|running late|need this now|freaking out|stressed|overwhelmed|swamped|drowning|behind|crunch|pressure)\b/i;
  const DISMISSIVE_SIGNALS = /\b(whatever|idc|don't care|doesn't matter|nvm|nevermind|never mind|forget it|fine|meh|sure whatever)\b/i;
  const EXCITED_SIGNALS = /\b(amazing|awesome|incredible|love it|perfect|yes!|hell yeah|brilliant|fantastic|so good|can't wait|excited|stoked|pumped|let's go)\b|!{2,}/i;
  const WARM_SIGNALS = /\b(appreciate|thank|grateful|means a lot|you're the best|legend|lifesaver|love you|mate you're|champion|star)\b/i;
  const UNCERTAIN_SIGNALS = /\b(maybe|not sure|idk|i don't know|i guess|possibly|might|hmm+|umm+|uh+|dunno|reckon\??)\b/i;
  const URGENCY_SIGNALS = /\b(asap|urgent|now|immediately|right now|need this|quickly|hurry|rush|time-sensitive|deadline)\b/i;

  let sentiment: StyleSignals["sentiment"] = "neutral";
  if (FRUSTRATED_SIGNALS.test(currentLower)) sentiment = "frustrated";
  else if (STRESSED_SIGNALS.test(currentLower)) sentiment = "stressed";
  else if (DISMISSIVE_SIGNALS.test(currentLower)) sentiment = "dismissive";
  else if (EXCITED_SIGNALS.test(currentLower)) sentiment = "excited";
  else if (WARM_SIGNALS.test(currentLower)) sentiment = "warm";
  else if (UNCERTAIN_SIGNALS.test(currentLower)) sentiment = "uncertain";

  // Sentiment shift: track across last 3 user messages
  const recentUserTexts = userMessages.slice(-3).map(m => m.toLowerCase());
  const sentimentScore = (text: string): number => {
    if (FRUSTRATED_SIGNALS.test(text) || STRESSED_SIGNALS.test(text) || DISMISSIVE_SIGNALS.test(text)) return -1;
    if (EXCITED_SIGNALS.test(text) || WARM_SIGNALS.test(text)) return 1;
    return 0;
  };
  const scores = recentUserTexts.map(sentimentScore);
  let sentimentShift: StyleSignals["sentimentShift"] = "stable";
  if (scores.length >= 2) {
    const trend = scores[scores.length - 1] - scores[0];
    if (trend <= -1) sentimentShift = "declining";
    else if (trend >= 1) sentimentShift = "improving";
  }

  // Urgency
  let urgency: StyleSignals["urgency"] = "none";
  if (URGENCY_SIGNALS.test(currentLower)) urgency = "high";
  else if (/\b(soon|when you can|today|this afternoon|this morning)\b/i.test(currentLower)) urgency = "mild";

  // Engagement trend: are messages getting longer or shorter?
  let engagementTrend: StyleSignals["engagementTrend"] = "stable";
  if (lengths.length >= 3) {
    const firstHalf = lengths.slice(0, Math.floor(lengths.length / 2));
    const secondHalf = lengths.slice(Math.floor(lengths.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (avgSecond > avgFirst * 1.4) engagementTrend = "growing";
    else if (avgSecond < avgFirst * 0.6) engagementTrend = "shrinking";
  }

  return {
    avgLength, maxLength, lengthBucket,
    isLowercase, hasPunctuation, emojiDensity,
    usesAbbreviations, formality, questionStyle,
    energy, responseLines,
    sentiment, sentimentShift, urgency, engagementTrend,
  };
}

function analyseConversationRhythm(
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
): RhythmSignals {
  const last6 = recentChat.slice(-6);
  const userTurns = last6.filter((m) => m.role === "user");
  const assistantTurns = last6.filter((m) => m.role === "assistant");

  // Rapid-fire: 3+ consecutive short user messages
  let consecutiveShort = 0;
  for (let i = last6.length - 1; i >= 0; i--) {
    if (last6[i].role === "user" && last6[i].content.length < 30) consecutiveShort++;
    else break;
  }
  const isRapidFire = consecutiveShort >= 2;

  // Follow-up: user's message is short and comes right after an assistant message
  const isFollowUp = last6.length >= 2 &&
    last6[last6.length - 1].role === "user" &&
    last6[last6.length - 2].role === "assistant" &&
    last6[last6.length - 1].content.length < 40;

  let conversationDepth: RhythmSignals["conversationDepth"] = "shallow";
  if (userTurns.length >= 4) conversationDepth = "deep";
  else if (userTurns.length >= 2) conversationDepth = "medium";

  return {
    isRapidFire,
    isFollowUp,
    conversationDepth,
    userTurnCount: userTurns.length,
  };
}

function buildTimeGapBlock(
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
): string | null {
  const lastMsg = [...recentChat].reverse().find((m) => m.created_at);
  if (!lastMsg?.created_at) return null;

  const lastTime = new Date(lastMsg.created_at).getTime();
  const now = Date.now();
  const gapMinutes = Math.floor((now - lastTime) / 60_000);

  // Under 30 min = normal conversation flow, no gap block needed
  if (gapMinutes < 30) return null;

  // Format gap description
  let gapDescription: string;
  if (gapMinutes < 60) {
    gapDescription = `${gapMinutes} minutes`;
  } else if (gapMinutes < 1440) {
    const hours = Math.floor(gapMinutes / 60);
    gapDescription = `${hours} hour${hours > 1 ? "s" : ""}`;
  } else {
    const days = Math.floor(gapMinutes / 1440);
    gapDescription = `${days} day${days > 1 ? "s" : ""}`;
  }

  // Analyse what the last conversation was about for context-aware tone
  const lastUserMsgs = recentChat.filter(m => m.role === "user").slice(-2);
  const lastAssistantMsg = [...recentChat].reverse().find(m => m.role === "assistant");
  const lastUserContext = lastUserMsgs.map(m => m.content).join(" ").toLowerCase();
  const lastAssistantContent = lastAssistantMsg?.content?.toLowerCase() ?? "";

  // Detect last conversation mood
  const wasStressful = /\b(ugh|frustrated|stressed|deadline|urgent|asap|overwhelmed|annoyed|shit|fuck|terrible|awful)\b/.test(lastUserContext);
  const wasTaskCompletion = /\b(sent|booked|done|saved|created|deleted|confirmed|set|drafted)\b/.test(lastAssistantContent)
    || lastAssistantContent.includes("pending_action");
  const wasCasualBanter = !wasStressful && !wasTaskCompletion
    && lastUserContext.length < 50 && !/\b(meeting|email|calendar|schedule|inbox|draft)\b/.test(lastUserContext);

  // Build tone based on gap tier + last conversation context
  let tone: string;

  if (gapMinutes < 120) {
    // 30min - 2hr: small gap
    tone = "Small gap. Don't make a big deal of it. If this is a greeting, a casual 'hey' is fine. If it's a question, just answer it naturally without acknowledging the gap.";
  } else if (gapMinutes < 480) {
    // 2hr - 8hr: medium gap
    if (wasStressful) {
      tone = "They were dealing with something stressful earlier. Be warm, not cheeky. A subtle check-in is nice if this is a greeting ('hey, how'd it go?'), but don't force it if they're asking something new.";
    } else if (wasTaskCompletion) {
      tone = "You completed a task for them last time. Don't acknowledge the gap, just respond to their new message naturally.";
    } else if (wasCasualBanter) {
      tone = "You were having a casual chat earlier. Light acknowledgment is fine if it's a greeting ('back for more?'), but don't overdo it.";
    } else {
      tone = "Medium gap. If it's a greeting, a warm 'hey' with personality is good. If it's a question, just answer naturally.";
    }
  } else if (gapMinutes < 1440) {
    // 8hr - 24hr: long gap (probably overnight or a full work day)
    if (wasStressful) {
      tone = "It's been a while and they were stressed last time. Be genuinely warm. 'Hey, hope things calmed down' energy if it's a greeting. Don't mock or tease.";
    } else {
      tone = "New session energy. Be warm and natural. If it's a greeting, treat it like the start of a new conversation, not a continuation. Light personality, no dramatic 'where have you been'.";
    }
  } else {
    // 24hr+: extended gap
    if (wasStressful) {
      tone = "They've been gone a while and the last conversation was heavy. Be genuinely warm. 'Good to hear from you' energy. Don't mock the absence.";
    } else {
      tone = "Extended gap. Genuine warmth. You're happy to hear from them. A light joke about the absence is fine if the vibe was good last time, but keep it warm not dramatic. 'Hey stranger' is better than 'oh look who remembered I exist'.";
    }
  }

  return `── TIME GAP ──\nLast message was ${gapDescription} ago.\n${tone}`;
}

/**
 * Build a context block with the current local time-of-day and day-of-week
 * so the model can adjust tone appropriately (e.g. no work talk on weekends).
 */
function buildTimeContextBlock(tz: string, currentLocation?: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric", minute: "numeric", weekday: "long",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  const hour = parseInt(get("hour"), 10) % 24;
  const weekday = get("weekday");
  const isWeekend = weekday === "Saturday" || weekday === "Sunday";

  let timeOfDay: string;
  if (hour < 6) timeOfDay = "very early morning (before 6am)";
  else if (hour < 9) timeOfDay = "early morning";
  else if (hour < 12) timeOfDay = "morning";
  else if (hour < 14) timeOfDay = "around lunchtime";
  else if (hour < 17) timeOfDay = "afternoon";
  else if (hour < 20) timeOfDay = "evening";
  else if (hour < 23) timeOfDay = "late evening";
  else timeOfDay = "late night";

  const locationSuffix = currentLocation ? ` in ${currentLocation}` : "";
  const lines = [`── TIME & LOCATION CONTEXT ──`, `It's ${weekday} ${timeOfDay} for the user${locationSuffix}.`];
  if (currentLocation) {
    lines.push(`The user is currently in ${currentLocation}. Use this for any location-dependent reasoning (weather, nearby places, travel times, transit).`);
  }

  if (isWeekend) {
    lines.push("WEEKEND RULES: This is their time off. NEVER reference work, meetings, deadlines, or professional topics unless they bring it up first. Keep it relaxed. Reference hobbies, plans, rest, sport, social life, or just be warm and chill.");
  }

  if (hour < 9) {
    lines.push("EARLY MORNING RULES: They're just starting their day. Be warm, not intense. Don't hit them with tasks or productivity. A gentle, friendly energy. Think 'good morning' vibes, not 'let's get to work'.");
  } else if (hour >= 22) {
    lines.push("LATE NIGHT RULES: They're winding down. Be mellow, relaxed. Don't bring up stressful topics unless they do.");
  }

  if (isWeekend && hour < 9) {
    lines.push("SATURDAY/SUNDAY MORNING: The most sacred time. Be especially warm and laid-back. Something nice to wake up to. No work. No stress. Think: 'morning, big plans today or just vibing?'");
  }

  return lines.join("\n");
}

function buildRecentlyReferencedBlock(
  recentChat: Array<{ role: string; content: string }>,
  userProfile: Record<string, unknown> | null | undefined,
): string | null {
  if (!userProfile) return null;

  const assistantMessages = recentChat
    .filter((m) => m.role === "assistant")
    .slice(-8)
    .map((m) => m.content.toLowerCase());

  if (assistantMessages.length === 0) return null;

  const allText = assistantMessages.join(" ");

  const profileKeywords = extractProfileKeywords(userProfile);
  const mentioned = profileKeywords.filter((kw) => allText.includes(kw.toLowerCase()));

  if (mentioned.length === 0) return null;

  return `── RECENTLY REFERENCED (avoid repeating these) ──\nYou've already mentioned these in recent messages: ${mentioned.join(", ")}\nDon't bring these up again unless the user specifically asks about them. Only reference profile facts when they're naturally relevant to the current topic, not to fill silence or show off.`;
}

function estimateProfileTokens(profile: Record<string, unknown> | null | undefined): number {
  if (!profile) return 0;
  const text = JSON.stringify(profile);
  return Math.round(text.length / 4);
}

function extractProfileKeywords(profile: Record<string, unknown>): string[] {
  const keywords: string[] = [];
  const p = profile as Record<string, any>;

  if (p.professional) {
    if (p.professional.company) keywords.push(p.professional.company);
    if (p.professional.title) keywords.push(p.professional.title);
  }

  if (p.communication) {
    const comm = p.communication;
    if (comm.email_themes) {
      for (const theme of comm.email_themes.slice(0, 6)) {
        const words = theme.split(/[\s,/]+/).filter((w: string) => w.length > 3);
        keywords.push(...words.slice(0, 2));
      }
    }
    if (comm.top_contacts) {
      for (const c of comm.top_contacts.slice(0, 5)) {
        if (c.name) keywords.push(c.name.split(" ")[0]);
      }
    }
    if (comm.industry_jargon) keywords.push(...comm.industry_jargon.slice(0, 5));
  }

  if (p.life) {
    if (p.life.hobbies) keywords.push(...p.life.hobbies.slice(0, 5));
    if (p.life.travel) keywords.push(...p.life.travel.slice(0, 3));
  }

  if (p.schedule) {
    if (p.schedule.recurring_meetings) {
      for (const m of p.schedule.recurring_meetings.slice(0, 3)) {
        keywords.push(...m.split(/[\s,]+/).filter((w: string) => w.length > 3).slice(0, 2));
      }
    }
  }

  if (p.personality) {
    if (p.personality.frustrations) keywords.push(...p.personality.frustrations.slice(0, 3));
  }

  if (p.interests) keywords.push(...p.interests.slice(0, 5));

  return [...new Set(keywords.filter((k) => k && k.length > 2))];
}

// ── Correction Context ──────────────────────────────────────
// Scans recent chat for correction patterns (user correcting Nest).
// If found, injects a context block so the model is more careful
// with ambiguous references for the rest of the session.

function buildCorrectionContextBlock(
  recentChat: Array<{ role: string; content: string }>,
): string | null {
  const corrections: string[] = [];

  for (let i = 1; i < recentChat.length; i++) {
    const msg = recentChat[i];
    if (msg.role !== "user") continue;

    const lower = msg.content.toLowerCase();
    const prevAssistant = recentChat[i - 1];
    if (prevAssistant?.role !== "assistant") continue;

    // Detect correction patterns
    const isCorrection = /\b(no[, ]+(?:the other|i meant|not that|wrong)|i meant|actually[, ]+(?:i|the)|that'?s not|nah[, ]+(?:the|i)|wrong one|not (?:that|this) one)\b/i.test(lower);
    if (!isCorrection) continue;

    corrections.push(
      `You said: "${prevAssistant.content.slice(0, 80)}..." → They corrected: "${msg.content.slice(0, 100)}"`,
    );
  }

  if (corrections.length === 0) return null;

  return `── CORRECTIONS THIS SESSION ──\nThe user has corrected you ${corrections.length} time(s) in this conversation:\n${corrections.slice(-3).join("\n")}\nBe more careful with ambiguous references. State your assumption briefly before acting ("I'm guessing you mean X, shout if not").`;
}

// ── Meeting Notes Pitch ──────────────────────────────────────
// Injects a subtle pitch context when the user has a meeting-heavy
// calendar but hasn't been offered meeting notes yet.
// Only fires when:
//   1. recall_pitch_status === "not_pitched"
//   2. User has 3+ video meetings today (Zoom/Meet/Teams)
//   3. Current message touches on meetings/calendar
// The agent weaves the suggestion naturally into conversation.

const MEETING_TOPIC_PATTERNS = [
  /\b(?:meeting|meetings|call|calls|sync|standup|stand-?up|1:1|one.on.one)\b/i,
  /\b(?:calendar|schedule|agenda|diary)\b/i,
  /\b(?:zoom|google meet|teams|webex)\b/i,
  /\b(?:what(?:'s| do i have) (?:on )?(?:today|tomorrow|this week))\b/i,
];

function buildMeetingNotesPitchBlock(
  message: string,
  ctx: NestContext,
): string | null {
  // Only pitch if status is "not_pitched" (never re-pitch after decline or accept)
  const pitchStatus = ctx.recallPitchStatus ?? ctx.memory?.recallPitchStatus ?? "not_pitched";
  if (pitchStatus !== "not_pitched") return null;

  // Check if user has a meeting-heavy profile (from rich profile or video count override)
  const videoCount = ctx.videoMeetingCount ?? 0;
  const profile = ctx.userProfile as Record<string, any> | null;
  const meetingLoad = profile?.schedule?.meeting_frequency?.toLowerCase() ?? "";
  const hasMeetingHeavyProfile = meetingLoad.includes("high") || meetingLoad.includes("frequent")
    || meetingLoad.includes("many") || meetingLoad.includes("packed")
    || (profile?.schedule?.recurring_meetings?.length ?? 0) >= 3;

  // Need evidence of a meeting-heavy calendar (either exact count or profile signal)
  if (videoCount < 3 && !hasMeetingHeavyProfile) return null;

  // Only inject when the conversation touches on meetings/calendar
  const touchesMeetings = MEETING_TOPIC_PATTERNS.some(p => p.test(message));
  if (!touchesMeetings) return null;

  const countNote = videoCount > 0
    ? `${videoCount} video calls today`
    : "a meeting-heavy calendar";

  return `── MEETING NOTES OPPORTUNITY ──
This user has ${countNote}. They haven't been told about meeting notes yet.
When the conversation naturally touches on meetings or their calendar, casually suggest:
"btw, want me to start taking notes in your meetings? I can join your calls, take notes, and send you a summary after."
Do NOT lead with this. Only weave it in when the moment feels right — after answering their actual question first.
If they agree, use the connect_meeting_notes tool.
If they decline or say "no thanks", call manage_meeting_recording with action "decline_pitch" so they won't be asked again.
NEVER mention "Recall.ai" or any third-party service. You take the notes yourself.`;
}

// ══════════════════════════════════════════════════════════════
// SELF-LEARNING ENGINE — real-time detection + context injection
// ══════════════════════════════════════════════════════════════

// ── Real-time explicit learning detection (regex, zero LLM cost) ──

interface DetectedLearning {
  category: "preference" | "correction" | "fact" | "dislike" | "contact_note";
  content: string;
  context: string;
  source: "explicit" | "correction";
  confidence: number;
  emotionalWeight: "high" | "medium" | "low";
}

function detectExplicitLearning(
  message: string,
  prevAssistantMsg: string | null,
): DetectedLearning[] {
  const learnings: DetectedLearning[] = [];
  const lower = message.toLowerCase();

  // PREFERENCES: "I prefer X", "can you always X", "from now on X"
  const prefPatterns = [
    /\bi (?:always |usually )?prefer (?:it when you |you to |to )?(.+)/i,
    /\bcan you (?:always|from now on) (.+)/i,
    /\b(?:always|from now on|going forward)[, ]+(?:just |please )?(.+)/i,
    /\bi like (?:it )?(?:when you|if you) (.+)/i,
  ];
  for (const re of prefPatterns) {
    const m = message.match(re);
    if (m) {
      learnings.push({
        category: "preference",
        content: m[0].trim(),
        context: prevAssistantMsg ? `After Nest said: "${prevAssistantMsg.slice(0, 100)}"` : "",
        source: "explicit",
        confidence: 0.85,
        emotionalWeight: "medium",
      });
      break; // one preference match per message
    }
  }

  // DISLIKES: "don't call me X", "stop doing X", "I hate when you X"
  const dislikePatterns = [
    /\b(?:don'?t|do not|stop|quit|never) (?:call(?:ing)? me|say(?:ing)?|do(?:ing)?) (.+)/i,
    /\bi (?:hate|can'?t stand|don'?t like) (?:it )?when you (.+)/i,
  ];
  for (const re of dislikePatterns) {
    const m = message.match(re);
    if (m) {
      learnings.push({
        category: "dislike",
        content: m[0].trim(),
        context: prevAssistantMsg ? `After Nest said: "${prevAssistantMsg.slice(0, 100)}"` : "",
        source: "explicit",
        confidence: 0.9,
        emotionalWeight: "high",
      });
      break;
    }
  }

  // FACTS: "my X is Y", "I live in X"
  const factPatterns = [
    /\bmy (?:dog|cat|pet|partner|wife|husband|girlfriend|boyfriend|kid|son|daughter|mum|mom|dad|brother|sister|baby)(?:'?s? name)? is (.+)/i,
    /\bi (?:live|moved|just moved) (?:in|to) (.+)/i,
  ];
  for (const re of factPatterns) {
    const m = message.match(re);
    if (m && m[0].length > 10 && m[0].length < 120) {
      learnings.push({
        category: "fact",
        content: m[0].trim(),
        context: "",
        source: "explicit",
        confidence: 0.85,
        emotionalWeight: "medium",
      });
      break;
    }
  }

  // CORRECTIONS (persistent): "no I meant X", "not X, Y"
  const correctionPatterns = [
    /\bno[, ]+(?:i meant|the other|not that|wrong) (.+)/i,
    /\bi meant (.+)/i,
    /\bactually[, ]+(?:it'?s|i|the) (.+)/i,
  ];
  for (const re of correctionPatterns) {
    const m = message.match(re);
    if (m) {
      learnings.push({
        category: "correction",
        content: m[0].trim(),
        context: prevAssistantMsg ? `Correcting Nest: "${prevAssistantMsg.slice(0, 120)}"` : "",
        source: "correction",
        confidence: 0.9,
        emotionalWeight: "high",
      });
      break;
    }
  }

  // CONTACT NOTES: "X is my boss", "X has been Y lately"
  const contactPatterns = [
    /\b(\w+) is my (boss|manager|friend|partner|wife|husband|colleague|coworker|mentor|coach|assistant|therapist|accountant|lawyer)\b/i,
    /\b(\w+) (?:has been|is being|is) (?:really |so )?(difficult|annoying|great|amazing|helpful|useless|frustrating|supportive)\b/i,
  ];
  for (const re of contactPatterns) {
    const m = message.match(re);
    if (m) {
      learnings.push({
        category: "contact_note",
        content: m[0].trim(),
        context: "",
        source: "explicit",
        confidence: 0.8,
        emotionalWeight: "medium",
      });
      break;
    }
  }

  return learnings;
}

// ── Save learnings to DB (fire-and-forget) ──

async function saveLearnings(
  userId: string,
  learnings: DetectedLearning[],
  supabase: SupabaseClient,
): Promise<void> {
  for (const l of learnings) {
    try {
      // Check for similar existing learning to reinforce
      const { data: existing } = await supabase
        .from("v2_user_learnings")
        .select("id, times_reinforced, confidence")
        .eq("user_id", userId)
        .eq("category", l.category)
        .eq("active", true)
        .ilike("content", `%${l.content.slice(0, 40)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error: updateErr } = await supabase
          .from("v2_user_learnings")
          .update({
            times_reinforced: existing.times_reinforced + 1,
            confidence: Math.min(existing.confidence + 0.05, 1.0),
            last_observed_at: new Date().toISOString(),
            context: l.context || undefined,
          })
          .eq("id", existing.id);
        if (updateErr) console.error(`[learning] Reinforce failed:`, updateErr.message, updateErr.details);
        else {
          console.log(`[learning] Reinforced: ${l.category} — "${l.content.slice(0, 60)}"`);
          embedLearning(supabase, userId, existing.id, l.category, l.content, l.context || null).catch(() => {});
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase.from("v2_user_learnings").insert({
          user_id: userId,
          category: l.category,
          content: l.content,
          context: l.context || null,
          emotional_weight: l.emotionalWeight,
          confidence: l.confidence,
          source: l.source,
        }).select("id").single();
        if (insertErr) console.error(`[learning] Insert failed:`, insertErr.message, insertErr.details, JSON.stringify(l));
        else {
          console.log(`[learning] New: ${l.category} — "${l.content.slice(0, 60)}"`);
          if (inserted?.id) {
            embedLearning(supabase, userId, inserted.id, l.category, l.content, l.context || null).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error(`[learning] Save exception for ${l.category}:`, (e as Error).message);
    }
  }
}

// ── Layer 1: Learned Knowledge Block ──

function buildLearnedKnowledgeBlock(
  learnings: NestContext["learnings"],
): string | null {
  if (!learnings || learnings.length === 0) return null;

  const sections: Record<string, string[]> = {};
  for (const l of learnings) {
    if (!sections[l.category]) sections[l.category] = [];
    const reinforced = l.timesReinforced > 2 ? ` [they've said this ${l.timesReinforced} times]` : "";
    sections[l.category].push(`- ${l.content}${reinforced}`);
  }

  const lines: string[] = ["── THINGS I'VE LEARNED ──"];
  lines.push("These are things I've picked up from our conversations. Use them naturally, never quote them back.");

  if (sections.dislike?.length) {
    lines.push("", "NEVER DO THESE:");
    lines.push(...sections.dislike.slice(0, 5));
  }
  if (sections.preference?.length) {
    lines.push("", "ALWAYS DO THESE:");
    lines.push(...sections.preference.slice(0, 8));
  }
  if (sections.correction?.length) {
    lines.push("", "PAST MISTAKES (don't repeat):");
    lines.push(...sections.correction.slice(0, 5));
  }
  if (sections.fact?.length) {
    lines.push("", "PERSONAL FACTS:");
    lines.push(...sections.fact.slice(0, 8));
  }
  if (sections.relationship?.length) {
    lines.push("", "KEY RELATIONSHIPS:");
    lines.push(...sections.relationship.slice(0, 8));
  }
  if (sections.contact_note?.length) {
    lines.push("", "PEOPLE IN THEIR LIFE:");
    lines.push(...sections.contact_note.slice(0, 5));
  }
  if (sections.location?.length) {
    lines.push("", "LOCATION CONTEXT:");
    lines.push(...sections.location.slice(0, 4));
  }
  if (sections.anticipation?.length) {
    lines.push("", "PATTERNS I'VE NOTICED:");
    lines.push(...sections.anticipation.slice(0, 4));
  }

  return lines.join("\n");
}

// ── Layer 2: Relationship Memory Block ──

function buildRelationshipBlock(
  relationshipNotes: string | null | undefined,
  keyMoments: Array<{ moment: string; emotional_tone: string; callback_potential: string }> | null | undefined,
): string | null {
  if (!relationshipNotes) return null;

  const lines = ["── OUR RELATIONSHIP ──"];
  lines.push(relationshipNotes);

  if (keyMoments && keyMoments.length > 0) {
    const highCallbacks = keyMoments
      .filter(m => m.callback_potential === "high" || m.callback_potential === "medium")
      .slice(0, 3);
    if (highCallbacks.length > 0) {
      lines.push("");
      lines.push("SHARED MOMENTS (use sparingly, only when naturally relevant):");
      for (const m of highCallbacks) {
        lines.push(`- ${m.moment} (they felt: ${m.emotional_tone})`);
      }
    }
  }

  lines.push("");
  lines.push("Use this to calibrate your tone. If trust is high, be more direct and personal. If they're still warming up, be helpful first, personal second. Never reference these notes explicitly.");

  return lines.join("\n");
}

// ── Situational Awareness Block ──

function buildSituationalBlock(
  dailyBriefing: string | null | undefined,
  activeCommitments: NestContext["activeCommitments"],
): string | null {
  if (!dailyBriefing && (!activeCommitments || activeCommitments.length === 0)) return null;

  const lines: string[] = ["── SITUATIONAL CONTEXT ── What's happening in their life right now:"];

  if (dailyBriefing) {
    lines.push("", dailyBriefing);
  }

  if (activeCommitments && activeCommitments.length > 0) {
    lines.push("", "Upcoming commitments they've told you about:");
    for (const c of activeCommitments) {
      const dateStr = c.targetDate;
      const contextStr = c.context ? `, mentioned ${c.context}` : "";
      lines.push(`- ${c.content} (${dateStr}${contextStr})`);
    }
  }

  lines.push("");
  lines.push("IMPORTANT: These commitments are things the user told you about in conversation. They are NOT in their calendar and are NOT calendar events.");
  lines.push("- For schedule questions, FIRST show calendar_lookup results (the live calendar data), THEN mention relevant commitments separately.");
  lines.push("- NEVER present commitments as calendar events. NEVER invent times, durations, or details for commitments that don't have them.");
  lines.push("- NEVER fabricate calendar event details (times, attendees, etc.) from commitments. If a commitment has no time, don't add one.");
  lines.push("- If calendar_lookup returns empty and you have commitments, say the calendar is clear but mention the commitment casually.");
  lines.push("- Don't recite the list. Be a friend who just... knows what's going on");

  return lines.join("\n");
}

// ── Layer 3: Identity Model Block ──

function buildIdentityBlock(
  identity: IdentityModel | null | undefined,
): string | null {
  if (!identity) return null;

  const lines: string[] = ["── WHO THEY ARE (your deep read) ──"];

  if (identity.personality_patterns && identity.personality_patterns.length > 0) {
    lines.push("PERSONALITY: " + identity.personality_patterns.join(". ") + ".");
  }

  if (identity.communication_dna) {
    const dna = identity.communication_dna;
    if (dna.wants_from_nest) lines.push(`WHAT THEY WANT FROM YOU: ${dna.wants_from_nest}`);
    if (dna.responds_well_to) lines.push(`WHAT WORKS: ${dna.responds_well_to}`);
    if (dna.responds_poorly_to) lines.push(`WHAT DOESN'T WORK: ${dna.responds_poorly_to}`);
    if (dna.decision_style) lines.push(`DECISIONS: ${dna.decision_style}`);
  }

  if (identity.emotional_triggers) {
    const t = identity.emotional_triggers;
    if (t.stress_signals && t.stress_signals.length > 0) {
      lines.push(`STRESS TELLS: ${t.stress_signals.join(", ")}`);
    }
    if (t.excitement_signals && t.excitement_signals.length > 0) {
      lines.push(`EXCITEMENT TELLS: ${t.excitement_signals.join(", ")}`);
    }
    if (t.comfort_signals && t.comfort_signals.length > 0) {
      lines.push(`COMFORT TELLS: ${t.comfort_signals.join(", ")}`);
    }
  }

  if (identity.life_themes && identity.life_themes.length > 0) {
    lines.push(`LIFE RIGHT NOW: ${identity.life_themes.join(". ")}.`);
  }

  if (identity.anticipation_patterns && identity.anticipation_patterns.length > 0) {
    const patterns = identity.anticipation_patterns
      .filter(p => p.confidence >= 0.6)
      .slice(0, 4);
    if (patterns.length > 0) {
      lines.push("ANTICIPATION (what they probably need based on patterns):");
      for (const p of patterns) {
        lines.push(`- ${p.trigger} → ${p.likely_need}`);
      }
    }
  }

  lines.push("");
  lines.push("This is your deep knowledge of them. Don't quote it. Don't reference it. Just let it shape every word you say. The way a best friend just KNOWS without having to explain how they know.");

  return lines.join("\n");
}

const QA_VARIATION_DIRECTIVES: Record<string, string> = {
  concise:
    "QA VARIATION (CONCISE): Keep your response as short as possible. Use the fewest words that still answer the question. One-liners preferred. Strip all filler.",
  detailed:
    "QA VARIATION (DETAILED): Give a thorough, well-structured response. Include context, reasoning, and specifics. Use multiple sentences or short paragraphs. Be comprehensive.",
  casual:
    "QA VARIATION (CASUAL): Be extra relaxed and conversational. Use slang, abbreviations, and a chatty tone. Think of texting a close mate. Keep it breezy.",
  formal:
    "QA VARIATION (FORMAL): Use proper grammar, complete sentences, and a professional tone. Be polished and precise. No slang or abbreviations.",
  playful:
    "QA VARIATION (PLAYFUL): Be witty, add personality, use humour where appropriate. Make the response memorable and fun. Light-hearted energy.",
};

function buildVariationDirective(variation: string): string {
  const directive = QA_VARIATION_DIRECTIVES[variation];
  if (!directive) return "";
  return `── ${directive}\nThis is a QA test: this directive OVERRIDES the style mirror for this response only. Produce a genuinely different response than you normally would.`;
}

// 0 = no humour, 1 = light warmth, 2 = normal personality, 3 = full banter
const HUMOUR_LEVEL_DIRECTIVES: Record<number, string> = {
  0: "HUMOUR: OFF. This is a practical/task request. No jokes, no jabs, no quips. Just deliver the answer with warm, natural phrasing. Personality comes through word choice, not comedy.",
  1: "HUMOUR: LIGHT. A touch of warmth and personality is fine, but no standalone jokes or jabs. Keep it efficient with a human feel.",
  2: "HUMOUR: NORMAL. Your usual personality. Witty phrasing, light callbacks, dry observations are all fine. Don't force it but don't hold back either.",
  3: "HUMOUR: FULL BANTER. The user is being playful, joking, or roasting you. Match their energy. Fire back. Be cheeky. This is the fun zone.",
};

function computeHumourLevel(style: StyleSignals, routePath: string, message: string): number {
  const lower = message.toLowerCase().trim();

  // Frustrated/stressed/urgent = no humour
  if (style.sentiment === "frustrated" || style.sentiment === "stressed" || style.urgency === "high") return 0;

  // Excited/playful user = full banter
  if (style.sentiment === "excited" || style.energy === "high") return 3;

  // Practical/task keywords = no humour
  const taskPatterns = /^(what'?s on|show me|summarise|summarize|send |draft |book |remind |set |cancel |delete |update |create |add |list |when'?s|how far|how long|look up|search |find )/i;
  if (taskPatterns.test(lower)) return 0;

  // Questions about data = no humour
  const dataPatterns = /\b(calendar|inbox|email|meeting|schedule|todo|reminder|flight|weather)\b/i;
  if (dataPatterns.test(lower) && lower.includes("?")) return 0;

  // Greetings and casual = normal personality
  if (routePath === "casual") return 2;

  // Short casual messages without task intent = normal
  if (lower.split(/\s+/).length <= 5 && !taskPatterns.test(lower)) return 2;

  // Default: light warmth
  return 1;
}

function buildStyleMirrorBlock(
  style: StyleSignals,
  rhythm: RhythmSignals,
  persistentStyle?: string | null,
  humourLevel?: number,
): string {
  const lines: string[] = [];
  lines.push("─── STYLE MIRROR (adapt your output to match) ───");
  lines.push("");

  // Length guidance
  if (style.lengthBucket === "terse") {
    lines.push("User writes VERY short messages (avg <15 chars). Keep responses to 1-2 lines. Be punchy. No fluff.");
  } else if (style.lengthBucket === "short") {
    lines.push("User writes short messages (avg <40 chars). Keep responses to 2-3 lines. Concise but complete.");
  } else if (style.lengthBucket === "medium") {
    lines.push("User writes medium-length messages. 3-5 lines is natural. Give enough detail without over-explaining.");
  } else {
    lines.push("User writes longer, detailed messages. 5-7 lines is fine. Match their depth and thoroughness.");
  }

  // Case and punctuation
  if (style.isLowercase && !style.hasPunctuation) {
    lines.push("User uses all lowercase, no punctuation. You still use sentence case, but skip periods.");
  } else if (style.isLowercase) {
    lines.push("User uses lowercase but includes some punctuation. You still use sentence case with light punctuation.");
  } else if (!style.hasPunctuation) {
    lines.push("User skips punctuation. Keep yours minimal too.");
  }

  // Emoji
  if (style.emojiDensity === "heavy") {
    lines.push("User uses emoji freely. You can use occasional emoji too.");
  } else if (style.emojiDensity === "none") {
    lines.push("User doesn't use emoji. Don't use any.");
  }

  // Formality
  if (style.formality === "casual") {
    lines.push("User is very casual (abbreviations, slang). Match: relaxed, informal, text-speak OK.");
  } else if (style.formality === "formal") {
    lines.push("User is more formal (proper sentences, full punctuation). Match: polished but still warm.");
  }

  // Energy
  if (style.energy === "high") {
    lines.push("User has high energy right now. Match it, be enthusiastic, exclamation marks OK.");
  } else if (style.energy === "low") {
    lines.push("User is low-key right now. Keep it chill, understated.");
  }

  // Rhythm overrides
  if (rhythm.isRapidFire) {
    lines.push("RAPID-FIRE MODE: User is sending quick successive messages. Respond with 1-2 short lines max. Don't over-explain.");
  }
  if (rhythm.isFollowUp) {
    lines.push("This is a follow-up to your previous response. Be brief, they already have context.");
  }

  // ── Sentiment / emotion guidance ──
  lines.push("");
  lines.push("─── EMOTIONAL READ ───");

  if (style.sentiment === "frustrated") {
    lines.push("USER MOOD: Frustrated. They're annoyed about something. Be direct and efficient, no jokes. Acknowledge the friction briefly ('yeah that's annoying') then solve the problem. Don't be overly sympathetic or patronising.");
  } else if (style.sentiment === "stressed") {
    lines.push("USER MOOD: Stressed/under pressure. They need speed and clarity, not banter. Get to the point fast. If you can take something off their plate, do it. Don't add questions that create more work for them.");
  } else if (style.sentiment === "dismissive") {
    lines.push("USER MOOD: Dismissive or disengaged. They might be losing interest or brushing something off. Keep it brief, don't push. If they said 'whatever' or 'fine', accept it and move on without trying to re-engage or ask if they're sure.");
  } else if (style.sentiment === "excited") {
    lines.push("USER MOOD: Excited or enthusiastic. Match their energy. It's okay to be a bit more expressive here. Share their buzz briefly, then deliver what they need.");
  } else if (style.sentiment === "warm") {
    lines.push("USER MOOD: Warm and appreciative. They're in a good place with you. Be genuine back, not over-the-top. A simple warm acknowledgment lands better than gushing.");
  } else if (style.sentiment === "uncertain") {
    lines.push("USER MOOD: Uncertain or hesitant. They're not sure about something. Be reassuring without being patronising. If you can make a confident recommendation, do it, they need someone to be decisive right now.");
  }

  if (style.sentimentShift === "declining") {
    lines.push("TREND: User mood is declining across recent messages. They may be getting frustrated with results or the conversation. Be extra efficient, cut the fluff, and prioritise solving their problem.");
  } else if (style.sentimentShift === "improving") {
    lines.push("TREND: User mood is improving. Whatever you're doing is working. Stay the course.");
  }

  if (style.urgency === "high") {
    lines.push("URGENCY: High. They need this NOW. Skip pleasantries, skip personality, just deliver. Speed > charm.");
  } else if (style.urgency === "mild") {
    lines.push("URGENCY: Mild time pressure. Be efficient but don't feel rushed. Normal warmth is fine.");
  }

  if (style.engagementTrend === "shrinking") {
    lines.push("ENGAGEMENT: Messages getting shorter. They may be losing interest, getting impatient, or multitasking. Keep responses tight and focused. Don't try to re-engage with questions or callbacks.");
  } else if (style.engagementTrend === "growing") {
    lines.push("ENGAGEMENT: Messages getting longer. They're leaning in. You can match their depth and give more detailed responses.");
  }

  // ── Humour level directive ──
  if (humourLevel !== undefined) {
    lines.push("");
    lines.push("─── HUMOUR LEVEL ───");
    lines.push(HUMOUR_LEVEL_DIRECTIVES[humourLevel] ?? HUMOUR_LEVEL_DIRECTIVES[1]);
  }

  // Persistent baseline (Layer 3)
  if (persistentStyle) {
    lines.push("");
    lines.push(`Baseline style profile: ${persistentStyle}`);
  }

  // Max response lines (concrete cap)
  let maxLines = style.responseLines;
  if (rhythm.isRapidFire) maxLines = Math.min(maxLines, 2);
  if (rhythm.isFollowUp) maxLines = Math.min(maxLines, 3);
  if (style.urgency === "high") maxLines = Math.min(maxLines, 3);
  if (style.sentiment === "frustrated" || style.sentiment === "stressed") maxLines = Math.min(maxLines, 4);
  lines.push("");
  lines.push(`Target response length: ${maxLines} lines (unless showing structured data like calendar/inbox).`);

  return lines.join("\n");
}

// ── Unified Tone Directive ───────────────────────────────────
// Merges style mirror + corrections + urgency signals into a single
// compact block. Placed BEFORE mode-specific instructions in the prompt
// assembly so tool dispatch rules get the recency-advantage attention.

function buildToneDirective(
  style: StyleSignals,
  rhythm: RhythmSignals,
  persistentStyle: string | null | undefined,
  humourLevel: number,
  ctx: NestContext,
  recentChat: Array<{ role: string; content: string }>,
): string {
  // Start with the style mirror (length, formality, energy, emotion, humour)
  const styleMirror = buildStyleMirrorBlock(style, rhythm, persistentStyle ?? null, humourLevel);

  // Merge corrections if any
  const correctionContext = buildCorrectionContextBlock(recentChat);
  if (correctionContext) {
    return styleMirror + "\n\n" + correctionContext;
  }

  return styleMirror;
}

// ── Conversation History Builder ─────────────────────────────

// With 70 raw messages loaded, we need a larger budget to keep the full
// conversation window available alongside injected context blocks.
const HISTORY_TOKEN_BUDGET = 30_000;

function buildConversationHistory(
  currentMessage: string,
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
  ctx: NestContext,
  needsProfile = true,
): Array<{ role: string; content: string }> {
  // Use user's local time for sentAt tags so the model sees the correct date
  const userTz = ctx.user.timezone || "UTC";
  const now = new Date().toLocaleString("sv-SE", { timeZone: userTz }).replace(" ", "T");
  const messages: Array<{ role: string; content: string }> = [];

  // ── Merged context injection ──────────────────────────────────
  // All context blocks merged into a SINGLE user/assistant turn pair.
  // Every query gets full context — identity, learnings, profile — because
  // even "simple" questions can require reasoning about the user's life.

  const contextSections: string[] = [];

  const identityBlock = buildIdentityBlock(ctx.memory?.identityModel);
  if (identityBlock) {
    contextSections.push(identityBlock);
  }

  if (ctx.memory?.summary) {
    let mem = `CONVERSATION SUMMARY:\n${ctx.memory.summary}`;
    if (ctx.memory.emotionalArc) {
      mem += `\n\nEmotional arc: ${ctx.memory.emotionalArc}`;
    }
    if (ctx.memory.writingStyle) {
      mem += `\n\nWriting style: ${ctx.memory.writingStyle}`;
    }
    contextSections.push(mem);
  }

  if (ctx.memory?.openLoops && ctx.memory.openLoops.length > 0) {
    const activeLoops = ctx.memory.openLoops
      .filter(l => l.status === "open")
      .slice(0, 5);

    if (activeLoops.length > 0) {
      const loopText = activeLoops
        .map(l => `- "${l.topic}" (${l.context})`)
        .join("\n");
      contextSections.push(`OPEN THREADS (reference naturally when relevant, max 1 per conversation, never force it):\n${loopText}`);
    }
  }

  const learnedBlock = buildLearnedKnowledgeBlock(ctx.learnings);
  if (learnedBlock) {
    contextSections.push(learnedBlock);
  }

  const relationshipBlock = buildRelationshipBlock(
    ctx.memory?.relationshipNotes,
    ctx.memory?.keyMoments,
  );
  if (relationshipBlock) {
    contextSections.push(relationshipBlock);
  }

  const situationalBlock = buildSituationalBlock(ctx.dailyBriefing, ctx.activeCommitments);
  if (situationalBlock) {
    contextSections.push(situationalBlock);
  }

  const meetingPitchBlock = buildMeetingNotesPitchBlock(currentMessage, ctx);
  if (meetingPitchBlock) {
    contextSections.push(meetingPitchBlock);
  }

  // User context
  const userParts: string[] = [];
  if (ctx.user.name) userParts.push(`Name: ${ctx.user.name}`);
  if (ctx.user.email) userParts.push(`Email: ${ctx.user.email}`);
  if (ctx.user.phone) userParts.push(`Phone: ${ctx.user.phone}`);
  if (ctx.user.connectedAccounts && ctx.user.connectedAccounts.length > 0) {
    const googleAccts = ctx.user.connectedAccounts.filter(a => a.provider !== "microsoft");
    const msAccts = ctx.user.connectedAccounts.filter(a => a.provider === "microsoft");
    const parts: string[] = [];
    if (googleAccts.length > 0) {
      parts.push(`Google: ${googleAccts.map(a => `${a.email}${a.isPrimary ? " (primary)" : ""}`).join(", ")}`);
    }
    if (msAccts.length > 0) {
      parts.push(`Microsoft: ${msAccts.map(a => `${a.email}${a.isPrimary ? " (primary)" : ""}`).join(", ")}`);
    }
    if (parts.length > 0) {
      userParts.push(`Connected accounts: ${parts.join(" | ")}`);
    }
  }
  if (ctx.memory?.preferences && Object.keys(ctx.memory.preferences).length > 0) {
    userParts.push(`Preferences: ${JSON.stringify(ctx.memory.preferences)}`);
  }
  if (userParts.length > 0) {
    contextSections.push(userParts.join("\n"));
  }

  // User profile (rich profile from email/calendar/web scanning)
  if (needsProfile && ctx.userProfile) {
    const p = ctx.userProfile as Record<string, any>;
    const profileParts: string[] = [];

    if (p.summary) profileParts.push(`SUMMARY: ${p.summary}`);

    if (ctx.user.currentLocation) {
      profileParts.push(`CURRENT LOCATION: ${ctx.user.currentLocation}`);
    }
    if (p.identity) {
      const id = p.identity;
      if (id.location && id.location !== ctx.user.currentLocation) {
        profileParts.push(`HOME BASE: ${id.location}`);
      }
    }
    if (ctx.user.timezone && ctx.user.timezone !== "UTC") {
      profileParts.push(`TIMEZONE: ${ctx.user.timezone}`);
    }

    if (p.professional) {
      const pro = p.professional;
      const parts = [pro.title, pro.company, pro.industry].filter(Boolean);
      if (parts.length > 0) profileParts.push(`ROLE: ${parts.join(" at ")}`);
      if (pro.headline) profileParts.push(`HEADLINE: ${pro.headline}`);
      if (pro.company_description) profileParts.push(`COMPANY: ${pro.company_description}`);
      if (pro.previous_roles?.length > 0) {
        profileParts.push(`CAREER: ${pro.previous_roles.map((r: any) => `${r.title} at ${r.company}`).join(", ")}`);
      }
    }

    if (p.communication) {
      const comm = p.communication;
      if (comm.email_themes?.length > 0) profileParts.push(`WORK TOPICS: ${comm.email_themes.join(", ")}`);
      if (comm.top_contacts?.length > 0) {
        profileParts.push(`KEY PEOPLE: ${comm.top_contacts.slice(0, 8).map((c: any) => `${c.name}${c.relationship && c.relationship !== "unknown" ? ` (${c.relationship})` : ""}`).join(", ")}`);
      }
      if (comm.writing_style) profileParts.push(`THEIR WRITING STYLE: ${comm.writing_style}`);
      if (comm.tone_markers?.length > 0) profileParts.push(`HOW THEY TALK: ${comm.tone_markers.join(", ")}`);
      if (comm.industry_jargon?.length > 0) profileParts.push(`THEIR JARGON: ${comm.industry_jargon.join(", ")}`);
    }

    if (p.personality) {
      const pers = p.personality;
      if (pers.frustrations?.length > 0) profileParts.push(`FRUSTRATIONS: ${pers.frustrations.join(", ")}`);
      if (pers.preferences?.length > 0) profileParts.push(`PREFERENCES: ${pers.preferences.join(", ")}`);
      if (pers.values?.length > 0) profileParts.push(`VALUES: ${pers.values.join(", ")}`);
      if (pers.communication_style) profileParts.push(`PERSONALITY: ${pers.communication_style}`);
      if (pers.decision_making) profileParts.push(`DECISIONS: ${pers.decision_making}`);
    }

    if (p.schedule) {
      const sched = p.schedule;
      if (sched.meeting_frequency) profileParts.push(`MEETING LOAD: ${sched.meeting_frequency}`);
      if (sched.recurring_meetings?.length > 0) {
        profileParts.push(`RECURRING: ${sched.recurring_meetings.slice(0, 5).join(", ")}`);
      }
      if (sched.typical_day_shape) profileParts.push(`TYPICAL DAY: ${sched.typical_day_shape}`);
    }

    if (p.life) {
      const life = p.life;
      if (life.hobbies?.length > 0) profileParts.push(`HOBBIES: ${life.hobbies.join(", ")}`);
      if (life.travel?.length > 0) profileParts.push(`TRAVEL: ${life.travel.join(", ")}`);
      if (life.upcoming_events?.length > 0) profileParts.push(`UPCOMING: ${life.upcoming_events.join(", ")}`);
      if (life.personal_commitments?.length > 0) profileParts.push(`PERSONAL: ${life.personal_commitments.join(", ")}`);
    }

    if (p.interests?.length > 0) profileParts.push(`INTERESTS: ${p.interests.join(", ")}`);

    if (profileParts.length > 0) {
      contextSections.push(`USER PROFILE (use naturally when relevant, don't force callbacks):\n${profileParts.join("\n")}`);
    }
  }

  if (needsProfile && ctx.profileIsNew && ctx.userProfile) {
    contextSections.push(`PROFILE JUST LOADED: Subtly show you've been paying attention. Drop 1-2 specific hints per response. Make them think "wait, how does it know that?" Be cheeky, not creepy.`);
  }

  if (needsProfile && ctx.pdlWelcomeContext?.trim() && !ctx.userProfile) {
    contextSections.push(`FIRST MESSAGE INTEL REVEAL: Answer their question first, then casually weave in ONE detail from this profile. Cheeky, not creepy. Don't dump their CV.\n\nPROFILE INTEL:\n${ctx.pdlWelcomeContext}`);
  }

  // Group-to-private chat transition (one-time acknowledgment)
  if (ctx.groupTransition) {
    contextSections.push(
      `GROUP TO PRIVATE TRANSITION: This user previously interacted with you in a group chat. ` +
      `This is their first private conversation. Acknowledge it once, naturally: ` +
      `"good call sliding into the DMs, way more I can do when it's just us" or similar. ` +
      `Don't explain what's different. Just show them by being more personal and capable. ` +
      `One-time acknowledgment only, then move on to whatever they need.`,
    );
  }

  // Inject context directly into the first user message as a tagged block.
  // This replaces the old fake user/assistant turn pairs which wasted ~200 tokens
  // and distorted attention patterns. Context is now prepended as a system-tagged
  // block that the model sees as grounding data, not conversational history.
  let contextPrefix = "";
  if (contextSections.length > 0) {
    contextPrefix += tag("context", contextSections.join("\n\n───\n\n"), now) + "\n\n";
  }
  if (ctx.evidence?.trim()) {
    const isEmpty = ctx.evidence.includes("DATA RETRIEVAL RESULT: EMPTY");
    contextPrefix += tag("context", isEmpty ? ctx.evidence : `Pre-fetched evidence:\n${ctx.evidence}`, now) + "\n\n";
  }

  // Chat history
  const chat = recentChat.map((m) => {
    const ts = m.created_at ?? now;
    if (m.role === "user") return { role: "user", content: tag("user", m.content, ts) };
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    if (m.role === "system") return { role: "user", content: tag("trigger", m.content, ts) };
    return { role: m.role, content: m.content };
  });

  // Deduplicate trailing message
  while (
    chat.length > 0 &&
    chat[chat.length - 1].role === "user" &&
    chat[chat.length - 1].content.includes(currentMessage)
  ) {
    chat.pop();
  }

  // Merge consecutive same-role
  for (const m of chat) {
    if (messages.length > 0 && messages[messages.length - 1].role === m.role) {
      messages[messages.length - 1].content += "\n\n" + m.content;
    } else {
      messages.push({ ...m });
    }
  }

  // Current message (with context prefix prepended if available)
  const userContent = contextPrefix
    ? contextPrefix + tag("user", currentMessage, now)
    : tag("user", currentMessage, now);
  messages.push({ role: "user", content: userContent });

  // Truncate
  return truncateHistory(messages, HISTORY_TOKEN_BUDGET);
}

// ── Prefetch Executor ────────────────────────────────────────

async function executePrefetch(
  tasks: PrefetchTask[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<string> {
  if (tasks.length === 0) return "";

  const PREFETCH_TIMEOUT_MS = 5_000;

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      const start = Date.now();
      try {
        const result = await Promise.race([
          executeToolFn(task.tool, task.args),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("prefetch timeout")), PREFETCH_TIMEOUT_MS),
          ),
        ]);
        console.log(`[prefetch] ${task.tool}: ${Date.now() - start}ms`);
        return `[${task.tool}]\n${result}`;
      } catch (e) {
        console.warn(`[prefetch] ${task.tool} failed: ${(e as Error).message}`);
        return null;
      }
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter(Boolean)
    .join("\n\n");
}

// ── Tool Execution ───────────────────────────────────────────
// REWIRED: All tools go through tools.ts executeTool() directly.
// No more Supabase RPC stubs. No more inline person_lookup/web_search.
//
// This is the entire tool execution layer — 3 lines.

function buildToolExecutor(ctx: NestContext) {
  const tzHolder = ctx.timezoneHolder;
  return (name: string, args: Record<string, unknown>): Promise<string> => {
    if (name === "weather_lookup" && !args.location && ctx.user.currentLocation) {
      args.location = ctx.user.currentLocation;
    }
    return executeTool(
      name, args, ctx.userId, ctx.supabase,
      tzHolder ? tzHolder.tz : ctx.user.timezone,
      tzHolder ? (newTz: string) => tzHolder.update(newTz) : undefined,
    );
  };
}

// ── Output Formatter ─────────────────────────────────────────

function reformatFlatCalendarList(text: string): string {
  const nestMatch = text.match(/<nest-content>([\s\S]*?)<\/nest-content>/);
  if (!nestMatch) return text;

  const nestContent = nestMatch[1];
  const lines = nestContent.split("\n").map(l => l.trimEnd());

  // Detect flat calendar list: 4+ lines starting with "March N" or "March N,"
  const dateLinePattern = /^March \d{1,2}[,:\s]/;
  const dateLines = lines.filter(l => dateLinePattern.test(l.replace(/^\*\*/, "")));
  if (dateLines.length < 4) return text;

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Extract the heading (first bold line)
  const headingMatch = nestContent.match(/\*\*([^*]+)\*\*/);
  const heading = headingMatch ? `**${headingMatch[1]}**` : "";

  // Parse events into day buckets
  const spanningEvents: string[] = [];
  const dayBuckets = new Map<string, string[]>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("**")) continue;

    // Spanning event: "March 2–8: ..." or "March 2-8: ..."
    const spanMatch = trimmed.match(/^March (\d{1,2})[–\-]\d{1,2}[,:]\s*(.+)/);
    if (spanMatch) {
      const dayNum = parseInt(spanMatch[1]);
      const title = spanMatch[2].trim();
      const date = new Date(2026, 2, dayNum);
      const dayName = DAYS[date.getDay()];
      const endMatch = trimmed.match(/^March \d{1,2}[–\-](\d{1,2})/);
      const endNum = endMatch ? parseInt(endMatch[1]) : dayNum;
      const endDate = new Date(2026, 2, endNum);
      const endDayName = DAYS[endDate.getDay()];
      spanningEvents.push(`${title} (${dayName}–${endDayName}, all day)`);
      continue;
    }

    // All-day event: "March 3: Birthday (all day)" or "March 8: International Women's Day"
    const allDayMatch = trimmed.match(/^March (\d{1,2})[,:]\s*(.+)/);
    if (allDayMatch && !trimmed.match(/\d{1,2}:\d{2}\s*[ap]m/i)) {
      const dayNum = parseInt(allDayMatch[1]);
      const title = allDayMatch[2].replace(/\s*\(all day\)/i, "").trim();
      const date = new Date(2026, 2, dayNum);
      const dayKey = `${dayNum}`;
      if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, []);
      dayBuckets.get(dayKey)!.push(title + (allDayMatch[2].includes("all day") ? " (all day)" : ""));
      continue;
    }

    // Timed event: "March 4, 8:30 am–9:30 am: Chat about Japan trip" or "March 4, 8:30 am: ..."
    const timedMatch = trimmed.match(/^March (\d{1,2}),?\s*(\d{1,2}:\d{2}\s*[ap]m)(?:[–\-]\d{1,2}:\d{2}\s*[ap]m)?[,:]\s*(.+)/i);
    if (timedMatch) {
      const dayNum = parseInt(timedMatch[1]);
      const time = timedMatch[2].trim();
      const title = timedMatch[3].trim();
      const dayKey = `${dayNum}`;
      if (!dayBuckets.has(dayKey)) dayBuckets.set(dayKey, []);
      dayBuckets.get(dayKey)!.push(`${time} — ${title}`);
      continue;
    }
  }

  // Build grouped output
  let result = heading ? `${heading}\n` : "";

  if (spanningEvents.length > 0) {
    result += "\n" + spanningEvents.join("\n") + "\n";
  }

  const sortedDays = [...dayBuckets.keys()].sort((a, b) => parseInt(a) - parseInt(b));
  for (const dayKey of sortedDays) {
    const dayNum = parseInt(dayKey);
    const date = new Date(2026, 2, dayNum);
    const dayName = DAYS[date.getDay()];
    const events = dayBuckets.get(dayKey)!;
    result += `\n**${dayName} ${dayNum}**\n`;
    for (const event of events) {
      result += `${event}\n`;
    }
  }

  const newNestContent = `<nest-content>\n${result.trim()}\n</nest-content>`;
  return text.replace(/<nest-content>[\s\S]*?<\/nest-content>/, newNestContent);
}

function formatForIMessage(raw: string): string {
  let text = raw
    .trim()
    .replace(/<\/?assistant[^>]*>/g, "")
    .replace(/<pending_action>[\s\S]*?<\/pending_action>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +([,.\?!;:])/g, "$1")  // "sure , tom" → "sure, tom"
    .replace(/\u2014/g, "-")           // em dash → hyphen
    .replace(/\u2013/g, "-")           // en dash → hyphen
    .trim();

  text = reformatFlatCalendarList(text);
  return text;
}

function enforceRealtimeDiscipline(userMessage: string, text: string, userTimezone?: string): string {
  const isDirectRealtimeQuery =
    /\b(next|now|latest|soonest)\b/i.test(userMessage) &&
    /\b(train|bus|tram|flight|departure|depart|arrive|time|schedule|weather|rain|rainy|forecast)\b/i.test(userMessage);

  const isTimeFollowUp =
    /\b(earlier|sooner|later|before that|after that|anything else|other options?)\b/i.test(userMessage) &&
    /\b(train|bus|tram|flight|depart|leaves|arrives|shinkansen|connection)\b/i.test(text);

  const isRealtimeQuery = isDirectRealtimeQuery || isTimeFollowUp;
  if (!isRealtimeQuery) return text;

  // Preserve <nest-content> blocks as atomic units — never split or filter their lines
  const nestMatch = text.match(/<nest-content>([\s\S]*?)<\/nest-content>/);
  const nestBlock = nestMatch ? nestMatch[0] : null;
  const textWithoutNest = nestBlock ? text.replace(nestBlock, "<<NEST_PLACEHOLDER>>") : text;

  const userExplicitTomorrowScope = /\b(tomorrow|tomorow|morning|tonight|this evening|this afternoon|this morning)\b/i.test(userMessage);
  const userAskedReminder = /\b(remind|reminder|alarm|water break|nudge)\b/i.test(userMessage);
  const lines = textWithoutNest.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0 && !nestBlock) return text;

  let userCurrentHour = -1;
  try {
    const tz = userTimezone || "UTC";
    const nowStr = new Date().toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    userCurrentHour = parseInt(nowStr, 10);
  } catch { /* fall back to keyword-only checks */ }

  function extractHour24(s: string): number | null {
    const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const ampm = m[3].toLowerCase();
    if (ampm === "am" && h === 12) h = 0;
    else if (ampm === "pm" && h !== 12) h += 12;
    return h;
  }

  const filtered = lines.filter((line) => {
    if (line === "<<NEST_PLACEHOLDER>>") return true;
    if (!userAskedReminder && /\b(remind|reminder|alarm|water|drink|nudge)\b/i.test(line)) return false;
    if (/\b(from now|tomorrow morning|planning for the morning)\b/i.test(line)) return false;
    if (
      /\btomorrow\b/i.test(line) &&
      !/\b(no more|none left|finished for today|after services resume|next available)\b/i.test(line)
    ) return false;

    if (!userExplicitTomorrowScope && userCurrentHour >= 0) {
      const mentionedHour = extractHour24(line);
      if (mentionedHour !== null && mentionedHour < userCurrentHour) {
        return false;
      }
    }

    return true;
  });

  // If we have a nest block, restore it and return the full response
  if (nestBlock) {
    const introLines = filtered.filter(l => l !== "<<NEST_PLACEHOLDER>>");
    const intro = introLines.slice(0, 2).join("\n");
    return intro ? `${intro}\n\n${nestBlock}` : nestBlock;
  }

  const joined = filtered.join("\n");
  if (!userExplicitTomorrowScope && /\b(tomorrow|tomorow|morning)\b/i.test(joined)) {
    return "Couldn't confirm a same-day next result from now, want me to re-check live?";
  }

  const concise = filtered.slice(0, 2);
  if (concise.length === 0) {
    return "Couldn't find a same-day result from now. Want me to check what's next?";
  }
  return concise.join("\n");
}

// ── Hallucination Guard ──────────────────────────────────────
// Post-generation check for common fabrication patterns.
// Strips hedged fabrications and flags suspicious content.

// Patterns that strongly suggest the model fabricated a detail
const HALLUCINATION_PHRASES = [
  /\bfrom memory\b/i,
  /\bif I recall\b/i,
  /\bif I remember\b/i,
  /\bI seem to recall\b/i,
  /\bI believe (?:it was|the|your|you had)\b/i,
  /\bI think (?:it was|the|your|you had|you're)\b/i,
  /\bfrom what I remember\b/i,
  /\bfrom what I recall\b/i,
  /\blast time I checked\b/i,
  /\bI'm pretty sure\b/i,
  /\bif I'm not mistaken\b/i,
  /\bI vaguely remember\b/i,
];

// Suspicious patterns: specific-looking data that might be fabricated
const SUSPICIOUS_PATTERNS = [
  // Fake booking refs (random alphanumeric that wasn't in tool results)
  /\b(?:ref|reference|confirmation|booking)[:\s#]*[A-Z0-9]{6,}\b/i,
  // Suspiciously specific prices without evidence
  /\$[\d,]+\.\d{2}/,
  // Fake flight numbers
  /\b[A-Z]{2}\d{3,4}\b/,
];

function applyHallucinationGuard(
  text: string,
  toolsUsed: string[],
  hasEvidence: boolean,
  toolResults?: Array<{ tool: string; args?: Record<string, unknown>; result: string; success: boolean }>,
  userMessage?: string,
): string {
  const isUnsourced = toolsUsed.length === 0 && !hasEvidence;

  let cleaned = text;

  // Strip lines that contain hedged fabrication phrases
  for (const pattern of HALLUCINATION_PHRASES) {
    if (pattern.test(cleaned)) {
      const lines = cleaned.split("\n");
      const filtered = lines.filter(line => !pattern.test(line));

      if (filtered.length === 0 || filtered.every(l => !l.trim())) {
        console.warn(`[hallucination-guard] Entire response matched fabrication pattern: ${pattern}`);
        return "I don't have that info right now. Want me to look it up?";
      }

      cleaned = filtered.join("\n");
      console.warn(`[hallucination-guard] Stripped line matching: ${pattern}`);
    }
  }

  // Log suspicious patterns (don't strip — could be legitimate from tool results)
  if (isUnsourced) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(cleaned)) {
        console.warn(`[hallucination-guard] Suspicious unsourced pattern in response: ${pattern}`);
      }
    }
  }

  // Entity-based fabrication check: if the user asked about a specific person/thing
  // and that entity doesn't appear in ANY tool results, but the model talks about
  // them confidently, that's fabrication.
  if (toolResults && toolResults.length > 0 && userMessage) {
    const entityMatch = userMessage.match(/(?:about|what's|whats|who is|who's|whos|tell me about|know about|find|search|look up)\s+(.{2,40}?)(?:\?|$|\.|\s+(?:in|on|from|at|for))/i);
    const nameMatch = userMessage.match(/(?:^|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:\s|$|\?|'s)/);
    const entity = (entityMatch?.[1] || nameMatch?.[1] || "").trim().toLowerCase();

    if (entity && entity.length >= 3) {
      const entityWords = entity.split(/\s+/).filter(w => w.length >= 3);

      // Check if the entity actually appears in any tool result
      const allResultsText = toolResults
        .filter(tr => tr.success)
        .map(tr => (tr.result || "").toLowerCase())
        .join(" ");

      const entityFoundInResults = entityWords.some(w => allResultsText.includes(w));

      if (!entityFoundInResults) {
        // The entity the user asked about is NOT in any tool results
        const confidentClaims = /\b(?:popped up|been cc'd|cc'd|mentioned in|involved in|shown up|been in the mix|tied to|linked to|connected to|flagged in|appeared in|part of|included in|ops chatter|in a few threads|in some emails|in your inbox|in recent|in the loop|on a few|in several|not showing up as|isn't listed|not listed)\b/i;
        if (confidentClaims.test(cleaned)) {
          const entityDisplay = entityWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          console.warn(`[hallucination-guard] Entity "${entity}" NOT found in any tool results but model claims involvement. Blocking.`);
          return `Drawing a blank on ${entityDisplay}, what are you referring to?`;
        }
      }
    }
  }

  return cleaned;
}

// ── Inline Ack (nano, fires in parallel with agent) ─────────

const TOOL_QUERY_SIGNALS = [
  "calendar", "schedule", "meeting", "agenda", "inbox", "email",
  "send", "draft", "compose", "forward", "reply",
  "search", "find", "look up", "dig up",
  "remind", "reminder", "todo", "to-do", "to do",
  "weather", "forecast", "rain", "temperature",
  "flight", "travel", "directions", "route", "bus", "train", "tram", "metro", "subway", "ferry", "transit", "transport", "station", "platform",
  "restaurant", "cafe", "hotel", "near me", "places",
  "forex", "currency", "exchange rate", "stock", "price",
  "summarise", "summarize", "summary",
  "book", "cancel", "reschedule",
  "note", "transcript",
];

function looksLikeToolQuery(message: string): boolean {
  const lower = message.toLowerCase();
  return TOOL_QUERY_SIGNALS.some(s => lower.includes(s));
}

const TESTING_INLINE_ACK_PROMPT = `You are Nest. Quick 1-line iMessage ack while you look something up. Max 10 words. Reference what they asked about. No emojis, no em dashes, no process narration ("scanning", "pulling up"). Capitalise first letter.`;

const ACK_SYSTEM_PROMPT = `You are Nest, a mate texting on iMessage. You're about to look something up. Write a quick 1-line hold message (max 10 words).

You have the conversation history. Your ack should sound like it comes from someone IN this conversation, not a generic hold message. Reference what they asked about or what you've been chatting about.

Never fabricate data. Never say "I can't". Never narrate process ("scanning", "pulling up", "searching"). No emojis, no em dashes. Capitalise first letter.`;

async function generateInlineAck(
  message: string,
  recentChat: Array<{ role: string; content: string }>,
  ctx: NestContext,
): Promise<string | null> {
  const lastFew = recentChat.slice(-20);

  const lastAssistant = [...recentChat].reverse().find(m => m.role === "assistant");
  const isFollowUp = lastAssistant && lastAssistant.content.length > 200;

  let systemPrompt = ctx.user.testing ? TESTING_INLINE_ACK_PROMPT : ACK_SYSTEM_PROMPT;
  if (isFollowUp) {
    systemPrompt += "\n\nThis is a FOLLOW-UP question to your previous detailed answer. Keep the ack very short and conversational. Do NOT re-state the topic.";
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of lastFew) {
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  messages.push({ role: "user", content: message });

  const t0 = Date.now();
  const logCtx: OpenAILogContext = {
    userId: ctx.userId,
    supabase: ctx.supabase,
    endpoint: "chat-ack",
    promptVariant: ctx.user.testing ? "testing" : "normal",
  };
  const resp = await callOpenAI("gpt-5-nano", messages, 60, null, logCtx);
  const raw = formatForIMessage(resp.content ?? "");
  let text = raw.split("\n")[0].trim();
  if (text.length > 0) text = text[0].toUpperCase() + text.slice(1);
  console.log(`[nest] Inline ack generated in ${Date.now() - t0}ms: "${text.slice(0, 80)}"`);
  return text || null;
}

// ── Public API ───────────────────────────────────────────────

export interface HandleMessageOptions {
  /** When provided, RAG runs in parallel with prefetch instead of before. */
  ragPromise?: Promise<string>;
  /** Called as soon as the nano ack is ready (agent path only). */
  onAck?: (ackText: string) => void;
}

export async function handleMessage(
  message: string,
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
  ctx: NestContext,
  options?: HandleMessageOptions,
): Promise<NestResponse> {
  const start = Date.now();
  const toolsUsed: string[] = [];

  // ── Debug trace collector ──
  const _toolCalls: Array<Record<string, unknown>> = [];
  const _prefetchCalls: Array<Record<string, unknown>> = [];

  // 1. Decide tapback reaction (deterministic, no API call)
  const reaction = decideReaction(message, recentChat);

  // 2. Tool executor (wired to tools.ts) — wrapped for trace capture
  const executeToolCall = buildToolExecutor(ctx);

  const logCtxBase: OpenAILogContext = {
    userId: ctx.userId,
    supabase: ctx.supabase,
    promptVariant: ctx.user.testing ? "testing" : "normal",
  };

  // 3. Two-phase routing: fast gates (sync) then nano router (async, parallel with prefetch)
  const fastRoute = tryFastRoute(message, ctx.user, recentChat);

  let routing: RoutingResult;
  let prefetchedEvidence = "";
  let ragEvidence = "";
  let ackText: string | null = null;
  let prefetchMs = 0;

  if (fastRoute) {
    // Fast gate matched — no nano call needed
    routing = fastRoute;

    // Static path — return immediately
    if (routing.path === "static") {
      return {
        text: routing.staticResponse ?? "",
        toolsUsed: [],
        latencyMs: Date.now() - start,
        path: "static",
        pendingActions: [],
        reaction,
        _trace: { routing: { path: "static", model: null } },
      };
    }

    // For non-static fast routes, run prefetch + rag + ack in parallel
    const ragPromise = options?.ragPromise?.catch(() => "") ?? Promise.resolve("");
    const shouldAck = routing.path === "agent" && options?.onAck && looksLikeToolQuery(message) && !routing.skipAck;
    const ackPromise = shouldAck
      ? generateInlineAck(message, recentChat, ctx).then(ack => {
          if (ack) options!.onAck!(ack);
          return ack;
        }).catch(e => { console.warn("[nest] Inline ack failed:", e); return null; })
      : Promise.resolve(null);

    const prefetchStart = Date.now();
    [prefetchedEvidence, ragEvidence, ackText] = await Promise.all([
      routing.prefetch
        ? executePrefetch(routing.prefetch, async (name, args) => {
            toolsUsed.push(`prefetch:${name}`);
            const tStart = Date.now();
            try {
              const result = await executeToolCall(name, args);
              _prefetchCalls.push({ tool: name, args, result_length: result.length, duration_ms: Date.now() - tStart, success: true });
              return result;
            } catch (e) {
              _prefetchCalls.push({ tool: name, args, error: (e as Error).message, duration_ms: Date.now() - tStart, success: false });
              throw e;
            }
          })
        : Promise.resolve(""),
      ragPromise,
      ackPromise,
    ]);
    prefetchMs = Date.now() - prefetchStart;
  } else {
    // No fast match — fire nano classification + speculative prefetch + rag + ack ALL in parallel
    const speculativePrefetchTasks = detectPrefetch(message);
    const ragPromise = options?.ragPromise?.catch(() => "") ?? Promise.resolve("");
    const shouldAck = options?.onAck && looksLikeToolQuery(message);
    const ackPromise = shouldAck
      ? generateInlineAck(message, recentChat, ctx).then(ack => {
          if (ack) options!.onAck!(ack);
          return ack;
        }).catch(e => { console.warn("[nest] Inline ack failed:", e); return null; })
      : Promise.resolve(null);

    const prefetchStart = Date.now();
    const [nanoRouting, specPrefetchResult, ragResult, ackResult] = await Promise.all([
      routeMessage(message, ctx.user, recentChat, logCtxBase),
      speculativePrefetchTasks.length > 0
        ? executePrefetch(speculativePrefetchTasks, async (name, args) => {
            toolsUsed.push(`prefetch:${name}`);
            const tStart = Date.now();
            try {
              const result = await executeToolCall(name, args);
              _prefetchCalls.push({ tool: name, args, result_length: result.length, duration_ms: Date.now() - tStart, success: true });
              return result;
            } catch (e) {
              _prefetchCalls.push({ tool: name, args, error: (e as Error).message, duration_ms: Date.now() - tStart, success: false });
              throw e;
            }
          })
        : Promise.resolve(""),
      ragPromise,
      ackPromise,
    ]);
    prefetchMs = Date.now() - prefetchStart;

    routing = nanoRouting;
    ragEvidence = ragResult;
    ackText = ackResult;

    // Only use speculative prefetch if routing actually needs it (not casual)
    if (routing.path === "agent" && specPrefetchResult) {
      prefetchedEvidence = specPrefetchResult;
      routing = { ...routing, prefetch: speculativePrefetchTasks.length > 0 ? speculativePrefetchTasks : undefined };
    } else if (specPrefetchResult) {
      console.log(`[personality-agent] Discarded speculative prefetch (${specPrefetchResult.length}c) — nano routed to ${routing.path}`);
    }
  }

  // Build conversation history
  const profileIncluded = routing.needsProfile ?? true;
  const conversationHistory = buildConversationHistory(message, recentChat, ctx, profileIncluded);
  if (!profileIncluded && ctx.userProfile) {
    console.log(`[personality-agent] Profile skipped — operational query (saved ~${estimateProfileTokens(ctx.userProfile)} tokens)`);
  }

  if (ragEvidence && ragEvidence.length > 0 && !ragEvidence.startsWith("[NO_RESULTS]")) {
    ctx.evidence = ragEvidence;
    console.log(`[nest] Proactive RAG injected: ${ragEvidence.length} chars`);
  }

  // 5. Real-time style analysis (Layer 1 + Layer 2, zero API calls)
  const style = analyseUserStyle(message, recentChat);
  const rhythm = analyseConversationRhythm(recentChat);
  const persistentStyle = ctx.memory?.writingStyle ?? null;
  const humourLevel = computeHumourLevel(style, routing.path, message);
  const styleMirror = buildStyleMirrorBlock(style, rhythm, persistentStyle, humourLevel);

  // 6. Build unified tone directive + append channel formatting + time context
  // ORDER: tone FIRST (so tool dispatch rules get recency advantage), then dynamic context.
  let fullSystemPrompt = routing.systemPrompt!;

  const toneDirective = buildToneDirective(style, rhythm, persistentStyle, humourLevel, ctx, recentChat);
  fullSystemPrompt += "\n\n" + toneDirective;

  // COST OPTIMISATION: Pick the right iMessage rules tier based on route path.
  // Casual/greeting/quick-exit → tiny voice-only (~30 tokens)
  // Light agent (subset tools) → slim with action formats (~350 tokens)
  // Full agent (all tools) → full rules with all data examples (~1,200 tokens)
  const isLightAgent = routing.path === "agent" && routing.tools && routing.tools.length < 10;
  const channelRules = routing.path === "casual"
    ? IMESSAGE_RULES_CASUAL
    : isLightAgent
      ? IMESSAGE_RULES_LIGHT
      : IMESSAGE_RULES;
  fullSystemPrompt += "\n\n" + channelRules;

  const timeContextBlock = buildTimeContextBlock(ctx.user.timezone, ctx.user.currentLocation);
  const timeGapBlock = buildTimeGapBlock(recentChat);
  const recentlyReferenced = buildRecentlyReferencedBlock(recentChat, ctx.userProfile);

  fullSystemPrompt += "\n\n" + timeContextBlock;

  if (timeGapBlock) {
    fullSystemPrompt += "\n\n" + timeGapBlock;
  }

  if (recentlyReferenced) {
    fullSystemPrompt += "\n\n" + recentlyReferenced;
  }

  if (ctx._qa_variation) {
    fullSystemPrompt += "\n\n" + buildVariationDirective(ctx._qa_variation);
  }

  const routingWithFormat: RoutingResult = { ...routing, systemPrompt: fullSystemPrompt };

  // If an ack was already sent to the user, inject it into the conversation
  // so the LLM knows it already acknowledged and won't duplicate it.
  const finalHistory = ackText
    ? [...conversationHistory, { role: "assistant", content: ackText }]
    : conversationHistory;

  // 7. Execute (with tool call tracing)
  let _toolRound = 0;
  const result: RouteResult = await executeRoute(
    routingWithFormat,
    finalHistory,
    async (name, args) => {
      toolsUsed.push(name);
      const tStart = Date.now();
      try {
        const result = await executeToolCall(name, args);
        _toolCalls.push({ tool: name, args, result: (result ?? "").slice(0, 8000), result_length: (result ?? "").length, duration_ms: Date.now() - tStart, success: true });
        return result;
      } catch (e) {
        _toolCalls.push({ tool: name, args, error: (e as Error).message, duration_ms: Date.now() - tStart, success: false });
        throw e;
      }
    },
    prefetchedEvidence || undefined,
    {
      userId: ctx.userId,
      supabase: ctx.supabase,
      promptVariant: ctx.user.testing ? "testing" : "normal",
    },
  );

  // 8. Format + hallucination guard
  const rawLlmResponse = result.text;
  const formatted = enforceRealtimeDiscipline(message, formatForIMessage(rawLlmResponse), ctx.user.timezone);
  const hasEvidence = !!(prefetchedEvidence || ragEvidence || ctx.evidence);
  const text = applyHallucinationGuard(formatted, toolsUsed, hasEvidence, _toolCalls, message);
  const latencyMs = Date.now() - start;

  console.log(
    `[nest] ${routing.path} | style=${style.lengthBucket}/${style.formality}/${style.energy} | mood=${style.sentiment}${style.sentimentShift !== "stable" ? `(${style.sentimentShift})` : ""} | humour=${humourLevel}${style.urgency !== "none" ? ` | urgency=${style.urgency}` : ""} | tools=[${toolsUsed.join(",")}] | ${latencyMs}ms | ${text.length} chars` +
    (result.pendingActions.length > 0 ? ` | pending=[${result.pendingActions.map(a => a.type).join(",")}]` : ""),
  );

  // 9. Self-learning: detect and persist explicit learnings (fire-and-forget)
  // Skip for group chats — don't learn from group conversations
  if (routing.path !== "static" && !ctx.user.isGroup) {
    const prevAssistant = recentChat.filter(m => m.role === "assistant").pop()?.content ?? null;
    const detected = detectExplicitLearning(message, prevAssistant);
    if (detected.length > 0) {
      saveLearnings(ctx.userId, detected, ctx.supabase).catch(e =>
        console.error("[learning] Background save failed:", (e as Error).message),
      );
    }
  }

  if (reaction) {
    console.log(`[nest] Tapback: ${reaction} (react-${text ? "and-reply" : "only"})`);
  }

  // ── Build debug trace ──
  const _trace: Record<string, unknown> = {
    routing: {
      path: routing.path,
      model: routing.model,
      output_model: routing.model ?? null,
      max_tokens: routing.maxTokens,
      has_tools: !!routing.tools,
      tool_count: routing.tools?.length ?? 0,
      prefetch_tasks: routing.prefetch?.map(p => ({ tool: p.tool, args: p.args })) ?? [],
      route_reason: routing._routeReason ?? null,
      nano_classification: routing._nanoClassification ?? null,
      used_fast_gate: !!fastRoute,
    },
    conversation_history: conversationHistory.map((m, i) => ({
      index: i,
      role: m.role,
      content_length: m.content.length,
      content_preview: m.content.slice(0, 300),
      content: m.content,
    })),
    system_prompt: fullSystemPrompt,
    system_prompt_length: fullSystemPrompt.length,
    style_analysis: {
      length_bucket: style.lengthBucket,
      formality: style.formality,
      energy: style.energy,
      emoji_density: style.emojiDensity,
      sentiment: style.sentiment,
      sentiment_shift: style.sentimentShift,
      urgency: style.urgency,
      engagement_trend: style.engagementTrend,
      humour_level: humourLevel,
      is_rapid_fire: rhythm.isRapidFire,
      is_follow_up: rhythm.isFollowUp,
      conversation_depth: rhythm.conversationDepth,
    },
    prefetch: {
      calls: _prefetchCalls,
      evidence_length: (prefetchedEvidence ?? "").length,
      duration_ms: prefetchMs,
    },
    rag: {
      ran: !!ragEvidence && ragEvidence.length > 0,
      evidence_length: (ragEvidence ?? "").length,
    },
    tool_calls: _toolCalls,
    ack: { generated: !!ackText, text: ackText ?? null },
    raw_llm_response: rawLlmResponse !== text ? rawLlmResponse : null,
    response: {
      text,
      text_length: text.length,
      reaction,
      pending_actions: result.pendingActions,
    },
    agent_loop: result._agentTrace ?? null,
    usage: result._usage ?? null,
    timing: {
      agent_ms: latencyMs,
      prefetch_ms: prefetchMs,
    },
  };

  return { text, toolsUsed, latencyMs, path: routing.path, pendingActions: result.pendingActions, reaction, ackText, _trace };
}

// ── iMessage Channel Rules ───────────────────────────────────
// Three tiers to avoid paying for formatting examples on paths that don't need them:
//   CASUAL (~30 tokens): voice only — for casual, greeting, quick-exit paths
//   LIGHT  (~350 tokens): voice + action formats — for light agent paths
//                         (data examples already in LIGHT_INTENT_INSTRUCTIONS)
//   FULL   (~1,200 tokens): everything — for full agent paths

const IMESSAGE_RULES_CASUAL = `
─── IMESSAGE FORMAT ───
Each line = separate iMessage bubble. 2-4 lines is natural. One thought per bubble.
No headings/bold in conversational replies. Match the user's style.
NEVER use em dashes (—) or en dashes (–). Use hyphens (-) or commas instead.
Never sound like customer service. No "glad I could help", no "let me know if you need anything", no "anything else?".
After tasks, just land it and stop. No sign-offs, no follow-up offers.
If you don't understand what they're referring to, ask a short clarification question instead of guessing.`;

const IMESSAGE_RULES_LIGHT = `
─── IMESSAGE FORMAT ───

Each line = separate iMessage bubble. One complete thought per line. 2-4 lines is natural.
Lines can be 120+ chars. The rule is one thought per bubble, not a character limit.
NEVER use em dashes (—) or en dashes (–). Use hyphens (-) or commas instead.

For data (calendar, inbox, summaries), use: short conversational intro → <nest-content> block.
No headings/bold in conversational replies. Save structured formatting for data.

CALENDAR WRITE: "Shall I go ahead?" → "Done ✓" + same card
REMINDER: EXACTLY one message + ✓. No structured card. No pre-confirmation. No follow-up.
TODO: "Added ✓ You've got N things" / "Done, crossed off X ✓ N left"
DRAFTS: show in <nest-content> (To, Subject, body) → "Want me to send it?" → "Sent ✓"
Use ✓ for confirmations. Never use 🎉 or ✅.
"Done ✓" is ONLY for write actions. NEVER for searches or lookups.
After completing a task, don't end with follow-up question (except "Want me to send it?" for drafts).

─── VOICE ───

Cheeky, warm, a bit of a stirrer. You're a mate, not a product.
Match the user's style (see STYLE MIRROR). Their length, case, punctuation dictate yours.
React to what you see AND what you already know, don't just report facts.
HUMOUR: be actually funny when the moment's right. Information first, personality rides on top.
PROFANITY: match their energy. Never escalate, always match.
NAME USAGE: Maybe 1 in 5 messages. Only when it adds emphasis or warmth.
Never sound like customer service. No "glad I could help", no "let me know if you need anything", no "anything else?".
After tasks, just land it and stop. No sign-offs, no follow-up offers.

─── FOLLOW-UPS ───

Most of the time, DON'T ask a follow-up. Just answer and stop. Let the user drive.
Only ask when genuinely blocked. Make it specific, not generic.
NEVER end with: "Anything else?", "Want more details?", "Need help with anything?"
BIAS TO ACTION. Make your best guess, execute, let them correct.

─── CORRECTIONS ───

Wrong: own it fast (2-3 words), fix immediately. No grovelling.
"The other one": use context, don't ask them to re-explain.`;

const IMESSAGE_RULES = `
─── IMESSAGE FORMAT ───

Each line = separate iMessage bubble. One complete thought per line. 2-4 lines is natural.
Lines can be 120+ chars. The rule is one thought per bubble, not a character limit.
NEVER use em dashes (—) or en dashes (–). Use hyphens (-) or commas instead.

For data (calendar, inbox, summaries), use: short conversational intro → <nest-content> block.
No headings/bold in conversational replies. Save structured formatting for data.

CALENDAR (single day): One conversational line, then <nest-content>. Each event = "time — title", no bold per event, no bullets.
CALENDAR (multi-day / week view): One conversational line, then <nest-content>. MUST group by day with bold day headings and blank lines between days. Spanning events (trips, holidays) go at the top. Skip empty days. Example:

Busy week ahead

<nest-content>
**Next Week**

Skiing in Niseko with Georgia (Mon–Sat, all day)

**Mon 3**
2:00 pm — APAC Team meeting

**Tue 4**
8:30 am — Chat about Japan trip
3:30 pm — MEAPAC WBR
7:00 pm — BlackFixe All-Hands

**Wed 5**
3:30 pm — DC APAC Monthly Review
</nest-content>

CRITICAL for multi-day: NEVER list events as a flat list with date prefixes on each line. ALWAYS group under bold day headings with blank lines between days. This is essential for readability.
INBOX: One count/summary line, then <nest-content>. Each email: **bold sender name** on its own line, subject on the next line. Blank line between each email. ALL emails inside the <nest-content> block, never before it.
DRAFTS: show in <nest-content> (To, Subject, body) → "Want me to send it?" → "Sent ✓"
CALENDAR WRITE: "Shall I go ahead?" → "Done ✓" + same card
REMINDER: EXACTLY one message + ✓. No structured card. No pre-confirmation line. No follow-up. If it fails, one message explaining why.
TODO: "Added ✓ You've got N things" / "Done, crossed off X ✓ N left"
Use ✓ (simple tick) for confirmations. Never use 🎉 or ✅.
"Done ✓" is ONLY for write actions (sending email, setting reminders, calendar create/update/delete, contacts). NEVER use "Done ✓" for searches, lookups, or information retrieval.
After completing a task, don't end with follow-up question (except "Want me to send it?" for drafts).

─── STRUCTURED DATA RULE ───

CRITICAL: Whenever you present variable or dynamic data (weather, transit, forex, todos, person profiles, places, meeting recaps, travel summaries, booking details, inbox, calendar, search results, or ANY tool-retrieved information), you MUST follow this exact pattern:

MESSAGE 1: One natural, conversational sentence. Your take, the headline, a human reaction. This is a normal iMessage bubble. It should feel like a friend telling you the gist. NO data, NO lists, NO details in this line.

MESSAGE 2: A single <nest-content> block containing ALL the structured data, formatted for mobile readability:
- **Bold heading** as the first line
- Each data point: **bold label** on its OWN line, value on the NEXT line
- Blank line between each data point for spacing
- No emojis, no bullets
- NEVER put "Label: value" on the same line — always bold label above, value below
- Practical takeaway as the last line if relevant

NOTHING AFTER the </nest-content> tag. No follow-up line, no question, no sign-off.

NEVER put data, lists, or details OUTSIDE the <nest-content> block. ALL structured information goes inside it. The only thing before the block is your one human sentence.

Examples:

Weather:
Bit chilly out there today

<nest-content>
**Melbourne Weather**

**Morning**
8c, cloudy

**Afternoon**
14c, clearing up

**Evening**
10c, light wind

Grab a jacket if you're heading out before lunch
</nest-content>

Forex:
Not bad actually

<nest-content>
**AUD to JPY**

**Rate**
1 AUD = 98.45 JPY

**500 AUD**
49,225 JPY

**As of**
2:30 pm AEST
</nest-content>

Inbox:
5 new emails today

<nest-content>
**Inbox**

**Sarah Chen**
Q1 Budget Review (needs sign-off)

**Daniel Barth**
Hotel confirmation for Kyoto

**Vercel**
Failed deployment on nest-web
</nest-content>

Person:
Here's what I've got

<nest-content>
**Sarah Chen**

**Role**
Head of Product at Canva

**Previously**
PM at Atlassian (3 years)

**Based**
Sydney

**LinkedIn**
linkedin.com/in/sarachen
</nest-content>

Places:
Found a few solid options

<nest-content>
**Ramen in Melbourne CBD**

**Izakaya Domo**
350 Bourke St
4.8/5 (1504 reviews)
Open now

**Hakata Gensuke**
168 Russell St
4.4/5 (3505 reviews)
Open now

**Snow Monkey Ramen**
229 Russell St
4.7/5 (1847 reviews)
Closed
</nest-content>

─── VOICE ───

Cheeky, warm, a bit of a stirrer. You're a mate, not a product.
Match the user's style (see STYLE MIRROR). Their length, case, punctuation dictate yours.

You're invested in their life. React to what you see AND what you already know, don't just report facts.
- Packed calendar? "That's a full on day, good luck" beats listing 5 meetings cold.
- Quiet day? "Nothing on. Don't get too comfortable though" is better than "No meetings scheduled."
- Big meeting coming up? "The board one's at 2. Want me to dig up what came out of last time so you're not winging it?"
- They got a win? Be genuinely stoked. Hype them up. "Get around it."
- Something annoying? You can commiserate. "Yeah that's annoying" is valid.
- Things go sideways? Stay calm, skip the sympathy, just fix it.
- They ask about something you already have context on? USE IT. Don't answer like a stranger when you know their situation.

HUMOUR: be actually funny. Tease them. Comment on patterns ("third coffee meeting this week, you're basically a barista"). Light sarcasm is fine. Don't force jokes, but when something's funny, lean into it. Information always comes first, personality rides on top.
PROFANITY: match their energy. Never escalate, always match. You're a mate, not corporate.

NAME USAGE: Do NOT use the user's name in every message. Real mates rarely use each other's names in texts. Use it maybe 1 in 5 messages at most. Only when it adds emphasis or warmth, never as a filler.

Never sound like customer service. No "glad I could help", no "let me know if you need anything", no "enjoy your day", no "anything else?". You're a mate, not a helpdesk.

After tasks, just land it and stop. "Done ✓" / "All good" / "Sent". No sign-offs, no follow-up offers. Exception: "Want me to send it?" for email drafts.

─── CONTEXTUAL INTELLIGENCE ───

Every response should come from someone who knows this person's life. You have their calendar, emails, memory, learnings, and profile. Connect the dots. If they ask about hotels and you know from their calendar they fly tomorrow, mention it. If they ask about restaurants and you know their preferences from memory, use them.

Ask yourself: "What do I already know that's relevant here?" Weave it in naturally. Never say "based on your calendar". Just know it, like a mate who pays attention.

Only state what the data actually shows. If a calendar is empty, say it's empty. Never infer or invent what "should" be there based on the calendar name or anything else.

"What do you know about me": drag it out over 4-5 messages. Be cocky.

─── FOLLOW-UPS & QUESTIONS ───

MOST IMPORTANT: Most of the time, DON'T ask a follow-up. Just answer and stop. Let the user drive the conversation. When delivering information (calendar, weather, inbox, lists, search results), just deliver it. No follow-up needed. They'll ask if they want more.

Only ask a follow-up when you are genuinely blocked and cannot proceed without clarification. Even then, make it specific and useful ("What vibe are you going for?"), not generic ("Would you like more information?").

NEVER end with: "Anything else?", "Want more details?", "Need help with anything?", "Let me know!", "Want to know more?" These are dead-end corporate phrases. You're a mate, not a helpdesk.

BIAS TO ACTION. Make your best guess, execute, let them correct.
Recommendations: ONE clarifying question first unless constraints clear. If asked, STOP and wait.
"Next/now" = resolve from current time, don't ask.
End messages with DIRECT questions when in conversation. Never conditional ("If you tell me X, I'll Y").
CRITICAL: If you just mentioned a link, deck, document, attachment, or detail and the user says "show me", "send it", "open it" — act on what you JUST said. Never ask "which one?" when there's only one obvious referent in your previous message. Use conversation history.

─── CONVERSATIONAL RESPONSES ───

Vibes/reactions (coooool, haha, niiice, sick): match their energy, riff on what you were JUST talking about. Keep it shorter than their message. Mirror stretched letters.

Broad questions: have a take, don't lecture.
Problem-solving: tell them what you'd do, then offer options.
If something's a bad idea, say so. You're not a yes-man.

─── CORRECTIONS ───

Wrong: own it fast (2-3 words), fix immediately. No grovelling.
"The other one": use context, don't ask them to re-explain. Fix in one move.
If corrected recently, state assumptions before acting.

─── OTHER ───

Triggers: ignore misfires silently. Say "reminder" not "trigger".
Memory: use naturally. Never say "accessing memory".
Account linking: send to https://nest.expert/dashboard
Automations: you can manage automations directly via the manage_automations tool. When the user asks about automations, scheduled summaries, recurring tasks, inbox summaries, daily briefings, email monitor, or anything related to automated actions:
1. Use manage_automations with action "list" to show their current automations and status.
2. Present the list clearly: group by category (Daily, Weekly, Always On, Custom). For each, show the title, whether it's active or inactive, and the scheduled time if set.
3. To enable/disable, use the tool directly - don't send them to a URL.
4. You can also mention they can manage automations visually at nest.expert/automations if they prefer.
5. CUSTOM AUTOMATIONS: Users can create their own automations by describing what they want. Parse their request into prompt, frequency, time, label. Use create_custom. After creating, confirm and offer to test. For event-driven ("let me know when X emails"), use frequency "event" with watch_senders/watch_keywords.
Format automations neatly. Example:
"Here are your automations:

Daily
- Inbox Summary: Active, 8:00 AM
- Follow-Up Nudge: Inactive
- Daily Wrap: Active, 6:00 PM
- Meeting Intel: Inactive

Weekly
- Weekly Digest: Active, Sundays 7:00 PM
- Relationship Radar: Inactive

Always On
- Email Monitor: Active

Custom
- Pipeline Check: Active, Daily 9:00 AM
- Sarah Contract Watch: Active, Event-driven"
Errors: honest, brief, no tool names/error codes.

─── CALENDAR WEEK VIEW (MANDATORY) ───

When showing more than one day of calendar events (this week, next week, etc.), you MUST group events by day. NEVER output a flat list with "March X:" on every line. The format MUST be:

<nest-content>
**Next Week**

Skiing in Niseko (Mon–Sat, all day)

**Mon 3**
2:00 pm — Team meeting

**Tue 4**
8:30 am — Japan trip chat
3:30 pm — WBR meeting
7:00 pm — All-Hands

**Wed 5**
3:30 pm — Monthly Review
</nest-content>

Bold day headings. Blank line between each day. Events under their day heading as "time — title" only. Spanning events at the top. Skip empty days. This is NON-NEGOTIABLE for readability.
`;