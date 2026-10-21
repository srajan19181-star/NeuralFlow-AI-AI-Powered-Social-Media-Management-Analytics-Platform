import { useState } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/tr'
import 'dayjs/locale/en'
import { PLATFORM_META } from '../../stores/platforms'
import type { FeedItem as FeedItemType } from '../../stores/feed'
import { useI18n } from '../../locales'

dayjs.extend(relativeTime)

export interface FeedItemProps {
  item: FeedItemType
}

export default function FeedItem({ item }: FeedItemProps) {
  const { t, locale } = useI18n()
  const [expanded, setExpanded] = useState(false)

  const platformColor = PLATFORM_META[item.platform]?.color ?? '#6b7280'
  const currentLang = String(locale.value || locale)
  const timeAgo = dayjs(item.createdAt).locale(currentLang).fromNow()

  const isImageFirst =
    item.platform === 'instagram' ||
    (item.media?.[0]?.type === 'image' && item.platform === 'facebook')

  function formatNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return String(n)
  }

  return (
    <article
      className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800/80 hover:border-gray-700 transition-colors"
      style={{ borderLeftColor: platformColor, borderLeftWidth: '3px' }}
    >
      {/* Image-first layout for Instagram (and Facebook image posts) */}
      {isImageFirst && item.media[0] && (
        <div className="relative">
          <img
            src={item.media[0].thumbnail || item.media[0].url}
            alt={item.media[0].alt || ''}
            className="w-full object-cover max-h-44"
          />
          {/* Platform badge over image */}
          <span
            className="absolute top-2 right-2 text-xs font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: platformColor, color: '#fff' }}
          >
            {t(`platforms.${item.platform}`)}
          </span>
          {/* Multiple images indicator */}
          {item.media.length > 1 && (
            <span className="absolute top-2 left-2 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
              +{item.media.length - 1}
            </span>
          )}
        </div>
      )}

      <div className="p-3">
        {/* Author row */}
        <div className="flex items-center gap-2 mb-2">
          {item.author.avatar ? (
            <img
              src={item.author.avatar}
              alt={item.author.name}
              className="w-7 h-7 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-medium">
              {item.author.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-white truncate block leading-tight">
              {item.author.name || item.author.username}
            </span>
            <span className="text-xs text-gray-500 leading-tight">{timeAgo}</span>
          </div>

          {/* Platform badge (text-only posts) */}
          {!isImageFirst && (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ backgroundColor: `${platformColor}25`, color: platformColor }}
            >
              {t(`platforms.${item.platform}`)}
            </span>
          )}
        </div>

        {/* Content */}
        {item.content && (
          <p
            className={`text-xs text-gray-300 leading-relaxed mb-2 ${
              expanded ? '' : 'line-clamp-3'
            }`}
          >
            {item.content}
          </p>
        )}
        {item.content && item.content.length > 180 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-gray-500 hover:text-gray-300 mb-2 -mt-1"
          >
            more
          </button>
        )}

        {/* Inline image (non-Instagram text posts with media) */}
        {!isImageFirst && item.media?.[0] && (
          <div className="mb-2">
            <img
              src={item.media[0].thumbnail || item.media[0].url}
              alt={item.media[0].alt || ''}
              className="rounded-lg w-full object-cover max-h-28"
            />
          </div>
        )}

        {/* Tags */}
        {item.platformTags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {item.platformTags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-xs text-blue-400">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Metrics + link */}
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {item.metrics?.likes ? <span>❤ {formatNum(item.metrics.likes)}</span> : null}
          {item.metrics?.comments ? <span>💬 {formatNum(item.metrics.comments)}</span> : null}
          {item.metrics?.shares ? <span>↺ {formatNum(item.metrics.shares)}</span> : null}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto hover:text-gray-400 transition-colors"
            >
              {t('feed.openOriginal')}
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
