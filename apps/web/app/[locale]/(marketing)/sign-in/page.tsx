import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SignInForm } from '@/components/sign-in-form';
import { getCurrentUser } from '@/lib/auth';
import { safeNext } from '@/lib/routes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth');
  return { title: t('title'), robots: { index: false } };
}

export default async function SignInPage({ searchParams }: PageProps<'/[locale]/sign-in'>) {
  const t = await getTranslations('Auth');
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="max-w-md text-zinc-700">{t('intro')}</p>
      <Suspense fallback={null}>
        <SignInPanel searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SignInPanel({ searchParams }: Pick<PageProps<'/[locale]/sign-in'>, 'searchParams'>) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getCurrentUser()) redirect(next);

  const error = params.error === 'link' || params.error === 'google' ? params.error : undefined;
  return <SignInForm next={next} redirectError={error} googleEnabled={process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'true'} />;
}
