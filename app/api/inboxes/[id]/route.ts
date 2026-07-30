import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inbox = await prisma.inbox.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found.' }, { status: 404 });
    }

    await prisma.inbox.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to disconnect inbox.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { dailySendingCap, warmupThrottle } = body as {
      dailySendingCap?: number;
      warmupThrottle?: boolean;
    };

    const inbox = await prisma.inbox.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found.' }, { status: 404 });
    }

    await prisma.inbox.update({
      where: { id: params.id },
      data: {
        ...(dailySendingCap !== undefined && { dailySendingCap }),
        ...(warmupThrottle !== undefined && { warmupThrottle }),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update inbox.' }, { status: 500 });
  }
}
