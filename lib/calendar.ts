import { connectDB } from './mongodb';
import User from '../models/User';
import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { decryptJSON } from './crypto';

interface GoogleCalendarCreds {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

interface OutlookCalendarCreds {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export interface BusySlot {
  start: Date;
  end: Date;
}

export async function getCalendarAvailability(userId: string): Promise<BusySlot[]> {
  await connectDB();
  const user = await User.findById(userId).select('calendarProvider calendarCredentials').lean();

  if (!user?.calendarCredentials) return [];

  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 14);

  if (user.calendarProvider === 'google') {
    return getGoogleBusySlots(user.calendarCredentials, timeMin, timeMax);
  } else if (user.calendarProvider === 'outlook') {
    return getOutlookBusySlots(user.calendarCredentials, timeMin, timeMax);
  }

  return [];
}

async function getGoogleBusySlots(
  encryptedCreds: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusySlot[]> {
  const creds = decryptJSON<GoogleCalendarCreds>(encryptedCreds);
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2Client.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const calendars = res.data.calendars || {};
    const busy: BusySlot[] = [];
    for (const cal of Object.values(calendars)) {
      for (const b of cal.busy || []) {
        busy.push({ start: new Date(b.start || ''), end: new Date(b.end || '') });
      }
    }
    return busy;
  } catch {
    return [];
  }
}

async function getOutlookBusySlots(
  encryptedCreds: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusySlot[]> {
  const creds = decryptJSON<OutlookCalendarCreds>(encryptedCreds);
  const client = Client.init({
    authProvider: async (done) => done(null, creds.accessToken),
  });

  try {
    const res = await client
      .api('/me/calendar/getSchedule')
      .post({
        schedules: ['/me/calendar'],
        startTime: { dateTime: timeMin.toISOString(), timeZone: 'UTC' },
        endTime: { dateTime: timeMax.toISOString(), timeZone: 'UTC' },
        availabilityViewInterval: 30,
      });

    const busy: BusySlot[] = [];
    for (const item of res.value || []) {
      for (const slot of item.scheduleItems || []) {
        busy.push({ start: new Date(slot.start.dateTime), end: new Date(slot.end.dateTime) });
      }
    }
    return busy;
  } catch {
    return [];
  }
}

export interface CreateEventParams {
  title: string;
  start: Date;
  end: Date;
  attendeeEmail: string;
}

export async function createCalendarEvent(
  userId: string,
  params: CreateEventParams,
): Promise<string | null> {
  await connectDB();
  const user = await User.findById(userId).select('calendarProvider calendarCredentials').lean();

  if (!user?.calendarCredentials) return null;

  if (user.calendarProvider === 'google') {
    return createGoogleEvent(user.calendarCredentials, params);
  } else if (user.calendarProvider === 'outlook') {
    return createOutlookEvent(user.calendarCredentials, params);
  }

  return null;
}

async function createGoogleEvent(
  encryptedCreds: string,
  params: CreateEventParams,
): Promise<string | null> {
  const creds = decryptJSON<GoogleCalendarCreds>(encryptedCreds);
  const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2Client.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: params.title,
        start: { dateTime: params.start.toISOString() },
        end: { dateTime: params.end.toISOString() },
        attendees: [{ email: params.attendeeEmail }],
        conferenceData: {
          createRequest: { requestId: `meeting-${Date.now()}` },
        },
      },
    });

    const entryPoints = res.data.conferenceData?.entryPoints;
    if (entryPoints && entryPoints.length > 0) {
      const meetEntry = entryPoints.find((e) => e.entryPointType === 'video');
      if (meetEntry?.uri) return meetEntry.uri;
    }
    return res.data.hangoutLink || null;
  } catch {
    return null;
  }
}

async function createOutlookEvent(
  encryptedCreds: string,
  params: CreateEventParams,
): Promise<string | null> {
  const creds = decryptJSON<OutlookCalendarCreds>(encryptedCreds);
  const client = Client.init({
    authProvider: async (done) => done(null, creds.accessToken),
  });

  try {
    const res = await client.api('/me/events').post({
      subject: params.title,
      start: { dateTime: params.start.toISOString(), timeZone: 'UTC' },
      end: { dateTime: params.end.toISOString(), timeZone: 'UTC' },
      attendees: [
        {
          emailAddress: { address: params.attendeeEmail },
          type: 'required',
        },
      ],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    });

    return res.onlineMeeting?.joinUrl || res.onlineMeetingUrl || null;
  } catch {
    return null;
  }
}
