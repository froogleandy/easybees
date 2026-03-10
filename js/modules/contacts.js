// modules/contacts.js

import { registerModule, setHeader, slidePanel, toast, bus, confirmDelete, stepsBar, fieldGroup, btnHTML } from '../core.js';
import { dataService } from '../dataService.js';
import { formatDate, formatCurrency, tagHTML, avatarHTML, uid, todayISO } from '../utils.js';
import { validateContact } from '../validators.js';

let _sort = { col:'name', dir:'asc' };
let _q    = '';

function render() {
  setHeader('Contacts', [
  ]);

  const contacts = getFiltered();

  document.getElementById('module-content').innerHTML = `
    <div class="relative mb-5 max-w-sm">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#787878" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="contacts-search" type="text" value="${_q}" placeholder="Search contacts…" class="field-input" style="padding-left:36px">
    </div>

    ${contacts.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-title">No contacts yet</div>
        <div class="empty-state-sub">Add your first contact to get started.</div>
        <button class="btn btn-primary" id="empty-add">+ Add Contact</button>
      </div>
    ` : `
      <div class="table-wrap">
        <table class="eb-table">
          <thead>
            <tr>
              ${[['name','Name'],['phone','Phone'],['email','Email'],['contact_type','Type'],['city','City'],['total_gigs','Gigs'],['total_revenue','Revenue']].map(([col,lbl])=>`
                <th data-col="${col}">${lbl}${_sort.col===col?(' '+(_sort.dir==='asc'?'↑':'↓')):''}</th>
              `).join('')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${contacts.map(c=>`
              <tr data-id="${c.id}" style="cursor:pointer">
                <td>
                  <div class="flex items-center gap-2">
                    ${avatarHTML(c.name, 28)}
                    <span class="font-semibold">${c.name}</span>
                  </div>
                </td>
                <td style="color:var(--txts)">${c.phone||'—'}</td>
                <td style="color:var(--txts)">${c.email||'—'}</td>
                <td>${c.contact_type ? `<span class="tag tag-${c.contact_type}">${c.contact_type}</span>` : '—'}</td>
                <td style="color:var(--txts)">${c.city||'—'}</td>
                <td class="font-semibold">${c.total_gigs||0}</td>
                <td class="font-bold" style="color:var(--acc)">${formatCurrency(c.total_revenue||0)}</td>
                <td class="no-nav">
                  <button class="btn btn-ghost btn-icon btn-sm del-btn" data-id="${c.id}">×</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('contacts-search')?.addEventListener('input', e => { _q = e.target.value; render(); });
  document.getElementById('empty-add')?.addEventListener('click', openCreate);
  document.querySelectorAll('#module-content th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      _sort.col === th.dataset.col ? (_sort.dir = _sort.dir==='asc'?'desc':'asc') : (_sort={ col:th.dataset.col, dir:'asc' });
      render();
    });
  });
  document.querySelectorAll('#module-content tbody tr').forEach(row => {
    row.addEventListener('click', e => { if (!e.target.closest('.no-nav')) openDetail(row.dataset.id); });
  });
  document.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); doDelete(btn.dataset.id); });
  });
}

