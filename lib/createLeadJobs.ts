import mongoose from 'mongoose';

/**
 * Writes Agenda-compatible job documents directly into the "agendaJobs"
 * collection — no Agenda instance required on the Next.js side.
 *
 * The worker (Render) runs Agenda and will pick up these documents when
 * their nextRunAt time arrives.
 *
 * Agenda v5 job document shape:
 * {
 *   name:        string          // job name registered in agenda.define()
 *   data:        object          // payload passed to the handler
 *   type:        "normal"        // always "normal" for one-time jobs
 *   priority:    number          // 0 = normal priority
 *   nextRunAt:   Date            // when Agenda should run this job
 *   lastModifiedBy: null
 *   lockedAt:    null            // null = not currently locked
 *   lastRunAt:   null
 *   lastFinishedAt: null
 * }
 */

// Minimal Mongoose model for the agendaJobs collection.
// We only need to insert — the worker owns the full model.
const agendaJobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    type: { type: String, default: 'normal' },
    priority: { type: Number, default: 0 },
    nextRunAt: { type: Date, required: true },
    lastModifiedBy: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    lastFinishedAt: { type: Date, default: null },
  },
  {
    collection: 'agendaJobs', // must match Agenda's collection config in worker
  }
);

const AgendaJob =
  mongoose.models.AgendaJob ||
  mongoose.model('AgendaJob', agendaJobSchema);

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Creates all Agenda job documents for a lead at creation time.
 *
 * Scheduling logic:
 *   step 1  → firstEmailRunAt  (as-is)
 *   step 2  → firstEmailRunAt + step2.delayDays        (at preferredTime)
 *   step 3  → firstEmailRunAt + step2.delayDays + step3.delayDays  (at preferredTime)
 *   step N  → firstEmailRunAt + sum(step2..stepN delayDays)        (at preferredTime)
 *
 * Example — 3 steps, each 3 days apart, preferredTime = 10:30 IST:
 *   send_first_email  → Aug 5,  10:30 IST
 *   send_followup_2   → Aug 8,  10:30 IST  (5 + 3)
 *   send_followup_3   → Aug 11, 10:30 IST  (5 + 3 + 3)
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

  // Sort steps in order.
  const sorted = [...sequenceSteps].sort((a, b) => a.stepNumber - b.stepNumber);

  const jobDocs = sorted.map((step) => {
    let nextRunAt: Date;
    let name: string;

    if (step.stepNumber === 1) {
      nextRunAt = firstEmailRunAt;
      name = 'send_first_email';
    } else {
      // Accumulate delay days from step 2 up to this step.
      const totalDelayDays = sorted
        .filter((s) => s.stepNumber >= 2 && s.stepNumber <= step.stepNumber)
        .reduce((sum, s) => sum + s.delayDays, 0);

      nextRunAt = addDaysAtPreferredTime(
        firstEmailRunAt,
        totalDelayDays,
        preferredHour,
        preferredMinute,
        timezone,
      );
      name = `send_followup_${step.stepNumber}`;
    }

    return {
      name,
      data: { leadId, userId, stepNumber: step.stepNumber },
      type: 'normal',
      priority: 0,
      nextRunAt,
      lastModifiedBy: null,
      lockedAt: null,
      lastRunAt: null,
      lastFinishedAt: null,
    };
  });

  // Bulk insert all jobs in one DB round-trip.
  await AgendaJob.insertMany(jobDocs);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Add N calendar days to a UTC base date, then set the clock to
 * preferredHour:preferredMinute in the given IANA timezone, returning UTC.
 *
 * Example:
 *   base     = 2026-08-05T05:00:00Z  (= 10:30 IST, UTC+5:30)
 *   addDays  = 3
 *   timezone = "Asia/Kolkata"
 *   result   = 2026-08-08T05:00:00Z  (= Aug 8, 10:30 IST)
 */
function addDaysAtPreferredTime(
  baseUtc: Date,
  addDays: number,
  preferredHour: number,
  preferredMinute: number,
  timezone: string,
): Date {
  // 1. Get the local date string (YYYY-MM-DD) of baseUtc in the target timezone.
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = dateFormatter.format(baseUtc); // "YYYY-MM-DD"

  // 2. Parse year/month/day and add N days.
  const [year, month, day] = localDateStr.split('-').map(Number);
  const targetDate = new Date(year, month - 1, day + addDays); // JS handles overflow

  // 3. Build local datetime string "YYYY-MM-DDTHH:MM:SS" at preferred time.
  const pad = (n: number) => String(n).padStart(2, '0');
  const localDateTimeStr = [
    targetDate.getFullYear(),
    pad(targetDate.getMonth() + 1),
    pad(targetDate.getDate()),
  ].join('-') + `T${pad(preferredHour)}:${pad(preferredMinute)}:00`;

  // 4. Convert that local wall-clock string to UTC.
  return localStringToUTC(localDateTimeStr, timezone);
}

/**
 * Convert a "YYYY-MM-DDTHH:MM:SS" wall-clock string in a given IANA timezone to UTC.
 */
function localStringToUTC(localDateTimeStr: string, timezone: string): Date {
  // Parse as if UTC to get a reference Date object.
  const ref = new Date(localDateTimeStr + 'Z');

  // Find the UTC offset for that timezone at that approximate instant.
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

  // UTC = local - offset
  return new Date(ref.getTime() - offsetMs);
}
