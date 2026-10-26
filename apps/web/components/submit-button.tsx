'use client';

import { useSyncExternalStore, type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';

const subscribe = () => () => {};

/** False in the server HTML and during hydration, true once React owns the page. */
function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * A form's submit button that stays disabled until the page has hydrated and while the form is
 * sending. A tap that lands before hydration was silently lost on iPhone (and an onSubmit form
 * would fall back to a plain GET that puts the fields in the URL), so the button shows it is not
 * ready yet instead. Server-action forms get their pending state from useFormStatus; onSubmit
 * forms pass `pending` from useActionState.
 */
export function SubmitButton({ pending = false, disabled = false, ...props }: Omit<ComponentProps<'button'>, 'type'> & { pending?: boolean }) {
  const hydrated = useHydrated();
  const status = useFormStatus();
  const busy = pending || status.pending;
  return <button {...props} type="submit" disabled={!hydrated || busy || disabled} aria-busy={busy || undefined} />;
}
