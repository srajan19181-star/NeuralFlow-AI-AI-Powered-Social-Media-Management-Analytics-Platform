import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../locales'

interface Asset {
  url: string
  originalName: string
  mimetype: string
}

interface Scene {
  id: number
  mediaUrl: string
  text: string
  duration: number
  fit: string
}

export interface ReelBuilderProps {
  onApply?: (url: string) => void
}

export default function ReelBuilder({ onApply }: ReelBuilderProps) {
  const { t } = useI18n()
  const workspaceId = useWorkspaceStore().activeWorkspaceId
  const storageKey = `reel.render.${workspaceId}`

  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedImage, setSelectedImage] = useState('')
  const [scenes, setScenes] = useState<Scene[]>([])
  const [transition, setTransition] = useState('cut')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioRightsConfirmed, setAudioRightsConfirmed] = useState(false)
  const [jobId, setJobId] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<{ completed?: number; total?: number }>({})
  const [result, setResult] = useState<{ mediaUrl: string } | null>(null)

  const nextId = useRef(0)
  const pollingRef = useRef(false)

  const images = useMemo(() => assets.filter((a) => a.mimetype.startsWith('image/')), [assets])
  const soundtracks = useMemo(
    () => assets.filter((a) => /^(audio|video)\//.test(a.mimetype)),
    [assets]
  )
  const total = useMemo(
    () => scenes.reduce((sum, scene) => sum + Number(scene.duration), 0),
    [scenes]
  )
  const running = ['submitting', 'queued', 'running'].includes(status)

  async function loadAssets() {
    try {
      const res = await axios.get('/api/media-library')
      setAssets(res.data.files || [])
    } catch (err: any) {
      setError(err.message)
    }
  }

  function addScene() {
    nextId.current += 1
    setScenes((prev) => [
      ...prev,
      { id: nextId.current, mediaUrl: selectedImage, text: '', duration: 3, fit: 'contain' },
    ])
  }

  function move(index: number, offset: number) {
    setScenes((prev) => {
      const copy = [...prev]
      const scene = copy.splice(index, 1)[0]
      if (scene) copy.splice(index + offset, 0, scene)
      return copy
    })
  }

  function updateScene(index: number, field: keyof Scene, value: any) {
    setScenes((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  function removeScene(index: number) {
    setScenes((prev) => prev.filter((_, i) => i !== index))
  }

  async function pollJob(currentJobId: string) {
    if (!currentJobId || pollingRef.current) return
    pollingRef.current = true
    try {
      const response = await axios.get(`/api/ai/jobs/${currentJobId}`)
      setStatus(response.data.status)
      setProgress(response.data.progress || {})
      setResult(response.data.result || null)
      setError(response.data.error || '')
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    } finally {
      pollingRef.current = false
    }
  }

  async function render() {
    setStatus('submitting')
    setError('')
    setResult(null)
    try {
      const response = await axios.post('/api/reels/render', {
        scenes: scenes.map(({ id: _id, ...scene }) => scene),
        transition,
        audioUrl: audioUrl || undefined,
        audioRightsConfirmed,
      })
      const newJobId = response.data.jobId
      setJobId(newJobId)
      setStatus('queued')
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, newJobId)
      }
      await pollJob(newJobId)
    } catch (err: any) {
      setStatus('failed')
      setError(err.response?.data?.error || err.message)
    }
  }

  async function cancel() {
    try {
      await axios.delete(`/api/reels/jobs/${jobId}`)
      await pollJob(jobId)
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function retry() {
    try {
      await axios.post(`/api/reels/jobs/${jobId}/retry`)
      await pollJob(jobId)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message)
    }
  }

  useEffect(() => {
    loadAssets()
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) || '' : ''
    if (saved) {
      setJobId(saved)
      pollJob(saved)
    }
  }, [storageKey])

  useEffect(() => {
    if (!running || !jobId) return
    const timer = setInterval(() => {
      pollJob(jobId)
    }, 2000)
    return () => clearInterval(timer)
  }, [running, jobId])

  return (
    <details className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm">
      <summary className="cursor-pointer text-pink-300">{t('reelBuilder.title')}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-400">{t('reelBuilder.description')}</p>
        <div className="flex gap-2">
          <select
            value={selectedImage}
            onChange={(e) => setSelectedImage(e.target.value)}
            aria-label={t('reelBuilder.image')}
            className="bg-gray-800 rounded p-2 flex-1 min-w-0"
          >
            <option value="">{t('reelBuilder.image')}</option>
            {images.map((asset) => (
              <option key={asset.url} value={asset.url}>
                {asset.originalName}
              </option>
            ))}
          </select>
          <button
            onClick={addScene}
            disabled={!selectedImage || scenes.length >= 12 || running}
            className="bg-gray-700 rounded px-3 disabled:opacity-40"
          >
            {t('reelBuilder.add')}
          </button>
          <button onClick={loadAssets} className="text-blue-400">
            {t('reelBuilder.refresh')}
          </button>
        </div>

        {scenes.map((scene, index) => (
          <article key={scene.id} className="flex gap-3 border border-gray-700 rounded-lg p-3">
            <div className="relative w-24 shrink-0 bg-white overflow-hidden" style={{ aspectRatio: '9/16' }}>
              <img
                src={scene.mediaUrl}
                alt=""
                className={`w-full h-full ${scene.fit === 'cover' ? 'object-cover' : 'object-contain'}`}
              />
              <p
                className="absolute text-white bg-black/70 whitespace-pre-wrap break-words"
                style={{ left: '7%', right: '16%', top: '55%', fontSize: 5, lineHeight: 1.2, padding: 3 }}
              >
                {scene.text}
              </p>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex gap-2 items-center text-xs">
                <span>{t('reelBuilder.scene', { number: index + 1 })}</span>
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || running}
                  aria-label={t('reelBuilder.up')}
                >
                  ↑
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === scenes.length - 1 || running}
                  aria-label={t('reelBuilder.down')}
                >
                  ↓
                </button>
                <button
                  onClick={() => removeScene(index)}
                  disabled={running}
                  className="ml-auto text-red-400"
                >
                  {t('reelBuilder.remove')}
                </button>
              </div>
              <textarea
                value={scene.text}
                onChange={(e) => updateScene(index, 'text', e.target.value)}
                disabled={running}
                maxLength={168}
                rows={3}
                placeholder={t('reelBuilder.text')}
                aria-label={t('reelBuilder.text')}
                className="bg-gray-800 rounded p-2 w-full text-xs"
              />
              <div className="flex flex-wrap gap-2 text-xs">
                <label>
                  {t('reelBuilder.seconds')}{' '}
                  <input
                    type="number"
                    min={3}
                    max={10}
                    value={scene.duration}
                    onChange={(e) => updateScene(index, 'duration', Number(e.target.value))}
                    disabled={running}
                    className="bg-gray-800 rounded p-1 w-14"
                  />
                </label>
                <select
                  value={scene.fit}
                  onChange={(e) => updateScene(index, 'fit', e.target.value)}
                  disabled={running}
                  aria-label={t('imageFormats.fit')}
                  className="bg-gray-800 rounded p-1 max-w-full"
                >
                  <option value="contain">{t('imageFormats.contain')}</option>
                  <option value="cover">{t('imageFormats.cover')}</option>
                </select>
              </div>
            </div>
          </article>
        ))}

        <label className="block text-xs">
          {t('reelBuilder.transition')}
          <select
            value={transition}
            onChange={(e) => setTransition(e.target.value)}
            disabled={running}
            className="bg-gray-800 rounded p-2 ml-2"
          >
            <option value="cut">{t('reelBuilder.cut')}</option>
            <option value="fade">{t('reelBuilder.fade')}</option>
          </select>
        </label>

        <label className="block text-xs">
          {t('reelBuilder.audio')}
          <select
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            disabled={running}
            className="bg-gray-800 rounded p-2 block mt-1 w-full"
          >
            <option value="">{t('reelBuilder.noAudio')}</option>
            {soundtracks.map((asset) => (
              <option key={asset.url} value={asset.url}>
                {asset.originalName}
              </option>
            ))}
          </select>
        </label>

        {audioUrl && (
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={audioRightsConfirmed}
              onChange={(e) => setAudioRightsConfirmed(e.target.checked)}
              disabled={running}
            />
            {t('reelBuilder.audioRights')}
          </label>
        )}

        <p className="text-xs text-gray-400">
          {t('reelBuilder.total', { seconds: total })} · 1080 × 1920 · 9:16
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={render}
            disabled={running || !scenes.length || (!!audioUrl && !audioRightsConfirmed)}
            className="bg-pink-800 rounded px-3 py-2 disabled:opacity-40"
          >
            {t('reelBuilder.render')}
          </button>
          {running && (
            <button onClick={cancel} className="text-red-400">
              {t('reelBuilder.cancel')}
            </button>
          )}
          {status === 'failed' && (
            <button onClick={retry} className="text-blue-400">
              {t('reelBuilder.retry')}
            </button>
          )}
        </div>

        {running && (
          <p role="status" className="text-xs text-blue-300">
            {t('reelBuilder.progress', {
              completed: progress.completed || 0,
              total: progress.total || scenes.length + 1,
            })}
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-2">
            <video src={result.mediaUrl} controls className="max-h-96 max-w-full rounded-lg" />
            <button
              onClick={() => onApply?.(result.mediaUrl)}
              className="bg-emerald-700 rounded px-3 py-2"
            >
              {t('reelBuilder.use')}
            </button>
          </div>
        )}
      </div>
    </details>
  )
}
