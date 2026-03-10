// modules/calendar.js

import { registerModule, setHeader, modal, toast, fieldGroup, btnHTML, navigate } from '../core.js';
import { dataService } from '../dataService.js';
import { MONTHS, DAYS_SHORT, GIG_STATUS, formatDate, formatTime, formatCurrency, tagHTML, todayISO, uid } from '../utils.js';

let _yr  = new Date().getFullYear();
let _mo  = new Date().getMonth();
let _sel = null;

// ── Cal settings stored in eb_settings ─────────────────────────────────────
const GIG_TYPES = ['Music', 'AV', 'Both'];
const DEFAULT_TYPE_COLORS = { Music: '#E8B84B', AV: '#60A5FA', Both: '#A78BFA' };

function getCalSettings() {
  const s = dataService.getSettings();
  return {
    typeColors:   s.calTypeColors   || DEFAULT_TYPE_COLORS,
    statusColors: s.calStatusColors || {},
  };
}

function effectiveStatusColor(status) {
  const cs = getCalSettings().statusColors;
  return cs[status] || GIG_STATUS[status]?.color || '#888';
}

function effectiveTypeColor(type) {
  return getCalSettings().typeColors[type] || DEFAULT_TYPE_COLORS[type] || '#888';
}

// ── Render ──────────────────────────────────────────────────────────────────
function render() {
  setHeader('Calendar', []);
  renderMonth();
}

