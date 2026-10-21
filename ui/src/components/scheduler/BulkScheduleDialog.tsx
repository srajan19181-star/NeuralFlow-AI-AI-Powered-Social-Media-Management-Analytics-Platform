import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import axios from 'axios'
import type { Draft } from '../../stores/compose'
import { COMMON_TIMEZONES, getBrowserTimezone } from '../../utils/timezone'
import { formatDraftDate } from '../../utils/draftDate'
import { useI18n } from '../../locales'

interface PreviewItem {
  draftId: string
  ready: boolean
  revision?: string
  content?: string
  firstComment?: string
  scheduledAt?: string
  reason?: string
  destinations?: { imageUrl?: string; videoUrl?: string; instagramPlacement?: string }[]
  accounts?: { name: string }[]
}

export interface ScheduleResult {
  draftId: string
  success: boolean
  reason?: string
  draftRetained?: boolean
}

export interface BulkScheduleDialogProps {
  drafts: Draft[]
  onClose?: () => void
  onScheduled?: (results: ScheduleResult[]) => void
  onViewScheduled?: () => void
}

export default function BulkScheduleDialog({
  drafts,
  onClose,
  onScheduled,
  onViewScheduled,
}: BulkScheduleDialogProps) {
  const { t, locale } = useI18n()
  const currentLang = String(locale.value || locale)
  const dialogRef = useRef<HTMLElement | null>(null)
  const previewRequestRef = useRef(0)

  const snapshots = useMemo(() => new Map(drafts.map((d) => [d._id, d])), [drafts])
  const [timezone, setTimezone] = useState(getBrowserTimezone())
  const timezoneOptions = useMemo(
    () =>
      COMMON_TIMEZONES.some((zone) => zone.value === timezone)
        ? COMMON_TIMEZONES
        : [{ value: timezone, label: timezone }, ...COMMON_TIMEZONES],
    [timezone]
  )

  const [items, setItems] = useState<PreviewItem[]>([])
  const [results, setResults] = useState<ScheduleResult[]>([])
  const [loading, setLoading] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [error, setError] = useState('')

  const resultFor = (id: string) => results.find((result) => result.draftId === id)
  const successfulIds = useMemo(
    () => new Set(results.filter((result) => result.success).map((result) => result.draftId)),
    [results]
  )

  const readyItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.ready &&
          !successfulIds.has(item.draftId) &&
          (!resultFor(item.draftId)?.reason || resultFor(item.draftId)?.reason === 'queue_error')
      ),
    [items, successfulIds, results]
  )

  const blockedCount = items.length - readyItems.length - successfulIds.size

  const reasons = [
    'missing_date',
    'past_date',
    'invalid_date',
    'missing_content',
    'no_destinations',
    'disconnected_account',
    'invalid_media',
    'invalid_post',
    'changed',
    'already_scheduled',
    'not_found',
    'queue_error',
  ]
  const reasonText = (reason?: string) =>
    t(`scheduler.bulkSchedule.reasons.${reasons.includes(reason || '') ? reason : 'queue_error'}`)

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const elements = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), a[href]') || []),
    ]
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (!first) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault()
      first.focus()
    }
  }

  const refreshPreview = useCallback(async () => {
    const requestId = ++previewRequestRef.current
    setLoading(true)
    setError('')
    try {
      const remaining = [...snapshots.keys()].filter((id) => !successfulIds.has(id))
      if (!remaining.length) return
      const response = await axios.post('/scheduler/drafts/preview', {
        draftIds: remaining,
        timezone,
      })
      if (requestId === previewRequestRef.current) {
        setItems((prev) => [
          ...prev.filter((item) => successfulIds.has(item.draftId)),
          ...response.data.items,
        ])
        setResults((prev) => prev.filter((result) => result.success))
      }
    } catch (err: any) {
      if (requestId === previewRequestRef.current) {
        setItems((prev) => prev.filter((item) => successfulIds.has(item.draftId)))
        setError(err.response?.data?.error || t('scheduler.bulkSchedule.checkFailed'))
      }
    } finally {
      if (requestId === previewRequestRef.current) {
        setLoading(false)
      }
    }
  }, [snapshots, successfulIds, timezone, t])

  async function schedule() {
    if (scheduling || loading || !readyItems.length) return
    setScheduling(true)
    setError('')
    try {
      const response = await axios.post('/scheduler/drafts/schedule', {
        timezone,
        confirmation: 'SCHEDULE',
        items: readyItems.map((item) => ({ draftId: item.draftId, revision: item.revision })),
      })
      const next = response.data.results as ScheduleResult[]
      setResults((prev) => [...prev.filter((r) => r.success), ...next])
      onScheduled?.(next)
    } catch {
      setError(t('scheduler.bulkSchedule.requestFailed'))
    } finally {
      setScheduling(false)
    }
  }

  useEffect(() => {
    refreshPreview()
  }, [timezone, refreshPreview])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !scheduling) onClose?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !scheduling) onClose?.()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-schedule-title"
        onKeyDown={trapFocus}
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col text-gray-100"
      >
        <header className="p-5 border-b border-gray-800">
          <h2 id="bulk-schedule-title" className="text-lg font-semibold">
            {t('scheduler.bulkSchedule.title')}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{t('scheduler.bulkSchedule.explanation')}</p>
          <label className="block text-xs text-gray-400 mt-4" htmlFor="bulk-schedule-timezone">
            {t('scheduler.bulkSchedule.timezone')}
          </label>
          <select
            id="bulk-schedule-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            disabled={scheduling}
            className="mt-1 max-w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            {timezoneOptions.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
          {!loading && (
            <p className="text-sm mt-3" role="status">
              {t('scheduler.bulkSchedule.summary', {
                ready: readyItems.length,
                blocked: blockedCount,
                scheduled: successfulIds.size,
              })}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-300 mt-2" role="alert">
              {error}
            </p>
          )}
        </header>

        <div className="p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <p className="text-sm text-gray-400">{t('scheduler.bulkSchedule.checking')}</p>
          ) : (
            items.map((item) => (
              <article
                key={item.draftId}
                className="border border-gray-800 rounded-xl p-3"
                data-schedule-draft={item.draftId}
              >
                <p className="text-sm text-gray-200 line-clamp-3 whitespace-pre-wrap break-words">
                  {item.content || snapshots.get(item.draftId)?.content || t('scheduler.emptyDraft')}
                </p>
                {item.ready && (
                  <>
                    <p className="text-xs text-gray-400 mt-2">
                      {item.accounts?.map((account) => account.name).join(' · ')}
                    </p>
                    {item.destinations
                      ?.filter((d) => d.instagramPlacement)
                      .map((destination, index) => (
                        <p key={index} className="text-xs text-pink-300">
                          {t(`instagramPublishing.${destination.instagramPlacement}`)}
                        </p>
                      ))}
                    <p className="text-xs text-amber-300 mt-1">
                      {t('scheduler.draftPlannedFor')} {formatDraftDate(item.scheduledAt || '', currentLang, timezone)}
                    </p>
                    {item.destinations?.some((dest) => dest.imageUrl || dest.videoUrl) && (
                      <p className="text-xs text-blue-300 mt-1">{t('scheduler.bulkSchedule.mediaIncluded')}</p>
                    )}
                    {item.firstComment && (
                      <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">
                        {t('scheduler.bulkSchedule.firstComment')} {item.firstComment}
                      </p>
                    )}
                  </>
                )}
                {successfulIds.has(item.draftId) ? (
                  <p className="text-xs text-green-300 mt-2">
                    {t(
                      resultFor(item.draftId)?.draftRetained
                        ? 'scheduler.bulkSchedule.scheduledRetained'
                        : 'scheduler.bulkSchedule.scheduled'
                    )}
                  </p>
                ) : !item.ready || resultFor(item.draftId)?.success === false ? (
                  <div className="mt-2 text-xs text-red-300">
                    <p>{reasonText(resultFor(item.draftId)?.reason || item.reason)}</p>
                    <Link
                      to={`/compose?draft=${item.draftId}`}
                      onClick={(e) => {
                        if (scheduling) e.preventDefault()
                        else onClose?.()
                      }}
                      className="inline-block underline mt-1"
                    >
                      {t('scheduler.editDraft')}
                    </Link>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>

        <footer className="p-4 border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={scheduling}
            className="px-3 py-2 rounded-lg bg-gray-800 text-sm disabled:opacity-50"
          >
            {t('scheduler.bulkSchedule.close')}
          </button>
          <button
            onClick={refreshPreview}
            disabled={loading || scheduling}
            className="px-3 py-2 rounded-lg bg-gray-800 text-sm disabled:opacity-50"
          >
            {t('scheduler.bulkSchedule.refresh')}
          </button>
          {successfulIds.size > 0 && (
            <button
              onClick={onViewScheduled}
              disabled={scheduling}
              className="px-3 py-2 rounded-lg bg-gray-700 text-sm disabled:opacity-50"
            >
              {t('scheduler.bulkSchedule.viewScheduled')}
            </button>
          )}
          <button
            onClick={schedule}
            disabled={loading || scheduling || !readyItems.length}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm font-medium disabled:opacity-50"
          >
            {scheduling
              ? t('scheduler.bulkSchedule.scheduling')
              : t('scheduler.bulkSchedule.confirm', { count: readyItems.length })}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  )
}
