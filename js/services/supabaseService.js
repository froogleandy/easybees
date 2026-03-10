// services/supabaseService.js
// Supabase client — auth, database, and storage.
// Credentials stored in eb_settings: supabaseUrl + supabaseAnonKey.
// When connected, syncs key Easy Bees data to Supabase in addition to localStorage.

import { dataService } from '../dataService.js';

// ── Config ────────────────────────────────────────────────────────────────────
let _client = null;

function getConfig() {
  const s = dataService.getSettings();
  return { url: s.supabaseUrl || '', key: s.supabaseAnonKey || '' };
}

export function isConnected() {
  const { url, key } = getConfig();
  return !!(url && key);
}

// ── Lazy Supabase JS client (loads from CDN once) ─────────────────────────────
async function getClient() {
  if (_client) return _client;
  if (!isConnected()) throw new SupabaseError('not_configured', 'Supabase not configured. Add URL and anon key in Profile → Connected Accounts.');

  // Load supabase-js from CDN if not already present
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s  = document.createElement('script');
      s.src    = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const { url, key } = getConfig();
  _client = window.supabase.createClient(url, key);
  return _client;
}

export function resetClient() { _client = null; }

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Sign up with email + password via Supabase Auth.
 */
export async function signUp(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new SupabaseError('auth_error', error.message);
  return data;
}

/**
 * Sign in with email + password.
 */
export async function signIn(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new SupabaseError('auth_error', error.message);
  return data;
}

/**
 * Sign out current Supabase session.
 */
export async function signOut() {
  const sb = await getClient();
  const { error } = await sb.auth.signOut();
  if (error) throw new SupabaseError('auth_error', error.message);
}

/**
 * Get current Supabase session.
 */
export async function getSession() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

// ── Database ──────────────────────────────────────────────────────────────────

/**
 * Insert a row into a table.
 * @param {string} table
 * @param {Object|Object[]} rows
 */
export async function insert(table, rows) {
  const sb  = await getClient();
  const arr = Array.isArray(rows) ? rows : [rows];
  const { data, error } = await sb.from(table).insert(arr).select();
  if (error) throw new SupabaseError('db_error', error.message);
  return data;
}

/**
 * Upsert rows (insert or update on conflict).
 * @param {string} table
 * @param {Object|Object[]} rows
 * @param {string} onConflict - column name for conflict resolution
 */
export async function upsert(table, rows, onConflict = 'id') {
  const sb  = await getClient();
  const arr = Array.isArray(rows) ? rows : [rows];
  const { data, error } = await sb.from(table).upsert(arr, { onConflict }).select();
  if (error) throw new SupabaseError('db_error', error.message);
  return data;
}

/**
 * Select rows from a table.
 * @param {string} table
 * @param {{ columns?, filters?, limit?, order? }} options
 */
export async function select(table, { columns = '*', filters = {}, limit, order } = {}) {
  const sb = await getClient();
  let q = sb.from(table).select(columns);
  Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
  if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new SupabaseError('db_error', error.message);
  return data || [];
}

/**
 * Delete rows matching filters.
 * @param {string} table
 * @param {Object} filters - e.g. { id: '123' }
 */
export async function remove(table, filters = {}) {
  const sb = await getClient();
  let q = sb.from(table).delete();
  Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
  const { error } = await q;
  if (error) throw new SupabaseError('db_error', error.message);
}

// ── Storage ───────────────────────────────────────────────────────────────────

/**
 * Upload a file to Supabase Storage.
 * @param {string} bucket
 * @param {string} path    - storage path e.g. 'receipts/123.jpg'
 * @param {File|Blob} file
 * @param {string} contentType
 */
export async function uploadFile(bucket, path, file, contentType) {
  const sb = await getClient();
  const { data, error } = await sb.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: true,
  });
  if (error) throw new SupabaseError('storage_error', error.message);
  return data;
}

/**
 * Get a public URL for a stored file.
 * @param {string} bucket
 * @param {string} path
 */
export async function getPublicUrl(bucket, path) {
  const sb = await getClient();
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Get a signed URL (temporary, for private buckets).
 * @param {string} bucket
 * @param {string} path
 * @param {number} expiresIn - seconds
 */
export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  const sb = await getClient();
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new SupabaseError('storage_error', error.message);
  return data.signedUrl;
}

// ── Sync helpers (Easy Bees → Supabase) ──────────────────────────────────────

/**
 * Sync a local collection to Supabase.
 * Call this after saves. Silently skips if Supabase not configured.
 * @param {'contacts'|'gigs'|'invoices'|'expenses'|'calls'} collection
 */
export async function syncCollection(collection) {
  if (!isConnected()) return; // silent skip — not configured
  const rows = dataService.getAll(collection);
  if (!rows.length) return;
  try {
    await upsert(collection, rows);
  } catch (e) {
    console.warn(`[SupabaseService] Sync failed for ${collection}:`, e.message);
  }
}

/**
 * Pull a collection from Supabase and merge into localStorage.
 * @param {'contacts'|'gigs'|'invoices'|'expenses'|'calls'} collection
 */
export async function pullCollection(collection) {
  if (!isConnected()) return [];
  const remote = await select(collection);
  const local  = dataService.getAll(collection);
  // Merge: remote wins on conflict (by id)
  const merged = [...local];
  remote.forEach(r => {
    const idx = merged.findIndex(l => l.id === r.id);
    if (idx >= 0) merged[idx] = r; else merged.push(r);
  });
  localStorage.setItem(`eb_${collection}`, JSON.stringify(merged));
  return merged;
}

// ── Error class ───────────────────────────────────────────────────────────────
export class SupabaseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'SupabaseError';
  }
}
