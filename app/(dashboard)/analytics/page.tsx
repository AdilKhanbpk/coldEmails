import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { AnalyticsClient } from './analytics-client';

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const outreachTypes = await prisma.outreachType.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true },
  });

  return <AnalyticsClient outreachTypes={outreachTypes} />;
}
