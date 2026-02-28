import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

type Status = 'loading' | 'success' | 'error'

function LoadingDots() {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2.5 w-2.5 rounded-full bg-gray-400"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function AnimatedCheck() {
  return (
    <motion.div
      className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-50"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <motion.path
          d="M20 6L9 17L4 12"
          stroke="#16a34a"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
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

          if (at && rt) {
            // Temporarily set session to extract tokens
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
        }

        // Last resort: check current session
        if (!providerToken) {
          const { data } = await supabase.auth.getSession()
          providerToken = data.session?.provider_token ?? ''
          providerRefreshToken = data.session?.provider_refresh_token ?? ''
        }

        if (!providerToken) {
          setStatus('error')
          setErrorMessage('Could not get Google account tokens. Please try again.')
          return
        }

        if (cancelled) return

        const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts/add-callback`, {
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
            setErrorMessage(data.detail ?? 'This Google account is already linked to a different Nest user.')
          } else if (data.error === 'no_refresh_token') {
            setStatus('error')
            setErrorMessage('Google did not provide a refresh token. Revoke Nest access at myaccount.google.com and try again.')
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
      className="min-h-screen flex items-center justify-center bg-[#FAFAFA] font-sans selection:bg-gray-200"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full max-w-sm px-6 text-center">
        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center"
            >
              <LoadingDots />
              <motion.h1
                className="text-2xl font-bold tracking-tight text-gray-900 mb-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.1 }}
              >
                Linking account...
              </motion.h1>
              <motion.p
                className="text-gray-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...spring, delay: 0.2 }}
              >
                Connecting your additional Google account.
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
                className="text-2xl font-bold tracking-tight text-green-700 mb-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.3 }}
              >
                Account linked
              </motion.h1>
              <motion.p
                className="text-gray-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...spring, delay: 0.4 }}
              >
                Redirecting back...
              </motion.p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              className="flex flex-col items-center"
            >
              <h1 className="text-2xl font-bold tracking-tight text-red-600 mb-4">Something went wrong</h1>
              {errorMessage && <p className="text-sm text-gray-600 bg-red-50 p-4 rounded-xl border border-red-100 mb-8 w-full">{errorMessage}</p>}
              <motion.button
                className="flex w-full items-center justify-center rounded-full bg-gray-900 px-6 py-3.5 text-base font-medium text-white shadow-sm hover:bg-black transition-colors"
                onClick={() => navigate('/dashboard', { replace: true })}
                whileTap={{ scale: 0.97 }}
              >
                Back to Dashboard
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
