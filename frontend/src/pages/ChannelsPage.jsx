import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getChannels, getGroups, getStreamUrl } from '../stalkerApi'

function ChannelLogo({ src, name }) {
  const [err, setErr] = useState(false)
  if (err || !src) return <div className="channel-logo-fallback">📺</div>
  return <img className="channel-logo" src={src} alt={name} onError={() => setErr(true)} />
}

export default function ChannelsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [channels, setChannels] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const activeGroup = searchParams.get('group') || null

  const setActiveGroup = (id) => {
    if (id) setSearchParams({ group: id })
    else setSearchParams({})
  }

  const load = useCallback(async (groupId) => {
    setLoading(true)
    setError(null)
    try {
      const [chData, grData] = await Promise.all([getChannels(groupId), getGroups()])
      setChannels(chData.channels || [])
      setGroups(grData.groups || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(activeGroup) }, [activeGroup, load])

  const handlePlay = async (ch) => {
    try {
      const { streamUrl } = await getStreamUrl(ch.uniqueId)
      sessionStorage.setItem('sw_stream', JSON.stringify({ url: streamUrl, name: ch.name }))
      navigate('/player')
    } catch (e) {
      alert(`Could not resolve stream: ${e.message}`)
    }
  }

  const filtered = channels.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <input
          placeholder="Search channels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 210, flexShrink: 0 }}
        />

        <div className="pill-group">
          <button
            className={`pill${activeGroup === null ? ' active' : ''}`}
            onClick={() => setActiveGroup(null)}
          >
            All
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              className={`pill${activeGroup === g.id ? ' active' : ''}`}
              onClick={() => setActiveGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
          {loading ? '…' : `${filtered.length} channels`}
        </span>
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
        <div className="channel-grid">
          {filtered.map((ch) => (
            <div
              key={ch.uniqueId}
              className="channel-card"
              onClick={() => handlePlay(ch)}
              title={`Ch ${ch.number} · Click to play`}
            >
              <ChannelLogo src={ch.iconPath} name={ch.name} />
              <div className="channel-num">Ch {ch.number}</div>
              <div className="channel-name">{ch.name}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)',
              paddingTop: 60, fontSize: 14 }}>
              No channels found.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
