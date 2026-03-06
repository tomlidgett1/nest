import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const HIRAFU_ONBOARD_URL = `${SUPABASE_URL}/functions/v1/hirafu-onboard`

type Status = 'loading' | 'success' | 'error'

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

export default function HirafuCallback() {
  const navigate = useNavigate()
  const hasProcessed = useRef(false)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (hasProcessed.current) return
    hasProcessed.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const hirafuToken = params.get('token') || sessionStorage.getItem('hirafu_token') || ''

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
          setStatus('error')
          setErrorMessage('Could not establish a session. Please try again.')
          return
        }

        if (cancelled) return

        const authProvider = session.user?.app_metadata?.provider ?? 'google'
        const finalProviderToken = providerToken || session.provider_token || ''
        const finalProviderRefreshToken = providerRefreshToken || session.provider_refresh_token || ''

        const res = await fetch(HIRAFU_ONBOARD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${String(session.access_token).trim()}`,
          },
          body: JSON.stringify({
            token: hirafuToken || undefined,
            access_token: session.access_token,
            provider_token: finalProviderToken,
            provider_refresh_token: finalProviderRefreshToken,
            provider: authProvider,
            user_id: session.user?.id,
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
          setStatus('error')
          setErrorMessage(data.error ?? `Verification failed (${res.status}). Please try again.`)
          return
        }

        if (data.success) {
          sessionStorage.removeItem('hirafu_token')
          setStatus('success')
          setTimeout(() => {
            if (!cancelled) navigate('/dashboard', { replace: true })
          }, 2000)
        } else {
          setStatus('error')
          setErrorMessage(data.error ?? 'An unexpected error occurred.')
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(e instanceof Error ? e.message : 'Something went wrong')
        }
      }
    }

    onboard()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <AnimatePresence mode="wait">
        {status === 'loading' && (
          <motion.div
            key="loading"
            className="flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AppleSpinner size={44} />
            <p className="mt-6 text-base font-medium text-gray-900">Verifying your account</p>
            <p className="mt-1 text-sm text-gray-500">This only takes a moment</p>
          </motion.div>
        )}

        {status === 'success' && (
          <motion.div
            key="success"
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AnimatedCheck />
            <h2 className="text-xl font-semibold text-gray-900">You're in</h2>
            <p className="mt-2 text-sm text-gray-500">
              Hirafu is ready. Head back to iMessage.
            </p>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div
            key="error"
            className="flex flex-col items-center text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Something went wrong</h2>
            <p className="mt-2 max-w-xs text-sm text-gray-500">{errorMessage}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              Try again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
