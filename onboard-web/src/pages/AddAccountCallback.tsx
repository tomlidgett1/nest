import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 }

type Status = 'loading' | 'success' | 'error'

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

        let newSession = null

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            if (error.message.includes('PKCE code verifier not found')) {
              setStatus('error')
              setErrorMessage('Account linking session expired. Please start again from the dashboard in the same browser tab.')
              return
            }
            setStatus('error')
            setErrorMessage(error.message)
            return
          }
          newSession = data.session
        }

        if (!newSession) {
          const { data } = await supabase.auth.getSession()
          newSession = data.session
        }

        if (!newSession?.provider_token) {
          setStatus('error')
          setErrorMessage('Could not get Google account tokens. Please try again.')
          return
        }

        if (cancelled) return

        const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts/add-callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            original_user_id: originalUserId,
            provider_token: newSession.provider_token,
            provider_refresh_token: newSession.provider_refresh_token ?? '',
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
      className="page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="content">
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
                Linking account...
              </motion.h1>
              <motion.p
                className="subtitle"
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
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <AnimatedCheck />
              <motion.h1
                className="title success-text"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.3 }}
              >
                Account linked
              </motion.h1>
              <motion.p
                className="subtitle"
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
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <h1 className="title error-text">Something went wrong</h1>
              {errorMessage && <p className="error-detail">{errorMessage}</p>}
              <div style={{ marginTop: 32, width: '100%' }}>
                <motion.button
                  className="button"
                  onClick={() => navigate('/dashboard', { replace: true })}
                  whileTap={{ scale: 0.97 }}
                >
                  Back to Dashboard
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
