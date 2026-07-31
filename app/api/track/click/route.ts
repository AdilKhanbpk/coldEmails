import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Message from '@/models/Message';
import UserLead from '@/models/UserLead';

export async function GET(req: NextRequest) {
  const messageId = req.nextUrl.searchParams.get('m');
  const targetUrl = req.nextUrl.searchParams.get('u');

  if (messageId) {
    try {
      await connectDB();
      const msg = await Message.findById(messageId).select('clickedAt leadId').lean();
      if (msg && !msg.clickedAt) {
        await Message.findByIdAndUpdate(messageId, { clickedAt: new Date() });
        if (msg.leadId) {
          await UserLead.updateMany({ _id: msg.leadId, clickedAt: null }, { clickedAt: new Date() });
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
