'use client';

import { createApiClient } from '@shevent/core/api';
import { AREAS, EVENT_TYPES, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatPkrCompact, parsePkr, todayInLahore } from '@shevent/core/format';
import { estimateRequestSchema, type EstimateRequest, type EstimateResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BudgetSplit } from '@/components/budget-split';
import { Icon } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { Link } from '@/i18n/navigation';
import { track } from '@/lib/analytics';

// The browser goes through the /api/ai proxy; with fixtures on it answers from packages/core.
const api = createApiClient({ baseUrl: '/api/ai', fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true' });

const inputClass =
  'min-h-11 w-full rounded-lg border border-sand-400 bg-white px-3 text-base text-sand-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-invalid:border-red-600';

type Result = { request: EstimateRequest; budgetText: string; estimate: EstimateResponse };

/**
 * The landing page's "Try it" (#1 + #2, no sign-up). "See vendors for this plan" opens the planner
 * with the same answers in the URL; signed-out visitors go through sign-in and keep them.
 */
export function TryWidget() {
  const t = useTranslations('TryWidget');
  const tp = useTranslations('Planner');
  const id = useId();
  const [budget, setBudget] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const parsedBudget = parsePkr(budget);

  // Move to the answer once it arrives, so keyboard and screen-reader users land on it too.
  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const parsed = estimateRequestSchema.safeParse({
      event_type: text('event_type'),
      guest_count: Number(text('guest_count')),
      area: text('area'),
      event_date: text('event_date'),
      total_budget_pkr: parsePkr(text('budget')) ?? Number.NaN,
    });
    const fields = parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    if (parsed.success && parsed.data.event_date < todayInLahore()) fields.push('event_date');
    setInvalid(fields);
    setFailed(false);
    if (!parsed.success || fields.length > 0) return;

    setPending(true);
    try {
      const estimate = await api.estimate(parsed.data);
      setResult({ request: parsed.data, budgetText: text('budget'), estimate });
      track('try_widget_used', { event_type: parsed.data.event_type });
    } catch (error) {
      console.error('Try widget estimate failed', error);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  const field = (name: string, label: string, control: ReactNode, hint?: ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {hint && <p id={`${id}-${name}-hint`} className="text-sm text-sand-600">{hint}</p>}
      {invalid.includes(name) && (
        <p className="text-sm text-red-700" role="alert">
          {tp(`errors.${name}` as 'errors.event_type')}
        </p>
      )}
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-sand-200 bg-white p-5 shadow-sm sm:p-6">
        {field(
          'event_type',
          tp('eventType'),
          <select id={`${id}-event_type`} name="event_type" defaultValue="" required aria-invalid={invalid.includes('event_type')} className={inputClass}>
            <option value="" disabled>
              {tp('choose')}
            </option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EVENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>,
        )}
        <div className="grid grid-cols-2 gap-4">
          {field(
            'guest_count',
            tp('guests'),
            <input id={`${id}-guest_count`} name="guest_count" type="number" inputMode="numeric" min={10} max={5000} required aria-invalid={invalid.includes('guest_count')} className={inputClass} />,
          )}
          {field(
            'area',
            tp('area'),
            <select id={`${id}-area`} name="area" defaultValue="" required aria-invalid={invalid.includes('area')} className={inputClass}>
              <option value="" disabled>
                {tp('choose')}
              </option>
              {AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>,
          )}
        </div>
        {field(
          'event_date',
          tp('date'),
          <input id={`${id}-event_date`} name="event_date" type="date" required aria-invalid={invalid.includes('event_date')} className={inputClass} />,
        )}
        {field(
          'total_budget_pkr',
          tp('budget'),
          <input
            id={`${id}-total_budget_pkr`}
            name="budget"
            type="text"
            autoComplete="off"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder={tp('budgetPlaceholder')}
            required
            aria-invalid={invalid.includes('total_budget_pkr')}
            aria-describedby={`${id}-total_budget_pkr-hint`}
            className={inputClass}
          />,
          parsedBudget ? tp('budgetParsed', { amount: formatPkrCompact(parsedBudget) }) : tp('budgetHint'),
        )}
        <SubmitButton
          pending={pending}
          className="mt-1 min-h-12 rounded-full bg-brand-700 px-6 font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-60"
        >
          {pending ? tp('submitting') : t('submit')}
        </SubmitButton>
        <p aria-live="polite" className="text-sm text-red-700 empty:hidden">
          {failed ? t('failed') : null}
        </p>
      </form>

      <div aria-live="polite" aria-busy={pending}>
        {result ? (
          <section aria-labelledby={`${id}-result`} className="flex flex-col gap-5 rounded-2xl border border-sand-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-1">
              <h3 id={`${id}-result`} ref={resultHeading} tabIndex={-1} className="text-2xl font-semibold outline-none">
                {t('resultTitle')}
              </h3>
              <p className="text-sm text-sand-600">
                {t('resultFor', {
                  event: EVENT_TYPE_LABELS[result.request.event_type],
                  guests: result.request.guest_count,
                  area: result.request.area,
                  budget: formatPkrCompact(result.request.total_budget_pkr),
                })}
              </p>
            </div>
            <SampleDataNotice response={result.estimate} />
            <BudgetSplit estimate={result.estimate} />
            <div className="flex flex-col items-start gap-2 border-t border-sand-100 pt-4">
              <Link
                href={{
                  pathname: '/plan/new',
                  query: {
                    event_type: result.request.event_type,
                    guests: result.request.guest_count,
                    area: result.request.area,
                    date: result.request.event_date,
                    budget: result.budgetText,
                  },
                }}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-700 px-6 font-semibold text-white transition-colors hover:bg-brand-800"
              >
                {t('seeVendors')}
                <Icon name="arrowRight" className="size-4" />
              </Link>
              <p className="text-sm text-sand-600">{t('seeVendorsHint')}</p>
            </div>
          </section>
        ) : (
          <div className="hidden h-full min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sand-300 p-8 text-center lg:flex">
            <span className="flex size-12 items-center justify-center rounded-full bg-gold-50 text-gold-700">
              <Icon name="wallet" className="size-6" />
            </span>
            <p className="max-w-xs text-sand-600">{t('emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
