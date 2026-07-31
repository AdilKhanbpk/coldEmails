import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { getCurrentUser, hasPermission } from '@/lib/permissions';
import Job from '@/models/Job';
import User from '@/models/User';
type Role = string;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser || !hasPermission(currentUser.role as Role, 'manage_team')) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    await connectDB();

    const [failedJobs, users, stats] = await Promise.all([
      Job.find({ status: 'FAILED' })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate({ path: 'leadId', select: 'companyName email' })
        .lean(),
      User.find()
        .select('id name email role plan status createdAt')
        .sort({ createdAt: 1 })
        .lean(),
      Promise.all([
        Job.countDocuments({ status: 'SCHEDULED' }),
        Job.countDocuments({ status: 'RUNNING' }),
        Job.countDocuments({ status: 'FAILED' }),
        Job.countDocuments({ status: 'COMPLETED' }),
      ]).then(([scheduled, running, failed, completed]) => ({
        scheduled, running, failed, completed,
      })),
    ]);

    const formattedJobs = failedJobs.map((j: any) => ({
      ...j,
      id: j._id.toString(),
      lead: j.leadId ? { companyName: j.leadId.companyName, email: j.leadId.email } : null,
    }));

    const formattedUsers = users.map((u: any) => ({
      ...u,
      id: u._id.toString(),
    }));

    return NextResponse.json({ failedJobs: formattedJobs, users: formattedUsers, stats });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch admin data.' }, { status: 500 });
  }
}
