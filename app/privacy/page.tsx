import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { FadeIn } from '@/components/marketing/fade-in';

export const metadata: Metadata = {
  title: 'Privacy Policy — Outreach AI',
  description:
    'How Outreach AI collects, uses, and protects your data, including email provider access, AI processing, and your rights.',
};

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'data-we-collect', label: 'Data We Collect' },
  { id: 'how-we-use', label: 'How We Use Your Data' },
  { id: 'third-parties', label: 'Third-Party Services' },
  { id: 'ai-processing', label: 'AI Processing' },
  { id: 'data-retention', label: 'Data Retention' },
  { id: 'data-security', label: 'Data Security' },
  { id: 'your-rights', label: 'Your Rights' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'children', label: "Children's Privacy" },
  { id: 'changes', label: 'Changes to This Policy' },
  { id: 'contact', label: 'Contact Us' },
];

/* NOTE: This privacy policy is provided as a sensible template for a B2B SaaS
   handling business email data and AI processing. It is not legal advice.
   Have a qualified lawyer review and adapt it before real launch. */

export default function PrivacyPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-cream-300">
        <div className="mk-container py-16 sm:py-20">
          <FadeIn>
            <p className="text-sm text-ink-muted">Last updated: July 31, 2026</p>
            <h1 className="mk-h1 mt-2">Privacy Policy</h1>
            <p className="mk-lead mt-4 max-w-2xl">
              This policy explains what data we collect, how we use it, and the choices you have.
              We aim to be straightforward — no buried surprises.
            </p>
          </FadeIn>
        </div>
      </section>

      <section>
        <div className="mk-container py-16">
          <div className="grid gap-12 lg:grid-cols-4">
            {/* Table of contents */}
            <aside className="lg:col-span-1">
              <div className="sticky top-24">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Contents
                </h2>
                <nav className="mt-4 space-y-1.5">
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="block text-sm text-ink-soft transition-colors hover:text-clay-500"
                    >
                      {s.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <div className="mk-prose lg:col-span-3">
              <FadeIn>
                <h2 id="overview" className="mk-h3 scroll-mt-24">Overview</h2>
                <p className="mk-body mt-3">
                  Outreach AI (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) provides an AI-assisted email
                  outreach platform. This Privacy Policy describes how we collect, use, and protect
                  your information when you use our service. By using Outreach AI, you agree to the
                  practices described here.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="data-we-collect" className="mk-h3 mt-10 scroll-mt-24">Data We Collect</h2>
                <p className="mk-body mt-3">We collect the following categories of data:</p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>
                    <strong className="text-ink">Account information:</strong> Your name, email
                    address, and hashed password when you sign up.
                  </li>
                  <li>
                    <strong className="text-ink">Business profile:</strong> Your business name,
                    description, and services — which you provide to help the AI write in your
                    voice.
                  </li>
                  <li>
                    <strong className="text-ink">Lead data:</strong> Information about prospects
                    you add — company name, email address, country, services, and outreach context.
                  </li>
                  <li>
                    <strong className="text-ink">Email content:</strong> Example emails you provide
                    for AI training, sent and received messages, and email metadata (subject lines,
                    timestamps, open/click events).
                  </li>
                  <li>
                    <strong className="text-ink">Inbox credentials:</strong> OAuth tokens for
                    connected Gmail or Outlook accounts. We never store your password — only
                    encrypted access tokens.
                  </li>
                  <li>
                    <strong className="text-ink">Usage data:</strong> Log-in times, feature usage
                    patterns, and error logs used to maintain and improve the service.
                  </li>
                </ul>
              </FadeIn>

              <FadeIn>
                <h2 id="how-we-use" className="mk-h3 mt-10 scroll-mt-24">How We Use Your Data</h2>
                <p className="mk-body mt-3">We use your data to:</p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>Operate the platform — sending emails, tracking replies, and booking meetings on your behalf.</li>
                  <li>Generate AI-personalized email content based on your example emails and lead context.</li>
                  <li>Provide analytics on your outreach performance (open rates, reply rates, meeting counts).</li>
                  <li>Maintain deliverability through sending caps, quiet hours, and inbox rotation.</li>
                  <li>Process payments and manage your subscription via our payment provider, Stripe.</li>
                  <li>Send you service notifications (e.g., inbox disconnection, failed sends).</li>
                  <li>Improve our AI models and product features over time.</li>
                </ul>
                <p className="mk-body mt-3">
                  We do not sell your data to third parties. We do not use your lead data to train
                  models for other customers.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="third-parties" className="mk-h3 mt-10 scroll-mt-24">Third-Party Services</h2>
                <p className="mk-body mt-3">
                  We rely on the following third-party services to operate the platform:
                </p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>
                    <strong className="text-ink">Google (Gmail API):</strong> To send and read
                    emails when you connect a Gmail inbox. Access is granted via OAuth and limited
                    to the scopes you approve.
                  </li>
                  <li>
                    <strong className="text-ink">Microsoft (Graph API):</strong> To send and read
                    emails when you connect an Outlook inbox, also via OAuth.
                  </li>
                  <li>
                    <strong className="text-ink">Stripe:</strong> For subscription billing and
                    payment processing. We do not store your card details — Stripe does.
                  </li>
                  <li>
                    <strong className="text-ink">AI provider(s):</strong> We use a large language
                    model provider to generate email content. Your example emails and lead context
                    are sent to this provider for generation and not retained for their training
                    purposes beyond what their policies describe.
                  </li>
                  <li>
                    <strong className="text-ink">MongoDB:</strong> Our database provider, where
                    your account, lead, and message data is stored.
                  </li>
                </ul>
                <p className="mk-body mt-3">
                  Each provider has its own privacy policy governing how they handle data. We
                  encourage you to review them.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="ai-processing" className="mk-h3 mt-10 scroll-mt-24">AI Processing</h2>
                <p className="mk-body mt-3">
                  Outreach AI uses a large language model to draft personalized emails and decide
                  how to handle replies. To do this, we send the following to our AI provider:
                </p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>Your business name, description, and services.</li>
                  <li>The example emails you provide as style references.</li>
                  <li>Lead-specific context (company name, country, services, outreach description).</li>
                  <li>Recent message history in a conversation, so the AI can draft contextual replies.</li>
                </ul>
                <p className="mk-body mt-3">
                  The AI does not invent facts. When it lacks information (pricing, availability,
                  specific details), it says so and flags the message for your follow-up. You can
                  pause AI sending at any time — per lead or globally — from your dashboard.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="data-retention" className="mk-h3 mt-10 scroll-mt-24">Data Retention</h2>
                <p className="mk-body mt-3">
                  We retain your data for as long as your account is active. If you delete your
                  account, we remove your personal data, leads, and messages within 30 days. Email
                  provider OAuth tokens are revoked immediately upon disconnection.
                </p>
                <p className="mk-body mt-3">
                  We may retain aggregated, de-identified usage data after account deletion for
                  product improvement purposes. This data cannot be traced back to you.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="data-security" className="mk-h3 mt-10 scroll-mt-24">Data Security</h2>
                <p className="mk-body mt-3">
                  We take reasonable measures to protect your data, including:
                </p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>Encrypting OAuth tokens and credentials at rest using industry-standard encryption.</li>
                  <li>Using HTTPS for all data in transit.</li>
                  <li>Restricting database access to authenticated, authorized application code.</li>
                  <li>Row-level security policies on our database to ensure users can only access their own data.</li>
                </ul>
                <p className="mk-body mt-3">
                  No system is perfectly secure. If we become aware of a data breach affecting your
                  information, we will notify you promptly and in accordance with applicable law.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="your-rights" className="mk-h3 mt-10 scroll-mt-24">Your Rights</h2>
                <p className="mk-body mt-3">Depending on your jurisdiction, you may have the right to:</p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>Access the personal data we hold about you.</li>
                  <li>Correct inaccurate personal data.</li>
                  <li>Request deletion of your personal data and account.</li>
                  <li>Export your data in a portable format.</li>
                  <li>Withdraw consent for data processing at any time.</li>
                  <li>Object to or restrict certain types of processing.</li>
                </ul>
                <p className="mk-body mt-3">
                  To exercise any of these rights, contact us at{' '}
                  <a href="mailto:privacy@outreachai.app" className="mk-link">
                    privacy@outreachai.app
                  </a>
                  . We will respond within 30 days.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="cookies" className="mk-h3 mt-10 scroll-mt-24">Cookies</h2>
                <p className="mk-body mt-3">
                  We use essential cookies to maintain your session and authenticate you. We do not
                  use third-party advertising or tracking cookies. Analytics, if enabled, uses
                  first-party, privacy-preserving measurement only.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="children" className="mk-h3 mt-10 scroll-mt-24">Children&apos;s Privacy</h2>
                <p className="mk-body mt-3">
                  Outreach AI is a B2B tool intended for business use. We do not knowingly collect
                  data from anyone under 16. If you believe we have collected data from a minor,
                  please contact us and we will remove it.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="changes" className="mk-h3 mt-10 scroll-mt-24">Changes to This Policy</h2>
                <p className="mk-body mt-3">
                  We may update this policy from time to time. When we do, we will revise the
                  &quot;Last updated&quot; date at the top of this page. For material changes, we will
                  notify you via email or an in-app notification before the change takes effect.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="contact" className="mk-h3 mt-10 scroll-mt-24">Contact Us</h2>
                <p className="mk-body mt-3">
                  If you have any questions about this Privacy Policy or how we handle your data,
                  please contact us at{' '}
                  <a href="mailto:privacy@outreachai.app" className="mk-link">
                    privacy@outreachai.app
                  </a>
                  .
                </p>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
