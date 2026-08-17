import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Job from '@/models/Job';

/**
 * Debug endpoint to check scheduled jobs
 * Access via: http://localhost:3000/api/worker/debug
 */
export async function GET() {
  try {
    await connectDB();
    
    const now = new Date();
    console.log('[debug] Current server time:', now.toISOString());
    console.log('[debug] Current server timestamp:', now.getTime());
    
    // Get all scheduled jobs
    const allScheduled = await Job.find({ status: 'SCHEDULED' })
      .sort({ runAt: 1 })
      .lean();
    
    console.log(`[debug] Total SCHEDULED jobs in DB: ${allScheduled.length}`);
    
    // Get jobs that should be due (runAt <= now)
    const dueJobs = await Job.find({ 
      status: 'SCHEDULED', 
      runAt: { $lte: now } 
    })
      .sort({ runAt: 1 })
      .lean();
    
    console.log(`[debug] Jobs with runAt <= now: ${dueJobs.length}`);
    
    const response = {
      serverTime: now.toISOString(),
      serverTimestamp: now.getTime(),
      totalScheduled: allScheduled.length,
      dueJobsCount: dueJobs.length,
      allScheduledJobs: allScheduled.map(j => ({
        _id: j._id.toString(),
        type: j.type,
        runAt: j.runAt,
        runAtISO: new Date(j.runAt).toISOString(),
        runAtTimestamp: new Date(j.runAt).getTime(),
        status: j.status,
        isDue: new Date(j.runAt).getTime() <= now.getTime(),
        timeDiff: `${Math.floor((now.getTime() - new Date(j.runAt).getTime()) / 1000 / 60)} minutes`,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
      dueJobs: dueJobs.map(j => ({
        _id: j._id.toString(),
        type: j.type,
        leadId: j.leadId.toString(),
        runAt: new Date(j.runAt).toISOString(),
        status: j.status,
      })),
    };
    
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    
    console.error('[debug] Error:', message, stack);
    
    return NextResponse.json(
      { error: message, stack },
      { status: 500 }
    );
  }
}
