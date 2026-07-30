import { prisma } from './prisma';
import { sendEmail } from './email-sender';
import { getInboxForUser, cancelJobsForLead } from './scheduler';
import { getCalendarAvailability, createCalendarEvent } from './calendar';
import type { ReplyDecision, ReplyTagType } from './ai-worker';

// ---------------------------------------------------------------------------
// handleReplyAction — executes the AI's chosen action for a customer reply.
//   a. "continue" — send the AI-generated reply
//   b. "meeting"  — check calendar, offer slots in the reply
//   c. "stop"     — mark lead not_interested, cancel all jobs, send brief closing
// ---------------------------------------------------------------------------

export async function handleReplyAction(
  leadId: string,
  userId: string,
  conversationId: string,
  decision: ReplyDecision,
): Promise<void> {
  const lead = await prisma.userLead.findUnique({
    where: { id: leadId },
    select: { email: true, companyName: true, aiEnabled: true, preferredTime: true },
  });

  if (!lead) return;

  // Re-check aiEnabled before sending (Stop AI may have been clicked)
  if (!lead.aiEnabled) return;

  // Save the AI-derived reply tag on the lead (for leads list + conversation view)
  if (decision.tag) {
    await prisma.userLead.update({
      where: { id: leadId },
      data: { replyTag: decision.tag as ReplyTagType },
    });
  }

  const inbox = await getInboxForUser(userId);
  if (!inbox) return;

  switch (decision.action) {
    case 'stop': {
      // Mark lead as not interested, cancel all scheduled jobs, stop outreach permanently
      await prisma.userLead.update({
        where: { id: leadId },
        data: { status: 'NOT_INTERESTED', aiEnabled: false, replyTag: 'NOT_INTERESTED' },
      });
      await prisma.conversation.updateMany({
        where: { leadId },
        data: { status: 'CLOSED' },
      });
      await cancelJobsForLead(leadId);

      // Send brief polite closing
      try {
        const result = await sendEmail(inbox, {
          to: lead.email,
          from: inbox.emailAddress,
          subject: decision.subject,
          text: decision.body,
        });
        await prisma.message.create({
          data: {
            conversationId,
            leadId,
            userId,
            role: 'ASSISTANT',
            content: decision.body,
            subject: decision.subject,
            aiGenerated: true,
            providerMessageId: result.providerMessageId,
            threadId: result.threadId,
            status: 'SENT',
          },
        });
      } catch {
        // Email send failed — lead is still marked not_interested
      }
      break;
    }

    case 'meeting': {
      // Check calendar availability and offer real slots
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { calendarConnected: true, calendarProvider: true, calendarCredentials: true },
      });

      let proposedSlots: string[] = [];

      if (user?.calendarConnected && user.calendarCredentials) {
        // Check real free/busy via Calendar API
        try {
          const busySlots = await getCalendarAvailability(userId);
          proposedSlots = generateAvailableSlots(busySlots, 3);
        } catch {
          // Calendar API failed — fall back to preferredTime
          proposedSlots = [lead.preferredTime.toISOString()];
        }
      } else {
        // No calendar connected — fall back to preferredTime, marked as needing manual confirmation
        proposedSlots = [lead.preferredTime.toISOString()];
      }

      // Build reply body with slot proposals
      let bodyWithSlots = decision.body;
      if (proposedSlots.length > 0) {
        const slotLines = proposedSlots.map(
          (s) => `- ${new Date(s).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
        );
        bodyWithSlots += `\n\nHere are some available times:\n${slotLines.join('\n')}`;
        if (!user?.calendarConnected) {
          bodyWithSlots += '\n\n(Note: these times need final confirmation from our team.)';
        }
      }

      try {
        const result = await sendEmail(inbox, {
          to: lead.email,
          from: inbox.emailAddress,
          subject: decision.subject,
          text: bodyWithSlots,
        });
        await prisma.message.create({
          data: {
            conversationId,
            leadId,
            userId,
            role: 'ASSISTANT',
            content: bodyWithSlots,
            subject: decision.subject,
            aiGenerated: true,
            providerMessageId: result.providerMessageId,
            threadId: result.threadId,
            status: 'SENT',
          },
        });

        // Create a PROPOSED meeting record
        await prisma.meeting.create({
          data: {
            leadId,
            userId,
            scheduledTime: new Date(proposedSlots[0]),
            duration: 30,
            meetingProvider: user?.calendarProvider || 'manual',
            proposedSlots: proposedSlots,
            status: 'PROPOSED',
          },
        });

        await prisma.userLead.update({
          where: { id: leadId },
          data: { status: 'MEETING_BOOKED', lastMessageDate: new Date(), replyTag: 'WANTS_MEETING' },
        });
      } catch {
        // Send failed
      }
      break;
    }

    case 'continue':
    default: {
      // Send the AI-generated contextual reply
      try {
        const result = await sendEmail(inbox, {
          to: lead.email,
          from: inbox.emailAddress,
          subject: decision.subject,
          text: decision.body,
        });
        await prisma.message.create({
          data: {
            conversationId,
            leadId,
            userId,
            role: 'ASSISTANT',
            content: decision.body,
            subject: decision.subject,
            aiGenerated: true,
            providerMessageId: result.providerMessageId,
            threadId: result.threadId,
            status: 'SENT',
          },
        });
        await prisma.userLead.update({
          where: { id: leadId },
          data: { lastMessageDate: new Date() },
        });
      } catch {
        // Send failed
      }
      break;
    }
  }
}

// Generate N available slots avoiding busy times (simple heuristic)
function generateAvailableSlots(busySlots: { start: Date; end: Date }[], count: number): string[] {
  const slots: string[] = [];
  const now = new Date();
  let candidate = new Date(now);
  candidate.setHours(now.getHours() + 24, 0, 0, 0); // Start tomorrow

  let attempts = 0;
  while (slots.length < count && attempts < 50) {
    attempts++;
    // Skip weekends
    const day = candidate.getDay();
    if (day === 0 || day === 6) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(9, 0, 0, 0);
      continue;
    }
    // Keep business hours 9am-5pm
    if (candidate.getHours() >= 17) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(9, 0, 0, 0);
      continue;
    }

    const slotEnd = new Date(candidate.getTime() + 30 * 60 * 1000);
    const isBusy = busySlots.some(
      (b) => candidate < b.end && slotEnd > b.start,
    );

    if (!isBusy) {
      slots.push(candidate.toISOString());
      candidate = new Date(slotEnd.getTime() + 60 * 60 * 1000); // 1h gap
    } else {
      candidate = new Date(slotEnd.getTime());
    }
  }

  return slots;
}

// Detect auto-reply / out-of-office by subject and body patterns
export function isAutoReply(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase();
  const patterns = [
    'out of office',
    'out of the office',
    'auto-reply',
    'auto reply',
    'automatic reply',
    'undeliverable',
    'delivery status notification',
    'mail delivery failed',
    'vacation',
    'on leave',
    'away from',
    'no longer with',
    'left the company',
    'autorespond',
    'do not reply',
  ];
  return patterns.some((p) => text.includes(p));
}

// ---------------------------------------------------------------------------
// Confirm a proposed meeting: re-check availability, create calendar event.
// ---------------------------------------------------------------------------

export async function confirmMeeting(
  meetingId: string,
  userId: string,
  selectedSlot: string,
): Promise<void> {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, userId, status: 'PROPOSED' },
    include: { lead: true },
  });

  if (!meeting) throw new Error('Meeting not found or already confirmed.');

  const slotDate = new Date(selectedSlot);

  // Re-check availability immediately before confirming (prevent double-booking)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarConnected: true, calendarProvider: true, calendarCredentials: true },
  });

  if (user?.calendarConnected && user.calendarCredentials) {
    try {
      const busySlots = await getCalendarAvailability(userId);
      const slotEnd = new Date(slotDate.getTime() + meeting.duration * 60 * 1000);
      const isBusy = busySlots.some((b) => slotDate < b.end && slotEnd > b.start);
      if (isBusy) {
        throw new Error('Selected slot is no longer available. Please choose another time.');
      }

      // Create real calendar event with meeting link
      const meetingLink = await createCalendarEvent(userId, {
        title: `Meeting with ${meeting.lead.companyName}`,
        start: slotDate,
        end: slotEnd,
        attendeeEmail: meeting.lead.email,
      });

      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: 'CONFIRMED',
          scheduledTime: slotDate,
          meetingLink: meetingLink || undefined,
        },
      });
    } catch (e) {
      throw e;
    }
  } else {
    // No calendar — just confirm without a meeting link
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'CONFIRMED',
        scheduledTime: slotDate,
      },
    });
  }

  await prisma.userLead.update({
    where: { id: meeting.leadId },
    data: { status: 'MEETING_BOOKED' },
  });
}

export async function cancelMeeting(meetingId: string, userId: string): Promise<void> {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, userId },
  });
  if (!meeting) throw new Error('Meeting not found.');

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: 'CANCELLED' },
  });
}

export async function rescheduleMeeting(
  meetingId: string,
  userId: string,
  newSlot: string,
): Promise<void> {
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, userId },
  });
  if (!meeting) throw new Error('Meeting not found.');

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: 'PROPOSED',
      scheduledTime: new Date(newSlot),
    },
  });
}
