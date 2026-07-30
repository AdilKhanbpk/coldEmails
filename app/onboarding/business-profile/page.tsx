import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { BusinessProfileForm } from './business-profile-form';

export default async function BusinessProfileOnboarding() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { businessName: true, businessDescription: true, services: true },
  });

  // If profile is already complete, go to dashboard instead.
  if (
    user?.businessName &&
    user.businessDescription &&
    user.services.length > 0
  ) {
    redirect('/dashboard');
  }

  return <BusinessProfileForm />;
}
