import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasPermission, logActivity } from '@/lib/permissions';
import { randomBytes } from 'crypto';
import type { Role } from '@prisma/client';

// Get team members
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // All users in the system are part of the same workspace (single-org model)
    const members = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const invitations = await prisma.teamInvitation.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ members, invitations, currentRole: currentUser.role });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch team.' }, { status: 500 });
  }
}

// Invite a team member
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser || !hasPermission(currentUser.role as Role, 'manage_team')) {
      return NextResponse.json({ error: 'Only admins can invite team members.' }, { status: 403 });
    }

    const body = await req.json();
    const { email, role } = body as { email?: string; role?: Role };

    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const validRoles: Role[] = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'A valid role is required.' }, { status: 400 });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 400 });
    }

    // Check for existing pending invitation
    const existingInv = await prisma.teamInvitation.findFirst({
      where: { email: email.trim().toLowerCase(), status: 'PENDING' },
    });
    if (existingInv) {
      return NextResponse.json({ error: 'An invitation has already been sent to this email.' }, { status: 400 });
    }

    const token = randomBytes(32).toString('hex');

    await prisma.teamInvitation.create({
      data: {
        email: email.trim().toLowerCase(),
        role,
        inviterId: session.user.id,
        organizationId: session.user.id, // single-org model
        token,
        status: 'PENDING',
      },
    });

    await logActivity(
      session.user.id,
      'invited_team_member',
      'team_invitation',
      undefined,
      `Invited ${email} as ${role}`,
    );

    // In production, send an email with the invite link.
    // For now, return the token so the UI can display the signup link.
    return NextResponse.json({
      success: true,
      inviteUrl: `/signup?invite=${token}`,
      message: `Invitation sent to ${email}. Share this link: /signup?invite=${token}`,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to send invitation.' }, { status: 500 });
  }
}

// Update a team member's role
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser || !hasPermission(currentUser.role as Role, 'manage_team')) {
      return NextResponse.json({ error: 'Only admins can change roles.' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, role } = body as { userId?: string; role?: Role };

    if (!userId || !role) {
      return NextResponse.json({ error: 'userId and role are required.' }, { status: 400 });
    }

    const validRoles: Role[] = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    await logActivity(
      session.user.id,
      'changed_role',
      'user',
      userId,
      `Changed role to ${role}`,
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update role.' }, { status: 500 });
  }
}

// Remove a team member
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser || !hasPermission(currentUser.role as Role, 'manage_team')) {
      return NextResponse.json({ error: 'Only admins can remove team members.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    if (userId === session.user.id) {
      return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 });
    }

    await prisma.user.delete({ where: { id: userId } });

    await logActivity(
      session.user.id,
      'removed_team_member',
      'user',
      userId,
      'Removed team member',
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove team member.' }, { status: 500 });
  }
}
