import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useWorkspaceStore } from '../stores/workspace'
import { usePlatformsStore, PLATFORM_META } from '../stores/platforms'
import { useComposeStore } from '../stores/compose'
import { useI18n } from '../locales'

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C', icon: 'fa-brands fa-instagram' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2', icon: 'fa-brands fa-facebook' },
  { key: 'twitter', label: 'Twitter/X', color: '#000000', icon: 'fa-brands fa-x-twitter' },
  { key: 'tiktok', label: 'TikTok', color: '#EE1D52', icon: 'fa-brands fa-tiktok' },
  { key: 'pinterest', label: 'Pinterest', color: '#E60023', icon: 'fa-brands fa-pinterest' },
  { key: 'mastodon', label: 'Mastodon', color: '#6364FF', icon: 'fa-brands fa-mastodon' },
  { key: 'bluesky', label: 'Bluesky', color: '#0085FF', icon: 'fa-brands fa-bluesky' },
]

interface ProfileAccount {
  key: string
  label: string
}

const POLL_INTERVAL_MS = 2000
const JOB_TIMEOUT_MS = 20 * 60 * 1000

export default function CalendarPlan() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspaceStore = useWorkspaceStore()
  const platformsStore = usePlatformsStore()
  const composeStore = useComposeStore()

  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [selectedAccount, setSelectedAccount] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook', 'instagram'])
  const [postsPerWeek, setPostsPerWeek] = useState(3)
  const [instagramPlacement, setInstagramPlacement] = useState('feed')
  const [campaignContext, setCampaignContext] = useState('')
  const [savedPlans, setSavedPlans] = useState<any[]>([])
  const [selectedSavedPlan, setSelectedSavedPlan] = useState('')
  const [chatProvider, setChatProvider] = useState<'claude' | 'chatgpt'>('claude')
  const [showChatPrompt, setShowChatPrompt] = useState(false)
  const [chatPromptCopied, setChatPromptCopied] = useState(false)

  const [loading, setLoading] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [error, setError] = useState('')
  const [calendar, setCalendar] = useState<any>(null)

  const [briefLoading, setBriefLoading] = useState(false)
  const [pendingBrief, setPendingBrief] = useState<any>(null)
  const [pendingBriefMonthName, setPendingBriefMonthName] = useState('')
  const [progress, setProgress] = useState<{ step: string; completed: number; total: number } | null>(null)

  const chatAppName = chatProvider === 'chatgpt' ? 'ChatGPT' : 'Claude'

  const chatPrompt = useMemo(
    () =>
      [
        `Use the SocialManager MCP connector to create and save a content plan. Write the content in this ${chatAppName} conversation; do not invoke a generation API.`,
        `Workspace: ${workspaceStore.activeWorkspace?.name || ''} (${workspaceStore.activeWorkspaceId}). Read get_workspace_context for this exact workspace first.`,
        `Month: ${selectedMonth}. Platforms: ${selectedPlatforms.join(', ')}. Posts per week per platform: ${postsPerWeek} for weeks 1–4.`,
        selectedAccount ? `Account profile: ${selectedAccount}` : 'Use the workspace brand context.',
        `Campaign context and source posts: ${JSON.stringify(campaignContext.trim())}`,
        'Use numbered source posts for the corresponding opening posts in order. Preserve facts and explicit wording requirements and adapt to each platform. Do not invent product claims.',
        'Write a narrative brief and platform-specific posts, then use save_content_plan with a stable requestId, the exact campaignContext, and this workspaceId. Include week, suggestedDay, suggestedTime, hashtags and postType for each post.',
        `Instagram format: ${instagramPlacement}. Include instagramPlacement on each Instagram post. Feed images are 3:4; Story/Reel scenes are 9:16.`,
        'Return the saved plan link. Do not publish or schedule anything unless I separately request it and confirm its preview.',
      ].join('\n\n'),
    [chatAppName, workspaceStore.activeWorkspace, workspaceStore.activeWorkspaceId, selectedMonth, selectedPlatforms, postsPerWeek, selectedAccount, campaignContext, instagramPlacement]
  )

  const connectedAccounts = useMemo((): ProfileAccount[] => {
    const list: ProfileAccount[] = []
    for (const [platform] of Object.entries(PLATFORM_META)) {
      if (['facebook', 'instagram', 'pinterest', 'tiktok'].includes(platform)) continue
      if (platformsStore.isConnected(platform)) {
        list.push({ key: platform, label: platform.charAt(0).toUpperCase() + platform.slice(1) })
      }
    }
    for (const page of platformsStore.connectedPages) {
      list.push({ key: `facebook:${page.id}`, label: page.name })
    }
    for (const acc of platformsStore.connectedIgAccounts) {
      list.push({ key: `instagram:${acc.id}`, label: `@${acc.username}` })
    }
    return list
  }, [platformsStore.statuses, platformsStore.connectedPages, platformsStore.connectedIgAccounts])

  function platformColor(p: string): string {
    return PLATFORMS.find((x) => x.key === p)?.color ?? '#6b7280'
  }

  function platformIcon(p: string): string {
    return PLATFORMS.find((x) => x.key === p)?.icon ?? 'fa-solid fa-globe'
  }

  function postsForPlatform(platform: string) {
    return (calendar?.posts ?? []).filter((p: any) => p.platform === platform)
  }

  function progressLabel(): string {
    if (!progress || !progress.total) return ''
    const stepLabel =
      progress.step === 'brief'
        ? t('calendarPlan.progressBrief')
        : PLATFORMS.find((x) => x.key === progress.step)?.label ?? progress.step
    return t('calendarPlan.progress', { step: stepLabel, completed: progress.completed, total: progress.total })
  }

  function errorMessage(err: any, fallback: string): string {
    return err?.response?.data?.error || err?.message || fallback
  }

  async function copyChatPrompt(provider: 'claude' | 'chatgpt') {
    setChatProvider(provider)
    setShowChatPrompt(true)
    setChatPromptCopied(false)
    try {
      await navigator.clipboard.writeText(chatPrompt)
      setChatPromptCopied(true)
    } catch {
      // ignore
    }
  }

  const refreshSavedPlans = useCallback(async () => {
    try {
      const res = await axios.get('/api/ai/content-calendars')
      setSavedPlans(res.data.calendars || [])
    } catch {
      // ignore
    }
  }, [])

  async function loadSavedPlan(id: string) {
    if (!id) return
    try {
      const saved = (await axios.get(`/api/ai/content-calendar/${encodeURIComponent(id)}`)).data
      setCalendar(saved)
      setSelectedMonth(saved.month)
      setSelectedPlatforms(saved.platforms || [])
      setSelectedAccount(saved.accountKey || '')
      setInstagramPlacement(
        saved.instagramPlacement ||
          saved.posts?.find((p: any) => p.platform === 'instagram')?.instagramPlacement ||
          'feed'
      )
      setPostsPerWeek(saved.postsPerWeek || 3)
      setCampaignContext(saved.campaignContext || '')
      setError('')
    } catch (err: any) {
      setError(errorMessage(err, 'Could not load the saved content plan'))
    }
  }

  async function runAiJob(url: string, body: Record<string, unknown>): Promise<any> {
    const start = await axios.post(url, body)
    const jobId: string = start.data.jobId
    if (!jobId) return start.data
    const deadline = Date.now() + JOB_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      const res = await axios.get(`/api/ai/jobs/${jobId}`)
      setProgress(res.data.progress ?? null)
      if (res.data.status === 'done') return res.data.result
      if (res.data.status === 'failed') throw new Error(res.data.error || 'AI job failed')
    }
    throw new Error(t('calendarPlan.jobTimedOut'))
  }

  async function generateBrief() {
    if (!selectedPlatforms.length) return
    setBriefLoading(true)
    setError('')
    setCalendar(null)
    setProgress(null)
    try {
      const result = await runAiJob('/api/ai/content-brief', {
        accountKey: selectedAccount || undefined,
        platforms: selectedPlatforms,
        instagramPlacement,
        month: selectedMonth,
        campaignContext: campaignContext.trim(),
      })
      setPendingBrief(result.brief)
      setPendingBriefMonthName(result.monthName)
    } catch (err: any) {
      setError(errorMessage(err, 'Brief generation failed'))
    } finally {
      setBriefLoading(false)
      setProgress(null)
    }
  }

  async function approveAndGenerate() {
    if (!pendingBrief) return
    setLoading(true)
    setError('')
    setProgress(null)
    try {
      const cal = await runAiJob('/api/ai/content-calendar', {
        accountKey: selectedAccount || undefined,
        platforms: selectedPlatforms,
        instagramPlacement,
        month: selectedMonth,
        campaignContext: campaignContext.trim(),
        approvedBrief: pendingBrief,
        postsPerWeek,
      })
      setCalendar(cal)
      setPendingBrief(null)
      refreshSavedPlans()
    } catch (err: any) {
      setError(errorMessage(err, 'Calendar generation failed'))
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  async function generate() {
    if (!selectedPlatforms.length) return
    setLoading(true)
    setError('')
    setPendingBrief(null)
    setProgress(null)
    try {
      const cal = await runAiJob('/api/ai/content-calendar', {
        accountKey: selectedAccount || undefined,
        platforms: selectedPlatforms,
        instagramPlacement,
        month: selectedMonth,
        campaignContext: campaignContext.trim(),
        postsPerWeek,
      })
      setCalendar(cal)
      refreshSavedPlans()
    } catch (err: any) {
      setError(errorMessage(err, 'Calendar generation failed'))
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  function computeScheduledDate(month: string, week: number, suggestedDay: string, suggestedTime: string): string {
    const DAY_MAP: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    }
    const firstDay = new Date(`${month}-01`)
    const targetDow = DAY_MAP[suggestedDay] ?? 1
    const firstDow = firstDay.getDay()
    const offset = (targetDow - firstDow + 7) % 7
    const d = new Date(firstDay)
    d.setDate(1 + offset + (week - 1) * 7)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${suggestedTime || '09:00'}`
  }

  function exportCalendarCsv() {
    if (!calendar?.posts?.length) return
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`
    const header = ['Platform', 'Week', 'Suggested Day', 'Suggested Time', 'Post Type', 'Content', 'Hashtags']
    const rows = calendar.posts.map((p: any) =>
      [
        p.platform,
        p.week,
        p.suggestedDay || '',
        p.suggestedTime || '',
        p.postType || '',
        escape(p.content),
        (p.hashtags || []).join(' '),
      ].join(',')
    )
    const csv = '\ufeff' + [header.join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `content-plan-${calendar.month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function draftPost(post: any) {
    composeStore.content = post.content
    if (post.week && post.suggestedDay) {
      composeStore.scheduledAt = computeScheduledDate(
        selectedMonth,
        post.week,
        post.suggestedDay,
        post.suggestedTime || '09:00'
      )
    }
    navigate(`/compose${post.instagramPlacement ? `?instagramPlacement=${post.instagramPlacement}` : ''}`)
  }

  async function saveAllDrafts() {
    if (!calendar?.posts?.length) return
    setSavingAll(true)
    try {
      for (const post of calendar.posts) {
        const scheduledAt =
          post.week && post.suggestedDay
            ? computeScheduledDate(calendar.month, post.week, post.suggestedDay, post.suggestedTime || '09:00')
            : ''
        await axios.post('/api/drafts', {
          content: post.content,
          instagramPlacement: post.instagramPlacement,
          mediaUrl: '',
          scheduledAt,
          destinations: [],
        })
      }
      alert(`Saved ${calendar.posts.length} drafts — find them in Scheduler → Drafts.`)
    } catch {
      setError('Failed to save some drafts')
    } finally {
      setSavingAll(false)
    }
  }

  useEffect(() => {
    setPendingBrief(null)
    setPendingBriefMonthName('')
    setChatPromptCopied(false)
  }, [campaignContext, selectedMonth, selectedAccount, instagramPlacement, selectedPlatforms])

  useEffect(() => {
    platformsStore.fetchMetaConnections()
    refreshSavedPlans()
    const calParam = searchParams.get('calendar')
    if (calParam) {
      setSelectedSavedPlan(calParam)
      loadSavedPlan(calParam)
    }
  }, [])

  function togglePlatform(key: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">{t('calendarPlan.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('calendarPlan.subtitle')}</p>
        </div>

        <div className="mb-5">
          <label htmlFor="saved-content-plan" className="block text-xs text-gray-400 mb-1.5">
            {t('calendarPlan.savedPlans')}
          </label>
          <select
            id="saved-content-plan"
            value={selectedSavedPlan}
            onChange={(e) => {
              setSelectedSavedPlan(e.target.value)
              loadSavedPlan(e.target.value)
            }}
            disabled={loading || briefLoading}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
          >
            <option value="">{t('calendarPlan.chooseSavedPlan')}</option>
            {savedPlans.map((plan) => (
              <option key={plan.calendarId} value={plan.calendarId}>
                {plan.monthName} — {plan.brief?.theme || plan.calendarId}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-gray-400 mb-4">
          {t('calendarPlan.chatWorkflowHint')}{' '}
          <a href="/local-assistant" className="text-violet-300 underline">
            {t('localConnector.openAssistant')}
          </a>
        </p>

        {/* Configuration card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <fieldset disabled={loading || briefLoading} className="min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">{t('calendarPlan.month')}</label>
                <input
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  type="month"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">{t('calendarPlan.account')}</label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                >
                  <option value="">{t('calendarPlan.allAccounts')}</option>
                  {connectedAccounts.map((acc) => (
                    <option key={acc.key} value={acc.key}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">{t('calendarPlan.postsPerWeek')}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPostsPerWeek((v) => Math.max(1, v - 1))}
                    className="w-8 h-9 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-medium transition-colors"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-sm font-semibold text-white">{postsPerWeek}</span>
                  <button
                    type="button"
                    onClick={() => setPostsPerWeek((v) => Math.min(7, v + 1))}
                    className="w-8 h-9 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-medium transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="text-[11px] text-gray-600 mt-1 text-center">
                  {t('calendarPlan.postsPerWeekHint', {
                    total: postsPerWeek * 4,
                    grand: selectedPlatforms.length * postsPerWeek * 4,
                  })}
                </p>
              </div>
            </div>

            <div className="mb-5">
              <label htmlFor="campaign-context" className="block text-xs text-gray-400 mb-1.5">
                {t('calendarPlan.contextLabel')}
              </label>
              <textarea
                id="campaign-context"
                value={campaignContext}
                onChange={(e) => setCampaignContext(e.target.value)}
                rows={6}
                maxLength={20000}
                disabled={loading || briefLoading}
                placeholder={t('calendarPlan.contextPlaceholder')}
                aria-describedby="campaign-context-hint"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500 disabled:opacity-60 resize-y"
              />
              <div className="flex justify-between gap-4 mt-1">
                <p id="campaign-context-hint" className="text-xs text-gray-500">
                  {t('calendarPlan.contextHint')}
                </p>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {campaignContext.length.toLocaleString()} / 20,000
                </span>
              </div>
            </div>

            {selectedPlatforms.includes('instagram') && (
              <label className="block text-xs text-gray-400 mb-4">
                {t('instagramPublishing.title')}
                <select
                  value={instagramPlacement}
                  onChange={(e) => setInstagramPlacement(e.target.value)}
                  className="ml-2 bg-gray-800 rounded p-2"
                >
                  <option value="feed">{t('instagramPublishing.feed')} · 3:4</option>
                  <option value="story">{t('instagramPublishing.story')} · 9:16</option>
                  <option value="reel">{t('instagramPublishing.reel')} · 9:16</option>
                </select>
              </label>
            )}

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-400 mb-2">{t('calendarPlan.platforms')}</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => {
                    const isSelected = selectedPlatforms.includes(p.key)
                    return (
                      <label
                        key={p.key}
                        onClick={() => togglePlatform(p.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSelected ? 'text-white border-transparent' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                        style={isSelected ? { background: `${p.color}33`, borderColor: p.color } : {}}
                      >
                        <i className={`${p.icon} text-[11px]`} />
                        {p.label}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyChatPrompt('chatgpt')}
                  disabled={!selectedPlatforms.length}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                >
                  {t('calendarPlan.copyChatgptPrompt')}
                </button>
                <button
                  type="button"
                  onClick={() => copyChatPrompt('claude')}
                  disabled={!selectedPlatforms.length}
                  className="px-4 py-2 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                >
                  {t('calendarPlan.copyClaudePrompt')}
                </button>
                <button
                  type="button"
                  onClick={generateBrief}
                  disabled={briefLoading || loading || !selectedPlatforms.length}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  <i className={`fa-solid fa-file-lines text-xs ${briefLoading ? 'animate-pulse' : ''}`} />
                  {briefLoading ? t('calendarPlan.generatingBrief') : t('calendarPlan.generateBrief')}
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={loading || !selectedPlatforms.length}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  <i className={`fa-solid fa-calendar-days text-xs ${loading ? 'animate-pulse' : ''}`} />
                  {loading ? t('calendarPlan.generating') : t('calendarPlan.generate')}
                </button>
              </div>
            </div>
          </fieldset>
        </div>

        {showChatPrompt && (
          <div className="bg-gray-900 border border-amber-800/50 rounded-2xl p-5 mb-6">
            <p className="text-sm text-amber-200 mb-2">
              {chatPromptCopied
                ? t('calendarPlan.chatPromptCopied', { app: chatAppName })
                : t('calendarPlan.chatPromptReady', { app: chatAppName })}
            </p>
            <textarea
              value={chatPrompt}
              readOnly
              rows={8}
              aria-label={t('calendarPlan.chatPromptLabel', { app: chatAppName })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200"
            />
            <p className="text-xs text-gray-400 mt-2">{t('calendarPlan.chatPromptHint', { app: chatAppName })}</p>
            <a
              href={chatProvider === 'chatgpt' ? 'https://chatgpt.com/' : 'https://claude.ai/new'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-sm text-amber-300 underline"
            >
              {t('calendarPlan.openChatApp', { app: chatAppName })}
            </a>
            <a
              href={`/global-settings#${chatProvider}-connector`}
              className="ml-4 text-xs text-gray-400 underline"
            >
              {t('calendarPlan.connectorSetup')}
            </a>
          </div>
        )}

        {/* Brief preview */}
        {pendingBrief && !calendar && (
          <div className="bg-gray-900 border border-sky-800/50 rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-file-lines text-sky-400 text-sm" />
                <h2 className="font-semibold text-white">{t('calendarPlan.briefPreviewTitle')}</h2>
                <span className="text-xs text-gray-500">{pendingBriefMonthName}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={generateBrief}
                  disabled={briefLoading || loading}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-gray-200 transition-colors"
                >
                  <i className={`fa-solid fa-rotate-right text-[10px] ${briefLoading ? 'animate-spin' : ''}`} />
                  {t('calendarPlan.regenerateBrief')}
                </button>
                <button
                  onClick={approveAndGenerate}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-lg text-white font-medium transition-colors"
                >
                  <i className={`fa-solid fa-check text-xs ${loading ? 'animate-pulse' : ''}`} />
                  {loading ? t('calendarPlan.generating') : t('calendarPlan.approveBrief')}
                </button>
              </div>
            </div>

            <div className="p-4 bg-sky-950/40 border border-sky-800/30 rounded-xl mb-4">
              <div className="text-xs text-sky-400 font-medium mb-1">{t('calendarPlan.theme')}</div>
              <p className="text-sm text-gray-200">{pendingBrief.theme}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {pendingBrief.pillars?.length > 0 && (
                <div>
                  <div className="text-xs text-gray-400 mb-2">{t('calendarPlan.pillars')}</div>
                  <ul className="space-y-1">
                    {pendingBrief.pillars.map((p: string) => (
                      <li key={p} className="flex gap-1.5 text-xs text-gray-300">
                        <span className="text-sky-400">▪</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pendingBrief.toneGuidance && (
                <div>
                  <div className="text-xs text-gray-400 mb-2">{t('calendarPlan.toneGuidance')}</div>
                  <p className="text-xs text-gray-300 italic">{pendingBrief.toneGuidance}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {(loading || briefLoading) && progress && (
          <div className="mb-6 p-4 bg-gray-900 border border-violet-800/40 rounded-2xl">
            <div className="flex items-center justify-between text-xs text-gray-300 mb-2">
              <span className="flex items-center gap-2">
                <i className="fa-solid fa-circle-notch animate-spin text-violet-400" />
                {progressLabel()}
              </span>
              <span className="text-gray-500">{t('calendarPlan.progressHint')}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{
                  width: progress.total
                    ? `${Math.max(5, Math.round((progress.completed / progress.total) * 100))}%`
                    : '5%',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-900/40 border border-red-700 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Calendar results */}
        {calendar && (
          <div>
            <div className="bg-gray-900 border border-violet-800/40 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-white">{t('calendarPlan.briefTitle')}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{calendar.monthName}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportCalendarCsv}
                    className="flex items-center gap-1.5 text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-200 transition-colors"
                  >
                    <i className="fa-solid fa-file-csv text-xs" />
                    {t('calendarPlan.exportCsv')}
                  </button>
                  <button
                    onClick={saveAllDrafts}
                    disabled={savingAll}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-white transition-colors"
                  >
                    <i className="fa-solid fa-floppy-disk text-xs" />
                    {savingAll
                      ? t('calendarPlan.savingAll')
                      : t('calendarPlan.saveAllDraftsScheduled', { count: calendar.posts.length })}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl mb-4">
                <div className="text-xs text-violet-400 font-medium mb-1">{t('calendarPlan.theme')}</div>
                <p className="text-sm text-gray-200">{calendar.brief.theme}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-2">{t('calendarPlan.pillars')}</div>
                  <ul className="space-y-1">
                    {calendar.brief.pillars?.map((p: string) => (
                      <li key={p} className="flex gap-1.5 text-xs text-gray-300">
                        <span className="text-violet-400">▪</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                {calendar.brief.toneGuidance && (
                  <div>
                    <div className="text-xs text-gray-400 mb-2">{t('calendarPlan.toneGuidance')}</div>
                    <p className="text-xs text-gray-300 italic">{calendar.brief.toneGuidance}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Posts by platform */}
            <div className="space-y-4">
              {calendar.platforms?.map((platform: string) => (
                <div key={platform} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
                    <i className={platformIcon(platform)} style={{ color: platformColor(platform) }} />
                    <span className="font-medium text-sm capitalize">{platform}</span>
                    {calendar.brief.platformNotes?.[platform] && (
                      <span className="text-xs text-gray-500 ml-2 italic">
                        {calendar.brief.platformNotes[platform]}
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-gray-800/60">
                    {postsForPlatform(platform).map((post: any, index: number) => (
                      <div key={index} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs text-gray-500">
                                {t('calendarPlan.week', { n: post.week })}
                              </span>
                              {post.suggestedDay && (
                                <span className="text-xs text-gray-500">· {post.suggestedDay}</span>
                              )}
                              {post.suggestedTime && (
                                <span className="text-xs text-gray-500">
                                  {t('calendarPlan.at')} {post.suggestedTime}
                                </span>
                              )}
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                                  post.postType === 'educational'
                                    ? 'bg-blue-900/40 text-blue-300'
                                    : post.postType === 'promotional'
                                    ? 'bg-violet-900/40 text-violet-300'
                                    : post.postType === 'engagement'
                                    ? 'bg-green-900/40 text-green-300'
                                    : 'bg-amber-900/40 text-amber-300'
                                }`}
                              >
                                {post.postType}
                              </span>
                            </div>
                            <p className="text-sm text-gray-200 mb-2 whitespace-pre-line leading-relaxed">
                              {post.content}
                            </p>
                            {post.hashtags?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {post.hashtags.map((tag: string) => (
                                  <span key={tag} className="text-xs text-emerald-400 font-mono">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => draftPost(post)}
                            className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg"
                          >
                            <i className="fa-solid fa-pen-to-square text-[10px]" />
                            {t('calendarPlan.draft')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
