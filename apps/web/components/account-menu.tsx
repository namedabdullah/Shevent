import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/[locale]/(marketing)/sign-in/actions';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth';

/** Signed-in email, vendor dashboard link and sign-out. Reads the session: render inside <Suspense>. */
export async function AccountMenu() {
  const [t, user] = await Promise.all([getTranslations('App'), getCurrentUser()]);
  if (!user) return null;
  return (
    <div className="flex items-center gap-4 text-sm">
      {(user.role === 'vendor' || user.role === 'admin') && (
        <Link href="/vendor" className="underline-offset-4 hover:underline">
          {t('vendorDashboard')}
        </Link>
      )}
      <span className="hidden text-zinc-600 sm:inline">{user.email}</span>
      <form action={signOut}>
        <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
          {t('signOut')}
        </button>
      </form>
    </div>
  );
}
