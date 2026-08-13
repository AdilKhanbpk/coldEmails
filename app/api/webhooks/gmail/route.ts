import { NextRequest, NextResponse } from 'next/server';
import { processIncomingReply } from '@/lib/email-worker';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import { pollInboxes } from '@/lib/inbox-poller';

// ---------------------------------------------------------------------------
// Gmail push notification webhook (Google Cloud Pub/Sub).
// Google sends a POST with a JSON body containing the message data.
// We decode it, find the inbox, and process the new message.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Pub/Sub message format
    const message = body.message || body;
    const data = message.data ? Buffer.from(message.data, 'base64').toString('utf-8') : '';
    const parsed = JSON.parse(data || '{}');

    const emailAddress = parsed.emailAddress;
    const historyId = parsed.historyId;

    if (!emailAddress) {
      return NextResponse.json({ error: 'Missing emailAddress' }, { status: 400 });
    }

    // Find the inbox by email address
    await connectDB();
    const inbox = await Inbox.findOne({ emailAddress, status: 'CONNECTED' }).lean();

    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });
    }

    // Trigger the inbox poller immediately so we fetch and process the new messages.
    // This is safe — the poller will skip messages already processed.
    try {
      await pollInboxes();
    } catch (e) {
      // swallow errors to avoid webhook failures
    }

    return NextResponse.json({ success: true, historyId });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// Google Pub/Sub requires verification on first subscription
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ status: 'ok' });
}
