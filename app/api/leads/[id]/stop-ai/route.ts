import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import Conversation from '@/models/Conversation';
import { cancelJobsForLead } from '@/lib/scheduler';

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
      .select('_id aiEnabled conversationId')
      .lean();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    await UserLead.findByIdAndUpdate(params.id, { aiEnabled: false });

    if (lead.conversationId) {
      await Conversation.findByIdAndUpdate(lead.conversationId, { aiEnabled: false });
    }

    await cancelJobsForLead(params.id);

    return NextResponse.json({ success: true, aiEnabled: false });
  } catch {
    return NextResponse.json({ error: 'Failed to stop AI.' }, { status: 500 });
  }
}
