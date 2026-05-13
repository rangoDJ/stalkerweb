import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Tv2, AlertCircle, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getChannels, getGroups } from '../stalkerApi'

function ChannelCard({ channel, onClick }) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      onClick={() => onClick(channel)}
      className="group flex flex-col items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 text-left transition-all duration-200 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-2)] hover:shadow-[0_0_16px_var(--color-primary-glow)] cursor-pointer"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] overflow-hidden">
        {channel.logo && !imgError ? (
          <img
            src={channel.logo}
            alt={channel.name}
            onError={() => setImgError(true)}
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <Tv2 size={28} className="text-[var(--color-muted)]" />
        )}
      </div>
      <div className="w-full text-center">
        <p className="text-xs text-[var(--color-muted)] mb-0.5">Ch {channel.number || channel.id}</p>
        <p className="text-sm font-medium text-[var(--color-text)] truncate leading-tight">
          {channel.name}
        </p>
      </div>
    </button>
  )
}

export default function ChannelsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [channels, setChannels] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const activeGroup = searchParams.get('group') || ''
  const [query, setQuery] = useState('')

  useEffect(() => {
    getGroups().then(setGroups).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    getChannels(activeGroup || null)
      .then(setChannels)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeGroup])

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
    navigate(`/player?channel=${channel.id}&name=${encodeURIComponent(channel.name)}`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Sticky filter bar */}
      <div className="sticky top-14 z-30 bg-[var(--color-bg)]/90 backdrop-blur-sm border-b border-[var(--color-border)] px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] pointer-events-none" />
          <Input
            placeholder="Search channels…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Group pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 scrollbar-none">
          <button
            onClick={() => selectGroup('')}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              !activeGroup
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
            )}
          >
            All
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => selectGroup(g.id)}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                activeGroup === String(g.id)
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
              )}
            >
              {g.title}
            </button>
          ))}
        </div>

        <span className="shrink-0 text-xs text-[var(--color-muted)]">
          {filtered.length} {filtered.length === 1 ? 'channel' : 'channels'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
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
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {filtered.map(ch => (
              <ChannelCard key={ch.id} channel={ch} onClick={openChannel} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
