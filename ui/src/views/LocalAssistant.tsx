import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { useWorkspaceStore } from '../stores/workspace'
import { useI18n } from '../locales'

export default function LocalAssistant() {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()

  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [csrf, setCsrf] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [session, setSession] = useState<any>(null)
  const [scopes, setScopes] = useState(['social:read', 'social:drafts'])

  const permissions = [
    { scope: 'social:read', key: 'read' },
    { scope: 'social:drafts', key: 'write' },
    { scope: 'social:publish', key: 'publish' },
    { scope: 'social:schedule', key: 'schedule' },
  ]

  const busy = session?.status === 'running'
  const storageKey = `local-assistant:${workspaceStore.activeWorkspaceId}`
  const describe = (err: any) => err.response?.data?.error || err.message

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const disposedRef = useRef(false)

  async function refresh() {
    const id = session?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null)
    if (!id || disposedRef.current) return
    try {
      const res = await axios.get(`/connector/local/sessions/${id}`)
      setSession(res.data)
      setError('')
      if (res.data?.status === 'running' && !disposedRef.current) {
        timerRef.current = setTimeout(refresh, 2000)
      }
    } catch (err: any) {
      setError(describe(err))
      if ([401, 403, 404].includes(err.response?.status)) {
        setSession(null)
        if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey)
        if (err.response?.status === 401) setAuthenticated(false)
      }
    }
  }

  async function begin() {
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/connector/local/sessions', {
        csrf,
        workspaceId: workspaceStore.activeWorkspaceId,
        scopes,
      })
      setSession(res.data)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, res.data.id)
      }
    } catch (err: any) {
      setError(describe(err))
    } finally {
      setLoading(false)
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (!session || busy || acting) return
    setActing(true)
    setError('')
    try {
      await axios.post(`/connector/local/sessions/${session.id}/turn`, {
        csrf,
        workspaceId: workspaceStore.activeWorkspaceId,
        message,
      })
      setMessage('')
      await refresh()
    } catch (err: any) {
      await refresh()
      setError(describe(err))
    } finally {
      setActing(false)
    }
  }

  async function decide(decision: 'confirm' | 'cancel') {
    setActing(true)
    setError('')
    try {
      await axios.post(`/connector/local/sessions/${session.id}/confirm`, {
        csrf,
        workspaceId: workspaceStore.activeWorkspaceId,
        previewId: session.pendingPreview.previewId,
        decision,
      })
      await refresh()
    } catch (err: any) {
      await refresh()
      setError(describe(err))
    } finally {
      setActing(false)
    }
  }

  function newSession() {
    if (!busy && !acting) {
      setSession(null)
      if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey)
      setError('')
    }
  }

  function toggleScope(scope: string) {
    if (scope === 'social:read') return
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  useEffect(() => {
    disposedRef.current = false
    axios
      .get('/connector/local/status')
      .then((res) => {
        setAuthenticated(true)
        setCsrf(res.data.csrf)
        setModel(res.data.model || '')
        setError(res.data.error || '')
        refresh()
      })
      .catch((err) => {
        if (err.response?.status !== 401) setError(describe(err))
      })
      .finally(() => {
        setLoading(false)
      })

    return () => {
      disposedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold">{t('localAssistant.title')}</h1>
          <p className="mt-2 text-sm text-gray-400">{t('localAssistant.description')}</p>
          <p className="mt-2 text-sm text-violet-300">
            {workspaceStore.activeWorkspace?.name} {model && <span>· {model}</span>}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </p>
        )}

        {!authenticated && !loading ? (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <p className="text-sm text-gray-300">{t('localAssistant.signInHint')}</p>
            <a
              href="/connector/login?returnTo=/local-assistant"
              className="inline-block bg-violet-700 rounded-lg px-4 py-2"
            >
              {t('localAssistant.signIn')}
            </a>
          </section>
        ) : authenticated && !session ? (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <h2 className="font-semibold">{t('localAssistant.permissions')}</h2>
            <p className="text-sm text-gray-400">{t('localAssistant.permissionsHint')}</p>
            {permissions.map((permission) => (
              <label key={permission.scope} className="flex gap-3 items-start text-sm">
                <input
                  type="checkbox"
                  checked={scopes.includes(permission.scope)}
                  onChange={() => toggleScope(permission.scope)}
                  disabled={permission.scope === 'social:read'}
                  className="mt-1"
                />
                <span>{t(`localAssistant.${permission.key}`)}</span>
              </label>
            ))}
            <button
              onClick={begin}
              disabled={loading || !model}
              className="bg-violet-700 rounded-lg px-4 py-2 disabled:opacity-40"
            >
              {loading ? t('localAssistant.checking') : t('localAssistant.start')}
            </button>
            <a href="/global-settings#settings-local" className="ml-3 text-sm text-violet-300 underline">
              {t('localAssistant.settings')}
            </a>
          </section>
        ) : null}

        {session && (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <button
                onClick={newSession}
                disabled={busy || acting}
                className="rounded-lg border border-gray-700 px-3 py-2 disabled:opacity-40"
              >
                {t('localAssistant.newSession')}
              </button>
              <a href="/calendar-plan" className="px-3 py-2 text-violet-300 underline">
                {t('localAssistant.plans')}
              </a>
              <a href="/scheduler" className="px-3 py-2 text-violet-300 underline">
                {t('localAssistant.drafts')}
              </a>
              <a href="/connector" className="px-3 py-2 text-gray-400 underline">
                {t('localAssistant.manage')}
              </a>
            </div>

            {session.error && (
              <div role="alert" className="rounded-xl border border-amber-800 p-4 text-sm text-amber-200">
                {session.error}
              </div>
            )}

            <div aria-live="polite" className="space-y-3">
              {session.messages?.map((msg: any, index: number) => (
                <article
                  key={index}
                  className={`rounded-xl border border-gray-800 p-4 ${
                    msg.role === 'user' ? 'bg-gray-800/70' : 'bg-gray-900'
                  }`}
                >
                  <p className="mb-2 text-xs font-semibold text-violet-300">
                    {msg.role === 'user' ? t('localAssistant.you') : t('localAssistant.assistant')}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                </article>
              ))}
            </div>

            {session.events?.length > 0 && (
              <details className="rounded-xl border border-gray-800 p-4">
                <summary className="text-sm cursor-pointer">{t('localAssistant.toolActivity')}</summary>
                <ul className="mt-3 space-y-1 text-xs text-gray-400">
                  {session.events.map((ev: any, index: number) => (
                    <li key={index}>
                      {ev.success ? '✓' : '×'} {ev.tool}
                      {ev.error && <span className="block text-red-300 whitespace-pre-wrap">{ev.error}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {session.status === 'awaiting_confirmation' && session.pendingPreview && (
              <section className="rounded-2xl border border-amber-700 bg-amber-950/20 p-5 space-y-4">
                <h2 className="font-semibold text-amber-200">{t('localAssistant.review')}</h2>
                <p className="text-sm text-gray-400">{t('localAssistant.reviewHint')}</p>
                <p className="whitespace-pre-wrap text-sm">{session.pendingPreview.content}</p>
                {session.pendingPreview.firstComment && (
                  <p className="whitespace-pre-wrap text-sm">
                    {t('localAssistant.firstComment')}: {session.pendingPreview.firstComment}
                  </p>
                )}
                <ul className="text-sm space-y-2">
                  {session.pendingPreview.destinations?.map((dest: any, index: number) => (
                    <li key={index}>
                      <strong>
                        {session.pendingPreview.accounts?.[index]?.name || dest.accountId || dest.platform}
                      </strong>{' '}
                      · {dest.platform}
                      {(['imageUrl', 'videoUrl', 'link'] as const).map((field) =>
                        dest[field] ? (
                          <a
                            key={field}
                            href={dest[field]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-violet-300 underline break-all"
                          >
                            {dest[field]}
                          </a>
                        ) : null
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-sm">
                  {session.pendingPreview.scheduledAt
                    ? `${t('localAssistant.scheduledTime')}: ${session.pendingPreview.scheduledAt} (${new Date(
                        session.pendingPreview.scheduledAt
                      ).toLocaleString()})`
                    : t('localAssistant.immediate')}
                </p>
                <p className="text-xs text-gray-400">
                  {t('localAssistant.expires')}: {new Date(session.pendingPreview.expiresAt).toLocaleString()}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => decide('confirm')}
                    disabled={acting}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    {session.pendingPreview.mode === 'schedule'
                      ? t('localAssistant.confirmSchedule')
                      : t('localAssistant.confirmPublish')}
                  </button>
                  <button
                    onClick={() => decide('cancel')}
                    disabled={acting}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm disabled:opacity-40"
                  >
                    {t('localAssistant.cancel')}
                  </button>
                </div>
              </section>
            )}

            {session.deliveryResult && (
              <section className="rounded-xl border border-gray-700 p-4">
                <h2 className="font-semibold">{t('localAssistant.deliveryResult')}</h2>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-gray-300">
                  {JSON.stringify(session.deliveryResult, null, 2)}
                </pre>
              </section>
            )}

            {busy && (
              <p role="status" className="text-sm text-violet-300">
                {t('localAssistant.working')}
              </p>
            )}

            <form onSubmit={send} className="space-y-3">
              <label htmlFor="local-message" className="text-sm">
                {t('localAssistant.message')}
              </label>
              <textarea
                id="local-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={20000}
                placeholder={t('localAssistant.placeholder')}
                disabled={busy || session.status === 'awaiting_confirmation'}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm disabled:opacity-50"
              />
              <button
                disabled={busy || acting || !message.trim() || session.status === 'awaiting_confirmation'}
                className="rounded-lg bg-violet-700 px-5 py-2 disabled:opacity-40"
              >
                {t('localAssistant.send')}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
