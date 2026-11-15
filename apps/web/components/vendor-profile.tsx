import { CATEGORY_LABELS, EVENT_TYPE_LABELS, VENUE_TYPE_LABELS, categorySlug, type EventType, type VenueType } from '@shevent/core/enums';
import { getLocale, getTranslations } from 'next-intl/server';
import { ViewTransition, type CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Eyebrow } from '@/components/ui/page';
import { coverSpot, PriceMeter, Stars } from '@/components/vendor-card';
import { Link } from '@/i18n/navigation';
import { getSiteUrl } from '@/lib/site';
import { isIndexableProfile, type VendorProfileData } from '@/lib/vendor-profile';

// A vendor's public profile (/vendors/[slug]): header, about, inclusions, events, reviews, and an
// "at a glance" aside with the way to contact them (through a plan, since inquiries belong to one).
// Presentation only; the page fetches.

/** The whole profile below the page's container. */
export async function VendorProfile({ profile }: { profile: VendorProfileData }) {
  const { vendor, rating, reviewCount, distribution, reviews } = profile;
  const [t, tDir, tTier, locale] = await Promise.all([
    getTranslations('PublicProfile'),
    getTranslations('Directory'),
    getTranslations('Matches.tier'),
    getLocale(),
  ]);
  const categoryLabel = CATEGORY_LABELS[vendor.category];
  const venueType = vendor.sub_type && vendor.sub_type in VENUE_TYPE_LABELS ? VENUE_TYPE_LABELS[vendor.sub_type as VenueType] : null;
  const area = vendor.base_area === 'Other' ? tDir('anyArea') : vendor.base_area;
  const capacity =
    vendor.capacity_min && vendor.capacity_max
      ? `${vendor.capacity_min}–${vendor.capacity_max}`
      : vendor.capacity_max
        ? tDir('upTo', { max: vendor.capacity_max })
        : vendor.capacity_min
          ? tDir('from', { min: vendor.capacity_min })
          : null;
  const events = vendor.event_types.map((type) => EVENT_TYPE_LABELS[type as EventType] ?? type);
  const inclusions = vendor.inclusions.map((item) => item.trim()).filter(Boolean);
  const spot = coverSpot(vendor.id);
  const directoryHref = `/lahore/${categorySlug(vendor.category)}`;
  const planHref = `/plan/new?services=${vendor.category}`;
  const date = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  const notListed = <span className="font-normal text-muted">{t('notListed')}</span>;

  return (
    <>
      {isIndexableProfile(vendor) && <LocalBusinessJsonLd profile={profile} />}

      <Link
        href={directoryHref}
        transitionTypes={['nav-back']}
        className="group -ms-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-1 text-sm font-semibold text-accent-ink"
      >
        <Icon name="arrowLeft" className="size-4 transition-transform group-hover:-translate-x-0.5" />
        {t('back', { title: tDir(`titles.${vendor.category}`) })}
      </Link>

      <header className="flex flex-col">
        <div
          aria-hidden
          className="vendor-cover relative h-36 overflow-hidden rounded-[1.75rem] border border-line sm:h-48 md:h-56"
          style={{ '--series': `var(--series-${vendor.category})`, '--spot-x': `${spot.x}%`, '--spot-y': `${spot.y}%` } as CSSProperties}
        />
        <div className="flex flex-col gap-4 px-2 sm:px-6">
          <ViewTransition name={`vendor-mark-${vendor.id}`} share="morph" default="none">
            <span
              aria-hidden
              className="relative -mt-12 flex size-24 shrink-0 items-center justify-center rounded-[1.75rem] border-4 border-canvas bg-accent-soft font-display text-4xl font-semibold text-accent-ink shadow-card sm:-mt-14 sm:size-28"
            >
              {vendor.name.trim().charAt(0).toUpperCase()}
            </span>
          </ViewTransition>
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent" icon={vendor.category}>
                  {categoryLabel}
                </Badge>
                {vendor.verified && (
                  <Badge tone="success" icon="shield">
                    {tDir('verified')}
                  </Badge>
                )}
                {vendor.is_demo && <Badge tone="warning">{tDir('demo')}</Badge>}
              </div>
              <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{vendor.name}</h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <Icon name="mapPin" className="size-4 text-muted" />
                  {area}
                  {venueType && <> · {venueType}</>}
                </span>
                {rating !== null && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="star" className="size-4 fill-current text-accent-ink" />
                    <span className="font-semibold text-ink">{rating.toFixed(1)}</span>
                    <span className="text-muted">({t('reviewCount', { count: reviewCount })})</span>
                  </span>
                )}
              </p>
            </div>
            <Link href={planHref} className={`${buttonStyles({ size: 'lg' })} shrink-0 self-start whitespace-nowrap md:self-auto`}>
              {t('contactAction')}
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      {vendor.is_demo && (
        <Notice tone="warning" role="note" title={t('demoTitle')}>
          {t('demo')}
        </Notice>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="about" className="flex flex-col gap-3">
            <h2 id="about" className="text-xl font-semibold">
              {t('about')}
            </h2>
            {vendor.description?.trim() ? (
              <p className="max-w-prose text-lg leading-relaxed whitespace-pre-line text-pretty text-ink-soft">{vendor.description.trim()}</p>
            ) : (
              <p className="text-muted">{t('noDescription')}</p>
            )}
          </section>

          {inclusions.length > 0 && (
            <section aria-labelledby="included" className="flex flex-col gap-4">
              <h2 id="included" className="text-xl font-semibold">
                {t('included')}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-soft">
                    <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                      <Icon name="check" className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {events.length > 0 && (
            <section aria-labelledby="events" className="flex flex-col gap-4">
              <h2 id="events" className="text-xl font-semibold">
                {t('events')}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {events.map((event) => (
                  <li key={event} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink-soft">
                    {event}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="reviews" className="flex flex-col gap-5">
            <h2 id="reviews" className="text-xl font-semibold">
              {t('reviews')}
            </h2>
            {rating === null ? (
              <div className="flex items-start gap-4 rounded-2xl border border-dashed border-line-strong p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
                  <Icon name="star" className="size-5" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="font-semibold">{t('noReviewsTitle')}</p>
                  <p className="text-sm leading-relaxed text-ink-soft">{t('noReviews')}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-6 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-6">
                  <div className="flex flex-col gap-1.5">
                    <p className="font-display text-5xl font-semibold tracking-tight tabular-nums">{rating.toFixed(1)}</p>
                    <Stars rating={rating} label={t('ratingOutOf', { rating: rating.toFixed(1) })} />
                    <p className="text-sm text-muted">{t('reviewCount', { count: reviewCount })}</p>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {distribution.map((count, index) => {
                      const stars = 5 - index;
                      return (
                        <li key={stars} className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                          <span className="sr-only">{t('starsRow', { stars, count })}</span>
                          <span aria-hidden className="font-medium text-ink-soft tabular-nums">
                            {stars}★
                          </span>
                          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-sunken">
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${(count / reviewCount) * 100}%` }} />
                          </span>
                          <span aria-hidden className="text-end text-muted tabular-nums">
                            {count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {reviews.length === 0 ? (
                  <p className="text-sm text-muted">{t('noWrittenReviews')}</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-semibold text-muted">{t('latest')}</h3>
                    <ul className="grid gap-3 md:grid-cols-2">
                      {reviews.map((review) => (
                        <li key={review.id}>
                          <figure className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                            <Stars rating={review.rating} label={t('ratingOutOf', { rating: review.rating })} size="sm" />
                            <blockquote className="flex-1 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                              <p className="line-clamp-6">{review.body}</p>
                            </blockquote>
                            <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                              <span className="font-medium text-ink-soft">
                                {review.source === 'booking' ? t('sourceBooking') : t('sourceImported')}
                              </span>
                              <span aria-hidden>·</span>
                              <time dateTime={review.created_at}>{date.format(new Date(review.created_at))}</time>
                            </figcaption>
                          </figure>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-24 lg:order-none">
          <section aria-labelledby="glance" className="rounded-2xl border border-line bg-surface p-5">
            <h2 id="glance" className="mb-2 text-sm font-semibold text-muted">
              {t('glance')}
            </h2>
            <dl className="flex flex-col divide-y divide-line text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-ink-soft">
                  <Icon name="wallet" className="size-4 text-muted" />
                  {t('price')}
                </dt>
                <dd className="flex items-center gap-2 font-semibold">
                  {vendor.price_tier ? (
                    <>
                      <PriceMeter tier={vendor.price_tier} />
                      {tTier(vendor.price_tier)}
                    </>
                  ) : (
                    notListed
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-ink-soft">
                  <Icon name="users" className="size-4 text-muted" />
                  {t('guests')}
                </dt>
                <dd className="font-semibold tabular-nums">{capacity ?? notListed}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-ink-soft">
                  <Icon name="mapPin" className="size-4 text-muted" />
                  {t('basedIn')}
                </dt>
                <dd className="font-semibold">{area}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2 text-ink-soft">
                  <Icon name="calendar" className="size-4 text-muted" />
                  {t('experience')}
                </dt>
                <dd className="font-semibold tabular-nums">{vendor.years_active !== null ? t('years', { count: vendor.years_active }) : notListed}</dd>
              </div>
              <div className="flex flex-col gap-2.5 py-3">
                <dt className="text-ink-soft">{t('areas')}</dt>
                <dd>
                  {vendor.areas_served.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {vendor.areas_served.map((served) => (
                        <li key={served} className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-ink-soft">
                          {served === 'Other' ? tDir('anyArea') : served}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    notListed
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="contact" className="scope-inverse hidden flex-col gap-3 rounded-2xl bg-canvas p-5 text-ink lg:flex">
            <Eyebrow>{tDir('ctaEyebrow')}</Eyebrow>
            <h2 id="contact" className="text-lg font-semibold">
              {t('contactTitle')}
            </h2>
            <p className="text-sm leading-relaxed text-ink-soft">{t('contactBody')}</p>
            <Link href={planHref} className={`${buttonStyles()} mt-1 self-start`}>
              {t('contactAction')}
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

/** Structured data for search engines (WEB_APP_PLAN §5.1). Only on indexable profiles. */
function LocalBusinessJsonLd({ profile }: { profile: VendorProfileData }) {
  const { vendor, rating, reviewCount } = profile;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: vendor.name,
    url: `${getSiteUrl()}/vendors/${vendor.slug}`,
    ...(vendor.description ? { description: vendor.description } : {}),
    address: { '@type': 'PostalAddress', addressLocality: 'Lahore', addressRegion: 'Punjab', addressCountry: 'PK' },
    areaServed: vendor.areas_served.filter((served) => served !== 'Other').map((served) => ({ '@type': 'Place', name: `${served}, Lahore` })),
    ...(rating !== null ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount } } : {}),
  };
  // "<" escaped so a vendor's text can't close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
