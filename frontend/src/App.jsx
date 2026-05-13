import { useEffect, useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Tv2, BookOpen, Settings, Radio, Heart } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getStatus, getSettings } from './stalkerApi'
import SetupPage from './pages/SetupPage'
import ChannelsPage from './pages/ChannelsPage'
import PlayerPage from './pages/PlayerPage'
import GuidePage from './pages/GuidePage'
import FavoritesPage from './pages/FavoritesPage'

// ── App-wide context ──────────────────────────────────────────────────────
export const AppContext = createContext({})
export const useApp = () => useContext(AppContext)

// ── Nav link style ────────────────────────────────────────────────────────
function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary-light)]'
            : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
        )
      }
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )
}

// ── Top nav ───────────────────────────────────────────────────────────────
function TopNav({ connected, epgEnabled }) {
  return (
    <header className="fixed top-0 inset-x-0 z-40 h-14 flex items-center px-6 gap-6 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-sm">
      <div className="flex items-center gap-2 shrink-0">
        <Radio size={20} className="text-[var(--color-primary-light)]" />
        <span className="font-semibold text-sm tracking-wide text-[var(--color-text)]">StalkerWeb</span>
      </div>

      {connected && (
        <nav className="flex items-center gap-1">
          <NavItem to="/channels" icon={Tv2} label="Channels" />
          <NavItem to="/favorites" icon={Heart} label="Favorites" />
          {epgEnabled && <NavItem to="/guide" icon={BookOpen} label="Guide" />}
        </nav>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              connected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-surface-2)]'
            )}
          />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </div>
    </header>
  )
}

function RequireAuth({ connected, children }) {
  if (!connected) return <Navigate to="/settings" replace />
  return children
}

function AppInner() {
  const [connected, setConnected] = useState(false)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [epgEnabled, setEpgEnabled] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [status, settings] = await Promise.all([getStatus(), getSettings()])
        setConnected(status.connected)
        setEpgEnabled(settings.epg_enabled !== false)
      } catch {
        setConnected(false)
      } finally {
        setStatusLoaded(true)
      }
    }
    load()
    const id = setInterval(async () => {
      try {
        const s = await getStatus()
        setConnected(s.connected)
      } catch {
        setConnected(false)
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  if (!statusLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <AppContext.Provider value={{ connected, setConnected, epgEnabled, setEpgEnabled }}>
      <TooltipProvider delayDuration={300}>
        <TopNav connected={connected} epgEnabled={epgEnabled} />
        <main className="pt-14 min-h-full">
          <Routes>
            <Route path="/settings" element={<SetupPage />} />
            <Route
              path="/channels"
              element={
                <RequireAuth connected={connected}>
                  <ChannelsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/player"
              element={
                <RequireAuth connected={connected}>
                  <PlayerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/favorites"
              element={
                <RequireAuth connected={connected}>
                  <FavoritesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/guide"
              element={
                <RequireAuth connected={connected}>
                  <GuidePage />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={<Navigate to={connected ? '/channels' : '/settings'} replace />}
            />
          </Routes>
        </main>
      </TooltipProvider>
    </AppContext.Provider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
