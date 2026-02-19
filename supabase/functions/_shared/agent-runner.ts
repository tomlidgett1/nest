// Generic Execution Agent runner.
// Loads an agent's config and message history from Supabase,
// runs a Claude tool-use loop, and persists results.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmailAgentPrompt, EMAIL_TOOLS } from "./email-agent.ts";
import { MEETING_SEARCH_PROMPT, MEETING_SEARCH_TOOLS } from "./meeting-search-agent.ts";
import { executeTool } from "./tools.ts";

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

/**
 * Run an execution agent: load state → Claude loop → persist output.
 */
export async function runExecutionAgent(
  agentId: string,
  userId: string,
  input: string,
  supabase: SupabaseClient,
  emailStyleContext?: string
): Promise<string> {
  // Load agent config
  const { data: agent, error: agentError } = await supabase
    .from("v2_agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    console.error("[agent-runner] Agent not found:", agentId, agentError?.message);
    return "[Agent not found]";
  }

  // Load agent's conversation history
  const { data: history } = await supabase
    .from("v2_agent_messages")
    .select("role, content, tool_name")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true })
    .limit(100);

  // Build message array from history
  const messages: any[] = (history ?? []).map((h: any) => {
    if (h.role === "tool_call") {
      return { role: "assistant", content: h.content };
    }
    if (h.role === "tool_result") {
      return { role: "user", content: h.content };
    }
    return { role: h.role, content: h.content };
  });

  messages.push({ role: "user", content: input });

  // Save user input
  await supabase.from("v2_agent_messages").insert({
    agent_id: agentId,
    role: "user",
    content: input,
  });

  // Resolve tools based on agent type
  const toolDefs = getToolsForAgent(agent.agent_type);
  
  // For email agents, inject the user's writing style context into the system prompt
  let systemPrompt = agent.system_prompt;
  if (agent.agent_type === "email" && emailStyleContext) {
    systemPrompt += `\n\n${emailStyleContext}`;
    console.log(`[agent-runner] Injected ${emailStyleContext.length} chars of email style context into agent ${agentId}`);
  }

  let iterations = 0;
  const MAX_ITERATIONS = 15;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await callClaude(systemPrompt, messages, toolDefs);

    const toolCalls = response.content.filter((b: any) => b.type === "tool_use");
    const textBlocks = response.content.filter((b: any) => b.type === "text");

    // No tool calls → done
    if (toolCalls.length === 0) {
      const output = textBlocks.map((b: any) => b.text).join("\n");

      await supabase.from("v2_agent_messages").insert({
        agent_id: agentId,
        role: "assistant",
        content: output,
      });

      // Update last active
      await supabase
        .from("v2_agents")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", agentId);

      return output;
    }

    // Execute tools in parallel
    const results = await Promise.all(
      toolCalls.map(async (tc: any) => {
        // Persist tool call
        await supabase.from("v2_agent_messages").insert({
          agent_id: agentId,
          role: "tool_call",
          content: JSON.stringify(tc.input),
          tool_name: tc.name,
        });

        let result: any;
        try {
          result = await executeTool(tc.name, tc.input, userId, supabase);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isGoogleAuth =
            msg.includes("GOOGLE_REAUTH_REQUIRED") ||
            msg.includes("invalid_grant") ||
            msg.includes("Google token refresh failed");
          result = isGoogleAuth
            ? {
                error: "google_auth_reconnect_required",
                detail:
                  "Google account access has expired or was revoked. Please reconnect your Google account in Settings > Accounts.",
              }
            : { error: `Tool execution failed: ${msg}` };
        }

        // Persist tool result
        await supabase.from("v2_agent_messages").insert({
          agent_id: agentId,
          role: "tool_result",
          content: JSON.stringify(result),
          tool_name: tc.name,
        });

        return {
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(result),
        };
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: results });
  }

  return "[Agent reached max iterations]";
}

/**
 * Spawn a new execution agent and return its record.
 */
export async function spawnAgent(
  input: { name: string; agent_type: string; goal: string; meeting_id?: string },
  userId: string,
  supabase: SupabaseClient,
  emailStyleContext?: string
): Promise<any> {
  const systemPrompt =
    input.agent_type === "email" ? buildEmailAgentPrompt(emailStyleContext) : MEETING_SEARCH_PROMPT;

  const tools =
    input.agent_type === "email"
      ? EMAIL_TOOLS.map((t) => t.name)
      : MEETING_SEARCH_TOOLS.map((t) => t.name);

  const { data, error } = await supabase
    .from("v2_agents")
    .insert({
      user_id: userId,
      name: input.name,
      agent_type: input.agent_type,
      system_prompt: systemPrompt,
      tools,
      meeting_id: input.meeting_id ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("[agent-runner] Failed to spawn agent:", error.message);
    throw new Error(`Failed to spawn agent: ${error.message}`);
  }

  return data;
}

// ── Helpers ──────────────────────────────────────────────────

function getToolsForAgent(agentType: string): any[] {
  switch (agentType) {
    case "email":
      return EMAIL_TOOLS;
    case "meeting_search":
      return MEETING_SEARCH_TOOLS;
    default:
      return [];
  }
}

async function callClaude(
  systemPrompt: string,
  messages: any[],
  tools: any[]
): Promise<any> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[agent-runner] Claude API error:", response.status, detail.slice(0, 500));
    throw new Error(`Claude API error (${response.status}): ${detail.slice(0, 300)}`);
  }

  return await response.json();
}
