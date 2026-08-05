/**
 * Core email execution logic for the Agenda worker.
 *
 * Flow for send_first_email:
 *   1. Load lead + outreachType + user from MongoDB
 *   2. Call AI to generate ALL emails at once (first + all followups)
 *   3. Send the first email via the user's inbox
 *   4. Save sent message to MongoDB (conversation + message history)
 *   5. Store the pre-generated followup content back into each followup
 *      Agenda job's data, so followup jobs just send without calling AI again
 *   6. Update lead status → IN_PROGRESS
 *
 * Flow for send_followup_N:
 *   1. Load the pre-generated email content from job.attrs.data.emailContent
 *   2. Send it via the user's inbox
 *   3. Save to MongoDB history
 *   4. Update lead currentStep
 */

import mongoose from 'mongoose';
import Agenda, { Job } from 'agenda';
import { connectDB } from '../../lib/mongodb';
import { generateOutreachMessage, generateFullSequence } from '../../lib/ai-worker';
import { sendEmail, AuthError, BounceError } from '../../lib/email-sender';
import { createTrackedHtmlBody } from '../../lib/email-tracking';

// ─── Mongoose models (re-used from main app) ─────────────────────────────────
// We require them here so the worker doesn't duplicate model definitions.

const User     = () => require('../../models/User').default;
const UserLead = () => require('../../models/UserLead').default;
const OutreachType = () => require('../../models/OutreachType').default;
const Inbox    = () => require('../../models/Inbox').default;
const Conversation = () => require('../../models/Conversation').default;
const Message  = () => require('../../models/Message').default;

// ─── Inbox helpers (duplicated from scheduler to avoid Next.js imports) ──────

async function getInboxForUser(userId: string) {
  await connectDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inboxes = await Inbox().find({ userId, status: 'CONNECTED' }).sort({ createdAt: 1 }).lean();
  if (inboxes.length === 0) return null;

  const eligible = inboxes.filter((inbox: any) => {
    const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
    const sentToday = sentDate && sentDate.getTime() === today.getTime() ? inbox.sentToday : 0;
    const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
    return sentToday < cap;
  });

  if (eligible.length === 0) return null;

  eligible.sort((a: any, b: any) => {
    const aSent = a.sentDate && new Date(a.sentDate).getTime() === today.getTime() ? a.sentToday : 0;
    const bSent = b.sentDate && new Date(b.sentDate).getTime() === today.getTime() ? b.sentToday : 0;
    return aSent - bSent;
  });

  return eligible[0];
}

async function incrementInboxSentCount(inboxId: string): Promise<void> {
  await connectDB();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inbox = await Inbox().findById(inboxId);
  if (!inbox) return;
  const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
  const isSameDay = sentDate && sentDate.getTime() === today.getTime();
  const newCount = isSameDay ? inbox.sentToday + 1 : 1;
  await Inbox().findByIdAndUpdate(inboxId, { sentToday: newCount, sentDate: today });
}

// ─── Conversation / message helpers ──────────────────────────────────────────

async function ensureConversation(leadId: string, userId: string): Promise<mongoose.Types.ObjectId> {
  const existing = await Conversation().findOne({ leadId }).lean();
  if (existing) return existing._id;

  const conv = await Conversation().create({
    leadId,
    userId,
    status: 'ACTIVE',
    lastActivity: new Date(),
  });
  await UserLead().findByIdAndUpdate(leadId, { conversationId: conv._id });
  return conv._id;
}

async function saveMessageToDB(params: {
  conversationId: mongoose.Types.ObjectId;
  leadId: string;
  userId: string;
  subject: string;
  body: string;
  step: number;
  providerMessageId: string;
  threadId?: string;
}): Promise<string> {
  const msg = await Message().create({
    conversationId: params.conversationId,
    leadId: params.leadId,
    userId: params.userId,
    role: 'ASSISTANT',
    content: params.body,
    subject: params.subject,
    step: params.step,
    aiGenerated: true,
    providerMessageId: params.providerMessageId,
    threadId: params.threadId,
    status: 'SENT',
  });
  await Conversation().findByIdAndUpdate(params.conversationId, { lastActivity: new Date() });
  return (msg._id as string).toString();
}

// ─── Exported handlers ────────────────────────────────────────────────────────

export interface EmailContent {
  subject: string;
  body: string;
}

/**
 * Handler for send_first_email jobs.
 *
 * Generates ALL emails (first + all followups) at once via AI, sends the
 * first one, saves it to MongoDB, then stores the pre-generated followup
 * content in each followup Agenda job's data so they don't need to call AI.
 */
