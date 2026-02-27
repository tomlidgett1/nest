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
