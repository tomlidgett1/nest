import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[ai-proxy] Missing Supabase environment variables");
}

if (!openaiApiKey) {
  console.error("[ai-proxy] Missing OPENAI_API_KEY");
}

if (!anthropicApiKey) {
  console.error("[ai-proxy] Missing ANTHROPIC_API_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Provider configuration
const providerConfig: Record<
  string,
  { baseUrl: string; buildHeaders: () => Record<string, string> }
> = {
  openai: {
    baseUrl: "https://api.openai.com",
    buildHeaders: () => ({
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    }),
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    buildHeaders: () => ({
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
  },
};

interface ProxyRequest {
  provider: "openai" | "anthropic";
  endpoint: string;
  body: Record<string, unknown>;
  stream?: boolean;
}

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
    console.error("[ai-proxy] Invalid JWT", authError?.message ?? "unknown");
    return jsonResponse({ error: "unauthorised" }, 401);
  }

  // --- Parse request ---
  let payload: ProxyRequest;
  try {
    payload = (await req.json()) as ProxyRequest;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { provider, endpoint, body, stream } = payload;

  if (!provider || !endpoint || !body) {
    return jsonResponse({ error: "missing_fields", detail: "provider, endpoint, and body are required" }, 400);
  }

  const config = providerConfig[provider];
  if (!config) {
    return jsonResponse({ error: "unknown_provider", detail: `Provider '${provider}' is not supported` }, 400);
  }

  // --- Forward to AI provider ---
  const targetUrl = `${config.baseUrl}${endpoint}`;
  const headers = config.buildHeaders();

  console.log(`[ai-proxy] Forwarding to ${provider} → ${targetUrl}`);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // If upstream returns an error, wrap it so the client doesn't confuse
    // an upstream 401 (bad API key) with a Supabase auth 401.
    if (!upstreamResponse.ok) {
      const errorBody = await upstreamResponse.text();
      console.error(
        `[ai-proxy] Upstream ${provider} error: HTTP ${upstreamResponse.status}`,
        errorBody.slice(0, 500)
      );
      return jsonResponse(
        {
          error: "upstream_error",
          status: upstreamResponse.status,
          provider,
          detail: errorBody.slice(0, 1000),
        },
        502
      );
    }

    // --- Streaming response ---
    if (stream && upstreamResponse.body) {
      const responseHeaders = {
        ...corsHeaders,
        "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
      };

      return new Response(upstreamResponse.body, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // --- Standard JSON response ---
    const responseBody = await upstreamResponse.text();

    return new Response(responseBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[ai-proxy] Upstream request failed:", message);
    return jsonResponse({ error: "upstream_error", detail: message }, 502);
  }
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
