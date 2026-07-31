import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import { redirect } from 'next/navigation';
import { BusinessProfileForm } from './business-profile-form';

export default async function BusinessProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  await connectDB();
  const user = await User.findById(session.user.id)
    .select('name email businessName businessDescription services')
    .lean();

  if (!user) redirect('/login');

  const formattedUser = { ...user, id: user._id.toString() };

  return <BusinessProfileForm user={formattedUser} />;
}
