import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    // These three fields will later be injected into every AI prompt.
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        businessName: businessName.trim(),
        businessDescription: businessDescription.trim(),
        services: services.map((s) => s.trim()).filter(Boolean),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 },
    );
  }
}
