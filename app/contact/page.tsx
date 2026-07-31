import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { FadeIn } from '@/components/marketing/fade-in';
import { ContactForm } from './contact-form';
import { Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact — Outreach AI',
  description: 'Get in touch with the Outreach AI team. We respond within one business day.',
};

export default function ContactPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-cream-300">
        <div className="mk-container py-20 sm:py-28">
          <div className="mx-auto max-w-2xl">
            <FadeIn>
              <h1 className="mk-h1">Contact</h1>
            </FadeIn>
            <FadeIn delay={100}>
              <p className="mk-lead mt-6">
                Have a question, a feature request, or just want to talk shop? Send us a message —
                we read every one and respond within one business day.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      <section>
        <div className="mk-container py-20">
          <div className="mx-auto grid max-w-4xl gap-12 md:grid-cols-5">
            <div className="md:col-span-3">
              <FadeIn>
                <ContactForm />
              </FadeIn>
            </div>

            <div className="md:col-span-2">
              <FadeIn delay={100}>
                <div className="rounded-2xl border border-cream-300 bg-cream-50 p-6">
                  <h3 className="mk-h3">Prefer email?</h3>
                  <p className="mk-body mt-2 text-sm">
                    You can reach us directly at{' '}
                    <a
                      href="mailto:hello@outreachai.app"
                      className="mk-link"
                    >
                      hello@outreachai.app
                    </a>
                    .
                  </p>
                  <div className="mt-6 border-t border-cream-300 pt-4">
                    <h4 className="text-sm font-medium text-ink-soft">Response time</h4>
                    <p className="mk-body mt-1 text-sm">
                      We reply to every message within one business day, usually sooner.
                    </p>
                  </div>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
