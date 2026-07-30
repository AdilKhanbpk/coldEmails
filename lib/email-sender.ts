import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { decryptJSON } from './crypto';
import { Inbox } from '@prisma/client';

export interface SendResult {
  providerMessageId: string;
  threadId?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from: string;
}

interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

interface OutlookCredentials {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

interface SMTPCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
}

export async function sendEmail(inbox: Inbox, payload: EmailPayload): Promise<SendResult> {
  switch (inbox.provider) {
    case 'GMAIL':
      return sendViaGmail(inbox, payload);
    case 'OUTLOOK':
      return sendViaOutlook(inbox, payload);
    case 'SMTP':
      return sendViaSMTP(inbox, payload);
    default:
      throw new Error(`Unsupported provider: ${inbox.provider}`);
  }
}

async function sendViaGmail(inbox: Inbox, payload: EmailPayload): Promise<SendResult> {
  const creds = decryptJSON<GmailCredentials>(inbox.credentials);
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2Client.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const headers = [
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
  ];
  if (payload.html) {
    headers.push('Content-Type: text/html; charset=utf-8', '', payload.html);
  } else {
    headers.push('Content-Type: text/plain; charset=utf-8', '', payload.text);
  }
  const rawMessage = headers.join('\r\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
    return {
      providerMessageId: res.data.id || '',
      threadId: res.data.threadId || undefined,
    };
  } catch (error) {
    if (isAuthError(error)) throw new AuthError('Gmail authentication failed. Token may be expired.');
    if (isBounceError(error)) throw new BounceError('Hard bounce: email address is invalid or does not exist.');
    throw error;
  }
}

async function sendViaOutlook(inbox: Inbox, payload: EmailPayload): Promise<SendResult> {
  const creds = decryptJSON<OutlookCredentials>(inbox.credentials);

  const client = Client.init({
    authProvider: async (done) => done(null, creds.accessToken),
  });

  try {
    const mail = {
      message: {
        subject: payload.subject,
        body: payload.html
          ? { contentType: 'HTML', content: payload.html }
          : { contentType: 'text', content: payload.text },
        toRecipients: [{ emailAddress: { address: payload.to } }],
      },
      saveToSentItems: true,
    };

    await client.api('/me/sendMail').post(mail);
    return {
      providerMessageId: `outlook-${Date.now()}`,
      threadId: undefined,
    };
  } catch (error) {
    if (isAuthError(error)) throw new AuthError('Outlook authentication failed. Token may be expired.');
    if (isBounceError(error)) throw new BounceError('Hard bounce: email address is invalid or does not exist.');
    throw error;
  }
}

async function sendViaSMTP(inbox: Inbox, payload: EmailPayload): Promise<SendResult> {
  const creds = decryptJSON<SMTPCredentials>(inbox.credentials);

  const transporter = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.username, pass: creds.password },
  });

  try {
    const info = await transporter.sendMail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return {
      providerMessageId: info.messageId,
      threadId: undefined,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('EAUTH') || msg.includes('Invalid login') || msg.includes('authentication'))
      throw new AuthError('SMTP authentication failed. Check your credentials.');
    if (msg.includes('bounce') || msg.includes('550') || msg.includes('rejected'))
      throw new BounceError('Hard bounce: email address was rejected by the server.');
    throw error;
  }
}

export async function testSMTPConnection(creds: SMTPCredentials): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.username, pass: creds.password },
  });
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class BounceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BounceError';
  }
}

function isAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('401') || msg.includes('403') || msg.includes('invalid_grant') || msg.includes('unauthorized');
}

function isBounceError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('550') || msg.includes('bounce') || msg.includes('User not found') || msg.includes('does not exist');
}