function getFiltered() {
  const ql = _q.toLowerCase();
  return dataService.getAll('contacts')
    .filter(c => !_q || c.name.toLowerCase().includes(ql) || (c.email||'').toLowerCase().includes(ql) || (c.phone||'').includes(ql) || (c.city||'').toLowerCase().includes(ql))
    .sort((a,b) => {
      const av = String(a[_sort.col]||'').toLowerCase(), bv = String(b[_sort.col]||'').toLowerCase();
      return _sort.dir==='asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
}

// ── Create Contact — 7 focused steps ────────
const TOTAL_STEPS = 7;
let _form = {}, _step = 1;

function openCreate() {
  _form = { name:'', contact_type:'client', gig_type:'Music', phone:'', email:'', city:'', social_media:'', notes:'' };
  _step = 1;
  slidePanel.open('New Contact', '', '');
  renderStep();
}

function renderStep() {
  let body = stepsBar(TOTAL_STEPS, _step);
  let footer = '';
  const back   = _step > 1 ? btnHTML('Back','btn-ghost','sp-back') : btnHTML('Cancel','btn-ghost','sp-cancel');
  const next   = btnHTML('Continue','btn-primary','sp-next');
  const save   = btnHTML('Save Contact','btn-primary','sp-save');

  // ── Step 1: Name ──
  if (_step === 1) {
    body += `
      <div class="step-question">What's their name?</div>
      <input id="f-name" class="field-input" style="font-size:18px;padding:12px 14px" value="${_form.name}" placeholder="Full name" autofocus>
    `;
    footer = `${btnHTML('Cancel','btn-ghost','sp-cancel')} ${next}`;
  }

  // ── Step 2: Contact type ──
  else if (_step === 2) {
    body += `
      <div class="step-question">What kind of contact?</div>
      <div class="flex flex-col gap-2">
        ${[['client','Client','They hire you for gigs'],['contact','Contact','Someone in your network'],['both','Both','Hire you and part of your network']].map(([v,l,sub])=>`
          <button class="type-pick-btn text-left p-4 rounded-xl border-2 transition-all font-sans cursor-pointer" data-val="${v}"
            style="border-color:${_form.contact_type===v?'var(--acc)':'var(--bdr)'};background:${_form.contact_type===v?'rgba(232,184,75,0.06)':'var(--card)'}">
            <div class="font-bold text-sm" style="color:${_form.contact_type===v?'var(--acc)':'var(--txt)'}">${l}</div>
            <div class="text-xs mt-0.5" style="color:var(--txts)">${sub}</div>
          </button>
        `).join('')}
      </div>
    `;
    footer = `${back} ${next}`;
  }

  // ── Step 3: Gig type ──
  else if (_step === 3) {
    body += `
      <div class="step-question">What kind of gigs?</div>
      <div class="flex flex-col gap-2">
        ${[['Music','Music gigs'],['AV','AV / tech gigs'],['Both','Both music and AV']].map(([v,sub])=>`
          <button class="type-pick-btn text-left p-4 rounded-xl border-2 transition-all font-sans cursor-pointer" data-val="${v}"
            style="border-color:${_form.gig_type===v?'var(--acc)':'var(--bdr)'};background:${_form.gig_type===v?'rgba(232,184,75,0.06)':'var(--card)'}">
            <div class="font-bold text-sm" style="color:${_form.gig_type===v?'var(--acc)':'var(--txt)'}">${v}</div>
            <div class="text-xs mt-0.5" style="color:var(--txts)">${sub}</div>
          </button>
        `).join('')}
      </div>
    `;
    footer = `${back} ${next}`;
  }

  // ── Step 4: Phone ──
  else if (_step === 4) {
    body += `
      <div class="step-question">Phone number?</div>
      <div class="step-hint">Optional — skip if you don't have it yet.</div>
      <input id="f-phone" class="field-input" type="tel" style="font-size:18px;padding:12px 14px" value="${_form.phone}" placeholder="713-555-0000">
    `;
    footer = `${back} ${next}`;
  }

  // ── Step 5: Email ──
  else if (_step === 5) {
    body += `
      <div class="step-question">Email address?</div>
      <div class="step-hint">Optional — skip if you don't have it yet.</div>
      <input id="f-email" class="field-input" type="email" style="font-size:18px;padding:12px 14px" value="${_form.email}" placeholder="name@example.com">
    `;
    footer = `${back} ${next}`;
  }

  // ── Step 6: City + Social ──
  else if (_step === 6) {
    body += `
      <div class="step-question">Where are they based?</div>
      <div class="step-hint">Optional — helps with travel planning.</div>
      ${fieldGroup('City', `<input id="f-city" class="field-input" value="${_form.city}" placeholder="Houston">`)}
      ${fieldGroup('Social handle', `<input id="f-social" class="field-input" value="${_form.social_media}" placeholder="@username">`)}
    `;
    footer = `${back} ${next}`;
  }

  // ── Step 7: Notes + Review ──
  else if (_step === 7) {
    body += `
      <div class="step-question">Any notes?</div>
      <div class="step-hint">How you met, context, anything useful.</div>
      <textarea id="f-notes" class="field-input" rows="3" placeholder="e.g. Met at Jazz Fest 2025…">${_form.notes}</textarea>

      <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:12px;padding:16px;margin-top:8px">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Review</div>
        <div class="font-bold text-base mb-1">${_form.name}</div>
        <div class="flex gap-2 flex-wrap mb-2">
          <span class="tag" style="color:var(--acc);background:rgba(232,184,75,0.1)">${_form.contact_type}</span>
          <span class="tag" style="color:var(--prp);background:rgba(167,139,250,0.1)">${_form.gig_type}</span>
        </div>
        ${[_form.phone, _form.email, _form.city].filter(Boolean).map(v=>`<div class="text-sm mt-0.5" style="color:var(--txts)">${v}</div>`).join('')}
        ${_form.social_media?`<div class="text-sm mt-0.5" style="color:var(--txts)">${_form.social_media}</div>`:''}
      </div>
    `;
    footer = `${back} ${save}`;
  }

  slidePanel.setBody(body);
  slidePanel.setFooter(footer);
  bindStepEvents();
}

function bindStepEvents() {
  document.getElementById('sp-cancel')?.addEventListener('click', () => slidePanel.close());
  document.getElementById('sp-back')?.addEventListener('click',   () => { collect(); _step > 1 ? _step-- : null; renderStep(); });
  document.getElementById('sp-next')?.addEventListener('click',   () => { collect(); if (!validate()) return; _step++; renderStep(); });
  document.getElementById('sp-save')?.addEventListener('click',   () => { collect(); saveContact(); });

  // Type pick buttons (step 2 + 3)
  document.querySelectorAll('.type-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (_step === 2) _form.contact_type = btn.dataset.val;
      if (_step === 3) _form.gig_type     = btn.dataset.val;
      renderStep();
    });
  });

  // Auto-advance on Enter for text inputs
  const inp = slidePanel.body().querySelector('input:not([type=hidden])');
  inp?.focus();
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') { collect(); if (!validate()) return; if (_step < TOTAL_STEPS) { _step++; renderStep(); } else saveContact(); }});
}

