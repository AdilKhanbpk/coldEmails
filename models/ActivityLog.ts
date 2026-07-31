import mongoose from 'mongoose';

export interface IActivityLog {
  userId: mongoose.Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  createdAt: Date;
}

const activityLogSchema = new mongoose.Schema<IActivityLog>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true, index: true },
  entityId: { type: String },
  details: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ActivityLog = mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
export default ActivityLog;
