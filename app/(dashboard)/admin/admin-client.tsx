'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, AlertTriangle, Activity, Users, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface FailedJob {
  id: string;
  type: string;
  status: string;
  attempts: number;
  createdAt: string;
  lead: { companyName: string; email: string } | null;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  status: string;
  createdAt: string;
}

interface AdminStats {
  scheduled: number;
  running: number;
  failed: number;
  completed: number;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  BUSINESS: 'Business',
};

export function AdminClient() {
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAdmin = useCallback(async () => {
    try {
      const res = await fetch('/api/admin');
      if (res.ok) {
        const data = await res.json();
        setFailedJobs(data.failedJobs || []);
        setUsers(data.users || []);
        setStats(data.stats);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmin();
  }, [fetchAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">System overview, user management, and error logs.</p>
      </div>

      {/* System Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <p className="text-xs text-gray-500">Scheduled</p>
              </div>
              <p className="mt-1 text-xl font-semibold text-gray-900">{stats.scheduled}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-gray-500">Running</p>
              </div>
              <p className="mt-1 text-xl font-semibold text-gray-900">{stats.running}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <p className="text-xs text-gray-500">Failed</p>
              </div>
              <p className="mt-1 text-xl font-semibold text-gray-900">{stats.failed}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <p className="text-xs text-gray-500">Completed</p>
              </div>
              <p className="mt-1 text-xl font-semibold text-gray-900">{stats.completed}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
                    {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-gray-200 text-gray-600 font-normal">
                    {ROLE_LABELS[user.role] || user.role}
                  </Badge>
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 font-normal">
                    {PLAN_LABELS[user.plan] || user.plan}
                  </Badge>
                  <Badge variant="outline" className={
                    user.status === 'ACTIVE'
                      ? 'border-green-200 bg-green-50 text-green-700 font-normal'
                      : 'border-gray-200 text-gray-500 font-normal'
                  }>
                    {user.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Failed Jobs */}
      <Card className="mt-6 border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Failed Jobs ({failedJobs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {failedJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No failed jobs. All systems running.</p>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-2">
                {failedJobs.map((job) => (
                  <div key={job.id} className="flex items-start gap-3 rounded-md border border-gray-100 px-3 py-2 text-sm">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    <div className="flex-1">
                      <p className="text-gray-700">
                        <span className="font-medium">{job.type}</span>
                        {job.lead && <span className="text-gray-500"> · {job.lead.companyName} ({job.lead.email})</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {job.attempts} attempt(s) · {format(new Date(job.createdAt), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
