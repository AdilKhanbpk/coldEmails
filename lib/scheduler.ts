// import { connectDB } from './mongodb';
// import Job from '../models/Job';
// import Inbox from '../models/Inbox';
// import type { IInbox } from '../models/Inbox';

// // ---------------------------------------------------------------------------
// // Job scheduler abstraction.
// //
// // In production, swap this in-process implementation for BullMQ + Redis.
// // The interface (scheduleJob, cancelJob, pollDueJobs) maps 1:1 to BullMQ's
// // queue.add() and queue.getJobs() APIs — only this file changes.
// // swap for BullMQ + Redis in production
// // ---------------------------------------------------------------------------

// export interface ScheduledJob {
//   jobId: string;
//   leadId: string;
//   type: string;
//   runAt: Date;
// }

// // Convert a local datetime in a given timezone to UTC.
// // CRITICAL: always use the lead's timezone, never the server's local timezone.
// // The input `localDateTime` is a Date object whose wall-clock components
// // (year, month, day, hour, minute) represent the time in the given timezone.
// // We compute the UTC offset for that timezone at that instant and adjust.
// export function convertToUTC(localDateTime: Date, timezone: string): Date {
//   // Format the input date into the target timezone to get the offset.
//   const formatter = new Intl.DateTimeFormat('en-US', {
//     timeZone: timezone,
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit',
//     hour: '2-digit',
//     minute: '2-digit',
//     second: '2-digit',
//     hour12: false,
//     timeZoneName: 'shortOffset',
//   });

//   const parts = formatter.formatToParts(localDateTime);
//   const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
//   // Parse offset like 'GMT-4' or 'GMT+5:30'
//   const offsetMatch = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
//   if (!offsetMatch) return localDateTime;

//   const sign = offsetMatch[1] === '-' ? -1 : 1;
//   const offsetHours = parseInt(offsetMatch[2], 10);
//   const offsetMinutes = offsetMatch[3] ? parseInt(offsetMatch[3], 10) : 0;
//   const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;

//   // The input Date's components are in the target timezone.
//   // To get UTC, we subtract the offset (UTC = local - offset).
//   // But since the Date object stores UTC internally, we need to adjust:
//   // If local = 10:00 and offset = -4 (EDT), UTC = 10:00 + 4 = 14:00.
//   // So UTC = local - offset = local - (-4) = local + 4 hours.
//   return new Date(localDateTime.getTime() - offsetMs);
// }

// export async function scheduleJob(
//   leadId: string,
//   userId: string,
//   type: string,
//   runAt: Date,
// ): Promise<string> {
//   await connectDB();
//   const job = await Job.create({ leadId, userId, type, runAt, status: 'SCHEDULED' });
//   return (job._id as string).toString();
// }

// export async function cancelJobsForLead(leadId: string): Promise<void> {
//   await connectDB();
//   // Delete all pending/running jobs for this lead outright.
//   await Job.deleteMany({ leadId, status: { $in: ['SCHEDULED', 'RUNNING'] } });
// }

// export async function pollDueJobs(limit = 50): Promise<ScheduledJob[]> {
//   await connectDB();
//   const now = new Date();

//   console.log(`[pollDueJobs] Checking for due jobs at ${now.toISOString()}`);

//   // Reset stale RUNNING jobs that have been running for more than 2 minutes
//   // — these are jobs that started but the process crashed before completing.
//   const staleThreshold = new Date(now.getTime() - 2 * 60 * 1000);
//   const staleResult = await Job.updateMany(
//     { status: 'RUNNING', updatedAt: { $lte: staleThreshold } },
//     { status: 'SCHEDULED' },
//   );
  
//   if (staleResult.modifiedCount > 0) {
//     console.log(`[pollDueJobs] Reset ${staleResult.modifiedCount} stale RUNNING jobs`);
//   }

//   // Find all SCHEDULED jobs whose runAt is <= now (overdue or exactly due).
//   const jobs = await Job.find({ status: 'SCHEDULED', runAt: { $lte: now } })
//     .sort({ runAt: 1 })
//     .limit(limit);

//   console.log(`[pollDueJobs] Found ${jobs.length} due jobs (limit: ${limit})`);
  
