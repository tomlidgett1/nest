import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowLeft, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type Phase = 'warning' | 'confirm' | 'deleting' | 'success' | 'error'

/* ── Apple-style iOS spinner ── */
function AppleSpinner({ size = 40 }: { size?: number }) {
  const bars = 12
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {Array.from({ length: bars }).map((_, i) => {
        const angle = (360 / bars) * i
        const delay = -(1 - i / bars)
        return (
          <div
            key={i}
            className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 origin-bottom"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <div
              className="h-[28%] w-full rounded-full bg-gray-900"
              style={{
                animation: `spinFade 1s linear ${delay}s infinite`,
              }}
            />
          </div>
        )
      })}
      <style>{`
        @keyframes spinFade {
          0% { opacity: 1; }
          100% { opacity: 0.15; }
        }
      `}</style>
    </div>
  )
}

/* ── Animated checkmark ── */
function AnimatedCheck() {
  return (
    <motion.div
      className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-900"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.1 }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
        <motion.path
          d="M20 6L9 17L4 12"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  )
}

const DELETION_ITEMS = [
  'All connected Google accounts and permissions',
  'All emails, calendar data, and contacts synced with Nest',
  'All meeting notes, summaries, and transcripts',
  'All conversations and message history',
  'All reminders, todos, and preferences',
]

export default function DeleteAccount() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('warning')
  const [userEmail, setUserEmail] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [confirmInput, setConfirmInput] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const emailMatches = confirmInput.toLowerCase().trim() === userEmail.toLowerCase().trim()

  /* ── Auth guard ── */
  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        navigate('/', { replace: true })
        return
      }
      setUserEmail(data.session.user.email ?? '')
      setAccessToken(data.session.access_token)
    }
    void checkAuth()
  }, [navigate])

  /* ── Auto-redirect after success ── */
  useEffect(() => {
    if (phase !== 'success') return
    const timer = setTimeout(async () => {
      await supabase.auth.signOut()
      navigate('/', { replace: true })
    }, 3000)
    return () => clearTimeout(timer)
  }, [phase, navigate])

  /* ── Delete handler ── */
  async function handleDelete() {
    setPhase('deleting')

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirmation: confirmInput.trim() }),
      })

      if (res.ok) {
        setPhase('success')
      } else {
        const body = await res.json().catch(() => ({}))
        setErrorMessage(
          (body as { detail?: string; error?: string }).detail ??
            (body as { error?: string }).error ??
            'Something went wrong. Please try again.',
        )
        setPhase('error')
      }
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.')
      setPhase('error')
    }
  }

  return (
    <motion.div
      className="h-[100dvh] flex flex-col bg-[#FAFAFA]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* ── Header ── */}
      <header className="shrink-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-5 py-2.5 flex items-center">
          {(phase === 'warning' || phase === 'confirm') && (
            <button
              onClick={() => {
                if (phase === 'confirm') {
                  setPhase('warning')
                  setConfirmInput('')
                } else {
                  navigate('/dashboard')
                }
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex items-center justify-center px-6">
        <AnimatePresence mode="wait">

          {/* ── WARNING STEP ── */}
          {phase === 'warning' && (
            <motion.div
              key="warning"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-sm flex flex-col items-center"
            >
              <motion.div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <AlertTriangle className="h-7 w-7 text-red-500" strokeWidth={1.8} />
              </motion.div>

              <h1 className="text-[28px] font-bold tracking-tight text-gray-900 text-center">
                Delete your account
              </h1>
              <p className="text-[15px] text-gray-400 mt-1.5 text-center max-w-[300px]">
                This will permanently remove the following data:
              </p>

              <div className="w-full mt-6 space-y-0">
                {DELETION_ITEMS.map((item, i) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.15 + i * 0.06 }}
                    className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0"
                  >
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                    <span className="text-[14px] text-gray-600 leading-snug">{item}</span>
                  </motion.div>
                ))}
              </div>

              <motion.p
                className="text-[13px] text-gray-400 mt-5 text-center max-w-[300px] leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                This action is permanent and cannot be undone. Account data may take up to 24 hours to be fully removed from all systems.
              </motion.p>

              <motion.button
                onClick={() => setPhase('confirm')}
                className="w-full mt-8 rounded-full bg-red-500 py-3.5 text-[15px] font-semibold text-white hover:bg-red-600 transition-colors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                Continue
              </motion.button>
            </motion.div>
          )}

          {/* ── CONFIRM STEP ── */}
          {phase === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full max-w-sm flex flex-col items-center"
            >
              <h1 className="text-[28px] font-bold tracking-tight text-gray-900 text-center">
                Confirm your identity
              </h1>
              <p className="text-[15px] text-gray-400 mt-1.5 text-center max-w-[300px]">
                Type your email address to confirm deletion.
              </p>

              <motion.div
                className="mt-6 rounded-xl bg-gray-100 px-4 py-2.5 w-full text-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <span className="text-[14px] font-medium text-gray-500 select-all">{userEmail}</span>
              </motion.div>

              <motion.input
                type="email"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Enter your email address"
                className="w-full mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-all"
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              />

              {confirmInput.length > 0 && !emailMatches && (
                <motion.p
                  className="text-[13px] text-red-400 mt-2 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  Email doesn't match
                </motion.p>
              )}

              <motion.button
                onClick={() => void handleDelete()}
                disabled={!emailMatches}
                className={`w-full mt-6 rounded-full py-3.5 text-[15px] font-semibold transition-all duration-200 ${
                  emailMatches
                    ? 'bg-red-500 text-white hover:bg-red-600 cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                Delete my account
              </motion.button>
            </motion.div>
          )}

          {/* ── DELETING STEP ── */}
          {phase === 'deleting' && (
            <motion.div
              key="deleting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <AppleSpinner size={44} />
              <motion.p
                className="text-[15px] text-gray-400 mt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Deleting your account...
              </motion.p>
            </motion.div>
          )}

          {/* ── SUCCESS STEP ── */}
          {phase === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <AnimatedCheck />
              <motion.h1
                className="text-[28px] font-bold tracking-tight text-gray-900"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Account deleted
              </motion.h1>
              <motion.p
                className="text-[15px] text-gray-400 mt-2 text-center max-w-[280px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                Your account and all associated data have been permanently removed.
              </motion.p>
            </motion.div>
          )}

          {/* ── ERROR STEP ── */}
          {phase === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex flex-col items-center"
            >
              <motion.div
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <XCircle className="h-7 w-7 text-red-500" strokeWidth={1.8} />
              </motion.div>
              <h1 className="text-[28px] font-bold tracking-tight text-gray-900 text-center">
                Something went wrong
              </h1>
              <p className="text-[15px] text-gray-400 mt-2 text-center max-w-[280px]">
                {errorMessage}
              </p>
              <button
                onClick={() => {
                  setPhase('confirm')
                  setErrorMessage('')
                }}
                className="mt-8 rounded-full bg-gray-900 px-8 py-3.5 text-[15px] font-semibold text-white hover:bg-black transition-colors"
              >
                Try again
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </motion.div>
  )
}
