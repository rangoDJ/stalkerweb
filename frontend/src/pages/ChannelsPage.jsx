import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Tv2, AlertCircle, RefreshCw, Heart, Clock, X, Image } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isAdult } from '@/lib/adultFilter'
import { SkeletonGrid } from '@/components/ui/skeleton'
import { getChannelProgress, getProxiedLogoUrl, getNowNext, addLogoOverride, getLogoMap } from '../stalkerApi'
import { getRecentlyWatched, removeRecentlyWatched } from '@/lib/recentlyWatched'
import { useApp } from '@/lib/appContext'
import { getCachedChannelData, subscribeChannelUpdates } from '@/lib/channelCache'
import { useFavorites } from '@/lib/useFavorites'

// ── Channel card ──────────────────────────────────────────────────────────
function ChannelCard({ channel, logoUrl, isFavorite, onToggleFavorite, onClick, onSetLogo, compact, nowNext }) {
  const [imgError, setImgError] = useState(false)
  const logo = logoUrl || getProxiedLogoUrl(channel.iconPath) || ''

  const epgProgress = nowNext?.now
    ? Math.min(100, Math.round(((Math.floor(Date.now() / 1000) - nowNext.now.startTime) /
        (nowNext.now.endTime - nowNext.now.startTime)) * 100))
    : 0

  if (compact) {
    return (
      <button
        onClick={() => onClick(channel)}
        className="group relative flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-left transition-all duration-200 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)] cursor-pointer w-20 shrink-0"
      >
        <div className="relative group/logo flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] overflow-hidden">
          {logo && !imgError
            ? <img src={logo} alt={channel.name} loading="lazy" onError={() => setImgError(true)} className="h-full w-full object-contain p-0.5" />
            : <Tv2 size={18} className="text-[var(--color-muted)]" />}
          {onSetLogo && (
            <button
              onClick={e => { e.stopPropagation(); onSetLogo(channel) }}
              className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity"
              aria-label="Set logo"
            >
              <Image size={12} className="text-white" />
            </button>
          )}
        </div>
        <p className="text-[10px] font-medium text-[var(--color-text)] leading-tight text-center break-words line-clamp-2 w-full">{channel.name}</p>
      </button>
    )
  }

  return (
    <button
      onClick={() => onClick(channel)}
      className="group relative flex flex-col items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 text-left transition-all duration-200 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)] hover:shadow-[0_0_16px_var(--color-primary-glow)] cursor-pointer"
    >
      <button
        onClick={e => { e.stopPropagation(); onToggleFavorite(channel) }}
        className={cn('absolute top-2 right-2 p-1 rounded transition-colors',
          isFavorite ? 'text-rose-500' : 'text-[var(--color-muted)] opacity-0 group-hover:opacity-100 hover:text-rose-400')}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="relative group/logo flex h-16 w-16 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] overflow-hidden">
        {logo && !imgError
          ? <img src={logo} alt={channel.name} loading="lazy" onError={() => setImgError(true)} className="h-full w-full object-contain p-1" />
          : <Tv2 size={28} className="text-[var(--color-muted)]" />}
        {onSetLogo && (
          <button
            onClick={e => { e.stopPropagation(); onSetLogo(channel) }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/logo:opacity-100 transition-opacity"
            aria-label="Set logo"
          >
            <Image size={16} className="text-white" />
          </button>
        )}
      </div>
      <div className="w-full text-center">
        <p className="text-xs text-[var(--color-muted)] mb-0.5">Ch {channel.number}</p>
        <p className="text-sm font-medium text-[var(--color-text)] leading-tight break-words">{channel.name}</p>
      </div>
      {nowNext?.now && (
        <div className="w-full mt-0.5 pt-2 border-t border-[var(--color-border)]">
          <p className="text-[10px] font-medium text-[var(--color-primary-light)] leading-tight truncate text-left">{nowNext.now.title}</p>
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-[var(--color-surface-3)] overflow-hidden">
            <div className="h-full rounded-full bg-[var(--color-primary)] transition-none" style={{ width: `${epgProgress}%` }} />
          </div>
          {nowNext.next && (
            <p className="mt-1 text-[9px] text-[var(--color-muted)] truncate text-left">Next: {nowNext.next.title}</p>
          )}
        </div>
      )}
    </button>
  )
}

// ── Number jump overlay ───────────────────────────────────────────────────
function NumberJumpOverlay({ digits }) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1 pointer-events-none">
      <div className="rounded-[var(--radius-md)] bg-black/80 border border-[var(--color-border)] px-6 py-3 text-center backdrop-blur-sm">
        <p className="text-xs text-[var(--color-muted)] mb-1">Jump to channel</p>
        <p className="text-3xl font-bold font-mono text-[var(--color-primary-light)] tracking-widest">{digits}</p>
      </div>
    </div>
  )
}

