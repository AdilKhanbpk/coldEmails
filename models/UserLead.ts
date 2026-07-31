import mongoose from 'mongoose';

export interface IUserLead {
  userId: mongoose.Types.ObjectId;
  companyName: string;
  email: string;
  services: string[];
  country: string;
  website?: string;
  outreachTypeId?: mongoose.Types.ObjectId;
  outreachDescription: string;
  preferredTime: Date;
  timezone: string;
  currentStep: number;
  status: string;
  replyTag?: string;
  aiEnabled: boolean;
  source: string;
  lastMessageDate?: Date;
  nextMessageDate?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  conversationId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const userLeadSchema = new mongoose.Schema<IUserLead>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  companyName: { type: String, required: true },
  email: { type: String, required: true },
  services: { type: [String], default: [] },
  country: { type: String, default: '' },
  website: { type: String },
  outreachTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'OutreachType', default: null },
  outreachDescription: { type: String, default: '' },
  preferredTime: { type: Date },
  timezone: { type: String, default: 'UTC' },
  currentStep: { type: Number, default: 0 },
  status: { type: String, default: 'NOT_STARTED', index: true },
  replyTag: { type: String },
  aiEnabled: { type: Boolean, default: true },
  source: { type: String, default: 'MANUAL' },
  lastMessageDate: { type: Date },
  nextMessageDate: { type: Date },
  openedAt: { type: Date },
  clickedAt: { type: Date },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  createdAt: { type: Date, default: Date.now },
});

userLeadSchema.index({ userId: 1, email: 1 });

export const UserLead = mongoose.models.UserLead || mongoose.model<IUserLead>('UserLead', userLeadSchema);
export default UserLead;
