'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
          {item.href && i < items.length - 1 ? (
            <Link href={item.href} className="hover:text-gray-900 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className={i === items.length - 1 ? 'text-gray-900 font-medium' : ''}>
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
