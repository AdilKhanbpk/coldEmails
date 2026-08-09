import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import UserLead from '@/models/UserLead';
import Conversation from '@/models/Conversation';
import Message from '@/models/Message';
import { sendEmail } from '@/lib/email-sender';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, subject, content } = body as {
      leadId: string;
      subject?: string;
      content: string;
    };

    if (!leadId || !content?.trim()) {
      return NextResponse.json({ error: 'leadId and content are required.' }, { status: 400 });
    }

    await connectDB();

    const [inbox, lead] = await Promise.all([
      Inbox.findOne({ _id: id, userId: session.user.id }).lean(),
      UserLead.findOne({ _id: leadId, userId: session.user.id })
        .select('_id email companyName conversationId')
        .lean(),
    ]);

    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found.' }, { status: 404 });
    }
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }
    if (inbox.status !== 'CONNECTED') {
      return NextResponse.json({ error: 'This inbox is not connected. Please reconnect it in Settings.' }, { status: 400 });
    }

    const result = await sendEmail(inbox as any, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: subject?.trim() || `Outreach to ${lead.companyName}`,
      text: content.trim(),
    });

    // Ensure conversation exists
    let conversationId = lead.conversationId;
    if (!conversationId) {
      const conv = await Conversation.create({
        leadId: lead._id,
        userId: session.user.id,
        status: 'ACTIVE',
        lastActivity: new Date(),
      });
      conversationId = conv._id;
      await UserLead.findByIdAndUpdate(lead._id, { conversationId });
    }

    const message = await Message.create({
      conversationId,
      leadId: lead._id,
      userId: session.user.id,
      role: 'OWNER',
      content: content.trim(),
      subject: subject?.trim() || `Outreach to ${lead.companyName}`,
      aiGenerated: false,
      senderEmail: inbox.emailAddress,
      providerMessageId: result.providerMessageId,
      threadId: result.threadId,
      status: 'SENT',
    });

    await UserLead.findByIdAndUpdate(lead._id, { lastMessageDate: new Date() });

    return NextResponse.json({
      success: true,
      message: { id: (message._id as string).toString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send email.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
