import { useState, useEffect } from 'react'
import axios from 'axios'
import { useI18n } from '../../locales'

export interface ImageFormatEditorProps {
  mediaUrl: string
  aspect?: string
  onApply?: (url: string) => void
}

export default function ImageFormatEditor({ mediaUrl, aspect, onApply }: ImageFormatEditorProps) {
  const { t } = useI18n()
  const [ratio, setRatio] = useState(aspect || '3:4')
  const [fit, setFit] = useState('contain')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ mediaUrl: string; width: number; height: number; aspect: string } | null>(null)

  useEffect(() => {
    if (aspect) setRatio(aspect)
  }, [aspect])

  useEffect(() => {
    setPreview(null)
  }, [ratio, fit, mediaUrl])

  async function prepare() {
    setBusy(true)
    setError('')
    const source = mediaUrl
    const requested = ratio
    const method = fit
    try {
      const response = await axios.post('/api/media/prepare-image', {
        mediaUrl: source,
        aspect: requested,
        fit: method,
      })
      if (mediaUrl === source && ratio === requested && fit === method) {
        setPreview(response.data)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="mt-3 text-xs border border-gray-700 rounded-lg p-3">
      <summary className="cursor-pointer text-emerald-300">{t('imageFormats.prepare')}</summary>
      <div className="flex flex-wrap gap-2 my-3">
        <select
          value={ratio}
          onChange={(e) => setRatio(e.target.value)}
          aria-label={t('imageFormats.ratio')}
          className="bg-gray-800 rounded p-2"
        >
          <option value="3:4">3:4 · 1080 × 1440</option>
          <option value="9:16">9:16 · 1080 × 1920</option>
          <option value="4:5">4:5 · 1080 × 1350</option>
        </select>
        <select
          value={fit}
          onChange={(e) => setFit(e.target.value)}
          aria-label={t('imageFormats.fit')}
          className="bg-gray-800 rounded p-2 max-w-full"
        >
          <option value="contain">{t('imageFormats.contain')}</option>
          <option value="cover">{t('imageFormats.cover')}</option>
        </select>
        <button
          disabled={busy}
          onClick={prepare}
          className="bg-emerald-800 rounded px-3 disabled:opacity-50"
        >
          {t('imageFormats.preview')}
        </button>
      </div>
      <p className="text-gray-400">{t('imageFormats.originalKept')}</p>
      {error && <p className="text-red-400">{error}</p>}
      {preview && (
        <div className="mt-3 space-y-2">
          <img src={preview.mediaUrl} alt="" className="max-h-80 max-w-full object-contain rounded" />
          <p>
            {preview.width} × {preview.height} · {preview.aspect}
          </p>
          <button
            onClick={() => {
              onApply?.(preview.mediaUrl)
              setPreview(null)
            }}
            className="bg-emerald-700 rounded px-3 py-2"
          >
            {t('imageFormats.apply')}
          </button>
        </div>
      )}
    </details>
  )
}
