import mongoose from 'mongoose';

export interface IJob {
  leadId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: string;
  runAt: Date;
  status: string;
  attempts: number;
  schedulerJobId?: string;
  createdAt: Date;
}

const jobSchema = new mongoose.Schema<IJob>({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserLead', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, required: true },
  runAt: { type: Date, required: true, index: true },
  status: { type: String, default: 'SCHEDULED', index: true },
  attempts: { type: Number, default: 0 },
  schedulerJobId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const Job = mongoose.models.Job || mongoose.model<IJob>('Job', jobSchema);
export default Job;
