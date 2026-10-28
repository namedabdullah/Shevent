'use client';

import { CATEGORY_LABELS, type Category } from '@shevent/core/enums';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon, type IconName } from '@/components/icons';

export interface EventCard {
  title: string;
  note: string;
  icon: IconName;
  categories: Category[];
}

const CYCLE_MS = 3200;
const LEAVE_MS = 520;
const VISIBLE = 3;

const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

/**
 * A stack of event cards that deals itself: every few seconds the front card slides away and goes to
 * the back. Decorative (the event types are real; there are no numbers on it). Still under reduced motion.
 */
export function EventStack({ cards }: { cards: EventCard[] }) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  );
  // `dealt` counts finished cycles; the front card is the one `dealt` places first.
  const [dealt, setDealt] = useState(0);
  const [leavingFront, setLeavingFront] = useState(false);
  const order = cards.map((_, position) => (position + dealt) % cards.length);
  const leaving = leavingFront ? order[0] : null;

  useEffect(() => {
    if (reduced || cards.length < 2) return;
    let timeout: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setLeavingFront(true);
      timeout = setTimeout(() => {
        setDealt((count) => count + 1);
        setLeavingFront(false);
      }, LEAVE_MS);
    }, CYCLE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [reduced, cards.length]);

  return (
    <div aria-hidden className="relative mx-auto aspect-[5/4] w-full max-w-md overflow-hidden px-3 select-none">
      {cards.map((card, index) => {
        const depth = order.indexOf(index);
        const isLeaving = leaving === index;
        // Cards never fade (they carry text, and contrast is checked even on decorative text): the
        // front card slides out of the clipped stack and cards deeper than VISIBLE are simply hidden.
        const transform = isLeaving
          ? 'translate3d(0, 125%, 0) rotate(-6deg)'
          : `translate3d(0, ${depth * -16}px, 0) scale(${1 - depth * 0.055})`;
        return (
          <article
            key={card.title}
            className="absolute inset-x-3 bottom-8 flex h-[80%] flex-col justify-between rounded-[1.75rem] border border-line bg-surface p-6 shadow-lift transition-transform duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)] sm:p-8"
            style={{
              transform,
              transformOrigin: 'top center',
              zIndex: cards.length - depth + (isLeaving ? cards.length : 0),
              visibility: !isLeaving && depth >= VISIBLE ? 'hidden' : 'visible',
            }}
          >
            <div className="flex items-start justify-between">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                <Icon name={card.icon} className="size-6" />
              </span>
              <span className="font-mono text-xs text-muted tabular-nums">
                {String(index + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-display text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">{card.title}</p>
              <p className="text-ink-soft">{card.note}</p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {card.categories.map((category) => (
                <li key={category} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft">
                  <span className="size-2 rounded-full" style={{ background: `var(--series-${category})` }} />
                  {CATEGORY_LABELS[category]}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
