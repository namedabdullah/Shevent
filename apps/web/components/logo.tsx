import { Link } from '@/i18n/navigation';

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

/** The Shevent rosette: eight gold petals around a maroon centre, like a marigold garland. */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false" className={`shrink-0 ${className}`}>
      <g fill="var(--color-gold-400)">
        {PETALS.map((angle) => (
          <ellipse key={angle} cx="16" cy="7.5" rx="3.4" ry="6" transform={`rotate(${angle} 16 16)`} />
        ))}
      </g>
      <circle cx="16" cy="16" r="6" fill="var(--color-brand-700)" />
      <circle cx="16" cy="16" r="2.2" fill="var(--color-gold-100)" />
    </svg>
  );
}

/** The wordmark, linking home. Its accessible name is just "Shevent". The rosette turns on hover. */
export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="group -mx-1 flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 font-display text-2xl font-semibold tracking-tight text-brand-800">
      <LogoMark className="size-8 transition-transform duration-700 ease-out group-hover:rotate-45" />
      {name}
    </Link>
  );
}
