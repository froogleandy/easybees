// modules/activity.js — System-wide activity feed + notifications
// Listens to all bus events, stores to localStorage eb_activity[]
// Also shows unread badge count in nav

import { registerModule, setHeader, navigate, bus, toast } from '../core.js';
import { dataService } from '../dataService.js';
import { formatDate } from '../utils.js';

// ── Activity type config ─────────────────────────
const TYPES = {
  'contact.created':   { label: 'Contact',  color: '#60A5FA', dot: '#60A5FA' },
  'contact.updated':   { label: 'Contact',  color: '#60A5FA', dot: '#60A5FA' },
  'gig.created':       { label: 'Gig',      color: '#E8B84B', dot: '#E8B84B' },
  'gig.confirmed':     { label: 'Gig',      color: '#E8B84B', dot: '#E8B84B' },
  'invoice.created':   { label: 'Invoice',  color: '#A78BFA', dot: '#A78BFA' },
  'invoice.paid':      { label: 'Invoice',  color: '#34D399', dot: '#34D399' },
  'expense.added':     { label: 'Expense',  color: '#FB923C', dot: '#FB923C' },
  'task.updated':      { label: 'Task',     color: '#38BDF8', dot: '#38BDF8' },
  'call.logged':       { label: 'Call',     color: '#E879F9', dot: '#E879F9' },
  'vault.attach.invoice': { label: 'Vault', color: '#34D399', dot: '#34D399' },
  'vault.attach.email':   { label: 'Vault', color: '#60A5FA', dot: '#60A5FA' },
  '__default__':       { label: 'System',   color: '#787878', dot: '#787878' },
};

// ── Storage ──────────────────────────────────────
const KEY = 'eb_activity';
const MAX  = 500;

