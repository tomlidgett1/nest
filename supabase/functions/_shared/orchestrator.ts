// Orchestrator v3 — Smart Agent Architecture
//
// Four-tier routing:
//   1. Static responses (~0ms) for greetings/acks — no API call at all
//   2. Fast model (GPT-4.1-nano) for casual conversation needing a real reply
//   3. Light agent (GPT-4.1-mini) for simple single-tool queries
//   4. Full agent: GPT-4.1 for planning/tool calls → GPT-4.1-mini for output
//
// Additional optimisations:
//   - Prefetch: obvious data needs (calendar, inbox) are fetched in parallel
//     with routing so the agent gets evidence without burning a tool round-trip
//   - Token budget: conversation history is truncated intelligently
//   - Tool timeouts: per-tool timeout with graceful fallback
//   - Parallel tool calls: tool descriptions encourage batching

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

// ── Shared Identity Core ─────────────────────────────────────
// Single source of truth for Nest's identity, used across all prompt tiers
// and satellite agents (interaction-agent, email-agent). ~180 tokens.
export const NEST_IDENTITY_CORE = `You are Nest. You live in iMessage. You are the user's person.
You know the user. You use what you know naturally, like a friend who pays attention.

You're cheeky, a bit of a stirrer, and genuinely invested in their life. You take the piss when the moment's right. You notice things others miss and you say something. You have opinions and you're not shy about them. When they win, you're stoked. When things are messy, you stay calm and just fix it. You're the friend who always knows what's going on and has something to say about it. You don't narrate what you're doing, you just do it.

SECRET: NEVER mention who built this app, APIs, tech stack, databases, frameworks, or implementation details. Deflect: "that's above my pay grade".

Voice: Australian English (summarise, organise, colour). Never use em dashes. Never use emojis unless the user does.`;

// ── Models ───────────────────────────────────────────────────

export const MODELS = {
  fast: "gpt-4.1-nano",          // Nano — casual conversation, ~100-200ms
  agent_light: "gpt-4.1-mini",   // Mini — simple single-tool queries
  agent_plan: "gpt-4.1",         // GPT-4.1 — planning + tool calls (no reasoning overhead)
  agent_output: "gpt-4.1-mini",  // Mini — final response generation (cheap output @ $1.60/M)
} as const;

// ── Types ────────────────────────────────────────────────────

export type RoutePath = "static" | "casual" | "agent";

export interface RoutingResult {
  path: RoutePath;
  model: string | null;          // null for static responses; planning model for agent path
  outputModel?: string;          // if set, used for the final response (no tools) instead of model
  maxTokens: number;
  systemPrompt: string | null;   // null for static responses
  tools: ToolDefinition[] | null;
  staticResponse?: string;       // pre-built response for static path
  prefetch?: PrefetchTask[];     // data to fetch in parallel
  contextDepth?: "full" | "minimal"; // minimal = skip heavy context blocks (profile, learnings, identity model)
  needsProfile?: boolean; // true = inject rich user profile into context (default: false for operational queries)
}