//   if (jobs.length > 0) {
//     console.log(`[pollDueJobs] First job runAt: ${jobs[0].runAt.toISOString()}, current time: ${now.toISOString()}`);
//   }

//   return jobs.map((j) => ({
//     jobId: (j._id as string).toString(),
//     leadId: j.leadId.toString(),
//     type: j.type,
//     runAt: j.runAt,
//   }));
// }

// export async function markJobRunning(jobId: string): Promise<boolean> {
//   await connectDB();
//   const result = await Job.updateOne(
//     { _id: jobId, status: 'SCHEDULED' },
//     { status: 'RUNNING' },
//   );
//   return result.modifiedCount > 0;
// }

// export async function markJobCompleted(jobId: string): Promise<void> {
//   await connectDB();
//   // Delete completed jobs — they're done, no need to keep them.
//   await Job.findByIdAndDelete(jobId);
// }

// export async function markJobFailed(jobId: string): Promise<number> {
//   await connectDB();
//   const job = await Job.findById(jobId);
//   const attempts = (job?.attempts || 0) + 1;
//   await Job.findByIdAndUpdate(jobId, { status: 'FAILED', attempts });
//   return attempts;
// }

// export async function requeueJob(jobId: string, newRunAt: Date): Promise<void> {
//   await connectDB();
//   await Job.findByIdAndUpdate(jobId, { status: 'SCHEDULED', runAt: newRunAt });
// }

// // Get inbox for a user, with round-robin rotation if multiple inboxes exist.
// export async function getInboxForUser(userId: string): Promise<IInbox | null> {
//   await connectDB();
//   const inboxes = await Inbox.find({ userId, status: 'CONNECTED' }).sort({ createdAt: 1 }).lean();

//   if (inboxes.length === 0) return null;

//   const today = new Date();
//   today.setHours(0, 0, 0, 0);

//   const eligible = inboxes.filter((inbox) => {
//     const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
//     const sentToday = sentDate && sentDate.getTime() === today.getTime() ? inbox.sentToday : 0;
//     const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
//     return sentToday < cap;
//   });

//   if (eligible.length === 0) return null;

//   eligible.sort((a, b) => {
//     const aSent = a.sentDate && new Date(a.sentDate).getTime() === today.getTime() ? a.sentToday : 0;
//     const bSent = b.sentDate && new Date(b.sentDate).getTime() === today.getTime() ? b.sentToday : 0;
//     return aSent - bSent;
//   });

//   return eligible[0] as IInbox;
// }

// export async function incrementInboxSentCount(inboxId: string): Promise<void> {
//   await connectDB();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const inbox = await Inbox.findById(inboxId);
//   if (!inbox) return;

//   const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
//   const isSameDay = sentDate && sentDate.getTime() === today.getTime();
//   const newCount = isSameDay ? inbox.sentToday + 1 : 1;

//   await Inbox.findByIdAndUpdate(inboxId, { sentToday: newCount, sentDate: today });
// }

// // Check if the current time falls within quiet hours for a given timezone.
// // Default quiet hours: 8pm - 8am in the lead's timezone.
// export function isWithinQuietHours(timezone: string, date = new Date()): boolean {
//   try {
//     const formatter = new Intl.DateTimeFormat('en-US', {
//       timeZone: timezone,
//       hour: 'numeric',
//       hour12: false,
//     });
//     const hourStr = formatter.format(date);
//     const hour = parseInt(hourStr, 10);
//     return hour >= 20 || hour < 8;
//   } catch {
//     return false;
//   }
// }


import { connectDB } from './mongodb';
import Job from '../models/Job';
import Inbox from '../models/Inbox';
import type { IInbox } from '../models/Inbox';
import { decryptJSON, encryptJSON } from './crypto';

// ---------------------------------------------------------------------------
// Job scheduler abstraction.
//
// In production, swap this in-process implementation for BullMQ + Redis.
// The interface (scheduleJob, cancelJob, pollDueJobs) maps 1:1 to BullMQ's
// queue.add() and queue.getJobs() APIs — only this file changes.
// swap for BullMQ + Redis in production
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  jobId: string;
  leadId: string;
  type: string;
  runAt: Date;
}

interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

// Convert a local datetime in a given timezone to UTC.
// CRITICAL: always use the lead's timezone, never the server's local timezone.
// The input `localDateTime` is a Date object whose wall-clock components
// (year, month, day, hour, minute) represent the time in the given timezone.
// We compute the UTC offset for that timezone at that instant and adjust.
export function convertToUTC(localDateTime: Date, timezone: string): Date {
  // Format the input date into the target timezone to get the offset.
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

  const parts = formatter.formatToParts(localDateTime);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  // Parse offset like 'GMT-4' or 'GMT+5:30'
  const offsetMatch = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!offsetMatch) return localDateTime;

  const sign = offsetMatch[1] === '-' ? -1 : 1;
  const offsetHours = parseInt(offsetMatch[2], 10);
  const offsetMinutes = offsetMatch[3] ? parseInt(offsetMatch[3], 10) : 0;
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;

  // The input Date's components are in the target timezone.
  // To get UTC, we subtract the offset (UTC = local - offset).
  // But since the Date object stores UTC internally, we need to adjust:
  // If local = 10:00 and offset = -4 (EDT), UTC = 10:00 + 4 = 14:00.
  // So UTC = local - offset = local - (-4) = local + 4 hours.
  return new Date(localDateTime.getTime() - offsetMs);
}

export async function scheduleJob(
  leadId: string,
  userId: string,
  type: string,
  runAt: Date,
): Promise<string> {
  await connectDB();
  const job = await Job.create({ leadId, userId, type, runAt, status: 'SCHEDULED' });
  return (job._id as string).toString();
}

export async function cancelJobsForLead(leadId: string): Promise<void> {
  await connectDB();
  // Delete all pending/running jobs for this lead outright.
  await Job.deleteMany({ leadId, status: { $in: ['SCHEDULED', 'RUNNING'] } });
}

export async function pollDueJobs(limit = 50): Promise<ScheduledJob[]> {
  await connectDB();
  const now = new Date();

  console.log(`[pollDueJobs] Checking for due jobs at ${now.toISOString()}`);

  // Reset stale RUNNING jobs that have been running for more than 2 minutes
  // — these are jobs that started but the process crashed before completing.
  const staleThreshold = new Date(now.getTime() - 2 * 60 * 1000);
  const staleResult = await Job.updateMany(
    { status: 'RUNNING', updatedAt: { $lte: staleThreshold } },
    { status: 'SCHEDULED' },
  );

  if (staleResult.modifiedCount > 0) {
    console.log(`[pollDueJobs] Reset ${staleResult.modifiedCount} stale RUNNING jobs`);
  }

  // Find all SCHEDULED jobs whose runAt is <= now (overdue or exactly due).
  const jobs = await Job.find({ status: 'SCHEDULED', runAt: { $lte: now } })
    .sort({ runAt: 1 })
    .limit(limit);

  console.log(`[pollDueJobs] Found ${jobs.length} due jobs (limit: ${limit})`);

  if (jobs.length > 0) {
    console.log(`[pollDueJobs] First job runAt: ${jobs[0].runAt.toISOString()}, current time: ${now.toISOString()}`);
  }

  return jobs.map((j) => ({
    jobId: (j._id as string).toString(),
    leadId: j.leadId.toString(),
    type: j.type,
    runAt: j.runAt,
  }));
}

export async function markJobRunning(jobId: string): Promise<boolean> {
  await connectDB();
  const result = await Job.updateOne(
    { _id: jobId, status: 'SCHEDULED' },
    { status: 'RUNNING' },
  );
  return result.modifiedCount > 0;
}

export async function markJobCompleted(jobId: string): Promise<void> {
  await connectDB();
  // Delete completed jobs — they're done, no need to keep them.
  await Job.findByIdAndDelete(jobId);
}

export async function markJobFailed(jobId: string): Promise<number> {
  await connectDB();
  const job = await Job.findById(jobId);
  const attempts = (job?.attempts || 0) + 1;
  await Job.findByIdAndUpdate(jobId, { status: 'FAILED', attempts });
  return attempts;
}

