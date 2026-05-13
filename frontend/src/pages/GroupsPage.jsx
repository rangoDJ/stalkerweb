import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGroups, getChannels } from '../stalkerApi'

function GroupLogo({ src }) {
  const [err, setErr] = useState(false)
  if (err || !src) return null
  return (
    <img
      src={src}
      alt=""
      className="group-logo-preview"
      onError={() => setErr(true)}
    />
  )
}

function GroupCard({ name, count, previews, onClick }) {
  return (
    <div className="group-card" onClick={onClick}>
      <div className="group-logo-row">
        {previews.slice(0, 4).map((ch) => (
          <GroupLogo key={ch.uniqueId} src={ch.iconPath} />
        ))}
      </div>
      <div className="group-name">{name}</div>
      <div className="group-count">{count} channels</div>
    </div>
  )
}

export default function GroupsPage() {
  const [groups, setGroups]     = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [grData, chData] = await Promise.all([getGroups(), getChannels()])
        if (cancelled) return
        setGroups(grData.groups || [])
        setChannels(chData.channels || [])
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const channelsByGroup = useMemo(() => {
    const map = {}
    for (const ch of channels) {
      if (!ch.tvGenreId) continue
      if (!map[ch.tvGenreId]) map[ch.tvGenreId] = []
      map[ch.tvGenreId].push(ch)
    }
    return map
  }, [channels])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Channel Groups</span>
        {!loading && (
          <span className="badge">{groups.length} genres · {channels.length} channels</span>
        )}
      </div>

      {loading && (
        <div className="centered full-height">
          <div className="spinner" />
        </div>
      )}

      {error && (
        <div style={{ padding: 20 }}>
          <div className="error-banner">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="groups-grid">

          <GroupCard
            name="All Channels"
            count={channels.length}
            previews={channels.slice(0, 4)}
            onClick={() => navigate('/channels')}
          />

          {groups.map((g) => {
            const gChannels = channelsByGroup[g.id] || []
            return (
              <GroupCard
                key={g.id}
                name={g.name}
                count={gChannels.length}
                previews={gChannels.slice(0, 4)}
                onClick={() => navigate(`/channels?group=${g.id}`)}
              />
            )
          })}

        </div>
      )}
    </div>
  )
}
