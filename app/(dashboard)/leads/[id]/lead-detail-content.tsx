'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEdit } from '@/components/inline-edit';
import { StatusBadge, ReplyTagBadge } from '@/components/status-badge';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { InfoTooltip } from '@/components/info-tooltip';
import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ConversationView } from './conversation-view';
import LeadDetailActions from './lead-detail-actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface LeadDetail {
  id: string;
  companyName: string;
  email: string;
  country: string;
  website: string | null;
  services: string[];
  outreachDescription: string | null;
  preferredTime: string;
  timezone: string;
  status: string;
  replyTag: string | null;
  currentStep: number;
  aiEnabled: boolean;
  source: string;
  createdAt: string;
  lastMessageDate: string | null;
  outreachType: { id: string; name: string } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  CSV: 'CSV',
  API: 'API',
  ZOOMINFO: 'ZoomInfo',
  APOLLO: 'Apollo',
};

export function LeadDetailContent({ lead }: { lead: LeadDetail }) {
  const [data, setData] = useState(lead);

  const updateField = async (field: string, value: string) => {
    const res = await fetch(`/api/leads/${data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error('Failed to update');
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const updatePreferredTime = async (value: string) => {
    const res = await fetch(`/api/leads/${data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredTime: value }),
    });
    if (!res.ok) throw new Error('Failed to update');
    setData((prev) => ({ ...prev, preferredTime: value }));
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Breadcrumbs items={[
        { label: 'Leads', href: '/leads' },
        { label: data.companyName },
      ]} />

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            <InlineEdit
              value={data.companyName}
              onSave={(v) => updateField('companyName', v)}
              inputClassName="text-2xl font-semibold"
            />
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              {data.email}
            </span>
            {data.website && (
              <span className="flex items-center gap-1.5">
                <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {data.website}
                </a>
              </span>
            )}
          </div>
        </div>
        <LeadDetailActions leadId={data.id} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge status={data.status} />
        <Badge variant="outline" className="border-gray-200 text-gray-600 font-normal">
          {SOURCE_LABELS[data.source] || data.source}
        </Badge>
        <Badge variant="outline" className="border-gray-200 text-gray-600 font-normal">
          Step {data.currentStep}
        </Badge>
        {data.outreachType && (
          <Badge variant="outline" className="border-gray-200 text-gray-600 font-normal">
            {data.outreachType.name}
          </Badge>
        )}
        <ReplyTagBadge tag={data.replyTag} />
        <StatusBadge status={data.aiEnabled ? 'ACTIVE' : 'STOPPED'} />
      </div>

      <Tabs defaultValue="conversation" className="mt-8">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="conversation" className="data-[state=active]:bg-white">Conversation</TabsTrigger>
          <TabsTrigger value="details" className="data-[state=active]:bg-white">Lead Details</TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-6">
          <ConversationView leadId={data.id} aiEnabled={data.aiEnabled} />
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Company</p>
                  <div className="text-gray-900">
                    <InlineEdit value={data.companyName} onSave={(v) => updateField('companyName', v)} />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="text-gray-900">{data.email}</p>
                </div>
                <div>
                  <p className="text-gray-500">Website</p>
                  <div className="text-gray-900">
                    <InlineEdit value={data.website || ''} onSave={(v) => updateField('website', v)} />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Country</p>
                  <div className="text-gray-900">
                    <InlineEdit value={data.country} onSave={(v) => updateField('country', v)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Outreach Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Outreach type</p>
                  <p className="text-gray-900">{data.outreachType?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Description</p>
                  <div className="text-gray-900">
                    <InlineEdit
                      value={data.outreachDescription || ''}
                      onSave={(v) => updateField('outreachDescription', v)}
                      type="textarea"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Preferred time</p>
                  <div className="text-gray-900">
                    <InlineEdit
                      value={data.preferredTime}
                      onSave={updatePreferredTime}
                      type="datetime-local"
                      display={(v) => format(new Date(v), 'MMM d, yyyy HH:mm')}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 flex items-center gap-1">
                    Timezone
                    <InfoTooltip content="The lead's local timezone. Quiet hours (8pm-8am) are respected based on this setting." />
                  </p>
                  <div className="text-gray-900">
                    <InlineEdit value={data.timezone} onSave={(v) => updateField('timezone', v)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Services</CardTitle>
              </CardHeader>
              <CardContent>
                {data.services.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.services.map((svc) => (
                      <span key={svc} className="rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
                        {svc}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No services listed</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Status Tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Current step</p>
                  <p className="text-gray-900">{data.currentStep}</p>
                </div>
                <div>
                  <p className="text-gray-500">AI enabled</p>
                  <p className="text-gray-900">{data.aiEnabled ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="text-gray-900">{format(new Date(data.createdAt), 'MMM d, yyyy HH:mm')}</p>
                </div>
                {data.lastMessageDate && (
                  <div>
                    <p className="text-gray-500">Last message</p>
                    <p className="text-gray-900">{format(new Date(data.lastMessageDate), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
