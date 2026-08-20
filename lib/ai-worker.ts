import { connectDB } from './mongodb';
import User from '../models/User';
import OutreachType from '../models/OutreachType';
import UserLead from '../models/UserLead';
import Message from '../models/Message';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getChatModel } from './llm-provider';
import { normalizeTextForEmail } from './text-normalizer';

export interface GeneratedEmail {
  subject: string;
  body: string;
}

/**
 * 'out_of_office' is a distinct action from 'continue' so the application layer
 * can record an OOO event and hold off on sending a normal sales reply to an
 * automated vacation responder, instead of generating a conversational reply.
 */
export type ReplyAction = 'continue' | 'meeting' | 'stop' | 'out_of_office';

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
  senderName: string;
  senderTitle: string;
  leadCompanyName: string;
  leadEmail: string;
  leadCountry: string;
  leadWebsite: string | null;
  leadServices: string[];
  leadOutreachDescription: string;
  stepNumber: number;
  previousMessages: { role: string; content: string }[];
}

/**
 * NOTE ON `User` TYPING:
 * The Mongoose `User` model/type does not currently declare `senderName` /
 * `senderTitle`, so we previously read them via `(user as any)`. Until the
 * User model/type is updated to declare these fields, we at least narrow the
 * cast to a small local interface instead of `any`, so everything else on
 * `user` keeps real type checking.
 */
interface SenderFields {
  senderName?: string;
  senderTitle?: string;
}

function getSenderIdentity(user: { businessName?: string } & SenderFields): {
  senderName: string;
  senderTitle: string;
} {
  return {
    senderName: user.senderName || user.businessName || '',
    senderTitle: user.senderTitle || '',
  };
}

/* ------------------------------------------------------------------------ *
 *  SHARED PROMPT RULE BLOCKS
 *
 *  These are composed into the full-sequence prompt, the single-email
 *  prompt, and (where relevant) the reply prompt, so the three prompts stay
 *  in sync instead of drifting independently.
 * ------------------------------------------------------------------------ */

/**
 * Shared spam-avoidance rules injected into every prompt that generates
 * outbound copy (initial sequence, single-step generation, and replies).
 *
 * Based on 2026 deliverability research: modern filters (Gmail/Outlook/Yahoo)
 * weight sender authentication, sender reputation, and recipient engagement
 * far more heavily than individual "spam words". Content still matters, but
 * mainly at the level of manipulative/urgent/promotional patterns, ALL CAPS,
 * excessive punctuation, and heavy HTML/link density — not any single word
 * like "free". We deliberately avoid a long banned-word list so the model
 * doesn't twist itself into unnatural phrasing to dodge harmless words.
 */
const SPAM_AVOIDANCE_RULES = [
  'SPAM-AVOIDANCE RULES (apply to both subject and body):',
  '- Never use ALL CAPS words or excessive punctuation (e.g. "!!!", "???", "$$$").',
  '- Avoid aggressive promotional or mass-marketing-sounding language in the subject and body.',
  '- Do not use fake urgency, exaggerated promises, or manipulative sales language.',
  '- Do not make unsupported guarantees or financial claims (e.g. guaranteed results, specific % increases) unless explicitly provided as verified facts.',
  '- Ordinary words (including words like "free") are fine when they are genuinely accurate and used naturally — do not contort phrasing just to avoid a common word.',
  '- Never stack multiple risk categories together (urgency + money + a hard promotional CTA in the same email).',
  '- Use at most one link in the entire email, and only if it is genuinely necessary. No link-shorteners or tracking-heavy URLs.',
  '- Write in plain, natural prose — no heavy HTML styling, no multiple fonts/colors, no large images, no walls of bullet points.',
  '- Avoid vague, mass-mail-sounding subject lines like "Business Proposal", "Increase Your Sales", or "Website Services".',
  '- Do not open the subject or first line with money-related or urgency language.',
  '- Avoid overused, obviously-AI-sounding openers and subject lines that spam filters and recipients now recognize as templated,',
  '  such as "I hope this email finds you well", "Quick question for you", "Thought this might be useful", or "Just checking in".',
  '- Keep a natural word-to-link ratio — the email should read as a short personal note, not a marketing blast.',
  '- Do not use spintax-style phrasing, excessive superlatives, or "salesy" exclamation-heavy language.',
].join('\n');

/**
 * Shared reply-rate guidance based on 2026 B2B cold-email benchmark research
 * (Instantly, Belkins, Backlinko, Apollo, Cleverly, Woodpecker, ZoomInfo, etc.):
 * - Tightly-targeted emails with real substance outperform both padded-long
 *   and stripped-down-short emails.
 * - Generic "swap in a name and company" personalization no longer moves the needle —
 *   it needs to demonstrate real understanding of the prospect's specific situation.
 * - One clear, low-friction CTA per email beats multiple competing asks.
 * - Follow-ups should each introduce a genuinely new angle, not just "checking in".
 */
const REPLY_RATE_GUIDANCE = [
  'REPLY-RATE GUIDANCE (based on current cold-email benchmark research):',
  '- Tightly-targeted, substantive emails consistently earn more replies than either padded-long or artificially stripped-down emails.',
  '- Cosmetic personalization (only swapping in a name and company) no longer works and reads as spam to modern filters and recipients.',
  '  Real personalization means the email demonstrates genuine understanding of the specific lead\'s situation using only the facts provided.',
  '- One clear, low-friction call-to-action per email outperforms multiple competing asks.',
  '- Every follow-up must add a genuinely new angle, benefit, or reason to respond — never just "checking in" or a restated pitch.',
  '- A specific, relevant subject line outperforms generic curiosity-bait or clickbait subject lines.',
].join('\n');

/**
 * Directly addresses the "prospect-only, sender reduced to a name in a
 * signature" failure mode: the email must still make clear who is writing,
 * why, and what they do — not just mention it in passing.
 */
