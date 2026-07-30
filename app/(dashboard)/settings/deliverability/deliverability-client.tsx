'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Shield, Mail, Activity, Send, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

interface DnsResult {
  record: string;
  found: boolean;
  value: string | null;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

interface DomainHealth {
  domain: string;
  spf: DnsResult;
  dkim: DnsResult;
  dmarc: DnsResult;
}

interface InboxHealth {
  id: string;
  emailAddress: string;
  provider: string;
  status: string;
  sentToday: number;
  dailyCap: number;
  utilization: number;
  warmupThrottle: boolean;
}

export function DeliverabilityClient() {
  const [domains, setDomains] = useState<DomainHealth[]>([]);
  const [inboxes, setInboxes] = useState<InboxHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);

  const fetchDeliverability = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/deliverability');
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains || []);
        setInboxes(data.inboxes || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeliverability();
  }, [fetchDeliverability]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/settings/deliverability/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: testEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to send test email.');
        return;
      }
      toast.success('Test email sent. Check the recipient inbox.');
      setTestEmail('');
    } catch {
      toast.error('Failed to send test email.');
    } finally {
      setSending(false);
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'pass') return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === 'warn') return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const statusBadge = (status: string) => {
    if (status === 'pass') return <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Pass</Badge>;
    if (status === 'warn') return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Warning</Badge>;
    return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Fail</Badge>;
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Deliverability & Domain Health</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor your sending reputation, DNS records, and inbox health.</p>
      </div>

      {/* DNS Health per Domain */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium text-gray-900">DNS Records</h2>
        {domains.length === 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-gray-500">
              <Info className="h-5 w-5 text-gray-400" />
              No sending domains found. Connect an inbox to see DNS health checks.
            </CardContent>
          </Card>
        ) : (
          domains.map((dh) => (
            <Card key={dh.domain} className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  {dh.domain}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(['spf', 'dkim', 'dmarc'] as const).map((key) => {
                  const result = dh[key];
                  return (
                    <div key={key} className="flex items-start gap-3 rounded-md border border-gray-100 p-3">
                      {statusIcon(result.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{result.record}</span>
                          {statusBadge(result.status)}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{result.message}</p>
                        {result.value && (
                          <p className="mt-1 truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-400 font-mono">
                            {result.value}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Per-Inbox Health */}
      <div className="mt-8 space-y-4">
        <h2 className="text-sm font-medium text-gray-900">Inbox Health</h2>
        {inboxes.length === 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-gray-500">
              <Mail className="h-5 w-5 text-gray-400" />
              No inboxes connected.
            </CardContent>
          </Card>
        ) : (
          inboxes.map((inbox) => (
            <Card key={inbox.id} className="border-gray-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                      <Mail className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{inbox.emailAddress}</p>
                      <p className="text-xs text-gray-500">{inbox.provider} · {inbox.status}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      inbox.status === 'CONNECTED'
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }
                  >
                    {inbox.status}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Daily volume</span>
                    <span className="text-gray-900">{inbox.sentToday} / {inbox.dailyCap}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        inbox.utilization > 80 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(inbox.utilization, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Activity className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {inbox.warmupThrottle ? 'Warm-up active (capped at 20/day)' : 'No warm-up throttle'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Test Email */}
      <div className="mt-8 space-y-4">
        <h2 className="text-sm font-medium text-gray-900">Send a Test Email</h2>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <form onSubmit={handleSendTest} className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  This sends a real email to confirm SMTP delivery. Full inbox-placement testing
                  (spam/promotions detection) requires a third-party service like Mailtrap or GlockApps.
                </span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="border-gray-200"
                />
                <Button type="submit" disabled={sending || !testEmail.trim()} className="bg-blue-600 hover:bg-blue-700">
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send Test
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
