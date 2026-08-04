import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import Job from '@/models/Job';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const lead = await UserLead.findOne({ _id: id, userId: session.user.id })
      .populate({ path: 'outreachTypeId', select: 'name' })
      .lean();

    if (!lead) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json({ ...lead, id: lead._id.toString() });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch lead.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();

    const existing = await UserLead.findOne({ _id: id, userId: session.user.id }).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.companyName !== undefined) updateData.companyName = body.companyName.toString().trim();
    if (body.email !== undefined) {
      if (!body.email.toString().trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.toString().trim())) {
        return NextResponse.json({ field: 'email', error: 'A valid email is required.' }, { status: 400 });
      }
      updateData.email = body.email.toString().trim().toLowerCase();
    }
    if (body.services !== undefined) updateData.services = body.services;
    if (body.country !== undefined) updateData.country = body.country.toString().trim();
    if (body.website !== undefined) updateData.website = body.website.toString().trim() || null;
    if (body.outreachTypeId !== undefined) updateData.outreachTypeId = body.outreachTypeId || null;
    if (body.outreachDescription !== undefined) updateData.outreachDescription = body.outreachDescription.toString().trim();
    if (body.preferredTime !== undefined) updateData.preferredTime = new Date(body.preferredTime);
    if (body.timezone !== undefined) updateData.timezone = body.timezone.toString().trim();

    if (body.companyName !== undefined && !body.companyName.toString().trim()) {
      return NextResponse.json({ field: 'companyName', error: 'Company name is required.' }, { status: 400 });
    }

    const updated = await UserLead.findByIdAndUpdate(id, updateData, { new: true }).lean();
    return NextResponse.json({ ...updated, id: updated!._id.toString() });
  } catch {
    return NextResponse.json({ error: 'Failed to update lead.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  return PUT(req, { params });
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const existing = await UserLead.findOne({ _id: id, userId: session.user.id }).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    await Job.updateMany(
      { leadId: id, status: { $in: ['SCHEDULED', 'RUNNING'] } },
      { status: 'CANCELLED' },
    );

    await UserLead.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete lead.' }, { status: 500 });
  }
}
