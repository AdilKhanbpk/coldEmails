import { NextRequest, NextResponse } from 'next/server';
import { processDueJobs } from '@/lib/email-worker';

// Worker trigger endpoint — called by a cron job or scheduled task.
// In production with BullMQ, this endpoint would not be needed (the worker
// process runs continuously). With the in-process fallback, this endpoint
// polls for due jobs and processes them on each call.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processDueJobs(50);
    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Worker failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
