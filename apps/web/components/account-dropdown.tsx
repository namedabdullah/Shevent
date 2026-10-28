'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * The account button and its panel. It closes on Escape, on a click outside and on any page change
 * (the open state remembers the page it was opened on, so no effect has to reset it).
 */
export function AccountDropdown({
  label,
  email,
  signedInAs,
  initial,
  switchLink,
  children,
}: {
  label: string;
  email: string;
  signedInAs: string;
  initial: string;
  switchLink?: { href: string; label: string };
  /** The sign-out form. */
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenOn(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenOn(null);
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
        onClick={() => setOpenOn(open ? null : pathname)}
        className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 ps-1 pe-3 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-subtle"
      >
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent font-display text-sm font-semibold text-on-accent">
          {initial}
        </span>
        <span className="max-[399px]:sr-only">{label}</span>
        <Icon name="chevronDown" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute end-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] origin-top-right animate-enter rounded-2xl border border-line bg-surface p-2 shadow-lift"
      >
        <div className="border-b border-line px-3 pt-2 pb-3">
          <p className="text-xs text-muted">{signedInAs}</p>
          <p className="truncate text-sm font-medium text-ink" title={email}>
            {email}
          </p>
        </div>
        <div className="flex flex-col gap-1 pt-2">
          {switchLink && (
            <Link
              href={switchLink.href}
              onClick={() => setOpenOn(null)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink hover:bg-subtle"
            >
              <Icon name="switch" className="size-4 text-accent-ink" />
              {switchLink.label}
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
