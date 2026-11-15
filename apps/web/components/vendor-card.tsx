import { EVENT_TYPE_LABELS, VENUE_TYPE_LABELS, type EventType, type VenueType } from '@shevent/core/enums';
import { getTranslations } from 'next-intl/server';
import { ViewTransition, type CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import type { DirectoryVendor } from '@/lib/directory';

/** Spreads the cover's glow per vendor, so neighbouring cards in one category don't look identical. */
export function coverSpot(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { x: 12 + (hash % 76), y: 10 + ((hash >>> 8) % 60) };
}

const TIER_LEVEL = { budget: 1, mid: 2, premium: 3 } as const;

/** Three rising bars, filled up to the price tier. Decorative: always shown next to the tier's name. */
export function PriceMeter({ tier }: { tier: keyof typeof TIER_LEVEL }) {
  const level = TIER_LEVEL[tier];
  return (
    <span aria-hidden className="flex items-end gap-0.5">
      {[1, 2, 3].map((step) => (
        <span key={step} className={`w-1 rounded-full ${step <= level ? 'bg-accent' : 'bg-line-strong'}`} style={{ height: `${6 + step * 3}px` }} />
      ))}
    </span>
  );
}

/** Five stars filled to the nearest whole rating, read out as `label` ("4.5 out of 5"). */
export function Stars({ rating, label, size = 'md' }: { rating: number; label: string; size?: 'sm' | 'md' }) {
  const filled = Math.round(rating);
  return (
    <span role="img" aria-label={label} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((step) => (
        <Icon
          key={step}
          name="star"
          className={`${size === 'sm' ? 'size-3.5' : 'size-4.5'} ${step <= filled ? 'fill-current text-accent-ink' : 'text-line-strong'}`}
        />
      ))}
    </span>
  );
}

const FACT_COLUMNS = ['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3'];
const MAX_EVENTS = 3;

/**
 * A vendor in the public directory (/lahore/[category]). The name links to their profile
 * (/vendors/[slug]); the link's hit area stretches over the whole card, so anywhere on it opens the
 * profile, and the monogram morphs into the profile's.
 */
export async function VendorCard({ vendor }: { vendor: DirectoryVendor }) {
  const [t, tTier] = await Promise.all([getTranslations('Directory'), getTranslations('Matches.tier')]);
  const venueType = vendor.sub_type && vendor.sub_type in VENUE_TYPE_LABELS ? VENUE_TYPE_LABELS[vendor.sub_type as VenueType] : null;
  const area = vendor.base_area === 'Other' ? t('anyArea') : vendor.base_area;
  const capacity =
    vendor.capacity_min && vendor.capacity_max
      ? `${vendor.capacity_min}–${vendor.capacity_max}`
      : vendor.capacity_max
        ? t('upTo', { max: vendor.capacity_max })
        : vendor.capacity_min
          ? t('from', { min: vendor.capacity_min })
          : null;
  const facts = [
    capacity && { value: capacity, label: t('guests') },
    vendor.areas_served.length > 0 && { value: String(vendor.areas_served.length), label: t('areasServed', { count: vendor.areas_served.length }) },
    vendor.years_active !== null && { value: String(vendor.years_active), label: t('yearsActive', { count: vendor.years_active }) },
  ].filter((fact): fact is { value: string; label: string } => Boolean(fact));
  const events = vendor.event_types.map((type) => EVENT_TYPE_LABELS[type as EventType] ?? type);
  const spot = coverSpot(vendor.id);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[translate,border-color,box-shadow] duration-200 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:-translate-y-1 hover:border-line-strong hover:shadow-lift motion-reduce:hover:translate-y-0">
      {/* A cover in the category's colour until vendors have verified portfolio photos (#7). */}
      <div
        aria-hidden
        className="vendor-cover relative h-24 overflow-hidden transition-[filter] duration-300 group-hover:saturate-150"
        style={{ '--series': `var(--series-${vendor.category})`, '--spot-x': `${spot.x}%`, '--spot-y': `${spot.y}%` } as CSSProperties}
      />
      {(vendor.verified || vendor.is_demo) && (
        <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap gap-1.5">
          {vendor.verified && (
            <Badge tone="success" icon="shield">
              {t('verified')}
            </Badge>
          )}
          {vendor.is_demo && (
            <Badge tone="warning" className="ms-auto">
              {t('demo')}
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <div className="flex items-end justify-between gap-3">
          <ViewTransition name={`vendor-mark-${vendor.id}`} share="morph" default="none">
            <span
              aria-hidden
              className="relative -mt-8 flex size-16 items-center justify-center rounded-2xl border-4 border-surface bg-accent-soft font-display text-2xl font-semibold text-accent-ink shadow-card"
            >
              {vendor.name.trim().charAt(0).toUpperCase()}
            </span>
          </ViewTransition>
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition-[background-color,border-color,color,translate] duration-200 group-hover:translate-x-0.5 group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent"
          >
            <Icon name="arrowRight" className="size-4" />
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-lg leading-snug font-semibold text-balance">
            <Link
              href={`/vendors/${vendor.slug}`}
              transitionTypes={['nav-forward']}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
              {vendor.name}
            </Link>
          </h3>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <Icon name="mapPin" className="size-3.5" />
            {area}
            {venueType && <> · {venueType}</>}
          </p>
        </div>

        {vendor.description && <p className="line-clamp-2 text-sm leading-relaxed text-ink-soft">{vendor.description}</p>}

        {facts.length > 0 && (
          <dl className={`grid divide-x divide-line rounded-xl border border-line bg-subtle/60 ${FACT_COLUMNS[facts.length]}`}>
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col-reverse gap-0.5 px-3 py-2.5">
                <dt className="text-xs text-muted">{fact.label}</dt>
                <dd className="font-semibold text-ink tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {events.length > 0 && (
          <ul aria-label={t('eventsLabel')} className="flex flex-wrap gap-1.5">
            {events.slice(0, MAX_EVENTS).map((event) => (
              <li key={event} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-soft">
                {event}
              </li>
            ))}
            {events.length > MAX_EVENTS && (
              <li className="rounded-full px-1.5 py-1 text-xs font-medium text-muted">{t('moreEvents', { count: events.length - MAX_EVENTS })}</li>
            )}
          </ul>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5 text-sm">
          {vendor.rating !== null && vendor.reviewCount > 0 ? (
            <p className="flex items-center gap-1.5">
              <Icon name="star" className="size-4 fill-current text-accent-ink" />
              <span className="font-semibold text-ink">{t('rating', { rating: vendor.rating.toFixed(1), count: vendor.reviewCount })}</span>
            </p>
          ) : (
            <p className="text-muted">{t('noReviews')}</p>
          )}
          {vendor.price_tier && (
            <p className="flex items-center gap-2 font-medium text-ink-soft">
              <PriceMeter tier={vendor.price_tier} />
              {tTier(vendor.price_tier)}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
