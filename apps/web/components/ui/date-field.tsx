'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ToggleEvent } from 'react';
import { Icon } from '@/components/icons';
import { inputStyles } from '@/components/ui/field';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const POPOVER_WIDTH = 304;

// Dates are 'YYYY-MM-DD' strings handled in UTC, like the rest of the app, so a day never shifts.
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const fromIso = (value: string | undefined) => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
};
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const addMonths = (date: Date, months: number) => {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)));
};
const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Our calendar only where it can replace the browser's picker button cleanly, and on mouse/trackpad. */
function useEnhanced() {
  return useSyncExternalStore(
    () => () => {},
    () =>
      'popover' in HTMLElement.prototype &&
      CSS.supports('selector(::-webkit-calendar-picker-indicator)') &&
      window.matchMedia('(pointer: fine)').matches,
    () => false,
  );
}

/**
 * A date input with a themed, animated calendar. The native <input type="date"> holds the value, so
 * typing, validation, form data and phones' own pickers all keep working.
 */
export function DateField({
  id,
  name,
  defaultValue,
  min,
  minToday = false,
  required,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  min?: string;
  /** No days before today in the calendar (for client-rendered forms that can't compute `min`). */
  minToday?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations('DatePicker');
  const enhanced = useEnhanced();
  const popoverId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // What the calendar starts from, captured when it opens (the input's value and today's date).
  const [opened, setOpened] = useState<{ value: string; today: string } | null>(null);

  // Below the field, or above it when there isn't room. Written straight to the element (it follows
  // scrolling), and measured after the calendar has rendered so its real height is known.
  function place() {
    const input = inputRef.current;
    const popover = popoverRef.current;
    if (!input || !popover) return;
    const rect = input.getBoundingClientRect();
    const height = popover.offsetHeight;
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - 8 && rect.top - height - 8 > 8 ? rect.top - height - 8 : below;
    const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.transformOrigin = top < rect.top ? 'bottom right' : 'top right';
  }

  useLayoutEffect(() => {
    if (opened) place();
  }, [opened]);

  function onToggle(event: ToggleEvent<HTMLDivElement>) {
    if (event.newState !== 'open') {
      setOpened(null);
      return;
    }
    setOpened({ value: inputRef.current?.value ?? '', today: toIso(new Date(Date.now() + 5 * 3_600_000)) }); // Lahore, UTC+5
    // Keep it attached to the field while the page scrolls or resizes.
    const follow = () => place();
    window.addEventListener('scroll', follow, { passive: true, capture: true });
    window.addEventListener('resize', follow);
    popoverRef.current?.addEventListener(
      'toggle',
      () => {
        window.removeEventListener('scroll', follow, { capture: true });
        window.removeEventListener('resize', follow);
      },
      { once: true },
    );
  }

  function choose(iso: string) {
    const input = inputRef.current;
    if (!input) return;
    // Set it like a person would, so React and the form both see the change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, iso);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    popoverRef.current?.hidePopover();
    input.focus();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        min={min}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${inputStyles} ${enhanced ? 'date-enhanced pe-12' : ''}`}
      />
      {enhanced && (
        <>
          <button
            type="button"
            popoverTarget={popoverId}
            aria-label={t('open')}
            className={`absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg transition-colors hover:bg-subtle hover:text-ink ${opened ? 'bg-accent-soft text-accent-ink' : 'text-muted'}`}
          >
            <Icon name="calendar" className="size-4.5" />
          </button>
          <div
            ref={popoverRef}
            id={popoverId}
            popover="auto"
            role="dialog"
            aria-label={t('dialog')}
            onToggle={onToggle}
            className="calendar-popover"
            style={{ width: POPOVER_WIDTH }}
          >
            {opened && <Calendar value={opened.value} today={opened.today} min={min ?? (minToday ? opened.today : undefined)} onChoose={choose} />}
          </div>
        </>
      )}
    </div>
  );
}

function Calendar({ value, today, min, onChoose }: { value?: string; today: string; min?: string; onChoose: (iso: string) => void }) {
  const t = useTranslations('DatePicker');
  const selected = fromIso(value);
  const minDate = fromIso(min);
  const start = selected ?? (minDate && toIso(minDate) > today ? minDate : fromIso(today)!);
  const [focus, setFocus] = useState<Date>(start);
  const [direction, setDirection] = useState<'next' | 'previous' | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const monthStart = new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), 1));
  const offset = (monthStart.getUTCDay() + 6) % 7; // Monday first
  const days = Array.from({ length: 42 }, (_, index) => addDays(monthStart, index - offset));
  const canGoBack = !minDate || addMonths(monthStart, -1) >= new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
  const disabled = (date: Date) => Boolean(minDate && date < minDate);

  // Opening the calendar moves keyboard focus onto the chosen (or first available) day.
  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>('[data-focus="true"]')?.focus();
  }, []);

  function move(next: Date) {
    if (next.getUTCMonth() !== focus.getUTCMonth()) setDirection(next > focus ? 'next' : 'previous');
    setFocus(next);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>('[data-focus="true"]')?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -((focus.getUTCDay() + 6) % 7)),
      End: () => addDays(focus, 6 - ((focus.getUTCDay() + 6) % 7)),
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    move(step());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(addMonths(focus, -1))}
          disabled={!canGoBack}
          aria-label={t('previous')}
          className="flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-subtle disabled:opacity-30"
        >
          <Icon name="chevronLeft" className="size-4.5" />
        </button>
        <p aria-live="polite" className="text-sm font-semibold text-ink">
          {monthTitle.format(monthStart)}
        </p>
        <button
          type="button"
          onClick={() => move(addMonths(focus, 1))}
          aria-label={t('next')}
          className="flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-subtle"
        >
          <Icon name="chevronRight" className="size-4.5" />
        </button>
      </div>
      <div aria-hidden className="grid grid-cols-7 text-center text-[0.6875rem] font-semibold tracking-wide text-muted uppercase">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div
        ref={gridRef}
        key={toIso(monthStart)}
        onKeyDown={onKeyDown}
        className={`grid grid-cols-7 gap-1 ${direction === 'next' ? 'animate-[calendar-next_0.3s_var(--ease-out-expo)]' : direction === 'previous' ? 'animate-[calendar-previous_0.3s_var(--ease-out-expo)]' : ''}`}
      >
        {days.map((date) => {
          const iso = toIso(date);
          const outside = date.getUTCMonth() !== monthStart.getUTCMonth();
          const isSelected = selected !== undefined && iso === toIso(selected);
          const isFocus = iso === toIso(focus);
          return (
            <button
              key={iso}
              type="button"
              data-focus={isFocus}
              tabIndex={isFocus ? 0 : -1}
              disabled={disabled(date)}
              aria-pressed={isSelected}
              aria-current={iso === today ? 'date' : undefined}
              aria-label={dayLabel.format(date)}
              onClick={() => onChoose(iso)}
              className={`flex aspect-square items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-30 ${
                isSelected
                  ? 'bg-accent font-semibold text-on-accent'
                  : `hover:bg-subtle ${outside ? 'text-faint' : 'text-ink'} ${iso === today ? 'font-semibold ring-1 ring-accent-line ring-inset' : ''}`
              }`}
            >
              {date.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
