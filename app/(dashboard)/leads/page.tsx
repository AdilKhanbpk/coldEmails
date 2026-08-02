import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { LeadsClient } from './leads-client';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
// const LeadsClient = dynamic(() => import('./leads-client').then(mod => mod.LeadsClient), { ssr: false, loading: () => <p className="text-center">Loading leads...</p> });

export default async function LeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();

  // No need to fetch outreach types here; they are provided via DashboardContext
  return <LeadsClient />;
}
