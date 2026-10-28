import type { Database } from '@shevent/core/database';
import type { IconName } from '@/components/icons';
import { Badge, type BadgeTone } from '@/components/ui/badge';

type InquiryStatus = Database['public']['Enums']['inquiry_status'];

// One look per inquiry status, shared by the host and vendor sides (their wording differs).
const INQUIRY: Record<InquiryStatus, { tone: BadgeTone; icon: IconName }> = {
  open: { tone: 'gold', icon: 'message' },
  quoted: { tone: 'warning', icon: 'receipt' },
  booked: { tone: 'success', icon: 'check' },
  declined: { tone: 'muted', icon: 'info' },
  closed: { tone: 'muted', icon: 'info' },
};

export function InquiryStatusBadge({ status, label }: { status: InquiryStatus; label: string }) {
  const style = INQUIRY[status];
  return (
    <Badge tone={style.tone} icon={style.icon}>
      {label}
    </Badge>
  );
}
