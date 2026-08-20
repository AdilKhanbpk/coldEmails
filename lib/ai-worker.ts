import { connectDB } from './mongodb';
import User from '../models/User';
import OutreachType from '../models/OutreachType';
import UserLead from '../models/UserLead';
import Message from '../models/Message';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { getChatModel } from './llm-provider';
import { normalizeTextForEmail } from './text-normalizer';

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
  '',
  'Your goal is NOT to simply describe our services.',
  'Your goal is to make the prospect recognize a real business opportunity or problem and start a conversation with us.',
  '',
  'EMAIL STYLE:',
  '- Write like a real person, not a marketing bot.',
  '- Be conversational, confident, professional, and direct.',
  '- Keep the language simple and easy to scan.',
  '- Avoid corporate jargon, exaggerated claims, and generic sales language.',
  '- Do not over-explain our company or services.',
  '- Focus primarily on the prospect and their potential customers.',
  '- Every sentence should have a purpose.',
  '',
  'CORE SALES ANGLE:',
  'For web-development outreach, where relevant, use this general business problem:',
  'Potential customers search online for services they need. If a business has little or no effective online presence, those customers may discover competitors instead and contact them.',
  'Position our service as a way to help the business become easier to find, present its services professionally, build trust, generate more inquiries, and ultimately increase sales.',
  'Do NOT present this as a guaranteed result.',
  'Never claim a specific percentage increase in sales, leads, traffic, or revenue unless that exact result is explicitly provided as a verified fact.',
  '',
  'PERSONALIZATION:',
  '- Use the actual lead/company information provided to you.',
  '- Personalize around the prospect when useful.',
  '- Mention a specific business opportunity only when supported by the provided information.',
  '- NEVER invent facts, problems, customers, revenue, services, locations, awards, reviews, technologies, or competitors.',
  '- NEVER use fake compliments such as "I was impressed by your company" unless the provided information genuinely supports it.',
  '- Do not mention information that is not available simply to make the email sound personalized.',
  '',
  'SEQUENCE STRATEGY:',
  '1. Email 1 — Cold introduction:',
  '   Start with a relevant business problem or opportunity.',
  '   Make the prospect think about customers they may be missing.',
  '   Briefly explain how we can help.',
  '   End with a low-friction CTA.',
  '',
  '2. Email 2 — Follow-up:',
  '   Do NOT rewrite Email 1.',
  '   Briefly reference the previous message.',
  '   Introduce a different angle, benefit, or reason to consider the offer.',
  '   Keep it short.',
  '',
  '3. Email 3+ — Follow-ups:',
  '   Each email should add something new.',
  '   Use different angles such as visibility, customer trust, mobile experience, lead generation, credibility, or converting website visitors into inquiries when relevant.',
  '   Do not repeatedly explain the same service.',
  '   Gradually become shorter and more direct.',
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
  'SUBJECT LINE RULES:',
  '- Keep subjects short, natural, and curiosity-driven.',
  '- Prefer 3–7 words when possible.',
  '- Make every subject different.',
  '- Avoid clickbait.',
  '- Avoid excessive punctuation.',
  '- Avoid ALL CAPS.',
  '- Avoid generic subjects such as "Web Development Services", "Business Proposal", or "Website Services".',
  '',
  'CTA RULES:',
  '- Every email must have one clear call-to-action.',
  '- Keep the CTA low-friction.',
  '- Prefer asking for a short conversation, permission to send ideas, or permission to show what could be improved.',
  '- Do not ask for a large commitment in the first email.',
  '',
  'LENGTH RULES:',
  '- Email 1: ideally 80–130 words.',
  '- Follow-ups: ideally 40–100 words.',
  '- Never exceed 150 words per email.',
  '- Use short paragraphs.',
  '- Bullets may be used sparingly when they genuinely improve readability.',
  '',
  'IMPORTANT:',
  '- Do NOT output placeholders such as "[Name]", "[Company]", "${companyName}", "company name", "<company>", or similar.',
  '- Always use the real lead information provided in the lead data.',
  '- If a specific fact is unavailable, simply write around it instead of inventing it.',
  '- Do not include discounts, prices, guarantees, statistics, case studies, or results unless they are explicitly provided.',
  '- Do not claim that we reviewed the prospect website unless the input confirms that we did.',
  '- Do not claim that the prospect is losing customers unless presenting it as a possibility.',
  '- Never guarantee increased sales or revenue.',
  '',
  'QUALITY CHECK BEFORE RETURNING:',
  '- Does Email 1 immediately communicate a relevant business problem or opportunity?',
  '- Is the prospect the focus rather than our company?',
  '- Does every email add a new reason to respond?',
  '- Do the emails sound like a human wrote them?',
  '- Are there any unsupported claims?',
  '- Are the emails concise?',
  '- Are all CTAs clear and low-friction?',
  '- Are all subject lines different?',
  '- Does the sequence feel connected rather than like separate emails?',
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
  'Focus on the lead and their business, not on describing our company.',
  'Identify a relevant business opportunity, pain point, or potential missed opportunity from the information provided.',
  'Where relevant, explain how our services could help them attract more customers, improve their online presence, generate more leads, or increase sales.',
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
  'The sequence should become progressively shorter and more direct.',
  'Make the emails feel like a real human conversation rather than an automated campaign.',
  '',
  '--- PERSONALIZATION ---',
  'Use the lead information provided above to personalize the emails wherever relevant.',
  'Use the actual company name and available business details.',
  'Do not invent facts about the lead or their business.',
  'If the lead information does not support a specific claim, do not make that claim.',
  'Do not use generic compliments or fake observations just to make the email appear personalized.',
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
  return parseEmailSequence(content, totalSteps);
}

