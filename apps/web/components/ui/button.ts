export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full text-center font-semibold leading-tight tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,scale] duration-200 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 aria-busy:cursor-wait';

const VARIANTS: Record<ButtonVariant, string> = {
  /** The one main action on a screen. */
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  /** Secondary actions next to a primary one. */
  secondary: 'border border-line-strong bg-surface text-ink hover:border-control hover:bg-subtle',
  /** A quiet bordered action, e.g. "Sign in" in the header. */
  outline: 'border border-line-strong text-ink hover:border-ink',
  ghost: 'text-accent-ink hover:bg-accent-soft',
  /** Highest contrast: ink on canvas (near-black on light themes, near-white on dark ones). */
  inverse: 'bg-ink text-canvas hover:opacity-85',
};

// Every size keeps a 44px touch target.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-4 text-sm',
  md: 'min-h-11 px-5 text-[0.9375rem]',
  lg: 'min-h-12 px-6 text-base',
};

/**
 * Class names for anything that looks like a button: <button>, <SubmitButton>, <Link> or <a>. A
 * helper rather than a component, so links stay links and submit buttons keep their behaviour.
 */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}): string {
  return [BASE, VARIANTS[variant], SIZES[size], block ? 'w-full' : '', className].filter(Boolean).join(' ');
}

/** An inline text link inside a sentence or under a form. */
export const linkStyles =
  'font-semibold text-accent-ink underline decoration-accent-line decoration-2 underline-offset-4 transition-colors hover:decoration-accent';
