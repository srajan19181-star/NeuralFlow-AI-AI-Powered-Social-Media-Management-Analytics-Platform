import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useI18n } from '../locales'
import { usePlatformsStore, PLATFORM_META } from '../stores/platforms'
import { useHashtagStore, type HashtagGroup } from '../stores/hashtags'
import { useWorkspaceStore, type Workspace } from '../stores/workspace'
import { COMMON_TIMEZONES } from '../utils/timezone'
import AccountAvatar from '../components/AccountAvatar'

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual' },
  { value: 'friendly',     label: 'Friendly' },
  { value: 'formal',       label: 'Formal' },
  { value: 'humorous',     label: 'Humorous' },
  { value: 'inspiring',    label: 'Inspiring' },
  { value: 'educational',  label: 'Educational' },
]

interface AccountProfile {
  businessName: string
  description: string
  websiteUrl: string
  industry: string
  targetAudience: string
  toneOfVoice: string
  keywords: string
  hashtags: string
  postingGuidelines: string
  timezone: string
}

interface ProfileAccount {
  key: string
  label: string
  platform: string
  color: string
  avatar: string | null
}

function emptyProfile(): AccountProfile {
  return {
    businessName: '',
    description: '',
    websiteUrl: '',
    industry: '',
    targetAudience: '',
    toneOfVoice: '',
    keywords: '',
    hashtags: '',
    postingGuidelines: '',
    timezone: '',
  }
}

