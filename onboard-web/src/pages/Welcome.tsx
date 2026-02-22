import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { supabase } from '../lib/supabase'

const ONBOARD_URL = import.meta.env.VITE_ONBOARD_FUNCTION_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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

interface ChatMessage {
  id: number
  type: 'user' | 'nest'
  text: string
}

const MESSAGES: ChatMessage[] = [
  { id: 1, type: 'user', text: 'When should I leave for the airport?' },
  { id: 2, type: 'nest', text: 'Your flight\'s at 10pm. 45 min drive with traffic — leave by 6:30 to be safe.' },
  { id: 3, type: 'user', text: 'Remind me to pack at 5.' },
  { id: 4, type: 'nest', text: 'Locked in. I\'ll ping you at 5pm.' },
]

const TIMELINE = [
  { at: 800, action: 'msg', msgId: 1 },
  { at: 2000, action: 'typing' },
  { at: 3400, action: 'msg', msgId: 2 },
  { at: 4600, action: 'msg', msgId: 3 },
  { at: 5800, action: 'typing' },
  { at: 7200, action: 'msg', msgId: 4 },
]

const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: 'Email, Calendar & Contacts',
    desc: 'Summarises your inbox, schedules meetings, drafts replies, and briefs you before every call — across all your Google accounts.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'People Intelligence',
    desc: 'Ask about anyone. Nest pulls their role, company, LinkedIn, and your shared history from emails and meetings.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: 'Travel & Places',
    desc: 'Finds your flight bookings, calculates when to leave for the airport, and recommends restaurants nearby.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: 'Memory & Context',
    desc: 'Remembers your preferences, past conversations, and meeting transcripts. Learns your style over time.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: 'Reminders & To-Dos',
    desc: 'Set one-off or recurring reminders, manage your task list, and get nudged at the right time.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: 'Takes Action',
    desc: 'Doesn\'t just answer — drafts and sends emails, books meetings, searches the web, and acts on your behalf.',
  },
]

const HOW_STEPS = [
  { num: '1', title: 'Connect Google', desc: 'Sign in with your Google account to give Nest secure access to your workspace.' },
  { num: '2', title: 'Add to Contacts', desc: 'Save Nest as a contact so messages arrive cleanly in iMessage.' },
  { num: '3', title: 'Start Chatting', desc: 'Text Nest anything. Like having a brilliant assistant who knows your world.' },
]

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

