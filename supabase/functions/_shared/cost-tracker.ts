// cost-tracker.ts — OpenAI API cost logging helper.
//
// Captures full usage breakdown per API call:
//   - Fresh vs cached input tokens (cached = 50% price)
//   - Reasoning tokens (o-series models)
//   - Actual cost vs what it would have cost without caching
//   - Cache savings in USD
//
// Always awaited — DB row lands before caller continues.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Pricing (USD per 1M tokens) ───────────────────────────────────────────────
// Each model has: input (fresh), inputCached (50% of fresh), output.
// Cached tokens: OpenAI charges 50% for prompt tokens served from cache.
// Reasoning tokens: billed at the output rate.

interface ModelPricing {
  input: number;        // fresh input tokens / 1M
  inputCached: number;  // cached input tokens / 1M (always 50% of input)
  output: number;       // output + reasoning tokens / 1M
}

function halfOf(n: number): number { return n / 2; }

const EXACT_PRICING: Record<string, ModelPricing> = {
  // GPT-4.1 family
  "gpt-4.1":                { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  },
  "gpt-4.1-mini":           { input: 0.40,  inputCached: halfOf(0.40),  output: 1.60  },
  "gpt-4.1-nano":           { input: 0.10,  inputCached: halfOf(0.10),  output: 0.40  },
  // GPT-4o family
  "gpt-4o":                 { input: 2.50,  inputCached: halfOf(2.50),  output: 10.00 },
  "gpt-4o-mini":            { input: 0.15,  inputCached: halfOf(0.15),  output: 0.60  },
  // GPT-5 family (Feb 2026 estimates — update when confirmed)
  "gpt-5":                  { input: 10.00, inputCached: halfOf(10.00), output: 40.00 },
  "gpt-5-mini":             { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  },
  "gpt-5-nano":             { input: 0.40,  inputCached: halfOf(0.40),  output: 1.60  },
  "gpt-5.2":                { input: 10.00, inputCached: halfOf(10.00), output: 40.00 },
  "gpt-5.2-mini":           { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  },
  "gpt-5.2-nano":           { input: 0.40,  inputCached: halfOf(0.40),  output: 1.60  },
  // Embeddings (no output tokens, no caching discount published)
  "text-embedding-3-large": { input: 0.13,  inputCached: 0.13,          output: 0.00  },
  "text-embedding-3-small": { input: 0.02,  inputCached: 0.02,          output: 0.00  },
  "text-embedding-ada-002": { input: 0.10,  inputCached: 0.10,          output: 0.00  },
};

// Prefix fallback — most-specific first, catches future model variants
const PREFIX_PRICING: Array<[string, ModelPricing]> = [
  ["gpt-5.2-nano",  { input: 0.40,  inputCached: halfOf(0.40),  output: 1.60  }],
  ["gpt-5.2-mini",  { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  }],
  ["gpt-5.2",       { input: 10.00, inputCached: halfOf(10.00), output: 40.00 }],
  ["gpt-5-nano",    { input: 0.40,  inputCached: halfOf(0.40),  output: 1.60  }],
  ["gpt-5-mini",    { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  }],
  ["gpt-5",         { input: 10.00, inputCached: halfOf(10.00), output: 40.00 }],
  ["gpt-4.1-nano",  { input: 0.10,  inputCached: halfOf(0.10),  output: 0.40  }],
  ["gpt-4.1-mini",  { input: 0.40,  inputCached: halfOf(0.40),  output: 1.60  }],
  ["gpt-4.1",       { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  }],
  ["gpt-4o-mini",   { input: 0.15,  inputCached: halfOf(0.15),  output: 0.60  }],
  ["gpt-4o",        { input: 2.50,  inputCached: halfOf(2.50),  output: 10.00 }],
  ["gpt-4",         { input: 2.00,  inputCached: halfOf(2.00),  output: 8.00  }],
  ["gpt-3.5",       { input: 0.50,  inputCached: halfOf(0.50),  output: 1.50  }],
];

function findPricing(model: string): ModelPricing {
  if (EXACT_PRICING[model]) return EXACT_PRICING[model];
  for (const [prefix, pricing] of PREFIX_PRICING) {
    if (model.startsWith(prefix)) return pricing;
  }
  console.warn(`[cost-tracker] Unknown model "${model}" — using GPT-4.1 pricing as fallback`);
  return { input: 2.00, inputCached: 1.00, output: 8.00 };
}

// ── Cost calculation ──────────────────────────────────────────────────────────

export interface CostBreakdown {
  costUsd: number;        // actual cost (with cache discount applied)
  costUsdNoCache: number; // what it would have cost if nothing was cached
  cacheSavingsUsd: number;
}

export function calculateCostBreakdown(
  model: string,
  tokensIn: number,
  tokensOut: number,
  tokensInCached: number = 0,
  tokensReasoning: number = 0,
): CostBreakdown {
  const p = findPricing(model);
  const tokensInFresh = tokensIn - tokensInCached;

  // Actual cost: fresh input at full rate, cached at half rate
  const costUsd =
    (tokensInFresh   / 1_000_000) * p.input        +
    (tokensInCached  / 1_000_000) * p.inputCached   +
    (tokensOut       / 1_000_000) * p.output        +
    (tokensReasoning / 1_000_000) * p.output;

  // Cost without any caching (all input at full rate)
  const costUsdNoCache =
    (tokensIn        / 1_000_000) * p.input         +
    (tokensOut       / 1_000_000) * p.output        +
    (tokensReasoning / 1_000_000) * p.output;

  const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

  return {
    costUsd:        round8(costUsd),
    costUsdNoCache: round8(costUsdNoCache),
    cacheSavingsUsd: round8(costUsdNoCache - costUsd),
  };
}

// Kept for backwards compat with any direct callers
export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  return calculateCostBreakdown(model, tokensIn, tokensOut).costUsd;
}

// ── Log interface ─────────────────────────────────────────────────────────────

export interface ApiUsageLog {
  userId: string | null;
  model: string;
  endpoint: string;
  description?: string;      // human-readable label, e.g. "Agent called: send_email, get_calendar_events"
  tokensIn: number;
  tokensOut: number;
  tokensInCached?: number;   // from usage.prompt_tokens_details.cached_tokens
  tokensReasoning?: number;  // from usage.completion_tokens_details.reasoning_tokens
  latencyMs?: number;
  status?: "success" | "error";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// ── Logger ────────────────────────────────────────────────────────────────────

export async function logApiUsage(
  supabase: SupabaseClient,
  log: ApiUsageLog,
): Promise<void> {
  const tokensInCached  = log.tokensInCached  ?? 0;
  const tokensReasoning = log.tokensReasoning ?? 0;

  const { costUsd, costUsdNoCache } = calculateCostBreakdown(
    log.model,
    log.tokensIn,
    log.tokensOut,
    tokensInCached,
    tokensReasoning,
  );

  const { error } = await supabase
    .from("openai_api_logs")
    .insert({
      user_id:           log.userId,
      model:             log.model,
      endpoint:          log.endpoint,
      description:       log.description      ?? null,
      tokens_in:         log.tokensIn,
      tokens_out:        log.tokensOut,
      tokens_in_cached:  tokensInCached,
      tokens_reasoning:  tokensReasoning,
      cost_usd:          costUsd,
      cost_usd_no_cache: costUsdNoCache,
      latency_ms:        log.latencyMs        ?? null,
      status:            log.status           ?? "success",
      error_message:     log.errorMessage     ?? null,
      metadata:          log.metadata         ?? null,
    });

  if (error) {
    console.warn("[cost-tracker] Failed to log API usage:", error.message);
  }
}
