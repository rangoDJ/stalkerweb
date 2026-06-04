import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Tv2, BookOpen, Settings, Heart, RefreshCw, Timer, Loader2, Film, LayoutGrid } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AppContext } from '@/lib/appContext'
import { getStatus, getSettings } from './stalkerApi'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ToastHost } from '@/components/ToastHost'
import { ReminderBell } from '@/components/ReminderBell'
import { useReminders } from '@/lib/useReminders'

const SetupPage      = lazy(() => import('./pages/SetupPage'))
const ChannelsPage   = lazy(() => import('./pages/ChannelsPage'))
const PlayerPage     = lazy(() => import('./pages/PlayerPage'))
const GuidePage      = lazy(() => import('./pages/GuidePage'))
const FavoritesPage  = lazy(() => import('./pages/FavoritesPage'))
const VodPage        = lazy(() => import('./pages/VodPage'))
const VodPlayerPage  = lazy(() => import('./pages/VodPlayerPage'))
const EpgGridPage    = lazy(() => import('./pages/EpgGridPage'))
const ProfilesPage   = lazy(() => import('./pages/ProfilesPage'))

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

// ── Keepalive badge ───────────────────────────────────────────────────────
function KeepaliveBadge({ lastPingAt }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!lastPingAt) return
    function update() {
      const diff = Math.floor((Date.now() - new Date(lastPingAt).getTime()) / 1000)
      if (diff < 60) setLabel('just now')
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`)
      else setLabel(`${Math.floor(diff / 3600)}h ago`)
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [lastPingAt])

  if (!lastPingAt) return null
  return (
    <span className="hidden sm:flex items-center gap-1 text-xs text-[var(--color-muted)] opacity-70 hover:opacity-100 transition-opacity" title={`Session keepalive last sent: ${new Date(lastPingAt).toLocaleTimeString()}`}>
      <RefreshCw size={11} className="shrink-0" />
      {label}
    </span>
  )
}

// ── Idle countdown badge ──────────────────────────────────────────────────
function IdleBadge({ idleInfo }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!idleInfo?.lastActivityAt || !idleInfo?.idleTimeoutMs) return
    function update() {
      const elapsed = Date.now() - new Date(idleInfo.lastActivityAt).getTime()
      const remaining = Math.max(0, idleInfo.idleTimeoutMs - elapsed)
      const mins = Math.ceil(remaining / 60000)
      setLabel(remaining === 0 ? 'disconnecting…' : `idle · ${mins}m`)
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [idleInfo])

  if (!idleInfo?.lastActivityAt) return null
  return (
    <span className="hidden sm:flex items-center gap-1 text-xs text-[var(--color-muted)] opacity-60 hover:opacity-100 transition-opacity" title="Auto-disconnect when idle">
      <Timer size={11} className="shrink-0" />
      {label}
    </span>
  )
}

// ── Top nav ───────────────────────────────────────────────────────────────
function TopNav({ connected, epgEnabled, lastPingAt, idleInfo }) {
  const { reminders, removeReminder } = useReminders()

  return (
    <header className="fixed top-0 inset-x-0 z-40 h-14 flex items-center px-6 gap-6 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 backdrop-blur-sm">
      <div className="flex items-center gap-2 shrink-0">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 text-[var(--color-primary-light)]">
            <path d="M 3 25 A 13 13 0 0 0 29 25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35"/>
            <path d="M 7 25 A 9 9 0 0 0 25 25" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.65"/>
            <path d="M 11 25 A 5 5 0 0 0 21 25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="16" cy="25" r="2.5" fill="currentColor"/>
          </svg>
        <span className="font-semibold text-sm tracking-wide text-[var(--color-text)]">StalkerWeb</span>
      </div>

      {connected && (
        <nav className="flex items-center gap-1">
          <NavItem to="/channels"  icon={Tv2}         label="Channels" />
          <NavItem to="/vod"       icon={Film}        label="VOD" />
          <NavItem to="/favorites" icon={Heart}       label="Favorites" />
          {epgEnabled && <NavItem to="/guide"    icon={BookOpen}    label="Guide" />}
          {epgEnabled && <NavItem to="/epg-grid" icon={LayoutGrid}  label="EPG Grid" />}
        </nav>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {connected && <IdleBadge idleInfo={idleInfo} />}
        {connected && <KeepaliveBadge lastPingAt={lastPingAt} />}
        {connected && (
          <ReminderBell reminders={reminders} onRemove={removeReminder} />
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              connected ? 'bg-[var(--color-success)]' : 'bg-[var(--color-surface-2)]'
            )}
          />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <NavItem to="/settings" icon={Settings} label="Profiles" />
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
  const [showAdult, setShowAdult]   = useState(false)
  const [disabledGenres, setDisabledGenres] = useState(new Set())
  const [lastPingAt, setLastPingAt] = useState(null)
  const [idleInfo, setIdleInfo] = useState(null) // { lastActivityAt, idleTimeoutMs }

  useEffect(() => {
    async function load() {
      try {
        const [status, settings] = await Promise.all([getStatus(), getSettings()])
        setConnected(status.connected)
        setEpgEnabled(settings.epg_enabled !== false)
        setShowAdult(!!settings.show_adult)
        setDisabledGenres(new Set(settings.disabled_genres ?? []))
        if (status.watchdog?.lastPingAt) setLastPingAt(status.watchdog.lastPingAt)
        if (status.lastActivityAt) setIdleInfo({ lastActivityAt: status.lastActivityAt, idleTimeoutMs: status.idleTimeoutMs })
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
        if (s.watchdog?.lastPingAt) setLastPingAt(s.watchdog.lastPingAt)
        else if (!s.connected) setLastPingAt(null)
        if (s.lastActivityAt) setIdleInfo({ lastActivityAt: s.lastActivityAt, idleTimeoutMs: s.idleTimeoutMs })
        else if (!s.connected) setIdleInfo(null)
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
    <AppContext.Provider value={{ connected, setConnected, epgEnabled, setEpgEnabled, showAdult, setShowAdult, disabledGenres, setDisabledGenres, setLastPingAt, setIdleInfo }}>
      <TooltipProvider delayDuration={300}>
        <TopNav connected={connected} epgEnabled={epgEnabled} lastPingAt={lastPingAt} idleInfo={idleInfo} />
        <main className="pt-14 min-h-full">
          <Suspense fallback={<div className="flex h-48 items-center justify-center"><Loader2 size={24} className="animate-spin text-[var(--color-primary-light)]" /></div>}>
          <Routes>
            <Route path="/settings" element={<SetupPage />} />
            <Route path="/profiles" element={<ProfilesPage />} />
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
              path="/epg-grid"
              element={
                <RequireAuth connected={connected}>
                  <EpgGridPage />
                </RequireAuth>
              }
            />
            <Route
              path="/vod"
              element={
                <RequireAuth connected={connected}>
                  <VodPage />
                </RequireAuth>
              }
            />
            <Route
              path="/vod-player"
              element={
                <RequireAuth connected={connected}>
                  <VodPlayerPage />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={<Navigate to={connected ? '/channels' : '/settings'} replace />}
            />
          </Routes>
          </Suspense>
        </main>
      </TooltipProvider>
    </AppContext.Provider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppInner />
        <ToastHost />
      </ErrorBoundary>
    </BrowserRouter>
  )
}