function collect() {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  if (_step === 1) _form.name         = g('f-name');
  if (_step === 4) _form.phone        = g('f-phone');
  if (_step === 5) _form.email        = g('f-email');
  if (_step === 6) { _form.city = g('f-city'); _form.social_media = g('f-social'); }
  if (_step === 7) _form.notes        = document.getElementById('f-notes')?.value?.trim() || '';
}

function validate() {
  if (_step === 1 && !_form.name.trim()) { toast('Name is required.','error'); return false; }
  if (_step === 5 && _form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_form.email)) { toast('Invalid email address.','error'); return false; }
  return true;
}

function saveContact() {
  const existing = dataService.getAll('contacts');
  const v = validateContact(_form, existing);
  if (!v.valid) { toast(v.message,'error'); return; }
  const contact = { id:uid(), ..._form, name:_form.name.trim(), total_gigs:0, total_revenue:0, last_gig_date:null, date_met:todayISO(), created_at:todayISO() };
  dataService.save('contacts', contact);
  dataService.addTimeline({ contactId:contact.id, type:'contact_created', label:'Contact created' });
  bus.emit('contact.created', contact);
  slidePanel.close();
  toast('Contact saved');
  render();
}

// ── Contact Detail ───────────────────────────
function openDetail(id) {
  const c        = dataService.getById('contacts', id);
  if (!c) return;
  const gigs     = dataService.query('gigs', g => g.contactId === id);
  const timeline = dataService.getTimeline(id);

  const body = `
    <div class="flex items-center gap-4 mb-2">
      ${avatarHTML(c.name, 52)}
      <div>
        <div class="font-black text-lg">${c.name}</div>
        ${c.business_name?`<div class="text-sm" style="color:var(--txts)">${c.business_name}</div>`:''}
        <div class="flex gap-2 mt-1 flex-wrap">
          ${c.contact_type?`<span class="tag" style="color:var(--acc);background:rgba(232,184,75,0.1)">${c.contact_type}</span>`:''}
          ${c.gig_type?`<span class="tag" style="color:var(--prp);background:rgba(167,139,250,0.1)">${c.gig_type}</span>`:''}
        </div>
      </div>
    </div>

    <div class="card card-sm">
      <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Info</div>
      ${[['Phone',c.phone],['Email',c.email],['City',c.city],['Social',c.social_media]].filter(([,v])=>v).map(([l,v])=>`
        <div class="flex gap-3 text-sm py-1.5 border-t border-bdr" style="color:var(--txts)">
          <span class="w-12 flex-shrink-0 font-semibold" style="color:var(--txtm)">${l}</span>
          <span>${v}</span>
        </div>
      `).join('')}
    </div>

    <div class="grid grid-cols-3 gap-2">
      ${[['Gigs',c.total_gigs||0,'var(--blu)'],['Revenue',formatCurrency(c.total_revenue||0),'var(--acc)'],['Last',formatDate(c.last_gig_date,'monthDay')||'—','var(--txt)']].map(([l,v,col])=>`
        <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:9px;padding:11px;text-align:center">
          <div class="text-xs uppercase tracking-widest mb-1" style="color:var(--txts)">${l}</div>
          <div class="text-lg font-black" style="color:${col}">${v}</div>
        </div>
      `).join('')}
    </div>

    ${timeline.length ? `
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Timeline</div>
        ${timeline.map((t,i) => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            ${i<timeline.length-1?'<div class="timeline-line"></div>':''}
            <div>
              <div class="text-xs" style="color:var(--txts)">${formatDate(t.date)}</div>
              <div class="text-sm font-medium mt-0.5">${t.label}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `:''}

    ${gigs.length ? `
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Gigs (${gigs.length})</div>
        ${gigs.slice(0,5).map(g=>`
          <div class="flex justify-between text-sm py-2 border-t border-bdr">
            <span>${g.name}</span>
            <span class="font-bold" style="color:var(--acc)">${formatCurrency(g.rate)}</span>
          </div>
        `).join('')}
      </div>
    `:''}

    ${c.notes ? `
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Notes</div>
        <div class="text-sm" style="color:var(--txts);line-height:1.6">${c.notes}</div>
      </div>
    `:''}

    <button class="btn btn-danger btn-sm w-full" id="detail-del">Delete Contact</button>
  `;

  slidePanel.open(c.name, body, '');
  document.getElementById('detail-del')?.addEventListener('click', () => {
    confirmDelete(c.name, () => { doDelete(id); slidePanel.close(); });
  });
}

function doDelete(id) {
  const c = dataService.getById('contacts', id);
  dataService.remove('contacts', id);
  toast(`${c?.name||'Contact'} deleted`,'warning');
  render();
}

function doExport() {
  dataService.exportCSV('contacts','contacts.csv',['name','phone','email','contact_type','gig_type','city','total_gigs','total_revenue','date_met']);
  toast('CSV exported');
}

registerModule('contacts', { render });
