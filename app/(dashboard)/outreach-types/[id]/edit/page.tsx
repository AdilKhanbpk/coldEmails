import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { OutreachTypeForm } from '../../outreach-type-form';

export default async function EditOutreachTypePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const outreachType = await prisma.outreachType.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!outreachType) redirect('/outreach-types');

  return (
    <OutreachTypeForm
      mode="edit"
      typeId={outreachType.id}
      initialData={{
        name: outreachType.name,
        systemPrompt: outreachType.systemPrompt,
        exampleEmails: outreachType.exampleEmails as string[],
        sequenceSteps: outreachType.sequenceSteps as { stepNumber: number; delayDays: number }[],
        active: outreachType.active,
      }}
    />
  );
}
