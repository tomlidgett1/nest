import { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronLeft, Plus, LogOut, ShieldAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
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

interface GoogleAccount {
  id: string
  google_email: string
  google_name: string | null
  google_avatar_url: string | null
  is_primary: boolean
}

/* ── Category conversations for step 3 pill showcase ── */
interface CatMessage {
  type: 'user' | 'nest'
  text: string
}

interface Category {
  label: string
  emoji: string
  messages: CatMessage[]
}

const CATEGORIES: Category[] = [
  {
    label: 'Travel',
    emoji: '\u2708\uFE0F',
    messages: [
      { type: 'user', text: 'When should I leave for the airport?' },
      { type: 'nest', text: "Your flight's at 10pm. 45 min drive with traffic — leave by 6:30 to be safe." },
      { type: 'user', text: 'Book me an Uber for 6:15' },
      { type: 'nest', text: "Done — UberX booked for 6:15pm to Sydney Airport. Driver arrives in 8 min." },
    ],
  },
  {
    label: 'Meetings',
    emoji: '\uD83D\uDC65',
    messages: [
      { type: 'user', text: "Who's Tom Chen? I have a call with him at 2" },
      { type: 'nest', text: "VP Product at Notion. You last spoke 3 weeks ago about an API integration. He's based in SF." },
      { type: 'user', text: 'What should I prep?' },
      { type: 'nest', text: "Review the API proposal he sent March 12. He also mentioned pricing concerns — might come up." },
    ],
  },
  {
    label: 'Email',
    emoji: '\uD83D\uDCE7',
    messages: [
      { type: 'user', text: 'Any important emails today?' },
      { type: 'nest', text: '3 need attention: a contract from Sarah, a reschedule from James, and your flight confirmation.' },
      { type: 'user', text: 'Reply to Sarah saying I\'ll review tonight' },
      { type: 'nest', text: "Sent: \"Hi Sarah, I'll review the contract this evening and get back to you. Thanks!\"" },
    ],
  },
  {
    label: 'Knowledge',
    emoji: '\uD83E\uDDE0',
    messages: [
      { type: 'user', text: "What's the meaning behind Kafka's Metamorphosis?" },
      { type: 'nest', text: "It's widely read as an allegory for alienation — the crushing weight of modern work and family obligation." },
      { type: 'user', text: 'How does that connect to existentialism?' },
      { type: 'nest', text: "Kafka predates Sartre, but both explore the absurdity of existence. Gregor's transformation is meaningless — that's the point." },
    ],
  },
  {
    label: 'Notes',
    emoji: '\uD83D\uDCDD',
    messages: [
      { type: 'user', text: 'Summarise my meeting notes from today' },
      { type: 'nest', text: "Covered Q2 roadmap, agreed on May 15 launch. Tom's handling the press release, you own the demo." },
      { type: 'user', text: 'Send the summary to the team' },
      { type: 'nest', text: "Sent to #product-team on Slack with action items and owners." },
    ],
  },
  {
    label: 'Weather',
    emoji: '\u2600\uFE0F',
    messages: [
      { type: 'user', text: 'Do I need an umbrella today?' },
      { type: 'nest', text: "Nope — sunny and 24\u00b0 all day. Rain's not until Thursday." },
      { type: 'user', text: "What about this weekend?" },
      { type: 'nest', text: "Saturday looks perfect — 22\u00b0 and clear. Sunday has light showers in the afternoon." },
    ],
  },
  {
    label: 'Reminders',
    emoji: '\u23F0',
    messages: [
      { type: 'user', text: 'Remind me to call mum at 5' },
      { type: 'nest', text: "Done — I'll ping you at 5pm sharp." },
      { type: 'user', text: 'Also remind me to buy flowers on the way home' },
      { type: 'nest', text: "Set. I'll remind you when you leave the office. There's a florist 2 min from your route." },
    ],
  },
  {
    label: 'Actions',
    emoji: '\u26A1',
    messages: [
      { type: 'user', text: 'Send Sarah a birthday message' },
      { type: 'nest', text: "Sent! \"Happy birthday Sarah! Hope you have an amazing day. Let's catch up soon!\"" },
      { type: 'user', text: "What's a good restaurant near the office for dinner?" },
      { type: 'nest', text: "Luca's Trattoria — 4 min walk, 4.7\u2605, great pasta. Want me to book a table?" },
    ],
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [activeCat, setActiveCat] = useState(0)
  const [visibleCount, setVisibleCount] = useState(0)
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    async function init() {
      let session = (await supabase.auth.refreshSession()).data.session
      if (!session) {
        session = (await supabase.auth.getSession()).data.session
      }
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
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /* ── Stagger messages in when category changes ── */
  useEffect(() => {
    if (step !== 3) return
    const msgs = CATEGORIES[activeCat].messages
    let cancelled = false
    const timeouts: ReturnType<typeof setTimeout>[] = []

    setVisibleCount(0)
    setIsTyping(false)

    // Stagger: for each message, show typing (if nest), then reveal
    let delay = 300
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      if (msg.type === 'nest') {
        // Show typing indicator before nest messages
        timeouts.push(setTimeout(() => { if (!cancelled) setIsTyping(true) }, delay))
        delay += 1000
        timeouts.push(setTimeout(() => {
          if (!cancelled) { setIsTyping(false); setVisibleCount(i + 1) }
        }, delay))
        delay += 400
      } else {
        timeouts.push(setTimeout(() => {
          if (!cancelled) setVisibleCount(i + 1)
        }, delay))
        delay += 600
      }
    }

    return () => { cancelled = true; timeouts.forEach(clearTimeout) }
  }, [step, activeCat])

  async function fetchAccounts(token?: string) {
    const accessToken = token ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!accessToken) return
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      })
      if (res.status === 401) {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          const retry = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
          })
          const retryData = await retry.json()
          if (retryData.accounts) setAccounts(retryData.accounts)
        }
        return
      }
      const data = await res.json()
      if (data.accounts) setAccounts(data.accounts)
    } catch {
      // Silently fail
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
        queryParams: { access_type: 'offline', prompt: 'consent' },
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
          apikey: SUPABASE_ANON_KEY,
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

  const firstName = displayName.split(' ')[0] || 'there'
  const primaryAccount = accounts.find((a) => a.is_primary)
  const primaryAvatar = primaryAccount?.google_avatar_url ?? avatarUrl

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#FAFAFA]">
        <div className="flex flex-col items-center">
          <div className="relative mb-6" style={{ width: 44, height: 44 }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (360 / 12) * i
              const delay = -(1 - i / 12)
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 origin-bottom"
                  style={{ transform: `rotate(${angle}deg)` }}
                >
                  <div
                    className="h-[28%] w-full rounded-full bg-gray-900"
                    style={{ animation: `spinFade 1s linear ${delay}s infinite` }}
                  />
                </div>
              )
            })}
            <style>{`@keyframes spinFade { 0% { opacity: 1; } 100% { opacity: 0.15; } }`}</style>
          </div>
        </div>
      </div>
    )
  }

  /* ── Main layout ── */
  return (
    <motion.div
      className="h-[100dvh] flex flex-col overflow-hidden bg-[#FAFAFA] font-sans"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* ── Header ── */}
      <header className="shrink-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/nest-logo.png" alt="Nest" className="h-8 w-8 rounded-[10px] shadow-sm" />
            <span className="text-lg font-semibold tracking-tight text-gray-900">Nest</span>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-gray-200/80 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm hover:shadow transition-all"
            >
              {primaryAvatar ? (
                <img src={primaryAvatar} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform duration-300 mr-0.5 ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl"
                >
                  <div className="px-3 py-2 mb-1.5 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{primaryAccount?.google_email}</p>
                  </div>
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => { setDropdownOpen(false); void handleAddAccount() }}
                  >
                    <Plus className="h-4 w-4" /> Add account
                  </button>
                  <Link
                    to="/privacy"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <ShieldAlert className="h-4 w-4" /> Privacy & Terms
                  </Link>
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors mt-0.5"
                    onClick={async () => { setDropdownOpen(false); await supabase.auth.signOut(); navigate('/', { replace: true }) }}
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* ── Progress dots with back arrow ── */}
      <div className="shrink-0 flex items-center justify-center py-3 relative">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="absolute left-5 flex items-center justify-center h-8 w-8 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-gray-400" />
          </button>
        )}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="h-[7px] rounded-full bg-gray-900"
              animate={{ width: step === i ? 24 : 7, opacity: step === i ? 1 : 0.15 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          ))}
        </div>
      </div>

      {/* ── Content area ── */}
      <main className="flex-1 min-h-0 flex flex-col items-center px-6">
        <AnimatePresence mode="wait">

          {/* ── STEP 1: ACCOUNTS ── */}
          {step === 1 && (
            <motion.section
              key="accounts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex-1 flex flex-col items-center w-full max-w-sm"
            >
              {/* Centered content */}
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                <h1 className="text-[32px] sm:text-4xl font-bold tracking-tight text-gray-900 text-center">
                  Welcome, {firstName}
                </h1>
                <p className="text-[15px] text-gray-400 mt-1.5 text-center">Your connected accounts</p>

                <div className="w-full mt-8 rounded-2xl bg-white border border-gray-200/60 shadow-sm divide-y divide-gray-100 overflow-hidden">
                  {accounts.map((account) => (
                    <div key={account.id} className="flex items-center gap-3 px-4 py-3.5">
                      {account.google_avatar_url ? (
                        <img
                          src={account.google_avatar_url}
                          alt=""
                          className="h-10 w-10 rounded-full shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
                          {(account.google_name || account.google_email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-gray-900 truncate">
                          {account.google_name || account.google_email}
                        </p>
                        <p className="text-[13px] text-gray-400 truncate">{account.google_email}</p>
                      </div>
                      {!account.is_primary && (
                        <button
                          onClick={() => void handleRemoveAccount(account.id)}
                          disabled={removing === account.id}
                          className="shrink-0 text-[13px] text-gray-400 hover:text-red-500 transition-colors"
                        >
                          {removing === account.id ? 'Removing...' : 'Remove'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => void handleAddAccount()}
                  className="text-[14px] text-[#007AFF] mt-3"
                >
                  Add another account
                </button>
              </div>

              {/* Pinned CTA */}
              <div className="shrink-0 w-full pb-10">
                <button
                  onClick={() => setStep(2)}
                  className="w-full rounded-full bg-gray-900 py-3.5 text-[15px] font-semibold text-white hover:bg-black transition-colors"
                >
                  Continue
                </button>
              </div>
            </motion.section>
          )}

          {/* ── STEP 2: CONTACTS ── */}
          {step === 2 && (
            <motion.section
              key="contacts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex-1 flex flex-col items-center w-full max-w-sm"
            >
              {/* Centered content */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <motion.img
                  src="/nest-logo.png"
                  alt=""
                  className="h-16 w-16 rounded-2xl shadow-md mb-6"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                />
                <h1 className="text-[32px] sm:text-4xl font-bold tracking-tight text-gray-900 text-center">
                  Save Nest to Contacts
                </h1>
                <p className="text-[15px] text-gray-400 mt-2 text-center max-w-[280px]">
                  So your messages show a name, not a number.
                </p>
              </div>

              {/* Pinned CTA */}
              <div className="shrink-0 w-full pb-10 space-y-3">
                <a
                  href="/nest.vcf"
                  onClick={() => setTimeout(() => setStep(3), 800)}
                  className="block w-full rounded-full bg-gray-900 py-3.5 text-center text-[15px] font-semibold text-white hover:bg-black transition-colors"
                >
                  Add to Contacts
                </a>
                <button
                  onClick={() => setStep(3)}
                  className="w-full text-[14px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Skip
                </button>
              </div>
            </motion.section>
          )}

          {/* ── STEP 3: PILL CAROUSEL + CONVERSATION ── */}
          {step === 3 && (
            <motion.section
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex-1 flex flex-col w-full max-w-sm"
            >
              {/* Heading */}
              <div className="shrink-0 pt-3 pb-2 text-center">
                <motion.h1
                  className="text-[26px] font-bold tracking-tight text-gray-900"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  You're all set
                </motion.h1>
                <motion.p
                  className="text-[14px] text-gray-400 mt-0.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  Tap to explore what Nest can do.
                </motion.p>
              </div>

              {/* Pill carousel */}
              <motion.div
                className="shrink-0 -mx-6 px-5 pb-3 pt-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
              >
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.label}
                      onClick={() => setActiveCat(i)}
                      className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                        activeCat === i
                          ? 'bg-gray-900 text-white shadow-sm'
                          : 'bg-white text-gray-600 border border-gray-200/80 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-[14px]">{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
              </motion.div>

              {/* Conversation area */}
              <div className="flex-1 min-h-0 w-full overflow-y-auto px-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeCat}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="flex flex-col gap-2.5 py-2"
                  >
                    {CATEGORIES[activeCat].messages.slice(0, visibleCount).map((msg, i) => (
                      <motion.div
                        key={`${activeCat}-${i}`}
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className={`flex w-full ${msg.type === 'user' ? 'justify-end' : 'items-end gap-2'}`}
                      >
                        {msg.type === 'nest' && (
                          <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-full object-cover shadow-sm shrink-0" />
                        )}
                        <div
                          className={`max-w-[82%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                            msg.type === 'user'
                              ? 'bg-[#007AFF] text-white rounded-br-[4px]'
                              : 'bg-[#E9E9EB] text-[#000000] rounded-bl-[4px]'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </motion.div>
                    ))}

                    {/* Typing indicator */}
                    {isTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-end gap-2"
                      >
                        <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-full object-cover shadow-sm shrink-0" />
                        <div className="rounded-[20px] rounded-bl-[4px] bg-[#E9E9EB] px-5 py-3.5 shadow-sm">
                          <div className="flex gap-1.5 items-center">
                            {[0, 1, 2].map((d) => (
                              <motion.div
                                key={d}
                                className="w-[7px] h-[7px] rounded-full bg-[#8E8E93]"
                                animate={{ y: [0, -4, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: d * 0.15, ease: 'easeInOut' }}
                              />
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Pinned CTA */}
              <div className="shrink-0 w-full pb-10 pt-3">
                <a
                  href="sms:tlidgett@icloud.com&body=Hey%20Nest!"
                  className="block w-full rounded-full bg-[#007AFF] py-3.5 text-center text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(0,122,255,0.3)] hover:bg-[#0071E3] transition-colors"
                >
                  Open iMessage
                </a>
              </div>
            </motion.section>
          )}

        </AnimatePresence>
      </main>
    </motion.div>
  )
}
