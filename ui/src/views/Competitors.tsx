import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useI18n } from '../locales'
import { useCompetitorStore, type Competitor, type KeywordIntent } from '../stores/competitors'
import { useComposeStore } from '../stores/compose'

const STRATEGIC_DIMENSIONS = [
  'Price level',
  'Product / service breadth',
  'Brand strength',
  'Technology leadership',
  'Market coverage',
  'Service quality',
  'Marketing intensity',
  'Geographic reach',
]

const MATRIX_ROWS = [
  { key: 'positioning',  label: 'Positioning',          get: (c: Competitor) => c.aiAnalysis?.positioning || '—' },
  { key: 'tone',         label: 'Brand Tone',           get: (c: Competitor) => c.aiAnalysis?.tone || '—' },
  { key: 'themes',       label: 'Content Themes',       get: (c: Competitor) => (c.aiAnalysis?.themes || []).join(', ') || '—' },
  { key: 'gaps',         label: 'Weaknesses / Gaps',    get: (c: Competitor) => (c.aiAnalysis?.gaps || []).join(', ') || '—' },
  { key: 'moves',        label: 'Differentiation Moves',get: (c: Competitor) => (c.aiAnalysis?.moves || []).join(', ') || '—' },
  { key: 'keywords',     label: 'Top Keywords',         get: (c: Competitor) => ((c.keywords || []).slice(0, 5).map((k: any) => k.term).join(', ') || '—') },
] as const

const KEYWORD_INTENTS = [
  { key: 'informational', dot: 'bg-blue-400' },
  { key: 'commercial',    dot: 'bg-violet-400' },
  { key: 'transactional', dot: 'bg-green-400' },
  { key: 'navigational',  dot: 'bg-gray-400' },
]

const INTENT_CHIP_CLASSES: Record<KeywordIntent, string> = {
  informational: 'bg-blue-900/40 border-blue-700/50 text-blue-300',
  commercial:    'bg-violet-900/40 border-violet-700/50 text-violet-300',
  transactional: 'bg-green-900/40 border-green-700/50 text-green-300',
  navigational:  'bg-gray-700 border-gray-600 text-gray-300',
}

const socialPlatforms = [
  { key: 'twitter',   icon: 'fa-brands fa-x-twitter',  placeholder: 'https://twitter.com/username' },
  { key: 'facebook',  icon: 'fa-brands fa-facebook',   placeholder: 'https://facebook.com/page' },
  { key: 'instagram', icon: 'fa-brands fa-instagram',  placeholder: 'https://instagram.com/username' },
  { key: 'linkedin',  icon: 'fa-brands fa-linkedin',   placeholder: 'https://linkedin.com/company/name' },
  { key: 'bluesky',   icon: 'fa-brands fa-bluesky',    placeholder: 'https://bsky.app/profile/handle.bsky.social' },
  { key: 'mastodon',  icon: 'fa-brands fa-mastodon',   placeholder: 'https://mastodon.social/@username' },
  { key: 'tiktok',    icon: 'fa-brands fa-tiktok',     placeholder: 'https://tiktok.com/@username' },
  { key: 'youtube',   icon: 'fa-brands fa-youtube',    placeholder: 'https://youtube.com/@channel' },
  { key: 'pinterest', icon: 'fa-brands fa-pinterest',  placeholder: 'https://pinterest.com/username' },
]

