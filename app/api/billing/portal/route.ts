import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeKey);

    await connectDB();
    const user = await User.findById(session.user.id).select('stripeCustomerId').lean();

    if (!user?.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found. Subscribe to a plan first.' }, { status: 400 });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL}/settings/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create billing portal session.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
