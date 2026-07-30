'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Loader2, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function BusinessProfileForm() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [serviceInput, setServiceInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const addService = () => {
    const trimmed = serviceInput.trim();
    if (!trimmed) return;
    if (services.includes(trimmed)) {
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
    if (!businessName.trim()) errs.businessName = 'Business name is required.';
    if (!businessDescription.trim())
      errs.businessDescription = 'Business description is required.';
    if (services.length === 0) errs.services = 'Add at least one service you offer.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const res = await fetch('/api/onboarding/business-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessDescription: businessDescription.trim(),
          services,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save. Please try again.');
        setLoading(false);
        return;
      }

      toast.success('Business profile saved!');
      router.push('/dashboard');
      router.refresh();
    } catch {
      toast.error('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Outreach AI</span>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Tell us about your business</CardTitle>
            <CardDescription>
              This information will be used to personalize your AI-generated outreach.
              You can edit it later from Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  placeholder="Acme Inc."
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
                {errors.businessName && (
                  <p className="text-xs text-red-600">{errors.businessName}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="businessDescription">Business description</Label>
                <Textarea
                  id="businessDescription"
                  placeholder="Describe what your business does, who you serve, and what makes you unique."
                  rows={4}
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                />
                {errors.businessDescription && (
                  <p className="text-xs text-red-600">{errors.businessDescription}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="serviceInput">Services offered</Label>
                <p className="text-sm text-gray-500">
                  Add the services or products you offer. These help the AI tailor outreach.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="serviceInput"
                    placeholder="e.g. Web design, SEO consulting"
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
                {errors.services && (
                  <p className="text-xs text-red-600">{errors.services}</p>
                )}
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

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save and continue'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
