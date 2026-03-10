// modules/dashboard.js

import { registerModule, setHeader, navigate, bus } from '../core.js';
import { dataService } from '../dataService.js';
import { formatCurrency, formatDate, GIG_STATUS, INVOICE_STATUS, tagHTML } from '../utils.js';
import { Auth } from '../auth.js';
import { getAll as getActivity, typeConfig, relativeTime } from './activity.js';
let _period   = 'monthly';
let _recentTab = 'gigs'; // 'gigs' | 'invoices'

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function render() {
  const contacts = dataService.getAll('contacts');
  const gigs     = dataService.getAll('gigs');
  const invoices = dataService.getAll('invoices');
  const expenses = dataService.getAll('expenses');
  const now      = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const yearStr  = `${now.getFullYear()}`;
  const prefix   = _period === 'monthly' ? monthStr : yearStr;

  const invTotal = inv => inv.items.reduce((s,i) => s + i.qty*i.rate, 0);

  const income     = invoices.filter(i => i.status==='paid' && (i.date||'').startsWith(prefix)).reduce((s,i) => s+invTotal(i), 0);
  const expTotal   = expenses.filter(e => ['Food','Travel','Gear'].includes(e.category) && (e.date||'').startsWith(prefix)).reduce((s,e) => s+e.amount, 0);
  const billsTotal = expenses.filter(e => e.category==='Bills' && (e.date||'').startsWith(prefix)).reduce((s,e) => s+e.amount, 0);
  const outstanding = invoices.filter(i => i.status!=='paid').reduce((s,i) => s+invTotal(i), 0);
  const activeGigs  = gigs.filter(g => ['inquiry','booked'].includes(g.status)).length;

  setHeader('Dashboard', [
  ]);

  const recentGigs = [...gigs].sort((a,b) => b.startDate.localeCompare(a.startDate)).slice(0,5);
  const recentInv  = [...invoices].sort((a,b) => b.date.localeCompare(a.date)).slice(0,4);
  const todayStr   = now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const sub        = _period === 'monthly' ? 'This Month' : 'This Year';
  const user       = Auth.getUser();
  const firstName  = user?.name?.split(' ')[0] || '';

  document.getElementById('module-content').innerHTML = `
    <div class="flex items-start justify-between gap-4 mb-7" style="flex-wrap:wrap">
      <div>
        <div class="text-2xl font-black tracking-tight" style="letter-spacing:-0.02em">Good ${getGreeting()}${firstName ? ', ' + firstName : ''}</div>
        <div class="text-sm mt-1" style="color:var(--txts)">${todayStr}${user?.city ? ' · ' + user.city : ''}</div>
      </div>
      <div class="flex items-center gap-1 p-1 rounded-lg border border-bdr" style="background:var(--bg)">
        <button id="toggle-monthly" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all" style="${_period==='monthly'?'background:var(--surf);color:var(--acc);border:1px solid var(--bdrl)':'color:var(--txts);border:1px solid transparent'}">Monthly</button>
        <button id="toggle-yearly"  class="px-3 py-1.5 rounded-md text-xs font-bold transition-all" style="${_period==='yearly'?'background:var(--surf);color:var(--acc);border:1px solid var(--bdrl)':'color:var(--txts);border:1px solid transparent'}">Yearly</button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-3 mb-3">
      ${[
        ['Income',   sub, formatCurrency(income),    'var(--grn)', 'money'],
        ['Expenses', sub, formatCurrency(expTotal),  'var(--red)', 'money'],
        ['Bills',    sub, formatCurrency(billsTotal), 'var(--org)', 'money'],
      ].map(([l,s,v,c,mod]) => `
        <div class="stat-card" data-nav="${mod}">
          <div class="flex items-baseline justify-between mb-3">
            <div class="text-xs font-bold uppercase tracking-widest" style="color:var(--txts)">${l}</div>
            <div class="text-xs" style="color:var(--txtm)">${s}</div>
          </div>
          <div class="text-3xl font-black tracking-tight" style="color:${c};letter-spacing:-0.03em">${v}</div>
        </div>
      `).join('')}
    </div>

    <div class="grid grid-cols-3 gap-3 mb-6">
      ${[
        ['Outstanding', formatCurrency(outstanding), 'var(--acc)', 'money'],
        ['Active Gigs',  activeGigs,                'var(--blu)', 'gigs'],
        ['Contacts',     contacts.length,           'var(--txt)', 'contacts'],
      ].map(([l,v,c,mod]) => `
        <div class="stat-card" data-nav="${mod}" style="padding:14px 18px">
          <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">${l}</div>
          <div class="text-2xl font-black" style="color:${c}">${v}</div>
        </div>
      `).join('')}
    </div>

    <!-- ── Bottom: activity feed + recent side by side ── -->
    <div class="grid gap-4" style="grid-template-columns:1fr 1fr">

      <!-- Recent Activity -->
      <div class="card" style="padding:0;overflow:hidden">
        <div class="flex items-center justify-between px-4 py-3" style="border-bottom:1px solid var(--bdr)">
          <div class="text-xs font-bold uppercase tracking-widest" style="color:var(--txts)">Recent Activity</div>
          <button class="btn btn-ghost btn-sm" id="dash-all-activity" style="font-size:10px;padding:2px 8px">View All</button>
        </div>
        <div>
          ${(()=>{
            const acts = getActivity().slice(0,6);
            if (!acts.length) return `<div class="text-xs px-4 py-5" style="color:var(--txts)">No activity yet.</div>`;
            return acts.map(a => {
              const cfg  = typeConfig(a.type);
              const time = relativeTime(a.ts);
              return `<div class="flex items-start gap-2.5 px-4 py-2.5" style="border-bottom:1px solid var(--bdr)">
                <div style="width:7px;height:7px;border-radius:50%;background:${cfg.dot};flex-shrink:0;margin-top:5px"></div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-semibold truncate">${escHtml(a.label || a.type)}</div>
                  <div class="text-xs mt-0.5" style="color:var(--txtm);font-family:'JetBrains Mono',monospace">${time}</div>
                </div>
                <span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:20px;color:${cfg.color};background:${cfg.color}18;flex-shrink:0;white-space:nowrap">${cfg.label}</span>
              </div>`;
            }).join('');
          })()}
        </div>
      </div>

      <!-- Recent Gigs / Invoices -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div class="flex gap-1 p-1 rounded-lg border border-bdr" style="background:var(--bg)">
            <button id="dash-tab-gigs"     class="px-3 py-1.5 rounded-md text-xs font-bold transition-all" style="${_recentTab==='gigs'    ?'background:var(--surf);color:var(--acc);border:1px solid var(--bdrl)':'color:var(--txts);border:1px solid transparent'}">Gigs</button>
            <button id="dash-tab-invoices" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all" style="${_recentTab==='invoices'?'background:var(--surf);color:var(--acc);border:1px solid var(--bdrl)':'color:var(--txts);border:1px solid transparent'}">Invoices</button>
          </div>
          <button class="btn btn-ghost btn-sm" id="dash-view-all">${_recentTab==='gigs'?'All Gigs':'All Invoices'}</button>
        </div>

        ${_recentTab === 'gigs' ? (
          recentGigs.length ? recentGigs.map(g => `
            <div class="flex justify-between items-center py-2.5 border-t border-bdr">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold truncate">${g.name}</div>
                <div class="text-xs mt-0.5" style="color:var(--txts)">${formatDate(g.startDate)} · ${g.type}</div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                ${tagHTML(g.status)}
                <span class="font-bold text-sm" style="color:var(--acc)">${formatCurrency(g.rate)}</span>
              </div>
            </div>`).join('') : '<div class="text-sm pt-2 border-t border-bdr" style="color:var(--txts)">No gigs yet.</div>'
        ) : (
          recentInv.length ? recentInv.map(inv => {
            const cl  = contacts.find(c => c.id===inv.clientId);
            const tot = invTotal(inv);
            return `<div class="flex justify-between items-center py-2.5 border-t border-bdr">
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold mb-0.5" style="color:var(--acc)">${inv.num}</div>
                <div class="text-sm font-semibold truncate">${cl?.name||'Unknown'}</div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 ml-2">
                ${tagHTML(inv.status, INVOICE_STATUS)}
                <span class="font-bold text-sm">${formatCurrency(tot)}</span>
              </div>
            </div>`;
          }).join('') : '<div class="text-sm pt-2 border-t border-bdr" style="color:var(--txts)">No invoices yet.</div>'
        )}
      </div>
    </div>
  `;

  document.getElementById('toggle-monthly')?.addEventListener('click', () => { _period='monthly'; render(); });
  document.getElementById('toggle-yearly')?.addEventListener('click',  () => { _period='yearly';  render(); });
  document.getElementById('dash-all-activity')?.addEventListener('click', () => navigate('activity'));
  document.querySelectorAll('.stat-card[data-nav]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.nav)));

  document.getElementById('dash-tab-gigs')?.addEventListener('click',     () => { _recentTab='gigs';     render(); });
  document.getElementById('dash-tab-invoices')?.addEventListener('click',  () => { _recentTab='invoices'; render(); });
  document.getElementById('dash-view-all')?.addEventListener('click', () => navigate(_recentTab === 'gigs' ? 'gigs' : 'money'));


}

function initials(name = '') {
  return (name || '').split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase() || '?';
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

registerModule('dashboard', { render });
bus.on('contact.created', render);
bus.on('gig.created',     render);
bus.on('invoice.created', render);
bus.on('invoice.paid',    render);
bus.on('expense.added',   render);
bus.on('task.updated',    render);