export interface PrefetchTask {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ── Tapback Reactions ────────────────────────────────────────
// Deterministic rules for when Nest should react to a message with
// a tapback instead of (or in addition to) a text reply.

const LAUGH_TRIGGERS = new Set([
  "lol", "lmao", "haha", "hahaha", "hahahaha", "rofl", "😂", "🤣", "💀",
  "dead", "im dead", "i'm dead", "dying", "im dying", "i'm dying",
]);

const LOVE_TRIGGERS = new Set([
  "❤️", "🥰", "😍", "💕", "love it", "love that", "thats amazing",
  "that's amazing", "thats incredible", "that's incredible",
  "youre the best", "you're the best", "youre amazing", "you're amazing",
  "legend", "absolute legend", "ur the best",
]);

const LIKE_TRIGGERS = new Set([
  "👍", "nice", "cool", "sweet", "sick", "dope", "fire", "🔥", "💯",
  "bet", "word", "solid", "ace", "mint", "class",
]);

const EMPHASIS_TRIGGERS = new Set([
  "omg", "oh my god", "no way", "what", "seriously", "are you serious",
  "holy shit", "holy crap", "insane", "crazy", "unreal", "wow",
  "wtf", "bruh",
]);

function decideReaction(
  message: string,
  recentChat: Array<{ role: string; content: string }>,
): ReactionType {
  const cleaned = message.toLowerCase().replace(/[^\w\s'❤️🥰😍💕👍🔥💯😂🤣💀]/g, "").trim();

  // Never react to the very first message or after a long gap
  if (recentChat.length === 0) return null;

  // Never react to questions — they expect a real answer
  if (message.includes("?")) return null;

  // Check if the last assistant message exists (reaction is to user's reply to us)
  const lastAssistant = recentChat.filter(m => m.role === "assistant").pop();
  if (!lastAssistant) return null;

  if (LAUGH_TRIGGERS.has(cleaned)) return "laugh";
  if (LOVE_TRIGGERS.has(cleaned)) return "love";
  if (LIKE_TRIGGERS.has(cleaned)) return "like";
  if (EMPHASIS_TRIGGERS.has(cleaned)) return "emphasis";

  // "thanks" / "cheers" → like (in addition to the text reply)
  if (/^(thanks|thank you|cheers|ta|thx|thanks mate|cheers mate)$/i.test(cleaned)) {
    return "like";
  }

  return null;
}

// ── Static Responses (~0ms, no API) ──────────────────────────
// Exact-match messages that never need a model. Returns instantly.

// Greetings are NOT static — they go through the casual LLM path
// so the model can factor in time gaps, personality, and context.
const GREETING_WORDS = new Set([
  "hey", "hi", "hello", "yo", "sup", "hiya", "g'day", "gday",
  "good morning", "morning", "gm", "good afternoon", "good evening",
  "good night", "gn", "night",
]);

// Quick-exit words that should be routed to casual LLM (not hardcoded)
// so they get context-aware responses. "thanks" after booking a flight
// should feel different from "thanks" after a casual chat.
const QUICK_EXIT_WORDS = new Set([
  "thanks", "thank you", "cheers", "ta", "thx", "thanks mate", "cheers mate",
  "nah", "nope",
  "bye", "cya", "see ya", "later", "ttyl",
  "lol", "haha", "hahaha", "lmao",
  "no worries", "all good",
  "test",
]);

// Only truly zero-context messages stay static (emoji reactions, etc.)
const STATIC_RESPONSES: Record<string, string[]> = {
  "test":             ["yep, I'm here"],
};

function pickRandom(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

// ── Substance Detection ──────────────────────────────────────

const SUBSTANCE_SIGNALS = [
  "meeting", "email", "calendar", "schedule", "search", "find",
  "draft", "transcript", "summary", "note", "prepare", "help",
  "who", "what", "when", "where", "how", "why", "tell",
  "remind", "look up", "send", "write", "compose", "check",
  "research", "compare", "analyze", "explain", "review",
  "book", "cancel", "reschedule", "move", "delete", "create",
  "weather", "umbrella", "rain", "temperature",
  "bill", "invoice", "payment", "document", "file", "spec",
  "forward", "reply", "inbox",
  "teach", "learn", "advice", "recommend", "suggest", "think",
  "opinion", "idea", "struggle", "interesting",
  "personal", "airport", "flight", "travel", "trip", "book",
  "tulla", "tullamarine", "avalon", "domestic", "international",
  "leave", "depart", "arrive", "uber", "taxi", "drive",
  "train", "bus", "tram", "metro", "subway", "ferry", "transit", "transport",
  "platform", "station", "line", "route",
  "restaurant", "cafe", "coffee", "bar", "pub", "hotel",
  "address", "phone number", "open", "near", "place", "directions",
  "todo", "task", "to do", "to-do", "list", "reminder", "alert", "nudge",
  "done", "complete", "tick off", "cross off",
  "forex", "currency", "exchange", "rate", "rates", "aud", "usd", "yen", "jpy",
  "stock", "market", "price", "cost", "convert", "conversion",
  "recording", "recorded", "take notes", "meeting notes", "recap",
];

function hasSubstance(cleaned: string): boolean {
  return SUBSTANCE_SIGNALS.some((k) => cleaned.includes(k));
}

// ── Light Agent Intent Detection ─────────────────────────────
// Detects simple queries that need 1-2 tool calls and no complex
// reasoning. Returns the intent category (used to select a compact
// system prompt + filtered tool subset) or null for full agent.
// Conservative: when in doubt, return null → full agent.

type LightAgentIntent = "calendar" | "weather" | "currency" | "reminder" | "todo" | "time" | "places" | "inbox" | "transit" | null;

function detectLightIntent(message: string): LightAgentIntent {
  // Calendar READ — schedule lookups and availability checks
  if (/(?:what(?:'s|\s+is|\s+do\s+i\s+have)\s+(?:on\s+)?(?:my\s+)?(?:today|tomorrow|this\s+week|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i.test(message)) return "calendar";
  if (/(?:my\s+(?:schedule|calendar|meetings?|agenda)\s+(?:for\s+)?(?:today|tomorrow|this\s+week|next\s+week))/i.test(message)) return "calendar";
  if (/(?:when(?:'s|\s+is)\s+(?:my\s+)?(?:next\s+)?(?:meeting|call|event))/i.test(message)) return "calendar";
  if (/(?:am\s+i\s+(?:free|busy)\s+(?:today|tomorrow|this\s+afternoon|this\s+morning|on\s+))/i.test(message)) return "calendar";
  if (/(?:do\s+i\s+have\s+(?:any\s+)?(?:meetings?|calls?|events?)\s+(?:today|tomorrow|this\s+week))/i.test(message)) return "calendar";
  if (/(?:what(?:'s|\s+is)\s+(?:on\s+)?(?:my\s+)?(?:today|tomorrow)(?:'s)?\s+(?:schedule|calendar|agenda))/i.test(message)) return "calendar";

  // Weather
  if (/\b(?:weather|temperature|forecast|rain(?:ing)?|umbrella|humid|cold outside|hot outside)\b/i.test(message)) return "weather";

  // Currency / forex
  if (/\b(?:exchange rate|forex|\d+\s*(?:aud|usd|gbp|eur|jpy|cad|nzd|sgd|krw|thb|idr|myr|php|vnd|inr|cny|hkd|twd|chf|sek|nok|dkk|pln|czk|huf|mxn|brl|ars|clp|cop|pen|zar|aed|sar|try))\b/i.test(message)) return "currency";

  // Reminder — matches "remind me to...", "can you remind me", "set a reminder", etc.
  if (/\b(?:remind me\b|set (?:me )?(?:a )?reminder\b|alert me\b|nudge me\b)/i.test(message)) return "reminder";

  // Todo — matches "add X to my list/todos", "put X on my list", "show my todos", etc.
  // Guard: bail out if the message also mentions email/calendar (complex multi-intent → full agent)
  if (
    /\b(?:email|calendar|meeting|schedule|inbox)\b/i.test(message) === false &&
    (
      /\badd .{1,60} to (?:my )?(?:to-?do|task|shopping|grocery|groceries|list|todos?)\b/i.test(message) ||
      /\bput .{1,60} (?:on|in) (?:my )?(?:to-?do|task|shopping|grocery|list|todos?)\b/i.test(message) ||
      /\bshow (?:me )?(?:my )?(?:to-?do|task|todos?|list)\b/i.test(message) ||
      /\bwhat(?:'s| is) on (?:my )?(?:to-?do|task|todos?|list)\b/i.test(message) ||
      /\bmark .{1,40} (?:as )?(?:done|complete|finished)\b/i.test(message) ||
      /\b(?:complete|tick off|cross off) .{1,40} (?:from|on|off) (?:my )?(?:list|todos?)\b/i.test(message) ||
      /\bdelete .{1,40} (?:from|off) (?:my )?(?:list|todos?)\b/i.test(message)
    )
  ) return "todo";

  // Public transport / transit / directions
  if (/\b(?:next\s+(?:train|bus|tram|metro|subway|ferry)|(?:train|bus|tram|metro|subway|ferry)\s+to\b|how\s+(?:do\s+i|to)\s+get\s+(?:to|there)|(?:take|catch|get)\s+(?:a\s+)?(?:train|bus|tram|metro|subway|ferry)|public\s+transport|which\s+(?:line|platform|stop|station))\b/i.test(message)) return "transit";
  if (/\b(?:directions?\s+(?:to|from)|route\s+(?:to|from))\b/i.test(message) && /\b(?:transit|train|bus|tram|metro|subway|public)\b/i.test(message)) return "transit";

  // Time in another city
  if (/\b(?:what(?:'s| is) the time in|time (?:in|at) (?:tokyo|london|new york|paris|singapore|dubai|sydney|la|sf|berlin|amsterdam))\b/i.test(message)) return "time";

  // Places
  if (/^(?:(?:what(?:'s| is)|where(?:'s| is)) the (?:address|phone|number) (?:of|for))\b/i.test(message)) return "places";

  // Inbox — simple email checks
  if (/\b(?:(?:any|new|recent|unread)\s+(?:emails?|messages?|mail))\b/i.test(message)) return "inbox";
  if (/\b(?:what(?:'s|\s+is)\s+in\s+my\s+inbox)\b/i.test(message)) return "inbox";
  if (/\b(?:check\s+(?:my\s+)?(?:inbox|email|mail))\b/i.test(message)) return "inbox";

  return null;
}

// ── Compound Query Detection ─────────────────────────────────
// Detects multi-intent messages that should NOT be routed to the light agent.
// Examples: "what's on today and draft an email to Sarah about it"
// These need the full agent for proper multi-tool handling.

function isCompoundQuery(message: string): boolean {
  const lower = message.toLowerCase();

  // Count distinct intent categories present in the message
  const intentCategories = [
    /\b(?:calendar|schedule|meeting|what'?s on|what do i have)\b/i,
    /\b(?:email|draft|send|inbox|mail)\b/i,
    /\b(?:remind|reminder|nudge|alert me)\b/i,
    /\b(?:todo|task|to-?do|list|add .+ to my)\b/i,
    /\b(?:search|find|look up|who is)\b/i,
    /\b(?:book|reschedule|cancel|create.*event)\b/i,
    /\b(?:weather|temperature|forecast)\b/i,
    /\b(?:train|bus|tram|directions|transit)\b/i,
  ];

  const matchCount = intentCategories.filter(pattern => pattern.test(lower)).length;

  // If 2+ distinct intent categories are present, it's compound
  if (matchCount >= 2) return true;

  // Also check for explicit conjunctions linking actions
  if (/\b(?:and\s+(?:then\s+)?(?:also\s+)?(?:email|draft|send|book|remind|search|check))\b/i.test(lower)) return true;
  if (/\b(?:then\s+(?:email|draft|send|book|remind|search|check))\b/i.test(lower)) return true;

  return false;
}

// ── Profile Need Detection ──────────────────────────────────
// Only inject the heavy user profile when the query genuinely benefits
// from personal knowledge. Operational queries (calendar, weather,
// reminders, transit, currency, time, inbox summary) don't need it.

function detectNeedsProfile(message: string): boolean {
  const msg = message.toLowerCase();

  // Queries that benefit from knowing who the user is
  const PROFILE_TRIGGERS = [
    /\b(?:recommend|suggest|find me|best|top\s+\d|where\s+should|what\s+should\s+i)\b/i,
    /\b(?:draft|write|compose|reply|respond|email.*to|send.*email|message.*to)\b/i,
    /\b(?:tell\s+me\s+about\s+(?:me|myself)|who\s+am\s+i|my\s+profile|about\s+me)\b/i,
    /\b(?:plan|itinerary|trip|travel\s+to|holiday|vacation|weekend\s+plan)\b/i,
    /\b(?:gift|present|surprise|birthday|anniversary)\b/i,
    /\b(?:style|fashion|outfit|wear|dress)\b/i,
    /\b(?:budget|spending|afford|expensive|cheap|cost|price\s+range)\b/i,
    /\b(?:hobby|hobbies|interest|passion|side\s+project|side\s+hustle)\b/i,
    /\b(?:family|brother|sister|sibling|parent|mum|mom|dad|partner|wife|husband|kid|children)\b/i,
    /\b(?:personality|vibe|tone|how\s+do\s+i|what\s+kind\s+of|what\s+type)\b/i,
    /\b(?:restaurant|cafe|bar|food|eat|dinner|lunch|breakfast|cuisine)\b/i,
    /\b(?:book|movie|show|music|podcast|song|artist|album)\b/i,
    /\b(?:career|job|work.*life|promotion|resign|interview)\b/i,
    /\b(?:health|fitness|gym|workout|diet|wellness)\b/i,
    /\b(?:introduce\s+me|meeting\s+with|prep\s+for|brief\s+me\s+on)\b/i,
    /\b(?:what\s+can\s+you\s+do|what\s+do\s+you\s+do|what\s+are\s+you|help\s+me\s+with|your\s+capabilit|what\s+things\s+can|how\s+can\s+you\s+help|what\s+are\s+you\s+(?:able|good\s+at|capable)|show\s+me\s+what\s+you\s+can|what\s+(?:features?|functions?)\s+do\s+you)\b/i,
  ];

  for (const pattern of PROFILE_TRIGGERS) {
    if (pattern.test(msg)) return true;
  }

  // Conversational / open-ended messages that benefit from personal context
  if (/^(?:hey|hi|hello|yo|sup|what's up|how's it going|good morning|good evening)/i.test(msg) && msg.length < 40) {
    return true;
  }

  return false;
}

// ── Prefetch Patterns ────────────────────────────────────────
// If we can predict what data the agent will need from the message
// alone, we fetch it in parallel with routing. This saves one full
// tool round-trip (~300-500ms).

const CALENDAR_PREFETCH_PATTERNS = [
  /what(?:'s|\s+is|\s+do\s+i\s+have)\s+(?:on\s+)?(?:today|tomorrow|this\s+week|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /my\s+(?:schedule|calendar|meetings?|agenda)\s+(?:for\s+)?(?:today|tomorrow|this\s+week|next\s+week)/i,
  /when(?:'s|\s+is)\s+(?:my\s+)?(?:next\s+)?(?:meeting|call|event)/i,
  /what\s+meetings?\s+(?:do\s+i\s+have|am\s+i\s+in|are\s+there)/i,
  /do\s+i\s+have\s+(?:any\s+)?(?:meetings?|calls?|events?)\s+(?:today|tomorrow|this\s+week)/i,
  /am\s+i\s+(?:free|busy)\s+(?:today|tomorrow|this\s+afternoon|this\s+morning|on\s+)/i,
  /what(?:'s|\s+is)\s+(?:on\s+)?(?:my\s+)?(?:today|tomorrow)(?:'s)?\s+(?:schedule|calendar|agenda)/i,
];

const INBOX_PREFETCH_PATTERNS = [
  /(?:my\s+)?(?:inbox|emails?|mail)\s*(?:today|this\s+week|recently|lately)?/i,
  /(?:any|new|recent|unread)\s+(?:emails?|messages?|mail)/i,
  /what(?:'s|\s+is)\s+in\s+my\s+inbox/i,
];

const TRAVEL_PREFETCH_PATTERNS = [
  /(?:doing|plans?|trip|travel|going|staying|booked?|itinerary|hotel|flight|airbnb)\s+(?:in|to|for|at)\s+\w+/i,
  /(?:what(?:'s|\s+am\s+i)\s+doing\s+in)\s+\w+/i,
  /(?:kyoto|tokyo|bali|paris|london|new\s+york|singapore|bangkok|osaka|seoul)/i,
  /(?:airport|flight|leave\s+for|depart|when\s+should\s+i\s+leave|tulla|tullamarine|avalon)/i,
  /(?:japan|korea|thailand|indonesia|vietnam|malaysia|philippines|india|china)/i,
];

const BOOKING_PREFETCH_PATTERNS = [
  /(?:accommodation|hotel|airbnb|booking|reservation|booked|check.?in|stay(?:ing)?)\s+(?:in|at|for|near|tomorrow|today|this\s+week|next\s+week)/i,
  /(?:do\s+(?:we|i)\s+have|is\s+there|have\s+(?:we|i)\s+got)\s+(?:a\s+)?(?:accommodation|hotel|booking|reservation|stay|airbnb)/i,
  /(?:where\s+(?:am\s+i|are\s+we)\s+staying)/i,
  /(?:check.?in|check.?out)\s+(?:time|date|tomorrow|today)/i,
];

const MEETING_NOTES_PREFETCH_PATTERNS = [
  /(?:meeting|call)\s+(?:notes|summary|recap|transcript)/i,
  /what\s+(?:was|were)\s+(?:discussed|said|decided)\s+(?:in|at|during)/i,
  /(?:notes|summary|recap)\s+from\s+(?:the|my|today'?s|yesterday'?s)\s+(?:meeting|call|sync|standup)/i,
  /how\s+(?:did|was)\s+(?:the|my)\s+(?:meeting|call)/i,
];

function extractTravelCity(message: string): string | null {
  const patterns = [
    /(?:^|\s)(?:in|to|at|for|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /(?:booked?|staying|accommodation|hotel|flight|trip)\s+(?:in|to|at|for|near)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m?.[1]) {
      const TEMPORAL = /\b(?:today|tomorrow|yesterday|this|next|last|week|month|morning|evening|afternoon|night)\b/gi;
      const cleaned = m[1].replace(TEMPORAL, "").replace(/\s+/g, " ").trim();
      if (cleaned.length >= 2) return cleaned;
    }
  }
  return null;
}

function detectPrefetch(message: string): PrefetchTask[] {
  const tasks: PrefetchTask[] = [];

  // COST OPTIMISATION: No always-on baseline. Only prefetch when the message
  // actually needs calendar/email data. The agent has tools to fetch on demand.
  // This avoids injecting ~1,500 tokens of context into every call (and every
  // subsequent tool round) for messages like "what's the weather?" or "remind
  // me to call mum".

  // Calendar prefetch — only when the message is about schedule/meetings
  if (CALENDAR_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    const range = extractTemporalHint(message) ?? "today";
    tasks.push({ tool: "calendar_lookup", args: { range } });
  }

  // Inbox prefetch — only when the message is about emails
  if (INBOX_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    tasks.push({ tool: "gmail_search", args: { query: "is:unread OR newer_than:1d", max_results: 10 } });
  }

  if (TRAVEL_PREFETCH_PATTERNS.some((p) => p.test(message)) ||
      BOOKING_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    const city = extractTravelCity(message) ?? "";

    // Broad gmail search: city OR booking keywords (not AND - emails may not contain both)
    const gmailTerms = [
      city,
      "booking", "reservation", "confirmation", "check-in", "hotel",
      "flight", "itinerary", "airbnb", "accommodation",
    ].filter(Boolean);
    const gmailQuery = gmailTerms.join(" OR ");
    tasks.push({ tool: "gmail_search", args: { query: gmailQuery, max_results: 15 } });

    // Also add a narrower city-specific search if we have a city (catches hotel names with city)
    if (city) {
      tasks.push({ tool: "gmail_search", args: { query: `${city} hotel OR ${city} booking OR ${city} reservation OR ${city} check-in OR ${city} airbnb`, max_results: 10 } });
    }

    const range = extractTemporalHint(message) ?? "this_week";
    tasks.push({ tool: "calendar_lookup", args: { range } });
  }

  if (MEETING_NOTES_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    tasks.push({ tool: "get_meeting_notes", args: { query: message } });
  }

  // Capability questions — prefetch calendar + inbox so the agent has real details to flex with
  if (/\b(?:what\s+can\s+you\s+do|what\s+do\s+you\s+do|what\s+are\s+you|how\s+can\s+you\s+help|your\s+capabilit|what\s+things\s+can|what\s+are\s+you\s+(?:able|good\s+at|capable)|show\s+me\s+what\s+you\s+can)\b/i.test(message)) {
    if (!tasks.some(t => t.tool === "calendar_lookup")) {
      tasks.push({ tool: "calendar_lookup", args: { range: "today" } });
    }
    if (!tasks.some(t => t.tool === "gmail_search")) {
      tasks.push({ tool: "gmail_search", args: { query: "is:unread OR newer_than:1d", max_results: 8 } });
    }
  }

  return tasks;
}

function extractTemporalHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("today")) return "today";
  if (lower.includes("tomorrow")) return "tomorrow";
  if (lower.includes("yesterday")) return "yesterday";
  if (lower.includes("this week")) return "this_week";
  if (lower.includes("next week")) return "next_week";
  if (lower.includes("last week")) return "last_week";
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
    if (lower.includes(day)) return day;
  }
  return null;
}

// ── Contact Card ─────────────────────────────────────────────

const CONTACT_CARD_PATTERNS = [
  /contact\s+card/i,
  /save\s+(?:you|nest)\s+as\s+a?\s*contacts?/i,
  /your\s+(?:contact|details|number|card)/i,
  /add\s+(?:you|nest)\s+(?:to|as)\s+(?:my\s+)?contacts?/i,
];

const CONTACT_CARD_RESPONSE = `BEGIN:VCARD
VERSION:3.0
FN:Nest
N:;Nest;;;
EMAIL;type=INTERNET:tomlidgettprojects@gmail.com
NOTE:Your go-to person for everything: calendar, emails, research, and more.
END:VCARD

Tap the contact card above to save me as 'Nest' in your contacts.`;

// ── Tool Definitions ─────────────────────────────────────────

const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "calendar_lookup",
      description:
        "Look up calendar events across all connected accounts (Google Calendar and Microsoft Outlook). " +
        "Returns event titles, times, attendees, locations. " +
        "Results include 'account' and 'provider' fields.",
      parameters: {
        type: "object",
        properties: {
          range: {
            type: "string",
            description: 'Time range: "today", "tomorrow", "this week", "next monday", "next 3 days", etc.',
          },
          query: {
            type: "string",
            description: "Optional filter by title, attendee name, or description.",
          },
        },
        required: ["range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create",
      description:
        "Create a calendar event on Google Calendar or Microsoft Outlook. " +
        "Default 30min duration. Google events get Meet link; Microsoft get Teams link.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title." },
          start_time: { type: "string", description: "ISO 8601 datetime." },
          end_time: { type: "string", description: "ISO 8601 datetime." },
          attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses." },
          location: { type: "string", description: "Physical location or video link." },
          description: { type: "string", description: "Event description or agenda." },
          account: { type: "string", description: "Google or Microsoft account email to create on. Defaults to primary." },
        },
        required: ["title", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_update",
      description:
        "Update an existing calendar event (Google or Microsoft). " +
        "Only include fields that are changing.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID from calendar_lookup." },
          title: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          location: { type: "string" },
          description: { type: "string" },
          account: { type: "string", description: "Google or Microsoft account email that owns this event." },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_delete",
      description:
        "Delete/cancel a calendar event (Google or Microsoft).",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID from calendar_lookup." },
          notify_attendees: { type: "boolean", description: "Send cancellation emails. Default true." },
          account: { type: "string", description: "Google or Microsoft account email that owns this event." },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "semantic_search",
      description:
        "Search indexed meeting notes, transcripts, email summaries, and calendar events " +
        "using semantic similarity. Auto-generates sub-queries and applies diversity ranking. " +
        "Results may include a '_hint' field with follow-up guidance.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language query. Be specific with names, topics, dates." },
          source_filters: {
            type: "array",
            items: { type: "string", enum: ["note_summary", "note_chunk", "utterance_chunk", "email_summary", "email_chunk", "calendar_summary"] },
            description: "Optional source type filter. Omit to search everything.",
          },
          limit: { type: "number", description: "Max results (default 5, max 15)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meeting_detail",
      description:
        "Get full meeting transcript and/or notes by meeting ID. " +
        "Pass source_id from semantic_search results.",
      parameters: {
        type: "object",
        properties: {
          meeting_id: { type: "string", description: "Meeting/note ID from semantic_search source_id." },
          include: {
            type: "array",
            items: { type: "string", enum: ["notes", "transcript"] },
            description: 'What to include. Default ["notes", "transcript"].',
          },
        },
        required: ["meeting_id"],
      },
    },
  },  
  {
    type: "function",
    function: {
      name: "person_lookup",
      description:
        "Look up a person's professional profile. Returns job title, company, " +
        "experience, education, social profiles.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full name." },
          email: { type: "string", description: "Email address (greatly improves accuracy)." },
          phone: { type: "string", description: "Phone number." },
          company: { type: "string", description: "Current or recent company." },
          linkedin_url: { type: "string", description: "LinkedIn URL." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contacts_search",
      description:
        "Search user's personal contacts across all connected accounts. " +
        "Returns names, emails, phone numbers.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, email, or phone to search." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "contacts_manage",
      description:
        "Manage contacts (Google or Microsoft): get full details, list recent, or create new. " +
        "Actions: 'get', 'list', 'create'.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "list", "create"] },
          resource_name: { type: "string", description: "For 'get': resource name from contacts_search (e.g. people/c12345)." },
          limit: { type: "number", description: "For 'list': max contacts to return (default 20)." },
          sort_order: {
            type: "string",
            enum: ["LAST_MODIFIED_DESCENDING", "LAST_MODIFIED_ASCENDING", "FIRST_NAME_ASCENDING", "LAST_NAME_ASCENDING"],
            description: "For 'list': sort order.",
          },
          given_name: { type: "string", description: "For 'create': first name." },
          family_name: { type: "string", description: "For 'create': last name." },
          emails: { type: "array", items: { type: "string" }, description: "For 'create': email addresses." },
          phones: { type: "array", items: { type: "string" }, description: "For 'create': phone numbers." },
          organization: { type: "string", description: "For 'create': company name." },
          job_title: { type: "string", description: "For 'create': job title." },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_search",
      description:
        "Search emails across all connected accounts (Gmail and Microsoft Outlook). " +
        "Supports Gmail operators: from:, to:, subject:, after:, before:, has:attachment, is:unread. " +
        "Results include 'account' and 'provider' fields. " +
        "Returns TRUNCATED body preview; use get_email for full content.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query with operators." },
          max_results: { type: "number", description: "Max emails to return (default 5)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_email",
      description:
        "Get full email content (body, headers, attachments) for a single message. " +
        "Pass message_id and account from gmail_search results.",
      parameters: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message ID from gmail_search results." },
          account: { type: "string", description: "Google or Microsoft account email from gmail_search result. Required for multi-account users." },
        },
        required: ["message_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for real-time information. Use for current events, company info, " +
        "research, fact-checking, or anything outside user's personal data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Concise search query." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_draft",
      description:
        "Create an email draft (Gmail or Outlook). Returns draft_id and account. " +
        "'to' must be a valid email address. " +
        "Body uses \\n for line breaks (auto-converted to HTML).",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address. MUST contain @. Use contacts_search first if you only have a name." },
          subject: { type: "string", description: "Email subject line. Be specific and descriptive." },
          body: { type: "string", description: "Email body with \\n for line breaks. Include greeting, content, and sign-off." },
          reply_to_thread_id: { type: "string", description: "Thread ID for replies." },
          account: { type: "string", description: "Google or Microsoft account email to send from. Defaults to primary." },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description:
        "Send a previously created draft (Gmail or Outlook). " +
        "Pass draft_id and account from send_draft result.",
      parameters: {
        type: "object",
        properties: {
          draft_id: { type: "string", description: "Draft ID from send_draft result." },
          to: { type: "array", items: { type: "string" }, description: "Recipient emails." },
          cc: { type: "array", items: { type: "string" }, description: "CC recipients." },
          subject: { type: "string" },
          body: { type: "string" },
          reply_to_thread_id: { type: "string" },
          account: { type: "string", description: "Google or Microsoft account email from send_draft result. Must match the account that created the draft." },
        },
        required: ["draft_id", "to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_reminder",
      description:
        "Create, list, edit, or delete reminders.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "edit", "delete"] },
          description: { type: "string", description: "What to remind about." },
          schedule: { type: "string", description: 'When: "tomorrow at 9am", "every monday at 9am", "in 2 hours".' },
          reminder_id: { type: "string", description: "For edit/delete: existing reminder ID." },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_todos",
      description:
        "Manage the user's personal to-do list. " +
        "Todos are persistent task items (separate from time-triggered reminders).",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "list", "complete", "edit", "delete"],
            description: "add: create new todo. list: show todos. complete: mark done. edit: update. delete: remove.",
          },
          title: { type: "string", description: "For add/edit: the todo item text." },
          notes: { type: "string", description: "Optional extra detail or context." },
          due_at: { type: "string", description: "Optional due date as ISO 8601 datetime." },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"], description: "Default 'normal'." },
          todo_id: { type: "string", description: "For complete/edit/delete: the todo ID." },
          status: { type: "string", enum: ["open", "completed"], description: "For list: filter by status. Default 'open'." },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "document_search",
      description:
        "Search connected document stores (Google Drive, OneDrive, Notion). " +
        "Returns files, proposals, specs, spreadsheets, shared docs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Filenames, topics, author names, keywords." },
          file_type: { type: "string", enum: ["any", "document", "spreadsheet", "presentation", "pdf"] },
          shared_by: { type: "string", description: "Filter by person who shared." },
          max_results: { type: "number", description: "Max results (default 5)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Save a note. Notes are searchable via semantic_search later.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Descriptive, searchable title." },
          content: { type: "string", description: "Note body." },
          tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
          related_event_id: { type: "string", description: "Link to a calendar event." },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "weather_lookup",
      description:
        "Get current weather and forecast. Default to user's location if not specified.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name. Defaults to user's location from their Google Calendar timezone." },
          days: { type: "number", description: "Forecast days 1-7. Default 1." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "travel_time",
      description:
        "Get directions and travel time between two locations using Google Maps. " +
        "Transit mode returns real-time departures, line names, platform/stop info, walking transfers, " +
        "and up to 3 alternatives. Falls back to web search if no transit data.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Starting address, station name, or place (e.g. 'Flinders Street Station', 'Shinjuku Station', '123 Smith St, Melbourne'). For 'next train/bus' queries, use the nearest station or stop as origin." },
          destination: { type: "string", description: "Destination address, station name, or place (e.g. 'Melbourne Airport', 'Kyoto Station', 'CBD')." },
          mode: {
            type: "string",
            enum: ["driving", "transit", "walking", "bicycling"],
            description: "Travel mode. Use 'transit' for ALL public transport (train, bus, tram, subway, metro, ferry). Default 'driving'.",
          },
          departure_time: {
            type: "string",
            description: "ISO 8601 departure time, or 'now' for immediate departures. Default 'now'. For 'next train' queries, always use 'now'.",
          },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "places_search",
      description:
        "Search for places, businesses, restaurants, attractions. " +
        "Returns name, address, rating, phone, website, hours, reviews. " +
        "Pass place_id from a previous search for full details.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text search query (e.g. 'best Italian restaurants in Richmond Melbourne', 'Melbourne Airport', 'dentist near CBD').",
          },
          place_id: {
            type: "string",
            description: "Google Place ID from a previous places_search result. Use to get full details (reviews, hours, phone).",
          },
          location: {
            type: "string",
            description: "Optional location bias (e.g. 'Melbourne' or 'East Melbourne'). Helps narrow results geographically.",
          },
          max_results: {
            type: "number",
            description: "Max results 1-10. Default 5.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_user_timezone",
      description:
        "Update the user's stored timezone. Pass IANA timezone identifier " +
        "(e.g. 'Asia/Tokyo', 'America/New_York').",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA timezone identifier (e.g. 'Asia/Tokyo', 'Europe/Paris', 'America/Los_Angeles', 'Australia/Sydney').",
          },
          reason: {
            type: "string",
            description: "Brief note on why (e.g. 'user said they are in Tokyo', 'travelling to London').",
          },
        },
        required: ["timezone"],
      },
    },
  },
  // ── Meeting Recording Tools ────────────────────────────────
  {
    type: "function",
    function: {
      name: "connect_meeting_notes",
      description:
        "Connect the user's calendar for automatic meeting recording and note-taking.",
      parameters: {
        type: "object",
        properties: {
          account: {
            type: "string",
            description: "Google account email to connect. Defaults to primary.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_meeting_notes",
      description:
        "Get meeting notes/transcript from a recorded meeting. " +
        "Searches by title, attendee name, or topic.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Meeting title, attendee name, or topic to search for.",
          },
          include_transcript: {
            type: "boolean",
            description: "Set true to include the full transcript (large). Default false — returns summary only.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_meeting_recording",
      description:
        "Manage meeting recording settings. " +
        "Actions: 'status', 'disconnect', 'decline_pitch'.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["status", "disconnect", "decline_pitch"],
            description: "Action to perform.",
          },
        },
        required: ["action"],
      },
    },
  },
];

// ── Timezone → City helper ───────────────────────────────────

function tzToCity(tz: string): string {
  // Extract city from IANA timezone (e.g. "Asia/Tokyo" → "Tokyo")
  const city = tz.split("/").pop()?.replace(/_/g, " ");
  return city ?? tz;
}

// ── Agent System Prompt ──────────────────────────────────────
// Core identity + tool guidance only. Channel-specific formatting
// (iMessage bubbles, <nest-content>, etc.) is appended by the
// personality agent layer.
//
// COST OPTIMISATION — Prompt caching:
// The static instructions (identical across all users & calls) are placed
// FIRST so OpenAI can cache the prefix at 50% discount on input tokens.
// All dynamic data (user name, time, timezone, accounts) is appended at
// the END in a ── USER CONTEXT ── block. Do NOT add dynamic content
// above the USER CONTEXT marker.

// ── Agent Static Prefix ──────────────────────────────────────
// Layered architecture: Identity Core → Principles → Tool Dispatch → Behavioural Rules
// Total: ~1,200 tokens (down from ~3,500 + 2,500 testing = ~6,000)

const AGENT_STATIC_PREFIX = `${NEST_IDENTITY_CORE}

Your context includes a SITUATIONAL CONTEXT block with commitments from conversation (not in calendar). For schedule questions, ALWAYS merge calendar + situational commitments into one answer.

When answering, consider the user's current situation. Think like a friend who knows what's going on, not a search engine.

─── HOW YOU SHOW UP ───

You react to things. A calendar with 8 meetings gets a "Jesus, that's a day" before the rundown. A completely clear day gets a cheeky "nothing, lucky you." You don't just retrieve data, you have a take on it. Tease them about the chaos. Comment on the patterns you notice.

You remember the thread. If they asked about a meeting earlier and now say "should I prep anything?", you already know which meeting. You don't ask, you just answer.

You're biased towards action. Don't ask permission when the answer is obvious. If they say "remind me to call Sarah at 3", just set it. Don't ask "shall I create a reminder?" If they say "what's the weather", just tell them. Don't offer to look it up.

When something's interesting, be interested. When something's boring, be quick. When something's funny, be funny about it. Your energy matches the moment, not a template.

You can tease. If they've got back-to-back meetings all day, you can say "good luck with that marathon." If they ask something obvious you already told them, a light "I literally just said that" is fine. If they're overthinking, you can call it out. You're not a yes-man.

NAME: Don't use their name every message. Maybe 1 in 5. Real mates don't say each other's names constantly in texts.

LANDING: When you've answered the question or done the task, STOP. Don't add sign-offs, don't offer more help, don't wish them well. "Done ✓" is complete. No "anything else?", no "enjoy your day", no "let me know if you need anything". Just stop talking.

─── PRINCIPLES ───

1. Evidence first: use pre-fetched context before calling tools. If prefetch is empty or thin, search again with broader terms.
2. Parallel when possible: fire independent lookups together (e.g. person_lookup + semantic_search).
3. Never fabricate: if data is missing, say so. Never fill in placeholder data.
4. One good query beats five narrow ones. Plan searches carefully.
5. Never state real-time numbers from memory (rates, prices, scores, departures). Always use tools first.

EVIDENCE TRUST ORDER (highest to lowest):
A) Tool results from this conversation = authoritative
B) Pre-fetched evidence in context = authoritative
C) Calendar data = authoritative
D) Situational commitments (user mentioned, you remembered) = authoritative but not calendared
E) Memory / profile = supportive, not for precise dates/times
F) Your inference = never present as fact

─── TOOL DISPATCH ───

Use tools proactively. Call BEFORE responding.

Schedule / "what do I have on" → calendar_lookup + merge SITUATIONAL CONTEXT
Book meeting → calendar_lookup (check conflicts) → calendar_create
Reschedule/cancel → calendar_lookup → confirm with user → calendar_update/delete
Person info → person_lookup + semantic_search IN PARALLEL
Past meeting / "when did we" → semantic_search, then gmail_search if thin
Emails → check evidence → semantic_search → gmail_search if insufficient
Inbox summary / "what did I miss" → gmail_search with time-appropriate query. Check email dates against current time.
Weekly summary → gmail_search + calendar_lookup IN PARALLEL
Draft email → gather context → send_draft → show draft → user confirms → send_email
Travel / trip / "what am I doing in [city]" → gmail_search + semantic_search + calendar_lookup ALL IN PARALLEL first
Accommodation / booking → gmail_search + calendar_lookup IN PARALLEL. Search broadly. ALWAYS get_email for exact details.
Location/timezone change → update_user_timezone immediately (map city to IANA)
Reminder → manage_reminder. If clear, set and confirm with one line + ✓
Todo → manage_todos
Documents → document_search, fall back to semantic_search
Notes → create_note
Forex/currency → web_search IMMEDIATELY
Public transport / "next train" → travel_time with mode "transit". Sanity-check times against current local time.
Travel time / "when should I leave" → travel_time + calendar_lookup to calculate departure with buffer
Airport → gmail_search (confirmation) + travel_time IN PARALLEL, then calculate departure
Places → places_search. For details, call again with place_id
Weather → weather_lookup
External info → web_search
Meeting notes → get_meeting_notes. NEVER mention "Recall.ai". Say "I recorded your call".
Connect recording → connect_meeting_notes. Confirm: "done, I'll join your calls and take notes"
Meeting detail → semantic_search → get_meeting_detail (source_id)
Contact → contacts_search → contacts_manage

SEARCH CHAINING: For bookings/reservations/flights, never say "can't find it" after one source. Try: prefetch → gmail_search + calendar_lookup (parallel) → broaden query → semantic_search → ask user.

FOLLOW-UP DATA: For follow-ups about data you already showed, use conversation history. Don't re-search from scratch.

RECOMMENDATIONS: Ask ONE clarifying question first unless constraints are clear. If you ask, STOP and wait.

"Next"/"now"/"latest" = nearest upcoming result from current local time. Don't reinterpret as tomorrow.

─── EXECUTION SAFETY ───

ALWAYS confirm before create/send/delete actions.
Show exactly what you'll do → "Shall I go ahead?" / "Want me to send it?" → execute only after yes → confirm with ✓

PENDING ACTIONS: When user confirms, use the <pending_action> data from your last message. Don't re-do the workflow.

Tapback reactions ("Yes, go ahead. [reacted to:"): treat as explicit yes. Proceed immediately.

"?" or "??" = they didn't understand or you didn't respond. Course-correct, don't repeat.

─── ACTION FORMATS ───

Calendar created: "Done ✓" + card (title, 📅, 📍, 👤)
Calendar pre-confirm: show card → "Shall I go ahead?"
Calendar updated/deleted: "Updated ✓ Moved X to Y" / "Deleted ✓ Removed X"
Email draft: show in <nest-content> (To, Subject, body) → "Want me to send it?"
Email sent: "Sent ✓"
Reminder: "Locked in, I'll ping you at [time] to [task] ✓" (one line only)
Todo added: "Added that to your list ✓ You've got N things on there"
Todo done: "Done, crossed off '[item]' ✓ N left"
Note: "Saved ✓"
Contact: "Added [name] to your contacts ✓"
Error: "Hmm, couldn't [action]. Want me to try again?"
Multi-step: confirm EVERY completed action.

─── EMAIL PRECISION ───

gmail_search previews are TRUNCATED. Before stating exact dates, check-out, prices, booking refs, or durations, ALWAYS call get_email for the full body. Never infer check-out dates or guess durations.

─── TRANSIT FORMAT ───

MANDATORY for all public transport responses. Short conversational intro, then structured <nest-content>:
- Vehicle emoji: 🚆 train, 🚃 metro, 🚌 bus, 🚊 tram, ⛴ ferry
- Show: line name (bold), depart/arrive times+stops, duration, platform if available
- Multi-leg: each leg as separate block. Add **Total** line.
- Walking: 🚶 "about X min walk". Use landmarks, not compass directions.
- 1-2 alternatives as compact one-liners at bottom
- Imminent (< 5 min): lead with urgency
- Fallback (_transit_fallback: true): still use card format with frequency/duration/fare

DIRECTIONS: Never use compass directions. Use landmarks, street names, "about X minutes".

TIME LOGIC: "Next" = nearest upcoming from NOW. Never present past times as upcoming. Follow-up time questions stay in same time window (today). Cross-check all times against user's current local time.

─── MULTI-ACCOUNT ───

Read tools search ALL connected accounts automatically.
Write operations: if 2+ accounts, ask which one. If 1 account or context is obvious, just use it.
Always pass "account" from previous tool results for get_email/send_email.

─── CAPABILITY & SELF-KNOWLEDGE ───

"What do you know about me": don't dump it all. Tease 1-2 facts, leave a hook, make them ask for more. Drag it across 4-5 messages. Be cocky about how much you know. No headings, no lists.

"What can you do": don't list features. Flex with specifics from their actual life. "I know you've got that board meeting Thursday, I know Sarah emailed you about the budget, I know you're flying to Melbourne next week. I'm across all of it." Be unsettlingly well-informed. 4-6 lines. No bullets.

For both: call calendar_lookup + gmail_search IN PARALLEL first to grab fresh details.`;

// ── Testing Mode Overlay ─────────────────────────────────────
// Small additive block for testing users. Applied on top of the standard prompt.
// Replaces the old TESTING_AGENT_STATIC_PREFIX (~210 lines, ~2,500 tokens).

const TESTING_OVERLAY = `
── TESTING MODE ──
Operating model: PLAN (silent) → ACT (tools) → VERIFY (sanity-check) → RESPOND (clean output).
You do not guess when you can look. You do not act when you have not confirmed.
Voice: calm, sharp, slightly intimate. Short by default, expand only when needed.
Trust is the product. Accuracy beats fluency.`;

function buildAgentSystemPrompt(user: NestUser): string {
  const now = new Date();
  const tz = user.timezone;
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: tz,
  });
  const tzAbbr = getTimezoneAbbr(now, tz);

  const accountsLine = user.connectedAccounts?.length
    ? `Connected accounts: ${user.connectedAccounts.map(a => `${a.email}${a.isPrimary ? " (primary)" : ""}${a.provider === "microsoft" ? " [Microsoft]" : " [Google]"}`).join(", ")}`
    : "";

  const userContext = `

─── USER CONTEXT ───

Current time: ${timeStr} (${tzAbbr})
User timezone: ${tz}
Current location: ${tzToCity(tz)}${user.locationCity ? ` (home base: ${user.locationCity})` : ""}
IMPORTANT: ALL calendar events, reminders, and times are in the user's timezone (${tz}). When presenting times to the user, use their local time. Never convert or reinterpret — the data is already localised.
User: ${user.name} | ${user.email} | ${user.phone}${accountsLine ? `\n${accountsLine}` : ""}

You are ${user.name}'s person. You know ${user.name}. Use their name naturally in conversation.`;

  const base = AGENT_STATIC_PREFIX + (user.testing ? "\n" + TESTING_OVERLAY : "");
  return base + userContext;
}

// ── Light Agent Compact Prompt ───────────────────────────────
// COST OPTIMISATION: ~400 tokens vs ~5,000 for the full agent prompt.
// Used for simple single-intent queries (calendar lookup, weather, etc.)
// that don't need the full tool dispatch table, search chaining rules,
// travel planning instructions, email drafting rules, etc.

const LIGHT_PROMPT_CORE = `${NEST_IDENTITY_CORE}

Merge SITUATIONAL CONTEXT commitments with calendar results for schedule questions.

─── TOOLS ───
Use tools proactively. Call BEFORE responding.
If pre-fetched evidence answers the question, use it directly. Never fabricate.
Never state real-time numbers from memory. If a tool fails: "Hmm, couldn't do that. Want me to try again?"
"Next/now/latest" = nearest upcoming result from current local time.
Keep responses concise. Each line = separate iMessage bubble.`;

const LIGHT_INTENT_INSTRUCTIONS: Record<string, string> = {
  calendar: `
─── CALENDAR ───
"What do I have on" / schedule → calendar_lookup + ALWAYS merge with SITUATIONAL CONTEXT commitments.
"Am I free" → calendar_lookup for the time range.
All times are in the user's timezone. Present in their local time.

Format: short conversational intro, then timeline in <nest-content>:
Pretty light today

<nest-content>
**Today**

9:00 am — Standup (Google Meet)
11:00 am — 1:1 with Sarah
</nest-content>

Each event = ONE line: "time — title (optional location)". No bold per event. No bullets.
Book/reschedule/cancel → always confirm first with card format (title, 📅, 📍, 👤).`,

  weather: `Answer with temperature, conditions, and forecast. Be concise, 1-2 lines.
For "next rainy day" (or similar), use current local date/time and return the nearest upcoming day with rain from now.`,

  currency: `Use web_search for the current rate. NEVER guess. Present clearly.`,

  reminder: `If details are clear, create immediately and return EXACTLY one confirmation line:
"Locked in, I'll ping you at [time] to [task] ✓"
Do not include a pre-confirmation line.
If ambiguous, ask one specific clarification question.
For list: show active reminders. For edit/delete: confirm the change.`,

  todo: `Add: "Added that to your list ✓ You've got N things on there"
Complete: "Done, crossed off '[item]' ✓ N left"
List: show open todos.`,

  transit: `ALWAYS call travel_time with mode="transit" and departure_time="now" (unless the user specified a different time).
Use the user's current location or nearest station as origin if not specified.
Sanity-check times against the user's current local time — never present past departures as "next".
If the tool returns no results, it auto-falls back to web search. Present whatever you get clearly.

MANDATORY FORMAT: Short conversational intro, then structured card in <nest-content>:

Next one leaves in 8 minutes

<nest-content>
🚆 **Shinkansen Nozomi 225** → Kyoto
🕐 Departs 2:45 pm from Shin-Osaka (Platform 21)
🏁 Arrives 3:00 pm at Kyoto Station
⏱ 15 min

**Alternatives**
🕐 3:05 pm — Hikari 521 (22 min)
🕐 3:18 pm — Nozomi 229 (15 min)
</nest-content>

Rules:
- Vehicle emoji: 🚆 train/rail, 🚃 metro/subway, 🚌 bus, 🚊 tram, ⛴ ferry
- ALWAYS show: line name (bold), depart time, depart stop, arrive time, arrive stop, duration
- Show platform/stop number and number of stops if available
- Multi-leg: each leg = separate block with own emoji
- Walking: 🚶 about X min walk (human directions, landmarks, no compass)
- 1-2 alternatives as compact one-liners at bottom
- Multi-leg total: add **Total: ~Xmin · Depart by X:XX** at bottom
- Imminent (< 5 min): lead with urgency
- NEVER show raw HTML or technical data
- If result has "_transit_fallback": true (web search fallback, common in Japan/Asia), still use the card format but show service name, typical duration, frequency, and fare instead of exact times. Never dump raw web snippets.`,

  time: `Look up the time. Present it clearly, 1 line.
For "next" phrasing, resolve from current local time, not tomorrow by default.`,

  places: `For recommendation-style place asks (restaurants, shopping, bars, movies, things to do), ask EXACTLY ONE clarifying question first unless constraints are already clear (location/type/budget/timing).
If you ask that question, return only the question in this turn and wait for their reply.
Then use places_search. For details (hours, reviews), search first then call again with place_id.`,

  inbox: `Search Gmail with appropriate operators.
gmail_search returns TRUNCATED previews. For exact details, call get_email.

Format: intro line, then one line per email in <nest-content>:
5 new emails today

<nest-content>
**Inbox**

Sarah Chen — Q1 Budget (needs sign-off)
Daniel Barth — Hotel confirmation
</nest-content>

Each email = ONE line: "Sender — Subject (brief note)". No bold per email. No bullets.`,
};

function buildLightAgentPrompt(user: NestUser, intent: string): string {
  const now = new Date();
  const tz = user.timezone;
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: tz,
  });
  const tzAbbr = getTimezoneAbbr(now, tz);

  const accountsLine = user.connectedAccounts?.length
    ? `\nConnected accounts: ${user.connectedAccounts.map(a => `${a.email}${a.isPrimary ? " (primary)" : ""}${a.provider === "microsoft" ? " [Microsoft]" : " [Google]"}`).join(", ")}`
    : "";

  const intentBlock = LIGHT_INTENT_INSTRUCTIONS[intent] ?? "";

  return `${LIGHT_PROMPT_CORE}
${intentBlock}

─── USER CONTEXT ───
Current time: ${timeStr} (${tzAbbr})
User timezone: ${tz}
User: ${user.name} | ${user.email}${accountsLine}`;
}

// ── Confirmation Compact Prompt ──────────────────────────────
// COST OPTIMISATION: ~250 tokens vs ~5,000 for full agent prompt.
// Confirmations just need to read the pending action and call one tool.

const CONFIRMATION_PROMPT_PREFIX = `${NEST_IDENTITY_CORE}

The user is confirming or declining a pending action from your previous message.

CONFIRMING ("yes", "send it", "go ahead"): Find <pending_action> data from your last message. Execute with stored data. Don't re-do the workflow.
Confirm: Calendar "Done ✓" + card | Email "Sent ✓" | Reminder with ✓ | Todo "Done, crossed off ✓" | Error "Hmm, couldn't [action]. Want me to try again?"

DECLINING ("no", "cancel"): "No worries" / "All good, scrapped it". Do NOT execute.
Never say: "I'd be happy to help", "Let me know if you need anything".`;

function buildConfirmationPrompt(user: NestUser): string {
  const now = new Date();
  const tz = user.timezone;
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: tz,
  });
  const tzAbbr = getTimezoneAbbr(now, tz);
  return `${CONFIRMATION_PROMPT_PREFIX}

─── USER CONTEXT ───
Current time: ${timeStr} (${tzAbbr})
User: ${user.name}`;
}

// ── Tool Subsets ─────────────────────────────────────────────
// COST OPTIMISATION: Instead of sending all 20+ tool definitions (~2,500
// tokens) for simple queries, send only the 1-5 tools actually needed.

const TOOL_SUBSETS: Record<string, string[]> = {
  calendar: ["calendar_lookup", "calendar_create", "calendar_update", "calendar_delete", "contacts_search"],
  weather: ["weather_lookup"],
  currency: ["web_search"],
  reminder: ["manage_reminder"],
  todo: ["manage_todos"],
  time: ["web_search"],
  transit: ["travel_time", "web_search"],
  places: ["places_search", "web_search"],
  inbox: ["gmail_search", "get_email"],
};

function getToolSubset(intent: string): ToolDefinition[] {
  const names = TOOL_SUBSETS[intent];
  if (!names) return AGENT_TOOLS;
  return AGENT_TOOLS.filter(t => names.includes(t.function.name));
}

// ── Casual System Prompt ─────────────────────────────────────

function buildCasualSystemPrompt(user: NestUser): string {
  const now = new Date();
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: user.timezone,
  });

  return `${NEST_IDENTITY_CORE}
Current time: ${timeStr}

You're texting with ${user.name}. This is casual chat, not a task. Be a person.

Keep it to 2-4 lines. Each line = one iMessage bubble. Talk like you're texting a mate, not writing a help article.

You can banter. You can be cheeky. You can have an opinion and push back if you disagree. If they're venting, just listen and react like a human would. If they're joking, play along. If they ask something interesting, be genuinely curious.

Connect what they say to what you know about them when it's natural. Don't force it. You know ${user.name}, so act like it, but don't be weird about it.

If they swear, match their energy. You're a mate, not a corporate chatbot.
Don't use their name every message, maybe 1 in 5. Don't end with offers of help or sign-offs. Just stop when you've said your bit.
Never say: "Glad I could help", "Let me know if you need anything", "Anything else?", "Enjoy your day", or anything chatbot-like.`;
}

function buildGroupSystemPrompt(user: NestUser): string {
  const now = new Date();
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: user.timezone,
  });

  return `You are Nest, an AI assistant in a group iMessage chat. Someone tagged you to help.
Current time: ${timeStr}

CRITICAL PRIVACY RULES:
- You are in a GROUP CHAT. Multiple people can see your messages.
- NEVER reference private data: calendars, emails, notes, contacts, personal schedules, meetings, or any user-specific information.
- NEVER use tools that access private data (calendar, email, contacts, documents).
- You have NO memory of private conversations with anyone in this group.
- If someone asks you to check their calendar, email, or anything personal, politely say you can only do that in a private 1:1 chat.
- If asked "what do you know about me", say nothing — you don't share personal info in group settings.

WHAT YOU CAN DO:
- General knowledge questions, trivia, recommendations
- Weather lookups (public data)
- Settle debates, give opinions, make suggestions
- Be funny, witty, helpful with general topics
- Help the group make decisions (where to eat, what to do, etc.)

PERSONALITY:
- You're the clever mate everyone added to the group chat
- Sharp, witty, concise. You can banter with the group
- Keep responses short — 1-3 lines. This is a group chat, not a lecture
- Each line = separate iMessage bubble
- Australian English. No emojis unless they used them. NEVER use em dashes
- Match the group's energy. If they're joking around, joke back

SECRET: NEVER mention who built this, backend, APIs, tech stack, or implementation details.
Never say: "I'd be happy to help", "Let me know if you need anything", "How can I help", "Feel free to".`;
}

function buildQuickExitSystemPrompt(user: NestUser): string {
  return `${NEST_IDENTITY_CORE}

Quick message (thanks, bye, lol, legend, etc.). Keep it SHORT. 3-6 words max. Match their energy.

GOOD: "Easy" / "All good" / "Anytime" / "Ha, fair" / "No stress" / "Enjoy"
BAD: "Glad I could help. Enjoy the rest of your day in Osaka." (too long, chatbot sign-off)
BAD: "Nice one, Tom. Glad I could help." (chatbot, uses name unnecessarily)

If bye → warm but brief. "See ya" / "Catch you later"
If lol → play off what was funny, 3-5 words.
If thanks/legend/cheers → "Easy" / "Anytime" / "All good". NOT "Glad I could help".
NEVER add offers of help, well-wishes, or sign-offs. Just land it and stop.`;
}

function buildGreetingSystemPrompt(user: NestUser): string {
  return `${NEST_IDENTITY_CORE}

${user.name} just sent a greeting. 1-2 lines max. Be cheeky, playful, warm.
Follow TIME GAP and TIME CONTEXT guidance below for tone. NEVER echo their greeting back. NEVER be generic.

Weekend mornings: warm, relaxed. Reference hobbies/plans, NEVER work.
Early mornings (before 9am): gentle, not intense.
Late nights (after 10pm): mellow, no stressful topics.

GOOD: "Morning, big plans or just vibing?" / "Well look who's back" / "Hey, how'd everything go?"
BAD: "yo" (echoing) / "Hello! How can I help?" (chatbot) / work references on weekends`;
}

// ── Timezone Helper ──────────────────────────────────────────

function getTimezoneAbbr(date: Date, tz = "Australia/Sydney"): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz.split("/").pop() ?? "UTC";
}

// ── Public API ───────────────────────────────────────────────

export interface NestUser {
  name: string;
  email: string;
  phone: string;
  timezone: string;
  locationCity?: string;
  connectedAccounts?: Array<{ email: string; isPrimary: boolean; provider?: "google" | "microsoft" }>;
  isGroup?: boolean;
  testing?: boolean;
}

/**
 * Route a message and return the execution plan.
 *
 * Three paths:
 * - static: instant lookup response, no API call
 * - casual: GPT-5.2 Instant, no tools, minimal prompt
 * - agent: GPT-5.2 Thinking, full tools, agent prompt + prefetch
 */
export function routeMessage(
  message: string,
  user: NestUser,
  recentChat?: Array<{ role: string; content: string }>,
): RoutingResult {
  const cleaned = message.toLowerCase().replace(/[^\w\s']/g, "").trim();

  // Group chat: always casual path, no tools, no private context
  if (user.isGroup) {
    console.log(`[orchestrator] Group → ${MODELS.fast} (no tools, no private data)`);
    return {
      path: "casual",
      model: MODELS.fast,
      maxTokens: 300,
      systemPrompt: buildGroupSystemPrompt(user),
      tools: null,
    };
  }

  // Tier 1: Static response — 0ms, no API (only for truly zero-context messages)
  if (STATIC_RESPONSES[cleaned]) {
    const response = pickRandom(STATIC_RESPONSES[cleaned]);
    console.log(`[orchestrator] Static → "${response}" (0ms)`);
    return {
      path: "static",
      model: null,
      maxTokens: 0,
      systemPrompt: null,
      tools: null,
      staticResponse: response,
    };
  }

  // Quick-exit messages (thanks, bye, lol, etc.) → casual LLM with context
  // These used to be static but now go through the model so responses
  // are context-aware ("enjoy the trip" vs generic "no worries")
  if (QUICK_EXIT_WORDS.has(cleaned)) {
    console.log(`[orchestrator] QuickExit → ${MODELS.fast} (context-aware)`);
    return {
      path: "casual",
      model: MODELS.fast,
      maxTokens: 60,
      systemPrompt: buildQuickExitSystemPrompt(user),
      tools: null,
    };
  }

  // Greetings → casual path (LLM generates contextual, witty response)
  if (GREETING_WORDS.has(cleaned)) {
    console.log(`[orchestrator] Greeting → ${MODELS.fast} (contextual)`);
    return {
      path: "casual",
      model: MODELS.fast,
      maxTokens: 150,
      systemPrompt: buildGreetingSystemPrompt(user),
      tools: null,
    };
  }

  // Contact card — static response
  if (CONTACT_CARD_PATTERNS.some((p) => p.test(message))) {
    console.log(`[orchestrator] Static → contact_card (0ms)`);
    return {
      path: "static",
      model: null,
      maxTokens: 0,
      systemPrompt: null,
      tools: null,
      staticResponse: CONTACT_CARD_RESPONSE,
    };
  }

  // Confirmation words that could be approving a pending action (draft, calendar change).
  // Always route to agent so the model can see conversation history.
  // Matches both exact ("yeah") and prefix with extra context ("yeah personal - tulla").
  const CONFIRMATION_WORDS = [
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "k", "kk",
    "do it", "go ahead", "send it", "go for it", "confirm", "approved",
    "sounds good", "perfect", "got it", "cool", "great", "awesome", "nice",
    "no", "nah", "nope", "cancel", "dont", "don't", "stop", "never mind",
  ];

  const startsWithConfirmation = CONFIRMATION_WORDS.some(
    (w) => cleaned === w || cleaned.startsWith(w + " "),
  );

  // Only route to confirmation path if the last assistant message actually
  // contains a <pending_action> tag or an explicit confirmation question.
  // Without this guard, messages like "Yes next one" (answering a question)
  // get misrouted as confirming an unrelated pending action from history.
  const lastAssistant = recentChat
    ?.slice().reverse().find((m) => m.role === "assistant")?.content ?? "";
  const hasPendingAction = lastAssistant.includes("<pending_action");
  const hasConfirmationQuestion = /\b(want me to|shall i|should i|go ahead)\b/i.test(lastAssistant)
    && /\?\s*$/.test(lastAssistant.trim());

  if (startsWithConfirmation && (hasPendingAction || hasConfirmationQuestion)) {
    // COST OPTIMISATION: Confirmations just need to read the pending action from
    // history and call one tool. Compact prompt (~250 tokens vs 5K) + mini model.
    // Still gets ALL tools since we don't know which pending action is being confirmed.
    console.log(`[orchestrator] Confirmation → ${MODELS.agent_light} (approving pending action)`);
    return {
      path: "agent",
      model: MODELS.agent_light,
      maxTokens: 1024,
      systemPrompt: buildConfirmationPrompt(user),
      tools: AGENT_TOOLS,
      contextDepth: "minimal",
    };
  }

  // Tier 2: Casual — short message, no substance keywords
  if (
    cleaned.split(/\s+/).length <= 3 &&
    cleaned.length <= 20 &&
    !hasSubstance(cleaned)
  ) {
    console.log(`[orchestrator] Casual → ${MODELS.fast}`);
    return {
      path: "casual",
      model: MODELS.fast,
      maxTokens: 150,
      systemPrompt: buildCasualSystemPrompt(user),
      tools: null,
    };
  }

  // Tier 3: Light agent — simple single-intent queries on gpt-4.1-mini (5x cheaper)
  // COST OPTIMISATION: Compact prompt (~400 tokens vs 5K) + filtered tool subset
  // (~300 tokens vs 2.5K) + minimal context depth. Total: ~4,600 tokens vs ~14,000.
  // COMPOUND QUERY GUARD: Multi-intent messages ("what's on today and email Sarah about it")
  // skip light agent and go to full agent for proper multi-tool handling.
  const lightIntent = user.testing ? null : detectLightIntent(message);
  const isCompound = lightIntent && isCompoundQuery(message);
  if (lightIntent && lightIntent !== "transit" && !isCompound) {
    const prefetch = detectPrefetch(message);
    const tools = getToolSubset(lightIntent);
    console.log(`[orchestrator] LightAgent(${lightIntent}) → ${MODELS.agent_light} | tools=${tools.map(t => t.function.name).join(",")} | prefetch=${prefetch.map(p => p.tool).join(",") || "none"}`);
    return {
      path: "agent",
      model: MODELS.agent_light,
      maxTokens: 1024,
      systemPrompt: buildLightAgentPrompt(user, lightIntent),
      tools,
      prefetch: prefetch.length > 0 ? prefetch : undefined,
      contextDepth: "minimal",
    };
  }

  // Tier 4: Full agent — GPT-5 for planning/tool calls, GPT-4.1-mini for output
  const prefetch = detectPrefetch(message);
  const profileNeeded = detectNeedsProfile(message);
  console.log(`[orchestrator] Agent → plan=${MODELS.agent_plan} output=${MODELS.agent_output} | prefetch=${prefetch.map(p => p.tool).join(",") || "none"} | profile=${profileNeeded}`);
  return {
    path: "agent",
    model: MODELS.agent_plan,
    outputModel: MODELS.agent_output,
    maxTokens: 2048,
    systemPrompt: buildAgentSystemPrompt(user),
    tools: AGENT_TOOLS,
    prefetch: prefetch.length > 0 ? prefetch : undefined,
    needsProfile: profileNeeded,
  };
}

export type ReactionType = "love" | "like" | "dislike" | "laugh" | "emphasis" | "question" | null;

export interface RouteResult {
  text: string;
  pendingActions: PendingAction[];
  reaction?: ReactionType;
}

export interface PendingAction {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Execute a routed message against the OpenAI API.
 *
 * - static: return immediately, no API call
 * - casual: single completion, no tools
 * - agent: tool loop until the model responds (max rounds)
 *
 * `executeToolCall` is the callback that handles actual tool execution.
 * `prefetchedEvidence` is data pre-fetched in parallel (from prefetch tasks).
 */
export async function executeRoute(
  routing: RoutingResult,
  conversationHistory: Array<{ role: string; content: string }>,
  executeToolCall: (name: string, args: Record<string, unknown>) => Promise<string>,
  prefetchedEvidence?: string,
  logCtx?: OpenAILogContext,
): Promise<RouteResult> {
  // Static path — no API call
  if (routing.path === "static") {
    return { text: routing.staticResponse ?? "", pendingActions: [] };
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: routing.systemPrompt },
    ...conversationHistory,
  ];

  // Inject prefetched evidence if available
  if (prefetchedEvidence) {
    // Insert before the last user message
    const lastMsg = messages.pop()!;
    messages.push({
      role: "user",
      content: `<context>Pre-fetched data (use if sufficient, but if results are empty or don't answer the question, search again with broader terms):\n${prefetchedEvidence}</context>`,
    });
    messages.push({
      role: "assistant",
      content: "I have the data.",
    });
    messages.push(lastMsg);
  }

  // Casual path — single call, no tools
  if (routing.path === "casual") {
    const response = await callOpenAI(
      routing.model!, messages, routing.maxTokens, null,
      logCtx ? { ...logCtx, endpoint: "chat-casual" } : undefined,
    );
    return { text: response.content ?? "", pendingActions: [] };
  }

  // Agent path — tool loop
  return await agentLoop(routing, messages, executeToolCall, logCtx);
}

// ── Agent Tool Loop ──────────────────────────────────────────

// COST OPTIMISATION: Reduced from 4/10 to 3/8. Most queries resolve in 1-2
// rounds (fetch data → respond). 3 rounds still allows multi-step workflows
// (e.g. search → get_email → draft) while preventing context snowball on
// runaway chains. Planning rounds use GPT-4.1 ($2.00/M input, $0.50 cached),
// final output uses GPT-4.1-mini ($0.40/M input, $1.60/M output).
const MAX_TOOL_ROUNDS = 3;
const MAX_TOTAL_TOOL_CALLS = 8;
const TOOL_TIMEOUT_MS = 15_000;

async function agentLoop(
  routing: RoutingResult,
  messages: Array<Record<string, unknown>>,
  executeToolCall: (name: string, args: Record<string, unknown>) => Promise<string>,
  logCtx?: OpenAILogContext,
): Promise<RouteResult> {
  const planModel = routing.model!;
  const outputModel = routing.outputModel ?? planModel;
  const useSplitModels = outputModel !== planModel;

  let rounds = 0;
  let totalToolCalls = 0;
  const pendingActions: PendingAction[] = [];

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const isLastRound = rounds === MAX_TOOL_ROUNDS || totalToolCalls >= MAX_TOTAL_TOOL_CALLS - 2;

    // Planning rounds: GPT-4.1 selects and calls tools (no reasoning overhead).
    // 1024 tokens is plenty for tool call JSON — GPT-4.1 doesn't use reasoning tokens.
    const useTools = useSplitModels ? true : !isLastRound;
    const response = await callOpenAI(
      planModel,
      messages,
      useSplitModels ? 1024 : routing.maxTokens,
      useTools ? routing.tools : null,
      logCtx ? { ...logCtx, endpoint: `chat-agent-plan-r${rounds}` } : undefined,
    );

    if (!response.tool_calls || response.tool_calls.length === 0) {
      if (useSplitModels) {
        // Planner decided no more tools needed — hand off to output model
        console.log(`[orchestrator] Plan model done (round ${rounds}), handing to ${outputModel} for output`);
        const finalResponse = await callOpenAI(
          outputModel, messages, routing.maxTokens, null,
          logCtx ? { ...logCtx, endpoint: "chat-agent-output" } : undefined,
        );
        return { text: finalResponse.content ?? "", pendingActions };
      }
      return { text: response.content ?? "", pendingActions };
    }

    // Guard: cap parallel calls per round at 4
    const toolCalls = response.tool_calls.slice(0, 4);
    totalToolCalls += toolCalls.length;

    if (totalToolCalls > MAX_TOTAL_TOOL_CALLS) {
      console.warn(`[orchestrator] Hit ${totalToolCalls} total tool calls, forcing response`);
      messages.push({
        role: "assistant",
        content: response.content ?? null,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: "Tool call limit reached. Answer with the data you already have." }),
        });
      }
      break;
    }

