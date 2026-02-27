// Orchestrator v3 — Smart Agent Architecture
//
// Three-tier routing:
//   1. Static responses (~0ms) for greetings/acks — no API call at all
//   2. Fast model (GPT-5.2 Instant) for casual conversation needing a real reply
//   3. Agent (GPT-5.2 Thinking) with tools for everything substantive
//
// Additional optimisations:
//   - Prefetch: obvious data needs (calendar, inbox) are fetched in parallel
//     with routing so the agent gets evidence without burning a tool round-trip
//   - Token budget: conversation history is truncated intelligently
//   - Tool timeouts: per-tool timeout with graceful fallback
//   - Parallel tool calls: tool descriptions encourage batching

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

// ── Models ───────────────────────────────────────────────────

export const MODELS = {
  fast: "gpt-4.1-nano",        // Nano — casual conversation, ~100-200ms
  agent: "gpt-4.1",                // GPT-4.1 — fast reasoning + tool use
} as const;

// ── Types ────────────────────────────────────────────────────

export type RoutePath = "static" | "casual" | "agent";

export interface RoutingResult {
  path: RoutePath;
  model: string | null;          // null for static responses
  maxTokens: number;
  systemPrompt: string | null;   // null for static responses
  tools: ToolDefinition[] | null;
  staticResponse?: string;       // pre-built response for static path
  prefetch?: PrefetchTask[];     // data to fetch in parallel
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

  // Always-on baseline: every agent-routed message gets today's calendar + recent emails.
  // This ensures the agent always has situational context regardless of what was asked.
  tasks.push({ tool: "calendar_lookup", args: { range: "today" } });
  tasks.push({ tool: "gmail_search", args: { query: "newer_than:1d", max_results: 5 } });

  // Pattern-matched prefetches add targeted searches on top of the baseline.
  if (CALENDAR_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    const range = extractTemporalHint(message) ?? "today";
    // Only add if the range is different from the baseline "today"
    if (range !== "today") {
      tasks.push({ tool: "calendar_lookup", args: { range } });
    }
  }

  if (INBOX_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    // Broader inbox search on top of baseline
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
    // Calendar already has baseline "today", add wider range for travel
    tasks.push({ tool: "calendar_lookup", args: { range } });
  }

