import { useState } from 'react'
import { Tv2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = {
  xs: { box: 'h-5 w-5',   icon: 13 },
  sm: { box: 'h-8 w-8',   icon: 16 },
  md: { box: 'h-16 w-16', icon: 28 },
}

export function ChannelLogo({ src, name, size = 'md' }) {
  const [err, setErr] = useState(false)
  const { box, icon } = SIZES[size] ?? SIZES.md
  return (
    <div className={cn('flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] overflow-hidden shrink-0', box)}>
      {src && !err
        ? <img src={src} alt={name} loading="lazy" onError={() => setErr(true)} className="h-full w-full object-contain p-1" />
        : <Tv2 size={icon} className="text-[var(--color-muted)]" />}
    </div>
  )
}
