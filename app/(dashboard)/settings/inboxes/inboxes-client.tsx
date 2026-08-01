'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Mail, Trash2, Loader2, CheckCircle2, AlertTriangle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useRouter } from 'next/navigation';

interface Inbox {
  id: string;
  provider: string;
  emailAddress: string;
  status: string;
  dailySendingCap: number;
  warmupThrottle: boolean;
  sentToday: number;
  sentDate: string | null;
  createdAt: string;
}

const PROVIDER_LABELS: Record<string, string> = { GMAIL: 'Gmail', OUTLOOK: 'Outlook', SMTP: 'SMTP' };
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  CONNECTED: { label: 'Connected', className: 'border-transparent bg-blue-50 text-blue-700' },
  EXPIRED: { label: 'Expired', className: 'border-transparent bg-amber-50 text-amber-700' },
  ERROR: { label: 'Error', className: 'border-transparent bg-red-50 text-red-700' },
  DISCONNECTED: { label: 'Disconnected', className: 'border-transparent bg-gray-100 text-gray-500' },
};

export function InboxesClient() {
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSMTP, setShowSMTP] = useState(false);
  const [settingsInbox, setSettingsInbox] = useState<Inbox | null>(null);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dailyCap, setDailyCap] = useState(50);
  const [warmup, setWarmup] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [disconnectTarget, setDisconnectTarget] = useState<Inbox | null>(null);
  const router = useRouter();

  const handleConnectGmail = () => {
    window.location.href = '/api/oauth/google';
  };

  const handleConnectOutlook = () => {
    window.location.href = '/api/oauth/microsoft';
  };

  const fetchInboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inboxes');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInboxes(data);
    } catch {
      toast.error('Failed to load inboxes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInboxes();

    // Check for success/error redirect parameters from custom OAuth backend
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    if (success) {
      toast.success('Inbox connected successfully.');
      router.replace('/settings/inboxes');
    } else if (error) {
      toast.error(`Connection failed: ${error}`);
      router.replace('/settings/inboxes');
    }
  }, [fetchInboxes, router]);

  const handleTestSMTP = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/inboxes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_smtp',
          credentials: { host: smtpHost, port: parseInt(smtpPort), username: smtpUsername, password: smtpPassword, secure: smtpSecure },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) toast.success('Connection successful! SMTP settings are valid.');
      else toast.error(data.error || 'Connection failed.');
    } catch { toast.error('Connection test failed.'); }
    finally { setTesting(false); }
  };

  const handleSaveSMTP = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/inboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'SMTP', emailAddress: smtpUsername,
          credentials: { host: smtpHost, port: parseInt(smtpPort), username: smtpUsername, password: smtpPassword, secure: smtpSecure },
        }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Failed to connect inbox.'); setSaving(false); return; }
      toast.success('SMTP inbox connected.');
      setShowSMTP(false);
      setSmtpHost(''); setSmtpPort('587'); setSmtpUsername(''); setSmtpPassword(''); setSmtpSecure(false);
      fetchInboxes();
    } catch { toast.error('Failed to connect inbox.'); }
    finally { setSaving(false); }
  };

  const handleDisconnect = async (inboxId: string) => {
    try {
      const res = await fetch(`/api/inboxes/${inboxId}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('Failed to disconnect inbox.'); return; }
      setInboxes((prev) => prev.filter((i) => i.id !== inboxId));
      toast.success('Inbox disconnected.');
    } catch { toast.error('Failed to disconnect inbox.'); }
  };

  const openSettings = (inbox: Inbox) => {
    setSettingsInbox(inbox);
    setDailyCap(inbox.dailySendingCap);
    setWarmup(inbox.warmupThrottle);
  };

  const handleSaveSettings = async () => {
    if (!settingsInbox) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/inboxes/${settingsInbox.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailySendingCap: dailyCap, warmupThrottle: warmup }),
      });
      if (!res.ok) { toast.error('Failed to save settings.'); setSavingSettings(false); return; }
      toast.success('Inbox settings saved.');
      setSettingsInbox(null);
      fetchInboxes();
    } catch { toast.error('Failed to save settings.'); }
    finally { setSavingSettings(false); }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button variant="outline" className="h-auto flex-col items-start gap-1 border-gray-200 bg-white py-4"
          onClick={handleConnectGmail}>
          <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600" /><span className="font-medium">Connect Gmail</span></div>
          <p className="text-xs text-gray-500">OAuth with Gmail API</p>
        </Button>
        <Button variant="outline" className="h-auto flex-col items-start gap-1 border-gray-200 bg-white py-4"
          onClick={handleConnectOutlook}>
          <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600" /><span className="font-medium">Connect Outlook</span></div>
          <p className="text-xs text-gray-500">Microsoft Graph API</p>
        </Button>
        <Button variant="outline" className="h-auto flex-col items-start gap-1 border-gray-200 bg-white py-4" onClick={() => setShowSMTP(true)}>
          <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-blue-600" /><span className="font-medium">Connect via SMTP</span></div>
          <p className="text-xs text-gray-500">Manual SMTP/IMAP setup</p>
        </Button>
      </div>

      {inboxes.length === 0 ? (
        <Card className="border-gray-200 border-dashed shadow-sm">
          <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50"><Mail className="h-6 w-6 text-blue-600" /></div>
            <h3 className="mt-4 text-base font-semibold text-gray-900">No inboxes connected</h3>
            <p className="mt-1 text-sm text-gray-500">Connect an inbox to start sending outreach emails.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {inboxes.map((inbox) => {
            const status = STATUS_CONFIG[inbox.status] || STATUS_CONFIG.DISCONNECTED;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const sentToday = inbox.sentDate && new Date(inbox.sentDate).getTime() === today.getTime() ? inbox.sentToday : 0;
            const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
            return (
              <Card key={inbox.id} className="border-gray-200 shadow-sm">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50"><Mail className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{inbox.emailAddress}</p>
                        <Badge className={status.className}>{status.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{PROVIDER_LABELS[inbox.provider] || inbox.provider}{inbox.warmupThrottle ? ' · Warmup (20/day)' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right"><p className="text-xs text-gray-500">Sent today</p><p className="text-sm font-medium text-gray-900">{sentToday} / {cap}</p></div>
                    <Button variant="ghost" size="sm" onClick={() => openSettings(inbox)} className="text-gray-500 hover:text-gray-900"><Settings2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDisconnectTarget(inbox)} className="text-gray-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showSMTP} onOpenChange={setShowSMTP}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect via SMTP</DialogTitle><DialogDescription>Enter your SMTP server details. Test the connection before saving.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="smtpHost">SMTP Host</Label><Input id="smtpHost" placeholder="smtp.gmail.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="smtpPort">Port</Label><Input id="smtpPort" placeholder="587" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="smtpSecure">Use TLS/SSL</Label><div className="flex h-10 items-center gap-2"><Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} /><span className="text-sm text-gray-500">{smtpSecure ? 'Yes' : 'No'}</span></div></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="smtpUsername">Username / Email</Label><Input id="smtpUsername" placeholder="you@company.com" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="smtpPassword">Password / App Password</Label><Input id="smtpPassword" type="password" placeholder="••••••••" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSMTP(false)} className="border-gray-200">Cancel</Button>
            <Button variant="outline" onClick={handleTestSMTP} disabled={testing || !smtpHost || !smtpUsername} className="border-gray-200">{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test connection</Button>
            <Button onClick={handleSaveSMTP} disabled={saving || !smtpHost || !smtpUsername || !smtpPassword} className="bg-blue-600 hover:bg-blue-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settingsInbox} onOpenChange={(open) => !open && setSettingsInbox(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inbox Settings</DialogTitle><DialogDescription>Configure sending limits for {settingsInbox?.emailAddress}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="dailyCap">Daily sending cap</Label><Input id="dailyCap" type="number" min={1} value={dailyCap} onChange={(e) => setDailyCap(parseInt(e.target.value) || 50)} /><p className="text-xs text-gray-500">Maximum number of emails to send from this inbox per day.</p></div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div><p className="text-sm font-medium text-gray-900">Warm-up throttle</p><p className="text-sm text-gray-500">Limit to 20/day for the first 2 weeks to protect inbox reputation.</p></div>
              <Switch checked={warmup} onCheckedChange={setWarmup} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsInbox(null)} className="border-gray-200">Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings} className="bg-blue-600 hover:bg-blue-700">{savingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        title="Disconnect inbox?"
        description={`This will disconnect ${disconnectTarget?.emailAddress || 'this inbox'}. Scheduled emails from this inbox will be cancelled. You can reconnect later.`}
        confirmLabel="Disconnect"
        onConfirm={() => disconnectTarget && handleDisconnect(disconnectTarget.id)}
      />
    </>
  );
}
