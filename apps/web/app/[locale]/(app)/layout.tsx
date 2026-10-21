import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function SignedIn({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}

// Host app: plan, plans, inquiries, bookings, assistant (WEB_APP_PLAN §4.2).
export default function HostAppLayout({ children }: LayoutProps<'/[locale]'>) {
  return <AppShell gate={SignedIn}>{children}</AppShell>;
}
