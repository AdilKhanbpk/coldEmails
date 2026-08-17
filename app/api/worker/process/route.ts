import { NextRequest, NextResponse } from 'next/server';
import { processDueJobs } from '@/lib/email-worker';

/**
 * Worker trigger endpoint — called by cron-job.org every minute.
 *
 * Setup on cron-job.org:
 *   URL:      https://your-domain.com/api/worker/process
 *   Method:   GET
 *   Schedule: Every 1 minute (crontab: * * * * *)
 *
 * Must respond within 30 seconds — hard 25s timeout enforced below.
 */
export async function GET(req: NextRequest) {
  const timeoutMs = 25_000;

  try {
    console.log('[worker] Processing due jobs at', new Date().toISOString());
    
    const result = await Promise.race([
      processDueJobs(50),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Worker timeout')), timeoutMs),
      ),
    ]);

    console.log('[worker] Processed:', result.processed, 'Skipped:', result.skipped);

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      skipped: result.skipped,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Worker failed';
    const stack = e instanceof Error ? e.stack : undefined;
    const isTimeout = message === 'Worker timeout';
    
    console.error('[worker] Error:', message, stack);
    
    return NextResponse.json(
      { ok: isTimeout, message, error: stack },
      { status: isTimeout ? 200 : 500 },
    );
  }
}
