/**
 * SMS Status Webhook — receives delivery status updates from MobileMessage.
 *
 * Updates the sms_messages table with delivery status (delivered/failed).
 * Handles multipart messages by tracking part_number/total_parts.
 *
 * Payload:
 *   { to, message, sender, custom_ref, status, message_id, received_at, part_number, total_parts }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let payload: {
    to?: string;
    message?: string;
    sender?: string;
    custom_ref?: string;
    status?: string;
    message_id?: string;
    received_at?: string;
    part_number?: number;
    total_parts?: number;
  };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { message_id, status, custom_ref, part_number, total_parts } = payload;

  if (!message_id || !status) {
    return jsonResponse({ error: "missing_message_id_or_status" }, 400);
  }

  console.log(
    `[sms-status] ${message_id}: ${status} (part ${part_number ?? 1}/${total_parts ?? 1})` +
    (custom_ref ? ` ref=${custom_ref}` : ""),
  );

  try {
    // Update the message status in our tracking table
    const newStatus = status === "delivered" ? "delivered" : "failed";

    const { error } = await supabaseAdmin
      .from("sms_messages")
      .update({
        status: newStatus,
        delivered_at: status === "delivered" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("mobile_message_id", message_id);

    if (error) {
      console.warn(`[sms-status] Update failed for ${message_id}: ${error.message}`);
    }

    // For multipart messages, log if all parts are delivered
    if (total_parts && total_parts > 1) {
      console.log(
        `[sms-status] Multipart: ${message_id} part ${part_number}/${total_parts} → ${status}`,
      );
    }
  } catch (e) {
    console.error("[sms-status] Error:", e instanceof Error ? e.message : "unknown");
  }

  return jsonResponse({ status: "ok" });
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
