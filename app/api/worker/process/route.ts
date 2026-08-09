import { NextRequest, NextResponse } from 'next/server';
import { processDueJobs } from '@/lib/email-worker';

/**
 * Worker trigger endpoint — called by cron-job.org every minute.
 *
 * Setup on cron-job.org:
 *   URL:    https://your-domain.com/api/worker/process?secret=YOUR_CRON_SECRET
 *   Method: GET
 *   Schedule: Every 1 minute  (crontab: * * * * *)
 *
 * The secret is compared against the CRON_SECRET environment variable.
 * If CRON_SECRET is not set, the endpoint is open (not recommended in production).
 *
 * cron-job.org requirements:
 *   - Must respond within 30 seconds → we enforce a 25s hard timeout
 *   - Must accept plain HTTP GET requests
 *   - Must be publicly accessible (not localhost)
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    // Accept secret via query param (?secret=xxx) OR Authorization header
    // cron-job.org can send either — query param is easiest to configure
    const querySecret = req.nextUrl.searchParams.get('secret');
    const authHeader = req.headers.get('authorization');
    const headerSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (querySecret !== cronSecret && headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Hard 25-second timeout so we always respond before cron-job.org's 30s cutoff.
  // processDueJobs will process as many jobs as it can within this window.
  const timeoutMs = 25_000;

  try {
    const result = await Promise.race([
      processDueJobs(50),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Worker timeout')), timeoutMs),
      ),
    ]);

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      skipped: result.skipped,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Worker failed';
    // Still return 200 so cron-job.org doesn't mark it as an error on timeout —
    // a timeout just means we ran out of time, not that something is broken.
    const isTimeout = message === 'Worker timeout';
    return NextResponse.json(
      { ok: isTimeout, message },
      { status: isTimeout ? 200 : 500 },
    );
  }
}
