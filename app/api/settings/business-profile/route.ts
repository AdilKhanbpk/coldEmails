import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

export async function PUT(req: Request) {
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

    if (!businessName?.trim() || !businessDescription?.trim() || !services?.length) {
      return NextResponse.json(
        { error: 'All fields are required.' },
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
      { error: 'Something went wrong.' },
      { status: 500 },
    );
  }
}
