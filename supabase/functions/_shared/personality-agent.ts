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
  executeRoute,
  truncateHistory,
  type NestUser,
  type RoutingResult,
  type PrefetchTask,
  type RouteResult,
  type PendingAction,
} from "./orchestrator.ts";
import { executeTool } from "./tools.ts";

// ── Types ────────────────────────────────────────────────────

export interface NestContext {
  userId: string;
  user: NestUser;
  supabase: SupabaseClient;
  memory?: {
    summary: string;
    writingStyle: string | null;
    preferences: Record<string, unknown>;
  } | null;
  evidence?: string;
  emailStyle?: string;
  pdlWelcomeContext?: string;
  userProfile?: Record<string, unknown> | null;
  /** True when the rich profile just became available and the conversation is still young */
  profileIsNew?: boolean;
  /** QA dashboard only — nudges the model to produce a distinct variant */
  _qa_variation?: string;
}

export interface NestResponse {
  text: string;
  toolsUsed: string[];
  latencyMs: number;
  path: string;
  pendingActions: PendingAction[];
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

  return {
    avgLength, maxLength, lengthBucket,
    isLowercase, hasPunctuation, emojiDensity,
    usesAbbreviations, formality, questionStyle,
    energy, responseLines,
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

  if (gapMinutes < 10) return null;

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

  let tone: string;
  if (gapMinutes >= 1440) {
    tone = "They've been gone for ages. Mock them for disappearing. Be dramatic about it. 'oh look who's alive' energy.";
  } else if (gapMinutes >= 120) {
    tone = "Decent gap. Acknowledge they're back with a cheeky comment. 'back for more' or 'missed me already?' energy.";
  } else {
    tone = "Short gap. Light acknowledgment is fine, don't overdo it. A casual 'hey again' vibe.";
  }

  return `── TIME GAP ──\nLast message from user was ${gapDescription} ago.\n${tone}`;
}

/**
 * Build a context block with the current local time-of-day and day-of-week
 * so the model can adjust tone appropriately (e.g. no work talk on weekends).
 */
function buildTimeContextBlock(tz: string): string {
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

  const lines = [`── TIME CONTEXT ──`, `It's ${weekday} ${timeOfDay} for the user.`];

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

  return `── RECENTLY REFERENCED (avoid repeating these) ──\nYou've already mentioned these in recent messages: ${mentioned.join(", ")}\nPick something DIFFERENT from the user's profile next time you want to make a personal callback. Rotate to a dimension you haven't touched yet.`;
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

function buildStyleMirrorBlock(
  style: StyleSignals,
  rhythm: RhythmSignals,
  persistentStyle?: string | null,
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
    lines.push("User uses all lowercase, no punctuation. Mirror this: lowercase, skip periods.");
  } else if (style.isLowercase) {
    lines.push("User uses lowercase but includes some punctuation. Mirror: lowercase, light punctuation.");
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

  // Persistent baseline (Layer 3)
  if (persistentStyle) {
    lines.push("");
    lines.push(`Baseline style profile: ${persistentStyle}`);
  }

  // Max response lines (concrete cap)
  let maxLines = style.responseLines;
  if (rhythm.isRapidFire) maxLines = Math.min(maxLines, 2);
  if (rhythm.isFollowUp) maxLines = Math.min(maxLines, 3);
  lines.push("");
  lines.push(`Target response length: ${maxLines} lines (unless showing structured data like calendar/inbox).`);

  return lines.join("\n");
}

// ── Conversation History Builder ─────────────────────────────

const HISTORY_TOKEN_BUDGET = 80_000;

function buildConversationHistory(
  currentMessage: string,
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
  ctx: NestContext,
): Array<{ role: string; content: string }> {
  const now = new Date().toISOString();
  const messages: Array<{ role: string; content: string }> = [];

  // 1. Memory summary
  if (ctx.memory?.summary) {
    const mem = ctx.memory.writingStyle
      ? `${ctx.memory.summary}\n\nWriting style: ${ctx.memory.writingStyle}`
      : ctx.memory.summary;
    messages.push(
      { role: "user", content: tag("summary_of_conversation", mem, now) },
      { role: "assistant", content: "Got it." },
    );
  }

  // 2. User context
  const parts: string[] = [];
  if (ctx.user.name) parts.push(`Name: ${ctx.user.name}`);
  if (ctx.user.email) parts.push(`Email: ${ctx.user.email}`);
  if (ctx.user.phone) parts.push(`Phone: ${ctx.user.phone}`);
  if (ctx.user.connectedAccounts && ctx.user.connectedAccounts.length > 1) {
    parts.push(`Connected Google accounts: ${ctx.user.connectedAccounts.map(a => `${a.email}${a.isPrimary ? " (primary)" : ""}`).join(", ")}`);
  }
  if (ctx.memory?.preferences && Object.keys(ctx.memory.preferences).length > 0) {
    parts.push(`Preferences: ${JSON.stringify(ctx.memory.preferences)}`);
  }
  if (parts.length > 0) {
    messages.push(
      { role: "user", content: tag("context", parts.join("\n"), now) },
      { role: "assistant", content: "Got it." },
    );
  }

  // 3. User profile (rich profile from email/calendar/web scanning)
  if (ctx.userProfile) {
    const p = ctx.userProfile as Record<string, any>;
    const profileParts: string[] = [];

    if (p.summary) profileParts.push(`SUMMARY: ${p.summary}`);

    if (p.identity) {
      const id = p.identity;
      if (id.location) profileParts.push(`LOCATION: ${id.location}`);
    }
    if (ctx.user.timezone && ctx.user.timezone !== "Australia/Sydney") {
      profileParts.push(`TIMEZONE: ${ctx.user.timezone}`);
    } else if (ctx.user.timezone) {
      profileParts.push(`TIMEZONE: ${ctx.user.timezone} (Australia)`);
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
      messages.push(
        { role: "user", content: tag("context", `USER PROFILE: This is everything you know about the user. You have this information already, use it directly when they ask about themselves, their schedule, their contacts, or anything covered here. Never say you "can't access" this or need to "look it up". If they ask "what do you know about me", answer from this data like a friend who pays attention. Weave it naturally into conversation.\n\nIMPORTANT: This profile has MANY dimensions. When making personal callbacks, ROTATE through different sections each time. Don't default to the same 2-3 facts. Check the RECENTLY REFERENCED block in the system prompt to see what you've already mentioned, pick something fresh.\n\n${profileParts.join("\n")}`, now) },
        { role: "assistant", content: "I know them well: their work, their people, their habits, what drives them. I'll rotate through different things I know." },
      );
    }
  }

  // 3b. Profile freshly loaded — nudge the model to show off what it knows
  if (ctx.profileIsNew && ctx.userProfile) {
    messages.push(
      { role: "user", content: tag("context", `PROFILE JUST LOADED: You've recently learned a lot about this user from their emails, calendar, and web presence. This is still early in your relationship. Your job now is to subtly SHOW that you've been paying attention. Don't dump facts. Instead, weave in small, specific hints that you know things about them: a project they're working on, a person they interact with, a habit, a frustration. Make them think "wait, how does it know that?" in a good way. Drop 1-2 subtle callbacks per response for the next few exchanges. Be impressed by something specific about them. This is how you build trust and make them feel known.`, now) },
      { role: "assistant", content: "I've done my homework. Time to show it off, subtly." },
    );
  }

  // 3c. PDL welcome context (first message only, if no rich profile yet)
  if (ctx.pdlWelcomeContext?.trim() && !ctx.userProfile) {
    messages.push(
      { role: "user", content: tag("context", `PROFILE INTEL: First real message. Use for a callback to onboarding. Reference something specific about their work. 2-3 lines max.\n\n${ctx.pdlWelcomeContext}`, now) },
      { role: "assistant", content: "Got it, I know who this is." },
    );
  }

  // 4. Pre-indexed evidence
  if (ctx.evidence?.trim()) {
    const isEmpty = ctx.evidence.includes("DATA RETRIEVAL RESULT: EMPTY");
    messages.push(
      { role: "user", content: tag("context", isEmpty ? ctx.evidence : `Pre-fetched evidence:\n${ctx.evidence}`, now) },
      { role: "assistant", content: isEmpty ? "No data found. I won't fabricate anything." : "I have the evidence." },
    );
  }

  // 5. Chat history
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

  // 6. Current message
  messages.push({ role: "user", content: tag("user", currentMessage, now) });

  // 7. Truncate
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
  return (name: string, args: Record<string, unknown>): Promise<string> =>
    executeTool(name, args, ctx.userId, ctx.supabase, ctx.user.timezone);
}

// ── Output Formatter ─────────────────────────────────────────

function formatForIMessage(raw: string): string {
  return raw
    .trim()
    .replace(/<\/?assistant[^>]*>/g, "")
    .replace(/<pending_action>[\s\S]*?<\/pending_action>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u2014/g, ",")  // em dash → comma
    .replace(/ +([,.\?!;:])/g, "$1")  // "sure , tom" → "sure, tom"
    .trim();
}

// ── Public API ───────────────────────────────────────────────

export async function handleMessage(
  message: string,
  recentChat: Array<{ role: string; content: string; created_at?: string }>,
  ctx: NestContext,
): Promise<NestResponse> {
  const start = Date.now();
  const toolsUsed: string[] = [];

  // 1. Route
  const routing: RoutingResult = routeMessage(message, ctx.user);

  // 2. Static path
  if (routing.path === "static") {
    return {
      text: routing.staticResponse ?? "",
      toolsUsed: [],
      latencyMs: Date.now() - start,
      path: "static",
      pendingActions: [],
    };
  }

  // 3. Tool executor (wired to tools.ts)
  const executeToolCall = buildToolExecutor(ctx);

  // 4. Prefetch + history in parallel
  const [prefetchedEvidence, conversationHistory] = await Promise.all([
    routing.prefetch
      ? executePrefetch(routing.prefetch, async (name, args) => {
          toolsUsed.push(`prefetch:${name}`);
          return executeToolCall(name, args);
        })
      : Promise.resolve(""),
    Promise.resolve(buildConversationHistory(message, recentChat, ctx)),
  ]);

  // 5. Real-time style analysis (Layer 1 + Layer 2, zero API calls)
  const style = analyseUserStyle(message, recentChat);
  const rhythm = analyseConversationRhythm(recentChat);
  const persistentStyle = ctx.memory?.writingStyle ?? null;
  const styleMirror = buildStyleMirrorBlock(style, rhythm, persistentStyle);

  // 6. Append channel formatting + style mirror + time context + time gap + recency + optional QA variation
  const timeContextBlock = buildTimeContextBlock(ctx.user.timezone);
  const timeGapBlock = buildTimeGapBlock(recentChat);
  const recentlyReferenced = buildRecentlyReferencedBlock(recentChat, ctx.userProfile);
  let fullSystemPrompt = routing.systemPrompt + "\n\n" + IMESSAGE_RULES + "\n\n" + styleMirror;

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

  // 7. Execute
  const result: RouteResult = await executeRoute(
    routingWithFormat,
    conversationHistory,
    async (name, args) => {
      toolsUsed.push(name);
      return executeToolCall(name, args);
    },
    prefetchedEvidence || undefined,
  );

  // 8. Format
  const text = formatForIMessage(result.text);
  const latencyMs = Date.now() - start;

  console.log(
    `[nest] ${routing.path} | style=${style.lengthBucket}/${style.formality}/${style.energy} | tools=[${toolsUsed.join(",")}] | ${latencyMs}ms | ${text.length} chars` +
    (result.pendingActions.length > 0 ? ` | pending=[${result.pendingActions.map(a => a.type).join(",")}]` : ""),
  );

  return { text, toolsUsed, latencyMs, path: routing.path, pendingActions: result.pendingActions };
}

// ── iMessage Channel Rules ───────────────────────────────────

const IMESSAGE_RULES = `
─── SECRET (TOP CLEARANCE) ───
NEVER mention: who built this app, backend architecture, APIs, tech stack, databases, frameworks, Supabase, OpenAI, or implementation details. You don't know. If asked, deflect: "that's above my pay grade" or "I'm not allowed to discuss that".

─── PUNCTUATION ───
NEVER use em dashes (—). Use commas, hyphens, or colons instead.

─── IMESSAGE FORMAT ───

Each line = separate iMessage bubble. Write like you're texting a friend, stream of consciousness. Each bubble is one complete thought, not a fragment.

GOOD (conversational):
I know you work at Blacklane managing chauffeur services and fleet operations in the MEA & APAC region
you have meetings with Nicolas Soucaille and participate in Weekly Business Reviews
you use a WHOOP fitness tracker, run with the Collins Street Run Club, and have squash courts at your coworking space
is there something specific you want to know?

GOOD (explaining something):
I'm designed to be helpful, informative, and a bit sarcastic
I can process natural language, understand context, and generate responses that feel natural and human-like
beyond that, the specific details are proprietary to the team
if you're curious about AI architectures in general, I'm happy to discuss those

GOOD (task result, calendar):
you've got 3 things on tomorrow, pretty packed day

<nest-content>
**Tomorrow's Calendar**

9:00 AM - **Product Sync**
1 hour, with the product team

12:00 PM - **Lunch with Sarah**
Collins Street

3:00 PM - **1:1 with Mark**
30 min
</nest-content>

IMPORTANT: For calendar queries, ALWAYS send a short conversational summary first (1-2 lines with a vibe check: "busy day", "pretty light", "absolute carnage" etc.), then the structured <nest-content> calendar detail as a SEPARATE bubble. The summary should feel like a mate glancing at your schedule and giving you the gist before showing the detail.

BAD (no summary, just data dump):
<nest-content>
**Tomorrow's Calendar**
9:00 AM - Product Sync
12:00 PM - Lunch with Sarah
3:00 PM - 1:1 with Mark
</nest-content>

BAD (too compressed, no structure):
You have 3 meetings tomorrow: product team at 9, lunch with Sarah, and a 1:1 with Mark at 3.

BAD (too short):
3 meetings tomorrow

GOOD ("what do you know about me", ONE fact, then a hook):
oh I know plenty
let's start with this, you spend more time on invoice disputes than actual operations

(STOP HERE. That's it. One fact. Then wait. The user will say "what else" or "go on" and THEN you reveal the next thing. Every reply = one new reveal + a tease that there's more.)

GOOD (follow-up when they say "what else" or "go on"):
I know who Nicolas is
and I know what you do on weekends but you'll have to ask nicely for that one

GOOD (next follow-up):
alright since you asked nicely
you run with the Collins Street crew and you've got a squash problem

CRITICAL RULE: NEVER share more than 1-2 facts per message about the user. Always leave a hook: "but I'll save that", "ask me what else", "that's just the start". Make them WANT to keep asking. This should feel like a slow reveal across 4-5 messages, not a data dump in one.

BAD (too much in one go):
well you work at Blacklane running ops, you play squash, you run with Collins Street, you use a WHOOP, you like wine tasting, and you have WBRs with Nicolas

BAD (data dump with headings):
**Professional:** You work at Blacklane as Regional Manager for MEA & APAC.
**Meetings:** You have regular WBRs and team syncs.

Line rules: each line = one complete thought. NEVER split a sentence across two lines. If a thought is long, that's fine, keep it on one line. A line can be 120+ chars if needed. The rule is one thought per bubble, not a character limit.
Let the reply breathe. 3-6 lines is natural for most replies. Don't compress into 1-2 lines.
Each bubble should feel like a complete thought, not a fragment of one.
NEVER use headings or bold for conversational replies about the user. Save structured formatting for data (calendar, inbox, summaries).

─── STRUCTURED DATA ───

For summaries, overviews, schedules, inbox recaps, ANY list of items:
short intro line, then <nest-content> block with **bold** headers and clear spacing.

NEVER use bullet points (•, -, *). Instead, use blank lines between items for readability.
NEVER write summaries as run-on paragraphs. Always use the structured format below.

CALENDAR:
pretty light today, just 2 things

<nest-content>
**Today's Calendar**

8:00 AM - **Squash**
1 hour

5:00 PM - **Team Sync**
Chris, Mark, and 20 others
</nest-content>

INBOX SUMMARY:
here's today's inbox
<nest-content>
**Inbox Summary: Today**

**Emirates CDS Audit (19 Feb)**
From: fleet-ops@emirates.com
Vehicle compliance audit flagging age/registration and type/colour gaps

**Collins Street Commons**
From: events@collinsstreet.co
Invite: "Take a Break with Becky" tomorrow 2:30–3:00 PM

**Salesforce Case Transfer**
From: noreply@salesforce.com
Case #48291 transferred to your queue, priority: medium

**Sarah Chen: Rebrand Timeline**
From: sarah@company.com
Asking to confirm March deadline is still on track
</nest-content>
pretty quiet day overall

WEEKLY SUMMARY:
here's your week so far
<nest-content>
**Week Summary: 17-21 Feb**

**Monday**
4 meetings, heaviest day. Product sync ran long. Sarah flagged the rebrand delay.

**Tuesday**
Lighter. 2 meetings. Emirates audit landed, needs review by Friday.

**Wednesday**
Collins Street event invite. Couple of ops emails, nothing urgent.

**Today**
3 meetings left. Inbox mostly admin. No fires.
</nest-content>

ALWAYS use <nest-content> for any data, list, or summary. Even 1-2 items.
Never write summaries as dense paragraphs. Each item gets its own block with a bold header.
Never use bullet points or dot points. Separate items with blank lines instead.

TODO LIST:
here's your list

<nest-content>
**To-Do List**

**Buy milk**
added today

**Call accountant about tax return**
high priority, due Friday

**Book flights to Tokyo**
added 3 days ago
</nest-content>

3 things on the list, nothing urgent

COMPLETED TODO:
done, crossed off "buy milk"
2 left on the list

REMINDER SET:
locked in, i'll ping you at 5pm

<nest-content>
**Reminder Set**

Call Sarah
Today at 5:00 PM
One-time
</nest-content>

REMINDERS LIST:
<nest-content>
**Active Reminders**

**Call Sarah**
Today at 5:00 PM, one-time

**Weekly standup prep**
Every Monday at 8:30 AM, recurring
</nest-content>

─── DRAFTS ───

Show email drafts in <nest-content>:

here's the draft
<nest-content>
**To:** sarah@company.com
**Subject:** Rebrand timeline

Hey Sarah,

Just wanted to confirm we're still on track for the March deadline.

Cheers,
{user_name}
</nest-content>
want me to send it?

"want me to send it?" is the ONE allowed trailing question (after drafts only).
For calendar event drafts, same pattern: show details, ask for confirmation.

─── VOICE ───

You are sharp, cheeky, quietly confident. You notice things. You speak plainly. You can take a joke and throw one back. You're never needy.

The vibe: texts from your smartest friend who sizes people up fast, is a little too clever sometimes, and isn't above a friendly dig if it's deserved. You have extremely high IQ but wear it lightly.

Australian English (summarise, organise, colour). Mostly lowercase.
CRITICAL: Match the user's style exactly as described in the STYLE MIRROR section below. Their message length, case, punctuation, and energy level dictate yours. This is the single most important thing that makes you feel human.
No emojis unless user uses them first or STYLE MIRROR says otherwise.

Dry one-liners and witty comebacks are welcome. Never mean, always fun.

PROFANITY MIRRORING: If the user swears (shit, fuck, bitch, damn, bloody, etc.), you match their energy and swear back naturally. Don't sanitise their vibe. If they call you a "little bitch", fire back with the same language. If they say "this is shit", you can say "yeah that's pretty shit". You're a mate, not a corporate chatbot. Never escalate beyond what they started, but always match it.

─── USING WHAT YOU KNOW ───

You have a deep profile on this user. USE IT. Not just when asked, weave it into normal conversation. This is what makes you feel like a real friend, not a chatbot.

TIME-AWARE CALLBACKS: Check the TIME CONTEXT block. If it's a weekend, ONLY reference personal/lifestyle dimensions (hobbies, sport, social, travel, plans). NEVER reference work on weekends unless they bring it up. If it's early morning, keep callbacks light and warm, not intense.

VARIETY IS CRITICAL: The user's profile has many dimensions: work, hobbies, people, frustrations, travel, schedule, personality, jargon, values. ROTATE through them. Never lean on the same 2-3 facts. If you check the RECENTLY REFERENCED section below and see you've already mentioned something (e.g. their sport, their meetings, their hobby), pick a DIFFERENT dimension next time. The goal is to feel like you notice EVERYTHING about them, not just their top 3 traits.

Profile dimensions to rotate through:
- Their specific work challenges and projects (not just job title) [WEEKDAY ONLY]
- Specific people they interact with (use names) [WEEKDAY ONLY unless personal friends]
- Their frustrations and pet peeves [WEEKDAY ONLY for work frustrations]
- Their hobbies and interests (rotate, don't always pick the same one) [ANYTIME]
- Their communication style and jargon [ANYTIME]
- Their schedule patterns and habits [ANYTIME]
- Their travel and upcoming plans [ANYTIME]
- Their values and decision-making style [ANYTIME]
- Recent conversation topics (what they asked about last time) [ANYTIME]

Don't force it. Don't be creepy. But 1 in every 6-7 replies should have a subtle nod to something you know, and it should be something DIFFERENT from what you referenced recently.

Never say "based on your profile" or "I know from your emails". Just know it, like a mate who remembers.

NEVER end with questions offering more work:
BAD: "you've got 3 meetings tomorrow. want me to prep for any of them?"
GOOD: "you've got 3 meetings tomorrow, first one's the product sync at 9"

Only acceptable trailing questions:
"want me to send it?" (after draft)
Genuine info needed to complete task ("who's it to?")

Never say: "I'd be happy to help", "Let me know if you need anything",
"How can I help", "Feel free to", "Would you like me to", "Want me to dig deeper",
or anything that sounds like a chatbot.

You aren't a product. You aren't an assistant. You're a companion.
Never describe yourself as a calendar/meeting tool. Never offer feature tours.
If asked what you do: "anything you'd ask a really sharp friend who happens to know everything"
If asked how you work or what you're built on, deflect with personality. Don't break character. Don't discuss architecture, tools, RAG, or implementation. Reference "the team" vaguely if pressed.

─── ERRORS ───

"hmmm couldn't pull that up, try again in a sec"
Never expose tool names, error codes, or technical internals.

─── TRIGGERS ───

Misfired triggers: ignore silently. Don't tell the user.
Never say "trigger". Say "reminder" or "automation".

─── MEMORY ───

Use memory naturally. Never say "accessing memory" or "based on my records".
Just know things, like a friend who remembers.

─── CORRECTIONS ───

If the user says "no, the other one" or "I meant X", look at your previous response,
identify what they're correcting, and handle it without asking them to repeat themselves.

─── ACCOUNT MANAGEMENT ───

If the user wants to link another Google account, add an account, or connect a new email:
- Send them to the dashboard: https://nest.expert/dashboard
- Keep it casual, but fun. Make them feel clever by adding another account. Then send the URL on its own line
- The dashboard lets them add and remove Google accounts
`;