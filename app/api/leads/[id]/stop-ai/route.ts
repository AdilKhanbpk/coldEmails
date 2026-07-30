import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cancelJobsForLead } from '@/lib/scheduler';

interface Params {
  params: { id: string };
}

// Stop AI for a specific lead — sets aiEnabled=false on both Lead and Conversation.
// Cancels any pending AI-reply jobs for that lead only.
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lead = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: { id: true, aiEnabled: true, conversationId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    await prisma.userLead.update({
      where: { id: lead.id },
      data: { aiEnabled: false },
    });

    if (lead.conversationId) {
      await prisma.conversation.update({
        where: { id: lead.conversationId },
        data: { aiEnabled: false },
      });
    }

    await cancelJobsForLead(lead.id);

    return NextResponse.json({ success: true, aiEnabled: false });
  } catch {
    return NextResponse.json({ error: 'Failed to stop AI.' }, { status: 500 });
  }
}
