import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Hls from 'hls.js'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  List, Search, Loader2, AlertCircle, Tv2, Heart, ChevronDown,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { isAdult } from '@/lib/adultFilter'
import { pushRecentlyWatched } from '@/lib/recentlyWatched'
import { getStreamUrl, streamKeepalive, getProxiedLogoUrl, getNowNext } from '../stalkerApi'
import { useApp } from '@/lib/appContext'
import { ChannelLogo } from '@/components/ChannelLogo'
import { useFavorites } from '@/lib/useFavorites'
import { getCachedChannelData } from '@/lib/channelCache'

// ── Controls bar ──────────────────────────────────────────────────────────
function Controls({ playing, muted, volume, isFullscreen, channelName, onPlayPause, onMute, onVolume, onFullscreen, onToggleList }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
      <div className="flex items-center gap-2">
        <button onClick={onPlayPause} className="text-white/90 hover:text-white transition-colors p-1" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <div className="flex items-center gap-2 group/vol">
          <button onClick={onMute} className="text-white/90 hover:text-white transition-colors p-1">
            {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200">
            <Slider min={0} max={100} step={1} value={[muted ? 0 : volume]} onValueChange={([v]) => onVolume(v)} className="w-20" />
          </div>
        </div>
        <Badge variant="live" className="ml-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" />LIVE</Badge>
      </div>
      <div className="flex-1 text-center">
        <span className="text-sm font-medium text-white/90 truncate">{channelName}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-white/50 mr-2 hidden sm:block">
        Space·F·M·↑↓ ch
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onToggleList} className="text-white/80 hover:text-white transition-colors p-1.5 rounded hover:bg-white/10" aria-label="Toggle channel list">
          <List size={18} />
        </button>
        <button onClick={onFullscreen} className="text-white/80 hover:text-white transition-colors p-1.5 rounded hover:bg-white/10" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
    </div>
  )
}

// ── Virtual list hook ─────────────────────────────────────────────────────
const ROW_H = 48

function useVirtualList(items, containerRef, overscan = 3) {
  const [containerHeight, setContainerHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height))
    ro.observe(el)
    setContainerHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [containerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef])

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - overscan)
  const endIndex   = Math.min(items.length - 1, Math.ceil((scrollTop + containerHeight) / ROW_H) + overscan)
  return {
    visibleItems: items.slice(startIndex, endIndex + 1),
    totalHeight:  items.length * ROW_H,
    offsetY:      startIndex * ROW_H,
  }
}

