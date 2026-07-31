import { connectDB } from './mongodb';
import UserLead from '../models/UserLead';
import User from '../models/User';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Meeting from '../models/Meeting';
import Notification from '../models/Notification';
import { sendEmail } from './email-sender';
import { getInboxForUser, cancelJobsForLead } from './scheduler';
import { getCalendarAvailability, createCalendarEvent } from './calendar';
import type { ReplyDecision, ReplyTagType } from './ai-worker';

export async function handleReplyAction(
  leadId: string,
  userId: string,
  conversationId: string,
  decision: ReplyDecision,
): Promise<void> {
  await connectDB();

  const lead = await UserLead.findById(leadId).select('email companyName aiEnabled preferredTime').lean();

  if (!lead) return;

  if (!lead.aiEnabled) return;

  if (decision.tag) {
    await UserLead.findByIdAndUpdate(leadId, { replyTag: decision.tag as ReplyTagType });
  }

  const inbox = await getInboxForUser(userId);
  if (!inbox) return;

  switch (decision.action) {
    case 'stop': {
      await UserLead.findByIdAndUpdate(leadId, {
        status: 'NOT_INTERESTED',
        aiEnabled: false,
        replyTag: 'NOT_INTERESTED',
      });
      await Conversation.updateMany({ leadId }, { status: 'CLOSED' });
      await cancelJobsForLead(leadId);

      try {
        const result = await sendEmail(inbox, {
          to: lead.email,
          from: inbox.emailAddress,
          subject: decision.subject,
          text: decision.body,
        });
        await Message.create({
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
        });
      } catch {
        // Email send failed — lead is still marked not_interested
      }
      break;
    }

    case 'meeting': {
      const user = await User.findById(userId).select('calendarConnected calendarProvider calendarCredentials').lean();

      let proposedSlots: string[] = [];

      if (user?.calendarConnected && user.calendarCredentials) {
        try {
          const busySlots = await getCalendarAvailability(userId);
          proposedSlots = generateAvailableSlots(busySlots, 3);
        } catch {
          proposedSlots = [lead.preferredTime.toISOString()];
        }
      } else {
        proposedSlots = [lead.preferredTime.toISOString()];
      }

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
        await Message.create({
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
        });

        await Meeting.create({
          leadId,
          userId,
          scheduledTime: new Date(proposedSlots[0]),
          duration: 30,
          meetingProvider: user?.calendarProvider || 'manual',
          proposedSlots: proposedSlots,
          status: 'PROPOSED',
        });

        await UserLead.findByIdAndUpdate(leadId, {
          status: 'MEETING_BOOKED',
          lastMessageDate: new Date(),
          replyTag: 'WANTS_MEETING',
        });
      } catch {
        // Send failed
      }
      break;
    }

    case 'continue':
    default: {
      try {
        const result = await sendEmail(inbox, {
          to: lead.email,
          from: inbox.emailAddress,
          subject: decision.subject,
          text: decision.body,
        });
        await Message.create({
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
        });
        await UserLead.findByIdAndUpdate(leadId, { lastMessageDate: new Date() });
      } catch {
        // Send failed
      }
      break;
    }
  }
}

function generateAvailableSlots(busySlots: { start: Date; end: Date }[], count: number): string[] {
  const slots: string[] = [];
  const now = new Date();
  let candidate = new Date(now);
  candidate.setHours(now.getHours() + 24, 0, 0, 0);

  let attempts = 0;
  while (slots.length < count && attempts < 50) {
    attempts++;
    const day = candidate.getDay();
    if (day === 0 || day === 6) {
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(9, 0, 0, 0);
      continue;
    }
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
      candidate = new Date(slotEnd.getTime() + 60 * 60 * 1000);
    } else {
      candidate = new Date(slotEnd.getTime());
    }
  }

  return slots;
}

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

export async function confirmMeeting(
  meetingId: string,
  userId: string,
  selectedSlot: string,
): Promise<void> {
  await connectDB();

  const meeting = await Meeting.findOne({ _id: meetingId, userId, status: 'PROPOSED' }).lean();

  if (!meeting) throw new Error('Meeting not found or already confirmed.');

  const slotDate = new Date(selectedSlot);

  const user = await User.findById(userId).select('calendarConnected calendarProvider calendarCredentials').lean();

  if (user?.calendarConnected && user.calendarCredentials) {
    try {
      const busySlots = await getCalendarAvailability(userId);
      const slotEnd = new Date(slotDate.getTime() + (meeting.duration || 30) * 60 * 1000);
      const isBusy = busySlots.some((b) => slotDate < b.end && slotEnd > b.start);
      if (isBusy) {
        throw new Error('Selected slot is no longer available. Please choose another time.');
      }

      const lead = await UserLead.findById(meeting.leadId).select('companyName email').lean();

      const meetingLink = await createCalendarEvent(userId, {
        title: `Meeting with ${lead?.companyName || 'lead'}`,
        start: slotDate,
        end: slotEnd,
        attendeeEmail: lead?.email || '',
      });

      await Meeting.findByIdAndUpdate(meetingId, {
        status: 'CONFIRMED',
        scheduledTime: slotDate,
        meetingLink: meetingLink || undefined,
      });
    } catch (e) {
      throw e;
    }
  } else {
    await Meeting.findByIdAndUpdate(meetingId, {
      status: 'CONFIRMED',
      scheduledTime: slotDate,
    });
  }

  await UserLead.findByIdAndUpdate(meeting.leadId, { status: 'MEETING_BOOKED' });
}

export async function cancelMeeting(meetingId: string, userId: string): Promise<void> {
  await connectDB();
  const meeting = await Meeting.findOne({ _id: meetingId, userId });
  if (!meeting) throw new Error('Meeting not found.');

  await Meeting.findByIdAndUpdate(meetingId, { status: 'CANCELLED' });
}

export async function rescheduleMeeting(
  meetingId: string,
  userId: string,
  newSlot: string,
): Promise<void> {
  await connectDB();
  const meeting = await Meeting.findOne({ _id: meetingId, userId });
  if (!meeting) throw new Error('Meeting not found.');

  await Meeting.findByIdAndUpdate(meetingId, {
    status: 'PROPOSED',
    scheduledTime: new Date(newSlot),
  });
}
