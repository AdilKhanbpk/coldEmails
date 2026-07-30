import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Open tracking pixel — a 1x1 transparent GIF.
// When the email client loads this image, we record the open event.
export async function GET(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get('m');
  if (messageId) {
    try {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, openedAt: true, leadId: true },
      });
      if (msg && !msg.openedAt) {
        await prisma.message.update({
          where: { id: messageId },
          data: { openedAt: new Date() },
        });
        if (msg.leadId) {
          await prisma.userLead.updateMany({
            where: { id: msg.leadId, openedAt: null },
            data: { openedAt: new Date() },
          });
        }
      }
    } catch {
      // silent — tracking should never break the image
    }
  }

  // 1x1 transparent GIF
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  return new NextResponse(gif, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
