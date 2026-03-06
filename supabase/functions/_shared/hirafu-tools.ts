// hirafu-tools.ts — Capability registry + tool wrapper for Hirafu.
//
// Wraps the existing executeTool from tools.ts with:
//   - Capability registry (scope validation, mutation gating)
//   - Pending action creation for write operations
//   - Idempotency key generation
//   - Audit event logging

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeTool as nestExecuteTool } from "./tools.ts";

// ── Capability Registry ──────────────────────────────────────

interface ToolCapability {
  requiredScopes: string[];
  provider: "google" | "microsoft" | "none";
  mutatesState: boolean;
  requiresConfirmation: boolean;
  maxCallsPerTurn: number;
  idempotent: boolean;
  dataSensitivity: "low" | "medium" | "high";
}

const CAPABILITY_REGISTRY: Record<string, ToolCapability> = {
  calendar_lookup:     { requiredScopes: ["calendar.readonly"], provider: "google", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 4, idempotent: true, dataSensitivity: "low" },
  calendar_create:     { requiredScopes: ["calendar"], provider: "google", mutatesState: true, requiresConfirmation: true, maxCallsPerTurn: 2, idempotent: false, dataSensitivity: "medium" },
  calendar_update:     { requiredScopes: ["calendar"], provider: "google", mutatesState: true, requiresConfirmation: true, maxCallsPerTurn: 2, idempotent: false, dataSensitivity: "medium" },
  calendar_delete:     { requiredScopes: ["calendar"], provider: "google", mutatesState: true, requiresConfirmation: true, maxCallsPerTurn: 1, idempotent: false, dataSensitivity: "medium" },
  gmail_search:        { requiredScopes: ["gmail.readonly"], provider: "google", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 3, idempotent: true, dataSensitivity: "medium" },
  get_email:           { requiredScopes: ["gmail.readonly"], provider: "google", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 3, idempotent: true, dataSensitivity: "medium" },
  send_draft:          { requiredScopes: ["gmail.compose"], provider: "google", mutatesState: true, requiresConfirmation: true, maxCallsPerTurn: 1, idempotent: false, dataSensitivity: "high" },
  send_email:          { requiredScopes: ["gmail.send"], provider: "google", mutatesState: true, requiresConfirmation: true, maxCallsPerTurn: 1, idempotent: false, dataSensitivity: "high" },
  semantic_search:     { requiredScopes: [], provider: "none", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 3, idempotent: true, dataSensitivity: "low" },
  web_search:          { requiredScopes: [], provider: "none", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "low" },
  weather_lookup:      { requiredScopes: [], provider: "none", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "low" },
  travel_time:         { requiredScopes: [], provider: "none", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "low" },
  places_search:       { requiredScopes: [], provider: "none", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "low" },
  manage_reminder:     { requiredScopes: [], provider: "none", mutatesState: true, requiresConfirmation: false, maxCallsPerTurn: 3, idempotent: false, dataSensitivity: "low" },
  manage_todos:        { requiredScopes: [], provider: "none", mutatesState: true, requiresConfirmation: false, maxCallsPerTurn: 3, idempotent: false, dataSensitivity: "low" },
  document_search:     { requiredScopes: ["drive.readonly"], provider: "google", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "medium" },
  create_note:         { requiredScopes: ["drive"], provider: "google", mutatesState: true, requiresConfirmation: false, maxCallsPerTurn: 1, idempotent: false, dataSensitivity: "medium" },
  contacts_search:     { requiredScopes: ["contacts.readonly"], provider: "google", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "medium" },
  contacts_manage:     { requiredScopes: ["contacts"], provider: "google", mutatesState: true, requiresConfirmation: true, maxCallsPerTurn: 1, idempotent: false, dataSensitivity: "high" },
  person_lookup:       { requiredScopes: [], provider: "none", mutatesState: false, requiresConfirmation: false, maxCallsPerTurn: 2, idempotent: true, dataSensitivity: "medium" },
  update_user_timezone: { requiredScopes: [], provider: "none", mutatesState: true, requiresConfirmation: false, maxCallsPerTurn: 1, idempotent: true, dataSensitivity: "low" },
};

export function getCapability(toolName: string): ToolCapability | null {
  return CAPABILITY_REGISTRY[toolName] ?? null;
}

export function getAllToolNames(): string[] {
  return Object.keys(CAPABILITY_REGISTRY);
}

// ── Audit Logging ────────────────────────────────────────────

export async function logAuditEvent(
  supabase: SupabaseClient,
  userId: string,
  traceId: string,
  eventType: string,
  metadata: Record<string, any> = {},
): Promise<void> {
  try {
    await supabase.from("hirafu_audit_events").insert({
      user_id: userId,
      trace_id: traceId,
      event_type: eventType,
      metadata,
    });
  } catch (e) {
    console.error("[hirafu-tools] Audit log failed:", (e as Error).message);
  }
}

