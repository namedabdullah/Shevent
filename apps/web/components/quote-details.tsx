import type { Database } from '@shevent/core/database';
import { formatEventDate, formatPkr, formatPkrPerUnit } from '@shevent/core/format';
import { useTranslations } from 'next-intl';

type Quote = Pick<Database['public']['Tables']['quotes']['Row'], 'amount_pkr' | 'unit' | 'hours' | 'total_pkr' | 'inclusions' | 'exclusions' | 'notes' | 'valid_until'>;

const row = 'grid grid-cols-[7rem_1fr] gap-3 py-2.5';

/** A sent quote as both sides see it, laid out like a receipt. */
export function QuoteDetails({ quote }: { quote: Quote }) {
  const t = useTranslations('Inquiry');
  return (
    <dl className="flex flex-col divide-y divide-dashed divide-sand-200 text-sm">
      <div className={row}>
        <dt className="text-sand-600">{t('price')}</dt>
        <dd className="font-medium text-sand-900 tabular-nums">
          {formatPkrPerUnit(quote.amount_pkr, quote.unit)}
          {quote.unit === 'per_hour' && quote.hours !== null && <> × {t('hours', { count: quote.hours })}</>}
        </dd>
      </div>
      <div className={row}>
        <dt className="text-sand-600">{t('total')}</dt>
        <dd className="font-display text-xl font-semibold text-sand-900 tabular-nums">{formatPkr(quote.total_pkr)}</dd>
      </div>
      {quote.inclusions.length > 0 && (
        <div className={row}>
          <dt className="text-sand-600">{t('includes')}</dt>
          <dd className="text-sand-800">{quote.inclusions.join(', ')}</dd>
        </div>
      )}
      {quote.exclusions.length > 0 && (
        <div className={row}>
          <dt className="text-sand-600">{t('excludes')}</dt>
          <dd className="text-sand-800">{quote.exclusions.join(', ')}</dd>
        </div>
      )}
      {quote.notes && (
        <div className={row}>
          <dt className="text-sand-600">{t('notes')}</dt>
          <dd className="whitespace-pre-wrap text-sand-800">{quote.notes}</dd>
        </div>
      )}
      {quote.valid_until && (
        <div className={row}>
          <dt className="text-sand-600">{t('validUntil')}</dt>
          <dd className="text-sand-800">{formatEventDate(quote.valid_until)}</dd>
        </div>
      )}
    </dl>
  );
}
