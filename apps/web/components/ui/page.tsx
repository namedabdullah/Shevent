import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { Link } from '@/i18n/navigation';

const WIDTHS = { narrow: 'max-w-3xl', default: 'max-w-5xl', wide: 'max-w-6xl' } as const;

/** The <main> of a signed-in page: one width system, one rhythm, one entrance. */
export function Page({ width = 'default', className = '', children }: { width?: keyof typeof WIDTHS; className?: string; children: ReactNode }) {
  return (
    <main id="main" className={`mx-auto flex w-full ${WIDTHS[width]} flex-1 animate-enter flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 ${className}`}>
      {children}
    </main>
  );
}

/** Small uppercase label above a heading, with the gold rule. */
export function Eyebrow({ tone = 'gold', className = '', children }: { tone?: 'gold' | 'night'; className?: string; children: ReactNode }) {
  return (
    <p
      className={`flex items-center gap-2.5 text-xs font-semibold tracking-[0.18em] uppercase ${tone === 'night' ? 'text-gold-200' : 'text-gold-700'} ${className}`}
    >
      <span aria-hidden className={`h-px w-7 ${tone === 'night' ? 'bg-gold-300' : 'bg-gold-500'}`} />
      {children}
    </p>
  );
}

/** "← Back to …" above a page title. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group -ms-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-1 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
    >
      <Icon name="arrowLeft" className="size-4 transition-transform group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}

/** Title block of a signed-in page: optional back link and eyebrow, title, description, actions, meta. */
export function PageHeader({
  back,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Rendered under the title row, e.g. a row of event details. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex max-w-3xl min-w-0 flex-col gap-2.5">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
          {description && <div className="text-base leading-relaxed text-pretty text-sand-700 sm:text-lg">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** A titled block inside a page. The heading id is for aria-labelledby (and some e2e locators). */
export function Section({
  id,
  title,
  description,
  actions,
  className = '',
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={id} className="text-2xl font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sand-700">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A labelled row of facts, e.g. date · guests · area. */
export function MetaList({ items }: { items: { icon: IconName; label: ReactNode; text: ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sand-700">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <dt className="sr-only">{item.label}</dt>
          <Icon name={item.icon} className="size-4 text-gold-500" />
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Card surface classes, for <article>, <li> or <Link> elements that need to keep their own tag. */
export const cardStyles = 'rounded-3xl border border-sand-200 bg-white shadow-card';

/** A card that is also a link: lifts on hover and keeps a clear focus ring. */
export const cardLinkStyles = `${cardStyles} block transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2`;
