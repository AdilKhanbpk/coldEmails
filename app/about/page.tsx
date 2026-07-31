import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/marketing-layout';
import { FadeIn } from '@/components/marketing/fade-in';

export const metadata: Metadata = {
  title: 'About — Outreach AI',
  description:
    'Why we built Outreach AI: to make email outreach feel less like a numbers game and more like a thoughtful conversation.',
};

const principles = [
  {
    title: 'Respect the inbox',
    body: 'Every email we send lands in a real person\'s inbox. We build for deliverability, sending caps, and quiet hours because treating leads\' inboxes with care isn\'t just ethical — it works better.',
  },
  {
    title: 'Voice over templates',
    body: 'Generic templates are why outreach feels like spam. We let you teach the AI with your own real emails so every message sounds like it came from you, not a mail-merge field.',
  },
  {
    title: 'Know when to stop',
    body: 'When a lead says no or asks to be removed, the AI stops — automatically. Persistence is valuable; harassment is not. The difference matters.',
  },
  {
    title: 'Honesty about what AI can do',
    body: 'The AI drafts and sends, but it doesn\'t know your pricing or availability. When it lacks information, it says so and follows up — it never invents facts.',
  },
];

export default function AboutPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-cream-300">
        <div className="mk-container py-20 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <FadeIn>
              <h1 className="mk-h1">About</h1>
            </FadeIn>
            <FadeIn delay={100}>
              <p className="mk-lead mt-6">
                Outreach AI exists for a simple reason: email outreach works, but doing it well at
                scale is hard. Most tools solve the scale problem by making every email feel
                identical. We took the opposite approach — learn from the emails you already write
                well, and let the AI handle the repetition without losing the voice.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Founder story placeholder — replace with the real story before launch.
          Do NOT invent biographical details. */}
      <section className="border-b border-cream-300 bg-cream-50">
        <div className="mk-container py-20">
          <div className="mx-auto max-w-2xl">
            <FadeIn>
              <h2 className="mk-h2">Why we started</h2>
              <div className="mt-6 space-y-4">
                <p className="mk-body">
                  {/* PLACEHOLDER: Replace this paragraph with the founder's real story
                      before publishing. Do not invent specific personal details. */}
                  We started Outreach AI after watching too many talented sales teams burn out on
                  the same problem: they knew how to write a great cold email, but they couldn&apos;t
                  send enough of them to hit their numbers without sacrificing quality. The tools
                  meant to help either made things faster but worse, or better but slower.
                </p>
                <p className="mk-body">
                  We thought there was a third option: keep the quality, remove the repetition. The
                  AI doesn&apos;t replace the person who writes the good email — it learns from them,
                  and then does the sending, the follow-ups, and the scheduling so they can spend
                  their time on the conversations that need a human.
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section>
        <div className="mk-container py-20 sm:py-24">
          <FadeIn>
            <h2 className="mk-h2">How we think about outreach</h2>
            <p className="mk-body mt-4 max-w-2xl">
              A few principles that shape how the product works. They&apos;re not a marketing list —
              they&apos;re the constraints we design within.
            </p>
          </FadeIn>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {principles.map((p, i) => (
              <FadeIn key={p.title} delay={i * 80}>
                <div>
                  <h3 className="mk-h3">{p.title}</h3>
                  <p className="mk-body mt-2 text-sm">{p.body}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
