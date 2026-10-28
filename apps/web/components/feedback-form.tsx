'use client';

import { CATEGORIES, CATEGORY_LABELS, type Category } from '@shevent/core/enums';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, type FormEvent } from 'react';
import type { FeedbackFormState } from '@/app/[locale]/(app)/plans/[id]/feedback/actions';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { Field, FieldError, FormSection, inputStyles } from '@/components/ui/field';

const initialState: FeedbackFormState = { status: 'idle' };

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
    <form onSubmit={submit} className="flex w-full max-w-3xl flex-col gap-6" noValidate>
      <FormSection title={t('spendSection')} description={t('spendHint')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <Field key={category} id={`${id}-${category}`} label={CATEGORY_LABELS[category]}>
              <input
                id={`${id}-${category}`}
                name={`spend_${category}`}
                type="text"
                defaultValue={defaults.spend[category]}
                placeholder={budgets[category] ? t('planned', { amount: budgets[category] }) : undefined}
                aria-invalid={invalid(`spend_${category}`)}
                className={`${inputStyles} tabular-nums`}
              />
            </Field>
          ))}
        </div>
        {CATEGORIES.some((category) => invalid(`spend_${category}`)) && <FieldError>{t('errors.spend')}</FieldError>}
      </FormSection>

      <FormSection title={t('outcomeSection')}>
        <Field
          id={`${id}-guests`}
          label={t('guests')}
          className="sm:max-w-xs"
          error={invalid('guest_count_actual') ? t('errors.guests') : undefined}
        >
          <input id={`${id}-guests`} name="guest_count_actual" type="number" inputMode="numeric" min={1} defaultValue={defaults.guests} aria-invalid={invalid('guest_count_actual')} className={inputStyles} />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-sand-800">{t('rating')}</legend>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                className="flex min-h-12 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-sand-300 bg-white px-3 font-semibold text-sand-800 transition-colors hover:border-brand-300 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-700 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2"
              >
                <input type="radio" name="rating" value={value} defaultChecked={defaults.rating === value} className="sr-only" />
                {value} <Icon name="star" className="size-4 fill-current" />
                <span className="sr-only">{t('stars', { count: value })}</span>
              </label>
            ))}
          </div>
          {invalid('rating') && <FieldError>{t('errors.rating')}</FieldError>}
        </fieldset>
      </FormSection>

      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', className: 'self-stretch sm:self-start' })}>
          {pending ? t('saving') : t('save')}
        </SubmitButton>
        {invalid('save') && <FieldError>{t('errors.save')}</FieldError>}
      </div>
    </form>
  );
}
