import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/topbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, businessName: true, businessDescription: true, services: true, role: true },
  });

  if (!user) {
    redirect('/login');
  }

  const incomplete =
    !user.businessName || !user.businessDescription || user.services.length === 0;

  if (incomplete) {
    redirect('/onboarding/business-profile');
  }

  const leads = await prisma.userLead.findMany({
    where: { userId: session.user.id },
    select: { id: true, companyName: true, email: true },
    take: 100,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar userName={user.name} userEmail={user.email} userRole={user.role} leads={leads} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
