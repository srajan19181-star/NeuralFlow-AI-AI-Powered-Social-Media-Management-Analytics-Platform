import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { usePlatformsStore } from '../stores/platforms'
import { useAiStore, PROVIDER_MODELS, CLOUD_PROVIDER_NAMES } from '../stores/ai'
import ChatConnector from '../components/ChatConnector'
import { useI18n } from '../locales'

const SETTINGS_GROUPS: {
  id: string
  connector?: 'claude' | 'chatgpt' | 'local'
  providers: string[]
  image?: 'openai' | 'gemini' | 'local' | 'grok'
}[] = [
  { id: 'claude', connector: 'claude', providers: ['anthropic'] },
  { id: 'openai', connector: 'chatgpt', providers: ['openai'], image: 'openai' },
  { id: 'local', connector: 'local', providers: ['custom'], image: 'local' },
  { id: 'google', providers: ['gemini'], image: 'gemini' },
  { id: 'other', providers: ['groq'], image: 'grok' },
  { id: 'social', providers: [] },
]

interface ProviderFormState {
  apiKey: string
  baseUrl: string
  model: string
  editing: boolean
  saving: boolean
  saved: boolean
}

const PROVIDER_BADGE: Record<string, { cls: string; abbr: string }> = {
  anthropic: { cls: 'bg-amber-700', abbr: 'CLD' },
  openai: { cls: 'bg-emerald-700', abbr: 'OAI' },
  groq: { cls: 'bg-orange-700', abbr: 'GRQ' },
  gemini: { cls: 'bg-blue-700', abbr: 'GEM' },
  custom: { cls: 'bg-gray-600', abbr: 'API' },
}

const emptyForm = (): ProviderFormState => ({
  apiKey: '',
  baseUrl: '',
  model: '',
  editing: false,
  saving: false,
  saved: false,
})

