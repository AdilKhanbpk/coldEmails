'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
type Role = string;
import { ChevronDown, Search, Command } from 'lucide-react';
import { useState, useEffect } from 'react';
import { CommandPalette } from '@/components/command-palette';

interface TopBarProps {
  userName: string;
  userEmail: string;
  userRole: Role;
  leads?: { id: string; companyName: string; email: string }[];
}

const roleLabels: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

export function TopBar({ userName, userEmail, userRole, leads: initialLeads = [] }: TopBarProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [leads, setLeads] = useState(initialLeads);

  useEffect(() => {
    const controller = new AbortController();

    const loadLeads = async () => {
      try {
        const res = await fetch('/api/leads?pageSize=50&sortBy=createdAt&sortOrder=desc', {
          signal: controller.signal,
        });

        if (!res.ok) return;

        const data = await res.json();
        const nextLeads = Array.isArray(data?.leads)
          ? data.leads.map((lead: any) => ({
              id: lead.id || lead._id,
              companyName: lead.companyName || 'Untitled lead',
              email: lead.email || '',
            }))
          : [];

        setLeads(nextLeads);
      } catch {
        // ignore fetch failures; the palette can still work without lead suggestions
      }
    };

    void loadLeads();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1 text-[10px] text-gray-400">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button> */}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-gray-900">{userName}</p>
            <p className="text-xs text-gray-500">{userEmail}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
            {initials}
          </div>
          <Badge variant="outline" className={cn('border-gray-200 text-gray-600 font-normal hidden sm:inline-flex')}>
            {roleLabels[userRole]}
          </Badge>
          <ChevronDown className="hidden h-4 w-4 text-gray-400 sm:block" />
        </div>
      </header>
      {paletteOpen && <CommandPalette leads={leads} />}
    </>
  );
}
