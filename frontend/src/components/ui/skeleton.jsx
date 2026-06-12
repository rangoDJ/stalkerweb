import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-[var(--radius-md)] bg-[var(--color-surface-2)]', className)}
      {...props}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
      <Skeleton className="h-16 w-16 rounded-[var(--radius-sm)]" />
      <Skeleton className="h-3 w-12 rounded-full" />
      <Skeleton className="h-4 w-24 rounded-full" />
    </div>
  )
}

function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonGrid }
