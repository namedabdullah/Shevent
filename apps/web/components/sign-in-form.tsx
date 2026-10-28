'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, type FormEvent } from 'react';
import { signInWithEmail, signInWithGoogle, type SignInState } from '@/app/[locale]/(marketing)/sign-in/actions';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { inputStyles } from '@/components/ui/field';

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
      <p role="status" className="flex max-w-md animate-enter items-start gap-3 rounded-2xl border border-green-600/30 bg-green-50 px-4 py-3.5 text-green-950">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-700 text-white">
          <Icon name="check" className="size-4" />
        </span>
        <span className="pt-1">{t('sent', { email: state.email })}</span>
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
      <form onSubmit={submit} className="flex flex-col gap-2.5" noValidate>
        <input type="hidden" name="next" value={next} />
        <label htmlFor={inputId} className="text-sm font-semibold text-sand-800">
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
          className={`${inputStyles} min-h-12`}
        />
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', block: true })}>
          {pending ? t('sending') : t('sendLink')}
        </SubmitButton>
        <p id={messageId} aria-live="polite" className="min-h-5 text-sm font-medium text-red-700">
          {error ? t(`errors.${error}`) : null}
        </p>
      </form>

      {googleEnabled && (
        <form action={signInWithGoogle} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <p className="flex items-center gap-3 text-sm text-sand-600">
            <span aria-hidden className="h-px flex-1 bg-sand-200" />
            {t('or')}
            <span aria-hidden className="h-px flex-1 bg-sand-200" />
          </p>
          <SubmitButton className={buttonStyles({ variant: 'secondary', size: 'lg', block: true })}>{t('google')}</SubmitButton>
        </form>
      )}
    </div>
  );
}
