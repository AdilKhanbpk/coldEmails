import { connectDB } from './mongodb';
import Job from '../models/Job';
import User from '../models/User';
import UserLead from '../models/UserLead';
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
import { generateFullSequence, generateOutreachMessage, decideReplyAction } from './ai-worker';
import { createTrackedHtmlBody } from './email-tracking';
import { handleReplyAction } from './reply-handler';

const MAX_ATTEMPTS = 3;

// ─── Notification helpers ─────────────────────────────────────────────────────

interface ErrorDetails {
  errorType?: string;
  errorMessage?: string;
  stack?: string;
  jobType?: string;
  stepNumber?: number;
  inboxEmail?: string;
  leadEmail?: string;
  attemptNumber?: number;
  nextRetryAt?: Date;
}

async function notify(
  userId: string,
  type: string,
  message: string,
  leadId: string,
  errorDetails?: ErrorDetails,
) {
  try {
    await Notification.create({ userId, type, message, leadId, errorDetails });
  } catch {
    // Never let notification failure break the main flow
  }
}

function extractError(error: unknown): { errorType: string; errorMessage: string; stack?: string } {
  if (error instanceof Error) {
    return {
      errorType: error.constructor.name || 'Error',
      errorMessage: error.message,
      stack: error.stack,
    };
  }
  return {
    errorType: 'UnknownError',
    errorMessage: String(error),
  };
}

// ─── Main job processor ───────────────────────────────────────────────────────

