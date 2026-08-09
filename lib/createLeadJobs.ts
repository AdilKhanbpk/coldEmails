import Job from '@/models/Job';

export interface SequenceStep {
  stepNumber: number;
  delayDays: number;
}

export interface CreateLeadJobsParams {
  leadId: string;
  userId: string;
  /** UTC Date when the first email should fire. */
  firstEmailRunAt: Date;
  /** All steps from OutreachType.sequenceSteps (step 1 = first email, 2+ = followups). */
  sequenceSteps: SequenceStep[];
  /** Hour (0-23) extracted from firstEmailRunAt in the lead's timezone. */
  preferredHour: number;
  /** Minute (0-59) extracted from firstEmailRunAt in the lead's timezone. */
  preferredMinute: number;
  /** IANA timezone string e.g. "Asia/Kolkata". */
  timezone: string;
}

/**
 * Creates all Job documents for a lead at creation time.
 * These are picked up by the Vercel Cron → /api/worker/process → processDueJobs().
 *
 * Scheduling logic:
 *   step 1  → firstEmailRunAt  (as-is)
 *   step 2  → firstEmailRunAt + step2.delayDays        (at preferredTime)
 *   step 3  → firstEmailRunAt + step2.delayDays + step3.delayDays  (at preferredTime)
 *
 * Example — 3 steps, each 3 days apart, preferredTime = 10:30 IST:
 *   send_first_email  → Aug 5,  10:30 IST
 *   send_followup_2   → Aug 8,  10:30 IST
 *   send_followup_3   → Aug 11, 10:30 IST
 */
export async function createLeadJobs(params: CreateLeadJobsParams): Promise<void> {
  const {
    leadId,
    userId,
    firstEmailRunAt,
    sequenceSteps,
    preferredHour,
    preferredMinute,
    timezone,
  } = params;

  const sorted = [...sequenceSteps].sort((a, b) => a.stepNumber - b.stepNumber);

  const jobDocs = sorted.map((step) => {
    let runAt: Date;
    let type: string;

    if (step.stepNumber === 1) {
      runAt = firstEmailRunAt;
      type = 'send_first_email';
    } else {
      // Accumulate delay days from step 2 up to this step.
      const totalDelayDays = sorted
        .filter((s) => s.stepNumber >= 2 && s.stepNumber <= step.stepNumber)
        .reduce((sum, s) => sum + s.delayDays, 0);

      runAt = addDaysAtPreferredTime(
        firstEmailRunAt,
        totalDelayDays,
        preferredHour,
        preferredMinute,
        timezone,
      );
      type = `send_followup_${step.stepNumber}`;
    }

    return {
      leadId,
      userId,
      type,
      runAt,
      status: 'SCHEDULED',
      stepNumber: step.stepNumber,
    };
  });

  await Job.insertMany(jobDocs);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDaysAtPreferredTime(
  baseUtc: Date,
  addDays: number,
  preferredHour: number,
  preferredMinute: number,
  timezone: string,
): Date {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = dateFormatter.format(baseUtc);
  const [year, month, day] = localDateStr.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day + addDays);

  const pad = (n: number) => String(n).padStart(2, '0');
  const localDateTimeStr = [
    targetDate.getFullYear(),
    pad(targetDate.getMonth() + 1),
    pad(targetDate.getDate()),
  ].join('-') + `T${pad(preferredHour)}:${pad(preferredMinute)}:00`;

  return localStringToUTC(localDateTimeStr, timezone);
}

function localStringToUTC(localDateTimeStr: string, timezone: string): Date {
  const ref = new Date(localDateTimeStr + 'Z');

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });

  const parts = formatter.formatToParts(ref);
  const offsetStr = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = offsetStr.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match) return ref;

  const sign = match[1] === '+' ? 1 : -1;
  const offsetMs =
    sign * (parseInt(match[2], 10) * 60 + (match[3] ? parseInt(match[3], 10) : 0)) * 60 * 1000;

  return new Date(ref.getTime() - offsetMs);
}
