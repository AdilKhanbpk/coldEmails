import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import Message from '@/models/Message';

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
    const lead = await UserLead.findOne({ _id: id, userId: session.user.id })
      .select('_id conversationId')
      .lean();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const messages = await Message.find({ leadId: id })
      .sort({ createdAt: 1 })
      .select('role content subject aiGenerated senderEmail createdAt')
      .lean();

    const formatted = messages.map((m: any) => ({ ...m, id: m._id.toString() }));

    return NextResponse.json({ messages: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages.' }, { status: 500 });
  }
}
