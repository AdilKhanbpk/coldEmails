import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const outreachTypes = await prisma.outreachType.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: { leads: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(outreachTypes);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch outreach types.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, systemPrompt, exampleEmails, sequenceSteps, active } = body as {
      name?: string;
      systemPrompt?: string;
      exampleEmails?: string[];
      sequenceSteps?: { stepNumber: number; delayDays: number }[];
      active?: boolean;
    };

    // Validation
    if (!name?.trim()) {
      return NextResponse.json({ field: 'name', error: 'Name is required.' }, { status: 400 });
    }
    if (!systemPrompt?.trim()) {
      return NextResponse.json({ field: 'systemPrompt', error: 'AI instructions are required.' }, { status: 400 });
    }
    if (!exampleEmails || exampleEmails.length !== 4 || exampleEmails.some((e) => !e?.trim())) {
      return NextResponse.json(
        { field: 'exampleEmails', error: 'All four example emails are required.' },
        { status: 400 },
      );
    }
    if (!sequenceSteps || sequenceSteps.length === 0) {
      return NextResponse.json(
        { field: 'sequenceSteps', error: 'At least one sequence step is required.' },
        { status: 400 },
      );
    }

    // If saving as active, all four example emails must be present (already validated above).
    const wantActive = active !== false;

    const outreachType = await prisma.outreachType.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        systemPrompt: systemPrompt.trim(),
        exampleEmails: exampleEmails.map((e) => e.trim()),
        sequenceSteps,
        active: wantActive,
      },
    });

    return NextResponse.json(outreachType, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create outreach type.' },
      { status: 500 },
    );
  }
}
