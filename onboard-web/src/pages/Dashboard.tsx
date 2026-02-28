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

/* ── Showcase conversations for step 3 ── */
interface ShowcaseConversation {
  category: string
  userMessage: string
  nestMessage: string
}

const SHOWCASE: ShowcaseConversation[] = [
  {
    category: 'Travel',
    userMessage: 'When should I leave for the airport?',
    nestMessage: "Your flight's at 10pm. Leave by 6:30 — 45 min drive with Friday traffic.",
  },
  {
    category: 'Meetings',
    userMessage: 'Brief me on my 2pm with Tom Chen',
    nestMessage: "VP Product at Notion. You last emailed 3 weeks ago about an API integration.",
  },
  {
    category: 'Email',
    userMessage: 'Any important emails today?',
    nestMessage: '3 need attention: a contract from Sarah, a reschedule from James, and an invoice.',
  },
  {
    category: 'Weather',
    userMessage: 'Do I need an umbrella today?',
    nestMessage: "Nope — sunny and 24\u00b0 all day. Rain's not until Thursday.",
  },
  {
    category: 'Reminders',
    userMessage: 'Remind me to call mum at 5',
    nestMessage: "Done — I'll ping you at 5pm sharp.",
  },
  {
    category: 'Actions',
    userMessage: "Draft a reply to Tom's email",
    nestMessage: 'Sent: "Hi Tom, thanks for the update. I\'ll review and circle back by EOD."',
  },
]

type ShowcasePhase = 'user-in' | 'typing' | 'nest-in' | 'hold' | 'fade-out'

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
  const [showcaseIndex, setShowcaseIndex] = useState(0)
  const [showcasePhase, setShowcasePhase] = useState<ShowcasePhase>('user-in')

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

  /* ── Showcase animation cycle for step 3 ── */
  useEffect(() => {
    if (step !== 3) return
    let cancelled = false
    const timeouts: ReturnType<typeof setTimeout>[] = []

    function runCycle(index: number) {
      if (cancelled) return

      setShowcaseIndex(index)
      setShowcasePhase('user-in')

      timeouts.push(setTimeout(() => {
        if (!cancelled) setShowcasePhase('typing')
      }, 1200))

      timeouts.push(setTimeout(() => {
        if (!cancelled) setShowcasePhase('nest-in')
      }, 2800))

      timeouts.push(setTimeout(() => {
        if (!cancelled) setShowcasePhase('fade-out')
      }, 5600))

      timeouts.push(setTimeout(() => {
        if (!cancelled) runCycle((index + 1) % SHOWCASE.length)
      }, 6100))
    }

    runCycle(0)
    return () => {
      cancelled = true
      timeouts.forEach(clearTimeout)
    }
  }, [step])

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

          {/* ── STEP 3: ANIMATED SHOWCASE ── */}
          {step === 3 && (
            <motion.section
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex-1 flex flex-col items-center w-full max-w-sm"
            >
              {/* Heading + rotating category */}
              <div className="shrink-0 pt-4 pb-2 text-center">
                <motion.h1
                  className="text-[28px] font-bold tracking-tight text-gray-900"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  You're all set
                </motion.h1>
                <div className="h-6 mt-1.5 flex items-center justify-center overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={SHOWCASE[showcaseIndex].category}
                      className="text-[13px] font-medium tracking-widest uppercase text-[#007AFF]"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                      {SHOWCASE[showcaseIndex].category}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>

              {/* Chat showcase area */}
              <div className="flex-1 flex flex-col justify-center w-full gap-3 min-h-0">
                <AnimatePresence mode="wait">
                  {showcasePhase !== 'fade-out' && (
                    <motion.div
                      key={`convo-${showcaseIndex}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -8, transition: { duration: 0.3 } }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-3"
                    >
                      {/* User bubble */}
                      <motion.div
                        className="flex w-full justify-end"
                        initial={{ opacity: 0, y: 12, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="max-w-[85%] rounded-[20px] rounded-br-[4px] bg-[#007AFF] px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm">
                          {SHOWCASE[showcaseIndex].userMessage}
                        </div>
                      </motion.div>

                      {/* Typing indicator */}
                      <AnimatePresence>
                        {showcasePhase === 'typing' && (
                          <motion.div
                            key="typing"
                            className="flex items-end gap-2"
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-full object-cover shadow-sm" />
                            <div className="rounded-[20px] rounded-bl-[4px] bg-[#E9E9EB] px-5 py-3.5 shadow-sm">
                              <div className="flex gap-1.5 items-center">
                                {[0, 1, 2].map((i) => (
                                  <motion.div
                                    key={i}
                                    className="w-[7px] h-[7px] rounded-full bg-[#8E8E93]"
                                    animate={{ y: [0, -4, 0] }}
                                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                                  />
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Nest reply */}
                      <AnimatePresence>
                        {(showcasePhase === 'nest-in' || showcasePhase === 'hold') && (
                          <motion.div
                            className="flex items-end gap-2"
                            initial={{ opacity: 0, y: 12, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <img src="/nest-logo.png" alt="" className="h-6 w-6 rounded-full object-cover shadow-sm shrink-0" />
                            <div className="max-w-[85%] rounded-[20px] rounded-bl-[4px] bg-[#E9E9EB] px-4 py-2.5 text-[15px] leading-relaxed text-[#000000] shadow-sm">
                              {SHOWCASE[showcaseIndex].nestMessage}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Pinned CTA */}
              <div className="shrink-0 w-full pb-10">
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
