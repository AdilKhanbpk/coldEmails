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
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Mail className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Outreach AI</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Mail className="h-4 w-4" />
          </Link>
        )}
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors md:flex"
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4" />
            <span>Collapse</span>
          </>
        )}
      </button>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link prefetch={false} shallow={true}
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3">
        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={cn(
            'w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-gray-50',
            collapsed && 'px-0',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
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
        className="fixed left-4 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-gray-200 bg-white md:hidden">
          {sidebarContent}
        </aside>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden flex-col border-r border-gray-200 bg-white transition-all duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
