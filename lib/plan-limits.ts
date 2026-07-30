// ---------------------------------------------------------------------------
// Plan limits — server-side enforcement of subscription tier limits.
// These limits are checked on every lead creation and email send.
// ---------------------------------------------------------------------------

type Plan = string;

export interface PlanLimits {
  maxLeads: number;
  maxEmailsPerMonth: number;
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxLeads: 50,
    maxEmailsPerMonth: 100,
    features: ['1 inbox', 'Basic analytics', 'AI outreach'],
  },
  STARTER: {
    maxLeads: 500,
    maxEmailsPerMonth: 2000,
    features: ['2 inboxes', 'Analytics', 'AI outreach', 'Meeting booking'],
  },
  PROFESSIONAL: {
    maxLeads: 5000,
    maxEmailsPerMonth: 20000,
    features: ['5 inboxes', 'Advanced analytics', 'AI outreach', 'Meeting booking', 'Team workspace'],
  },
  BUSINESS: {
    maxLeads: 50000,
    maxEmailsPerMonth: 100000,
    features: ['Unlimited inboxes', 'Full analytics', 'AI outreach', 'Meeting booking', 'Team workspace', 'Priority support'],
  },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
}

// Check if the user can add more leads
export async function canAddLead(userId: string, plan: Plan): Promise<{ allowed: boolean; current: number; limit: number }> {
  const { prisma } = await import('./prisma');
  const currentCount = await prisma.userLead.count({ where: { userId } });
  const limits = getPlanLimits(plan);
  return {
    allowed: currentCount < limits.maxLeads,
    current: currentCount,
    limit: limits.maxLeads,
  };
}

// Check if the user can send more emails this month
export async function canSendEmail(userId: string, plan: Plan): Promise<{ allowed: boolean; current: number; limit: number }> {
  const { prisma } = await import('./prisma');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const currentCount = await prisma.message.count({
    where: {
      userId,
      role: 'ASSISTANT',
      createdAt: { gte: monthStart, lte: monthEnd },
    },
  });

  const limits = getPlanLimits(plan);
  return {
    allowed: currentCount < limits.maxEmailsPerMonth,
    current: currentCount,
    limit: limits.maxEmailsPerMonth,
  };
}
