import type { ReactNode } from 'react';
import { Icon } from '@/components/icons';

/** Text inputs. sand-400 is the lightest border allowed on a control (3.1:1 on white). */
export const inputStyles =
  'min-h-11 w-full rounded-xl border border-sand-400 bg-white px-3.5 text-base text-sand-900 shadow-[inset_0_1px_2px_rgb(39_30_25/0.05)] transition-[border-color,box-shadow] outline-none placeholder:text-sand-500 hover:border-sand-500 focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600 aria-invalid:border-red-600 aria-invalid:focus-visible:ring-red-600';

/** Native <select> with the brand chevron (the .field-select rule in globals.css). */
export const selectStyles = `${inputStyles} field-select`;

export const textareaStyles = `${inputStyles} py-2.5 leading-relaxed`;

/** A checkbox or radio with its label, sized for touch. */
export const checkStyles =
  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg text-sm text-sand-800 [&>input]:size-4.5 [&>input]:shrink-0';

/**
 * Label, control, hint and error in the order a screen reader should meet them. The caller owns
 * the ids: `id` goes on the control, `hintId` on its aria-describedby.
 */
export function Field({
  id,
  label,
  hint,
  hintId,
  error,
  className = '',
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  hintId?: string;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-sand-800">
        {label}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-sm text-sand-600">
          {hint}
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-red-700">
      <Icon name="alert" className="mt-0.5 size-4" />
      <span>{children}</span>
    </p>
  );
}

/** A group of related controls (checkboxes, radios) with a visible legend. */
export function Fieldset({ legend, hint, className = '', children }: { legend: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <fieldset className={`flex flex-col gap-2 ${className}`}>
      <legend className="mb-1 text-sm font-semibold text-sand-800">{legend}</legend>
      {hint && <p className="-mt-1 text-sm text-sand-600">{hint}</p>}
      {children}
    </fieldset>
  );
}

/**
 * A titled part of a long form, e.g. "The event" and "Budget" in the planner. The card is a wrapper
 * because a border on the <fieldset> itself would cut through its legend.
 */
export function FormSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-card sm:p-7">
      {/* The legend sits outside the flex box, so its spacing is a margin, not the gap. */}
      <fieldset className="flex flex-col gap-5">
        <legend className={`font-display text-xl font-semibold text-sand-900 ${description ? 'mb-1' : 'mb-5'}`}>{title}</legend>
        {description && <p className="text-sm text-sand-600">{description}</p>}
        {children}
      </fieldset>
    </div>
  );
}
