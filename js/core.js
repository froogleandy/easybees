// core.js — Router, event bus, UI helpers, global search

import { dataService } from './dataService.js';
import { truncate, GIG_STATUS, INVOICE_STATUS } from './utils.js';

// ── Module registry (filled by each module) ─
const modules = {};
export function registerModule(id, mod) { modules[id] = mod; }

// ── Event Bus ────────────────────────────────
const _handlers = {};
export const bus = {
  on(evt, fn)  { (_handlers[evt] = _handlers[evt] || []).push(fn); return () => { _handlers[evt] = _handlers[evt].filter(f=>f!==fn); }; },
  emit(evt, d) { console.debug('[bus]', evt, d); (_handlers[evt]||[]).forEach(fn => { try { fn(d); } catch(e) { console.error(e); } }); },
};

// ── Router ───────────────────────────────────
let _current = 'dashboard';
const NAV_ITEMS = [
  { id:'dashboard',   label:'Dashboard',   icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' },
  { id:'mail',        label:'Mail',        icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>' },
  { id:'contacts',    label:'Contacts',    icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>' },
  { id:'calls',       label:'Calls',       icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' },
  { id:'activity',    label:'Activity',    icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>' },
  { id:'gigs',        label:'Gigs',        icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' },
  { id:'calendar',    label:'Calendar',    icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' },
  { id:'tasks',       label:'Tasks',       icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
  { id:'money',       label:'Money',       icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  { id:'vault',       label:'Vault',       icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>' },
  { id:'experimental',label:'Labs',        icon:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-4 9h12l-4-9V3"/></svg>', dim:true },
];

function buildNav() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS.map(n => `
    <button class="nav-item${_current===n.id?' active':''}${n.dim?' nav-item-dim':''}" data-module="${n.id}" title="${n.label}">
      <span class="nav-icon">${n.icon}</span>
      <span class="nav-label">${n.label}</span>
    </button>
  `).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.module));
  });
}

export function navigate(id) {
  _current = id;
  buildNav();
  const mod = modules[id];
  if (!mod) {
    document.getElementById('module-title').textContent = id;
    document.getElementById('module-actions').innerHTML = '';
    document.getElementById('module-content').innerHTML = '<div class="empty-state"><div class="empty-state-icon">—</div><div class="empty-state-title">Module coming soon</div></div>';
    return;
  }
  mod.render();
}

// ── Toast ────────────────────────────────────
export function toast(msg, type = 'success', duration = 3000) {
  const icons = { success:'·', error:'×', warning:'!' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]||'●'}</span> ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Slide Panel ──────────────────────────────
export const slidePanel = {
  open(title, bodyHTML, footerHTML) {
    document.getElementById('slide-panel-title').textContent = title;
    document.getElementById('slide-panel-body').innerHTML   = bodyHTML;
    document.getElementById('slide-panel-footer').innerHTML = footerHTML || '';
    document.getElementById('slide-overlay').classList.remove('hidden');
    document.getElementById('slide-panel').classList.remove('hidden');
    requestAnimationFrame(() => document.getElementById('slide-panel').classList.add('open'));
  },
  close() {
    const p = document.getElementById('slide-panel');
    p.classList.remove('open');
    setTimeout(() => {
      p.classList.add('hidden');
      document.getElementById('slide-overlay').classList.add('hidden');
    }, 260);
  },
  setBody(html)   { document.getElementById('slide-panel-body').innerHTML   = html; },
  setFooter(html) { document.getElementById('slide-panel-footer').innerHTML = html; },
  body()   { return document.getElementById('slide-panel-body'); },
  footer() { return document.getElementById('slide-panel-footer'); },
};

// ── Modal ────────────────────────────────────
export const modal = {
  open(title, bodyHTML, footerHTML, size = '') {
    document.getElementById('modal-title').textContent  = title;
    document.getElementById('modal-body').innerHTML     = bodyHTML;
    document.getElementById('modal-footer').innerHTML   = footerHTML || '';
    const box = document.getElementById('modal-box');
    box.className = `bg-surf border border-bdrl rounded-2xl w-full max-h-[88vh] overflow-y-auto shadow-2xl ${size}`;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  close() { document.getElementById('modal-overlay').classList.add('hidden'); },
  body()   { return document.getElementById('modal-body'); },
  footer() { return document.getElementById('modal-footer'); },
};

// ── Module header ────────────────────────────
export function setHeader(title, actions = []) {
  document.getElementById('module-title').textContent = title;
  document.getElementById('module-actions').innerHTML = actions.map(a =>
    `<button class="btn btn-${a.v||'ghost'}" id="hdr-${a.id}">${a.icon ? `<span>${a.icon}</span> ` : ''}<span class="btn-label">${a.label}</span></button>`
  ).join('');
  actions.forEach(a => {
    const el = document.getElementById(`hdr-${a.id}`);
    if (el && a.onClick) el.addEventListener('click', a.onClick);
  });
}

// ── Global Search ────────────────────────────
function initSearch() {
  const btn     = document.getElementById('global-search-btn');
  const overlay = document.getElementById('global-search-overlay');
  const input   = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');
  const esc     = document.getElementById('global-search-esc');

  function open()  { overlay.classList.remove('hidden'); input.value=''; input.focus(); renderResults(''); }
  function close() { overlay.classList.add('hidden'); }

  btn.addEventListener('click', open);
  esc.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); open(); }
    if (e.key==='Escape') close();
  });

  input.addEventListener('input', () => renderResults(input.value));

  function renderResults(q) {
    if (q.length < 2) { results.innerHTML = '<div class="text-center text-gray-600 text-sm py-8">Type to search contacts, gigs, tasks…</div>'; return; }
    const ql = q.toLowerCase();
    const groups = [
      { label:'Contacts', mod:'contacts', items: dataService.query('contacts', c => c.name.toLowerCase().includes(ql)||(c.email||'').toLowerCase().includes(ql)), render: c => c.name },
      { label:'Gigs',     mod:'gigs',     items: dataService.query('gigs', g => g.name.toLowerCase().includes(ql)), render: g => g.name },
      { label:'Tasks',    mod:'tasks',    items: dataService.query('tasks', t => t.title.toLowerCase().includes(ql)), render: t => t.title },
      { label:'Invoices', mod:'money',    items: dataService.query('invoices', i => i.num.toLowerCase().includes(ql)), render: i => i.num },
      { label:'Expenses', mod:'money',    items: dataService.query('expenses', e => (e.vendor||'').toLowerCase().includes(ql)), render: e => e.vendor },
    ].filter(g => g.items.length);

    if (!groups.length) { results.innerHTML = `<div class="text-center text-gray-600 text-sm py-8">No results for "${q}"</div>`; return; }

    results.innerHTML = groups.map(g => `
      <div class="search-result-group">${g.label}</div>
      ${g.items.slice(0,5).map(item => `
        <div class="search-result-item" data-mod="${g.mod}">
          <span class="text-acc">→</span> ${truncate(g.render(item), 48)}
        </div>
      `).join('')}
    `).join('');

    results.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => { navigate(el.dataset.mod); close(); });
    });
  }
}

