import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email-sender';
import { getInboxForUser } from '@/lib/scheduler';

interface Params {
  params: { id: string };
}

// Send a manual message from the conversation view (when AI is stopped).
// Saves the message with role="owner".
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lead = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
      select: { id: true, email: true, conversationId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const body = await req.json();
    const { subject, content } = body as { subject?: string; content?: string };

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Message content is required.' }, { status: 400 });
    }

    const inbox = await getInboxForUser(session.user.id);
    if (!inbox) {
      return NextResponse.json({ error: 'No connected inbox available.' }, { status: 400 });
    }

    const result = await sendEmail(inbox, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: subject || `Re: ${lead.companyName}`,
      text: content,
    });

    let conversationId = lead.conversationId;
    if (!conversationId) {
      const conv = await prisma.conversation.create({
        data: { leadId: lead.id, userId: session.user.id, status: 'ACTIVE', lastActivity: new Date() },
      });
      conversationId = conv.id;
      await prisma.userLead.update({ where: { id: lead.id }, data: { conversationId } });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        leadId: lead.id,
        userId: session.user.id,
        role: 'OWNER',
        content,
        subject: subject || `Re: ${lead.companyName}`,
        aiGenerated: false,
        providerMessageId: result.providerMessageId,
        threadId: result.threadId,
        status: 'SENT',
      },
    });

    await prisma.userLead.update({
      where: { id: lead.id },
      data: { lastMessageDate: new Date() },
    });

    return NextResponse.json({ success: true, message });
  } catch {
    return NextResponse.json({ error: 'Failed to send manual message.' }, { status: 500 });
  }
}
