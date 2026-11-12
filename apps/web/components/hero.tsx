'use client';

import { CATEGORIES, CATEGORY_LABELS, categorySlug, type Category } from '@shevent/core/enums';
import { createContext, use, useCallback, useEffect, useLayoutEffect, useRef, useState, ViewTransition, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { useReducedMotionPreference } from '@/components/motion';
import { Link } from '@/i18n/navigation';

// The landing hero's moving parts. One event type is "current" at a time: the headline's word, the
// icon beside it and the orbit's highlighted categories all change together, from one state update.
// The orbit's chips link to each category's directory page. Under reduced motion nothing rotates.

const WORD_MS = 2800;

type HeroEvent = { index: number; previous: number | null; turn: number };

const HeroEventContext = createContext<{ event: HeroEvent; advance: (total: number) => void }>({
  event: { index: 0, previous: null, turn: 0 },
  advance: () => {},
});

export function HeroEventProvider({ children }: { children: ReactNode }) {
  const [event, setEvent] = useState<HeroEvent>({ index: 0, previous: null, turn: 0 });
  const advance = useCallback(
    (total: number) => setEvent((current) => ({ index: (current.index + 1) % total, previous: current.index, turn: current.turn + 1 })),
    [],
  );
  return <HeroEventContext value={{ event, advance }}>{children}</HeroEventContext>;
}

/**
 * The headline's changing words ("an event", "a wedding"…) after a small accent pill with that
 * event's icon, then `children` (the punctuation after the word). The word box animates its real
 * width, so the centred line glides to its new position instead of jumping. Words slide, never fade.
 */
export function HeroEventWord({ words, icons, children }: { words: string[]; icons: IconName[]; children?: ReactNode }) {
  const { event, advance } = use(HeroEventContext);
  const { index, previous, turn } = event;
  const reduced = useReducedMotionPreference();
  const measures = useRef<(HTMLSpanElement | null)[]>([]);
  const [widths, setWidths] = useState<number[] | null>(null);

  useEffect(() => {
    if (reduced || words.length < 2) return;
    const timer = setInterval(() => advance(words.length), WORD_MS);
    return () => clearInterval(timer);
  }, [reduced, words.length, advance]);

  // Each word's width, measured once its font has loaded (the observer reports on start and on change).
  useLayoutEffect(() => {
    const spans = measures.current.filter((span): span is HTMLSpanElement => span !== null);
    const observer = new ResizeObserver(() => setWidths(spans.map((span) => span.getBoundingClientRect().width)));
    for (const span of spans) observer.observe(span);
    return () => observer.disconnect();
  }, [words]);

  const moving = previous !== null;
  return (
    <span className="inline-flex items-baseline gap-[0.24em] whitespace-nowrap">
      <span aria-hidden className="relative inline-flex h-[0.78em] w-[1.3em] translate-y-[0.06em] items-center justify-center overflow-hidden rounded-full bg-accent text-on-accent">
        {moving && <Icon key={`out-${turn}`} name={icons[previous] ?? 'sparkles'} strokeWidth={2.4} className="absolute size-[0.42em] animate-[pill-out_0.7s_var(--ease-out-expo)_forwards]" />}
        <Icon key={`in-${turn}`} name={icons[index] ?? 'sparkles'} strokeWidth={2.4} className={`size-[0.42em] ${moving ? 'animate-[pill-in_0.7s_var(--ease-out-expo)_both]' : ''}`} />
      </span>
      <span className="inline-flex items-baseline">
        <span className={`hero-word relative inline-block ${widths ? 'transition-[width] duration-700 ease-[var(--ease-out-expo)]' : ''}`} style={widths ? { width: widths[index] } : undefined}>
          <span className="sr-only">{words[index]}</span>
          {moving && (
            <span key={`out-${turn}`} aria-hidden className="hero-word-ink absolute top-0 left-0 animate-[word-out_0.7s_var(--ease-out-expo)_forwards]">
              {words[previous]}
            </span>
          )}
          <span key={`in-${turn}`} aria-hidden className={`hero-word-ink inline-block ${moving ? 'animate-[word-in_0.7s_var(--ease-out-expo)_both]' : ''}`}>
            {words[index]}
          </span>
          {words.map((word, i) => (
            <span
              key={word}
              ref={(span) => {
                measures.current[i] = span;
              }}
              aria-hidden
              className="pointer-events-none invisible absolute top-0 left-0"
            >
              {word}
            </span>
          ))}
        </span>
        {children}
      </span>
    </span>
  );
}

/**
 * A category chip linking to its directory page (/lahore/[category]); the page slides forward on the
 * way. With `morph`, the chip also carries a view transition name and grows into that page's
 * category pill. Only one chip per category may have it, so the orbit does and the row doesn't.
 */
function CategoryLink({ category, focused, morph = false }: { category: Category; focused: boolean; morph?: boolean }) {
  const chip = (
    <span
      data-focused={focused || undefined}
      className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1.5 ps-1.5 pe-3.5 text-sm font-semibold whitespace-nowrap text-ink-soft shadow-card transition-[background-color,border-color,color,scale,box-shadow] duration-500 ease-[var(--ease-out-expo)] group-hover:border-line-strong group-hover:text-ink group-hover:shadow-lift data-focused:scale-105 data-focused:border-accent-line data-focused:bg-accent-soft data-focused:text-accent-ink"
    >
      <span className="relative flex size-7 items-center justify-center rounded-full bg-subtle text-ink">
        <Icon name={category} className="size-3.5" />
        <span className="absolute -end-0.5 -top-0.5 size-2 rounded-full ring-2 ring-surface" style={{ background: `var(--series-${category})` }} />
      </span>
      {CATEGORY_LABELS[category]}
    </span>
  );
  return (
    <Link href={`/lahore/${categorySlug(category)}`} transitionTypes={['nav-forward']} className="group block rounded-full">
      {morph ? (
        <ViewTransition name={`category-${category}`} share="morph" default="none">
          {chip}
        </ViewTransition>
      ) : (
        chip
      )}
    </Link>
  );
}

/**
 * The six categories travelling slowly along an elliptical orbit drawn around the headline, with a
 * fainter outer ring and two accent satellites for depth. Hovering or focusing a chip holds the
 * orbit still. Wide screens only; globals.css (`.hero-orbit`) also hides it where offset-path
 * isn't supported.
 */
export function CategoryOrbit({ focus, label }: { focus: Category[][]; label: string }) {
  const { index } = use(HeroEventContext).event;
  const current = focus[index] ?? [];
  return (
    <nav aria-label={label} className="hero-orbit pointer-events-none absolute inset-0 select-none">
      <div className="hero-orbit-scroll absolute inset-0">
        <div aria-hidden className="orbit-ring absolute inset-x-[-3%] inset-y-[-6%]" data-faint data-reverse style={{ '--orbit-duration': '64s' } as CSSProperties}>
          <OrbitLine />
          <span className="orbit-traveller" style={{ '--at': '30%' } as CSSProperties}>
            <span className="block size-1.5 rounded-full bg-accent" />
          </span>
        </div>
        <div className="orbit-ring absolute inset-x-[6%] inset-y-[5%]" style={{ '--orbit-duration': '140s' } as CSSProperties}>
          <OrbitLine />
          <span aria-hidden className="orbit-traveller" style={{ '--at': '91%' } as CSSProperties}>
            <span className="block size-2 rounded-full border-2 border-accent bg-canvas" />
          </span>
          {CATEGORIES.map((category, i) => (
            <span
              key={category}
              className="orbit-traveller pointer-events-auto"
              style={{ '--at': `${4 + (i * 100) / CATEGORIES.length}%`, '--chip-delay': `${450 + i * 90}ms` } as CSSProperties}
            >
              <span className="orbit-chip block">
                <CategoryLink category={category} focused={current.includes(category)} morph />
              </span>
            </span>
          ))}
        </div>
      </div>
    </nav>
  );
}

function OrbitLine() {
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="orbit-svg absolute inset-0 size-full overflow-visible">
      <ellipse cx="50" cy="50" rx="50" ry="50" vectorEffect="non-scaling-stroke" className="orbit-line" />
    </svg>
  );
}

/** Phones and tablets: the same six category links as a still row under the form. */
export function CategoryRow({ focus, label }: { focus: Category[][]; label: string }) {
  const { index } = use(HeroEventContext).event;
  const current = focus[index] ?? [];
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((category) => (
          <li key={category}>
            <CategoryLink category={category} focused={current.includes(category)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
