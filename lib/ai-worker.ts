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

/**
 * Generate the FULL outreach sequence in one single AI call.
 *
 * This is the correct approach for pre-generating all emails at lead creation
 * time. Each email in the sequence is aware of all previous emails because
 * they are generated together in one prompt — the AI sees the full sequence
 * context as it writes each step.
 *
 * Returns an array of emails ordered by step number.
 */
export async function generateFullSequence(
  leadId: string,
  userId: string,
  outreachTypeId: string,
  totalSteps: number,
): Promise<GeneratedEmail[]> {
  await connectDB();

  const [user, outreachType, lead] = await Promise.all([
    User.findById(userId).select('businessName businessDescription services').lean(),
    OutreachType.findById(outreachTypeId).select('systemPrompt exampleEmails sequenceSteps').lean(),
    UserLead.findById(leadId).select('companyName email country website services outreachDescription').lean(),
  ]);

  if (!user || !outreachType || !lead) {
    throw new Error('Missing context for full sequence generation.');
  }

  const model = getChatModel();

  const examplesText = (outreachType.exampleEmails as string[])
    .map((email, i) => `Example ${i + 1}:\n${email}`)
    .join('\n\n---\n\n');

  const leadInfo = [
    `Company: ${lead.companyName}`,
    `Country: ${lead.country}`,
    (lead as any).website ? `Website: ${(lead as any).website}` : null,
    `Services they offer: ${lead.services.join(', ')}`,
    `Outreach description: ${lead.outreachDescription}`,
  ].filter(Boolean).join('\n');

  const systemText = [
    outreachType.systemPrompt,
    '',
    `You are writing a full outreach email sequence on behalf of ${user.businessName || 'our business'}.`,
    `Business description: ${user.businessDescription || ''}`,
    `Services we offer: ${user.services.join(', ')}`,
    '',
    'Here are example emails that show the desired tone and style. Match the voice exactly — do NOT copy verbatim.',
    '',
    examplesText,
    '',
    'CRITICAL RULES:',
    '1. Write ALL emails in the sequence together so each one naturally references the previous.',
    '2. Email 1 is the cold outreach — introduce yourself and make a compelling offer.',
    `3. Emails 2+ are follow-ups — reference what was said in the previous email(s) naturally.`,
    '4. Keep each email concise (under 150 words).',
    '5. Do not use placeholders like [Name] or [Company] — use the real company name from lead info.',
    '6. Each subject line should be short, specific, and different from the others.',
    '7. Each email must end with a clear call-to-action.',
    '8. NEVER invent facts, prices, or details you do not know.',
    '',
    `Return ONLY a JSON array with exactly ${totalSteps} objects, each with "subject" and "body" keys.`,
    'Example format: [{"subject":"...","body":"..."},{"subject":"...","body":"..."}]',
    'No markdown, no code fences, no explanation — just the raw JSON array.',
  ].join('\n');

  const userText = [
    `Write a ${totalSteps}-email outreach sequence for the following lead:`,
    '',
    leadInfo,
    '',
    `Generate all ${totalSteps} emails as a JSON array. Each email should feel like a natural`,
    'continuation of the previous one — the follow-ups must reference earlier emails.',
  ].join('\n');

  const response = await model.invoke([
    new SystemMessage(systemText),
    new HumanMessage(userText),
  ]);

  const content = extractContent(response);
  return parseEmailSequence(content, totalSteps);
}

function parseEmailSequence(content: string, expectedCount: number): GeneratedEmail[] {
  const arr = extractJSONArray(content);

  if (!Array.isArray(arr)) {
    throw new Error('AI did not return a JSON array for the sequence.');
  }

  const emails: GeneratedEmail[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as Record<string, unknown>;
    if (!item?.subject || !item?.body) {
      throw new Error(`AI sequence item ${i + 1} is missing subject or body.`);
    }
    emails.push({ subject: item.subject as string, body: item.body as string });
  }

  if (emails.length < expectedCount) {
    throw new Error(`AI returned ${emails.length} emails but ${expectedCount} were expected.`);
  }

  return emails;
}

async function callLLM(ctx: EmailGenerationContext): Promise<GeneratedEmail> {
  const model = getChatModel();

  const examplesText = ctx.exampleEmails
    .map((email, i) => `Example ${i + 1}:\n${email}`)
    .join('\n\n---\n\n');

  // Build a clear system message (include the outreach/system-level prompt)
  const systemMessageText = [
    // Outreach type's system prompt provided by the user (explicitly include it)
    ctx.systemPrompt,
    '',
    `You are writing outreach emails on behalf of ${ctx.businessName || 'our business'}.`,
    `Business description: ${ctx.businessDescription || ''}`,
    `Services offered: ${ctx.services}`,
    '',
    'Here are example emails that demonstrate the desired tone and style. Study them and match the voice — do NOT copy verbatim.',
    '',
    ctx.exampleEmails.length > 0 ? ctx.exampleEmails.map((e, i) => `Example ${i + 1}:\n${e}`).join('\n\n---\n\n') : '',
    '',
    'CRITICAL RULES:',
    '1. Write a personalized email for the specific lead described in the human message below.',
    '2. Keep it concise (under 150 words).',
    "3. Do NOT output placeholders such as '[Name]', '[Company]', 'company name', or similar — always use the real lead information provided.",
    '4. The subject line should be short, specific, and compelling.',
    '5. For follow-up emails (step 2+), reference the previous email context naturally.',
    '6. Always include a clear call-to-action.',
    '7. If you lack specific facts, say you will confirm and follow up. NEVER invent facts or prices.',
    '8. Return ONLY a JSON object with "subject" and "body" keys. No markdown, no code fences.',
  ]
    .filter(Boolean)
    .join('\n');
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

  // Construct messages explicitly so the lead details are obvious to the model
  const messages = [
    new SystemMessage(systemMessageText),
    new HumanMessage(
      `${userContent}\n\nLead details (use these exact values):\nCompany: ${ctx.leadCompanyName}\nEmail: ${ctx.leadEmail || ''}\nCountry: ${ctx.leadCountry || ''}\nWebsite: ${ctx.leadWebsite || ''}\nServices: ${ctx.leadServices.join(', ') || ''}`,
    ),
  ];

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
  return { subject: json.subject as string, body: json.body as string };
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
  const meetingSlots = Array.isArray(json.meetingSlots)
    ? (json.meetingSlots as unknown[]).map(String)
    : undefined;
  return {
    action,
    subject: json.subject as string,
    body: json.body as string,
    meetingSlots,
    tag,
  };
}

function extractJSON(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  return null;
}

function extractJSONArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  return null;
}
