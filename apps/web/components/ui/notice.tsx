import type { AriaRole, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

// Status colours always come with an icon and words, never colour alone. The accent is for actions,
// so status uses its own success, warning and danger tokens.
const TONES: Record<NoticeTone, { icon: IconName; box: string; iconClass: string }> = {
  info: { icon: 'info', box: 'border-line bg-surface text-ink', iconClass: 'text-accent-ink' },
  success: { icon: 'check', box: 'border-success-line bg-success-soft text-success-ink', iconClass: 'text-success' },
  warning: { icon: 'alert', box: 'border-warning-line bg-warning-soft text-warning-ink', iconClass: 'text-warning' },
  error: { icon: 'alert', box: 'border-danger-line bg-danger-soft text-danger-ink', iconClass: 'text-danger' },
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
    <div role={role} className={`flex animate-enter gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${style.box} ${className}`}>
      <Icon name={style.icon} className={`mt-0.5 size-4.5 ${style.iconClass}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
