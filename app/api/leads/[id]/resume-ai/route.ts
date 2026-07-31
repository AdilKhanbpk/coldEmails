import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import Conversation from '@/models/Conversation';

interface Params {
  params: { id: string };
}

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const lead = await UserLead.findOne({ _id: params.id, userId: session.user.id })
      .select('_id aiEnabled conversationId status outreachTypeId')
      .lean();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    await UserLead.findByIdAndUpdate(params.id, { aiEnabled: true });

    if (lead.conversationId) {
      await Conversation.findByIdAndUpdate(lead.conversationId, { aiEnabled: true });
    }

    return NextResponse.json({ success: true, aiEnabled: true });
  } catch {
    return NextResponse.json({ error: 'Failed to resume AI.' }, { status: 500 });
  }
}
