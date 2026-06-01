import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Film, Tv2, ChevronLeft, ChevronRight, Clock, X, Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVodCategories, getVodItems, getVodSeasons } from '../stalkerApi'

// ── Thumbnail component ───────────────────────────────────────────────────
function Thumb({ src, name, isHD }) {
  const [err, setErr] = useState(false)
  return (
    <div className="relative w-full aspect-video bg-[var(--color-surface-2)] rounded-[var(--radius-sm)] overflow-hidden">
      {src && !err ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setErr(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Film size={28} className="text-[var(--color-muted)] opacity-40" />
        </div>
      )}
      {isHD && (
        <span className="absolute top-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded bg-[var(--color-primary)]/80 text-white leading-none">HD</span>
      )}
    </div>
  )
}

// ── VOD item card ─────────────────────────────────────────────────────────
function VodCard({ item, onClick }) {
  const hasSeries = item.episodes?.length > 0
  return (
    <button
      onClick={() => onClick(item)}
      className="group text-left flex flex-col gap-1.5 rounded-[var(--radius-sm)] overflow-hidden transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary-light)]"
    >
      <div className="relative">
        <Thumb src={item.screenshotUrl} name={item.name} isHD={item.isHD} />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Play size={32} className="text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow-lg" fill="currentColor" />
        </div>
        {hasSeries && (
          <span className="absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white leading-none">
            {item.episodes.length} ep
          </span>
        )}
      </div>
      <div className="px-0.5">
        <p className="text-xs font-medium text-[var(--color-text)] truncate leading-tight">{item.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.year && <span className="text-[10px] text-[var(--color-muted)]">{item.year}</span>}
          {item.durationMin > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-muted)]">
              <Clock size={9} />{item.durationMin}m
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Seasons / Episodes sheet ──────────────────────────────────────────────
function SeasonsSheet({ item, onClose, onPlayEpisode }) {
  const [seasons, setSeasons] = useState(null)
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    getVodSeasons(item.id)
      .then(r => {
        setSeasons(r.seasons || [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [item.id])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          {selectedSeason && (
            <button onClick={() => setSelectedSeason(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)] truncate">{item.name}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {selectedSeason ? selectedSeason.name : 'Select a season'}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--color-primary-light)]" />
            </div>
          )}
          {error && <p className="px-4 py-6 text-sm text-[var(--color-live)] text-center">{error}</p>}

          {!loading && !error && !selectedSeason && (
            seasons && seasons.length > 0 ? (
              <ul>
                {seasons.map((season, i) => (
                  <li key={season.id || i}>
                    <button
                      onClick={() => setSelectedSeason(season)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)] transition-colors"
                    >
                      <div className="w-10 h-10 rounded bg-[var(--color-surface-2)] shrink-0 overflow-hidden">
                        {season.screenshotUrl ? (
                          <img src={season.screenshotUrl} alt={season.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tv2 size={18} className="text-[var(--color-muted)]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text)] truncate">{season.name}</p>
                        <p className="text-xs text-[var(--color-muted)]">{season.episodes?.length || 0} episodes</p>
                      </div>
                      <ChevronRight size={16} className="text-[var(--color-muted)] shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              // No seasons returned — the item itself is a season with episodes
              <EpisodeList item={item} onPlay={(ep) => onPlayEpisode(item, ep)} />
            )
          )}

          {!loading && !error && selectedSeason && (
            <EpisodeList item={selectedSeason} onPlay={(ep) => onPlayEpisode(selectedSeason, ep)} />
          )}
        </div>
      </div>
    </div>
  )
}

function EpisodeList({ item, onPlay }) {
  const episodes = item.episodes || []
  if (episodes.length === 0) {
    return <p className="px-4 py-6 text-sm text-[var(--color-muted)] text-center">No episodes found.</p>
  }
  return (
    <ul>
      {episodes.map((ep) => (
        <li key={ep}>
          <button
            onClick={() => onPlay(ep)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)] transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center shrink-0">
              <Play size={14} className="text-[var(--color-muted)] group-hover:text-[var(--color-primary-light)] transition-colors" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--color-text)]">Episode {ep}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

// Build URLSearchParams for the VOD player, including metadata for the sidebar
function buildPlayerParams(item, seriesNo, episodeTitle) {
  const p = new URLSearchParams({
    videoId: item.id,
    title:   item.name,
    cmd:     item.cmd || '',
    series:  String(seriesNo),
  })
  if (episodeTitle)      p.set('episodeTitle', episodeTitle)
  if (item.year)         p.set('year', item.year)
  if (item.durationMin)  p.set('durationMin', String(item.durationMin))
  if (item.isHD)         p.set('isHD', 'true')
  if (item.description)  p.set('description', encodeURIComponent(item.description))
  if (item.director)     p.set('director', encodeURIComponent(item.director))
  if (item.actors)       p.set('actors', encodeURIComponent(item.actors))
  return p
}

// ── Main VOD page ─────────────────────────────────────────────────────────
export default function VodPage() {
  const navigate  = useNavigate()

  const [vodType, setVodType]         = useState('vod')
  const [categories, setCategories]   = useState([])
  const [catsLoading, setCatsLoading] = useState(true)
  const [catsError, setCatsError]     = useState('')

  const [selectedCategory, setSelectedCategory] = useState(null)
  const [items, setItems]             = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsError, setItemsError]   = useState('')
  const [totalItems, setTotalItems]   = useState(0)
  const [, setTotalPages]             = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore]         = useState(false)

  const [search, setSearch]           = useState('')
  const [seriesSheet, setSeriesSheet] = useState(null) // item to show seasons for

  const searchTimer = useRef(null)

  // Load categories on type change
  useEffect(() => {
    setCatsLoading(true)
    setCatsError('')
    setCategories([])
    setSelectedCategory(null)
    setItems([])
    getVodCategories(vodType)
      .then(r => { setCategories(r.categories || []); setCatsLoading(false) })
      .catch(e => { setCatsError(e.message); setCatsLoading(false) })
  }, [vodType])

  // Load items when category / search changes
  const loadItems = useCallback(async (catId, q, page) => {
    if (!catId) return
    setItemsLoading(true)
    setItemsError('')
    try {
      const r = await getVodItems({ type: vodType, category: catId, page, search: q })
      if (page === 1) {
        setItems(r.items)
      } else {
        setItems(prev => [...prev, ...r.items])
      }
      setTotalItems(r.totalItems)
      setTotalPages(r.totalPages)
      setCurrentPage(page)
      setHasMore(page < r.totalPages)
    } catch (e) {
      setItemsError(e.message)
    } finally {
      setItemsLoading(false)
    }
  }, [vodType])

  function selectCategory(cat) {
    setSelectedCategory(cat)
    setSearch('')
    setItems([])
    setCurrentPage(1)
    loadItems(cat.id, '', 1)
  }

  function handleSearchChange(q) {
    setSearch(q)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      if (selectedCategory) {
        setItems([])
        setCurrentPage(1)
        loadItems(selectedCategory.id, q, 1)
      }
    }, 400)
  }

  function loadMore() {
    if (!selectedCategory || !hasMore || itemsLoading) return
    loadItems(selectedCategory.id, search, currentPage + 1)
  }

  function handleItemClick(item) {
    const hasSeries = item.episodes?.length > 0
    if (hasSeries) {
      setSeriesSheet(item)
    } else {
      navigate(`/vod-player?${buildPlayerParams(item, 0, '')}`)
    }
  }

  function handlePlayEpisode(item, episodeNo) {
    setSeriesSheet(null)
    navigate(`/vod-player?${buildPlayerParams(item, episodeNo, `Episode ${episodeNo}`)}`)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">

      {/* ── Left sidebar: categories ── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {/* Type toggle */}
        <div className="flex p-2 gap-1 border-b border-[var(--color-border)]">
          {[['vod', 'Movies'], ['series', 'Series']].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setVodType(t)}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-[var(--radius-sm)] transition-colors',
                vodType === t
                  ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary-light)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Category list */}
        <div className="flex-1 overflow-y-auto py-1">
          {catsLoading && (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[var(--color-primary-light)]" />
            </div>
          )}
          {catsError && (
            <p className="px-3 py-4 text-xs text-[var(--color-live)] text-center">{catsError}</p>
          )}
          {!catsLoading && categories.length === 0 && !catsError && (
            <p className="px-3 py-4 text-xs text-[var(--color-muted)] text-center">No categories found.</p>
          )}
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => selectCategory(cat)}
              className={cn(
                'w-full text-left px-3 py-2 text-xs transition-colors',
                selectedCategory?.id === cat.id
                  ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary-light)] font-medium'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
              )}
            >
              {cat.title}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
            <input
              placeholder={selectedCategory ? `Search in ${selectedCategory.title}…` : 'Select a category first'}
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              disabled={!selectedCategory}
              className="w-full rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] pl-8 pr-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] outline-none focus:border-[var(--color-primary-light)] disabled:opacity-40"
            />
          </div>
          {selectedCategory && (
            <span className="text-xs text-[var(--color-muted)]">
              {totalItems > 0 ? `${totalItems.toLocaleString()} titles` : ''}
            </span>
          )}
        </div>

        {/* Items grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedCategory && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-muted)]">
              <Film size={48} className="opacity-20" />
              <p className="text-sm">Select a category to browse {vodType === 'series' ? 'series' : 'movies'}</p>
            </div>
          )}

          {itemsError && (
            <p className="text-sm text-[var(--color-live)] text-center py-8">{itemsError}</p>
          )}

          {items.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {items.map(item => (
                  <VodCard key={item.id} item={item} onClick={handleItemClick} />
                ))}
              </div>

              {/* Load more / pagination */}
              <div className="flex items-center justify-center gap-3 mt-6 pb-2">
                {itemsLoading && <Loader2 size={18} className="animate-spin text-[var(--color-primary-light)]" />}
                {hasMore && !itemsLoading && (
                  <button
                    onClick={loadMore}
                    className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm text-[var(--color-text)] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary-light)] transition-colors"
                  >
                    Load more
                  </button>
                )}
                {!hasMore && totalItems > 0 && (
                  <p className="text-xs text-[var(--color-muted)]">All {totalItems.toLocaleString()} titles loaded</p>
                )}
              </div>
            </>
          )}

          {selectedCategory && !itemsLoading && items.length === 0 && !itemsError && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-[var(--color-muted)]">
              <Film size={32} className="opacity-20" />
              <p className="text-sm">{search ? `No results for "${search}"` : 'No titles in this category.'}</p>
            </div>
          )}

          {selectedCategory && itemsLoading && items.length === 0 && (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={28} className="animate-spin text-[var(--color-primary-light)]" />
            </div>
          )}
        </div>
      </div>

      {/* Seasons / Episodes sheet */}
      {seriesSheet && (
        <SeasonsSheet
          item={seriesSheet}
          onClose={() => setSeriesSheet(null)}
          onPlayEpisode={handlePlayEpisode}
        />
      )}
    </div>
  )
}
