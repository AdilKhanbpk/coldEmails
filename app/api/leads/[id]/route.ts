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

    const lead = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: {
        outreachType: { select: { id: true, name: true } },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch lead.' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const existing = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Support partial updates (PATCH-style) from inline editing
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

    // Validate companyName if provided
    if (body.companyName !== undefined && !body.companyName.toString().trim()) {
      return NextResponse.json({ field: 'companyName', error: 'Company name is required.' }, { status: 400 });
    }

    const updated = await prisma.userLead.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update lead.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  return PUT(req, { params });
}

// Deleting a lead: once scheduled jobs exist (stage 3), any pending Job rows
// for this leadId must be cancelled (status -> CANCELLED) BEFORE the lead is
// deleted. The Job FK has ON DELETE CASCADE, so the rows will be removed, but
// we must cancel the scheduler job first to avoid sending emails to a deleted lead.
export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.userLead.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    // Cancel any pending scheduled jobs for this lead before deleting.
    await prisma.job.updateMany({
      where: { leadId: params.id, status: { in: ['SCHEDULED', 'RUNNING'] } },
      data: { status: 'CANCELLED' },
    });

    await prisma.userLead.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete lead.' }, { status: 500 });
  }
}
