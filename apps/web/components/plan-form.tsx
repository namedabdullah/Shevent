'use client';

import { AREAS, EVENT_TYPES, EVENT_TYPE_LABELS, PREFERENCES, PREFERENCE_LABELS, VENUE_TYPES, VENUE_TYPE_LABELS } from '@shevent/core/enums';
import { formatPkrCompact, parsePkr } from '@shevent/core/format';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, useState, type FormEvent, type ReactNode } from 'react';
import { createPlan, type PlanFormState } from '@/app/[locale]/(app)/plan/new/actions';
import { SubmitButton } from '@/components/submit-button';

export interface PlanFormDefaults {
  event_type?: string;
  guest_count?: string;
  area?: string;
  venue_type?: string;
  event_date?: string;
  budget?: string;
}

const initialState: PlanFormState = { status: 'idle' };

const inputClass =
  'min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 aria-invalid:border-red-600';

export function PlanForm({ defaults, today }: { defaults: PlanFormDefaults; today: string }) {
  const t = useTranslations('Planner');
  const [state, formAction, pending] = useActionState(createPlan, initialState);
  const [budget, setBudget] = useState(defaults.budget ?? '');
  const id = useId();
  const invalid = (field: string) => state.status === 'error' && state.fields.includes(field);
  const parsedBudget = parsePkr(budget);

  // onSubmit instead of <form action>, which would clear the form on every submit.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const field = (name: string, label: string, control: ReactNode, hint?: ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {hint && <p id={`${id}-${name}-hint`} className="text-sm text-zinc-600">{hint}</p>}
      {invalid(name) && (
        <p className="text-sm text-red-700" role="alert">
          {t(`errors.${name}` as 'errors.event_type')}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex w-full max-w-2xl flex-col gap-8" noValidate>
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-lg font-semibold">{t('eventSection')}</legend>
        {field(
          'event_type',
          t('eventType'),
          <select id={`${id}-event_type`} name="event_type" defaultValue={defaults.event_type ?? ''} required aria-invalid={invalid('event_type')} className={inputClass}>
            <option value="" disabled>
              {t('choose')}
            </option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EVENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>,
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          {field(
            'guest_count',
            t('guests'),
            <input id={`${id}-guest_count`} name="guest_count" type="number" inputMode="numeric" min={10} max={5000} defaultValue={defaults.guest_count} required aria-invalid={invalid('guest_count')} className={inputClass} />,
          )}
          {field(
            'event_date',
            t('date'),
            <input id={`${id}-event_date`} name="event_date" type="date" min={today} defaultValue={defaults.event_date} required aria-invalid={invalid('event_date')} className={inputClass} />,
          )}
          {field(
            'area',
            t('area'),
            <select id={`${id}-area`} name="area" defaultValue={defaults.area ?? ''} required aria-invalid={invalid('area')} className={inputClass}>
              <option value="" disabled>
                {t('choose')}
              </option>
              {AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>,
          )}
          {field(
            'venue_type',
            t('venueType'),
            <select id={`${id}-venue_type`} name="venue_type" defaultValue={defaults.venue_type ?? ''} className={inputClass}>
              <option value="">{t('notSure')}</option>
              {VENUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VENUE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>,
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 text-lg font-semibold">{t('budgetSection')}</legend>
        {field(
          'total_budget_pkr',
          t('budget'),
          <input
            id={`${id}-total_budget_pkr`}
            name="budget"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder={t('budgetPlaceholder')}
            required
            aria-invalid={invalid('total_budget_pkr')}
            aria-describedby={`${id}-total_budget_pkr-hint`}
            className={inputClass}
          />,
          parsedBudget ? t('budgetParsed', { amount: formatPkrCompact(parsedBudget) }) : t('budgetHint'),
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('preferences')}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {PREFERENCES.map((preference) => (
              <label key={preference} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="preferences" value={preference} className="size-4" />
                {PREFERENCE_LABELS[preference]}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <SubmitButton
          pending={pending}
          className="min-h-11 self-start rounded-lg bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
        >
          {pending ? t('submitting') : t('submit')}
        </SubmitButton>
        <p aria-live="polite" className="text-sm text-red-700">
          {state.status === 'error' && state.error === 'failed' ? t('errors.failed') : null}
        </p>
      </div>
    </form>
  );
}
