import { connectDB } from './mongodb';
import Job from '../models/Job';
import User from '../models/User';
import UserLead from '../models/UserLead';
import OutreachType from '../models/OutreachType';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Notification from '../models/Notification';
import Inbox from '../models/Inbox';
import {
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  cancelJobsForLead,
  getInboxForUser,
  incrementInboxSentCount,
  isWithinQuietHours,
  requeueJob,
  pollDueJobs,
} from './scheduler';
import { sendEmail, AuthError, BounceError } from './email-sender';
import { generateOutreachMessage, decideReplyAction, type ReplyDecision } from './ai-worker';
import { createTrackedHtmlBody } from './email-tracking';
import { handleReplyAction } from './reply-handler';

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5 * 60 * 1000;

export async function processJob(jobId: string): Promise<boolean> {
  const acquired = await markJobRunning(jobId);
  if (!acquired) return false;

  const job = await Job.findById(jobId).lean();

  if (!job) {
    await markJobFailed(jobId);
    return true;
  }

  const lead = await UserLead.findById(job.leadId).populate('outreachTypeId').lean();

  if (!lead) {
    await markJobFailed(jobId);
    return true;
  }

  if (lead.status === 'BOUNCED' || lead.status === 'UNSUBSCRIBED' || lead.status === 'NOT_INTERESTED') {
    await cancelJobsForLead(lead._id.toString());
    await markJobCompleted(jobId);
    return true;
  }

  const outreachType = lead.outreachTypeId as any;
  if (!lead.aiEnabled || !outreachType) {
    await markJobCompleted(jobId);
    return true;
  }

  const user = await User.findById(job.userId).select('aiPaused').lean();
  if (user?.aiPaused) {
    await markJobCompleted(jobId);
    return true;
  }

  if (isWithinQuietHours(lead.timezone)) {
    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + 1);
    await requeueJob(jobId, nextRun);
    return false;
  }

  const inbox = await getInboxForUser(job.userId.toString());
  if (!inbox) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await requeueJob(jobId, tomorrow);
    return false;
  }

  const stepNumber = lead.currentStep + 1;
  const sequenceSteps = outreachType.sequenceSteps as { stepNumber: number; delayDays: number }[];

  const alreadySent = await Message.findOne({ leadId: lead._id, step: stepNumber, status: 'SENT' });
  if (alreadySent) {
    await markJobCompleted(jobId);
    return true;
  }

  let emailSubject: string;
  let emailBody: string;
  try {
    const aiContent = await generateOutreachMessage(
      lead._id.toString(),
      job.userId.toString(),
      outreachType._id.toString(),
      stepNumber,
    );
    emailSubject = aiContent.subject;
    emailBody = aiContent.body;
  } catch (aiError) {
    const exampleEmails = outreachType.exampleEmails as string[];
    emailBody = exampleEmails[0] || 'Hello, this is a test outreach email.';
    emailSubject = `Outreach to ${lead.companyName}`;
  }

  const freshLead = await UserLead.findById(lead._id).select('aiEnabled').lean();
  if (!freshLead?.aiEnabled) {
    await markJobCompleted(jobId);
    return true;
  }

  let conversationId = lead.conversationId;
  if (!conversationId) {
    const conv = await Conversation.create({
      leadId: lead._id,
      userId: job.userId,
      status: 'ACTIVE',
      lastActivity: new Date(),
    });
    conversationId = conv._id;
    await UserLead.findByIdAndUpdate(lead._id, { conversationId });
  }

  const message = await Message.create({
    conversationId,
    leadId: lead._id,
    userId: job.userId,
    role: 'ASSISTANT',
    content: emailBody,
    subject: emailSubject,
    step: stepNumber,
    aiGenerated: true,
    status: 'SENT',
  });

  const htmlBody = createTrackedHtmlBody(emailBody, (message._id as string).toString());

  try {
    const result = await sendEmail(inbox, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: emailSubject,
      text: emailBody,
      html: htmlBody,
    });

    await Message.findByIdAndUpdate(message._id, {
      providerMessageId: result.providerMessageId,
      threadId: result.threadId,
    });

    await UserLead.findByIdAndUpdate(lead._id, {
      currentStep: stepNumber,
      lastMessageDate: new Date(),
      status: 'IN_PROGRESS',
    });

    await incrementInboxSentCount(inbox._id.toString());

    const nextStep = sequenceSteps.find((s) => s.stepNumber === stepNumber + 1);
    if (nextStep) {
      const nextRunAt = new Date();
      nextRunAt.setDate(nextRunAt.getDate() + nextStep.delayDays);
      await Job.create({
        leadId: lead._id,
        userId: job.userId,
        type: 'send_followup',
        runAt: nextRunAt,
        status: 'SCHEDULED',
      });
      await UserLead.findByIdAndUpdate(lead._id, { nextMessageDate: nextRunAt });
    } else {
      await UserLead.findByIdAndUpdate(lead._id, { nextMessageDate: null });
    }

    await markJobCompleted(jobId);
    return true;
  } catch (error) {
    if (error instanceof BounceError) {
      await UserLead.findByIdAndUpdate(lead._id, { status: 'BOUNCED' });
      await cancelJobsForLead(lead._id.toString());
      await markJobCompleted(jobId);
      await createNotification(job.userId.toString(), 'bounce', `Email to ${lead.email} bounced. Lead marked as bounced.`, lead._id.toString());
      return true;
    }

    if (error instanceof AuthError) {
      await Inbox.findByIdAndUpdate(inbox._id, { status: 'EXPIRED' });
      await cancelJobsForLead(lead._id.toString());
      await markJobFailed(jobId);
      await createNotification(job.userId.toString(), 'inbox_expired', `Inbox ${inbox.emailAddress} has expired. Please reconnect it in Settings.`, lead._id.toString());
      return true;
    }

    const attempts = await markJobFailed(jobId);
    if (attempts < MAX_ATTEMPTS) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
      await requeueJob(jobId, new Date(Date.now() + backoff));
    } else {
      await createNotification(job.userId.toString(), 'send_failed', `Failed to send email to ${lead.email} after ${MAX_ATTEMPTS} attempts.`, lead._id.toString());
    }
    return true;
  }
}