// ── Pending Action Management ────────────────────────────────

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function createPendingAction(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  toolPayload: Record<string, any>,
  humanSummary: string,
  accountId?: string,
): Promise<string> {
  const idempotencyKey = generateIdempotencyKey();

  const { data, error } = await supabase
    .from("hirafu_pending_actions")
    .insert({
      user_id: userId,
      action_type: actionType,
      tool_payload: toolPayload,
      human_summary: humanSummary,
      account_id: accountId ?? null,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[hirafu-tools] Failed to create pending action:", error.message);
    return "";
  }

  console.log(`[hirafu-tools] Pending action created: ${actionType} (${data.id})`);
  return data.id;
}

export async function getLatestPendingAction(
  supabase: SupabaseClient,
  userId: string,
): Promise<any | null> {
  const { data } = await supabase
    .from("hirafu_pending_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "awaiting_confirmation")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function executePendingAction(
  supabase: SupabaseClient,
  actionId: string,
  userId: string,
  userTimezone?: string,
  onTimezoneChange?: (tz: string) => void,
): Promise<string> {
  const { data: action, error } = await supabase
    .from("hirafu_pending_actions")
    .select("*")
    .eq("id", actionId)
    .eq("user_id", userId)
    .eq("status", "awaiting_confirmation")
    .single();

  if (error || !action) {
    return JSON.stringify({ error: "Pending action not found or expired" });
  }

  // Check idempotency
  const { data: existing } = await supabase
    .from("hirafu_pending_actions")
    .select("id")
    .eq("idempotency_key", action.idempotency_key)
    .eq("status", "executed")
    .maybeSingle();

  if (existing) {
    return JSON.stringify({ error: "Action already executed" });
  }

  // Mark as confirmed
  await supabase
    .from("hirafu_pending_actions")
    .update({ status: "confirmed" })
    .eq("id", actionId);

  // Map args and execute the tool
  const mappedPayload = mapToolArgs(action.action_type, action.tool_payload);
  let result: string;

  if (action.action_type === "send_email" && !mappedPayload.draft_id) {
    const draftResult = await nestExecuteTool("send_draft", mappedPayload, userId, supabase, userTimezone, onTimezoneChange);
    let sent = false;
    try {
      const draftData = JSON.parse(draftResult);
      if (draftData.draft_id) {
        result = await nestExecuteTool("send_email", { draft_id: draftData.draft_id, account: mappedPayload.account }, userId, supabase, userTimezone, onTimezoneChange);
        sent = true;
      }
    } catch { /* fall through */ }
    if (!sent) result = draftResult;
  } else {
    result = await nestExecuteTool(
      action.action_type,
      mappedPayload,
      userId,
      supabase,
      userTimezone,
      onTimezoneChange,
    );
  }

  // Mark as executed
  const parsedResult = (() => {
    try { return JSON.parse(result); } catch { return { raw: result }; }
  })();

  const finalStatus = parsedResult.error ? "failed" : "executed";

  await supabase
    .from("hirafu_pending_actions")
    .update({
      status: finalStatus,
      execution_result: parsedResult,
    })
    .eq("id", actionId);

  return result;
}

export async function cancelPendingAction(
  supabase: SupabaseClient,
  actionId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("hirafu_pending_actions")
    .update({ status: "cancelled" })
    .eq("id", actionId)
    .eq("user_id", userId);
}

// ── Tool Execution Wrapper ───────────────────────────────────

interface ExecuteToolOpts {
  userId: string;
  supabase: SupabaseClient;
  traceId: string;
  userTimezone?: string;
  onTimezoneChange?: (tz: string) => void;
  userScopes?: string[];
  turnToolCounts?: Map<string, number>;
}

function mapToolArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === "calendar_create" || name === "calendar_update") {
    const mapped = { ...args };
    const date = mapped.date as string | undefined;
    if (date && mapped.start_time && !(mapped.start_time as string).includes("T")) {
      mapped.start_time = `${date}T${mapped.start_time}:00`;
    }
    if (date && mapped.end_time && !(mapped.end_time as string).includes("T")) {
      mapped.end_time = `${date}T${mapped.end_time}:00`;
    }
    if (!mapped.end_time && mapped.start_time) {
      const start = new Date(mapped.start_time as string);
      start.setMinutes(start.getMinutes() + 30);
      mapped.end_time = start.toISOString().slice(0, 19);
    }
    return mapped;
  }
  if (name === "manage_reminder") {
    const mapped = { ...args };
    if (mapped.text && !mapped.description) { mapped.description = mapped.text; delete mapped.text; }
    if (mapped.time && !mapped.schedule) {
      const timeStr = mapped.time as string;
      const parsed = new Date(timeStr);
      if (!isNaN(parsed.getTime())) {
        const utcMin = parsed.getUTCMinutes();
        const utcHour = parsed.getUTCHours();
        const utcDay = parsed.getUTCDate();
        const utcMonth = parsed.getUTCMonth() + 1;
        mapped.cron_expression = `${utcMin} ${utcHour} ${utcDay} ${utcMonth} *`;
      } else {
        mapped.schedule = timeStr;
      }
      delete mapped.time;
    }
    return mapped;
  }
  if (name === "manage_todos") {
    const mapped = { ...args };
    if (mapped.text && !mapped.title) { mapped.title = mapped.text; delete mapped.text; }
    if (mapped.action === "create") mapped.action = "add";
    return mapped;
  }
  return args;
}

