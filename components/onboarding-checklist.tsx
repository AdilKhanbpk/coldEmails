'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, Mail, ListChecks, Users, Rocket } from 'lucide-react';
import Link from 'next/link';

interface ChecklistStep {
  id: string;
  label: string;
  href: string;
  cta: string;
  done: boolean;
  icon: typeof Mail;
}

export function OnboardingChecklist({
  steps: initialSteps,
}: {
  steps: Omit<ChecklistStep, 'icon'>[];
}) {
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('onboarding-dismissed');
    if (stored === 'true') setDismissed(true);
    setLoaded(true);
  }, []);

  const allDone = initialSteps.every((s) => s.done);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('onboarding-dismissed', 'true');
  };

  if (!loaded || dismissed || allDone) return null;

  const icons: Record<string, typeof Mail> = {
    inbox: Mail,
    outreach: ListChecks,
    leads: Users,
    campaign: Rocket,
  };

  return (
    <Card className="mb-6 border-gray-200 shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Getting Started</h3>
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          {initialSteps.map((step) => {
            const Icon = icons[step.id] || Check;
            return (
              <div key={step.id} className="flex items-center gap-3 rounded-md border border-gray-100 px-3 py-2.5">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-green-50' : 'bg-gray-100'}`}>
                  {step.done ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                  )}
                </div>
                <span className={`flex-1 text-sm ${step.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {step.label}
                </span>
                {!step.done && (
                  <Link href={step.href}>
                    <Button variant="outline" size="sm" className="h-7 border-gray-200 text-xs">
                      {step.cta}
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