export async function processJob(jobId: string): Promise<boolean> {
  const acquired = await markJobRunning(jobId);
  if (!acquired) {
    console.log(`[processJob] Job ${jobId} already acquired by another worker`);
    return false;
  }

  console.log(`[processJob] Starting job ${jobId}`);
  
  const job = await Job.findById(jobId).lean();
  if (!job) {
    console.error(`[processJob] Job ${jobId} not found in database`);
    await markJobFailed(jobId);
    return true;
  }

  const lead = await UserLead.findById(job.leadId).populate('outreachTypeId').lean();
  if (!lead) {
    console.error(`[processJob] Lead ${job.leadId} not found for job ${jobId}`);
    await markJobFailed(jobId);
    return true;
  }

  const leadId = lead._id.toString();
  const userId = job.userId.toString();
  const jobType = job.type;

  console.log(`[processJob] Processing ${jobType} for lead ${lead.email} (${lead.companyName})`);

  // Skip terminal leads
  if (['BOUNCED', 'UNSUBSCRIBED', 'NOT_INTERESTED'].includes(lead.status)) {
    console.log(`[processJob] Lead ${leadId} has terminal status ${lead.status}, cancelling all jobs`);
    await cancelJobsForLead(leadId);
    return true;
  }

  const outreachType = lead.outreachTypeId as any;
  if (!lead.aiEnabled || !outreachType) {
    console.log(`[processJob] Lead ${leadId} has aiEnabled=${lead.aiEnabled}, skipping`);
    await markJobCompleted(jobId);
    return true;
  }

  const user = await User.findById(job.userId).select('aiPaused').lean();
  if (user?.aiPaused) {
    console.log(`[processJob] User ${userId} has AI paused, completing job without sending`);
    await markJobCompleted(jobId);
    return true;
  }

  // Determine step number early for logging and notifications
  const stepNumber = (job as any).stepNumber
    ?? (jobType === 'send_first_email' ? 1 : parseInt(jobType.replace('send_followup_', ''), 10) || 1);

  // Respect quiet hours
  if (isWithinQuietHours(lead.timezone ?? 'UTC')) {
    console.log(`[processJob] Lead ${leadId} is in quiet hours, requeuing for 1 hour`);
    await requeueJob(jobId, new Date(Date.now() + 60 * 60 * 1000));
    return false;
  }

  const inbox = await getInboxForUser(userId);
  if (!inbox) {
    console.log(`[processJob] No CONNECTED inbox available for user ${userId}`);
    
    // Check if user has any inboxes at all (including EXPIRED ones)
    const anyInbox = await Inbox.findOne({ userId }).lean();
    
    if (!anyInbox) {
      // User has no inboxes configured - requeue for tomorrow
      console.log(`[processJob] User has no inboxes configured, requeuing for tomorrow`);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      await requeueJob(jobId, tomorrow);
      
      // Notify user once (not every time)
      if (job.attempts === 0) {
        await notify(userId, 'no_inbox', 
          `Cannot send email to ${lead.companyName} - no inbox configured. Please add an inbox in Settings.`,
          leadId,
          { jobType, stepNumber, leadEmail: lead.email },
        );
      }
      return false;
    }
    
    // User has inboxes but they're all EXPIRED or at daily limit
    const expiredInbox = await Inbox.findOne({ userId, status: 'EXPIRED' }).lean();
    if (expiredInbox) {
      console.log(`[processJob] All inboxes are EXPIRED for user ${userId}, marking job as FAILED`);
      await markJobFailed(jobId);
      
      // Notify user that their inbox needs reconnection
      await notify(userId, 'inbox_expired',
        `Cannot send email to ${lead.companyName} (${lead.email}) - inbox ${expiredInbox.emailAddress} authentication expired. Please reconnect your inbox in Settings.`,
        leadId,
        { 
          jobType, 
          stepNumber, 
          inboxEmail: expiredInbox.emailAddress, 
          leadEmail: lead.email,
          errorType: 'InboxExpired',
          errorMessage: 'Inbox authentication expired',
        },
      );
      return true;
    }
    
    // All inboxes hit daily limit - requeue for tomorrow
    console.log(`[processJob] All inboxes hit daily limit, requeuing for tomorrow`);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await requeueJob(jobId, tomorrow);
    return false;
  }

  console.log(`[processJob] Using inbox ${inbox.emailAddress} (status: ${inbox.status})`);

  // Guard: don't send the same step twice
  const alreadySent = await Message.findOne({ leadId: lead._id, step: stepNumber, status: 'SENT' }).lean();
  if (alreadySent) {
    console.log(`[processJob] Step ${stepNumber} already sent for lead ${leadId}, completing job`);
    await markJobCompleted(jobId);
    return true;
  }

  // ── Generate email content ───────────────────────────────────────────────

  console.log(`[processJob] Generating email content for step ${stepNumber}`);
  
  let emailSubject = '';
  let emailBody = '';
  let aiError: unknown = null;

  if (jobType === 'send_first_email') {
    const sequenceSteps = outreachType.sequenceSteps as { stepNumber: number; delayDays: number }[];
    const totalSteps = sequenceSteps.length || 1;

    console.log(`[processJob] Generating full sequence (${totalSteps} steps) for first email`);
    
    try {
      const sequence = await generateFullSequence(
        leadId,
        userId,
        outreachType._id.toString(),
        totalSteps,
      );

      emailSubject = sequence[0].subject;
      emailBody = sequence[0].body;

      console.log(`[processJob] AI generated sequence successfully`);

      // Store followup content in sibling job docs
      const sortedSteps = [...sequenceSteps].sort((a, b) => a.stepNumber - b.stepNumber);
      for (let i = 1; i < sortedSteps.length; i++) {
        const followupStep = sortedSteps[i];
        const followupContent = sequence[i];
        if (!followupContent) continue;
        await Job.findOneAndUpdate(
          { leadId: lead._id, userId: job.userId, type: `send_followup_${followupStep.stepNumber}`, status: 'SCHEDULED' },
          { $set: { preGeneratedSubject: followupContent.subject, preGeneratedBody: followupContent.body } },
        );
      }
    } catch (err) {
      aiError = err;
      const errInfo = extractError(err);
      console.error(`[processJob] AI generation failed, using fallback:`, errInfo);
      // Notify user that AI failed but we used fallback
      await notify(userId, 'ai_error', `AI failed to generate email for ${lead.companyName} (step ${stepNumber}). Using fallback content. Error: ${errInfo.errorMessage}`, leadId, {
        ...errInfo,
        jobType,
        stepNumber,
        leadEmail: lead.email,
      });
      emailBody = (outreachType.exampleEmails as string[])[0] || 'Hello, reaching out about a potential opportunity.';
      emailSubject = `Outreach to ${lead.companyName}`;
    }
  } else {
    const jobDoc = await Job.findById(jobId).lean() as any;
    if (jobDoc?.preGeneratedSubject && jobDoc?.preGeneratedBody) {
      console.log(`[processJob] Using pre-generated content for followup ${stepNumber}`);
      emailSubject = jobDoc.preGeneratedSubject;
      emailBody = jobDoc.preGeneratedBody;
    } else {
      console.log(`[processJob] Pre-generated content not found, generating on-demand`);
      try {
        const content = await generateOutreachMessage(leadId, userId, outreachType._id.toString(), stepNumber);
        emailSubject = content.subject;
        emailBody = content.body;
      } catch (err) {
        aiError = err;
        const errInfo = extractError(err);
        console.error(`[processJob] AI generation failed for followup, using fallback:`, errInfo);
        await notify(userId, 'ai_error', `AI failed to generate followup email for ${lead.companyName} (step ${stepNumber}). Using fallback. Error: ${errInfo.errorMessage}`, leadId, {
          ...errInfo,
          jobType,
          stepNumber,
          leadEmail: lead.email,
        });
        emailBody = 'Following up on our previous conversation.';
        emailSubject = `Re: Outreach to ${lead.companyName}`;
      }
    }
  }

  // ── Ensure conversation exists ───────────────────────────────────────────

  let conversationId = lead.conversationId;
  if (!conversationId) {
    console.log(`[processJob] Creating new conversation for lead ${leadId}`);
    const conv = await Conversation.create({ leadId: lead._id, userId: job.userId, status: 'ACTIVE', lastActivity: new Date() });
    conversationId = conv._id;
    await UserLead.findByIdAndUpdate(lead._id, { conversationId });
  }

  // ── Create message record ────────────────────────────────────────────────

  console.log(`[processJob] Creating message record for step ${stepNumber}`);
  
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

  // ── Send email (token refresh handled inside sendViaGmail/sendViaOutlook) ──────

  console.log(`[processJob] Sending email to ${lead.email} via ${inbox.emailAddress}`);

  try {
    const result = await sendEmail(inbox, {
      to: lead.email,
      from: inbox.emailAddress,
      subject: emailSubject,
      text: emailBody,
      html: htmlBody,
    });

    console.log(`[processJob] Email sent successfully, messageId: ${result.providerMessageId}`);

    await Message.findByIdAndUpdate(message._id, {
      providerMessageId: result.providerMessageId,
      threadId: result.threadId,
    });

    await UserLead.findByIdAndUpdate(lead._id, {
      currentStep: stepNumber,
      lastMessageDate: new Date(),
      status: 'IN_PROGRESS',
    });

    await incrementInboxSentCount((inbox as any)._id.toString());
    await markJobCompleted(jobId);

    // ✅ Success notification
    const stepLabel = jobType === 'send_first_email' ? 'First email' : `Followup ${stepNumber}`;
    await notify(userId, 'email_sent',
      `${stepLabel} sent to ${lead.companyName} (${lead.email}). Subject: "${emailSubject}"${aiError ? ' [AI fallback used]' : ''}`,
      leadId,
      { jobType, stepNumber, inboxEmail: inbox.emailAddress, leadEmail: lead.email },
    );

    console.log(`[processJob] Job ${jobId} completed successfully`);
    return true;

  } catch (error) {
    console.error(`[processJob] Email send failed:`, error);
    
    await Message.findByIdAndDelete(message._id);

    const errInfo = extractError(error);
    const stepLabel = jobType === 'send_first_email' ? 'First email' : `Followup ${stepNumber}`;

    if (error instanceof BounceError) {
      console.log(`[processJob] Bounce error, marking lead as BOUNCED`);
      await UserLead.findByIdAndUpdate(lead._id, { status: 'BOUNCED' });
      await cancelJobsForLead(leadId);
      await notify(userId, 'bounce',
        `${stepLabel} to ${lead.companyName} (${lead.email}) bounced permanently. Lead marked as BOUNCED and all future jobs cancelled.`,
        leadId,
        { ...errInfo, jobType, stepNumber, inboxEmail: inbox.emailAddress, leadEmail: lead.email },
      );
      return true;
    }

    if (error instanceof AuthError) {
      console.log(`[processJob] Auth error after retry, marking inbox as EXPIRED`);
      await Inbox.findByIdAndUpdate((inbox as any)._id, { status: 'EXPIRED' });
      const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
      await requeueJob(jobId, nextRetryAt);
      await notify(userId, 'inbox_expired',
        `Inbox ${inbox.emailAddress} authentication expired. ${stepLabel} to ${lead.companyName} failed. Job requeued for 5 minutes. Please reconnect your inbox in Settings.`,
        leadId,
        { ...errInfo, jobType, stepNumber, inboxEmail: inbox.emailAddress, leadEmail: lead.email, nextRetryAt },
      );
      return true;
    }

    // Generic failure
    const attempts = await markJobFailed(jobId);
    console.log(`[processJob] Generic failure, attempt ${attempts}/${MAX_ATTEMPTS}`);
    
    if (attempts < MAX_ATTEMPTS) {
      const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
      await requeueJob(jobId, nextRetryAt);
      await notify(userId, 'send_failed',
        `${stepLabel} to ${lead.companyName} (${lead.email}) failed (attempt ${attempts}/${MAX_ATTEMPTS}). Retrying in 5 minutes. Error: ${errInfo.errorMessage}`,
        leadId,
        { ...errInfo, jobType, stepNumber, inboxEmail: inbox.emailAddress, leadEmail: lead.email, attemptNumber: attempts, nextRetryAt },
      );
    } else {
      await notify(userId, 'send_failed',
        `${stepLabel} to ${lead.companyName} (${lead.email}) failed after ${MAX_ATTEMPTS} attempts and will not be retried. Error: ${errInfo.errorMessage}`,
        leadId,
        { ...errInfo, jobType, stepNumber, inboxEmail: inbox.emailAddress, leadEmail: lead.email, attemptNumber: attempts },
      );
    }
    return true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAutoReply(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase();
  return (
    text.includes('out of office') ||
    text.includes('auto-reply') ||
    text.includes('automatic reply') ||
    text.includes('autoreply') ||
    text.includes('i am away') ||
    text.includes('i am out') ||
    text.includes('on vacation') ||
    text.includes('on leave') ||
    text.includes('do not reply') ||
    text.includes('noreply') ||
    text.includes('no-reply')
  );
}

// ─── Batch processor (called by cron-job.org endpoint) ───────────────────────

export async function processDueJobs(limit = 50): Promise<{ processed: number; skipped: number }> {
  try {
    await connectDB();
    console.log('[processDueJobs] Connected to DB, polling for due jobs...');
    
    const jobs = await pollDueJobs(limit);
    console.log(`[processDueJobs] Found ${jobs.length} due jobs`);
    
    let processed = 0;
    let skipped = 0;

    for (const job of jobs) {
      try {
        console.log(`[processDueJobs] Processing job ${job.jobId} (${job.type}) for lead ${job.leadId}`);
        const result = await processJob(job.jobId);
        if (result) {
          processed++;
          console.log(`[processDueJobs] Job ${job.jobId} processed successfully`);
        } else {
          skipped++;
          console.log(`[processDueJobs] Job ${job.jobId} skipped (already acquired or requeued)`);
        }
      } catch (err) {
        skipped++;
        console.error(`[processDueJobs] Job ${job.jobId} failed:`, err);
      }
    }

    console.log(`[processDueJobs] Summary - Processed: ${processed}, Skipped: ${skipped}`);
    return { processed, skipped };
  } catch (err) {
    console.error('[processDueJobs] Fatal error:', err);
    throw err;
  }
}

// ─── Incoming reply processor ─────────────────────────────────────────────────

export async function processIncomingReply(
  inboxId: string,
  threadId: string | null,
  senderEmail: string,
  subject: string,
  body: string,
  providerMessageId?: string,
  skipAI = false,
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

  if (!conversation) return;

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
    await notify(conversation.userId.toString(), 'auto_reply', `Auto-reply from ${lead.companyName}: ${subject}`, lead._id.toString());
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
  await UserLead.findByIdAndUpdate(lead._id, { status: 'REPLIED', lastMessageDate: new Date() });
  await notify(conversation.userId.toString(), 'reply', `New reply from ${lead.companyName}: ${subject}`, lead._id.toString());

  if (lead.aiEnabled) {
    if (!skipAI) {
      const user = await User.findById(conversation.userId).select('aiPaused').lean();
      if (user?.aiPaused) return;

      try {
        const decision = await decideReplyAction(lead._id.toString(), conversation.userId.toString(), body);
        await handleReplyAction(lead._id.toString(), conversation.userId.toString(), conversation._id.toString(), decision);
      } catch (err) {
        const errInfo = extractError(err);
        await notify(
          conversation.userId.toString(),
          'ai_error',
          `AI failed to process reply from ${lead.companyName}. Manual review needed. Error: ${errInfo.errorMessage}`,
          lead._id.toString(),
          errInfo,
        );
      }
    }
  }
}
