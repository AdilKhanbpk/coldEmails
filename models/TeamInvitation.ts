import mongoose from 'mongoose';

export interface ITeamInvitation {
  email: string;
  role: string;
  inviterId: mongoose.Types.ObjectId;
  organizationId: string;
  token: string;
  status: string;
  createdAt: Date;
}

const teamInvitationSchema = new mongoose.Schema<ITeamInvitation>({
  email: { type: String, required: true, index: true },
  role: { type: String, default: 'MEMBER' },
  inviterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizationId: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  status: { type: String, default: 'PENDING' },
  createdAt: { type: Date, default: Date.now },
});

export const TeamInvitation = mongoose.models.TeamInvitation || mongoose.model<ITeamInvitation>('TeamInvitation', teamInvitationSchema);
export default TeamInvitation;
