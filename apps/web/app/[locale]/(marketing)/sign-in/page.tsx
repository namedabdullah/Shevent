import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ArchWindow } from '@/components/ornaments';
import { SignInForm } from '@/components/sign-in-form';
import { Eyebrow } from '@/components/ui/page';
import { getCurrentUser } from '@/lib/auth';
import { safeNext } from '@/lib/routes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Auth');
  return { title: t('title'), robots: { index: false } };
}

export default async function SignInPage({ searchParams }: PageProps<'/[locale]/sign-in'>) {
  const t = await getTranslations('Auth');
  return (
    <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <div className="grid w-full max-w-4xl animate-enter overflow-hidden rounded-[2rem] border border-sand-200 bg-white shadow-lift md:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4 p-6 sm:p-10">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
          <p className="max-w-md leading-relaxed text-sand-700">{t('intro')}</p>
          <Suspense fallback={null}>
            <SignInPanel searchParams={searchParams} />
          </Suspense>
        </div>
        <div className="hidden items-end justify-center bg-brand-950 px-10 pt-14 md:flex">
          <ArchWindow className="aspect-[4/5] w-full" />
        </div>
      </div>
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
