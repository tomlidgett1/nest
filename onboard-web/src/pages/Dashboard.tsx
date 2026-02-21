import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

const SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
].join(' ')

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }
const springSnappy = { type: 'spring' as const, stiffness: 500, damping: 35 }

interface GoogleAccount {
  id: string
  google_email: string
  google_name: string | null
  google_avatar_url: string | null
  is_primary: boolean
}

function TypingIndicator() {
  return (
    <div className="chat-row chat-row-nest">
      <img src="/nest-logo.png" alt="" className="chat-avatar" />
      <div className="typing-pill">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="typing-dot"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              delay: i * 0.12,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function StepProgress({ current }: { current: number }) {
  return (
    <nav className="step-progress" aria-label="Setup progress">
      {[1, 2, 3].map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.div
            className={`step-dot ${s === current ? 'step-dot-active' : s < current ? 'step-dot-done' : ''}`}
            animate={{ scale: s === current ? 1.25 : 1 }}
            transition={springSnappy}
            aria-label={`Step ${s}${s === current ? ' (current)' : s < current ? ' (completed)' : ''}`}
          />
          {i < 2 && (
            <div className={`step-line ${s < current ? 'step-line-done' : ''}`} />
          )}
        </div>
      ))}
    </nav>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const topBarRef = useRef<HTMLDivElement>(null)
  const [chatPhase, setChatPhase] = useState(0)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        navigate('/', { replace: true })
        return
      }

      const user = session.user
      setAvatarUrl(user.user_metadata?.avatar_url ?? null)
      setDisplayName(user.user_metadata?.full_name ?? user.email ?? '')

      await fetchAccounts(session.access_token)
      setLoading(false)
    }
    init()
  }, [navigate])

  useEffect(() => {
    if (step !== 3) return
    const timers = [
      setTimeout(() => setChatPhase(1), 500),
      setTimeout(() => setChatPhase(2), 1400),
      setTimeout(() => setChatPhase(3), 2400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [step])

  async function fetchAccounts(token?: string) {
    const accessToken = token ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!accessToken) return

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (data.accounts) setAccounts(data.accounts)
    } catch {
      // Non-critical
    }
  }

  async function handleAddAccount() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    sessionStorage.setItem('nest_original_user_id', session.user.id)
    sessionStorage.setItem('nest_original_refresh_token', session.refresh_token)

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/add-account-callback`,
        scopes: SCOPES,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  }

  async function handleRemoveAccount(accountId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setRemoving(accountId)
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ account_id: accountId }),
      })
      await fetchAccounts(session.access_token)
    } catch {
      // Silently fail
    } finally {
      setRemoving(null)
    }
  }

  if (loading) {
    return (
      <motion.div
        className="page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <main className="content" role="status" aria-label="Loading">
          <div className="loading-dots">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="loading-dot"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
              />
            ))}
          </div>
        </main>
      </motion.div>
    )
  }

  const primaryAccount = accounts.find(a => a.is_primary)
  const primaryAvatar = primaryAccount?.google_avatar_url ?? avatarUrl
  const firstName = displayName.split(' ')[0]

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="top-bar" ref={topBarRef}>
        <div className="top-bar-left">
          <motion.img
            src="/nest-logo.png"
            alt="Nest"
            className="top-bar-logo"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springSnappy, delay: 0.05 }}
          />
          <motion.span
            className="top-bar-wordmark"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring, delay: 0.1 }}
          >
            Nest
          </motion.span>
        </div>

        <motion.button
          className="avatar-button"
          onClick={() => setDropdownOpen(prev => !prev)}
          aria-label="Account menu"
          aria-expanded={dropdownOpen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileTap={{ scale: 0.9 }}
        >
          {primaryAvatar ? (
            <img src={primaryAvatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar-placeholder">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </motion.button>

        <AnimatePresence>
          {dropdownOpen && (
            <>
              <div className="dropdown-overlay" onClick={() => setDropdownOpen(false)} aria-hidden="true" />
              <motion.div
                className="avatar-dropdown"
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <button role="menuitem" className="dropdown-link" onClick={() => { setDropdownOpen(false); handleAddAccount() }}>
                  Add account
                </button>
                <div className="dropdown-divider" role="separator" />
                <Link to="/privacy" role="menuitem" className="dropdown-link" onClick={() => setDropdownOpen(false)}>
                  Privacy Policy
                </Link>
                <Link to="/terms" role="menuitem" className="dropdown-link" onClick={() => setDropdownOpen(false)}>
                  Terms of Service
                </Link>
                <a href="mailto:nestchatapp123@gmail.com" role="menuitem" className="dropdown-link">
                  Support
                </a>
                <div className="dropdown-divider" role="separator" />
                <button role="menuitem" className="dropdown-link dropdown-link-danger" onClick={async () => { setDropdownOpen(false); await supabase.auth.signOut(); navigate('/') }}>
                  Log out
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      <StepProgress current={step} />

      <AnimatePresence mode="wait">
        {/* ── Step 1: Connected Accounts ── */}
        {step === 1 && (
          <motion.div
            key="step-accounts"
            initial={{ opacity: 0, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'contents' }}
          >
            <main className="hero" aria-label="Connected accounts">
              <motion.div
                className="checkmark-circle"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.1 }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <motion.path
                    d="M20 6L9 17L4 12"
                    stroke="#4A6340"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
                  />
                </svg>
              </motion.div>

              <div className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>
                {(firstName ? [`Welcome,`, firstName] : ['You\'re', 'in']).map((word, i) => (
                  <motion.span
                    key={word + i}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: 0.2 + i * 0.06 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </div>

              <motion.p
                className="hero-sub"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.4 }}
              >
                Your connected accounts
              </motion.p>

              <motion.div
                className="accounts-card"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 0.5 }}
              >
                {accounts.map((account, idx) => (
                  <motion.div
                    className="accounts-card-row"
                    key={account.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring, delay: 0.55 + idx * 0.08 }}
                  >
                    <img
                      className="accounts-card-avatar"
                      src={account.google_avatar_url ?? ''}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="accounts-card-info">
                      <div className="accounts-card-name">
                        {account.google_name || account.google_email}
                      </div>
                      <div className="accounts-card-email">{account.google_email}</div>
                    </div>
                    {!account.is_primary && (
                      <button
                        className="accounts-card-remove"
                        onClick={() => handleRemoveAccount(account.id)}
                        disabled={removing === account.id}
                        aria-label={`Remove ${account.google_email}`}
                      >
                        {removing === account.id ? '...' : 'Remove'}
                      </button>
                    )}
                  </motion.div>
                ))}

                <motion.button
                  className="accounts-card-add"
                  onClick={handleAddAccount}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...spring, delay: 0.7 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add another account
                </motion.button>
              </motion.div>
            </main>

            <motion.div
              className="bottom-cta"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.6 }}
            >
              <motion.button
                className="btn-dark"
                onClick={() => setStep(2)}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.01 }}
                transition={springSnappy}
              >
                Continue
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Step 2: Add to Contacts ── */}
        {step === 2 && (
          <motion.div
            key="step-contact"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'contents' }}
          >
            <main className="hero" aria-label="Add Nest to contacts">
              <motion.img
                src="/nest-logo.png"
                alt=""
                className="step-logo"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.1 }}
              />

              <div className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>
                {['Add', 'Nest', 'to', 'Contacts'].map((word, i) => (
                  <motion.span
                    key={word + i}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: 0.15 + i * 0.06 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </div>

              <motion.div
                className="instructions-card"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 0.45 }}
              >
                <div className="instruction-row">
                  <div className="instruction-number">1</div>
                  <div className="instruction-text">
                    Tap <strong>Add to Contacts</strong> below
                  </div>
                </div>
                <div className="instruction-row">
                  <div className="instruction-number">2</div>
                  <div className="instruction-text">
                    Scroll to the bottom of the contact card and tap <strong>Create New Contact</strong>
                  </div>
                </div>
                <div className="instruction-row">
                  <div className="instruction-number">3</div>
                  <div className="instruction-text">
                    Tap <strong>Done</strong> in the top right
                  </div>
                </div>
              </motion.div>
            </main>

            <motion.div
              className="bottom-cta"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.55 }}
            >
              <div className="bottom-cta-stack">
                <motion.a
                  className="btn-dark"
                  href="/nest.vcf"
                  onClick={() => setTimeout(() => setStep(3), 500)}
                  style={{ textDecoration: 'none' }}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.01 }}
                  transition={springSnappy}
                >
                  Add to Contacts
                </motion.a>
                <motion.button
                  className="btn-skip"
                  onClick={() => setStep(3)}
                  whileTap={{ scale: 0.97 }}
                >
                  Skip for now
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Step 3: Open iMessage ── */}
        {step === 3 && (
          <motion.div
            key="step-imessage"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'contents' }}
          >
            <main className="hero" aria-label="Open iMessage">
              <motion.img
                src="/nest-logo.png"
                alt=""
                className="step-logo"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.1 }}
              />

              <div className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 40px)' }}>
                {(firstName ? ['Say', 'hi,', firstName] : ['Say', 'hi', 'to', 'Nest']).map((word, i) => (
                  <motion.span
                    key={word + i}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: 0.15 + i * 0.06 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </div>

              <motion.p
                className="hero-sub"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.35 }}
              >
                Open iMessage and send your first message — Nest is ready to&nbsp;help.
              </motion.p>

              <motion.div
                className="chat-card"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring, delay: 0.45 }}
                style={{ marginTop: 32 }}
              >
                {chatPhase >= 1 && (
                  <motion.div
                    className="chat-row chat-row-user"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={spring}
                  >
                    <div className="bubble bubble-user">Hey Nest!</div>
                  </motion.div>
                )}
                {chatPhase === 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={springSnappy}
                  >
                    <TypingIndicator />
                  </motion.div>
                )}
                {chatPhase >= 3 && (
                  <motion.div
                    className="chat-row chat-row-nest"
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={spring}
                  >
                    <img src="/nest-logo.png" alt="" className="chat-avatar" />
                    <div className="bubble bubble-nest">
                      Hey {firstName || 'there'}! What can I help you with?
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </main>

            <motion.div
              className="bottom-cta"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.55 }}
            >
              <motion.a
                className="btn-dark"
                href="sms:nestchatapp123@gmail.com&body=Hey%20Nest!"
                style={{ textDecoration: 'none' }}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.01 }}
                transition={springSnappy}
              >
                Open iMessage
              </motion.a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
