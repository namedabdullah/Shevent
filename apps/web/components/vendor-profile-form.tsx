'use client';

import { AREAS, CATEGORIES, CATEGORY_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS, PRICE_TIERS, VENUE_TYPES, VENUE_TYPE_LABELS, type Category } from '@shevent/core/enums';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { buttonStyles } from '@/components/ui/button';
import { checkStyles, Field, Fieldset, FormSection, inputStyles, selectStyles, textareaStyles } from '@/components/ui/field';
import type { VendorProfileState } from '@/lib/vendor';

const initialState: VendorProfileState = { status: 'idle' };

export interface VendorProfileDefaults {
  name?: string;
  category?: Category;
  sub_type?: string | null;
  base_area?: string;
  areas_served?: string[];
  capacity_min?: number | null;
  capacity_max?: number | null;
  price_tier?: string | null;
  event_types?: string[];
  description?: string | null;
  inclusions?: string[];
  years_active?: number | null;
  public_consent?: boolean;
}

/** Business details for onboarding (`mode="create"`) and the listing page (`mode="edit"`). */
export function VendorProfileForm({
  action,
  mode,
  defaults = {},
}: {
  action: (state: VendorProfileState, formData: FormData) => Promise<VendorProfileState>;
  mode: 'create' | 'edit';
  defaults?: VendorProfileDefaults;
}) {
  const t = useTranslations('VendorProfile');
  const [state, formAction, pending] = useActionState(action, initialState);
  const [category, setCategory] = useState<string>(defaults.category ?? '');
  const id = useId();
  const invalid = (field: string) => state.status === 'error' && state.fields.includes(field);

  // onSubmit instead of <form action>, which would clear the form on every submit.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const field = (name: string, label: string, control: ReactNode, hint?: string) => (
    <Field
      id={`${id}-${name}`}
      label={label}
      hint={hint}
      hintId={`${id}-${name}-hint`}
      error={invalid(name) ? t(`errors.${name}` as 'errors.name') : undefined}
    >
      {control}
    </Field>
  );

  const checkboxes = (name: string, legend: string, options: readonly { value: string; label: string }[], checked: string[] = []) => (
    <Fieldset legend={legend}>
      <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => (
          <label key={option.value} className={checkStyles}>
            <input type="checkbox" name={name} value={option.value} defaultChecked={checked.includes(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </Fieldset>
  );

  return (
    <form onSubmit={submit} className="flex w-full max-w-3xl flex-col gap-6" noValidate>
      <FormSection title={t('basics')}>
        {field(
          'name',
          t('name'),
          <input id={`${id}-name`} name="name" type="text" maxLength={120} autoComplete="organization" defaultValue={defaults.name} required aria-invalid={invalid('name')} className={inputStyles} />,
        )}
        {mode === 'create' ? (
          field(
            'category',
            t('category'),
            <select id={`${id}-category`} name="category" value={category} onChange={(event) => setCategory(event.target.value)} required aria-invalid={invalid('category')} className={selectStyles}>
              <option value="" disabled>
                {t('choose')}
              </option>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>,
          )
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-ink">{t('category')}</p>
            {defaults.category && (
              <p className="flex items-center gap-2 font-medium text-ink">
                <Icon name={defaults.category} className="size-4 text-muted" />
                {CATEGORY_LABELS[defaults.category]}
              </p>
            )}
            <p className="text-sm text-muted">{t('categoryFixed')}</p>
          </div>
        )}
        {category === 'venue' &&
          field(
            'sub_type',
            t('subType'),
            <select id={`${id}-sub_type`} name="sub_type" defaultValue={defaults.sub_type ?? ''} aria-invalid={invalid('sub_type')} className={selectStyles}>
              <option value="">{t('notSure')}</option>
              {VENUE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {VENUE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>,
          )}
        {field(
          'base_area',
          t('baseArea'),
          <select id={`${id}-base_area`} name="base_area" defaultValue={defaults.base_area ?? ''} required aria-invalid={invalid('base_area')} className={selectStyles}>
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
        {checkboxes('areas_served', t('areasServed'), AREAS.map((area) => ({ value: area, label: area })), defaults.areas_served)}
        {checkboxes('event_types', t('eventTypes'), EVENT_TYPES.map((type) => ({ value: type, label: EVENT_TYPE_LABELS[type] })), defaults.event_types)}
      </FormSection>

      <FormSection title={t('details')}>
        <div className="grid gap-5 sm:grid-cols-2">
          {field(
            'capacity_min',
            t('capacityMin'),
            <input id={`${id}-capacity_min`} name="capacity_min" type="number" inputMode="numeric" min={1} defaultValue={defaults.capacity_min ?? undefined} aria-invalid={invalid('capacity_min')} className={inputStyles} />,
          )}
          {field(
            'capacity_max',
            t('capacityMax'),
            <input id={`${id}-capacity_max`} name="capacity_max" type="number" inputMode="numeric" min={1} defaultValue={defaults.capacity_max ?? undefined} aria-invalid={invalid('capacity_max')} className={inputStyles} />,
          )}
          {field(
            'price_tier',
            t('priceTier'),
            <select id={`${id}-price_tier`} name="price_tier" defaultValue={defaults.price_tier ?? ''} className={selectStyles}>
              <option value="">{t('notSure')}</option>
              {PRICE_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {t(`tier.${tier}`)}
                </option>
              ))}
            </select>,
          )}
          {field(
            'years_active',
            t('yearsActive'),
            <input id={`${id}-years_active`} name="years_active" type="number" inputMode="numeric" min={0} max={100} defaultValue={defaults.years_active ?? undefined} aria-invalid={invalid('years_active')} className={inputStyles} />,
          )}
        </div>
        {field(
          'description',
          t('description'),
          <textarea id={`${id}-description`} name="description" rows={4} maxLength={2000} defaultValue={defaults.description ?? ''} aria-invalid={invalid('description')} aria-describedby={`${id}-description-hint`} className={textareaStyles} />,
          t('descriptionHint'),
        )}
        {field(
          'inclusions',
          t('inclusions'),
          <textarea id={`${id}-inclusions`} name="inclusions" rows={3} defaultValue={defaults.inclusions?.join('\n') ?? ''} aria-invalid={invalid('inclusions')} aria-describedby={`${id}-inclusions-hint`} className={textareaStyles} />,
          t('inclusionsHint'),
        )}
      </FormSection>

      <FormSection title={t('publicSection')}>
        <div className="flex flex-col gap-1">
          <label className={`${checkStyles} font-semibold`}>
            <input type="checkbox" name="public_consent" defaultChecked={defaults.public_consent ?? false} aria-describedby={`${id}-consent-hint`} />
            {t('consent')}
          </label>
          <p id={`${id}-consent-hint`} className="ps-7 text-sm text-muted">
            {t('consentHint')}
          </p>
        </div>
      </FormSection>

      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} className={buttonStyles({ size: 'lg', className: 'self-stretch sm:self-start' })}>
          {mode === 'create' ? (pending ? t('creating') : t('create')) : pending ? t('saving') : t('save')}
        </SubmitButton>
        <p aria-live="polite" className={`text-sm font-medium ${state.status === 'saved' ? 'text-success-ink' : 'text-danger'}`}>
          {state.status === 'saved' ? t('saved') : state.status === 'error' ? t(state.error === 'failed' ? 'errors.failed' : 'errors.invalid') : null}
        </p>
      </div>
    </form>
  );
}
