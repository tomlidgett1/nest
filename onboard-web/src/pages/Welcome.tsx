import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'
import { SpotlightCard } from '../components/SpotlightCard'
import { AnimatedList } from '../components/AnimatedList'
import RotatingText from '../components/RotatingText'
import { IPhoneMockup } from 'react-device-mockup'
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

// Mobile: verification-themed conversation (shown when user taps signup link)
const MOBILE_MESSAGES: ChatMessage[] = [
  { id: 1, type: 'nest', text: "Almost there. I just need to verify you're a real human before I can start working for you" },
  { id: 2, type: 'user', text: "Fair enough, what do I need to do?" },
  { id: 3, type: 'nest', text: "Two quick things. Save me as a contact so I don't end up in spam, then verify with Google. 30 seconds tops" },
  { id: 4, type: 'user', text: "Easy, let's do it" },
]

const MOBILE_TIMELINE = [
  { at: 800, action: 'typing' },
  { at: 2500, action: 'msg', msgId: 1 },
  { at: 4500, action: 'msg', msgId: 2 },
  { at: 5500, action: 'typing' },
  { at: 7500, action: 'msg', msgId: 3 },
  { at: 9500, action: 'msg', msgId: 4 },
]

// Desktop: feature demo conversation (marketing iPhone mockup)
const DESKTOP_MESSAGES: ChatMessage[] = [
  { id: 1, type: 'user', text: 'When should I leave for the airport?' },
  { id: 2, type: 'nest', text: 'Your flight\'s at 10pm. 45 min drive with traffic — leave by 6:30 to be safe.' },
  { id: 3, type: 'user', text: 'Remind me to pack at 5.' },
  { id: 4, type: 'nest', text: 'Locked in. I\'ll ping you at 5pm.' },
  { id: 5, type: 'user', text: 'Did I get any important emails today?' },
  { id: 6, type: 'nest', text: 'You got 23 emails. 3 need attention: a contract from Sarah, a meeting reschedule from James, and an invoice from Xero.' },
  { id: 7, type: 'user', text: 'Put the meeting with James in my calendar.' },
  { id: 8, type: 'nest', text: 'Done — added "Meeting with James" on Thursday 2pm. I\'ve sent him a confirmation too.' },
  { id: 9, type: 'user', text: 'Send Sarah a reply saying I\'ll review the contract tonight.' },
  { id: 10, type: 'nest', text: 'Sent. I wrote: "Hi Sarah, I\'ll review the contract this evening and get back to you. Thanks!" Want me to follow up tomorrow if you forget?' },
  { id: 11, type: 'user', text: 'Yes please.' },
  { id: 12, type: 'nest', text: 'Reminder set for tomorrow 9am to follow up on Sarah\'s contract.' },
  { id: 13, type: 'user', text: 'Who\'s Tom Chen? I have a meeting with him tomorrow.' },
  { id: 14, type: 'nest', text: 'Tom Chen — VP Product at Notion. You last emailed 3 weeks ago about an API integration. He\'s based in San Francisco. Want me to pull up that email thread?' },
  { id: 15, type: 'user', text: 'What\'s on my calendar this week?' },
  { id: 16, type: 'nest', text: 'You\'ve got 12 events this week. Tomorrow looks busiest — 5 meetings back to back from 9am. Thursday afternoon is clear if you need focus time.' },
  { id: 17, type: 'user', text: 'Draft an email to the team about Friday\'s offsite.' },
  { id: 18, type: 'nest', text: 'Here\'s a draft: "Hi team, Quick reminder that our offsite is this Friday at The Grounds. Kick-off at 10am, lunch provided. Please bring your laptops for the afternoon workshop. See you there!" Send it?' },
]

