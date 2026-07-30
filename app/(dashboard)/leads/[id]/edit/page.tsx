import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { LeadEditForm } from './lead-edit-form';

export default async function EditLeadPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const [lead, outreachTypes] = await Promise.all([
    prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
    }),
    prisma.outreachType.findMany({
      where: { userId: session.user.id, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!lead) redirect('/leads');

  return (
    <LeadEditForm
      lead={{
        id: lead.id,
        companyName: lead.companyName,
        email: lead.email,
        services: lead.services,
        country: lead.country,
        website: lead.website || '',
        outreachTypeId: lead.outreachTypeId || '',
        outreachDescription: lead.outreachDescription,
        preferredTime: lead.preferredTime.toISOString(),
        timezone: lead.timezone,
      }}
      outreachTypes={outreachTypes}
    />
  );
}
