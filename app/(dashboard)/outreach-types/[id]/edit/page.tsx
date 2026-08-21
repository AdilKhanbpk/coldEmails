import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import OutreachType from '@/models/OutreachType';
import { redirect } from 'next/navigation';
import { OutreachTypeForm } from '../../outreach-type-form';
import { serializeDoc } from '@/lib/serialize';

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

  const initialData = serializeDoc({
    name: outreachType.name,
    systemPrompt: outreachType.systemPrompt,
    exampleEmails: outreachType.exampleEmails || [],
    sequenceSteps: outreachType.sequenceSteps || [],
    active: outreachType.active ?? true,
  });

  return <OutreachTypeForm mode="edit" typeId={id} initialData={initialData} />;
}