const BALANCE_RULES = [
  'BALANCE BETWEEN PROSPECT AND SENDER:',
  '- The prospect should remain the primary focus, but the email must still clearly establish who the sender is and what the sender does.',
  '- Do not reduce the sender to only a name and signature.',
  '- When relevant, briefly explain the sender\'s role and the specific service being offered.',
  '- The recipient should understand within the email: who is contacting them, why they are contacting them, what the sender does, and why it may be relevant to this business.',
  '- Do not use vague phrases such as "we help businesses grow" when the actual service can be stated more clearly.',
  '- Use the sender information and services provided in the business context rather than inventing additional capabilities.',
].join('\n');

/**
 * Makes the sender sound like one real individual rather than a marketing
 * department, matching the voice of the reference examples.
 */
const SINGLE_SENDER_VOICE_RULES = [
  'SINGLE-SENDER VOICE:',
  '- The email is written by one real person, not a marketing department.',
  '- Prefer "I" when referring to the sender personally.',
  '- Use "we" only when the business context genuinely requires speaking on behalf of a team/company.',
  '- Do not switch randomly between "I" and "we" within the same email or across the sequence.',
  '- Maintain a consistent first-person voice throughout the campaign.',
].join('\n');

function buildSubjectRules(): string {
  return [
    'SUBJECT LINE RULES:',
    '- Keep subjects short, natural, and specific to the prospect — prefer 3–7 words (roughly 36–50 characters works best).',
    '- Make every subject different.',
    '- The subject must naturally correspond to the actual content of the email.',
    '- Do not use a vague subject simply to create curiosity.',
    '- Do not imply that the sender already knows the prospect personally.',
    '- Do not use misleading subjects such as "Re:", "Following up", or "Your website" unless they accurately reflect the conversation.',
    '- Avoid clickbait and generic curiosity-bait subject lines — they now read as automated.',
    '- Avoid excessive punctuation.',
    '- Avoid ALL CAPS.',
    '- Avoid generic subjects such as "Web Development Services", "Business Proposal", or "Website Services".',
  ].join('\n');
}

function buildCtaRules(): string {
  return [
    'CTA RULES:',
    '- Every email must have one clear call-to-action.',
    '- Keep the CTA low-friction.',
    '- Prefer asking for a short conversation, permission to send ideas, or permission to show what could be improved.',
    '- Do not ask for a large commitment in the first email.',
    '- Do not use multiple competing CTAs.',
  ].join('\n');
}

function buildPersonalizationRules(): string {
  return [
    'PERSONALIZATION RULES:',
    '- Use the actual lead/company information provided to you.',
    '- Personalize around the prospect when useful.',
    '- Mention a specific business opportunity only when supported by the provided information.',
    '- NEVER invent facts, problems, customers, revenue, services, locations, awards, reviews, technologies, or competitors.',
    '- NEVER use fake compliments such as "I was impressed by your company" unless the provided information genuinely supports it.',
    '- Do not claim that you visited, reviewed, analyzed, or audited the prospect\'s website unless that actually happened and is included in the provided information.',
    '- Do not mention information that is not available simply to make the email sound personalized.',
  ].join('\n');
}

function buildAccuracyRules(): string {
  return [
    'ACCURACY RULES:',
    '- Use ONLY information provided in the lead data, business context, and examples.',
    '- If a specific fact is unavailable, simply write around it instead of inventing it.',
    '- Do not write "I will confirm and follow up" merely because information is missing.',
    '- Do not include discounts, prices, guarantees, statistics, case studies, or results unless they are explicitly provided.',
    '- Do not claim that the prospect is losing customers — present it only as a possibility.',
    '- Never guarantee increased sales or revenue, and never invent a specific percentage increase in sales, leads, traffic, or revenue.',
  ].join('\n');
}

function buildPlaceholderRules(): string {
  return [
    'PLACEHOLDER RULE:',
    "- NEVER output placeholders such as '[Name]', '[Company]', '[Business Name]', '${companyName}', 'company name', '<company>', or similar.",
    '- Always use the actual lead information when it is available.',
  ].join('\n');
}

function buildSignatureRules(senderName: string, senderTitle: string): string {
  return [
    'SIGNATURE RULE:',
    '- Every email MUST end with a closing and signature in the same structure shown in the example emails, using our real sender identity:',
    '  Best,',
    `  ${senderName}`,
    senderTitle ? `  ${senderTitle}` : '',
    '- Do not omit the signature. Do not invent a different name, title, or company.',
  ].filter(Boolean).join('\n');
}

/**
 * Treats the example emails as a structural blueprint (what to include and
 * in what order/depth), not merely a "tone reference" — this is the fix for
 * examples being followed for voice but not for completeness/structure.
 */
function buildReferenceBlueprintRules(): string {
  return [
    'REFERENCE EMAILS — STRUCTURE AND STYLE BLUEPRINT:',
    'The example emails are the primary reference for how this outreach campaign should feel.',
    'Do not copy their wording or sentences verbatim.',
    'Instead, analyze and reproduce their underlying structure. Pay attention to:',
    '- How the email opens.',
    '- How the prospect problem is introduced.',
    '- How the business consequence is explained.',
    '- How the sender introduces themselves.',
    '- How the sender explains their service.',
    '- How much information is provided about the sender.',
    '- Paragraph length and spacing.',
    '- Tone and level of formality.',
    '- CTA style.',
    '- Closing and signature format.',
    '- Overall email depth and completeness.',
    'The lead information must determine WHAT the email says.',
    'The reference examples must strongly influence HOW the email says it.',
    'Do not make the generated email substantially shorter, simpler, or less informative than the reference examples merely because short emails are generally recommended.',
    'Personalization must change the prospect-specific content without removing the sender identity, service explanation, structure, or signature style demonstrated by the examples.',
  ].join('\n');
}

function buildLengthRulesFullSequence(): string {
  return [
    'LENGTH RULES:',
    '- Email 1: normally 100–150 words.',
    '- Follow-ups: normally 60–110 words.',
    '- Do not pad an email just to reach a word count.',
    '- Do not make an email artificially short if doing so removes important sender identity, service context, personalization, or the CTA.',
    '- The reference examples are the primary guide for the appropriate depth of the campaign.',
    '- Use short paragraphs and natural spacing.',
    '- Never sacrifice clarity or completeness merely to reduce word count.',
  ].join('\n');
}

