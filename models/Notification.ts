import mongoose from 'mongoose';

export interface INotification {
  userId: mongoose.Types.ObjectId;
  type: string;
  message: string;
  leadId?: mongoose.Types.ObjectId;
  seen: boolean;
  createdAt: Date;
}

const notificationSchema = new mongoose.Schema<INotification>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserLead' },
  seen: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

export const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
