import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      businessName: true,
      businessDescription: true,
      services: true,
      aiPaused: true,
    },
  });

  if (!user) redirect('/login');

  const inboxCount = await prisma.inbox.count({
    where: { userId: session.user.id },
  });

  return (
    <SettingsClient
      user={{
        name: user.name,
        email: user.email,
        businessName: user.businessName || '',
        businessDescription: user.businessDescription || '',
        services: user.services,
        aiPaused: user.aiPaused,
      }}
      inboxCount={inboxCount}
    />
  );
}
