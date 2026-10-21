import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useI18n, SUPPORTED_LOCALES } from '../locales'
import { useWorkspaceStore } from '../stores/workspace'

export default function NavBar() {
  const { t, locale, setLocale } = useI18n()
  const location = useLocation()
  const [showLangMenu, setShowLangMenu] = useState(false)
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false)

  const workspaceStore = useWorkspaceStore()
  const { workspaces, activeWorkspaceId, activeWorkspace } = workspaceStore

  const navLinks = [
    { to: '/dashboard', label: 'nav.feed' },
    { to: '/compose', label: 'nav.compose' },
    { to: '/media', label: 'nav.media' },
    { to: '/scheduler', label: 'nav.scheduler' },
    { to: '/analytics', label: 'nav.analytics' },
    { to: '/calendar-plan', label: 'nav.calendarPlan' },
    { to: '/local-assistant', label: 'nav.localAssistant' },
    { to: '/competitors', label: 'nav.competitors' },
    { to: '/settings', label: 'nav.settings' },
    { to: '/global-settings', label: 'nav.globalSettings' },
  ]

  const currentLocale =
    SUPPORTED_LOCALES.find((l) => l.code === String(locale.value || locale)) ?? SUPPORTED_LOCALES[0]

  function closeMenus() {
    setShowLangMenu(false)
    setShowWorkspaceMenu(false)
  }

  function handleSetLocale(code: string) {
    setLocale(code)
    setShowLangMenu(false)
  }

  async function switchWorkspace(id: string) {
    await workspaceStore.setActive(id)
    setShowWorkspaceMenu(false)
    window.location.reload()
  }

  return (
    <>
      <nav className="bg-gray-900 border-b border-gray-800 px-3 sm:px-6 py-3 flex flex-wrap lg:flex-nowrap gap-2 items-center justify-between">
        <Link to="/dashboard" className="text-white font-bold text-lg tracking-tight shrink-0">
          📡 SocialManager
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto order-3 w-full lg:order-none lg:w-auto min-w-0">
          {navLinks.map((link) => {
            const isActive = location.pathname.startsWith(link.to) && link.to !== '/'
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {t(link.label)}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Workspace switcher */}
          <div className="relative">
            <button
              onClick={() => setShowWorkspaceMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors max-w-[160px]"
              title={t('workspace.switchLabel')}
            >
              <span className="text-xs">🏢</span>
              <span className="truncate">{activeWorkspace?.name || t('workspace.defaultName')}</span>
              <span className="text-xs opacity-50 shrink-0">▾</span>
            </button>

            {showWorkspaceMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl z-50 min-w-[200px]">
                <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wider">
                  {t('workspace.label')}
                </div>
                {workspaces.map((ws: any) => (
                  <button
                    key={ws._id}
                    onClick={() => switchWorkspace(ws._id)}
                    className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors hover:bg-gray-700 text-left ${
                      ws._id === activeWorkspaceId ? 'text-white font-medium' : 'text-gray-400'
                    }`}
                  >
                    <span className="flex-1 truncate">{ws.name || t('workspace.defaultName')}</span>
                    {ws._id === activeWorkspaceId && (
                      <span className="text-violet-400 text-xs shrink-0">{t('workspace.activeLabel')}</span>
                    )}
                  </button>
                ))}
                <div className="border-t border-gray-700">
                  <Link
                    to="/settings#workspaces"
                    onClick={() => setShowWorkspaceMenu(false)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-xs">⚙️</span>
                    <span>{t('workspace.manage')}</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Language switcher */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <span>{currentLocale.flag}</span>
              <span>{currentLocale.code.toUpperCase()}</span>
              <span className="text-xs opacity-50">▾</span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl z-50 min-w-[140px]">
                {SUPPORTED_LOCALES.map((loc) => {
                  const isSelected = String(locale.value || locale) === loc.code
                  return (
                    <button
                      key={loc.code}
                      onClick={() => handleSetLocale(loc.code)}
                      className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors hover:bg-gray-700 ${
                        isSelected ? 'text-white font-medium' : 'text-gray-400'
                      }`}
                    >
                      <span>{loc.flag}</span>
                      <span>{loc.label}</span>
                      {isSelected && <span className="ml-auto text-blue-400 text-xs">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Overlays to close menus */}
      {(showLangMenu || showWorkspaceMenu) && (
        <div className="fixed inset-0 z-40" onClick={closeMenus} />
      )}
    </>
  )
}
