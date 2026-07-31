import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { field: 'name', error: 'Name must be at least 2 characters.' },
        { status: 400 },
      );
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { field: 'email', error: 'Please enter a valid email address.' },
        { status: 400 },
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { field: 'password', error: 'Password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    await connectDB();

    const existing = await User.findOne({ email: normalizedEmail });

    if (existing) {
      return NextResponse.json(
        { field: 'email', error: 'An account with this email already exists. Try signing in.' },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: 'ADMIN',
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
