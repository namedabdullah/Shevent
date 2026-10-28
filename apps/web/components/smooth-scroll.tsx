'use client';

import Lenis from 'lenis';
import { useEffect, useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';

// Smooth, inertial scrolling for the marketing pages (Lenis), plus section links and a scroll-spy
// that use it. Off when the visitor prefers reduced motion; touch scrolling stays native.

let lenis: Lenis | null = null;

/** Mount once in a layout. Mouse-wheel and trackpad scrolling glide instead of stepping. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    lenis = new Lenis({ autoRaf: true, lerp: 0.11, wheelMultiplier: 0.95 });
    return () => {
      lenis?.destroy();
      lenis = null;
    };
  }, []);
  return null;
}

const HEADER_OFFSET = -76;

/** Glide to a section on this page and put its id in the address bar. */
export function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return false;
  if (lenis) lenis.scrollTo(target, { offset: HEADER_OFFSET, duration: 1.1 });
  else target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  history.pushState(null, '', `#${id}`);
  return true;
}

/**
 * A link to a section of the landing page. On the landing page it glides there; from any other page
 * it's an ordinary link to "/#section".
 */
export function SectionLink({ hash, className, children, ...props }: { hash: string; className?: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) {
  const pathname = usePathname();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (pathname === '/' && scrollToSection(hash)) event.preventDefault();
  };
  return (
    <a {...props} href={pathname === '/' ? `#${hash}` : `/#${hash}`} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

/** Which of these section ids is mostly on screen (for marking the header link as current). */
export function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(' ');
  useEffect(() => {
    const ids = key.split(' ');
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        let best: string | null = null;
        let ratio = 0;
        for (const [id, value] of visible) {
          if (value > ratio) {
            best = id;
            ratio = value;
          }
        }
        setActive(best);
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/** The landing page's section links, with the section on screen marked as the current location. */
export function SectionNav({ label, links }: { label: string; links: { hash: string; label: string }[] }) {
  const pathname = usePathname();
  const active = useActiveSection(links.map((link) => link.hash));
  return (
    <nav aria-label={label} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {links.map((link) => {
          const current = pathname === '/' && active === link.hash;
          return (
            <li key={link.hash}>
              <SectionLink
                hash={link.hash}
                aria-current={current ? 'location' : undefined}
                className={`relative inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${current ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {link.label}
                <span
                  aria-hidden
                  className={`absolute inset-x-3.5 bottom-1.5 h-px origin-left bg-accent transition-transform duration-300 ${current ? 'scale-x-100' : 'scale-x-0'}`}
                />
              </SectionLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
