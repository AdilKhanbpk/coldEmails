import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import OutreachType from '@/models/OutreachType';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import AnalyticsClient from './analytics-client';
// const AnalyticsClient = dynamic(() => import('./analytics-client'), { ssr: false, loading: () => <p className="text-center">Loading analytics...</p> });

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();

  // Outreach types are provided via DashboardContext
  return <AnalyticsClient />;
}
