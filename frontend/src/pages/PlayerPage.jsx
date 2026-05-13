import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { getChannels, getStreamUrl } from '../stalkerApi'

export default function PlayerPage() {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [streamInfo, setStreamInfo] = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | playing | error
  const [statusMsg, setStatusMsg] = useState('')
  const [channels, setChannels] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('sw_stream')
    if (raw) {
      try {
        const info = JSON.parse(raw)
        sessionStorage.removeItem('sw_stream')
        setStreamInfo(info)
      } catch (_) {}
    }

    async function fetchCh() {
      try {
        const data = await getChannels()
        setChannels(data.channels || [])
      } catch (_) {}
    }
    fetchCh()
  }, [])

  useEffect(() => {
    if (!streamInfo?.url) return
    loadStream(streamInfo.url)
  }, [streamInfo])

  function loadStream(url) {
    const video = videoRef.current
    if (!video) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    setStatus('loading')
    setStatusMsg('')

    if (Hls.isSupported()) {
      const hls = new Hls({ debug: false, enableWorker: true })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('playing')
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setStatus('error')
          setStatusMsg(data.type + ': ' + data.details)
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.addEventListener('loadedmetadata', () => {
        setStatus('playing')
        video.play().catch(() => {})
      }, { once: true })
      video.addEventListener('error', () => {
        setStatus('error')
        setStatusMsg('Native HLS error')
      }, { once: true })
    } else {
      setStatus('error')
      setStatusMsg('HLS not supported in this browser')
    }
  }

  const handleChannelPlay = async (ch) => {
    setStatus('loading')
    setStatusMsg('')
    try {
      const { streamUrl } = await getStreamUrl(ch.uniqueId)
      setStreamInfo({ url: streamUrl, name: ch.name })
    } catch (e) {
      setStatus('error')
      setStatusMsg(e.message)
    }
  }

  const filtered = channels.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Video panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        padding: '20px 22px', gap: 14, overflow: 'auto', minWidth: 0 }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text-primary)' }}>
            {streamInfo?.name || 'Player'}
          </h1>
          {status === 'playing' && <span className="badge live">● LIVE</span>}
          {status === 'loading' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Loading stream…
            </span>
          )}
          {status === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>
              ✕ {statusMsg}
            </span>
          )}
        </div>

        <div className="player-container">
          <video ref={videoRef} controls style={{ width: '100%', height: '100%' }} />
          {status === 'idle' && (
            <div className="player-overlay">
              <span style={{ opacity: 0.5 }}>▶</span>
              Select a channel to play
            </div>
          )}
        </div>

        {streamInfo?.url && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            wordBreak: 'break-all',
            fontFamily: 'Menlo, Consolas, monospace',
            padding: '8px 12px',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}>
            {streamInfo.url}
          </div>
        )}
      </div>

      {/* Channel list */}
      <div style={{
        width: 220,
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)' }}>
          <input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 12.5, padding: '7px 11px' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map((ch) => {
            const active = streamInfo?.name === ch.name
            return (
              <div
                key={ch.uniqueId}
                onClick={() => handleChannelPlay(ch)}
                style={{
                  padding: '9px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: active ? 'rgba(91,142,240,0.1)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: 12.5,
                  transition: 'background 120ms',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: active ? 'var(--accent)' : 'var(--text-dim)', fontSize: 10.5,
                  fontVariantNumeric: 'tabular-nums', width: 26, flexShrink: 0 }}>
                  {ch.number}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.name}
                </span>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
              No channels
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