export async function executeHirafuTool(
  name: string,
  args: Record<string, unknown>,
  opts: ExecuteToolOpts,
): Promise<string> {
  const { userId, supabase, traceId, userTimezone, onTimezoneChange, userScopes, turnToolCounts } = opts;

  const cap = getCapability(name);

  // Unknown tool
  if (!cap) {
    await logAuditEvent(supabase, userId, traceId, "tool_unknown", { tool: name });
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  // Scope check — match short names against full Google scope URLs, with hierarchy
  if (cap.requiredScopes.length > 0 && userScopes) {
    const SCOPE_HIERARCHY: Record<string, string[]> = {
      "gmail.readonly": ["gmail.modify"],
      "gmail.compose": ["gmail.modify"],
      "calendar.readonly": ["calendar", "calendar.events"],
      "drive.readonly": ["drive"],
      "contacts.readonly": ["contacts"],
    };
    const hasScope = cap.requiredScopes.some(required => {
      const equivalents = [required, ...(SCOPE_HIERARCHY[required] ?? [])];
      return equivalents.some(eq =>
        userScopes.some(us => us === eq || us.endsWith(`/${eq}`) || us.endsWith(`/auth/${eq}`))
      );
    });
    if (!hasScope) {
      await logAuditEvent(supabase, userId, traceId, "tool_scope_denied", { tool: name, required: cap.requiredScopes });
      return JSON.stringify({ error: `Missing required scope for ${name}`, hint: "Connect your account to use this feature" });
    }
  }

  // Rate limit check
  if (turnToolCounts) {
    const count = turnToolCounts.get(name) ?? 0;
    if (count >= cap.maxCallsPerTurn) {
      await logAuditEvent(supabase, userId, traceId, "tool_rate_limited", { tool: name, count, max: cap.maxCallsPerTurn });
      return JSON.stringify({ error: `Rate limit: ${name} called ${count} times this turn (max ${cap.maxCallsPerTurn})` });
    }
    turnToolCounts.set(name, count + 1);
  }

  // Mutation gating — create pending action instead of executing
  if (cap.mutatesState && cap.requiresConfirmation) {
    const summary = buildHumanSummary(name, args);
    const actionId = await createPendingAction(supabase, userId, name, args as Record<string, any>, summary);
    await logAuditEvent(supabase, userId, traceId, "pending_action_created", { tool: name, actionId });
    return JSON.stringify({
      pending_action: true,
      action_id: actionId,
      summary,
      message: `I need your confirmation before I ${summary.toLowerCase()}. Shall I go ahead?`,
    });
  }

  // Map Hirafu tool params → Nest tool params where schemas differ
  const mappedArgs = mapToolArgs(name, args);

  // Execute directly
  await logAuditEvent(supabase, userId, traceId, "tool_called", { tool: name, args: mappedArgs });

  // send_email without draft_id → create draft first, then send
  if (name === "send_email" && !mappedArgs.draft_id) {
    const draftResult = await nestExecuteTool("send_draft", mappedArgs, userId, supabase, userTimezone, onTimezoneChange);
    try {
      const draftData = JSON.parse(draftResult);
      if (draftData.draft_id) {
        const sendResult = await nestExecuteTool("send_email", { draft_id: draftData.draft_id, account: mappedArgs.account }, userId, supabase, userTimezone, onTimezoneChange);
        const isError = sendResult.includes('"error"');
        await logAuditEvent(supabase, userId, traceId, isError ? "tool_failed" : "tool_succeeded", { tool: name });
        return sendResult;
      }
    } catch { /* fall through to return draft result */ }
    const isError = draftResult.includes('"error"');
    await logAuditEvent(supabase, userId, traceId, isError ? "tool_failed" : "tool_succeeded", { tool: name });
    return draftResult;
  }

  const result = await nestExecuteTool(name, mappedArgs, userId, supabase, userTimezone, onTimezoneChange);

  const isError = result.includes('"error"');
  await logAuditEvent(supabase, userId, traceId, isError ? "tool_failed" : "tool_succeeded", { tool: name });

  return result;
}

// ── Human-readable summaries for pending actions ─────────────

function buildHumanSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "calendar_create":
      return `Create a calendar event: "${args.title ?? "Untitled"}" on ${args.date ?? "the specified date"}`;
    case "calendar_update":
      return `Update calendar event: "${args.title ?? args.event_id ?? "event"}"`;
    case "calendar_delete":
      return `Delete calendar event: "${args.title ?? args.event_id ?? "event"}"`;
    case "send_email":
      return `Send an email to ${args.to ?? "the recipient"}: "${(args.subject as string)?.slice(0, 60) ?? "No subject"}"`;
    case "send_draft":
      return `Send the email draft: "${(args.subject as string)?.slice(0, 60) ?? "draft"}"`;
    case "contacts_manage":
      return `Update contact: ${args.name ?? "contact"}`;
    default:
      return `Execute ${toolName}`;
  }
}

