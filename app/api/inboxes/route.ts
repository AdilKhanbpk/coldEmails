import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';
import { encryptJSON } from '@/lib/crypto';
import { testSMTPConnection } from '@/lib/email-sender';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const inboxes = await Inbox.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .select('provider emailAddress status dailySendingCap warmupThrottle sentToday sentDate createdAt')
      .lean();

    const formatted = inboxes.map((i: any) => ({ ...i, id: i._id.toString() }));

    return NextResponse.json(formatted);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch inboxes.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { provider, emailAddress, credentials } = body as {
      provider: 'GMAIL' | 'OUTLOOK' | 'SMTP';
      emailAddress: string;
      credentials: Record<string, unknown>;
    };

    if (!provider || !emailAddress) {
      return NextResponse.json({ error: 'Provider and email address are required.' }, { status: 400 });
    }

    await connectDB();

    const existing = await Inbox.findOne({
      userId: session.user.id,
      emailAddress: emailAddress.toLowerCase(),
    });
    if (existing) {
      return NextResponse.json({ error: 'This email address is already connected.' }, { status: 409 });
    }

    const encrypted = encryptJSON(credentials);

    const inbox = await Inbox.create({
      userId: session.user.id,
      provider,
      emailAddress: emailAddress.toLowerCase(),
      credentials: encrypted,
      status: 'CONNECTED',
    });

    return NextResponse.json(
      {
        id: (inbox._id as string).toString(),
        provider: inbox.provider,
        emailAddress: inbox.emailAddress,
        status: inbox.status,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to connect inbox.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, credentials } = body as {
      action: 'test_smtp';
      credentials: { host: string; port: number; username: string; password: string; secure: boolean };
    };

    if (action === 'test_smtp' && credentials) {
      const ok = await testSMTPConnection(credentials);
      if (!ok) {
        return NextResponse.json({ success: false, error: 'Connection failed. Check your SMTP settings.' }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed.' }, { status: 500 });
  }
}
