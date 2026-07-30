import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
const VALID_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'BOUNCED', 'UNSUBSCRIBED', 'NOT_INTERESTED'];
const VALID_SOURCES = ['MANUAL', 'CSV', 'API', 'ZOOMINFO', 'APOLLO'];
import { scheduleJob, convertToUTC } from '@/lib/scheduler';
import { canAddLead } from '@/lib/plan-limits';

const VALID_STATUSES = Object.values(LeadStatus);
const VALID_SOURCES = Object.values(LeadSource);

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
    const statusFilter = searchParams.get('status') || '';
    const outreachTypeFilter = searchParams.get('outreachTypeId') || '';
    const countryFilter = searchParams.get('country') || '';
    const sourceFilter = searchParams.get('source') || '';

    const where: Record<string, unknown> = { userId: session.user.id };
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      where.status = statusFilter;
    }
    if (outreachTypeFilter) {
      where.outreachTypeId = outreachTypeFilter;
    }
    if (countryFilter) {
      where.country = { contains: countryFilter, mode: 'insensitive' };
    }
    if (sourceFilter && VALID_SOURCES.includes(sourceFilter)) {
      where.source = sourceFilter;
    }

    const validSortFields = ['createdAt', 'status', 'currentStep', 'companyName', 'email'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [leads, total] = await Promise.all([
      prisma.userLead.findMany({
        where,
        include: {
          outreachType: { select: { id: true, name: true } },
        },
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.userLead.count({ where }),
    ]);

    return NextResponse.json({
      leads,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch leads.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      companyName,
      email,
      services,
      country,
      website,
      outreachTypeId,
      outreachDescription,
      preferredTime,
      timezone,
    } = body as {
      companyName?: string;
      email?: string;
      services?: string[];
      country?: string;
      website?: string;
      outreachTypeId?: string;
      outreachDescription?: string;
      preferredTime?: string;
      timezone?: string;
    };

    if (!companyName?.trim()) {
      return NextResponse.json({ field: 'companyName', error: 'Company name is required.' }, { status: 400 });
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ field: 'email', error: 'A valid email is required.' }, { status: 400 });
    }

    // Enforce plan limits server-side
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    if (user) {
      const leadCheck = await canAddLead(session.user.id, user.plan);
      if (!leadCheck.allowed) {
        return NextResponse.json({
          error: `You've reached the ${user.plan} plan limit of ${leadCheck.limit} leads. Upgrade your plan to add more.`,
          upgradeRequired: true,
        }, { status: 403 });
      }
    }
    if (!country?.trim()) {
      return NextResponse.json({ field: 'country', error: 'Country is required.' }, { status: 400 });
    }
    if (!outreachDescription?.trim()) {
      return NextResponse.json({ field: 'outreachDescription', error: 'Outreach description is required.' }, { status: 400 });
    }
    if (!preferredTime) {
      return NextResponse.json({ field: 'preferredTime', error: 'Preferred time is required.' }, { status: 400 });
    }
    if (!timezone?.trim()) {
      return NextResponse.json({ field: 'timezone', error: 'Timezone is required.' }, { status: 400 });
    }
    if (!outreachTypeId) {
      return NextResponse.json({ field: 'outreachTypeId', error: 'An outreach type is required.' }, { status: 400 });
    }

    // Verify the outreach type belongs to the user and is active.
    const outreachType = await prisma.outreachType.findFirst({
      where: { id: outreachTypeId, userId: session.user.id, active: true },
    });
    if (!outreachType) {
      return NextResponse.json({ field: 'outreachTypeId', error: 'Selected outreach type is not available.' }, { status: 400 });
    }

    // Duplicate check (email + userId)
    const existing = await prisma.userLead.findFirst({
      where: { email: email.trim().toLowerCase(), userId: session.user.id },
    });
    if (existing) {
      return NextResponse.json({ field: 'email', error: 'A lead with this email already exists.' }, { status: 409 });
    }

    const lead = await prisma.userLead.create({
      data: {
        userId: session.user.id,
        companyName: companyName.trim(),
        email: email.trim().toLowerCase(),
        services: services || [],
        country: country.trim(),
        website: website?.trim() || null,
        outreachTypeId,
        outreachDescription: outreachDescription.trim(),
        preferredTime: new Date(preferredTime),
        timezone: timezone.trim(),
        source: 'MANUAL',
      },
    });

    // Auto-schedule the first email job if AI is enabled and the lead has an outreach type.
    // CRITICAL: convert preferredTime to UTC using the LEAD'S timezone, never the server's.
    if (lead.aiEnabled && lead.outreachTypeId) {
      const utcRunAt = convertToUTC(new Date(preferredTime), timezone.trim());
      await scheduleJob(lead.id, session.user.id, 'send_first_email', utcRunAt);
    }

    return NextResponse.json(lead, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create lead.' }, { status: 500 });
  }
}
