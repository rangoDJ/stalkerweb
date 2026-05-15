import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Tv2, AlertCircle, RefreshCw, Heart, Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getChannels, getGroups, getLogoMap, getFavorites, addFavoriteChannel, removeFavoriteChannel, getChannelProgress } from '../stalkerApi'
import { getRecentlyWatched } from './PlayerPage'
import { useApp } from '../App'

// ── Channel card ──────────────────────────────────────────────────────────
function ChannelCard({ channel, logoUrl, isFavorite, onToggleFavorite, onClick, compact }) {
  const [imgError, setImgError] = useState(false)
  const logo = logoUrl || channel.iconPath || ''

  if (compact) {
    return (
      <button
        onClick={() => onClick(channel)}
        className="group relative flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-left transition-all duration-200 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)] cursor-pointer w-20 shrink-0"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] overflow-hidden">
          {logo && !imgError
            ? <img src={logo} alt={channel.name} onError={() => setImgError(true)} className="h-full w-full object-contain p-0.5" />
            : <Tv2 size={18} className="text-[var(--color-muted)]" />}
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
      <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] overflow-hidden">
        {logo && !imgError
          ? <img src={logo} alt={channel.name} onError={() => setImgError(true)} className="h-full w-full object-contain p-1" />
          : <Tv2 size={28} className="text-[var(--color-muted)]" />}
      </div>
      <div className="w-full text-center">
        <p className="text-xs text-[var(--color-muted)] mb-0.5">Ch {channel.number}</p>
        <p className="text-sm font-medium text-[var(--color-text)] leading-tight break-words">{channel.name}</p>
      </div>
    </button>
  )
}

// ── Number jump overlay ───────────────────────────────────────────────────
function NumberJumpOverlay({ digits, onClose }) {
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
  const { showAdult } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()

  const [channels, setChannels]       = useState([])
  const [groups, setGroups]           = useState([])
  const [logoMap, setLogoMap]         = useState({})
  const [favoriteIds, setFavoriteIds] = useState(new Set())
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [progress, setProgress]       = useState(null) // { loading, page, totalPages, channelCount }
  const [recentlyWatched, setRecentlyWatched] = useState([])

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
    getLogoMap().then(setLogoMap).catch(() => {})
    getFavorites().then(r => setFavoriteIds(new Set(r.channels.map(c => String(c.uniqueId))))).catch(() => {})
    setRecentlyWatched(getRecentlyWatched())
  }, [])

  // Poll progress while channels are loading
  useEffect(() => {
    let id
    async function poll() {
      try {
        const [chRes, grpRes] = await Promise.all([getChannels(activeGroup || null), getGroups()])
        let chList = chRes.channels ?? []
        let gList  = (grpRes.groups ?? []).filter(g => g.name?.toLowerCase() !== 'all')

        // Parental Filter
        if (!showAdult) {
          const isAdult = (name) => {
            const lower = name?.toLowerCase() || ''
            return lower.includes('adult') || lower.includes('for adults')
          }
          chList = chList.filter(c => !isAdult(c.genre) && !isAdult(c.name))
          gList  = gList.filter(g => !isAdult(g.name))
        }

        setChannels(chList)
        setGroups(gList)
        setLoading(false)

        const p = await getChannelProgress()
        setProgress(p)
        if (p.loading) id = setTimeout(poll, 800)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }
    poll()
    return () => clearTimeout(id)
  }, [activeGroup, showAdult])

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
  }, [channels])

  async function toggleFavorite(channel) {
    const id = String(channel.uniqueId)
    if (favoriteIds.has(id)) {
      await removeFavoriteChannel(id).catch(() => {})
      setFavoriteIds(prev => { const s = new Set(prev); s.delete(id); return s })
    } else {
      await addFavoriteChannel(id).catch(() => {})
      setFavoriteIds(prev => new Set(prev).add(id))
    }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return channels
    const q = query.toLowerCase()
    return channels.filter(c => c.name?.toLowerCase().includes(q))
  }, [channels, query])

  function selectGroup(id) {
    setQuery('')
    if (id) setSearchParams({ group: id })
    else setSearchParams({})
  }

  function openChannel(channel) {
    navigate(`/player?channel=${channel.uniqueId}&name=${encodeURIComponent(channel.name)}`)
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
                <ChannelCard
                  key={r.uniqueId}
                  channel={{ uniqueId: r.uniqueId, name: r.name, number: r.number }}
                  logoUrl={r.logoUrl}
                  isFavorite={favoriteIds.has(String(r.uniqueId))}
                  onToggleFavorite={ch => toggleFavorite(ch)}
                  onClick={openChannel}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        {/* Progress bar while loading */}
        {loading && progress?.loading && progress.totalPages > 0 && (
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

        {loading && (!progress?.loading || !progress?.totalPages) && (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
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

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-48 text-center">
            <Tv2 size={32} className="text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-muted)]">No channels found.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {filtered.map(ch => (
              <ChannelCard
                key={ch.uniqueId} channel={ch}
                logoUrl={logoMap[String(ch.uniqueId)]}
                isFavorite={favoriteIds.has(String(ch.uniqueId))}
                onToggleFavorite={toggleFavorite}
                onClick={openChannel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
