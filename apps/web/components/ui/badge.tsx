import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

export type BadgeTone = 'neutral' | 'muted' | 'brand' | 'gold' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-sand-300 bg-white text-sand-700',
  muted: 'border-transparent bg-sand-100 text-sand-700',
  brand: 'border-transparent bg-brand-700 text-white',
  gold: 'border-gold-200 bg-gold-50 text-gold-700',
  success: 'border-green-600/25 bg-green-50 text-green-800',
  warning: 'border-amber-400/50 bg-amber-50 text-amber-900',
  danger: 'border-red-300 bg-red-50 text-red-800',
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
