'use client';

import { CATEGORIES, CATEGORY_LABELS, type Category } from '@shevent/core/enums';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, type FormEvent } from 'react';
import type { FeedbackFormState } from '@/app/[locale]/(app)/plans/[id]/feedback/actions';
import { SubmitButton } from '@/components/submit-button';

const initialState: FeedbackFormState = { status: 'idle' };

const inputClass =
  'min-h-11 w-full rounded-lg border border-sand-400 bg-white px-3 text-base text-sand-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 aria-invalid:border-red-600';

export function FeedbackForm({
  action,
  budgets,
  defaults,
}: {
  action: (state: FeedbackFormState, formData: FormData) => Promise<FeedbackFormState>;
  /** Formatted allocation per category, shown as a hint. */
  budgets: Partial<Record<Category, string>>;
  defaults: { spend: Partial<Record<Category, string>>; guests?: string; rating?: number };
}) {
  const t = useTranslations('Feedback');
  const [state, formAction, pending] = useActionState(action, initialState);
  const id = useId();
  const invalid = (field: string) => state.status === 'error' && state.fields.includes(field);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-2xl flex-col gap-8" noValidate>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold">{t('spendSection')}</legend>
        <p className="text-sm text-sand-600">{t('spendHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <div key={category} className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-${category}`} className="text-sm font-medium">
                {CATEGORY_LABELS[category]}
              </label>
              <input
                id={`${id}-${category}`}
                name={`spend_${category}`}
                type="text"
                defaultValue={defaults.spend[category]}
                placeholder={budgets[category] ? t('planned', { amount: budgets[category] }) : undefined}
                aria-invalid={invalid(`spend_${category}`)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
        {CATEGORIES.some((category) => invalid(`spend_${category}`)) && (
          <p role="alert" className="text-sm text-red-700">{t('errors.spend')}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor={`${id}-guests`} className="text-sm font-medium">{t('guests')}</label>
        <input id={`${id}-guests`} name="guest_count_actual" type="number" inputMode="numeric" min={1} defaultValue={defaults.guests} aria-invalid={invalid('guest_count_actual')} className={inputClass} />
        {invalid('guest_count_actual') && <p role="alert" className="text-sm text-red-700">{t('errors.guests')}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">{t('rating')}</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-lg border border-sand-400 px-3 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-700 has-[:checked]:text-white">
              <input type="radio" name="rating" value={value} defaultChecked={defaults.rating === value} className="sr-only" />
              {value} <span aria-hidden>★</span>
              <span className="sr-only">{t('stars', { count: value })}</span>
            </label>
          ))}
        </div>
        {invalid('rating') && <p role="alert" className="text-sm text-red-700">{t('errors.rating')}</p>}
      </fieldset>

      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className="min-h-11 self-start rounded-lg bg-brand-700 px-6 font-medium text-white hover:bg-brand-800 disabled:opacity-60">
          {pending ? t('saving') : t('save')}
        </SubmitButton>
        {invalid('save') && <p role="alert" className="text-sm text-red-700">{t('errors.save')}</p>}
      </div>
    </form>
  );
}