export function logActivity(entry) {
  const list = getAll();
  list.unshift({
    id:   `act_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    ts:   new Date().toISOString(),
    read: false,
    ...entry,
  });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  updateBadge();
  window.dispatchEvent(new CustomEvent('eb:activity'));
}

export function getAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function markAllRead() {
  const list = getAll().map(a => ({ ...a, read: true }));
  localStorage.setItem(KEY, JSON.stringify(list));
  updateBadge();
}

function clearAll() {
  localStorage.removeItem(KEY);
  updateBadge();
}

function unreadCount() {
  return getAll().filter(a => !a.read).length;
}

// ── Nav badge ────────────────────────────────────
function updateBadge() {
  const count = unreadCount();
  const existing = document.getElementById('activity-badge');
  if (existing) existing.remove();
  if (count > 0) {
    const btn = document.querySelector('[data-module="activity"]');
    if (btn) {
      const badge = document.createElement('span');
      badge.id = 'activity-badge';
      badge.className = 'unread-count-badge';
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.cssText = 'position:absolute;top:4px;right:4px;font-size:9px;min-width:15px;height:15px;';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }
  }
}

// ── State ─────────────────────────────────────────
let _search  = '';
let _actView = 'feed'; // 'feed' | 'today-gigs' | 'week-tasks'

// ── Render ────────────────────────────────────────
function render() {
  markAllRead();
  const all      = getAll();
  const filtered = filterItems(all);

  setHeader('Activity', []);

  // ── sub-view state driven by which stat card was clicked
  const view = _actView; // 'feed' | 'today-gigs' | 'week-tasks'

  document.getElementById('module-content').innerHTML = `
    <div style="max-width:740px">

      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-3 mb-5" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
        ${statCard('Total Events', all.length, '#787878', null)}
        ${statCard('Today', todayCount(all), '#E8B84B', 'today-gigs')}
        ${statCard('This Week', weekCount(all), '#60A5FA', 'week-tasks')}
      </div>

      ${view === 'today-gigs' ? renderTodayGigs() : view === 'week-tasks' ? renderWeekTasks() : `

      <!-- Search -->
      <div style="position:relative;margin-bottom:16px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--txts);pointer-events:none">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input id="act-search" class="field-input" placeholder="Search activity…"
          value="${escHtml(_search)}" style="padding-left:36px">
      </div>

      <!-- Feed -->
      ${filtered.length === 0 ? `
        <div class="empty-state" style="padding:48px 0">
          <div class="empty-state-title">No activity yet</div>
          <div class="empty-state-sub">Events from across the app will appear here as you work.</div>
        </div>
      ` : `
        <div class="card" style="padding:0 18px">
          ${filtered.map(a => renderRow(a)).join('')}
        </div>
      `}`}
    </div>
  `;

  // Stat card clicks
  document.querySelectorAll('.act-stat-card[data-view]').forEach(card => {
    card.addEventListener('click', () => {
      _actView = _actView === card.dataset.view ? 'feed' : card.dataset.view;
      render();
    });
  });

  document.getElementById('act-search')?.addEventListener('input', e => { _search = e.target.value; render(); });
}

function renderRow(a) {
  const cfg    = typeConfig(a.type);
  const time   = relativeTime(a.ts);
  const isNew  = !a.read;

  return `
    <div class="activity-row${isNew?' activity-unread':''}">
      <div class="activity-dot" style="background:${cfg.dot};color:${cfg.dot}"></div>
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 flex-wrap">
          <div class="font-semibold text-sm flex-1">${escHtml(a.label || a.type)}</div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="activity-badge" style="color:${cfg.color};background:${cfg.color}18;border:1px solid ${cfg.color}30">${cfg.label}</span>
            <span class="text-xs" style="color:var(--txtm);font-family:'JetBrains Mono',monospace">${time}</span>
          </div>
        </div>
        ${a.meta ? renderMeta(a.meta, a.type) : ''}
      </div>
    </div>
  `;
}

function renderMeta(meta, type) {
  const parts = [];
  if (meta.name)     parts.push(escHtml(meta.name));
  if (meta.amount)   parts.push(`<span style="color:var(--grn);font-weight:600">$${meta.amount}</span>`);
  if (meta.status)   parts.push(`<span style="color:var(--acc)">${escHtml(meta.status)}</span>`);
  if (meta.column)   parts.push(`→ ${escHtml(meta.column)}`);
  if (meta.invNum)   parts.push(escHtml(meta.invNum));
  if (meta.fileName) parts.push(`📎 ${escHtml(meta.fileName)}`);
  if (meta.to)       parts.push(`→ ${escHtml(meta.to)}`);
  if (meta.contact)  parts.push(escHtml(meta.contact));
  if (!parts.length) return '';
  return `<div class="text-xs mt-1" style="color:var(--txts);line-height:1.7">${parts.join(' · ')}</div>`;
}

function statCard(label, value, color, view) {
  const active = view && _actView === view;
  const clickable = !!view;
  return `
    <div class="stat-card${clickable?' act-stat-card':''}" ${view?`data-view="${view}"`:''}
      style="${clickable?'cursor:pointer;transition:border-color 0.15s;'+(active?'border-color:'+color+' !important;background:'+color+'0d':''):''}">
      <div class="stat-val" style="color:${color}">${value}</div>
      <div class="stat-label">${label}${clickable?` <span style="font-size:9px;opacity:.5">${active?'▲':'▼'}</span>`:''}</div>
    </div>`;
}

// ── Today Gigs sub-view ───────────────────────────
function renderTodayGigs() {
  const today = new Date().toISOString().slice(0, 10);
  const gigs  = dataService.getAll('gigs').filter(g => g.startDate === today);

  if (!gigs.length) return `
    <div class="empty-state" style="padding:32px 0">
      <div class="empty-state-title">No gigs today</div>
      <div class="empty-state-sub">Enjoy the day off!</div>
    </div>`;

  const STATUS_COLOR = { inquiry:'#E8B84B', confirmed:'#22C55E', completed:'#787878', cancelled:'#F87171' };
  return `
    <div class="mb-3">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">
        Gigs scheduled today — ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
      </div>
      <div class="flex flex-col gap-3">
        ${gigs.sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||'')).map(g => {
          const sc = STATUS_COLOR[g.status] || '#787878';
          return `<div class="card" style="padding:14px 18px;border-left:3px solid ${sc}">
            <div class="flex justify-between items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm mb-1">${escHtml(g.name)}</div>
                <div class="text-xs" style="color:var(--txts)">
                  ${g.startTime ? `${g.startTime} – ${g.endTime||''}` : 'All day'}
                  ${g.city ? ` · ${escHtml(g.city)}` : ''}
                  ${g.type ? ` · ${escHtml(g.type)}` : ''}
                </div>
              </div>
              <div class="font-black text-sm" style="color:var(--acc)">$${(+g.rate||0).toLocaleString()}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── This Week Tasks sub-view ──────────────────────
function renderWeekTasks() {
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const tasks = dataService.getAll('tasks')
    .sort((a, b) => (PRIORITY_ORDER[a.priority||'medium'] ?? 1) - (PRIORITY_ORDER[b.priority||'medium'] ?? 1));
  const PRI_COLOR = { high: '#F87171', medium: '#E8B84B', low: '#22C55E' };
  const today = new Date().toISOString().slice(0,10);

  if (!tasks.length) return `
    <div class="empty-state" style="padding:32px 0">
      <div class="empty-state-title">No tasks yet</div>
      <div class="empty-state-sub">Add tasks in the Tasks module.</div>
    </div>`;

  return `
    <div class="mb-3">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">
        All tasks — High → Medium → Low
      </div>
      <div class="flex flex-col gap-2">
        ${tasks.map(t => {
          const pri   = t.priority || 'medium';
          const color = PRI_COLOR[pri] || '#787878';
          const isOverdue = t.due && t.due < today;
          return `<div class="card" style="padding:12px 16px;border-left:3px solid ${color}">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm">${escHtml(t.title)}</div>
                ${t.desc ? `<div class="text-xs mt-0.5" style="color:var(--txts)">${escHtml(t.desc)}</div>` : ''}
                <div class="flex items-center gap-2 mt-1.5">
                  <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;background:${color}18;color:${color}">${pri}</span>
                  <span class="text-xs" style="color:var(--txts)">${escHtml(t.column||'')}</span>
                  ${t.due ? `<span class="text-xs" style="color:${isOverdue?'var(--red)':'var(--txts)'}">${t.due}${isOverdue?' (overdue)':''}</span>` : ''}
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}


// ── Filter + search ───────────────────────────────
function filterItems(list) {
  if (!_search) return list;
  const q = _search.toLowerCase();
  return list.filter(a =>
    a.label?.toLowerCase().includes(q) ||
    a.type?.toLowerCase().includes(q)  ||
    JSON.stringify(a.meta || {}).toLowerCase().includes(q)
  );
}

// ── Helpers ───────────────────────────────────────
export function typeConfig(type = '') {
  if (TYPES[type]) return TYPES[type];
  for (const [k, v] of Object.entries(TYPES)) {
    if (type.startsWith(k.split('.')[0])) return v;
  }
  return TYPES['__default__'];
}

export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 604800) return `${Math.floor(s/86400)}d ago`;
  return formatDate(iso.slice(0, 10));
}

function todayCount(list) {
  const today = new Date().toISOString().slice(0,10);
  return list.filter(a => a.ts?.slice(0,10) === today).length;
}

function weekCount(list) {
  const cutoff = Date.now() - 7 * 86400000;
  return list.filter(a => new Date(a.ts).getTime() > cutoff).length;
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Bus listeners — intercept all events ──────────
function setupListeners() {
  bus.on('contact.created', d => logActivity({
    type: 'contact.created', label: `New contact added`,
    meta: { name: d?.name, contact: d?.contact_type },
  }));
  bus.on('contact.updated', d => logActivity({
    type: 'contact.updated', label: `Contact updated`,
    meta: { name: d?.name },
  }));
  bus.on('gig.created', d => logActivity({
    type: 'gig.created', label: `New gig created`,
    meta: { name: d?.name, amount: d?.rate, status: d?.status },
  }));
  bus.on('gig.confirmed', d => logActivity({
    type: 'gig.confirmed', label: `Gig confirmed`,
    meta: { name: d?.name, amount: d?.rate },
  }));
  bus.on('invoice.created', d => logActivity({
    type: 'invoice.created', label: `Invoice created`,
    meta: { invNum: d?.num, amount: d?.items?.reduce((s,i) => s + (i.qty||1)*(i.rate||0), 0) },
  }));
  bus.on('invoice.paid', d => logActivity({
    type: 'invoice.paid', label: `Invoice marked paid`,
    meta: { invNum: d?.num, amount: d?.items?.reduce((s,i) => s + (i.qty||1)*(i.rate||0), 0) },
  }));
  bus.on('expense.added', d => logActivity({
    type: 'expense.added', label: `Expense recorded`,
    meta: { name: d?.vendor, amount: d?.amount },
  }));
  bus.on('task.updated', d => logActivity({
    type: 'task.updated', label: `Task moved or updated`,
    meta: { name: d?.title, column: d?.to || d?.column },
  }));

  // External activity events (from vault, calls, etc.)
  window.addEventListener('eb:activity', updateBadge);
}

// Init once
setupListeners();
updateBadge();

registerModule('activity', { render });
