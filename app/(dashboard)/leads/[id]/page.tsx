import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { LeadDetailContent } from './lead-detail-content';

export const metadata = { title: 'Lead Detail — Outreach AI' };

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const lead = await prisma.userLead.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { outreachType: { select: { id: true, name: true } } },
  });

  if (!lead) redirect('/leads');

  return (
    <LeadDetailContent
      lead={{
        ...lead,
        preferredTime: lead.preferredTime.toISOString(),
        createdAt: lead.createdAt.toISOString(),
        lastMessageDate: lead.lastMessageDate?.toISOString() || null,
        replyTag: lead.replyTag || null,
      }}
    />
  );
}
