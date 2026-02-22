import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchUsers,
  sendMessageMulti,
  saveFeedback,
  loadFeedback,
  deleteFeedback,
  exportFeedbackJSON,
  type QAUser,
  type ChatMessage,
  type DebugInfo,
  type Feedback,
  type AgentResponse,
} from '../lib/qa-api'

// ── Bubble splitter — each \n = separate iMessage bubble ─────

function splitIntoBubbles(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

export default function QA() {
  const [users, setUsers] = useState<QAUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'good' | 'bad'>('all')
  const [noteModal, setNoteModal] = useState<{
    variantId: string
    rating: 'good' | 'bad'
    query: string
    variants: AgentResponse[]
  } | null>(null)
  const [noteText, setNoteText] = useState('')

  // Multi-response state: after sending, we show N variants to pick from
  const [pendingVariants, setPendingVariants] = useState<{
    query: string
    variants: AgentResponse[]
  } | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchUsers().then(setUsers).catch(console.error)
    refreshFeedback()
  }, [])

  const refreshFeedback = useCallback(async () => {
    try {
      const fb = await loadFeedback(
        feedbackFilter !== 'all' ? { rating: feedbackFilter } : undefined,
      )
      const users_ = await fetchUsers()
      const emailMap = new Map(users_.map((u) => [u.user_id, u.google_email]))
      setFeedbackList(fb.map((f) => ({ ...f, google_email: emailMap.get(f.user_id) ?? '' })))
    } catch (e) {
      console.error(e)
    }
  }, [feedbackFilter])

  useEffect(() => { refreshFeedback() }, [feedbackFilter, refreshFeedback])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, pendingVariants])

  const selectedUser = users.find((u) => u.user_id === selectedUserId)
  const selectedMsg = messages.find((m) => m.id === selectedMsgId)

  function groupedUsers(): Map<string, QAUser[]> {
    const map = new Map<string, QAUser[]>()
    for (const u of users) {
      const list = map.get(u.user_id) ?? []
      list.push(u)
      map.set(u.user_id, list)
    }
    return map
  }

  // ── Send: fires 3 parallel requests ────────────────────────

  async function handleSend() {
    if (!input.trim() || !selectedUserId || sending) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    const query = input.trim()
    setInput('')
    setSending(true)
    setPendingVariants(null)

    try {
      const variants = await sendMessageMulti(selectedUserId, query, 3, (ackText) => {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'ack', content: ackText, timestamp: new Date().toISOString() },
        ])
      })

      // Remove ack messages
      setMessages((prev) => prev.filter((m) => m.role !== 'ack'))

      if (variants.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: 'All 3 requests failed.', timestamp: new Date().toISOString() },
        ])
      } else {
        setPendingVariants({ query, variants })
        // Auto-select first variant's debug
        setSelectedMsgId(variants[0].id)
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => m.role !== 'ack'),
        { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${(e as Error).message}`, timestamp: new Date().toISOString() },
      ])
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // ── Pick a variant ─────────────────────────────────────────

  function handlePickVariant(variant: AgentResponse, rating: 'good' | 'bad') {
    if (!pendingVariants) return
    setNoteModal({
      variantId: variant.id,
      rating,
      query: pendingVariants.query,
      variants: pendingVariants.variants,
    })
    setNoteText('')
  }

  async function submitFeedback() {
    if (!noteModal) return
    const chosen = (pendingVariants ?? noteModal).variants.find((v) => v.id === noteModal.variantId)
    if (!chosen) return

    try {
      await saveFeedback({
        user_id: selectedUserId,
        response_id: chosen.responseId,
        query: noteModal.query,
        response: chosen.response,
        rating: noteModal.rating,
        note: noteText || undefined,
        debug_json: chosen.debug,
        all_variants: noteModal.variants,
        chosen_variant: chosen.id,
      })

      // Commit the chosen variant into the chat
      const assistantMsg: ChatMessage = {
        id: chosen.id,
        role: 'assistant',
        content: chosen.response,
        responseId: chosen.responseId,
        debug: chosen.debug,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setPendingVariants(null)
      setNoteModal(null)
      setSelectedMsgId(chosen.id)
      refreshFeedback()
    } catch (e) {
      console.error(e)
    }
  }

  function handleSwitchUser(userId: string) {
    setSelectedUserId(userId)
    setMessages([])
    setSelectedMsgId(null)
    setPendingVariants(null)
  }

  async function handleExport() {
    try {
      const json = await exportFeedbackJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nest-qa-feedback-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
    }
  }

  // ── Render ─────────────────────────────────────────────────

  // Find the debug for the selected variant (from pending or committed messages)
  const selectedDebug: DebugInfo | null | undefined = (() => {
    if (selectedMsg?.debug) return selectedMsg.debug
    if (pendingVariants && selectedMsgId) {
      const v = pendingVariants.variants.find((v) => v.id === selectedMsgId)
      return v?.debug ?? null
    }
    return null
  })()

  const selectedResponseId: string | null = (() => {
    if (selectedMsg?.responseId) return selectedMsg.responseId ?? null
    if (pendingVariants && selectedMsgId) {
      const v = pendingVariants.variants.find((v) => v.id === selectedMsgId)
      return v?.responseId ?? null
    }
    return null
  })()

  return (
    <div style={S.container}>
      {/* ── LEFT SIDEBAR ── */}
      <div style={S.leftSidebar}>
        <div style={S.sidebarHeader}>
          <h2 style={S.logo}>Nest QA</h2>
        </div>

        <div style={S.section}>
          <label style={S.sectionLabel}>Impersonate User</label>
          <select
            style={S.select}
            value={selectedUserId}
            onChange={(e) => handleSwitchUser(e.target.value)}
          >
            <option value="">Select a user...</option>
            {[...groupedUsers().entries()].map(([uid, accounts]) => (
              <option key={uid} value={uid}>
                {accounts.map((a) => a.google_email).join(', ')}
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...S.section, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ ...S.sectionLabel, marginBottom: 0 }}>Feedback</label>
            <button style={S.exportBtn} onClick={handleExport} title="Export all feedback as JSON">
              Export
            </button>
          </div>
          <div style={S.filterRow}>
            {(['all', 'good', 'bad'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFeedbackFilter(f)}
                style={{ ...S.filterBtn, ...(feedbackFilter === f ? S.filterBtnActive : {}) }}
              >
                {f === 'all' ? 'All' : f === 'good' ? 'Good' : 'Bad'}
              </button>
            ))}
          </div>
          <div style={S.feedbackScroll}>
            {feedbackList.length === 0 && <p style={S.emptyText}>No feedback yet</p>}
            {feedbackList.map((fb) => (
              <div
                key={fb.id}
                style={S.feedbackCard}
                onClick={() => {
                  const syntheticMsg: ChatMessage = {
                    id: fb.id, role: 'assistant', content: fb.response,
                    responseId: fb.response_id, debug: fb.debug_json, timestamp: fb.created_at,
                  }
                  setMessages([
                    { id: 'q-' + fb.id, role: 'user', content: fb.query, timestamp: fb.created_at },
                    syntheticMsg,
                  ])
                  setPendingVariants(null)
                  setSelectedMsgId(fb.id)
                  if (fb.user_id !== selectedUserId) setSelectedUserId(fb.user_id)
                }}
              >
                <div style={S.feedbackCardTop}>
                  <span style={{ ...S.ratingDot, background: fb.rating === 'good' ? '#34C759' : '#FF3B30' }} />
                  <span style={S.feedbackEmail}>{fb.google_email ?? 'unknown'}</span>
                  <button
                    style={S.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); deleteFeedback(fb.id).then(refreshFeedback) }}
                  >x</button>
                </div>
                <p style={S.feedbackQuery}>{fb.query.slice(0, 60)}{fb.query.length > 60 ? '...' : ''}</p>
                {fb.note && <p style={S.feedbackNote}>{fb.note}</p>}
                <p style={S.feedbackTime}>
                  {new Date(fb.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CENTRE — CHAT ── */}
      <div style={S.chatPanel}>
        <div style={S.chatHeader}>
          <span style={S.chatTitle}>
            {selectedUser ? selectedUser.google_email : 'Select a user to start'}
          </span>
          {messages.length > 0 && (
            <button style={S.clearBtn} onClick={() => { setMessages([]); setSelectedMsgId(null); setPendingVariants(null) }}>
              Clear
            </button>
          )}
        </div>

        <div style={S.chatMessages}>
          {messages.length === 0 && !pendingVariants && (
            <div style={S.emptyChat}>
              <p style={{ fontSize: 15, color: '#8A8580' }}>
                {selectedUserId ? 'Send a message — 3 variants will be generated' : 'Pick a user from the sidebar'}
              </p>
            </div>
          )}

          {/* Committed messages */}
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' && (
                <div style={{ ...S.msgRow, justifyContent: 'flex-end' }}>
                  <div style={{ ...S.bubble, ...S.userBubble }}>
                    <p style={S.bubbleText}>{msg.content}</p>
                  </div>
                </div>
              )}
              {msg.role === 'ack' && (
                <div style={{ ...S.msgRow, justifyContent: 'flex-start' }}>
                  <div style={{ ...S.bubble, ...S.ackBubble }}>
                    <p style={S.bubbleText}>{msg.content}</p>
                  </div>
                </div>
              )}
              {msg.role === 'assistant' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                  {splitIntoBubbles(msg.content).map((line, i) => (
                    <div
                      key={`${msg.id}-${i}`}
                      style={{
                        ...S.bubble,
                        ...S.assistantBubble,
                        ...(msg.id === selectedMsgId ? S.selectedBubble : {}),
                        borderRadius: 12,
                        ...(i === 0 ? { borderTopLeftRadius: 12 } : {}),
                        ...(i === splitIntoBubbles(msg.content).length - 1 ? { borderBottomLeftRadius: 4 } : {}),
                      }}
                      onClick={() => setSelectedMsgId(msg.id)}
                    >
                      <p style={S.bubbleText}>{line}</p>
                    </div>
                  ))}
                  {msg.debug && (
                    <div style={{ ...S.bubbleMeta, marginLeft: 4 }}>
                      <span style={S.metaTag}>{msg.debug.path}</span>
                      {msg.debug.tools_used?.length > 0 && (
                        <span style={S.metaTag}>{msg.debug.tools_used.join(', ')}</span>
                      )}
                      <span style={S.metaTag}>{msg.debug.timing.total_ms}ms</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Pending variants — pick one */}
          {pendingVariants && (
            <div style={S.variantsContainer}>
              <p style={S.variantsLabel}>3 style variants generated — pick the best, rate the rest</p>
              {pendingVariants.variants.map((variant, idx) => (
                <div
                  key={variant.id}
                  style={{
                    ...S.variantCard,
                    ...(variant.id === selectedMsgId ? S.variantCardSelected : {}),
                  }}
                  onClick={() => setSelectedMsgId(variant.id)}
                >
                  <div style={S.variantHeader}>
                    <span style={S.variantLabel}>
                      {variant.variationLabel
                        ? variant.variationLabel.charAt(0).toUpperCase() + variant.variationLabel.slice(1)
                        : `Variant ${idx + 1}`}
                    </span>
                    <span style={S.variantLatency}>{variant.latencyMs}ms</span>
                  </div>

                  {/* Show as iMessage bubbles */}
                  <div style={S.variantBubbles}>
                    {splitIntoBubbles(variant.response).map((line, i) => (
                      <div key={i} style={S.variantBubble}>
                        <p style={S.bubbleText}>{line}</p>
                      </div>
                    ))}
                  </div>

                  {variant.debug && (
                    <div style={S.bubbleMeta}>
                      <span style={S.metaTag}>{variant.debug.path}</span>
                      {variant.debug.tools_used?.length > 0 && (
                        <span style={S.metaTag}>{variant.debug.tools_used.join(', ')}</span>
                      )}
                    </div>
                  )}

                  <div style={S.variantActions}>
                    <button
                      style={{ ...S.variantBtn, ...S.variantBtnGood }}
                      onClick={(e) => { e.stopPropagation(); handlePickVariant(variant, 'good') }}
                    >Best</button>
                    <button
                      style={{ ...S.variantBtn, ...S.variantBtnBad }}
                      onClick={(e) => { e.stopPropagation(); handlePickVariant(variant, 'bad') }}
                    >Bad</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sending && (
            <div style={{ ...S.msgRow, justifyContent: 'flex-start' }}>
              <div style={{ ...S.bubble, ...S.ackBubble }}>
                <p style={S.bubbleText}>generating 3 variants...</p>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={S.inputRow}>
          <input
            ref={inputRef}
            style={S.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={selectedUserId ? 'Type a message...' : 'Select a user first'}
            disabled={!selectedUserId || sending}
          />
          <button
            style={{ ...S.sendBtn, opacity: !input.trim() || !selectedUserId || sending ? 0.4 : 1 }}
            onClick={handleSend}
            disabled={!input.trim() || !selectedUserId || sending}
          >Send</button>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR — DEBUG ── */}
      <div style={S.rightSidebar}>
        <div style={S.sidebarHeader}>
          <h3 style={S.debugTitle}>Debug</h3>
        </div>
        {selectedDebug ? (
          <div style={S.debugContent}>
            <DebugField label="Path" value={selectedDebug.path} />
            <DebugField
              label="Tools"
              value={selectedDebug.tools_used?.length > 0 ? selectedDebug.tools_used.join(', ') : 'none'}
            />
            <DebugField label="Source" value={selectedDebug.source} />

            <div style={S.debugDivider} />
            <label style={S.debugSectionLabel}>Timing</label>
            <DebugField label="Context" value={`${selectedDebug.timing.context_ms}ms`} />
            <DebugField label="Agent" value={`${selectedDebug.timing.agent_ms}ms`} />
            <DebugField label="Orchestrator" value={`${selectedDebug.timing.orchestrator_latency_ms}ms`} />
            <DebugField label="Total" value={`${selectedDebug.timing.total_ms}ms`} highlight />

            <div style={S.debugDivider} />
            <label style={S.debugSectionLabel}>Response ID</label>
            <p style={S.debugMono}>{selectedResponseId ?? 'n/a'}</p>

            <div style={S.debugDivider} />
            <label style={S.debugSectionLabel}>Tools Detail</label>
            {selectedDebug.tools_used?.length > 0 ? (
              selectedDebug.tools_used.map((t, i) => (
                <div key={i} style={S.toolChip}>{t}</div>
              ))
            ) : (
              <p style={{ fontSize: 11, color: '#B5B0A9', margin: 0 }}>No tools called</p>
            )}

            <div style={S.debugDivider} />
            <label style={S.debugSectionLabel}>Raw JSON</label>
            <pre style={S.debugPre}>{JSON.stringify(selectedDebug, null, 2)}</pre>
          </div>
        ) : (
          <div style={S.debugEmpty}>
            <p style={{ fontSize: 13, color: '#8A8580' }}>
              Click a variant or message to view debug info
            </p>
          </div>
        )}
      </div>

      {/* ── NOTE MODAL ── */}
      {noteModal && (
        <div style={S.modalOverlay} onClick={() => setNoteModal(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.modalTitle}>
              {noteModal.rating === 'good' ? 'Best response' : 'Bad response'} — Add a note
            </h3>
            <textarea
              style={S.textarea}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What was good/bad? (e.g. 'too long', 'wrong tool', 'perfect tone')"
              rows={3}
              autoFocus
            />
            <div style={S.modalActions}>
              <button style={S.modalCancel} onClick={() => setNoteModal(null)}>Cancel</button>
              <button
                style={{ ...S.modalSubmit, background: noteModal.rating === 'good' ? '#34C759' : '#FF3B30' }}
                onClick={submitFeedback}
              >Save Feedback</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DebugField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={S.debugRow}>
      <span style={S.debugLabel}>{label}</span>
      <span style={{ ...S.debugValue, ...(highlight ? { fontWeight: 600 } : {}) }}>{value}</span>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', height: '100vh', width: '100vw', background: '#F8F6F1',
    fontFamily: "-apple-system, 'SF Pro Display', system-ui, sans-serif", overflow: 'hidden',
  },

  leftSidebar: {
    width: 260, minWidth: 260, background: '#fff',
    borderRight: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  sidebarHeader: { padding: '16px 16px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)' },
  logo: { fontSize: 16, fontWeight: 700, color: '#1A1A1A', letterSpacing: -0.3 },
  section: { padding: '12px 16px' },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#8A8580',
    textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 8, display: 'block',
  },
  select: {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, background: '#fff', color: '#1A1A1A', outline: 'none', cursor: 'pointer',
  },
  exportBtn: {
    fontSize: 10, fontWeight: 600, color: '#8A8580', background: 'none',
    border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
  },
  filterRow: { display: 'flex', gap: 4, marginBottom: 8 },
  filterBtn: {
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 500,
    border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, background: '#fff', color: '#8A8580', cursor: 'pointer',
  },
  filterBtnActive: { background: '#1A1A1A', color: '#fff', borderColor: '#1A1A1A' },
  feedbackScroll: { flex: 1, overflowY: 'auto' as const },
  feedbackCard: {
    padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.06)',
    marginBottom: 6, cursor: 'pointer', background: '#fff',
  },
  feedbackCardTop: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  ratingDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  feedbackEmail: { fontSize: 11, color: '#8A8580', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  deleteBtn: { fontSize: 11, color: '#B5B0A9', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
  feedbackQuery: { fontSize: 12, color: '#1A1A1A', lineHeight: 1.4, marginBottom: 2 },
  feedbackNote: { fontSize: 11, color: '#8A8580', fontStyle: 'italic', lineHeight: 1.3, marginBottom: 2 },
  feedbackTime: { fontSize: 10, color: '#B5B0A9' },
  emptyText: { fontSize: 12, color: '#B5B0A9', textAlign: 'center' as const, padding: '20px 0' },

  chatPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  chatHeader: {
    padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff',
  },
  chatTitle: { fontSize: 14, fontWeight: 600, color: '#1A1A1A' },
  clearBtn: {
    fontSize: 12, color: '#8A8580', background: 'none',
    border: '1px solid rgba(0,0,0,0.08)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
  },
  chatMessages: {
    flex: 1, overflowY: 'auto' as const, padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  emptyChat: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  msgRow: { display: 'flex', width: '100%' },
  bubble: { maxWidth: '70%', padding: '8px 12px', borderRadius: 12, position: 'relative' as const, cursor: 'default' },
  userBubble: { background: '#007AFF', color: '#fff', borderBottomRightRadius: 4 },
  assistantBubble: {
    background: '#fff', color: '#1A1A1A', border: '1px solid rgba(0,0,0,0.06)',
    cursor: 'pointer', maxWidth: '85%',
  },
  ackBubble: { background: '#F1ECE1', color: '#8A8580', borderBottomLeftRadius: 4, fontStyle: 'italic' },
  selectedBubble: { outline: '2px solid #007AFF', outlineOffset: 1 },
  bubbleText: { fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, margin: 0 },
  bubbleMeta: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' as const },
  metaTag: {
    fontSize: 10, padding: '2px 6px', borderRadius: 3,
    background: 'rgba(0,0,0,0.04)', color: '#8A8580', fontWeight: 500,
  },

  // Variants
  variantsContainer: {
    display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0',
  },
  variantsLabel: {
    fontSize: 12, fontWeight: 600, color: '#8A8580',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  variantCard: {
    background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
    padding: 14, cursor: 'pointer', transition: 'border-color 0.15s',
  },
  variantCardSelected: { borderColor: '#007AFF', boxShadow: '0 0 0 1px #007AFF' },
  variantHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  variantLabel: { fontSize: 12, fontWeight: 600, color: '#1A1A1A' },
  variantLatency: { fontSize: 11, color: '#8A8580', fontFamily: "'SF Mono', Menlo, monospace" },
  variantBubbles: { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 },
  variantBubble: {
    background: '#F8F6F1', padding: '6px 10px', borderRadius: 8, maxWidth: '95%',
  },
  variantActions: { display: 'flex', gap: 6, marginTop: 4 },
  variantBtn: {
    padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 5,
    border: 'none', cursor: 'pointer', color: '#fff',
  },
  variantBtnGood: { background: '#34C759' },
  variantBtnBad: { background: '#FF3B30' },

  inputRow: {
    padding: '12px 20px', borderTop: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', gap: 8, background: '#fff',
  },
  input: {
    flex: 1, padding: '10px 14px', fontSize: 14,
    border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, outline: 'none', background: '#F8F6F1', color: '#1A1A1A',
  },
  sendBtn: {
    padding: '10px 20px', fontSize: 14, fontWeight: 600, border: 'none',
    borderRadius: 8, background: '#1A1A1A', color: '#fff', cursor: 'pointer', transition: 'opacity 0.15s',
  },

  rightSidebar: {
    width: 320, minWidth: 320, background: '#fff',
    borderLeft: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  debugTitle: { fontSize: 14, fontWeight: 600, color: '#1A1A1A' },
  debugContent: { flex: 1, padding: '12px 16px', overflowY: 'auto' as const },
  debugEmpty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' as const },
  debugRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' },
  debugLabel: { fontSize: 12, color: '#8A8580' },
  debugValue: { fontSize: 12, color: '#1A1A1A', fontFamily: "'SF Mono', Menlo, monospace" },
  debugDivider: { height: 1, background: 'rgba(0,0,0,0.06)', margin: '10px 0' },
  debugSectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#8A8580',
    textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4, display: 'block',
  },
  debugMono: { fontSize: 11, fontFamily: "'SF Mono', Menlo, monospace", color: '#1A1A1A', wordBreak: 'break-all' as const, margin: 0 },
  debugPre: {
    fontSize: 11, fontFamily: "'SF Mono', Menlo, monospace", color: '#1A1A1A',
    background: '#F8F6F1', padding: 10, borderRadius: 6, overflow: 'auto' as const,
    maxHeight: 300, whiteSpace: 'pre-wrap' as const, margin: 0, lineHeight: 1.5,
  },
  toolChip: {
    display: 'inline-block', fontSize: 11, padding: '3px 8px', borderRadius: 4,
    background: '#F1ECE1', color: '#1A1A1A', fontFamily: "'SF Mono', Menlo, monospace",
    marginRight: 4, marginBottom: 4,
  },

  modalOverlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw' },
  modalTitle: { fontSize: 16, fontWeight: 600, color: '#1A1A1A', marginBottom: 12 },
  textarea: {
    width: '100%', padding: '10px 12px', fontSize: 13,
    border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, outline: 'none',
    resize: 'vertical' as const, fontFamily: 'inherit', marginBottom: 12,
  },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  modalCancel: {
    padding: '8px 16px', fontSize: 13, border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 6, background: '#fff', color: '#1A1A1A', cursor: 'pointer',
  },
  modalSubmit: {
    padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none',
    borderRadius: 6, color: '#fff', cursor: 'pointer',
  },
}