export default function Welcome() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const [autoLinking, setAutoLinking] = useState(false)
  const [visibleMessages, setVisibleMessages] = useState<number[]>([])
  const [showTyping, setShowTyping] = useState(false)
  const reducedMotion = useReducedMotion()

  const ease = [0.16, 1, 0.3, 1] as const

  const reveal = (delay = 0) => reducedMotion
    ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, transition: { duration: 0.2 } }
    : { initial: { opacity: 0, y: 32 }, whileInView: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease, delay } }

  useEffect(() => {
    if (token) return
    let cancelled = false
    async function restoreSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!cancelled && session) navigate('/dashboard', { replace: true })
    }
    restoreSession()
    return () => { cancelled = true }
  }, [token, navigate])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function tryAutoLink() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      setAutoLinking(true)
      try {
        const res = await fetch(ONBOARD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${String(session.access_token).trim()}`,
          },
          body: JSON.stringify({
            token,
            access_token: session.access_token,
            provider_token: session.provider_token ?? '',
            provider_refresh_token: session.provider_refresh_token ?? '',
          }),
        })
        const data = await res.json()
        if (data.success && !cancelled) { navigate('/dashboard', { replace: true }); return }
      } catch { /* fall through */ }
      if (!cancelled) setAutoLinking(false)
    }
    tryAutoLink()
    return () => { cancelled = true }
  }, [token, navigate])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const event of TIMELINE) {
      timers.push(setTimeout(() => {
        if (event.action === 'typing') {
          setShowTyping(true)
        } else if (event.action === 'msg' && event.msgId !== undefined) {
          setShowTyping(false)
          setVisibleMessages(prev => [...prev, event.msgId!])
        }
      }, event.at))
    }
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleLogin = useCallback(async () => {
    if (token) sessionStorage.setItem('nest_imessage_token', token)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
        scopes: SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }, [token])

  if (autoLinking) {
    return (
      <motion.div className="page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <main className="content">
          <div className="loading-dots" role="status" aria-label="Verifying">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="loading-dot" animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }} />
            ))}
          </div>
          <h1 className="title">Verifying...</h1>
          <p className="subtitle">Just a moment.</p>
        </main>
      </motion.div>
    )
  }

  const HERO_WORDS = ['Your', 'personal', 'chief', 'of', 'staff.']

  return (
    <motion.div
      className="page page-scroll"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="orb-container" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* ── Nav ── */}
      <header className="top-bar">
        <div className="top-bar-left">
          <motion.img
            src="/nest-logo.png" alt="Nest" className="top-bar-logo"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease, delay: 0.05 }}
          />
          <motion.span
            className="top-bar-wordmark"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.1 }}
          >
            Nest
          </motion.span>
        </div>
        <motion.button
          className="btn-nav-signup"
          onClick={handleLogin}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Sign up with Google"
        >
          Sign up
        </motion.button>
      </header>

      {/* ── Mobile Hero (simple "Meet Nest" layout) ── */}
      <section className="hero hero-top mobile-only" aria-label="Introduction">
        <motion.h1
          className="title title-mobile-hero"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.15 }}
        >
          Meet Nest
        </motion.h1>
        <motion.p
          className="subtitle subtitle-mobile-hero"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.25 }}
        >
          Your personal chief of staff, right in iMessage.
        </motion.p>

        <motion.div
          className="chat-card chat-card-hero chat-card-full"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease, delay: 0.4 }}
        >
          <div className="chat-card-header">
            <img src="/nest-logo.png" alt="" className="chat-card-header-avatar" />
            <div>
              <div className="chat-card-header-name">Nest</div>
              <div className="chat-card-header-status">iMessage</div>
            </div>
          </div>
          <div className="chat-card-body">
            {MESSAGES.filter(m => visibleMessages.includes(m.id)).map(msg => (
              <motion.div
                key={msg.id}
                className={`chat-row chat-row-${msg.type === 'user' ? 'user' : 'nest'}`}
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3, ease }}
              >
                {msg.type === 'nest' && (
                  <img src="/nest-logo.png" alt="" className="chat-avatar" />
                )}
                <div className={`bubble bubble-${msg.type === 'user' ? 'user' : 'nest'}`}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
            {showTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <TypingIndicator />
              </motion.div>
            )}
          </div>
        </motion.div>
      </section>

      {/* ── Desktop Hero (two-column with word-by-word title) ── */}
      <section className="welcome-hero desktop-only" aria-label="Introduction">
        <div className="welcome-hero-left">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.2 }}
          >
            <img src="/imessage-icon.png" alt="" className="hero-badge-icon" />
            Available on iMessage
          </motion.div>

          <h1 className="hero-title">
            {HERO_WORDS.map((word, i) => (
              <motion.span
                key={i}
                className="hero-word"
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.6,
                  ease,
                  delay: 0.3 + i * 0.06,
                }}
              >
                {word}
              </motion.span>
            ))}
          </h1>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.65 }}
          >
            Your personal chief of staff, right inside iMessage. Nest connects to your email, calendar, and contacts — so you can get things done with a single text.
          </motion.p>

          <motion.div
            className="welcome-hero-cta"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease, delay: 0.8 }}
          >
            <motion.button
              className="btn-hero-primary"
              onClick={handleLogin}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.015 }}
              transition={springSnappy}
            >
              <img src="/google-icon.png" alt="" className="btn-google-icon" />
              Continue with Google
            </motion.button>
            <motion.a
              className="btn-hero-secondary"
              href="#how-it-works"
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
            >
              Learn more
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </motion.a>
          </motion.div>
        </div>

        <div className="welcome-hero-right">
          <motion.div
            className="chat-card chat-card-hero"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease, delay: 0.5 }}
          >
            <div className="chat-card-header">
              <img src="/nest-logo.png" alt="" className="chat-card-header-avatar" />
              <div>
                <div className="chat-card-header-name">Nest</div>
                <div className="chat-card-header-status">iMessage</div>
              </div>
            </div>
            <div className="chat-card-body">
              {MESSAGES.filter(m => visibleMessages.includes(m.id)).map(msg => (
                <motion.div
                  key={msg.id}
                  className={`chat-row chat-row-${msg.type === 'user' ? 'user' : 'nest'}`}
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.3, ease }}
                >
                  {msg.type === 'nest' && (
                    <img src="/nest-logo.png" alt="" className="chat-avatar" />
                  )}
                  <div className={`bubble bubble-${msg.type === 'user' ? 'user' : 'nest'}`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
              {showTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <TypingIndicator />
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Mobile CTA ── */}
      <motion.div
        className="bottom-cta bottom-cta-mobile"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.7 }}
      >
        <motion.a
          className="btn-dark"
          href="sms:nestchatapp123@gmail.com&body=Hey%20Nest!"
          style={{ textDecoration: 'none' }}
          whileTap={{ scale: 0.97 }}
          transition={springSnappy}
        >
          Open in iMessage
        </motion.a>
      </motion.div>

      {/* ── Features ── */}
      <section className="landing-section desktop-only" aria-label="Features">
        <motion.span className="section-label" {...reveal()} viewport={{ once: true, margin: '-80px' }}>
          Capabilities
        </motion.span>
        <motion.h2 className="section-title" {...reveal(0.05)} viewport={{ once: true, margin: '-80px' }}>
          Everything you need,{'\n'}one text away.
        </motion.h2>
        <motion.p className="section-subtitle" {...reveal(0.1)} viewport={{ once: true, margin: '-80px' }}>
          Nest connects to your Google workspace, learns your world, and handles the rest. No app to open, no interface to learn — just text.
        </motion.p>

        <div className="features-grid">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="feature-card"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.6, ease, delay: 0.1 + i * 0.08 }}
            >
              <div className="feature-icon">{feature.icon}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="landing-section landing-section-alt desktop-only" id="how-it-works" aria-label="How it works">
        <motion.span className="section-label" {...reveal()} viewport={{ once: true, margin: '-80px' }}>
          Setup
        </motion.span>
        <motion.h2 className="section-title" {...reveal(0.05)} viewport={{ once: true, margin: '-80px' }}>
          Up and running{'\n'}in 30 seconds.
        </motion.h2>
        <motion.p className="section-subtitle" {...reveal(0.1)} viewport={{ once: true, margin: '-80px' }}>
          No app to download. No new interface to learn. Just iMessage.
        </motion.p>

        <div className="how-steps">
          {HOW_STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              className="how-step-card"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.6, ease, delay: 0.1 + i * 0.08 }}
            >
              <div className="how-step-number">{step.num}</div>
              <h3 className="how-step-title">{step.title}</h3>
              <p className="how-step-desc">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Trust ── */}
      <motion.div
        className="trust-strip desktop-only"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        aria-label="Integrations"
      >
        <span className="trust-label">Works with</span>
        <div className="trust-logos">
          {['Gmail', 'Calendar', 'Contacts', 'iMessage'].map((name) => (
            <div key={name} className="trust-item">
              {name === 'iMessage' ? (
                <img src="/imessage-icon.png" alt="" className="trust-icon-img" />
              ) : (
                <svg className="trust-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {name === 'Gmail' && <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>}
                  {name === 'Calendar' && <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>}
                  {name === 'Contacts' && <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>}
                </svg>
              )}
              {name}
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Final CTA ── */}
      <motion.section
        className="final-cta desktop-only"
        {...reveal()}
        viewport={{ once: true, margin: '-60px' }}
        aria-label="Get started"
      >
        <h2 className="section-title">Ready to meet your{'\n'}chief of staff?</h2>
        <p className="section-subtitle">
          Connect your Google account and start chatting in iMessage.{'\n'}It takes less than 30 seconds.
        </p>
        <motion.button
          className="btn-cta-final"
          onClick={handleLogin}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.015 }}
          transition={springSnappy}
        >
          Get Started Free
        </motion.button>
      </motion.section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <Link to="/privacy">Privacy</Link>
        <span className="landing-footer-dot">·</span>
        <Link to="/terms">Terms</Link>
        <span className="landing-footer-dot desktop-only">·</span>
        <a href="mailto:nestchatapp123@gmail.com" className="desktop-only">Support</a>
      </footer>

      <motion.div
        className="legal-footer mobile-only"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.8 }}
      >
        <Link to="/privacy">Privacy</Link>
        <span className="legal-footer-dot">·</span>
        <Link to="/terms">Terms</Link>
      </motion.div>
    </motion.div>
  )
}
