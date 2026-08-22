'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, UserPlus, Trash2, Shield, Activity, Users, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTeam } from '@/app/(dashboard)/contexts/TeamContext';
type Role = string;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const ROLE_STYLES: Record<string, string> = {
  ADMIN: 'border-blue-200 bg-blue-50 text-blue-700',
  MANAGER: 'border-green-200 bg-green-50 text-green-700',
  MEMBER: 'border-gray-200 text-gray-600',
  VIEWER: 'border-gray-200 bg-gray-50 text-gray-500',
};

export function TeamClient({ currentRole }: { currentRole: Role }) {
  const {
    members: contextMembers,
    invitations: contextInvitations,
    activity: contextActivity,
    loading,
    fetchTeam,
    updateMemberRole: contextUpdateRole,
    removeMember: contextRemoveMember,
    addInvitation: contextAddInvitation,
    refreshTeam,
  } = useTeam();
  
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState('');
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const canManage = currentRole === 'ADMIN';

  // Fetch team data on mount (will use cache if available)
  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Use context data or empty arrays
  const members = contextMembers || [];
  const invitations = contextInvitations || [];
  const activity = contextActivity || [];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to send invitation.');
        return;
      }
      toast.success('Invitation sent.');
      setInviteResult(data.inviteUrl);
      setInviteEmail('');
      
      // Add to context cache
      if (data.invitation) {
        contextAddInvitation(data.invitation);
      } else {
        // Refresh to get the new invitation
        refreshTeam();
      }
    } catch {
      toast.error('Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    try {
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        toast.error('Failed to update role.');
        return;
      }
      toast.success('Role updated.');
      
      // Update context cache
      contextUpdateRole(userId, role);
    } catch {
      toast.error('Failed to update role.');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this team member?')) return;
    try {
      const res = await fetch(`/api/team?userId=${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to remove member.');
        return;
      }
      toast.success('Member removed.');
      
      // Update context cache
      contextRemoveMember(userId);
    } catch {
      toast.error('Failed to remove member.');
    }
  };

  const copyInviteUrl = (url: string) => {
    navigator.clipboard.writeText(window.location.origin + url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(''), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Team Workspace</h1>
          <p className="mt-1 text-sm text-gray-500">Manage team members, roles, and shared access.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInvite(true)} className="bg-blue-600 hover:bg-blue-700">
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Team Members */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Team Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                    {member.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.name}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.id, v as Role)}
                    >
                      <SelectTrigger className="w-[120px] border-gray-200 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={ROLE_STYLES[member.role]}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  )}
                  {canManage && member.role !== 'ADMIN' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(member.id)}
                      className="text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card className="mt-6 border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    Invited as {ROLE_LABELS[inv.role]} · {format(new Date(inv.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-200 text-xs"
                  onClick={() => copyInviteUrl(`/signup?invite=${inv.token}`)}
                >
                  {copiedUrl === `/signup?invite=${inv.token}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  Copy Link
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card className="mt-6 border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No recent activity.</p>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-2">
                {activity.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-md px-3 py-2 text-sm">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Shield className="h-3 w-3 text-gray-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-700">
                        <span className="font-medium text-gray-900">{log.user.name}</span> {log.details || log.action}
                      </p>
                      <p className="text-xs text-gray-400">{format(new Date(log.createdAt), 'MMM d, yyyy HH:mm')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your workspace. They can sign up with the link after you invite them.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="mt-1 border-gray-200"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Role</label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                <SelectTrigger className="mt-1 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin — Full access including billing & team</SelectItem>
                  <SelectItem value="MANAGER">Manager — Manage all leads & outreach types</SelectItem>
                  <SelectItem value="MEMBER">Member — Manage own leads only</SelectItem>
                  <SelectItem value="VIEWER">Viewer — Read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteResult && (
              <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Share this signup link: <span className="font-mono">{inviteResult}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-2 h-6 p-0"
                  onClick={() => copyInviteUrl(inviteResult)}
                >
                  {copiedUrl === inviteResult ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)} className="border-gray-200">
                Cancel
              </Button>
              <Button type="submit" disabled={inviting} className="bg-blue-600 hover:bg-blue-700">
                {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Send Invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
