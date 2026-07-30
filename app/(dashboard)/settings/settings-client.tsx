'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, X, Loader2, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { InboxesClient } from './inboxes/inboxes-client';

interface SettingsClientProps {
  user: {
    name: string;
    email: string;
    businessName: string;
    businessDescription: string;
    services: string[];
    aiPaused: boolean;
  };
  inboxCount: number;
}

export function SettingsClient({ user, inboxCount }: SettingsClientProps) {
  // Business profile state
  const [businessName, setBusinessName] = useState(user.businessName);
  const [businessDescription, setBusinessDescription] = useState(user.businessDescription);
  const [services, setServices] = useState<string[]>(user.services);
  const [serviceInput, setServiceInput] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // AI pause state
  const [aiPaused, setAiPaused] = useState(user.aiPaused);
  const [aiPauseLoading, setAiPauseLoading] = useState(false);

  // Account state
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const addService = () => {
    const trimmed = serviceInput.trim();
    if (!trimmed || services.includes(trimmed)) {
      setServiceInput('');
      return;
    }
    setServices([...services, trimmed]);
    setServiceInput('');
  };

  const removeService = (svc: string) => {
    setServices(services.filter((s) => s !== svc));
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || !businessDescription.trim() || services.length === 0) {
      toast.error('All fields are required.');
      return;
    }
    setProfileLoading(true);
    try {
      const res = await fetch('/api/settings/business-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessDescription: businessDescription.trim(),
          services,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save.');
        return;
      }
      toast.success('Business profile updated.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAccountSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    setAccountLoading(true);
    try {
      const res = await fetch('/api/settings/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save.');
        return;
      }
      toast.success('Account details updated.');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setAccountLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to change password.');
        return;
      }
      toast.success('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your business profile and account preferences.
        </p>
      </div>

      <Tabs defaultValue="business">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="business" className="data-[state=active]:bg-white">
            Business Profile
          </TabsTrigger>
          <TabsTrigger value="inboxes" className="data-[state=active]:bg-white">
            Inboxes {inboxCount > 0 && <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{inboxCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="ai" className="data-[state=active]:bg-white">
            AI Controls
          </TabsTrigger>
          <TabsTrigger value="account" className="data-[state=active]:bg-white">
            Account
          </TabsTrigger>
        </TabsList>

        {/* Business Profile Tab */}
        <TabsContent value="business" className="mt-6">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Business Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSave} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="businessName">Business name</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="businessDescription">Business description</Label>
                  <Textarea
                    id="businessDescription"
                    rows={4}
                    value={businessDescription}
                    onChange={(e) => setBusinessDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="serviceInput">Services offered</Label>
                  <div className="flex gap-2">
                    <Input
                      id="serviceInput"
                      placeholder="Add a service"
                      value={serviceInput}
                      onChange={(e) => setServiceInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addService();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addService} className="border-gray-200">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {services.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {services.map((svc) => (
                        <span
                          key={svc}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                        >
                          {svc}
                          <button
                            type="button"
                            onClick={() => removeService(svc)}
                            className="text-blue-400 hover:text-blue-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={profileLoading} className="bg-blue-600 hover:bg-blue-700">
                  {profileLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inboxes Tab */}
        <TabsContent value="inboxes" className="mt-6">
          <div className="mb-4">
            <p className="text-sm text-gray-500">Connect your email accounts to send outreach. All credentials are encrypted at rest.</p>
          </div>
          <InboxesClient />
        </TabsContent>

        {/* AI Controls Tab */}
        <TabsContent value="ai" className="mt-6">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Global AI Pause</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {aiPaused ? 'AI is paused for all conversations' : 'AI is active for all conversations'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    When paused, the AI worker will not generate or send any emails across all leads. Individual leads can still be controlled separately from their conversation view.
                  </p>
                </div>
                <Button
                  variant={aiPaused ? 'default' : 'outline'}
                  size="sm"
                  disabled={aiPauseLoading}
                  onClick={async () => {
                    setAiPauseLoading(true);
                    try {
                      const res = await fetch('/api/settings/ai-pause', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ aiPaused: !aiPaused }),
                      });
                      if (!res.ok) {
                        toast.error('Failed to update AI setting.');
                        return;
                      }
                      setAiPaused(!aiPaused);
                      toast.success(aiPaused ? 'AI resumed for all conversations.' : 'AI paused for all conversations.');
                    } catch {
                      toast.error('Something went wrong.');
                    } finally {
                      setAiPauseLoading(false);
                    }
                  }}
                  className={aiPaused ? 'bg-blue-600 hover:bg-blue-700' : 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700'}
                >
                  {aiPauseLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {aiPaused ? 'Resume AI' : 'Pause All AI'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="mt-6 space-y-6">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Account Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAccountSave} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled
                  />
                  <p className="text-xs text-gray-400">Email cannot be changed.</p>
                </div>

                <Button type="submit" disabled={accountLoading} className="bg-blue-600 hover:bg-blue-700">
                  {accountLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Save account
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Change Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmNewPassword">Confirm new password</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" disabled={passwordLoading} className="bg-blue-600 hover:bg-blue-700">
                  {passwordLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}