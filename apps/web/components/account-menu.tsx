import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/[locale]/(marketing)/sign-in/actions';
import { AccountDropdown } from '@/components/account-dropdown';
import { Icon } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';

/**
 * The signed-in account: email, a switch between planning and the vendor dashboard, and sign-out.
 * Reads the session: render inside <Suspense>.
 */
export async function AccountMenu({ area }: { area: 'host' | 'vendor' }) {
  const [t, user] = await Promise.all([getTranslations('App'), getCurrentUser()]);
  if (!user) return null;
  const isVendor = user.role === 'vendor' || user.role === 'admin';
  const switchLink =
    area === 'vendor'
      ? { href: '/plans', label: t('switchToPlanning') }
      : isVendor ? { href: '/vendor', label: t('vendorDashboard') } : { href: '/vendor/onboarding', label: t('listYourBusiness') };
  return (
    <AccountDropdown
      label={t('account')}
      email={user.email ?? ''}
      signedInAs={t('signedInAs')}
      initial={(user.email?.[0] ?? '?').toUpperCase()}
      switchLink={switchLink}
    >
      <form action={signOut}>
        <SubmitButton className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-start text-sm font-medium text-ink hover:bg-subtle disabled:opacity-60">
          <Icon name="signOut" className="size-4 text-muted" />
          {t('signOut')}
        </SubmitButton>
      </form>
    </AccountDropdown>
  );
}
