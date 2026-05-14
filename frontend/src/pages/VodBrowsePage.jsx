import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Film, AlertCircle, RefreshCw, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getVodCategories, getVodList,
  getSeriesCategories, getSeriesList, getSeriesSeasons,
} from '../stalkerApi'

// ── VOD card ──────────────────────────────────────────────────────────────
function VodCard({ item, onClick }) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      onClick={() => onClick(item)}
      className="group flex flex-col rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden text-left transition-all duration-200 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)] hover:shadow-[0_0_16px_var(--color-primary-glow)] cursor-pointer"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] w-full bg-[var(--color-surface-2)] overflow-hidden">
        {item.screenshotUri && !imgError
          ? <img src={item.screenshotUri} alt={item.name} onError={() => setImgError(true)} className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center"><Film size={32} className="text-[var(--color-muted)]" /></div>
        }
        {/* HD badge */}
        {item.hd && (
          <span className="absolute top-1.5 right-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[var(--color-primary)] text-white">HD</span>
        )}
        {/* Series indicator */}
        {item.isSeries && (
          <span className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-black/70 text-[var(--color-primary-light)]">Series</span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 flex flex-col gap-0.5 flex-1">
        <p className="text-xs font-medium text-[var(--color-text)] leading-tight line-clamp-2">{item.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {item.year && <span className="text-[10px] text-[var(--color-muted)]">{item.year}</span>}
          {item.time && item.time !== '0' && (
            <span className="text-[10px] text-[var(--color-muted)]">{item.time}m</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Episode picker modal ──────────────────────────────────────────────────
function EpisodeModal({ item, type, onClose, onPlay }) {
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null) // index of expanded season

  useEffect(() => {
    setLoading(true)
    getSeriesSeasons(item.id)
      .then((r) => {
        const s = r.seasons || []
        setSeasons(s)
        if (s.length === 1) setExpanded(0) // auto-expand if only one season
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [item.id])

  function handleEpisode(season, episode) {
    onPlay(item.id, episode, `${item.name} · Ep ${episode}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--color-border)]">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)] line-clamp-2">{item.name}</p>
            {item.year && <p className="text-xs text-[var(--color-muted)] mt-0.5">{item.year}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <div className="h-5 w-5 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && error && (
            <p className="text-xs text-[var(--color-live)] text-center py-4">{error}</p>
          )}

          {!loading && !error && seasons.length === 0 && (
            <p className="text-xs text-[var(--color-muted)] text-center py-4">No episodes found.</p>
          )}

          {!loading && !error && seasons.map((season, idx) => (
            <div key={season.id} className="mb-2">
              <button
                onClick={() => setExpanded(expanded === idx ? null : idx)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] transition-colors text-left"
              >
                <span className="text-sm font-medium text-[var(--color-text)]">{season.name}</span>
                {expanded === idx ? <ChevronUp size={14} className="text-[var(--color-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-muted)]" />}
              </button>

              {expanded === idx && (
                <div className="mt-1 grid grid-cols-4 gap-1.5 px-1">
                  {season.episodes.map((ep) => (
                    <button
                      key={ep}
                      onClick={() => handleEpisode(season, ep)}
                      className="flex items-center justify-center rounded-[var(--radius-sm)] py-2 text-xs font-medium transition-colors bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-primary)]/20 hover:text-[var(--color-primary-light)]"
                    >
                      Ep {ep}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main browse page ──────────────────────────────────────────────────────
export default function VodBrowsePage({ type }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const isVod = type === 'vod'
  const label = isVod ? 'movie' : 'series'

  const [categories, setCategories]   = useState([])
  const [items, setItems]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState(null)
  const [page, setPage]               = useState(0)
  const [totalPages, setTotalPages]   = useState(1)
  const [query, setQuery]             = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [modalItem, setModalItem]     = useState(null) // item for episode picker

  const activeCategory = searchParams.get('category') || '*'
  const pillsRef = useRef(null)
  const debounceRef = useRef(null)

  // Horizontal pill scroll with mouse wheel
  useEffect(() => {
    const el = pillsRef.current
    if (!el) return
    const onWheel = (e) => { e.preventDefault(); el.scrollLeft += e.deltaY }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Load categories once
  useEffect(() => {
    const load = isVod ? getVodCategories : getSeriesCategories
    load().then((r) => {
      const cats = (r.categories ?? []).filter((c) => c.name?.toLowerCase() !== 'all')
      setCategories(cats)
    }).catch(() => {})
  }, [isVod])

  // Debounce search input → debouncedQuery triggers a re-fetch
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Fetch first page whenever category or search changes
  const fetchPage = useCallback(async (cat, q, pg, append = false) => {
    const load = isVod ? getVodList : getSeriesList
    try {
      const r = await load(cat, pg, q)
      setTotalPages(r.totalPages ?? 1)
      setItems((prev) => append ? [...prev, ...(r.items ?? [])] : (r.items ?? []))
    } catch (e) {
      if (!append) setError(e.message)
    }
  }, [isVod])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setPage(0)
    setItems([])
    fetchPage(activeCategory, debouncedQuery, 0, false)
      .finally(() => setLoading(false))
  }, [activeCategory, debouncedQuery, fetchPage])

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    await fetchPage(activeCategory, debouncedQuery, nextPage, true)
    setPage(nextPage)
    setLoadingMore(false)
  }

  function selectCategory(id) {
    setQuery('')
    setDebouncedQuery('')
    if (id && id !== '*') setSearchParams({ category: id })
    else setSearchParams({})
  }

  function handleItemClick(item) {
    if (item.isSeries) {
      setModalItem(item)
    } else {
      navigate(`/player?mode=vod&vodId=${item.id}&vodType=${type}&name=${encodeURIComponent(item.name)}`)
    }
  }

  function handleEpisodePlay(vodId, episode, name) {
    setModalItem(null)
    navigate(`/player?mode=vod&vodId=${vodId}&vodType=${type}&episode=${episode}&name=${encodeURIComponent(name)}`)
  }

  const hasMore = page < totalPages - 1

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Episode picker modal */}
      {modalItem && (
        <EpisodeModal
          item={modalItem}
          type={type}
          onClose={() => setModalItem(null)}
          onPlay={handleEpisodePlay}
        />
      )}

      {/* Sticky filter bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)]/90 backdrop-blur-sm border-b border-[var(--color-border)] px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
          <Input
            placeholder={`Search ${label}s…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <div ref={pillsRef} className="flex items-center gap-1.5 overflow-x-auto flex-1 scrollbar-none">
          <button
            onClick={() => selectCategory('*')}
            className={cn('shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              activeCategory === '*' || !activeCategory
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]')}
          >All</button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCategory(c.id)}
              className={cn('shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                activeCategory === String(c.id)
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]')}
            >{c.name}</button>
          ))}
        </div>

        <span className="shrink-0 text-xs text-[var(--color-muted)]">
          {items.length} {items.length === 1 ? label : `${label}s`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

        {loading && (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-3 h-48 text-center">
            <AlertCircle size={32} className="text-[var(--color-live)]" />
            <p className="text-sm text-[var(--color-muted)]">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setError(null); selectCategory(activeCategory) }}>
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-48 text-center">
            <Film size={32} className="text-[var(--color-muted)]" />
            <p className="text-sm text-[var(--color-muted)]">No {label}s found.</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {items.map((item) => (
                <VodCard key={item.id} item={item} onClick={handleItemClick} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? <><Loader2 size={14} className="animate-spin" /> Loading…</>
                    : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