export default function Competitors() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const competitorStore = useCompetitorStore()
  const composeStore = useComposeStore()

  const [mapOpen, setMapOpen] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [mapXAxis, setMapXAxis] = useState(STRATEGIC_DIMENSIONS[0])
  const [mapYAxis, setMapYAxis] = useState(STRATEGIC_DIMENSIONS[2])
  const [mapResult, setMapResult] = useState<{ xAxis: string; yAxis: string; players: any[]; clusters: string[]; whitespace: string[]; insight: string } | null>(null)

  const [matrixOpen, setMatrixOpen] = useState(false)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [matrixSynthesis, setMatrixSynthesis] = useState<string | null>(null)

  const [extractingQuantitative, setExtractingQuantitative] = useState<Record<string, boolean>>({})

  const [newForm, setNewForm] = useState({ name: '', websiteUrl: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', websiteUrl: '' })
  const [pendingSocialUrls, setPendingSocialUrls] = useState<Record<string, Record<string, string>>>({})

  const [placesConfigured, setPlacesConfigured] = useState(false)
  const [showLocalForm, setShowLocalForm] = useState(false)
  const [localLocation, setLocalLocation] = useState('')
  const [localBusinessType, setLocalBusinessType] = useState('')
  const [discoveringLocal, setDiscoveringLocal] = useState(false)

  const draftPost = (headline: string) => {
    composeStore.content = headline
    navigate('/compose')
  }

  const generateStrategicMap = async () => {
    setMapLoading(true)
    try {
      const res = await axios.post('/api/competitors/strategic-map', {
        xAxis: mapXAxis,
        yAxis: mapYAxis,
      })
      setMapResult(res.data)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Strategic map failed')
    } finally {
      setMapLoading(false)
    }
  }

  const generateMatrixSynthesis = async () => {
    setMatrixLoading(true)
    try {
      const res = await axios.post('/api/competitors/social-matrix')
      setMatrixSynthesis(res.data.synthesis)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Matrix synthesis failed')
    } finally {
      setMatrixLoading(false)
    }
  }

  const extractQuantitative = async (id: string) => {
    setExtractingQuantitative((prev) => ({ ...prev, [id]: true }))
    try {
      await competitorStore.fetchCompetitors()
      const res = await axios.post(`/api/competitors/${id}/extract-quantitative`)
      const idx = competitorStore.competitors.findIndex((c) => c._id === id)
      if (idx !== -1) {
        competitorStore.competitors[idx] = { ...competitorStore.competitors[idx], quantitativeProfile: res.data.quantitativeProfile }
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Quantitative extraction failed')
    } finally {
      setExtractingQuantitative((prev) => ({ ...prev, [id]: false }))
    }
  }

  const analyzedCompetitors = useMemo(() =>
    competitorStore.competitors.filter((c) => c.aiAnalysis),
    [competitorStore.competitors]
  )

  const gridClass = useMemo(() => {
    const n = competitorStore.competitors.length
    if (n <= 1) return 'space-y-4 mb-6'
    if (n === 2) return 'grid grid-cols-2 gap-4 mb-6 items-start'
    if (n === 3) return 'grid grid-cols-3 gap-4 mb-6 items-start'
    if (n === 4) return 'grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6 items-start'
    return 'grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6 items-start'
  }, [competitorStore.competitors.length])

  const sharedGapTerms = useMemo<Set<string>>(() => {
    const cs = competitorStore.competitors
    if (cs.length < 2) return new Set()
    const counts = new Map<string, number>()
    for (const c of cs) {
      for (const g of c.gapAnalysis?.gaps ?? []) {
        counts.set(g.term, (counts.get(g.term) ?? 0) + 1)
      }
    }
    return new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([term]) => term))
  }, [competitorStore.competitors])

  function otherCompetitorNames(currentId: string): string {
    const others = competitorStore.competitors.filter((c) => c._id !== currentId).map((c) => c.name)
    if (others.length === 0) return ''
    if (others.length === 1) return others[0]
    return others.slice(0, -1).join(', ') + ' & ' + others.slice(-1)[0]
  }

  function freshnessBadge(lastScraped: string | null) {
    if (!lastScraped) return { label: t('competitors.freshnessNever'), cls: 'bg-gray-700/80 text-gray-400' }
    const days = (Date.now() - new Date(lastScraped).getTime()) / 86400000
    if (days <= 7) return { label: t('competitors.freshnessFresh'), cls: 'bg-green-900/60 border border-green-700/50 text-green-300' }
    if (days <= 30) return { label: t('competitors.freshnessStale'), cls: 'bg-amber-900/60 border border-amber-700/50 text-amber-300' }
    return { label: t('competitors.freshnessOutdated'), cls: 'bg-red-900/60 border border-red-700/50 text-red-300' }
  }

  function intentChipClass(intent: string): string {
    return INTENT_CHIP_CLASSES[intent as KeywordIntent] ?? INTENT_CHIP_CLASSES.informational
  }

  function getEditSocialUrl(competitor: Competitor, platform: string): string {
    return pendingSocialUrls[competitor._id]?.[platform] ?? competitor.socialUrls?.[platform] ?? ''
  }

  function setSocialUrl(competitor: Competitor, platform: string, value: string) {
    setPendingSocialUrls((prev) => ({
      ...prev,
      [competitor._id]: {
        ...(prev[competitor._id] || {}),
        [platform]: value,
      },
    }))
  }

  async function saveSocialUrl(competitor: Competitor) {
    if (!pendingSocialUrls[competitor._id]) return
    const merged = { ...competitor.socialUrls }
    for (const [k, v] of Object.entries(pendingSocialUrls[competitor._id])) {
      if (v) merged[k] = v
      else delete merged[k]
    }
    await competitorStore.updateCompetitor(competitor._id, { socialUrls: merged })
  }

  async function createCompetitor() {
    if (!newForm.name.trim() || !newForm.websiteUrl.trim()) return
    const ok = await competitorStore.addCompetitor({ name: newForm.name.trim(), websiteUrl: newForm.websiteUrl.trim() })
    if (ok) {
      setNewForm({ name: '', websiteUrl: '' })
    }
  }

  const checkPlacesConfig = useCallback(async () => {
    try {
      const res = await axios.get('/api/credentials/google-places')
      setPlacesConfigured(res.data.configured)
    } catch {
      // not configured
    }
  }, [])

  async function discoverLocal() {
    if (!localLocation.trim()) return
    setDiscoveringLocal(true)
    competitorStore.error = null
    try {
      const res = await axios.post('/api/competitors/discover-local', {
        location: localLocation.trim(),
        businessType: localBusinessType.trim() || undefined,
      })
      const withWebsite = (res.data.suggestions || []).filter((s: any) => s.websiteUrl)
      competitorStore.discoverySuggestions.splice(0, Infinity, ...withWebsite)
      if (!withWebsite.length) competitorStore.error = 'No businesses with websites found — try a broader location or business type.'
      setShowLocalForm(false)
    } catch (err: any) {
      competitorStore.error = err.response?.data?.error || 'Local discovery failed'
    } finally {
      setDiscoveringLocal(false)
    }
  }

  async function acceptSuggestion(s: { name: string; websiteUrl: string }) {
    const ok = await competitorStore.addCompetitor({ name: s.name, websiteUrl: s.websiteUrl })
    if (ok) {
      competitorStore.discoverySuggestions.splice(
        competitorStore.discoverySuggestions.findIndex((x) => x.websiteUrl === s.websiteUrl), 1
      )
    }
  }

  function startEdit(competitor: Competitor) {
    setEditingId(competitor._id)
    setEditForm({ name: competitor.name, websiteUrl: competitor.websiteUrl })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    await competitorStore.updateCompetitor(id, { name: editForm.name.trim(), websiteUrl: editForm.websiteUrl.trim() })
    setEditingId(null)
  }

  async function confirmDelete(id: string) {
    if (confirm(t('competitors.confirmDelete'))) {
      await competitorStore.deleteCompetitor(id)
    }
  }

  useEffect(() => {
    competitorStore.fetchCompetitors()
    checkPlacesConfig()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`p-6 ${competitorStore.competitors.length >= 2 ? '' : 'max-w-3xl mx-auto'}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t('competitors.sectionTitle')}</h1>
        <p className="text-gray-400 mt-1">{t('competitors.sectionSubtitle')}</p>
      </div>

      {competitorStore.error && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
          {competitorStore.error}
        </div>
      )}

      {/* Side-by-side label + matrix toggle */}
      {competitorStore.competitors.length >= 2 && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <i className="fa-solid fa-table-columns"></i>
            {t('competitors.sideBySideMode')}
          </div>
          <div className="flex items-center gap-2">
            {analyzedCompetitors.length >= 1 && (
              <button
                onClick={() => { setMapOpen(!mapOpen); setMatrixOpen(false) }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  mapOpen ? 'bg-emerald-900/50 border-emerald-700 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                <i className="fa-solid fa-map text-[10px]"></i>
                {t('competitors.strategicMap')}
              </button>
            )}
            {analyzedCompetitors.length >= 2 && (
              <button
                onClick={() => { setMatrixOpen(!matrixOpen); setMapOpen(false) }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  matrixOpen ? 'bg-violet-900/50 border-violet-700 text-violet-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                <i className="fa-solid fa-table text-[10px]"></i>
                {t('competitors.compareMatrix')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Strategic Group Map */}
      {mapOpen && (
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 mr-auto">
              <i className="fa-solid fa-map text-xs text-emerald-400"></i>
              <span className="text-sm font-semibold text-white">{t('competitors.mapTitle')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">X:</span>
              <select
                value={mapXAxis}
                onChange={(e) => setMapXAxis(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                {STRATEGIC_DIMENSIONS.map((d) => (
                  <option key={d} value={d} disabled={d === mapYAxis}>{d}</option>
                ))}
              </select>
              <span className="text-gray-500">Y:</span>
              <select
                value={mapYAxis}
                onChange={(e) => setMapYAxis(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-emerald-500"
              >
                {STRATEGIC_DIMENSIONS.map((d) => (
                  <option key={d} value={d} disabled={d === mapXAxis}>{d}</option>
                ))}
              </select>
            </div>
            <button
              onClick={generateStrategicMap}
              disabled={mapLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 border border-emerald-700 rounded-lg transition-colors text-emerald-200"
            >
              <i className={`fa-solid fa-wand-magic-sparkles text-[10px] ${mapLoading ? 'animate-pulse' : ''}`}></i>
              {mapLoading ? t('competitors.mapGenerating') : t('competitors.mapGenerate')}
            </button>
          </div>

          {mapResult ? (
            <div className="p-5">
              <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-800/30 rounded-xl text-sm text-gray-300 leading-relaxed">
                <i className="fa-solid fa-lightbulb text-emerald-400 mr-2 text-xs"></i>{mapResult.insight}
              </div>

              <div className="relative bg-gray-800/40 border border-gray-700 rounded-xl" style={{ height: '320px', marginBottom: '1rem' }}>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-gray-500">{mapResult.xAxis} →</div>
                <div
                  className="absolute top-1/2 left-1 -translate-y-1/2 text-xs text-gray-500"
                  style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'translateY(-50%) rotate(180deg)' }}
                >
                  ↑ {mapResult.yAxis}
                </div>
                <div className="absolute inset-6 border border-gray-700/40 rounded">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="absolute border-t border-gray-700/20 w-full" style={{ top: `${i * 20}%` }}></div>
                  ))}
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="absolute border-l border-gray-700/20 h-full" style={{ left: `${i * 20}%` }}></div>
                  ))}
                </div>
                {mapResult.players.map((player) => (
                  <div
                    key={player.name}
                    className="absolute flex flex-col items-center gap-0.5 -translate-x-1/2 translate-y-1/2"
                    style={{ left: `calc(6% + ${(player.x - 1) / 9 * 88}%)`, bottom: `calc(6% + ${(player.y - 1) / 9 * 88}%)` }}
                  >
                    <div
                      className={`w-3 h-3 rounded-full border-2 shadow-lg ${
                        player.isYou ? 'bg-emerald-400 border-emerald-300' : 'bg-violet-400 border-violet-300'
                      }`}
                    ></div>
                    <span
                      className={`text-[10px] font-medium px-1 rounded whitespace-nowrap ${
                        player.isYou ? 'text-emerald-300 bg-emerald-950/80' : 'text-gray-200 bg-gray-900/80'
                      }`}
                    >
                      {player.name}
                    </span>
                  </div>
                ))}
              </div>

              {Boolean(mapResult.whitespace?.length) && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-400 mb-1.5">{t('competitors.mapWhitespace')}</div>
                  <div className="flex flex-wrap gap-2">
                    {mapResult.whitespace.map((w) => (
                      <span key={w} className="text-xs px-2 py-1 bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 rounded-full">
                        <i className="fa-solid fa-circle-plus mr-1 text-[9px]"></i>{w}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Boolean(mapResult.clusters?.length) && (
                <div>
                  <div className="text-xs font-medium text-gray-400 mb-1.5">{t('competitors.mapClusters')}</div>
                  <ul className="space-y-0.5">
                    {mapResult.clusters.map((c) => (
                      <li key={c} className="flex gap-1.5 text-xs text-gray-400">
                        <span className="text-violet-400 shrink-0">›</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-gray-500">
              {t('competitors.mapEmpty')}
            </div>
          )}
        </div>
      )}

      {/* Competitor comparison matrix */}
      {matrixOpen && analyzedCompetitors.length >= 2 && (
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-table text-xs text-violet-400"></i>
              <span className="text-sm font-semibold text-white">{t('competitors.matrixTitle')}</span>
            </div>
            <button
              onClick={generateMatrixSynthesis}
              disabled={matrixLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-800 hover:bg-violet-700 disabled:opacity-40 border border-violet-700 rounded-lg transition-colors text-violet-200"
            >
              <i className={`fa-solid fa-wand-magic-sparkles text-[10px] ${matrixLoading ? 'animate-pulse' : ''}`}></i>
              {matrixLoading ? t('competitors.matrixSynthesizing') : t('competitors.matrixSynthesize')}
            </button>
          </div>

          {matrixSynthesis && (
            <div className="px-5 py-3 bg-violet-950/40 border-b border-violet-800/30 text-sm text-gray-300 leading-relaxed">
              <i className="fa-solid fa-lightbulb text-violet-400 mr-2 text-xs"></i>{matrixSynthesis}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-32 shrink-0">Dimension</th>
                  {analyzedCompetitors.map((c) => (
                    <th key={c._id} className="text-left px-4 py-2.5 text-violet-300 font-semibold">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 font-medium align-top shrink-0">{row.label}</td>
                    {analyzedCompetitors.map((c) => (
                      <td key={c._id} className="px-4 py-2.5 text-gray-300 align-top">{row.get(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Competitor cards */}
      {competitorStore.competitors.length ? (
        <div className={gridClass}>
          {competitorStore.competitors.map((competitor) => (
            <div key={competitor._id} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  {editingId === competitor._id ? (
                    <>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm mb-2 focus:outline-none focus:border-violet-500"
                        placeholder={t('competitors.namePlaceholder')}
                      />
                      <input
                        value={editForm.websiteUrl}
                        onChange={(e) => setEditForm({ ...editForm, websiteUrl: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500"
                        placeholder={t('competitors.websitePlaceholder')}
                      />
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-white">{competitor.name}</div>
                      <a href={competitor.websiteUrl} target="_blank" rel="noopener" className="text-violet-400 text-sm hover:underline truncate block">
                        {competitor.websiteUrl}
                      </a>
                    </>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {editingId === competitor._id ? (
                    <>
                      <button onClick={() => saveEdit(competitor._id)} className="text-xs px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded">
                        {t('competitors.save')}
                      </button>
                      <button onClick={cancelEdit} className="text-xs px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded">
                        {t('competitors.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(competitor)} className="text-xs px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded">
                        {t('competitors.edit')}
                      </button>
                      <button onClick={() => confirmDelete(competitor._id)} className="text-xs px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded">
                        {t('competitors.delete')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Social URLs collapsible */}
              <details className="mb-3">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-200 select-none">
                  {t('competitors.socialUrls')}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {socialPlatforms.map((platform) => (
                    <div key={platform.key} className="flex items-center gap-2">
                      <i className={`${platform.icon} w-4 text-center text-gray-400 text-sm`}></i>
                      <input
                        value={getEditSocialUrl(competitor, platform.key)}
                        onChange={(e) => setSocialUrl(competitor, platform.key, e.target.value)}
                        onBlur={() => saveSocialUrl(competitor)}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-2.5 py-1 text-white text-xs focus:outline-none focus:border-violet-500"
                        placeholder={platform.placeholder}
                      />
                    </div>
                  ))}
                </div>
              </details>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => competitorStore.scrapeCompetitor(competitor._id)}
                  disabled={competitorStore.scraping[competitor._id]}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`fa-solid fa-rotate ${competitorStore.scraping[competitor._id] ? 'animate-spin' : ''}`}></i>
                  {competitorStore.scraping[competitor._id] ? t('competitors.scraping') : t('competitors.scrapeNow')}
                </button>
                <button
                  onClick={() => competitorStore.summarizeCompetitor(competitor._id)}
                  disabled={competitorStore.summarizing[competitor._id] || !competitor.scrapedContent.length}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-700 hover:bg-violet-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`fa-solid fa-wand-magic-sparkles ${competitorStore.summarizing[competitor._id] ? 'animate-pulse' : ''}`}></i>
                  {competitorStore.summarizing[competitor._id] ? t('competitors.summarizing') : t('competitors.summarizeAi')}
                </button>
                <button
                  onClick={() => competitorStore.extractKeywords(competitor._id)}
                  disabled={competitorStore.extractingKeywords[competitor._id] || !competitor.scrapedContent.length}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`fa-solid fa-tags ${competitorStore.extractingKeywords[competitor._id] ? 'animate-pulse' : ''}`}></i>
                  {competitorStore.extractingKeywords[competitor._id] ? t('competitors.extractingKeywords') : t('competitors.extractKeywords')}
                </button>
                <button
                  onClick={() => competitorStore.detectSignals(competitor._id)}
                  disabled={competitorStore.detectingSignals[competitor._id] || !competitor.scrapedContent.length}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed ${
                    competitor.contentChanged && !competitorStore.detectingSignals[competitor._id] ? 'ring-1 ring-yellow-400' : ''
                  }`}
                >
                  <i className={`fa-solid fa-tower-broadcast ${competitorStore.detectingSignals[competitor._id] ? 'animate-pulse' : ''}`}></i>
                  {competitorStore.detectingSignals[competitor._id] ? t('competitors.detectingSignals') : t('competitors.detectSignals')}
                </button>
                <button
                  onClick={() => competitorStore.analyzeGaps(competitor._id)}
                  disabled={competitorStore.analyzingGaps[competitor._id] || !competitor.keywords?.length}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`fa-solid fa-code-compare ${competitorStore.analyzingGaps[competitor._id] ? 'animate-pulse' : ''}`}></i>
                  {competitorStore.analyzingGaps[competitor._id] ? t('competitors.analyzingGaps') : t('competitors.analyzeGaps')}
                </button>
                <button
                  onClick={() => competitorStore.generateRoadmap(competitor._id)}
                  disabled={competitorStore.generatingRoadmap[competitor._id] || (!competitor.keywords?.length && !competitor.scrapedContent.length)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className={`fa-solid fa-map ${competitorStore.generatingRoadmap[competitor._id] ? 'animate-pulse' : ''}`}></i>
                  {competitorStore.generatingRoadmap[competitor._id] ? t('competitors.generatingRoadmap') : t('competitors.generateRoadmap')}
                </button>
              </div>

              {/* Scrape result message */}
              {competitorStore.scrapeResults[competitor._id] && (
                <div
                  className={`mb-3 text-xs px-3 py-1.5 rounded ${
                    competitorStore.scrapeResults[competitor._id].ok ? 'bg-green-900/40 text-green-300' : 'bg-amber-900/40 text-amber-300'
                  }`}
                >
                  {competitorStore.scrapeResults[competitor._id].ok
                    ? (competitorStore.scrapeResults[competitor._id].sources > 0
                        ? t('competitors.scrapeSuccess', { count: competitorStore.scrapeResults[competitor._id].sources })
                        : t('competitors.scrapeNoContent'))
                    : competitorStore.scrapeResults[competitor._id].message}
                </div>
              )}

              {/* Freshness row */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${freshnessBadge(competitor.lastScraped).cls}`}>
                  {freshnessBadge(competitor.lastScraped).label}
                </span>
                {competitor.lastScraped && (
                  <span className="text-xs text-gray-500">
                    {t('competitors.lastScraped')}: {new Date(competitor.lastScraped).toLocaleString()}
                  </span>
                )}
                {competitor.contentChanged && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-900/50 border border-blue-700/50 text-blue-300 rounded-full">
                    <i className="fa-solid fa-circle-dot text-[8px] animate-pulse"></i>
                    {t('competitors.newActivity')}
                  </span>
                )}
              </div>

              {/* Market Signals */}
              {Boolean(competitor.signals?.length) && (
                <div className="mb-3">
                  <div className="text-xs text-yellow-400 font-medium mb-1.5">{t('competitors.signalsLabel')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {competitor.signals!.map((signal) => (
                      <span
                        key={signal.type + signal.detectedAt}
                        title={signal.description}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded-full cursor-default ${
                          signal.severity === 'high'
                            ? 'bg-red-900/40 border-red-700/60 text-red-300'
                            : signal.severity === 'medium'
                            ? 'bg-amber-900/40 border-amber-700/60 text-amber-300'
                            : 'bg-gray-700/60 border-gray-600/60 text-gray-300'
                        }`}
                      >
                        <i className="fa-solid fa-tower-broadcast text-[9px]"></i>
                        {t(`competitors.signalType_${signal.type}`) || signal.type.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  {competitor.signals!.length === 1 && (
                    <p className="text-xs text-gray-400 mt-1.5 italic">{competitor.signals![0].description}</p>
                  )}
                </div>
              )}

              {/* Structured Profile Fact-sheet */}
              {(competitor.aiAnalysis?.profile?.pricing || Boolean(competitor.aiAnalysis?.profile?.keyFeatures?.length)) && (
                <div className="mb-3 p-3 bg-gray-900/50 border border-gray-700/60 rounded-lg text-xs space-y-1.5">
                  {competitor.aiAnalysis?.profile?.pricing && (
                    <div className="flex gap-1.5">
                      <span className="text-gray-500 shrink-0">{t('competitors.profilePricing')}:</span>
                      <span className="text-gray-300">{competitor.aiAnalysis.profile.pricing}</span>
                    </div>
                  )}
                  {competitor.aiAnalysis?.profile?.targetCustomer && (
                    <div className="flex gap-1.5">
                      <span className="text-gray-500 shrink-0">{t('competitors.profileTarget')}:</span>
                      <span className="text-gray-300">{competitor.aiAnalysis.profile.targetCustomer}</span>
                    </div>
                  )}
                  {Boolean(competitor.aiAnalysis?.profile?.keyFeatures?.length) && (
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-gray-500 shrink-0">{t('competitors.profileFeatures')}:</span>
                      {competitor.aiAnalysis!.profile!.keyFeatures!.map((f) => (
                        <span key={f} className="px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">{f}</span>
                      ))}
                    </div>
                  )}
                  {Boolean(competitor.aiAnalysis?.profile?.marketingChannels?.length) && (
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-gray-500 shrink-0">{t('competitors.profileChannels')}:</span>
                      {competitor.aiAnalysis!.profile!.marketingChannels!.map((c) => (
                        <span key={c} className="px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Structured AI Analysis */}
              {competitor.aiAnalysis ? (
                <div className="mt-3 space-y-3">
                  <div className="p-3 bg-gray-700/50 rounded border border-gray-600 space-y-2">
                    <div className="text-xs text-violet-400 font-medium">{t('competitors.aiAnalysisLabel')}</div>
                    {competitor.aiAnalysis.tone && (
                      <div className="text-sm">
                        <span className="text-xs text-gray-400">{t('competitors.analysisTone')}: </span>
                        <span className="text-gray-200 italic">{competitor.aiAnalysis.tone}</span>
                      </div>
                    )}
                    {competitor.aiAnalysis.positioning && (
                      <div className="text-sm">
                        <span className="text-xs text-gray-400">{t('competitors.analysisPositioning')}: </span>
                        <span className="text-gray-200">{competitor.aiAnalysis.positioning}</span>
                      </div>
                    )}
                  </div>

                  {Boolean(competitor.aiAnalysis.themes?.length) && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1.5">{t('competitors.analysisThemes')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {competitor.aiAnalysis.themes!.map((theme) => (
                          <span
                            key={theme}
                            className="text-xs px-2 py-0.5 bg-gray-700 border border-gray-600 text-gray-300 rounded-full"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Boolean(competitor.aiAnalysis.gaps?.length) && (
                    <div>
                      <div className="text-xs text-amber-400 font-medium mb-1.5">{t('competitors.analysisGaps')}</div>
                      <ul className="space-y-1">
                        {competitor.aiAnalysis.gaps!.map((gap) => (
                          <li key={gap} className="flex gap-1.5 items-start text-xs text-amber-200">
                            <span className="text-amber-400 mt-0.5 shrink-0">→</span>{gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Boolean(competitor.aiAnalysis.moves?.length) && (
                    <div>
                      <div className="text-xs text-green-400 font-medium mb-1.5">{t('competitors.analysisMoves')}</div>
                      <ul className="space-y-1">
                        {competitor.aiAnalysis.moves!.map((move) => (
                          <li key={move} className="flex gap-1.5 items-start text-xs text-green-200">
                            <span className="text-green-400 mt-0.5 shrink-0">✓</span>{move}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Boolean(competitor.aiAnalysis.prediction?.likelyNextMoves?.length) && (
                    <div className="p-3 bg-gray-700/30 rounded border border-gray-700 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-sky-400 font-medium">{t('competitors.predictionLabel')}</div>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            competitor.aiAnalysis.prediction!.satisfiedWithPosition
                              ? 'bg-gray-700 text-gray-400'
                              : 'bg-orange-900/40 text-orange-300'
                          }`}
                        >
                          {competitor.aiAnalysis.prediction!.satisfiedWithPosition
                            ? t('competitors.predictionSatisfied')
                            : t('competitors.predictionPushing')}
                        </span>
                      </div>
                      {Boolean(competitor.aiAnalysis.prediction?.likelyNextMoves?.length) && (
                        <div>
                          <div className="text-xs text-gray-400 mb-1">{t('competitors.predictionNextMoves')}</div>
                          <ul className="space-y-0.5">
                            {competitor.aiAnalysis.prediction!.likelyNextMoves.map((move) => (
                              <li key={move} className="text-xs text-sky-200 flex gap-1.5">
                                <span className="text-sky-400 shrink-0">→</span>{move}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {Boolean(competitor.aiAnalysis.prediction?.vulnerabilities?.length) && (
                        <div>
                          <div className="text-xs text-gray-400 mb-1">{t('competitors.predictionVulnerabilities')}</div>
                          <ul className="space-y-0.5">
                            {competitor.aiAnalysis.prediction!.vulnerabilities.map((v) => (
                              <li key={v} className="text-xs text-amber-200 flex gap-1.5">
                                <span className="text-amber-400 shrink-0">⚡</span>{v}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {Boolean(competitor.aiAnalysis.prediction?.retaliationTriggers?.length) && (
                        <div>
                          <div className="text-xs text-gray-400 mb-1">{t('competitors.predictionRetaliationTriggers')}</div>
                          <ul className="space-y-0.5">
                            {competitor.aiAnalysis.prediction!.retaliationTriggers.map((rt) => (
                              <li key={rt} className="text-xs text-red-300 flex gap-1.5">
                                <span className="text-red-400 shrink-0">⚠</span>{rt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : competitor.aiSummary ? (
                <div className="mb-3 p-3 bg-gray-700/50 rounded border border-gray-600 text-sm text-gray-200">
                  <div className="text-xs text-violet-400 font-medium mb-1">{t('competitors.aiSummaryLabel')}</div>
                  {competitor.aiSummary}
                </div>
              ) : null}

              {/* Keywords */}
              {Boolean(competitor.keywords && competitor.keywords.length) && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-blue-400 font-medium">{t('competitors.keywordsLabel')}</div>
                    <div className="flex items-center gap-2.5">
                      {KEYWORD_INTENTS.map((intent) => (
                        <span key={intent.key} className="flex items-center gap-1 text-xs text-gray-400">
                          <span className={`${intent.dot} w-1.5 h-1.5 rounded-full shrink-0`}></span>
                          {t(`competitors.intent_${intent.key}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {competitor.keywords!.map((kw) => (
                      <span
                        key={typeof kw === 'string' ? kw : kw.term}
                        className={`inline-block text-xs px-2 py-0.5 border rounded-full cursor-default ${
                          typeof kw === 'string' ? 'bg-blue-900/40 border-blue-700/50 text-blue-300' : intentChipClass(kw.intent)
                        }`}
                        title={typeof kw === 'string' ? '' : t(`competitors.intent_${kw.intent}`)}
                      >
                        {typeof kw === 'string' ? kw : kw.term}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Gap Analysis */}
              {competitor.gapAnalysis && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-orange-400 font-medium">{t('competitors.gapAnalysisLabel')}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="text-orange-300">{competitor.gapAnalysis.gaps.length} {t('competitors.gapCount')}</span>
                      <span>·</span>
                      <span className="text-green-400">{competitor.gapAnalysis.covered.length} {t('competitors.coveredCount')}</span>
                      <span>·</span>
                      <span>{new Date(competitor.gapAnalysis.lastAnalyzed).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {competitor.gapAnalysis.hashtagStatsEmpty && (
                    <div className="mb-2 p-2.5 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-300">
                      {t('competitors.gapNoHashtagStats')}
                    </div>
                  )}

                  {competitor.gapAnalysis.gaps.length ? (
                    <div className="mb-3">
                      <div className="text-xs text-gray-400 mb-1.5">{t('competitors.gapMissing')}</div>
                      {sharedGapTerms.size > 0 && competitor.gapAnalysis.gaps.some((g) => sharedGapTerms.has(g.term)) && (
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-rose-400">
                          <i className="fa-solid fa-triangle-exclamation"></i>
                          {t('competitors.sharedGapsNote', { name: otherCompetitorNames(competitor._id) })}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {competitor.gapAnalysis.gaps.map((gap) => (
                          <span
                            key={gap.term}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded-full ${
                              sharedGapTerms.has(gap.term)
                                ? 'bg-rose-900/40 border-rose-600/70 text-rose-300'
                                : intentChipClass(gap.intent)
                            }`}
                            title={
                              sharedGapTerms.has(gap.term)
                                ? t('competitors.sharedGapTitle', { name: otherCompetitorNames(competitor._id) })
                                : t(`competitors.intent_${gap.intent}`)
                            }
                          >
                            {sharedGapTerms.has(gap.term) ? (
                              <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                            ) : (
                              <span className="opacity-60 text-[10px]">{gap.intent[0].toUpperCase()}</span>
                            )}
                            {gap.term}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 text-xs text-green-400">{t('competitors.gapNoneFound')}</div>
                  )}

                  {Boolean(competitor.gapAnalysis.covered.length) && (
                    <details className="group">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-200 select-none">
                        {t('competitors.gapCoveredToggle', { count: competitor.gapAnalysis.covered.length })}
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {competitor.gapAnalysis.covered.map((item) => (
                          <span
                            key={item.term}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-900/30 border border-green-700/40 text-green-300 rounded-full"
                            title={item.matchedHashtags.join(', ')}
                          >
                            <i className="fa-solid fa-check text-[9px]"></i>{item.term}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* Content Roadmap */}
              {Boolean(competitor.contentRoadmap?.length) && (
                <div className="mt-4">
                  <div className="text-xs text-emerald-400 font-medium mb-2">{t('competitors.roadmapLabel')}</div>
                  <div className="space-y-2">
                    {competitor.contentRoadmap!.map((post, idx) => (
                      <div key={idx} className="p-3 bg-gray-700/50 rounded border border-gray-600">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="text-xs font-semibold text-emerald-300">{post.topic}</div>
                          <button
                            onClick={() => draftPost(post.headline)}
                            className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 bg-violet-700 hover:bg-violet-600 text-white rounded"
                          >
                            <i className="fa-solid fa-pen-to-square"></i>
                            {t('competitors.roadmapDraft')}
                          </button>
                        </div>
                        <p className="text-sm text-gray-200 mb-2">{post.headline}</p>
                        {post.rationale && (
                          <div className="text-xs text-gray-400 italic mb-2">{post.rationale}</div>
                        )}
                        {Boolean(post.keywords?.length) && (
                          <div className="flex flex-wrap gap-1">
                            {post.keywords.map((kw) => (
                              <span
                                key={kw}
                                className="text-xs px-1.5 py-0.5 bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 rounded"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantitative profile */}
              {competitor.quantitativeProfile && (
                <div className="mt-4 border-t border-gray-700/60 pt-3">
                  <div className="text-xs text-cyan-400 font-medium mb-2">{t('competitors.quantitativeLabel')}</div>
                  {Boolean(competitor.quantitativeProfile.pricingTiers?.length) && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-500 mb-1">{t('competitors.quantitativePricing')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {competitor.quantitativeProfile.pricingTiers!.map((tier) => (
                          <div key={tier.name} className="px-2 py-1 bg-cyan-900/30 border border-cyan-700/40 rounded text-xs text-cyan-200">
                            <span className="font-medium">{tier.name}</span>
                            <span className="text-cyan-400 ml-1">{tier.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Boolean(competitor.quantitativeProfile.keyFeatures?.length) && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-500 mb-1">{t('competitors.quantitativeFeatures')}</div>
                      <ul className="space-y-0.5">
                        {competitor.quantitativeProfile.keyFeatures!.slice(0, 5).map((f) => (
                          <li key={f} className="flex gap-1 text-xs text-gray-300">
                            <span className="text-cyan-500 shrink-0">›</span>{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                    {competitor.quantitativeProfile.targetCustomer && (
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-user-group text-[9px] text-cyan-500"></i>{competitor.quantitativeProfile.targetCustomer}
                      </span>
                    )}
                    {competitor.quantitativeProfile.jobPostings != null && (
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-briefcase text-[9px] text-green-400"></i>{competitor.quantitativeProfile.jobPostings} open roles
                      </span>
                    )}
                  </div>

                  {Boolean(competitor.quantitativeProfile.growthSignals?.length) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {competitor.quantitativeProfile.growthSignals!.map((s) => (
                        <span key={s} className="text-xs px-1.5 py-0.5 bg-green-900/30 border border-green-700/40 text-green-300 rounded-full">
                          <i className="fa-solid fa-arrow-trend-up text-[9px] mr-0.5"></i>{s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Extract quantitative data button */}
              <div className="mt-3 pt-3 border-t border-gray-700/60">
                <button
                  onClick={() => extractQuantitative(competitor._id)}
                  disabled={extractingQuantitative[competitor._id]}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-cyan-900/50 hover:bg-cyan-800/60 disabled:opacity-40 border border-cyan-700/50 rounded-lg text-cyan-300 transition-colors w-full justify-center"
                >
                  <i className={`fa-solid fa-database text-[10px] ${extractingQuantitative[competitor._id] ? 'animate-pulse' : ''}`}></i>
                  {extractingQuantitative[competitor._id] ? t('competitors.extractingQuantitative') : t('competitors.extractQuantitative')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : !competitorStore.loading ? (
        <div className="mb-6 p-8 text-center bg-gray-800 border border-gray-700 rounded-lg max-w-xl">
          <p className="text-gray-400 mb-4">{t('competitors.emptyState')}</p>
          <button
            onClick={() => competitorStore.discoverCompetitors()}
            disabled={competitorStore.discoveringCompetitors}
            className="inline-flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm rounded disabled:opacity-50"
          >
            <i className={`fa-solid fa-magnifying-glass ${competitorStore.discoveringCompetitors ? 'animate-pulse' : ''}`}></i>
            {competitorStore.discoveringCompetitors ? t('competitors.discovering') : t('competitors.discoverButton')}
          </button>
        </div>
      ) : null}

      {/* Discovery suggestions */}
      {Boolean(competitorStore.discoverySuggestions.length) && (
        <div className="mb-6 max-w-xl">
          <div className="text-xs text-gray-400 mb-2">{t('competitors.discoverySuggestionsLabel')}</div>
          <div className="space-y-2">
            {competitorStore.discoverySuggestions.map((s) => (
              <div key={s.websiteUrl} className="flex items-start gap-3 p-3 bg-gray-800 border border-gray-700 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{s.name}</div>
                  <a href={s.websiteUrl} target="_blank" rel="noopener" className="text-xs text-violet-400 hover:underline truncate block">
                    {s.websiteUrl}
                  </a>
                  {s.reason && <p className="text-xs text-gray-400 mt-0.5">{s.reason}</p>}
                </div>
                <button
                  onClick={() => acceptSuggestion(s)}
                  disabled={competitorStore.competitors.length >= 5}
                  className="shrink-0 text-xs px-3 py-1.5 bg-violet-700 hover:bg-violet-600 text-white rounded disabled:opacity-40"
                >
                  {t('competitors.discoverAccept')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add competitor form */}
      {competitorStore.competitors.length < 5 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">{t('competitors.addCompetitor')}</h2>
            {!competitorStore.discoverySuggestions.length && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => competitorStore.discoverCompetitors()}
                  disabled={competitorStore.discoveringCompetitors}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded disabled:opacity-50"
                >
                  <i className={`fa-solid fa-magnifying-glass text-[10px] ${competitorStore.discoveringCompetitors ? 'animate-pulse' : ''}`}></i>
                  {competitorStore.discoveringCompetitors ? t('competitors.discovering') : t('competitors.discoverButton')}
                </button>
                {placesConfigured && (
                  <button
                    onClick={() => setShowLocalForm(!showLocalForm)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-green-800 hover:bg-green-700 text-green-200 rounded"
                  >
                    <i className="fa-solid fa-location-dot text-[10px]"></i>
                    {t('competitors.discoverLocalButton')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Local discovery form */}
          {showLocalForm && placesConfigured && (
            <div className="mb-3 p-3 bg-green-900/20 border border-green-800/50 rounded-lg space-y-2">
              <div className="text-xs text-green-400 font-medium mb-1">{t('competitors.localDiscoveryLabel')}</div>
              <input
                value={localLocation}
                onChange={(e) => setLocalLocation(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-green-500"
                placeholder={t('competitors.localLocationPlaceholder')}
              />
              <input
                value={localBusinessType}
                onChange={(e) => setLocalBusinessType(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-green-500"
                placeholder={t('competitors.localBusinessTypePlaceholder')}
              />
              <button
                onClick={discoverLocal}
                disabled={discoveringLocal || !localLocation.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
              >
                <i className={`fa-solid fa-location-dot ${discoveringLocal ? 'animate-pulse' : ''}`}></i>
                {discoveringLocal ? t('competitors.discovering') : t('competitors.discoverLocalSearch')}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <input
              value={newForm.name}
              onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
              placeholder={t('competitors.namePlaceholder')}
            />
            <input
              value={newForm.websiteUrl}
              onChange={(e) => setNewForm({ ...newForm, websiteUrl: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
              placeholder={t('competitors.websitePlaceholder')}
            />
          </div>
          <button
            onClick={createCompetitor}
            disabled={!newForm.name.trim() || !newForm.websiteUrl.trim()}
            className="mt-3 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('competitors.addButton')}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center">{t('competitors.maxReached')}</p>
      )}
    </div>
  )
}
