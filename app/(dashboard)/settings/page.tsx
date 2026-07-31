import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import Inbox from '@/models/Inbox';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();

  const [user, inboxCount] = await Promise.all([
    User.findById(session.user.id)
      .select('name email businessName businessDescription services role plan aiPaused')
      .lean(),
    Inbox.countDocuments({ userId: session.user.id, status: 'CONNECTED' }),
  ]);

  if (!user) redirect('/login');

  const formattedUser = { ...user, id: user._id.toString() };

  return <SettingsClient user={formattedUser} inboxCount={inboxCount} />;
}
