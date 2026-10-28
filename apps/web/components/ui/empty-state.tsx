import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

/**
 * What a list or panel shows when there is nothing in it yet: what will appear here and, when
 * there is one, the action that fills it. Never placeholder content.
 */
export function EmptyState({
  icon,
  title,
  action,
  compact = false,
  children,
}: {
  icon: IconName;
  title?: ReactNode;
  action?: ReactNode;
  /** Smaller, left-aligned, for inside a card. */
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={
        compact
          ? 'flex items-start gap-4 rounded-2xl border border-dashed border-sand-300 bg-white/60 px-4 py-4'
          : 'flex flex-col items-center gap-4 rounded-3xl border border-dashed border-sand-300 bg-white/60 px-6 py-12 text-center'
      }
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-700 ${compact ? 'size-10' : 'size-14 ring-8 ring-gold-50/60'}`}>
        <Icon name={icon} className={compact ? 'size-5' : 'size-6'} />
      </span>
      <div className={`flex flex-col gap-1.5 ${compact ? '' : 'max-w-md items-center'}`}>
        {title && <p className={`font-display font-semibold text-sand-900 ${compact ? 'text-lg' : 'text-xl'}`}>{title}</p>}
        {children && <div className="leading-relaxed text-sand-700">{children}</div>}
        {action && <div className={compact ? 'mt-2' : 'mt-3'}>{action}</div>}
      </div>
    </div>
  );
}
