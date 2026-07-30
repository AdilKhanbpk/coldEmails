import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

export async function GET(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const outreachType = await prisma.outreachType.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: { _count: { select: { leads: true } } },
    });

    if (!outreachType) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(outreachType);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
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

    const existing = await prisma.outreachType.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

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

    const updated = await prisma.outreachType.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
        systemPrompt: systemPrompt.trim(),
        exampleEmails: exampleEmails.map((e) => e.trim()),
        sequenceSteps,
        active: active !== false,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update.' }, { status: 500 });
  }
}

// Soft-disable toggle: switching active to false does NOT delete the outreach type
// and does NOT affect leads already assigned to it. Future scheduling logic will
// check the `active` flag before starting new sequences on leads, but in-flight
// sequences continue. This is a soft-disable, not a deletion.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { active } = body as { active?: boolean };

    const existing = await prisma.outreachType.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // If trying to activate, ensure all 4 example emails are present.
    if (active) {
      if (
        existing.exampleEmails.length !== 4 ||
        existing.exampleEmails.some((e) => !e?.trim())
      ) {
        return NextResponse.json(
          { error: 'Cannot activate: all four example emails must be filled in.' },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.outreachType.update({
      where: { id: params.id },
      data: { active: active ?? !existing.active },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to toggle.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.outreachType.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: { _count: { select: { leads: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Hard delete is blocked when leads are assigned. The user must deactivate
    // instead so assigned leads keep their reference (the FK is ON DELETE SET NULL
    // at the DB level, but we block here to avoid silently orphaning leads).
    if (existing._count.leads > 0) {
      return NextResponse.json(
        {
          error: `Deactivate instead — ${existing._count.leads} ${existing._count.leads === 1 ? 'lead is' : 'leads are'} using this type.`,
        },
        { status: 409 },
      );
    }

    await prisma.outreachType.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete.' }, { status: 500 });
  }
}