// ── Channel list panel ────────────────────────────────────────────────────
function ChannelList({ channels, activeId, logoMap, favoriteIds, groups, nowNext, onSelect, onToggleFavorite }) {
  const [query, setQuery]         = useState('')
  const [activeGroup, setGroup]   = useState('')
  const [favsOnly, setFavsOnly]   = useState(false)
  const scrollRef = useRef(null)

  const filtered = useMemo(() => channels.filter(ch => {
    if (favsOnly && !favoriteIds.has(String(ch.uniqueId))) return false
    if (activeGroup && String(ch.genreId ?? '') !== String(activeGroup)) return false
    if (query && !ch.name?.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [channels, favsOnly, favoriteIds, activeGroup, query])

  const { visibleItems, totalHeight, offsetY } = useVirtualList(filtered, scrollRef)

  function selectGroup(id) {
    setGroup(id)
    if (id) setFavsOnly(false)
  }

  function toggleFavsOnly() {
    setFavsOnly(v => !v)
    if (!favsOnly) setGroup('')
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border-l border-[var(--color-border)]">

      {/* ── Search + favs toggle ── */}
      <div className="p-3 pb-2 border-b border-[var(--color-border)] flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
            <input
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] pl-7 pr-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none focus:border-[var(--color-primary-light)]"
            />
          </div>
          <button
            onClick={toggleFavsOnly}
            title={favsOnly ? 'Show all channels' : 'Show favorites only'}
            className={cn(
              'shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors',
              favsOnly
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
            )}
          >
            <Heart size={11} fill={favsOnly ? 'currentColor' : 'none'} />
            Favs
          </button>
        </div>

        {/* ── Genre dropdown ── */}
        {groups.length > 0 && (
          <div className="relative">
            <select
              value={activeGroup}
              onChange={e => selectGroup(e.target.value)}
              className="w-full appearance-none rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] pl-2.5 pr-7 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)] cursor-pointer"
            >
              <option value="">All Genres</option>
              {groups.map(g => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          </div>
        )}
      </div>

      {/* ── Channel rows (virtualized) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-[var(--color-muted)] text-center">
            {favsOnly ? 'No favorites in this view.' : 'No channels found.'}
          </p>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              {visibleItems.map(ch => {
                const isFav = favoriteIds.has(String(ch.uniqueId))
                const epg   = nowNext?.[String(ch.uniqueId)]
                return (
                  <div
                    key={ch.uniqueId}
                    style={{ height: ROW_H }}
                    className={cn('group flex items-center gap-2.5 px-3 transition-colors overflow-hidden',
                      String(ch.uniqueId) === String(activeId)
                        ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary-light)]'
                        : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                    )}
                  >
                    <button className="flex items-center gap-2.5 flex-1 text-left min-w-0 h-full" onClick={() => onSelect(ch)}>
                      <ChannelLogo src={logoMap[String(ch.uniqueId)] || getProxiedLogoUrl(ch.iconPath)} name={ch.name} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">{ch.name}</p>
                        {epg?.now?.title && (
                          <p className="text-[10px] text-[var(--color-muted)] truncate leading-tight opacity-75">{epg.now.title}</p>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => onToggleFavorite(ch)}
                      className={cn('shrink-0 p-0.5 rounded transition-colors', isFav ? 'text-rose-500' : 'text-[var(--color-muted)] opacity-0 group-hover:opacity-100 hover:text-rose-400')}
                    >
                      <Heart size={12} fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Player page ───────────────────────────────────────────────────────────
export default function PlayerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initChannelId   = searchParams.get('channel')
  const initChannelName = searchParams.get('name') ? decodeURIComponent(searchParams.get('name')) : ''

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const hideTimer    = useRef(null)
  const retryCount   = useRef(0)

  const [channels, setChannels]       = useState([])
  const [groups, setGroups]           = useState([])
  const [logoMap, setLogoMap]         = useState({})
  const [nowNext, setNowNext]         = useState({})
  const { showAdult, disabledGenres }  = useApp()
  const { favoriteIds, toggleFavorite } = useFavorites()

  const [muted, setMuted]           = useState(false)
  const [volume, setVolume]         = useState(80)
  const channelsRef      = useRef([])
  const activeChannelRef = useRef(null)
  const selectChannelRef = useRef(null)
  const volumeRef        = useRef(volume)
  const mutedRef         = useRef(muted)
  const [activeChannel, setActiveChannel] = useState(
    initChannelId ? { uniqueId: initChannelId, name: initChannelName } : null
  )
  const [streamUrl, setStreamUrl]   = useState(null)
  const [status, setStatus]         = useState('idle')
  const [errorMsg, setErrorMsg]     = useState('')
  const [showControls, setShowControls] = useState(true)
  const [showList, setShowList]     = useState(true)
  const [playing, setPlaying]       = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => { channelsRef.current = channels }, [channels])
  useEffect(() => { activeChannelRef.current = activeChannel }, [activeChannel])

  useEffect(() => {
    getNowNext().then(setNowNext).catch(() => {})
  }, [])

  useEffect(() => {
    getCachedChannelData()
      .then(({ channels: chList, groups: gList, logoMap: lm }) => {
        let ch = chList
        let gr = gList.filter(g => g.name?.toLowerCase() !== 'all')

        if (!showAdult) {
          ch = ch.filter(c => !isAdult(c.genre) && !isAdult(c.name))
          gr = gr.filter(g => !isAdult(g.name))
        }

        if (disabledGenres.size > 0) {
          ch = ch.filter(c => !c.genre || !disabledGenres.has(c.genre))
          gr = gr.filter(g => !disabledGenres.has(g.name))
        }

        setChannels(ch)
        setGroups(gr)
        setLogoMap(lm)
      })
      .catch(() => {})
  }, [showAdult, disabledGenres])

  // loadStream as a proper useCallback so deps are explicit
  const loadStream = useCallback(async (channelId, isRetry = false) => {
    setStatus('loading')
    setErrorMsg('')
    try {
      const { streamUrl: url } = await getStreamUrl(channelId)
      setStreamUrl(url)
      const ch = channels.find(c => String(c.uniqueId) === String(channelId)) || activeChannel
      if (ch) pushRecentlyWatched(ch, logoMap[String(ch.uniqueId)])
    } catch (e) {
      if (!isRetry && retryCount.current < 1) {
        retryCount.current++
        setErrorMsg('Stream unavailable, retrying…')
        setTimeout(() => loadStreamRef.current(channelId, true), 2000)
      } else {
        setStatus('error')
        setErrorMsg(e.message)
      }
    }
  }, [channels, activeChannel, logoMap])

  const loadStreamRef = useRef(loadStream)
  useEffect(() => { loadStreamRef.current = loadStream }, [loadStream])

  useEffect(() => {
    if (!activeChannel?.uniqueId) return
    retryCount.current = 0
    loadStreamRef.current(activeChannel.uniqueId)
  }, [activeChannel?.uniqueId])

  // Attach HLS when streamUrl changes
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return
    const video = videoRef.current

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const tryPlay = () =>
      video.play()
        .then(() => { setStatus('playing'); setPlaying(true) })
        .catch(() => {
          // Browsers always allow muted autoplay — retry muted so stream starts.
          // Sync React state so the UI mute icon matches the DOM.
          video.muted = true
          setMuted(true)
          return video.play()
            .then(() => { setStatus('playing'); setPlaying(true) })
            .catch(() => { setStatus('paused'); setPlaying(false) })
        })

    const playNative = (src) => {
      video.src = src
      video.volume = volumeRef.current / 100
      video.muted = mutedRef.current
      tryPlay()
    }

    // MP4 and other non-HLS formats — use native video element directly
    const isNativeFormat = /\.(mp4|mkv|avi|mov|webm|ts)(\?|$)/i.test(streamUrl)
    if (isNativeFormat) {
      playNative(streamUrl)
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.volume = volumeRef.current / 100
        video.muted = mutedRef.current
        tryPlay()
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryCount.current < 1) {
            retryCount.current++
            hls.recoverMediaError()
          } else if (retryCount.current < 1) {
            retryCount.current++
            // HLS parse failed — try native playback as fallback
            hls.destroy()
            hlsRef.current = null
            playNative(streamUrl)
          } else {
            setStatus('error'); setErrorMsg('Stream error. Try reloading.')
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      playNative(streamUrl)
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [streamUrl])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = volume / 100
    videoRef.current.muted = muted
  }, [volume, muted])

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  useEffect(() => { resetHideTimer(); return () => clearTimeout(hideTimer.current) }, [resetHideTimer])

  // Fullscreen sync
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Keepalive — ping backend every 10 minutes while playing to prevent idle disconnect.
  // The idle timer is 30 minutes; 10-minute pings keep it from ever firing mid-stream.
  useEffect(() => {
    if (status !== 'playing') return
    const id = setInterval(() => { streamKeepalive().catch(() => {}) }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [status])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlayPause()
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'KeyM':
          e.preventDefault()
          setMuted(m => !m)
          break
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          const delta = e.code === 'ArrowUp' ? -1 : 1
          const list  = channelsRef.current
          const cur   = activeChannelRef.current
          if (!list.length) break
          const idx  = cur ? list.findIndex(c => String(c.uniqueId) === String(cur.uniqueId)) : -1
          const next = list[(idx + delta + list.length) % list.length]
          if (next) selectChannelRef.current(next)
          break
        }
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function togglePlayPause() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play()
        .then(() => { setPlaying(true); setStatus('playing') })
        .catch(() => {
          v.muted = true
          v.play()
            .then(() => { setPlaying(true); setStatus('playing') })
            .catch(() => {})
        })
    } else {
      v.pause()
      setPlaying(false)
      setStatus('paused')
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen()
    else document.exitFullscreen()
  }

  function selectChannel(ch) {
    setActiveChannel(ch)
    setSearchParams({ channel: ch.uniqueId, name: encodeURIComponent(ch.name) })
  }
  selectChannelRef.current = selectChannel

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-black">
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center bg-black"
        onMouseMove={resetHideTimer}
        onMouseLeave={() => clearTimeout(hideTimer.current)}
        onClick={togglePlayPause}
      >
        <video ref={videoRef} className="w-full h-full object-contain" playsInline />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 size={40} className="text-[var(--color-primary-light)] animate-spin" />
            {errorMsg && <p className="absolute mt-16 text-xs text-white/60">{errorMsg}</p>}
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <AlertCircle size={40} className="text-[var(--color-live)]" />
            <p className="text-sm text-white/80">{errorMsg}</p>
            {activeChannel && (
              <button
                onClick={(e) => { e.stopPropagation(); retryCount.current = 0; loadStream(activeChannel.uniqueId) }}
                className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-sm hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {status === 'paused' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/50 p-5">
              <Play size={36} className="text-white" fill="currentColor" />
            </div>
          </div>
        )}

        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Tv2 size={48} className="text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-muted)]">Select a channel to start watching</p>
          </div>
        )}

        <div
          className={cn('absolute bottom-0 inset-x-0 transition-opacity duration-300', showControls || status !== 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none')}
          onClick={e => e.stopPropagation()}
        >
          <Controls
            playing={playing} muted={muted} volume={volume} isFullscreen={isFullscreen}
            channelName={activeChannel?.name || initChannelName || 'No channel selected'}
            onPlayPause={togglePlayPause}
            onMute={() => setMuted(m => !m)}
            onVolume={(v) => { setVolume(v); setMuted(false) }}
            onFullscreen={toggleFullscreen}
            onToggleList={() => setShowList(v => !v)}
          />
        </div>
      </div>

      <div className={cn('transition-all duration-300 overflow-hidden shrink-0', showList ? 'w-72' : 'w-0')}>
        {channels.length > 0 && (
          <ChannelList
            channels={channels} activeId={activeChannel?.uniqueId}
            logoMap={logoMap} favoriteIds={favoriteIds}
            groups={groups} nowNext={nowNext}
            onSelect={selectChannel} onToggleFavorite={toggleFavorite}
          />
        )}
      </div>
    </div>
  )
}
