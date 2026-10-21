import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { usePlatformsStore } from '../stores/platforms'
import { useI18n } from '../locales'

interface MediaFile {
  _id: string
  filename: string
  originalName: string
  url: string
  mimetype: string
  size: number
  width?: number
  height?: number
  aspect?: string
  uploadedAt: string
  folder?: string | null
}

interface CustomFolder {
  name: string
  count: number
}

interface AccountFolder {
  key: string
  label: string
}

export default function Media() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const platformsStore = usePlatformsStore()

  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MediaFile | null>(null)
  const [copied, setCopied] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unorganizedCount, setUnorganizedCount] = useState(0)
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})

  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [movingFileId, setMovingFileId] = useState<string | null>(null)
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})

  async function fetchProfiles() {
    try {
      const res = await axios.get('/api/profiles')
      const map: Record<string, string> = {}
      for (const p of res.data as Array<{ _id: string; businessName?: string }>) {
        if (p.businessName?.trim()) map[p._id] = p.businessName.trim()
      }
      setProfileMap(map)
    } catch {
      // ignore
    }
  }

  const accountFolders = useMemo<AccountFolder[]>(() => {
    const { connectedPages, connectedIgAccounts, connectedPinterestBoards } = platformsStore
    const seen = new Map<string, AccountFolder>()

    function add(platformKey: string, fallbackLabel: string) {
      const label = profileMap[platformKey] || fallbackLabel
      if (!seen.has(label)) seen.set(label, { key: label, label })
    }

    for (const page of connectedPages) {
      add(`facebook:${page.id}`, page.name)
    }
    for (const acc of connectedIgAccounts) {
      add(`instagram:${acc.id}`, acc.username)
    }
    if (connectedPinterestBoards.length > 0) {
      add('pinterest', 'Pinterest')
    }

    const standardPlatforms = [
      { key: 'twitter', label: 'Twitter/X' },
      { key: 'linkedin', label: 'LinkedIn' },
      { key: 'mastodon', label: 'Mastodon' },
      { key: 'bluesky', label: 'Bluesky' },
      { key: 'reddit', label: 'Reddit' },
      { key: 'youtube', label: 'YouTube' },
    ]
    for (const p of standardPlatforms) {
      const status = platformsStore.statuses.find((s: any) => s.platform === p.key)
      if (status?.connected) add(p.key, p.label)
    }

    return Array.from(seen.values())
  }, [platformsStore.connectedPages, platformsStore.connectedIgAccounts, platformsStore.connectedPinterestBoards, platformsStore.statuses, profileMap])

  function folderLabel(key: string): string {
    return accountFolders.find((a) => a.key === key)?.label ?? key
  }

  async function fetchFolders() {
    try {
      const res = await axios.get('/api/media-folders')
      setCustomFolders(res.data.folders || [])
      setTotalCount(res.data.totalCount || 0)
      setUnorganizedCount(res.data.unorganizedCount || 0)
      setFolderCounts(res.data.folderCounts || {})
    } catch {
      // ignore
    }
  }

  async function fetchLibrary(folderTarget = activeFolder) {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (folderTarget !== null) params.folder = folderTarget
      const res = await axios.get('/api/media-library', { params })
      setFiles(res.data.files || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  function handleSetFolder(key: string | null) {
    setActiveFolder(key)
    setMovingFileId(null)
    fetchLibrary(key)
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await axios.post('/api/media-folders', { name })
      setNewFolderName('')
      setShowNewFolderInput(false)
      await fetchFolders()
    } catch (err: any) {
      setUploadError(err.response?.data?.error ?? 'Could not create folder')
    }
  }

  function cancelNewFolder() {
    setNewFolderName('')
    setShowNewFolderInput(false)
  }

  async function deleteFolder(name: string) {
    try {
      await axios.delete(`/api/media-folders/${encodeURIComponent(name)}`)
      if (activeFolder === name) {
        setActiveFolder(null)
        await Promise.all([fetchFolders(), fetchLibrary(null)])
      } else {
        await Promise.all([fetchFolders(), fetchLibrary()])
      }
    } catch (err: any) {
      setUploadError(err.response?.data?.error ?? 'Could not delete folder')
    }
  }

  async function moveFileTo(file: MediaFile, folder: string | null) {
    try {
      await axios.patch(`/api/media/${file.filename}`, { folder })
      setFiles((prev) =>
        prev.map((f) => (f._id === file._id ? { ...f, folder } : f))
      )
      setMovingFileId(null)
      await fetchFolders()
      if (activeFolder !== null) await fetchLibrary()
    } catch (err: any) {
      setUploadError(err.response?.data?.error ?? 'Move failed')
      setMovingFileId(null)
    }
  }

  async function uploadFiles(fileList: File[]) {
    setUploading(true)
    setUploadError('')
    const total = fileList.length

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      setUploadStatus(
        total > 1
          ? `Uploading ${i + 1} of ${total}: ${file.name}`
          : `Uploading ${file.name}…`
      )

      try {
        const form = new FormData()
        form.append('file', file)
        const params: Record<string, string> = {}
        if (activeFolder && activeFolder !== '__none__') {
          params.folder = activeFolder
        }
        await axios.post('/api/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          params,
        })
      } catch (err: any) {
        setUploadError(`${file.name}: ${err.response?.data?.error ?? 'Upload failed'}`)
      }
    }

    setUploading(false)
    setUploadStatus('')
    await Promise.all([fetchFolders(), fetchLibrary()])
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    if (selected.length) await uploadFiles(selected)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const dropped = Array.from(event.dataTransfer?.files ?? [])
    if (dropped.length) uploadFiles(dropped)
  }

  async function doDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await axios.delete(`/api/media/${deleteTarget.filename}`)
      setFiles((prev) => prev.filter((f) => f.filename !== deleteTarget.filename))
      setDeleteTarget(null)
      await fetchFolders()
    } catch (err: any) {
      setUploadError(err.response?.data?.error ?? 'Delete failed')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`)
      setCopied(url)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      // fallback
    }
  }

  function useInPost(url: string) {
    navigate(`/compose?media=${encodeURIComponent(url)}`)
  }

  function isImage(mimetype: string) {
    return mimetype.startsWith('image/')
  }

  function seekVideoToThumbnail(event: React.SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget
    if (video.duration > 0) {
      video.currentTime = Math.min(0.5, video.duration * 0.25)
    }
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
    return `${bytes} B`
  }

  useEffect(() => {
    platformsStore.fetchMetaConnections()
    Promise.all([fetchProfiles(), fetchFolders(), fetchLibrary(null)])
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* Header toolbar */}
      <header className="flex items-center gap-4 px-6 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-base font-bold flex-1">{t('media.title')}</h1>
        <span className="text-xs text-gray-500">{t('media.fileCount', { count: files.length })}</span>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {uploading ? t('media.uploading') : t('media.upload')}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/x-msvideo,audio/mpeg,audio/mp4,audio/wav"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </header>

      {/* Upload progress */}
      {uploading && (
        <div className="flex-shrink-0 bg-blue-900/30 border-b border-blue-800/40 px-6 py-2 text-xs text-blue-300 flex items-center gap-3">
          <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {uploadStatus}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="flex-shrink-0 bg-red-900/30 border-b border-red-800/40 px-6 py-2 text-xs text-red-300 flex items-center justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError('')} className="text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Folder sidebar */}
        <aside className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
          <button
            onClick={() => handleSetFolder(null)}
            className={`flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors text-left ${
              activeFolder === null ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span>{t('media.allFiles')}</span>
            <span className="text-xs opacity-60">{totalCount}</span>
          </button>

          <button
            onClick={() => handleSetFolder('__none__')}
            className={`flex items-center justify-between px-4 py-2 text-sm transition-colors text-left ${
              activeFolder === '__none__' ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span>{t('media.unorganized')}</span>
            <span className="text-xs opacity-60">{unorganizedCount}</span>
          </button>

          {/* Accounts section */}
          {accountFolders.length > 0 && (
            <div className="mt-3">
              <p className="px-4 py-1 text-xs text-gray-600 font-semibold uppercase tracking-wider">
                {t('media.accounts')}
              </p>
              {accountFolders.map((af) => (
                <button
                  key={af.key}
                  onClick={() => handleSetFolder(af.key)}
                  className={`flex items-center justify-between px-4 py-2 text-sm transition-colors text-left w-full ${
                    activeFolder === af.key ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="truncate">{af.label}</span>
                  <span className="text-xs opacity-60 ml-1 flex-shrink-0">{folderCounts[af.key] || 0}</span>
                </button>
              ))}
            </div>
          )}

          {/* Custom Folders */}
          <div className="mt-3 flex-1">
            <p className="px-4 py-1 text-xs text-gray-600 font-semibold uppercase tracking-wider">
              {t('media.folders')}
            </p>
            {customFolders.map((folder) => (
              <button
                key={folder.name}
                onClick={() => handleSetFolder(folder.name)}
                className={`group flex items-center justify-between px-4 py-2 text-sm transition-colors text-left w-full ${
                  activeFolder === folder.name ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span className="truncate flex-1">{folder.name}</span>
                <span className="text-xs opacity-60 mr-1">{folder.count}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteFolder(folder.name)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity ml-1"
                  title="Delete folder"
                >
                  ✕
                </span>
              </button>
            ))}

            <div className="px-3 py-2">
              {!showNewFolderInput ? (
                <button
                  onClick={() => setShowNewFolderInput(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-md transition-colors"
                >
                  <span className="text-base leading-none">+</span>
                  {t('media.newFolder')}
                </button>
              ) : (
                <div className="flex gap-1">
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    type="text"
                    placeholder={t('media.folderNamePlaceholder')}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-600 min-w-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createFolder()
                      if (e.key === 'Escape') cancelNewFolder()
                    }}
                  />
                  <button onClick={createFolder} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-md text-xs">
                    ✓
                  </button>
                  <button onClick={cancelNewFolder} className="px-1.5 py-1 text-gray-500 hover:text-gray-300 rounded-md text-xs">
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!files.length && !loading ? (
            <div
              className="flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-gray-800 m-6 rounded-2xl cursor-pointer hover:border-blue-700 hover:bg-blue-950/10 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <svg className="w-12 h-12 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V8a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div className="text-center">
                <p className="text-gray-400 font-medium">{t('media.dropZoneTitle')}</p>
                <p className="text-gray-600 text-sm mt-1">{t('media.dropZoneHint')}</p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-gray-800 animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            <div
              className="flex-1 overflow-y-auto p-6"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9 gap-2">
                {files.map((file) => (
                  <div
                    key={file._id}
                    className="group relative aspect-square rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors"
                  >
                    {isImage(file.mimetype) ? (
                      <img src={file.url} alt={file.originalName} className="w-full h-full object-cover" loading="lazy" />
                    ) : file.mimetype.startsWith('audio/') ? (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800 p-2">
                        <audio src={file.url} controls preload="metadata" className="max-w-full" />
                      </div>
                    ) : (
                      <div className="relative w-full h-full bg-gray-800">
                        <video
                          src={file.url}
                          className="w-full h-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                          onLoadedMetadata={seekVideoToThumbnail}
                        />
                        <div className="absolute inset-0 flex items-end justify-start p-1.5 pointer-events-none">
                          <span className="bg-black/60 rounded px-1 py-0.5 text-xs text-gray-300 leading-none">▶</span>
                        </div>
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div
                      className={`absolute inset-0 bg-black/80 transition-opacity flex flex-col justify-between p-2 ${
                        movingFileId === file._id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {movingFileId === file._id ? (
                        <div className="flex flex-col h-full">
                          <p className="text-xs text-gray-300 font-medium mb-1.5">{t('media.moveToFolder')}</p>
                          <div className="flex-1 overflow-y-auto flex flex-col gap-1 min-h-0">
                            {file.folder && (
                              <button
                                onClick={() => moveFileTo(file, null)}
                                className="w-full text-left px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors"
                              >
                                {t('media.removeFolderAssign')}
                              </button>
                            )}
                            {accountFolders.map((af) => (
                              <button
                                key={af.key}
                                onClick={() => moveFileTo(file, af.key)}
                                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors truncate ${
                                  file.folder === af.key ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                {af.label}
                              </button>
                            ))}
                            {customFolders.map((cf) => (
                              <button
                                key={cf.name}
                                onClick={() => moveFileTo(file, cf.name)}
                                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors truncate ${
                                  file.folder === cf.name ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                {cf.name}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setMovingFileId(null)}
                            className="mt-1.5 w-full py-1 bg-gray-700 hover:bg-gray-600 rounded-md text-xs text-gray-300 transition-colors"
                          >
                            {t('media.cancel')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="truncate">
                            <p className="text-xs text-white font-medium truncate">{file.originalName}</p>
                            <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                            {file.width && file.height && (
                              <p className="text-xs text-gray-400">
                                {file.width} × {file.height} {file.aspect && <span>· {file.aspect}</span>}
                              </p>
                            )}
                            {file.folder && (
                              <p className="text-xs text-blue-400 truncate mt-0.5">{folderLabel(file.folder)}</p>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {!file.mimetype.startsWith('audio/') && (
                              <button
                                onClick={() => useInPost(file.url)}
                                className="w-full py-1 bg-blue-600 hover:bg-blue-500 rounded-md text-xs font-medium text-white transition-colors"
                              >
                                {t('media.useInPost')}
                              </button>
                            )}
                            <div className="flex gap-1">
                              <button
                                onClick={() => copyUrl(file.url)}
                                className={`flex-1 py-1 bg-gray-700 hover:bg-gray-600 rounded-md text-xs text-gray-200 transition-colors ${
                                  copied === file.url ? 'bg-green-700 hover:bg-green-700' : ''
                                }`}
                              >
                                {copied === file.url ? '✓' : t('media.copyUrl')}
                              </button>
                              <button
                                onClick={() => setMovingFileId(file._id)}
                                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md text-xs text-gray-300 transition-colors"
                                title={t('media.moveToFolder')}
                              >
                                📁
                              </button>
                              <button
                                onClick={() => setDeleteTarget(file)}
                                className="px-2 py-1 bg-gray-700 hover:bg-red-700 rounded-md text-xs text-gray-300 hover:text-white transition-colors"
                                title="Delete"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="font-semibold text-white mb-2">{t('media.deleteConfirmTitle')}</h2>
            <p className="text-sm text-gray-400 mb-1 truncate">{deleteTarget.originalName}</p>
            <p className="text-xs text-gray-600 mb-5">{t('media.deleteConfirmHint')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                {t('media.cancel')}
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
              >
                {deleting ? t('media.deleting') : t('media.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
