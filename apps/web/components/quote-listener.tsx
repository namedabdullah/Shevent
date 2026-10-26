'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Re-renders the host's inquiry page when the vendor sends a quote, so it appears without a reload. */
export function QuoteListener({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`quotes:${inquiryId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quotes', filter: `inquiry_id=eq.${inquiryId}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, inquiryId, router]);

  return null;
}
