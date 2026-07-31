import mongoose from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  password?: string;
  businessName?: string;
  businessDescription?: string;
  services: string[];
  role: string;
  plan: string;
  status: string;
  calendarConnected: boolean;
  calendarProvider?: string;
  calendarCredentials?: string;
  aiPaused: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: Date;
}

const userSchema = new mongoose.Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  businessName: { type: String },
  businessDescription: { type: String },
  services: { type: [String], default: [] },
  role: { type: String, default: 'ADMIN' },
  plan: { type: String, default: 'FREE' },
  status: { type: String, default: 'ACTIVE' },
  calendarConnected: { type: Boolean, default: false },
  calendarProvider: { type: String },
  calendarCredentials: { type: String },
  aiPaused: { type: Boolean, default: false },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
export default User;
