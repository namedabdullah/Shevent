import type { Database } from '@shevent/core/database';
import { formatEventDate, formatPkr, formatPkrPerUnit } from '@shevent/core/format';
import { useTranslations } from 'next-intl';

type Quote = Pick<Database['public']['Tables']['quotes']['Row'], 'amount_pkr' | 'unit' | 'hours' | 'total_pkr' | 'inclusions' | 'exclusions' | 'notes' | 'valid_until'>;

const row = 'grid grid-cols-[7rem_1fr] gap-3 py-2.5';

/** A sent quote as both sides see it, laid out like a receipt. */
export function QuoteDetails({ quote }: { quote: Quote }) {
  const t = useTranslations('Inquiry');
  return (
    <dl className="flex flex-col divide-y divide-dashed divide-line text-sm">
      <div className={row}>
        <dt className="text-muted">{t('price')}</dt>
        <dd className="font-medium text-ink tabular-nums">
          {formatPkrPerUnit(quote.amount_pkr, quote.unit)}
          {quote.unit === 'per_hour' && quote.hours !== null && <> × {t('hours', { count: quote.hours })}</>}
        </dd>
      </div>
      <div className={row}>
        <dt className="text-muted">{t('total')}</dt>
        <dd className="font-display text-xl font-semibold text-ink tabular-nums">{formatPkr(quote.total_pkr)}</dd>
      </div>
      {quote.inclusions.length > 0 && (
        <div className={row}>
          <dt className="text-muted">{t('includes')}</dt>
          <dd className="text-ink">{quote.inclusions.join(', ')}</dd>
        </div>
      )}
      {quote.exclusions.length > 0 && (
        <div className={row}>
          <dt className="text-muted">{t('excludes')}</dt>
          <dd className="text-ink">{quote.exclusions.join(', ')}</dd>
        </div>
      )}
      {quote.notes && (
        <div className={row}>
          <dt className="text-muted">{t('notes')}</dt>
          <dd className="whitespace-pre-wrap text-ink">{quote.notes}</dd>
        </div>
      )}
      {quote.valid_until && (
        <div className={row}>
          <dt className="text-muted">{t('validUntil')}</dt>
          <dd className="text-ink">{formatEventDate(quote.valid_until)}</dd>
        </div>
      )}
    </dl>
  );
}
