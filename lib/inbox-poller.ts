import { connectDB } from './mongodb';
import Inbox from '../models/Inbox';
import Message from '../models/Message';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { decryptJSON } from './crypto';
import { processIncomingReply } from './email-worker';

interface GmailCreds {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

interface OutlookCreds {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export async function pollInboxes(): Promise<{ checked: number; newReplies: number }> {
  await connectDB();
  const inboxes = await Inbox.find({ status: 'CONNECTED' }).lean();

  let checked = 0;
  let newReplies = 0;

  for (const inbox of inboxes) {
    try {
      if (inbox.provider === 'GMAIL') {
        const count = await pollGmailInbox(inbox);
        newReplies += count;
      } else if (inbox.provider === 'OUTLOOK') {
        const count = await pollOutlookInbox(inbox);
        newReplies += count;
      }
      checked++;
    } catch {
      // Individual inbox failure shouldn't stop others
    }
  }

  return { checked, newReplies };
}

/**
 * Poll all connected inboxes for messages received within the last `minutes`.
 * When `skipAI` is true, the incoming replies are stored but AI reply handling
 * (deciding/generating responses) is skipped.
 */
export async function pollInboxesSince(minutes: number, skipAI = true): Promise<{ checked: number; newReplies: number }> {
  await connectDB();
  const inboxes = await Inbox.find({ status: 'CONNECTED' }).lean();

  let checked = 0;
  let newReplies = 0;

  const cutoff = Date.now() - minutes * 60 * 1000;

  for (const inbox of inboxes) {
    try {
      if (inbox.provider === 'GMAIL') {
        const count = await pollGmailInboxSince(inbox, cutoff, skipAI);
        newReplies += count;
      } else if (inbox.provider === 'OUTLOOK') {
        const count = await pollOutlookInboxSince(inbox, cutoff, skipAI);
        newReplies += count;
      }
      checked++;
    } catch {
      // ignore individual inbox failures
    }
  }

  return { checked, newReplies };
}

async function pollGmailInbox(inbox: any): Promise<number> {
  const creds = decryptJSON<GmailCreds>(inbox.credentials);
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2Client.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  let count = 0;

  try {
    const afterDate = new Date();
    afterDate.setHours(afterDate.getHours() - 24);
    const afterSec = Math.floor(afterDate.getTime() / 1000);

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${afterSec} is:inbox`,
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    for (const msg of messages) {
      if (!msg.id) continue;

      const existing = await Message.findOne({ providerMessageId: msg.id });
      if (existing) continue;

      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = fullMsg.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === 'Subject')?.value || '';
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const senderEmail = extractEmailAddress(from);

      const body = extractBody(fullMsg.data.payload);

      await processIncomingReply(
        inbox._id.toString(),
        fullMsg.data.threadId || null,
        senderEmail,
        subject,
        body,
        msg.id,
      );
      count++;
    }
  } catch {
    // Auth or API error
  }

  return count;
}

async function pollOutlookInbox(inbox: any): Promise<number> {
  const creds = decryptJSON<OutlookCreds>(inbox.credentials);
  const client = Client.init({
    authProvider: async (done) => done(null, creds.accessToken),
  });
  let count = 0;

  try {
    const res = await client
      .api('/me/messages?$filter=receivedDateTime ge 2024-01-01T00:00:00Z&$top=20')
      .get();

    for (const msg of res.value || []) {
      const existing = await Message.findOne({ providerMessageId: msg.id });
      if (existing) continue;

      const senderEmail = msg.from?.emailAddress?.address || '';
      const subject = msg.subject || '';
      const body = msg.body?.content || '';
      const conversationId = msg.conversationId || null;

      await processIncomingReply(
        inbox._id.toString(),
        conversationId,
        senderEmail,
        subject,
        body,
        msg.id,
      );
      count++;
    }
  } catch {
    // Auth or API error
  }

  return count;
}

async function pollGmailInboxSince(inbox: any, cutoffMs: number, skipAI = true): Promise<number> {
  const creds = decryptJSON<GmailCreds>(inbox.credentials);
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2Client.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  let count = 0;

  try {
    const afterSec = Math.floor(cutoffMs / 1000);
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${afterSec} is:inbox`,
      maxResults: 50,
    });

    const messages = listRes.data.messages || [];
    for (const msg of messages) {
      if (!msg.id) continue;

      const existing = await Message.findOne({ providerMessageId: msg.id });
      if (existing) continue;

      const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });

      const headers = fullMsg.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === 'Subject')?.value || '';
      const from = headers.find((h) => h.name === 'From')?.value || '';
      const senderEmail = extractEmailAddress(from);

      const body = extractBody(fullMsg.data.payload);

      await processIncomingReply(
        inbox._id.toString(),
        fullMsg.data.threadId || null,
        senderEmail,
        subject,
        body,
        msg.id,
        skipAI,
      );
      count++;
    }
  } catch {
    // Auth or API error
  }

  return count;
}

async function pollOutlookInboxSince(inbox: any, cutoffMs: number, skipAI = true): Promise<number> {
  const creds = decryptJSON<OutlookCreds>(inbox.credentials);
  const client = Client.init({ authProvider: async (done) => done(null, creds.accessToken) });
  let count = 0;

  try {
    const cutoffIso = new Date(cutoffMs).toISOString();
    const res = await client.api(`/me/messages?$filter=receivedDateTime ge ${cutoffIso}&$top=50`).get();

    for (const msg of res.value || []) {
      const existing = await Message.findOne({ providerMessageId: msg.id });
      if (existing) continue;

      const senderEmail = msg.from?.emailAddress?.address || '';
      const subject = msg.subject || '';
      const body = msg.body?.content || '';
      const conversationId = msg.conversationId || null;

      await processIncomingReply(
        inbox._id.toString(),
        conversationId,
        senderEmail,
        subject,
        body,
        msg.id,
        skipAI,
      );
      count++;
    }
  } catch {
    // Auth or API error
  }

  return count;
}

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1];
  return fromHeader.trim();
}

function extractBody(payload: unknown): string {
  const p = payload as { body?: { data?: string }; parts?: { body?: { data?: string } }[] };
  if (p?.body?.data) {
    return Buffer.from(p.body.data, 'base64').toString('utf-8');
  }
  if (p?.parts) {
    for (const part of p.parts) {
      if (part?.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }
  return '';
}
