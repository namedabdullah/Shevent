'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, type FormEvent } from 'react';
import { signInWithEmail, signInWithGoogle, type SignInState } from '@/app/[locale]/(marketing)/sign-in/actions';
import { SubmitButton } from '@/components/submit-button';

const initialState: SignInState = { status: 'idle' };

interface SignInFormProps {
  next: string;
  /** Error from a failed redirect back (expired link, Google failure). */
  redirectError?: 'link' | 'google';
  googleEnabled: boolean;
}

export function SignInForm({ next, redirectError, googleEnabled }: SignInFormProps) {
  const t = useTranslations('Auth');
  const [state, formAction, pending] = useActionState(signInWithEmail, initialState);
  const inputId = useId();
  const messageId = useId();

  if (state.status === 'sent') {
    return (
      <p role="status" className="max-w-md rounded-lg bg-emerald-50 px-4 py-3 text-emerald-900">
        {t('sent', { email: state.email })}
      </p>
    );
  }

  // onSubmit instead of <form action>, which would clear the email on every submit.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const error = state.status === 'error' ? state.error : redirectError;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        <input type="hidden" name="next" value={next} />
        <label htmlFor={inputId} className="text-sm font-medium">
          {t('emailLabel')}
        </label>
        <input
          id={inputId}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t('emailPlaceholder')}
          aria-invalid={error === 'invalid_email'}
          aria-describedby={messageId}
          className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 aria-invalid:border-red-600"
        />
        <SubmitButton
          pending={pending}
          className="min-h-11 rounded-lg bg-zinc-900 px-5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
        >
          {pending ? t('sending') : t('sendLink')}
        </SubmitButton>
        <p id={messageId} aria-live="polite" className="min-h-5 text-sm text-red-700">
          {error ? t(`errors.${error}`) : null}
        </p>
      </form>

      {googleEnabled && (
        <form action={signInWithGoogle} className="flex flex-col gap-2">
          <input type="hidden" name="next" value={next} />
          <p className="text-center text-sm text-zinc-600">{t('or')}</p>
          <SubmitButton className="min-h-11 rounded-lg border border-zinc-300 bg-white px-5 font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60">
            {t('google')}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
