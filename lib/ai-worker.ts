// ---------------------------------------------------------------------------
// AI Worker — generates personalized outreach emails and decides actions on replies.
//
// Provider-agnostic: uses getChatModel() from lib/llm-provider.ts, which reads
// the LLM_PROVIDER env var. To switch from OpenAI to Anthropic (or vice versa),
// change ONLY the LLM_PROVIDER env var — no code changes needed here.
//
// The prompt is assembled using LangChain prompt templates in this priority order:
//   1. Business profile (businessName, businessDescription, services)
//   2. Outreach Type systemPrompt
//   3. Outreach Type exampleEmails (4 examples — tone/structure guidance)
//   4. Lead details (companyName, services, country, outreachDescription)
//      with {{first_name}}, {{company_name}}, {{job_title}} substitution
//   5. For follow-ups/replies: last 10 messages of the conversation (token-cost control)
//
// The model is explicitly instructed: if it lacks information, it must say it
// will confirm and follow up — it must NEVER invent facts.
// ---------------------------------------------------------------------------

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { prisma } from './prisma';
import { getChatModel } from './llm-provider';

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export type ReplyAction = 'continue' | 'meeting' | 'stop';

export type ReplyTagType = 'INTERESTED' | 'WANTS_MEETING' | 'NOT_INTERESTED' | 'OUT_OF_OFFICE';

export interface ReplyDecision {
  action: ReplyAction;
  subject: string;
  body: string;
  meetingSlots?: string[];
  tag?: ReplyTagType;
}

export interface EmailGenerationContext {
  systemPrompt: string;
  exampleEmails: string[];
  businessName: string;
  businessDescription: string;
  services: string[];
  leadCompanyName: string;
  leadEmail: string;
  leadCountry: string;
  leadWebsite: string | null;
  leadServices: string[];
  leadOutreachDescription: string;
  stepNumber: number;
  previousMessages: { role: string; content: string }[];
}

// ---------------------------------------------------------------------------
// generateOutreachMessage — assembles a first-email or follow-up from the
// full context (business profile, outreach type, lead, conversation history).
// ---------------------------------------------------------------------------

export async function generateOutreachMessage(
  leadId: string,
  userId: string,
  outreachTypeId: string,
  stepNumber: number,
): Promise<GeneratedEmail> {
  const [user, outreachType, lead, previousMessages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { businessName: true, businessDescription: true, services: true },
    }),
    prisma.outreachType.findUnique({
      where: { id: outreachTypeId },
      select: { systemPrompt: true, exampleEmails: true, sequenceSteps: true },
    }),
    prisma.userLead.findUnique({
      where: { id: leadId },
      select: {
        companyName: true, email: true, country: true, website: true,
        services: true, outreachDescription: true,
      },
    }),
    prisma.message.findMany({
      where: { leadId, status: 'SENT' },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, step: true },
      take: 10,
    }),
  ]);

  if (!user || !outreachType || !lead) {
    throw new Error('Missing context for email generation.');
  }

  const ctx: EmailGenerationContext = {
    systemPrompt: outreachType.systemPrompt,
    exampleEmails: outreachType.exampleEmails as string[],
    businessName: user.businessName || '',
    businessDescription: user.businessDescription || '',
    services: user.services,
    leadCompanyName: lead.companyName,
    leadEmail: lead.email,
    leadCountry: lead.country,
    leadWebsite: lead.website,
    leadServices: lead.services,
    leadOutreachDescription: lead.outreachDescription,
    stepNumber,
    previousMessages: previousMessages.map((m) => ({ role: m.role, content: m.content })),
  };

  return callLLM(ctx);
}

