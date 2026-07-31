import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
import { getCurrentUser, hasPermission } from '@/lib/permissions';
type Role = string;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canSeeAll = hasPermission(currentUser.role as Role, 'delete');

    await connectDB();
    const logs = await ActivityLog.find(canSeeAll ? {} : { userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({ path: 'userId', select: 'name email' })
      .lean();

    const formatted = logs.map((l: any) => ({
      ...l,
      id: l._id.toString(),
      user: l.userId ? { name: l.userId.name, email: l.userId.email } : null,
    }));

    return NextResponse.json({ logs: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch activity log.' }, { status: 500 });
  }
}
