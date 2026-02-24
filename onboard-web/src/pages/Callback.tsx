import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ONBOARD_URL = import.meta.env.VITE_ONBOARD_FUNCTION_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type Status = 'loading' | 'success' | 'error' | 'email_conflict'

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
      className="mb-5 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50"
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

export default function Callback() {
  const navigate = useNavigate()
  const hasProcessed = useRef(false)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [conflictHint, setConflictHint] = useState('')

  useEffect(() => {
    if (hasProcessed.current) return
    hasProcessed.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const imessageToken = params.get('token') || sessionStorage.getItem('nest_imessage_token') || ''

    let cancelled = false

    async function onboard() {
      try {
        let session: Session | null = null
        let providerToken = ''
        let providerRefreshToken = ''

        if (window.location.hash) {
          const hashParams = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))
          const at = hashParams.access_token
          const rt = hashParams.refresh_token
          providerToken = hashParams.provider_token ?? ''
          providerRefreshToken = hashParams.provider_refresh_token ?? ''
          if (at && rt) {
            const { data, error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
            if (!error) session = data.session
          }
        }

        if (!session && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            if (error.message.includes('PKCE code verifier not found')) {
              setStatus('error')
              setErrorMessage('Sign-in session expired. Please restart sign in from the Nest home page in the same browser tab.')
              return
            }
            setStatus('error')
            setErrorMessage(error.message)
            return
          }
          session = data.session
          providerToken = session?.provider_token ?? providerToken
          providerRefreshToken = session?.provider_refresh_token ?? providerRefreshToken
        }

        if (!session) {
          const { data } = await supabase.auth.getSession()
          session = data.session
        }

        if (!session) {
          if (!code && !window.location.hash) {
            navigate('/', { replace: true })
            return
          }
          setStatus('error')
          setErrorMessage('Could not establish a session. Please try again.')
          return
        }

        if (cancelled) return

        const finalProviderToken = providerToken || session.provider_token || ''
        const finalProviderRefreshToken = providerRefreshToken || session.provider_refresh_token || ''

        const res = await fetch(ONBOARD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${String(session.access_token).trim()}`,
          },
          body: JSON.stringify({
            token: imessageToken || undefined,
            access_token: session.access_token,
            provider_token: finalProviderToken,
            provider_refresh_token: finalProviderRefreshToken,
          }),
        })

        if (cancelled) return

        let data: any = {}
        try {
          data = await res.json()
        } catch {
          data = {}
        }

        if (!res.ok) {
          const detail = typeof data.detail === 'string' ? data.detail : undefined
          const error = typeof data.error === 'string' ? data.error : undefined
          const message = typeof data.message === 'string' ? data.message : undefined
          setStatus('error')
          setErrorMessage(detail ?? error ?? message ?? `Onboarding failed (${res.status}). Please try again.`)
          return
        }

        if (data.success) {
          sessionStorage.removeItem('nest_imessage_token')
          setStatus('success')
          setTimeout(() => {
            if (!cancelled) navigate('/dashboard', { replace: true })
          }, 2000)
        } else if (data.error === 'email_conflict') {
          await supabase.auth.signOut()
          setStatus('email_conflict')
          setErrorMessage(data.detail ?? 'This Google account is already linked to another Nest account.')
          setConflictHint(data.hint ?? '')
        } else {
          setStatus('error')
          setErrorMessage(data.detail ?? data.error ?? 'An unexpected error occurred.')
        }
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Network error. Please try again.')
      }
    }

    void onboard()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <motion.div 
      className="min-h-screen flex items-center justify-center bg-[#FAFAFA] px-6 font-sans selection:bg-gray-200" 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }}
    >
      <div className="w-full max-w-md rounded-3xl border border-gray-200/60 bg-white p-8 md:p-10 shadow-sm text-center">
        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingDots />
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-2">Setting things up</h1>
              <p className="text-gray-500">Connecting your Google account to Nest.</p>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AnimatedCheck />
              <h1 className="text-2xl font-bold tracking-tight text-green-700 mb-2">You are all set</h1>
              <p className="text-gray-500">Taking you to your dashboard.</p>
            </motion.div>
          )}

          {status === 'email_conflict' && (
            <motion.div key="conflict" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-4">Account already exists</h1>
              <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6">
                <p className="mb-2">{errorMessage}</p>
                {conflictHint && <p className="text-gray-500">{conflictHint}</p>}
              </div>
              <button
                className="w-full rounded-full bg-gray-900 px-6 py-3.5 text-base font-medium text-white shadow-sm hover:bg-black transition-colors"
                onClick={() => navigate('/', { replace: true })}
              >
                Try again
              </button>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold tracking-tight text-red-600 mb-4">Something went wrong</h1>
              {errorMessage && <p className="text-sm text-gray-600 bg-red-50 p-4 rounded-xl border border-red-100 mb-6 w-full">{errorMessage}</p>}
              <button
                className="w-full rounded-full bg-gray-900 px-6 py-3.5 text-base font-medium text-white shadow-sm hover:bg-black transition-colors"
                onClick={() => navigate('/', { replace: true })}
              >
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