function buildLengthRulesSingleEmail(): string {
  return [
    'LENGTH RULES:',
    '- Email 1 (first touch): normally 100–150 words.',
    '- Follow-up emails: normally 60–110 words.',
    '- Do not pad an email just to reach a word count.',
    '- Do not make an email artificially short if doing so removes important sender identity, service context, personalization, or the CTA.',
    '- The reference examples are the primary guide for the appropriate depth of the email.',
    '- Use short paragraphs and natural spacing.',
    '- Never sacrifice clarity or completeness merely to reduce word count.',
  ].join('\n');
}

/**
 * Used only inside the reply-decision prompt: when a prospect raises an
 * objection, acknowledge it first instead of immediately counter-selling.
 */
const OBJECTION_HANDLING_RULES = [
  '--- OBJECTION HANDLING ---',
  'When the prospect raises an objection, do not immediately counter-sell.',
  'First acknowledge the concern.',
  'Then respond specifically to what they said.',
  'Do not argue with the prospect.',
  'Do not tell them they are wrong.',
  'Do not create urgency to overcome an objection.',
  'Do not use manipulative persuasion.',
  'If there is a genuinely useful alternative or clarification supported by the business context, mention it briefly.',
  'If the objection indicates they are not interested, respect that rather than forcing the conversation forward.',
].join('\n');

/* ------------------------------------------------------------------------ *
 *  OUTPUT VALIDATION (treat AI output as untrusted input)
 * ------------------------------------------------------------------------ */

/**
 * Validates a generated email against the hard rules we told the model to
 * follow. We do not fully trust the model to have obeyed every instruction,
 * so we re-check the output in code before it is allowed to reach the
 * database or be sent.
 */
function validateGeneratedEmail(
  email: GeneratedEmail,
  ctx: { senderName: string; senderTitle?: string },
): GeneratedEmail {
  const errors: string[] = [];

  if (!email.subject.trim()) {
    errors.push('Missing subject');
  }

  if (!email.body.trim()) {
    errors.push('Missing body');
  }

  if (ctx.senderName && !email.body.includes(ctx.senderName)) {
    errors.push('Missing sender name');
  }

  if (ctx.senderTitle && !email.body.includes(ctx.senderTitle)) {
    errors.push('Missing sender title');
  }

  if (/\$\{[a-zA-Z]+\}|\[Company\]|\[Name\]|\[Business Name\]|<company>/i.test(email.body)) {
    errors.push('Contains placeholder');
  }

  if (/\b[A-Z]{5,}\b/.test(email.body)) {
    errors.push('Contains suspicious ALL CAPS text');
  }

  if (/!{2,}|\?{2,}/.test(email.body) || /!{2,}|\?{2,}/.test(email.subject)) {
    errors.push('Contains excessive punctuation');
  }

  if (errors.length) {
    throw new Error(`Generated email failed validation: ${errors.join(', ')}`);
  }

  return email;
}

/* ------------------------------------------------------------------------ *
 *  SINGLE-STEP GENERATION (uses previously generated/received messages)
 * ------------------------------------------------------------------------ */