export default function GlobalSettings() {
  const { t } = useI18n()
  const platformsStore = usePlatformsStore()
  const aiStore = useAiStore()

  // Meta app
  const [metaAppId, setMetaAppId] = useState('')
  const [metaAppSecret, setMetaAppSecret] = useState('')
  const [editingMetaApp, setEditingMetaApp] = useState(false)
  const metaAppConfigured = platformsStore.metaCredentials.configured

  async function saveMetaApp() {
    await platformsStore.saveMetaApp(metaAppId, metaAppSecret)
    if (!platformsStore.metaError) {
      setEditingMetaApp(false)
      setMetaAppSecret('')
    }
  }

  // Pinterest app
  const [pinterestClientId, setPinterestClientId] = useState('')
  const [pinterestClientSecret, setPinterestClientSecret] = useState('')
  const [editingPinterestApp, setEditingPinterestApp] = useState(false)
  const pinterestAppConfigured = platformsStore.pinterestCredentials.configured

  async function savePinterestApp() {
    await platformsStore.savePinterestApp(pinterestClientId, pinterestClientSecret)
    if (!platformsStore.pinterestError) {
      setEditingPinterestApp(false)
      setPinterestClientSecret('')
    }
  }

  // TikTok app
  const [tiktokClientKey, setTiktokClientKey] = useState('')
  const [tiktokClientSecret, setTiktokClientSecret] = useState('')
  const [editingTikTokApp, setEditingTikTokApp] = useState(false)
  const tiktokAppConfigured = platformsStore.tiktokCredentials.configured

  async function saveTikTokApp() {
    await platformsStore.saveTikTokApp(tiktokClientKey, tiktokClientSecret)
    if (!platformsStore.tiktokError) {
      setEditingTikTokApp(false)
      setTiktokClientSecret('')
    }
  }

  // Google Places
  const [placesApiKey, setPlacesApiKey] = useState('')
  const [placesConfigured, setPlacesConfigured] = useState(false)
  const [placesKeyHint, setPlacesKeyHint] = useState<string | null>(null)
  const [placesSaving, setPlacesSaving] = useState(false)

  async function loadPlacesConfig() {
    try {
      const res = await axios.get('/api/credentials/google-places')
      setPlacesConfigured(res.data.configured)
      setPlacesKeyHint(res.data.keyHint)
    } catch {
      // not configured
    }
  }

  async function savePlacesKey() {
    if (!placesApiKey.trim()) return
    setPlacesSaving(true)
    try {
      await axios.post('/api/credentials/google-places', { apiKey: placesApiKey.trim() })
      setPlacesConfigured(true)
      setPlacesKeyHint(`****${placesApiKey.trim().slice(-4)}`)
      setPlacesApiKey('')
    } finally {
      setPlacesSaving(false)
    }
  }

  async function removePlacesKey() {
    if (!confirm(t('settings.googlePlaces.disconnectConfirm'))) return
    await axios.delete('/api/credentials/google-places')
    setPlacesConfigured(false)
    setPlacesKeyHint(null)
  }

  // Image Generation
  const [imageGeminiModel, setImageGeminiModel] = useState('')
  const [imageGeminiModels, setImageGeminiModels] = useState<string[]>([])
  const [imageGeminiModelsLoading, setImageGeminiModelsLoading] = useState(false)
  const [imageGrokModel, setImageGrokModel] = useState('')
  const [imageXaiApiKey, setImageXaiApiKey] = useState('')
  const [imageXaiConfigured, setImageXaiConfigured] = useState(false)
  const [imageXaiKeyHint, setImageXaiKeyHint] = useState<string | null>(null)
  const [imageLocalEndpoint, setImageLocalEndpoint] = useState('')
  const [imageLocalSteps, setImageLocalSteps] = useState(25)
  const [imageLocalTesting, setImageLocalTesting] = useState(false)
  const [imageLocalTestResult, setImageLocalTestResult] = useState<{
    ok: boolean
    models: string[]
    activeModel: string | null
    error?: string
  } | null>(null)
  const [imageConfigSaving, setImageConfigSaving] = useState(false)
  const [imageFeedbackGroup, setImageFeedbackGroup] = useState('')
  const [imageConfigSaved, setImageConfigSaved] = useState(false)
  const [imageConfigError, setImageConfigError] = useState('')

  const imageOpenAiReady = aiStore.providers.some((p: any) => p.name === 'openai' && p.configured)
  const imageGeminiReady = aiStore.providers.some((p: any) => p.name === 'gemini' && p.configured)

  function applyImageConfig(data: any) {
    setImageGeminiModel(data.geminiModel || '')
    setImageLocalEndpoint(data.localEndpoint || '')
    setImageLocalSteps(data.localSteps || 25)
    setImageGrokModel(data.grokModel || '')
    setImageXaiConfigured(!!data.xaiConfigured)
    setImageXaiKeyHint(data.xaiKeyHint || null)
  }

  async function loadImageConfig() {
    try {
      const res = await axios.get('/api/ai/image-config')
      applyImageConfig(res.data)
    } catch {
      // defaults
    }
  }

  async function removeXaiKey() {
    if (!confirm(t('settings.imageGen.grokRemoveConfirm'))) return
    await axios.delete('/api/ai/image-config/xai-key')
    setImageXaiConfigured(false)
    setImageXaiKeyHint(null)
  }

  async function loadGeminiImageModels() {
    setImageFeedbackGroup('gemini')
    setImageGeminiModelsLoading(true)
    try {
      const res = await axios.post('/api/ai/image-config/gemini-models')
      const models = res.data.models || []
      setImageGeminiModels(models)
      if (!imageGeminiModel && models.length) setImageGeminiModel(models[0])
    } catch (err: any) {
      setImageConfigError(err.response?.data?.error || t('settings.imageGen.loadModelsFailed'))
    } finally {
      setImageGeminiModelsLoading(false)
    }
  }

  async function testLocalImageServer() {
    setImageLocalTesting(true)
    setImageLocalTestResult(null)
    try {
      const res = await axios.post('/api/ai/image-config/test-local', {
        endpoint: imageLocalEndpoint.trim(),
      })
      setImageLocalTestResult(res.data)
    } catch (err: any) {
      setImageLocalTestResult({
        ok: false,
        models: [],
        activeModel: null,
        error: err.response?.data?.error || err.message,
      })
    } finally {
      setImageLocalTesting(false)
    }
  }

  async function saveImageConfig(provider: 'openai' | 'gemini' | 'local' | 'grok' | undefined) {
    setImageFeedbackGroup(provider || '')
    setImageConfigSaving(true)
    setImageConfigSaved(false)
    setImageConfigError('')
    try {
      const payload =
        provider === 'local'
          ? { localEndpoint: imageLocalEndpoint.trim(), localSteps: imageLocalSteps }
          : provider === 'gemini'
          ? { geminiModel: imageGeminiModel.trim() }
          : { grokModel: imageGrokModel.trim(), xaiApiKey: imageXaiApiKey.trim() || undefined }
      const res = await axios.put('/api/ai/image-config', payload)
      if (provider === 'local') {
        setImageLocalEndpoint(res.data.localEndpoint)
        setImageLocalSteps(res.data.localSteps)
      }
      if (provider === 'gemini') setImageGeminiModel(res.data.geminiModel)
      if (provider === 'grok') {
        setImageGrokModel(res.data.grokModel)
        setImageXaiConfigured(res.data.xaiConfigured)
        setImageXaiKeyHint(res.data.xaiKeyHint)
        setImageXaiApiKey('')
      }
      setImageConfigSaved(true)
      setTimeout(() => setImageConfigSaved(false), 3000)
    } catch (err: any) {
      setImageConfigError(err.response?.data?.error || t('settings.imageGen.saveFailed'))
    } finally {
      setImageConfigSaving(false)
    }
  }

  // Ollama
  const [aiEndpoint, setAiEndpoint] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiVisionModel, setAiVisionModel] = useState('')
  const aiModels = aiStore.models
  const [aiConnected, setAiConnected] = useState<boolean | null>(null)
  const [aiSaved, setAiSaved] = useState(false)

  async function testAiConnection() {
    const ok = await aiStore.fetchModels(aiEndpoint)
    setAiConnected(ok)
    if (ok && !aiModel && aiStore.models.length) setAiModel(aiStore.models[0])
  }

  async function saveAiConfig() {
    const ok = await aiStore.saveProvider('ollama', {
      endpoint: aiEndpoint,
      model: aiModel,
      visionModel: aiVisionModel,
      setActive: true,
    })
    if (ok) {
      setAiSaved(true)
      setTimeout(() => setAiSaved(false), 2500)
    }
  }

  // Cloud AI providers
  const [providerForms, setProviderForms] = useState<Record<string, ProviderFormState>>(() =>
    Object.fromEntries(CLOUD_PROVIDER_NAMES.map((n) => [n, emptyForm()]))
  )
  const [liveModels, setLiveModels] = useState<Record<string, string[] | null>>({})
  const [providerTests, setProviderTests] = useState<
    Record<string, { loading: boolean; ok: boolean; message: string }>
  >({})

  function updateProviderForm(name: string, updates: Partial<ProviderFormState>) {
    setProviderForms((prev) => ({
      ...prev,
      [name]: { ...prev[name], ...updates },
    }))
  }

  function getProvider(name: string) {
    return aiStore.providers.find((p: any) => p.name === name)
  }

  function modelOptions(name: string): string[] {
    return liveModels[name] ?? PROVIDER_MODELS[name] ?? []
  }

  function canSave(name: string): boolean {
    const form = providerForms[name]
    if (!form) return false
    if (name === 'custom') return !!form.baseUrl.trim() && !!form.model.trim()
    return !!form.apiKey
  }

  async function testCloudProvider(name: string) {
    setProviderTests((prev) => ({ ...prev, [name]: { loading: true, ok: false, message: '' } }))
    try {
      const form = providerForms[name]
      const res = await axios.post(`/api/ai/provider/${name}/test`, {
        apiKey: form.apiKey || undefined,
        baseUrl: form.baseUrl || undefined,
      })
      setLiveModels((prev) => ({ ...prev, [name]: res.data.models }))
      setProviderTests((prev) => ({
        ...prev,
        [name]: { loading: false, ok: true, message: t('ai.connected') },
      }))
    } catch (err: any) {
      setProviderTests((prev) => ({
        ...prev,
        [name]: {
          loading: false,
          ok: false,
          message: err.response?.data?.error || err.message,
        },
      }))
    }
  }

  const refreshProviderModels = useCallback(async (name: string) => {
    const form = providerForms[name]
    const models = await aiStore.fetchProviderModels(name, {
      apiKey: form?.apiKey || undefined,
      baseUrl: name === 'custom' ? form?.baseUrl || undefined : undefined,
    })
    setLiveModels((prev) => ({ ...prev, [name]: models.length ? models : null }))
    if (form && !form.model && models.length) {
      updateProviderForm(name, { model: models[0] })
    }
  }, [providerForms, aiStore])

  async function saveCloudProvider(name: string, setActive = false) {
    const form = providerForms[name]
    updateProviderForm(name, { saving: true })
    const ok = await aiStore.saveProvider(name, {
      apiKey: form.apiKey || undefined,
      baseUrl: name === 'custom' ? form.baseUrl.trim() || undefined : undefined,
      model: form.model || undefined,
      setActive,
    })
    updateProviderForm(name, { saving: false })
    if (ok) {
      updateProviderForm(name, { saved: true, editing: false, apiKey: '' })
      setTimeout(() => updateProviderForm(name, { saved: false }), 2500)
      refreshProviderModels(name)
    }
  }

  async function setActiveProvider(name: string) {
    if (!getProvider(name)?.configured) return
    await aiStore.saveProvider(name, { setActive: true })
  }

  async function disconnectCloudProvider(name: string) {
    if (!confirm(t('ai.disconnectConfirm'))) return
    await aiStore.deleteProvider(name)
  }

  useEffect(() => {
    platformsStore.fetchMetaCredentials()
    platformsStore.fetchPinterestCredentials()
    platformsStore.fetchTikTokCredentials()
    aiStore.fetchConfig().then(() => {
      setAiEndpoint(aiStore.config.endpoint)
      setAiModel(aiStore.config.model)
      setAiVisionModel(aiStore.config.visionModel)
    })
    aiStore.fetchProviders().then(() => {
      for (const p of aiStore.providers) {
        if (p.name === 'ollama') continue
        updateProviderForm(p.name, {
          model: p.model || '',
          baseUrl: p.baseUrl || '',
        })
        if (p.configured) {
          refreshProviderModels(p.name)
        }
      }
    })
    loadPlacesConfig()
    loadImageConfig()
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t('globalSettings.title')}</h1>
          <p className="text-sm text-gray-400">{t('globalSettings.subtitle')}</p>
        </div>

        <nav aria-label={t('globalSettings.groupsLabel')} className="flex flex-wrap gap-2">
          {SETTINGS_GROUPS.map((group) => (
            <a
              key={group.id}
              href={`#settings-${group.id}`}
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-violet-500"
            >
              {t(`globalSettings.groups.${group.id}`)}
            </a>
          ))}
        </nav>

        {SETTINGS_GROUPS.map((group) => (
          <section key={group.id} id={`settings-${group.id}`} className="space-y-4 scroll-mt-5">
            <h2 className="text-xl font-semibold">{t(`globalSettings.groups.${group.id}`)}</h2>
            {group.connector && <ChatConnector provider={group.connector} />}

            {/* AI INTEGRATION — Ollama */}
            {group.id === 'local' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    AI
                  </div>
                  <div>
                    <p className="font-semibold">{t('ai.sectionTitle')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('ai.sectionSubtitle')}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {aiStore.config.provider === 'ollama' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-900/50 text-violet-300 border border-violet-700">
                        {t('ai.active')}
                      </span>
                    )}
                    {aiConnected !== null && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          aiConnected
                            ? 'bg-green-900/50 text-green-400 border border-green-700'
                            : 'bg-red-900/40 text-red-400 border border-red-800'
                        }`}
                      >
                        {aiConnected ? t('ai.connected') : t('ai.connectionFailed')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('ai.endpointLabel')}</label>
                    <div className="flex gap-2">
                      <input
                        value={aiEndpoint}
                        onChange={(e) => setAiEndpoint(e.target.value)}
                        type="text"
                        placeholder={t('ai.endpointPlaceholder')}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                      />
                      <button
                        onClick={testAiConnection}
                        disabled={aiStore.modelsLoading || !aiEndpoint}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 border border-gray-600 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        {aiStore.modelsLoading ? t('ai.testing') : t('ai.testConnection')}
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{t('ai.endpointHint')}</p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('ai.modelLabel')}</label>
                    <select
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      disabled={!aiModels.length}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500 disabled:opacity-40"
                    >
                      <option value="">{t('ai.modelPlaceholder')}</option>
                      {aiModels.map((m: string) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t('ai.visionModelLabel')}</label>
                    <input
                      value={aiVisionModel}
                      onChange={(e) => setAiVisionModel(e.target.value)}
                      type="text"
                      placeholder={t('ai.visionModelPlaceholder')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">{t('ai.visionModelHint')}</p>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    {aiSaved && <span className="text-xs text-green-400">{t('ai.saved')}</span>}
                    <button
                      onClick={saveAiConfig}
                      disabled={aiStore.saving || !aiEndpoint}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                    >
                      {aiStore.saving ? t('ai.saving') : t('ai.saveConfig')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Cloud AI Providers */}
            {group.providers.map((providerName) => {
              const form = providerForms[providerName] || emptyForm()
              const prov = getProvider(providerName)
              const badge = PROVIDER_BADGE[providerName]
              const testRes = providerTests[providerName]

              return (
                <div key={providerName} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${badge.cls}`}
                    >
                      {badge.abbr}
                    </div>
                    <div>
                      <p className="font-semibold">{t(`ai.${providerName}.sectionTitle`)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t(`ai.${providerName}.sectionSubtitle`)}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      {aiStore.config.provider === providerName ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-900/50 text-violet-300 border border-violet-700">
                          {t('ai.active')}
                        </span>
                      ) : prov?.configured ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-900/50 text-green-400 border border-green-700">
                          ✓ {t('ai.apiKeyConfigured')}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {prov?.available === false && (
                      <p role="alert" className="text-sm text-red-400">
                        {t('ai.providerUnavailable')}
                      </p>
                    )}

                    {prov?.configured && !form.editing ? (
                      <div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="space-y-1">
                            {providerName === 'custom' && (
                              <p className="text-xs text-gray-400">
                                {t('ai.baseUrlLabel')}:{' '}
                                <span className="font-mono text-gray-300">{prov?.baseUrl}</span>
                              </p>
                            )}
                            <p className="text-xs text-gray-400">
                              {t('ai.apiKeyLabel')}:{' '}
                              <span className="font-mono text-gray-300">{prov?.apiKeyHint || '—'}</span>
                            </p>
                            {form.saved && <p className="text-xs text-green-400">{t('ai.providerSaved')}</p>}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateProviderForm(providerName, { editing: true })}
                              className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-gray-400 hover:text-gray-200 transition-colors"
                            >
                              Edit
                            </button>
                            {aiStore.config.provider !== providerName && (
                              <button
                                onClick={() => setActiveProvider(providerName)}
                                disabled={aiStore.saving || prov?.available === false}
                                className="text-xs px-2.5 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 rounded-md text-white transition-colors"
                              >
                                {t('ai.setActive')}
                              </button>
                            )}
                            <button
                              onClick={() => disconnectCloudProvider(providerName)}
                              className="text-xs px-2.5 py-1 bg-red-900/40 hover:bg-red-900/60 border border-red-800 rounded-md text-red-400 hover:text-red-300 transition-colors"
                            >
                              {t('ai.disconnect')}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-3">
                          <button
                            onClick={() => testCloudProvider(providerName)}
                            disabled={testRes?.loading}
                            className="text-xs px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-40"
                          >
                            {testRes?.loading ? t('ai.testing') : t('ai.testConnection')}
                          </button>
                          {testRes?.message && (
                            <span className={`text-xs ${testRes.ok ? 'text-green-400' : 'text-red-400'}`}>
                              {testRes.message}
                            </span>
                          )}
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs text-gray-500 mb-1">{t('ai.modelLabel')}</label>
                          {modelOptions(providerName).length > 0 ? (
                            <select
                              value={form.model}
                              onChange={(e) => updateProviderForm(providerName, { model: e.target.value })}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                            >
                              {form.model && !modelOptions(providerName).includes(form.model) && (
                                <option value={form.model}>{form.model}</option>
                              )}
                              {modelOptions(providerName).map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={form.model}
                              onChange={(e) => updateProviderForm(providerName, { model: e.target.value })}
                              type="text"
                              placeholder={t('ai.modelInputPlaceholder')}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                            />
                          )}
                          <p className="text-xs text-gray-600 mt-1">
                            {liveModels[providerName] ? t('ai.modelsLive') : t('ai.modelsStatic')}
                          </p>
                        </div>

                        <div className="flex justify-end mt-3">
                          <button
                            onClick={() =>
                              saveCloudProvider(providerName, aiStore.config.provider === providerName)
                            }
                            disabled={form.saving}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                          >
                            {form.saving ? t('ai.saving') : t('ai.saveProvider')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {providerName === 'custom' && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{t('ai.baseUrlLabel')}</label>
                            <input
                              value={form.baseUrl}
                              onChange={(e) => updateProviderForm(providerName, { baseUrl: e.target.value })}
                              type="text"
                              placeholder={t('ai.baseUrlPlaceholder')}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            {providerName === 'custom' ? t('ai.apiKeyOptional') : t('ai.apiKeyLabel')}
                          </label>
                          <input
                            value={form.apiKey}
                            onChange={(e) => updateProviderForm(providerName, { apiKey: e.target.value })}
                            type="password"
                            placeholder={t('ai.apiKeyPlaceholder')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                          />
                          <p className="text-xs text-gray-600 mt-1">{t(`ai.${providerName}.getKeyHint`)}</p>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t('ai.modelLabel')}</label>
                          {modelOptions(providerName).length > 0 ? (
                            <select
                              value={form.model}
                              onChange={(e) => updateProviderForm(providerName, { model: e.target.value })}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-violet-500"
                            >
                              {form.model && !modelOptions(providerName).includes(form.model) && (
                                <option value={form.model}>{form.model}</option>
                              )}
                              {modelOptions(providerName).map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={form.model}
                              onChange={(e) => updateProviderForm(providerName, { model: e.target.value })}
                              type="text"
                              placeholder={t('ai.modelInputPlaceholder')}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                            />
                          )}
                          <p className="text-xs text-gray-600 mt-1">
                            {liveModels[providerName] ? t('ai.modelsLive') : t('ai.modelsStatic')}
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          {form.editing && (
                            <button
                              onClick={() => updateProviderForm(providerName, { editing: false })}
                              className="text-xs px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => saveCloudProvider(providerName, false)}
                            disabled={form.saving || !canSave(providerName)}
                            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 border border-gray-600 rounded-lg text-xs font-medium transition-colors"
                          >
                            {form.saving ? t('ai.saving') : t('ai.saveProvider')}
                          </button>
                          <button
                            onClick={() => saveCloudProvider(providerName, true)}
                            disabled={form.saving || !canSave(providerName)}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                          >
                            {form.saving ? t('ai.saving') : t('ai.connectAndActivate')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* IMAGE GENERATION */}
            {group.image && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-image text-white text-sm" />
                  </div>
                  <div>
                    <p className="font-semibold">{t('settings.imageGen.sectionTitle')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('settings.imageGen.sectionSubtitle')}</p>
                  </div>
                </div>

                <div className="p-5 space-y-6">
                  {/* OpenAI */}
                  {group.image === 'openai' && (
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          imageOpenAiReady ? 'bg-emerald-400' : 'bg-gray-600'
                        }`}
                      />
                      <div className="text-sm">
                        <p className="text-gray-200 font-medium">{t('settings.imageGen.openaiTitle')}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {imageOpenAiReady
                            ? t('settings.imageGen.openaiReady')
                            : t('settings.imageGen.openaiMissing')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Gemini */}
                  {group.image === 'gemini' && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                            imageGeminiReady ? 'bg-emerald-400' : 'bg-gray-600'
                          }`}
                        />
                        <div className="text-sm flex-1">
                          <p className="text-gray-200 font-medium">{t('settings.imageGen.geminiTitle')}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {imageGeminiReady
                              ? t('settings.imageGen.geminiReady')
                              : t('settings.imageGen.geminiMissing')}
                          </p>
                        </div>
                      </div>
                      {imageGeminiReady && (
                        <div className="pl-5 flex flex-wrap gap-2 items-center">
                          <label className="text-xs text-gray-400 w-full sm:w-auto">
                            {t('settings.imageGen.geminiModelLabel')}
                          </label>
                          <input
                            value={imageGeminiModel}
                            onChange={(e) => setImageGeminiModel(e.target.value)}
                            list="gemini-image-models"
                            placeholder={t('settings.imageGen.geminiModelPlaceholder')}
                            className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                          />
                          <datalist id="gemini-image-models">
                            {imageGeminiModels.map((m) => (
                              <option key={m} value={m} />
                            ))}
                          </datalist>
                          <button
                            onClick={loadGeminiImageModels}
                            disabled={imageGeminiModelsLoading}
                            className="text-xs px-3 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {imageGeminiModelsLoading
                              ? t('settings.imageGen.loadingModels')
                              : t('settings.imageGen.loadModels')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* xAI Grok Imagine */}
                  {group.image === 'grok' && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                            imageXaiConfigured ? 'bg-emerald-400' : 'bg-gray-600'
                          }`}
                        />
                        <div className="text-sm flex-1">
                          <p className="text-gray-200 font-medium">{t('settings.imageGen.grokTitle')}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{t('settings.imageGen.grokHint')}</p>
                        </div>
                      </div>
                      <div className="pl-5 space-y-2">
                        {imageXaiConfigured ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-300">
                              {t('settings.imageGen.grokKeyConfigured', { hint: imageXaiKeyHint })}
                            </span>
                            <button
                              onClick={removeXaiKey}
                              className="text-xs px-3 py-1.5 border border-red-800/60 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              {t('settings.imageGen.grokRemoveKey')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <input
                              value={imageXaiApiKey}
                              onChange={(e) => setImageXaiApiKey(e.target.value)}
                              type="password"
                              placeholder={t('settings.imageGen.grokKeyPlaceholder')}
                              className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 items-center">
                          <label className="text-xs text-gray-400">
                            {t('settings.imageGen.grokModelLabel')}
                          </label>
                          <input
                            value={imageGrokModel}
                            onChange={(e) => setImageGrokModel(e.target.value)}
                            placeholder={t('settings.imageGen.grokModelPlaceholder')}
                            className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Local Stable Diffusion */}
                  {group.image === 'local' && (
                    <div className="space-y-2">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                            imageLocalEndpoint.trim() ? 'bg-emerald-400' : 'bg-gray-600'
                          }`}
                        />
                        <div className="text-sm flex-1">
                          <p className="text-gray-200 font-medium">{t('settings.imageGen.localTitle')}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{t('settings.imageGen.localHint')}</p>
                        </div>
                      </div>
                      <div className="pl-5 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <input
                            value={imageLocalEndpoint}
                            onChange={(e) => setImageLocalEndpoint(e.target.value)}
                            type="url"
                            placeholder={t('settings.imageGen.localEndpointPlaceholder')}
                            className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={testLocalImageServer}
                            disabled={!imageLocalEndpoint.trim() || imageLocalTesting}
                            className="text-xs px-3 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {imageLocalTesting ? t('settings.imageGen.testing') : t('settings.imageGen.test')}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400">
                            {t('settings.imageGen.localStepsLabel')}
                          </label>
                          <input
                            value={imageLocalSteps}
                            onChange={(e) => setImageLocalSteps(Number(e.target.value))}
                            type="number"
                            min={1}
                            max={150}
                            className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        {imageLocalTestResult && (
                          <p
                            className={`text-xs ${
                              imageLocalTestResult.ok ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {imageLocalTestResult.ok
                              ? t('settings.imageGen.testOk', {
                                  count: imageLocalTestResult.models.length,
                                  active: imageLocalTestResult.activeModel || '—',
                                })
                              : imageLocalTestResult.error}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Save Image config */}
                  {group.image !== 'openai' && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => saveImageConfig(group.image)}
                        disabled={imageConfigSaving}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                      >
                        {imageConfigSaving ? t('settings.imageGen.saving') : t('settings.imageGen.save')}
                      </button>
                      {imageConfigSaved && imageFeedbackGroup === group.image && (
                        <span className="text-xs text-emerald-400">{t('settings.imageGen.saved')}</span>
                      )}
                      {imageConfigError && imageFeedbackGroup === group.image && (
                        <span className="text-xs text-red-400">{imageConfigError}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Google Places */}
            {group.id === 'google' && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-700 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-location-dot text-white text-sm" />
                  </div>
                  <div>
                    <p className="font-semibold">{t('settings.googlePlaces.sectionTitle')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t('settings.googlePlaces.sectionSubtitle')}</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {placesConfigured ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">
                        {t('settings.googlePlaces.keyConfigured', { hint: placesKeyHint })}
                      </span>
                      <button
                        onClick={removePlacesKey}
                        className="text-xs px-3 py-1.5 border border-red-800/60 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        {t('settings.googlePlaces.disconnect')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">{t('settings.googlePlaces.getKeyHint')}</p>
                      <div className="flex gap-2">
                        <input
                          value={placesApiKey}
                          onChange={(e) => setPlacesApiKey(e.target.value)}
                          type="password"
                          placeholder={t('settings.googlePlaces.keyPlaceholder')}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500"
                        />
                        <button
                          onClick={savePlacesKey}
                          disabled={!placesApiKey.trim() || placesSaving}
                          className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                        >
                          {placesSaving ? t('settings.googlePlaces.saving') : t('settings.googlePlaces.save')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social credentials */}
            {group.id === 'social' && (
              <>
                {/* Meta */}
                <div id="meta-app" className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: '#1877F2' }}
                      >
                        f
                      </span>
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ background: '#E1306C' }}
                      >
                        I
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold">{t('settings.meta.sectionTitle')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t('globalSettings.appCredentialsNote')}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    {metaAppConfigured && !editingMetaApp ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-green-400">
                          <span>✓</span>
                          <span>{t('settings.meta.appConfigured')}</span>
                          <span className="text-gray-600 font-mono text-xs">
                            ({platformsStore.metaCredentials.appId})
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingMetaApp(true)}
                          className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t('settings.meta.appIdLabel')}
                          </label>
                          <input
                            value={metaAppId}
                            onChange={(e) => setMetaAppId(e.target.value)}
                            type="text"
                            placeholder={t('settings.meta.appIdPlaceholder')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t('settings.meta.appSecretLabel')}
                          </label>
                          <input
                            value={metaAppSecret}
                            onChange={(e) => setMetaAppSecret(e.target.value)}
                            type="password"
                            placeholder={
                              metaAppConfigured
                                ? platformsStore.metaCredentials.appSecretHint
                                : t('settings.meta.appSecretPlaceholder')
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-600">
                            {t('settings.meta.getAppHelp')}{' '}
                            <a
                              href="https://developers.facebook.com/apps/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              {t('settings.meta.devPortal')}
                            </a>
                          </p>
                          <button
                            onClick={saveMetaApp}
                            disabled={!metaAppId || !metaAppSecret || platformsStore.metaLoading}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                          >
                            {platformsStore.metaLoading ? t('settings.meta.saving') : t('settings.meta.saveApp')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pinterest */}
                <div id="pinterest-app" className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: '#E60023' }}
                    >
                      P
                    </span>
                    <div>
                      <p className="font-semibold">{t('settings.pinterest.sectionTitle')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t('globalSettings.appCredentialsNote')}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    {pinterestAppConfigured && !editingPinterestApp ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-green-400">
                          <span>✓</span>
                          <span>{t('settings.pinterest.appConfigured')}</span>
                          <span className="text-gray-600 font-mono text-xs">
                            ({platformsStore.pinterestCredentials.clientId})
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingPinterestApp(true)}
                          className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t('settings.pinterest.clientIdLabel')}
                          </label>
                          <input
                            value={pinterestClientId}
                            onChange={(e) => setPinterestClientId(e.target.value)}
                            type="text"
                            placeholder={t('settings.pinterest.clientIdPlaceholder')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t('settings.pinterest.clientSecretLabel')}
                          </label>
                          <input
                            value={pinterestClientSecret}
                            onChange={(e) => setPinterestClientSecret(e.target.value)}
                            type="password"
                            placeholder={
                              pinterestAppConfigured
                                ? platformsStore.pinterestCredentials.clientSecretHint
                                : t('settings.pinterest.clientSecretPlaceholder')
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-600">
                            <a
                              href="https://developers.pinterest.com/apps/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-red-400 hover:text-red-300 underline"
                            >
                              {t('settings.pinterest.devPortal')}
                            </a>
                          </p>
                          <button
                            onClick={savePinterestApp}
                            disabled={!pinterestClientId || !pinterestClientSecret || platformsStore.pinterestLoading}
                            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                          >
                            {platformsStore.pinterestLoading
                              ? t('settings.pinterest.saving')
                              : t('settings.pinterest.saveApp')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* TikTok */}
                <div id="tiktok-app" className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: '#EE1D52' }}
                    >
                      T
                    </span>
                    <div>
                      <p className="font-semibold">{t('settings.tiktok.sectionTitle')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t('globalSettings.appCredentialsNote')}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    {tiktokAppConfigured && !editingTikTokApp ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-green-400">
                          <span>✓</span>
                          <span>{t('settings.tiktok.appConfigured')}</span>
                          <span className="text-gray-600 font-mono text-xs">
                            ({platformsStore.tiktokCredentials.clientKey})
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingTikTokApp(true)}
                          className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t('settings.tiktok.clientKeyLabel')}
                          </label>
                          <input
                            value={tiktokClientKey}
                            onChange={(e) => setTiktokClientKey(e.target.value)}
                            type="text"
                            placeholder={t('settings.tiktok.clientKeyPlaceholder')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-pink-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            {t('settings.tiktok.clientSecretLabel')}
                          </label>
                          <input
                            value={tiktokClientSecret}
                            onChange={(e) => setTiktokClientSecret(e.target.value)}
                            type="password"
                            placeholder={
                              tiktokAppConfigured
                                ? platformsStore.tiktokCredentials.clientSecretHint
                                : t('settings.tiktok.clientSecretPlaceholder')
                            }
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-pink-500"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-600">
                            <a
                              href="https://developers.tiktok.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-400 hover:text-pink-300 underline"
                            >
                              {t('settings.tiktok.devPortal')}
                            </a>
                          </p>
                          <button
                            onClick={saveTikTokApp}
                            disabled={!tiktokClientKey || !tiktokClientSecret || platformsStore.tiktokLoading}
                            className="px-4 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                          >
                            {platformsStore.tiktokLoading ? t('settings.tiktok.saving') : t('settings.tiktok.saveApp')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
