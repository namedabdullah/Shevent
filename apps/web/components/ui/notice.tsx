import type { AriaRole, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

// Status colours always come with an icon and words, never colour alone. Brand maroon is for
// actions, so errors use red and successes green.
const TONES: Record<NoticeTone, { icon: IconName; box: string; iconClass: string }> = {
  info: { icon: 'info', box: 'border-sand-300 bg-white text-sand-800', iconClass: 'text-brand-700' },
  success: { icon: 'check', box: 'border-green-600/30 bg-green-50 text-green-950', iconClass: 'text-green-700' },
  warning: { icon: 'alert', box: 'border-amber-400/60 bg-amber-50 text-amber-950', iconClass: 'text-amber-700' },
  error: { icon: 'alert', box: 'border-red-300 bg-red-50 text-red-950', iconClass: 'text-red-700' },
};

/**
 * An inline message about the page or a form: saved, sent, failed, sample data… Pass the role that
 * fits: "status" for a result the visitor just caused, "alert" for a failure, "note" for context.
 */
export function Notice({
  tone = 'info',
  role,
  title,
  action,
  className = '',
  children,
}: {
  tone?: NoticeTone;
  role?: AriaRole;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const style = TONES[tone];
  return (
    <div role={role} className={`flex animate-enter gap-3 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${style.box} ${className}`}>
      <Icon name={style.icon} className={`mt-0.5 size-4.5 ${style.iconClass}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
