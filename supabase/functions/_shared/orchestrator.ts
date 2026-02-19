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
  fast: "gpt-5.2-chat-latest", // GPT-5.2 Instant — casual conversation
  agent: "gpt-5.2",            // GPT-5.2 Thinking — reasoning + tool use
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

// ── Static Responses (~0ms, no API) ──────────────────────────
// Exact-match messages that never need a model. Returns instantly.

const STATIC_RESPONSES: Record<string, string[]> = {
  // Greetings — randomly pick one
  "hey":              ["hey!", "hey, what's up"],
  "hi":               ["hey!", "hi!"],
  "hello":            ["hey!", "hello!"],
  "yo":               ["yo"],
  "sup":              ["not much, you?", "hey"],
  "hiya":             ["hey!"],
  "g'day":            ["g'day!"],
  "good morning":     ["morning!"],
  "morning":          ["morning!"],
  "gm":               ["morning!"],
  "good afternoon":   ["afternoon!"],
  "good evening":     ["evening!"],
  "good night":       ["night!"],
  "gn":               ["night!"],
  "night":            ["night!"],

  // Acknowledgments
  "thanks":           ["no worries", "all good"],
  "thank you":        ["no worries", "all good"],
  "cheers":           ["all good"],
  "ta":               ["all good"],
  "thx":              ["no worries"],
  "thanks mate":      ["no worries"],
  "cheers mate":      ["all good mate"],

  // Negatives
  "nah":              ["all good"],
  "nope":             ["no worries"],

  // Farewells
  "bye":              ["later!"],
  "cya":              ["catch ya"],
  "see ya":           ["later!"],
  "later":            ["catch ya"],
  "ttyl":             ["later!"],

  // Fillers
  "lol":              ["haha"],
  "haha":             ["😄"],
  "hahaha":           ["😄"],
  "lmao":             ["haha"],
  "no worries":       ["all good"],
  "all good":         ["cool"],
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

function detectPrefetch(message: string): PrefetchTask[] {
  const tasks: PrefetchTask[] = [];

  if (CALENDAR_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    const range = extractTemporalHint(message) ?? "today";
    tasks.push({ tool: "calendar_lookup", args: { range } });
  }

  if (INBOX_PREFETCH_PATTERNS.some((p) => p.test(message))) {
    tasks.push({ tool: "gmail_search", args: { query: "is:unread OR newer_than:1d", max_results: 10 } });
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
NOTE:Your go-to person for everything — calendar, emails, research, and more.
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
        "Use calendar_lookup to find the event_id.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID from calendar_lookup." },
          notify_attendees: { type: "boolean", description: "Send cancellation emails. Default true." },
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
        "using semantic similarity. Use for past meetings, discussions, decisions, action items. " +
        "Call multiple times with different queries if first result is thin. " +
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
        "For bills/invoices: search for 'invoice OR payment due OR bill OR amount due'.",
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
        "Pass message_id from gmail_search results.",
      parameters: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message ID from gmail_search results." },
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
        "Create an email draft. Returns a draft_id. " +
        "Always call send_draft before send_email. " +
        "Use Australian English. Match the user's tone from past emails.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email or name." },
          subject: { type: "string", description: "Subject line." },
          body: { type: "string", description: "Email body." },
          reply_to_thread_id: { type: "string", description: "Thread ID for replies." },
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
        "Pass the draft_id from the previous send_draft call.",
      parameters: {
        type: "object",
        properties: {
          draft_id: { type: "string", description: "Draft ID from send_draft result." },
          to: { type: "array", items: { type: "string" }, description: "Recipient emails." },
          cc: { type: "array", items: { type: "string" }, description: "CC recipients." },
          subject: { type: "string" },
          body: { type: "string" },
          reply_to_thread_id: { type: "string" },
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
          location: { type: "string", description: 'City name. Default "Sydney, Australia".' },
          days: { type: "number", description: "Forecast days 1-7. Default 1." },
        },
        required: [],
      },
    },
  },
];

// ── Agent System Prompt ──────────────────────────────────────
// Core identity + tool guidance only. Channel-specific formatting
// (iMessage bubbles, <nest-content>, etc.) is appended by the
// personality agent layer.