export async function generateOutreachMessage(
  leadId: string,
  userId: string,
  outreachTypeId: string,
  stepNumber: number,
): Promise<GeneratedEmail> {
  await connectDB();

  const [user, outreachType, lead, previousMessages] = await Promise.all([
    User.findById(userId).select('businessName businessDescription services senderName senderTitle').lean(),
    OutreachType.findById(outreachTypeId).select('systemPrompt exampleEmails sequenceSteps').lean(),
    UserLead.findById(leadId).select('companyName email country website services outreachDescription').lean(),
    // NOTE: Previously this only fetched status: 'SENT' messages, which meant
    // the model never saw the prospect's replies when generating a follow-up.
    // We now fetch the full conversation (both sent and received) so the
    // model actually knows whether the prospect responded between emails.
    Message.find({ leadId })
      .sort({ createdAt: 1 })
      .select('role content step createdAt')
      .limit(20)
      .lean(),
  ]);

  if (!user || !outreachType || !lead) {
    throw new Error('Missing context for email generation.');
  }

  const { senderName, senderTitle } = getSenderIdentity(user);

  const ctx: EmailGenerationContext = {
    systemPrompt: outreachType.systemPrompt,
    exampleEmails: outreachType.exampleEmails as string[],
    businessName: user.businessName || '',
    businessDescription: user.businessDescription || '',
    services: user.services,
    senderName,
    senderTitle,
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
    User.findById(userId).select('businessName businessDescription services senderName senderTitle').lean(),
    OutreachType.findById(outreachTypeId).select('systemPrompt exampleEmails sequenceSteps').lean(),
    UserLead.findById(leadId).select('companyName email country website services outreachDescription').lean(),
  ]);

  if (!user || !outreachType || !lead) {
    throw new Error('Missing context for full sequence generation.');
  }

  const model = getChatModel();

  const { senderName, senderTitle } = getSenderIdentity(user);

  const examplesText = (outreachType.exampleEmails as string[])
    .map((email, i) => `Example ${i + 1}:\n${email}`)
    .join('\n\n---\n\n');

  const leadInfo = [
    `Company Name: ${lead.companyName}`,
    `Email: ${lead.email}`,
    `Country: ${lead.country}`,
    (lead as any).website ? `Website: ${(lead as any).website}` : null,
    `Services They Offer: ${lead.services.join(', ')}`,
    `Outreach Description: ${lead.outreachDescription}`,
  ].filter(Boolean).join('\n');

  const systemText = [
    outreachType.systemPrompt,
    '',
    `You are an expert B2B cold-email copywriter writing a complete outreach sequence on behalf of ${user.businessName || 'our business'}.`,
    user.businessDescription
      ? `Our business: ${user.businessDescription}`
      : null,
    `Our services: ${user.services.join(', ')}`,
    `The sequence is being sent by ${senderName}${senderTitle ? `, ${senderTitle}` : ''}.`,
    '',

    buildReferenceBlueprintRules(),
    '',
    outreachType.exampleEmails.length > 0
      ? examplesText
      : '(No example emails provided. Use a professional, conversational, human B2B outreach tone.)',
    '',

    'Your goal is NOT to simply describe our services.',
    'Your goal is to make the prospect recognize a real business opportunity or problem and start a conversation with us.',
    '',
    'EMAIL STYLE:',
    '- Write like a real person, not a marketing bot.',
    '- Be conversational, confident, professional, and direct.',
    '- Keep the language simple and easy to scan.',
    '- Avoid corporate jargon, exaggerated claims, and generic sales language.',
    '- Focus primarily on the prospect and their potential customers.',
    '- Every sentence should have a purpose.',
    '',
    BALANCE_RULES,
    '',
    SINGLE_SENDER_VOICE_RULES,
    '',
    REPLY_RATE_GUIDANCE,
    '',
    SPAM_AVOIDANCE_RULES,
    '',
    'CORE SALES ANGLE:',
    'For web-development outreach, where relevant, use this general business problem:',
    'Potential customers search online for services they need. If a business has little or no effective online presence, those customers may discover competitors instead and contact them.',
    'Position our service as a way to help the business become easier to find, present its services professionally, build trust, generate more inquiries, and ultimately increase sales.',
    'Do NOT present this as a guaranteed result.',
    '',
    buildPersonalizationRules(),
    '',
    'SEQUENCE STRATEGY:',
    '1. Email 1 — Cold introduction:',
    '   Start with a relevant business problem or opportunity.',
    '   Make the prospect think about customers they may be missing.',
    '   Clearly explain who we are and how we can help (see BALANCE BETWEEN PROSPECT AND SENDER above).',
    '   End with a low-friction CTA.',
    '',
    '2. Email 2 — Follow-up:',
    '   Do NOT rewrite Email 1.',
    '   Briefly reference the previous message.',
    '   Introduce a different angle, benefit, or reason to consider the offer.',
    '   Keep it tight, but do not strip out the sender/service context entirely.',
    '',
    '3. Email 3+ — Follow-ups:',
    '   Each email should add something new.',
    '   Use different angles such as visibility, customer trust, mobile experience, lead generation, credibility, or converting website visitors into inquiries when relevant.',
    '   Do not repeatedly explain the same service in the same way.',
    '   The sequence may become gradually more direct, but should not lose the personal, human voice.',
    '',
    'FOLLOW-UP RULES:',
    '- Each email must feel like a natural continuation of the previous email.',
    '- Do not say "just following up" repeatedly.',
    '- Do not repeat the same CTA in every email.',
    '- Do not use fake urgency.',
    '- Do not guilt the recipient for not replying.',
    '- Do not sound desperate.',
    '- The final follow-up can politely close the loop while leaving the door open.',
    '',
    buildSubjectRules(),
    '',
    buildCtaRules(),
    '',
    buildLengthRulesFullSequence(),
    '',
    buildSignatureRules(senderName, senderTitle),
    '',
    buildPlaceholderRules(),
    '',
    buildAccuracyRules(),
    '',
    'QUALITY CHECK BEFORE RETURNING:',
    '- Does Email 1 immediately communicate a relevant business problem or opportunity?',
    '- Does the email clearly establish who the sender is and what they do, not just their name in a signature?',
    '- Is the prospect the primary focus while the sender is still clearly explained?',
    '- Does every email add a new reason to respond?',
    '- Do the emails sound like a human wrote them, in a consistent first-person voice?',
    '- Are there any unsupported claims?',
    '- Is the length in line with the reference examples and the LENGTH RULES above?',
    '- Are all CTAs clear and low-friction?',
    '- Are all subject lines different and consistent with their email\'s content?',
    '- Does every email include the correct signature (name + title)?',
    '- Does the sequence feel connected rather than like separate emails?',
    '- Does the content avoid every item in the SPAM-AVOIDANCE RULES above?',
    '',
    `Return ONLY a JSON array with exactly ${totalSteps} objects.`,
    'Each object MUST contain exactly two keys: "subject" and "body".',
    'Example format: [{"subject":"A short subject","body":"Email body here."},{"subject":"Another subject","body":"Follow-up body here."}]',
    'No markdown, no code fences, no explanation, no additional keys — only the raw JSON array.',
  ].filter(Boolean).join('\n');

  const userText = [
    `Create a ${totalSteps}-email B2B outreach sequence for the lead below.`,
    '',
    '--- LEAD INFORMATION ---',
    leadInfo,
    '',
    '--- OBJECTIVE ---',
    'Write a personalized cold outreach sequence designed to start a conversation with this lead.',
    'Identify a relevant business opportunity, pain point, or potential missed opportunity from the information provided.',
    'Where relevant, explain how our services could help them attract more customers, improve their online presence, generate more leads, or increase sales.',
    'The prospect is the primary focus, but the sender and their service must still be clearly explained (see BALANCE BETWEEN PROSPECT AND SENDER).',
    '',
    '--- SEQUENCE REQUIREMENTS ---',
    `IMPORTANT: Generate all ${totalSteps} emails together in one response.`,
    'All emails should be written as a cohesive sequence where each email builds naturally on the previous one.',
    'Each email should feel like a natural continuation of the previous one.',
    '',
    'Email 1 is the initial cold outreach.',
    'Email 2 and later emails are follow-ups to the same outreach.',
    'Each email must introduce a fresh angle, benefit, or reason to respond.',
    'Do not simply rewrite or repeat the previous email.',
    'Make the emails feel like a real human conversation rather than an automated campaign.',
    '',
    '--- PERSONALIZATION ---',
    'Use the lead information provided above to personalize the emails wherever relevant.',
    'Use the actual company name and available business details.',
    'Do not invent facts about the lead or their business.',
    'If the lead information does not support a specific claim, do not make that claim.',
    'Do not use generic compliments or fake observations just to make the email appear personalized.',
    '',
    '--- SIGNATURE ---',
    `Every email must close with: "Best," followed by "${senderName}"${senderTitle ? ` and "${senderTitle}"` : ''} — exactly like the closing shown in the example emails.`,
    '',
    '--- RESPONSE GOAL ---',
    'The primary goal is to get a reply, not to close the sale immediately.',
    'Use simple, low-friction calls-to-action.',
    'Examples include asking whether they are open to a quick conversation, whether they would like a few ideas, or whether they would like to see what could be improved.',
    '',
    '--- OUTPUT ---',
    `Return exactly ${totalSteps} emails.`,
    'Return ONLY a valid JSON array.',
    'Each object must contain exactly two fields: "subject" and "body".',
    'Do not include markdown, code fences, explanations, numbering, or any text outside the JSON array.',
  ].join('\n');

  const response = await model.invoke([
    new SystemMessage(systemText),
    new HumanMessage(userText),
  ]);

  const content = extractContent(response);
  return parseEmailSequence(content, totalSteps, { senderName, senderTitle });
}

