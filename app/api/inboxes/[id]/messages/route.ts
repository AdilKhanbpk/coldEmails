import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import Message from '@/models/Message';
import UserLead from '@/models/UserLead';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const inbox = await Inbox.findOne({ _id: id, userId: session.user.id })
      .select('emailAddress')
      .lean();

    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found.' }, { status: 404 });
    }

    // Get all messages sent from this inbox (matched by senderEmail or the ASSISTANT role
    // where the inbox email was used). We look at ASSISTANT + OWNER messages that used
    // this inbox's email address, plus CUSTOMER replies.
    // Since Message.senderEmail is set on incoming replies, and outgoing messages use the
    // inbox emailAddress, we query all messages for leads that had at least one message
    // sent from this inbox.
    const sentMessages = await Message.find({
      userId: session.user.id,
      $or: [
        { senderEmail: inbox.emailAddress },
        { role: { $in: ['ASSISTANT', 'OWNER'] } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('leadId role content subject aiGenerated senderEmail createdAt status')
      .populate({ path: 'leadId', select: 'companyName email status' })
      .lean();

    const formatted = sentMessages.map((m: any) => ({
      id: m._id.toString(),
      leadId: m.leadId?._id?.toString() ?? m.leadId?.toString(),
      lead: m.leadId ? {
        companyName: m.leadId.companyName,
        email: m.leadId.email,
        status: m.leadId.status,
      } : null,
      role: m.role,
      content: m.content,
      subject: m.subject ?? null,
      aiGenerated: m.aiGenerated,
      senderEmail: m.senderEmail ?? null,
      createdAt: m.createdAt,
      status: m.status,
    }));

    return NextResponse.json({ messages: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages.' }, { status: 500 });
  }
}
