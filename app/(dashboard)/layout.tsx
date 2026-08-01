import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/topbar';
import { DashboardProvider } from './DashboardContext';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  await connectDB();
  const user = await User.findById(session.user.id)
    .select('name email businessName businessDescription services role')
    .lean();

  if (!user) {
    redirect('/login');
  }

  const incomplete =
    !user.businessName || !user.businessDescription || user.services.length === 0;

  if (incomplete) {
    redirect('/onboarding/business-profile');
  }

  return (
    <DashboardProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar userName={user.name} userEmail={user.email} userRole={user.role} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </DashboardProvider>
  );
}
