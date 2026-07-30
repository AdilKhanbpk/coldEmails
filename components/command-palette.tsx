'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  LayoutDashboard, BarChart3, ListChecks, Users, Mail,
  Settings, CreditCard, UserCog, Shield, Search,
} from 'lucide-react';

interface SearchResult {
  id: string;
  label: string;
  subtitle?: string;
  href: string;
  icon: typeof LayoutDashboard;
  group: string;
}

export function CommandPalette({
  leads = [],
}: {
  leads?: { id: string; companyName: string; email: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const navigationItems: SearchResult[] = [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Navigation' },
    { id: 'analytics', label: 'Analytics', href: '/analytics', icon: BarChart3, group: 'Navigation' },
    { id: 'outreach-types', label: 'Outreach Types', href: '/outreach-types', icon: ListChecks, group: 'Navigation' },
    { id: 'leads', label: 'Leads', href: '/leads', icon: Users, group: 'Navigation' },
    { id: 'team', label: 'Team', href: '/team', icon: UserCog, group: 'Navigation' },
    { id: 'admin', label: 'Admin Panel', href: '/admin', icon: Shield, group: 'Navigation' },
    { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, group: 'Settings' },
    { id: 'inboxes', label: 'Inbox Settings', href: '/settings/inboxes', icon: Mail, group: 'Settings' },
    { id: 'deliverability', label: 'Deliverability', href: '/settings/deliverability', icon: Shield, group: 'Settings' },
    { id: 'billing', label: 'Billing', href: '/settings/billing', icon: CreditCard, group: 'Settings' },
  ];

  const leadResults: SearchResult[] = leads.map((lead) => ({
    id: lead.id,
    label: lead.companyName,
    subtitle: lead.email,
    href: `/leads/${lead.id}`,
    icon: Users,
    group: 'Leads',
  }));

  const allItems = [...navigationItems, ...leadResults];

  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q),
    );
  }, [search, allItems]);

  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  const handleSelect = (href: string) => {
    setOpen(false);
    setSearch('');
    router.push(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/20 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <Search className="h-4 w-4 text-gray-400" />
            <Command.Input
              autoFocus
              placeholder="Search leads, pages, settings..."
              value={search}
              onValueChange={setSearch}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">No results found.</div>
            )}
            {Object.entries(grouped).map(([group, items]) => (
              <Command.Group key={group} heading={group} className="mb-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      onSelect={() => handleSelect(item.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-700"
                    >
                      <Icon className="h-4 w-4 text-gray-400" />
                      <div className="flex-1">
                        <span>{item.label}</span>
                        {item.subtitle && (
                          <span className="ml-2 text-xs text-gray-400">{item.subtitle}</span>
                        )}
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
