import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type Status = 'loading' | 'success' | 'error'

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

export default function AddAccountCallback() {
  const navigate = useNavigate()
  const hasProcessed = useRef(false)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (hasProcessed.current) return
    hasProcessed.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    let cancelled = false

    async function linkAccount() {
      try {
        const originalUserId = sessionStorage.getItem('nest_original_user_id')
        const originalRefreshToken = sessionStorage.getItem('nest_original_refresh_token')

        if (!originalUserId || !originalRefreshToken) {
          setStatus('error')
          setErrorMessage('Session expired. Please go back to the dashboard and try again.')
          return
        }

        let providerToken = ''
        let providerRefreshToken = ''

        // Implicit flow: tokens arrive in URL hash
        if (window.location.hash) {
          const hashParams = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))
          const at = hashParams.access_token
          const rt = hashParams.refresh_token
          providerToken = hashParams.provider_token ?? ''
          providerRefreshToken = hashParams.provider_refresh_token ?? ''

          console.log('[add-account] Hash flow: provider_token=', providerToken ? 'present' : 'MISSING', 'provider_refresh_token=', providerRefreshToken ? 'present' : 'MISSING')
          console.log('[add-account] Hash keys:', Object.keys(hashParams).join(', '))

          if (at && rt) {
            await supabase.auth.setSession({ access_token: at, refresh_token: rt })
          }
        }

        // PKCE fallback: code in query params
        if (!providerToken && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            setStatus('error')
            setErrorMessage(error.message)
            return
          }
          providerToken = data.session?.provider_token ?? ''
          providerRefreshToken = data.session?.provider_refresh_token ?? ''
          console.log('[add-account] PKCE flow: provider_token=', providerToken ? 'present' : 'MISSING', 'provider_refresh_token=', providerRefreshToken ? 'present' : 'MISSING')
        }

        // Last resort: check current session
        if (!providerToken) {
          const { data } = await supabase.auth.getSession()
          providerToken = data.session?.provider_token ?? ''
          providerRefreshToken = data.session?.provider_refresh_token ?? ''
          console.log('[add-account] Session fallback: provider_token=', providerToken ? 'present' : 'MISSING', 'provider_refresh_token=', providerRefreshToken ? 'present' : 'MISSING')
        }

        console.log('[add-account] Final tokens: provider_token=', providerToken ? `present (${providerToken.length}c)` : 'MISSING', 'provider_refresh_token=', providerRefreshToken ? `present (${providerRefreshToken.length}c)` : 'MISSING')

        if (!providerToken) {
          setStatus('error')
          setErrorMessage('Could not get account tokens. Please try again.')
          return
        }

        if (cancelled) return

        // Detect provider from the session that was just established
        const { data: sessionData } = await supabase.auth.getSession()
        const authProvider = sessionData.session?.user?.app_metadata?.provider ?? 'google'
        const isMicrosoft = authProvider === 'azure'
        const callbackPath = isMicrosoft ? 'add-microsoft-callback' : 'add-callback'

        const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts/${callbackPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            original_user_id: originalUserId,
            provider_token: providerToken,
            provider_refresh_token: providerRefreshToken,
          }),
        })

        if (cancelled) return

        const data = await res.json()

        if (!data.success) {
          if (data.error === 'email_conflict') {
            setStatus('error')
            setErrorMessage(data.detail ?? 'This account is already linked to a different Nest user.')
          } else if (data.error === 'no_refresh_token') {
            setStatus('error')
            setErrorMessage(data.hint ?? 'Provider did not issue a refresh token. Please revoke Nest access and try again.')
          } else {
            setStatus('error')
            setErrorMessage(data.error ?? 'Failed to link account.')
          }

          if (originalRefreshToken) {
            await supabase.auth.refreshSession({ refresh_token: originalRefreshToken })
          }
          sessionStorage.removeItem('nest_original_user_id')
          sessionStorage.removeItem('nest_original_refresh_token')
          return
        }

        sessionStorage.removeItem('nest_original_user_id')
        sessionStorage.removeItem('nest_original_refresh_token')

        await supabase.auth.refreshSession({ refresh_token: originalRefreshToken })

        setStatus('success')
        setTimeout(() => {
          if (!cancelled) navigate('/dashboard', { replace: true })
        }, 1200)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Network error. Please try again.')
      }
    }

    linkAccount()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <motion.div
      className="h-[100dvh] flex items-center justify-center bg-[#FAFAFA] font-sans"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full max-w-sm px-6 text-center">
        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center"
            >
              <div className="mb-8">
                <AppleSpinner size={44} />
              </div>
              <motion.h1
                className="text-[28px] font-bold tracking-tight text-gray-900 mb-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                Linking account
              </motion.h1>
              <motion.p
                className="text-[15px] text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                Connecting your additional account.
              </motion.p>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <AnimatedCheck />
              <motion.h1
                className="text-[28px] font-bold tracking-tight text-gray-900 mb-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
              >
                Account linked
              </motion.h1>
              <motion.p
                className="text-[15px] text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                Redirecting back...
              </motion.p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center"
            >
              <h1 className="text-[28px] font-bold tracking-tight text-red-600 mb-4">Something went wrong</h1>
              {errorMessage && (
                <p className="text-sm text-gray-600 bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm mb-8 w-full">
                  {errorMessage}
                </p>
              )}
              <button
                className="w-full rounded-full bg-gray-900 py-3.5 text-[15px] font-semibold text-white hover:bg-black transition-colors"
                onClick={() => navigate('/dashboard', { replace: true })}
              >
                Back to Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
