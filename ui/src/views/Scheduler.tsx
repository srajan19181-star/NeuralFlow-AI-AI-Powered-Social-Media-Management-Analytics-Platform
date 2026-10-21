import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import dayjs from 'dayjs'
import { useI18n } from '../locales'
import { PLATFORM_META, usePlatformsStore } from '../stores/platforms'
import { useComposeStore, type Destination, type Draft } from '../stores/compose'
import DraftSummary from '../components/scheduler/DraftSummary'
import BulkScheduleDialog, { type ScheduleResult } from '../components/scheduler/BulkScheduleDialog'

interface PlatformResult {
  processing?: boolean
  success: boolean
  postId?: string
  pageId?: string
  pageName?: string
  error?: string
}

interface ScheduledJob {
  _id: string
  postId: string
  content: string
  platforms: string[]
  destinations: { platform: string; accountId?: string; imageUrl?: string; videoUrl?: string }[]
  scheduledAt: string
  status: string
  bullJobId: string
  platformResults?: Record<string, PlatformResult>
  failReason?: string
}

interface CalendarDay {
  day: number | null
  date: string | null
  isToday: boolean
  jobs: ScheduledJob[]
}

interface BulkProgress {
  total: number
  completed: number
  failed: number
  status: string
  processed: number
}

const BULK_TONES = ['professional', 'casual', 'engaging', 'informative', 'humorous', 'inspirational']

