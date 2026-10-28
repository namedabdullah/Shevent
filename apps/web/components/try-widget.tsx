'use client';

import { createApiClient } from '@shevent/core/api';
import { AREAS, CATEGORIES, CATEGORY_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS } from '@shevent/core/enums';
import { formatPkrCompact, parsePkr, todayInLahore } from '@shevent/core/format';
import { estimateRequestSchema, type EstimateRequest, type EstimateResponse } from '@shevent/core/schemas';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BudgetSplit } from '@/components/budget-split';
import { Icon } from '@/components/icons';
import { SampleDataNotice } from '@/components/sample-data-notice';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { Field, inputStyles, selectStyles } from '@/components/ui/field';
import { Link } from '@/i18n/navigation';
import { track } from '@/lib/analytics';

// The browser goes through the /api/ai proxy; with fixtures on it answers from packages/core.
const api = createApiClient({ baseUrl: '/api/ai', fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true' });

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
    <Field
      id={`${id}-${name}`}
      label={label}
      hint={hint}
      hintId={`${id}-${name}-hint`}
      error={invalid.includes(name) ? tp(`errors.${name}` as 'errors.event_type') : undefined}
    >
      {control}
    </Field>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-7">
        {field(
          'event_type',
          tp('eventType'),
          <select id={`${id}-event_type`} name="event_type" defaultValue="" required aria-invalid={invalid.includes('event_type')} className={selectStyles}>
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
            <input id={`${id}-guest_count`} name="guest_count" type="number" inputMode="numeric" min={10} max={5000} required aria-invalid={invalid.includes('guest_count')} className={inputStyles} />,
          )}
          {field(
            'area',
            tp('area'),
            <select id={`${id}-area`} name="area" defaultValue="" required aria-invalid={invalid.includes('area')} className={selectStyles}>
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
          <input id={`${id}-event_date`} name="event_date" type="date" required aria-invalid={invalid.includes('event_date')} className={inputStyles} />,
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
            className={inputStyles}
          />,
          parsedBudget ? tp('budgetParsed', { amount: formatPkrCompact(parsedBudget) }) : tp('budgetHint'),
        )}
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', block: true, className: 'mt-2' })}>
          {pending ? tp('submitting') : t('submit')}
        </SubmitButton>
        <p aria-live="polite" className="text-sm font-medium text-red-700 empty:hidden">
          {failed ? t('failed') : null}
        </p>
      </form>

      <div aria-live="polite" aria-busy={pending}>
        {result ? (
          <section aria-labelledby={`${id}-result`} className="flex animate-enter flex-col gap-5 rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-7">
            <div className="flex flex-col gap-1.5">
              <h3 id={`${id}-result`} ref={resultHeading} tabIndex={-1} className="text-2xl font-semibold outline-none sm:text-3xl">
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
            <div className="flex flex-col items-start gap-2 rounded-2xl bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-sand-700">{t('seeVendorsHint')}</p>
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
                className={buttonStyles({ className: 'shrink-0' })}
              >
                {t('seeVendors')}
                <Icon name="arrowRight" className="size-4" />
              </Link>
            </div>
          </section>
        ) : (
          // What the answer will contain: the five real categories, no made-up numbers.
          <div className="hidden min-h-[26rem] flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-sand-300 bg-white/50 p-10 text-center lg:flex">
            <span className="flex size-14 items-center justify-center rounded-full bg-gold-50 text-gold-700 ring-8 ring-gold-50/60">
              <Icon name="wallet" className="size-6" />
            </span>
            <p className="max-w-xs leading-relaxed text-sand-600">{t('emptyHint')}</p>
            <ul aria-hidden className="flex flex-wrap justify-center gap-2">
              {CATEGORIES.map((category) => (
                <li key={category} className="flex items-center gap-2 rounded-full border border-sand-200 bg-white px-3 py-1.5 text-sm text-sand-700">
                  <span className="size-2.5 rounded-sm" style={{ background: `var(--series-${category})` }} />
                  {CATEGORY_LABELS[category]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