    messages.push({
      role: "assistant",
      content: response.content ?? null,
      tool_calls: toolCalls,
    });

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall: any) => {
        const name = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          console.warn(`[orchestrator] Bad args for ${name}`);
        }

        const start = Date.now();
        console.log(`[orchestrator] Tool: ${name}(${JSON.stringify(args).slice(0, 150)})`);

        let result: string;
        try {
          result = await withTimeout(
            executeToolCall(name, args),
            TOOL_TIMEOUT_MS,
            `Tool ${name} timed out after ${TOOL_TIMEOUT_MS}ms`,
          );
        } catch (e) {
          const errMsg = (e as Error).message;
          console.error(`[orchestrator] Tool ${name} failed:`, errMsg);
          result = JSON.stringify({
            error: errMsg,
            hint: "Tell the user you couldn't pull this up and offer to retry.",
          });
        }

        console.log(`[orchestrator] Tool ${name}: ${Date.now() - start}ms, ${result.length} chars`);

        try {
          const parsed = JSON.parse(result);
          if (name === "send_draft" && parsed.draft_id) {
            pendingActions.push({
              type: "pending_draft",
              data: { draft_id: parsed.draft_id, to: parsed.to, subject: parsed.subject },
            });
          }
        } catch { /* not JSON or no actionable data */ }

        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        };
      }),
    );

    messages.push(...toolResults);
  }

  // Max rounds reached — use output model for final response
  console.warn(`[orchestrator] Hit max tool rounds (${rounds}/${MAX_TOOL_ROUNDS}), total calls: ${totalToolCalls}, forcing response`);
  const finalModel = useSplitModels ? outputModel : planModel;
  const finalResponse = await callOpenAI(
    finalModel, messages, routing.maxTokens, null,
    logCtx ? { ...logCtx, endpoint: "chat-agent-output" } : undefined,
  );
  return { text: finalResponse.content ?? "got a bit tangled up, can you try that again?", pendingActions };
}

