import mongoose from 'mongoose';

export interface IConversation {
  leadId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  aiEnabled: boolean;
  status: string;
  lastActivity?: Date;
  createdAt: Date;
}

const conversationSchema = new mongoose.Schema<IConversation>({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserLead', unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  aiEnabled: { type: Boolean, default: true },
  status: { type: String, default: 'ACTIVE', index: true },
  lastActivity: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const Conversation = mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', conversationSchema);
export default Conversation;
