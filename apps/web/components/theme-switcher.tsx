'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { isThemeChoice, THEME_CHOICES, THEME_STORAGE_KEY, THEME_SWATCHES, type Theme, type ThemeChoice } from '@/lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const ICONS: Record<ThemeChoice, IconName> = { system: 'monitor', light: 'sun', dark: 'moon', sand: 'palette' };

const resolve = (choice: ThemeChoice): Theme => (choice === 'system' ? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light') : choice);

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  const set = () => {
    // Swap every colour at once: with element transitions running, a button's background would
    // still be easing between accents while its text had already switched (unreadable for a moment).
    const pause = document.createElement('style');
    pause.textContent = '*,*::before,*::after{transition:none!important}';
    document.head.appendChild(pause);
    root.dataset.theme = resolve(choice);
    root.dataset.themeChoice = choice;
    void getComputedStyle(root).color; // apply the new colours before transitions come back
    requestAnimationFrame(() => pause.remove());
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A cross-fade where the browser can do it; otherwise switch at once.
  if (document.startViewTransition && !reduced) document.startViewTransition(set);
  else set();
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this page.
  }
}

/** The current choice, read from <html data-theme-choice> (set by the inline script). */
function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(
    (callback) => {
      const observer = new MutationObserver(callback);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-choice'] });
      return () => observer.disconnect();
    },
    () => {
      const value = document.documentElement.dataset.themeChoice;
      return isThemeChoice(value) ? value : 'system';
    },
    () => 'system',
  );
}

function Swatch({ choice }: { choice: ThemeChoice }) {
  if (choice === 'system') {
    return (
      <span aria-hidden className="relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-line-strong">
        <span className="absolute inset-y-0 start-0 w-1/2" style={{ background: THEME_SWATCHES.light.canvas }} />
        <span className="absolute inset-y-0 end-0 w-1/2" style={{ background: THEME_SWATCHES.dark.canvas }} />
      </span>
    );
  }
  const swatch = THEME_SWATCHES[choice];
  return (
    <span aria-hidden className="relative flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-line-strong" style={{ background: swatch.canvas }}>
      <span className="size-2.5 rounded-full" style={{ background: swatch.accent }} />
    </span>
  );
}

/** A small theme menu: System, Light, Dark, Sand. Radio buttons inside a disclosure panel. */
export function ThemeSwitcher() {
  const t = useTranslations('Theme');
  const choice = useThemeChoice();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // "System" keeps following the OS while the page is open.
  useEffect(() => {
    if (choice !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    const sync = () => applyTheme('system');
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [choice]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t('label')}: ${t(choice)}`}
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
      >
        <Icon name={ICONS[choice]} className="size-[1.15rem]" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute end-0 top-full z-50 mt-2 w-56 origin-top-right animate-enter rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
      >
        <fieldset>
          <legend className="px-2.5 pt-1.5 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t('label')}</legend>
          {THEME_CHOICES.map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 text-sm font-medium text-ink transition-colors hover:bg-subtle has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input
                type="radio"
                name={`${panelId}-theme`}
                value={value}
                checked={choice === value}
                onChange={() => applyTheme(value)}
                className="sr-only"
              />
              <Swatch choice={value} />
              <span className="flex-1">{t(value)}</span>
              {choice === value && <Icon name="check" className="size-4" />}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
