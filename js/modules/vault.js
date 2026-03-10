// modules/vault.js — Google Drive Document Vault
// Supports: browse, folder navigation, search, categories, pin, preview, attach

import { registerModule, setHeader, modal, toast, slidePanel, fieldGroup, btnHTML } from '../core.js';
import * as DriveService from '../services/driveService.js';
import { dataService } from '../dataService.js';
import { truncate, formatDate } from '../utils.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _files       = [];
let _query       = '';
let _category    = 'all';
let _loading     = false;
let _pageToken   = null;
let _folderStack = []; // [{ id, name }] — breadcrumb trail (empty = Drive root)
let _pins        = loadPins();

// ── Pins persistence ──────────────────────────────────────────────────────────
function loadPins() {
  try { return JSON.parse(localStorage.getItem('eb_vault_pins') || '[]'); } catch { return []; }
}
function savePins() { localStorage.setItem('eb_vault_pins', JSON.stringify(_pins)); }
function isPinned(id) { return _pins.some(p => p.id === id); }
function togglePin(file) {
  if (isPinned(file.id)) {
    _pins = _pins.filter(p => p.id !== file.id);
    toast('Unpinned');
  } else {
    _pins.unshift({ id: file.id, name: file.name, mimeType: file.mimeType, webViewLink: file.webViewLink || '' });
    toast('Pinned');
  }
  savePins();
  render();
}

// ── Category config ───────────────────────────────────────────────────────────
const CATS = [
  { id: 'all',       label: 'All',        mime: null },
  { id: 'folders',   label: 'Folders',    mime: 'application/vnd.google-apps.folder' },
  { id: 'contracts', label: 'Contracts',  mime: 'application/pdf' },
  { id: 'sheets',    label: 'Sheets',     mime: 'application/vnd.google-apps.spreadsheet' },
  { id: 'docs',      label: 'Docs',       mime: 'application/vnd.google-apps.document' },
  { id: 'slides',    label: 'Slides',     mime: 'application/vnd.google-apps.presentation' },
  { id: 'images',    label: 'Images',     mime: 'image/' },
  { id: 'audio',     label: 'Audio',      mime: 'audio/' },
  { id: 'other',     label: 'Other',      mime: '__other__' },
];

