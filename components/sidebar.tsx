'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ListChecks,
  Users,
  Settings,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  BarChart3,
  UserCog,
  Menu,
  X,
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, enabled: true },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, enabled: true },
  { label: 'Outreach Types', href: '/outreach-types', icon: ListChecks, enabled: true },
  { label: 'Leads', href: '/leads', icon: Users, enabled: true },
  { label: 'Inboxes', href: '/inboxes', icon: Mail, enabled: true },
  { label: 'Team', href: '/team', icon: UserCog, enabled: true },
  { label: 'Settings', href: '/settings', icon: Settings, enabled: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-stone-200 px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C1613F] text-white">
              <Mail className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <span className="font-serif text-lg font-medium tracking-tight text-stone-900">Outreach AI</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#C1613F] text-white">
            <Mail className="h-4 w-4" strokeWidth={1.75} />
          </Link>
        )}
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 md:hidden"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden items-center gap-2 px-4 py-3 text-sm text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900 md:flex"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            <span>Collapse</span>
          </>
        )}
      </button>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link prefetch={false} shallow={true}
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#F3E7DE] text-[#A94F31]'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-stone-200 p-3">
        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={cn(
            'w-full justify-start rounded-full text-stone-600 hover:bg-stone-100 hover:text-stone-900',
            collapsed && 'px-0',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && <span className="ml-3">Sign out</span>}
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm md:hidden"
      >
        <Menu className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-stone-200 bg-white md:hidden">
          {sidebarContent}
        </aside>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden flex-col border-r border-stone-200 bg-white transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}