async function callLLM(ctx: EmailGenerationContext): Promise<GeneratedEmail> {
  const model = getChatModel();

  const examplesText = ctx.exampleEmails
    .map((email, i) => `Example ${i + 1}:\n${email}`)
    .join('\n\n---\n\n');

  const systemTemplate = ChatPromptTemplate.fromTemplate(
    [
      ctx.systemPrompt,
      '',
      'You are writing outreach emails on behalf of {businessName}.',
      'Business description: {businessDescription}',
      'Services offered: {services}',
      '',
      'Here are four example emails that demonstrate the desired tone and style.',
      'Study the tone, structure, greeting style, sign-off, and length of these examples.',
      'Match the voice. Do NOT copy them verbatim.',
      '',
      '{examples}',
      '',
      'CRITICAL RULES:',
      '1. Write a personalized email for the specific lead described below.',
      '2. Keep it concise (under 150 words).',
      '3. Do not use placeholders like [Name] or [Company] — fill in real details.',
      '4. Use {{first_name}}, {{company_name}}, and {{job_title}} as variables where the lead\'s name, company, or job title is known. If a value is unknown, omit it gracefully rather than guessing.',
      '5. The subject line should be short, specific, and compelling.',
      '6. For follow-up emails (step 2+), reference the previous email context naturally.',
      '7. Always include a clear call-to-action.',
      '8. If you lack information (e.g. pricing, availability, specific details), say you will confirm and follow up. NEVER invent facts, prices, or details you do not know.',
      '9. Return ONLY a JSON object with "subject" and "body" keys. No markdown, no code fences.',
    ].join('\n'),
  );

  const leadInfo = [
    `Company: ${ctx.leadCompanyName}`,
    `Country: ${ctx.leadCountry}`,
    ctx.leadWebsite ? `Website: ${ctx.leadWebsite}` : null,
    `Services: ${ctx.leadServices.join(', ')}`,
    `Outreach description: ${ctx.leadOutreachDescription}`,
  ].filter(Boolean).join('\n');

  const historySection =
    ctx.previousMessages.length > 0
      ? `\n\nPrevious messages in this conversation (most recent last):\n${ctx.previousMessages
          .map((m, i) => `[${m.role.toLowerCase()}] ${m.content}`)
          .join('\n---\n')}`
      : '';

  const userContent = `Write step ${ctx.stepNumber} of the outreach sequence for the following lead:\n\n${leadInfo}${historySection}\n\nGenerate a personalized email. Return JSON with "subject" and "body" keys.`;

  const messages = await systemTemplate.formatMessages({
    businessName: ctx.businessName,
    businessDescription: ctx.businessDescription,
    services: ctx.services.join(', '),
    examples: examplesText,
  });

  messages.push(new HumanMessage(userContent));

  const response = await model.invoke(messages);
  const content = extractContent(response);

  return parseEmailJSON(content);
}

// ---------------------------------------------------------------------------
// decideReplyAction — given a customer reply, the AI chooses exactly one of:
//   a. "continue"  — generate and send a contextual reply
//   b. "meeting"   — the lead wants to meet; trigger meeting flow
//   c. "stop"      — disinterest / rude / removal request; stop outreach permanently
// ---------------------------------------------------------------------------

