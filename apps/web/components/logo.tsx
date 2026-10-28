import { Link } from '@/i18n/navigation';

/**
 * The Shevent mark: a geometric S on a rounded tile, with a dot for the moment the event begins.
 * Drawn in theme tokens, so it follows every theme. Decorative: the wordmark beside it carries the name.
 */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M20.4 11.3c-.85-1.6-2.55-2.55-4.6-2.55-2.7 0-4.6 1.45-4.6 3.55 0 2.3 2 3.1 4.75 3.8 2.8.7 5 1.6 5 4.1 0 2.3-2.1 3.85-4.95 3.85-2.4 0-4.25-.95-5.15-2.75"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="23.6" cy="8.3" r="1.7" fill="var(--on-accent)" />
    </svg>
  );
}

/** "SHevent": the SH set in full weight, "event" lighter. Purely visual; pass the name for the label. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`font-display font-bold tracking-[-0.045em] ${className}`}>
      SH<span className="font-medium text-ink-soft">event</span>
    </span>
  );
}

/** The logo, linking home. Its accessible name is the plain site name ("Shevent"). */
export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" aria-label={name} className="group -mx-1 flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-1 text-[1.3rem] text-ink">
      <LogoMark className="size-7.5 transition-transform duration-500 ease-out group-hover:-rotate-6" />
      <Wordmark />
    </Link>
  );
}
