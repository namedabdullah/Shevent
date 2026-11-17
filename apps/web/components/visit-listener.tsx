'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Re-renders an inquiry page when the other side requests, confirms, declines or cancels a visit. */
export function VisitListener({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`visits:${inquiryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `inquiry_id=eq.${inquiryId}` }, () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, inquiryId, router]);

  return null;
}
