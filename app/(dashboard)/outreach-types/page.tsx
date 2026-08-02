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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className='flex justify-between align-center flex-row'>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Outreach Types</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define and manage your outreach campaign templates.
        </p>
      </div>
      <div>
        <Button
            className="mt-6 bg-blue-600 hover:bg-blue-700"
            onClick={() => router.push('/outreach-types/new')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Outreach Type
          </Button>
      </div>
      </div>
      <OutreachTypesClient />
    </div>
  );
}
