import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import { redirect } from 'next/navigation';
import { TeamClient } from './team-client';

export default async function TeamPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();
  const user = await User.findById(session.user.id).select('role').lean();

  if (!user || user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return <TeamClient />;
}
