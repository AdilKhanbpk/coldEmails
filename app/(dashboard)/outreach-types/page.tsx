import dynamic from 'next/dynamic';
const OutreachTypesClient = dynamic(() => import('./outreach-types-client').then(mod => mod.default), { ssr: false, loading: () => <p className="text-center">Loading outreach types...</p> });

export default function OutreachTypesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Outreach Types</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define and manage your outreach campaign templates.
        </p>
      </div>
      <OutreachTypesClient />
    </div>
  );
}
