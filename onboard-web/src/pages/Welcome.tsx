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
  { id: 1, type: 'user', text: 'Who\'s Sarah Chen at Acme Corp?' },
  { id: 2, type: 'nest', text: 'Head of Marketing, 8 years in SaaS. You emailed her last Tuesday about the partnership.' },
  { id: 3, type: 'user', text: 'Draft a follow-up and prep me for tomorrow.' },
  { id: 4, type: 'nest', text: 'Done. Draft\'s ready and you\'ve got 3 meetings, I\'ve pulled the context for each.' },
]

const TIMELINE = [
  { at: 600, action: 'msg', msgId: 1 },
  { at: 1600, action: 'typing' },
  { at: 2800, action: 'msg', msgId: 2 },
  { at: 3800, action: 'msg', msgId: 3 },
  { at: 4800, action: 'typing' },
  { at: 6000, action: 'msg', msgId: 4 },
]

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    title: 'Email & Calendar',
    desc: 'Nest reads your inbox and calendar so it can draft replies, schedule meetings, and brief you before every call.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'People Intelligence',
    desc: 'Ask about anyone in your network. Nest surfaces context from emails, meetings, and contacts instantly.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: 'Action-Ready',
    desc: 'Nest doesn\'t just answer questions — it drafts emails, creates calendar events, and takes action on your behalf.',
  },
]

const HOW_STEPS = [
  { num: '1', title: 'Connect Google', desc: 'Sign in with your Google account to give Nest access to your email, calendar, and contacts.' },
  { num: '2', title: 'Add to Contacts', desc: 'Save Nest as a contact on your phone so messages arrive cleanly in iMessage.' },
  { num: '3', title: 'Start Chatting', desc: 'Open iMessage and ask Nest anything. It\'s like texting a brilliant assistant who knows your world.' },
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

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return <div className="feature-icon">{children}</div>
}

export default function Welcome() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''
  const [autoLinking, setAutoLinking] = useState(false)
  const [visibleMessages, setVisibleMessages] = useState<number[]>([])
  const [showTyping, setShowTyping] = useState(false)
  const reducedMotion = useReducedMotion()

  const fadeUp = reducedMotion
    ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, transition: { duration: 0.2 } }
    : { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, transition: { ...spring } }

  useEffect(() => {
    if (token) return

    let cancelled = false
    async function restoreSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!cancelled && session) {
        navigate('/dashboard', { replace: true })
      }
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
        if (data.success && !cancelled) {
          navigate('/dashboard', { replace: true })
          return
        }
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
    if (token) {
      sessionStorage.setItem('nest_imessage_token', token)
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
        scopes: SCOPES,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  }, [token])

  if (autoLinking) {
    return (
      <motion.div
        className="page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <main className="content">
          <div className="loading-dots" role="status" aria-label="Verifying">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="loading-dot"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
              />
            ))}
          </div>
          <h1 className="title">Verifying...</h1>
          <p className="subtitle">Just a moment.</p>
        </main>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="page page-scroll"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Gradient orbs */}
      <div className="orb-container" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Navigation */}
      <header className="top-bar">
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
          className="btn-signup"
          onClick={handleLogin}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Sign up with Google"
        >
          Sign up
        </motion.button>
      </header>

      {/* ── Hero Section ── */}
      <section className="hero welcome-hero" aria-label="Introduction">
        <div className="welcome-hero-left">
          <div className="hero-title">
            {['Meet', 'Nest'].map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.15 + i * 0.08 }}
              >
                {word}
              </motion.span>
            ))}
          </div>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.35 }}
          >
            Your personal chief of staff, right inside iMessage. Nest connects to your email, calendar, and contacts — so you can get things done with a single text.
          </motion.p>

          {/* Desktop CTAs in hero */}
          <motion.div
            className="welcome-hero-cta"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.5 }}
          >
            <motion.button
              className="btn-dark"
              onClick={handleLogin}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              transition={springSnappy}
            >
              Get Started
            </motion.button>
            <motion.a
              className="btn-outline"
              href="#how-it-works"
              whileTap={{ scale: 0.97 }}
              transition={springSnappy}
            >
              How It Works
            </motion.a>
          </motion.div>
        </div>

        <div className="welcome-hero-right">
          <motion.div
            className="chat-card chat-card-full"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.45 }}
          >
            {MESSAGES.filter(m => visibleMessages.includes(m.id)).map(msg => (
              <motion.div
                key={msg.id}
                className={`chat-row chat-row-${msg.type === 'user' ? 'user' : 'nest'}`}
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
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
          </motion.div>
        </div>
      </section>

      {/* ── Mobile CTA ── */}
      <motion.div
        className="bottom-cta bottom-cta-mobile"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.55 }}
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

      {/* ── Features Section ── */}
      <section className="landing-section desktop-only" aria-label="Features">
        <motion.span
          className="section-label"
          {...fadeUp}
          viewport={{ once: true, margin: '-50px' }}
        >
          What Nest Does
        </motion.span>
        <motion.h2
          className="section-title"
          {...fadeUp}
          viewport={{ once: true, margin: '-50px' }}
        >
          Everything you need, one text away
        </motion.h2>
        <motion.p
          className="section-subtitle"
          {...fadeUp}
          viewport={{ once: true, margin: '-50px' }}
        >
          Nest connects to your Google workspace and becomes your always-available assistant — no app to open, no interface to learn.
        </motion.p>

        <div className="features-grid">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="feature-card"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ ...spring, delay: i * 0.1 }}
            >
              <FeatureIcon>{feature.icon}</FeatureIcon>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="landing-section landing-section-alt desktop-only" id="how-it-works" aria-label="How it works">
        <motion.span
          className="section-label"
          {...fadeUp}
          viewport={{ once: true, margin: '-50px' }}
        >
          Get Started
        </motion.span>
        <motion.h2
          className="section-title"
          {...fadeUp}
          viewport={{ once: true, margin: '-50px' }}
        >
          Up and running in 30 seconds
        </motion.h2>
        <motion.p
          className="section-subtitle"
          {...fadeUp}
          viewport={{ once: true, margin: '-50px' }}
        >
          No app to download. No new interface to learn. Just iMessage.
        </motion.p>

        <div className="how-steps">
          {HOW_STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              className="how-step-card"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ ...spring, delay: i * 0.12 }}
            >
              <div className="how-step-number">{step.num}</div>
              <h3 className="how-step-title">{step.title}</h3>
              <p className="how-step-desc">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Trust Strip ── */}
      <motion.div
        className="trust-strip desktop-only"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        aria-label="Integrations"
      >
        <div className="trust-item">
          <svg className="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          Gmail
        </div>
        <div className="trust-item">
          <svg className="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Google Calendar
        </div>
        <div className="trust-item">
          <svg className="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Contacts
        </div>
        <div className="trust-item">
          <svg className="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          iMessage
        </div>
      </motion.div>

      {/* ── Final CTA ── */}
      <motion.section
        className="final-cta desktop-only"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ ...spring }}
        aria-label="Get started"
      >
        <h2 className="section-title">Ready to meet your new chief of staff?</h2>
        <p className="section-subtitle">
          Connect your Google account and start chatting in iMessage. It takes less than 30 seconds.
        </p>
        <motion.button
          className="btn-dark"
          onClick={handleLogin}
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
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

      {/* Mobile legal footer */}
      <motion.div
        className="legal-footer mobile-only"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.7 }}
      >
        <Link to="/privacy">Privacy</Link>
        <span className="legal-footer-dot">·</span>
        <Link to="/terms">Terms</Link>
      </motion.div>
    </motion.div>
  )
}
