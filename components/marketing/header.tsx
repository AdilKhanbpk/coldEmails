'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mail, Menu, X } from 'lucide-react';
import { useSession } from 'next-auth/react';

const navLinks = [
  { href: '/', label: 'Product' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session, status } = useSession();


  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${scrolled
          ? 'border-b border-cream-300 bg-cream-100/85 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
        }`}
    >
      <div className="mk-container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
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

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        {status === "loading" ? null : !session ? (
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" prefetch={false} className="mk-btn-ghost">
            Log in
          </Link>
          <Link href="/signup" prefetch={false} className="mk-btn-primary">
            Get Started
          </Link>
        </div>
        ) : (
         <Link href="/dashboard" prefetch={false} className="mk-btn-primary">
            Dashboard
          </Link>
        )
        }

        <button
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-cream-200 md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-cream-300 bg-cream-100 md:hidden">
          <nav className="mk-container flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-cream-200"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {status == "loading" ? null : !session ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-cream-300 pt-3">
              <Link href="/login" prefetch={false} className="mk-btn-ghost justify-start" onClick={() => setMobileOpen(false)}>
                Log in
              </Link>
              <Link href="/signup" prefetch={false} className="mk-btn-primary" onClick={() => setMobileOpen(false)}>
                Get Started
              </Link>
            </div>
            ) : (
              <Link href="/dashboard" prefetch={false} className="mk-btn-primary" onClick={() => setMobileOpen(false)}>
                Dashboard
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
