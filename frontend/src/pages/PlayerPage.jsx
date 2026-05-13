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

  // Restore stream passed from ChannelsPage
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

    // Tear down old HLS instance
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
      // Safari native HLS
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
      setStatusMsg('HLS playback not supported in this browser')
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
        padding: 20, gap: 14, overflow: 'hidden' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>
            {streamInfo?.name || 'Player'}
          </h1>
          {status === 'playing' && <span className="badge">● LIVE</span>}
          {status === 'loading' && <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />}
          {status === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>Error: {statusMsg}</span>
          )}
        </div>

        <div className="player-container">
          <video ref={videoRef} controls style={{ width: '100%', height: '100%' }} />
          {status === 'idle' && (
            <div className="player-overlay">
              <span>Select a channel →</span>
            </div>
          )}
        </div>

        {streamInfo?.url && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', wordBreak: 'break-all' }}>
            <strong>Stream:</strong> {streamInfo.url}
          </div>
        )}
      </div>

      {/* Channel list sidebar */}
      <div style={{ width: 210, borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
        <div style={{ padding: '10px 10px 6px' }}>
          <input
            placeholder="🔍 Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map((ch) => (
            <div
              key={ch.uniqueId}
              onClick={() => handleChannelPlay(ch)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: streamInfo?.name === ch.name ? 'rgba(79,156,249,0.1)' : 'transparent',
                color: streamInfo?.name === ch.name ? 'var(--accent)' : 'var(--text-primary)',
                fontSize: 12.5,
                transition: 'background 140ms',
              }}
            >
              <span style={{ color: 'var(--text-dim)', marginRight: 6, fontSize: 11 }}>{ch.number}</span>
              {ch.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
