'use client';

import { createApiClient } from '@shevent/core/api';
import { CATEGORY_UNITS, type Category, type PriceUnit } from '@shevent/core/enums';
import { formatPkr, formatPkrCompact, parsePkr, UNIT_LABELS } from '@shevent/core/format';
import { quoteTotalPkr, splitList, type EventSpec, type QuoteCheckRequest, type QuoteCheckResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import type { QuoteFormState } from '@/app/[locale]/vendor/(dashboard)/inquiries/[id]/actions';
import { FairnessBadge } from '@/components/fairness-badge';
import { Icon } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Field, inputStyles, selectStyles, textareaStyles } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';

const initialState: QuoteFormState = { status: 'idle' };
const PREVIEW_DELAY_MS = 500;

// The browser goes through the /api/ai proxy; with fixtures on it answers from packages/core.
const api = createApiClient({ baseUrl: '/api/ai', fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true', fixtureDelayMs: 0 });

export interface QuoteFormDefaults {
  amount_pkr?: number;
  unit?: PriceUnit;
  hours?: number | null;
  inclusions?: string[];
  exclusions?: string[];
  notes?: string | null;
}

/**
 * The vendor's quote, with a live #5 preview: the same fairness label and "ask about" list the
 * host will see, so the vendor can explain or adjust before sending. The preview never blocks
 * sending.
 */
export function QuoteForm({
  action,
  category,
  spec,
  today,
  defaults = {},
}: {
  action: (state: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
  category: Category;
  /** The event without the host's budget (from inquiry_brief). */
  spec: EventSpec;
  today: string;
  defaults?: QuoteFormDefaults;
}) {
  const t = useTranslations('QuoteForm');
  const [state, formAction, pending] = useActionState(action, initialState);
  const units = CATEGORY_UNITS[category];
  const [amount, setAmount] = useState(defaults.amount_pkr ? String(defaults.amount_pkr) : '');
  const [unit, setUnit] = useState<PriceUnit>(defaults.unit && units.includes(defaults.unit) ? defaults.unit : units[0]!);
  const [hours, setHours] = useState(defaults.hours ? String(defaults.hours) : '');
  const [inclusions, setInclusions] = useState(defaults.inclusions?.join('\n') ?? '');
  const [notes, setNotes] = useState(defaults.notes ?? '');
  const [preview, setPreview] = useState<{ key: string; result: QuoteCheckResponse | 'error' } | null>(null);
  const id = useId();
  const invalid = (field: string) => state.status === 'error' && state.fields.includes(field);

  const parsedAmount = parsePkr(amount);
  const parsedHours = unit === 'per_hour' && hours.trim() !== '' ? Number(hours) : undefined;
  const total = parsedAmount && (unit !== 'per_hour' || parsedHours) ? quoteTotalPkr(parsedAmount, unit, spec.guest_count, parsedHours) : undefined;

  // The preview request as a string, so the effect below runs only when it really changes; null
  // while there is nothing sensible to check yet.
  const previewable = parsedAmount !== undefined && parsedAmount >= 1 && (unit !== 'per_hour' || (parsedHours !== undefined && parsedHours > 0 && parsedHours <= 24));
  const requestKey = previewable
    ? JSON.stringify({
        plan: spec,
        category,
        quoted_pkr: parsedAmount,
        unit,
        hours: parsedHours,
        // Over-long items would fail validation; the server reports them on send instead.
        inclusions: splitList(inclusions).filter((item) => item.length <= 100).slice(0, 50),
        notes: notes.trim() ? notes.trim().slice(0, 2000) : undefined,
      } satisfies QuoteCheckRequest)
    : null;

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .quoteCheck(JSON.parse(requestKey) as QuoteCheckRequest, { signal: controller.signal })
        .then((result) => setPreview({ key: requestKey, result }))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            console.error('Quote preview failed', error);
            setPreview({ key: requestKey, result: 'error' });
          }
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey]);

  const current = preview && preview.key === requestKey ? preview.result : null;

  // onSubmit instead of <form action>, which would clear the form on every submit.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const field = (name: string, label: string, control: ReactNode, hint?: ReactNode, errorKey = name) => (
    <Field
      id={`${id}-${name}`}
      label={label}
      hint={hint}
      hintId={`${id}-${name}-hint`}
      error={invalid(errorKey) ? t(`errors.${errorKey}` as 'errors.unit') : undefined}
    >
      {control}
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          'amount',
          t('amount'),
          <input
            id={`${id}-amount`}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t('amountPlaceholder')}
            required
            aria-invalid={invalid('amount_pkr')}
            aria-describedby={`${id}-amount-hint`}
            className={`${inputStyles} font-semibold tabular-nums placeholder:font-normal`}
          />,
          parsedAmount ? t('amountParsed', { amount: formatPkrCompact(parsedAmount) }) : undefined,
          'amount_pkr',
        )}
        {field(
          'unit',
          t('unit'),
          <select id={`${id}-unit`} name="unit" value={unit} onChange={(event) => setUnit(event.target.value as PriceUnit)} aria-invalid={invalid('unit')} className={selectStyles}>
            {units.map((value) => (
              <option key={value} value={value}>
                {UNIT_LABELS[value]}
              </option>
            ))}
          </select>,
        )}
        {unit === 'per_hour' &&
          field(
            'hours',
            t('hours'),
            <input
              id={`${id}-hours`}
              name="hours"
              type="number"
              inputMode="decimal"
              min={0.5}
              max={24}
              step={0.5}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              required
              aria-invalid={invalid('hours')}
              className={inputStyles}
            />,
          )}
      </div>
      {total !== undefined && (
        <p className="flex animate-enter items-center justify-between gap-3 rounded-2xl bg-subtle px-4 py-3 font-semibold text-ink tabular-nums">
          {t('total', { total: formatPkr(total) })}
        </p>
      )}
      {field(
        'inclusions',
        t('inclusions'),
        <textarea
          id={`${id}-inclusions`}
          name="inclusions"
          rows={3}
          value={inclusions}
          onChange={(event) => setInclusions(event.target.value)}
          aria-invalid={invalid('inclusions')}
          aria-describedby={`${id}-inclusions-hint`}
          className={textareaStyles}
        />,
        t('inclusionsHint'),
      )}
      {field(
        'exclusions',
        t('exclusions'),
        <textarea id={`${id}-exclusions`} name="exclusions" rows={2} defaultValue={defaults.exclusions?.join('\n') ?? ''} aria-invalid={invalid('exclusions')} className={textareaStyles} />,
      )}
      {field(
        'notes',
        t('notes'),
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-invalid={invalid('notes')}
          aria-describedby={`${id}-notes-hint`}
          className={textareaStyles}
        />,
        t('contactHint'),
      )}
      <div className="sm:max-w-xs">
        {field(
          'valid_until',
          t('validUntil'),
          <DateField id={`${id}-valid_until`} name="valid_until" min={today} invalid={invalid('valid_until')} />,
        )}
      </div>
      {/* Above the button, so the vendor sees the label before sending, also on a phone. */}
      <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-3 rounded-2xl border border-dashed border-control bg-subtle/70 p-4">
        <h4 id={`${id}-preview`} className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Icon name="scale" className="size-4.5 text-muted" />
          {t('previewTitle')}
        </h4>
        <div aria-live="polite" className="flex flex-col gap-3">
          {!requestKey ? (
            <p className="text-sm text-muted">{t('previewHint')}</p>
          ) : current === null ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">{t('previewLoading')}</p>
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          ) : current === 'error' ? (
            <p className="text-sm text-muted">{t('previewUnavailable')}</p>
          ) : (
            <>
              <SampleDataNotice response={current} />
              <FairnessBadge check={current} />
            </>
          )}
        </div>
      </section>
      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', block: true })}>
          {pending ? t('sending') : t('send')}
        </SubmitButton>
        <p aria-live="polite" className="text-sm font-medium text-danger">
          {state.status === 'error' && state.error === 'failed' ? t('errors.failed') : null}
        </p>
      </div>
    </form>
  );
}