function parseEmailSequence(
  content: string,
  expectedCount: number,
  ctx: { senderName: string; senderTitle?: string },
): GeneratedEmail[] {
  const arr = extractJSONArray(content);

  if (!Array.isArray(arr)) {
    console.error('[parseEmailSequence] AI response was not a JSON array. Raw content:', content.substring(0, 500));
    throw new Error(`AI did not return a JSON array for the sequence. Response type: ${typeof arr}. First 200 chars: ${content.substring(0, 200)}`);
  }

  const emails: GeneratedEmail[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as Record<string, unknown>;

    // Strict type validation — a truthy check alone (`!item?.subject`) would
    // accept non-string values like `{ subject: 123, body: true }`.
    if (
      typeof item?.subject !== 'string' ||
      typeof item?.body !== 'string' ||
      !item.subject.trim() ||
      !item.body.trim()
    ) {
      console.error(`[parseEmailSequence] Item ${i + 1} is invalid:`, item);
      throw new Error(`Invalid email at sequence item ${i + 1}: ${JSON.stringify(item)}`);
    }

    const email: GeneratedEmail = {
      subject: normalizeTextForEmail(item.subject),
      body: normalizeTextForEmail(item.body),
    };

    emails.push(validateGeneratedEmail(email, ctx));
  }

  // Was previously `emails.length < expectedCount`, which silently accepted
  // an AI response with MORE emails than requested. We want an exact match.
  if (emails.length !== expectedCount) {
    console.error(`[parseEmailSequence] Expected ${expectedCount} emails but got ${emails.length}`);
    throw new Error(`AI returned ${emails.length} emails but ${expectedCount} were expected.`);
  }

  return emails;
}