export async function handleSendFirstEmail(job: Job, agendaInstance: Agenda): Promise<void> {
  const { leadId, userId, stepNumber } = job.attrs.data as {
    leadId: string;
    userId: string;
    stepNumber: number;
  };

  await connectDB();

  const lead = await UserLead().findById(leadId)
    .select('email companyName outreachTypeId aiEnabled status conversationId timezone')
    .lean();

  if (!lead) {
    console.error(`[worker] send_first_email: lead ${leadId} not found — skipping`);
    return;
  }

  if (!lead.aiEnabled) {
    console.log(`[worker] send_first_email: AI disabled for lead ${leadId} — skipping`);
    return;
  }

  if (['BOUNCED', 'UNSUBSCRIBED', 'NOT_INTERESTED', 'COMPLETED'].includes(lead.status)) {
    console.log(`[worker] send_first_email: lead ${leadId} has terminal status ${lead.status} — skipping`);
    return;
  }

  const user = await User().findById(userId).select('aiPaused').lean();
  if (user?.aiPaused) {
    console.log(`[worker] send_first_email: AI paused for user ${userId} — skipping`);
    return;
  }

  const outreachType = await OutreachType().findById(lead.outreachTypeId)
    .select('sequenceSteps systemPrompt exampleEmails')
    .lean();

  if (!outreachType) {
    console.error(`[worker] send_first_email: outreachType not found for lead ${leadId}`);
    return;
  }

  const inbox = await getInboxForUser(userId);
  if (!inbox) {
    console.error(`[worker] send_first_email: no available inbox for user ${userId} — will retry in 1 hour`);
    const nextRun = new Date(Date.now() + 60 * 60 * 1000);
    await job.schedule(nextRun).save();
    return;
  }

  // ── Generate ALL emails in ONE prompt (sequential, context-aware) ───────
  // generateFullSequence sends a single prompt asking the AI to write the
  // entire sequence at once. Email 2 references email 1, email 3 references
  // emails 1 & 2, etc — because they are all written in the same context.
  const steps: { stepNumber: number; delayDays: number }[] = outreachType.sequenceSteps || [];
  const sortedSteps = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  const totalSteps = sortedSteps.length;

  const generatedEmails: Map<number, EmailContent> = new Map();

  try {
    const sequence = await generateFullSequence(
      leadId,
      userId,
      lead.outreachTypeId.toString(),
      totalSteps,
    );

    // Map each generated email back to its step number by index.
    sortedSteps.forEach((step, index) => {
      if (sequence[index]) {
        generatedEmails.set(step.stepNumber, sequence[index]);
      }
    });
  } catch (aiError) {
    console.error(`[worker] send_first_email: AI generation failed for lead ${leadId}:`, aiError);
    await job.schedule(new Date(Date.now() + 5 * 60 * 1000)).save();
    return;
  }

  // ── Send the first email ──────────────────────────────────────────────────
  const firstEmailContent = generatedEmails.get(stepNumber);
  if (!firstEmailContent) {
    console.error(`[worker] send_first_email: no content generated for step ${stepNumber}`);
    return;
  }

  let sendResult: { providerMessageId: string; threadId?: string };

  try {
    const conversationId = await ensureConversation(leadId, userId);
    const tempMsgId = new mongoose.Types.ObjectId().toString();
    const htmlBody = createTrackedHtmlBody(firstEmailContent.body, tempMsgId);

    sendResult = await sendEmail(inbox, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: firstEmailContent.subject,
      text: firstEmailContent.body,
      html: htmlBody,
    });

    await saveMessageToDB({
      conversationId,
      leadId,
      userId,
      subject: firstEmailContent.subject,
      body: firstEmailContent.body,
      step: stepNumber,
      providerMessageId: sendResult.providerMessageId,
      threadId: sendResult.threadId,
    });

    await UserLead().findByIdAndUpdate(leadId, {
      currentStep: stepNumber,
      status: 'IN_PROGRESS',
      lastMessageDate: new Date(),
    });

    await incrementInboxSentCount(inbox._id.toString());

    console.log(`[worker] send_first_email: sent to ${lead.email} (step ${stepNumber})`);
  } catch (sendError) {
    if (sendError instanceof BounceError) {
      await UserLead().findByIdAndUpdate(leadId, { status: 'BOUNCED' });
      console.error(`[worker] send_first_email: bounce for ${lead.email} — marked BOUNCED`);
      return;
    }
    if (sendError instanceof AuthError) {
      await Inbox().findByIdAndUpdate(inbox._id, { status: 'EXPIRED' });
      console.error(`[worker] send_first_email: auth error for inbox ${inbox.emailAddress} — marked EXPIRED`);
      return;
    }
    // Generic error — retry in 5 minutes
    console.error(`[worker] send_first_email: send failed for ${lead.email}:`, sendError);
    await job.schedule(new Date(Date.now() + 5 * 60 * 1000)).save();
    return;
  }

  // ── Store pre-generated followup content into each followup Agenda job ────
  // Find all pending followup jobs for this lead and inject the AI-generated
  // content so they don't need to call AI again when they fire.
  const followupSteps = sortedSteps.filter((s) => s.stepNumber > 1);

  for (const step of followupSteps) {
    const emailContent = generatedEmails.get(step.stepNumber);
    if (!emailContent) continue;

    const jobName = `send_followup_${step.stepNumber}`;

    // Update the Agenda job document directly so the content is persisted.
    await (agendaInstance as any).db.getJobs({
      name: jobName,
      'data.leadId': leadId,
      nextRunAt: { $ne: null },
    }).then(async (jobs: any[]) => {
      for (const followupJob of jobs) {
        followupJob.attrs.data = {
          ...followupJob.attrs.data,
          emailContent,
          threadId: sendResult.threadId, // keep same thread for email clients
        };
        await followupJob.save();
      }
    }).catch((err: unknown) => {
      console.error(`[worker] Failed to inject content into ${jobName} for lead ${leadId}:`, err);
    });
  }
}