const MIME_ICON = {
  'application/vnd.google-apps.folder':          { icon: '📁', color: '#E8B84B', bg: 'rgba(232,184,75,0.1)' },
  'application/pdf':                              { icon: '📄', color: '#F87171', bg: 'rgba(248,113,113,0.1)' },
  'application/vnd.google-apps.document':         { icon: '📝', color: '#60A5FA', bg: 'rgba(96,165,250,0.1)'  },
  'application/vnd.google-apps.spreadsheet':      { icon: '📊', color: '#34D399', bg: 'rgba(52,211,153,0.1)'  },
  'application/vnd.google-apps.presentation':     { icon: '🎞',  color: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
  'image/':                                       { icon: '🖼',  color: '#FB923C', bg: 'rgba(251,146,60,0.1)'  },
  'audio/':                                       { icon: '🎵', color: '#E8B84B', bg: 'rgba(232,184,75,0.1)'  },
  '__default__':                                  { icon: '📄', color: '#787878', bg: 'rgba(120,120,120,0.1)' },
};

function mimeStyle(mime = '') {
  if (MIME_ICON[mime]) return MIME_ICON[mime];
  for (const [k, v] of Object.entries(MIME_ICON)) {
    if (mime.startsWith(k)) return v;
  }
  return MIME_ICON['__default__'];
}

function isFolder(f) { return f.mimeType === 'application/vnd.google-apps.folder'; }

function sizeLabel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

// ── Current folder ID ─────────────────────────────────────────────────────────
function currentFolderId() {
  return _folderStack.length ? _folderStack[_folderStack.length - 1].id : null;
}

// ── Main render ───────────────────────────────────────────────────────────────
function render() {
  setHeader('Vault', []);

  const content = document.getElementById('module-content');

  if (!DriveService.isConnected()) { content.innerHTML = setupPrompt(); return; }
  if (!DriveService.isAuthed()) {
    content.innerHTML = connectPrompt();
    document.getElementById('vault-connect-btn')?.addEventListener('click', connectAndLoad);
    return;
  }

  const filtered = filteredFiles();

  content.innerHTML = `
    <div style="max-width:900px">

      <!-- Breadcrumb nav -->
      <div class="flex items-center gap-1 mb-4 flex-wrap">
        <button class="vault-breadcrumb ${_folderStack.length===0?'active':''}" data-stack="-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          My Drive
        </button>
        ${_folderStack.map((f,i) => `
          <span style="color:var(--txts);font-size:11px">›</span>
          <button class="vault-breadcrumb ${i===_folderStack.length-1?'active':''}" data-stack="${i}">
            ${escHtml(f.name)}
          </button>`).join('')}
      </div>

      <!-- Pins section -->
      ${_pins.length ? `
        <div class="mb-4">
          <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Pinned</div>
          <div class="flex gap-2 flex-wrap">
            ${_pins.map(p => {
              const s = mimeStyle(p.mimeType);
              return `<div class="vault-pin-chip" data-pin-id="${p.id}" title="${escHtml(p.name)}">
                <span>${s.icon}</span>
                <span class="truncate" style="max-width:120px">${escHtml(p.name)}</span>
                <button class="vault-unpin-btn" data-pin-id="${p.id}" title="Unpin">×</button>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

      <!-- Search bar -->
      <div class="flex gap-2 mb-5">
        <div class="flex-1" style="position:relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--txts);pointer-events:none">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input id="vault-search" class="field-input" placeholder="Search files…"
            value="${escHtml(_query)}" style="padding-left:36px">
        </div>
      </div>

      <!-- File list -->
      ${_loading ? `
        <div style="text-align:center;padding:48px 0">
          <div class="processing-ring" style="margin:0 auto 14px"></div>
          <div class="text-sm" style="color:var(--txts)">Loading…</div>
        </div>
      ` : filtered.length === 0 ? `
        <div class="empty-state" style="padding:40px 0">
          <div class="empty-state-title">No files found</div>
          <div class="empty-state-sub">${_query ? `No results for "${escHtml(_query)}".` : 'This folder is empty.'}</div>
        </div>
      ` : `
        <div class="flex flex-col gap-1.5">
          ${filtered.map(f => renderFileRow(f)).join('')}
        </div>
        ${_pageToken ? `<button class="btn btn-ghost btn-sm mt-4" id="load-more">Load more</button>` : ''}
      `}
    </div>
  `;

  // Breadcrumb nav
  document.querySelectorAll('.vault-breadcrumb').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.stack;
      if (idx === -1) { _folderStack = []; }
      else { _folderStack = _folderStack.slice(0, idx + 1); }
      _query = ''; loadFiles();
    });
  });

  // Unpin chips
  document.querySelectorAll('.vault-unpin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.pinId;
      const f  = _pins.find(p => p.id === id);
      if (f) togglePin(f);
    });
  });

  // Pin chip click → open file detail
  document.querySelectorAll('.vault-pin-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      if (e.target.closest('.vault-unpin-btn')) return;
      const id  = chip.dataset.pinId;
      const pin = _pins.find(p => p.id === id);
      if (pin) openFileDetail(id, _files.find(f => f.id === id) || pin);
    });
  });

  // Search
  document.getElementById('vault-search')?.addEventListener('input', e => { _query = e.target.value; render(); });

  // File rows
  document.querySelectorAll('.vault-file-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.vault-pin-btn,.vault-attach-btn,a')) return;
      const f = _files.find(x => x.id === row.dataset.fileId);
      if (!f) return;
      if (isFolder(f)) {
        _folderStack.push({ id: f.id, name: f.name });
        _query = ''; loadFiles();
      } else {
        openFileDetail(f.id, f);
      }
    });
  });

  document.querySelectorAll('.vault-pin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const f = _files.find(x => x.id === btn.dataset.fileId);
      if (f) togglePin(f);
    });
  });

  document.querySelectorAll('.vault-attach-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openAttachModal(_files.find(x=>x.id===btn.dataset.fileId)); });
  });

  document.getElementById('load-more')?.addEventListener('click', loadMore);
}

function renderFileRow(f) {
  const style   = mimeStyle(f.mimeType);
  const folder  = isFolder(f);
  const pinned  = isPinned(f.id);
  return `
    <div class="vault-file-row${folder?' vault-folder-row':''}" data-file-id="${f.id}"
         style="${folder?'border-left:2px solid var(--acc)':''}">
      <div class="vault-file-icon" style="background:${style.bg}">${style.icon}</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm truncate">${escHtml(f.name)}${folder?` <span style="font-size:10px;color:var(--txts)">folder</span>`:''}</div>
        <div class="text-xs mt-0.5" style="color:var(--txts)">
          ${f.modifiedTime ? formatDate(f.modifiedTime.slice(0,10)) : ''}
          ${f.size ? ` · ${sizeLabel(+f.size)}` : ''}
          ${f.owners?.[0]?.displayName ? ` · ${escHtml(f.owners[0].displayName)}` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button class="vault-pin-btn btn btn-ghost btn-icon btn-sm" data-file-id="${f.id}" title="${pinned?'Unpin':'Pin'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="${pinned?'var(--acc)':'none'}" stroke="${pinned?'var(--acc)':'currentColor'}" stroke-width="2"><path d="m15 4-1 7 4 3-8 6V13L6 7l9-3z"/></svg>
        </button>
        ${!folder ? `<button class="btn btn-ghost btn-sm vault-attach-btn" data-file-id="${f.id}">Attach</button>` : ''}
        ${f.webViewLink && !folder ? `
          <a href="${escHtml(f.webViewLink)}" target="_blank" rel="noopener"
            class="btn btn-ghost btn-icon btn-sm" title="Open in Drive" onclick="event.stopPropagation()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>` : folder ? `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txts)" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>` : ''}
      </div>
    </div>
  `;
}

