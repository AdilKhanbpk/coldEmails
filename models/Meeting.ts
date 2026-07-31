import mongoose from 'mongoose';

export interface IMeeting {
  conversationId: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  customerName: string;
  customerEmail: string;
  scheduledTime: Date;
  timezone: string;
  meetingProvider: string;
  meetingLink?: string;
  proposedSlots?: any;
  duration?: number;
  status: string;
  createdAt: Date;
}

const meetingSchema = new mongoose.Schema<IMeeting>({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserLead', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  customerName: { type: String, default: '' },
  customerEmail: { type: String, default: '' },
  scheduledTime: { type: Date },
  timezone: { type: String, default: 'UTC' },
  meetingProvider: { type: String, default: 'manual' },
  meetingLink: { type: String },
  proposedSlots: { type: mongoose.Schema.Types.Mixed },
  duration: { type: Number, default: 30 },
  status: { type: String, default: 'PROPOSED', index: true },
  createdAt: { type: Date, default: Date.now },
});

export const Meeting = mongoose.models.Meeting || mongoose.model<IMeeting>('Meeting', meetingSchema);
export default Meeting;
