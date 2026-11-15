'use client';

import { Icon, type IconName } from '@/components/icons';
import { Link, usePathname } from '@/i18n/navigation';

export interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  /** Other paths that belong to this section, e.g. an inquiry opened from a plan. */
  also?: string[];
  /** Only the exact path counts, for a section root such as /vendor. */
  exact?: boolean;
}

function isCurrent(link: NavLink, pathname: string | null) {
  if (!pathname) return false;
  if (link.exact) return pathname === link.href;
  return [link.href, ...(link.also ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * The area's main links: inline in the header from `md` up ("bar"), and as a full-width row of
 * tabs on phones ("tabs"). Server-rendered with no current page; <NavLinks> marks the current one.
 * `locked` (with its reason) shows the links as unavailable text instead, for sections the account
 * can't open yet: a vendor without a listing would only be sent back to onboarding.
 */
export function NavLinkList({
  links,
  variant,
  label,
  pathname = null,
  locked,
}: {
  links: NavLink[];
  variant: 'bar' | 'tabs';
  label: string;
  pathname?: string | null;
  locked?: string;
}) {
  const tabs = variant === 'tabs';
  const base = tabs
    ? 'flex min-h-13 flex-col items-center justify-center gap-0.5 border-b-2 px-1 text-xs font-semibold transition-colors'
    : 'flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors';
  return (
    <nav aria-label={label} className={tabs ? 'border-t border-line md:hidden' : 'hidden md:block'}>
      <ul className={tabs ? 'mx-auto flex max-w-5xl px-2' : 'flex items-center gap-1'}>
        {links.map((link) => {
          if (locked) {
            return (
              <li key={link.href} className={tabs ? 'flex-1' : undefined}>
                <span aria-disabled="true" title={locked} className={`${base} cursor-not-allowed text-muted ${tabs ? 'border-transparent' : ''}`}>
                  <Icon name="lock" className={tabs ? 'size-5' : 'size-4'} />
                  {link.label}
                  <span className="sr-only">({locked})</span>
                </span>
              </li>
            );
          }
          const current = isCurrent(link, pathname);
          return (
            <li key={link.href} className={tabs ? 'flex-1' : undefined}>
              <Link
                href={link.href}
                aria-current={current ? 'page' : undefined}
                className={
                  tabs
                    ? `${base} ${current ? 'border-accent text-accent-ink' : 'border-transparent text-muted hover:text-ink'}`
                    : `${base} ${current ? 'bg-accent text-on-accent shadow-sm' : 'text-ink-soft hover:bg-subtle hover:text-ink'}`
                }
              >
                <Icon name={link.icon} className={tabs ? 'size-5' : 'size-4'} />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function NavLinks(props: { links: NavLink[]; variant: 'bar' | 'tabs'; label: string; locked?: string }) {
  return <NavLinkList {...props} pathname={usePathname()} />;
}
