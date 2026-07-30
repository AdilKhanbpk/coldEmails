import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NOT_STARTED: { label: 'Not started', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  IN_PROGRESS: { label: 'In progress', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  REPLIED: { label: 'Replied', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  MEETING_BOOKED: { label: 'Meeting booked', className: 'border-green-200 bg-green-50 text-green-700' },
  NOT_INTERESTED: { label: 'Not interested', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  BOUNCED: { label: 'Bounced', className: 'border-red-200 bg-red-50 text-red-600' },
  UNSUBSCRIBED: { label: 'Unsubscribed', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  COMPLETED: { label: 'Completed', className: 'border-green-200 bg-green-50 text-green-700' },
  STOPPED: { label: 'Stopped', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  ACTIVE: { label: 'Active', className: 'border-green-200 bg-green-50 text-green-700' },
  PAUSED: { label: 'Paused', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  ENDED: { label: 'Ended', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  CLOSED: { label: 'Closed', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  CONNECTED: { label: 'Connected', className: 'border-green-200 bg-green-50 text-green-700' },
  EXPIRED: { label: 'Expired', className: 'border-red-200 bg-red-50 text-red-600' },
  ERROR: { label: 'Error', className: 'border-red-200 bg-red-50 text-red-600' },
  DISCONNECTED: { label: 'Disconnected', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  PROPOSED: { label: 'Proposed', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  CONFIRMED: { label: 'Confirmed', className: 'border-green-200 bg-green-50 text-green-700' },
  CANCELLED: { label: 'Cancelled', className: 'border-gray-200 bg-gray-50 text-gray-500' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'border-gray-200 text-gray-500' };
  return (
    <Badge variant="outline" className={`font-normal ${config.className}`}>
      {config.label}
    </Badge>
  );
}

const REPLY_TAG_CONFIG: Record<string, { label: string; className: string }> = {
  INTERESTED: { label: 'Interested', className: 'border-green-200 bg-green-50 text-green-700' },
  WANTS_MEETING: { label: 'Wants meeting', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  NOT_INTERESTED: { label: 'Not interested', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  OUT_OF_OFFICE: { label: 'Out of office', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

export function ReplyTagBadge({ tag }: { tag: string | null | undefined }) {
  if (!tag) return null;
  const config = REPLY_TAG_CONFIG[tag] || { label: tag, className: 'border-gray-200 text-gray-500' };
  return (
    <Badge variant="outline" className={`font-normal ${config.className}`}>
      {config.label}
    </Badge>
  );
}