async function callLLM(ctx: EmailGenerationContext): Promise<GeneratedEmail> {
  const model = getChatModel();

  // Build system message with outreach type's systemPrompt at the beginning
  const systemMessageText = [
    // 1. User-defined outreach instructions
    ctx.systemPrompt,
    '',

    // 2. Business context
    `You are an expert B2B cold outreach copywriter writing on behalf of ${ctx.businessName || 'our business'}.`,
    ctx.businessDescription
      ? `Business description: ${ctx.businessDescription}`
      : null,
    `Services we offer: ${ctx.services.join(', ')}`,
    `This email is being sent by ${ctx.senderName}${ctx.senderTitle ? `, ${ctx.senderTitle}` : ''}.`,
    '',

    // 3. Writing objective
    'YOUR PRIMARY OBJECTIVE:',
    'Write a personalized outreach email that earns a reply and starts a business conversation.',
    'Do not try to close the entire sale in the first email.',
    'The email should make the prospect recognize a relevant business opportunity, problem, or missed opportunity and understand how our services could help.',
    '',

    // 4. Examples as a structural blueprint (not just "voice")
    buildReferenceBlueprintRules(),
    '',
    ctx.exampleEmails.length > 0
      ? ctx.exampleEmails
          .map((e, i) => `Example ${i + 1}:\n${e}`)
          .join('\n\n---\n\n')
      : '(No example emails provided. Use a professional, conversational, human B2B outreach tone.)',
    '',

    // 5. Prospect-first approach, balanced against sender clarity
    'PROSPECT-FIRST RULE:',
    'Focus primarily on the prospect and their business, not on our company.',
    'Do not begin with a long introduction about who we are.',
    'Do not list all of our services unless necessary.',
    'Lead with a relevant problem, opportunity, observation, or business outcome.',
    'Explain our service after establishing why it could matter to the prospect — but still explain it clearly (see BALANCE BETWEEN PROSPECT AND SENDER below).',
    '',
    BALANCE_RULES,
    '',
    SINGLE_SENDER_VOICE_RULES,
    '',

    // 6. Marketing / sales principles
    'SALES AND MARKETING PRINCIPLES:',
    'Use this general structure when appropriate:',
    'Problem or opportunity → Business consequence → Our solution → Simple CTA.',
    '',
    'Make the prospect think about what they could be missing.',
    'Focus on outcomes such as more visibility, more inquiries, more customers, better credibility, stronger online presence, or increased sales when relevant.',
    'Do not guarantee specific results unless the provided business information explicitly supports the claim.',
    'Never invent statistics, revenue figures, conversion rates, customer numbers, case studies, awards, reviews, or results.',
    '',

    // 7. Personalization
    buildPersonalizationRules(),
    '',

    // 8. Human writing
    'HUMAN WRITING RULES:',
    'Write like a real salesperson or business owner sending a personal email.',
    'Be conversational, confident, helpful, and direct.',
    'Avoid sounding like an AI-generated marketing template.',
    'Avoid excessive enthusiasm.',
    'Avoid corporate jargon.',
    'Avoid unnecessary adjectives.',
    'Avoid long, unfocused explanations — but do not remove the sender/service explanation required above.',
    'Avoid phrases such as "I hope this email finds you well" unless specifically requested.',
    'Avoid generic openings such as "I am reaching out to offer our services."',
    '',

    // 9. Reply-rate guidance
    REPLY_RATE_GUIDANCE,
    '',

    // 10. Spam-avoidance
    SPAM_AVOIDANCE_RULES,
    '',

    // 11. Length
    buildLengthRulesSingleEmail(),
    '',

    // 12. Subject
    buildSubjectRules(),
    '',

    // 13. CTA
    buildCtaRules(),
    '',

    // 14. Follow-ups
    'FOLLOW-UP RULES:',
    'For follow-up emails, naturally acknowledge the previous conversation when appropriate.',
    'Do NOT repeatedly say "just following up".',
    'Do NOT simply rewrite the previous email.',
    'Each follow-up should introduce a new angle, benefit, insight, or reason to respond.',
    'Never guilt the prospect for not responding.',
    'Never use fake urgency or pressure.',
    '',

    // 15. Accuracy
    buildAccuracyRules(),
    '',

    // 16. Placeholder protection
    buildPlaceholderRules(),
    '',

    // 17. Signature
    buildSignatureRules(ctx.senderName, ctx.senderTitle),
    '',

    // 18. Final quality check
    'BEFORE RETURNING THE EMAIL, CHECK:',
    '1. Is this clearly written for this specific prospect?',
    '2. Does the opening create interest quickly?',
    '3. Is the prospect the focus rather than our business — while the sender and their service are still clearly explained?',
    '4. Is there a clear business benefit?',
    '5. Does the email sound human rather than automated, in a consistent first-person voice?',
    '6. Are all claims supported by the provided information?',
    '7. Is the length in line with the reference examples and the LENGTH RULES above?',
    '8. Is there exactly one clear CTA?',
    '9. Is the subject short, relevant, and consistent with the email content?',
    '10. Are there no placeholders?',
    '11. Does the email include the correct signature (name + title)?',
    '12. Does the email avoid every item in the SPAM-AVOIDANCE RULES above?',
    '',

    // 19. Output
    'OUTPUT FORMAT:',
    'Return ONLY a valid JSON object with exactly two keys: "subject" and "body".',
    'Do NOT return markdown.',
    'Do NOT return code fences.',
    'Do NOT return explanations.',
    'Do NOT return any text before or after the JSON object.',
  ].filter(Boolean).join('\n');

  // Format lead context with clear, explicit labels
  const leadInfo = [
    `Company: ${ctx.leadCompanyName}`,
    `Email: ${ctx.leadEmail}`,
    `Country: ${ctx.leadCountry}`,
    ctx.leadWebsite ? `Website: ${ctx.leadWebsite}` : null,
    `Services they offer: ${ctx.leadServices.join(', ')}`,
    `Outreach description: ${ctx.leadOutreachDescription}`,
  ].filter(Boolean).join('\n');

  // Include conversation history for follow-ups (step 2+) with clear formatting.
  // ctx.previousMessages now contains BOTH sent and received messages (see
  // generateOutreachMessage), so the model can see whether the prospect
  // already replied between outreach steps.
  const historySection =
    ctx.previousMessages.length > 0
      ? `\n\n--- Previous messages in this conversation (most recent last) ---\n${ctx.previousMessages
          .map((m) => `[${m.role.toLowerCase()}] ${m.content}`)
          .join('\n\n')}\n--- End of conversation history ---`
      : '';

  // Repeat key lead values (company name, email, country, website, services) at the end for emphasis
  const emphasisSection = [
    '',
    '--- KEY LEAD DETAILS (use these exact values) ---',
    `Company name: ${ctx.leadCompanyName}`,
    `Email: ${ctx.leadEmail}`,
    `Country: ${ctx.leadCountry}`,
    ctx.leadWebsite ? `Website: ${ctx.leadWebsite}` : null,
    `Services: ${ctx.leadServices.join(', ')}`,
    '',
    '--- SENDER IDENTITY (use these exact values in the signature) ---',
    `Sender name: ${ctx.senderName}`,
    ctx.senderTitle ? `Sender title: ${ctx.senderTitle}` : null,
  ].filter(Boolean).join('\n');

  const userContent = `Write step ${ctx.stepNumber} of the outreach sequence for the following lead:\n\n${leadInfo}${historySection}${emphasisSection}\n\nGenerate a personalized email using the lead details above. Sign it with the sender identity above. Return JSON with "subject" and "body" keys.`;

  const messages = [
    new SystemMessage(systemMessageText),
    new HumanMessage(userContent),
  ];

  const response = await model.invoke(messages);
  const content = extractContent(response);

  return parseEmailJSON(content, { senderName: ctx.senderName, senderTitle: ctx.senderTitle });
}

/* ------------------------------------------------------------------------ *
 *  REPLY HANDLING
 * ------------------------------------------------------------------------ */

