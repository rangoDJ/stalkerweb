import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Film, Tv2, ChevronLeft, ChevronRight, Clock, X, Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAdult } from '@/lib/adultFilter'
import { useApp } from '@/lib/appContext'
import { getVodCategories, getVodItems, getVodSeasons, getVodEpisodes } from '../stalkerApi'
import { getVodProgressList, removeVodProgress } from '@/lib/vodProgress'

// ── Continue Watching row ─────────────────────────────────────────────────
// Horizontally-scrolling shelf of in-progress titles, restored from localStorage.
function ContinueWatching({ entries, onResume, onRemove }) {
  if (!entries.length) return null
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-[var(--color-text)] mb-2">Continue Watching</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {entries.map(e => {
          const pct = e.duration > 0 ? Math.min(100, (e.position / e.duration) * 100) : 0
          return (
            <div key={e.key} className="group relative shrink-0 w-40">
              <button
                onClick={() => onResume(e)}
                className="block w-full text-left rounded-[var(--radius-sm)] overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary-light)]"
              >
                <div className="relative w-full aspect-video bg-[var(--color-surface-2)] overflow-hidden">
                  {e.screenshotUrl ? (
                    <img src={e.screenshotUrl} alt={e.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film size={24} className="text-[var(--color-muted)] opacity-40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Play size={28} className="text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow-lg" fill="currentColor" />
                  </div>
                  {/* Progress bar */}
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                    <div className="h-full bg-[var(--color-primary-light)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <p className="text-xs font-medium text-[var(--color-text)] truncate leading-tight mt-1">{e.title}</p>
              </button>
              <button
                onClick={() => onRemove(e.key)}
                aria-label="Remove from Continue Watching"
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-black/80 hover:text-white transition-all"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
      className="group text-left flex flex-col gap-1.5 rounded-[var(--radius-md)] overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:shadow-[var(--shadow-lg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary-light)]"
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
// TV-show drill-down: show → seasons → episodes. Selecting a season fetches its
// episodes; selecting an episode resolves and plays it (passing season/episode
// ids so the backend can drill to the concrete file).
function SeasonsSheet({ item, onClose, onPlayEpisode }) {
  const [seasons, setSeasons] = useState(null)
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [episodes, setEpisodes] = useState(null)
  const [epLoading, setEpLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    getVodSeasons(item.id)
      .then(r => { setSeasons(r.seasons || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [item.id])

  function openSeason(season) {
    setSelectedSeason(season)
    setEpisodes(null)
    setEpLoading(true)
    getVodEpisodes(item.id, season.id)
      .then(r => { setEpisodes(r.episodes || []); setEpLoading(false) })
      .catch(e => { setError(e.message); setEpLoading(false) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          {selectedSeason && (
            <button onClick={() => { setSelectedSeason(null); setEpisodes(null) }} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
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
                      onClick={() => openSeason(season)}
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
                      </div>
                      <ChevronRight size={16} className="text-[var(--color-muted)] shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-[var(--color-muted)] text-center">No seasons found.</p>
            )
          )}

          {!loading && !error && selectedSeason && (
            epLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--color-primary-light)]" />
              </div>
            ) : (
              <EpisodeList episodes={episodes} onPlay={(ep) => onPlayEpisode(item, selectedSeason, ep)} />
            )
          )}
        </div>
      </div>
    </div>
  )
}

function EpisodeList({ episodes, onPlay }) {
  if (!episodes || episodes.length === 0) {
    return <p className="px-4 py-6 text-sm text-[var(--color-muted)] text-center">No episodes found.</p>
  }
  return (
    <ul>
      {episodes.map((ep) => (
        <li key={ep.episodeId}>
          <button
            onClick={() => onPlay(ep)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)] transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center shrink-0">
              <Play size={14} className="text-[var(--color-muted)] group-hover:text-[var(--color-primary-light)] transition-colors" fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--color-text)] truncate">{ep.name || `Episode ${ep.seriesNumber}`}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

// Build URLSearchParams for the VOD player, including metadata for the sidebar.
// extra: { seriesNo, episodeTitle, seasonId, episodeId } for TV-show episodes.
function buildPlayerParams(item, extra = {}) {
  const { seriesNo = 0, episodeTitle = '', seasonId = '', episodeId = '' } = extra
  const p = new URLSearchParams({
    videoId: item.id,
    title:   item.name,
    cmd:     item.cmd || '',
    series:  String(seriesNo),
  })
  if (seasonId)          p.set('seasonId', String(seasonId))
  if (episodeId)         p.set('episodeId', String(episodeId))
  if (episodeTitle)      p.set('episodeTitle', episodeTitle)
  if (item.year)         p.set('year', item.year)
  if (item.durationMin)  p.set('durationMin', String(item.durationMin))
  if (item.isHD)         p.set('isHD', 'true')
  if (item.screenshotUrl) p.set('screenshotUrl', encodeURIComponent(item.screenshotUrl))
  if (item.description)  p.set('description', encodeURIComponent(item.description))
  if (item.director)     p.set('director', encodeURIComponent(item.director))
  if (item.actors)       p.set('actors', encodeURIComponent(item.actors))
  return p
}

// ── Main VOD page ─────────────────────────────────────────────────────────
export default function VodPage() {
  const navigate  = useNavigate()
  const { showAdult } = useApp()

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
  const [continueList, setContinueList] = useState([]) // Continue Watching entries

  const searchTimer = useRef(null)

  // Load Continue Watching on mount (this page remounts when returning from the player).
  useEffect(() => { setContinueList(getVodProgressList()) }, [])

  function resumeEntry(entry) {
    navigate(`/vod-player?${entry.params}`)
  }

  function removeEntry(key) {
    removeVodProgress(key)
    setContinueList(list => list.filter(e => e.key !== key))
  }

  // Load categories on type change
  useEffect(() => {
    setCatsLoading(true)
    setCatsError('')
    setCategories([])
    setSelectedCategory(null)
    setItems([])
    getVodCategories(vodType)
      .then(r => {
        let cats = r.categories || []
        if (!showAdult) cats = cats.filter(c => !isAdult(c.name))
        setCategories(cats)
        setCatsLoading(false)
      })
      .catch(e => { setCatsError(e.message); setCatsLoading(false) })
  }, [vodType, showAdult])

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
    const hasSeries = item.isSeries || item.episodes?.length > 0
    if (hasSeries) {
      setSeriesSheet(item)
    } else {
      navigate(`/vod-player?${buildPlayerParams(item)}`)
    }
  }

  // show: the show item; season: { id, name }; ep: { episodeId, seriesNumber, name }
  function handlePlayEpisode(show, season, ep) {
    setSeriesSheet(null)
    navigate(`/vod-player?${buildPlayerParams(show, {
      seriesNo:     ep.seriesNumber,
      seasonId:     season.id,
      episodeId:    ep.episodeId,
      episodeTitle: ep.name || `Episode ${ep.seriesNumber}`,
    })}`)
  }

  return (
    <div className="fade-in flex h-[calc(100vh-3.5rem)]">

      {/* ── Left sidebar: categories ── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {/* Type toggle */}
        <div className="flex p-2 gap-1 border-b border-[var(--color-border)]">
          {[['vod', 'Movies'], ['series', 'Series']].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setVodType(t)}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-[var(--radius-sm)] transition-all',
                vodType === t
                  ? 'btn-gradient text-white'
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
            <>
              <ContinueWatching entries={continueList} onResume={resumeEntry} onRemove={removeEntry} />
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--color-muted)]">
                <Film size={48} className="opacity-20" />
                <p className="text-sm">Select a category to browse {vodType === 'series' ? 'series' : 'movies'}</p>
              </div>
            </>
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
