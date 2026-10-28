/** A shimmering placeholder block. Decorative: pair it with text that says what is loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-shimmer rounded-xl bg-[linear-gradient(90deg,var(--color-sand-100)_25%,var(--color-sand-50)_50%,var(--color-sand-100)_75%)] bg-size-[200%_100%] ${className}`}
    />
  );
}

/** Loading state for a whole signed-in page: the shape of a header and a few cards. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <p className="sr-only">{label}</p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-3/4 max-w-lg" />
        <Skeleton className="h-5 w-1/2 max-w-sm" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
      <Skeleton className="h-24 rounded-3xl" />
    </div>
  );
}

/** Loading state for a list inside a page that has already rendered its header. */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}
