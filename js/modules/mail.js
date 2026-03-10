// modules/mail.js — Gmail API v1 via Google Identity Services OAuth

import { registerModule, setHeader, modal, toast, fieldGroup, btnHTML } from '../core.js';
import { dataService } from '../dataService.js';

// ── In-memory token (expires after 1hr, not persisted) ──
let _token    = null;
let _tab      = 'inbox';
let _messages = [];
let _selected = null;
let _loading  = false;
let _filter   = 'all'; // 'all' | 'business' | 'personal'

// ── Google Identity Services ─────────────────────────────
const SCOPES = 'https://www.googleapis.com/auth/gmail.modify';
const GMAIL  = 'https://gmail.googleapis.com/gmail/v1/users/me';

function getClientId() {
  return dataService.getSettings().gmailClientId || dataService.getSettings().gcalClientId || '';
}

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function requestToken() {
  const clientId = getClientId();
  if (!clientId) {
    toast('Add your Google OAuth Client ID in Settings → Mail first.', 'error');
    return false;
  }
  await loadGIS();
  return new Promise(resolve => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:     SCOPES,
      callback:  resp => {
        if (resp.error) { toast('Gmail sign-in failed: ' + resp.error, 'error'); resolve(false); return; }
        _token = resp.access_token;
        resolve(true);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// ── Gmail API helpers ────────────────────────────────────
async function gmailGet(path, params = {}) {
  if (!_token) throw new Error('no_token');
  const url = new URL(`${GMAIL}/${path}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${_token}` } });
  if (res.status === 401) { _token = null; throw new Error('token_expired'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function gmailPost(path, body) {
  if (!_token) throw new Error('no_token');
  const res = await fetch(`${GMAIL}/${path}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (res.status === 401) { _token = null; throw new Error('token_expired'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Message parsing ──────────────────────────────────────
function headerVal(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBody(payload) {
  // Try plain text first, then html fallback
  function findPart(p, mime) {
    if (p.mimeType === mime && p.body?.data) return p.body.data;
    for (const part of (p.parts || [])) {
      const r = findPart(part, mime);
      if (r) return r;
    }
    return null;
  }
  const b64 = findPart(payload, 'text/plain') || findPart(payload, 'text/html') || payload.body?.data || '';
  if (!b64) return '';
  try {
    return decodeURIComponent(escape(atob(b64.replace(/-/g,'+').replace(/_/g,'/'))));
  } catch { return '(Unable to decode message body)'; }
}

function parseMessage(raw, isSent = false) {
  const h   = raw.payload?.headers || [];
  const d   = new Date(+raw.internalDate || 0);
  return {
    id:        raw.id,
    threadId:  raw.threadId,
    subject:   headerVal(h,'Subject') || '(no subject)',
    from:      headerVal(h,'From') || '—',
    to:        headerVal(h,'To')   || '—',
    snippet:   raw.snippet || '',
    body:      decodeBody(raw.payload || {}),
    unread:    (raw.labelIds || []).includes('UNREAD'),
    sent:      isSent,
    dateLabel: d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    dateFull:  d.toLocaleString('en-US',{month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}),
  };
}

// ── Render ───────────────────────────────────────────────
function render() {
  setHeader('Mail', [
    { id:'compose', label:'Compose', icon:'+', v:'primary', onClick: openCompose },
    { id:'refresh', label:'Refresh', v:'ghost', onClick: loadMessages },
  ]);

  if (!_token && !getClientId()) {
    renderSetup();
    return;
  }

  if (!_token) {
    renderConnectPrompt();
    return;
  }

  document.getElementById('module-content').innerHTML = `
    <div class="flex gap-0" style="min-height:520px">
      <!-- Sidebar list -->
      <div style="width:290px;flex-shrink:0;border:1px solid var(--bdr);border-radius:12px;overflow:hidden;background:var(--surf)">
        <div class="flex border-b border-bdr">
          ${['inbox','sent'].map(t => `
            <button class="money-tab${_tab===t?' active':''}" data-tab="${t}" style="font-size:12px">
              ${t==='inbox'?'Inbox':'Sent'}
            </button>`).join('')}
        </div>
        <div class="flex border-b border-bdr" style="background:var(--bg)">
          ${['all','business','personal'].map(f => `
            <button class="mail-filter-btn${_filter===f?' active':''}" data-filter="${f}" style="flex:1;padding:5px 0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border:none;background:none;cursor:pointer;color:${_filter===f?'var(--acc)':'var(--txts)'};border-bottom:2px solid ${_filter===f?'var(--acc)':'transparent'};transition:all 0.12s">
              ${f==='all'?'All':f==='business'?'Business':'Personal'}
            </button>`).join('')}
        </div>
        <div id="mail-list" class="overflow-y-auto" style="max-height:480px">
          ${_loading
            ? `<div class="text-center text-xs py-10" style="color:var(--txts)">Loading…</div>`
            : renderMailList()}
        </div>
      </div>

      <!-- Message body -->
      <div id="mail-body" class="flex-1 ml-4">
        ${_selected ? renderMailBody(_selected) : `
          <div class="empty-state flex flex-col justify-center h-full">
            <div class="empty-state-icon" style="font-size:28px;margin-bottom:10px">—</div>
            <div class="empty-state-title">Select a message</div>
            <div class="empty-state-sub">Click any email to read it here.</div>
          </div>`}
      </div>
    </div>
  `;

  bindMailEvents();
  if (!_messages.length && !_loading) loadMessages();
}

function renderConnectPrompt() {
  document.getElementById('module-content').innerHTML = `
    <div class="empty-state">
      <div style="width:52px;height:52px;border-radius:50%;background:rgba(232,184,75,0.08);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      </div>
      <div class="empty-state-title">Connect Gmail</div>
      <div class="empty-state-sub mb-5">Sign in with Google to access your inbox and send email.</div>
      <button class="btn btn-primary" id="gmail-connect" style="gap:8px;padding:10px 22px">
        <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
        Sign in with Google
      </button>
    </div>
  `;
  document.getElementById('gmail-connect')?.addEventListener('click', async () => {
    const ok = await requestToken();
    if (ok) { _messages = []; render(); }
  });
}

function renderSetup() {
  document.getElementById('module-content').innerHTML = `
    <div class="empty-state">
      <div class="empty-state-title" style="font-size:17px;margin-bottom:8px">Gmail not configured</div>
      <div class="empty-state-sub">Add your Google OAuth Client ID in <strong>Settings → Mail</strong>, then return here to connect.</div>
    </div>
  `;
}


// ── Email classification ─────────────────────────────────────────────────────
const PERSONAL_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'aol.com','me.com','live.com','msn.com','protonmail.com','pm.me',
  'mail.com','ymail.com','googlemail.com','comcast.net','att.net',
  'verizon.net','sbcglobal.net','cox.net',
]);

function getEmailDomain(emailStr = '') {
  const match = emailStr.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

function isBusiness(emailStr) {
  return !PERSONAL_DOMAINS.has(getEmailDomain(emailStr));
}

function matchesFilter(m) {
  if (_filter === 'all') return true;
  const addr = _tab === 'sent' ? m.to : m.from;
  return _filter === 'business' ? isBusiness(addr) : !isBusiness(addr);
}

function renderMailList() {
  const msgs = _messages.filter(m => (_tab==='sent' ? m.sent : !m.sent) && matchesFilter(m));
  if (!msgs.length) return `<div class="text-center text-xs py-10" style="color:var(--txts)">No messages.</div>`;
  return msgs.map(m => `
    <div class="mail-row p-4 border-b border-bdr cursor-pointer transition-colors" data-id="${m.id}"
      style="${_selected?.id===m.id?'border-left:3px solid var(--acc);background:rgba(232,184,75,0.04)':''}">
      <div class="flex justify-between items-start gap-2">
        <div class="font-semibold text-sm truncate flex-1" style="color:${m.unread?'var(--txt)':'var(--txts)'}">${escHtml(_tab==='sent'?m.to:m.from)}</div>
        <div class="text-xs flex-shrink-0" style="color:var(--txtm)">${m.dateLabel}</div>
      </div>
      <div class="flex items-center gap-1.5 mt-0.5">
        ${m.unread?`<div style="width:5px;height:5px;border-radius:50%;background:var(--acc);flex-shrink:0"></div>`:''}
        <div class="text-xs truncate" style="color:var(--txts)">${escHtml(m.subject)}</div>
      </div>
      <div class="text-xs truncate mt-0.5" style="color:var(--txtm)">${escHtml(m.snippet)}</div>
    </div>`).join('');
}

function renderMailBody(m) {
  // Strip HTML tags for plain display
  const bodyText = m.body.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s{2,}/g,' ').trim();
  return `
    <div class="card h-full" style="padding:24px">
      <div class="mb-5 pb-4 border-b border-bdr">
        <div class="font-black text-lg mb-2">${escHtml(m.subject)}</div>
        <div class="text-sm mb-1" style="color:var(--txts)">
          <span class="font-semibold" style="color:var(--txt)">From:</span> ${escHtml(m.from)}
        </div>
        <div class="text-sm mb-1" style="color:var(--txts)">
          <span class="font-semibold" style="color:var(--txt)">To:</span> ${escHtml(m.to)}
        </div>
        <div class="text-xs mt-2" style="color:var(--txtm)">${m.dateFull}</div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-ghost btn-sm" id="mail-reply">Reply</button>
          <button class="btn btn-ghost btn-sm" id="mail-fwd">Forward</button>
        </div>
      </div>
      <div class="text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto" style="color:var(--txts);max-height:360px">${escHtml(bodyText)}</div>
    </div>`;
}

function bindMailEvents() {
  document.querySelectorAll('.mail-row').forEach(row => {
    row.addEventListener('click', () => {
      const m = _messages.find(x => x.id === row.dataset.id);
      if (m) { m.unread = false; _selected = m; render(); }
    });
  });
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => { _tab = btn.dataset.tab; _selected = null; render(); });
  });
  document.getElementById('mail-reply')?.addEventListener('click', () => {
    if (!_selected) return;
    openCompose({ to: _selected.from.match(/<(.+)>/)?.[1] || _selected.from, subject: 'Re: ' + _selected.subject });
  });
  document.querySelectorAll('.mail-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { _filter = btn.dataset.filter; render(); });
  });
  document.getElementById('mail-fwd')?.addEventListener('click', () => {
    if (!_selected) return;
    openCompose({ subject: 'Fwd: ' + _selected.subject, body: `\n\n--- Forwarded ---\nFrom: ${_selected.from}\n\n${_selected.snippet}` });
  });
}

// ── Load messages ────────────────────────────────────────
async function loadMessages() {
  if (!_token) {
    const ok = await requestToken();
    if (!ok) return;
  }
  _loading = true; render();
  try {
    const [inboxList, sentList] = await Promise.all([
      gmailGet('messages', { labelIds: 'INBOX', maxResults: 20 }),
      gmailGet('messages', { labelIds: 'SENT',  maxResults: 10 }),
    ]);

    const fetchFull = async (ids, isSent) => {
      const settled = await Promise.allSettled(
        (ids||[]).map(({ id }) => gmailGet(`messages/${id}`, { format: 'full' }))
      );
      return settled.filter(r => r.status==='fulfilled').map(r => parseMessage(r.value, isSent));
    };

    const [inbox, sent] = await Promise.all([
      fetchFull(inboxList.messages, false),
      fetchFull(sentList.messages,  true),
    ]);

    _messages = [...inbox, ...sent];
    _loading  = false;
    render();
    toast('Inbox loaded');
  } catch(e) {
    _loading = false;
    if (e.message === 'token_expired') {
      toast('Session expired — please reconnect.', 'warning');
      _token = null;
    } else {
      toast('Failed to load mail.', 'error');
      console.error(e);
    }
    render();
  }
}

// ── Compose ──────────────────────────────────────────────
let _vaultLinks = []; // accumulated vault file links for current compose
function openCompose(prefill = {}) {
  _vaultLinks = prefill.vaultLinks || [];
  modal.open('Compose', `
    ${fieldGroup('To',      `<input id="m-to"   class="field-input" value="${escHtml(prefill.to||'')}"      placeholder="recipient@example.com">`)}
    ${fieldGroup('Subject', `<input id="m-subj" class="field-input" value="${escHtml(prefill.subject||'')}" placeholder="Subject…">`)}
    ${fieldGroup('Message', `<textarea id="m-body" class="field-input" rows="6" placeholder="Type your message…">${escHtml(prefill.body||'')}</textarea>`)}
    <!-- Vault attachments -->
    <div id="compose-vault-section">
      <div class="text-xs font-bold uppercase tracking-widest mb-2 mt-3" style="color:var(--txts)">Attachments from Vault</div>
      <div id="compose-vault-links" class="flex flex-col gap-1.5 mb-2">
        ${(prefill.vaultLinks||[]).map(l=>`
          <div class="flex items-center gap-2 text-xs p-2 rounded-lg" style="background:var(--bg);border:1px solid var(--bdr)">
            <span>📎</span><span class="flex-1 truncate">${escHtml(l.name)}</span>
            <a href="${escHtml(l.url)}" target="_blank" style="color:var(--acc)">Open ↗</a>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="compose-attach-vault" style="font-size:11px">+ Attach from Vault</button>
    </div>
  `, `${btnHTML('Cancel','btn-ghost','m-cancel')} ${btnHTML('Send','btn-primary','m-send')}`);

  document.getElementById('m-cancel')?.addEventListener('click', () => modal.close());

  // Vault attach picker
  document.getElementById('compose-attach-vault')?.addEventListener('click', () => {
    openVaultPicker(link => {
      _vaultLinks.push(link);
      const container = document.getElementById('compose-vault-links');
      if (container) {
        container.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 text-xs p-2 rounded-lg" style="background:var(--bg);border:1px solid var(--bdr)">
            <span>📎</span><span class="flex-1 truncate">${escHtml(link.name)}</span>
            <a href="${escHtml(link.url)}" target="_blank" style="color:var(--acc)">Open ↗</a>
          </div>`);
      }
    });
  });
  document.getElementById('m-send')?.addEventListener('click',  async () => {
    const to      = document.getElementById('m-to')?.value?.trim();
    const subject = document.getElementById('m-subj')?.value?.trim();
    const body    = document.getElementById('m-body')?.value?.trim();
    if (!to || !subject || !body) { toast('Fill all fields.','error'); return; }

    if (!_token) {
      const ok = await requestToken();
      if (!ok) return;
    }

    try {
      // Build RFC 2822 message and base64url encode it
      const vaultSection = _vaultLinks.length
        ? '\n\nAttachments:\n' + _vaultLinks.map(l => `📎 ${l.name}\n${l.url}`).join('\n')
        : '';
      const raw = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body + vaultSection,
      ].join('\r\n');
      const encoded = btoa(unescape(encodeURIComponent(raw)))
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

      await gmailPost('messages/send', { raw: encoded });
      modal.close();
      toast('Email sent');
      setTimeout(loadMessages, 1000);
    } catch(e) {
      console.error(e);
      toast('Send failed — check console.','error');
    }
  });
}

// ── Vault picker (inline modal within compose) ──────────────────────────────
function openVaultPicker(onSelect) {
  // Pull pins from storage as quick options, plus note
  let pins = [];
  try { pins = JSON.parse(localStorage.getItem('eb_vault_pins') || '[]'); } catch {}

  const listHTML = pins.length
    ? pins.map(p => `
        <div class="vault-pin-chip vault-picker-item" data-url="${escHtml(p.webViewLink||'')}" data-name="${escHtml(p.name)}" style="cursor:pointer">
          <span>📎</span><span class="truncate">${escHtml(p.name)}</span>
        </div>`).join('')
    : `<div class="text-xs" style="color:var(--txts)">No pinned files. Pin files in the Vault module to attach them here quickly.</div>`;

  const pickerEl = document.createElement('div');
  pickerEl.style.cssText = 'position:fixed;inset:0;z-index:600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
  pickerEl.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--bdr);border-radius:16px;padding:24px;width:380px;max-height:60vh;overflow-y:auto">
      <div class="flex items-center justify-between mb-4">
        <div class="font-bold text-sm">Attach from Vault</div>
        <button id="vpicker-close" style="background:none;border:none;cursor:pointer;color:var(--txts);font-size:20px;line-height:1">×</button>
      </div>
      <div class="text-xs mb-3" style="color:var(--txts)">Select a pinned file to attach its link to the email.</div>
      <div class="flex flex-col gap-2">${listHTML}</div>
      <div class="mt-4 pt-4 border-t border-bdr text-xs" style="color:var(--txts)">Tip: Pin more files in the <strong>Vault</strong> module.</div>
    </div>`;
  document.body.appendChild(pickerEl);

  pickerEl.querySelector('#vpicker-close')?.addEventListener('click', () => pickerEl.remove());
  pickerEl.querySelectorAll('.vault-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const link = { name: item.dataset.name, url: item.dataset.url };
      if (link.url) { onSelect(link); pickerEl.remove(); }
      else toast('This file has no shareable link.', 'warning');
    });
  });
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

registerModule('mail', { render });
