import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { FadeIn } from '@/components/marketing/fade-in';
import { Mail, MessagesSquare, CalendarClock, ShieldCheck, Sparkles, Inbox, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Outreach AI — Thoughtful AI-assisted email outreach',
  description:
    'Connect your inbox, teach the AI your voice with real example emails, and let it handle personalized sequences, replies, and meeting booking — without sounding like a robot.',
};

const steps = [
  {
    n: '01',
    title: 'Connect your inbox',
    body: 'Link a Gmail, Outlook, or SMTP inbox in seconds. We use secure OAuth — we never store your password.',
  },
  {
    n: '02',
    title: 'Define your outreach style',
    body: 'Paste in a few real emails you\'ve sent. The AI learns your tone, structure, and voice — not a generic template.',
  },
  {
    n: '03',
    title: 'Add your leads',
    body: 'Add leads one by one or import a CSV. Each lead gets a personalized sequence based on the context you provide.',
  },
  {
    n: '04',
    title: 'AI handles the rest',
    body: 'The platform sends each email at the right time, reads replies, and books meetings — pausing when a lead says no.',
  },
];

const features = [
  {
    icon: Sparkles,
    title: 'Sequences learned from your real emails',
    body: 'Instead of filling in templates, you provide example emails you\'re proud of. The AI studies your tone and writes each follow-up in your voice — personalized to the specific lead.',
  },
  {
    icon: MessagesSquare,
    title: 'Automatic reply handling',
    body: 'When a lead replies, the AI reads the message, decides whether to continue the conversation, propose a meeting, or respectfully stop — and drafts the right response.',
  },
  {
    icon: CalendarClock,
    title: 'Meeting booking built in',
    body: 'If a lead wants to meet, the AI checks your calendar availability, proposes times, and creates the event — so conversations don\'t stall at the scheduling step.',
  },
  {
    icon: ShieldCheck,
    title: 'Deliverability that respects the inbox',
    body: 'Per-inbox sending caps, warm-up throttles, and quiet-hours scheduling keep your deliverability healthy. We treat your leads\' inboxes the way we\'d want ours treated.',
  },
  {
    icon: Inbox,
    title: 'Multi-inbox support',
    body: 'Connect several inboxes and let the platform rotate across them automatically, balancing volume so no single sender gets flagged.',
  },
  {
    icon: Mail,
    title: 'Open and click tracking',
    body: 'See which emails were opened, which links were clicked, and which leads are warming up — without guessing.',
  },
];

const audiences = [
  {
    title: 'Sales teams',
    body: 'Reach more prospects with personalized sequences while keeping reply quality high enough to book real meetings.',
  },
  {
    title: 'Agencies',
    body: 'Manage outreach for multiple clients from one workspace, each with their own inbox, voice, and campaign style.',
  },
  {
    title: 'Founders',
    body: 'Run thoughtful outbound while you focus on building. The AI sounds like you wrote each email yourself — because it learned from the ones you did.',
  },
];

export default function HomePage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mk-container py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <FadeIn>
              <h1 className="mk-h1">
                Outreach that sounds like you wrote it — because it learned from the emails you did.
              </h1>
            </FadeIn>
            <FadeIn delay={100}>
              <p className="mk-lead mx-auto mt-6 max-w-2xl">
                Connect your inbox, teach the AI your voice with a few real emails, and let it handle
                personalized sequences, replies, and meeting booking.
              </p>
            </FadeIn>
            <FadeIn delay={200}>
              <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <a href="/signup" className="mk-btn-primary">
                  Start Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
                <a href="/about" className="mk-btn-ghost">
                  How it works
                </a>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-cream-300 bg-cream-50">
        <div className="mk-container py-20 sm:py-24">
          <FadeIn>
            <h2 className="mk-h2 text-center">How it works</h2>
            <p className="mk-body mx-auto mt-4 max-w-xl text-center">
              Four steps from connected inbox to running campaign. No templates to fill in, no scripts to write.
            </p>
          </FadeIn>
          <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <FadeIn key={step.n} delay={i * 80}>
                <div>
                  <span
                    className="text-sm font-medium text-clay-400"
                    style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
                  >
                    {step.n}
                  </span>
                  <h3 className="mk-h3 mt-2">{step.title}</h3>
                  <p className="mk-body mt-2 text-sm">{step.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-cream-300">
        <div className="mk-container py-20 sm:py-24">
          <FadeIn>
            <h2 className="mk-h2">Built for outreach that doesn&apos;t feel like spam</h2>
            <p className="mk-body mt-4 max-w-2xl">
              Every feature is designed around one idea: the email your lead receives should be one
              you&apos;d be comfortable sending yourself.
            </p>
          </FadeIn>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <FadeIn key={feature.title} delay={i * 60}>
                  <div className="mk-card h-full">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-clay-50 text-clay-400">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <h3 className="mk-h3 mt-4">{feature.title}</h3>
                    <p className="mk-body mt-2 text-sm">{feature.body}</p>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-t border-cream-300 bg-cream-50">
        <div className="mk-container py-20 sm:py-24">
          <FadeIn>
            <h2 className="mk-h2 text-center">Who it&apos;s for</h2>
            <p className="mk-body mx-auto mt-4 max-w-xl text-center">
              Built for people who need to reach many prospects but care about how each email reads.
            </p>
          </FadeIn>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {audiences.map((aud, i) => (
              <FadeIn key={aud.title} delay={i * 80}>
                <div className="mk-card h-full text-center">
                  <h3 className="mk-h3">{aud.title}</h3>
                  <p className="mk-body mt-3 text-sm">{aud.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Placeholder: real customer testimonials / logos go here when available.
              Do NOT fabricate quotes or company names. */}
          <FadeIn>
            <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-dashed border-cream-400 bg-cream-100 px-8 py-10 text-center">
              <p className="text-sm text-ink-muted">
                Customer stories and case studies will appear here once we have them.
                We don&apos;t believe in inventing testimonials.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-cream-300">
        <div className="mk-container py-20 sm:py-28">
          <FadeIn>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="mk-h2">Start your first campaign in minutes</h2>
              <p className="mk-lead mt-4">
                Connect an inbox, paste a few example emails, and add your first lead. That&apos;s it.
              </p>
              <div className="mt-8">
                <a href="/signup" className="mk-btn-primary">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
    </MarketingLayout>
  );
}
