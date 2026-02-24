import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { SplitText } from '../components/SplitText'
import { SpotlightCard } from '../components/SpotlightCard'
import { AnimatedList } from '../components/AnimatedList'
import { Calendar, Users, Plane, Sparkles, Bell, Zap, ChevronRight } from 'lucide-react'

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
    icon: <Calendar className="h-6 w-6 text-gray-900" />,
    title: 'Email, Calendar & Contacts',
    desc: 'Summarises your inbox, schedules meetings, drafts replies, and briefs you before every call.',
  },
  {
    icon: <Users className="h-6 w-6 text-gray-900" />,
    title: 'People Intelligence',
    desc: 'Ask about anyone. Nest pulls their role, company, LinkedIn, and your shared history.',
  },
  {
    icon: <Plane className="h-6 w-6 text-gray-900" />,
    title: 'Travel & Places',
    desc: 'Finds your flight bookings, calculates when to leave, and recommends restaurants nearby.',
  },
  {
    icon: <Sparkles className="h-6 w-6 text-gray-900" />,
    title: 'Memory & Context',
    desc: 'Remembers your preferences, past conversations, and meeting transcripts. Learns your style.',
  },
  {
    icon: <Bell className="h-6 w-6 text-gray-900" />,
    title: 'Reminders & To-Dos',
    desc: 'Set one-off or recurring reminders, manage your task list, and get nudged at the right time.',
  },
  {
    icon: <Zap className="h-6 w-6 text-gray-900" />,
    title: 'Takes Action',
    desc: 'Doesn\'t just answer — drafts and sends emails, books meetings, and searches the web.',
  },
]

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 w-full">
      <img src="/nest-logo.png" alt="" className="h-7 w-7 rounded-xl object-cover shadow-sm" />
      <div className="flex h-[38px] items-center gap-1 rounded-2xl bg-gray-100/80 px-4">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gray-400"
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: i * 0.15,
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
    if (token) return
    let cancelled = false
    async function restoreSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!cancelled && session) navigate('/dashboard', { replace: true })
    }
    restoreSession()
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function tryAutoLink() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
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
      } catch {
        /* fall through */
      }
      if (!cancelled) setAutoLinking(false)
    }
    tryAutoLink()
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const event of TIMELINE) {
      timers.push(
        setTimeout(() => {
          if (event.action === 'typing') {
            setShowTyping(true)
          } else if (event.action === 'msg' && event.msgId !== undefined) {
            setShowTyping(false)
            setVisibleMessages((prev) => [...prev, event.msgId!])
          }
        }, event.at)
      )
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
      <motion.div
        className="flex min-h-screen items-center justify-center bg-[#FAFAFA]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-2 w-2 rounded-full bg-gray-400"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
              />
            ))}
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-gray-900">Verifying...</h1>
          <p className="mt-2 text-gray-500">Just a moment.</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-gray-200"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 lg:px-12 backdrop-blur-md bg-[#FAFAFA]/80">
        <div className="flex items-center gap-3">
          <motion.img
            src="/nest-logo.png"
            alt="Nest"
            className="h-8 w-8 rounded-[10px] shadow-sm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          />
          <motion.span
            className="text-xl font-semibold tracking-tight text-gray-900"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            Nest
          </motion.span>
        </div>
        <motion.button
          onClick={handleLogin}
          className="rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-black transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          whileTap={{ scale: 0.96 }}
        >
          Sign up
        </motion.button>
      </header>

      <main className="pt-32 pb-24 lg:pt-48">
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-6 lg:px-12 flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 mb-8 shadow-sm"
            >
              <img src="/imessage-icon.png" alt="" className="h-4 w-4" />
              Available on iMessage
            </motion.div>

            <SplitText
              text="Your personal chief of staff."
              className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-gray-900 leading-[1.1] mb-6"
              delay={0.3}
            />

            <motion.p
              className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-10 max-w-2xl mx-auto lg:mx-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7 }}
            >
              Nest connects to your email, calendar, and contacts — so you can get things done with a single text. No apps to download.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.9 }}
            >
              <motion.button
                onClick={handleLogin}
                className="flex w-full sm:w-auto items-center justify-center gap-3 rounded-full bg-gray-900 px-8 py-4 text-base font-medium text-white shadow-lg shadow-gray-900/20 hover:bg-black transition-all"
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                transition={springSnappy}
              >
                <img src="/google-icon.png" alt="" className="h-5 w-5 bg-white rounded-full p-0.5" />
                Continue with Google
              </motion.button>
              <motion.a
                href="#features"
                className="flex items-center gap-2 rounded-full px-6 py-4 text-base font-medium text-gray-600 hover:text-gray-900 transition-colors"
                whileTap={{ scale: 0.97 }}
              >
                Learn more <ChevronRight className="h-4 w-4" />
              </motion.a>
            </motion.div>
          </div>

          {/* Interactive Chat Demo */}
          <div className="flex-1 w-full max-w-md lg:max-w-none">
            <motion.div
              className="relative mx-auto w-full max-w-[380px] overflow-hidden rounded-[40px] border-[8px] border-gray-900 bg-white shadow-2xl"
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            >
              {/* Dynamic Island / Top Bar */}
              <div className="absolute top-0 left-0 right-0 z-10 flex h-14 items-center justify-center bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="flex flex-col items-center">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">iMessage</div>
                  <div className="text-sm font-medium text-gray-900">Nest</div>
                </div>
              </div>

              <div className="h-[500px] w-full overflow-y-auto px-4 pt-20 pb-6 bg-[#F8F9FA]">
                <AnimatedList>
                  {MESSAGES.filter((m) => visibleMessages.includes(m.id)).map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex w-full ${msg.type === 'user' ? 'justify-end' : 'justify-start gap-2 items-end'}`}
                    >
                      {msg.type === 'nest' && (
                        <img src="/nest-logo.png" alt="" className="h-7 w-7 rounded-xl object-cover shadow-sm mb-1" />
                      )}
                      <div
                        className={`relative max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                          msg.type === 'user'
                            ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                            : 'bg-white border border-gray-100 text-gray-900 rounded-bl-[4px]'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {showTyping && (
                    <div key="typing">
                      <TypingIndicator />
                    </div>
                  )}
                </AnimatedList>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="mx-auto max-w-7xl px-6 lg:px-12 mt-32 lg:mt-48">
          <div className="text-center mb-16 lg:mb-24">
            <motion.h2
              className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-gray-900 mb-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6 }}
            >
              Everything you need,<br className="hidden sm:block" /> one text away.
            </motion.h2>
            <motion.p
              className="text-lg text-gray-600 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Nest connects to your Google workspace, learns your world, and handles the rest. No app to open, no interface to learn.
            </motion.p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <SpotlightCard className="h-full flex flex-col">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed flex-1">{feature.desc}</p>
                </SpotlightCard>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Setup Section */}
        <section className="mx-auto max-w-5xl px-6 lg:px-12 mt-32 lg:mt-48 text-center">
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-gray-900 mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6 }}
          >
            Up and running in 30 seconds.
          </motion.h2>
          
          <div className="grid sm:grid-cols-3 gap-8 text-left relative">
            <div className="hidden sm:block absolute top-8 left-[15%] right-[15%] h-[2px] bg-gray-100 -z-10" />
            
            {[
              { step: '1', title: 'Connect Google', desc: 'Sign in with your Google account to give Nest secure access.' },
              { step: '2', title: 'Add to Contacts', desc: 'Save Nest as a contact so messages arrive cleanly.' },
              { step: '3', title: 'Start Chatting', desc: 'Text Nest anything. Like having a brilliant assistant.' }
            ].map((s, i) => (
              <motion.div
                key={s.step}
                className="relative bg-white/50 backdrop-blur-sm rounded-3xl p-6 border border-gray-100 shadow-sm"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
              >
                <div className="h-10 w-10 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold mb-6 shadow-md">
                  {s.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-600">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-4xl px-6 lg:px-12 mt-32 lg:mt-48 mb-20 text-center">
          <motion.div
            className="rounded-[40px] bg-gray-900 p-10 sm:p-16 relative overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_50%)]" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white mb-6 relative z-10">
              Ready to meet your chief of staff?
            </h2>
            <p className="text-lg text-gray-300 mb-10 max-w-xl mx-auto relative z-10">
              Connect your Google account and start chatting in iMessage. It takes less than 30 seconds.
            </p>
            <motion.button
              onClick={handleLogin}
              className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-8 py-4 text-base font-medium text-gray-900 shadow-xl hover:bg-gray-50 transition-colors relative z-10"
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              transition={springSnappy}
            >
              Get Started Free
            </motion.button>
          </motion.div>
        </section>
      </main>

      {/* Footer & Compliance */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-12 lg:py-16 text-center">
          <div className="flex justify-center items-center gap-2 mb-8">
            <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-md opacity-80 grayscale" />
            <span className="text-lg font-semibold text-gray-900 tracking-tight">Nest</span>
          </div>

          <div className="text-[13px] leading-relaxed text-gray-500 max-w-2xl mx-auto space-y-4 mb-8">
            <p>
              Nest operates exclusively through Apple Messages for Business to provide a seamless, secure experience. 
              Need human help? Text <strong>'agent'</strong>, <strong>'support'</strong>, or <strong>'help'</strong> during business hours to reach a live agent.
            </p>
            <p>
              We will send important notifications related to your account status or transactions. 
              Manage your preferences easily by texting <strong>'unsubscribe'</strong> or <strong>'menu'</strong> at any time.
            </p>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4 text-sm font-medium text-gray-600">
            <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-gray-900 transition-colors">Terms of Service</Link>
            <a href="mailto:nestchatapp123@gmail.com" className="hover:text-gray-900 transition-colors">Contact Support</a>
          </div>
          
          <div className="mt-8 text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Nest AI. All rights reserved.
          </div>
        </div>
      </footer>
    </motion.div>
  )
}
