import dynamic from 'next/dynamic';
const InboxesClient = dynamic(() => import('./inboxes-client').then(mod => mod.InboxesClient), { ssr: false, loading: () => <p className="text-center">Loading inboxes...</p> });

export default function InboxesPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Inboxes</h1>
        <p className="mt-1 text-sm text-gray-500">Connect and manage your email sending accounts.</p>
      </div>
      <InboxesClient />
    </div>
  );
}
