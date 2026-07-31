import mongoose from 'mongoose';

export interface IMessage {
  conversationId: mongoose.Types.ObjectId;
  leadId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: string;
  content: string;
  subject?: string;
  step?: number;
  aiGenerated: boolean;
  senderEmail?: string;
  providerMessageId?: string;
  threadId?: string;
  status: string;
  openedAt?: Date;
  clickedAt?: Date;
  createdAt: Date;
}

const messageSchema = new mongoose.Schema<IMessage>({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserLead', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  role: { type: String, required: true },
  content: { type: String, required: true },
  subject: { type: String },
  step: { type: Number },
  aiGenerated: { type: Boolean, default: false },
  senderEmail: { type: String },
  providerMessageId: { type: String },
  threadId: { type: String },
  status: { type: String, default: 'SENT', index: true },
  openedAt: { type: Date },
  clickedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const Message = mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema);
export default Message;
