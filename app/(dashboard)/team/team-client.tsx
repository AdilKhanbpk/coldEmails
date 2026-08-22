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
  ADMIN: 'border-[#E8C4AE] bg-[#F3E7DE] text-[#A94F31]',
  MANAGER: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  MEMBER: 'border-stone-200 text-stone-600',
  VIEWER: 'border-stone-200 bg-stone-50 text-stone-500',
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
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F4] py-20">
        <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-stone-200 pb-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight text-stone-900 sm:text-3xl">
              Team Workspace
            </h1>
            <p className="mt-1.5 text-sm text-stone-500">Manage team members, roles, and shared access.</p>
          </div>
          {canManage && (
            <Button onClick={() => setShowInvite(true)} className="shrink-0 rounded-full bg-[#C1613F] text-white hover:bg-[#A94F31]">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite member
            </Button>
          )}
        </div>

        {/* Team Members */}
        <Card className="rounded-2xl border-stone-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-stone-500">
              <Users className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
              Team members ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {members.map((member) => (
                <div key={member.id} className="flex flex-col gap-3 rounded-xl border border-stone-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C1613F] text-sm font-medium text-white">
                      {member.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">{member.name}</p>
                      <p className="truncate text-xs text-stone-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-12 sm:pl-0">
                    {canManage ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) => handleRoleChange(member.id, v as Role)}
                      >
                        <SelectTrigger className="h-8 w-[120px] rounded-full border-stone-200 text-xs">
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
                        className="h-8 w-8 rounded-full p-0 text-red-600 hover:bg-red-50"
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
          <Card className="mt-6 rounded-2xl border-stone-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                Pending invitations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex flex-col gap-2 rounded-xl border border-stone-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">{inv.email}</p>
                    <p className="text-xs text-stone-500">
                      Invited as {ROLE_LABELS[inv.role]} · {format(new Date(inv.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full border-stone-200 text-xs text-stone-700 hover:bg-stone-50"
                    onClick={() => copyInviteUrl(`/signup?invite=${inv.token}`)}
                  >
                    {copiedUrl === `/signup?invite=${inv.token}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy link
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Activity Log */}
        <Card className="mt-6 rounded-2xl border-stone-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-stone-500">
              <Activity className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-400">No recent activity.</p>
            ) : (
              <ScrollArea className="max-h-80">
                <div className="space-y-1">
                  {activity.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 rounded-xl px-3 py-2 text-sm">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100">
                        <Shield className="h-3 w-3 text-stone-500" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1">
                        <p className="text-stone-700">
                          <span className="font-medium text-stone-900">{log.user.name}</span> {log.details || log.action}
                        </p>
                        <p className="text-xs text-stone-400">{format(new Date(log.createdAt), 'MMM d, yyyy HH:mm')}</p>
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
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-stone-900">Invite team member</DialogTitle>
              <DialogDescription className="text-stone-500">
                Send an invitation to join your workspace. They can sign up with the link after you invite them.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-stone-700">Email</label>
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="mt-1 rounded-xl border-stone-200 focus-visible:ring-[#C1613F]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-stone-700">Role</label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
                  <SelectTrigger className="mt-1 rounded-xl border-stone-200">
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
                <div className="rounded-xl bg-[#F3E7DE] px-3 py-2 text-xs text-[#A94F31]">
                  Share this signup link: <span className="font-mono">{inviteResult}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-6 p-0 hover:bg-transparent"
                    onClick={() => copyInviteUrl(inviteResult)}
                  >
                    {copiedUrl === inviteResult ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowInvite(false)} className="rounded-full border-stone-200 text-stone-700 hover:bg-stone-50">
                  Cancel
                </Button>
                <Button type="submit" disabled={inviting} className="rounded-full bg-[#C1613F] text-white hover:bg-[#A94F31]">
                  {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}