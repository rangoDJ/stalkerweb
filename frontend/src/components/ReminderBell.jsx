import { useState, useRef, useEffect } from 'react'
import { Bell, BellRing, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatReminderTime(startTime) {
  const d = new Date(startTime * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * A bell icon button that shows a badge count when reminders are set.
 * On click, shows a dropdown list of active reminders with remove buttons.
 *
 * @param {{ reminders: import('@/lib/epgReminders').Reminder[], onRemove: (id: string) => void }} props
 */
export function ReminderBell({ reminders = [], onRemove }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const count = reminders.length
  const hasActive = count > 0

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] transition-colors',
          open
            ? 'bg-[var(--color-surface-2)] text-[var(--color-primary-light)]'
            : 'text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]'
        )}
        aria-label={`Reminders${count > 0 ? ` (${count})` : ''}`}
        title="EPG Reminders"
      >
        {hasActive
          ? <BellRing size={16} className="text-[var(--color-primary-light)]" />
          : <Bell size={16} />
        }
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full bg-[var(--color-primary)] text-white text-[9px] font-bold leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
              Reminders
            </span>
            {count > 0 && (
              <span className="text-xs text-[var(--color-muted)]">{count} set</span>
            )}
          </div>

          {count === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
              No reminders set.<br />
              <span className="text-xs opacity-70">Click a future programme to set one.</span>
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]">
              {reminders.map(r => (
                <li key={r.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--color-surface-2)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">{r.title}</p>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                      {r.channelName} · {formatReminderTime(r.startTime)}
                    </p>
                    {r.notifiedAt && (
                      <p className="text-[10px] text-[var(--color-primary-light)] mt-0.5">Notified</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(r.id)}
                    className="shrink-0 p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-3)] transition-colors mt-0.5"
                    aria-label="Remove reminder"
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
