import { useEffect, useState } from 'react'
import { Download, X, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { subscribeDownloads, removeDownload } from '@/lib/downloads'

function formatBytes(n) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function statusMeta(status) {
  switch (status) {
    case 'downloading': return { icon: Loader2, spin: true,  color: 'text-[var(--color-primary-light)]', label: 'Downloading' }
    case 'queued':      return { icon: Clock,   spin: false, color: 'text-[var(--color-muted)]',          label: 'Queued' }
    case 'done':        return { icon: CheckCircle2, spin: false, color: 'text-[var(--color-success)]',   label: 'Done' }
    case 'error':        return { icon: AlertCircle, spin: false, color: 'text-[var(--color-live)]',       label: 'Failed' }
    default:            return { icon: Clock,   spin: false, color: 'text-[var(--color-muted)]',          label: status }
  }
}

function DownloadRow({ job, onCancel }) {
  const { icon: Icon, spin, color, label } = statusMeta(job.status)
  const pct = job.totalBytes > 0 ? Math.min(100, Math.round((job.bytesDownloaded / job.totalBytes) * 100)) : null

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <Icon size={18} className={cn(color, 'shrink-0', spin && 'animate-spin')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)] truncate">
          {job.seriesTitle ? `${job.seriesTitle} — ${job.title}` : job.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-[var(--color-muted)]">{label}</span>
          {job.status === 'downloading' && (
            <span className="text-xs text-[var(--color-muted)]">
              {formatBytes(job.bytesDownloaded)}{job.totalBytes > 0 ? ` / ${formatBytes(job.totalBytes)}` : ''}
            </span>
          )}
          {job.status === 'error' && job.error && (
            <span className="text-xs text-[var(--color-live)] truncate">{job.error}</span>
          )}
        </div>
        {job.status === 'downloading' && (
          <div className="mt-1.5 h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div
              className={cn('h-full bg-[var(--color-primary-light)] transition-all', pct === null && 'animate-pulse w-1/3')}
              style={pct !== null ? { width: `${pct}%` } : undefined}
            />
          </div>
        )}
      </div>
      {(job.status === 'queued' || job.status === 'downloading' || job.status === 'error' || job.status === 'done') && (
        <button
          onClick={() => onCancel(job.id)}
          title={job.status === 'done' || job.status === 'error' ? 'Remove' : 'Cancel'}
          className="shrink-0 p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-live)] hover:bg-[var(--color-live)]/10 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export default function DownloadsPage() {
  const [jobs, setJobs] = useState([])

  useEffect(() => subscribeDownloads(setJobs), [])

  function handleCancel(id) {
    // Optimistic — the SSE stream will confirm shortly after.
    setJobs(prev => prev.filter(j => j.id !== id))
    removeDownload(id).catch(() => {})
  }

  return (
    <div className="fade-in max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Download size={22} className="text-[var(--color-primary-light)]" />
          Downloads
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Movies and episodes saved to the server&rsquo;s disk. One title downloads at a time.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Download size={40} className="text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No downloads yet.</p>
          <p className="text-xs text-[var(--color-muted)]">Use the download button on a movie or episode in the VOD section.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map(job => <DownloadRow key={job.id} job={job} onCancel={handleCancel} />)}
        </div>
      )}
    </div>
  )
}