// ── File detail panel ─────────────────────────────────────────────────────────
function openFileDetail(fileId, fileData) {
  const f     = fileData || _files.find(x => x.id === fileId);
  if (!f) return;
  const style = mimeStyle(f.mimeType);
  const pinned = isPinned(f.id);

  slidePanel.open(f.name, `
    <div class="flex items-center gap-3 mb-5 p-4 rounded-xl" style="background:${style.bg};border:1px solid ${style.color}22">
      <div style="font-size:28px">${style.icon}</div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm mb-0.5 truncate">${escHtml(f.name)}</div>
        <div class="text-xs" style="color:var(--txts)">${f.mimeType || ''}</div>
      </div>
    </div>

    <div class="flex flex-col gap-3 mb-5">
      ${f.size       ? infoRow('Size',     sizeLabel(+f.size)) : ''}
      ${f.modifiedTime ? infoRow('Modified', formatDate(f.modifiedTime.slice(0,10), 'long')) : ''}
      ${f.createdTime  ? infoRow('Created',  formatDate(f.createdTime.slice(0,10),  'long')) : ''}
      ${f.owners?.[0]  ? infoRow('Owner',    f.owners[0].displayName || f.owners[0].emailAddress) : ''}
    </div>

    <div class="flex flex-col gap-2">
      ${f.webViewLink ? `<a href="${escHtml(f.webViewLink)}" target="_blank" rel="noopener" class="btn btn-primary" style="text-align:center">Open in Google Drive ↗</a>` : ''}
      <button class="btn btn-ghost" id="sp-toggle-pin">${pinned?'Unpin from Vault':'Pin to Vault'}</button>
      <button class="btn btn-ghost" id="sp-attach-invoice">Attach to Invoice</button>
      <button class="btn btn-ghost" id="sp-attach-email">Attach to Email</button>
    </div>
  `, '');

  document.getElementById('sp-toggle-pin')?.addEventListener('click', () => { togglePin(f); slidePanel.close(); });
  document.getElementById('sp-attach-invoice')?.addEventListener('click', () => openAttachModal(f, 'invoice'));
  document.getElementById('sp-attach-email')?.addEventListener('click',   () => openAttachModal(f, 'email'));
}

function infoRow(label, value) {
  return `<div class="flex justify-between items-center text-sm">
    <span style="color:var(--txts)">${label}</span>
    <span class="font-semibold">${escHtml(String(value))}</span>
  </div>`;
}

