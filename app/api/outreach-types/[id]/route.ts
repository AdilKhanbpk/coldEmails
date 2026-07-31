import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import OutreachType from '@/models/OutreachType';
import UserLead from '@/models/UserLead';

interface Params {
  params: { id: string };
}

export async function GET(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const outreachType = await OutreachType.findOne({ _id: params.id, userId: session.user.id }).lean();

    if (!outreachType) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const leadCount = await UserLead.countDocuments({ outreachTypeId: params.id });

    return NextResponse.json({ ...outreachType, id: outreachType._id.toString(), _count: { leads: leadCount } });
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

    await connectDB();
    const existing = await OutreachType.findOne({ _id: params.id, userId: session.user.id }).lean();
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

    const updated = await OutreachType.findByIdAndUpdate(
      params.id,
      {
        name: name.trim(),
        systemPrompt: systemPrompt.trim(),
        exampleEmails: exampleEmails.map((e) => e.trim()),
        sequenceSteps,
        active: active !== false,
      },
      { new: true },
    ).lean();

    return NextResponse.json({ ...updated, id: updated!._id.toString() });
  } catch {
    return NextResponse.json({ error: 'Failed to update.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { active } = body as { active?: boolean };

    await connectDB();
    const existing = await OutreachType.findOne({ _id: params.id, userId: session.user.id }).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

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

    const updated = await OutreachType.findByIdAndUpdate(
      params.id,
      { active: active ?? !existing.active },
      { new: true },
    ).lean();

    return NextResponse.json({ ...updated, id: updated!._id.toString() });
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

    await connectDB();
    const existing = await OutreachType.findOne({ _id: params.id, userId: session.user.id }).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const leadCount = await UserLead.countDocuments({ outreachTypeId: params.id });

    if (leadCount > 0) {
      return NextResponse.json(
        {
          error: `Deactivate instead — ${leadCount} ${leadCount === 1 ? 'lead is' : 'leads are'} using this type.`,
        },
        { status: 409 },
      );
    }

    await OutreachType.findByIdAndDelete(params.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete.' }, { status: 500 });
  }
}