function buildAgentSystemPrompt(user: NestUser): string {
  const now = new Date();
  const timeStr = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
  const tzAbbr = getTimezoneAbbr(now);

  return `You are Nest. You live in iMessage. You are ${user.name}'s person.

Current time: ${timeStr} (${tzAbbr})
User: ${user.name} | ${user.email} | ${user.phone}

You know ${user.name}. You remember things about them. You use what you know naturally, like a friend who pays attention, not a database running queries.

─── TOOLS ───

Use tools proactively. Call BEFORE responding. Don't guess when you can look it up.

When to call what:
- Schedule → calendar_lookup (skip if calendar evidence already in context)
- Book meeting → calendar_lookup (check conflicts) → calendar_create
- Reschedule → calendar_lookup → confirm with user → calendar_update
- Cancel → calendar_lookup → confirm with user → calendar_delete
- Person info → person_lookup + semantic_search IN PARALLEL
- Past meeting → semantic_search
- Emails → semantic_search first, gmail_search if insufficient (skip if inbox evidence in context)
- Inbox summary / "summarise my inbox" → gmail_search (query: "newer_than:1d" or appropriate time range). Present results using <nest-content> structured format with each email as its own block.
- Weekly summary → gmail_search + calendar_lookup IN PARALLEL. Summarise by day using <nest-content>.
- Bills/invoices → gmail_search with "invoice OR payment due OR bill"
- Draft email → gather context first → send_draft → user confirms → send_email
- Documents → document_search, fall back to semantic_search
- Save something → create_note
- Reminder → manage_reminder
- External info → web_search
- Weather → weather_lookup
- "What do you know about me" / "tell me about myself" → You ALREADY have their full profile in your context. Answer directly from the USER PROFILE context. Do NOT call person_lookup for the current user. Just share what you know naturally, like a friend recapping what they know about someone.
- Reply to email → gmail_search → get_email (full body) → send_draft
- Meeting deep dive → semantic_search → get_meeting_detail (source_id)
- Add contact → contacts_manage (action: "create")
- Contact details → contacts_search → contacts_manage (action: "get")

PARALLEL CALLS: When you need multiple pieces of data with no dependencies, call tools simultaneously.
Example: "Who is Sarah and when did we last meet?" → person_lookup("Sarah") + semantic_search("Sarah meeting") in ONE round.

THIN RESULTS: If the first search returns weak results, try again with different terms. Don't settle.

DRAFTS: Never ask clarifying questions about tone/format. Just draft it. The user can tweak after.
Always gather context with tools first (calendar for scheduling, semantic_search for references).
ALWAYS show the draft and ask "want me to send it?". NEVER auto-send. Even if the user says "send an email", create the draft, show it, and wait for explicit confirmation before calling send_email.

PENDING ACTIONS: Your previous messages may contain <pending_action> tags with data from tool calls (e.g. draft_id from send_draft). When the user confirms ("yes", "send it", "go ahead"), use the data from the most recent pending_action to complete the action (e.g. call send_email with the draft_id). NEVER re-do the entire workflow. Just call the final tool with the stored data.

CALENDAR CHANGES: Always confirm the specific event (title + time) before updating or deleting.

EVIDENCE: Context may contain pre-fetched data (calendar, inbox). USE IT. Don't re-fetch what's already there.

─── CONFIRMATIONS ───

When a tool result contains "_confirmation", ALWAYS acknowledge the action to the user.
For example: "booked", "done", "saved", "sent", "deleted", "updated".
Keep it brief but always confirm that the action succeeded. Never silently skip confirmations.

MULTI-STEP REQUESTS: When the user asks for multiple things in one message (e.g. "look up X, email Y, and book Z"), confirm EVERY completed action in your response. Don't just show the draft and forget the calendar event. List each action's outcome.

─── DATA INTEGRITY ───

NEVER fabricate calendar events, emails, meetings, or personal data.
If a search returns empty, say so. Never fill in placeholder data.

─── ERRORS ───

If a tool fails, tell the user simply and offer to retry. Never expose tool names or error codes.`;
}

// ── Casual System Prompt ─────────────────────────────────────

function buildCasualSystemPrompt(user: NestUser): string {
  return `You are Nest. You live in iMessage. You are ${user.name}'s person.

Casual conversation. ONE short line. Max 2 lines. Never mention work unprompted.`;
}

// ── Timezone Helper ──────────────────────────────────────────

function getTimezoneAbbr(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "AEST";
}

// ── Public API ───────────────────────────────────────────────

export interface NestUser {
  name: string;
  email: string;
  phone: string;
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

  // Tier 1: Static response — 0ms, no API
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
  const CONFIRMATION_WORDS = new Set([
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "k", "kk",
    "do it", "go ahead", "send it", "go for it", "confirm", "approved",
    "sounds good", "perfect", "got it", "cool", "great", "awesome", "nice",
    "no", "nah", "nope", "cancel", "dont", "don't", "stop", "never mind",
  ]);

  if (CONFIRMATION_WORDS.has(cleaned)) {
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

export interface RouteResult {
  text: string;
  pendingActions: PendingAction[];
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
      content: `<context sentAt="${new Date().toISOString()}">Pre-fetched data (use this, don't re-fetch):\n${prefetchedEvidence}</context>`,
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

const MAX_TOOL_ROUNDS = 8;
const TOOL_TIMEOUT_MS = 15_000; // 15 seconds per tool call

async function agentLoop(
  routing: RoutingResult,
  messages: Array<Record<string, unknown>>,
  executeToolCall: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<RouteResult> {
  let rounds = 0;
  const pendingActions: PendingAction[] = [];

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callOpenAI(
      routing.model!,
      messages,
      routing.maxTokens,
      routing.tools,
    );

    // No tool calls — model is done
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return { text: response.content ?? "", pendingActions };
    }

    // Add assistant's message (with tool calls) to history
    messages.push({
      role: "assistant",
      content: response.content ?? null,
      tool_calls: response.tool_calls,
    });

    // Execute tool calls IN PARALLEL with timeouts
    const toolResults = await Promise.all(
      response.tool_calls.map(async (toolCall: any) => {
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

        // Extract pending actions from tool results (draft_id, event_id, etc.)
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

  console.warn(`[orchestrator] Hit max tool rounds (${MAX_TOOL_ROUNDS}), forcing response`);
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

export { AGENT_TOOLS, STATIC_RESPONSES, detectPrefetch };