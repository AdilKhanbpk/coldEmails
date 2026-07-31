import mongoose from 'mongoose';

export interface IInbox {
  userId: mongoose.Types.ObjectId;
  provider: string;
  emailAddress: string;
  credentials: string;
  status: string;
  dailySendingCap: number;
  warmupThrottle: boolean;
  sentToday: number;
  sentDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inboxSchema = new mongoose.Schema<IInbox>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  provider: { type: String, default: 'GMAIL' },
  emailAddress: { type: String, required: true },
  credentials: { type: String, required: true },
  status: { type: String, default: 'CONNECTED', index: true },
  dailySendingCap: { type: Number, default: 50 },
  warmupThrottle: { type: Boolean, default: false },
  sentToday: { type: Number, default: 0 },
  sentDate: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Inbox = mongoose.models.Inbox || mongoose.model<IInbox>('Inbox', inboxSchema);
export default Inbox;
