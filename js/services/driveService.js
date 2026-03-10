// services/driveService.js
// Google Drive API v3 — OAuth via Google Identity Services.
// Shared token with calendarService (same client ID, merged scopes).

import { dataService } from '../dataService.js';

// ── Scopes ───────────────────────────────────────────────────────────────────
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// ── Token store (module-level, not persisted) ─────────────────────────────────
let _token       = null;
let _tokenExpiry = 0; // ms epoch

export function getToken()    { return _token; }
export function clearToken()  { _token = null; _tokenExpiry = 0; }
export function isConnected() { return !!dataService.getSettings().gcalClientId; }
export function isAuthed()    { return !!_token && Date.now() < _tokenExpiry; }

// ── GIS loader ────────────────────────────────────────────────────────────────
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src    = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * Ensure we have a valid access token. Prompts silently if expired.
 * @param {string[]} extraScopes - merge additional scopes (e.g. calendar)
 */
export async function ensureAuth(extraScopes = []) {
  if (isAuthed()) return true;

  const clientId = dataService.getSettings().gcalClientId || dataService.getSettings().gmailClientId;
  if (!clientId) throw new DriveError('no_client_id', 'No Google OAuth Client ID configured. Add one in Profile → Connected Accounts.');

  await loadGIS();
  const scopes = [DRIVE_SCOPE, ...extraScopes].join(' ');

  return new Promise((resolve, reject) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:     scopes,
      callback: resp => {
        if (resp.error) { reject(new DriveError('auth_error', resp.error)); return; }
        _token       = resp.access_token;
        _tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
        resolve(true);
      },
    }).requestAccessToken({ prompt: '' });
  });
}

// ── Base request ──────────────────────────────────────────────────────────────
async function request(method, path, { params, body } = {}) {
  if (!isAuthed()) await ensureAuth();

  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const opts = {
    method,
    headers: { Authorization: `Bearer ${_token}` },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  if (res.status === 401) { clearToken(); throw new DriveError('token_expired', 'Session expired. Please reconnect.'); }
  if (!res.ok) throw new DriveError('api_error', `Drive API error: ${res.status}`);
  return res.json();
}

// ── File fields helper ────────────────────────────────────────────────────────
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,createdTime,webViewLink,owners,shared,thumbnailLink';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List files from Drive.
 * @param {{ pageSize?, pageToken?, orderBy?, query? }} options
 */
export async function listFiles({ pageSize = 50, pageToken, orderBy = 'modifiedTime desc', query } = {}) {
  const params = {
    pageSize,
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    orderBy,
  };
  if (pageToken) params.pageToken = pageToken;
  if (query)     params.q         = query;

  const data = await request('GET', 'files', { params });
  return {
    files:     data.files || [],
    nextPage:  data.nextPageToken || null,
  };
}

/**
 * Get metadata for a single file.
 * @param {string} fileId
 */
export async function getFile(fileId) {
  return request('GET', `files/${fileId}`, { params: { fields: FILE_FIELDS } });
}

/**
 * Search files by name or content.
 * @param {string} term
 */
export async function searchFiles(term) {
  return listFiles({ query: `name contains '${term.replace(/'/g, "\\'")}' and trashed = false` });
}

/**
 * Get a shareable link for a file (already in webViewLink but exposed explicitly).
 * @param {string} fileId
 */
export async function getShareLink(fileId) {
  const f = await getFile(fileId);
  return f.webViewLink || null;
}

/**
 * Download file content as ArrayBuffer (for small non-Google-Docs files).
 * @param {string} fileId
 */
export async function downloadFile(fileId) {
  if (!isAuthed()) await ensureAuth();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${_token}` },
  });
  if (!res.ok) throw new DriveError('download_error', `Failed to download file: ${res.status}`);
  return res.arrayBuffer();
}

// ── Error class ───────────────────────────────────────────────────────────────
export class DriveError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'DriveError';
  }
}
