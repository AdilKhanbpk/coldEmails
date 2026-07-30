import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkDomainHealth } from '@/lib/dns-check';

// Get deliverability data: DNS health per sending domain + per-inbox health
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inboxes = await prisma.inbox.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        emailAddress: true,
        provider: true,
        status: true,
        dailySendingCap: true,
        warmupThrottle: true,
        sentToday: true,
        sentDate: true,
      },
    });

    // Extract unique sending domains
    const domains = [...new Set(
      inboxes
        .map((inbox) => inbox.emailAddress.split('@')[1])
        .filter(Boolean),
    )];

    // Run DNS checks for each domain
    const domainChecks = await Promise.all(
      domains.map((domain) => checkDomainHealth(domain)),
    );

    // Per-inbox health
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inboxHealth = inboxes.map((inbox) => {
      const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
      const isSameDay = sentDate && sentDate.getTime() === today.getTime();
      const sent = isSameDay ? inbox.sentToday : 0;
      const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
      const utilization = cap > 0 ? (sent / cap) * 100 : 0;

      return {
        id: inbox.id,
        emailAddress: inbox.emailAddress,
        provider: inbox.provider,
        status: inbox.status,
        sentToday: sent,
        dailyCap: cap,
        utilization: Math.round(utilization),
        warmupThrottle: inbox.warmupThrottle,
      };
    });

    return NextResponse.json({
      domains: domainChecks,
      inboxes: inboxHealth,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to check deliverability.' }, { status: 500 });
  }
}
