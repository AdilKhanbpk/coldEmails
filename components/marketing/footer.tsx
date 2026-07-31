import Link from 'next/link';
import { Mail } from 'lucide-react';

const footerLinks = {
  Product: [
    { href: '/', label: 'Overview' },
    { href: '/signup', label: 'Get Started' },
    { href: '/login', label: 'Log in' },
  ],
  Company: [
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ],
  Legal: [
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/terms', label: 'Terms of Service' },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="border-t border-cream-300 bg-cream-100">
      <div className="mk-container py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay-400">
                <Mail className="h-4 w-4 text-white" strokeWidth={2.5} />
              </span>
              <span
                className="text-lg font-medium tracking-tight text-ink"
                style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}
              >
                Outreach AI
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Thoughtful, AI-assisted outreach that respects your leads&apos; inbox as much as your own.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8 sm:gap-12">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  {category}
                </h4>
                <ul className="mt-3 space-y-2">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink-soft transition-colors hover:text-clay-500"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-cream-300 pt-6">
          <p className="text-xs text-ink-muted">
            © {new Date().getFullYear()} Outreach AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
