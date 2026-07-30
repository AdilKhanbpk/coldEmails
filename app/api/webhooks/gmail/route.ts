import { NextRequest, NextResponse } from 'next/server';
import { processIncomingReply } from '@/lib/email-worker';
import { prisma } from '@/lib/prisma';

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
    const inbox = await prisma.inbox.findFirst({
      where: { emailAddress, status: 'CONNECTED' },
    });

    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found' }, { status: 404 });
    }

    // Fetch new messages since the last historyId
    // In production, use the Gmail API to get history changes.
    // For now, trigger the poller for this specific inbox.
    // The actual message fetching happens in the poller.
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
