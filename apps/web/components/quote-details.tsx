import type { Database } from '@shevent/core/database';
import { formatEventDate, formatPkr, formatPkrPerUnit } from '@shevent/core/format';
import { useTranslations } from 'next-intl';

type Quote = Pick<Database['public']['Tables']['quotes']['Row'], 'amount_pkr' | 'unit' | 'hours' | 'total_pkr' | 'inclusions' | 'exclusions' | 'notes' | 'valid_until'>;

/** A sent quote as both sides see it. */
export function QuoteDetails({ quote }: { quote: Quote }) {
  const t = useTranslations('Inquiry');
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-zinc-600">{t('price')}</dt>
      <dd className="font-medium tabular-nums">
        {formatPkrPerUnit(quote.amount_pkr, quote.unit)}
        {quote.unit === 'per_hour' && quote.hours !== null && <> × {t('hours', { count: quote.hours })}</>}
      </dd>
      <dt className="text-zinc-600">{t('total')}</dt>
      <dd className="font-medium tabular-nums">{formatPkr(quote.total_pkr)}</dd>
      {quote.inclusions.length > 0 && (
        <>
          <dt className="text-zinc-600">{t('includes')}</dt>
          <dd>{quote.inclusions.join(', ')}</dd>
        </>
      )}
      {quote.exclusions.length > 0 && (
        <>
          <dt className="text-zinc-600">{t('excludes')}</dt>
          <dd>{quote.exclusions.join(', ')}</dd>
        </>
      )}
      {quote.notes && (
        <>
          <dt className="text-zinc-600">{t('notes')}</dt>
          <dd className="whitespace-pre-wrap">{quote.notes}</dd>
        </>
      )}
      {quote.valid_until && (
        <>
          <dt className="text-zinc-600">{t('validUntil')}</dt>
          <dd>{formatEventDate(quote.valid_until)}</dd>
        </>
      )}
    </dl>
  );
}
