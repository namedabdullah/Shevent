'use client';

import type { Category } from '@shevent/core/enums';
import { useState } from 'react';

export interface SplitItem {
  category: Category;
  label: string;
  share: number;
  /** Formatted amount, e.g. "Rs 9.5 lakh". */
  amount: string;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Part-to-whole as one horizontal stacked bar (a stacked bar reads better than a donut), with a
 * 2px surface gap between segments. The chart colours meet 3:1 as graphics but not 4.5:1 as text,
 * so no text is set on them: the legend, the hover/focus tooltip and the table below the chart
 * carry the numbers, which also keeps colour from being the only channel.
 */
export function BudgetSplitBar({ items, title }: { items: SplitItem[]; title: string }) {
  const [active, setActive] = useState<{ index: number; left: number } | null>(null);
  const show = (index: number, segment: HTMLElement) =>
    setActive({ index, left: segment.offsetLeft + segment.offsetWidth / 2 });
  const activeItem = active === null ? undefined : items[active.index];

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="relative">
        {/* The bar draws in from the start once; the wrapper animates so the group keeps exactly one child per segment. */}
        <div className="origin-left animate-[draw_0.9s_var(--ease-out-expo)_both]">
          <div role="group" aria-label={title} className="flex h-8 w-full gap-[2px]">
            {items.map((item, i) => (
              <div
                key={item.category}
                role="img"
                tabIndex={0}
                aria-label={`${item.label}: ${percent(item.share)}, ${item.amount}`}
                onPointerEnter={(event) => show(i, event.currentTarget)}
                onPointerLeave={() => setActive(null)}
                onFocus={(event) => show(i, event.currentTarget)}
                onBlur={() => setActive(null)}
                className={`min-w-0 outline-none transition-[filter,translate] duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  i === 0 ? 'rounded-s-lg' : ''
                } ${i === items.length - 1 ? 'rounded-e-lg' : ''} ${active?.index === i ? '-translate-y-0.5 brightness-110' : ''}`}
                style={{ flexGrow: item.share, flexBasis: 0, background: `var(--series-${item.category})` }}
              />
            ))}
          </div>
        </div>

        {activeItem && active && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 text-sm shadow-sm"
            style={{ left: active.left }}
          >
            <p className="font-semibold text-ink">
              {percent(activeItem.share)} · {activeItem.amount}
            </p>
            <p className="flex items-center gap-2 text-muted">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: `var(--series-${activeItem.category})` }} />
              {activeItem.label}
            </p>
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft" aria-hidden>
        {items.map((item) => (
          <li key={item.category} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: `var(--series-${item.category})` }} />
            {item.label} <span className="text-muted">{percent(item.share)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