/**
 * Handler for send_followup_N jobs.
 *
 * The email content was pre-generated by send_first_email and stored in
 * job.attrs.data.emailContent. Just send it directly.
 */
export async function handleSendFollowup(job: Job): Promise<void> {
  const { leadId, userId, stepNumber, emailContent, threadId } = job.attrs.data as {
    leadId: string;
    userId: string;
    stepNumber: number;
    emailContent?: EmailContent;
    threadId?: string;
  };

  await connectDB();

  const lead = await UserLead().findById(leadId)
    .select('email companyName aiEnabled status outreachTypeId')
    .lean();

  if (!lead) {
    console.error(`[worker] send_followup_${stepNumber}: lead ${leadId} not found — skipping`);
    return;
  }

  if (!lead.aiEnabled) {
    console.log(`[worker] send_followup_${stepNumber}: AI disabled for lead ${leadId} — skipping`);
    return;
  }

  if (['BOUNCED', 'UNSUBSCRIBED', 'NOT_INTERESTED', 'COMPLETED', 'REPLIED'].includes(lead.status)) {
    console.log(`[worker] send_followup_${stepNumber}: lead ${leadId} status is ${lead.status} — skipping followup`);
    return;
  }

  const user = await User().findById(userId).select('aiPaused').lean();
  if (user?.aiPaused) {
    console.log(`[worker] send_followup_${stepNumber}: AI paused — skipping`);
    return;
  }

  // If content wasn't pre-generated (edge case), generate it now.
  let content = emailContent;
  if (!content) {
    console.warn(`[worker] send_followup_${stepNumber}: no pre-generated content for lead ${leadId} — generating now`);
    try {
      content = await generateOutreachMessage(leadId, userId, lead.outreachTypeId.toString(), stepNumber);
    } catch (err) {
      console.error(`[worker] send_followup_${stepNumber}: AI generation failed:`, err);
      await job.schedule(new Date(Date.now() + 5 * 60 * 1000)).save();
      return;
    }
  }

  const inbox = await getInboxForUser(userId);
  if (!inbox) {
    console.error(`[worker] send_followup_${stepNumber}: no inbox available — retrying in 1 hour`);
    await job.schedule(new Date(Date.now() + 60 * 60 * 1000)).save();
    return;
  }

  try {
    const conversationId = await ensureConversation(leadId, userId);
    const tempMsgId = new mongoose.Types.ObjectId().toString();
    const htmlBody = createTrackedHtmlBody(content.body, tempMsgId);

    const sendResult = await sendEmail(inbox, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: content.subject,
      text: content.body,
      html: htmlBody,
    });

    await saveMessageToDB({
      conversationId,
      leadId,
      userId,
      subject: content.subject,
      body: content.body,
      step: stepNumber,
      providerMessageId: sendResult.providerMessageId,
      threadId: sendResult.threadId || threadId,
    });

    await UserLead().findByIdAndUpdate(leadId, {
      currentStep: stepNumber,
      lastMessageDate: new Date(),
    });

    await incrementInboxSentCount(inbox._id.toString());

    console.log(`[worker] send_followup_${stepNumber}: sent to ${lead.email}`);
  } catch (sendError) {
    if (sendError instanceof BounceError) {
      await UserLead().findByIdAndUpdate(leadId, { status: 'BOUNCED' });
      console.error(`[worker] send_followup_${stepNumber}: bounce for ${lead.email}`);
      return;
    }
    if (sendError instanceof AuthError) {
      await Inbox().findByIdAndUpdate(inbox._id, { status: 'EXPIRED' });
      console.error(`[worker] send_followup_${stepNumber}: auth error — inbox marked EXPIRED`);
      return;
    }
    console.error(`[worker] send_followup_${stepNumber}: send failed:`, sendError);
    await job.schedule(new Date(Date.now() + 5 * 60 * 1000)).save();
  }
}