export default function Scheduler() {
  const { t, tm } = useI18n()
  const platformsStore = usePlatformsStore()
  const composeStore = useComposeStore()

  const [mode, setMode] = useState<'scheduled' | 'calendar' | 'drafts'>('scheduled')
  const [draftView, setDraftView] = useState<'list' | 'cards'>(() => {
    return typeof localStorage !== 'undefined' && localStorage.getItem('scheduler.draftView') === 'cards' ? 'cards' : 'list'
  })

  useEffect(() => {
    try {
      localStorage.setItem('scheduler.draftView', draftView)
    } catch {
      // ignore
    }
  }, [draftView])

  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(false)
  const [activeStatus, setActiveStatus] = useState('pending')
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set())
  const [cancelNotice, setCancelNotice] = useState('')
  const [cancelError, setCancelError] = useState('')

  // Calendar
  const [calMonth, setCalMonth] = useState(() => dayjs().startOf('month'))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [calendarJobs, setCalendarJobs] = useState<ScheduledJob[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)

  // Drafts
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)

  // Bulk Draft Modal
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkTopics, setBulkTopics] = useState('')
  const [bulkTone, setBulkTone] = useState('engaging')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkBatchId, setBulkBatchId] = useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null)
  const [bulkDestinations, setBulkDestinations] = useState<Destination[]>([])
  const bulkPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopBulkPoll = useCallback(() => {
    if (bulkPollTimerRef.current !== null) {
      clearInterval(bulkPollTimerRef.current)
      bulkPollTimerRef.current = null
    }
  }, [])

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true)
    try {
      const res = await axios.get('/api/drafts')
      const fetched: Draft[] = res.data.drafts || []
      setDrafts(fetched)
      setSelectedDraftIds((prev) => new Set([...prev].filter((id) => fetched.some((d) => d._id === id))))
    } catch (err) {
      console.error(err)
    } finally {
      setDraftsLoading(false)
    }
  }, [])

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/scheduler/jobs?status=${activeStatus}`)
      setJobs(res.data.jobs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeStatus])

  const fetchCalendarJobs = useCallback(async () => {
    setCalendarLoading(true)
    try {
      const res = await axios.get('/scheduler/jobs?status=pending')
      setCalendarJobs(res.data.jobs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    if (mode === 'drafts') fetchDrafts()
    if (mode === 'calendar') fetchCalendarJobs()
  }, [mode, fetchDrafts, fetchCalendarJobs])

  useEffect(() => {
    platformsStore.fetchMetaConnections()
    fetchJobs()
    fetchDrafts()
    fetchCalendarJobs()
    return () => {
      stopBulkPoll()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelJob = async (bullJobId: string) => {
    if (cancellingIds.has(bullJobId)) return
    setCancellingIds((prev) => new Set([...prev, bullJobId]))
    setCancelNotice('')
    setCancelError('')
    const ws = String(axios.defaults.headers.common['X-Workspace-Id'] || 'default')
    try {
      await axios.delete(`/scheduler/jobs/${encodeURIComponent(bullJobId)}`)
      if (ws !== String(axios.defaults.headers.common['X-Workspace-Id'] || 'default')) return
      setJobs((prev) => prev.filter((j) => j.bullJobId !== bullJobId))
      setCalendarJobs((prev) => prev.filter((j) => j.bullJobId !== bullJobId))
      setCancelNotice(t('scheduler.returnedToDrafts'))
      await fetchDrafts()
    } catch (error) {
      if (ws === String(axios.defaults.headers.common['X-Workspace-Id'] || 'default')) {
        setCancelError(
          (error as { response?: { data?: { error?: string } } }).response?.data?.error || t('scheduler.cancelError')
        )
      }
    } finally {
      setCancellingIds((prev) => {
        const next = new Set(prev)
        next.delete(bullJobId)
        return next
      })
    }
  }

  const modeTabs = useMemo(() => [
    { value: 'scheduled' as const, label: t('scheduler.scheduledTab'), badge: null },
    { value: 'calendar'  as const, label: t('scheduler.calendarTab'),  badge: null },
    { value: 'drafts'    as const, label: t('scheduler.draftsTab'),    badge: drafts.length || null },
  ], [drafts.length, t])

  const statusOptions = useMemo(() => [
    { value: 'pending',   label: t('scheduler.statuses.pending') },
    { value: 'processing', label: t('scheduler.statuses.processing') },
    { value: 'published', label: t('scheduler.statuses.published') },
    { value: 'partial',   label: t('scheduler.statuses.partial') },
    { value: 'failed',    label: t('scheduler.statuses.failed') },
    { value: 'cancelled', label: t('scheduler.statuses.cancelled') },
  ], [t])

  const weekDays = (tm('scheduler.weekDaysShort') as string[]) || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const calMonthNames = (tm('scheduler.months') as string[]) || [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const calMonthLabel = `${calMonthNames[calMonth.month()]} ${calMonth.year()}`

  const calendarDays = useMemo((): CalendarDay[] => {
    const days: CalendarDay[] = []
    const daysInMonth = calMonth.daysInMonth()
    const firstDow = calMonth.day()
    const offset = (firstDow + 6) % 7 // Monday-first

    for (let i = 0; i < offset; i++) {
      days.push({ day: null, date: null, isToday: false, jobs: [] })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = calMonth.date(d)
      const dateStr = date.format('YYYY-MM-DD')
      days.push({
        day: d,
        date: dateStr,
        isToday: date.isSame(dayjs(), 'day'),
        jobs: calendarJobs.filter((j) => dayjs(j.scheduledAt).format('YYYY-MM-DD') === dateStr),
      })
    }
    while (days.length % 7 !== 0) {
      days.push({ day: null, date: null, isToday: false, jobs: [] })
    }
    return days
  }, [calMonth, calendarJobs])

  const calendarGridStyle: React.CSSProperties = {
    gridTemplateRows: `repeat(${calendarDays.length / 7}, 1fr)`,
    height: selectedDate ? 'auto' : '100%',
    minHeight: selectedDate ? undefined : '100%',
  }

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null
    return calendarDays.find((d) => d.date === selectedDate) ?? null
  }, [calendarDays, selectedDate])

  const selectedDayLabel = useMemo(() => {
    if (!selectedDate) return ''
    const d = dayjs(selectedDate)
    return `${d.date()} ${calMonthNames[d.month()]} ${d.year()}`
  }, [selectedDate, calMonthNames])

  const selectDay = (day: CalendarDay) => {
    if (!day.day || !day.date) return
    setSelectedDate((prev) => (prev === day.date ? null : day.date))
  }

  const prevMonth = () => {
    setCalMonth((prev) => prev.subtract(1, 'month'))
    setSelectedDate(null)
  }

  const nextMonth = () => {
    setCalMonth((prev) => prev.add(1, 'month'))
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCalMonth(dayjs().startOf('month'))
    setSelectedDate(null)
  }

  const selectedDrafts = useMemo(() =>
    drafts.filter((draft) => selectedDraftIds.has(draft._id)),
    [drafts, selectedDraftIds]
  )

  const allDraftsSelected = drafts.length > 0 && selectedDrafts.length === drafts.length

  const toggleDraftSelection = (id: string) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllDrafts = () => {
    setSelectedDraftIds(allDraftsSelected ? new Set() : new Set(drafts.map((draft) => draft._id)))
  }

  const onDraftsScheduled = (results: ScheduleResult[]) => {
    setSelectedDraftIds((prev) => {
      const next = new Set(prev)
      for (const result of results) {
        if (result.success) next.delete(result.draftId)
      }
      return next
    })
    void Promise.allSettled([fetchDrafts(), fetchJobs(), fetchCalendarJobs()])
  }

  const viewScheduledDrafts = () => {
    setShowScheduleDialog(false)
    setActiveStatus('pending')
    setMode('scheduled')
    fetchJobs()
  }

  const deleteDraft = async (id: string) => {
    try {
      await axios.delete(`/api/drafts/${id}`)
      setDrafts((prev) => prev.filter((d) => d._id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const selectedDests = (draft: Draft) => {
    return (draft.destinations || []).filter((d) => d.selected).map((d) => {
      const meta = PLATFORM_META[d.platform]
      const page = d.platform === 'facebook' ? platformsStore.connectedPages.find((p) => p.id === d.accountId) : undefined
      const instagram = d.platform === 'instagram' ? platformsStore.connectedIgAccounts.find((a) => a.id === d.accountId) : undefined
      const board = d.platform === 'pinterest' ? platformsStore.connectedPinterestBoards.find((b) => b.id === d.accountId) : undefined
      return {
        ...d,
        key: d.key || [d.platform, d.accountId].filter(Boolean).join(':'),
        label: page?.name || (instagram && `@${instagram.username}`) || board?.name || d.label || d.accountId || meta?.label || d.platform,
        color: d.color || meta?.color || '#9ca3af',
        picture: page?.picture || instagram?.avatar || d.picture,
      }
    })
  }

  function mediaName(url: string) {
    try { return decodeURIComponent(url.split('/').pop() ?? url) } catch { return url }
  }

  function formatDate(d: string) {
    return dayjs(d).format('D MMM YYYY, HH:mm')
  }

  function formatTime(d: string) {
    return dayjs(d).format('HH:mm')
  }

  function platformColor(p: string) {
    return PLATFORM_META[p]?.color ?? '#6b7280'
  }

  function firstPlatformColor(job: ScheduledJob) {
    return platformColor(job.platforms?.[0] ?? '')
  }

  function statusClass(status: string) {
    return ({
      pending:   'bg-yellow-900/40 text-yellow-400',
      running:   'bg-blue-900/40 text-blue-400',
      published: 'bg-green-900/40 text-green-400',
      partial:   'bg-orange-900/40 text-orange-400',
      completed: 'bg-green-900/40 text-green-400',
      failed:    'bg-red-900/40 text-red-400',
      cancelled: 'bg-gray-800 text-gray-500',
    } as Record<string, string>)[status] ?? 'bg-gray-800 text-gray-400'
  }

  function jobPlatformKeys(job: ScheduledJob): string[] {
    if (job.destinations?.length) return [...new Set(job.destinations.map((d) => d.platform))]
    return job.platforms || []
  }

  function jobMediaUrl(job: ScheduledJob): string | null {
    return (
      job.destinations?.find((d) => d.imageUrl || d.videoUrl)?.imageUrl ||
      job.destinations?.find((d) => d.videoUrl)?.videoUrl ||
      null
    )
  }

  function platformResultEntries(job: ScheduledJob): [string, PlatformResult][] {
    if (!job.platformResults) return []
    return Object.entries(job.platformResults)
  }

  // Bulk Draft Logic
  const openBulkModal = async () => {
    setShowBulkModal(true)
    setBulkBatchId(null)
    setBulkProgress(null)
    setBulkTopics('')
    setBulkTone('engaging')
    await platformsStore.fetchMetaConnections()
    composeStore.initDestinations()
    composeStore.destinations.forEach((d) => { d.selected = false })
    setBulkDestinations([...composeStore.destinations])
  }

  const toggleBulkDest = (key: string) => {
    setBulkDestinations((prev) =>
      prev.map((d) => (d.key === key ? { ...d, selected: !d.selected } : d))
    )
  }

  const closeBulkModal = () => {
    setShowBulkModal(false)
    stopBulkPoll()
  }

  const resetBulkModal = () => {
    setBulkBatchId(null)
    setBulkProgress(null)
    setBulkTopics('')
    setBulkDestinations((prev) => prev.map((d) => ({ ...d, selected: false })))
  }

  const submitBulkDraft = async () => {
    const topics = bulkTopics.split('\n').map((t) => t.trim()).filter(Boolean)
    if (!topics.length) return
    setBulkLoading(true)
    try {
      const res = await axios.post('/api/ai/bulk-draft', {
        topics,
        destinations: bulkDestinations,
        tone: bulkTone,
      })
      const batchId = res.data.batchId
      setBulkBatchId(batchId)
      setBulkProgress({ total: topics.length, completed: 0, failed: 0, status: 'processing', processed: 0 })
      stopBulkPoll()
      bulkPollTimerRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`/api/ai/bulk-draft/${batchId}`)
          setBulkProgress(pollRes.data)
          if (pollRes.data.status === 'done' || pollRes.data.status === 'failed') {
            stopBulkPoll()
            await fetchDrafts()
          }
        } catch (err) {
          console.error(err)
        }
      }, 2000)
    } catch (err) {
      console.error(err)
    } finally {
      setBulkLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950 text-gray-100">
      {/* Header + tabs */}
      <div
        className={`flex-shrink-0 mx-auto w-full px-6 pt-6 ${
          mode === 'drafts' && draftView === 'cards' ? 'max-w-6xl' : 'max-w-3xl'
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('scheduler.title')}</h1>
          <Link
            to="/compose"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t('scheduler.newSchedule')}
          </Link>
        </div>

        <div className="flex gap-1 mb-5 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {modeTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setMode(tab.value)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                mode === tab.value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
              {tab.badge && <span className="text-xs bg-gray-600 px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {(cancelNotice || cancelError) && (
        <div className="px-6 pb-4 mx-auto w-full max-w-6xl text-sm" role="status">
          {cancelNotice && (
            <div className="flex flex-wrap items-center gap-3 text-green-300">
              {cancelNotice} <button onClick={() => setMode('drafts')} className="underline">{t('scheduler.viewReturnedDrafts')}</button>
            </div>
          )}
          {cancelError && <p role="alert" className="text-red-300">{cancelError}</p>}
        </div>
      )}

      {/* ── Scheduled panel ── */}
      {mode === 'scheduled' && (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 mb-6">
              {statusOptions.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setActiveStatus(s.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    activeStatus === s.value
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'border-gray-800 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center text-gray-500 mt-20">{t('dashboard.loading')}</div>
            ) : !jobs.length ? (
              <div className="text-center text-gray-500 mt-20">
                <p className="text-4xl mb-4">📅</p>
                <p>{t('scheduler.noJobs')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job._id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 line-clamp-2 mb-2">{job.content || '(no content)'}</p>
                        {jobMediaUrl(job) && (
                          <p className="text-xs text-blue-400 mb-2 flex items-center gap-1 truncate">
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01" />
                            </svg>
                            <span className="truncate">{mediaName(jobMediaUrl(job)!)}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {jobPlatformKeys(job).map((p) => (
                            <span
                              key={p}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: `${platformColor(p)}22`, color: platformColor(p) }}
                            >
                              {t(`platforms.${p}`)}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500">{formatDate(job.scheduledAt)}</p>
                        {job.platformResults && (
                          <div className="mt-2 space-y-1">
                            {platformResultEntries(job).map(([key, result]) => (
                              <div key={key} className="flex items-start gap-2 text-xs">
                                {result.success ? (
                                  <span className="text-green-400 shrink-0 mt-px">✓</span>
                                ) : result.processing ? (
                                  <span className="text-blue-400 shrink-0 mt-px">…</span>
                                ) : (
                                  <span className="text-red-400 shrink-0 mt-px">✗</span>
                                )}
                                <span className="text-gray-400 shrink-0">{result.pageName || key}</span>
                                {result.success && result.postId && (
                                  <span className="text-gray-600 font-mono truncate">{result.postId}</span>
                                )}
                                {!result.success && result.error && (
                                  <span className="text-red-400 truncate">{result.error}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {job.failReason && <p className="mt-1 text-xs text-red-400">{job.failReason}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusClass(job.status)}`}>
                          {t(`scheduler.statuses.${job.status}`)}
                        </span>
                        {['pending', 'cancelling'].includes(job.status) && (
                          <button
                            onClick={() => cancelJob(job.bullJobId)}
                            disabled={cancellingIds.has(job.bullJobId)}
                            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors"
                          >
                            {t('scheduler.cancelToDraft')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Calendar panel ── */}
      {mode === 'calendar' && (
        <div className="flex-1 min-h-0 flex flex-col px-6 pb-6">
          <div className="flex-shrink-0 flex items-center gap-3 mb-4">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-lg font-semibold flex-1 text-center">{calMonthLabel}</span>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
            >
              {t('scheduler.goToToday')}
            </button>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="flex-shrink-0 grid grid-cols-7 gap-1 mb-1">
            {weekDays.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-600 py-1.5">
                {d}
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {calendarLoading ? (
              <div className="grid grid-cols-7 gap-1 h-full">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-gray-900 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1" style={calendarGridStyle}>
                  {calendarDays.map((day, i) => (
                    <div
                      key={i}
                      onClick={() => selectDay(day)}
                      className={`rounded-xl p-1.5 transition-colors border ${
                        day.day ? 'cursor-pointer hover:bg-gray-800 hover:border-gray-700' : 'cursor-default'
                      } ${day.isToday ? 'border-blue-600/50 bg-blue-950/20' : 'border-transparent bg-gray-900'} ${
                        selectedDate === day.date ? 'ring-1 ring-gray-500 bg-gray-800 border-gray-700' : ''
                      }`}
                    >
                      {day.day && (
                        <>
                          <span
                            className={`text-xs font-medium block mb-0.5 ${
                              day.isToday ? 'text-blue-400' : 'text-gray-400'
                            }`}
                          >
                            {day.day}
                          </span>
                          <div>
                            {day.jobs.slice(0, 3).map((job) => (
                              <div
                                key={job._id}
                                className="text-xs truncate rounded px-1 py-0.5 mt-0.5 leading-tight"
                                style={{ backgroundColor: `${firstPlatformColor(job)}2a`, color: firstPlatformColor(job) }}
                              >
                                {formatTime(job.scheduledAt)}
                              </div>
                            ))}
                            {day.jobs.length > 3 && (
                              <div className="text-xs text-gray-600 mt-0.5 px-1">
                                +{day.jobs.length - 3}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {selectedDayData && (
                  <div className="mt-4 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                      <p className="text-sm font-semibold text-gray-200">{selectedDayLabel}</p>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    {!selectedDayData.jobs.length ? (
                      <div className="px-4 py-6 text-center text-sm text-gray-600">
                        {t('scheduler.noJobsDay')}
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-800">
                        {selectedDayData.jobs.map((job) => (
                          <div key={job._id} className="px-4 py-3 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-500 mb-1 font-mono">{formatTime(job.scheduledAt)}</p>
                              <p className="text-sm text-gray-200 line-clamp-2 mb-2">{job.content || '(no content)'}</p>
                              <div className="flex flex-wrap gap-1">
                                {jobPlatformKeys(job).map((p) => (
                                  <span
                                    key={p}
                                    className="text-xs px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: `${platformColor(p)}22`, color: platformColor(p) }}
                                  >
                                    {t(`platforms.${p}`)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {['pending', 'cancelling'].includes(job.status) && (
                              <button
                                onClick={() => cancelJob(job.bullJobId)}
                                disabled={cancellingIds.has(job.bullJobId)}
                                className="text-xs text-red-400 hover:text-red-300 flex-shrink-0 px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                              >
                                {t('scheduler.cancelToDraft')}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Drafts panel ── */}
      {mode === 'drafts' && (
        <>
          <div
            className={`flex-shrink-0 mx-auto w-full px-6 pb-4 flex flex-wrap items-center justify-between gap-3 ${
              draftView === 'cards' ? 'max-w-6xl' : 'max-w-3xl'
            }`}
          >
            <div role="group" aria-label={t('scheduler.draftView')} className="flex gap-1 bg-gray-900 border border-gray-800 p-1 rounded-lg">
              {(['list', 'cards'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setDraftView(view)}
                  aria-pressed={draftView === view}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    draftView === view ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {t(view === 'list' ? 'scheduler.draftListView' : 'scheduler.draftCardsView')}
                </button>
              ))}
            </div>
            <button
              onClick={openBulkModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="text-base leading-none">✨</span>
              {t('scheduler.bulkDraft.openButton')}
            </button>
          </div>

          {Boolean(drafts.length) && (
            <div
              className={`mx-auto w-full px-6 pb-4 flex flex-wrap items-center gap-3 ${
                draftView === 'cards' ? 'max-w-6xl' : 'max-w-3xl'
              }`}
            >
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allDraftsSelected}
                  onChange={toggleAllDrafts}
                  className="accent-amber-500"
                />
                {t('scheduler.bulkSchedule.selectAll')}
              </label>
              <span className="text-xs text-gray-400">
                {t('scheduler.bulkSchedule.selectedCount', { count: selectedDrafts.length })}
              </span>
              <button
                onClick={() => setShowScheduleDialog(true)}
                disabled={!selectedDrafts.length || selectedDrafts.length > 500}
                className="ml-auto px-3 py-2 rounded-lg text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('scheduler.bulkSchedule.openButton')}
              </button>
              {selectedDrafts.length > 500 && (
                <p className="w-full text-xs text-amber-300">{t('scheduler.bulkSchedule.batchLimit')}</p>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pb-6">
            <div className={`mx-auto px-6 ${draftView === 'cards' ? 'max-w-6xl' : 'max-w-3xl'}`}>
              {draftsLoading ? (
                <div className="text-center text-gray-500 mt-20">{t('dashboard.loading')}</div>
              ) : !drafts.length ? (
                <div className="text-center text-gray-500 mt-20">
                  <p className="text-4xl mb-4">📝</p>
                  <p>{t('scheduler.noDrafts')}</p>
                </div>
              ) : (
                <div className={draftView === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch' : 'space-y-3'}>
                  {drafts.map((draft) => (
                    <DraftSummary
                      key={draft._id}
                      draft={draft}
                      destinations={selectedDests(draft)}
                      layout={draftView}
                      selected={selectedDraftIds.has(draft._id)}
                      onToggle={toggleDraftSelection}
                      onDelete={deleteDraft}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {showScheduleDialog && (
            <BulkScheduleDialog
              drafts={selectedDrafts}
              onClose={() => setShowScheduleDialog(false)}
              onScheduled={onDraftsScheduled}
              onViewScheduled={viewScheduledDrafts}
            />
          )}

          {/* Bulk Draft Modal */}
          {showBulkModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeBulkModal()
              }}
            >
              <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="flex items-start justify-between p-5 border-b border-gray-800 flex-shrink-0">
                  <div>
                    <p className="font-semibold">{t('scheduler.bulkDraft.title')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('scheduler.bulkDraft.subtitle')}</p>
                  </div>
                  <button onClick={closeBulkModal} className="text-gray-500 hover:text-gray-200 text-2xl leading-none mt-0.5 ml-4">
                    &times;
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('scheduler.bulkDraft.topicsLabel')}</label>
                    <textarea
                      value={bulkTopics}
                      onChange={(e) => setBulkTopics(e.target.value)}
                      rows={6}
                      placeholder={t('scheduler.bulkDraft.topicsPlaceholder')}
                      disabled={Boolean(bulkBatchId)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500 resize-none disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-600 mt-1">{t('scheduler.bulkDraft.topicsHint')}</p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('scheduler.bulkDraft.toneLabel')}</label>
                    <select
                      value={bulkTone}
                      onChange={(e) => setBulkTone(e.target.value)}
                      disabled={Boolean(bulkBatchId)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500 disabled:opacity-50"
                    >
                      {BULK_TONES.map((tone) => (
                        <option key={tone} value={tone}>
                          {t(`scheduler.bulkDraft.tones.${tone}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-2">{t('scheduler.bulkDraft.destinationsLabel')}</label>
                    {bulkDestinations.length ? (
                      <div className="flex flex-wrap gap-2">
                        {bulkDestinations.map((dest) => (
                          <button
                            key={dest.key}
                            onClick={() => !bulkBatchId && toggleBulkDest(dest.key)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              dest.selected
                                ? 'border-transparent text-white'
                                : 'border-gray-700 text-gray-400 bg-gray-800 hover:border-gray-600'
                            }`}
                            style={dest.selected ? { backgroundColor: dest.color, borderColor: dest.color } : {}}
                          >
                            {dest.picture && <img src={dest.picture} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />}
                            {dest.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">{t('scheduler.bulkDraft.noDestinations')}</p>
                    )}
                  </div>

                  {bulkProgress && (
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-200">{t('scheduler.bulkDraft.progress')}</p>
                        <span className="text-xs text-gray-400">{bulkProgress.processed} / {bulkProgress.total}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            bulkProgress.status === 'done'
                              ? 'bg-green-500'
                              : bulkProgress.status === 'failed'
                              ? 'bg-red-500'
                              : 'bg-violet-500 animate-pulse'
                          }`}
                          style={{
                            width: `${bulkProgress.total ? Math.round((bulkProgress.processed / bulkProgress.total) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs">
                        {bulkProgress.status === 'done' ? (
                          <span className="text-green-400">
                            {t('scheduler.bulkDraft.statusDone', { completed: bulkProgress.completed, failed: bulkProgress.failed })}
                          </span>
                        ) : bulkProgress.status === 'failed' ? (
                          <span className="text-red-400">{t('scheduler.bulkDraft.statusFailed')}</span>
                        ) : (
                          <span className="text-gray-400">
                            {t('scheduler.bulkDraft.statusGenerating', { count: bulkProgress.total - bulkProgress.processed })}
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0 p-5 border-t border-gray-800 flex items-center justify-end gap-3">
                  {bulkBatchId && bulkProgress?.status === 'processing' ? (
                    <button
                      onClick={closeBulkModal}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      {t('scheduler.bulkDraft.runInBackground')}
                    </button>
                  ) : (
                    <>
                      {bulkProgress?.status === 'done' && (
                        <>
                          <button
                            onClick={resetBulkModal}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                          >
                            {t('scheduler.bulkDraft.generateMore')}
                          </button>
                          <button
                            onClick={closeBulkModal}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            {t('scheduler.bulkDraft.viewDrafts')}
                          </button>
                        </>
                      )}
                      {(!bulkBatchId || bulkProgress?.status === 'failed') && (
                        <button
                          onClick={submitBulkDraft}
                          disabled={bulkLoading || !bulkTopics.trim()}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                        >
                          {bulkLoading ? t('scheduler.bulkDraft.generating') : t('scheduler.bulkDraft.generate')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
