import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Message from '@/models/Message';
import UserLead from '@/models/UserLead';

export async function GET(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get('m');
  if (messageId) {
    try {
      await connectDB();
      const msg = await Message.findById(messageId).select('openedAt leadId').lean();
      if (msg && !msg.openedAt) {
        await Message.findByIdAndUpdate(messageId, { openedAt: new Date() });
        if (msg.leadId) {
          await UserLead.updateMany({ _id: msg.leadId, openedAt: null }, { openedAt: new Date() });
        }
      }
    } catch {
      // silent — tracking should never break the image
    }
  }

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