export default function Settings() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const platformsStore = usePlatformsStore()
  const hashtagStore = useHashtagStore()
  const workspaceStore = useWorkspaceStore()

  // Workspace management state
  const [newWsName, setNewWsName] = useState('')
  const [wsCreating, setWsCreating] = useState(false)
  const [wsDeleting, setWsDeleting] = useState<string | null>(null)
  const [wsRenaming, setWsRenaming] = useState(false)
  const [wsError, setWsError] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // OAuth error banners
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [pinterestOauthError, setPinterestOauthError] = useState<string | null>(null)
  const [tiktokOauthError, setTiktokOauthError] = useState<string | null>(null)

  // Meta discovery state
  const [pageReference, setPageReference] = useState('')
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([])
  const [selectedIgAccountIds, setSelectedIgAccountIds] = useState<string[]>([])
  const [selectionError, setSelectionError] = useState('')

  // Pinterest
  const [pinterestBoardsSaved, setPinterestBoardsSaved] = useState(false)
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([])

  // Workspace page/account selection
  const [workspaceFbPageIds, setWorkspaceFbPageIds] = useState<string[]>([])
  const [workspaceIgAccountIds, setWorkspaceIgAccountIds] = useState<string[]>([])
  const [fbPagesSaved, setFbPagesSaved] = useState(false)
  const [igAccountsSaved, setIgAccountsSaved] = useState(false)

  // Token refresh
  const [tokenRefreshing, setTokenRefreshing] = useState(false)
  const [tokenRefreshDone, setTokenRefreshDone] = useState(false)

  // Hashtag groups
  const [addingHashtagGroup, setAddingHashtagGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupHashtags, setNewGroupHashtags] = useState('')
  const [editingGroupId, setEditingGroupId] = useState('')
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupHashtags, setEditGroupHashtags] = useState('')
  const [showHashtagStats, setShowHashtagStats] = useState(false)
  const [statsSort, setStatsSort] = useState<'count' | 'engagement'>('count')
  const [statsAccount, setStatsAccount] = useState('')
  const [selectedAiTags, setSelectedAiTags] = useState<Set<string>>(new Set())
  const [aiGroupName, setAiGroupName] = useState('')

  // Account profile
  const [editingProfiles, setEditingProfiles] = useState<Record<string, AccountProfile>>({})
  const [profileSaving, setProfileSaving] = useState<string | null>(null)
  const [profileSavedKey, setProfileSavedKey] = useState<string | null>(null)
  const [profileAuditing, setProfileAuditing] = useState<string | null>(null)
  const [profileAudits, setProfileAudits] = useState<Record<string, any>>({})
  const [industryDiagnosing, setIndustryDiagnosing] = useState<string | null>(null)
  const [industryDiagnoses, setIndustryDiagnoses] = useState<Record<string, any>>({})
  const [fiveForcesRunning, setFiveForcesRunning] = useState<string | null>(null)
  const [fiveForcesResults, setFiveForcesResults] = useState<Record<string, any>>({})

  const metaAppConfigured = Boolean(platformsStore.metaCredentials.configured)
  const hasMetaAccounts = Boolean(platformsStore.allFbPages.length > 0 || platformsStore.allIgAccounts.length > 0)
  const discovery = platformsStore.metaDiscovery || { pages: [], igAccounts: [], warnings: [] }
  const showDiscovery = Boolean(platformsStore.metaDiscovery)

  const pinterestAppConfigured = Boolean(platformsStore.pinterestCredentials.configured)
  const pinterestConnected = Boolean(platformsStore.allPinterestBoards.length > 0)
  const tiktokAppConfigured = Boolean(platformsStore.tiktokCredentials.configured)

  const loadMetaConnections = useCallback(async () => {
    await platformsStore.fetchMetaConnections()
  }, [platformsStore])

  const seedDiscoverySelection = useCallback(() => {
    const disc = platformsStore.metaDiscovery || { pages: [], igAccounts: [], warnings: [] }
    setSelectedPageIds(disc.pages.filter((p) => p.selected).map((p) => p.id))
    setSelectedIgAccountIds(disc.igAccounts.filter((a) => a.selected).map((a) => a.id))
  }, [platformsStore.metaDiscovery])

  // Sync workspace selections from platformsStore
  useEffect(() => {
    setWorkspaceFbPageIds(platformsStore.allFbPages.filter((p) => p.selected).map((p) => p.id))
    setWorkspaceIgAccountIds(platformsStore.allIgAccounts.filter((a) => a.selected).map((a) => a.id))
  }, [platformsStore.allFbPages, platformsStore.allIgAccounts])

  // Sync pinterest board checkboxes
  useEffect(() => {
    setSelectedBoardIds(platformsStore.allPinterestBoards.filter((b) => b.selected).map((b) => b.id))
  }, [platformsStore.allPinterestBoards])

  // Mount effect
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)

    platformsStore.fetchMetaDiscovery().then(() => {
      seedDiscoverySelection()
    })

    if (searchParams.get('meta_discovery') || searchParams.get('meta_error') || searchParams.get('pinterest_connected') || searchParams.get('pinterest_error') || searchParams.get('tiktok_connected') || searchParams.get('tiktok_error')) {
      if (searchParams.get('meta_error')) {
        setOauthError(decodeURIComponent(String(searchParams.get('meta_error'))))
      }
      if (searchParams.get('pinterest_error')) {
        setPinterestOauthError(decodeURIComponent(String(searchParams.get('pinterest_error'))))
      }
      if (searchParams.get('tiktok_error')) {
        setTiktokOauthError(decodeURIComponent(String(searchParams.get('tiktok_error'))))
      }
      window.history.replaceState({}, '', '/settings')
    }

    Promise.all([
      platformsStore.fetchStatuses(),
      platformsStore.fetchMetaCredentials(),
      platformsStore.fetchPinterestCredentials(),
      platformsStore.fetchTikTokCredentials(),
      loadMetaConnections(),
      platformsStore.fetchTokenExpiry(),
      hashtagStore.fetchGroups(),
    ]).then(() => {
      setSelectedBoardIds(platformsStore.allPinterestBoards.filter((b) => b.selected).map((b) => b.id))
      setWorkspaceFbPageIds(platformsStore.allFbPages.filter((p) => p.selected).map((p) => p.id))
      setWorkspaceIgAccountIds(platformsStore.allIgAccounts.filter((a) => a.selected).map((a) => a.id))
    })

    // Load workspace profile
    axios.get(`/api/profiles/${encodeURIComponent('workspace')}`).then((res) => {
      const { _id, updatedAt, ...data } = res.data
      setEditingProfiles((prev) => ({ ...prev, workspace: { ...emptyProfile(), ...data } }))
    }).catch(() => {
      setEditingProfiles((prev) => ({ ...prev, workspace: emptyProfile() }))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reload hashtag stats when statsAccount changes
  useEffect(() => {
    if (showHashtagStats) {
      hashtagStore.fetchStats(statsSort, statsAccount || undefined)
    }
  }, [statsAccount, showHashtagStats, statsSort]) // eslint-disable-line react-hooks/exhaustive-deps

  const isConnected = (platform: string) => platformsStore.isConnected(platform)
  const getStatus = (platform: string) => platformsStore.getStatus(platform)

  const otherPlatforms = useMemo(() => {
    const skip = new Set(['instagram', 'facebook', 'pinterest', 'tiktok'])
    return Object.fromEntries(
      Object.entries(PLATFORM_META).filter(([k]) => !skip.has(k) && platformsStore.publishingPlatforms.includes(k))
    )
  }, [platformsStore.publishingPlatforms])

  const allConnectedAccounts = useMemo((): ProfileAccount[] => {
    const accounts: ProfileAccount[] = []

    for (const [platform, meta] of Object.entries(PLATFORM_META)) {
      if (platform === 'facebook' || platform === 'instagram' || platform === 'pinterest' || platform === 'tiktok') continue
      if (platformsStore.isConnected(platform)) {
        const status = platformsStore.getStatus(platform)
        const username = status?.username || status?.displayName
        const label = username ? `${t(`platforms.${platform}`)} (@${username})` : t(`platforms.${platform}`)
        accounts.push({ key: platform, label, platform, color: meta.color, avatar: null })
      }
    }

    if (platformsStore.tiktokConnected) {
      accounts.push({
        key: 'tiktok',
        label: platformsStore.tiktokUsername ? `@${platformsStore.tiktokUsername}` : 'TikTok',
        platform: 'tiktok',
        color: PLATFORM_META.tiktok.color,
        avatar: null,
      })
    }

    for (const page of platformsStore.connectedPages) {
      accounts.push({ key: `facebook:${page.id}`, label: page.name, platform: 'facebook', color: PLATFORM_META.facebook.color, avatar: page.picture || null })
    }

    for (const account of platformsStore.connectedIgAccounts) {
      accounts.push({ key: `instagram:${account.id}`, label: `@${account.username}`, platform: 'instagram', color: PLATFORM_META.instagram.color, avatar: account.avatar || null })
    }

    for (const board of platformsStore.connectedPinterestBoards) {
      accounts.push({ key: `pinterest:${board.id}`, label: board.name, platform: 'pinterest', color: PLATFORM_META.pinterest.color, avatar: null })
    }

    return accounts
  }, [platformsStore, t])

  const findMetaPage = async () => {
    if (await platformsStore.discoverMetaPage(pageReference)) {
      setPageReference('')
      seedDiscoverySelection()
    }
  }

  const refreshDiscovery = async () => {
    if (await platformsStore.refreshMetaDiscovery()) {
      seedDiscoverySelection()
    }
  }

  const pageNameForId = (pageId: string): string => {
    return discovery.pages.find((p) => p.id === pageId)?.name || pageId
  }

  const confirmSelection = async () => {
    setSelectionError('')
    if (!selectedPageIds.length && !selectedIgAccountIds.length) {
      setSelectionError(t('settings.meta.nothingSelected'))
      return
    }
    const saved = await platformsStore.saveMetaSelection(selectedPageIds, selectedIgAccountIds)
    if (!saved) {
      setSelectionError(platformsStore.metaError || t('settings.meta.nothingSelected'))
      return
    }
    await loadMetaConnections()
    setSelectedPageIds([])
    setSelectedIgAccountIds([])
  }

  const saveFbPageSelection = async () => {
    await platformsStore.saveFbPageSelection(workspaceFbPageIds)
    if (!platformsStore.metaError) {
      setFbPagesSaved(true)
      setTimeout(() => setFbPagesSaved(false), 2500)
    }
  }

  const saveIgAccountSelection = async () => {
    await platformsStore.saveIgAccountSelection(workspaceIgAccountIds)
    if (!platformsStore.metaError) {
      setIgAccountsSaved(true)
      setTimeout(() => setIgAccountsSaved(false), 2500)
    }
  }

  const handleTokenRefresh = async () => {
    setTokenRefreshing(true)
    setTokenRefreshDone(false)
    try {
      await platformsStore.refreshMetaTokens()
      setTokenRefreshDone(true)
      setTimeout(() => setTokenRefreshDone(false), 3000)
    } finally {
      setTokenRefreshing(false)
    }
  }

  const confirmDisconnect = () => {
    if (window.confirm(platformsStore.metaCredentials?.appId ? 'This will disconnect all Facebook Pages and Instagram accounts. Continue?' : '')) {
      platformsStore.disconnectMeta().then(loadMetaConnections)
    }
  }

  const savePinterestBoards = async () => {
    await platformsStore.savePinterestBoards(selectedBoardIds)
    if (!platformsStore.pinterestError) {
      setPinterestBoardsSaved(true)
      setTimeout(() => setPinterestBoardsSaved(false), 2500)
    }
  }

  const confirmPinterestDisconnect = () => {
    if (window.confirm(t('settings.pinterest.disconnectConfirm'))) {
      platformsStore.disconnectPinterest().then(loadMetaConnections)
    }
  }

  const confirmTikTokDisconnect = () => {
    if (window.confirm(t('settings.tiktok.disconnectConfirm'))) {
      platformsStore.disconnectTikTok().then(loadMetaConnections)
    }
  }

  function parseHashtagInput(raw: string): string[] {
    return [...new Set(
      raw.replace(/,/g, ' ').split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 1)
    )]
  }

  const toggleAiTag = (tag: string) => {
    setSelectedAiTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    const tags = parseHashtagInput(newGroupHashtags)
    await hashtagStore.createGroup(newGroupName.trim(), tags)
    setNewGroupName('')
    setNewGroupHashtags('')
    setAddingHashtagGroup(false)
  }

  const startEditGroup = (group: HashtagGroup) => {
    setEditingGroupId(group._id)
    setEditGroupName(group.name)
    setEditGroupHashtags(group.hashtags.join(' '))
  }

  const saveEditGroup = async (id: string) => {
    const tags = parseHashtagInput(editGroupHashtags)
    await hashtagStore.updateGroup(id, editGroupName.trim(), tags)
    setEditingGroupId('')
  }

  const handleDeleteGroup = async (id: string) => {
    if (window.confirm(t('settings.hashtags.deleteConfirm'))) {
      await hashtagStore.deleteGroup(id)
    }
  }

  const scrapeHashtagsNow = async () => {
    await hashtagStore.scrapeHashtags(statsAccount || undefined)
    setStatsSort('count')
  }

  const handleAiSuggest = async () => {
    await hashtagStore.aiSuggest(statsAccount || undefined)
  }

  const createGroupFromAi = async () => {
    if (!aiGroupName.trim() || !selectedAiTags.size) return
    await hashtagStore.createGroup(aiGroupName.trim(), [...selectedAiTags])
    setAiGroupName('')
    setSelectedAiTags(new Set())
    hashtagStore.aiSuggestions.splice(0)
  }

  function gradeLabel(grade: string): string {
    const map: Record<string, string> = { A: '🔥 A', B: '✅ B', C: '🔵 C', D: '⚪ D' }
    return map[grade] || grade
  }

  const runFiveForces = async (key: string) => {
    setFiveForcesRunning(key)
    try {
      const res = await axios.post('/api/ai/five-forces', { accountKey: key })
      setFiveForcesResults((prev) => ({ ...prev, [key]: res.data }))
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Five Forces analysis failed'
      const detail = err.response?.data?.detail
      alert(detail ? `${msg}\n\n${detail}` : msg)
    } finally {
      setFiveForcesRunning(null)
    }
  }

  const diagnoseIndustry = async (key: string) => {
    setIndustryDiagnosing(key)
    try {
      const res = await axios.post('/api/ai/industry-diagnosis', { accountKey: key })
      setIndustryDiagnoses((prev) => ({ ...prev, [key]: res.data }))
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Industry diagnosis failed'
      const detail = err.response?.data?.detail
      alert(detail ? `${msg}\n\n${detail}` : msg)
    } finally {
      setIndustryDiagnosing(null)
    }
  }

  const auditProfile = async (key: string) => {
    setProfileAuditing(key)
    try {
      const res = await axios.post(`/api/profiles/${encodeURIComponent(key)}/audit`)
      setProfileAudits((prev) => ({ ...prev, [key]: res.data }))
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Profile audit failed'
      const detail = err.response?.data?.detail
      alert(detail ? `${msg}\n\n${detail}` : msg)
    } finally {
      setProfileAuditing(null)
    }
  }

  const saveProfile = async (key: string) => {
    setProfileSaving(key)
    try {
      await axios.put(`/api/profiles/${encodeURIComponent(key)}`, editingProfiles[key])
      setProfileSavedKey(key)
      setTimeout(() => {
        setProfileSavedKey((curr) => (curr === key ? null : curr))
      }, 2500)
    } catch (err) {
      console.error('Save profile error:', err)
    } finally {
      setProfileSaving(null)
    }
  }

  const updateEditingProfileField = (key: string, field: keyof AccountProfile, value: string) => {
    setEditingProfiles((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || emptyProfile()),
        [field]: value,
      },
    }))
  }

  // Workspaces actions
  const createWorkspace = async () => {
    if (!newWsName.trim() || wsCreating) return
    setWsCreating(true)
    setWsError('')
    try {
      const ws = await workspaceStore.create(newWsName.trim())
      setNewWsName('')
      await workspaceStore.setActive(ws._id)
      navigate(0)
    } catch {
      setWsError(t('workspace.createError'))
    } finally {
      setWsCreating(false)
    }
  }

  const deleteWorkspace = async (id: string) => {
    if (workspaceStore.workspaces.length <= 1) {
      setWsError(t('workspace.deleteBlocked'))
      return
    }
    if (!confirm(t('workspace.confirmDelete'))) return
    setWsDeleting(id)
    setWsError('')
    try {
      const wasActive = id === workspaceStore.activeWorkspaceId
      await workspaceStore.remove(id)
      if (wasActive) navigate(0)
    } catch {
      setWsError(t('workspace.deleteError'))
    } finally {
      setWsDeleting(null)
    }
  }

  const startRename = (ws: Workspace) => {
    setRenamingId(ws._id)
    setRenameValue(ws.name)
  }

  const saveRename = async (id: string) => {
    if (!renameValue.trim() || wsRenaming) return
    setWsRenaming(true)
    setWsError('')
    try {
      await workspaceStore.rename(id, renameValue.trim())
      setRenamingId(null)
    } catch {
      setWsError(t('workspace.renameError'))
    } finally {
      setWsRenaming(false)
    }
  }

  const switchTo = async (id: string) => {
    await workspaceStore.setActive(id)
    navigate(0)
  }

  const workspaceProfile = editingProfiles['workspace'] || emptyProfile()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t('settings.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('settings.workspaceScope')}{' '}
            <span className="text-violet-400 font-medium">{workspaceStore.activeWorkspace?.name || workspaceStore.activeWorkspaceId}</span>
          </p>
        </div>

        {/* ── Facebook & Instagram ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#1877F2' }}>f</span>
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#E1306C' }}>I</span>
            </div>
            <div>
              <p className="font-semibold">{t('settings.meta.sectionTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('settings.meta.sectionSubtitle')}</p>
            </div>
          </div>

          {oauthError && (
            <div className="mx-5 mt-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm text-red-300 flex items-start gap-2">
              <span className="shrink-0">⚠</span>
              <span><strong>{t('settings.meta.errorTitle')}:</strong> {oauthError}</span>
            </div>
          )}

          {/* Step 1: App credentials */}
          <div className="p-5 border-b border-gray-800/60 flex items-center justify-between">
            {metaAppConfigured ? (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>✓</span>
                <span>{t('settings.meta.appConfigured')}</span>
                <span className="text-gray-600 font-mono text-xs">({platformsStore.metaCredentials.appId})</span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">{t('settings.meta.appNotConfigured')}</div>
            )}
            <Link
              to="/global-settings#meta-app"
              className="text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
            >
              {t('settings.configureInGlobal')} →
            </Link>
          </div>

          {/* Step 2: OAuth connect */}
          <div className={`p-5 ${!metaAppConfigured ? 'opacity-40 pointer-events-none' : ''}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Step 2 — Connect Accounts</p>
            {platformsStore.metaError && (
              <p role="alert" className="mb-3 text-sm text-red-400">{platformsStore.metaError}</p>
            )}

            {hasMetaAccounts ? (
              <div className="space-y-3">
                {Boolean(platformsStore.allFbPages.length) && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">{t('settings.meta.selectPages')}</p>
                    {platformsStore.allFbPages.map((page) => (
                      <label
                        key={page.id}
                        className="flex items-center gap-3 bg-gray-800/60 hover:bg-gray-800 rounded-lg px-3 py-2 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          value={page.id}
                          checked={workspaceFbPageIds.includes(page.id)}
                          onChange={(e) => {
                            if (e.target.checked) setWorkspaceFbPageIds((prev) => [...prev, page.id])
                            else setWorkspaceFbPageIds((prev) => prev.filter((id) => id !== page.id))
                          }}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <AccountAvatar src={page.picture} platform="facebook" className="w-6 h-6 text-xs" />
                        <span className="text-sm flex-1">{page.name}</span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      {fbPagesSaved ? (
                        <span className="text-xs text-green-400">{t('settings.meta.selectionSaved')}</span>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={saveFbPageSelection}
                        disabled={platformsStore.metaLoading}
                        className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg font-medium transition-colors"
                      >
                        {t('settings.meta.saveSelection')}
                      </button>
                    </div>
                  </div>
                )}

                {Boolean(platformsStore.allIgAccounts.length) && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">{t('settings.meta.selectAccounts')}</p>
                    {platformsStore.allIgAccounts.map((account) => (
                      <label
                        key={account.id}
                        className="flex items-center gap-3 bg-gray-800/60 hover:bg-gray-800 rounded-lg px-3 py-2 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          value={account.id}
                          checked={workspaceIgAccountIds.includes(account.id)}
                          onChange={(e) => {
                            if (e.target.checked) setWorkspaceIgAccountIds((prev) => [...prev, account.id])
                            else setWorkspaceIgAccountIds((prev) => prev.filter((id) => id !== account.id))
                          }}
                          className="w-4 h-4 accent-pink-500"
                        />
                        <AccountAvatar src={account.avatar} platform="instagram" className="w-6 h-6 text-xs" />
                        <span className="text-sm flex-1">{`@${account.username}`}</span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      {igAccountsSaved ? (
                        <span className="text-xs text-green-400">{t('settings.meta.selectionSaved')}</span>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={saveIgAccountSelection}
                        disabled={platformsStore.metaLoading}
                        className="text-xs px-3 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-40 rounded-lg font-medium transition-colors"
                      >
                        {t('settings.meta.saveSelection')}
                      </button>
                    </div>
                  </div>
                )}

                {platformsStore.hasExpiryWarning && (
                  <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-yellow-400">{t('settings.meta.expiryWarningTitle')}</p>
                    {platformsStore.expiringAccounts.map((account) => (
                      <p key={account.id} className="text-xs text-yellow-300">
                        {account.isValid
                          ? t('settings.meta.expiryWarningBody', { username: `@${account.username}`, days: account.daysLeft })
                          : t('settings.meta.invalidTokenBody', { username: `@${account.username}` })}
                      </p>
                    ))}
                    <p className="text-xs text-gray-500">{t('settings.meta.expiryAutoNote')}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleTokenRefresh}
                        disabled={tokenRefreshing}
                        className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 rounded-md text-xs font-medium transition-colors"
                      >
                        {tokenRefreshing ? t('settings.meta.expiryRefreshing') : tokenRefreshDone ? t('settings.meta.expiryRefreshDone') : t('settings.meta.expiryRefreshToken')}
                      </button>
                      <button
                        onClick={() => platformsStore.dismissTokenWarning()}
                        className="px-3 py-1.5 text-gray-400 hover:text-gray-300 text-xs font-medium transition-colors"
                      >
                        {t('settings.meta.expiryDismiss')}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={refreshDiscovery}
                    disabled={platformsStore.metaLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.meta.refreshAccounts')}
                  </button>
                  <button
                    onClick={() => void platformsStore.startMetaOAuth()}
                    disabled={platformsStore.metaLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.meta.reconnect')}
                  </button>
                  <button
                    onClick={confirmDisconnect}
                    disabled={platformsStore.metaLoading}
                    className="px-4 py-2 text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.meta.disconnect')}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => void platformsStore.startMetaOAuth()}
                  disabled={!metaAppConfigured || platformsStore.metaLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {platformsStore.metaLoading ? t('settings.meta.connecting') : t('settings.meta.connectButton')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Pinterest ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#E60023' }}>P</span>
            <div>
              <p className="font-semibold">{t('settings.pinterest.sectionTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('settings.pinterest.sectionSubtitle')}</p>
            </div>
          </div>

          {pinterestOauthError && (
            <div className="mx-5 mt-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm text-red-300 flex items-start gap-2">
              <span className="shrink-0">⚠</span>
              <span><strong>{t('settings.pinterest.errorTitle')}:</strong> {pinterestOauthError}</span>
            </div>
          )}

          <div className="p-5 border-b border-gray-800/60 flex items-center justify-between">
            {pinterestAppConfigured ? (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>✓</span>
                <span>{t('settings.pinterest.appConfigured')}</span>
                <span className="text-gray-600 font-mono text-xs">({platformsStore.pinterestCredentials.clientId})</span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">{t('settings.meta.appNotConfigured')}</div>
            )}
            <Link
              to="/global-settings#pinterest-app"
              className="text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
            >
              {t('settings.configureInGlobal')} →
            </Link>
          </div>

          <div className={`p-5 ${!pinterestAppConfigured ? 'opacity-40 pointer-events-none' : ''}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Step 2 — Connect Account</p>

            {pinterestConnected ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">{t('settings.pinterest.boardsTitle')}</p>
                  {!platformsStore.allPinterestBoards.length ? (
                    <div className="text-sm text-gray-600">{t('settings.pinterest.noBoards')}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {platformsStore.allPinterestBoards.map((board) => (
                        <label
                          key={board.id}
                          className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors"
                        >
                          <input
                            type="checkbox"
                            value={board.id}
                            checked={selectedBoardIds.includes(board.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedBoardIds((prev) => [...prev, board.id])
                              else setSelectedBoardIds((prev) => prev.filter((id) => id !== board.id))
                            }}
                            className="w-4 h-4 accent-red-500"
                          />
                          <span className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: '#E60023' }}>P</span>
                          <span className="text-sm flex-1">{board.name}</span>
                          <span className="text-xs text-gray-600">{board.privacy}</span>
                          {board.selected && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0"></span>}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    {pinterestBoardsSaved ? (
                      <span className="text-xs text-green-400">{t('settings.pinterest.boardsSaved')}</span>
                    ) : (
                      <span />
                    )}
                    <button
                      onClick={savePinterestBoards}
                      disabled={platformsStore.pinterestLoading}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                    >
                      {platformsStore.pinterestLoading ? t('settings.pinterest.savingBoards') : t('settings.pinterest.saveBoards')}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => void platformsStore.startPinterestOAuth()}
                    disabled={platformsStore.pinterestLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.pinterest.reconnect')}
                  </button>
                  <button
                    onClick={confirmPinterestDisconnect}
                    disabled={platformsStore.pinterestLoading}
                    className="px-4 py-2 text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.pinterest.disconnect')}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => void platformsStore.startPinterestOAuth()}
                  disabled={!pinterestAppConfigured || platformsStore.pinterestLoading}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {platformsStore.pinterestLoading ? t('settings.pinterest.connecting') : t('settings.pinterest.connectButton')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── TikTok ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#EE1D52' }}>T</span>
            <div>
              <p className="font-semibold">{t('settings.tiktok.sectionTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('settings.tiktok.sectionSubtitle')}</p>
            </div>
          </div>

          {tiktokOauthError && (
            <div className="mx-5 mt-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm text-red-300 flex items-start gap-2">
              <span className="shrink-0">⚠</span>
              <span><strong>{t('settings.tiktok.errorTitle')}:</strong> {tiktokOauthError}</span>
            </div>
          )}

          <div className="p-5 border-b border-gray-800/60 flex items-center justify-between">
            {tiktokAppConfigured ? (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <span>✓</span>
                <span>{t('settings.tiktok.appConfigured')}</span>
                <span className="text-gray-600 font-mono text-xs">({platformsStore.tiktokCredentials.clientKey})</span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">{t('settings.meta.appNotConfigured')}</div>
            )}
            <Link
              to="/global-settings#tiktok-app"
              className="text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
            >
              {t('settings.configureInGlobal')} →
            </Link>
          </div>

          <div className={`p-5 ${!tiktokAppConfigured ? 'opacity-40 pointer-events-none' : ''}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Step 2 — Connect Account</p>

            {platformsStore.tiktokConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-4 py-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: '#EE1D52' }}>T</span>
                  <div>
                    <p className="text-sm font-medium text-white">{platformsStore.tiktokUsername || t('settings.tiktok.connectedAs')}</p>
                    <p className="text-xs text-gray-500">{t('settings.tiktok.connectedAs')}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600">{t('settings.tiktok.videoOnly')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void platformsStore.startTikTokOAuth()}
                    disabled={platformsStore.tiktokLoading}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.tiktok.reconnect')}
                  </button>
                  <button
                    onClick={confirmTikTokDisconnect}
                    disabled={platformsStore.tiktokLoading}
                    className="px-4 py-2 text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                  >
                    {t('settings.tiktok.disconnect')}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  onClick={() => void platformsStore.startTikTokOAuth()}
                  disabled={!tiktokAppConfigured || platformsStore.tiktokLoading}
                  className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {platformsStore.tiktokLoading ? t('settings.tiktok.connecting') : t('settings.tiktok.connectButton')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Find Meta Page ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
          <p className="font-semibold">{t('settings.meta.findPageTitle')}</p>
          <p className="text-xs text-gray-400">{t('settings.meta.findPageHint')}</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={pageReference}
              onChange={(e) => setPageReference(e.target.value)}
              type="text"
              placeholder={t('settings.meta.pageReferencePlaceholder')}
              className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={findMetaPage}
              disabled={!pageReference.trim() || platformsStore.metaLoading}
              className="px-4 py-2 bg-blue-600 rounded-lg disabled:opacity-40 text-sm"
            >
              {t('settings.meta.findPage')}
            </button>
            <button
              onClick={refreshDiscovery}
              disabled={platformsStore.metaLoading}
              className="px-4 py-2 bg-gray-700 rounded-lg disabled:opacity-40 text-sm"
            >
              {t('settings.meta.refreshAccounts')}
            </button>
          </div>
          {platformsStore.metaError && <p role="alert" className="text-sm text-red-400">{platformsStore.metaError}</p>}
        </div>

        {/* ── Discovery Picker ── */}
        {showDiscovery && (
          <div className="bg-gray-900 border border-blue-700 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-800">
              <p className="font-semibold">{t('settings.meta.discoveryTitle')}</p>
              <p className="text-xs text-gray-500 mt-1">{t('settings.meta.discoverySubtitle')}</p>
            </div>

            <div className="p-5 space-y-5">
              {(discovery.warnings || []).map((warning, index) => (
                <p key={index} className="text-sm text-yellow-400">{warning.pageName || warning.pageId}: {warning.error}</p>
              ))}

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('settings.meta.pagesHeading')}</p>
                {discovery.pages.length === 0 ? (
                  <div className="text-sm text-gray-600">{t('settings.meta.noPages')}</div>
                ) : (
                  <div className="space-y-2">
                    {discovery.pages.map((page) => (
                      <label
                        key={page.id}
                        className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-750 transition-colors"
                      >
                        <input
                          type="checkbox"
                          value={page.id}
                          checked={selectedPageIds.includes(page.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedPageIds((prev) => [...prev, page.id])
                            else setSelectedPageIds((prev) => prev.filter((id) => id !== page.id))
                          }}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <AccountAvatar src={page.picture} platform="facebook" className="w-8 h-8 text-xs" />
                        <span className="text-sm font-medium">{page.name}</span>
                        <span className="ml-auto text-xs text-gray-600 font-mono">{page.id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('settings.meta.igHeading')}</p>
                {discovery.igAccounts.length === 0 ? (
                  <div className="text-sm text-gray-600">{t('settings.meta.noIgAccounts')}</div>
                ) : (
                  <div className="space-y-2">
                    {discovery.igAccounts.map((account) => (
                      <label
                        key={account.id}
                        className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-750 transition-colors"
                      >
                        <input
                          type="checkbox"
                          value={account.id}
                          checked={selectedIgAccountIds.includes(account.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIgAccountIds((prev) => [...prev, account.id])
                            else setSelectedIgAccountIds((prev) => prev.filter((id) => id !== account.id))
                          }}
                          className="w-4 h-4 accent-pink-500"
                        />
                        <AccountAvatar src={account.avatar} platform="instagram" className="w-8 h-8 text-xs" />
                        <div>
                          <p className="text-sm font-medium">{`@${account.username}`}</p>
                          <p className="text-xs text-gray-600">{t('settings.meta.igLinkedTo')} {pageNameForId(account.pageId)}</p>
                        </div>
                        <span className="ml-auto text-xs text-gray-600 font-mono">{account.id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                {selectionError ? <p className="text-xs text-red-400">{selectionError}</p> : <span />}
                <button
                  onClick={confirmSelection}
                  disabled={platformsStore.metaLoading}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 rounded-xl text-sm font-semibold transition-colors"
                >
                  {platformsStore.metaLoading ? t('settings.meta.confirmingSelection') : t('settings.meta.confirmSelection')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Other Platforms ── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Other Platforms</p>
          <div className="space-y-3">
            {Object.entries(otherPlatforms).map(([key, meta]) => (
              <div
                key={key}
                className={`bg-gray-900 border rounded-xl p-4 transition-colors ${
                  isConnected(key) ? 'border-gray-700' : 'border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.label[0]}
                    </span>
                    <div>
                      <p className="font-medium text-sm">{t(`platforms.${key}`)}</p>
                      {getStatus(key)?.username ? (
                        <p className="text-xs text-gray-400">{`@${getStatus(key)?.username}`}</p>
                      ) : getStatus(key)?.error ? (
                        <p className="text-xs text-red-400">{getStatus(key)?.error}</p>
                      ) : (
                        <p className="text-xs text-gray-600">{t('settings.notConnected')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnected(key) ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                    <span className={`text-xs ${isConnected(key) ? 'text-green-400' : 'text-gray-600'}`}>
                      {isConnected(key) ? t('settings.connected') : t('settings.notConnected')}
                    </span>
                  </div>
                </div>

                {!isConnected(key) && (
                  <div className="mt-3 bg-gray-800 rounded-lg p-3 text-xs text-gray-400 font-mono">
                    {key === 'twitter' && <span>TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET</span>}
                    {key === 'mastodon' && <span>MASTODON_INSTANCE_URL, MASTODON_ACCESS_TOKEN</span>}
                    {key === 'bluesky' && <span>BLUESKY_IDENTIFIER, BLUESKY_APP_PASSWORD</span>}
                    {key === 'linkedin' && <span>LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET</span>}
                    {key === 'reddit' && <span>REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD</span>}
                    {!['twitter', 'mastodon', 'bluesky', 'linkedin', 'reddit'].includes(key) && <span>— {t('settings.envHint')} —</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Account Profiles ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800">
            <p className="font-semibold">{t('settings.profiles.sectionTitle')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('settings.profiles.sectionSubtitle')}</p>
          </div>

          <div className="px-5 pb-5 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.businessName')}</label>
                <input
                  value={workspaceProfile.businessName}
                  onChange={(e) => updateEditingProfileField('workspace', 'businessName', e.target.value)}
                  type="text"
                  placeholder={t('settings.profiles.businessNameHint')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.websiteUrl')}</label>
                <input
                  value={workspaceProfile.websiteUrl}
                  onChange={(e) => updateEditingProfileField('workspace', 'websiteUrl', e.target.value)}
                  type="url"
                  placeholder="https://"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.description')}</label>
              <textarea
                value={workspaceProfile.description}
                onChange={(e) => updateEditingProfileField('workspace', 'description', e.target.value)}
                placeholder={t('settings.profiles.descriptionHint')}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.industry')}</label>
                <input
                  value={workspaceProfile.industry}
                  onChange={(e) => updateEditingProfileField('workspace', 'industry', e.target.value)}
                  type="text"
                  placeholder={t('settings.profiles.industryHint')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.toneOfVoice')}</label>
                <select
                  value={workspaceProfile.toneOfVoice}
                  onChange={(e) => updateEditingProfileField('workspace', 'toneOfVoice', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">{t('settings.profiles.toneSelect')}</option>
                  {TONE_OPTIONS.map((tone) => (
                    <option key={tone.value} value={tone.value}>{tone.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.timezone')}</label>
              <select
                value={workspaceProfile.timezone}
                onChange={(e) => updateEditingProfileField('workspace', 'timezone', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">{t('settings.profiles.timezoneAuto')}</option>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">{t('settings.profiles.timezoneHint')}</p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.targetAudience')}</label>
              <input
                value={workspaceProfile.targetAudience}
                onChange={(e) => updateEditingProfileField('workspace', 'targetAudience', e.target.value)}
                type="text"
                placeholder={t('settings.profiles.targetAudienceHint')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.keywords')}</label>
                <input
                  value={workspaceProfile.keywords}
                  onChange={(e) => updateEditingProfileField('workspace', 'keywords', e.target.value)}
                  type="text"
                  placeholder={t('settings.profiles.keywordsHint')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.hashtags')}</label>
                <input
                  value={workspaceProfile.hashtags}
                  onChange={(e) => updateEditingProfileField('workspace', 'hashtags', e.target.value)}
                  type="text"
                  placeholder={t('settings.profiles.hashtagsHint')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('settings.profiles.postingGuidelines')}</label>
              <textarea
                value={workspaceProfile.postingGuidelines}
                onChange={(e) => updateEditingProfileField('workspace', 'postingGuidelines', e.target.value)}
                placeholder={t('settings.profiles.postingGuidelinesHint')}
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              {profileSavedKey === 'workspace' && (
                <span className="text-xs text-green-400">{t('settings.profiles.saved')}</span>
              )}
              <button
                onClick={() => runFiveForces('workspace')}
                disabled={fiveForcesRunning === 'workspace'}
                className="px-3 py-2 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 rounded-lg text-sm transition-colors flex items-center gap-1.5"
              >
                <i className={`fa-solid fa-star-of-david text-xs ${fiveForcesRunning === 'workspace' ? 'animate-pulse' : ''}`}></i>
                {fiveForcesRunning === 'workspace' ? t('settings.profiles.fiveForcesRunning') : t('settings.profiles.fiveForces')}
              </button>
              <button
                onClick={() => diagnoseIndustry('workspace')}
                disabled={industryDiagnosing === 'workspace'}
                className="px-3 py-2 bg-sky-800 hover:bg-sky-700 disabled:opacity-40 rounded-lg text-sm transition-colors flex items-center gap-1.5"
              >
                <i className={`fa-solid fa-flask text-xs ${industryDiagnosing === 'workspace' ? 'animate-pulse' : ''}`}></i>
                {industryDiagnosing === 'workspace' ? t('settings.profiles.diagnosing') : t('settings.profiles.diagnoseIndustry')}
              </button>
              <button
                onClick={() => auditProfile('workspace')}
                disabled={profileAuditing === 'workspace'}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg text-sm transition-colors flex items-center gap-1.5"
              >
                <i className={`fa-solid fa-magnifying-glass-chart text-xs ${profileAuditing === 'workspace' ? 'animate-pulse' : ''}`}></i>
                {profileAuditing === 'workspace' ? t('settings.profiles.auditing') : t('settings.profiles.auditProfile')}
              </button>
              <button
                onClick={() => saveProfile('workspace')}
                disabled={profileSaving === 'workspace'}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
              >
                {profileSaving === 'workspace' ? t('settings.profiles.saving') : t('settings.profiles.save')}
              </button>
            </div>

            {/* Profile audit results */}
            {profileAudits['workspace'] && (
              <div className="mt-4 border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{t('settings.profiles.auditTitle')}</span>
                    <span
                      className={`text-sm font-bold px-2 py-0.5 rounded-lg ${
                        profileAudits['workspace'].score >= 70
                          ? 'text-green-300 bg-green-900/40'
                          : profileAudits['workspace'].score >= 40
                          ? 'text-amber-300 bg-amber-900/40'
                          : 'text-red-300 bg-red-900/40'
                      }`}
                    >
                      {profileAudits['workspace'].score}/100
                    </span>
                  </div>
                  <button onClick={() => setProfileAudits((prev) => ({ ...prev, workspace: null }))} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                </div>
                <p className="text-xs text-gray-400 mb-3">{profileAudits['workspace'].summary}</p>
                {Boolean(profileAudits['workspace'].issues?.length) && (
                  <div className="space-y-2 mb-3">
                    {profileAudits['workspace'].issues.map((issue: any) => (
                      <div
                        key={issue.field}
                        className={`p-2.5 rounded-lg text-xs ${
                          issue.severity === 'high'
                            ? 'bg-red-900/30 border border-red-800/50'
                            : issue.severity === 'medium'
                            ? 'bg-amber-900/30 border border-amber-800/50'
                            : 'bg-gray-800 border border-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`font-medium ${issue.severity === 'high' ? 'text-red-300' : issue.severity === 'medium' ? 'text-amber-300' : 'text-gray-300'}`}>
                            {issue.field}
                          </span>
                        </div>
                        <p className="text-gray-300 mb-1">{issue.issue}</p>
                        <p className="text-gray-400 italic">→ {issue.fix}</p>
                      </div>
                    ))}
                  </div>
                )}
                {Boolean(profileAudits['workspace'].strengths?.length) && (
                  <div>
                    <div className="text-xs text-green-400 font-medium mb-1">{t('settings.profiles.auditStrengths')}</div>
                    <ul className="space-y-0.5">
                      {profileAudits['workspace'].strengths.map((s: string) => (
                        <li key={s} className="flex gap-1.5 text-xs text-green-200">
                          <span className="text-green-400 shrink-0">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Industry diagnosis results */}
            {industryDiagnoses['workspace'] && (
              <div className="mt-4 border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-flask text-xs text-sky-400"></i>
                    <span className="text-sm font-medium text-white">{t('settings.profiles.diagnosisTitle')}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-900/50 border border-sky-700 text-sky-300">
                      {industryDiagnoses['workspace'].diagnosedType}
                    </span>
                    <span className="text-xs text-gray-500">{industryDiagnoses['workspace'].confidence}% confidence</span>
                  </div>
                  <button onClick={() => setIndustryDiagnoses((prev) => ({ ...prev, workspace: null }))} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                </div>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">{industryDiagnoses['workspace'].summary}</p>
                {Boolean(industryDiagnoses['workspace'].characteristics?.length) && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-400 mb-1.5">{t('settings.profiles.diagnosisCharacteristics')}</div>
                    <ul className="space-y-0.5">
                      {industryDiagnoses['workspace'].characteristics.map((c: string) => (
                        <li key={c} className="flex gap-1.5 text-xs text-gray-300">
                          <span className="text-sky-400 shrink-0">›</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {industryDiagnoses['workspace'].contentMix && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-400 mb-1.5">{t('settings.profiles.diagnosisContentMix')}</div>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                      <div className="bg-blue-500" style={{ width: `${industryDiagnoses['workspace'].contentMix.educational}%` }}></div>
                      <div className="bg-green-500" style={{ width: `${industryDiagnoses['workspace'].contentMix.social_proof}%` }}></div>
                      <div className="bg-amber-500" style={{ width: `${industryDiagnoses['workspace'].contentMix.promotional}%` }}></div>
                      <div className="bg-purple-500" style={{ width: `${industryDiagnoses['workspace'].contentMix.engagement}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Five Forces results */}
            {fiveForcesResults['workspace'] && (
              <div className="mt-4 border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-star-of-david text-xs text-emerald-400"></i>
                    <span className="text-sm font-medium text-white">{t('settings.profiles.fiveForcesTitle')}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        fiveForcesResults['workspace'].overallScore >= 60
                          ? 'bg-green-900/50 border border-green-700 text-green-300'
                          : fiveForcesResults['workspace'].overallScore >= 40
                          ? 'bg-amber-900/50 border border-amber-700 text-amber-300'
                          : 'bg-red-900/50 border border-red-700 text-red-300'
                      }`}
                    >
                      {fiveForcesResults['workspace'].overallScore}/100
                    </span>
                  </div>
                  <button onClick={() => setFiveForcesResults((prev) => ({ ...prev, workspace: null }))} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                </div>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed italic">{fiveForcesResults['workspace'].attractiveness}</p>
                {fiveForcesResults['workspace'].governingForce && (
                  <p className="text-xs text-emerald-400 font-medium mb-3">
                    {t('settings.profiles.fiveForcesGoverning')}: {fiveForcesResults['workspace'].governingForce}
                  </p>
                )}
                {Boolean(fiveForcesResults['workspace'].forces?.length) && (
                  <div className="space-y-2 mb-3">
                    {fiveForcesResults['workspace'].forces.map((force: any) => (
                      <div key={force.name} className="p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-200">{force.name}</span>
                          <span className={`font-semibold ${force.score <= 3 ? 'text-green-400' : force.score <= 6 ? 'text-amber-400' : 'text-red-400'}`}>
                            {force.score}/10
                          </span>
                        </div>
                        <div className="w-full h-1 bg-gray-700 rounded-full mb-1.5">
                          <div
                            className={`h-1 rounded-full ${force.score <= 3 ? 'bg-green-500' : force.score <= 6 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${force.score * 10}%` }}
                          ></div>
                        </div>
                        <p className="text-gray-400 mb-1">{force.assessment}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Hashtag Groups ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold text-base shrink-0">#</div>
              <div>
                <p className="font-semibold">{t('settings.hashtags.sectionTitle')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('settings.hashtags.sectionSubtitle')}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowHashtagStats(!showHashtagStats)
                if (!showHashtagStats && hashtagStore.stats.length === 0) {
                  hashtagStore.fetchStats('count', statsAccount || undefined)
                }
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors"
            >
              {showHashtagStats ? t('settings.hashtags.hideStats') : t('settings.hashtags.showStats')}
            </button>
          </div>

          <div className="p-5 space-y-4">
            {hashtagStore.groups.length ? (
              <div className="space-y-3">
                {hashtagStore.groups.map((group) => (
                  <div key={group._id} className="border border-gray-800 rounded-xl p-4">
                    {editingGroupId !== group._id ? (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-200">{group.name}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {group.hashtags.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => startEditGroup(group)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors"
                          >
                            {t('settings.hashtags.edit')}
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(group._id)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-red-900/60 text-red-400 hover:bg-red-900/20 transition-colors"
                          >
                            {t('settings.hashtags.delete')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={editGroupName}
                          onChange={(e) => setEditGroupName(e.target.value)}
                          placeholder={t('settings.hashtags.groupNamePlaceholder')}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                        />
                        <textarea
                          value={editGroupHashtags}
                          onChange={(e) => setEditGroupHashtags(e.target.value)}
                          placeholder={t('settings.hashtags.hashtagsPlaceholder')}
                          rows={3}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-emerald-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEditGroup(group._id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium text-white transition-colors"
                          >
                            {t('settings.hashtags.save')}
                          </button>
                          <button
                            onClick={() => setEditingGroupId('')}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                          >
                            {t('settings.hashtags.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : !hashtagStore.groupsLoading ? (
              <p className="text-sm text-gray-600 text-center py-2">
                {t('settings.hashtags.noGroups')}
              </p>
            ) : null}

            {addingHashtagGroup ? (
              <div className="border border-emerald-900/40 bg-emerald-950/20 rounded-xl p-4 space-y-2">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t('settings.hashtags.groupNamePlaceholder')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                />
                <textarea
                  value={newGroupHashtags}
                  onChange={(e) => setNewGroupHashtags(e.target.value)}
                  placeholder={t('settings.hashtags.hashtagsPlaceholder')}
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                    {t('settings.hashtags.createGroup')}
                  </button>
                  <button
                    onClick={() => setAddingHashtagGroup(false)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                  >
                    {t('settings.hashtags.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingHashtagGroup(true)}
                className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                + {t('settings.hashtags.addGroup')}
              </button>
            )}

            {/* Stats panel */}
            {showHashtagStats && (
              <div className="border-t border-gray-800 pt-4 space-y-4">
                <div className="flex items-center flex-wrap gap-2">
                  <p className="text-sm font-semibold text-gray-300 mr-1">{t('settings.hashtags.statsTitle')}</p>

                  <select
                    value={statsAccount}
                    onChange={(e) => setStatsAccount(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">{t('settings.hashtags.allAccounts')}</option>
                    {allConnectedAccounts.map((acc) => (
                      <option key={acc.key} value={acc.key}>{acc.label}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      setStatsSort('count')
                      hashtagStore.fetchStats('count', statsAccount || undefined)
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      statsSort === 'count'
                        ? 'border-emerald-600 text-emerald-300 bg-emerald-900/20'
                        : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {t('settings.hashtags.sortByUsage')}
                  </button>

                  <button
                    onClick={() => {
                      setStatsSort('engagement')
                      hashtagStore.fetchStats('engagement', statsAccount || undefined)
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      statsSort === 'engagement'
                        ? 'border-emerald-600 text-emerald-300 bg-emerald-900/20'
                        : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {t('settings.hashtags.sortByEngagement')}
                  </button>

                  <button
                    onClick={scrapeHashtagsNow}
                    disabled={hashtagStore.scraping}
                    className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {hashtagStore.scraping ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : null}
                    {hashtagStore.scraping ? t('settings.hashtags.scanning') : t('settings.hashtags.scanPosts')}
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-gray-500">
                    {statsAccount ? t('settings.hashtags.aiSuggestForAccount') : t('settings.hashtags.aiSuggestAllAccounts')}
                  </p>
                  <button
                    onClick={handleAiSuggest}
                    disabled={hashtagStore.aiSuggesting}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-700/60 text-violet-300 hover:bg-violet-900/30 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {hashtagStore.aiSuggesting ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <span>✨</span>
                    )}
                    {hashtagStore.aiSuggesting ? t('settings.hashtags.suggesting') : t('settings.hashtags.aiSuggest')}
                  </button>
                </div>

                {Boolean(hashtagStore.aiSuggestions.length) && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">{t('settings.hashtags.selectToGroup')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {hashtagStore.aiSuggestions.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleAiTag(tag)}
                          className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                            selectedAiTags.has(tag)
                              ? 'bg-emerald-800 border-emerald-600 text-white'
                              : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {Boolean(selectedAiTags.size) && (
                      <div className="flex gap-2">
                        <input
                          value={aiGroupName}
                          onChange={(e) => setAiGroupName(e.target.value)}
                          placeholder={t('settings.hashtags.groupNamePlaceholder')}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 min-w-0"
                        />
                        <button
                          onClick={createGroupFromAi}
                          disabled={!aiGroupName.trim()}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors shrink-0"
                        >
                          {t('settings.hashtags.createGroup')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {hashtagStore.statsLoading ? (
                  <div className="text-center py-4 text-sm text-gray-600">
                    {t('settings.hashtags.loadingStats')}
                  </div>
                ) : hashtagStore.stats.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-800">
                          <th className="text-left py-2 pr-4 font-medium">{t('settings.hashtags.colHashtag')}</th>
                          <th className="text-right py-2 pr-4 font-medium">{t('settings.hashtags.colUses')}</th>
                          <th className="text-right py-2 pr-4 font-medium">{t('settings.hashtags.colEngagement')}</th>
                          <th className="text-center py-2 pr-4 font-medium">{t('settings.hashtags.colGrade')}</th>
                          <th className="text-left py-2 font-medium">{t('settings.hashtags.colPlatforms')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {hashtagStore.stats.slice(0, 100).map((stat) => (
                          <tr key={stat._id} className="hover:bg-gray-800/30 transition-colors">
                            <td className="py-1.5 pr-4 font-mono text-emerald-400">{stat.hashtag || stat._id}</td>
                            <td className="py-1.5 pr-4 text-right text-gray-300">{stat.count}</td>
                            <td className="py-1.5 pr-4 text-right text-gray-300">{stat.avgEngagement}</td>
                            <td className="py-1.5 pr-4 text-center">
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                  stat.grade === 'A'
                                    ? 'bg-orange-900/50 text-orange-300'
                                    : stat.grade === 'B'
                                    ? 'bg-green-900/50 text-green-300'
                                    : stat.grade === 'C'
                                    ? 'bg-blue-900/50 text-blue-300'
                                    : 'bg-gray-800 text-gray-500'
                                }`}
                              >
                                {gradeLabel(stat.grade)}
                              </span>
                            </td>
                            <td className="py-1.5 text-gray-500">{stat.platforms.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 text-center py-4">
                    {t('settings.hashtags.noStats')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Workspace Management ── */}
        <div id="workspaces" className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold">🏢</span>
            <div>
              <p className="font-semibold">{t('workspace.settingsTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t('workspace.settingsSubtitle')}</p>
            </div>
          </div>

          <div className="p-5 space-y-3">
            {workspaceStore.workspaces.map((ws) => (
              <div
                key={ws._id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  ws._id === workspaceStore.activeWorkspaceId
                    ? 'border-violet-600 bg-violet-950/30'
                    : 'border-gray-800 bg-gray-800/40'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {renamingId !== ws._id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{ws.name || t('workspace.defaultName')}</span>
                      {ws._id === workspaceStore.activeWorkspaceId && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-600 text-white">{t('workspace.activeLabel')}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        type="text"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-violet-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(ws._id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                      />
                      <button
                        onClick={() => saveRename(ws._id)}
                        className="text-xs px-2 py-1 bg-violet-600 hover:bg-violet-500 rounded text-white transition-colors"
                      >
                        {wsRenaming ? t('workspace.renaming') : t('workspace.rename')}
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {ws._id !== workspaceStore.activeWorkspaceId && (
                    <button
                      onClick={() => switchTo(ws._id)}
                      className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 hover:text-white transition-colors"
                    >
                      Switch
                    </button>
                  )}
                  <button
                    onClick={() => startRename(ws)}
                    className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 hover:text-white transition-colors"
                  >
                    {t('workspace.rename')}
                  </button>
                  {workspaceStore.workspaces.length > 1 && (
                    <button
                      onClick={() => deleteWorkspace(ws._id)}
                      className="text-xs px-2.5 py-1 bg-red-900/50 hover:bg-red-800 rounded-lg text-red-400 hover:text-red-200 transition-colors"
                    >
                      {wsDeleting === ws._id ? t('workspace.deleting') : t('workspace.delete')}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {wsError && <p className="text-xs text-red-400">{wsError}</p>}

            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">{t('workspace.addNew')}</p>
              <div className="flex gap-2">
                <input
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  type="text"
                  placeholder={t('workspace.namePlaceholder')}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500"
                  onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
                />
                <button
                  onClick={createWorkspace}
                  disabled={!newWsName.trim() || wsCreating}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                >
                  {wsCreating ? t('workspace.creating') : t('workspace.create')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => void platformsStore.fetchStatuses()}
          className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm transition-colors"
        >
          {t('settings.refreshStatus')}
        </button>
      </div>
    </div>
  )
}
