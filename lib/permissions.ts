// ---------------------------------------------------------------------------
// Permission helpers — role-based access control for team workspaces.
// Roles (from the User model):
//   ADMIN:   full access including billing, team management, all leads/types
//   MANAGER: manage all leads and outreach types, no billing/team
//   MEMBER:  manage only their own assigned leads
//   VIEWER:  read-only, cannot send/edit/delete
// ---------------------------------------------------------------------------

import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';
import type { Role } from '@prisma/client';

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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, plan: true, status: true },
  });

  return user;
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

// Check if a user can access a specific lead (owner or manager+)
export async function canAccessLead(leadId: string, userId: string, role: Role): Promise<boolean> {
  if (hasPermission(role, 'delete')) return true; // ADMIN or MANAGER
  // MEMBER can only access their own leads
  const lead = await prisma.userLead.findFirst({
    where: { id: leadId, userId },
    select: { id: true },
  });
  return !!lead;
}

// Log an activity
export async function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
): Promise<void> {
  await prisma.activityLog.create({
    data: { userId, action, entityType, entityId, details },
  });
}
