import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { FadeIn } from '@/components/marketing/fade-in';

export const metadata: Metadata = {
  title: 'Terms of Service — Outreach AI',
  description:
    'The terms governing your use of Outreach AI, including account responsibilities, acceptable use, payment terms, and liability.',
};

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Your Account' },
  { id: 'acceptable-use', label: 'Acceptable Use' },
  { id: 'outreach-compliance', label: 'Outreach Compliance' },
  { id: 'payment', label: 'Payment & Subscriptions' },
  { id: 'ai-content', label: 'AI-Generated Content' },
  { id: 'intellectual-property', label: 'Intellectual Property' },
  { id: 'termination', label: 'Termination' },
  { id: 'disclaimer', label: 'Disclaimer' },
  { id: 'liability', label: 'Limitation of Liability' },
  { id: 'governing-law', label: 'Governing Law' },
  { id: 'changes', label: 'Changes to These Terms' },
  { id: 'contact', label: 'Contact' },
];

/* NOTE: These Terms of Service are provided as a sensible template for a B2B SaaS
   email outreach tool. They are not legal advice. Have a qualified lawyer review
   and adapt them — particularly the acceptable-use, liability, and governing-law
   sections — before real launch. */

export default function TermsPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-cream-300">
        <div className="mk-container py-16 sm:py-20">
          <FadeIn>
            <p className="text-sm text-ink-muted">Last updated: July 31, 2026</p>
            <h1 className="mk-h1 mt-2">Terms of Service</h1>
            <p className="mk-lead mt-4 max-w-2xl">
              These terms govern your use of Outreach AI. Please read them carefully — they define
              what we owe each other when you use the platform.
            </p>
          </FadeIn>
        </div>
      </section>

      <section>
        <div className="mk-container py-16">
          <div className="grid gap-12 lg:grid-cols-4">
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

            <div className="mk-prose lg:col-span-3">
              <FadeIn>
                <h2 id="overview" className="mk-h3 scroll-mt-24">Overview</h2>
                <p className="mk-body mt-3">
                  These Terms of Service (&quot;Terms&quot;) govern your access to and use of the
                  Outreach AI platform, website, and services (collectively, the
                  &quot;Service&quot;). By creating an account or using the Service, you agree to be
                  bound by these Terms. If you are using the Service on behalf of a company, you
                  represent that you have authority to bind that company.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="accounts" className="mk-h3 mt-10 scroll-mt-24">Your Account</h2>
                <p className="mk-body mt-3">
                  You must provide accurate and complete information when creating your account and
                  keep it up to date. You are responsible for safeguarding your password and for
                  all activity that occurs under your account. If you become aware of any
                  unauthorized use, notify us immediately.
                </p>
                <p className="mk-body mt-3">
                  You must be at least 16 years old to use the Service. One person or entity may
                  maintain only one free account. Team members invited to your workspace share your
                  subscription.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="acceptable-use" className="mk-h3 mt-10 scroll-mt-24">Acceptable Use</h2>
                <p className="mk-body mt-3">You agree not to use the Service to:</p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>Send unsolicited commercial email (spam) to recipients who have not consented or who have opted out.</li>
                  <li>Violate any applicable law, including CAN-SPAM, GDPR, CCPA, or other email and data protection regulations.</li>
                  <li>Send content that is illegal, deceptive, threatening, harassing, defamatory, or infringes on intellectual property.</li>
                  <li>Impersonate another person or entity, or misrepresent your affiliation.</li>
                  <li>Distribute malware, viruses, or other malicious code.</li>
                  <li>Attempt to access, disrupt, or reverse-engineer parts of the Service you are not authorized to access.</li>
                  <li>Use the Service to send email to purchased or scraped lists without verified consent.</li>
                  <li>Resell or sublicense access to the Service without our written permission.</li>
                </ul>
                <p className="mk-body mt-3">
                  Violation of these terms may result in immediate suspension or termination of your
                  account, without refund.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="outreach-compliance" className="mk-h3 mt-10 scroll-mt-24">Outreach Compliance</h2>
                <p className="mk-body mt-3">
                  Because Outreach AI is an email tool, you bear responsibility for ensuring your
                  outreach complies with applicable laws. Specifically:
                </p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>
                    <strong className="text-ink">CAN-SPAM Act (US):</strong> All commercial emails
                    must include a valid physical address and an opt-out mechanism. The Service
                    helps you include these, but compliance is ultimately your responsibility.
                  </li>
                  <li>
                    <strong className="text-ink">GDPR (EU):</strong> You must have a lawful basis
                    for contacting EU recipients and must honor opt-out requests promptly. The
                    Service processes opt-outs automatically when leads are marked
                    &quot;UNSUBSCRIBED.&quot;
                  </li>
                  <li>
                    <strong className="text-ink">Other jurisdictions:</strong> You are responsible
                    for knowing and following the email regulations in every region you contact.
                  </li>
                </ul>
                <p className="mk-body mt-3">
                  We provide tools — sending caps, quiet hours, and automatic stop-on-opt-out — to
                  help you stay compliant. Using them does not absolve you of legal responsibility
                  for your outreach.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="payment" className="mk-h3 mt-10 scroll-mt-24">Payment &amp; Subscriptions</h2>
                <p className="mk-body mt-3">
                  Paid plans are billed on a recurring subscription basis through Stripe. By
                  subscribing, you authorize us to charge your payment method for the plan you
                  select until you cancel.
                </p>
                <ul className="mk-body mt-3 space-y-2">
                  <li>Subscriptions renew automatically at the end of each billing cycle (monthly or annually).</li>
                  <li>You can cancel at any time from your billing settings. Cancellation takes effect at the end of the current billing period — no partial refunds.</li>
                  <li>Plan limits (number of leads, emails per month, connected inboxes) are enforced automatically. Upgrading takes effect immediately; downgrading takes effect at the next renewal.</li>
                  <li>We may change pricing with at least 30 days&apos; notice. Existing subscribers keep their current rate until the next renewal.</li>
                </ul>
              </FadeIn>

              <FadeIn>
                <h2 id="ai-content" className="mk-h3 mt-10 scroll-mt-24">AI-Generated Content</h2>
                <p className="mk-body mt-3">
                  The Service uses AI to draft email content based on your example emails and lead
                  context. You are responsible for reviewing and approving the content before it is
                  sent. The AI may occasionally produce inaccurate or inappropriate content. We do
                  not guarantee the accuracy, appropriateness, or effectiveness of AI-generated
                  emails.
                </p>
                <p className="mk-body mt-3">
                  You retain ownership of the example emails you provide and the campaigns you
                  create. By using the Service, you grant us a limited license to process your
                  content solely to provide the Service to you.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="intellectual-property" className="mk-h3 mt-10 scroll-mt-24">Intellectual Property</h2>
                <p className="mk-body mt-3">
                  The Service, including its software, design, and branding, is owned by Outreach
                  AI and protected by intellectual property laws. These Terms do not grant you any
                  right to use our trademarks, logos, or branding.
                </p>
                <p className="mk-body mt-3">
                  Your data — leads, emails, business profile — remains yours. You can export or
                  delete it at any time.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="termination" className="mk-h3 mt-10 scroll-mt-24">Termination</h2>
                <p className="mk-body mt-3">
                  You can delete your account at any time. We may suspend or terminate your access
                  if you violate these Terms, if your account is inactive for more than 12 months,
                  or if we discontinue the Service or a feature.
                </p>
                <p className="mk-body mt-3">
                  Upon termination, your right to use the Service ends immediately. We will retain
                  your data for 30 days to allow for export, then delete it unless retention is
                  required by law.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="disclaimer" className="mk-h3 mt-10 scroll-mt-24">Disclaimer</h2>
                <p className="mk-body mt-3">
                  The Service is provided &quot;as is&quot; and &quot;as available,&quot; without
                  warranties of any kind, express or implied. We do not guarantee that the Service
                  will be uninterrupted, error-free, or that emails will reach recipients&apos;
                  inboxes. Deliverability depends on factors outside our control, including email
                  provider filtering.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="liability" className="mk-h3 mt-10 scroll-mt-24">Limitation of Liability</h2>
                <p className="mk-body mt-3">
                  To the maximum extent permitted by law, Outreach AI shall not be liable for any
                  indirect, incidental, special, consequential, or punitive damages, or any loss
                  of profits or revenues, arising from your use of the Service.
                </p>
                <p className="mk-body mt-3">
                  Our total liability for any claim arising from these Terms or the Service shall
                  not exceed the amount you paid us in the 12 months preceding the claim.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="governing-law" className="mk-h3 mt-10 scroll-mt-24">Governing Law</h2>
                <p className="mk-body mt-3">
                  {/* PLACEHOLDER: Replace with the correct jurisdiction once the company
                      entity and registered address are finalized. */}
                  These Terms shall be governed by the laws of the jurisdiction in which Outreach
                  AI is incorporated, without regard to conflict-of-law principles. Any disputes
                  shall be resolved in the courts of that jurisdiction.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="changes" className="mk-h3 mt-10 scroll-mt-24">Changes to These Terms</h2>
                <p className="mk-body mt-3">
                  We may update these Terms from time to time. When we do, we will revise the
                  &quot;Last updated&quot; date and notify you of material changes via email or
                  in-app notification. Continued use of the Service after changes take effect
                  constitutes acceptance of the revised Terms.
                </p>
              </FadeIn>

              <FadeIn>
                <h2 id="contact" className="mk-h3 mt-10 scroll-mt-24">Contact</h2>
                <p className="mk-body mt-3">
                  If you have questions about these Terms, contact us at{' '}
                  <a href="mailto:legal@outreachai.app" className="mk-link">
                    legal@outreachai.app
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
