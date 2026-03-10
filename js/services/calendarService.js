// services/calendarService.js
// Google Calendar API v3 — OAuth via Google Identity Services.
// Shares the same GIS token infrastructure as driveService.

import { dataService } from '../dataService.js';
import { ensureAuth as driveEnsureAuth, getToken, clearToken, isAuthed } from './driveService.js';

// ── Calendar-specific scope ───────────────────────────────────────────────────
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

// ── Auth (piggy-backs on driveService, merges calendar scope) ─────────────────
export async function ensureAuth() {
  return driveEnsureAuth([CALENDAR_SCOPE]);
}

export function isConnected() {
  return !!dataService.getSettings().gcalClientId;
}

// ── Base request ──────────────────────────────────────────────────────────────
async function request(method, path, { params, body } = {}) {
  if (!isAuthed()) await ensureAuth();

  const url = new URL(`${CALENDAR_BASE}/${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const opts = {
    method,
    headers: { Authorization: `Bearer ${getToken()}` },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  if (res.status === 401) { clearToken(); throw new CalendarError('token_expired', 'Session expired. Please reconnect.'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new CalendarError('api_error', err.error?.message || `Calendar API error: ${res.status}`);
  }
  if (res.status === 204) return null; // DELETE / no content
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all calendars the user has access to.
 */
export async function listCalendars() {
  const data = await request('GET', 'users/me/calendarList', {
    params: { minAccessRole: 'reader' },
  });
  return data.items || [];
}

/**
 * List events from a calendar.
 * @param {{
 *   calendarId?:  string,
 *   timeMin?:     string,  // ISO 8601
 *   timeMax?:     string,  // ISO 8601
 *   maxResults?:  number,
 *   singleEvents?: boolean,
 *   orderBy?:     string,
 *   pageToken?:   string,
 *   q?:           string,  // text search
 * }} options
 */
export async function listEvents({
  calendarId  = 'primary',
  timeMin,
  timeMax,
  maxResults  = 50,
  singleEvents = true,
  orderBy     = 'startTime',
  pageToken,
  q,
} = {}) {
  const params = { maxResults, singleEvents, orderBy };
  if (timeMin)    params.timeMin    = timeMin;
  if (timeMax)    params.timeMax    = timeMax;
  if (pageToken)  params.pageToken  = pageToken;
  if (q)          params.q          = q;

  const data = await request('GET', `calendars/${encodeURIComponent(calendarId)}/events`, { params });
  return {
    events:   data.items || [],
    nextPage: data.nextPageToken || null,
  };
}

/**
 * Get a single event.
 * @param {string} eventId
 * @param {string} calendarId
 */
export async function getEvent(eventId, calendarId = 'primary') {
  return request('GET', `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
}

/**
 * Create a new event.
 * @param {Object} event  - Google Calendar event resource
 * @param {string} calendarId
 */
export async function createEvent(event, calendarId = 'primary') {
  return request('POST', `calendars/${encodeURIComponent(calendarId)}/events`, { body: event });
}

/**
 * Create an event from an Easy Bees gig object.
 * @param {{ name, startDate, endDate, startTime, endTime, city, notes, rate }} gig
 * @param {string} calendarId
 */
export async function createEventFromGig(gig, calendarId = 'primary') {
  const startDT = gig.startTime
    ? `${gig.startDate}T${gig.startTime}:00`
    : gig.startDate;
  const endDT = gig.endTime
    ? `${gig.endDate || gig.startDate}T${gig.endTime}:00`
    : gig.endDate || gig.startDate;

  const isAllDay = !gig.startTime;

  const event = {
    summary:     gig.name,
    description: [
      gig.notes   ? `Notes: ${gig.notes}`   : '',
      gig.rate    ? `Rate: $${gig.rate}`    : '',
    ].filter(Boolean).join('\n'),
    location: gig.city || '',
    start: isAllDay ? { date: startDT } : { dateTime: startDT },
    end:   isAllDay ? { date: endDT   } : { dateTime: endDT   },
    colorId: '5', // banana yellow — closest to brand amber
  };

  return createEvent(event, calendarId);
}

/**
 * Update an existing event.
 * @param {string} eventId
 * @param {Object} patch
 * @param {string} calendarId
 */
export async function updateEvent(eventId, patch, calendarId = 'primary') {
  return request('PATCH', `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    body: patch,
  });
}

/**
 * Delete an event.
 * @param {string} eventId
 * @param {string} calendarId
 */
export async function deleteEvent(eventId, calendarId = 'primary') {
  return request('DELETE', `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
}

/**
 * Get upcoming events for the next N days.
 * @param {number} days
 * @param {string} calendarId
 */
export async function getUpcoming(days = 30, calendarId = 'primary') {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  return listEvents({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 50,
  });
}

// ── Utility: convert Google event to display object ────────────────────────────
export function normalizeEvent(ev) {
  const start = ev.start?.dateTime || ev.start?.date || '';
  const end   = ev.end?.dateTime   || ev.end?.date   || '';
  return {
    id:          ev.id,
    title:       ev.summary || '(No title)',
    start,
    end,
    allDay:      !!ev.start?.date,
    location:    ev.location || '',
    description: ev.description || '',
    link:        ev.htmlLink || '',
    color:       ev.colorId || null,
  };
}

// ── Error class ────────────────────────────────────────────────────────────────
export class CalendarError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'CalendarError';
  }
}