export async function decideReplyAction(
  leadId: string,
  userId: string,
  customerReply: string,
): Promise<ReplyDecision> {
  await connectDB();

  const [user, lead, recentMessages] = await Promise.all([
    User.findById(userId).select('businessName businessDescription services senderName senderTitle').lean(),
    UserLead.findById(leadId).select('companyName email country services outreachDescription outreachTypeId').lean(),
    // Fixed: previously filtered to status: 'SENT' only, which meant the
    // reply classifier could not see the prospect's own incoming messages.
    // We now pull the full two-way conversation.
    Message.find({ leadId })
      .sort({ createdAt: -1 })
      .select('role content createdAt')
      .limit(20)
      .lean(),
  ]);

  if (!user || !lead) throw new Error('Missing context for reply decision.');

  let outreachType = null;
  if (lead.outreachTypeId) {
    outreachType = await OutreachType.findById(lead.outreachTypeId).select('systemPrompt exampleEmails').lean();
  }

  const model = getChatModel();

  const { senderName, senderTitle } = getSenderIdentity(user);

  const systemText = [
    'You are an AI assistant managing B2B email outreach conversations on behalf of a business.',
    `Business: ${user.businessName}`,
    `Description: ${user.businessDescription}`,
    `Services: ${user.services.join(', ')}`,
    `Replies are sent on behalf of ${senderName}${senderTitle ? `, ${senderTitle}` : ''}.`,
    outreachType?.systemPrompt
      ? `Outreach style: ${outreachType.systemPrompt}`
      : '',
    '',

    'A prospect has replied to an outreach email.',
    'Your job is to understand the prospect response and conversation history, classify the response, and generate the most appropriate next email.',
    '',
    'The prospect may not use obvious keywords such as "meeting" or "not interested".',
    'Understand the meaning, intent, sentiment, and context of the entire conversation.',
    '',

    '--- ACTIONS ---',
    '',
    'Choose EXACTLY ONE action:',
    '',

    '1. "continue"',
    'Use when the prospect is engaging with the conversation and has not explicitly requested a meeting or asked to stop contact, and the message is not an automated out-of-office reply.',
    '',
    'Examples:',
    '- Asking questions about the service',
    '- Asking for more information',
    '- Showing curiosity or interest',
    '- Asking about pricing or process',
    '- Saying the idea sounds interesting',
    '- Asking how the service works',
    '- Asking what you recommend',
    '- Giving a positive but non-meeting response',
    '- Raising an objection (see OBJECTION HANDLING below)',
    '',
    'Generate: A concise, contextual reply that answers their question and naturally moves the conversation toward the next step.',
    '',

    '2. "meeting"',
    'Use when the prospect explicitly or clearly wants to speak, meet, call, have a demo, or discuss the opportunity directly.',
    '',
    'Examples:',
    '- "Can we schedule a call?"',
    '- "Are you available tomorrow?"',
    '- "Let\u2019s discuss this"',
    '- "Can you give me a demo?"',
    '- "I would like to speak with you"',
    '- "When are you free?"',
    '- "Send me some available times"',
    '',
    'IMPORTANT:',
    '- Meeting intent takes priority over general interest.',
    '- If the prospect asks for a meeting, classify as "meeting" even if they also ask questions.',
    '- Only provide meeting slots if real availability is provided in the conversation/context.',
    '- NEVER invent dates, times, availability, or meeting links.',
    '- If no real meeting slots are available, ask the prospect for their preferred day/time or availability.',
    '',

    '3. "stop"',
    'Use when the prospect clearly declines the offer, asks not to be contacted, or explicitly opts out.',
    '',
    'Examples:',
    '- "Not interested"',
    '- "No thanks"',
    '- "Please remove me from your list"',
    '- "Stop emailing me"',
    '- "Do not contact me again"',
    '- "We are not interested"',
    '- Clear hostile or explicit rejection',
    '',
    'Generate: A brief, polite closing response.',
    'Do not continue selling.',
    'Do not attempt to overcome the objection.',
    'Do not ask another sales question.',
    'Respect the prospect immediately.',
    '',

    '4. "out_of_office"',
    'Use ONLY when the reply is an automated out-of-office, vacation, leave, or away message, and it does NOT also explicitly request no further contact.',
    'An out-of-office message is NOT an opt-out and should NOT be classified as "stop".',
    'Do not attempt to sell anything, answer questions, or push toward a meeting in response to an automated OOO message.',
    'Generate: leave "body" as an empty string ("") — the application will not send anything for this action, it only records that an OOO reply was received.',
    'If the OOO message ALSO explicitly asks for no further contact, use "stop" instead, not "out_of_office".',
    '',

    '--- IMPORTANT ACTION PRIORITY ---',
    '',
    'When multiple intents appear in one reply, use this priority:',
    '1. Explicit opt-out → "stop"',
    '2. Automated out-of-office (with no explicit opt-out) → "out_of_office"',
    '3. Explicit meeting/call/demo request → "meeting"',
    '4. Genuine engagement/questions/objections → "continue"',
    '',
    'Do not classify a prospect as "stop" merely because they are unsure, busy, ask for pricing, raise an objection, or say they need time.',
    '',

    '--- REPLY TAGS ---',
    '',
    'Assign EXACTLY ONE tag:',
    '',
    '"INTERESTED"',
    'Use when the prospect is positively engaging, asking questions, raising an objection, or requesting more information.',
    'Must normally be paired with action "continue".',
    '',
    '"WANTS_MEETING"',
    'Use when the prospect explicitly wants a call, meeting, demo, or direct discussion.',
    'Must be paired with action "meeting".',
    '',
    '"NOT_INTERESTED"',
    'Use when the prospect clearly declines, opts out, or requests no further contact.',
    'Must be paired with action "stop".',
    '',
    '"OUT_OF_OFFICE"',
    'Use when the reply is an automated out-of-office, vacation, leave, or away message.',
    'Must be paired with action "out_of_office" (unless it also explicitly opts out, in which case use "stop" / "NOT_INTERESTED").',
    '',

    '--- CONVERSATION UNDERSTANDING ---',
    '',
    'Use the entire conversation history when deciding what to say.',
    'Understand what the prospect has already been told.',
    'Do not repeat information that has already been answered unless necessary.',
    'If the prospect asks a question, answer that question directly.',
    'If the prospect asks about pricing, provide pricing only if an actual price is available in the provided context.',
    'If pricing is unavailable, do not invent a price. Explain that you can confirm the exact pricing if appropriate.',
    '',

    OBJECTION_HANDLING_RULES,
    '',

    '--- RESPONSE STYLE ---',
    '',
    'Write like a real human having a professional business conversation.',
    'Be concise, natural, helpful, and confident.',
    'Do not sound like an automated sales bot.',
    'Do not use unnecessary corporate language.',
    'Do not repeat the same sales pitch.',
    'Do not aggressively push for a meeting.',
    'Match the prospect\u2019s level of formality.',
    'If the prospect is casual, you may be conversational.',
    'If the prospect is formal, remain professional.',
    '',

    '--- BUSINESS GOAL ---',
    '',
    'For interested prospects, move the conversation toward a useful next step.',
    'For meeting requests, make scheduling easy.',
    'For questions, provide a clear answer.',
    'For objections, respond thoughtfully rather than ignoring the concern.',
    'For opt-outs, stop selling immediately and respect the request.',
    'For automated out-of-office replies, do not generate a sales response at all.',
    '',

    '--- FACTUAL ACCURACY ---',
    '',
    'NEVER invent:',
    '- Prices',
    '- Discounts',
    '- Meeting times',
    '- Availability',
    '- Guarantees',
    '- Statistics',
    '- Customer numbers',
    '- Case studies',
    '- Results',
    '- Features not provided',
    '- Policies',
    '- Deadlines',
    '- Links',
    '',
    'Use only information available in the business context and conversation history.',
    'If information is missing, do not fabricate it.',
    '',

    SPAM_AVOIDANCE_RULES,
    '',

    '--- SUBJECT RULES ---',
    '',
    'Keep the subject natural and concise.',
    'When replying to an existing conversation, preserve the existing subject context when appropriate.',
    'Do not create a completely unrelated marketing subject.',
    'Avoid clickbait and excessive punctuation.',
    '',

    '--- EMAIL LENGTH ---',
    '',
    'Keep responses concise.',
    'Generally use 40–120 words depending on the complexity of the prospect response.',
    'Use shorter replies when the prospect gives a short response.',
    'Do not add unnecessary explanations.',
    '',

    '--- SIGNATURE ---',
    '',
    'Close every non-empty reply with:',
    'Best,',
    senderName,
    senderTitle || null,
    'Use this exact sender identity. Do not invent a different name or title.',
    '',

    '--- MEETING SLOTS ---',
    '',
    'The "meetingSlots" field is optional.',
    'Only include it when action is "meeting" AND real meeting slots are explicitly available in the provided context.',
    'Never invent meeting slots. This model does not have access to a live calendar — do not decide availability yourself.',
    'If action is not "meeting", omit "meetingSlots".',
    '',

    '--- OUTPUT FORMAT ---',
    '',
    'Return ONLY a valid JSON object.',
    'Do not return markdown.',
    'Do not return code fences.',
    'Do not return explanations.',
    'Do not return text before or after the JSON.',
    '',
    'For "continue":',
    '{"action":"continue","subject":"...","body":"...","tag":"INTERESTED"}',
    '',
    'For "meeting" with real available slots:',
    '{"action":"meeting","subject":"...","body":"...","meetingSlots":["2026-08-20T10:00:00Z","2026-08-20T14:00:00Z"],"tag":"WANTS_MEETING"}',
    '',
    'For "meeting" without available slots:',
    '{"action":"meeting","subject":"...","body":"...","tag":"WANTS_MEETING"}',
    '',
    'For "stop":',
    '{"action":"stop","subject":"...","body":"...","tag":"NOT_INTERESTED"}',
    '',
    'For an out-of-office reply:',
    '{"action":"out_of_office","subject":"","body":"","tag":"OUT_OF_OFFICE"}',
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

/* ------------------------------------------------------------------------ *
 *  RESPONSE PARSING / EXTRACTION
 * ------------------------------------------------------------------------ */

function extractContent(response: unknown): string {
  if (typeof response === 'string') return response;
  const r = response as { content?: unknown };
  if (typeof r?.content === 'string') return r.content;
  return JSON.stringify(response);
}

function parseEmailJSON(
  content: string,
  ctx: { senderName: string; senderTitle?: string },
): GeneratedEmail {
  const json = extractJSON(content);

  if (
    typeof json?.subject !== 'string' ||
    typeof json?.body !== 'string' ||
    !json.subject.trim() ||
    !json.body.trim()
  ) {
    throw new Error(`AI response missing or invalid subject/body: ${JSON.stringify(json)}`);
  }

  const email: GeneratedEmail = {
    subject: normalizeTextForEmail(json.subject),
    body: normalizeTextForEmail(json.body),
  };

  return validateGeneratedEmail(email, ctx);
}

function parseReplyDecision(content: string): ReplyDecision {
  const json = extractJSON(content);

  if (
    typeof json?.action !== 'string' ||
    typeof json?.subject !== 'string' ||
    typeof json?.body !== 'string'
  ) {
    throw new Error(`AI reply decision missing or invalid required fields: ${JSON.stringify(json)}`);
  }

  const action = json.action as ReplyAction;
  const validActions: ReplyAction[] = ['continue', 'meeting', 'stop', 'out_of_office'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid reply action: ${action}`);
  }

  const validTags: ReplyTagType[] = ['INTERESTED', 'WANTS_MEETING', 'NOT_INTERESTED', 'OUT_OF_OFFICE'];
  const tag = validTags.includes(json.tag as ReplyTagType) ? (json.tag as ReplyTagType) : undefined;

  const meetingSlots =
    Array.isArray(json.meetingSlots) && json.meetingSlots.every((s) => typeof s === 'string')
      ? (json.meetingSlots as string[])
      : undefined;

  return {
    action,
    subject: normalizeTextForEmail(json.subject),
    body: json.body.trim() ? normalizeTextForEmail(json.body) : '',
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
  console.log('[extractJSONArray] Attempting to parse response, length:', text.length);

  // Try 1: Direct JSON parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      console.log('[extractJSONArray] Success: Direct JSON parse returned array with', parsed.length, 'items');
      return parsed;
    }
    console.log('[extractJSONArray] Direct parse succeeded but not an array, type:', typeof parsed);
  } catch (e) {
    console.log('[extractJSONArray] Direct JSON parse failed:', (e as Error).message);
  }

  // Try 2: Extract from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    console.log('[extractJSONArray] Found markdown code fence, attempting to parse...');
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (Array.isArray(parsed)) {
        console.log('[extractJSONArray] Success: Code fence parse returned array with', parsed.length, 'items');
        return parsed;
      }
      console.log('[extractJSONArray] Code fence parse succeeded but not an array');
    } catch (e) {
      console.log('[extractJSONArray] Code fence parse failed:', (e as Error).message);
    }
  }

  // Try 3: Find array pattern with regex
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    console.log('[extractJSONArray] Found array pattern, attempting to parse...');
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        console.log('[extractJSONArray] Success: Regex array parse returned array with', parsed.length, 'items');
        return parsed;
      }
    } catch (e) {
      console.log('[extractJSONArray] Regex array parse failed:', (e as Error).message);
    }
  }

  console.error('[extractJSONArray] All parsing attempts failed. Response preview:', text.substring(0, 300));
  return null;
}