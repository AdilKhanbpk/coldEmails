import { NextRequest, NextResponse } from 'next/server';
import { pollInboxes } from '@/lib/inbox-poller';

// Backup poll endpoint — called by cron every few minutes.
// Checks all connected inboxes for new messages that webhooks may have missed.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await pollInboxes();
    return NextResponse.json({
      success: true,
      checked: result.checked,
      newReplies: result.newReplies,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Polling failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