export async function decideReplyAction(
  leadId: string,
  userId: string,
  customerReply: string,
): Promise<ReplyDecision> {
  const [user, lead, outreachType, recentMessages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { businessName: true, businessDescription: true, services: true },
    }),
    prisma.userLead.findUnique({
      where: { id: leadId },
      select: {
        companyName: true, email: true, country: true, services: true,
        outreachDescription: true, outreachTypeId: true,
      },
    }),
    prisma.outreachType.findFirst({
      where: { leads: { some: { id: leadId } } },
      select: { systemPrompt: true, exampleEmails: true },
    }),
    prisma.message.findMany({
      where: { leadId, status: 'SENT' },
      orderBy: { createdAt: 'desc' },
      select: { role: true, content: true },
      take: 10,
    }),
  ]);

  if (!user || !lead) throw new Error('Missing context for reply decision.');

  const model = getChatModel();

  const systemText = [
    'You are an AI assistant managing email outreach conversations on behalf of a business.',
    `Business: ${user.businessName}`,
    `Description: ${user.businessDescription}`,
    `Services: ${user.services.join(', ')}`,
    outreachType?.systemPrompt ? `Outreach style: ${outreachType.systemPrompt}` : '',
    '',
    'A customer has replied to an outreach email. You must decide the next action and',
    'generate the appropriate response. Choose EXACTLY ONE of these three actions:',
    '',
    '1. "continue" — The conversation is progressing normally. Generate a contextual reply that moves the conversation forward.',
    '2. "meeting" — The customer expressed interest in a meeting, call, or demo. Generate a reply that proposes meeting next steps.',
    '3. "stop" — The customer is disinterested, asked to be removed/unsubscribed, or was rude/aggressive. Generate a brief, polite closing message.',
    '',
    'CRITICAL RULES:',
    '- If you lack information, say you will confirm and follow up. NEVER invent facts, prices, or details.',
    '- If the customer asks to be removed from the list, says "not interested", or is hostile, choose "stop".',
    '- If the customer mentions meeting, call, demo, schedule, or availability, choose "meeting".',
    '- Otherwise, choose "continue".',
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{"action":"continue|meeting|stop","subject":"...","body":"...","meetingSlots":["iso8601","iso8601"],"tag":"INTERESTED|WANTS_MEETING|NOT_INTERESTED|OUT_OF_OFFICE"}',
    'meetingSlots is optional and only included when action is "meeting".',
    'tag classifies the customer\'s reply sentiment:',
    '  - "INTERESTED": positive engagement, asking questions, wants more info',
    '  - "WANTS_MEETING": explicitly asked for a call/meeting/demo',
    '  - "NOT_INTERESTED": declined, said no thanks, asked to be removed',
    '  - "OUT_OF_OFFICE": auto-reply or vacation message',
  ].filter(Boolean).join('\n');

  const historyText = recentMessages
    .slice()
    .reverse()
    .map((m) => `[${m.role.toLowerCase()}] ${m.content}`)
    .join('\n---\n');

  const userText = [
    `Lead: ${lead.companyName} (${lead.email}), ${lead.country}`,
    `Services: ${lead.services.join(', ')}`,
    `Outreach description: ${lead.outreachDescription}`,
    '',
    'Conversation history (most recent last):',
    historyText,
    '',
    `The customer's latest reply:`,
    customerReply,
    '',
    'Decide the action and generate the response. Return JSON only.',
  ].join('\n');

  const response = await model.invoke([
    new SystemMessage(systemText),
    new HumanMessage(userText),
  ]);

  const content = extractContent(response);
  return parseReplyDecision(content);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractContent(response: unknown): string {
  if (typeof response === 'string') return response;
  const r = response as { content?: unknown };
  if (typeof r?.content === 'string') return r.content;
  return JSON.stringify(response);
}

function parseEmailJSON(content: string): GeneratedEmail {
  const json = extractJSON(content);
  if (!json?.subject || !json?.body) throw new Error('AI response missing subject or body.');
  return { subject: json.subject, body: json.body };
}

function parseReplyDecision(content: string): ReplyDecision {
  const json = extractJSON(content);
  if (!json?.action || !json?.subject || !json?.body) {
    throw new Error('AI reply decision missing required fields.');
  }
  const action = json.action as ReplyAction;
  if (!['continue', 'meeting', 'stop'].includes(action)) {
    throw new Error(`Invalid reply action: ${action}`);
  }
  const validTags: ReplyTagType[] = ['INTERESTED', 'WANTS_MEETING', 'NOT_INTERESTED', 'OUT_OF_OFFICE'];
  const tag = validTags.includes(json.tag as ReplyTagType) ? (json.tag as ReplyTagType) : undefined;
  return {
    action,
    subject: json.subject,
    body: json.body,
    meetingSlots: json.meetingSlots || undefined,
    tag,
  };
}

function extractJSON(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // continue
      }
    }
    // Try to find first { ... } block
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // continue
      }
    }
    return null;
  }
}
