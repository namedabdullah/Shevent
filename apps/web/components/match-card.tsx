import { formatPkrRange } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, SPONSORED_LABEL } from '@shevent/core/labels';
import type { Match } from '@shevent/core/schemas';
import { getTranslations } from 'next-intl/server';
import { sendInquiry } from '@/app/[locale]/(app)/plans/[id]/actions';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { Badge } from '@/components/ui/badge';
import { buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

/** A #3 result: who, why it fits, the #2 price range, and the inquiry button. */
export async function MatchCard({
  match,
  planId,
  inquiryId,
  rank,
  sponsored = false,
}: {
  match: Match;
  planId: string;
  /** Existing chat with this vendor for this plan, if any. */
  inquiryId?: string;
  /** Position in the organic ranking; sponsored cards have none. */
  rank?: number;
  sponsored?: boolean;
}) {
  const t = await getTranslations('Matches');
  const score = Math.round(match.score * 100);
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-card">
      <div className="flex items-start gap-3.5">
        {/* A monogram until vendors have verified portfolio photos (#7). */}
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-display text-lg font-semibold text-accent-ink">
          {match.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-lg leading-snug font-semibold">{match.name}</h3>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <Icon name="mapPin" className="size-3.5 text-muted" />
            {match.base_area}
            {match.price_tier && <> · {t(`tier.${match.price_tier}`)}</>}
          </p>
        </div>
        {/* The list order already says the rank; the numeral is decoration. */}
        {rank !== undefined && (
          <span aria-hidden className="font-display text-2xl leading-none text-faint italic">
            {rank}
          </span>
        )}
      </div>

      {(sponsored || match.verified || match.is_new) && (
        <div className="flex flex-wrap gap-1.5">
          {sponsored && (
            <Badge tone="solid" icon="tag">
              {SPONSORED_LABEL}
            </Badge>
          )}
          {match.verified && (
            <Badge tone="success" icon="shield">
              {t('verified')}
            </Badge>
          )}
          {match.is_new && <Badge tone="accent">{t('new')}</Badge>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="font-semibold text-ink">{t('fit', { score })}</span>
          <span className="flex items-center gap-1 text-muted">
            {match.rating ? (
              <>
                <Icon name="star" className="size-3.5 fill-current text-accent-ink" />
                {t('rating', { rating: match.rating, count: match.review_count })}
              </>
            ) : (
              t('noReviews')
            )}
          </span>
        </p>
        <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-subtle">
          <span className="block h-full origin-left animate-[draw_0.9s_var(--ease-out-expo)_both] rounded-full bg-accent" style={{ width: `${score}%` }} />
        </span>
      </div>

      <ul className="flex flex-col gap-1.5 text-sm text-ink-soft">
        {match.reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <Icon name="check" className="mt-0.5 size-4 text-success" />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
        <p className="flex flex-col">
          <span className="font-display text-lg font-semibold text-ink tabular-nums">{formatPkrRange(match.price_range[0], match.price_range[1])}</span>
          <span className="text-xs text-muted">({AI_ESTIMATE_LABEL})</span>
        </p>
        {inquiryId ? (
          <Link href={`/inquiries/${inquiryId}`} className={buttonStyles({ variant: 'secondary', size: 'sm' })}>
            <Icon name="message" className="size-4" />
            {t('openChat')}
          </Link>
        ) : (
          <form action={sendInquiry.bind(null, planId, match.vendor_id)}>
            <SubmitButton className={buttonStyles({ size: 'sm' })}>{t('sendInquiry')}</SubmitButton>
          </form>
        )}
      </div>
    </article>
  );
}
