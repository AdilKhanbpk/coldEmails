import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { connectDB } from './mongodb';
import User from '../models/User';
import UserLead from '../models/UserLead';
import ActivityLog from '../models/ActivityLog';

type Role = string;

export type Permission = 'view' | 'edit' | 'send' | 'delete' | 'manage_team' | 'manage_billing';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['view', 'edit', 'send', 'delete', 'manage_team', 'manage_billing'],
  MANAGER: ['view', 'edit', 'send', 'delete'],
  MEMBER: ['view', 'edit', 'send'],
  VIEWER: ['view'],
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  await connectDB();
  const user = await User.findById(session.user.id).select('id name email role plan status').lean();

  if (!user) return null;

  return {
    id: (user._id as string).toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    status: user.status,
  };
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export async function checkPermission(permission: Permission): Promise<{
  allowed: boolean;
  userId?: string;
  role?: Role;
}> {
  const user = await getCurrentUser();
  if (!user) return { allowed: false };
  return {
    allowed: hasPermission(user.role, permission),
    userId: user.id,
    role: user.role,
  };
}

export async function canAccessLead(leadId: string, userId: string, role: Role): Promise<boolean> {
  if (hasPermission(role, 'delete')) return true;
  await connectDB();
  const lead = await UserLead.findOne({ _id: leadId, userId }).select('_id').lean();
  return !!lead;
}

export async function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
): Promise<void> {
  await connectDB();
  await ActivityLog.create({ userId, action, entityType, entityId, details });
}
