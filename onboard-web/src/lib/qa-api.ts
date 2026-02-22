import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Types ────────────────────────────────────────────────────

export interface QAUser {
  user_id: string
  google_email: string
  is_primary: boolean
}

export interface DebugInfo {
  source: string
  path: string
  tools_used: string[]
  timing: {
    context_ms: number
    agent_ms: number
    total_ms: number
    orchestrator_latency_ms: number
  }
  [key: string]: unknown
}

export interface AgentResponse {
  id: string
  response: string
  responseId: string | null
  debug: DebugInfo | null
  latencyMs: number
  variationLabel?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'ack'
  content: string
  responseId?: string | null
  debug?: DebugInfo | null
  timestamp: string
  variantOf?: string
}

export interface Feedback {
  id: string
  user_id: string
  google_email?: string
  response_id: string | null
  query: string
  response: string
  rating: 'good' | 'bad' | null
  note: string | null
  debug_json: DebugInfo | null
  all_variants?: AgentResponse[] | null
  chosen_variant?: string | null
  created_at: string
}

// ── Users ────────────────────────────────────────────────────

export async function fetchUsers(): Promise<QAUser[]> {
  const { data, error } = await admin
    .from('user_google_accounts')
    .select('user_id, google_email, is_primary')
    .order('is_primary', { ascending: false })

  if (error) throw new Error(`Failed to fetch users: ${error.message}`)
  return data ?? []
}

// ── Chat ─────────────────────────────────────────────────────

export async function sendMessage(
  userId: string,
  message: string,
  onAck?: (text: string) => void,
  qaVariation?: string,
): Promise<AgentResponse> {
  const start = Date.now()
  const body: Record<string, unknown> = { user_id: userId, message }
  if (qaVariation) body._qa_variation = qaVariation

  const res = await fetch(`${supabaseUrl}/functions/v1/v2-chat-service`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Agent error ${res.status}: ${text}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  const raw = await res.text()
  const latencyMs = Date.now() - start

  // NDJSON streaming response (iMessage path)
  if (contentType.includes('ndjson') || raw.includes('\n{')) {
    const lines = raw.split('\n').filter((l) => l.trim())
    let response = ''
    let responseId: string | null = null
    let debug: DebugInfo | null = null

    for (const line of lines) {
      try {
        const obj = JSON.parse(line)
        if (obj.type === 'ack' && onAck) {
          onAck(obj.text)
        } else if (obj.type === 'response' || obj.response) {
          response = obj.response ?? ''
          responseId = obj.response_id ?? null
          debug = obj._debug ?? null
        }
      } catch {
        // skip malformed lines
      }
    }

    return { id: crypto.randomUUID(), response, responseId, debug, latencyMs }
  }

  // Single JSON response (app path / static / casual)
  const obj = JSON.parse(raw)
  return {
    id: crypto.randomUUID(),
    response: obj.response ?? '',
    responseId: obj.response_id ?? null,
    debug: obj._debug ?? null,
    latencyMs,
  }
}

const VARIATION_LABELS = ['concise', 'detailed', 'casual', 'formal', 'playful'] as const

export async function sendMessageMulti(
  userId: string,
  message: string,
  count: number = 3,
  onAck?: (text: string) => void,
): Promise<AgentResponse[]> {
  let ackFired = false
  const wrappedAck = onAck
    ? (text: string) => {
        if (!ackFired) {
          ackFired = true
          onAck(text)
        }
      }
    : undefined

  const variations = VARIATION_LABELS.slice(0, count)
  const promises = variations.map((v) =>
    sendMessage(userId, message, wrappedAck, v),
  )

  const results = await Promise.allSettled(promises)
  return results
    .filter((r): r is PromiseFulfilledResult<AgentResponse> => r.status === 'fulfilled')
    .map((r, i) => ({ ...r.value, variationLabel: variations[i] }))
}

// ── Feedback ─────────────────────────────────────────────────

export async function saveFeedback(feedback: {
  user_id: string
  response_id: string | null
  query: string
  response: string
  rating: 'good' | 'bad'
  note?: string
  debug_json?: DebugInfo | null
  all_variants?: AgentResponse[] | null
  chosen_variant?: string | null
}): Promise<void> {
  const { error } = await admin.from('qa_feedback').insert({
    user_id: feedback.user_id,
    response_id: feedback.response_id,
    query: feedback.query,
    response: feedback.response,
    rating: feedback.rating,
    note: feedback.note ?? null,
    debug_json: feedback.debug_json ?? null,
  })

  if (error) throw new Error(`Failed to save feedback: ${error.message}`)
}

export async function loadFeedback(filters?: {
  userId?: string
  rating?: 'good' | 'bad'
}): Promise<Feedback[]> {
  let query = admin
    .from('qa_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filters?.userId) query = query.eq('user_id', filters.userId)
  if (filters?.rating) query = query.eq('rating', filters.rating)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load feedback: ${error.message}`)
  return data ?? []
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await admin.from('qa_feedback').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete feedback: ${error.message}`)
}

// ── Export all feedback as JSON ──────────────────────────────

export async function exportFeedbackJSON(): Promise<string> {
  const { data, error } = await admin
    .from('qa_feedback')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to export: ${error.message}`)
  return JSON.stringify(data ?? [], null, 2)
}
