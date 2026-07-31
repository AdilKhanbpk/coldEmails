import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import OutreachType from '@/models/OutreachType';
import UserLead from '@/models/UserLead';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const outreachTypes = await OutreachType.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const withCounts = await Promise.all(
      outreachTypes.map(async (ot: any) => {
        const leadCount = await UserLead.countDocuments({ outreachTypeId: ot._id });
        return { ...ot, id: ot._id.toString(), _count: { leads: leadCount } };
      }),
    );

    return NextResponse.json(withCounts);
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

    const wantActive = active !== false;

    await connectDB();
    const outreachType = await OutreachType.create({
      userId: session.user.id,
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      exampleEmails: exampleEmails.map((e) => e.trim()),
      sequenceSteps,
      active: wantActive,
    });

    return NextResponse.json({ ...outreachType.toObject(), id: outreachType._id.toString() }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to create outreach type.' },
      { status: 500 },
    );
  }
}