export default function ChannelsPage() {
  const navigate = useNavigate()
  const { showAdult, disabledGenres } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rawData, setRawData]         = useState(null) // unfiltered snapshot from cache
  const [channels, setChannels]       = useState([])
  const [groups, setGroups]           = useState([])
  const [logoMap, setLogoMap]         = useState({})
  const { favoriteIds, toggleFavorite } = useFavorites()
  const [loading, setLoading]         = useState(true)  // true only before first data arrives
  const [error, setError]             = useState(null)
  const [progress, setProgress]       = useState(null) // { loading, page, totalPages, channelCount }
  const [recentlyWatched, setRecentlyWatched] = useState([])
  const [nowNext, setNowNext] = useState({})

  // Logo assignment modal
  const [logoChannel, setLogoChannel] = useState(null)
  const [logoUrl, setLogoUrl]         = useState('')
  const [logoSaving, setLogoSaving]   = useState(false)

  // Channel number jump
  const [jumpDigits, setJumpDigits]   = useState('')
  const jumpTimer                     = useRef(null)

  const activeGroup = searchParams.get('group') || ''
  const [query, setQuery] = useState('')
  const pillsRef = useRef(null)

  useEffect(() => {
    const el = pillsRef.current
    if (!el) return
    const onWheel = e => { e.preventDefault(); el.scrollLeft += e.deltaY }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    setRecentlyWatched(getRecentlyWatched())
    getNowNext().then(setNowNext).catch(() => {})
  }, [])

  // Effect 1: fetch initial (possibly partial) data + subscribe to full-data updates.
  // Runs once on mount.  The subscription fires later when the backend finishes
  // loading all channels, so the grid populates on the fly without blocking.
  useEffect(() => {
    let progressTimer
    let cancelled = false

    async function pollProgress() {
      try {
        const p = await getChannelProgress()
        if (cancelled) return
        setProgress(p)
        if (p.loading) progressTimer = setTimeout(pollProgress, 800)
      } catch { /* progress polling is best-effort */ }
    }

    getCachedChannelData()
      .then(data => {
        if (cancelled) return
        setRawData(data)
        setLoading(false)
        if (data.loading) pollProgress()   // backend still loading — track progress
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    // Subscribe so the grid updates automatically when the full channel list arrives
    const unsub = subscribeChannelUpdates(data => {
      if (cancelled) return
      setRawData(data)
      setProgress(p => p ? { ...p, loading: false } : null)
    })

    return () => { cancelled = true; clearTimeout(progressTimer); unsub() }
  }, [])

  // Effect 2: re-apply adult/genre filters whenever raw data or filter settings change.
  useEffect(() => {
    if (!rawData) return
    let ch = rawData.channels
    let gr = rawData.groups.filter(g => g.name?.toLowerCase() !== 'all')

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
    setLogoMap(rawData.logoMap)
  }, [rawData, showAdult, disabledGenres])

  const openChannel = useCallback((channel) => {
    navigate(`/player?channel=${channel.uniqueId}&name=${encodeURIComponent(channel.name)}`)
  }, [navigate])

  // ── Keyboard: channel number jump ────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') { setJumpDigits(''); clearTimeout(jumpTimer.current); return }
      if (!/^\d$/.test(e.key)) return

      setJumpDigits(prev => {
        const next = (prev + e.key).slice(-4) // max 4 digits
        clearTimeout(jumpTimer.current)
        jumpTimer.current = setTimeout(() => {
          const num = parseInt(next, 10)
          const ch = channels.find(c => c.number === num)
          if (ch) openChannel(ch)
          setJumpDigits('')
        }, 1200)
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(jumpTimer.current) }
  }, [channels, openChannel])

  function removeRecentChannel(uniqueId) {
    removeRecentlyWatched(uniqueId)
    setRecentlyWatched(prev => prev.filter(c => String(c.uniqueId) !== String(uniqueId)))
  }

  async function handleSaveLogo() {
    if (!logoChannel || !logoUrl.trim()) return
    setLogoSaving(true)
    try {
      await addLogoOverride(logoChannel.name, logoUrl.trim())
      const map = await getLogoMap()
      setLogoMap(map)
      setLogoChannel(null)
      setLogoUrl('')
    } catch { /* best effort */ }
    setLogoSaving(false)
  }

  const filtered = useMemo(() => {
    let result = channels
    if (activeGroup) result = result.filter(c => String(c.genreId ?? '') === String(activeGroup))
    if (!query.trim()) return result
    const q = query.toLowerCase()
    return result.filter(c => c.name?.toLowerCase().includes(q))
  }, [channels, activeGroup, query])

  function selectGroup(id) {
    setQuery('')
    if (id) setSearchParams({ group: id })
    else setSearchParams({})
  }

  // Enrich recently watched with current logoMap
  const recentChannels = useMemo(() =>
    recentlyWatched.map(r => ({
      ...r,
      logoUrl: logoMap[r.uniqueId] || r.logo,
    })).slice(0, 10),
    [recentlyWatched, logoMap]
  )

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Number jump overlay */}
      {jumpDigits && <NumberJumpOverlay digits={jumpDigits} />}

      {/* Sticky filter bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)]/90 backdrop-blur-sm border-b border-[var(--color-border)] px-6 py-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
            <Input placeholder="Search channels…" value={query} onChange={e => setQuery(e.target.value)} className="pl-9 py-5" />
          </div>
          <span className="shrink-0 text-sm font-medium text-[var(--color-muted)] bg-[var(--color-surface-2)] px-3 py-1 rounded-md">
            {filtered.length} {filtered.length === 1 ? 'channel' : 'channels'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => selectGroup('')}
            className={cn('px-4 py-1.5 rounded-full text-sm font-semibold transition-all shadow-sm',
              !activeGroup ? 'bg-[var(--color-primary)] text-white ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-bg)]' : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-3)]')}
          >All</button>
          {groups.map(g => (
            <button key={g.id} onClick={() => selectGroup(g.id)}
              className={cn('px-4 py-1.5 rounded-full text-sm font-semibold transition-all shadow-sm whitespace-nowrap',
                activeGroup === String(g.id) ? 'bg-[var(--color-primary)] text-white ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-bg)]' : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-3)]')}
            >{g.name}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

        {/* Recently watched */}
        {recentChannels.length > 0 && !query && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-[var(--color-muted)]" />
              <span className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Recently Watched</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {recentChannels.map(r => (
                <div key={r.uniqueId} className="relative group/recent shrink-0">
                  <ChannelCard
                    channel={{ uniqueId: r.uniqueId, name: r.name, number: r.number }}
                    logoUrl={r.logoUrl}
                    isFavorite={favoriteIds.has(String(r.uniqueId))}
                    onToggleFavorite={ch => toggleFavorite(ch)}
                    onClick={openChannel}
                    onSetLogo={ch => { setLogoChannel(ch); setLogoUrl('') }}
                    compact
                  />
                  <button
                    onClick={() => removeRecentChannel(r.uniqueId)}
                    className="absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-muted)] opacity-0 group-hover/recent:opacity-100 hover:!opacity-100 hover:text-[var(--color-text)] transition-opacity"
                    aria-label="Remove from recently watched"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skeleton — only while waiting for the very first response */}
        {loading && (
          <SkeletonGrid count={12} />
        )}

        {/* Progress bar — shows while backend is still fetching pages (even after first channels appear) */}
        {!loading && progress?.loading && progress.totalPages > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>Loading channels…</span>
              <span>{progress.page} / {progress.totalPages} pages · {progress.channelCount} channels</span>
            </div>
            <div className="h-1 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
                style={{ width: `${Math.round((progress.page / progress.totalPages) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-3 h-48 text-center">
            <AlertCircle size={32} className="text-[var(--color-live)]" />
            <p className="text-sm text-[var(--color-muted)]">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        )}

        {/* Empty state — only shown when loading is truly complete with no results */}
        {!loading && !progress?.loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-48 text-center">
            <Tv2 size={32} className="text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-muted)]">No channels found.</p>
          </div>
        )}

        {/* Channel grid — renders as soon as any channels are available */}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {filtered.map(ch => (
              <ChannelCard
                key={ch.uniqueId} channel={ch}
                logoUrl={logoMap[String(ch.uniqueId)]}
                isFavorite={favoriteIds.has(String(ch.uniqueId))}
                onToggleFavorite={toggleFavorite}
                onClick={openChannel}
                onSetLogo={ch => { setLogoChannel(ch); setLogoUrl('') }}
                nowNext={nowNext[String(ch.uniqueId)]}
              />
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Logo assignment modal */}
    {logoChannel && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLogoChannel(null)}>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-xl w-full max-w-md mx-4 p-5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Set Logo — {logoChannel.name}</h3>
            <button onClick={() => setLogoChannel(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-3">Paste a direct URL to the channel logo image (png, jpg, svg…)</p>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/logo.png"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveLogo() }}
              className="text-xs flex-1"
              autoFocus
            />
            <Button
              onClick={handleSaveLogo}
              disabled={!logoUrl.trim() || logoSaving}
              className="shrink-0 h-9 px-4 text-xs"
            >
              {logoSaving ? <RefreshCw size={14} className="animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    )}
  )
}