function renderMonth() {
  const gigs     = dataService.getAll('gigs');
  const today    = todayISO();
  const firstDay = new Date(_yr, _mo, 1).getDay();
  const total    = new Date(_yr, _mo+1, 0).getDate();

  const byDate = {};
  gigs.forEach(g => { (byDate[g.startDate] = byDate[g.startDate]||[]).push(g); });
  function ds(d) { return `${_yr}-${String(_mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  const selGigs = _sel ? (byDate[_sel]||[]) : [];
  const cs = getCalSettings();

  document.getElementById('module-content').innerHTML = `
    <!-- Nav -->
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <div class="flex items-center" style="background:var(--surf);border:1px solid var(--bdr);border-radius:9px;overflow:hidden">
        <button id="cal-prev" style="background:none;border:none;color:var(--txts);cursor:pointer;padding:7px 14px;font-size:17px">‹</button>
        <span class="font-bold text-sm" style="min-width:130px;text-align:center">${MONTHS[_mo]} ${_yr}</span>
        <button id="cal-next" style="background:none;border:none;color:var(--txts);cursor:pointer;padding:7px 14px;font-size:17px">›</button>
      </div>
      <button id="cal-today" class="btn btn-ghost btn-sm">Today</button>
      <div class="text-xs ml-auto" style="color:var(--txts)">Double-click a day to add an event</div>
    </div>

    <!-- Legend — type colors -->
    <div class="flex gap-4 mb-4 flex-wrap">
      ${GIG_TYPES.map(t=>`
        <div class="flex items-center gap-1.5 text-xs" style="color:var(--txts)">
          <div style="width:8px;height:8px;border-radius:50%;background:${effectiveTypeColor(t)}"></div>${t}
        </div>`).join('')}
      <div class="flex gap-3 ml-2">
        ${Object.entries(GIG_STATUS).map(([k,s])=>`
          <div class="flex items-center gap-1 text-xs" style="color:var(--txts)">
            <div style="width:6px;height:6px;border-radius:2px;background:${effectiveStatusColor(k)}"></div>${s.label}
          </div>`).join('')}
      </div>
    </div>

    <!-- Day headers -->
    <div class="cal-grid mb-1">
      ${DAYS_SHORT.map(d=>`<div class="cal-day-hdr">${d}</div>`).join('')}
    </div>

    <!-- Calendar grid -->
    <div class="cal-grid mb-6">
      ${Array(firstDay).fill('<div class="cal-cell empty"></div>').join('')}
      ${Array.from({length:total},(_,i)=>i+1).map(d=>{
        const dStr    = ds(d);
        const dayGigs = byDate[dStr]||[];
        const isToday = dStr===today;
        const isSel   = dStr===_sel;
        return `<div class="cal-cell${isToday?' today':''}${isSel?' selected':''}" data-date="${dStr}" title="Click to view · Double-click to add">
          <div class="cal-day-num${isToday?' text-acc':''}">${d}</div>
          ${dayGigs.slice(0,2).map(g=>{
            const typeColor   = effectiveTypeColor(g.type);
            const statusColor = effectiveStatusColor(g.status);
            return `<div class="cal-event" style="color:${statusColor};background:${statusColor}15;border-left:2px solid ${typeColor}">${g.name}</div>`;
          }).join('')}
          ${dayGigs.length>2?`<div style="font-size:9px;color:var(--txts);text-align:right">+${dayGigs.length-2}</div>`:''}
          <div class="cal-add-hint">+</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Selected day gigs list -->
    ${_sel ? `
      <div style="border-top:1px solid var(--bdr);padding-top:20px">
        <div class="flex items-center justify-between mb-4">
          <div class="font-bold">${formatDate(_sel,'long')}</div>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-sm" id="cal-add-event-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Event
            </button>
            <button id="cal-close-detail" style="background:none;border:none;color:var(--txts);cursor:pointer;font-size:20px;line-height:1">×</button>
          </div>
        </div>
        ${selGigs.length===0
          ? `<div class="text-sm" style="color:var(--txts)">No gigs on this day. Double-click or hit Add Event.</div>`
          : `<div class="flex flex-col gap-3">
              ${selGigs.map(g=>{
                const typeColor   = effectiveTypeColor(g.type);
                const statusColor = effectiveStatusColor(g.status);
                return `
                  <div class="card" style="padding:14px 18px;border-left:3px solid ${typeColor}">
                    <div class="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div class="font-bold text-sm mb-1">${g.name}</div>
                        <div class="flex items-center gap-2">
                          ${tagHTML(g.status)}
                          <span class="text-xs" style="color:${typeColor};font-weight:600">${g.type}</span>
                        </div>
                      </div>
                      <div class="font-black" style="color:var(--acc);white-space:nowrap">${formatCurrency(g.rate)}</div>
                    </div>
                    <div class="text-xs" style="color:var(--txts);line-height:2">
                      ${g.startTime?`<span style="margin-right:12px">${formatTime(g.startTime)} – ${formatTime(g.endTime)}</span>`:''}
                      ${g.city?`<span>${g.city}</span>`:''}
                    </div>
                    <div class="mt-3 pt-3" style="border-top:1px solid var(--bdr)">
                      <textarea class="field-input gig-note-area" data-gig-id="${g.id}" rows="2"
                        placeholder="Add a note…" style="font-size:12px;resize:none">${g.notes||''}</textarea>
                      <button class="btn btn-ghost btn-sm mt-2 save-gig-note" data-gig-id="${g.id}" style="font-size:11px">Save note</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>`
        }
      </div>
    ` : ''}
  `;

  // Nav
  document.getElementById('cal-prev')?.addEventListener('click', ()=>{ _mo===0?(_yr--,_mo=11):_mo--; _sel=null; renderMonth(); });
  document.getElementById('cal-next')?.addEventListener('click', ()=>{ _mo===11?(_yr++,_mo=0):_mo++; _sel=null; renderMonth(); });
  document.getElementById('cal-today')?.addEventListener('click',()=>{ _yr=new Date().getFullYear(); _mo=new Date().getMonth(); _sel=null; renderMonth(); });
  document.getElementById('cal-close-detail')?.addEventListener('click',()=>{ _sel=null; renderMonth(); });
  document.getElementById('cal-add-event-btn')?.addEventListener('click', ()=> openAddEvent(_sel));

  // Single-click = select, Double-click = add event
  document.querySelectorAll('.cal-cell:not(.empty)').forEach(cell=>{
    cell.addEventListener('click', ()=>{ _sel=_sel===cell.dataset.date?null:cell.dataset.date; renderMonth(); });
    cell.addEventListener('dblclick', e=>{ e.preventDefault(); _sel=cell.dataset.date; openAddEvent(cell.dataset.date); });
  });

  // Save notes inline
  document.querySelectorAll('.save-gig-note').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id   = btn.dataset.gigId;
      const area = document.querySelector(`.gig-note-area[data-gig-id="${id}"]`);
      const gig  = dataService.getById('gigs', id);
      if (gig && area) { dataService.save('gigs',{...gig,notes:area.value}); toast('Note saved'); }
    });
  });
}

// ── Add Event Modal ─────────────────────────────────────────────────────────
function openAddEvent(date = todayISO()) {
  const contacts = dataService.getAll('contacts');
  modal.open('Add Event', `
    <div class="flex flex-col gap-3">
      ${fieldGroup('Event name', `<input id="ae-name" class="field-input" placeholder="Gig or event name…">`)}
      <div class="field-row-2">
        ${fieldGroup('Date', `<input id="ae-date" class="field-input" type="date" value="${date}">`)}
        ${fieldGroup('Type', `<select id="ae-type" class="field-input">
          ${GIG_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}
        </select>`)}
      </div>
      <div class="field-row-2">
        ${fieldGroup('Start time', `<input id="ae-start" class="field-input" type="time">`)}
        ${fieldGroup('End time',   `<input id="ae-end"   class="field-input" type="time">`)}
      </div>
      ${fieldGroup('Contact', `<select id="ae-contact" class="field-input">
        <option value="">— No contact —</option>
        ${contacts.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
      </select>`)}
      <div class="field-row-2">
        ${fieldGroup('Rate / Fee ($)', `<input id="ae-rate" class="field-input" type="number" min="0" value="1500">`)}
        ${fieldGroup('City', `<input id="ae-city" class="field-input" placeholder="City…">`)}
      </div>
      ${fieldGroup('Notes', `<textarea id="ae-notes" class="field-input" rows="2" placeholder="Optional notes…"></textarea>`)}
    </div>
  `, `${btnHTML('Cancel','btn-ghost','ae-cancel')} ${btnHTML('Save Event','btn-primary','ae-save')}`);

  document.getElementById('ae-cancel')?.addEventListener('click', ()=> modal.close());
  document.getElementById('ae-save')?.addEventListener('click', ()=>{
    const name = document.getElementById('ae-name')?.value?.trim();
    if (!name) { toast('Event name is required.', 'error'); return; }
    const gig = {
      id:        uid(),
      name,
      type:      document.getElementById('ae-type')?.value || 'Music',
      startDate: document.getElementById('ae-date')?.value || date,
      endDate:   document.getElementById('ae-date')?.value || date,
      oneDay:    true,
      startTime: document.getElementById('ae-start')?.value || '',
      endTime:   document.getElementById('ae-end')?.value   || '',
      contactId: document.getElementById('ae-contact')?.value || '',
      rate:      +(document.getElementById('ae-rate')?.value) || 0,
      city:      document.getElementById('ae-city')?.value?.trim() || '',
      notes:     document.getElementById('ae-notes')?.value?.trim() || '',
      status:    'inquiry',
      created_at: new Date().toISOString(),
    };
    dataService.save('gigs', gig);
    modal.close();
    toast(`Event "${name}" added`);
    _sel = gig.startDate;
    renderMonth();
  });
}

// ── Calendar Settings Modal ─────────────────────────────────────────────────
export function openCalSettings() {
  const cs = getCalSettings();

  modal.open('Calendar Settings', `
    <!-- Type colors -->
    <div class="mb-5">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Gig Type Colors</div>
      <div class="flex flex-col gap-2">
        ${GIG_TYPES.map(t=>`
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">${t}</span>
            <input type="color" class="cs-type-color" data-type="${t}" value="${cs.typeColors[t]||DEFAULT_TYPE_COLORS[t]||'#E8B84B'}"
              style="width:40px;height:32px;border:1px solid var(--bdr);border-radius:6px;cursor:pointer;background:none;padding:2px">
          </div>`).join('')}
      </div>
    </div>

    <!-- Status colors -->
    <div>
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Gig Status Colors</div>
      <div class="flex flex-col gap-2">
        ${Object.entries(GIG_STATUS).map(([k,s])=>`
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">${s.label}</span>
            <input type="color" class="cs-status-color" data-status="${k}" value="${cs.statusColors[k]||s.color}"
              style="width:40px;height:32px;border:1px solid var(--bdr);border-radius:6px;cursor:pointer;background:none;padding:2px">
          </div>`).join('')}
      </div>
    </div>

    <button class="btn btn-ghost btn-sm mt-4" id="cs-reset" style="color:var(--red)">Reset to defaults</button>
  `, `${btnHTML('Cancel','btn-ghost','cs-cancel')} ${btnHTML('Save','btn-primary','cs-save')}`);

  document.getElementById('cs-cancel')?.addEventListener('click', ()=> modal.close());
  document.getElementById('cs-reset')?.addEventListener('click', ()=>{
    dataService.saveSetting('calTypeColors',   DEFAULT_TYPE_COLORS);
    dataService.saveSetting('calStatusColors', {});
    modal.close(); toast('Colors reset'); renderMonth();
  });
  document.getElementById('cs-save')?.addEventListener('click', ()=>{
    const typeColors = {};
    document.querySelectorAll('.cs-type-color').forEach(inp => { typeColors[inp.dataset.type] = inp.value; });
    const statusColors = {};
    document.querySelectorAll('.cs-status-color').forEach(inp => { statusColors[inp.dataset.status] = inp.value; });
    dataService.saveSetting('calTypeColors',   typeColors);
    dataService.saveSetting('calStatusColors', statusColors);
    modal.close(); toast('Calendar colors saved'); renderMonth();
  });
}

// ── Google Calendar setup ────────────────────────────────────────────────────
export function openGCalSetup() {
  const s = dataService.getSettings();
  modal.open('Connect Google Calendar', `
    <div class="info-box mb-4" style="font-size:12px;line-height:1.8">
      1. Go to <strong>console.cloud.google.com</strong><br>
      2. New Project → Enable <strong>Google Calendar API</strong><br>
      3. Credentials → OAuth 2.0 Client ID → Web App<br>
      4. Add your domain to authorized origins<br>
      5. Paste Client ID below
    </div>
    ${fieldGroup('Google OAuth Client ID', `<input id="gcal-id" class="field-input" value="${s.gcalClientId||''}" placeholder="xxxxxx.apps.googleusercontent.com">`)}
  `, `${btnHTML('Cancel','btn-ghost','m-cancel')} ${btnHTML('Save','btn-primary','m-save')}`);
  document.getElementById('m-cancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('m-save')?.addEventListener('click',()=>{
    dataService.saveSetting('gcalClientId',document.getElementById('gcal-id').value.trim());
    modal.close(); toast('Google Calendar saved');
  });
}

registerModule('calendar', { render });
