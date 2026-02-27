import { useState, useEffect, useCallback } from 'react'
import { fetchDebugLogs, fetchUsers, type DebugLogEntry, type DebugUser } from '../lib/debug-api'

// ── Styles ───────────────────────────────────────────────────

const S = {
  page: { display: 'flex', height: '100vh', background: '#0a0a0a', color: '#e0e0e0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace', fontSize: 13 } as React.CSSProperties,
  sidebar: { width: 340, borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' } as React.CSSProperties,
  sidebarHeader: { padding: '16px 16px 12px', borderBottom: '1px solid #222' } as React.CSSProperties,
  title: { fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 12 } as React.CSSProperties,
  select: { width: '100%', padding: '6px 8px', background: '#1a1a1a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 6, fontSize: 12, marginBottom: 8, outline: 'none' } as React.CSSProperties,
  filterRow: { display: 'flex', gap: 4, marginTop: 4 } as React.CSSProperties,
  filterBtn: (active: boolean) => ({ padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: active ? '#2563eb' : '#222', color: active ? '#fff' : '#888', transition: 'all 0.15s' }) as React.CSSProperties,
  msgList: { flex: 1, overflowY: 'auto', padding: '4px 0' } as React.CSSProperties,
  msgItem: (selected: boolean) => ({ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #1a1a1a', background: selected ? '#1a1a2e' : 'transparent', transition: 'background 0.1s' }) as React.CSSProperties,
  msgText: { fontSize: 12, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 } as React.CSSProperties,
  msgMeta: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: '#666' } as React.CSSProperties,
  badge: (color: string) => ({ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, background: color, color: '#fff', textTransform: 'uppercase' as const }) as React.CSSProperties,
  main: { flex: 1, overflow: 'auto', padding: 24 } as React.CSSProperties,
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 14 } as React.CSSProperties,
  section: { marginBottom: 16, border: '1px solid #222', borderRadius: 8, overflow: 'hidden' } as React.CSSProperties,
  sectionHeader: (open: boolean) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: open ? '#1a1a2e' : '#111', cursor: 'pointer', userSelect: 'none' as const, borderBottom: open ? '1px solid #222' : 'none' }) as React.CSSProperties,
  sectionTitle: { fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 } as React.CSSProperties,
  sectionBadge: { fontSize: 10, color: '#888', fontWeight: 400 } as React.CSSProperties,
  sectionBody: { padding: 16, background: '#0d0d0d' } as React.CSSProperties,
  pre: { background: '#111', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 11, lineHeight: 1.5, color: '#a0d0a0', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } as React.CSSProperties,
  kv: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: '4px 12px', fontSize: 12 } as React.CSSProperties,
  kvKey: { color: '#888', fontWeight: 600 } as React.CSSProperties,
  kvVal: { color: '#ddd' } as React.CSSProperties,
  historyMsg: (role: string) => ({ padding: '8px 12px', marginBottom: 6, borderRadius: 6, border: '1px solid #222', background: role === 'user' ? '#1a1a0d' : role === 'assistant' ? '#0d1a1a' : '#1a0d1a' }) as React.CSSProperties,
  historyRole: (role: string) => ({ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: role === 'user' ? '#e0b040' : role === 'assistant' ? '#40b0e0' : '#b040e0', marginBottom: 2 }) as React.CSSProperties,
  historyContent: { fontSize: 11, color: '#bbb', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } as React.CSSProperties,
  toolCard: { padding: '8px 12px', marginBottom: 6, borderRadius: 6, border: '1px solid #222', background: '#111' } as React.CSSProperties,
  toolName: { fontSize: 12, fontWeight: 700, color: '#60a0ff', marginBottom: 2 } as React.CSSProperties,
  timingBar: (pct: number, color: string) => ({ height: 20, borderRadius: 3, background: color, width: `${Math.max(pct, 2)}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 600, minWidth: 30 }) as React.CSSProperties,
  timingRow: { display: 'flex', gap: 2, alignItems: 'center', marginBottom: 4 } as React.CSSProperties,
  refreshBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: '#888', cursor: 'pointer', fontSize: 11 } as React.CSSProperties,
}

const PATH_COLORS: Record<string, string> = { static: '#666', casual: '#e0a030', agent: '#2563eb' }
const TIMING_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#6366f1']

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, day: 'numeric', month: 'short' })
}

// ── Collapsible Section ──────────────────────────────────────

function Section({ title, badge, defaultOpen = false, children }: { title: string, badge?: string, defaultOpen?: boolean, children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={S.section}>
      <div style={S.sectionHeader(open)} onClick={() => setOpen(!open)}>
        <div>
          <span style={{ color: '#555', marginRight: 6, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
          <span style={S.sectionTitle}>{title}</span>
          {badge && <span style={{ ...S.sectionBadge, marginLeft: 8 }}>{badge}</span>}
        </div>
      </div>
      {open && <div style={S.sectionBody}>{children}</div>}
    </div>
  )
}

function KV({ data }: { data: Record<string, any> }) {
  return (
    <div style={S.kv}>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <div style={S.kvKey}>{k}</div>
          <div style={S.kvVal}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</div>
        </div>
      ))}
    </div>
  )
}

// ── Trace Viewer ─────────────────────────────────────────────

function TraceViewer({ log }: { log: DebugLogEntry }) {
  const t = log.trace
  const timing = t.timing ?? {}
  const routing = t.routing ?? {}
  const context = t.context ?? {}
  const style = t.style_analysis ?? {}
  const history: any[] = t.conversation_history ?? []
  const toolCalls: any[] = t.tool_calls ?? []
  const prefetch = t.prefetch ?? {}
  const prefetchCalls: any[] = prefetch.calls ?? []
  const response = t.response ?? {}
  const request = t.request ?? {}
  const ack = t.ack ?? {}

  const totalMs = timing.total_ms ?? 0
  const timingEntries = [
    { label: 'Context', ms: timing.context_ms ?? 0, color: TIMING_COLORS[0] },
    { label: 'Prefetch', ms: timing.prefetch_ms ?? 0, color: TIMING_COLORS[1] },
    { label: 'Agent', ms: timing.agent_ms ?? 0, color: TIMING_COLORS[2] },
  ].filter(e => e.ms > 0)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #222' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>"{log.user_message}"</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={S.badge(PATH_COLORS[log.route_path] ?? '#555')}>{log.route_path}</span>
          <span style={S.badge('#333')}>{log.source}</span>
          {log.model && <span style={S.badge('#333')}>{log.model}</span>}
          <span style={{ fontSize: 11, color: '#888' }}>{formatTime(log.created_at)}</span>
          <span style={{ fontSize: 11, color: '#555' }}>Total: {totalMs}ms</span>
        </div>
      </div>

      {/* Timing Bar */}
      {timingEntries.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6 }}>TIMING BREAKDOWN</div>
          <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 6, overflow: 'hidden', background: '#111' }}>
            {timingEntries.map((e, i) => (
              <div key={i} style={S.timingBar(totalMs > 0 ? (e.ms / totalMs) * 100 : 0, e.color)}>
                {e.label} {e.ms}ms
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request */}
      <Section title="Request" badge={`${log.source} | ${request.user_name ?? 'unknown'}`}>
        <KV data={{
          message: request.message ?? log.user_message,
          user_id: request.user_id ?? log.user_id,
          user_name: request.user_name ?? '—',
          source: log.source,
          timestamp: request.timestamp ?? log.created_at,
        }} />
      </Section>

      {/* Routing */}
      <Section title="Routing" badge={`${routing.path} → ${routing.model ?? 'none'}`}>
        <KV data={{
          path: routing.path,
          model: routing.model ?? '—',
          max_tokens: routing.max_tokens,
          has_tools: routing.has_tools,
          tool_count: routing.tool_count,
        }} />
        {routing.prefetch_tasks?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4 }}>Prefetch Tasks:</div>
            {routing.prefetch_tasks.map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>• {p.tool}({JSON.stringify(p.args)})</div>
            ))}
          </div>
        )}
      </Section>

      {/* Context Loaded */}
      <Section title="Context Loaded" badge={`${context.recent_chat_count ?? 0} msgs | ${context.learnings_count ?? 0} learnings`}>
        <KV data={{
          recent_chat_count: context.recent_chat_count ?? 0,
          memory_summary: context.memory_summary ? `${context.memory_summary.slice(0, 150)}...` : '—',
          memory_writing_style: context.memory_writing_style ?? '—',
          memory_emotional_arc: context.memory_emotional_arc ?? '—',
          learnings_count: context.learnings_count ?? 0,
          daily_briefing: context.daily_briefing ? `${String(context.daily_briefing).slice(0, 150)}...` : '—',
          active_commitments: context.active_commitments ? JSON.stringify(context.active_commitments).slice(0, 200) : '—',
          user_timezone: context.user_timezone ?? '—',
          total_message_count: context.total_message_count ?? 0,
        }} />
        {context.learnings?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4 }}>Learnings ({context.learnings.length}):</div>
            {context.learnings.map((l: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: '#aaa', marginLeft: 8, marginBottom: 2 }}>
                <span style={{ color: '#60a0ff' }}>[{l.category}]</span> {l.content} <span style={{ color: '#555' }}>({l.confidence})</span>
              </div>
            ))}
          </div>
        )}
        {context.identity_model && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4 }}>Identity Model:</div>
            <pre style={{ ...S.pre, maxHeight: 200 }}>{JSON.stringify(context.identity_model, null, 2)}</pre>
          </div>
        )}
      </Section>

      {/* Conversation History — the key debug section */}
      <Section title="Conversation History (sent to LLM)" badge={`${history.length} messages`} defaultOpen={true}>
        {history.length === 0 ? (
          <div style={{ color: '#555', fontSize: 12 }}>No conversation history captured</div>
        ) : (
          history.map((m: any, i: number) => (
            <ExpandableHistoryMessage key={i} msg={m} index={i} />
          ))
        )}
      </Section>

      {/* System Prompt */}
      <Section title="System Prompt" badge={`${t.system_prompt_length ?? 0} chars`}>
        <pre style={S.pre}>{t.system_prompt ?? '—'}</pre>
      </Section>

      {/* Style Analysis */}
      {Object.keys(style).length > 0 && (
        <Section title="Style Analysis">
          <KV data={style} />
        </Section>
      )}

      {/* Prefetch */}
      {prefetchCalls.length > 0 && (
        <Section title="Prefetch" badge={`${prefetchCalls.length} calls | ${prefetch.evidence_length ?? 0}c evidence | ${prefetch.duration_ms ?? 0}ms`}>
          {prefetchCalls.map((p: any, i: number) => (
            <div key={i} style={S.toolCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={S.toolName}>{p.tool}</div>
                <div style={{ fontSize: 10, color: p.success ? '#059669' : '#dc2626' }}>
                  {p.success ? '✓' : '✗'} {p.duration_ms}ms | {p.result_length ?? 0}c
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Args: {JSON.stringify(p.args)}</div>
            </div>
          ))}
        </Section>
      )}

      {/* Tool Calls */}
      {toolCalls.length > 0 && (
        <Section title="Tool Calls" badge={`${toolCalls.length} calls`} defaultOpen={true}>
          {toolCalls.map((tc: any, i: number) => (
            <ExpandableToolCall key={i} tc={tc} index={i} />
          ))}
        </Section>
      )}

      {/* Ack */}
      {ack.generated && (
        <Section title="Ack" badge={`${(ack.text ?? '').length}c`}>
          <div style={{ fontSize: 12, color: '#ddd' }}>{ack.text}</div>
        </Section>
      )}

      {/* Response */}
      <Section title="Response" badge={`${response.text_length ?? 0} chars`} defaultOpen={true}>
        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{response.text}</div>
        <KV data={{
          reaction: response.reaction ?? 'none',
          pending_actions: response.pending_actions?.length > 0 ? JSON.stringify(response.pending_actions) : 'none',
        }} />
      </Section>

      {/* Raw JSON */}
      <Section title="Raw Trace JSON" badge={`${JSON.stringify(t).length} bytes`}>
        <pre style={{ ...S.pre, maxHeight: 600 }}>{JSON.stringify(t, null, 2)}</pre>
      </Section>
    </div>
  )
}

// ── Expandable History Message ────────────────────────────────

function ExpandableHistoryMessage({ msg, index }: { msg: any, index: number }) {
  const [expanded, setExpanded] = useState(false)
  const content = msg.content ?? ''
  const isLong = content.length > 300

  return (
    <div style={S.historyMsg(msg.role)} onClick={() => isLong && setExpanded(!expanded)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={S.historyRole(msg.role)}>
          #{index} {msg.role}
        </div>
        <div style={{ fontSize: 9, color: '#555' }}>{msg.content_length ?? content.length}c{isLong && (expanded ? ' ▼' : ' ▶')}</div>
      </div>
      <div style={S.historyContent}>
        {expanded || !isLong ? content : `${content.slice(0, 300)}...`}
      </div>
    </div>
  )
}

// ── Expandable Tool Call ──────────────────────────────────────

function ExpandableToolCall({ tc, index }: { tc: any, index: number }) {
  const [showResult, setShowResult] = useState(false)

  return (
    <div style={S.toolCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={S.toolName}>
          #{index + 1} {tc.tool}
        </div>
        <div style={{ fontSize: 10, color: tc.success ? '#059669' : '#dc2626' }}>
          {tc.success ? '✓' : '✗'} {tc.duration_ms}ms | {tc.result_length ?? 0}c
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
        <span style={{ color: '#666' }}>Args:</span> {JSON.stringify(tc.args)}
      </div>
      {tc.error && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 4 }}>Error: {tc.error}</div>}
      <div
        style={{ fontSize: 10, color: '#60a0ff', cursor: 'pointer', marginTop: 4 }}
        onClick={() => setShowResult(!showResult)}
      >
        {showResult ? '▼ Hide result' : '▶ Show result'}
      </div>
      {showResult && (
        <pre style={{ ...S.pre, marginTop: 4, maxHeight: 200, fontSize: 10 }}>
          {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────

export default function DebugDashboard() {
  const [users, setUsers] = useState<DebugUser[]>([])
  const [logs, setLogs] = useState<DebugLogEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const selectedLog = logs.find(l => l.id === selectedLogId) ?? null

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchDebugLogs({
        userId: selectedUserId || undefined,
        path: selectedPath || undefined,
        limit: 100,
      })
      setLogs(data)
      if (data.length > 0 && !selectedLogId) {
        setSelectedLogId(data[0].id)
      }
    } catch (e) {
      console.error('Failed to load debug logs:', e)
    }
    setLoading(false)
  }, [selectedUserId, selectedPath])

  useEffect(() => {
    fetchUsers().then(setUsers).catch(console.error)
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadLogs, 10000)
    return () => clearInterval(interval)
  }, [loadLogs])

  return (
    <div style={S.page}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}>
          <div style={S.title}>Nest Debug</div>

          <select
            style={S.select}
            value={selectedUserId}
            onChange={e => { setSelectedUserId(e.target.value); setSelectedLogId(null) }}
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.user_id} value={u.user_id}>
                {u.google_email} {u.is_primary ? '★' : ''}
              </option>
            ))}
          </select>

          <div style={S.filterRow}>
            {['', 'static', 'casual', 'agent'].map(path => (
              <button
                key={path}
                style={S.filterBtn(selectedPath === path)}
                onClick={() => { setSelectedPath(path); setSelectedLogId(null) }}
              >
                {path || 'All'}
              </button>
            ))}
            <button style={S.refreshBtn} onClick={loadLogs}>↻</button>
          </div>
        </div>

        <div style={S.msgList as any}>
          {loading && logs.length === 0 && <div style={{ padding: 16, color: '#555' }}>Loading...</div>}
          {!loading && logs.length === 0 && <div style={{ padding: 16, color: '#555' }}>No debug logs yet. Send a message to Nest to generate traces.</div>}
          {logs.map(log => (
            <div
              key={log.id}
              style={S.msgItem(log.id === selectedLogId)}
              onClick={() => setSelectedLogId(log.id)}
            >
              <div style={S.msgText as any}>{log.user_message}</div>
              <div style={S.msgMeta}>
                <span style={S.badge(PATH_COLORS[log.route_path] ?? '#555')}>{log.route_path}</span>
                {log.model && <span style={{ fontSize: 9, color: '#666' }}>{log.model}</span>}
                <span style={{ fontSize: 9, color: '#555' }}>{log.trace?.timing?.total_ms ?? '?'}ms</span>
                <span style={{ fontSize: 9, color: '#555', marginLeft: 'auto' }}>{timeAgo(log.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={S.main}>
        {selectedLog ? (
          <TraceViewer log={selectedLog} />
        ) : (
          <div style={S.empty}>
            {logs.length > 0 ? 'Select a message to view its trace' : 'No debug logs yet'}
          </div>
        )}
      </div>
    </div>
  )
}