// ── Token Tracker ────────────────────────────
let _sessionCost = 0;
export function updateTokenTracker({ input, output, cost }) {
  _sessionCost += cost;
  document.getElementById('token-tracker').classList.remove('hidden');
  document.getElementById('tt-last').textContent  = `${input.toLocaleString()} / ${output.toLocaleString()}`;
  document.getElementById('tt-cost').textContent  = `$${cost.toFixed(5)}`;
  document.getElementById('tt-total').textContent = `$${_sessionCost.toFixed(4)}`;
}

// ── Shared UI helpers ────────────────────────
export function confirmDelete(name, onConfirm) {
  if (window.confirm(`Delete "${name}"? This cannot be undone.`)) onConfirm();
}

export function stepsBar(total, current) {
  return `<div class="steps-track">${Array.from({length:total},(_,i)=>`<div class="step-seg${i<current?' done':''}"></div>`).join('')}</div><div class="text-xs text-gray-600 mb-5">Step ${current} of ${total}</div>`;
}

export function fieldGroup(label, inputHTML, error='') {
  return `<div class="field-group"><label class="field-label">${label}</label>${inputHTML}${error?`<div class="field-error">${error}</div>`:''}</div>`;
}

export function btnHTML(label, cls='btn-primary', id='', icon='') {
  return `<button class="btn ${cls}"${id?' id="'+id+'"':''}>${icon?icon+' ':''}${label}</button>`;
}

// ── Init ─────────────────────────────────────
export function initCore() {
  dataService.init();
  buildNav();
  initSearch();

  document.getElementById('slide-panel-close').addEventListener('click', () => slidePanel.close());
  document.getElementById('slide-overlay').addEventListener('click', () => slidePanel.close());
  document.getElementById('modal-close').addEventListener('click', () => modal.close());
  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id==='modal-overlay') modal.close(); });
}
