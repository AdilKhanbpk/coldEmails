import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import OutreachType from '@/models/OutreachType';
import { redirect } from 'next/navigation';
import { LeadForm } from '../lead-form';

export default async function NewLeadPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();
  const outreachTypes = await OutreachType.find({ userId: session.user.id, active: true })
    .select('name')
    .lean();

  const formatted = outreachTypes.map((ot: any) => ({ id: ot._id.toString(), name: ot.name }));

  return <LeadForm outreachTypes={formatted} />;
}
