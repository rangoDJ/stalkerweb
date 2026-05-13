import { useState, useEffect, useCallback } from 'react'
import { getChannels, getChannelEpg } from '../stalkerApi'

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function GuidePage() {
  const [channels, setChannels] = useState([])
  const [selected, setSelected] = useState(null)
  const [events, setEvents] = useState([])
  const [loadingCh, setLoadingCh] = useState(true)
  const [loadingEpg, setLoadingEpg] = useState(false)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState(24)

  useEffect(() => {
    async function fetchCh() {
      setLoadingCh(true)
      try {
        const data = await getChannels()
        setChannels(data.channels || [])
        if (data.channels?.length > 0) setSelected(data.channels[0])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoadingCh(false)
      }
    }
    fetchCh()
  }, [])

  const loadEpg = useCallback(async (ch, hrs) => {
    if (!ch) return
    setLoadingEpg(true)
    setEvents([])
    try {
      const data = await getChannelEpg(ch.uniqueId, hrs)
      setEvents(data.events || [])
    } catch (e) {
      setEvents([])
    } finally {
      setLoadingEpg(false)
    }
  }, [])

  useEffect(() => {
    if (selected) loadEpg(selected, period)
  }, [selected, period, loadEpg])

  const nowTs = Math.floor(Date.now() / 1000)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Channel list */}
      <div style={{ width: 200, borderRight: '1px solid var(--border)',
        overflowY: 'auto', background: 'var(--bg-surface)', flexShrink: 0 }}>
        {loadingCh && <div className="centered" style={{ padding: 20 }}><div className="spinner" /></div>}
        {channels.map((ch) => (
          <div
            key={ch.uniqueId}
            onClick={() => setSelected(ch)}
            style={{
              padding: '9px 14px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              background: selected?.uniqueId === ch.uniqueId ? 'rgba(79,156,249,0.1)' : 'transparent',
              color: selected?.uniqueId === ch.uniqueId ? 'var(--accent)' : 'var(--text-primary)',
              fontSize: 13,
              fontWeight: selected?.uniqueId === ch.uniqueId ? 600 : 400,
              transition: 'background 150ms',
            }}
          >
            <span style={{ color: 'var(--text-dim)', fontSize: 11, marginRight: 6 }}>{ch.number}</span>
            {ch.name}
          </div>
        ))}
      </div>

      {/* EPG panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{selected?.name || 'Select a channel'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {[6, 12, 24, 48].map((h) => (
              <button
                key={h}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: 11,
                  ...(period === h ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}
                onClick={() => setPeriod(h)}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Events */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingEpg && <div className="centered" style={{ padding: 40 }}><div className="spinner" /></div>}

          {!loadingEpg && events.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No EPG data available for this channel.
            </div>
          )}

          {!loadingEpg && events.map((ev) => {
            const current = ev.startTime <= nowTs && nowTs < ev.endTime
            return (
              <div key={ev.id} className="epg-event"
                style={{ background: current ? 'rgba(79,156,249,0.06)' : 'transparent' }}>
                <div className="epg-time">
                  {fmtTime(ev.startTime)}
                  {current && <div style={{ color: 'var(--accent)', fontSize: 10 }}>▶ NOW</div>}
                </div>
                <div>
                  <div className="epg-title" style={{ fontWeight: current ? 600 : 400 }}>{ev.title}</div>
                  {ev.description && <div className="epg-desc">{ev.description}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
