import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ONBOARD_URL = import.meta.env.VITE_ONBOARD_FUNCTION_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

type Status = 'loading' | 'success' | 'error' | 'email_conflict'

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

/* ── Animated checkmark (clean Apple style) ── */
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
        console.log('[nest-debug] Callback started')
        console.log('[nest-debug] URL:', window.location.href)
        console.log('[nest-debug] hash:', window.location.hash ? 'present (' + window.location.hash.length + ' chars)' : 'empty')
        console.log('[nest-debug] code:', code ?? 'null')
        console.log('[nest-debug] imessageToken:', imessageToken ? 'present' : 'empty')

        let session: Session | null = null
        let providerToken = ''
        let providerRefreshToken = ''

        if (window.location.hash) {
          const hashParams = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)))
          const at = hashParams.access_token
          const rt = hashParams.refresh_token
          providerToken = hashParams.provider_token ?? ''
          providerRefreshToken = hashParams.provider_refresh_token ?? ''
          console.log('[nest-debug] Hash params: access_token=', at ? 'present' : 'missing', 'refresh_token=', rt ? 'present' : 'missing')
          console.log('[nest-debug] Hash params: provider_token=', providerToken ? 'present' : 'missing', 'provider_refresh_token=', providerRefreshToken ? 'present' : 'missing')
          console.log('[nest-debug] Hash keys:', Object.keys(hashParams).join(', '))
          if (at && rt) {
            console.log('[nest-debug] Setting session from hash tokens...')
            const { data, error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt })
            if (error) {
              console.error('[nest-debug] setSession error:', error.message)
            } else {
              session = data.session
              console.log('[nest-debug] Session set from hash. User:', session?.user?.email)
            }
          }
        }

        if (!session && code) {
          console.log('[nest-debug] Exchanging code for session (PKCE fallback)...')
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.error('[nest-debug] exchangeCodeForSession error:', error.message)
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
          console.log('[nest-debug] Session from code exchange. User:', session?.user?.email)
        }

        if (!session) {
          console.log('[nest-debug] No session yet, trying getSession()...')
          const { data } = await supabase.auth.getSession()
          session = data.session
          console.log('[nest-debug] getSession result:', session ? 'found' : 'null')
        }

        if (!session) {
          console.error('[nest-debug] NO SESSION — code:', code, 'hash:', !!window.location.hash)
          if (!code && !window.location.hash) {
            console.log('[nest-debug] No code or hash, redirecting to /')
            navigate('/', { replace: true })
            return
          }
          setStatus('error')
          setErrorMessage('Could not establish a session. Please try again.')
          return
        }

        if (cancelled) return

        console.log('[nest-debug] Session OK. User:', session.user?.email, 'ID:', session.user?.id)

        // Detect auth provider (google or azure/microsoft)
        const authProvider = session.user?.app_metadata?.provider ?? 'google'
        console.log('[nest-debug] Auth provider:', authProvider)

        const finalProviderToken = providerToken || session.provider_token || ''
        const finalProviderRefreshToken = providerRefreshToken || session.provider_refresh_token || ''
        console.log('[nest-debug] Provider tokens: token=', finalProviderToken ? 'present' : 'missing', 'refresh=', finalProviderRefreshToken ? 'present' : 'missing')

        // Returning user shortcut: if no iMessage token and user already has
        // linked Google accounts, skip onboard and go straight to dashboard.
        if (!imessageToken) {
          console.log('[nest-debug] No iMessage token — checking for existing accounts...')
          try {
            const acctRes = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
              headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
            })
            console.log('[nest-debug] manage-google-accounts status:', acctRes.status)
            const acctData = await acctRes.json()
            console.log('[nest-debug] manage-google-accounts response:', JSON.stringify(acctData).slice(0, 200))
            const totalAccounts = (acctData.accounts?.length ?? 0) + (acctData.microsoft_accounts?.length ?? 0)
            if (totalAccounts > 0) {
              console.log('[nest-debug] Found', totalAccounts, 'accounts — going to dashboard')
              sessionStorage.removeItem('nest_imessage_token')
              setStatus('success')
              setTimeout(() => {
                if (!cancelled) navigate('/dashboard', { replace: true })
              }, 2000)
              return
            }
            console.log('[nest-debug] No existing accounts found, falling through to onboard')
          } catch (e) {
            console.error('[nest-debug] manage-google-accounts error:', e)
            // Fall through to normal onboard flow
          }
        }

        console.log('[nest-debug] Calling imessage-onboard POST...')
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
            provider: authProvider,
          }),
        })

        if (cancelled) return

        console.log('[nest-debug] onboard response status:', res.status)

        let data: any = {}
        try {
          data = await res.json()
        } catch {
          data = {}
        }

        console.log('[nest-debug] onboard response:', JSON.stringify(data).slice(0, 300))

        if (!res.ok) {
          const detail = typeof data.detail === 'string' ? data.detail : undefined
          const error = typeof data.error === 'string' ? data.error : undefined
          const message = typeof data.message === 'string' ? data.message : undefined
          console.error('[nest-debug] ONBOARD FAILED:', detail ?? error ?? message ?? `status ${res.status}`)
          setStatus('error')
          setErrorMessage(detail ?? error ?? message ?? `Onboarding failed (${res.status}). Please try again.`)
          return
        }

        if (data.success) {
          console.log('[nest-debug] SUCCESS — redirecting to dashboard')
          sessionStorage.removeItem('nest_imessage_token')
          setStatus('success')
          setTimeout(() => {
            if (!cancelled) navigate('/dashboard', { replace: true })
          }, 2000)
        } else if (data.error === 'email_conflict') {
          console.warn('[nest-debug] EMAIL CONFLICT:', data.detail)
          await supabase.auth.signOut()
          setStatus('email_conflict')
          setErrorMessage(data.detail ?? 'This Google account is already linked to another Nest account.')
          setConflictHint(data.hint ?? '')
        } else {
          console.error('[nest-debug] UNEXPECTED RESPONSE:', JSON.stringify(data))
          setStatus('error')
          setErrorMessage(data.detail ?? data.error ?? 'An unexpected error occurred.')
        }
      } catch (err) {
        if (cancelled) return
        console.error('[nest-debug] UNCAUGHT ERROR:', err)
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
      className="h-[100dvh] flex items-center justify-center bg-[#FAFAFA] px-6 font-sans"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-full max-w-sm text-center">
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
                Setting things up
              </motion.h1>
              <motion.p
                className="text-[15px] text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                Connecting your account.
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
                You're all set
              </motion.h1>
              <motion.p
                className="text-[15px] text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                Taking you to your dashboard.
              </motion.p>
            </motion.div>
          )}

          {status === 'email_conflict' && (
            <motion.div
              key="conflict"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center"
            >
              <h1 className="text-[28px] font-bold tracking-tight text-gray-900 mb-4">Account already exists</h1>
              <div className="text-sm text-gray-600 bg-white p-4 rounded-2xl border border-gray-200/60 shadow-sm mb-8 w-full">
                <p className="mb-2">{errorMessage}</p>
                {conflictHint && <p className="text-gray-400">{conflictHint}</p>}
              </div>
              <button
                className="w-full rounded-full bg-gray-900 py-3.5 text-[15px] font-semibold text-white hover:bg-black transition-colors"
                onClick={() => navigate('/', { replace: true })}
              >
                Try again
              </button>
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
