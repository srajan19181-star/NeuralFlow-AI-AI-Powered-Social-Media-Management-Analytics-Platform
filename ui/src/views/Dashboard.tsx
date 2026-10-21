import React, { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useWorkspaceStore } from '../stores/workspace'
import { useFeedStore } from '../stores/feed'
import { usePlatformsStore, PLATFORM_META } from '../stores/platforms'
import type { FeedItem as FeedItemType } from '../stores/feed'
import FeedItem from '../components/feed/FeedItem'
import { useI18n } from '../locales'

export default function Dashboard() {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const feedStore = useFeedStore()
  const platformsStore = usePlatformsStore()

  useEffect(() => {
    let socket: Socket | undefined
    const workspaceId = workspaceStore.activeWorkspaceId
    socket = io({ auth: { workspaceId } })
    socket.on('feed.items', (data: { workspaceId: string; items: FeedItemType[] }) => {
      if (data.workspaceId === workspaceStore.activeWorkspaceId && Array.isArray(data.items)) {
        data.items.forEach((item) => feedStore.addItem(item))
      }
    })
    return () => {
      socket?.disconnect()
    }
  }, [workspaceStore.activeWorkspaceId, feedStore])

  useEffect(() => {
    feedStore.fetchFeeds()
    platformsStore.fetchStatuses()
    platformsStore.fetchMetaConnections()
  }, [])

  // Group filtered items by platform
  const itemsByPlatform = useMemo(() => {
    const groups: Record<string, FeedItemType[]> = {}
    for (const item of feedStore.filteredItems) {
      if (!groups[item.platform]) groups[item.platform] = []
      groups[item.platform].push(item)
    }
    return groups
  }, [feedStore.filteredItems])

  // Only show columns for platforms that are active AND have at least one item
  const activePlatformsWithItems = useMemo(
    () =>
      Object.keys(PLATFORM_META).filter(
        (p) => feedStore.activePlatforms.has(p) && itemsByPlatform[p]?.length
      ),
    [feedStore.activePlatforms, itemsByPlatform]
  )

  async function handleRefresh() {
    await feedStore.refreshFeeds()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* ── Sidebar ── */}
      <aside className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
        <div className="p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            {t('dashboard.platforms')}
          </p>

          {Object.entries(PLATFORM_META).map(([key, meta]) => (
            <React.Fragment key={key}>
              <button
                onClick={() => feedStore.togglePlatform(key)}
                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-sm transition-colors mb-0.5 ${
                  feedStore.activePlatforms.has(key)
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                <span className="truncate flex-1 text-left text-xs">{t(`platforms.${key}`)}</span>
                {itemsByPlatform[key]?.length ? (
                  <span className="text-xs text-gray-500 flex-shrink-0">{itemsByPlatform[key].length}</span>
                ) : null}
                {platformsStore.isConnected(key) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                )}
              </button>

              {/* Facebook sub-pages */}
              {key === 'facebook' && platformsStore.connectedPages.length > 0 && (
                <>
                  {platformsStore.connectedPages.map((page: any) => (
                    <button
                      key={page.id}
                      onClick={() => feedStore.togglePage(page.id)}
                      className={`flex items-center gap-2 w-full pl-6 pr-2 py-1 mb-0.5 rounded-lg text-left transition-colors ${
                        feedStore.activePageIds.has(page.id)
                          ? 'bg-blue-900/30 text-white'
                          : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
                      }`}
                    >
                      {page.picture ? (
                        <img src={page.picture} alt="" className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
                      ) : (
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-white"
                          style={{ background: '#1877F2', fontSize: 8 }}
                        >
                          f
                        </span>
                      )}
                      <span className="text-xs truncate flex-1">{page.name}</span>
                      {feedStore.activePageIds.has(page.id) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}

              {/* Instagram sub-accounts */}
              {key === 'instagram' && platformsStore.connectedIgAccounts.length > 0 && (
                <>
                  {platformsStore.connectedIgAccounts.map((account: any) => (
                    <button
                      key={account.id}
                      onClick={() => feedStore.toggleIgAccount(account.id)}
                      className={`flex items-center gap-2 w-full pl-6 pr-2 py-1 mb-0.5 rounded-lg text-left transition-colors ${
                        feedStore.activeIgAccountIds.has(account.id)
                          ? 'bg-pink-900/30 text-white'
                          : 'text-gray-500 hover:bg-gray-800/60 hover:text-gray-300'
                      }`}
                    >
                      {account.avatar ? (
                        <img src={account.avatar} alt="" className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
                      ) : (
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-white"
                          style={{ background: '#E1306C', fontSize: 8 }}
                        >
                          I
                        </span>
                      )}
                      <span className="text-xs truncate flex-1">{`@${account.username}`}</span>
                      {feedStore.activeIgAccountIds.has(account.id) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="px-4 pb-4 border-t border-gray-800 pt-3 mt-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            {t('dashboard.tags')}
          </p>
          <button
            onClick={() => {
              feedStore.activeTag = null
            }}
            className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs mb-0.5 transition-colors ${
              !feedStore.activeTag ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-800/60'
            }`}
          >
            {t('dashboard.allTags')}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-900 flex-shrink-0">
          <input
            value={feedStore.searchQuery}
            onChange={(e) => {
              feedStore.searchQuery = e.target.value
            }}
            type="text"
            placeholder={t('dashboard.searchPlaceholder')}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 min-w-0"
          />
          <button
            onClick={handleRefresh}
            disabled={feedStore.loading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
          >
            {feedStore.loading ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </button>
          <Link
            to="/compose"
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
          >
            {t('dashboard.newPost')}
          </Link>
        </header>

        {/* Empty state (no items at all) */}
        {feedStore.loading && !feedStore.items.length ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            {t('dashboard.loading')}
          </div>
        ) : !activePlatformsWithItems.length ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <p className="text-3xl mb-3">📭</p>
            <p className="text-sm">{t('dashboard.empty')}</p>
            <p className="text-xs mt-1 text-gray-600">{t('dashboard.emptyHint')}</p>
          </div>
        ) : (
          /* Platform columns */
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div
              className="flex h-full gap-2 p-3"
              style={{ minWidth: `${activePlatformsWithItems.length * 296}px` }}
            >
              {activePlatformsWithItems.map((platform) => (
                <div
                  key={platform}
                  className="flex flex-col flex-1 min-w-[260px] max-w-xs bg-gray-900/60 rounded-xl overflow-hidden border border-gray-800/60"
                >
                  {/* Column header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0"
                    style={{ borderBottomColor: `${PLATFORM_META[platform]?.color}44` }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PLATFORM_META[platform]?.color }}
                    />
                    <span className="text-sm font-semibold flex-1">{t(`platforms.${platform}`)}</span>
                    <span className="text-xs text-gray-600">{itemsByPlatform[platform]?.length}</span>
                  </div>

                  {/* Sub-label for Facebook pages */}
                  {platform === 'facebook' && platformsStore.connectedPages.length > 0 && (
                    <div className="px-3 py-1 bg-gray-800/40 flex flex-wrap gap-x-2 border-b border-gray-800/40">
                      {platformsStore.connectedPages.map((page: any) => (
                        <span key={page.id} className="text-xs text-gray-500 truncate">
                          {page.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Sub-label for Instagram accounts */}
                  {platform === 'instagram' && platformsStore.connectedIgAccounts.length > 0 && (
                    <div className="px-3 py-1 bg-gray-800/40 flex flex-wrap gap-x-2 border-b border-gray-800/40">
                      {platformsStore.connectedIgAccounts.map((account: any) => (
                        <span key={account.id} className="text-xs text-gray-500 truncate">
                          @{account.username}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Posts — this div scrolls independently */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {itemsByPlatform[platform]?.map((item) => (
                      <FeedItem key={`${item.platform}-${item.originalId}`} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
