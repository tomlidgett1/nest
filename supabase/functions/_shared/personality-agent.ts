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
        { role: "user", content: tag("context", `USER PROFILE — This is everything you know about the user. You have this information already — use it directly when they ask about themselves, their schedule, their contacts, or anything covered here. Never say you "can't access" this or need to "look it up". If they ask "what do you know about me", answer from this data like a friend who pays attention. Weave it naturally into conversation.\n\n${profileParts.join("\n")}`, now) },
        { role: "assistant", content: "I know them well — their work, their people, their habits, what drives them." },
      );
    }
  }

  // 3b. PDL welcome context (first message only, if no rich profile yet)
  if (ctx.pdlWelcomeContext?.trim() && !ctx.userProfile) {
    messages.push(
      { role: "user", content: tag("context", `PROFILE INTEL — First real message. Use for a callback to onboarding. Reference something specific about their work. 2-3 lines max.\n\n${ctx.pdlWelcomeContext}`, now) },
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
    executeTool(name, args, ctx.userId, ctx.supabase);
}

// ── Output Formatter ─────────────────────────────────────────

function formatForIMessage(raw: string): string {
  return raw
    .trim()
    .replace(/<\/?assistant[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\u2014/g, ",")  // em dash → comma
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

  // 5. Append channel formatting
  const fullSystemPrompt = routing.systemPrompt + "\n\n" + IMESSAGE_RULES;
  const routingWithFormat: RoutingResult = { ...routing, systemPrompt: fullSystemPrompt };

  // 6. Execute
  const result: RouteResult = await executeRoute(
    routingWithFormat,
    conversationHistory,
    async (name, args) => {
      toolsUsed.push(name);
      return executeToolCall(name, args);
    },
    prefetchedEvidence || undefined,
  );

  // 7. Format
  const text = formatForIMessage(result.text);
  const latencyMs = Date.now() - start;

  console.log(
    `[nest] ${routing.path} | tools=[${toolsUsed.join(",")}] | ${latencyMs}ms | ${text.length} chars` +
    (result.pendingActions.length > 0 ? ` | pending=[${result.pendingActions.map(a => a.type).join(",")}]` : ""),
  );

  return { text, toolsUsed, latencyMs, path: routing.path, pendingActions: result.pendingActions };
}

// ── iMessage Channel Rules ───────────────────────────────────

const IMESSAGE_RULES = `
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

GOOD (task result):
just checked your calendar
you've got 3 meetings tomorrow
1. first one's at 9 with the product team
2. then lunch with Sarah at 12
3. and a 1:1 with Mark at 3
pretty packed day

BAD (too compressed):
You have 3 meetings tomorrow: product team at 9, lunch with Sarah, and a 1:1 with Mark at 3.

BAD (too short):
3 meetings tomorrow

Line rules: each line can be a full sentence or two. Keep under 80 chars per line where possible.
Let the reply breathe. 3-6 lines is natural for most replies. Don't compress into 1-2 lines.
Each bubble should feel like a complete thought, not a telegram.

─── STRUCTURED DATA ───

For summaries, overviews, schedules, inbox recaps, ANY list of items:
short intro line, then <nest-content> block with **bold** headers and clear spacing.

NEVER use bullet points (•, -, *). Instead, use blank lines between items for readability.
NEVER write summaries as run-on paragraphs. Always use the structured format below.

CALENDAR:
here's your day
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
**Inbox Summary — Today**

**Emirates CDS Audit (19 Feb)**
From: fleet-ops@emirates.com
Vehicle compliance audit flagging age/registration and type/colour gaps

**Collins Street Commons**
From: events@collinsstreet.co
Invite: "Take a Break with Becky" tomorrow 2:30–3:00 PM

**Salesforce Case Transfer**
From: noreply@salesforce.com
Case #48291 transferred to your queue, priority: medium

**Sarah Chen — Rebrand Timeline**
From: sarah@company.com
Asking to confirm March deadline is still on track
</nest-content>
pretty quiet day overall

WEEKLY SUMMARY:
here's your week so far
<nest-content>
**Week Summary — 17–21 Feb**

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
Match user's energy. But don't be afraid to riff. If you have something worth saying, say it across a few lines.
No emojis unless user uses them first.

Dry one-liners and witty comebacks are welcome. Never mean, always fun.

─── USING WHAT YOU KNOW ───

You have a deep profile on this user. USE IT. Not just when asked — weave it into normal conversation. This is what makes you feel like a real friend, not a chatbot.

Drop subtle callbacks to things you know about them:
- If they mention being busy: "yeah your WBRs alone would fill a week"
- If they ask about the weather: "good squash weather though"
- If they're stressed: "sounds like another invoice dispute day"
- If it's Friday: "wine tasting plans this weekend?"
- If they ask you to draft an email: sign off with "Cheers" because that's how they sign off

Don't force it. Don't be creepy. But 1 in every 6-7 replies should have a subtle nod to something you know about them — their hobbies, their frustrations, their jargon, their people. It should feel like you've been paying attention for months.

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

"open the app and head to settings, you can link another account from there"
`;