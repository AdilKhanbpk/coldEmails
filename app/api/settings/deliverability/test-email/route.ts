import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email-sender';
import { getInboxForUser } from '@/lib/scheduler';

// Send a test email to check deliverability/placement.
// NOTE: Full inbox-placement testing (spam folder vs. promotions tab vs. primary)
// typically requires a third-party service like Mailtrap or GlockApps.
// This endpoint sends a real test email and confirms delivery was accepted
// by the SMTP server. For deeper placement analysis, integrate a testing
// service's API at the marked integration point below.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { testEmail } = body as { testEmail?: string };

    if (!testEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      return NextResponse.json({ error: 'A valid test email address is required.' }, { status: 400 });
    }

    const inbox = await getInboxForUser(session.user.id);
    if (!inbox) {
      return NextResponse.json({ error: 'No connected inbox available to send from.' }, { status: 400 });
    }

    const testSubject = `Deliverability test from ${inbox.emailAddress}`;
    const testBody = [
      'This is a test email to check deliverability.',
      '',
      `Sent from: ${inbox.emailAddress}`,
      `Sent at: ${new Date().toISOString()}`,
      '',
      'If you received this in your inbox, basic SMTP delivery is working.',
      '',
      'NOTE: Full inbox-placement testing (spam folder vs. promotions tab)',
      'requires a third-party service like Mailtrap or GlockApps.',
      'This test only confirms the email was accepted by the recipient server.',
    ].join('\n');

    try {
      const result = await sendEmail(inbox, {
        to: testEmail.trim(),
        from: inbox.emailAddress,
        subject: testSubject,
        text: testBody,
      });

      // INTEGRATION POINT: To add full inbox-placement testing, call a
      // third-party API here (e.g. Mailtrap, GlockApps, Mail-Tester).
      // Store the result in a new table and poll for placement results.
      // For now, we only confirm SMTP acceptance.

      return NextResponse.json({
        success: true,
        message: 'Test email sent successfully. Check the recipient inbox for delivery confirmation.',
        providerMessageId: result.providerMessageId,
        note: 'Full inbox-placement testing (spam/promotions detection) requires a third-party service integration.',
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Failed to send test email.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: 'Failed to send test email.' }, { status: 500 });
  }
}
