import { formatPkrRange } from '@shevent/core/format';
import { AI_ESTIMATE_LABEL, SPONSORED_LABEL } from '@shevent/core/labels';
import type { Match } from '@shevent/core/schemas';
import { getTranslations } from 'next-intl/server';
import { sendInquiry } from '@/app/[locale]/(app)/plans/[id]/actions';
import { SubmitButton } from '@/components/submit-button';
import { Link } from '@/i18n/navigation';

/** A #3 result: who, why it fits, the #2 price range, and the inquiry button. */
export async function MatchCard({
  match,
  planId,
  inquiryId,
  sponsored = false,
}: {
  match: Match;
  planId: string;
  /** Existing chat with this vendor for this plan, if any. */
  inquiryId?: string;
  sponsored?: boolean;
}) {
  const t = await getTranslations('Matches');
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{match.name}</h3>
          <p className="text-sm text-sand-600">
            {match.base_area}
            {match.price_tier && <> · {t(`tier.${match.price_tier}`)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {sponsored && <span className="rounded-full bg-brand-700 px-2 py-0.5 font-medium text-white">{SPONSORED_LABEL}</span>}
          {match.verified && <span className="rounded-full border border-sand-400 px-2 py-0.5">✓ {t('verified')}</span>}
          {match.is_new && <span className="rounded-full border border-sand-400 px-2 py-0.5">{t('new')}</span>}
        </div>
      </div>

      <p className="text-sm">
        <span className="font-medium">{t('fit', { score: Math.round(match.score * 100) })}</span>
        <span className="text-sand-600">
          {' · '}
          {match.rating ? t('rating', { rating: match.rating, count: match.review_count }) : t('noReviews')}
        </span>
      </p>

      <ul className="flex flex-col gap-1 text-sm text-sand-700">
        {match.reasons.map((reason) => (
          <li key={reason} className="flex gap-2">
            <span aria-hidden className="text-sand-400">•</span>
            {reason}
          </li>
        ))}
      </ul>

      <p className="text-sm">
        <span className="font-medium tabular-nums">{formatPkrRange(match.price_range[0], match.price_range[1])}</span>{' '}
        <span className="text-sand-600">({AI_ESTIMATE_LABEL})</span>
      </p>

      {inquiryId ? (
        <Link href={`/inquiries/${inquiryId}`} className="min-h-11 self-start rounded-lg border border-sand-400 px-4 py-2.5 text-sm font-medium hover:bg-sand-100">
          {t('openChat')}
        </Link>
      ) : (
        <form action={sendInquiry.bind(null, planId, match.vendor_id)}>
          <SubmitButton className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
            {t('sendInquiry')}
          </SubmitButton>
        </form>
      )}
    </article>
  );
}
