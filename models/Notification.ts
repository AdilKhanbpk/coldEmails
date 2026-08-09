import mongoose from 'mongoose';

export interface INotification {
  userId: mongoose.Types.ObjectId;
  type: string;
  message: string;
  leadId?: mongoose.Types.ObjectId;
  // Full error details for debugging
  errorDetails?: {
    errorType?: string;      // 'AuthError' | 'BounceError' | 'AIError' | 'SendError' | etc.
    errorMessage?: string;   // full error message
    stack?: string;          // stack trace
    jobType?: string;        // 'send_first_email' | 'send_followup_2' etc.
    stepNumber?: number;
    inboxEmail?: string;
    leadEmail?: string;
    attemptNumber?: number;
    nextRetryAt?: Date;
  };
  seen: boolean;
  createdAt: Date;
}

const notificationSchema = new mongoose.Schema<INotification>({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserLead' },
  errorDetails: {
    type: {
      errorType: String,
      errorMessage: String,
      stack: String,
      jobType: String,
      stepNumber: Number,
      inboxEmail: String,
      leadEmail: String,
      attemptNumber: Number,
      nextRetryAt: Date,
    },
    default: undefined,
  },
  seen: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now },
});

export const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
