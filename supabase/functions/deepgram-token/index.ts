import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const deepgramApiKey = Deno.env.get("DEEPGRAM_API_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[deepgram-token] Missing Supabase environment variables");
}

if (!deepgramApiKey) {
  console.error("[deepgram-token] Missing DEEPGRAM_API_KEY");
}

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

  // --- Authenticate ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    console.error("[deepgram-token] Invalid JWT", authError?.message ?? "unknown");
    return jsonResponse({ error: "unauthorised" }, 401);
  }

  if (!deepgramApiKey) {
    console.error("[deepgram-token] DEEPGRAM_API_KEY not configured");
    return jsonResponse({ error: "service_unavailable" }, 503);
  }

  return jsonResponse({ token: deepgramApiKey }, 200);
});

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