export async function requeueJob(jobId: string, newRunAt: Date): Promise<void> {
  await connectDB();
  await Job.findByIdAndUpdate(jobId, { status: 'SCHEDULED', runAt: newRunAt });
}

// Exchange a refresh token for a new Gmail access token.
async function refreshGoogleAccessToken(
  creds: GmailCredentials,
): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to refresh Google token (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// Decrypt an inbox's stored credentials, refresh the access token using the
// refresh token, re-encrypt, and persist. Flips status back to CONNECTED on
// success. Returns whether the inbox is now usable.
async function refreshInboxCredentials(inbox: IInbox): Promise<boolean> {
  const inboxId = (inbox as unknown as { _id: string })._id;

  try {
    const creds = decryptJSON<GmailCredentials>(inbox.credentials);

    if (!creds.refreshToken) {
      console.error(`[refreshInboxCredentials] No refresh token stored for inbox ${inboxId}`);
      return false;
    }

    // Only Gmail is implemented here — extend this switch for other providers.
    if (inbox.provider !== 'GMAIL') {
      console.error(`[refreshInboxCredentials] Unsupported provider "${inbox.provider}" for inbox ${inboxId}`);
      return false;
    }

    const { accessToken } = await refreshGoogleAccessToken(creds);

    const newCreds: GmailCredentials = { ...creds, accessToken };
    const encrypted = encryptJSON(newCreds);

    await Inbox.findByIdAndUpdate(inboxId, {
      credentials: encrypted,
      status: 'CONNECTED',
    });

    console.log(`[refreshInboxCredentials] Refreshed token for inbox ${inboxId}`);
    return true;
  } catch (err) {
    console.error(`[refreshInboxCredentials] Failed to refresh inbox ${inboxId}:`, err);
    // Refresh token itself may be revoked/invalid — keep it marked EXPIRED
    // (rather than silently leaving a stale CONNECTED state) so it surfaces
    // to the user to reconnect the inbox.
    await Inbox.findByIdAndUpdate(inboxId, { status: 'EXPIRED' }).catch(() => {});
    return false;
  }
}

// Get inbox for a user, with round-robin rotation if multiple inboxes exist.
// Inboxes marked EXPIRED are given a chance to refresh their access token
// before being excluded.
export async function getInboxForUser(userId: string): Promise<IInbox | null> {
  await connectDB();
  const inboxes = await Inbox.find({
    userId,
    status: { $in: ['CONNECTED', 'EXPIRED'] },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (inboxes.length === 0) return null;

  // Attempt to refresh any expired inboxes; drop the ones that fail.
  const usable: IInbox[] = [];
  for (const inbox of inboxes) {
    if (inbox.status === 'EXPIRED') {
      const refreshed = await refreshInboxCredentials(inbox as IInbox);
      if (!refreshed) continue;
      usable.push({ ...(inbox as IInbox), status: 'CONNECTED' });
    } else {
      usable.push(inbox as IInbox);
    }
  }

  if (usable.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eligible = usable.filter((inbox) => {
    const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
    const sentToday = sentDate && sentDate.getTime() === today.getTime() ? inbox.sentToday : 0;
    const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
    return sentToday < cap;
  });

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const aSent = a.sentDate && new Date(a.sentDate).getTime() === today.getTime() ? a.sentToday : 0;
    const bSent = b.sentDate && new Date(b.sentDate).getTime() === today.getTime() ? b.sentToday : 0;
    return aSent - bSent;
  });

  return eligible[0] as IInbox;
}

export async function incrementInboxSentCount(inboxId: string): Promise<void> {
  await connectDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inbox = await Inbox.findById(inboxId);
  if (!inbox) return;

  const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
  const isSameDay = sentDate && sentDate.getTime() === today.getTime();
  const newCount = isSameDay ? inbox.sentToday + 1 : 1;

  await Inbox.findByIdAndUpdate(inboxId, { sentToday: newCount, sentDate: today });
}

// Check if the current time falls within quiet hours for a given timezone.
// Default quiet hours: 8pm - 8am in the lead's timezone.
export function isWithinQuietHours(timezone: string, date = new Date()): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(date);
    const hour = parseInt(hourStr, 10);
    return hour >= 20 || hour < 8;
  } catch {
    return false;
  }
}