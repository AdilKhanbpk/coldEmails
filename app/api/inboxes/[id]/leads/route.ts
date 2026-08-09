import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import Message from '@/models/Message';
import UserLead from '@/models/UserLead';
import mongoose from 'mongoose';

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

    // Find all unique leadIds that have messages associated with this user
    // (since outgoing messages don't always store senderEmail, we get all leads
    // for this user that have at least one message)
    const leadIds = await Message.distinct('leadId', {
      userId: session.user.id,
    });

    const leads = await UserLead.find({
      _id: { $in: leadIds },
      userId: session.user.id,
    })
      .select('companyName email status currentStep lastMessageDate aiEnabled')
      .sort({ lastMessageDate: -1 })
      .lean();

    const formatted = leads.map((l: any) => ({
      id: l._id.toString(),
      companyName: l.companyName,
      email: l.email,
      status: l.status,
      currentStep: l.currentStep,
      lastMessageDate: l.lastMessageDate ?? null,
      aiEnabled: l.aiEnabled,
    }));

    return NextResponse.json({ leads: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch leads.' }, { status: 500 });
  }
}
