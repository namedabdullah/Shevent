'use client';

import { AREAS, EVENT_TYPES, EVENT_TYPE_LABELS, PREFERENCES, PREFERENCE_LABELS, VENUE_TYPES, VENUE_TYPE_LABELS } from '@shevent/core/enums';
import { formatPkrCompact, parsePkr } from '@shevent/core/format';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, useState, type FormEvent, type ReactNode } from 'react';
import { createPlan, type PlanFormState } from '@/app/[locale]/(app)/plan/new/actions';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Field, Fieldset, FormSection, inputStyles, selectStyles } from '@/components/ui/field';

export interface PlanFormDefaults {
  event_type?: string;
  guest_count?: string;
  area?: string;
  venue_type?: string;
  event_date?: string;
  budget?: string;
}

const initialState: PlanFormState = { status: 'idle' };

/** A checkbox as a pill: the box stays visible, the whole pill is the label. */
const pillCheck =
  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-accent-line has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent';

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
    <Field
      id={`${id}-${name}`}
      label={label}
      hint={hint}
      hintId={`${id}-${name}-hint`}
      error={invalid(name) ? t(`errors.${name}` as 'errors.event_type') : undefined}
    >
      {control}
    </Field>
  );

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-6" noValidate>
      <FormSection title={t('eventSection')}>
        {field(
          'event_type',
          t('eventType'),
          <select id={`${id}-event_type`} name="event_type" defaultValue={defaults.event_type ?? ''} required aria-invalid={invalid('event_type')} className={selectStyles}>
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
            <input id={`${id}-guest_count`} name="guest_count" type="number" inputMode="numeric" min={10} max={5000} defaultValue={defaults.guest_count} required aria-invalid={invalid('guest_count')} className={inputStyles} />,
          )}
          {field(
            'event_date',
            t('date'),
            <DateField id={`${id}-event_date`} name="event_date" min={today} defaultValue={defaults.event_date} required invalid={invalid('event_date')} />,
          )}
          {field(
            'area',
            t('area'),
            <select id={`${id}-area`} name="area" defaultValue={defaults.area ?? ''} required aria-invalid={invalid('area')} className={selectStyles}>
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
            <select id={`${id}-venue_type`} name="venue_type" defaultValue={defaults.venue_type ?? ''} className={selectStyles}>
              <option value="">{t('notSure')}</option>
              {VENUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {VENUE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>,
          )}
        </div>
      </FormSection>

      <FormSection title={t('budgetSection')}>
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
            className={`${inputStyles} min-h-13 text-lg font-semibold tabular-nums`}
          />,
          parsedBudget ? t('budgetParsed', { amount: formatPkrCompact(parsedBudget) }) : t('budgetHint'),
        )}
        <Fieldset legend={t('preferences')}>
          <div className="flex flex-wrap gap-2">
            {PREFERENCES.map((preference) => (
              <label key={preference} className={pillCheck}>
                <input type="checkbox" name="preferences" value={preference} className="size-4 shrink-0" />
                {PREFERENCE_LABELS[preference]}
              </label>
            ))}
          </div>
        </Fieldset>
      </FormSection>

      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', className: 'self-stretch sm:self-start' })}>
          {pending ? t('submitting') : t('submit')}
        </SubmitButton>
        <p aria-live="polite" className="text-sm font-medium text-danger">
          {state.status === 'error' && state.error === 'failed' ? t('errors.failed') : null}
        </p>
      </div>
    </form>
  );
}
