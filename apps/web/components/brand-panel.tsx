import type { ReactNode } from 'react';
import { LogoMark } from '@/components/logo';

/**
 * A decorative panel in the opposite palette (dark on light themes, light on dark ones): a dot grid,
 * a soft accent glow and the mark, with an optional line of text. For the side of sign-in, the
 * booking ticket and the like.
 */
export function BrandPanel({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`scope-inverse relative flex flex-col justify-between gap-10 overflow-hidden bg-canvas p-8 text-ink ${className}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1.2px)] bg-size-[22px_22px] opacity-70" />
      <div aria-hidden className="pointer-events-none absolute -end-24 -bottom-24 size-72 rounded-full bg-accent/25 blur-3xl" />
      <LogoMark className="relative size-12" />
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
