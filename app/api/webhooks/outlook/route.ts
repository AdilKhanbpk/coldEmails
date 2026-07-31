import { NextRequest, NextResponse } from 'next/server';
import { processIncomingReply } from '@/lib/email-worker';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';

// ---------------------------------------------------------------------------
// Microsoft Graph webhook (change notifications).
// Microsoft sends a POST with a validationToken on subscription creation,
// then sends change notifications when new messages arrive.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Subscription validation request
    if (contentType.includes('text/plain')) {
      const token = await req.text();
      return new NextResponse(token, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const body = await req.json();

    // Change notification (can be a batch)
    const notifications = body.value || [body];
    for (const notif of notifications) {
      const resourceData = notif.resourceData;
      if (!resourceData) continue;

      const emailAddress = notif.clientState || '';
      const messageId = resourceData.id;

      // Find inbox by clientState (we store email there during subscription)
      await connectDB();
      const inbox = emailAddress
        ? await Inbox.findOne({ emailAddress, status: 'CONNECTED' }).lean()
        : null;

      if (!inbox) continue;

      // The actual message content is fetched via Graph API in the poller.
      // We trigger processing which will fetch the full message.
      // For now, log the notification — the backup poller will fetch content.
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
