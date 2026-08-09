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
import { generateFullSequence, decideReplyAction, type ReplyDecision } from './ai-worker';
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

  // Skip terminal leads — delete all their pending jobs too.
  if (['BOUNCED', 'UNSUBSCRIBED', 'NOT_INTERESTED'].includes(lead.status)) {
    await cancelJobsForLead(lead._id.toString());
    await markJobCompleted(jobId); // deletes this job
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

  // Respect quiet hours — requeue 1 hour later instead of skipping.
  if (isWithinQuietHours(lead.timezone ?? 'UTC')) {
    const nextRun = new Date(Date.now() + 60 * 60 * 1000);
    await requeueJob(jobId, nextRun);
    return false;
  }

  const inbox = await getInboxForUser(job.userId.toString());
  if (!inbox) {
    // No inbox available today — requeue for tomorrow morning.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await requeueJob(jobId, tomorrow);
    return false;
  }

  // Determine which step this job represents.
  // Job type is "send_first_email" (step 1) or "send_followup_N" (step N).
  const stepNumber = (job as any).stepNumber
    ?? (job.type === 'send_first_email' ? 1 : parseInt(job.type.replace('send_followup_', ''), 10) || 1);

  // Guard: don't send the same step twice.
  const alreadySent = await Message.findOne({ leadId: lead._id, step: stepNumber, status: 'SENT' }).lean();
  if (alreadySent) {
    await markJobCompleted(jobId);
    return true;
  }

  // ── Generate email content ───────────────────────────────────────────────
  // For send_first_email: generate the FULL sequence in one AI call so each
  // followup email is contextually aware of all previous emails.
  // The generated sequence is stored in sibling followup job documents.
  //
  // For send_followup_N: the content was pre-stored by send_first_email.
  // If missing (edge case), fall back to generating just this step.

  let emailSubject: string;
  let emailBody: string;

  if (job.type === 'send_first_email') {
    const sequenceSteps = outreachType.sequenceSteps as { stepNumber: number; delayDays: number }[];
    const totalSteps = sequenceSteps.length || 1;

    try {
      const sequence = await generateFullSequence(
        lead._id.toString(),
        job.userId.toString(),
        outreachType._id.toString(),
        totalSteps,
      );

      // Use the first email for this job.
      emailSubject = sequence[0].subject;
      emailBody = sequence[0].body;

      // Store followup content in their job documents so they don't need AI.
      const sortedSteps = [...sequenceSteps].sort((a, b) => a.stepNumber - b.stepNumber);
      for (let i = 1; i < sortedSteps.length; i++) {
        const followupStep = sortedSteps[i];
        const followupContent = sequence[i];
        if (!followupContent) continue;

        await Job.findOneAndUpdate(
          {
            leadId: lead._id,
            userId: job.userId,
            type: `send_followup_${followupStep.stepNumber}`,
            status: 'SCHEDULED',
          },
          {
            $set: {
              preGeneratedSubject: followupContent.subject,
              preGeneratedBody: followupContent.body,
            },
          },
        );
      }
    } catch {
      // AI failed — use fallback content
      emailBody = (outreachType.exampleEmails as string[])[0] || `Hello, reaching out from your network.`;
      emailSubject = `Outreach to ${lead.companyName}`;
    }
  } else {
    // Followup job — use pre-generated content if available.
    const jobDoc = await Job.findById(jobId).lean() as any;
    if (jobDoc?.preGeneratedSubject && jobDoc?.preGeneratedBody) {
      emailSubject = jobDoc.preGeneratedSubject;
      emailBody = jobDoc.preGeneratedBody;
    } else {
      // Fallback: generate just this step.
      try {
        const { generateOutreachMessage } = await import('./ai-worker');
        const content = await generateOutreachMessage(
          lead._id.toString(),
          job.userId.toString(),
          outreachType._id.toString(),
          stepNumber,
        );
        emailSubject = content.subject;
        emailBody = content.body;
      } catch {
        emailBody = `Following up on our previous conversation.`;
        emailSubject = `Re: Outreach to ${lead.companyName}`;
      }
    }
  }

  // ── Ensure conversation exists ───────────────────────────────────────────
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

  // ── Create message record ────────────────────────────────────────────────
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

  // ── Send email ───────────────────────────────────────────────────────────
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

    // Job is done — delete it from the database.
    await markJobCompleted(jobId);
    return true;

  } catch (error) {
    // Delete the unsent message record on failure.
    await Message.findByIdAndDelete(message._id);

    if (error instanceof BounceError) {
      await UserLead.findByIdAndUpdate(lead._id, { status: 'BOUNCED' });
      await cancelJobsForLead(lead._id.toString());
      await markJobCompleted(jobId); // delete this job too
      await createNotification(job.userId.toString(), 'bounce', `Email to ${lead.email} bounced.`, lead._id.toString());
      return true;
    }

    if (error instanceof AuthError) {
      await Inbox.findByIdAndUpdate(inbox._id, { status: 'EXPIRED' });
      await cancelJobsForLead(lead._id.toString());
      await markJobFailed(jobId);
      await createNotification(job.userId.toString(), 'inbox_expired', `Inbox ${inbox.emailAddress} expired. Reconnect in Settings.`, lead._id.toString());
      return true;
    }

    // Generic failure — retry with exponential backoff up to MAX_ATTEMPTS.
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
