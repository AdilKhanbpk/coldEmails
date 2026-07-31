import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { businessName, businessDescription, services } = body as {
      businessName?: string;
      businessDescription?: string;
      services?: string[];
    };

    if (!businessName || !businessName.trim()) {
      return NextResponse.json(
        { field: 'businessName', error: 'Business name is required.' },
        { status: 400 },
      );
    }

    if (!businessDescription || !businessDescription.trim()) {
      return NextResponse.json(
        { field: 'businessDescription', error: 'Business description is required.' },
        { status: 400 },
      );
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json(
        { field: 'services', error: 'Add at least one service.' },
        { status: 400 },
      );
    }

    await connectDB();
    await User.findByIdAndUpdate(session.user.id, {
      businessName: businessName.trim(),
      businessDescription: businessDescription.trim(),
      services: services.map((s) => s.trim()).filter(Boolean),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
