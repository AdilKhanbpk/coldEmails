import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { LeadsClient } from './leads-client';

export const metadata = { title: 'Leads — Outreach AI' };

export default async function LeadsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const outreachTypes = await prisma.outreachType.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Leads</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your prospects and their outreach status.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/leads/import">
            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </button>
          </Link>
          <Link href="/leads/new">
            <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Add lead
            </button>
          </Link>
        </div>
      </div>
      <LeadsClient outreachTypes={outreachTypes} />
    </div>
  );
}
