import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AssistantChat } from '@/components/assistant-chat';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Assistant');
  return { title: t('title') };
}

// #8 chat planner (WEB_APP_PLAN §4.2, P1). The planner form stays one link away throughout.
export default async function AssistantPage() {
  const t = await getTranslations('Assistant');
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sand-700">{t('intro')}</p>
      </div>
      <AssistantChat />
    </main>
  );
}