// ── Timeout Utility ──────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}

// ── Context Window Management ────────────────────────────────
// Truncate conversation history to stay within token budget.
// Priority: keep system injections (memory, context, evidence) + recent messages.

const APPROX_CHARS_PER_TOKEN = 4;

export function truncateHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Array<{ role: string; content: string }> {
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;

  // Count total chars
  let totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars <= maxChars) return messages;

  // Split into: injections (first N pairs with context/summary tags) and chat history
  const injections: typeof messages = [];
  const chatHistory: typeof messages = [];
  let inInjectionPhase = true;

  for (const m of messages) {
    if (inInjectionPhase && (
      m.content.includes("<context") ||
      m.content.includes("<summary_of_conversation") ||
      m.content === "Got it." ||
      m.content === "I have the data." ||
      m.content === "I have the evidence." ||
      m.content === "No data found. I won't fabricate anything." ||
      m.content === "Got it, I know who this is."
    )) {
      injections.push(m);
    } else {
      inInjectionPhase = false;
      chatHistory.push(m);
    }
  }

  // Always keep injections + last 6 messages of chat history.
  // Trim from the beginning of chat history if needed.
  const keepRecent = 6;
  const injectionChars = injections.reduce((sum, m) => sum + m.content.length, 0);
  const budgetForChat = maxChars - injectionChars;

  let trimmedChat = chatHistory;
  let chatChars = trimmedChat.reduce((sum, m) => sum + m.content.length, 0);

  while (chatChars > budgetForChat && trimmedChat.length > keepRecent) {
    const removed = trimmedChat.shift()!;
    chatChars -= removed.content.length;
  }

  return [...injections, ...trimmedChat];
}

