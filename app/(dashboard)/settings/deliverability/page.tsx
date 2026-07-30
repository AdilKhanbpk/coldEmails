import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DeliverabilityClient } from './deliverability-client';

export default async function DeliverabilityPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  return <DeliverabilityClient />;
}
