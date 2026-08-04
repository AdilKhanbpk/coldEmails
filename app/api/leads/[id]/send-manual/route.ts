import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import Conversation from '@/models/Conversation';
import Message from '@/models/Message';
import { sendEmail } from '@/lib/email-sender';
import { getInboxForUser } from '@/lib/scheduler';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const lead = await UserLead.findOne({ _id: id, userId: session.user.id })
      .select('_id email companyName conversationId')
      .lean();

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
      content,
      subject: subject || `Re: ${lead.companyName}`,
      aiGenerated: false,
      providerMessageId: result.providerMessageId,
      threadId: result.threadId,
      status: 'SENT',
    });

    await UserLead.findByIdAndUpdate(lead._id, { lastMessageDate: new Date() });

    return NextResponse.json({ success: true, message: { ...message.toObject(), id: message._id.toString() } });
  } catch {
    return NextResponse.json({ error: 'Failed to send manual message.' }, { status: 500 });
  }
}
