import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

// Get all messages for a lead's conversation
export async function GET(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lead = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: { id: true, conversationId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { leadId: params.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        subject: true,
        aiGenerated: true,
        senderEmail: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages.' }, { status: 500 });
  }
}
