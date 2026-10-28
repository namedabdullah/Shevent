import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

export type BadgeTone = 'neutral' | 'muted' | 'solid' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-surface text-ink-soft',
  muted: 'border-transparent bg-subtle text-ink-soft',
  solid: 'border-transparent bg-accent text-on-accent',
  accent: 'border-accent-line bg-accent-soft text-accent-ink',
  success: 'border-success-line bg-success-soft text-success-ink',
  warning: 'border-warning-line bg-warning-soft text-warning-ink',
  danger: 'border-danger-line bg-danger-soft text-danger-ink',
};

/** A short label: a status, "Verified", "Sponsored". Always words, optionally with an icon. */
export function Badge({ tone = 'neutral', icon, className = '', children }: { tone?: BadgeTone; icon?: IconName; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {icon && <Icon name={icon} className="size-3.5" />}
      {children}
    </span>
  );
}
