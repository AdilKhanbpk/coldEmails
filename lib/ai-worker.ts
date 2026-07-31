import { connectDB } from './mongodb';
import User from '../models/User';
import OutreachType from '../models/OutreachType';
import UserLead from '../models/UserLead';
import Message from '../models/Message';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
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

export async function generateOutreachMessage(
  leadId: string,
  userId: string,
  outreachTypeId: string,
  stepNumber: number,
): Promise<GeneratedEmail> {
  await connectDB();

  const [user, outreachType, lead, previousMessages] = await Promise.all([
    User.findById(userId).select('businessName businessDescription services').lean(),
    OutreachType.findById(outreachTypeId).select('systemPrompt exampleEmails sequenceSteps').lean(),
    UserLead.findById(leadId).select('companyName email country website services outreachDescription').lean(),
    Message.find({ leadId, status: 'SENT' }).sort({ createdAt: 1 }).select('role content step').limit(10).lean(),
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
    leadWebsite: lead.website || null,
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
          .map((m) => `[${m.role.toLowerCase()}] ${m.content}`)
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

export async function decideReplyAction(
  leadId: string,
  userId: string,
  customerReply: string,
): Promise<ReplyDecision> {
  await connectDB();

  const [user, lead, recentMessages] = await Promise.all([
    User.findById(userId).select('businessName businessDescription services').lean(),
    UserLead.findById(leadId).select('companyName email country services outreachDescription outreachTypeId').lean(),
    Message.find({ leadId, status: 'SENT' }).sort({ createdAt: -1 }).select('role content').limit(10).lean(),
  ]);

  if (!user || !lead) throw new Error('Missing context for reply decision.');

  let outreachType = null;
  if (lead.outreachTypeId) {
    outreachType = await OutreachType.findById(lead.outreachTypeId).select('systemPrompt exampleEmails').lean();
  }

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
  try {
    return JSON.parse(text);
  } catch {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // continue
      }
    }
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
