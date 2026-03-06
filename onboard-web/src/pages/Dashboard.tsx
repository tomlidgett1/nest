import { useEffect, useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronRight, LogOut, ShieldAlert, FileText, HelpCircle, Plus, Download, MessageCircle, Check, User, Link2, Zap, HardDrive, Sparkles, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Automations from './Automations'

const cn = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ')

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const GOOGLE_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
].join(' ')

const MS_SCOPES = 'openid email offline_access User.Read Calendars.ReadWrite Mail.ReadWrite Mail.Send Contacts.Read Files.Read.All'

const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string

interface GoogleAccount {
  id: string
  google_email: string
  google_name: string | null
  google_avatar_url: string | null
  is_primary: boolean
  scopes?: string[]
}

interface MicrosoftAccount {
  id: string
  microsoft_email: string
  microsoft_name: string | null
  microsoft_avatar_url: string | null
  is_primary: boolean
}

interface StravaAccount {
  id: string
  strava_athlete_id: number
  athlete_name: string | null
}

type Tab = 'accounts' | 'contact' | 'connections'

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'accounts', label: 'Accounts', icon: User },
  { id: 'contact', label: 'Contact', icon: Link2 },
  { id: 'connections', label: 'Connections', icon: Zap },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [microsoftAccounts, setMicrosoftAccounts] = useState<MicrosoftAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addSheetMounted, setAddSheetMounted] = useState(false)
  const [addSheetVisible, setAddSheetVisible] = useState(false)
  const [contactSaved, setContactSaved] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('accounts')
  const [stravaAccount, setStravaAccount] = useState<StravaAccount | null>(null)
  const [stravaLoading, setStravaLoading] = useState(false)
  const [driveGranting, setDriveGranting] = useState<string | null>(null)
  const [drivePickerOpen, setDrivePickerOpen] = useState(false)
  const [drivePickerMounted, setDrivePickerMounted] = useState(false)
  const [drivePickerVisible, setDrivePickerVisible] = useState(false)
  const [autoSheetOpen, setAutoSheetOpen] = useState(false)
  const [autoSheetMounted, setAutoSheetMounted] = useState(false)
  const [autoSheetVisible, setAutoSheetVisible] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function init() {
      try {
        let session = (await supabase.auth.refreshSession()).data.session
        if (!session) {
          session = (await supabase.auth.getSession()).data.session
        }
        if (!session) {
          navigate('/', { replace: true })
          return
        }
        const user = session.user
        console.log('[dashboard] Session OK, user:', user.email, 'provider:', user.app_metadata?.provider)
        setAvatarUrl(user.user_metadata?.avatar_url ?? null)

        const accountData = await fetchAccounts(session.access_token)
        console.log('[dashboard] Accounts fetched:', accountData?.accounts?.length ?? 0, 'google,', accountData?.microsoft_accounts?.length ?? 0, 'microsoft')

        const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name
        const primaryGName = accountData?.accounts?.find((a) => a.is_primary)?.google_name
        const primaryMsName = accountData?.microsoft_accounts?.find((a) => a.is_primary)?.microsoft_name
        const resolvedName = metadataName || primaryGName || primaryMsName || user.email || ''
        console.log('[dashboard] Display name resolved:', resolvedName, '(metadata:', metadataName, ', google:', primaryGName, ', ms:', primaryMsName, ')')
        setDisplayName(resolvedName)

        // Fetch Strava connection status
        const { data: strava } = await supabase
          .from('user_strava_accounts')
          .select('id, strava_athlete_id, athlete_name')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        if (strava) setStravaAccount(strava)

        // Handle redirect query params
        const params = new URLSearchParams(window.location.search)
        if (params.get('strava') === 'connected') {
          setActiveTab('connections')
          window.history.replaceState({}, '', '/dashboard')
        }
        if (params.get('drive_auth') === 'success') {
          setActiveTab('connections')
          window.history.replaceState({}, '', '/dashboard')
        }
        if (params.get('automations') === 'open') {
          setAutoSheetOpen(true)
          window.history.replaceState({}, '', '/dashboard')
        }
      } catch (err) {
        console.error('[dashboard] init() error:', err)
      } finally {
        setLoading(false)
      }
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

  useEffect(() => {
    if (addMenuOpen) {
      setAddSheetMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAddSheetVisible(true)
        })
      })
    } else {
      setAddSheetVisible(false)
    }
  }, [addMenuOpen])

  const handleAddSheetTransitionEnd = useCallback(() => {
    if (!addMenuOpen) {
      setAddSheetMounted(false)
    }
  }, [addMenuOpen])

  useEffect(() => {
    if (drivePickerOpen) {
      setDrivePickerMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDrivePickerVisible(true)
        })
      })
    } else {
      setDrivePickerVisible(false)
    }
  }, [drivePickerOpen])

  const handleDrivePickerTransitionEnd = useCallback(() => {
    if (!drivePickerOpen) {
      setDrivePickerMounted(false)
    }
  }, [drivePickerOpen])

  useEffect(() => {
    if (autoSheetOpen) {
      setAutoSheetMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAutoSheetVisible(true)
        })
      })
    } else {
      setAutoSheetVisible(false)
    }
  }, [autoSheetOpen])

  const handleAutoSheetTransitionEnd = useCallback(() => {
    if (!autoSheetOpen) {
      setAutoSheetMounted(false)
    }
  }, [autoSheetOpen])

  async function fetchAccounts(token?: string): Promise<{ accounts: GoogleAccount[]; microsoft_accounts: MicrosoftAccount[] } | null> {
    const accessToken = token ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!accessToken) {
      console.warn('[dashboard] fetchAccounts: no access token')
      return null
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      })
      console.log('[dashboard] fetchAccounts status:', res.status)
      if (res.status === 401) {
        const { data: { session } } = await supabase.auth.refreshSession()
        if (session) {
          const retry = await fetch(`${SUPABASE_URL}/functions/v1/manage-google-accounts`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
          })
          const retryData = await retry.json()
          const ga = retryData.accounts ?? []
          const ma = retryData.microsoft_accounts ?? []
          setAccounts(ga)
          setMicrosoftAccounts(ma)
          return { accounts: ga, microsoft_accounts: ma }
        }
        return null
      }
      const data = await res.json()
      console.log('[dashboard] fetchAccounts response:', JSON.stringify(data).slice(0, 300))
      const ga = data.accounts ?? []
      const ma = data.microsoft_accounts ?? []
      setAccounts(ga)
      setMicrosoftAccounts(ma)
      return { accounts: ga, microsoft_accounts: ma }
    } catch (err) {
      console.error('[dashboard] fetchAccounts error:', err)
      return null
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
        scopes: GOOGLE_SCOPES,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }

  async function handleAddMicrosoftAccount() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    sessionStorage.setItem('nest_original_user_id', session.user.id)
    sessionStorage.setItem('nest_original_refresh_token', session.refresh_token)
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/add-account-callback`,
        scopes: MS_SCOPES,
        queryParams: { prompt: 'consent' },
      },
    })
  }

  async function handleRemoveAccount(accountId: string, provider: 'google' | 'microsoft' = 'google') {
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
        body: JSON.stringify({ account_id: accountId, provider }),
      })
      await fetchAccounts(session.access_token)
    } catch {
      // Silently fail
    } finally {
      setRemoving(null)
    }
  }

  async function handleConnectStrava() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setStravaLoading(true)
    const callbackUrl = `${SUPABASE_URL}/functions/v1/strava-callback`
    const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize')
    stravaAuthUrl.searchParams.set('client_id', STRAVA_CLIENT_ID)
    stravaAuthUrl.searchParams.set('redirect_uri', callbackUrl)
    stravaAuthUrl.searchParams.set('response_type', 'code')
    stravaAuthUrl.searchParams.set('approval_prompt', 'auto')
    stravaAuthUrl.searchParams.set('scope', 'activity:read_all,profile:read_all')
    stravaAuthUrl.searchParams.set('state', session.user.id)
    window.location.href = stravaAuthUrl.toString()
  }

  async function handleDisconnectStrava() {
    if (!stravaAccount) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setStravaLoading(true)
    try {
      await supabase
        .from('user_strava_accounts')
        .delete()
        .eq('id', stravaAccount.id)
      setStravaAccount(null)
    } catch {
      // Silently fail
    } finally {
      setStravaLoading(false)
    }
  }

  function handleConnectDrive() {
    const accountsWithoutDrive = accounts.filter(
      (a) => !(a.scopes ?? []).includes('https://www.googleapis.com/auth/drive.readonly')
    )
    if (accountsWithoutDrive.length === 0) return
    if (accountsWithoutDrive.length === 1) {
      void handleGrantDriveAccess(accountsWithoutDrive[0].id)
    } else {
      setDrivePickerOpen(true)
    }
  }

  async function handleGrantDriveAccess(accountId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setDriveGranting(accountId)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-auth`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: accountId,
          redirect_uri: `${window.location.origin}/dashboard?drive_auth=success`,
        }),
      })
      const data = await res.json()
      if (data.already_granted) {
        setDriveGranting(null)
        return
      }
      if (data.auth_url) {
        window.location.href = data.auth_url
        return
      }
      setDriveGranting(null)
    } catch {
      setDriveGranting(null)
    }
  }

  const firstName = displayName.split(' ')[0] || 'there'
  const primaryAccount = accounts.find((a) => a.is_primary)
  const primaryMsAccount = microsoftAccounts.find((a) => a.is_primary)
  const primaryAvatar = primaryAccount?.google_avatar_url ?? primaryMsAccount?.microsoft_avatar_url ?? avatarUrl

  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
  const driveConnectedAccounts = accounts.filter((a) => (a.scopes ?? []).includes(DRIVE_SCOPE))
  const driveAvailable = accounts.length > 0
  const driveConnected = driveConnectedAccounts.length > 0

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

  return (
    <motion.div
      className="h-[100dvh] flex flex-col overflow-hidden bg-[#FAFAFA] font-sans"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* ── Header ── */}
      <header className="shrink-0 z-50 bg-[#FAFAFA]/80 backdrop-blur-md border-b border-gray-200/40">
        <div className="mx-auto max-w-lg px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/nest-logo.png" alt="Nest" className="h-8 w-8 rounded-[10px] shadow-sm" />
            <h1 className="text-[17px] font-semibold tracking-tight text-gray-900">
              Hey, {firstName}
            </h1>
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
                    <p className="text-xs text-gray-400 truncate">{primaryAccount?.google_email ?? primaryMsAccount?.microsoft_email}</p>
                  </div>
                  <Link
                    to="/privacy"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <ShieldAlert className="h-4 w-4" /> Privacy Policy
                  </Link>
                  <Link
                    to="/terms"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <FileText className="h-4 w-4" /> Terms of Service
                  </Link>
                  <Link
                    to="/support"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <HelpCircle className="h-4 w-4" /> Support
                  </Link>
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors mt-0.5 border-t border-gray-100 pt-2"
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

      {/* ── Content ── */}
      <main className="flex-1 min-h-0 flex flex-col px-5 mx-auto w-full max-w-lg">

        {/* ── Tabs ── */}
        <div className="shrink-0 pt-4 pb-4 flex justify-center">
          <div className="flex items-center bg-gray-100 p-0.5 rounded-full">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
                  activeTab === tab.id
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'accounts' && (
            <motion.div
              key="accounts"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0"
            >
              <p className="text-[13px] text-gray-500 mb-3">
                Your connected email and calendar accounts.
              </p>
              <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm overflow-hidden divide-y divide-gray-100">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 px-4 py-2.5">
                    {account.google_avatar_url ? (
                      <img src={account.google_avatar_url} alt="" className="h-8 w-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                        {(account.google_name || account.google_email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <img src="/google-icon.png" alt="" className="h-3 w-3 shrink-0" />
                        <p className="text-[13px] font-medium text-gray-900 truncate">
                          {account.google_name || account.google_email}
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{account.google_email}</p>
                    </div>
                    {!account.is_primary && (
                      <button
                        onClick={() => void handleRemoveAccount(account.id, 'google')}
                        disabled={removing === account.id}
                        className="shrink-0 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                      >
                        {removing === account.id ? '...' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))}
                {microsoftAccounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 px-4 py-2.5">
                    {account.microsoft_avatar_url ? (
                      <img src={account.microsoft_avatar_url} alt="" className="h-8 w-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                        {(account.microsoft_name || account.microsoft_email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <img src="/microsoft-icon.svg" alt="" className="h-3 w-3 shrink-0" />
                        <p className="text-[13px] font-medium text-gray-900 truncate">
                          {account.microsoft_name || account.microsoft_email}
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">{account.microsoft_email}</p>
                    </div>
                    {!account.is_primary && (
                      <button
                        onClick={() => void handleRemoveAccount(account.id, 'microsoft')}
                        disabled={removing === account.id}
                        className="shrink-0 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                      >
                        {removing === account.id ? '...' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setAddMenuOpen(true)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#007AFF]/10">
                    <Plus className="h-3.5 w-3.5 text-[#007AFF]" />
                  </div>
                  <span className="text-[13px] font-medium text-[#007AFF]">Add another account</span>
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'contact' && (
            <motion.div
              key="contact"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0"
            >
              <p className="text-[13px] text-gray-500 mb-3">
                Save Nest as a contact so messages show a name, not a number.
              </p>
              <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3.5 px-4 py-4">
                  <img src="/nest-logo.png" alt="" className="h-12 w-12 rounded-xl shadow-sm shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-gray-900">Nest</p>
                    <p className="text-[12px] text-gray-400 mt-0.5">iMessage assistant</p>
                  </div>
                  <a
                    href="/nest.vcf"
                    onClick={() => setContactSaved(true)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-all",
                      contactSaved
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-gray-900 text-white active:scale-[0.96]'
                    )}
                  >
                    {contactSaved ? (
                      <><Check className="h-3.5 w-3.5" /> Saved</>
                    ) : (
                      <><Download className="h-3.5 w-3.5" /> Save</>
                    )}
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'connections' && (
            <motion.div
              key="connections"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0"
            >
              <p className="text-[13px] text-gray-500 mb-3">
                Connect apps to give Nest more context about your life.
              </p>
              <div className="rounded-md bg-white border border-gray-200/60 shadow-sm overflow-hidden divide-y divide-gray-100">
                {/* Strava — functional */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#FC4C02">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116zm-7.98-5.743l2.615 5.157h3.064L8.22 6.672 3.033 17.358h3.065l2.31-5.157z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">Strava</p>
                    <p className="text-[11px] text-gray-400">
                      {stravaAccount ? stravaAccount.athlete_name ?? 'Connected' : 'Fitness & activities'}
                    </p>
                  </div>
                  {stravaAccount ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">Connected</span>
                      <button
                        onClick={() => void handleDisconnectStrava()}
                        disabled={stravaLoading}
                        className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                      >
                        {stravaLoading ? '...' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => void handleConnectStrava()}
                      disabled={stravaLoading}
                      className="shrink-0 text-[11px] font-medium text-white bg-gray-900 px-3 py-1 rounded-md active:scale-[0.96] transition-all"
                    >
                      {stravaLoading ? '...' : 'Connect'}
                    </button>
                  )}
                </div>

                {/* Google Drive */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                    <HardDrive className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">Google Drive</p>
                    <p className="text-[11px] text-gray-400">
                      {driveConnected
                        ? driveConnectedAccounts.map((a) => a.google_email).join(', ')
                        : 'Search documents & files'}
                    </p>
                  </div>
                  {driveConnected ? (
                    <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">Connected</span>
                  ) : driveAvailable ? (
                    <button
                      onClick={handleConnectDrive}
                      disabled={!!driveGranting}
                      className="shrink-0 text-[11px] font-medium text-white bg-gray-900 px-3 py-1 rounded-md active:scale-[0.96] transition-all"
                    >
                      {driveGranting ? '...' : 'Connect'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Add Google account first</span>
                  )}
                </div>

                {/* Slack — coming soon */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#4A154B">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">Slack</p>
                    <p className="text-[11px] text-gray-400">Team messaging</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Soon</span>
                </div>

                {/* Notion — coming soon */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 border border-gray-100">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#000000">
                      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.002 2.05c-.42-.326-.98-.7-2.055-.607L3.01 2.41c-.467.047-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">Notion</p>
                    <p className="text-[11px] text-gray-400">Notes & docs</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">Soon</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Automations link ── */}
        <motion.div
          className="shrink-0 mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <button
            onClick={() => setAutoSheetOpen(true)}
            className="flex items-center gap-3 w-full rounded-2xl bg-white border border-gray-200/60 shadow-sm px-4 py-3 text-left active:scale-[0.98] transition-all"
          >
            <Sparkles className="h-[18px] w-[18px] text-gray-400 shrink-0" />
            <span className="flex-1 text-[15px] font-normal text-gray-900">Automations</span>
            <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
          </button>
        </motion.div>

        <div className="flex-1" />

        {/* ── Bottom: CTA always visible ── */}
        <motion.div
          className="shrink-0 pt-4 pb-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <a
            href="sms:tlidgett@icloud.com&body=Hey%20Nest!"
            className="flex items-center justify-center gap-2 w-full rounded-full bg-[#007AFF] py-3.5 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(0,122,255,0.25)] hover:bg-[#0071E3] active:scale-[0.98] transition-all"
          >
            <MessageCircle className="h-4 w-4" />
            Open iMessage
          </a>
        </motion.div>
      </main>

      {/* ── Add account bottom sheet ── */}
      {addSheetMounted && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              opacity: addSheetVisible ? 1 : 0,
              transition: 'opacity 0.3s ease-out',
              willChange: 'opacity',
            }}
            onClick={() => setAddMenuOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-[28px] pb-[max(env(safe-area-inset-bottom,0px),16px)] px-6 pt-3"
            style={{
              transform: addSheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform',
            }}
            onTransitionEnd={handleAddSheetTransitionEnd}
          >
            <div className="flex justify-center mb-5">
              <div className="w-9 h-[5px] rounded-full bg-gray-300" />
            </div>

            <h2 className="text-[22px] font-bold tracking-tight text-gray-900 text-center mb-1">
              Add an account
            </h2>
            <p className="text-[14px] text-gray-400 text-center mb-6">
              Choose a provider to connect
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setAddMenuOpen(false); void handleAddAccount() }}
                className="flex items-center justify-center gap-3 w-full bg-white text-gray-900 border border-gray-200 rounded-2xl py-4 text-[16px] font-semibold shadow-sm active:scale-[0.98] transition-all"
              >
                <img src="/google-icon.png" alt="" className="h-5 w-5" />
                Continue with Google
              </button>
              <button
                onClick={() => { setAddMenuOpen(false); void handleAddMicrosoftAccount() }}
                className="flex items-center justify-center gap-3 w-full bg-white text-gray-900 border border-gray-200 rounded-2xl py-4 text-[16px] font-semibold shadow-sm active:scale-[0.98] transition-all"
              >
                <img src="/microsoft-icon.svg" alt="" className="h-5 w-5" />
                Continue with Microsoft
              </button>
            </div>

            <button
              onClick={() => setAddMenuOpen(false)}
              className="w-full mt-4 mb-2 text-[14px] text-gray-400 hover:text-gray-600 transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── Drive account picker bottom sheet ── */}
      {drivePickerMounted && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              opacity: drivePickerVisible ? 1 : 0,
              transition: 'opacity 0.3s ease-out',
              willChange: 'opacity',
            }}
            onClick={() => setDrivePickerOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-[28px] pb-[max(env(safe-area-inset-bottom,0px),16px)] px-6 pt-3"
            style={{
              transform: drivePickerVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform',
            }}
            onTransitionEnd={handleDrivePickerTransitionEnd}
          >
            <div className="flex justify-center mb-5">
              <div className="w-9 h-[5px] rounded-full bg-gray-300" />
            </div>

            <h2 className="text-[22px] font-bold tracking-tight text-gray-900 text-center mb-1">
              Connect Google Drive
            </h2>
            <p className="text-[14px] text-gray-400 text-center mb-6">
              Choose which account to grant Drive access
            </p>

            <div className="flex flex-col gap-3">
              {accounts
                .filter((a) => !(a.scopes ?? []).includes(DRIVE_SCOPE))
                .map((account) => (
                  <button
                    key={account.id}
                    onClick={() => { setDrivePickerOpen(false); void handleGrantDriveAccess(account.id) }}
                    disabled={driveGranting === account.id}
                    className="flex items-center gap-3 w-full bg-white text-gray-900 border border-gray-200 rounded-2xl py-3.5 px-4 text-left shadow-sm active:scale-[0.98] transition-all"
                  >
                    {account.google_avatar_url ? (
                      <img src={account.google_avatar_url} alt="" className="h-8 w-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                        {(account.google_name || account.google_email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold truncate">{account.google_name || account.google_email}</p>
                      <p className="text-[12px] text-gray-400 truncate">{account.google_email}</p>
                    </div>
                    {driveGranting === account.id && (
                      <span className="text-[11px] text-gray-400">...</span>
                    )}
                  </button>
                ))}
            </div>

            <button
              onClick={() => setDrivePickerOpen(false)}
              className="w-full mt-4 mb-2 text-[14px] text-gray-400 hover:text-gray-600 transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── Automations popup sheet ── */}
      {autoSheetMounted && (
        <>
          <div
            className="fixed inset-0 z-[80]"
            style={{
              backgroundColor: 'rgba(0,0,0,0.35)',
              opacity: autoSheetVisible ? 1 : 0,
              transition: 'opacity 0.2s ease-out',
              willChange: 'opacity',
            }}
            onClick={() => setAutoSheetOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[90] bg-[#FAFAFA] rounded-t-[20px] flex flex-col"
            style={{
              maxHeight: '92dvh',
              transform: autoSheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform',
            }}
            onTransitionEnd={handleAutoSheetTransitionEnd}
          >
            <div className="shrink-0 px-5 pt-3 pb-0">
              <div className="flex justify-center mb-3">
                <div className="w-9 h-[5px] rounded-full bg-gray-300" />
              </div>
              <div className="relative flex items-center justify-center pb-3 border-b border-gray-200/40">
                <img src="/nest-logo.png" alt="Nest" className="absolute left-0 h-6 w-6 rounded-[6px] shadow-sm" />
                <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">Automations</h2>
                <button
                  onClick={() => setAutoSheetOpen(false)}
                  className="absolute right-0 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom,0px),16px)]">
              <Automations onClose={() => setAutoSheetOpen(false)} />
            </div>
          </div>
        </>
      )}

    </motion.div>
  )
}
