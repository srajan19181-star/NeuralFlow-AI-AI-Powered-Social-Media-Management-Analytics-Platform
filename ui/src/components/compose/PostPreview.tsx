import { useState } from 'react'
import type { Destination } from '../../stores/compose'
import { useI18n } from '../../locales'

export interface PostPreviewProps {
  selectedDestinations: Destination[]
  activeKey: string
  content: string
  mediaUrl: string
  onUpdateActiveKey?: (key: string) => void
}

export default function PostPreview({
  selectedDestinations,
  activeKey,
  content,
  mediaUrl,
  onUpdateActiveKey,
}: PostPreviewProps) {
  const { t } = useI18n()
  const [, setImgError] = useState(false)

  const isVideo = /\.(mp4|mov|avi|webm)(?:[?#]|$)/i.test(mediaUrl)
  const activeDest =
    selectedDestinations.find((d) => d.key === activeKey) ?? selectedDestinations[0] ?? null
  const instagramPlacement = activeDest?.instagramPlacement || (isVideo ? 'reel' : 'feed')

  return (
    <div className="h-full flex flex-col">
      {/* Preview tab strip */}
      {selectedDestinations.length > 1 && (
        <div className="flex gap-1 mb-3 flex-wrap">
          {selectedDestinations.map((dest) => {
            const isTabActive = activeKey === dest.key
            return (
              <button
                key={dest.key}
                onClick={() => onUpdateActiveKey?.(dest.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  isTabActive ? 'text-white' : 'text-gray-500 hover:text-gray-300 bg-transparent'
                }`}
                style={isTabActive ? { backgroundColor: dest.color } : {}}
              >
                {dest.picture ? (
                  <img src={dest.picture} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ fontSize: 9, backgroundColor: dest.color }}
                  >
                    {dest.label[0]}
                  </span>
                )}
                {dest.label}
              </button>
            )
          })}
        </div>
      )}

      {/* No destination selected */}
      {!activeDest ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-sm gap-2">
          <span className="text-3xl">👁</span>
          <p>Select an account to see a preview</p>
        </div>
      ) : activeDest.platform === 'facebook' ? (
        /* Facebook preview */
        <div className="bg-white rounded-xl shadow overflow-hidden text-gray-900">
          <div className="flex items-center gap-2 p-3">
            {activeDest.picture ? (
              <img src={activeDest.picture} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                style={{ background: '#1877F2' }}
              >
                f
              </div>
            )}
            <div>
              <p className="font-semibold text-sm leading-tight">{activeDest.label}</p>
              <p className="text-xs text-gray-400 leading-tight">
                Just now · <span className="text-gray-400">🌐</span>
              </p>
            </div>
          </div>
          {content ? (
            <p className="px-3 pb-3 text-sm whitespace-pre-wrap">{content}</p>
          ) : (
            <p className="px-3 pb-3 text-sm text-gray-300 italic">Start writing to see preview…</p>
          )}
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt=""
              className="w-full object-cover max-h-72"
              onError={() => setImgError(true)}
            />
          )}
          <div className="border-t border-gray-100 mx-3"></div>
          <div className="flex px-3 py-2 gap-1 text-gray-500 text-xs">
            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded hover:bg-gray-50 font-medium">
              👍 Like
            </button>
            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded hover:bg-gray-50 font-medium">
              💬 Comment
            </button>
            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded hover:bg-gray-50 font-medium">
              ↗ Share
            </button>
          </div>
        </div>
      ) : activeDest.platform === 'instagram' ? (
        /* Instagram preview */
        <div className="bg-white rounded-xl shadow overflow-hidden text-gray-900 max-w-sm mx-auto w-full">
          <div className="flex items-center gap-2 p-2.5">
            {activeDest.picture && (
              <img src={activeDest.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
            )}
            <span className="font-semibold text-sm">{activeDest.label}</span>
            <span className="ml-auto text-xs">{t(`instagramPublishing.${instagramPlacement}`)}</span>
          </div>
          <div
            className="relative w-full bg-gray-950 overflow-hidden"
            style={{ aspectRatio: instagramPlacement === 'feed' ? '3 / 4' : '9 / 16' }}
          >
            {isVideo ? (
              <video
                src={mediaUrl}
                poster={activeDest.coverUrl}
                controls
                className="w-full h-full object-contain"
              />
            ) : mediaUrl ? (
              <img src={mediaUrl} alt="" className="w-full h-full object-contain" />
            ) : null}
            {instagramPlacement !== 'feed' && (
              <div
                className="absolute pointer-events-none border border-dashed border-white/60 rounded-lg"
                style={{ top: '14%', bottom: '22%', left: '7%', right: '14%' }}
              />
            )}
          </div>
          {instagramPlacement !== 'feed' && (
            <p className="text-xs text-gray-500 px-3 py-2">{t('instagramPublishing.safeArea')}</p>
          )}
          {instagramPlacement !== 'story' && (
            <p className="px-3 pb-3 text-sm whitespace-pre-wrap">{content}</p>
          )}
        </div>
      ) : activeDest.platform === 'twitter' ? (
        /* Twitter/X preview */
        <div className="bg-white rounded-xl shadow overflow-hidden text-gray-900 p-4">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-bold flex-shrink-0">
              X
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-bold text-sm">Twitter / X</span>
                <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-gray-400 text-sm">· Just now</span>
              </div>
              <p className="text-sm mt-1 whitespace-pre-wrap">{content || 'Start writing…'}</p>
              {mediaUrl && (
                <img
                  src={mediaUrl}
                  alt=""
                  className="mt-2 rounded-2xl w-full object-cover max-h-52 border border-gray-100"
                />
              )}
              <div className="flex gap-6 text-gray-500 text-sm mt-3">
                <span>💬</span>
                <span>↺</span>
                <span>❤</span>
                <span>↗</span>
              </div>
            </div>
          </div>
        </div>
      ) : activeDest.platform === 'linkedin' ? (
        /* LinkedIn preview */
        <div className="bg-white rounded-xl shadow overflow-hidden text-gray-900 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              in
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">Your Name</p>
              <p className="text-xs text-gray-400">Just now · 🌐</p>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap mb-3">{content || 'Start writing…'}</p>
          {mediaUrl && (
            <img src={mediaUrl} alt="" className="w-full object-cover rounded max-h-64 mb-3" />
          )}
          <div className="border-t border-gray-100 pt-2 flex gap-4 text-gray-500 text-xs">
            <span>👍 Like</span>
            <span>💬 Comment</span>
            <span>↗ Share</span>
          </div>
        </div>
      ) : (
        /* Generic preview */
        <div className="bg-gray-900 rounded-xl shadow overflow-hidden border border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: activeDest.color }}
            >
              {activeDest.label[0]}
            </div>
            <div>
              <p className="font-semibold text-sm text-white leading-tight">{activeDest.label}</p>
              <p className="text-xs text-gray-500">Just now</p>
            </div>
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{content || 'Start writing…'}</p>
          {mediaUrl && (
            <img src={mediaUrl} alt="" className="w-full object-cover rounded-lg mt-3 max-h-52" />
          )}
        </div>
      )}
    </div>
  )
}
