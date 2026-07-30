import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

// Resume AI for a specific lead — sets aiEnabled=true on both Lead and Conversation.
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lead = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: { id: true, aiEnabled: true, conversationId: true, status: true, outreachTypeId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    await prisma.userLead.update({
      where: { id: lead.id },
      data: { aiEnabled: true },
    });

    if (lead.conversationId) {
      await prisma.conversation.update({
        where: { id: lead.conversationId },
        data: { aiEnabled: true },
      });
    }

    return NextResponse.json({ success: true, aiEnabled: true });
  } catch {
    return NextResponse.json({ error: 'Failed to resume AI.' }, { status: 500 });
  }
}
