import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Job from '@/models/Job';

/**
 * Debug endpoint — shows what jobs are in the database and why they may not be running.
 * Remove this in production once the issue is resolved.
 * URL: /api/worker/debug
 */
export async function GET() {
  await connectDB();

  const now = new Date();

  const [allJobs, scheduledJobs, dueJobs, runningJobs, failedJobs] = await Promise.all([
    Job.countDocuments({}),
    Job.countDocuments({ status: 'SCHEDULED' }),
    Job.countDocuments({ status: 'SCHEDULED', runAt: { $lte: now } }),
    Job.countDocuments({ status: 'RUNNING' }),
    Job.countDocuments({ status: 'FAILED' }),
  ]);

  // Get sample of all jobs to inspect
  const sampleJobs = await Job.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .select('type status runAt leadId userId stepNumber createdAt')
    .lean();

  return NextResponse.json({
    serverTime: now.toISOString(),
    counts: {
      total: allJobs,
      scheduled: scheduledJobs,
      due: dueJobs,
      running: runningJobs,
      failed: failedJobs,
    },
    recentJobs: sampleJobs.map((j: any) => ({
      id: j._id.toString(),
      type: j.type,
      status: j.status,
      runAt: j.runAt,
      runAtISO: j.runAt ? new Date(j.runAt).toISOString() : null,
      isOverdue: j.runAt ? new Date(j.runAt) <= now : false,
      leadId: j.leadId?.toString(),
      stepNumber: j.stepNumber,
      createdAt: j.createdAt,
    })),
  });
}
