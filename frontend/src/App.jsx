import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { getStatus } from './stalkerApi'
import SetupPage from './pages/SetupPage'
import ChannelsPage from './pages/ChannelsPage'
import GroupsPage from './pages/GroupsPage'
import GuidePage from './pages/GuidePage'
import PlayerPage from './pages/PlayerPage'

function Topbar({ status }) {
  return (
    <header className="topbar">
      <div className="topbar-logo">Stalker<span>Web</span></div>
      <div className="topbar-status">
        <span className={`status-dot ${status?.connected ? 'connected' : ''}`} />
        {status?.connected
          ? <span>Connected · <strong>{status.portal}</strong></span>
          : <span>Not connected</span>}
      </div>
    </header>
  )
}

function Sidebar({ connected }) {
  const item = (to, icon, label) => (
    <NavLink to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      {label}
    </NavLink>
  )

  return (
    <nav className="sidebar">
      <div className="sidebar-section">Portal</div>
      {item('/setup', '⚙️', 'Setup')}
      {connected && (
        <>
          <div className="sidebar-section">Watch</div>
          {item('/groups', '🗂️', 'Groups')}
          {item('/channels', '📺', 'Channels')}
          {item('/guide', '📋', 'Guide')}
          {item('/player', '▶️', 'Player')}
        </>
      )}
    </nav>
  )
}

export default function App() {
  const [status, setStatus] = useState(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getStatus()
      setStatus(s)
    } catch {
      setStatus({ connected: false })
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const id = setInterval(refreshStatus, 15000)
    return () => clearInterval(id)
  }, [refreshStatus])

  const connected = !!status?.connected

  return (
    <BrowserRouter>
      <div className="layout">
        <Topbar status={status} />
        <Sidebar connected={connected} />
        <main className="layout-main">
          <Routes>
            <Route path="/" element={<Navigate to={connected ? '/channels' : '/setup'} replace />} />
            <Route path="/setup" element={<SetupPage onConnect={refreshStatus} status={status} />} />
            <Route path="/groups"   element={connected ? <GroupsPage />   : <Navigate to="/setup" />} />
            <Route path="/channels" element={connected ? <ChannelsPage /> : <Navigate to="/setup" />} />
            <Route path="/guide" element={connected ? <GuidePage /> : <Navigate to="/setup" />} />
            <Route path="/player" element={connected ? <PlayerPage /> : <Navigate to="/setup" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
