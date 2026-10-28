import { parseIsoDate } from '@shevent/core/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * An event date as a little calendar leaf (month over day). Decorative: the full date is always
 * written out next to it. Uses UTC like the rest of the date helpers, so the day never shifts.
 */
export function DateLeaf({ date, className = '' }: { date: string; className?: string }) {
  const parsed = parseIsoDate(date);
  if (!parsed) return null;
  return (
    <span aria-hidden className={`flex w-14 shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-center shadow-sm ${className}`}>
      <span className="bg-accent py-0.5 text-[0.6875rem] font-semibold tracking-wider text-on-accent uppercase">{MONTHS[parsed.getUTCMonth()]}</span>
      <span className="py-1 font-display text-2xl leading-tight font-semibold text-ink">{parsed.getUTCDate()}</span>
    </span>
  );
}
