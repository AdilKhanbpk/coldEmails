import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const logs = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({ path: 'userId', select: 'name email' })
      .lean();

    const formatted = logs.map((l: any) => ({
      ...l,
      id: l._id.toString(),
      user: l.userId ? { name: l.userId.name, email: l.userId.email } : null,
    }));

    return NextResponse.json({ logs: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch activity.' }, { status: 500 });
  }
}
