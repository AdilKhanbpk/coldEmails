import mongoose from 'mongoose';

export interface IOutreachType {
  userId: mongoose.Types.ObjectId;
  name: string;
  systemPrompt: string;
  exampleEmails: string[];
  sequenceSteps: { stepNumber: number; delayDays: number }[];
  active: boolean;
  createdAt: Date;
}

const outreachTypeSchema = new mongoose.Schema<IOutreachType>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  systemPrompt: { type: String, required: true },
  exampleEmails: { type: [String], default: [] },
  sequenceSteps: { type: [{ stepNumber: Number, delayDays: Number }], default: [] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const OutreachType = mongoose.models.OutreachType || mongoose.model<IOutreachType>('OutreachType', outreachTypeSchema);
export default OutreachType;
