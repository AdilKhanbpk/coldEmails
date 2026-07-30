'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Check, CreditCard, ExternalLink, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import type { Plan } from '@prisma/client';

interface BillingStatus {
  plan: Plan;
  status: string;
  hasSubscription: boolean;
  limits: {
    maxLeads: number;
    maxEmailsPerMonth: number;
    features: string[];
  };
  usage: {
    leads: number;
    emailsThisMonth: number;
  };
}

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  BUSINESS: 'Business',
};

const PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    price: '$0',
    period: '/mo',
    features: ['50 leads', '100 emails/mo', '1 inbox', 'Basic analytics'],
  },
  {
    id: 'STARTER',
    name: 'Starter',
    price: '$29',
    period: '/mo',
    features: ['500 leads', '2,000 emails/mo', '2 inboxes', 'Analytics', 'Meeting booking'],
  },
  {
    id: 'PROFESSIONAL',
    name: 'Professional',
    price: '$99',
    period: '/mo',
    features: ['5,000 leads', '20,000 emails/mo', '5 inboxes', 'Advanced analytics', 'Team workspace'],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    price: '$299',
    period: '/mo',
    features: ['50,000 leads', '100,000 emails/mo', 'Unlimited inboxes', 'Full analytics', 'Priority support'],
  },
];

export function BillingClient() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleUpgrade = async (plan: string) => {
    setUpgrading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to start checkout.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to start checkout.');
    } finally {
      setUpgrading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to open billing portal.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to open billing portal.');
    } finally {
      setPortalLoading(false);
    }
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
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Billing & Subscription</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your plan, view usage, and access invoices.</p>
      </div>

      {/* Current Plan + Usage */}
      {status && (
        <Card className="mb-6 border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-500">Current Plan</p>
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    {PLAN_LABELS[status.plan]}
                  </Badge>
                  <Badge variant="outline" className={
                    status.status === 'ACTIVE'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }>
                    {status.status}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-6">
                  <div>
                    <p className="text-xs text-gray-500">Leads</p>
                    <p className="text-sm font-medium text-gray-900">{status.usage.leads} / {status.limits.maxLeads}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Emails this month</p>
                    <p className="text-sm font-medium text-gray-900">{status.usage.emailsThisMonth} / {status.limits.maxEmailsPerMonth}</p>
                  </div>
                </div>
              </div>
              {status.hasSubscription && (
                <Button variant="outline" onClick={handlePortal} disabled={portalLoading} className="border-gray-200">
                  {portalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                  Manage Subscription
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = status?.plan === plan.id;
          return (
            <Card
              key={plan.id}
              className={`border-gray-200 shadow-sm ${isCurrent ? 'ring-2 ring-blue-500' : ''}`}
            >
              <CardContent className="p-5">
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-900">{plan.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {plan.price}<span className="text-sm font-normal text-gray-500">{plan.period}</span>
                  </p>
                </div>
                <ul className="mb-4 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                      <Check className="h-3.5 w-3.5 text-blue-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full border-gray-200 text-gray-500">
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={upgrading === plan.id}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {upgrading === plan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
                    Upgrade
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        <CreditCard className="mr-1 inline h-3 w-3" />
        Powered by Stripe. Test mode — no real charges will be made.
      </p>
    </div>
  );
}
