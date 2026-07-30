import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Click tracking redirect — wraps links in emails.
// When the user clicks a tracked link, they hit this endpoint first,
// we record the click, then redirect them to the real URL.
export async function GET(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get('m');
  const targetUrl = req.nextUrl.searchParams.get('u');

  if (messageId) {
    try {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, clickedAt: true, leadId: true },
      });
      if (msg && !msg.clickedAt) {
        await prisma.message.update({
          where: { id: messageId },
          data: { clickedAt: new Date() },
        });
        if (msg.leadId) {
          await prisma.userLead.updateMany({
            where: { id: msg.leadId, clickedAt: null },
            data: { clickedAt: new Date() },
          });
        }
      }
    } catch {
      // silent — tracking should never block the redirect
    }
  }

  if (targetUrl && isValidUrl(targetUrl)) {
    return NextResponse.redirect(targetUrl, 302);
  }

  return NextResponse.redirect(new URL('/', req.url), 302);
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
