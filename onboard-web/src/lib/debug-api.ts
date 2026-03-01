import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Types ────────────────────────────────────────────────────

export interface DebugLogEntry {
  id: string
  user_id: string
  source: string
  route_path: string
  model: string | null
  user_message: string
  trace: Record<string, any>
  created_at: string
}

export interface DebugUser {
  user_id: string
  google_email: string
  is_primary: boolean
}

// ── Queries ──────────────────────────────────────────────────

export async function fetchDebugLogs(opts?: {
  userId?: string
  path?: string
  limit?: number
}): Promise<DebugLogEntry[]> {
  let query = admin
    .from('v2_debug_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50)

  if (opts?.userId) query = query.eq('user_id', opts.userId)
  if (opts?.path) query = query.eq('route_path', opts.path)

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch debug logs: ${error.message}`)
  return data ?? []
}

export async function fetchDebugLog(id: string): Promise<DebugLogEntry | null> {
  const { data, error } = await admin
    .from('v2_debug_logs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchUsers(): Promise<DebugUser[]> {
  const { data, error } = await admin
    .from('user_google_accounts')
    .select('user_id, google_email, is_primary')
    .order('is_primary', { ascending: false })

  if (error) throw new Error(`Failed to fetch users: ${error.message}`)
  return data ?? []
}

// ── Debug Chatbot ───────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function askDebugChat(
  trace: Record<string, any>,
  question: string,
  history: ChatMessage[] = [],
): Promise<string> {
  const resp = await fetch(`${supabaseUrl}/functions/v1/debug-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ trace, question, history }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error ?? `HTTP ${resp.status}`)
  }

  const data = await resp.json()
  return data.answer
}

// ── Cost Calculation (client-side) ──────────────────────────

const MODEL_PRICING: Record<string, { input: number; inputCached: number; output: number }> = {
  'gpt-4.1':       { input: 2.00,  inputCached: 0.50,   output: 8.00  },
  'gpt-4.1-mini':  { input: 0.40,  inputCached: 0.10,   output: 1.60  },
  'gpt-4.1-nano':  { input: 0.10,  inputCached: 0.025,  output: 0.40  },
  'gpt-4o':        { input: 2.50,  inputCached: 1.25,   output: 10.00 },
  'gpt-4o-mini':   { input: 0.15,  inputCached: 0.075,  output: 0.60  },
  'gpt-5.2':       { input: 1.75,  inputCached: 0.175,  output: 14.00 },
  'gpt-5.1':       { input: 1.25,  inputCached: 0.125,  output: 10.00 },
  'gpt-5':         { input: 1.25,  inputCached: 0.125,  output: 10.00 },
  'gpt-5-mini':    { input: 0.25,  inputCached: 0.025,  output: 2.00  },
  'gpt-5-nano':    { input: 0.05,  inputCached: 0.005,  output: 0.40  },
}

function findPricing(model: string) {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  for (const [prefix, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(prefix)) return pricing
  }
  return { input: 2.00, inputCached: 1.00, output: 8.00 }
}

export interface CostBreakdown {
  totalCostUsd: number
  totalTokensIn: number
  totalTokensOut: number
  totalCached: number
  calls: Array<{
    model: string
    endpoint: string
    tokensIn: number
    tokensOut: number
    cached: number
    costUsd: number
  }>
}

export function calculateTraceCost(usage: any[] | null): CostBreakdown | null {
  if (!usage || !Array.isArray(usage) || usage.length === 0) return null

  let totalCostUsd = 0
  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCached = 0

  const calls = usage.map((u: any) => {
    const p = findPricing(u.model ?? '')
    const freshIn = (u.prompt_tokens ?? 0) - (u.cached_tokens ?? 0)
    const cachedIn = u.cached_tokens ?? 0
    const out = (u.completion_tokens ?? 0) + (u.reasoning_tokens ?? 0)

    const cost =
      (freshIn  / 1_000_000) * p.input +
      (cachedIn / 1_000_000) * p.inputCached +
      (out      / 1_000_000) * p.output

    totalCostUsd += cost
    totalTokensIn += u.prompt_tokens ?? 0
    totalTokensOut += u.completion_tokens ?? 0
    totalCached += cachedIn

    return {
      model: u.model ?? '?',
      endpoint: u.endpoint ?? '?',
      tokensIn: u.prompt_tokens ?? 0,
      tokensOut: u.completion_tokens ?? 0,
      cached: cachedIn,
      costUsd: Math.round(cost * 1_000_000) / 1_000_000,
    }
  })

  return {
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    totalTokensIn,
    totalTokensOut,
    totalCached,
    calls,
  }
}
