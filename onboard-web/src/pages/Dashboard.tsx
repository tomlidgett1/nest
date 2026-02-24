import { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Plus, LogOut, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
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

interface GoogleAccount {
  id: string
  google_email: string
  google_name: string | null
  google_avatar_url: string | null
  is_primary: boolean
}

const springSnappy = { type: 'spring' as const, stiffness: 500, damping: 35 }

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <img src="/nest-logo.png" alt="" className="h-7 w-7 rounded-[10px] object-cover shadow-sm" />
      <div className="flex h-10 items-center gap-1.5 rounded-2xl bg-gray-100 px-4">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-gray-400"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
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
  const [chatPhase, setChatPhase] = useState(0)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

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
    if (step !== 3) {
      setChatPhase(0)
      return
    }
    const timers = [
      setTimeout(() => setChatPhase(1), 500),
      setTimeout(() => setChatPhase(2), 1400),
      setTimeout(() => setChatPhase(3), 2600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [step])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      // Non-critical.
    }
  }

  async function handleAddAccount() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
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
    const {
      data: { session },
    } = await supabase.auth.getSession()
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
      // Silently fail.
    } finally {
      setRemoving(null)
    }
  }

  const firstName = displayName.split(' ')[0] || 'there'
  const primaryAccount = accounts.find((account) => account.is_primary)
  const primaryAvatar = primaryAccount?.google_avatar_url ?? avatarUrl

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA]">
        <div className="flex flex-col items-center">
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
          <h1 className="text-xl font-medium tracking-tight text-gray-900">Loading your setup...</h1>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="min-h-screen bg-[#FAFAFA] font-sans pb-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md border-b border-gray-200/50">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/nest-logo.png" alt="Nest" className="h-8 w-8 rounded-[10px] shadow-sm" />
            <span className="text-lg font-semibold tracking-tight text-gray-900">Nest Setup</span>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 shadow-sm hover:shadow transition-all"
            >
              {primaryAvatar ? (
                <img src={primaryAvatar} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform duration-300 mr-1 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl"
                >
                  <div className="px-3 py-2 mb-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 truncate">{primaryAccount?.google_email}</p>
                  </div>
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setDropdownOpen(false)
                      void handleAddAccount()
                    }}
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
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors mt-1"
                    onClick={async () => {
                      setDropdownOpen(false)
                      await supabase.auth.signOut()
                      navigate('/', { replace: true })
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-12 md:pt-20">
        {/* Progress Tracker */}
        <div className="mb-10 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 p-1">
            {[1, 2, 3].map((item) => (
              <button
                key={item}
                onClick={() => setStep(item)}
                className={`relative flex items-center justify-center px-5 py-2 text-sm font-medium transition-colors ${
                  step === item ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {step === item && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {item < step && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {item === 1 ? 'Accounts' : item === 2 ? 'Contacts' : 'Start Chat'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            {/* STEP 1: ACCOUNTS */}
            {step === 1 && (
              <motion.section
                key="step-1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-3xl border border-gray-200/60 bg-white p-8 md:p-10 shadow-sm"
              >
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">Welcome, {firstName}</h1>
                  <p className="text-gray-500">Review your connected Google accounts before continuing.</p>
                </div>

                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50/50 p-4 transition-all hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-4">
                        {account.google_avatar_url ? (
                          <img
                            src={account.google_avatar_url}
                            alt=""
                            className="h-10 w-10 rounded-full shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 shadow-sm">
                            {(account.google_name || account.google_email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{account.google_name || account.google_email}</p>
                          <p className="text-sm text-gray-500">{account.google_email}</p>
                        </div>
                      </div>

                      {account.is_primary ? (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                          Primary
                        </span>
                      ) : (
                        <button
                          onClick={() => void handleRemoveAccount(account.id)}
                          disabled={removing === account.id}
                          className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                        >
                          {removing === account.id ? 'Removing...' : 'Remove'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-gray-100">
                  <button
                    onClick={() => void handleAddAccount()}
                    className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add another account
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gray-900 px-8 py-2.5 text-sm font-medium text-white shadow-md hover:bg-black transition-colors"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.section>
            )}

            {/* STEP 2: CONTACTS */}
            {step === 2 && (
              <motion.section
                key="step-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-3xl border border-gray-200/60 bg-white p-8 md:p-10 shadow-sm"
              >
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100 shadow-sm">
                    <img src="/nest-logo.png" alt="" className="h-10 w-10 rounded-[10px]" />
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">Add to Contacts</h2>
                  <p className="text-gray-500 max-w-sm mx-auto">
                    Save Nest once so you can message naturally in iMessage without seeing a random phone number.
                  </p>
                </div>

                <div className="space-y-3 mb-10">
                  {[
                    'Tap Add to Contacts below.',
                    'Choose Create New Contact on the card.',
                    'Tap Done to save Nest.',
                  ].map((line, index) => (
                    <div
                      key={line}
                      className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50/50 p-4"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-gray-900 shadow-sm">
                        {index + 1}
                      </div>
                      <p className="text-gray-700">{line}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 border-t border-gray-100">
                  <button
                    onClick={() => setStep(3)}
                    className="flex w-full sm:w-auto items-center justify-center rounded-full bg-gray-100 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Skip for now
                  </button>
                  <a
                    href="/nest.vcf"
                    onClick={() => setTimeout(() => setStep(3), 800)}
                    className="flex w-full sm:w-auto items-center justify-center rounded-full bg-gray-900 px-8 py-3 text-sm font-medium text-white shadow-md hover:bg-black transition-colors"
                  >
                    Add to Contacts
                  </a>
                </div>
              </motion.section>
            )}

            {/* STEP 3: START CHATTING */}
            {step === 3 && (
              <motion.section
                key="step-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-3xl border border-gray-200/60 bg-white p-8 md:p-10 shadow-sm"
              >
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100 shadow-sm overflow-hidden">
                    <img src="/imessage-icon.png" alt="" className="h-10 w-10 object-cover" />
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">Say hi, {firstName}</h2>
                  <p className="text-gray-500 max-w-sm mx-auto">
                    Open iMessage and send your first message to start using Nest.
                  </p>
                </div>

                <div className="mb-8 overflow-hidden rounded-[24px] border border-gray-100 bg-[#F8F9FA] shadow-inner p-6 min-h-[220px] flex flex-col justify-end">
                  <div className="space-y-4">
                    {chatPhase >= 1 && (
                      <motion.div
                        className="flex justify-end"
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={springSnappy}
                      >
                        <div className="rounded-[20px] rounded-br-[4px] bg-[#007AFF] px-4 py-2.5 text-[15px] text-white shadow-sm">
                          Hey Nest!
                        </div>
                      </motion.div>
                    )}

                    {chatPhase === 2 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                      >
                        <TypingIndicator />
                      </motion.div>
                    )}

                    {chatPhase >= 3 && (
                      <motion.div
                        className="flex items-end gap-2"
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={springSnappy}
                      >
                        <img src="/nest-logo.png" alt="" className="h-7 w-7 rounded-[10px] object-cover shadow-sm" />
                        <div className="rounded-[20px] rounded-bl-[4px] border border-gray-100 bg-white px-4 py-2.5 text-[15px] text-gray-900 shadow-sm">
                          Hey {firstName}! I'm connected and ready to go. What can I help you with today?
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Compliance Text */}
                <div className="mb-8 rounded-2xl bg-gray-50 p-4 text-center text-xs text-gray-500">
                  <p className="mb-1">
                    By starting this chat, you agree to receive messages from Nest.
                  </p>
                  <p>
                    We will send important notifications related to your account status or transactions.
                    Send <strong>'Unsubscribe'</strong> to manage your message preferences.
                  </p>
                </div>

                <div className="flex justify-center">
                  <a
                    href="sms:tlidgett@icloud.com&body=Hey%20Nest!"
                    className="flex items-center justify-center gap-2 rounded-full bg-[#007AFF] px-10 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-colors"
                  >
                    Open iMessage
                  </a>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </motion.div>
  )
}
