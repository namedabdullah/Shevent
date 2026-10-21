import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function SignedIn({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}

// Vendor area (WEB_APP_PLAN §4.3). Onboarding needs only a signed-in user; the (dashboard)
// group additionally requires the vendor role.
export default function VendorAreaLayout({ children }: LayoutProps<'/[locale]/vendor'>) {
  return <AppShell gate={SignedIn}>{children}</AppShell>;
}
