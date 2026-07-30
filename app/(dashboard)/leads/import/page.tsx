import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { ImportClient } from './import-client';

export default async function ImportLeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const outreachTypes = await prisma.outreachType.findMany({
    where: { userId: session.user.id, active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return <ImportClient outreachTypes={outreachTypes} />;
}
