import { prisma } from './prisma';
import { Inbox } from '@prisma/client';
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
const BACKOFF_BASE_MS = 5 * 60 * 1000; // 5 minutes

export async function processJob(jobId: string): Promise<boolean> {
  const acquired = await markJobRunning(jobId);
  if (!acquired) return false;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { lead: { include: { outreachType: true } } },
  });

  if (!job || !job.lead) {
    await markJobFailed(jobId);
    return true;
  }

  const lead = job.lead;

  if (lead.status === 'BOUNCED' || lead.status === 'UNSUBSCRIBED' || lead.status === 'NOT_INTERESTED') {
    await cancelJobsForLead(lead.id);
    await markJobCompleted(jobId);
    return true;
  }

  // Re-check aiEnabled immediately before every send (not only at schedule time).
  // This catches the case where Stop AI was clicked while a message was mid-generation.
  if (!lead.aiEnabled || !lead.outreachType) {
    await markJobCompleted(jobId);
    return true;
  }

  // Check global AI pause
  const user = await prisma.user.findUnique({
    where: { id: job.userId },
    select: { aiPaused: true },
  });
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

  const inbox = await getInboxForUser(job.userId);
  if (!inbox) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await requeueJob(jobId, tomorrow);
    return false;
  }

  const stepNumber = lead.currentStep + 1;
  const sequenceSteps = lead.outreachType.sequenceSteps as { stepNumber: number; delayDays: number }[];

  // Idempotency check: has this exact step already been sent?
  const alreadySent = await prisma.message.findFirst({
    where: { leadId: lead.id, step: stepNumber, status: 'SENT' },
  });
  if (alreadySent) {
    await markJobCompleted(jobId);
    return true;
  }

  // Generate personalized email content using AI.
  let emailSubject: string;
  let emailBody: string;
  try {
    const aiContent = await generateOutreachMessage(
      lead.id,
      job.userId,
      lead.outreachType.id,
      stepNumber,
    );
    emailSubject = aiContent.subject;
    emailBody = aiContent.body;
  } catch (aiError) {
    // If AI generation fails, fall back to the first example email.
    const exampleEmails = lead.outreachType.exampleEmails as string[];
    emailBody = exampleEmails[0] || 'Hello, this is a test outreach email.';
    emailSubject = `Outreach to ${lead.companyName}`;
  }

  // Re-check aiEnabled again right before sending (Stop AI may have been clicked during generation)
  const freshLead = await prisma.userLead.findUnique({
    where: { id: lead.id },
    select: { aiEnabled: true },
  });
  if (!freshLead?.aiEnabled) {
    await markJobCompleted(jobId);
    return true;
  }

  // Ensure conversation exists
    let conversationId = lead.conversationId;
    if (!conversationId) {
      const conv = await prisma.conversation.create({
        data: { leadId: lead.id, userId: job.userId, status: 'ACTIVE', lastActivity: new Date() },
      });
      conversationId = conv.id;
      await prisma.userLead.update({ where: { id: lead.id }, data: { conversationId } });
    }

    // Create the message record FIRST so we have an ID for tracking
    const message = await prisma.message.create({
      data: {
        conversationId,
        leadId: lead.id,
        userId: job.userId,
        role: 'ASSISTANT',
        content: emailBody,
        subject: emailSubject,
        step: stepNumber,
        aiGenerated: true,
        status: 'SENT',
      },
    });

    // Add open/click tracking to the email body
    const htmlBody = createTrackedHtmlBody(emailBody, message.id);

    try {
    const result = await sendEmail(inbox, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: emailSubject,
      text: emailBody,
      html: htmlBody,
    });

    await prisma.message.update({
      where: { id: message.id },
      data: { providerMessageId: result.providerMessageId, threadId: result.threadId },
    });

    await prisma.userLead.update({
      where: { id: lead.id },
      data: { currentStep: stepNumber, lastMessageDate: new Date(), status: 'IN_PROGRESS' },
    });

    await incrementInboxSentCount(inbox.id);

    // Schedule next follow-up step
    const nextStep = sequenceSteps.find((s) => s.stepNumber === stepNumber + 1);
    if (nextStep) {
      const nextRunAt = new Date();
      nextRunAt.setDate(nextRunAt.getDate() + nextStep.delayDays);
      await prisma.job.create({
        data: { leadId: lead.id, userId: job.userId, type: 'send_followup', runAt: nextRunAt, status: 'SCHEDULED' },
      });
      await prisma.userLead.update({ where: { id: lead.id }, data: { nextMessageDate: nextRunAt } });
    } else {
      await prisma.userLead.update({ where: { id: lead.id }, data: { nextMessageDate: null } });
    }

    await markJobCompleted(jobId);
    return true;
  } catch (error) {
    if (error instanceof BounceError) {
      await prisma.userLead.update({ where: { id: lead.id }, data: { status: 'BOUNCED' } });
      await cancelJobsForLead(lead.id);
      await markJobCompleted(jobId);
      await createNotification(job.userId, 'bounce', `Email to ${lead.email} bounced. Lead marked as bounced.`, lead.id);
      return true;
    }

    if (error instanceof AuthError) {
      await prisma.inbox.update({ where: { id: inbox.id }, data: { status: 'EXPIRED' } });
      await cancelJobsForLead(lead.id);
      await markJobFailed(jobId);
      await createNotification(job.userId, 'inbox_expired', `Inbox ${inbox.emailAddress} has expired. Please reconnect it in Settings.`, lead.id);
      return true;
    }

    const attempts = await markJobFailed(jobId);
    if (attempts < MAX_ATTEMPTS) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempts - 1);
      await requeueJob(jobId, new Date(Date.now() + backoff));
    } else {
      await createNotification(job.userId, 'send_failed', `Failed to send email to ${lead.email} after ${MAX_ATTEMPTS} attempts.`, lead.id);
    }
    return true;
  }
}

