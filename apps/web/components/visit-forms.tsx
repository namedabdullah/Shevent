'use client';

import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, type FormEvent } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Field, inputStyles, selectStyles, textareaStyles } from '@/components/ui/field';
import { confirmVisit, requestVisit } from '@/lib/visit-actions';
import { clockLabel, VISIT_TIMES, type VisitFormState } from '@/lib/visits';

const initialState: VisitFormState = { status: 'idle' };

/** A field's error: why the database refused its text, or the form's own message. */
function useFieldError(state: VisitFormState) {
  const t = useTranslations('Visit');
  const tGuard = useTranslations('ContactGuard');
  return (name: string) =>
    state.status !== 'error' || !state.fields.includes(name)
      ? undefined
      : state.error === 'contact'
        ? tGuard('field', { what: tGuard(`what.${state.reason}`) })
        : t(`errors.${name}` as 'errors.date');
}

function FormMessage({ state }: { state: VisitFormState }) {
  const t = useTranslations('Visit');
  return (
    <p aria-live="polite" className="text-sm font-medium text-danger">
      {state.status === 'error' && (state.error === 'taken' || state.error === 'failed') ? t(`errors.${state.error}`) : null}
    </p>
  );
}

// onSubmit instead of <form action>, which would clear the form on every submit.
function submitWith(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
}

/** The host picks a day and time (Lahore) to see the venue. */
export function VisitRequestForm({ inquiryId, today }: { inquiryId: string; today: string }) {
  const t = useTranslations('Visit');
  const [state, formAction, pending] = useActionState(requestVisit.bind(null, inquiryId), initialState);
  const error = useFieldError(state);
  const id = useId();

  return (
    <form onSubmit={submitWith(formAction)} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-date`} label={t('date')} error={error('date')}>
          <DateField id={`${id}-date`} name="date" min={today} required invalid={!!error('date')} />
        </Field>
        <Field id={`${id}-time`} label={t('time')} error={error('time')}>
          <select id={`${id}-time`} name="time" defaultValue="16:00" aria-invalid={!!error('time')} className={selectStyles}>
            {VISIT_TIMES.map((time) => (
              <option key={time} value={time}>
                {clockLabel(time)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id={`${id}-note`} label={t('note')} hint={t('noteHint')} hintId={`${id}-note-hint`} error={error('note')}>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={300}
          aria-invalid={!!error('note')}
          aria-describedby={`${id}-note-hint`}
          className={textareaStyles}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className={buttonStyles({ className: 'self-start' })}>
          {pending ? t('requesting') : t('request')}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** The venue confirms a requested visit with the address. */
export function VisitConfirmForm({ inquiryId, visitId }: { inquiryId: string; visitId: string }) {
  const t = useTranslations('Visit');
  const [state, formAction, pending] = useActionState(confirmVisit.bind(null, inquiryId, visitId), initialState);
  const error = useFieldError(state);
  const id = useId();

  return (
    <form onSubmit={submitWith(formAction)} className="flex flex-col gap-4" noValidate>
      <Field id={`${id}-address`} label={t('addressLabel')} hint={t('addressHint')} hintId={`${id}-address-hint`} error={error('address')}>
        <input
          id={`${id}-address`}
          name="address"
          type="text"
          maxLength={200}
          required
          autoComplete="street-address"
          aria-invalid={!!error('address')}
          aria-describedby={`${id}-address-hint`}
          className={inputStyles}
        />
      </Field>
      <Field id={`${id}-note`} label={t('vendorNoteLabel')} hint={t('vendorNoteHint')} hintId={`${id}-note-hint`} error={error('note')}>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={300}
          aria-invalid={!!error('note')}
          aria-describedby={`${id}-note-hint`}
          className={textareaStyles}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className={buttonStyles({ className: 'self-start' })}>
          {pending ? t('confirming') : t('confirm')}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
