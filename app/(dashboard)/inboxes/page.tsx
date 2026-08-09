import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import { redirect } from 'next/navigation';
import { InboxesView } from './inboxes-view';

export default async function InboxesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();

  const inboxes = await Inbox.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .select('provider emailAddress status dailySendingCap warmupThrottle sentToday sentDate createdAt')
    .lean();

  const formatted = inboxes.map((i: any) => ({
    id: i._id.toString(),
    provider: i.provider,
    emailAddress: i.emailAddress,
    status: i.status,
    dailySendingCap: i.dailySendingCap,
    warmupThrottle: i.warmupThrottle,
    sentToday: i.sentToday,
    sentDate: i.sentDate ? i.sentDate.toISOString() : null,
  }));

  return <InboxesView inboxes={formatted} />;
}