const DESKTOP_TIMELINE = [
  { at: 1200, action: 'msg', msgId: 1 },
  { at: 3000, action: 'typing' },
  { at: 5000, action: 'msg', msgId: 2 },
  { at: 7000, action: 'msg', msgId: 3 },
  { at: 8800, action: 'typing' },
  { at: 10800, action: 'msg', msgId: 4 },
  { at: 13500, action: 'msg', msgId: 5 },
  { at: 15300, action: 'typing' },
  { at: 18000, action: 'msg', msgId: 6 },
  { at: 21000, action: 'msg', msgId: 7 },
  { at: 22800, action: 'typing' },
  { at: 25500, action: 'msg', msgId: 8 },
  { at: 28500, action: 'msg', msgId: 9 },
  { at: 30300, action: 'typing' },
  { at: 33500, action: 'msg', msgId: 10 },
  { at: 36500, action: 'msg', msgId: 11 },
  { at: 38300, action: 'typing' },
  { at: 40000, action: 'msg', msgId: 12 },
  { at: 43500, action: 'msg', msgId: 13 },
  { at: 45300, action: 'typing' },
  { at: 48500, action: 'msg', msgId: 14 },
  { at: 52000, action: 'msg', msgId: 15 },
  { at: 53800, action: 'typing' },
  { at: 57000, action: 'msg', msgId: 16 },
  { at: 60500, action: 'msg', msgId: 17 },
  { at: 62300, action: 'typing' },
  { at: 65500, action: 'msg', msgId: 18 },
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
  const [mobileMessages, setMobileMessages] = useState<number[]>([])
  const [desktopMessages, setDesktopMessages] = useState<number[]>([])
  const [mobileTyping, setMobileTyping] = useState(false)
  const [desktopTyping, setDesktopTyping] = useState(false)
  const [contactAdded, setContactAdded] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [mobileMessages, mobileTyping])

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

  // Mobile timeline (verification messages)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const event of MOBILE_TIMELINE) {
      timers.push(
        setTimeout(() => {
          if (event.action === 'typing') {
            setMobileTyping(true)
          } else if (event.action === 'msg' && event.msgId !== undefined) {
            setMobileTyping(false)
            setMobileMessages((prev) => [...prev, event.msgId!])
          }
        }, event.at)
      )
    }
    return () => timers.forEach(clearTimeout)
  }, [])

  // Desktop timeline (feature demo)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const event of DESKTOP_TIMELINE) {
      timers.push(
        setTimeout(() => {
          if (event.action === 'typing') {
            setDesktopTyping(true)
          } else if (event.action === 'msg' && event.msgId !== undefined) {
            setDesktopTyping(false)
            setDesktopMessages((prev) => [...prev, event.msgId!])
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
      className="h-[100dvh] lg:h-auto bg-[#FAFAFA] font-sans selection:bg-gray-200 lg:min-h-screen overflow-hidden lg:overflow-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* MOBILE VIEW */}
      <div className="flex flex-col h-[100dvh] w-full bg-[#FAFAFA] lg:hidden overflow-hidden fixed inset-0 z-50">
        {/* iMessage Header */}
        <div className="shrink-0 bg-[#F8F9FA]/95 backdrop-blur-sm border-b border-gray-200/60 pt-[calc(env(safe-area-inset-top,44px)+8px)] pb-2 touch-none">
          <div className="flex items-center px-3 pt-1">
            <div className="flex items-center gap-1 w-14 pl-2">
              <svg width="12" height="20" viewBox="0 0 10 17" fill="none"><path d="M9 1L1.5 8.5L9 16" stroke="#007AFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] rounded-full bg-[#007AFF] text-white text-[11px] font-medium px-1 leading-none">5</span>
            </div>
            <div className="flex-1 flex justify-center">
              <img src="/nest-logo.png" alt="" className="h-12 w-12 rounded-full object-cover shadow-sm" />
            </div>
            <div className="w-14 flex justify-end pr-3">
              <svg width="28" height="18" viewBox="0 0 102.1 63.23" fill="none">
                <path d="M22.36 63.18L61.72 63.18C71.29 63.18 77.1 57.52 77.1 47.95L77.1 15.23C77.1 5.66 71.29 0 61.72 0L22.36 0C13.28 0 6.93 5.66 6.93 15.23L6.93 47.95C6.93 57.52 12.74 63.18 22.36 63.18ZM23.54 56.59C17.53 56.59 13.96 53.47 13.96 46.97L13.96 16.21C13.96 9.72 17.53 6.59 23.54 6.59L60.55 6.59C66.5 6.59 70.07 9.72 70.07 16.21L70.07 46.97C70.07 53.47 66.5 56.59 60.55 56.59ZM76.17 20.41L76.17 28.71L94.34 13.57C94.53 13.38 94.68 13.33 94.92 13.33C95.21 13.33 95.31 13.57 95.31 13.92L95.31 49.27C95.31 49.61 95.21 49.85 94.92 49.85C94.68 49.85 94.53 49.76 94.34 49.61L76.17 34.47L76.17 42.77L91.11 55.62C92.68 56.93 94.48 57.81 96.09 57.81C99.71 57.81 102.1 55.18 102.1 51.42L102.1 11.77C102.1 8.01 99.71 5.37 96.09 5.37C94.48 5.37 92.68 6.25 91.11 7.57Z" fill="#007AFF"/>
              </svg>
            </div>
          </div>
          <div className="text-center -mt-0.5">
            <span className="text-[11px] font-normal text-gray-900">Nest</span>
          </div>
        </div>

        {/* Chat Messages — auto-scrolling */}
        <div ref={chatScrollRef} className="flex-1 w-full flex flex-col gap-3 px-4 pt-4 pb-4 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {MOBILE_MESSAGES.filter((m) => mobileMessages.includes(m.id)).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={`flex w-full ${msg.type === 'user' ? 'justify-end' : 'justify-start gap-2 items-end'}`}
              >
                {msg.type === 'nest' && (
                  <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-full object-cover mb-1 shrink-0 shadow-sm" />
                )}
                <div
                  className={`max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                    msg.type === 'user'
                      ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                      : 'bg-[#E9E9EB] text-[#000000] rounded-bl-[4px]'
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
            {mobileTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex justify-start gap-2 items-end"
              >
                <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-full object-cover mb-1 shrink-0 shadow-sm" />
                <div className="bg-[#E9E9EB] rounded-[20px] rounded-bl-[4px] px-5 py-4 shadow-sm">
                  <div className="flex gap-1.5 items-center justify-center">
                    <motion.div className="w-2 h-2 bg-[#8E8E93] rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                    <motion.div className="w-2 h-2 bg-[#8E8E93] rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }} />
                    <motion.div className="w-2 h-2 bg-[#8E8E93] rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom CTA */}
        <div className="shrink-0 border-t border-gray-200/60 bg-[#FAFAFA] px-6 pb-10 pt-5 touch-none">
          {token ? (
            <AnimatePresence mode="wait">
              {!contactAdded ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide mb-3">Step 1</p>
                  <h1 className="text-[24px] font-semibold tracking-tight leading-[1.15] text-gray-900 mb-1.5">
                    Save Nest to your contacts
                  </h1>
                  <p className="text-[15px] text-gray-500 mb-5">Make sure you click "Create New Contact" so I'm easy to find in your messages</p>
                  <a
                    href="/nest.vcf"
                    onClick={() => {
                      setTimeout(() => setContactAdded(true), 2000)
                    }}
                    className="flex items-center justify-center w-full bg-[#007AFF] text-white rounded-full py-4 text-[17px] font-semibold tracking-wide shadow-[0_4px_14px_rgba(0,122,255,0.3)] hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Add to Contacts
                  </a>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide mb-3">Step 2</p>
                  <h1 className="text-[24px] font-semibold tracking-tight leading-[1.15] text-gray-900 mb-1.5">
                    Verify you're human
                  </h1>
                  <p className="text-[15px] text-gray-500 mb-5">Quick Google sign-in so Nest can access your calendar, emails, and contacts.</p>
                  <button
                    onClick={handleLogin}
                    className="flex items-center justify-center gap-2.5 w-full bg-[#007AFF] text-white rounded-full py-4 text-[17px] font-semibold tracking-wide shadow-[0_4px_14px_rgba(0,122,255,0.3)] hover:opacity-90 active:scale-[0.98] transition-all"
                  >
                    Verify
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <>
              <h1 className="text-[30px] font-semibold tracking-tight leading-[1.15] text-gray-900 mb-5">
                <span className="flex items-baseline gap-x-[0.3em] flex-wrap">
                  <span>Your</span>
                  <RotatingText
                    texts={['chief of staff', 'executive assistant', 'companion', 'smart friend', 'wingman', 'co-pilot', 'lifeline']}
                    mainClassName="inline-flex text-[#007AFF] overflow-hidden items-baseline"
                    staggerFrom={"last"}
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "-120%" }}
                    staggerDuration={0.025}
                    splitLevelClassName="overflow-hidden pb-0.5"
                    transition={{ type: "spring", damping: 30, stiffness: 400 }}
                    rotationInterval={3000}
                  />
                </span>
                <span className="text-gray-900 inline-flex items-center gap-[0.25em]">in iMessage <img src="/imessage-icon.png" alt="" className="h-[0.85em] w-[0.85em] rounded-[3px] inline-block translate-y-[0.05em]" /></span>
              </h1>

              <a
                href="imessage:tlidgett@icloud.com&body=Hey%20Nest!%20What%20can%20you%20help%20me%20with%3F"
                className="flex items-center justify-center w-full bg-[#007AFF] text-white rounded-full py-4 text-[17px] font-semibold tracking-wide shadow-[0_4px_14px_rgba(0,122,255,0.3)] hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Open in iMessage
              </a>
            </>
          )}
        </div>
      </div>

      {/* DESKTOP VIEW */}
      <div className="hidden lg:block">
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

      <main className="pt-24 pb-24 lg:pt-32">
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-6 lg:px-12">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20">
            {/* Left — editorial intro */}
            <div className="flex-1 max-w-xl">
              <motion.p
                className="text-sm font-medium tracking-widest uppercase text-gray-400 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                Introducing Nest
              </motion.p>

              <motion.h1
                className="text-[42px] sm:text-5xl lg:text-[56px] font-semibold tracking-tight text-gray-900 leading-[1.12] mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.25 }}
              >
                One text to get<br />anything done.
              </motion.h1>

              <motion.p
                className="text-[17px] sm:text-lg text-gray-500 leading-relaxed mb-4 max-w-md"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.45 }}
              >
                Nest lives in iMessage. It reads your emails, manages your calendar, drafts replies, and handles the busywork — so you don't have to open another app.
              </motion.p>

              <motion.p
                className="text-[15px] text-gray-400 mb-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                No download. No sign-up form. Just a conversation.
              </motion.p>

              <motion.div
                className="flex items-center gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
              >
                <motion.button
                  onClick={handleLogin}
                  className="flex items-center justify-center gap-3 rounded-full bg-gray-900 px-7 py-3.5 text-[15px] font-medium text-white shadow-lg shadow-gray-900/15 hover:bg-black transition-all"
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                  transition={springSnappy}
                >
                  <img src="/google-icon.png" alt="" className="h-5 w-5 bg-white rounded-full p-0.5" />
                  Get started
                </motion.button>
                <motion.a
                  href="#features"
                  className="flex items-center gap-1.5 text-[15px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
                  whileTap={{ scale: 0.97 }}
                >
                  See how it works <ChevronRight className="h-4 w-4" />
                </motion.a>
              </motion.div>

              <motion.div
                className="flex items-center gap-3 mt-10 pt-8 border-t border-gray-200/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.9 }}
              >
                <img src="/imessage-icon.png" alt="" className="h-8 w-8 rounded-[6px]" />
                <div>
                  <p className="text-[13px] font-medium text-gray-900">Works entirely in iMessage</p>
                  <p className="text-[12px] text-gray-400">No app to install. Text and go.</p>
                </div>
              </motion.div>
            </div>

            {/* Right — iPhone */}
            <div className="flex-1 w-full flex justify-center lg:justify-end">
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
                className="drop-shadow-2xl max-w-full"
              >
              <IPhoneMockup screenWidth={340} frameColor="#1a1a1a" hideStatusBar={true} hideNavBar={true}>
                <div className="size-full flex flex-col bg-[#F8F9FA]" style={{ minHeight: '100%' }}>
                  {/* iOS Status Bar — positioned below dynamic island */}
                  <div className="shrink-0 flex items-center justify-between px-5 bg-[#F8F9FA]" style={{ paddingTop: '18px', paddingBottom: '4px' }}>
                    <span className="text-[14px] font-semibold text-gray-900 tracking-tight pl-4">9:41</span>
                    <div className="flex items-center gap-[7px] pr-1">
                      <img src="/wifi.svg" alt="" className="h-[11px] w-auto" />
                      <img src="/battery.svg" alt="" className="h-[11px] w-auto" />
                    </div>
                  </div>

                  {/* iMessage Conversation Header */}
                  <div className="shrink-0 bg-[#F8F9FA]/95 backdrop-blur-sm border-b border-gray-200/60 pt-5 pb-2">
                    <div className="flex items-center px-3">
                      <div className="flex items-center gap-1 w-14 pl-1">
                        <svg width="12" height="20" viewBox="0 0 10 17" fill="none"><path d="M9 1L1.5 8.5L9 16" stroke="#007AFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] rounded-full bg-[#007AFF] text-white text-[11px] font-medium px-1 leading-none">5</span>
                      </div>
                      <div className="flex-1 flex justify-center">
                        <img src="/nest-logo.png" alt="" className="h-10 w-10 rounded-full object-cover shadow-sm" />
                      </div>
                      <div className="w-14 flex justify-end pr-1">
                        <svg width="24" height="15" viewBox="0 0 102.1 63.23" fill="none">
                          <path d="M22.36 63.18L61.72 63.18C71.29 63.18 77.1 57.52 77.1 47.95L77.1 15.23C77.1 5.66 71.29 0 61.72 0L22.36 0C13.28 0 6.93 5.66 6.93 15.23L6.93 47.95C6.93 57.52 12.74 63.18 22.36 63.18ZM23.54 56.59C17.53 56.59 13.96 53.47 13.96 46.97L13.96 16.21C13.96 9.72 17.53 6.59 23.54 6.59L60.55 6.59C66.5 6.59 70.07 9.72 70.07 16.21L70.07 46.97C70.07 53.47 66.5 56.59 60.55 56.59ZM76.17 20.41L76.17 28.71L94.34 13.57C94.53 13.38 94.68 13.33 94.92 13.33C95.21 13.33 95.31 13.57 95.31 13.92L95.31 49.27C95.31 49.61 95.21 49.85 94.92 49.85C94.68 49.85 94.53 49.76 94.34 49.61L76.17 34.47L76.17 42.77L91.11 55.62C92.68 56.93 94.48 57.81 96.09 57.81C99.71 57.81 102.1 55.18 102.1 51.42L102.1 11.77C102.1 8.01 99.71 5.37 96.09 5.37C94.48 5.37 92.68 6.25 91.11 7.57Z" fill="#007AFF"/>
                        </svg>
                      </div>
                    </div>
                    <div className="text-center -mt-0.5">
                      <span className="text-[11px] font-normal text-gray-900">Nest</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
                    <AnimatedList>
                      {DESKTOP_MESSAGES.filter((m) => desktopMessages.includes(m.id)).map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex w-full ${msg.type === 'user' ? 'justify-end' : 'justify-start gap-2 items-end'}`}
                        >
                          {msg.type === 'nest' && (
                            <img src="/nest-logo.png" alt="" className="h-7 w-7 rounded-xl object-cover shadow-sm mb-1 shrink-0" />
                          )}
                          <div
                            className={`relative max-w-[80%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm text-left ${
                              msg.type === 'user'
                                ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                                : 'bg-white border border-gray-100 text-gray-900 rounded-bl-[4px]'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {desktopTyping && (
                        <div key="typing">
                          <TypingIndicator />
                        </div>
                      )}
                    </AnimatedList>
                  </div>
                </div>
              </IPhoneMockup>
            </motion.div>
            </div>
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

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-[#FAFAFA]">
        <div className="mx-auto max-w-4xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-900 transition-colors">Terms</Link>
            <a href="mailto:nest.chat@icloud.com" className="hover:text-gray-900 transition-colors">Contact</a>
          </div>
          <span className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Nest</span>
        </div>
      </footer>
      </div>
    </motion.div>
  )
}
