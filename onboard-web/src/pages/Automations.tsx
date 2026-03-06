import { useEffect, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import { Mail, MessageSquare, BarChart3, Sunset, Check, CalendarClock, Users, Sparkles, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'

const cn = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ')

function haptic(style: 'light' | 'medium' = 'light') {
  try {
    if ('vibrate' in navigator) { navigator.vibrate(style === 'light' ? 8 : 15); return }
    const sel = window.getSelection()
    const range = document.createRange()
    const span = document.createElement('span')
    span.textContent = '\u200b'
    span.style.position = 'fixed'
    span.style.top = '-9999px'
    document.body.appendChild(span)
    range.selectNodeContents(span)
    sel?.removeAllRanges()
    sel?.addRange(range)
    sel?.removeAllRanges()
    document.body.removeChild(span)
  } catch {}
}

interface UserAutomation {
  id: string
  user_id: string
  automation_type: string
  active: boolean
  config: { time?: string; timezone?: string; day?: string; prompt?: string; frequency?: string; total_runs?: number; engagement_rate?: number; watch_filters?: { senders?: string[]; keywords?: string[] } }
  label: string | null
  last_run_at: string | null
  next_run_at: string | null
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

interface AutomationDef {
  type: string
  title: string
  description: string
  icon: React.ReactNode
  category: 'daily' | 'weekly' | 'always'
  defaultHour: number
  defaultMinute: number
  defaultPeriod: 'AM' | 'PM'
  defaultDay?: string
  sheetLabel: string
  alwaysOn?: boolean
}

const AUTOMATION_DEFS: AutomationDef[] = [
  {
    type: 'email_summary',
    title: 'Inbox Summary',
    description: 'Morning email digest',
    icon: <Mail className="h-5 w-5 text-gray-500" />,
    category: 'daily',
    defaultHour: 8, defaultMinute: 0, defaultPeriod: 'AM',
    sheetLabel: 'Deliver every day at',
  },
  {
    type: 'follow_up_nudge',
    title: 'Follow-Up Nudge',
    description: 'Unanswered threads',
    icon: <MessageSquare className="h-5 w-5 text-gray-500" />,
    category: 'daily',
    defaultHour: 2, defaultMinute: 0, defaultPeriod: 'PM',
    sheetLabel: 'Check for follow-ups at',
  },
  {
    type: 'daily_wrap',
    title: 'Daily Wrap',
    description: 'End-of-day debrief',
    icon: <Sunset className="h-5 w-5 text-gray-500" />,
    category: 'daily',
    defaultHour: 6, defaultMinute: 0, defaultPeriod: 'PM',
    sheetLabel: 'Send wrap-up at',
  },
  {
    type: 'email_monitor',
    title: 'Email Monitor',
    description: 'Proactive alerts for urgent emails',
    icon: <Mail className="h-5 w-5 text-gray-500" />,
    category: 'always',
    defaultHour: 9, defaultMinute: 0, defaultPeriod: 'AM',
    sheetLabel: '',
    alwaysOn: true,
  },
  {
    type: 'meeting_intel',
    title: 'Meeting Intel',
    description: 'Evening prep brief',
    icon: <CalendarClock className="h-5 w-5 text-gray-500" />,
    category: 'daily',
    defaultHour: 8, defaultMinute: 0, defaultPeriod: 'PM',
    sheetLabel: 'Send meeting brief at',
  },
  {
    type: 'weekly_digest',
    title: 'Weekly Digest',
    description: 'Full week review',
    icon: <BarChart3 className="h-5 w-5 text-gray-500" />,
    category: 'weekly',
    defaultHour: 7, defaultMinute: 0, defaultPeriod: 'PM',
    defaultDay: 'Sunday',
    sheetLabel: 'Send digest every',
  },
  {
    type: 'relationship_radar',
    title: 'Relationship Radar',
    description: 'Who needs a nudge',
    icon: <Users className="h-5 w-5 text-gray-500" />,
    category: 'weekly',
    defaultHour: 6, defaultMinute: 0, defaultPeriod: 'PM',
    defaultDay: 'Sunday',
    sheetLabel: 'Send radar every',
  },
]

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatSchedule(auto: UserAutomation): string | undefined {
  if (!auto.active || !auto.config.time) return undefined
  const time = formatTime(auto.config.time)
  if (auto.config.day) return `${auto.config.day}s, ${time}`
  return time
}

export default function Automations({ onClose: _onClose }: { onClose?: () => void }) {
  const [automations, setAutomations] = useState<UserAutomation[]>([])
  const [loading, setLoading] = useState(true)
  const [userTimezone, setUserTimezone] = useState<string | null>(null)

  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [timePickerMounted, setTimePickerMounted] = useState(false)
  const [timePickerVisible, setTimePickerVisible] = useState(false)
  const [timePickerTarget, setTimePickerTarget] = useState<string | null>(null)
  const [selectedHour, setSelectedHour] = useState(8)
  const [selectedMinute, setSelectedMinute] = useState(0)
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM')
  const [selectedDay, setSelectedDay] = useState('Sunday')
  const [saving, setSaving] = useState(false)

  const activeDef = AUTOMATION_DEFS.find(d => d.type === timePickerTarget)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [{ data: autos }, { data: acct }] = await Promise.all([
        supabase.from('user_automations').select('*').eq('user_id', session.user.id),
        supabase.from('user_google_accounts').select('timezone').eq('user_id', session.user.id).eq('is_primary', true).maybeSingle(),
      ])
      if (autos) setAutomations(autos)
      if (acct?.timezone) setUserTimezone(acct.timezone)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (timePickerOpen) {
      setTimePickerMounted(true)
      requestAnimationFrame(() => { requestAnimationFrame(() => { setTimePickerVisible(true) }) })
    } else {
      setTimePickerVisible(false)
    }
  }, [timePickerOpen])

  const handleTimePickerTransitionEnd = useCallback(() => {
    if (!timePickerOpen) setTimePickerMounted(false)
  }, [timePickerOpen])

  async function fetchAutomations() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('user_automations').select('*').eq('user_id', session.user.id)
    if (data) setAutomations(data)
  }

  function openTimePicker(type: string) {
    const def = AUTOMATION_DEFS.find(d => d.type === type)
    if (!def) return

    const existing = automations.find(a => a.automation_type === type)
    if (existing?.config?.time) {
      const [h, m] = existing.config.time.split(':').map(Number)
      setSelectedHour(h === 0 ? 12 : h > 12 ? h - 12 : h)
      setSelectedMinute(m)
      setSelectedPeriod(h >= 12 ? 'PM' : 'AM')
    } else {
      setSelectedHour(def.defaultHour)
      setSelectedMinute(def.defaultMinute)
      setSelectedPeriod(def.defaultPeriod)
    }

    if (def.category === 'weekly') {
      setSelectedDay(existing?.config?.day || def.defaultDay || 'Sunday')
    }

    setTimePickerTarget(type)
    setTimePickerOpen(true)
  }

  async function handleSave() {
    if (!timePickerTarget) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const hour24 = selectedPeriod === 'AM' ? (selectedHour === 12 ? 0 : selectedHour) : (selectedHour === 12 ? 12 : selectedHour + 12)
      const timeStr = `${String(hour24).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`
      const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      const config: Record<string, string> = { time: timeStr, timezone: tz }
      if (activeDef?.category === 'weekly') config.day = selectedDay

      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      const p = formatter.formatToParts(now)
      const get = (t: string) => parseInt(p.find(x => x.type === t)?.value ?? '0', 10)
      const tzYear = get('year'), tzMonth = get('month'), tzDay = get('day')
      const tzHour = get('hour'), tzMin = get('minute'), tzSec = get('second')
      const tzNowAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin, tzSec)
      const offsetMs = tzNowAsUtc - now.getTime()
      const targetAsUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, hour24, selectedMinute, 0)
      let nextRunUtc = new Date(targetAsUtc - offsetMs)
      if (nextRunUtc.getTime() <= now.getTime()) nextRunUtc = new Date(nextRunUtc.getTime() + 86400000)

      // For weekly automations, advance to the correct day
      if (activeDef?.category === 'weekly') {
        const dayMap: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
        const targetDow = dayMap[selectedDay] ?? 0
        const currentDow = nextRunUtc.getUTCDay()
        if (currentDow !== targetDow) {
          let daysAhead = targetDow - currentDow
          if (daysAhead <= 0) daysAhead += 7
          nextRunUtc = new Date(nextRunUtc.getTime() + daysAhead * 86400000)
        }
      }

      const { data: existing } = await supabase.from('user_automations').select('id').eq('user_id', session.user.id).eq('automation_type', timePickerTarget).maybeSingle()
      if (existing) {
        await supabase.from('user_automations').update({ active: true, config, next_run_at: nextRunUtc.toISOString(), updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('user_automations').insert({ user_id: session.user.id, automation_type: timePickerTarget, active: true, config, next_run_at: nextRunUtc.toISOString() })
      }

      haptic('medium')
      await fetchAutomations()
      setTimePickerOpen(false)
    } finally { setSaving(false) }
  }

  async function handleDisable() {
    if (!timePickerTarget) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.from('user_automations').update({ active: false, next_run_at: null, updated_at: new Date().toISOString() }).eq('user_id', session.user.id).eq('automation_type', timePickerTarget)
      haptic('medium')
      await fetchAutomations()
      setTimePickerOpen(false)
    } finally { setSaving(false) }
  }

  async function handleAlwaysOnToggle(type: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const existing = automations.find(a => a.automation_type === type)
    const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    if (existing) {
      await supabase.from('user_automations').update({
        active: !existing.active,
        config: { timezone: tz },
        next_run_at: !existing.active ? new Date(Date.now() + 60000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_automations').insert({
        user_id: session.user.id,
        automation_type: type,
        active: true,
        config: { timezone: tz },
        next_run_at: new Date(Date.now() + 60000).toISOString(),
      })
    }
    haptic('medium')
    await fetchAutomations()
  }

  async function handleCustomToggle(automationId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const existing = automations.find(a => a.id === automationId)
    if (!existing) return
    await supabase.from('user_automations').update({
      active: !existing.active,
      next_run_at: !existing.active ? new Date(Date.now() + 60000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', automationId)
    haptic('medium')
    await fetchAutomations()
  }

  function getAutomation(type: string) {
    return automations.find(a => a.automation_type === type)
  }

  function formatCustomSchedule(auto: UserAutomation): string {
    const freq = auto.config.frequency || 'daily'
    if (freq === 'event') return 'Event-driven'
    if (freq === 'hourly') return 'Every hour'
    const time = auto.config.time ? formatTime(auto.config.time) : ''
    if (freq === 'weekly') return `${auto.config.day || 'Weekly'}${time ? ', ' + time : ''}`
    if (freq === 'weekday') return `Weekdays${time ? ', ' + time : ''}`
    return time || 'Daily'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="relative" style={{ width: 44, height: 44 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="absolute left-1/2 top-0 h-1/2 w-[2px] -translate-x-1/2 origin-bottom" style={{ transform: `rotate(${(360 / 12) * i}deg)` }}>
              <div className="h-[28%] w-full rounded-full bg-gray-900" style={{ animation: `spinFade 1s linear ${-(1 - i / 12)}s infinite` }} />
            </div>
          ))}
          <style>{`@keyframes spinFade { 0% { opacity: 1; } 100% { opacity: 0.15; } }`}</style>
        </div>
      </div>
    )
  }

  const dailyDefs = AUTOMATION_DEFS.filter(d => d.category === 'daily')
  const weeklyDefs = AUTOMATION_DEFS.filter(d => d.category === 'weekly')
  const alwaysOnDefs = AUTOMATION_DEFS.filter(d => d.category === 'always')
  const customAutomations = automations.filter(a => a.automation_type === 'custom')

  return (
    <div className="font-sans">
      <div className="px-5 pt-4 pb-8">
        <p className="text-[13px] text-gray-400 mb-5">Built-in and custom actions that run on your schedule.</p>

        <section className="mb-7">
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide mb-3 px-1">Daily</p>
          <div className="grid grid-cols-2 gap-3">
            {dailyDefs.map(def => {
              const auto = getAutomation(def.type)
              return (
                <AutomationCard
                  key={def.type}
                  icon={def.icon}
                  title={def.title}
                  subtitle={auto ? formatSchedule(auto) : undefined}
                  description={def.description}
                  active={auto?.active ?? false}
                  onTap={() => openTimePicker(def.type)}
                />
              )
            })}
          </div>
        </section>

        <section className="mb-7">
          <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide mb-3 px-1">Weekly</p>
          <div className="grid grid-cols-2 gap-3">
            {weeklyDefs.map(def => {
              const auto = getAutomation(def.type)
              return (
                <AutomationCard
                  key={def.type}
                  icon={def.icon}
                  title={def.title}
                  subtitle={auto ? formatSchedule(auto) : undefined}
                  description={def.description}
                  active={auto?.active ?? false}
                  onTap={() => openTimePicker(def.type)}
                />
              )
            })}
          </div>
        </section>

        {alwaysOnDefs.length > 0 && (
          <section className="mb-7">
            <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide mb-3 px-1">Always On</p>
            <div className="grid grid-cols-2 gap-3">
              {alwaysOnDefs.map(def => {
                const auto = getAutomation(def.type)
                return (
                  <AutomationCard
                    key={def.type}
                    icon={def.icon}
                    title={def.title}
                    subtitle={auto?.active ? 'Enabled' : undefined}
                    description={def.description}
                    active={auto?.active ?? false}
                    onTap={() => void handleAlwaysOnToggle(def.type)}
                  />
                )
              })}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide">Custom</p>
          </div>
          {customAutomations.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {customAutomations.map(auto => (
                <AutomationCard
                  key={auto.id}
                  icon={auto.config.frequency === 'event' ? <Zap className="h-5 w-5 text-gray-500" /> : <Sparkles className="h-5 w-5 text-gray-500" />}
                  title={auto.label || auto.config.prompt?.slice(0, 25) || 'Custom'}
                  subtitle={auto.active ? formatCustomSchedule(auto) : undefined}
                  description={auto.config.prompt?.slice(0, 40) || ''}
                  active={auto.active}
                  onTap={() => void handleCustomToggle(auto.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-gray-200/60 shadow-sm p-5 text-center">
              <Sparkles className="h-6 w-6 text-gray-300 mx-auto mb-2" />
              <p className="text-[14px] text-gray-500 mb-1">No custom automations yet</p>
              <p className="text-[12px] text-gray-400">Text Nest to create one, e.g. "Summarise my pipeline deals every morning"</p>
            </div>
          )}
        </section>
      </div>

      {timePickerMounted && (
        <>
          <div
            className="fixed inset-0 z-[80]"
            style={{
              backgroundColor: 'rgba(0,0,0,0.25)',
              opacity: timePickerVisible ? 1 : 0,
              transition: 'opacity 0.3s ease-out',
              willChange: 'opacity',
            }}
            onClick={() => setTimePickerOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-[20px] pb-[max(env(safe-area-inset-bottom,0px),16px)] px-6 pt-3"
            style={{
              transform: timePickerVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
              willChange: 'transform',
            }}
            onTransitionEnd={handleTimePickerTransitionEnd}
          >
            <div className="flex justify-center mb-5">
              <div className="w-9 h-[5px] rounded-full bg-gray-300" />
            </div>

            <p className="text-[13px] font-medium text-gray-400 uppercase tracking-wide text-center mb-6">
              {activeDef?.sheetLabel || 'Deliver every day at'}
            </p>

            {activeDef?.category === 'weekly' && (
              <div className="flex items-center justify-center mb-5">
                <select
                  value={selectedDay}
                  onChange={(e) => { setSelectedDay(e.target.value); haptic() }}
                  className="appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[17px] font-semibold text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  {DAYS_OF_WEEK.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-center gap-2.5 mb-2">
              <select
                value={selectedHour}
                onChange={(e) => setSelectedHour(Number(e.target.value))}
                className="appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[22px] font-semibold text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-gray-200"
                style={{ minWidth: 68 }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              <span className="text-[24px] font-semibold text-gray-300">:</span>

              <select
                value={selectedMinute}
                onChange={(e) => setSelectedMinute(Number(e.target.value))}
                className="appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[22px] font-semibold text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-gray-200"
                style={{ minWidth: 68 }}
              >
                {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>

              <div className="flex items-center bg-gray-100 p-0.5 rounded-xl">
                <button
                  onClick={() => { setSelectedPeriod('AM'); haptic() }}
                  className={cn(
                    "px-3 py-2.5 text-[14px] font-medium rounded-[10px] transition-colors",
                    selectedPeriod === 'AM' ? "text-gray-800 bg-white shadow-sm" : "text-gray-500"
                  )}
                >AM</button>
                <button
                  onClick={() => { setSelectedPeriod('PM'); haptic() }}
                  className={cn(
                    "px-3 py-2.5 text-[14px] font-medium rounded-[10px] transition-colors",
                    selectedPeriod === 'PM' ? "text-gray-800 bg-white shadow-sm" : "text-gray-500"
                  )}
                >PM</button>
              </div>
            </div>

            <p className="text-[12px] text-gray-400 text-center mb-7">
              {(userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone).replace(/_/g, ' ')}
            </p>

            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full rounded-full bg-gray-900 py-3.5 text-[15px] font-semibold text-white active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? '...' : automations.find(a => a.automation_type === timePickerTarget && a.active) ? 'Update' : 'Enable'}
            </button>

            {automations.find(a => a.automation_type === timePickerTarget && a.active) && (
              <button
                onClick={() => void handleDisable()}
                disabled={saving}
                className="w-full mt-3 text-[14px] text-red-400 hover:text-red-500 transition-colors py-2 disabled:opacity-50"
              >
                Disable
              </button>
            )}

            <button
              onClick={() => setTimePickerOpen(false)}
              className="w-full mt-1 mb-1 text-[14px] text-gray-400 hover:text-gray-600 transition-colors py-2"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AutomationCard({ icon, title, subtitle, description, active, onTap }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  description: string
  active?: boolean
  onTap?: () => void
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={() => {
        haptic()
        onTap?.()
      }}
      className="relative flex flex-col items-start rounded-2xl bg-white border border-gray-200/60 shadow-sm p-4 text-left transition-colors active:bg-gray-50"
    >
      {active && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-green-500"
        >
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </motion.div>
      )}
      <div className="mb-3">{icon}</div>
      <p className="text-[14px] font-medium text-gray-900 leading-tight">{title}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{subtitle || description}</p>
    </motion.button>
  )
}
