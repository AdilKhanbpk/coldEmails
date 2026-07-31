import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
type Plan = string;

// Stripe webhook handler — keeps the User's plan and status in sync with Stripe.
// Handles: subscription created, updated, cancelled, payment failed.
export async function POST(req: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured.' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // Get the subscription to find the price/plan
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;

        const plan = mapPriceToPlan(priceId, stripe);

        await connectDB();
        await User.updateMany(
          { stripeCustomerId: customerId },
          { stripeSubscriptionId: subscriptionId, plan },
        );
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;

        const plan = mapPriceToPlan(priceId, stripe);

        await connectDB();
        await User.updateMany(
          { stripeCustomerId: customerId },
          { plan, status: 'ACTIVE' },
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await connectDB();
        await User.updateMany(
          { stripeCustomerId: customerId },
          { plan: 'FREE', stripeSubscriptionId: null },
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await connectDB();
        await User.updateMany(
          { stripeCustomerId: customerId },
          { status: 'SUSPENDED' },
        );
        break;
      }

      default:
        // Unhandled event type — no action needed
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Webhook processing failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Map a Stripe Price ID to a Plan enum value using env vars
function mapPriceToPlan(priceId: string | undefined, _stripe: Stripe): Plan {
  if (!priceId) return 'FREE';

  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'STARTER';
  if (priceId === process.env.STRIPE_PRICE_PROFESSIONAL) return 'PROFESSIONAL';
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'BUSINESS';

  return 'FREE';
}