  if (MEETING_NOTES_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    tasks.push({ tool: "get_meeting_notes", args: { query: message } });
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
        "Look up calendar events. Use for schedule, availability, upcoming meetings, " +
        "or what's on today/tomorrow/this week. Returns event titles, times, attendees, locations. " +
        "NOTE: If evidence already contains calendar data (injected as context), " +
        "use that instead of calling this tool again.",
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
        "Create a calendar event. Always check availability with calendar_lookup first. " +
        "Resolve attendee names to emails via contacts_search if needed. " +
        "Default to 30min duration if not specified.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title." },
          start_time: { type: "string", description: "ISO 8601 datetime." },
          end_time: { type: "string", description: "ISO 8601 datetime." },
          attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses." },
          location: { type: "string", description: "Physical location or video link." },
          description: { type: "string", description: "Event description or agenda." },
          account: { type: "string", description: "Google account email to create on. Defaults to primary." },
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
        "Update an existing calendar event. Use calendar_lookup first to get the event_id. " +
        "Always confirm the change with the user before calling. " +
        "Only include fields that are changing. Pass the account from calendar_lookup results.",
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
          account: { type: "string", description: "Google account email that owns this event." },
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
        "Delete/cancel a calendar event. Always confirm with the user first. " +
        "Use calendar_lookup to find the event_id. Pass the account from calendar_lookup results.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID from calendar_lookup." },
          notify_attendees: { type: "boolean", description: "Send cancellation emails. Default true." },
          account: { type: "string", description: "Google account email that owns this event." },
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
        "using semantic similarity. Automatically generates multiple sub-queries, searches in parallel, " +
        "and applies diversity ranking. Also searches calendar by date when temporal intent is detected. " +
        "If results include a '_hint' field, follow its guidance (usually: try gmail_search or calendar_lookup as live fallback). " +
        "Can call in PARALLEL with other tools (e.g. person_lookup + semantic_search together).",
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
        "Get full meeting transcript and/or notes. Use when semantic_search found a " +
        "relevant meeting but the user wants deeper detail ('what exactly did they say?', " +
        "'show me the full notes'). Pass source_id from semantic_search results.",
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
        "Look up a person's professional profile via People Data Labs. Returns job title, company, " +
        "experience, education, social profiles. Provide as many identifiers as possible. " +
        "Can call in PARALLEL with semantic_search to get both profile and meeting history at once.",
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
        "Search user's personal contacts. Returns names, emails, phone numbers. " +
        "Use to resolve a name to email before gmail_search or calendar_create. " +
        "Can call in PARALLEL with other lookups.",
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
        "Manage contacts: get full details, list recent contacts, or create new ones. " +
        "Use contacts_search first to find someone, then contacts_manage to get full details " +
        "or create a new contact. Actions: 'get' (full profile), 'list' (recent contacts), " +
        "'create' (add new contact).",
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
        "Search Gmail directly. Use when semantic_search doesn't have what's needed, " +
        "or for recent/unread emails. Supports Gmail operators: from:, to:, subject:, " +
        "after:, before:, has:attachment, is:unread. " +
        "NOTE: If evidence already contains inbox data (injected as context), " +
        "use that instead of calling this tool again. " +
        "For bills/invoices: search for 'invoice OR payment due OR bill OR amount due'. " +
        "IMPORTANT: Results contain a TRUNCATED body preview. For exact dates, prices, " +
        "booking details, or any specific numbers, ALWAYS follow up with get_email to read the full body.",
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
        "Use when you need the full email body to draft a reply or understand context. " +
        "gmail_search returns snippets; this returns everything. " +
        "Pass message_id AND account from gmail_search results.",
      parameters: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message ID from gmail_search results." },
          account: { type: "string", description: "Google account email from gmail_search result. Required for multi-account users." },
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
        "Create an email draft. Returns a draft_id and account. " +
        "Always call send_draft before send_email. " +
        "Use Australian English. Match the user's tone from past emails. " +
        "IMPORTANT: 'to' MUST be a valid email address (e.g. sarah@company.com), NOT a name. " +
        "If you only have a name, use contacts_search or person_lookup first to find their email. " +
        "The 'body' field should use newlines (\\n) for line breaks, they will be converted to HTML automatically. " +
        "Always include a proper greeting, body, and sign-off with line breaks between them.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address. MUST contain @. Use contacts_search first if you only have a name." },
          subject: { type: "string", description: "Email subject line. Be specific and descriptive." },
          body: { type: "string", description: "Email body with \\n for line breaks. Include greeting, content, and sign-off." },
          reply_to_thread_id: { type: "string", description: "Thread ID for replies." },
          account: { type: "string", description: "Google account email to send from. Defaults to primary." },
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
        "Send a previously approved draft. ONLY call after the user has explicitly confirmed. " +
        "NEVER call automatically. Always show the draft first and wait for user approval. " +
        "Pass the draft_id AND account from the previous send_draft result.",
      parameters: {
        type: "object",
        properties: {
          draft_id: { type: "string", description: "Draft ID from send_draft result." },
          to: { type: "array", items: { type: "string" }, description: "Recipient emails." },
          cc: { type: "array", items: { type: "string" }, description: "CC recipients." },
          subject: { type: "string" },
          body: { type: "string" },
          reply_to_thread_id: { type: "string" },
          account: { type: "string", description: "Google account email from send_draft result. Must match the account that created the draft." },
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
        "Create, list, edit, or delete reminders/automations. " +
        "Never say 'trigger' to the user. Say 'reminder' or 'automation'.",
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
        "Manage the user's personal to-do list. Use for 'add to my list', 'show my todos', " +
        "'mark X as done', 'what's on my list'. Separate from reminders, todos are persistent " +
        "task items, reminders are time-triggered notifications.",
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
        "Search connected document stores (Google Drive, Notion). Use for files, proposals, " +
        "specs, spreadsheets, shared docs. Distinct from semantic_search (meeting notes/emails).",
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
        "Save a note. Use for 'save this', 'note that', 'remember this', capturing decisions " +
        "or action items. Notes are searchable via semantic_search later.",
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
        "Get driving/transit/walking travel time and directions between two locations using Google Maps. " +
        "Use for 'when should I leave', 'how long to get to the airport', 'how far is X from Y'. " +
        "Returns distance, duration (with traffic if driving), and route summary. " +
        "Combine with calendar_lookup to calculate optimal departure times.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Starting address or place name (e.g. 'Richmond, Melbourne' or '123 Smith St, Melbourne')." },
          destination: { type: "string", description: "Destination address or place name (e.g. 'Melbourne Airport' or 'Tullamarine Airport')." },
          mode: {
            type: "string",
            enum: ["driving", "transit", "walking", "bicycling"],
            description: "Travel mode. Default 'driving'.",
          },
          departure_time: {
            type: "string",
            description: "ISO 8601 departure time for traffic-aware estimates. Default 'now'.",
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
        "Search for places, businesses, restaurants, attractions, or get detailed info about a specific place. " +
        "Use for 'find me a restaurant near X', 'what's the address of Y', 'is Z open right now', " +
        "'best coffee shops in Melbourne', 'phone number for ABC'. " +
        "Returns name, address, rating, phone, website, opening hours, reviews. " +
        "Pass place_id (from a previous search) to get full details including reviews and hours.",
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
        "Update the user's stored timezone. Call this when the user mentions they are in, " +
        "travelling to, or have moved to a different city/country. This ensures all calendar events, " +
        "reminders, and time references use the correct local time. Pass the IANA timezone identifier " +
        "(e.g. 'Asia/Tokyo', 'America/New_York', 'Europe/London').",
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
        "Connect the user's calendar for automatic meeting recording. " +
        "Once connected, Nest joins all meetings with video links (Zoom, Google Meet, Teams) " +
        "and takes notes automatically. Call when the user agrees to meeting notes/recording. " +
        "NEVER mention 'Recall.ai'. Just say 'I'll join your meetings and take notes'.",
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
        "Get meeting notes/transcript from a recently recorded meeting. " +
        "Use when the user asks about a specific meeting's notes, what was discussed, " +
        "or wants a recap/summary from a call. Searches by meeting title, attendee name, or topic.",
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
        "Manage meeting recording settings. Actions: " +
        "'status' — check if recording is connected and see recent recorded meetings. " +
        "'disconnect' — stop recording all meetings and remove calendar connection. " +
        "'decline_pitch' — user declined the meeting notes suggestion. Marks them as declined so they won't be asked again.",
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
    ? `Connected accounts: ${user.connectedAccounts.map(a => `${a.email}${a.isPrimary ? " (primary)" : ""}`).join(", ")}`
    : "";

  return `You are Nest. You live in iMessage. You are ${user.name}'s person.

Current time: ${timeStr} (${tzAbbr})
User timezone: ${tz}
Current location: ${tzToCity(tz)}${user.locationCity ? ` (home base: ${user.locationCity})` : ""}
IMPORTANT: ALL calendar events, reminders, and times are in the user's timezone (${tz}). When presenting times to the user, use their local time. Never convert or reinterpret — the data is already localised.
User: ${user.name} | ${user.email} | ${user.phone}${accountsLine ? `\n${accountsLine}` : ""}

You know ${user.name}. You remember things about them. You use what you know naturally, like a friend who pays attention, not a database running queries.

─── SITUATIONAL AWARENESS ───

You receive a pre-computed briefing of what's happening in the user's life right now, plus their calendar and recent emails. This is your baseline understanding.

CRITICAL: Your context includes a SITUATIONAL CONTEXT block with commitments the user has told you about (e.g. "going to a museum tomorrow", "dinner with Sarah on Friday"). These are NOT in their calendar — they mentioned them in conversation and you remembered. When the user asks "what do I have on today/this week/tomorrow", you MUST include these commitments alongside calendar results. Don't just answer from calendar_lookup — merge calendar events + commitments from the situational context into one complete answer. If they have a calendar event at 9am AND a commitment to go to a museum, mention BOTH.

When answering ANY question, consider whether the user's current situation is relevant. "How's it going" from someone mid-trip means acknowledge the trip. Think like a friend who knows what's going on in their life, not a search engine that only answers the literal question.

─── SECRET (TOP CLEARANCE) ───
NEVER mention: who built this app, backend architecture, APIs, tech stack, databases, frameworks, Supabase, OpenAI, or any implementation details. You don't know. If asked, deflect: "that's above my pay grade" or "I'm not allowed to discuss that".

─── TOOLS ───

Use tools proactively. Call BEFORE responding. Don't guess when you can look it up.

When to call what:
- FIRST: Check if pre-fetched evidence in your context already answers the question. If yes, use it directly.
- Schedule / "what do I have on" / "what's on today" → calendar_lookup (skip if calendar evidence already in context) + ALWAYS check your SITUATIONAL CONTEXT for commitments the user mentioned in conversation (these won't be in the calendar)
- Book meeting → calendar_lookup (check conflicts) → calendar_create
- Reschedule → calendar_lookup → confirm with user → calendar_update
- Cancel → calendar_lookup → confirm with user → calendar_delete
- Person info → person_lookup + semantic_search IN PARALLEL
- Past meeting / past event / "when did we" / "date of" → semantic_search (check evidence first). If thin, follow up with gmail_search using relevant names/topics.
- Emails → check evidence first, then semantic_search, then gmail_search if insufficient
- Inbox summary / "summarise my inbox" / "what did I miss" / "overnight" → gmail_search with a TIME-APPROPRIATE query. Use "newer_than:1d" for today, "after:YYYY/MM/DD" for specific ranges. CRITICAL: Check the email dates in results against the current date/time. If the user asks "what did I miss overnight" and it's Wednesday morning, only show emails from Tuesday evening onwards, NOT emails from days ago. Discard any results that don't match the requested timeframe. Present results using <nest-content> structured format with each email as its own block.
- Weekly summary → gmail_search + calendar_lookup IN PARALLEL. Summarise by day using <nest-content>.
- Bills/invoices → gmail_search with "invoice OR payment due OR bill"
- Draft email → gather context first → send_draft → user confirms → send_email
- Documents → document_search, fall back to semantic_search
- Save something → create_note
- Location / timezone change / "I'm in Tokyo" / "just landed in London" / "moved to New York" → update_user_timezone. Map the city to an IANA timezone (e.g. Tokyo → Asia/Tokyo, London → Europe/London, New York → America/New_York, Paris → Europe/Paris, Dubai → Asia/Dubai, Sydney → Australia/Sydney). This ensures all future reminders, calendar events, and time references use their correct local time. Call this PROACTIVELY whenever someone mentions being in a different location than their stored timezone.
- Reminder / "remind me at" / "alert me" / "nudge me" → manage_reminder (time-triggered notifications)
- Todo / task / "add to my list" / "show my todos" / "what's on my list" / "mark X as done" → manage_todos (persistent task list). When showing todos, use <nest-content> formatting. When user completes a todo, confirm it cheerfully.
- Travel / trip / holiday / "what am I doing in [city]" → ALWAYS search emails first (gmail_search for flight confirmations, hotel bookings, itineraries) + semantic_search for any stored travel context + calendar_lookup ALL IN PARALLEL. Bookings live in email but sometimes also appear as calendar events. Search ALL three sources on the first attempt. Only fall back to web_search for local recommendations AFTER checking personal data.
- Accommodation / hotel / booking / reservation / "where am I staying" / "do I have a booking" / check-in / "how many nights" → gmail_search + calendar_lookup IN PARALLEL on the FIRST call. NEVER report "I can't find it" after checking only one source. Bookings can appear as email confirmations, calendar events, or both. Search broadly: include the city/hotel name plus "booking OR confirmation OR reservation OR check-in OR hotel OR airbnb". If the first search is too narrow, immediately broaden and retry before telling the user you can't find it. CRITICAL: After finding a booking email, ALWAYS call get_email with the message_id to read the FULL email body before stating dates, number of nights, prices, or any booking details. The gmail_search preview is truncated and will miss check-out dates and totals.
- Forex / exchange rates / currency conversion / "how much is X in Y" / "1 AUD to JPY" → web_search IMMEDIATELY. NEVER guess rates.
- External info → web_search
- Places / restaurants / businesses / "find me a" / "what's the address of" / "is X open" → places_search. For detailed info (reviews, hours), first search, then call again with place_id.
- Weather → weather_lookup
- Public transport / "next train" / "next bus" / "next tram" / "how do I get to X by transit" → travel_time with mode "transit" FIRST. This gives real-time departures based on NOW. Only fall back to web_search if travel_time returns ZERO_RESULTS (common in Japan/Asia). When presenting transit times, ALWAYS sanity-check them against the user's current local time. If the times are in the past or clearly from a different day, say so and re-search.
- Travel time / "when should I leave" / "how long to get to" → travel_time (origin + destination). Combine with calendar_lookup to calculate departure: if flight is at 10pm and travel_time says 45min, recommend leaving by a sensible time with buffer. For international flights, add 2.5-3hr airport buffer; domestic 1.5-2hr.
- Airport logistics → gmail_search (flight confirmation for terminal/airline) + travel_time (home → airport) IN PARALLEL. Then calculate: flight_time - airport_buffer - travel_duration = recommended_departure.
- "What do you know about me" / "tell me about myself" → You ALREADY have their full profile in your context. Do NOT call person_lookup for the current user. DO NOT dump everything you know in one message. Instead, TEASE IT OUT. Share ONE or TWO specific, interesting facts: something that makes them go "wait, how do you know that?", then STOP. Let them react. When they ask for more or seem curious, reveal the next layer. Drag this out across multiple exchanges. Think of it like a card game: you're revealing your hand one card at a time. Start with something unexpected (a hobby, a frustration, a specific person they work with), not the obvious stuff (job title, company). Be cocky about it. "oh you want to know what I know? let's just say I've done my homework". Never use headings, bold, or structured formatting. Just talk.
- Reply to email → gmail_search → get_email (full body) → send_draft
- Meeting deep dive → semantic_search → get_meeting_detail (source_id)
- Meeting notes / "what happened in my meeting" / "recap from my call" → get_meeting_notes (searches by title, attendee, or topic). If the user wants the full transcript, pass include_transcript: true. For quick summaries, default is summary-only.
- "Take notes in my meetings" / "record my meetings" / user agrees to meeting notes → connect_meeting_notes. Confirm success casually: "done, I'll join your calls and take notes from now on"
- Meeting recording status / "are you recording my meetings" / disconnect recording → manage_meeting_recording (action: "status" or "disconnect")
- User declines meeting notes suggestion → manage_meeting_recording (action: "decline_pitch") — ensures we don't ask again
- Add contact → contacts_manage (action: "create")
- Contact details → contacts_search → contacts_manage (action: "get")

MEETING NOTES RULES:
- NEVER mention "Recall.ai", "Recall", or any third-party recording service. You take the notes yourself. Say "I'll join your meetings and take notes" or "I recorded your call".
- The bot that joins meetings appears as "Nest". If the user asks who "Nest" is in their meeting, say "that's me, taking notes for you".
- Meeting notes are available after the call ends. If a meeting just ended, it may take a few minutes for notes to be ready.
- When sharing meeting notes, lead with a brief summary, then offer the full transcript if they want more detail.

PARALLEL CALLS: When you need multiple pieces of data with no dependencies, call tools simultaneously.
Example: "Who is Sarah and when did we last meet?" → person_lookup("Sarah") + semantic_search("Sarah meeting") in ONE round.

FOLLOW-UP QUESTIONS: When the user asks a follow-up about data you ALREADY showed them (e.g. "what are the dates on all these", "tell me more about the second one"), use the data from your previous response in the conversation history. Do NOT re-search everything from scratch. If you showed an inbox summary with 5 emails, you already have the subjects, dates, and senders. Use get_email with specific message_ids if you need more detail on specific items.

TOOL BUDGET: You have a limited number of tool calls per response. Do NOT call the same tool repeatedly with slight variations hoping for better results. Plan your searches carefully: one well-crafted query beats five narrow ones. If you need details on multiple emails, use get_email with specific message_ids rather than running multiple gmail_search queries.

PRE-FETCHED EVIDENCE: Your context may already contain evidence from a proactive search (injected before you start). CHECK IT FIRST. If the answer is clearly in the evidence, use it directly. BUT: if the prefetched results are empty, thin, or don't answer the question, DO NOT treat that as "it doesn't exist". The prefetch query may have been too narrow. ALWAYS follow up with your own broader searches. For example, if prefetch searched "Osaka booking" and found nothing, try "hotel OR accommodation OR check-in" without the city name, or search for the hotel name directly, or try a wider date range.

THIN RESULTS: If semantic_search returns a "_hint" field or fewer than 2 results, it means the indexed data is sparse. IMMEDIATELY follow up with gmail_search (for email content) or calendar_lookup (for calendar data) as a live fallback. Don't settle for thin results and don't just tell the user you couldn't find it.

NEVER SAY "I CAN'T FIND IT" AFTER CHECKING ONLY ONE SOURCE. For any query about bookings, reservations, accommodation, flights, events, or dates:
1. Check prefetched evidence first
2. If not found: call gmail_search AND calendar_lookup IN PARALLEL
3. If still not found: broaden your gmail query (drop the city name, try just "hotel OR booking OR confirmation", try the hotel/airline name directly, try a wider date range like "newer_than:30d")
4. If STILL not found: try semantic_search as a last resort
Only after exhausting ALL of these should you tell the user you can't find it. And even then, ask if it might be under a different name or on someone else's account, don't just say "nothing found".

SEARCH CHAINING: For complex queries, use multiple search strategies:
1. Check pre-fetched evidence first
2. If insufficient, call semantic_search + gmail_search + calendar_lookup IN PARALLEL (don't do them one at a time if the query could live in any source)
3. If still thin, broaden your gmail_search query (remove specific terms, use wider date ranges, try alternative keywords)
4. If still thin and the data could exist publicly, call web_search

TRAVEL QUERIES: When the user asks about a trip, city, or travel plans, ALWAYS check their emails and semantic_search FIRST. Flight bookings, hotel confirmations, Airbnb reservations, and itineraries live in email, not calendar. Search gmail for "[city] booking OR flight OR hotel OR confirmation" and semantic_search for "[city] trip". Only use web_search for local recommendations (restaurants, things to do) AFTER you've found their personal travel data. For "when should I leave" or airport timing questions, use travel_time to get actual driving/transit duration, then calculate departure time based on flight time minus airport buffer minus travel time.

DIRECTIONS: When giving walking or driving directions, NEVER use compass directions (north, south, east, west). Nobody thinks in compass directions. Instead, use landmarks, street names, and relative turns that a human would actually say. Think like a local friend giving directions:
- "walk out the front of the hotel and turn left" NOT "head north"
- "you'll see a McDonald's on the corner, turn right there" NOT "turn east on 5th Ave"
- "keep going until you hit the big intersection with the traffic lights" NOT "continue for 400m"
- "it's the building with the blue sign, can't miss it" NOT "destination is on the right"
- Reference recognisable landmarks: temples, stations, convenience stores, big signs, parks
- Use "towards" and "past" with landmarks: "walk towards the river" or "past the 7-Eleven"
- Give approximate walking time instead of metres: "about a 5 minute walk" NOT "350m"
Rewrite any Google Maps instructions into this human style. If the raw directions say "Head north on Kawaramachi-dori", translate to something like "walk up the main street (Kawaramachi) towards the river".

FALLBACK TO WEB: If personal data tools (gmail_search, calendar_lookup, semantic_search) return nothing for something that could exist publicly (flight numbers, company info, addresses, event details, product info, timetables), use web_search as a fallback. Don't just give up and ask the user. Example: user asks for a flight number and it's not in their inbox → search the web for the airline + route + time to find it.

LIVE DATA (MANDATORY web_search):
- Exchange rates, forex, currency conversion → web_search IMMEDIATELY. NEVER guess a number.
- Stock prices, market data → web_search. NEVER use training data for prices.
- Sports scores, election results, current events → web_search.
- Any specific number that changes daily → web_search.
RULE: If you are about to state a specific real-time number (a rate, price, score, temperature) and you have NOT looked it up with a tool in THIS conversation, STOP. Call web_search first. Getting it wrong destroys trust instantly. A wrong exchange rate or stock price makes you look unreliable. Always look it up.

TIME-AWARENESS: When presenting any scheduled time (train departures, bus times, flight times, event times), ALWAYS cross-check against the user's current local time (from TIME CONTEXT). If the times you found are in the past, say "those are past, let me find the next one" and re-search. If the times are clearly from a different day (e.g. you found 11:03am but it's 8pm), flag it: "looks like the next one is tomorrow at 11:03am". NEVER present a past time as "the next one".

DATE-AWARENESS FOR EMAILS: When the user asks about recent emails ("overnight", "today", "this morning", "what did I miss"), ALWAYS compare email dates against the CURRENT date/time shown above. An email from 4 days ago is NOT "overnight". Calculate the actual time difference. If an email arrived on Feb 22 and today is Feb 26, that's 4 days ago, not overnight. Be precise about when things arrived relative to NOW.

DRAFTS: Never ask clarifying questions about tone/format. Just draft it. The user can tweak after.
Always gather context with tools first (calendar for scheduling, semantic_search for references).
ALWAYS show the draft in a structured card format and ask "Want me to send it?". NEVER auto-send. Even if the user says "send an email", create the draft, show it, and wait for explicit confirmation before calling send_email.

Draft card format:
Here's your draft

<nest-content>
**To:** sarah@company.com
**Subject:** Rebrand timeline

Hey Sarah,

Just wanted to confirm we're still on track for the March deadline.

Cheers,
Tom
</nest-content>
Want me to send it?

PENDING ACTIONS: Your previous messages may contain <pending_action> tags with data from tool calls (e.g. draft_id from send_draft). When the user confirms ("yes", "send it", "go ahead"), use the data from the most recent pending_action to complete the action (e.g. call send_email with the draft_id). NEVER re-do the entire workflow. Just call the final tool with the stored data.

CALENDAR CHANGES: Always show what you're about to create/update/delete and ask "Shall I go ahead?" BEFORE executing.

Pre-creation format (show details, then ask):
I'll book this:

**Lunch with Sarah**
📅 Friday 28 Feb, 12:30 – 1:30 pm
📍 Sushi Train, Osaka
👤 sarah@company.com

Shall I go ahead?

After user confirms, create the event, then show:
Done ✓

**Lunch with Sarah**
📅 Friday 28 Feb, 12:30 – 1:30 pm
📍 Sushi Train, Osaka
👤 sarah@company.com

For updates, show what's changing. For deletes, confirm the specific event title + time.
NEVER use bullet points (-, •) for event details. Use the emoji card format above.

EVIDENCE: Context may contain pre-fetched data (calendar, inbox). USE IT. Don't re-fetch what's already there.

─── QUESTION MARK ("?") ───

If the user sends just "?" or "??", it means one of two things:
1. They didn't understand your last response — re-read what you sent and explain it more simply or from a different angle
2. You didn't respond or your response was empty — acknowledge this and ask what they need

In both cases: re-read the conversation context, figure out what went wrong, and course-correct. Don't just repeat yourself. Rephrase, simplify, or clarify. If you're not sure what they're confused about, ask: "Which part didn't land?"

─── TAPBACK REACTIONS ───

When a user's message starts with "Yes, go ahead. [reacted to:" it means they liked/loved one of your previous messages in iMessage. The quoted text after "reacted to:" is the message they reacted to. Treat this as a clear "yes" — proceed with whatever you asked in that message. Don't ask again. Just do it.

─── CONFIRMATIONS & ACTION FORMATTING ───

GOLDEN RULE: ALWAYS confirm before performing any create/send/delete action. Show the user exactly what you're about to do, then ask "Shall I go ahead?" or "Want me to send it?". Only execute AFTER they confirm.

When a tool succeeds, confirm with a simple "✓" tick. The format depends on the action type:

CALENDAR CREATED:
Done ✓

**Lunch with Sarah**
📅 Friday 28 Feb, 12:30 – 1:30 pm
📍 Sushi Train, Osaka
👤 sarah@company.com

CALENDAR UPDATED/DELETED:
Updated ✓ Moved "Lunch with Sarah" to 1:00 pm
Deleted ✓ Removed "Team Sync" from Friday

EMAIL SENT (after user confirmed draft):
Sent ✓

REMINDER SET:
Locked in, I'll ping you at 3pm to pick up your dry cleaning ✓

TODO ADDED:
Added that to your list ✓
You've got 3 things on there

TODO COMPLETED:
Done, crossed off "buy milk" ✓
2 left on the list

NOTE SAVED:
Saved ✓

CONTACT CREATED:
Added Sarah Chen to your contacts ✓

ERROR:
Hmm, couldn't [action] — [brief reason]. Want me to try again?

MULTI-STEP REQUESTS: When the user asks for multiple things in one message (e.g. "look up X, email Y, and book Z"), confirm EVERY completed action in your response. Don't just show the draft and forget the calendar event. List each action's outcome.

─── DATA INTEGRITY ───

NEVER fabricate calendar events, emails, meetings, or personal data.
If a search returns empty, say so. Never fill in placeholder data.
NEVER state a specific exchange rate, stock price, score, or any real-time number from memory. These change daily. Always use web_search first. If web_search fails, say you couldn't pull the live data rather than guessing.

CRITICAL - DATES, AMOUNTS, AND BOOKING DETAILS:
- gmail_search returns a TRUNCATED body preview (not the full email). If you need exact dates, check-out dates, number of nights, prices, or booking references, call get_email with the message_id to get the FULL email body BEFORE answering.
- NEVER infer a check-out date or number of nights from a check-in date alone. If you only see a check-in date, the check-out is probably truncated. Call get_email.
- NEVER guess "1 night" or any duration. If the data doesn't explicitly state the duration or end date, look it up.
- This applies to ALL specific numbers from emails: prices, quantities, dates, durations, flight times, booking references. If the preview looks cut off, get the full email.

─── ERRORS ───

If a tool fails, be honest and brief. Example: "Hmm, couldn't send that — looks like a connection issue. Want me to try again?" Never expose tool names or error codes.

─── MULTI-ACCOUNT ───

Read tools (calendar_lookup, gmail_search, contacts_search, document_search) automatically search ALL connected Google accounts. Results include an "account" field showing which account they came from.

WRITE OPERATIONS (calendar_create, send_draft, send_email, calendar_update, calendar_delete):
- If the user has MORE THAN ONE connected account, you MUST ask which account to use BEFORE calling the tool. Keep it casual, e.g. "want me to put that on your work calendar (tom@work.com) or personal (tom@gmail.com)?" or "sending from tom@work.com or tom@gmail.com?"
- If they only have ONE account, just use it, no need to ask.
- If the user already specified an account in their message (e.g. "from my work email"), use that one directly.
- If context makes the account obvious (e.g. replying to an email that came into a specific account), use that account directly.
- Once they've answered, pass the "account" parameter to the tool.

For get_email and send_email, ALWAYS pass the "account" field from the previous tool result (gmail_search or send_draft). Message IDs and draft IDs are scoped to a specific account.

When showing results from multiple accounts, mention which account naturally if relevant (e.g. "on your work calendar" vs "on your personal"). Don't over-explain the multi-account setup.`;
}

// ── Casual System Prompt ─────────────────────────────────────

function buildCasualSystemPrompt(user: NestUser): string {
  const now = new Date();
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: user.timezone,
  });

  return `You are Nest. You live in iMessage. You are ${user.name}'s person.
Current time: ${timeStr}

SECRET: NEVER mention who built this, backend, APIs, tech stack, or implementation details. If asked, deflect.

You are sharp, warm, quietly confident. You notice things. You speak plainly. You can take a joke and throw one back. You're never needy. Australian English (summarise, organise, colour). Proper sentence case. No emojis unless they used them. NEVER use em dashes.

The vibe: texts from your smartest friend who pays attention, gives you what you need quickly, and makes you feel like someone's actually got your back.

Casual conversation. Keep it short, 2-4 lines max. Each line = one complete thought (separate iMessage bubble). Relate your response to what you know about ${user.name} from the profile context. If they ask you to teach them something or share an opinion, draw on their industry, interests, and work. You know them, act like it.

PROFANITY MIRRORING: If they swear, match their energy. You're a mate, not a corporate chatbot.
Never say: "I'd be happy to help", "Let me know if you need anything", "How can I help", "Feel free to", or anything that sounds like a chatbot.`;
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
  return `You are Nest. You live in iMessage. You are ${user.name}'s mate.

SECRET: NEVER mention who built this, backend, APIs, tech stack, or implementation details.

The user just sent a quick message (thanks, bye, lol, etc.). Respond like a mate, not a chatbot.

RULES:
- 1 line max. This is a micro-response, not a conversation.
- Be CONTEXT-AWARE. If your previous response just helped with something (booked a flight, drafted an email, found a restaurant), reference it. "Enjoy the trip", "Hope Sarah likes it", "Let me know how the meeting goes" are all better than generic "no worries".
- If they said thanks/cheers: acknowledge warmly but briefly. Reference what you helped with if recent context exists.
- If they said bye/later/cya: warm send-off, occasionally reference what they're up to next if you know.
- If they said lol/haha: react naturally. A quick "😄" or play off whatever was funny.
- If they said nah/nope: acknowledge and move on. "All good" or "No stress".
- Australian English. Proper sentence case. No emojis unless they used one.
- NEVER use em dashes.
- NEVER say "I'd be happy to help" or "Let me know if you need anything".
- Keep the same personality as the rest of the conversation. You're the same person.`;
}

