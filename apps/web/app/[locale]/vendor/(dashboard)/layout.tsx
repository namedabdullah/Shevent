import { Suspense, type ReactNode } from 'react';
import { requireVendor } from '@/lib/auth';

async function VendorOnly({ children }: { children: ReactNode }) {
  await requireVendor();
  return children;
}

export default function VendorDashboardLayout({ children }: LayoutProps<'/[locale]/vendor'>) {
  return (
    <Suspense fallback={null}>
      <VendorOnly>{children}</VendorOnly>
    </Suspense>
  );
}
