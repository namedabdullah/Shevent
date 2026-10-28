import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AssistantChat } from '@/components/assistant-chat';
import { Page, PageHeader } from '@/components/ui/page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Assistant');
  return { title: t('title') };
}

// #8 chat planner (WEB_APP_PLAN §4.2, P1). The planner form stays one link away throughout.
export default async function AssistantPage() {
  const t = await getTranslations('Assistant');
  return (
    <Page width="narrow">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <AssistantChat />
    </Page>
  );
}
