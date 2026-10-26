'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useEffect, useId, type FormEvent } from 'react';
import { submitLead, type LeadFormState } from '@/app/[locale]/(marketing)/actions';
import { SubmitButton } from '@/components/submit-button';
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
      <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-900">
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
    <form onSubmit={submit} className="flex w-full max-w-md flex-col gap-2" noValidate>
      <input type="hidden" name="type" value="waitlist" />
      {/* Honeypot, hidden from people and screen readers */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -start-[9999px] h-0 w-0 opacity-0" />

      <label htmlFor={inputId} className="text-sm font-medium">
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
          className="min-h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 aria-invalid:border-red-600"
        />
        <SubmitButton
          pending={pending}
          className="min-h-11 rounded-lg bg-zinc-900 px-5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
        >
          {pending ? t('submitting') : t('submit')}
        </SubmitButton>
      </div>
      <p id={messageId} aria-live="polite" className={error ? 'text-sm text-red-700' : 'text-sm text-zinc-600'}>
        {error ? t(`errors.${error}`) : t('privacy')}
      </p>
    </form>
  );
}
