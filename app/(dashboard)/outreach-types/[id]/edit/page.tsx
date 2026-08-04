import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import OutreachType from '@/models/OutreachType';
import { redirect } from 'next/navigation';
import { OutreachTypeForm } from '../../outreach-type-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditOutreachTypePage({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();
  const outreachType = await OutreachType.findOne({ _id: id, userId: session.user.id }).lean();

  if (!outreachType) redirect('/outreach-types');

  const formatted = { ...outreachType, id: outreachType._id.toString() };

  return <OutreachTypeForm outreachType={formatted} />;
}
