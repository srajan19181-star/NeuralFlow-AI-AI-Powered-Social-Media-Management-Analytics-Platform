import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { draftMediaUrl, type Draft, type Destination } from '../../stores/compose'
import { PLATFORM_META } from '../../stores/platforms'
import { formatDraftDate } from '../../utils/draftDate'
import { useI18n } from '../../locales'

export interface DraftSummaryProps {
  draft: Draft & { batchId?: string }
  destinations: Destination[]
  layout: 'list' | 'cards'
  selected: boolean
  onDelete?: (id: string) => void
  onToggle?: (id: string) => void
}

export default function DraftSummary({
  draft,
  destinations,
  layout,
  selected,
  onDelete,
  onToggle,
}: DraftSummaryProps) {
  const { t, locale } = useI18n()
  const mediaUrl = draftMediaUrl(draft)
  const [mediaError, setMediaError] = useState(false)

  useEffect(() => {
    setMediaError(false)
  }, [mediaUrl])

  const isVideo = /\.(mp4|mov|avi|webm)(?:[?#]|$)/i.test(mediaUrl)
  let mediaName = mediaUrl
  try {
    mediaName = decodeURIComponent(mediaUrl.split('/').pop() || '')
  } catch {
    // fallback
  }

  const currentLang = String(locale.value || locale)
  const plannedDate = formatDraftDate(draft.scheduledAt, currentLang)
  const updatedDate = formatDraftDate(draft.updatedAt, currentLang)
  const platformLabel = (platform: string) => PLATFORM_META[platform]?.label || platform

  return (
    <article
      className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden min-w-0 flex flex-col"
      data-draft-id={draft._id}
    >
      <label className="px-4 py-2.5 flex items-center gap-2 text-xs text-gray-400 border-b border-gray-800 cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle?.(draft._id)}
          className="accent-amber-500"
        />
        {t('scheduler.bulkSchedule.selectDraft')}
      </label>

      {layout === 'cards' && (
        <div className="aspect-[4/3] bg-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-800">
          {mediaUrl && isVideo && !mediaError ? (
            <video
              src={mediaUrl}
              controls
              preload="metadata"
              className="w-full h-full object-contain"
              aria-label={t('scheduler.draftMediaPreview')}
              onError={() => setMediaError(true)}
            />
          ) : mediaUrl && !mediaError ? (
            <img
              src={mediaUrl}
              alt={t('scheduler.draftMediaPreview')}
              loading="lazy"
              className="w-full h-full object-contain"
              onError={() => setMediaError(true)}
            />
          ) : (
            <div className="text-gray-500 text-sm p-6 text-center flex flex-col items-center gap-2">
              <svg
                className="w-9 h-9"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{t(mediaUrl ? 'scheduler.draftPreviewUnavailable' : 'scheduler.textOnlyDraft')}</span>
            </div>
          )}
        </div>
      )}

      <div className={`p-4 flex flex-1 gap-4 ${layout === 'cards' ? 'flex-col' : 'items-start justify-between'}`}>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {draft.batchId && (
              <span className="text-xs px-2 py-1 rounded bg-violet-900/50 text-violet-300">✨ AI</span>
            )}
            {destinations.map((dest) => (
              <span
                key={dest.key}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full max-w-full"
                style={{ backgroundColor: `${dest.color}22`, color: dest.color }}
              >
                {dest.picture && (
                  <img src={dest.picture} alt="" loading="lazy" className="w-4 h-4 rounded-full object-cover" />
                )}
                <span className="truncate">{dest.label}</span>
                {dest.instagramPlacement && <span>· {t(`instagramPublishing.${dest.instagramPlacement}`)}</span>}
                <span className="opacity-75">· {platformLabel(dest.platform)}</span>
              </span>
            ))}
            {!destinations.length && (
              <span className="text-xs text-gray-500">{t('scheduler.noDraftDestinations')}</span>
            )}
          </div>

          <p
            className={`text-sm text-gray-200 whitespace-pre-wrap break-words mb-3 ${
              layout === 'cards' ? 'line-clamp-4' : 'line-clamp-2'
            }`}
          >
            {draft.content || t('scheduler.emptyDraft')}
          </p>

          {mediaUrl && layout === 'list' && (
            <p className="text-xs text-blue-400 mb-2 truncate" title={mediaName}>
              {mediaName}
            </p>
          )}

          <p className={`text-xs mb-2 ${plannedDate ? 'text-amber-300' : 'text-gray-500'}`}>
            {plannedDate ? (
              <>
                {t('scheduler.draftPlannedFor')} <time dateTime={draft.scheduledAt}>{plannedDate}</time>
              </>
            ) : (
              <span>{t('scheduler.noDraftDate')}</span>
            )}
          </p>

          <p className="text-xs text-gray-500">{t('scheduler.draftUpdated', { date: updatedDate })}</p>
        </div>

        <div
          className={`flex items-center gap-2 flex-shrink-0 ${
            layout === 'cards' ? 'justify-end border-t border-gray-800 pt-3' : ''
          }`}
        >
          <Link
            to={`/compose?draft=${draft._id}`}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-200 transition-colors"
          >
            {t('scheduler.editDraft')}
          </Link>
          <button
            onClick={() => onDelete?.(draft._id)}
            aria-label={t('scheduler.deleteDraft')}
            title={t('scheduler.deleteDraft')}
            className="text-xs px-2 py-1.5 bg-gray-700 hover:bg-red-700 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  )
}
