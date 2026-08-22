'use client'
import dynamic from 'next/dynamic';
import OutreachTypesClient from './outreach-types-client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
// const OutreachTypesClient = dynamic(() => import('./outreach-types-client').then(mod => mod.default), { ssr: false, loading: () => <p className="text-center">Loading outreach types...</p> });

export default function OutreachTypesPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 border-b border-stone-200 pb-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight text-stone-900 sm:text-3xl">
              Outreach Types
            </h1>
            <p className="mt-1.5 text-sm text-stone-500">
              Define and manage your outreach campaign templates.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              className="rounded-full bg-[#C1613F] text-white hover:bg-[#A94F31]"
              onClick={() => router.push('/outreach-types/new')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Outreach Type
            </Button>
          </div>
        </div>
        <OutreachTypesClient />
      </div>
    </div>
  );
}