import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'

const ONBOARD_URL = import.meta.env.VITE_ONBOARD_FUNCTION_URL

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
  { id: 4, type: 'nest', text: 'Done. Draft\'s ready and you\'ve got 3 meetings — I\'ve pulled the context for each.' },
]

const TIMELINE = [
  { at: 600, action: 'msg', msgId: 1 },
  { at: 1600, action: 'typing' },
  { at: 2800, action: 'msg', msgId: 2 },
  { at: 3800, action: 'msg', msgId: 3 },
  { at: 4800, action: 'typing' },
  { at: 6000, action: 'msg', msgId: 4 },
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
          headers: { 'Content-Type': 'application/json' },
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
        <div className="content">
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
          <h1 className="title">Linking your account...</h1>
          <p className="subtitle">Just a moment.</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="top-bar">
        <motion.img
          src="/nest-logo.png"
          alt="Nest"
          className="top-bar-logo"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springSnappy, delay: 0.05 }}
        />
        <motion.button
          className="btn-signup"
          onClick={handleLogin}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileTap={{ scale: 0.95 }}
        >
          Sign up
        </motion.button>
      </div>

      <div className="hero hero-top">
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
          One person for&nbsp;everything.
        </motion.p>

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
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: 0.05 }}
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

      <motion.div
        className="bottom-cta"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.55 }}
      >
        <motion.a
          className="btn-dark"
          href="sms:tomlidgettprojects@gmail.com&body=Hey%20Nest!"
          style={{ textDecoration: 'none' }}
          whileTap={{ scale: 0.97 }}
          transition={springSnappy}
        >
          Open in iMessage
        </motion.a>
      </motion.div>

      <motion.div
        className="legal-footer"
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
