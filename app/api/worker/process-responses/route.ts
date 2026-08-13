import { NextRequest, NextResponse } from 'next/server';
import { pollInboxesSince } from '@/lib/inbox-poller';

// Endpoint protected by CRON_SECRET header. Cron job should call this every 5 minutes.
export async function GET(req: NextRequest) {
  // Public endpoint: process messages received in the last 5 minutes.
  try {
    const result = await pollInboxesSince(6, true);
    return NextResponse.json({ success: true, checked: result.checked, newReplies: result.newReplies, timestamp: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Processing failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
