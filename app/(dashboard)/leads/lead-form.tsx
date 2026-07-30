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
import { COMMON_TIMEZONES, detectBrowserTimezone } from '@/lib/timezones';

interface OutreachTypeOption {
  id: string;
  name: string;
}

export function LeadForm({ outreachTypes }: { outreachTypes: OutreachTypeOption[] }) {
  const router = useRouter();
  const detectedTz = detectBrowserTimezone();

  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [serviceInput, setServiceInput] = useState('');
  const [country, setCountry] = useState('');
  const [website, setWebsite] = useState('');
  const [outreachTypeId, setOutreachTypeId] = useState('');
  const [outreachDescription, setOutreachDescription] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [timezone, setTimezone] = useState(detectedTz);
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

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!companyName.trim()) errs.companyName = 'Company name is required.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Invalid email format.';
    if (!country.trim()) errs.country = 'Country is required.';
    if (!outreachDescription.trim()) errs.outreachDescription = 'Outreach description is required.';
    if (!outreachTypeId) errs.outreachTypeId = 'Please select an outreach type.';
    if (!preferredTime) errs.preferredTime = 'Preferred time is required.';
    if (!timezone) errs.timezone = 'Timezone is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          email: email.trim().toLowerCase(),
          services,
          country: country.trim(),
          website: website.trim(),
          outreachTypeId,
          outreachDescription: outreachDescription.trim(),
          preferredTime,
          timezone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.field) {
          setErrors({ [data.field]: data.error });
        } else {
          toast.error(data.error || 'Failed to create lead.');
        }
        setLoading(false);
        return;
      }

      toast.success('Lead created successfully.');
      router.push('/leads');
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
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">Add Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">Company name *</Label>
              <Input
                id="companyName"
                placeholder="Acme Corp"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              {errors.companyName && <p className="text-xs text-red-600">{errors.companyName}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="contact@acmecorp.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                placeholder="United States"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
              {errors.country && <p className="text-xs text-red-600">{errors.country}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://acmecorp.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
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
                  <span
                    key={svc}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
                  >
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
              <Label htmlFor="outreachTypeId">Outreach type *</Label>
              <Select value={outreachTypeId} onValueChange={setOutreachTypeId}>
                <SelectTrigger id="outreachTypeId" className="border-gray-200">
                  <SelectValue placeholder="Select an outreach type" />
                </SelectTrigger>
                <SelectContent>
                  {outreachTypes.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No active outreach types available
                    </SelectItem>
                  ) : (
                    outreachTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.outreachTypeId && <p className="text-xs text-red-600">{errors.outreachTypeId}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="outreachDescription">Outreach description *</Label>
              <Textarea
                id="outreachDescription"
                placeholder="Describe the context and goals for this lead's outreach..."
                rows={4}
                value={outreachDescription}
                onChange={(e) => setOutreachDescription(e.target.value)}
              />
              {errors.outreachDescription && <p className="text-xs text-red-600">{errors.outreachDescription}</p>}
            </div>

            {/* TODO (stage 3): preferredTime will be used to schedule the first
                sequence step job. When a lead is created with an outreach type,
                a Job row will be created with runAt = preferredTime. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="preferredTime">Preferred time *</Label>
                <Input
                  id="preferredTime"
                  type="datetime-local"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                />
                {errors.preferredTime && <p className="text-xs text-red-600">{errors.preferredTime}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone *</Label>
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
                {errors.timezone && <p className="text-xs text-red-600">{errors.timezone}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/leads">
            <Button type="button" variant="outline" className="border-gray-200">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create lead
          </Button>
        </div>
      </form>
    </div>
  );
}
