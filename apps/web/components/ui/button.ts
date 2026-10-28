export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full text-center font-semibold leading-tight transition-[background-color,border-color,color,box-shadow,translate] duration-200 ease-out active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 aria-busy:cursor-wait';

const VARIANTS: Record<ButtonVariant, string> = {
  /** The one main action on a screen. */
  primary: 'bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-800 hover:shadow-md',
  /** Secondary actions next to a primary one. */
  secondary: 'border border-sand-400 bg-white text-sand-900 hover:border-sand-500 hover:bg-sand-50',
  /** A brand-coloured action that shouldn't compete with the primary one, e.g. "Sign in". */
  outline: 'border border-brand-700 text-brand-700 hover:bg-brand-700 hover:text-white',
  ghost: 'text-brand-700 hover:bg-brand-50',
  /** Main action on night (brand-900/950) sections. */
  gold: 'bg-gold-300 text-brand-950 shadow-sm shadow-brand-950/30 hover:bg-gold-200',
  /** Secondary action on night sections. */
  inverse: 'border border-brand-100/40 text-white hover:border-brand-100 hover:bg-white/10',
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
  'font-semibold text-brand-700 underline decoration-brand-200 decoration-2 underline-offset-4 transition-colors hover:decoration-brand-700';