function parseEmailSequence(content: string, expectedCount: number): GeneratedEmail[] {
  const arr = extractJSONArray(content);

  if (!Array.isArray(arr)) {
    // Log the actual response for debugging
    console.error('[parseEmailSequence] AI response was not a JSON array. Raw content:', content.substring(0, 500));
    throw new Error(`AI did not return a JSON array for the sequence. Response type: ${typeof arr}. First 200 chars: ${content.substring(0, 200)}`);
  }

  const emails: GeneratedEmail[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i] as Record<string, unknown>;
    if (!item?.subject || !item?.body) {
      console.error(`[parseEmailSequence] Item ${i + 1} is invalid:`, item);
      throw new Error(`AI sequence item ${i + 1} is missing subject or body. Item: ${JSON.stringify(item)}`);
    }
    emails.push({ 
      subject: normalizeTextForEmail(item.subject as string), 
      body: normalizeTextForEmail(item.body as string) 
    });
  }

  if (emails.length < expectedCount) {
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
  '',

  // 3. Writing objective
  'YOUR PRIMARY OBJECTIVE:',
  'Write a personalized outreach email that earns a reply and starts a business conversation.',
  'Do not try to close the entire sale in the first email.',
  'The email should make the prospect recognize a relevant business opportunity, problem, or missed opportunity and understand how our services could help.',
  '',

  // 4. Examples / voice
  'VOICE AND STYLE:',
  'The following examples demonstrate the desired tone, structure, and writing style.',
  'Study them carefully and match their overall voice.',
  'Do NOT copy sentences, phrases, or wording verbatim.',
  'The final email must be original and personalized to the specific lead.',
  '',
  ctx.exampleEmails.length > 0
    ? ctx.exampleEmails
        .map((e, i) => `Example ${i + 1}:\n${e}`)
        .join('\n\n---\n\n')
    : '(No example emails provided. Use a professional, conversational, human B2B outreach tone.)',
  '',

  // 5. Prospect-first approach
  'PROSPECT-FIRST RULE:',
  'Focus primarily on the prospect and their business, not on our company.',
  'Do not begin with a long introduction about who we are.',
  'Do not list all of our services unless necessary.',
  'Lead with a relevant problem, opportunity, observation, or business outcome.',
  'Explain our service only after establishing why it could matter to the prospect.',
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
  'PERSONALIZATION RULES:',
  'Use the real lead information provided in the user message.',
  'Use the actual company name and relevant business details whenever available.',
  'Personalize based on facts, not assumptions.',
  'Never invent information about the lead.',
  'Never use fake compliments such as "I was impressed by your company" unless the provided information genuinely supports that statement.',
  'Do not claim that you visited, reviewed, analyzed, or audited the lead website unless that actually happened and is included in the provided information.',
  '',

  // 8. Human writing
  'HUMAN WRITING RULES:',
  'Write like a real salesperson or business owner sending a personal email.',
  'Be conversational, confident, helpful, and direct.',
  'Avoid sounding like an AI-generated marketing template.',
  'Avoid excessive enthusiasm.',
  'Avoid corporate jargon.',
  'Avoid unnecessary adjectives.',
  'Avoid long explanations.',
  'Avoid phrases such as "I hope this email finds you well" unless specifically requested.',
  'Avoid generic openings such as "I am reaching out to offer our services."',
  '',

  // 9. Length
  'LENGTH:',
  'Keep the email concise and easy to scan.',
  'Target approximately 80–130 words.',
  'Never exceed 150 words unless explicitly requested.',
  'Use short paragraphs.',
  'Every sentence should contribute to the purpose of the email.',
  '',

  // 10. Subject
  'SUBJECT LINE:',
  'Create a short, natural, specific subject line.',
  'Prefer approximately 3–7 words.',
  'Make it relevant to the prospect.',
  'Avoid clickbait.',
  'Avoid excessive punctuation.',
  'Avoid ALL CAPS.',
  'Avoid generic subjects such as "Business Proposal", "Web Development Services", or "Our Services".',
  '',

  // 11. CTA
  'CALL-TO-ACTION:',
  'Always end with one clear, low-friction CTA.',
  'The goal is to make replying easy.',
  'Examples include asking whether they are open to a quick conversation, whether they would like a few ideas, or whether they would like to see what could be improved.',
  'Do not ask for a large commitment in the first email.',
  'Do not use multiple competing CTAs.',
  '',

  // 12. Follow-ups
  'FOLLOW-UP RULES:',
  'For follow-up emails, naturally acknowledge the previous conversation when appropriate.',
  'Do NOT repeatedly say "just following up".',
  'Do NOT simply rewrite the previous email.',
  'Each follow-up should introduce a new angle, benefit, insight, or reason to respond.',
  'Make each follow-up progressively shorter and more direct.',
  'Never guilt the prospect for not responding.',
  'Never use fake urgency or pressure.',
  '',

  // 13. Accuracy
  'ACCURACY RULES:',
  'Use ONLY information provided in the lead data, business context, and examples.',
  'If a specific fact is unavailable, do not invent it.',
  'Simply write around missing information.',
  'Do not write "I will confirm and follow up" merely because information is missing.',
  'Never invent prices, discounts, guarantees, deadlines, statistics, or results.',
  '',

  // 14. Placeholder protection
  'PLACEHOLDER RULE:',
  "NEVER output placeholders such as '[Name]', '[Company]', '[Business Name]', '${companyName}', 'company name', '<company>', or similar.",
  'Always use the actual lead information when it is available.',
  '',

  // 15. Final quality check
  'BEFORE RETURNING THE EMAIL, CHECK:',
  '1. Is this clearly written for this specific prospect?',
  '2. Does the opening create interest quickly?',
  '3. Is the prospect the focus rather than our business?',
  '4. Is there a clear business benefit?',
  '5. Does the email sound human rather than automated?',
  '6. Are all claims supported by the provided information?',
  '7. Is the email concise?',
  '8. Is there exactly one clear CTA?',
  '9. Is the subject short and relevant?',
  '10. Are there no placeholders?',
  '',

  // 16. Output
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

  // Include conversation history for follow-ups (step 2+) with clear formatting
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
  ].filter(Boolean).join('\n');

  const userContent = `Write step ${ctx.stepNumber} of the outreach sequence for the following lead:\n\n${leadInfo}${historySection}${emphasisSection}\n\nGenerate a personalized email using the lead details above. Return JSON with "subject" and "body" keys.`;

  // Construct messages with lead details emphasized
  const messages = [
    new SystemMessage(systemMessageText),
    new HumanMessage(userContent),
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
  'You are an AI assistant managing B2B email outreach conversations on behalf of a business.',
  `Business: ${user.businessName}`,
  `Description: ${user.businessDescription}`,
  `Services: ${user.services.join(', ')}`,
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
  'Use when the prospect is engaging with the conversation and has not explicitly requested a meeting or asked to stop contact.',
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
  '',
  'Generate: A concise, contextual reply that answers their question and naturally moves the conversation toward the next step.',
  '',

  '2. "meeting"',
  'Use when the prospect explicitly or clearly wants to speak, meet, call, have a demo, or discuss the opportunity directly.',
  '',
  'Examples:',
  '- "Can we schedule a call?"',
  '- "Are you available tomorrow?"',
  '- "Let’s discuss this"',
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

  '--- IMPORTANT ACTION PRIORITY ---',
  '',
  'When multiple intents appear in one reply, use this priority:',
  '1. Explicit opt-out → "stop"',
  '2. Explicit meeting/call/demo request → "meeting"',
  '3. Genuine engagement/questions → "continue"',
  '',
  'Do not classify a prospect as "stop" merely because they are unsure, busy, ask for pricing, raise an objection, or say they need time.',
  '',

  '--- REPLY TAGS ---',
  '',
  'Assign EXACTLY ONE tag:',
  '',
  '"INTERESTED"',
  'Use when the prospect is positively engaging, asking questions, or requesting more information.',
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
  'An out-of-office message is NOT an opt-out.',
  'Do not treat an OOO message as "NOT_INTERESTED".',
  'Do not attempt to sell anything in response to an automated OOO message.',
  'Use action "continue" unless the message also explicitly requests no further contact.',
  '',

  '--- CONVERSATION UNDERSTANDING ---',
  '',
  'Use the entire conversation history when deciding what to say.',
  'Understand what the prospect has already been told.',
  'Do not repeat information that has already been answered unless necessary.',
  'If the prospect asks a question, answer that question directly.',
  'If the prospect raises an objection, acknowledge it respectfully and respond to the objection without becoming pushy.',
  'If the prospect asks about pricing, provide pricing only if an actual price is available in the provided context.',
  'If pricing is unavailable, do not invent a price. Explain that you can confirm the exact pricing if appropriate.',
  '',

  '--- RESPONSE STYLE ---',
  '',
  'Write like a real human having a professional business conversation.',
  'Be concise, natural, helpful, and confident.',
  'Do not sound like an automated sales bot.',
  'Do not use unnecessary corporate language.',
  'Do not repeat the same sales pitch.',
  'Do not aggressively push for a meeting.',
  'Match the prospect’s level of formality.',
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

  '--- MEETING SLOTS ---',
  '',
  'The "meetingSlots" field is optional.',
  'Only include it when action is "meeting" AND real meeting slots are explicitly available in the provided context.',
  'Never invent meeting slots.',
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
  '{"action":"continue","subject":"...","body":"...","tag":"OUT_OF_OFFICE"}',
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
  return { 
    subject: normalizeTextForEmail(json.subject as string), 
    body: normalizeTextForEmail(json.body as string) 
  };
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
    subject: normalizeTextForEmail(json.subject as string),
    body: normalizeTextForEmail(json.body as string),
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
