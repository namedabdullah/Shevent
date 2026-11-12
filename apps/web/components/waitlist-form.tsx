'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useEffect, useId, type FormEvent } from 'react';
import { submitLead, type LeadFormState } from '@/app/[locale]/(marketing)/actions';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { getAttribution } from '@/lib/attribution';

const initialState: LeadFormState = { status: 'idle' };

export function WaitlistForm() {
  const t = useTranslations('Waitlist');
  const [state, formAction, pending] = useActionState(submitLead, initialState);
  const inputId = useId();
  const messageId = useId();

  useEffect(() => {
    if (state.status === 'success') track('waitlist_joined');
  }, [state]);

  if (state.status === 'success') {
    return (
      <p role="status" className="mx-auto flex max-w-lg animate-enter items-center gap-3 rounded-2xl border border-success-line bg-success-soft px-4 py-3.5 text-start text-success-ink">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-on-solid">
          <Icon name="check" className="size-4" />
        </span>
        {t('success')}
      </p>
    );
  }

  // onSubmit instead of <form action>, which would clear what the visitor typed on every submit.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    for (const [key, value] of Object.entries(getAttribution())) {
      if (value) formData.set(key, value);
    }
    startTransition(() => formAction(formData));
  }

  const error = state.status === 'error' ? state.error : undefined;

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col items-center gap-2.5" noValidate>
      <input type="hidden" name="type" value="waitlist" />
      {/* Honeypot, hidden from people and screen readers */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -start-[9999px] h-0 w-0 opacity-0" />

      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {t('label')}
      </label>
      {/* One pill: the field and its button share a border, and the focus ring goes round both. */}
      <div className="flex w-full flex-col gap-1.5 rounded-[1.75rem] border border-control bg-surface p-1.5 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/20 hover:border-ink-soft has-[[aria-invalid=true]]:border-danger sm:flex-row sm:rounded-full">
        <input
          id={inputId}
          name="contact"
          type="text"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={200}
          placeholder={t('placeholder')}
          aria-invalid={error === 'invalid'}
          aria-describedby={messageId}
          className="min-h-12 min-w-0 flex-1 rounded-full bg-transparent px-4 text-base text-ink outline-none placeholder:text-muted"
        />
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', className: 'group shrink-0' })}>
          {pending ? t('submitting') : t('submit')}
          <Icon name="arrowRight" className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </SubmitButton>
      </div>
      <p id={messageId} aria-live="polite" className={error ? 'text-sm font-medium text-danger' : 'text-sm text-muted'}>
        {error ? t(`errors.${error}`) : t('privacy')}
      </p>
    </form>
  );
}
