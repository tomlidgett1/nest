import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchDebugLogs, fetchUsers, askDebugChat, calculateTraceCost, type DebugLogEntry, type DebugUser, type ChatMessage, type CostBreakdown } from '../lib/debug-api'

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
  const agentLoop = t.agent_loop ?? null
  const rawLlmResponse: string | null = t.raw_llm_response ?? null
  const cost: CostBreakdown | null = calculateTraceCost(t.usage ?? null)

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
          {routing.output_model && routing.output_model !== routing.model && (
            <span style={S.badge('#7c3aed')}>→ {routing.output_model}</span>
          )}
          {agentLoop && <span style={S.badge('#059669')}>{agentLoop.rounds}r / {agentLoop.total_tool_calls}tc</span>}
          {cost && <span style={S.badge('#d97706')}>${cost.totalCostUsd < 0.01 ? cost.totalCostUsd.toFixed(6) : cost.totalCostUsd.toFixed(4)}</span>}
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
        {routing.route_reason && (
          <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: '#1a1a0d', border: '1px solid #333', fontSize: 12, color: '#e0b040', lineHeight: 1.5 }}>
            {routing.route_reason}
          </div>
        )}
        <KV data={{
          path: routing.path,
          model: routing.model ?? '—',
          output_model: routing.output_model ?? '—',
          max_tokens: routing.max_tokens,
          has_tools: routing.has_tools,
          tool_count: routing.tool_count,
          used_fast_gate: routing.used_fast_gate ? 'Yes (regex)' : 'No (nano router)',
        }} />
        {routing.nano_classification && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: '#0d1a1a', border: '1px solid #1a3a3a' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#06b6d4', marginBottom: 6 }}>NANO ROUTER</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={S.badge('#06b6d4')}>{routing.nano_classification.category}</span>
              <span style={{ fontSize: 12, color: '#aaa' }}>
                Confidence: <span style={{ color: routing.nano_classification.confidence >= 0.8 ? '#22c55e' : routing.nano_classification.confidence >= 0.6 ? '#eab308' : '#ef4444', fontWeight: 600 }}>
                  {(routing.nano_classification.confidence * 100).toFixed(0)}%
                </span>
              </span>
              <span style={{ fontSize: 11, color: '#555' }}>{routing.nano_classification.latency_ms}ms</span>
            </div>
          </div>
        )}
        {routing.prefetch_tasks?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4 }}>Prefetch Tasks:</div>
            {routing.prefetch_tasks.map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>• {p.tool}({JSON.stringify(p.args)})</div>
            ))}
          </div>
        )}
      </Section>

      {/* Agent Loop */}
      {agentLoop && (
        <Section title="Agent Loop" badge={`${agentLoop.rounds} rounds | ${agentLoop.total_tool_calls} tool calls${agentLoop.hit_max_rounds ? ' | HIT MAX' : ''}`}>
          <KV data={{
            rounds: agentLoop.rounds,
            total_tool_calls: agentLoop.total_tool_calls,
            plan_model: agentLoop.plan_model ?? '—',
            output_model: agentLoop.output_model ?? '—',
            used_split_models: agentLoop.used_split_models ? 'Yes (plan → output handoff)' : 'No (single model)',
            hit_max_rounds: agentLoop.hit_max_rounds ? '⚠ YES' : 'No',
          }} />
          {agentLoop.planner_draft && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4 }}>Planner Draft (before output model):</div>
              <pre style={{ ...S.pre, maxHeight: 300 }}>{agentLoop.planner_draft}</pre>
            </div>
          )}
        </Section>
      )}

      {/* Cost Breakdown */}
      {cost && (
        <Section title="Cost" badge={`$${cost.totalCostUsd < 0.01 ? cost.totalCostUsd.toFixed(6) : cost.totalCostUsd.toFixed(4)} | ${cost.totalTokensIn.toLocaleString()} in / ${cost.totalTokensOut.toLocaleString()} out${cost.totalCached > 0 ? ` | ${cost.totalCached.toLocaleString()} cached` : ''}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cost.calls.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: '#111', border: '1px solid #222' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#60a0ff' }}>{c.endpoint}</span>
                  <span style={{ fontSize: 10, color: '#666', marginLeft: 8 }}>{c.model}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 10 }}>
                  <span style={{ color: '#888' }}>{c.tokensIn.toLocaleString()} in{c.cached > 0 ? ` (${c.cached.toLocaleString()} cached)` : ''}</span>
                  <span style={{ color: '#888' }}>{c.tokensOut.toLocaleString()} out</span>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>${c.costUsd < 0.001 ? c.costUsd.toFixed(6) : c.costUsd.toFixed(4)}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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

      {/* Raw LLM Response (before formatting) */}
      {rawLlmResponse && (
        <Section title="Raw LLM Response (before formatting)" badge="differs from final">
          <div style={{ fontSize: 11, color: '#d97706', marginBottom: 8 }}>This is what the model returned before formatForIMessage() and post-processing changed it.</div>
          <pre style={{ ...S.pre, maxHeight: 400 }}>{rawLlmResponse}</pre>
        </Section>
      )}

      {/* Response */}
      <Section title="Final Response" badge={`${response.text_length ?? 0} chars${rawLlmResponse ? ' (post-processed)' : ''}`} defaultOpen={true}>
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

// ── Debug Chat Panel ─────────────────────────────────────────

function DebugChatPanel({ log }: { log: DebugLogEntry }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset chat when log changes
  useEffect(() => {
    setMessages([])
    setInput('')
  }, [log.id])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    const q = input.trim()
    if (!q || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    try {
      const answer = await askDebugChat(log.trace, q, messages)
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${(e as Error).message}` }])
    }

    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div style={{ borderTop: '1px solid #222', display: 'flex', flexDirection: 'column', height: 360, background: '#0a0a0a' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Ask about this trace</span>
        <span style={{ fontSize: 9, color: '#555' }}>GPT-5.2</span>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{ marginLeft: 'auto', fontSize: 10, color: '#666', background: 'none', border: '1px solid #333', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
        {messages.length === 0 && (
          <div style={{ color: '#444', fontSize: 11, padding: '16px 0' }}>
            Ask anything about this message trace. e.g. "Why did this use the agent path?", "What data did semantic_search return?", "Could this have been cheaper?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 11,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: m.role === 'user' ? '#1a1a2e' : '#111',
              color: m.role === 'user' ? '#a0b0ff' : '#ccc',
              border: `1px solid ${m.role === 'user' ? '#2a2a4e' : '#222'}`,
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 11, color: '#555', padding: '4px 0' }}>Thinking...</div>
        )}
      </div>

      <div style={{ padding: '8px 16px', borderTop: '1px solid #222', display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Ask about this trace..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: '#111',
            color: '#ddd',
            border: '1px solid #333',
            borderRadius: 6,
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '8px 16px',
            background: loading || !input.trim() ? '#222' : '#2563eb',
            color: loading || !input.trim() ? '#555' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'default' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
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
      const seen = new Set<string>()
      const deduped = data.filter((d: DebugLogEntry) => {
        if (seen.has(d.id)) return false
        seen.add(d.id)
        return true
      })
      setLogs(deduped)
      if (deduped.length > 0 && !selectedLogId) {
        setSelectedLogId(deduped[0].id)
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
          {logs.map(log => {
            const logAgentLoop = log.trace?.agent_loop
            const logRouteReason = log.trace?.routing?.route_reason
            const logCost = calculateTraceCost(log.trace?.usage ?? null)
            return (
              <div
                key={log.id}
                style={S.msgItem(log.id === selectedLogId)}
                onClick={() => setSelectedLogId(log.id)}
              >
                <div style={S.msgText as any}>{log.user_message}</div>
                <div style={S.msgMeta}>
                  <span style={S.badge(PATH_COLORS[log.route_path] ?? '#555')}>{log.route_path}</span>
                  {log.trace?.routing?.nano_classification && <span style={{ fontSize: 9, color: '#06b6d4' }}>nano:{log.trace.routing.nano_classification.category}({(log.trace.routing.nano_classification.confidence * 100).toFixed(0)}%)</span>}
                  {log.model && <span style={{ fontSize: 9, color: '#666' }}>{log.model}</span>}
                  {logAgentLoop && <span style={{ fontSize: 9, color: '#059669' }}>{logAgentLoop.rounds}r/{logAgentLoop.total_tool_calls}tc</span>}
                  <span style={{ fontSize: 9, color: '#555' }}>{log.trace?.timing?.total_ms ?? '?'}ms</span>
                  {logCost && <span style={{ fontSize: 9, color: '#d97706' }}>${logCost.totalCostUsd < 0.01 ? logCost.totalCostUsd.toFixed(5) : logCost.totalCostUsd.toFixed(3)}</span>}
                  <span style={{ fontSize: 9, color: '#555', marginLeft: 'auto' }}>{timeAgo(log.created_at)}</span>
                </div>
                {logRouteReason && (
                  <div style={{ fontSize: 9, color: '#666', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{logRouteReason}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ ...S.main, flex: 1, overflow: 'auto' }}>
          {selectedLog ? (
            <TraceViewer log={selectedLog} />
          ) : (
            <div style={S.empty}>
              {logs.length > 0 ? 'Select a message to view its trace' : 'No debug logs yet'}
            </div>
          )}
        </div>
        {selectedLog && <DebugChatPanel log={selectedLog} />}
      </div>
    </div>
  )
}
