import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import OutreachType from '@/models/OutreachType';
import { redirect } from 'next/navigation';
import { LeadDetailContent } from './lead-detail-content';

interface PageProps {
  params: { id: string };
}

export default async function LeadDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();

  const lead = await UserLead.findOne({ _id: params.id, userId: session.user.id })
    .populate({ path: 'outreachTypeId', select: 'name' })
    .lean();

  if (!lead) redirect('/leads');

  const outreachTypes = await OutreachType.find({ userId: session.user.id, active: true })
    .select('name')
    .lean();

  const formattedLead = {
    ...lead,
    id: lead._id.toString(),
    outreachType: lead.outreachTypeId ? { id: (lead.outreachTypeId as any)._id.toString(), name: (lead.outreachTypeId as any).name } : null,
  };
  const formattedTypes = outreachTypes.map((ot: any) => ({ id: ot._id.toString(), name: ot.name }));

  return <LeadDetailContent lead={formattedLead} outreachTypes={formattedTypes} />;
}
