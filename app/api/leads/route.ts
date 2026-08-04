import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import User from '@/models/User';
import OutreachType from '@/models/OutreachType';
import { canAddLead } from '@/lib/plan-limits';
import { fromZonedTime } from "date-fns-tz";
import { createLeadJobs } from '@/lib/createLeadJobs';

/**
 * Convert a local datetime string (e.g. "2026-08-05T10:30") from a given
 * timezone into a UTC Date. Always pass the raw string — never a pre-parsed
 * Date object — because Date objects store UTC internally and would be
 * double-converted.
 */
export function convertToUTC(
  localDateString: string,
  timeZone: string
): Date {
  return fromZonedTime(localDateString, timeZone);
}

const VALID_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'BOUNCED', 'UNSUBSCRIBED', 'NOT_INTERESTED'];
const VALID_SOURCES = ['MANUAL', 'CSV', 'API', 'ZOOMINFO', 'APOLLO'];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;
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
      where.country = { $regex: countryFilter, $options: 'i' };
    }
    if (sourceFilter && VALID_SOURCES.includes(sourceFilter)) {
      where.source = sourceFilter;
    }

    const validSortFields = ['createdAt', 'status', 'currentStep', 'companyName', 'email'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [leads, total] = await Promise.all([
      UserLead.find(where)
        .populate({ path: 'outreachTypeId', select: 'name' })
        .sort({ [sortField]: sortOrder })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      UserLead.countDocuments(where),
    ]);

    const formatted = leads.map((l: any) => ({
      ...l,
      id: l._id.toString(),
      outreachType: l.outreachTypeId ? { id: l.outreachTypeId._id.toString(), name: l.outreachTypeId.name } : null,
    }));

    return NextResponse.json({
      leads: formatted,
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

    await connectDB();

    const user = await User.findById(session.user.id).select('plan').lean();
    if (user) {
      const leadCheck = await canAddLead(session.user.id, user.plan);
      if (!leadCheck.allowed) {
        return NextResponse.json({
          error: `You've reached the ${user.plan} plan limit of ${leadCheck.limit} leads. Upgrade your plan to add more.`,
          upgradeRequired: true,
        }, { status: 403 });
      }
    }
    // if (!country?.trim()) {
    //   return NextResponse.json({ field: 'country', error: 'Country is required.' }, { status: 400 });
    // }
    // if (!outreachDescription?.trim()) {
    //   return NextResponse.json({ field: 'outreachDescription', error: 'Outreach description is required.' }, { status: 400 });
    // }
    // if (!preferredTime) {
    //   return NextResponse.json({ field: 'preferredTime', error: 'Preferred time is required.' }, { status: 400 });
    // }
    // if (!timezone?.trim()) {
    //   return NextResponse.json({ field: 'timezone', error: 'Timezone is required.' }, { status: 400 });
    // }
    if (!outreachTypeId) {
      return NextResponse.json({ field: 'outreachTypeId', error: 'An outreach type is required.' }, { status: 400 });
    }

    const outreachType = await OutreachType.findOne({
      _id: outreachTypeId,
      userId: session.user.id,
      active: true,
    }).lean();
    if (!outreachType) {
      return NextResponse.json({ field: 'outreachTypeId', error: 'Selected outreach type is not available.' }, { status: 400 });
    }

    const existing = await UserLead.findOne({
      email: email.trim().toLowerCase(),
      userId: session.user.id,
    }).lean();
    if (existing) {
      return NextResponse.json({ field: 'email', error: 'A lead with this email already exists.' }, { status: 409 });
    }

    const lead = await UserLead.create({
      userId: session.user.id,
      companyName: companyName.trim(),
      email: email.trim().toLowerCase(),
      services: services || [],
      country: country?.trim(),
      website: website?.trim() || null,
      outreachTypeId,
      outreachDescription: outreachDescription?.trim(),
      preferredTime: preferredTime
        ? convertToUTC(preferredTime, timezone?.trim() || "UTC")
        : null,
      timezone: timezone?.trim(),
      source: 'MANUAL',
    });

    if (lead.aiEnabled && lead.outreachTypeId) {
      const tz = timezone?.trim() || 'UTC';

      // UTC time for the first email.
      const firstEmailRunAt = preferredTime
        ? convertToUTC(preferredTime, tz)
        : new Date(Date.now() + 60 * 1000);

      // Extract hour/minute in the lead's timezone — reused for all followups.
      const timeParts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(firstEmailRunAt);

      const preferredHour   = parseInt(timeParts.find((p) => p.type === 'hour')?.value   || '9', 10);
      const preferredMinute = parseInt(timeParts.find((p) => p.type === 'minute')?.value || '0', 10);

      const sequenceSteps = outreachType.sequenceSteps as { stepNumber: number; delayDays: number }[];

      // Write all Agenda job documents directly to MongoDB.
      // The worker on Render will pick them up when their nextRunAt arrives.
      // If this fails, roll back the lead so we never have a lead without jobs.
      try {
        await createLeadJobs({
          leadId: lead._id.toString(),
          userId: session.user.id,
          firstEmailRunAt,
          sequenceSteps,
          preferredHour,
          preferredMinute,
          timezone: tz,
        });
      } catch (jobError) {
        // Roll back — delete the lead we just created.
        await UserLead.findByIdAndDelete(lead._id);
        console.error('[leads/POST] Failed to create Agenda jobs, lead rolled back:', jobError);
        return NextResponse.json(
          { error: 'Failed to schedule outreach jobs. Lead was not saved. Please try again.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ...lead.toObject(), id: lead._id.toString() }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create lead.' }, { status: 500 });
  }
}
