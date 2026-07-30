'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { COMMON_TIMEZONES } from '@/lib/timezones';
import { format } from 'date-fns';

interface OutreachTypeOption {
  id: string;
  name: string;
}

interface LeadEditFormProps {
  lead: {
    id: string;
    companyName: string;
    email: string;
    services: string[];
    country: string;
    website: string;
    outreachTypeId: string;
    outreachDescription: string;
    preferredTime: string;
    timezone: string;
  };
  outreachTypes: OutreachTypeOption[];
}

export function LeadEditForm({ lead, outreachTypes }: LeadEditFormProps) {
  const router = useRouter();

  const [companyName, setCompanyName] = useState(lead.companyName);
  const [email, setEmail] = useState(lead.email);
  const [services, setServices] = useState<string[]>(lead.services);
  const [serviceInput, setServiceInput] = useState('');
  const [country, setCountry] = useState(lead.country);
  const [website, setWebsite] = useState(lead.website);
  const [outreachTypeId, setOutreachTypeId] = useState(lead.outreachTypeId);
  const [outreachDescription, setOutreachDescription] = useState(lead.outreachDescription);
  const [preferredTime, setPreferredTime] = useState(
    format(new Date(lead.preferredTime), "yyyy-MM-dd'T'HH:mm"),
  );
  const [timezone, setTimezone] = useState(lead.timezone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!companyName.trim()) errs.companyName = 'Company name is required.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'A valid email is required.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          email: email.trim().toLowerCase(),
          services,
          country: country.trim(),
          website: website.trim(),
          outreachTypeId: outreachTypeId || null,
          outreachDescription: outreachDescription.trim(),
          preferredTime: new Date(preferredTime).toISOString(),
          timezone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to update lead.');
        setLoading(false);
        return;
      }

      toast.success('Lead updated.');
      router.push(`/leads/${lead.id}`);
      router.refresh();
    } catch {
      toast.error('Something went wrong.');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <Link
          href={`/leads/${lead.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lead
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">Edit Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company name *</Label>
              <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              {errors.companyName && <p className="text-xs text-red-600">{errors.companyName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
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
              <div className="flex flex-wrap gap-2">
                {services.map((svc) => (
                  <span key={svc} className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700">
                    {svc}
                    <button type="button" onClick={() => removeService(svc)} className="text-blue-400 hover:text-blue-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Outreach Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="outreachTypeId">Outreach type</Label>
              <Select value={outreachTypeId || '_none'} onValueChange={(v) => setOutreachTypeId(v === '_none' ? '' : v)}>
                <SelectTrigger id="outreachTypeId" className="border-gray-200">
                  <SelectValue placeholder="Select an outreach type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {outreachTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outreachDescription">Outreach description</Label>
              <Textarea
                id="outreachDescription"
                rows={4}
                value={outreachDescription}
                onChange={(e) => setOutreachDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="preferredTime">Preferred time</Label>
                <Input id="preferredTime" type="datetime-local" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone" className="border-gray-200">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href={`/leads/${lead.id}`}>
            <Button type="button" variant="outline" className="border-gray-200">Cancel</Button>
          </Link>
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
