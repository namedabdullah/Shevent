'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useEffect, useId, type FormEvent } from 'react';
import { submitLead, type LeadFormState } from '@/app/[locale]/(marketing)/actions';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { inputStyles } from '@/components/ui/field';
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
      <p role="status" className="flex max-w-lg animate-enter items-center gap-3 rounded-2xl border border-green-600/30 bg-green-50 px-4 py-3.5 text-green-950">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-700 text-white">
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
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-2" noValidate>
      <input type="hidden" name="type" value="waitlist" />
      {/* Honeypot, hidden from people and screen readers */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -start-[9999px] h-0 w-0 opacity-0" />

      <label htmlFor={inputId} className="text-sm font-semibold text-sand-800">
        {t('label')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
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
          className={`${inputStyles} min-h-12 flex-1 rounded-full px-5`}
        />
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', className: 'shrink-0' })}>
          {pending ? t('submitting') : t('submit')}
        </SubmitButton>
      </div>
      <p id={messageId} aria-live="polite" className={error ? 'text-sm font-medium text-red-700' : 'text-sm text-sand-600'}>
        {error ? t(`errors.${error}`) : t('privacy')}
      </p>
    </form>
  );
}