// ── Attach modal ──────────────────────────────────────────────────────────────
function openAttachModal(f) {
  if (!f) return;
  const invoices = dataService.getAll('invoices');
  modal.open(`Attach — ${truncate(f.name, 40)}`, `
    <div class="flex flex-col gap-4">
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Attach to Invoice</div>
        ${invoices.length ? `
          <select id="attach-inv-select" class="field-input mb-3">
            <option value="">Select invoice…</option>
            ${invoices.map(inv => {
              const client = dataService.getById('contacts', inv.clientId);
              return `<option value="${inv.id}">${inv.num} — ${client?.name || 'Unknown'}</option>`;
            }).join('')}
          </select>
          <button class="btn btn-primary btn-sm w-full" id="do-attach-inv">Attach to Invoice</button>
        ` : `<div class="text-xs" style="color:var(--txts)">No invoices yet.</div>`}
      </div>
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Send via Email</div>
        ${fieldGroup('To', `<input id="attach-email-to" class="field-input" placeholder="recipient@example.com">`)}
        ${fieldGroup('Subject', `<input id="attach-email-subj" class="field-input" value="Sending: ${escHtml(f.name)}">`)}
        ${fieldGroup('Message', `<textarea id="attach-email-body" class="field-input" rows="3" placeholder="Add a note…"></textarea>`)}
        <button class="btn btn-primary btn-sm w-full mt-2" id="do-attach-email">Compose with Link</button>
      </div>
    </div>
  `, `${btnHTML('Close', 'btn-ghost', 'attach-close')}`);

  document.getElementById('attach-close')?.addEventListener('click', () => modal.close());
  document.getElementById('do-attach-inv')?.addEventListener('click', () => {
    const invId = document.getElementById('attach-inv-select')?.value;
    if (!invId) { toast('Select an invoice first.', 'error'); return; }
    const inv = dataService.getById('invoices', invId);
    if (!inv) return;
    const attachments = inv.driveAttachments || [];
    if (attachments.find(a => a.id === f.id)) { toast('Already attached.', 'warning'); return; }
    attachments.push({ id: f.id, name: f.name, url: f.webViewLink, mimeType: f.mimeType });
    dataService.save('invoices', { ...inv, driveAttachments: attachments });
    modal.close(); slidePanel.close();
    toast(`Attached to ${inv.num}`);
  });
  document.getElementById('do-attach-email')?.addEventListener('click', () => {
    const to   = document.getElementById('attach-email-to')?.value?.trim();
    const subj = document.getElementById('attach-email-subj')?.value?.trim();
    const body = document.getElementById('attach-email-body')?.value?.trim();
    if (!to) { toast('Add a recipient.', 'error'); return; }
    modal.close();
    window.dispatchEvent(new CustomEvent('eb:compose', {
      detail: { to, subject: subj || `Sharing: ${f.name}`, body: `${body?body+'\n\n':''}📎 ${f.name}\n${f.webViewLink||''}` },
    }));
    setTimeout(() => { import('../core.js').then(({ navigate }) => navigate('mail')); }, 100);
  });
}

// ── Load files ────────────────────────────────────────────────────────────────
async function connectAndLoad() {
  try { await DriveService.ensureAuth(); _files = []; loadFiles(); }
  catch(e) { toast(e.message, 'error'); }
}

async function loadFiles() {
  _loading = true; _pageToken = null; render();
  try {
    const folderId = currentFolderId();
    const query    = folderId ? `'${folderId}' in parents and trashed = false` : undefined;
    const { files, nextPage } = await DriveService.listFiles({ pageSize: 50, query });
    // Sort: folders first
    _files     = files.sort((a,b) => (isFolder(b)?1:0) - (isFolder(a)?1:0));
    _pageToken = nextPage;
    _loading   = false;
    render();
  } catch(e) {
    _loading = false;
    toast(e.message || 'Failed to load Drive files.', 'error');
    render();
  }
}

async function loadMore() {
  if (!_pageToken) return;
  try {
    const folderId = currentFolderId();
    const query    = folderId ? `'${folderId}' in parents and trashed = false` : undefined;
    const { files, nextPage } = await DriveService.listFiles({ pageSize: 50, pageToken: _pageToken, query });
    _files     = [..._files, ...files.sort((a,b) => (isFolder(b)?1:0) - (isFolder(a)?1:0))];
    _pageToken = nextPage;
    render();
  } catch(e) { toast(e.message || 'Failed to load more.', 'error'); }
}

// ── Filter ────────────────────────────────────────────────────────────────────
function filteredFiles() {
  return _files.filter(f => {
    const cat = CATS.find(c => c.id === _category);
    if (cat && cat.id !== 'all') {
      if (cat.id === 'other') {
        const known = CATS.filter(c => c.mime && c.id !== 'other').map(c => c.mime);
        if (known.some(m => f.mimeType?.startsWith(m))) return false;
      } else if (cat.mime && f.mimeType !== cat.mime && !f.mimeType?.startsWith(cat.mime)) return false;
    }
    if (_query) {
      const q = _query.toLowerCase();
      return f.name?.toLowerCase().includes(q) || f.mimeType?.toLowerCase().includes(q);
    }
    return true;
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────
function connectPrompt() {
  return `<div class="empty-state">
    <div style="width:52px;height:52px;border-radius:50%;background:rgba(232,184,75,0.08);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
    </div>
    <div class="empty-state-title">Connect Google Drive</div>
    <div class="empty-state-sub mb-5">Sign in to browse, search, and attach your Drive files.</div>
    <button class="btn btn-primary" id="vault-connect-btn">Connect Drive</button>
  </div>`;
}

function setupPrompt() {
  return `<div class="empty-state">
    <div class="empty-state-title">Google Drive not configured</div>
    <div class="empty-state-sub">Add your Google OAuth Client ID in <strong>Profile → Connected Accounts</strong>.</div>
  </div>`;
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addEventListener('eb:compose', () => {
  import('../core.js').then(({ navigate }) => navigate('mail'));
});

registerModule('vault', { render });
