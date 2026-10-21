import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import axios from 'axios'
import { useWorkspaceStore } from '../stores/workspace'
import { auditErrorMessage } from '../utils/analytics'
import { useI18n } from '../locales'
import { usePlatformsStore, PLATFORM_META } from '../stores/platforms'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayStat { date: string; count: number }
interface Summary {
  total: number
  imported: number
  deliveries: number
  published: number
  partial: number
  failed: number
  successRate: number
  byPlatform: Record<string, number>
  byDay: DayStat[]
  recentCount: number
}
interface Post {
  _id: unknown
  content: string
  destinations: Array<{ platform: string; accountId?: string }>
  platformResults: Record<string, { success: boolean; error?: string }>
  status: string
  publishedAt: string
  type: string
}
interface HourStat  { hour: number; avgEngagement: number; count: number }
interface DayEngStat { day: number; avgEngagement: number; count: number }
interface HeatCell  { day: number; hour: number; avg: number; count: number }
interface TopPost {
  platform: string; accountName: string; postId: string
  content: string | null; publishedAt: string
  metrics: { likes: number | null; comments: number | null; shares: number | null; views: number | null; reach?: number | null; saves: number | null; engagementTotal: number }
}
interface PlatformComp {
  platform: string; avgEngagement: number; avgLikes: number; avgComments: number; avgShares: number; totalPosts: number
}
interface Insights {
  empty: boolean
  total?: number
  byHour?: HourStat[]
  byDay?: DayEngStat[]
  heatmap?: HeatCell[]
  topPosts?: TopPost[]
  platformComparison?: PlatformComp[]
}

interface SyncJob {
  jobId: string
  status: string
  error?: string
  progress?: {
    count?: number
    step?: string
    completed?: number
    total?: number
    errors?: Array<{ account: string; error: string }>
    insightsUnavailable?: number
  }
}

interface AuditPeriod { mode: string; sampleSize: number; start: string | null; end: string | null; limited: boolean }
interface AuditSection { score: number; assessment: string; benchmark?: string }
interface Audit {
  historyPeriod?: AuditPeriod
  score: number
  summary: string
  postingFrequency: AuditSection
  engagement: AuditSection & { benchmark: string }
  contentMix: AuditSection
  recommendations: string[]
  stats: { postsLast30: number; postsLast7: number; postsPerWeek: number; platforms: string[]; successRate: number | null; avgEngagement: number }
}

interface ChannelAuditSection {
  name: string
  score: number
  assessment: string
  recommendations: string[]
}
interface ChannelAudit {
  historyPeriod?: AuditPeriod
  score: number
  sections: ChannelAuditSection[]
  topActions: string[]
  generatedAt: string
}

interface FilterAccount { key: string; platform: string; label: string }

// ── Chart constants ───────────────────────────────────────────────────────────

const CHART_W = 900
const CHART_H = 80
const DAY_COUNT = 30
const INSIGHT_CHART_H = 57