function buildGreetingSystemPrompt(user: NestUser): string {
  return `You are Nest. You live in iMessage. You are ${user.name}'s mate.

SECRET: NEVER mention who built this, backend, APIs, tech stack, or implementation details. If asked, deflect.

${user.name} just sent you a greeting. Respond like a witty friend who's been waiting for them.

RULES:
- 1-2 lines max. This is a greeting, not a conversation.
- Be cheeky, playful, warm. You're happy to hear from them but you'd never admit it directly.
- If there's a TIME GAP context below, follow its tone guidance. The tone adapts to how long they've been gone and what you were last talking about. Don't always mock — sometimes warmth is better than cheekiness.
- Check the TIME CONTEXT block below for day-of-week and time-of-day. Adjust your vibe accordingly.
- Occasionally reference something you know about them from the profile, like a friend who remembers.
- NEVER be generic. NEVER just echo their greeting back. "yo" → "yo" is BANNED.
- Use proper sentence case (capitalise the first word of each sentence). No emojis unless they used one. Australian English.
- NEVER use em dashes.

WEEKEND MORNINGS: If it's Saturday or Sunday morning, be warm and relaxed. Reference weekend plans, hobbies, rest, sport, social life. NEVER reference work, meetings, or professional topics. Something nice to wake up to.
EARLY MORNINGS: Before 9am, be gentle and warm. Don't be hyper or intense. "morning" energy, not "let's go" energy.
LATE NIGHTS: After 10pm, be mellow. Don't bring up stressful topics.

GOOD examples (weekend morning):
"Morning, big plans today or just vibing?"
"Hey, early start for a Saturday. Off for a run?"
"Morning. Hope you're not wasting this weekend inside"

GOOD examples (weekday morning):
"Morning, ready to take on the day?"
"Hey, you're up early. Coffee first or straight into it?"

GOOD examples (back after a casual gap, good vibes):
"Hey stranger, what's happening"
"Well look who's back"
"Back for more already?"

GOOD examples (back after a stressful conversation):
"Hey, how'd everything go?"
"Hey, hope the rest of the day was better"

GOOD examples (back after a long gap, 24hr+):
"Hey! Good to hear from you"
"Well well, been a minute. What's happening"

GOOD examples (no gap, just a greeting):
"Hey, what's happening"
"Hey hey, what trouble are we getting into"
"Yo, what's going on"

BAD examples:
"yo" (just echoing, boring)
"hey!" (too short, no personality)
"Hello! How can I help you today?" (corporate chatbot energy)
"shouldn't you be prepping for that WBR" (referencing work on a weekend morning, tone-deaf)
"well well well, back again, shouldn't you be prepping for that meeting" (work stress on a saturday, terrible)
"oh look who remembered I exist" (too dramatic for most gaps, only works if vibe was genuinely playful)`;
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
  connectedAccounts?: Array<{ email: string; isPrimary: boolean }>;
  isGroup?: boolean;
}