// ── Tool Definitions for OpenAI ──────────────────────────────

export const HIRAFU_AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "calendar_lookup",
      description: "Search the user's calendar for events. Returns matching events with title, time, attendees, and location.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query or date range (e.g. 'today', 'tomorrow', 'this week', 'meetings with Sarah')" },
          time_zone: { type: "string", description: "IANA timezone" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calendar_create",
      description: "Create a new calendar event.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "ISO date or natural language" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          attendees: { type: "array", items: { type: "string" }, description: "Email addresses" },
          location: { type: "string" },
          description: { type: "string" },
          time_zone: { type: "string" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calendar_update",
      description: "Update an existing calendar event.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          title: { type: "string" },
          date: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          location: { type: "string" },
          description: { type: "string" },
          time_zone: { type: "string" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calendar_delete",
      description: "Delete a calendar event.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          time_zone: { type: "string" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "gmail_search",
      description: "Search the user's Gmail inbox.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query" },
          max_results: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_email",
      description: "Get full content of a specific email by ID.",
      parameters: {
        type: "object",
        properties: {
          message_id: { type: "string" },
        },
        required: ["message_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_draft",
      description: "Create and optionally send an email draft.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          reply_to_message_id: { type: "string" },
          send: { type: "boolean", description: "If true, send immediately" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description: "Send an email directly.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          reply_to_message_id: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "semantic_search",
      description: "Search across the user's indexed documents, notes, emails, and transcripts using semantic similarity.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          source_types: { type: "array", items: { type: "string" }, description: "Filter by source type" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for current information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "weather_lookup",
      description: "Get current weather and forecast for a location.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "travel_time",
      description: "Get travel time and directions between two locations.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          mode: { type: "string", description: "driving, transit, walking, bicycling" },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "places_search",
      description: "Search for places, restaurants, businesses nearby.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          location: { type: "string", description: "Near this location" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_reminder",
      description: "Create, list, or delete reminders.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "delete"] },
          text: { type: "string" },
          time: { type: "string", description: "When to remind (ISO or natural language)" },
          reminder_id: { type: "string" },
          time_zone: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_todos",
      description: "Create, list, update, or delete to-do items.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "delete"] },
          text: { type: "string" },
          todo_id: { type: "string" },
          completed: { type: "boolean" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "document_search",
      description: "Search the user's Google Drive for documents.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_user_timezone",
      description: "Update the user's timezone.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "IANA timezone (e.g. Australia/Melbourne)" },
        },
        required: ["timezone"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "person_lookup",
      description: "Look up information about a person by name or email.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name or email to look up" },
        },
        required: ["query"],
      },
    },
  },
];

// Tool subsets for lightweight routing
export const TOOL_SUBSETS: Record<string, string[]> = {
  calendar: ["calendar_lookup", "calendar_create", "calendar_update", "calendar_delete"],
  weather: ["weather_lookup"],
  inbox: ["gmail_search", "get_email", "send_draft", "send_email"],
  reminder: ["manage_reminder"],
  todo: ["manage_todos"],
  transit: ["travel_time"],
  places: ["places_search", "weather_lookup"],
  currency: ["web_search"],
  time: ["web_search"],
};

export function getToolSubset(category: string): typeof HIRAFU_AGENT_TOOLS {
  const names = TOOL_SUBSETS[category];
  if (!names) return HIRAFU_AGENT_TOOLS;
  return HIRAFU_AGENT_TOOLS.filter(t => names.includes(t.function.name));
}