export default function Analytics() {
  const { t, tm } = useI18n()
  const platformsStore = usePlatformsStore()
  const workspaceStore = useWorkspaceStore()

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [postsTotal, setPostsTotal] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)

  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insights, setInsights] = useState<Insights | null>(null)

  const [syncJob, setSyncJob] = useState<SyncJob | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncSubmitting, setSyncSubmitting] = useState(false)
  const [historyScope, setHistoryScope] = useState('all')

  const [audit, setAudit] = useState<Audit | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')

  const [channelAudit, setChannelAudit] = useState<ChannelAudit | null>(null)
  const [channelAuditLoading, setChannelAuditLoading] = useState(false)
  const [channelAuditError, setChannelAuditError] = useState('')

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const disposedRef = useRef(false)
  const activeWorkspaceId = workspaceStore.activeWorkspaceId

  const crawling = syncSubmitting || ['queued', 'running'].includes(syncJob?.status || '')
  const canSync = !selectedAccount || /^(facebook|instagram)(:|$)/.test(selectedAccount)

  const scopeKey = useCallback(() => `${activeWorkspaceId}|${selectedAccount || ''}`, [activeWorkspaceId, selectedAccount])

  const accountParams = useCallback((extra: Record<string, unknown> = {}) => {
    return selectedAccount ? { account: selectedAccount, ...extra } : extra
  }, [selectedAccount])

  const load = useCallback(async () => {
    const scope = scopeKey()
    setLoading(true)
    try {
      const [sRes, pRes] = await Promise.all([
        axios.get('/api/analytics/summary', { params: accountParams() }),
        axios.get('/api/analytics/posts', { params: accountParams({ limit: 20 }) }),
      ])
      if (scope !== scopeKey() || disposedRef.current) return
      setSummary(typeof sRes.data === 'object' && sRes.data !== null && !Array.isArray(sRes.data) ? sRes.data : null)
      setPosts(Array.isArray(pRes.data?.posts) ? pRes.data.posts : [])
      setPostsTotal(typeof pRes.data?.total === 'number' ? pRes.data.total : 0)
    } catch {
      setSummary(null)
      setPosts([])
      setPostsTotal(0)
    } finally {
      if (scope === scopeKey() && !disposedRef.current) setLoading(false)
    }
  }, [accountParams, scopeKey])

  const loadMorePosts = useCallback(async () => {
    const scope = scopeKey()
    setLoadingMore(true)
    try {
      const res = await axios.get('/api/analytics/posts', { params: accountParams({ limit: 20, skip: (posts || []).length }) })
      if (scope === scopeKey() && !disposedRef.current) {
        if (Array.isArray(res.data?.posts)) {
          setPosts((prev) => [...(prev || []), ...res.data.posts])
        }
      }
    } catch {
      // ignore
    } finally {
      if (!disposedRef.current) setLoadingMore(false)
    }
  }, [accountParams, posts?.length, scopeKey])

  const loadInsights = useCallback(async () => {
    const scope = scopeKey()
    setInsightsLoading(true)
    try {
      const res = await axios.get('/api/analytics/insights', { params: accountParams() })
      if (scope === scopeKey() && !disposedRef.current) {
        setInsights(typeof res.data === 'object' && res.data !== null && !Array.isArray(res.data) ? res.data : null)
      }
    } catch {
      if (scope === scopeKey() && !disposedRef.current) setInsights(null)
    } finally {
      if (scope === scopeKey() && !disposedRef.current) setInsightsLoading(false)
    }
  }, [accountParams, scopeKey])

  const resumeSync = useCallback(async () => {
    const ws = activeWorkspaceId
    try {
      const res = await axios.get('/api/analytics/sync')
      if (ws !== workspaceStore.activeWorkspaceId || disposedRef.current) return
      const job = (typeof res.data === 'object' && res.data?.job) ? (res.data.job as SyncJob) : null
      setSyncJob((prev) => {
        const previous = prev?.status
        if (previous && ['queued', 'running'].includes(previous) && ['done', 'failed'].includes(job?.status || '')) {
          load()
          loadInsights()
        }
        return job
      })
      setSyncError('')
    } catch {
      if (ws === workspaceStore.activeWorkspaceId && !disposedRef.current) {
        setSyncError(t('analytics.syncRequestError'))
      }
    } finally {
      if (ws === workspaceStore.activeWorkspaceId && !disposedRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = setTimeout(resumeSync, 2000)
      }
    }
  }, [activeWorkspaceId, load, loadInsights, t, workspaceStore.activeWorkspaceId])

  const retrySync = useCallback(async () => {
    if (!syncJob) return
    const ws = activeWorkspaceId
    setSyncSubmitting(true)
    setSyncError('')
    try {
      const res = await axios.post(`/api/analytics/sync/${encodeURIComponent(syncJob.jobId)}/retry`)
      if (ws !== workspaceStore.activeWorkspaceId || disposedRef.current) return
      setSyncJob(res.data)
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(resumeSync, 2000)
    } catch {
      if (ws === workspaceStore.activeWorkspaceId) setSyncError(t('analytics.syncRequestError'))
    } finally {
      if (ws === workspaceStore.activeWorkspaceId) setSyncSubmitting(false)
    }
  }, [activeWorkspaceId, resumeSync, syncJob, t, workspaceStore.activeWorkspaceId])

  const crawlMetrics = useCallback(async () => {
    const ws = activeWorkspaceId
    setSyncSubmitting(true)
    setSyncError('')
    try {
      const res = await axios.post('/api/analytics/crawl', {
        history: historyScope,
        ...(selectedAccount && { account: selectedAccount }),
      })
      if (ws !== workspaceStore.activeWorkspaceId || disposedRef.current) return
      setSyncJob(res.data)
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(resumeSync, 2000)
    } catch {
      if (ws === workspaceStore.activeWorkspaceId) setSyncError(t('analytics.syncRequestError'))
    } finally {
      if (ws === workspaceStore.activeWorkspaceId) setSyncSubmitting(false)
    }
  }, [activeWorkspaceId, historyScope, resumeSync, selectedAccount, t, workspaceStore.activeWorkspaceId])

  const refreshAnalytics = useCallback(async () => {
    await Promise.all([load(), loadInsights(), resumeSync()])
  }, [load, loadInsights, resumeSync])

  const exportCsv = useCallback(() => {
    const params = new URLSearchParams()
    if (selectedAccount) params.set('account', selectedAccount)
    params.set('workspace', String(axios.defaults.headers.common['X-Workspace-Id'] || 'default'))
    const url = `/api/analytics/export?${params.toString()}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    a.click()
  }, [selectedAccount])

  const runAudit = useCallback(async () => {
    const scope = scopeKey()
    setAuditLoading(true)
    setAuditError('')
    setAudit(null)
    try {
      const res = await axios.post('/api/analytics/audit', {}, { params: accountParams() })
      if (scope === scopeKey() && !disposedRef.current) setAudit(res.data)
    } catch (error) {
      if (scope === scopeKey() && !disposedRef.current) setAuditError(auditErrorMessage(error, t('analytics.auditError')))
    } finally {
      if (scope === scopeKey() && !disposedRef.current) setAuditLoading(false)
    }
  }, [accountParams, scopeKey, t])

  const runChannelAudit = useCallback(async () => {
    const scope = scopeKey()
    setChannelAuditLoading(true)
    setChannelAuditError('')
    setChannelAudit(null)
    try {
      const res = await axios.post('/api/ai/channel-audit', { accountKey: selectedAccount || undefined })
      if (scope === scopeKey() && !disposedRef.current) setChannelAudit(res.data)
    } catch (error) {
      if (scope === scopeKey() && !disposedRef.current) setChannelAuditError(auditErrorMessage(error, t('analytics.channelAuditError')))
    } finally {
      if (scope === scopeKey() && !disposedRef.current) setChannelAuditLoading(false)
    }
  }, [scopeKey, selectedAccount, t])

  // Mount effect
  useEffect(() => {
    disposedRef.current = false
    platformsStore.fetchMetaConnections()
    load()
    loadInsights()
    resumeSync()
    return () => {
      disposedRef.current = true
      clearTimeout(syncTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Watch selectedAccount
  const isFirstAccountRun = useRef(true)
  useEffect(() => {
    if (isFirstAccountRun.current) {
      isFirstAccountRun.current = false
      return
    }
    setAudit(null)
    setChannelAudit(null)
    setAuditError('')
    setChannelAuditError('')
    setAuditLoading(false)
    setChannelAuditLoading(false)
    load()
    loadInsights()
  }, [selectedAccount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Watch activeWorkspaceId
  const isFirstWsRun = useRef(true)
  useEffect(() => {
    if (isFirstWsRun.current) {
      isFirstWsRun.current = false
      return
    }
    clearTimeout(syncTimerRef.current)
    setSelectedAccount(null)
    setSummary(null)
    setPosts([])
    setPostsTotal(0)
    setInsights(null)
    setSyncJob(null)
    setSyncError('')
    setSyncSubmitting(false)
    setAudit(null)
    setChannelAudit(null)
    setAuditError('')
    setChannelAuditError('')
    setAuditLoading(false)
    setChannelAuditLoading(false)
    platformsStore.fetchMetaConnections()
    load()
    loadInsights()
    resumeSync()
  }, [activeWorkspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Platform helpers
  const platformColor = (platform: string): string =>
    (PLATFORM_META as Record<string, { color: string }>)[platform]?.color ?? '#6b7280'

  const platformLabel = (platform: string): string =>
    (PLATFORM_META as Record<string, { label: string }>)[platform]?.label ?? platform

  function evidenceLabel(period: AuditPeriod) {
    const label = t(period.mode === 'historical' ? 'analytics.historicalEvidence' : 'analytics.recentEvidence', {
      count: period.sampleSize,
      start: period.start ? new Date(period.start).toLocaleDateString() : '—',
      end: period.end ? new Date(period.end).toLocaleDateString() : '—',
    })
    return period.limited ? `${label} ${t('analytics.limitedEvidence')}` : label
  }

  const filterAccounts = useMemo<FilterAccount[]>(() => {
    const list: FilterAccount[] = []
    for (const page of platformsStore.connectedPages) {
      list.push({ key: `facebook:${page.id}`, platform: 'facebook', label: page.name })
    }
    for (const acc of platformsStore.connectedIgAccounts) {
      list.push({ key: `instagram:${acc.id}`, platform: 'instagram', label: `@${acc.username}` })
    }
    if (summary?.byPlatform) {
      const metaPlats = new Set(['facebook', 'instagram'])
      for (const platform of Object.keys(summary.byPlatform)) {
        if (!metaPlats.has(platform)) {
          list.push({ key: platform, platform, label: platformLabel(platform) })
        }
      }
    }
    return list
  }, [platformsStore.connectedPages, platformsStore.connectedIgAccounts, summary?.byPlatform])

  const chartDays = useMemo<DayStat[]>(() => {
    const byDate = Object.fromEntries((summary?.byDay ?? []).map((d) => [d.date, d.count]))
    return Array.from({ length: DAY_COUNT }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (DAY_COUNT - 1 - i))
      const dateStr = d.toISOString().split('T')[0]
      return { date: dateStr, count: byDate[dateStr] ?? 0 }
    })
  }, [summary?.byDay])

  const maxCount = useMemo(() => Math.max(...chartDays.map((d) => d.count), 1), [chartDays])
  const barSlot = CHART_W / DAY_COUNT
  const barPad = 2

  function barH(count: number): number {
    if (count === 0) return 0
    return Math.max(4, (count / maxCount) * CHART_H * 0.95)
  }

  const platformEntries = useMemo(() =>
    Object.entries(summary?.byPlatform ?? {}).sort((a, b) => b[1] - a[1]),
    [summary?.byPlatform]
  )

  const platformCount = useMemo(() => Object.keys(summary?.byPlatform ?? {}).length, [summary?.byPlatform])
  const maxPlatformCount = useMemo(() => Math.max(...Object.values(summary?.byPlatform ?? {}), 1), [summary?.byPlatform])

  function platformBarWidth(count: number): number {
    return (count / maxPlatformCount) * 100
  }

  function statusWidth(count: number): number {
    const total = summary ? summary.total - summary.imported : 0
    return total ? (count / total) * 100 : 0
  }

  const auditSections = useMemo(() => {
    if (!audit) return []
    return [
      { key: 'frequency', label: t('analytics.auditFrequency'), score: audit.postingFrequency.score, assessment: audit.postingFrequency.assessment },
      { key: 'engagement', label: t('analytics.auditEngagement'), score: audit.engagement.score, assessment: audit.engagement.assessment, benchmark: audit.engagement.benchmark },
      { key: 'mix', label: t('analytics.auditMix'), score: audit.contentMix.score, assessment: audit.contentMix.assessment },
    ]
  }, [audit, t])

  function scoreColor(score: number): string {
    if (score >= 7) return 'text-green-400'
    if (score >= 4) return 'text-amber-400'
    return 'text-red-400'
  }

  function scoreBarColor(score: number): string {
    if (score >= 7) return 'bg-green-500'
    if (score >= 4) return 'bg-amber-500'
    return 'bg-red-500'
  }

  function benchmarkColor(benchmark: string): string {
    if (benchmark === 'Excellent') return 'text-green-400'
    if (benchmark === 'Good') return 'text-blue-400'
    if (benchmark === 'Average') return 'text-amber-400'
    return 'text-red-400'
  }

  const maxByHourAvg = useMemo(() =>
    Math.max(...(insights?.byHour ?? []).map((b) => b.avgEngagement), 1),
    [insights?.byHour]
  )
  const maxByDayAvg = useMemo(() =>
    Math.max(...(insights?.byDay ?? []).map((b) => b.avgEngagement), 1),
    [insights?.byDay]
  )

  function byHourBarH(avg: number): number {
    if (!avg) return 0
    return Math.max(3, (avg / maxByHourAvg) * INSIGHT_CHART_H * 0.95)
  }
  function byDayBarH(avg: number): number {
    if (!avg) return 0
    return Math.max(3, (avg / maxByDayAvg) * INSIGHT_CHART_H * 0.95)
  }

  const maxHeatmapAvg = useMemo(() =>
    Math.max(...(insights?.heatmap ?? []).map((c) => c.avg), 1),
    [insights?.heatmap]
  )

  function heatmapCellBg(avg: number): string {
    if (!avg) return 'rgba(59,130,246,0.05)'
    const intensity = avg / maxHeatmapAvg
    return `rgba(59,130,246,${(0.1 + intensity * 0.9).toFixed(2)})`
  }

  const heatmapGrid = useMemo<HeatCell[][]>(() => {
    const cells = insights?.heatmap ?? []
    return Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => cells[d * 24 + h] ?? { day: d, hour: h, avg: 0, count: 0 })
    )
  }, [insights?.heatmap])

  function postPlatforms(post: Post): string[] {
    if (post.platformResults) {
      return [...new Set(
        Object.keys(post.platformResults).map((k) => k.split(':')[0])
      )]
    }
    return [...new Set((post.destinations ?? []).map((d) => d.platform))]
  }

  function formatDate(iso: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  function capitalize(s: string): string {
    return s ? s[0].toUpperCase() + s.slice(1) : ''
  }

  const dayNamesShort = (tm('analytics.dayNamesShort') as string[]) || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('analytics.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('analytics.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runAudit}
              disabled={auditLoading}
              className="flex items-center gap-2 px-4 py-2 bg-violet-800 hover:bg-violet-700 border border-violet-700 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors"
            >
              <i className={`fa-solid fa-clipboard-check text-xs ${auditLoading ? 'animate-pulse' : ''}`}></i>
              {auditLoading ? t('analytics.runningAudit') : t('analytics.runAudit')}
            </button>
            <button
              onClick={runChannelAudit}
              disabled={channelAuditLoading}
              className="flex items-center gap-2 px-4 py-2 bg-sky-800 hover:bg-sky-700 border border-sky-700 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors"
            >
              <i className={`fa-solid fa-chart-bar text-xs ${channelAuditLoading ? 'animate-pulse' : ''}`}></i>
              {channelAuditLoading ? t('analytics.runningChannelAudit') : t('analytics.runChannelAudit')}
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition-colors"
            >
              <i className="fa-solid fa-file-csv text-xs"></i>
              {t('analytics.exportCsv')}
            </button>
            <button
              onClick={refreshAnalytics}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors"
            >
              <span className={loading ? 'animate-spin' : ''}>↻</span>
              {t('analytics.refresh')}
            </button>
          </div>
        </div>

        {/* History Sync */}
        <div className="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800 text-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-gray-400" htmlFor="history-scope">{t('analytics.historyScope')}</label>
            <select
              id="history-scope"
              value={historyScope}
              onChange={(e) => setHistoryScope(e.target.value)}
              disabled={crawling}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            >
              <option value="all">{t('analytics.allHistory')}</option>
              <option value="recent">{t('analytics.recentHistory')}</option>
            </select>
            <button
              onClick={crawlMetrics}
              disabled={crawling || !canSync}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded-lg"
            >
              {crawling ? t('analytics.crawling') : t('analytics.crawlMetrics')}
            </button>
            {syncJob?.status === 'failed' && (
              <button
                onClick={retrySync}
                disabled={crawling}
                className="px-3 py-2 border border-gray-700 rounded-lg"
              >
                {t('analytics.retrySync')}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">{t('analytics.historyHelp')}</p>
          {syncJob && (
            <p aria-live="polite" className="text-gray-300">
              {t(`analytics.syncStatus_${syncJob.status}`)} · {t('analytics.syncProgress', { count: syncJob.progress?.count || 0, completed: syncJob.progress?.completed || 0, total: syncJob.progress?.total || 0 })}
              {crawling && syncJob.progress?.step && <span> · {syncJob.progress.step}</span>}
            </p>
          )}
          {syncError && <p role="alert" className="text-red-300">{syncError}</p>}
          {syncJob?.error && <p className="text-red-300">{syncJob.error}</p>}
          {(syncJob?.progress?.errors || []).map((issue, index) => (
            <p key={index} className="text-amber-300">{issue.account}: {issue.error}</p>
          ))}
          {Boolean(syncJob?.progress?.insightsUnavailable) && (
            <p className="text-xs text-amber-300">
              {t('analytics.insightsUnavailable', { count: syncJob?.progress?.insightsUnavailable })}
            </p>
          )}
        </div>

        {/* Account filter chips */}
        {filterAccounts.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <span className="text-xs text-gray-500 shrink-0">{t('analytics.filterBy')}</span>
            <button
              onClick={() => setSelectedAccount(null)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                selectedAccount === null
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              {t('analytics.filterAll')}
            </button>
            {filterAccounts.map((acc) => (
              <button
                key={acc.key}
                onClick={() => setSelectedAccount(selectedAccount === acc.key ? null : acc.key)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors flex items-center gap-1.5 ${
                  selectedAccount === acc.key ? '' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                }`}
                style={
                  selectedAccount === acc.key
                    ? { borderColor: platformColor(acc.platform), background: platformColor(acc.platform) + '33', color: '#fff' }
                    : {}
                }
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: platformColor(acc.platform) }}></span>
                {acc.label}
              </button>
            ))}
          </div>
        )}

        {/* Audit error */}
        {auditError && (
          <div className="mb-6 p-3 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm flex items-center justify-between gap-3">
            {auditError}
            <button onClick={() => setAuditError('')} className="text-red-400 hover:text-red-200 shrink-0">✕</button>
          </div>
        )}

        {/* Audit results card */}
        {audit && (
          <div className="mb-8 bg-gray-900 border border-violet-800/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-clipboard-check text-violet-400"></i>
                  <span className="font-semibold text-white">{t('analytics.auditTitle')}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {t('analytics.auditStats', {
                    count: audit.stats.postsLast30,
                    freq: audit.stats.postsPerWeek,
                    rate: audit.stats.successRate === null ? '—' : `${audit.stats.successRate}%`,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t('analytics.auditScore')}</span>
                  <span
                    className={`text-lg font-bold px-2 py-0.5 rounded-lg ${
                      audit.score >= 70 ? 'text-green-300 bg-green-900/40' : audit.score >= 40 ? 'text-amber-300 bg-amber-900/40' : 'text-red-300 bg-red-900/40'
                    }`}
                  >
                    {audit.score}/100
                  </span>
                </div>
                <button onClick={() => setAudit(null)} className="text-gray-500 hover:text-gray-300 text-sm">
                  {t('analytics.auditDismiss')}
                </button>
              </div>
            </div>

            {audit.historyPeriod && (
              <p className="px-6 py-3 text-xs text-amber-200">{evidenceLabel(audit.historyPeriod)}</p>
            )}

            <div className="px-6 py-4 border-b border-gray-800 text-sm text-gray-300">{audit.summary}</div>

            {/* Score breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-x divide-gray-800 border-b border-gray-800">
              {auditSections.map((section) => (
                <div key={section.key} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">{section.label}</span>
                    <span className={`text-sm font-semibold ${scoreColor(section.score)}`}>{section.score}/10</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full mb-2">
                    <div className={`h-1.5 rounded-full transition-all ${scoreBarColor(section.score)}`} style={{ width: `${section.score * 10}%` }}></div>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{section.assessment}</p>
                  {section.benchmark && (
                    <p className={`text-xs mt-0.5 ${benchmarkColor(section.benchmark)}`}>{section.benchmark}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div className="px-6 py-4">
              <div className="text-xs font-medium text-gray-400 mb-2">{t('analytics.auditRecommendations')}</div>
              <ol className="space-y-1.5">
                {audit.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-200">
                    <span className="text-violet-400 font-semibold shrink-0">{i + 1}.</span>
                    {rec}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* Channel audit error */}
        {channelAuditError && (
          <div className="mb-6 p-3 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm flex items-center justify-between gap-3">
            {channelAuditError}
            <button onClick={() => setChannelAuditError('')} className="text-red-400 hover:text-red-200 shrink-0">✕</button>
          </div>
        )}

        {/* Channel audit results card */}
        {channelAudit && (
          <div className="mb-8 bg-gray-900 border border-sky-800/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <i className="fa-solid fa-chart-bar text-sky-400"></i>
                <span className="font-semibold text-white">{t('analytics.channelAuditTitle')}</span>
                {selectedAccount && <span className="text-xs text-gray-500 break-all">{selectedAccount}</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t('analytics.channelAuditScore')}</span>
                  <span
                    className={`text-lg font-bold px-2 py-0.5 rounded-lg ${
                      channelAudit.score >= 70 ? 'text-green-300 bg-green-900/40' : channelAudit.score >= 40 ? 'text-amber-300 bg-amber-900/40' : 'text-red-300 bg-red-900/40'
                    }`}
                  >
                    {channelAudit.score}/100
                  </span>
                </div>
                <button onClick={() => setChannelAudit(null)} className="text-gray-500 hover:text-gray-300 text-sm">
                  {t('analytics.channelAuditDismiss')}
                </button>
              </div>
            </div>

            {channelAudit.historyPeriod && (
              <p className="px-6 py-3 text-xs text-amber-200">{evidenceLabel(channelAudit.historyPeriod)}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-gray-800 border-b border-gray-800">
              {channelAudit.sections.map((section) => (
                <div key={section.name} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 font-medium">{section.name}</span>
                    <span className={`text-sm font-semibold ${scoreColor(section.score)}`}>{section.score}/10</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full mb-2">
                    <div className={`h-1.5 rounded-full transition-all ${scoreBarColor(section.score)}`} style={{ width: `${section.score * 10}%` }}></div>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed mb-2">{section.assessment}</p>
                  <ul className="space-y-0.5">
                    {section.recommendations.map((rec, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-gray-500">
                        <span className="text-sky-500 shrink-0">›</span>{rec}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="px-6 py-4">
              <div className="text-xs font-medium text-gray-400 mb-2">{t('analytics.channelAuditTopActions')}</div>
              <ol className="space-y-1.5">
                {channelAudit.topActions.map((action, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-200">
                    <span className="text-sky-400 font-semibold shrink-0">{i + 1}.</span>{action}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !summary ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            {t('analytics.loading')}
          </div>
        ) : summary && summary.total === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-500">
            <p className="text-lg">{t('analytics.empty')}</p>
            <p className="text-sm">{t('analytics.emptyHint')}</p>
          </div>
        ) : summary ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-xs text-gray-500 mb-1">{t('analytics.totalPosts')}</p>
                <p className="text-3xl font-bold text-white">{summary.total}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-xs text-gray-500 mb-1">{t('analytics.last7Days')}</p>
                <p className="text-3xl font-bold text-blue-400">{summary.recentCount}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-xs text-gray-500 mb-1">{t('analytics.platformsReached')}</p>
                <p className="text-3xl font-bold text-purple-400">{platformCount}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <p className="text-xs text-gray-500 mb-1">{t('analytics.successRate')}</p>
                <p
                  className={`text-3xl font-bold ${
                    !summary.deliveries
                      ? 'text-gray-400'
                      : summary.successRate >= 80
                      ? 'text-green-400'
                      : summary.successRate >= 50
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  }`}
                >
                  {summary.deliveries ? `${summary.successRate}%` : '—'}
                </p>
              </div>
            </div>

            {/* Posts per Day chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">{t('analytics.postsPerDay')}</h2>
                <span className="text-xs text-gray-500">{t('analytics.postsPerDaySubtitle')}</span>
              </div>

              {chartDays.every((d) => d.count === 0) ? (
                <div className="h-24 flex items-center justify-center text-sm text-gray-600">
                  {t('analytics.noActivity')}
                </div>
              ) : (
                <>
                  <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="w-full h-28">
                    {chartDays.map((day, i) => (
                      <g key={day.date}>
                        <rect
                          x={i * barSlot + barPad}
                          y={CHART_H - barH(day.count)}
                          width={barSlot - barPad * 2}
                          height={barH(day.count)}
                          className="fill-blue-500 opacity-80 hover:opacity-100 transition-opacity"
                          rx="2"
                        >
                          <title>{day.date}: {day.count}</title>
                        </rect>
                      </g>
                    ))}
                  </svg>
                  <div className="flex justify-between mt-1 text-xs text-gray-600">
                    <span>{chartDays[0]?.date?.slice(5)}</span>
                    <span>{chartDays[14]?.date?.slice(5)}</span>
                    <span>{chartDays[29]?.date?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Two-column: Platform breakdown + Status breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Platform Breakdown */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">{t('analytics.platformBreakdown')}</h2>
                {platformEntries.length === 0 ? (
                  <div className="text-sm text-gray-600">—</div>
                ) : (
                  <div className="space-y-3">
                    {platformEntries.map(([platform, count]) => (
                      <div key={platform} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: platformColor(platform) }}></span>
                            <span className="capitalize text-gray-300">{platformLabel(platform)}</span>
                          </span>
                          <span className="text-gray-500">{count} {t('analytics.successfulPosts')}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${platformBarWidth(count)}%`, background: platformColor(platform) }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Breakdown */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">{t('analytics.statusBreakdown')}</h2>
                <p className="text-xs text-gray-500 mb-4">{t('analytics.deliveryScope', { count: summary.imported })}</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-green-400">{t('analytics.published')}</span>
                      <span className="text-gray-500">{summary.published}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${statusWidth(summary.published)}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-yellow-400">{t('analytics.partial')}</span>
                      <span className="text-gray-500">{summary.partial}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${statusWidth(summary.partial)}%` }}></div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400">{t('analytics.failed')}</span>
                      <span className="text-gray-500">{summary.failed}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${statusWidth(summary.failed)}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Posts */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-white mb-4">{t('analytics.recentPosts')}</h2>

              {(!Array.isArray(posts) || posts.length === 0) ? (
                <div className="text-sm text-gray-600">{t('analytics.noRecentPosts')}</div>
              ) : (
                <div className="space-y-2">
                  {(Array.isArray(posts) ? posts : []).map((post) => (
                    <div
                      key={`${post.type}:${String(post._id)}`}
                      className="flex flex-wrap items-start gap-3 py-3 border-b border-gray-800 last:border-0"
                    >
                      <div className="flex-1 min-w-40">
                        <p className={`text-sm line-clamp-2 ${post.content ? 'text-gray-300' : 'text-gray-600 italic'}`}>
                          {post.content || t('analytics.noContent')}
                        </p>
                        <span className="text-xs text-gray-500">
                          {t(post.type === 'imported' ? 'analytics.importedSource' : 'analytics.appSource')}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1 shrink-0">
                        {postPlatforms(post).map((platform) => (
                          <span
                            key={platform}
                            className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ background: platformColor(platform) }}
                          >
                            {platformLabel(platform)}
                          </span>
                        ))}
                      </div>

                      <span className="text-xs text-gray-600 shrink-0 w-20 text-right">
                        {formatDate(post.publishedAt)}
                      </span>

                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          post.status === 'published'
                            ? 'bg-green-900/40 text-green-400'
                            : post.status === 'partial'
                            ? 'bg-yellow-900/40 text-yellow-400'
                            : 'bg-red-900/40 text-red-400'
                        }`}
                      >
                        {t(`analytics.status${capitalize(post.status)}`)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(Array.isArray(posts) ? posts.length : 0) < postsTotal && (
                <button
                  onClick={loadMorePosts}
                  disabled={loadingMore}
                  className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-40 rounded-xl text-sm transition-colors"
                >
                  {t('analytics.loadMore')}
                </button>
              )}
            </div>
          </>
        ) : null}

        {/* Advanced Insights */}
        {(!loading || summary) && (
          <div className="mt-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white">{t('analytics.insightsTitle')}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{t('analytics.insightsSubtitle')}</p>
            </div>

            {insightsLoading ? (
              <div className="flex items-center justify-center h-24 text-gray-500 text-sm">
                {t('analytics.loading')}
              </div>
            ) : !insights || insights.empty ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                <p className="text-gray-400 font-medium">{t('analytics.insightsEmpty')}</p>
                <p className="text-sm text-gray-600 mt-1">{t('analytics.insightsEmptyHint')}</p>
              </div>
            ) : (
              <>
                {/* Platform Comparison */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 overflow-x-auto">
                  <h3 className="text-sm font-semibold text-white mb-4">{t('analytics.platformCompTitle')}</h3>
                  <table className="w-full text-sm min-w-[540px]">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-800">
                        <th className="text-left pb-2 font-normal">Platform</th>
                        <th className="text-right pb-2 font-normal">{t('analytics.colAvgEngagement')}</th>
                        <th className="text-right pb-2 font-normal">{t('analytics.colAvgLikes')}</th>
                        <th className="text-right pb-2 font-normal">{t('analytics.colAvgComments')}</th>
                        <th className="text-right pb-2 font-normal">{t('analytics.colAvgShares')}</th>
                        <th className="text-right pb-2 font-normal">{t('analytics.colTracked')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(insights.platformComparison || []).map((row) => (
                        <tr key={row.platform} className="border-b border-gray-800/40 last:border-0">
                          <td className="py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: platformColor(row.platform) }}></span>
                              <span className="capitalize text-gray-300">{platformLabel(row.platform)}</span>
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-semibold text-blue-400">{row.avgEngagement}</td>
                          <td className="py-2.5 text-right text-gray-400">{row.avgLikes}</td>
                          <td className="py-2.5 text-right text-gray-400">{row.avgComments}</td>
                          <td className="py-2.5 text-right text-gray-400">{row.avgShares}</td>
                          <td className="py-2.5 text-right text-gray-500">{row.totalPosts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Best Time: By Hour + By Day */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Hour */}
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-baseline justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">{t('analytics.byHourTitle')}</h3>
                      <span className="text-xs text-gray-500">{t('analytics.bestTimeSubtitle')}</span>
                    </div>
                    <svg viewBox="0 0 480 60" preserveAspectRatio="none" className="w-full h-20">
                      {(insights.byHour || []).map((bar) => (
                        <g key={bar.hour}>
                          <rect
                            x={bar.hour * 20 + 2}
                            y={60 - byHourBarH(bar.avgEngagement)}
                            width={16}
                            height={byHourBarH(bar.avgEngagement) || 1}
                            className={bar.avgEngagement === maxByHourAvg && bar.avgEngagement > 0 ? 'fill-green-400' : 'fill-blue-500 opacity-70'}
                            rx="1"
                          >
                            <title>{bar.hour}:00 — avg {bar.avgEngagement}</title>
                          </rect>
                        </g>
                      ))}
                    </svg>
                    <div className="flex justify-between mt-1 text-xs text-gray-600 px-0.5">
                      <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
                    </div>
                  </div>

                  {/* By Day */}
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-baseline justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">{t('analytics.byDayTitle')}</h3>
                      <span className="text-xs text-gray-500">{t('analytics.bestTimeSubtitle')}</span>
                    </div>
                    <svg viewBox="0 0 280 60" preserveAspectRatio="none" className="w-full h-20">
                      {(insights.byDay || []).map((bar) => (
                        <g key={bar.day}>
                          <rect
                            x={bar.day * 40 + 4}
                            y={60 - byDayBarH(bar.avgEngagement)}
                            width={32}
                            height={byDayBarH(bar.avgEngagement) || 1}
                            className={bar.avgEngagement === maxByDayAvg && bar.avgEngagement > 0 ? 'fill-green-400' : 'fill-blue-500 opacity-70'}
                            rx="2"
                          >
                            <title>{dayNamesShort[bar.day]} — avg {bar.avgEngagement}</title>
                          </rect>
                        </g>
                      ))}
                    </svg>
                    <div className="flex justify-between mt-1 text-xs text-gray-600 px-1">
                      {dayNamesShort.map((name) => (
                        <span key={name}>{name}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Engagement Heatmap */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                  <div className="flex items-baseline justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">{t('analytics.heatmapTitle')}</h3>
                    <span className="text-xs text-gray-500">{t('analytics.heatmapSubtitle')}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="inline-block min-w-full">
                      <div className="flex items-center mb-1" style={{ paddingLeft: '28px' }}>
                        {Array.from({ length: 24 }, (_, h) => (
                          <div
                            key={h}
                            className="shrink-0 text-center text-xs text-gray-600"
                            style={{ width: '18px' }}
                          >
                            {h % 6 === 0 ? String(h) : ''}
                          </div>
                        ))}
                      </div>
                      {heatmapGrid.map((row, d) => (
                        <div key={d} className="flex items-center gap-px mb-px">
                          <span className="text-xs text-gray-600 shrink-0 text-right pr-1" style={{ width: '28px' }}>
                            {dayNamesShort[d]}
                          </span>
                          {row.map((cell) => (
                            <div
                              key={cell.hour}
                              className="shrink-0 rounded-sm"
                              style={{ width: '18px', height: '14px', background: heatmapCellBg(cell.avg) }}
                              title={`${dayNamesShort[d]} ${cell.hour}:00 — avg ${cell.avg}`}
                            ></div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top Performing Posts */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">{t('analytics.topPostsTitle')}</h3>
                  {(insights.topPosts || []).length === 0 ? (
                    <div className="text-sm text-gray-600">{t('analytics.noTopPosts')}</div>
                  ) : (
                    <div className="space-y-0">
                      {(insights.topPosts || []).map((post) => (
                        <div
                          key={post.postId}
                          className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-0"
                        >
                          <span className="shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ background: platformColor(post.platform) }}></span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500 mb-0.5">{platformLabel(post.platform)} · {formatDate(post.publishedAt)}</p>
                            <p className={`text-sm line-clamp-2 ${post.content ? 'text-gray-300' : 'text-gray-600 italic'}`}>
                              {post.content || t('analytics.noContent')}
                            </p>
                          </div>
                          <div className="shrink-0 text-right space-y-0.5">
                            <p className="text-sm font-semibold text-blue-400">{post.metrics.engagementTotal}</p>
                            <p className="text-xs text-gray-600">
                              ❤ {post.metrics.likes ?? '—'} · 💬 {post.metrics.comments ?? '—'}
                              {post.metrics.shares ? <> · ↗ {post.metrics.shares}</> : null}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