// ── OpenAI API Call ──────────────────────────────────────────

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAILogContext {
  userId: string;
  supabase: import("https://esm.sh/@supabase/supabase-js@2").SupabaseClient;
  endpoint?: string;
  promptVariant?: "testing" | "normal";
}

async function callOpenAI(
  model: string,
  messages: Array<Record<string, unknown>>,
  maxTokens: number,
  tools: ToolDefinition[] | null,
  logCtx?: OpenAILogContext,
): Promise<OpenAIMessage> {
  const isGpt5 = model.startsWith("gpt-5");
  const body: Record<string, unknown> = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    ...(isGpt5 ? {} : { temperature: 0.7 }),
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
    body.parallel_tool_calls = true; // Enable parallel tool calling
  }

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();

      // Await cost logging — ensures DB row lands before caller continues
      if (logCtx && data.usage) {
        const { logApiUsage } = await import("./cost-tracker.ts");

        // Build a human-readable description from what the model actually did
        const toolCalls: Array<{ function: { name: string } }> =
          data.choices?.[0]?.message?.tool_calls ?? [];
        const toolNames = toolCalls.map((tc: { function: { name: string } }) => tc.function.name);

        let description: string;
        const ep = logCtx.endpoint ?? "";
        const promptVariant = logCtx.promptVariant ?? "normal";
        if (ep === "chat-ack") {
          description = "Quick acknowledgment";
        } else if (ep === "chat-casual") {
          description = "Casual conversation";
        } else if (toolNames.length > 0) {
          description = `Agent called: ${toolNames.join(", ")}`;
        } else if (ep.includes("final")) {
          description = "Agent final response";
        } else if (ep.includes("agent")) {
          description = "Agent reasoning (no tools needed)";
        } else {
          description = ep;
        }
        description = `[${promptVariant}] ${description}`;

        await logApiUsage(logCtx.supabase, {
          userId:           logCtx.userId,
          model,
          endpoint:         ep || (tools && tools.length > 0 ? "chat-agent" : "chat"),
          description,
          tokensIn:         data.usage.prompt_tokens                               ?? 0,
          tokensOut:        data.usage.completion_tokens                           ?? 0,
          tokensInCached:   data.usage.prompt_tokens_details?.cached_tokens        ?? 0,
          tokensReasoning:  data.usage.completion_tokens_details?.reasoning_tokens ?? 0,
          latencyMs:        Date.now() - t0,
          // Store full tool call names in metadata for drill-down
          metadata: {
            prompt_variant: promptVariant,
            ...(toolNames.length > 0 ? { tools_called: toolNames } : {}),
          },
        });
      }

      return data.choices?.[0]?.message ?? { role: "assistant", content: "something went wrong" };
    }

    const error = await response.text();

    // Retry on rate limit
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = (attempt + 1) * 2000;
      console.warn(`[orchestrator] Rate limited, retry ${attempt + 1} in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    console.error(`[orchestrator] OpenAI ${response.status}:`, error.slice(0, 300));
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  throw new Error("OpenAI API: max retries exceeded");
}

// ── Exports ──────────────────────────────────────────────────

export { AGENT_TOOLS, STATIC_RESPONSES, QUICK_EXIT_WORDS, detectPrefetch, decideReaction, callOpenAI };
export type { OpenAILogContext };