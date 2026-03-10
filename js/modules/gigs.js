// modules/gigs.js

import { registerModule, setHeader, slidePanel, toast, bus, confirmDelete, stepsBar, fieldGroup, btnHTML } from '../core.js';
import { dataService } from '../dataService.js';
import { calPickerHTML, initCalPicker, timePickerHTML, initTimePicker } from '../picker.js';
import { formatDate, formatTime, formatCurrency, GIG_STATUS, tagHTML, uid, todayISO, fileToBase64 } from '../utils.js';
import { validateGig, checkDoubleBooking, checkTravelConflict } from '../validators.js';

let _filter  = 'all';
let _step    = 1;
let _form    = {};
let _warning = '';

function render() {
  setHeader('Gigs', [
  ]);

  const gigs     = dataService.getAll('gigs');
  const contacts = dataService.getAll('contacts');
  const filtered = gigs.filter(g => _filter==='all' || g.status===_filter)
                       .sort((a,b) => b.startDate.localeCompare(a.startDate));

  document.getElementById('module-content').innerHTML = `
    <div class="filter-tabs mb-5">
      ${Object.keys(GIG_STATUS).map(s=>`
        <button class="filter-tab${_filter===s?' active':''}" data-filter="${s}">
          ${GIG_STATUS[s].label}
        </button>
      `).join('')}
    </div>

    ${filtered.length===0 ? `
      <div class="empty-state">
        <div class="empty-state-title">No gigs found</div>
        <div class="empty-state-sub">Create your first gig to get started.</div>
        <button class="btn btn-primary" id="empty-add">+ New Gig</button>
      </div>
    ` : `
      <div class="flex flex-col gap-3">
        ${filtered.map(g => {
          const cl = contacts.find(c=>c.id===g.contactId);
          return `
            <div class="card gig-card-row flex justify-between items-center gap-4" data-gig-id="${g.id}" style="padding:14px 18px;border:1px solid var(--bdr)">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <span class="font-bold text-sm">${g.name}</span>
                  ${tagHTML(g.status)}
                  <span class="text-xs font-bold px-2 py-0.5 rounded-full" style="background:var(--bdr);color:var(--txts)">${g.type}</span>
                </div>
                <div class="text-xs truncate" style="color:var(--txts)">
                  ${formatDate(g.startDate)}
                  ${g.startTime?' · '+formatTime(g.startTime)+'–'+formatTime(g.endTime):''}
                  ${g.city?' · '+g.city:''}
                  ${cl?' · '+cl.name:''}
                </div>
                ${g.notes?`<div class="text-xs mt-1 truncate" style="color:var(--txtm)">${g.notes}</div>`:''}
              </div>
              <div class="flex items-center gap-3 flex-shrink-0 no-del">
                <span class="font-black text-base" style="color:var(--acc)">${formatCurrency(g.rate)}</span>
                <button class="btn btn-ghost btn-icon btn-sm del-gig" data-id="${g.id}">×</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  document.querySelectorAll('.filter-tab').forEach(btn=>btn.addEventListener('click',()=>{
    _filter = _filter === btn.dataset.filter ? 'all' : btn.dataset.filter;
    render();
  }));
  document.getElementById('empty-add')?.addEventListener('click', openCreate);
  document.querySelectorAll('.gig-card-row').forEach(row => {
    row.addEventListener('click', e => { if (!e.target.closest('.no-del')) openDetail(row.dataset.gigId); });
  });
  document.querySelectorAll('.del-gig').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();doDelete(btn.dataset.id);}));
}

// ── Gig Detail Panel ─────────────────────────
function openDetail(id) {
  const g  = dataService.getById('gigs', id);
  if (!g) return;
  const contacts = dataService.getAll('contacts');
  const cl = contacts.find(c=>c.id===g.contactId);

  const body = `
    <div class="mb-4">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="font-black text-lg leading-tight">${g.name}</div>
        ${tagHTML(g.status)}
      </div>
      <span class="text-xs font-bold px-2 py-0.5 rounded-full inline-block" style="background:var(--bdr);color:var(--txts)">${g.type}</span>
    </div>

    <!-- Editable date/time -->
    <div class="card card-sm">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Date &amp; Time</div>
      <div class="flex flex-col gap-3">
        ${fieldGroup('Start date', calPickerHTML('ed-start', g.startDate, 'Start date'))}
        <label class="check-label"><input type="checkbox" id="ed-oneday" ${g.oneDay!==false?'checked':''}> Single day</label>
        <div id="ed-enddate-wrap" ${g.oneDay!==false?'style="display:none"':''}>
          ${fieldGroup('End date', calPickerHTML('ed-end', g.endDate||'', 'End date'))}
        </div>
        <div class="field-row-2">
          ${fieldGroup('Start', timePickerHTML('ed-stime', g.startTime, 'Start'))}
          ${fieldGroup('End',   timePickerHTML('ed-etime', g.endTime,   'End'))}
        </div>
        <button class="btn btn-ghost btn-sm" id="save-datetime">Save Date &amp; Time</button>
      </div>
    </div>

    <!-- Info -->
    <div class="card card-sm">
      <div class="flex flex-col gap-1.5" style="font-size:13px;color:var(--txts)">
        ${g.city?`<div><span style="color:var(--txtm);margin-right:8px">Location</span>${g.city}</div>`:''}
        ${cl?`<div><span style="color:var(--txtm);margin-right:8px">Contact</span>${cl.name}</div>`:g.contactName?`<div><span style="color:var(--txtm);margin-right:8px">Contact</span>${g.contactName}</div>`:''}
        <div><span style="color:var(--txtm);margin-right:8px">Rate</span><strong style="color:var(--acc)">${formatCurrency(g.rate)}</strong></div>
      </div>
    </div>

    <!-- Status -->
    <div class="card card-sm">
      <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Status</div>
      <div class="flex gap-2 flex-wrap">
        ${Object.entries(GIG_STATUS).map(([k,s])=>`
          <button class="btn btn-sm gig-status-btn${g.status===k?' active':''}" data-status="${k}" data-id="${g.id}"
            style="${g.status===k?`background:${s.bg};color:${s.color};border-color:${s.color}`:''}">
            ${s.label}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Notes -->
    <div class="card card-sm">
      <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Notes</div>
      <textarea id="gig-notes" class="field-input" rows="3" placeholder="Add notes…">${g.notes||''}</textarea>
      <button class="btn btn-ghost btn-sm mt-2" id="save-gig-notes">Save Notes</button>
    </div>

    <!-- File attach -->
    <div class="card card-sm">
      <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Attachment</div>
      ${g.attachment ? `
        <div class="flex items-center gap-3 mb-3">
          <div style="width:44px;height:44px;border-radius:7px;overflow:hidden;border:1px solid var(--bdr);flex-shrink:0;background:var(--bg);display:flex;align-items:center;justify-content:center">
            ${g.attachmentType?.startsWith('image')?`<img src="data:${g.attachmentType};base64,${g.attachment}" style="width:100%;height:100%;object-fit:cover">`:'+'}
          </div>
          <div>
            <div class="text-sm font-semibold">${g.attachmentName||'File'}</div>
            <button class="btn btn-danger btn-sm mt-1" id="remove-attach">Remove</button>
          </div>
        </div>
      ` : ''}
      <label class="file-attach-zone${g.attachment?' has-file':''}">
        <input type="file" id="gig-file" style="display:none" accept="image/*,.pdf,.doc,.docx">
        <span>+</span>
        <span>${g.attachment?'Replace file':'Attach file (contract, rider…)'}</span>
      </label>
    </div>

    <button class="btn btn-danger btn-sm" id="detail-del">Delete Gig</button>
  `;

  slidePanel.open(g.name, body, '');

  initCalPicker('ed-start'); initCalPicker('ed-end');
  initTimePicker('ed-stime'); initTimePicker('ed-etime');

  document.getElementById('ed-oneday')?.addEventListener('change', e=>{
    document.getElementById('ed-enddate-wrap').style.display = e.target.checked?'none':'block';
  });
  document.getElementById('save-datetime')?.addEventListener('click', ()=>{
    const cur = dataService.getById('gigs', id);
    const oneDay = document.getElementById('ed-oneday')?.checked ?? true;
    dataService.save('gigs', { ...cur,
      startDate: document.getElementById('ed-start')?.value || cur.startDate,
      endDate:   document.getElementById('ed-end')?.value   || cur.endDate,
      oneDay,
      startTime: document.getElementById('ed-stime')?.value || cur.startTime,
      endTime:   document.getElementById('ed-etime')?.value || cur.endTime,
    });
    toast('Date & time saved'); render();
  });
  document.getElementById('save-gig-notes')?.addEventListener('click', ()=>{
    const cur = dataService.getById('gigs', id);
    dataService.save('gigs', { ...cur, notes: document.getElementById('gig-notes')?.value||'' });
    toast('Notes saved'); render();
  });
  document.querySelectorAll('.gig-status-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cur = dataService.getById('gigs', btn.dataset.id);
      dataService.save('gigs', { ...cur, status: btn.dataset.status });
      toast('Status updated'); slidePanel.close(); render();
    });
  });
  document.getElementById('gig-file')?.addEventListener('change', async e=>{
    const file = e.target.files[0]; if(!file) return;
    const b64 = await fileToBase64(file);
    const cur = dataService.getById('gigs', id);
    dataService.save('gigs', { ...cur, attachment:b64, attachmentName:file.name, attachmentType:file.type });
    toast('File attached'); openDetail(id);
  });
  document.getElementById('remove-attach')?.addEventListener('click', ()=>{
    const cur = dataService.getById('gigs', id);
    dataService.save('gigs', { ...cur, attachment:null, attachmentName:null, attachmentType:null });
    toast('Attachment removed','warning'); openDetail(id);
  });
  document.getElementById('detail-del')?.addEventListener('click', ()=>{
    confirmDelete(g.name, ()=>{ doDelete(id); slidePanel.close(); });
  });
}


// ── 7-Step Create Flow ───────────────────────
function openCreate() {
  _form = { name:'', type:'Music', startDate:'', endDate:'', oneDay:true, startTime:'', endTime:'', contactId:'', rate:1500, status:'inquiry', city:'', notes:'' };
  _step=1; _warning='';
  slidePanel.open('New Gig','','');
  renderStep();
}

function renderStep() {
  let body = stepsBar(7, _step);
  const back   = _step>1 ? btnHTML('Back','btn-ghost','sp-back') : '';
  const cancel = btnHTML('Cancel','btn-ghost','sp-cancel');
  const next   = btnHTML('Continue','btn-primary','sp-next');
  const save   = btnHTML('Create Gig','btn-primary','sp-save');
  const contacts = dataService.getAll('contacts');

  // ── Step 1: Type ──
  if (_step===1) {
    body += `
      <div class="step-question">What type of gig?</div>
      <div class="flex flex-col gap-3">
        ${[['Music','Music performance','$500–$5,000'],['AV','AV / tech services','$100–$1,000']].map(([t,sub,r])=>`
          <button class="type-pick-btn text-left p-5 rounded-xl border-2 font-sans cursor-pointer transition-all" data-type="${t}"
            style="border-color:${_form.type===t?'var(--acc)':'var(--bdr)'};background:${_form.type===t?'rgba(232,184,75,0.06)':'var(--card)'}">
            <div class="font-bold text-base" style="color:${_form.type===t?'var(--acc)':'var(--txt)'}">${t}</div>
            <div class="text-xs mt-0.5" style="color:var(--txts)">${sub} · ${r}</div>
          </button>
        `).join('')}
      </div>
    `;
    slidePanel.setBody(body);
    slidePanel.setFooter(`${cancel} ${next}`);
    document.getElementById('sp-cancel')?.addEventListener('click', ()=>slidePanel.close());
    document.getElementById('sp-next')?.addEventListener('click', ()=>{ if(!_form.type){toast('Select a type','error');return;} _step++;renderStep(); });
    document.querySelectorAll('.type-pick-btn').forEach(btn=>btn.addEventListener('click',()=>{ _form.type=btn.dataset.type; _form.rate=_form.type==='AV'?550:1500; renderStep(); }));
    return;
  }

  // ── Step 2: Name ──
  if (_step===2) {
    body += `
      <div class="step-question">What's the gig called?</div>
      <input id="f-name" class="field-input" style="font-size:18px;padding:12px 14px" value="${_form.name}" placeholder="e.g. Jazz Night @ Blue Moon">
    `;
  }

  // ── Step 3: Date ──
  else if (_step===3) {
    body += `
      <div class="step-question">When is it?</div>
      ${fieldGroup('Start date', calPickerHTML('f-start', _form.startDate, 'Pick a date'))}
      <label class="check-label mt-1"><input type="checkbox" id="f-oneday" ${_form.oneDay?'checked':''}> Single day gig</label>
      <div id="end-date-wrap" ${_form.oneDay?'style="display:none"':'style="margin-top:12px"'}>
        ${fieldGroup('End date', calPickerHTML('f-end', _form.endDate, 'Pick end date'))}
      </div>
    `;
  }

  // ── Step 4: Time ──
  else if (_step===4) {
    body += `
      <div class="step-question">What time?</div>
      ${_warning ? `<div class="warn-box mb-4">${_warning}</div>` : ''}
      <div class="field-row-2">
        ${fieldGroup('Start time', timePickerHTML('f-stime', _form.startTime, 'Start time'))}
        ${fieldGroup('End time',   timePickerHTML('f-etime', _form.endTime,   'End time'))}
      </div>
      <label class="check-label mt-3" style="gap:10px">
        <input type="checkbox" id="f-onetimefee" ${_form.oneTimeFee?'checked':''}>
        <div>
          <div class="font-semibold text-sm">One-time flat fee</div>
          <div class="text-xs" style="color:var(--txts)">Skip the rate slider — enter a fixed total amount</div>
        </div>
      </label>
      ${_form.oneTimeFee ? `
        <div class="mt-3">
          ${fieldGroup('Flat fee amount ($)', `<input id="f-flatfee" class="field-input" type="number" min="0" value="${_form.rate||0}" placeholder="e.g. 2500" style="font-size:18px">`)}
        </div>
      ` : ''}
    `;
  }

  // ── Step 5: Contact name ──
  else if (_step===5) {
    body += `
      <div class="step-question">Who's the contact?</div>
      <div class="step-hint">Type their full name — you can link a contact later.</div>
      <input id="f-contactname" class="field-input" style="font-size:18px;padding:12px 14px" value="${_form.contactName||''}" placeholder="Full Name" autofocus>
    `;
  }

  // ── Step 6: Rate ──
  else if (_step===6) {
    const min = _form.type==='AV'?100:500;
    const max = _form.type==='AV'?1000:5000;
    body += `
      <div class="step-question">Set your rate</div>
      <div class="text-center py-6">
        <div id="rate-display" class="font-black" style="font-size:52px;color:var(--acc);letter-spacing:-0.03em">${formatCurrency(_form.rate)}</div>
        <div class="text-xs mt-1" style="color:var(--txts)">${_form.type} gig</div>
      </div>
      <input id="f-rate" type="range" min="${min}" max="${max}" step="${_form.type==='AV'?50:100}" value="${_form.rate}">
      <div class="flex justify-between text-xs mt-2" style="color:var(--txts)"><span>${formatCurrency(min)}</span><span>${formatCurrency(max)}</span></div>
    `;
  }

  // ── Step 7: Location + Status + Review ──
  else if (_step===7) {
    body += `
      <div class="step-question">Almost done</div>
      ${fieldGroup('City (optional)', `<input id="f-city" class="field-input" value="${_form.city}" placeholder="Houston">`)}
      <div class="text-xs font-bold uppercase tracking-widest mt-4 mb-2" style="color:var(--txts)">Status</div>
      <div class="flex gap-2 flex-wrap mb-5">
        ${Object.entries(GIG_STATUS).map(([k,s])=>`
          <button class="status-btn btn btn-sm" data-status="${k}"
            style="${_form.status===k?`background:${s.bg};color:${s.color};border-color:${s.color}`:''}">
            ${s.label}
          </button>
        `).join('')}
      </div>
      <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:12px;padding:16px;font-size:13px;color:var(--txts);line-height:2">
        <div class="font-bold text-white text-sm mb-1">${_form.name}</div>
        <div>${formatDate(_form.startDate)}${!_form.oneDay&&_form.endDate?' → '+formatDate(_form.endDate):''}</div>
        ${_form.startTime?`<div>${formatTime(_form.startTime)} – ${formatTime(_form.endTime)}</div>`:''}
        ${_form.city?`<div>${_form.city}</div>`:''}
        <div style="color:var(--acc);font-weight:700">${formatCurrency(_form.rate)}</div>
      </div>
    `;
  }

  slidePanel.setBody(body);
  slidePanel.setFooter(`${cancel}${back?' '+back:''} ${_step===7?save:next}`);
  bindStepEvents();

  // Init pickers after DOM insertion
  if (_step===3) { initCalPicker('f-start'); initCalPicker('f-end'); }
  if (_step===4) { initTimePicker('f-stime'); initTimePicker('f-etime'); }
}

function bindStepEvents() {
  document.getElementById('sp-cancel')?.addEventListener('click', ()=>slidePanel.close());
  document.getElementById('sp-back')?.addEventListener('click',   ()=>{ collectStep(); _step--; renderStep(); });
  document.getElementById('sp-next')?.addEventListener('click',   ()=>{
    collectStep();
    if (!validateStep()) return;
    if (_step===4) { runConflictCheck(); return; }
    // Skip rate step (6) if one-time fee already set
    if (_step===5 && _form.oneTimeFee) { _step=7; renderStep(); return; }
    _step++; renderStep();
  });
  document.getElementById('sp-save')?.addEventListener('click',   doSave);

  // Step 3 one-day toggle
  document.getElementById('f-oneday')?.addEventListener('change', e=>{
    _form.oneDay=e.target.checked;
    const wrap=document.getElementById('end-date-wrap');
    if(wrap) wrap.style.display=_form.oneDay?'none':'block';
  });
  // Step 6 rate
  document.getElementById('f-rate')?.addEventListener('input', e=>{ _form.rate=+e.target.value; const el=document.getElementById('rate-display'); if(el) el.textContent=formatCurrency(_form.rate); });
  // Step 7 status
  document.querySelectorAll('.status-btn').forEach(btn=>btn.addEventListener('click',()=>{ _form.status=btn.dataset.status; document.querySelectorAll('.status-btn').forEach(b=>{ const s=GIG_STATUS[b.dataset.status]; b.style.background=b.dataset.status===_form.status?s.bg:''; b.style.color=b.dataset.status===_form.status?s.color:''; b.style.borderColor=b.dataset.status===_form.status?s.color:''; }); }));
}

function collectStep() {
  const g = id => document.getElementById(id)?.value||'';
  if (_step===2) _form.name      = g('f-name');
  if (_step===3) { _form.startDate=g('f-start'); _form.endDate=g('f-end')||_form.startDate; _form.oneDay=document.getElementById('f-oneday')?.checked??true; }
  if (_step===4) {
    _form.startTime  = g('f-stime');
    _form.endTime    = g('f-etime');
    _form.oneTimeFee = document.getElementById('f-onetimefee')?.checked || false;
    if (_form.oneTimeFee) _form.rate = +g('f-flatfee') || _form.rate;
  }
  if (_step===5) { _form.contactName=g('f-contactname'); }
  if (_step===6) { if (!_form.oneTimeFee) _form.rate = +g('f-rate')||_form.rate; }
  if (_step===7) _form.city      = g('f-city');
}

function validateStep() {
  if (_step===2 && !_form.name.trim())               { toast('Gig name is required.','error'); return false; }
  if (_step===3 && !_form.startDate)                 { toast('Start date is required.','error'); return false; }
  if (_step===4 && (!_form.oneTimeFee) && (!_form.startTime||!_form.endTime)){ toast('Both times are required, or check One-time flat fee.','error'); return false; }
  return true;
}

function runConflictCheck() {
  const existing = dataService.getAll('gigs');
  const doubles  = checkDoubleBooking(_form, existing);
  const travel   = checkTravelConflict(_form, existing, dataService.getSettings().minimum_travel_buffer_hours||2);
  _warning = doubles.length ? `Possible double booking: ${doubles.map(g=>g.name).join(', ')}` :
             travel.length  ? `Travel conflict: ${travel.map(g=>g.name).join(', ')}` : '';
  _step++;
  renderStep();
}

function doSave() {
  collectStep();
  const v = validateGig(_form);
  if (!v.valid) { toast(v.message,'error'); return; }
  const gig = { id:uid(), ..._form, created_at:todayISO() };
  dataService.save('gigs', gig);
  if (_form.contactId) {
    const c = dataService.getById('contacts', _form.contactId);
    if (c) { dataService.save('contacts',{...c,total_gigs:(c.total_gigs||0)+1,last_gig_date:_form.startDate}); dataService.addTimeline({contactId:c.id,type:'gig',label:`Gig booked — ${_form.name}`}); }
  }
  bus.emit('gig.created', gig);
  slidePanel.close();
  toast('Gig created');
  render();
}

function doDelete(id) {
  const g = dataService.getById('gigs', id);
  confirmDelete(g?.name||'Gig', ()=>{ dataService.remove('gigs',id); toast('Gig deleted','warning'); render(); });
}

function doExport() {
  dataService.exportCSV('gigs','gigs.csv',['name','type','startDate','startTime','endTime','rate','status','city']);
  toast('CSV exported');
}

registerModule('gigs', { render });
