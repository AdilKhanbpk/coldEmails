import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import OutreachType from '@/models/OutreachType';
import { redirect } from 'next/navigation';
import { LeadEditForm } from './lead-edit-form';

interface PageProps {
  params: { id: string };
}

export default async function LeadEditPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();

  const [lead, outreachTypes] = await Promise.all([
    UserLead.findOne({ _id: params.id, userId: session.user.id }).lean(),
    OutreachType.find({ userId: session.user.id, active: true })
      .select('name')
      .sort({ name: 1 })
      .lean(),
  ]);

  if (!lead) redirect('/leads');

  const formattedLead = { ...lead, id: lead._id.toString() };
  const formattedTypes = outreachTypes.map((ot: any) => ({ id: ot._id.toString(), name: ot.name }));

  return <LeadEditForm lead={formattedLead} outreachTypes={formattedTypes} />;
}
