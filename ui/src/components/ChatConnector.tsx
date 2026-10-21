import { useState, useEffect } from 'react'
import axios from 'axios'
import { useI18n } from '../locales'

export interface ChatConnectorProps {
  provider: 'claude' | 'chatgpt' | 'local'
}

export default function ChatConnector({ provider }: ChatConnectorProps) {
  const { t } = useI18n()
  const localePrefix = provider === 'local' ? 'localConnector' : provider === 'chatgpt' ? 'chatgptConnector' : 'claudeConnector'
  const [connectorUrl, setConnectorUrl] = useState(() =>
    typeof window !== 'undefined' ? new URL('/mcp', window.location.origin).href : '/mcp'
  )
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    let cancelled = false
    axios.get('/connector/info')
      .then((result) => {
        if (!cancelled) {
          setConnectorUrl(result.data.resourceUrl)
          setConfigured(result.data.configured === true)
        }
      })
      .catch(() => {
        // Show setup guidance if unavailable
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id={`${provider}-connector`} className="bg-gray-900 border border-violet-800/50 rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-gray-800">
        <h2 className="font-semibold text-violet-200">{t(`${localePrefix}.title`)}</h2>
        <p className="text-xs text-gray-400 mt-1">{t(`${localePrefix}.description`)}</p>
      </div>
      <div className="p-5 space-y-3">
        <label htmlFor={`${provider}-mcp-url`} className="block text-xs text-gray-400">
          {t(`${localePrefix}.urlLabel`)}
        </label>
        <input
          id={`${provider}-mcp-url`}
          value={connectorUrl}
          readOnly
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-400">{t(`${localePrefix}.instructions`)}</p>

        {provider === 'chatgpt' && (
          <>
            <a
              href="/connector/chatgpt-plugin.zip"
              download="socialmanager-chatgpt-plugin.zip"
              className="inline-block rounded-lg bg-emerald-800 px-4 py-2 text-sm text-white"
            >
              {t('chatgptConnector.downloadPlugin')}
            </a>
            <p className="text-xs text-gray-400">{t('chatgptConnector.uploadHint')}</p>
          </>
        )}

        {!configured && <p className="text-xs text-amber-300">{t(`${localePrefix}.setupRequired`)}</p>}

        <a
          href="/connector"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white"
        >
          {t(`${localePrefix}.manageAccess`)}
        </a>

        {provider === 'local' && (
          <a href="/local-assistant" className="ml-3 inline-block text-sm text-violet-200 underline">
            {t('localConnector.openAssistant')}
          </a>
        )}

        <p className="text-xs text-gray-500">{t(`${localePrefix}.apiNote`)}</p>
      </div>
    </section>
  )
}
