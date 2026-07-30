import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Toggle global AI pause for the current user.
// When aiPaused=true, the worker skips all AI generation/sending for this user.
export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { aiPaused } = body as { aiPaused?: boolean };

    if (typeof aiPaused !== 'boolean') {
      return NextResponse.json({ error: 'aiPaused boolean is required.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiPaused },
    });

    return NextResponse.json({ success: true, aiPaused });
  } catch {
    return NextResponse.json({ error: 'Failed to update AI pause setting.' }, { status: 500 });
  }
}