async function createNotification(userId: string, type: string, message: string, leadId: string) {
  await prisma.notification.create({ data: { userId, type, message, leadId } });
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

// ---------------------------------------------------------------------------
// Reply processing — called by webhook handlers and the backup poller.
// Matches a reply to a conversation by threadId, saves it, and triggers AI.
// ---------------------------------------------------------------------------

export async function processIncomingReply(
  inboxId: string,
  threadId: string | null,
  senderEmail: string,
  subject: string,
  body: string,
  providerMessageId?: string,
): Promise<void> {
  // Match by threadId first (not sender email address — a colleague may reply)
  let conversation = threadId
    ? await prisma.conversation.findFirst({
        where: {
          messages: { some: { threadId } },
        },
        include: { lead: true },
      })
    : null;

  // Fallback: match by lead email if no threadId match
  if (!conversation) {
    const lead = await prisma.userLead.findFirst({
      where: { email: senderEmail.toLowerCase() },
      include: { conversation: true },
    });
    if (lead?.conversation) {
      conversation = lead.conversation as typeof conversation;
    }
  }

  if (!conversation) {
    // No matching conversation — log and ignore
    return;
  }

  const lead = conversation.lead;

  // Detect auto-replies / out-of-office
  if (isAutoReply(subject, body)) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        userId: conversation.userId,
        role: 'CUSTOMER',
        content: body,
        subject,
        senderEmail,
        providerMessageId,
        threadId: threadId || undefined,
        status: 'SENT',
        aiGenerated: false,
      },
    });
    await prisma.userLead.update({
      where: { id: lead.id },
      data: { replyTag: 'OUT_OF_OFFICE' },
    });
    await createNotification(
      conversation.userId,
      'auto_reply',
      `Auto-reply from ${lead.companyName}: ${subject}`,
      lead.id,
    );
    return;
  }

  // Save the genuine reply
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      leadId: lead.id,
      userId: conversation.userId,
      role: 'CUSTOMER',
      content: body,
      subject,
      senderEmail,
      providerMessageId,
      threadId: threadId || undefined,
      status: 'SENT',
      aiGenerated: false,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastActivity: new Date() },
  });

  await prisma.userLead.update({
    where: { id: lead.id },
    data: { status: 'REPLIED', lastMessageDate: new Date() },
  });

  // Create notification immediately
  await createNotification(
    conversation.userId,
    'reply',
    `New reply from ${lead.companyName}: ${subject}`,
    lead.id,
  );

  // If AI is enabled, trigger AI worker immediately
  if (lead.aiEnabled) {
    // Check global pause
    const user = await prisma.user.findUnique({
      where: { id: conversation.userId },
      select: { aiPaused: true },
    });
    if (user?.aiPaused) return;

    try {
      const decision = await decideReplyAction(lead.id, conversation.userId, body);
      await handleReplyAction(lead.id, conversation.userId, conversation.id, decision);
    } catch {
      // AI decision failed — log but don't crash
      await createNotification(
        conversation.userId,
        'ai_error',
        `AI failed to process reply from ${lead.companyName}. Manual review needed.`,
        lead.id,
      );
    }
  }
}