async function createNotification(userId: string, type: string, message: string, leadId: string) {
  await Notification.create({ userId, type, message, leadId });
}

export async function processDueJobs(limit = 50): Promise<{ processed: number; skipped: number }> {
  const jobs = await pollDueJobs(limit);
  let processed = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const result = await processJob(job.jobId);
      if (result) processed++;
      else skipped++;
    } catch {
      skipped++;
    }
  }

  return { processed, skipped };
}

export async function processIncomingReply(
  inboxId: string,
  threadId: string | null,
  senderEmail: string,
  subject: string,
  body: string,
  providerMessageId?: string,
): Promise<void> {
  await connectDB();

  let conversation: any = null;

  if (threadId) {
    const msg = await Message.findOne({ threadId }).lean();
    if (msg) {
      conversation = await Conversation.findById(msg.conversationId).populate('leadId').lean();
    }
  }

  if (!conversation) {
    const lead = await UserLead.findOne({ email: senderEmail.toLowerCase() }).populate('conversationId').lean();
    if (lead?.conversationId) {
      conversation = lead.conversationId as any;
      conversation.lead = lead;
    }
  }

  if (!conversation) {
    return;
  }

  const lead = conversation.leadId || conversation.lead;
  if (!lead) return;

  if (isAutoReply(subject, body)) {
    await Message.create({
      conversationId: conversation._id,
      leadId: lead._id,
      userId: conversation.userId,
      role: 'CUSTOMER',
      content: body,
      subject,
      senderEmail,
      providerMessageId,
      threadId: threadId || undefined,
      status: 'SENT',
      aiGenerated: false,
    });
    await UserLead.findByIdAndUpdate(lead._id, { replyTag: 'OUT_OF_OFFICE' });
    await createNotification(
      conversation.userId.toString(),
      'auto_reply',
      `Auto-reply from ${lead.companyName}: ${subject}`,
      lead._id.toString(),
    );
    return;
  }

  await Message.create({
    conversationId: conversation._id,
    leadId: lead._id,
    userId: conversation.userId,
    role: 'CUSTOMER',
    content: body,
    subject,
    senderEmail,
    providerMessageId,
    threadId: threadId || undefined,
    status: 'SENT',
    aiGenerated: false,
  });

  await Conversation.findByIdAndUpdate(conversation._id, { lastActivity: new Date() });

  await UserLead.findByIdAndUpdate(lead._id, {
    status: 'REPLIED',
    lastMessageDate: new Date(),
  });

  await createNotification(
    conversation.userId.toString(),
    'reply',
    `New reply from ${lead.companyName}: ${subject}`,
    lead._id.toString(),
  );

  if (lead.aiEnabled) {
    const user = await User.findById(conversation.userId).select('aiPaused').lean();
    if (user?.aiPaused) return;

    try {
      const decision = await decideReplyAction(lead._id.toString(), conversation.userId.toString(), body);
      await handleReplyAction(lead._id.toString(), conversation.userId.toString(), conversation._id.toString(), decision);
    } catch {
      await createNotification(
        conversation.userId.toString(),
        'ai_error',
        `AI failed to process reply from ${lead.companyName}. Manual review needed.`,
        lead._id.toString(),
      );
    }
  }
}
