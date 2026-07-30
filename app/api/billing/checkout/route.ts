import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Create a Stripe Checkout session for subscription upgrades.
// Price IDs are configured via environment variables.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan } = body as { plan?: string };

    const priceMap: Record<string, string | undefined> = {
      STARTER: process.env.STRIPE_PRICE_STARTER,
      PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL,
      BUSINESS: process.env.STRIPE_PRICE_BUSINESS,
    };

    const priceId = priceMap[plan || ''];
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan or price not configured.' }, { status: 400 });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeKey);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, stripeCustomerId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Create or reuse Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL}/settings/billing?status=success`,
      cancel_url: `${process.env.NEXTAUTH_URL}/settings/billing?status=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create checkout session.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