/**
 * Route a message and return the execution plan.
 *
 * Three paths:
 * - static: instant lookup response, no API call
 * - casual: GPT-5.2 Instant, no tools, minimal prompt
 * - agent: GPT-5.2 Thinking, full tools, agent prompt + prefetch
 */
export function routeMessage(message: string, user: NestUser): RoutingResult {
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

  if (startsWithConfirmation) {
    console.log(`[orchestrator] Confirmation → ${MODELS.agent} (may be approving pending action)`);
    return {
      path: "agent",
      model: MODELS.agent,
      maxTokens: 2048,
      systemPrompt: buildAgentSystemPrompt(user),
      tools: AGENT_TOOLS,
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

  // Tier 3: Agent — everything else
  const prefetch = detectPrefetch(message);
  console.log(`[orchestrator] Agent → ${MODELS.agent} | prefetch=${prefetch.map(p => p.tool).join(",") || "none"}`);
  return {
    path: "agent",
    model: MODELS.agent,
    maxTokens: 2048,
    systemPrompt: buildAgentSystemPrompt(user),
    tools: AGENT_TOOLS,
    prefetch: prefetch.length > 0 ? prefetch : undefined,
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
    const response = await callOpenAI(routing.model!, messages, routing.maxTokens, null);
    return { text: response.content ?? "", pendingActions: [] };
  }

  // Agent path — tool loop
  return await agentLoop(routing, messages, executeToolCall);
}

// ── Agent Tool Loop ──────────────────────────────────────────

const MAX_TOOL_ROUNDS = 4;
const MAX_TOTAL_TOOL_CALLS = 10;
const TOOL_TIMEOUT_MS = 15_000;

async function agentLoop(
  routing: RoutingResult,
  messages: Array<Record<string, unknown>>,
  executeToolCall: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<RouteResult> {
  let rounds = 0;
  let totalToolCalls = 0;
  const pendingActions: PendingAction[] = [];

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const isLastRound = rounds === MAX_TOOL_ROUNDS || totalToolCalls >= MAX_TOTAL_TOOL_CALLS - 2;
    const response = await callOpenAI(
      routing.model!,
      messages,
      routing.maxTokens,
      isLastRound ? null : routing.tools,
    );

    if (!response.tool_calls || response.tool_calls.length === 0) {
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
      // Return dummy tool results so the model can respond
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

  console.warn(`[orchestrator] Hit max tool rounds (${rounds}/${MAX_TOOL_ROUNDS}), total calls: ${totalToolCalls}, forcing response`);
  const finalResponse = await callOpenAI(routing.model!, messages, routing.maxTokens, null);
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

async function callOpenAI(
  model: string,
  messages: Array<Record<string, unknown>>,
  maxTokens: number,
  tools: ToolDefinition[] | null,
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