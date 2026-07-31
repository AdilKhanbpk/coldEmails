import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Meeting from '@/models/Meeting';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const meetings = await Meeting.find({
      userId: session.user.id,
      status: { $in: ['PROPOSED', 'CONFIRMED'] },
      scheduledTime: { $gte: new Date() },
    })
      .sort({ scheduledTime: 1 })
      .limit(10)
      .populate({ path: 'leadId', select: 'companyName email' })
      .lean();

    const formatted = meetings.map((m: any) => ({
      ...m,
      id: m._id.toString(),
      lead: m.leadId ? { id: m.leadId._id.toString(), companyName: m.leadId.companyName, email: m.leadId.email } : null,
    }));

    return NextResponse.json({ meetings: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch meetings.' }, { status: 500 });
  }
}
