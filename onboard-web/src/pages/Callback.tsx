import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

const ONBOARD_URL = import.meta.env.VITE_ONBOARD_FUNCTION_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

type Status = 'loading' | 'success' | 'error' | 'email_conflict'

function LoadingDots() {
  return (
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
  )
}

function AnimatedCheck() {
  return (
    <motion.div
      className="checkmark-circle"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <motion.path
          d="M20 6L9 17L4 12"
          stroke="#4A6340"
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
          const hashParams = Object.fromEntries(
            new URLSearchParams(window.location.hash.slice(1))
          )
          const at = hashParams['access_token']
          const rt = hashParams['refresh_token']
          providerToken = hashParams['provider_token'] ?? ''
          providerRefreshToken = hashParams['provider_refresh_token'] ?? ''
          if (at && rt) {
            const { data, error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
            if (!error) session = data.session
          }
        }

        if (!session) {
          if (code) {
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
        }

        if (!session) {
          const { data } = await supabase.auth.getSession()
          session = data.session
        }

        if (!session) {
          // Direct visits to /callback (without OAuth params) are expected; send users back to start.
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
          setErrorMessage(
            detail ??
            error ??
            message ??
            `Onboarding failed (${res.status}). Please try again.`
          )
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

    onboard()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <motion.div
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <main className="content">
        <AnimatePresence mode="wait">
          {status === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <LoadingDots />
              <motion.h1
                className="title"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.1 }}
              >
                Setting things up...
              </motion.h1>
              <motion.p
                className="subtitle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...spring, delay: 0.2 }}
              >
                Verifying you're human...
              </motion.p>
            </motion.div>
          )}

          {status === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <AnimatedCheck />
              <motion.h1
                className="title success-text"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.3 }}
              >
                You're all set
              </motion.h1>
              <motion.p
                className="subtitle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...spring, delay: 0.4 }}
              >
                Taking you to your dashboard...
              </motion.p>
            </motion.div>
          )}

          {status === 'email_conflict' && (
            <motion.div
              key="conflict"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <h1 className="title error-text">Account already exists</h1>
              <p className="error-detail">{errorMessage}</p>
              {conflictHint && <p className="subtitle" style={{ marginTop: 8 }}>{conflictHint}</p>}
              <div style={{ marginTop: 32, width: '100%' }}>
                <motion.button
                  className="button"
                  onClick={() => navigate('/', { replace: true })}
                  whileTap={{ scale: 0.97 }}
                >
                  Try Again
                </motion.button>
              </div>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <h1 className="title error-text">Something went wrong</h1>
              {errorMessage && <p className="error-detail">{errorMessage}</p>}
              <div style={{ marginTop: 32, width: '100%' }}>
                <motion.button
                  className="button"
                  onClick={() => navigate('/', { replace: true })}
                  whileTap={{ scale: 0.97 }}
                >
                  Try Again
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </motion.div>
  )
}
