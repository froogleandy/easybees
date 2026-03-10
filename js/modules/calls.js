// modules/calls.js
// Record mic or upload audio → Anthropic transcribes + analyzes →
// Gig suggestion → Tasks → Contact link → Timeline entry

import { registerModule, setHeader, slidePanel, toast, bus, fieldGroup, btnHTML, stepsBar } from '../core.js';
import { dataService } from '../dataService.js';
import { uid, todayISO, formatDate, formatTime, avatarHTML } from '../utils.js';

// ── State ────────────────────────────────────
let _step       = 1;
let _form       = {};
let _mediaRec   = null;
let _chunks     = [];
let _audioBlob  = null;
let _timerID    = null;
let _seconds    = 0;
let _processing = false;

const TOTAL_STEPS = 7;

// ── Render list ──────────────────────────────
function render() {
  setHeader('Calls', [
  ]);

  const calls = dataService.getAll('calls').sort((a,b) => b.created_at.localeCompare(a.created_at));

  document.getElementById('module-content').innerHTML = `
    ${calls.length === 0 ? `
      <div class="empty-state">
        <div style="margin-bottom:16px">
          <div style="width:52px;height:52px;border-radius:50%;background:rgba(232,184,75,0.08);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </div>
        </div>
        <div class="empty-state-title">No calls logged yet</div>
        <div class="empty-state-sub">Record a call or upload a voice memo to get started.</div>
        <button class="btn btn-primary" id="empty-new">+ New Call</button>
      </div>
    ` : `
      <div class="flex flex-col gap-3">
        ${calls.map(c => {
          const contact = c.contactId ? dataService.getById('contacts', c.contactId) : null;
          return `
            <div class="call-card" data-call-id="${c.id}">
              <div class="call-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-sm mb-0.5">${c.title}</div>
                <div class="text-xs" style="color:var(--txts)">
                  ${formatDate(c.created_at)}
                  ${c.duration ? ' · ' + fmtDuration(c.duration) : ''}
                  ${contact ? ' · ' + contact.name : ''}
                </div>
                ${c.summary ? `<div class="text-xs mt-1 truncate" style="color:var(--txtm)">${c.summary}</div>` : ''}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                ${c.gigCreated   ? `<span class="tag" style="color:var(--grn);background:rgba(34,197,94,0.1)">Gig</span>`  : ''}
                ${c.tasksCreated ? `<span class="tag" style="color:var(--blu);background:rgba(96,165,250,0.1)">${c.tasksCreated} task${c.tasksCreated!==1?'s':''}</span>` : ''}
                <button class="btn btn-ghost btn-icon btn-sm del-call" data-id="${c.id}">×</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  document.getElementById('empty-new')?.addEventListener('click', openWizard);
  document.querySelectorAll('.call-card').forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('.del-call')) openDetail(card.dataset.callId); });
  });
  document.querySelectorAll('.del-call').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteCall(btn.dataset.id); });
  });
}

// ── Wizard open ──────────────────────────────
function openWizard() {
  _step       = 1;
  _audioBlob  = null;
  _chunks     = [];
  _seconds    = 0;
  _processing = false;
  _form = {
    captureMode: null,   // 'record' | 'upload'
    audioMime:   'audio/webm',
    transcript:  '',
    name:        '',
    jobTitle:    '',
    commitments: [],
    dates:       [],
    amounts:     [],
    gigSuggestion:  null,   // { name, type, rate, date } | null
    gigApproved:    false,
    gigEdits:       {},
    tasks:          [],     // [{ title, priority, column, approved }]
    contactId:      null,
    contactEmail:   '',
    isNewContact:   false,
    tokensIn:       0,
    tokensOut:      0,
    cost:           0,
  };
  slidePanel.open('New Call', '', '');
  renderStep();
}

// ── Step renderer ────────────────────────────
function renderStep() {
  let body = stepsBar(TOTAL_STEPS, _step);

  switch (_step) {
    case 1: body += renderCapture();    break;
    case 2: body += renderProcessing(); break;
    case 3: body += renderTranscript(); break;
    case 4: body += renderDetails();    break;
    case 5: body += renderTasks();      break;
    case 6: body += renderGig();        break;
    case 7: body += renderContact();    break;
  }

  slidePanel.setBody(body);
  slidePanel.setFooter('');
  bindStep();
}

// ────────────────────────────────────────────
// STEP 1 — Capture
// ────────────────────────────────────────────
function renderCapture() {
  return `
    <div class="step-question">Capture the call</div>
    <div class="flex gap-3 mb-5">
      <div class="capture-option${_form.captureMode==='record'?' active':''}" id="opt-record">
        <div class="capture-option-icon" style="background:rgba(248,113,113,0.1)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </div>
        <div class="font-bold text-sm">Record</div>
        <div class="text-xs" style="color:var(--txts)">Live mic recording</div>
      </div>
      <div class="capture-option${_form.captureMode==='upload'?' active':''}" id="opt-upload">
        <div class="capture-option-icon" style="background:rgba(96,165,250,0.1)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blu)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="font-bold text-sm">Upload</div>
        <div class="text-xs" style="color:var(--txts)">Voice memo / file</div>
      </div>
    </div>

    <!-- Record UI -->
    <div id="record-ui" style="display:${_form.captureMode==='record'?'block':'none'}">
      <div id="rec-idle" style="text-align:center;padding:20px 0">
        <button class="btn btn-primary" id="rec-start" style="padding:12px 28px;font-size:15px">
          Start Recording
        </button>
        <div class="text-xs mt-3" style="color:var(--txts)">Microphone will be requested</div>
      </div>
      <div id="rec-active" style="display:none;text-align:center;padding:16px 0">
        <div class="rec-waveform" style="justify-content:center;margin-bottom:12px">
          ${Array.from({length:7},()=>'<div class="rec-bar"></div>').join('')}
        </div>
        <div class="rec-indicator mb-4"><div class="rec-dot"></div> Recording <span id="rec-timer">0:00</span></div>
        <button class="btn btn-danger" id="rec-stop">Stop Recording</button>
      </div>
      <div id="rec-done" style="display:none">
        <div class="audio-file-preview">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--grn)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div class="flex-1">
            <div class="text-sm font-semibold">Recording captured</div>
            <div class="text-xs mt-0.5" style="color:var(--txts)" id="rec-duration-label"></div>
          </div>
          <button class="btn btn-ghost btn-sm" id="rec-redo">Re-record</button>
        </div>
      </div>
    </div>

    <!-- Upload UI -->
    <div id="upload-ui" style="display:${_form.captureMode==='upload'?'block':'none'}">
      <label class="file-attach-zone" id="upload-drop" style="flex-direction:column;gap:8px;padding:28px;text-align:center">
        <input type="file" id="upload-file" style="display:none" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--txts)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div class="text-sm font-semibold">Drop audio file or tap to browse</div>
        <div class="text-xs" style="color:var(--txts)">m4a · mp3 · wav · webm · ogg</div>
      </label>
      <div id="upload-preview" style="display:none" class="mt-3">
        <div class="audio-file-preview">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--grn)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <div class="flex-1">
            <div class="text-sm font-semibold" id="upload-name"></div>
            <div class="text-xs mt-0.5" style="color:var(--txts)" id="upload-size"></div>
          </div>
          <button class="btn btn-ghost btn-sm" id="upload-clear">Clear</button>
        </div>
      </div>
    </div>

    <div style="margin-top:24px;display:flex;gap:8px">
      ${btnHTML('Cancel','btn-ghost','sp-cancel')}
      ${btnHTML('Analyze Call →','btn-primary','sp-next')}
    </div>
  `;
}

// ────────────────────────────────────────────
// STEP 2 — Processing
// ────────────────────────────────────────────
function renderProcessing() {
  return `
    <div style="text-align:center;padding:32px 0">
      <div class="processing-ring" style="margin:0 auto 20px"></div>
      <div class="font-bold text-base mb-2">Analyzing your call…</div>
      <div class="text-sm" style="color:var(--txts)" id="proc-status">Sending audio to Claude</div>
    </div>
    <div class="collapsible-hdr" id="proc-hdr" style="margin-top:16px">
      <span class="text-xs font-bold uppercase tracking-widest" style="color:var(--txts)">Processing details</span>
      <span class="chevron-icon">▾</span>
    </div>
    <div class="collapsible-body" id="proc-body" style="display:none">
      <div class="text-xs" style="color:var(--txts);line-height:2" id="proc-log">Waiting…</div>
    </div>
  `;
}

// ────────────────────────────────────────────
// STEP 3 — Transcript (collapsible)
// ────────────────────────────────────────────
function renderTranscript() {
  return `
    <div class="step-question" style="margin-bottom:8px">Transcript</div>
    <div class="text-xs mb-3" style="color:var(--txts)">Edit if anything looks off before continuing.</div>

    <div class="collapsible-hdr open" id="tx-hdr">
      <span class="text-xs font-bold uppercase tracking-widest" style="color:var(--txts)">Full transcript</span>
      <span class="chevron-icon">▾</span>
    </div>
    <div class="collapsible-body" id="tx-body">
      <textarea id="f-transcript" class="field-input" rows="9" style="font-size:12px;line-height:1.8;resize:vertical">${_form.transcript}</textarea>
    </div>

    <div style="margin-top:20px;display:flex;gap:8px">
      ${btnHTML('Back','btn-ghost','sp-back')}
      ${btnHTML('Continue →','btn-primary','sp-next')}
    </div>
  `;
}

// ────────────────────────────────────────────
// STEP 4 — Extracted details
// ────────────────────────────────────────────
function renderDetails() {
  function chipList(items, key) {
    return `
      <div class="flex flex-col gap-2 mb-2" id="chips-${key}">
        ${items.map((item, i) => `
          <div class="extract-chip" data-key="${key}" data-i="${i}">
            <input class="chip-input" data-key="${key}" data-i="${i}" value="${escHtml(item)}" style="background:none;border:none;flex:1;font-size:13px;color:var(--txt);font-family:'Outfit',sans-serif;min-width:0">
            <button class="extract-chip-del" data-key="${key}" data-i="${i}">×</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-ghost btn-sm add-chip" data-key="${key}" style="font-size:11px">+ Add</button>
    `;
  }

  return `
    <div class="step-question" style="margin-bottom:4px">Extracted details</div>
    <div class="text-xs mb-5" style="color:var(--txts)">Edit anything the AI got wrong.</div>

    <div class="flex flex-col gap-4">
      ${fieldGroup('Name', `<input id="f-name" class="field-input" value="${escHtml(_form.name)}" placeholder="Person's name">`)}
      ${fieldGroup('Job Title', `<input id="f-title" class="field-input" value="${escHtml(_form.jobTitle)}" placeholder="e.g. Event Director">`)}

      <div class="field-group">
        <label class="field-label">Commitments</label>
        ${chipList(_form.commitments, 'commitments')}
      </div>
      <div class="field-group">
        <label class="field-label">Dates mentioned</label>
        ${chipList(_form.dates, 'dates')}
      </div>
      <div class="field-group">
        <label class="field-label">Amounts mentioned</label>
        ${chipList(_form.amounts, 'amounts')}
      </div>
    </div>

    <div style="margin-top:24px;display:flex;gap:8px">
      ${btnHTML('Back','btn-ghost','sp-back')}
      ${btnHTML('Continue →','btn-primary','sp-next')}
    </div>
  `;
}

// ────────────────────────────────────────────
// STEP 5 — Gig suggestion
// ────────────────────────────────────────────
function renderGig() {
  const g = _form.gigSuggestion;
  return `
    <div class="step-question" style="margin-bottom:4px">Gig suggestion</div>
    <div class="text-xs mb-4" style="color:var(--txts)">AI detected a potential booking. Edit or skip.</div>

    ${g ? `
      <div class="suggestion-card${_form.gigApproved?' approved':''}" id="gig-card">
        <div class="flex items-center justify-between mb-3">
          <div class="font-bold text-sm">Suggested Gig</div>
          <div class="flex gap-2">
            <button class="btn btn-sm ${_form.gigApproved?'btn-ghost':'btn-primary'}" id="gig-approve">
              ${_form.gigApproved ? 'Approved' : 'Approve'}
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          ${fieldGroup('Gig Name', `<input id="gs-name" class="field-input" value="${escHtml(g.name||'')}" placeholder="Gig name">`)}
          <div class="field-row-2">
            ${fieldGroup('Type', `<select id="gs-type" class="field-input"><option${g.type==='Music'?' selected':''}>Music</option><option${g.type==='AV'?' selected':''}>AV</option><option${g.type==='Both'?' selected':''}>Both</option></select>`)}
            ${fieldGroup('Rate ($)', `<input id="gs-rate" class="field-input" type="number" value="${g.rate||0}" placeholder="1500">`)}
          </div>
          ${fieldGroup('Date', `<input id="gs-date" class="field-input" type="date" value="${g.date||''}">`)}
        </div>
      </div>
    ` : `
      <div style="padding:28px;text-align:center;border:1px dashed var(--bdr);border-radius:12px">
        <div class="text-sm" style="color:var(--txts)">No gig detected in this call.</div>
        <button class="btn btn-ghost btn-sm mt-3" id="gig-manual">Add one manually</button>
      </div>
    `}

    <div style="margin-top:20px;display:flex;gap:8px">
      ${btnHTML('Back','btn-ghost','sp-back')}
      ${btnHTML(_form.gigApproved?'Continue →':'Skip →','btn-primary','sp-next')}
    </div>
  `;
}

// ────────────────────────────────────────────
// STEP 6 — Tasks
// ────────────────────────────────────────────
function renderTasks() {
  const COLS = ['To Do','In Progress','Review','Done','Music','Visual','Merch'];
  return `
    <div class="step-question" style="margin-bottom:4px">Suggested tasks</div>
    <div class="text-xs mb-4" style="color:var(--txts)">Edit, remove, or add tasks before approving.</div>

    <div class="flex flex-col gap-3 mb-4" id="task-list">
      ${_form.tasks.map((t, i) => `
        <div class="suggestion-card${t.approved?' approved':''}" data-task-i="${i}">
          <div class="flex items-center gap-2 mb-2">
            <div class="priority-light" style="background:${priColor(t.priority)};box-shadow:0 0 6px ${priColor(t.priority)}88;flex-shrink:0"></div>
            <input class="task-title-input field-input" data-i="${i}" value="${escHtml(t.title)}" style="flex:1;font-size:13px;padding:6px 10px">
            <button class="task-approve-btn btn btn-sm ${t.approved?'btn-ghost':'btn-primary'}" data-i="${i}" style="font-size:11px;padding:4px 10px;flex-shrink:0">
              ${t.approved?'On':'Add'}
            </button>
            <button class="task-del-btn btn btn-ghost btn-icon btn-sm" data-i="${i}">×</button>
          </div>
          <div class="flex gap-2">
            <select class="field-input task-pri" data-i="${i}" style="font-size:11px;padding:4px 8px;flex:1">
              ${['low','medium','high'].map(p=>`<option value="${p}"${t.priority===p?' selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
            </select>
            <select class="field-input task-col" data-i="${i}" style="font-size:11px;padding:4px 8px;flex:1">
              ${COLS.map(c=>`<option value="${c}"${t.column===c?' selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
      `).join('')}
    </div>

    <button class="btn btn-ghost btn-sm" id="add-task-btn">+ Add task</button>

    <div style="margin-top:20px;display:flex;gap:8px">
      ${btnHTML('Back','btn-ghost','sp-back')}
      ${btnHTML('Continue →','btn-primary','sp-next')}
    </div>
  `;
}

// ────────────────────────────────────────────
// STEP 7 — Contact + Confirm
// ────────────────────────────────────────────
function renderContact() {
  const contacts    = dataService.getAll('contacts');
  const approvedTasks = _form.tasks.filter(t => t.approved);
  const matchedContact = contacts.find(c =>
    c.name.toLowerCase() === _form.name.toLowerCase() ||
    (c.email && c.email.toLowerCase() === _form.contactEmail.toLowerCase())
  );

  return `
    <div class="step-question" style="margin-bottom:4px">Contact &amp; confirm</div>
    <div class="text-xs mb-5" style="color:var(--txts)">Link this call to a contact, then save everything.</div>

    <!-- Contact section -->
    <div class="card card-sm mb-4">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Contact</div>

      ${matchedContact && !_form.contactId ? `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-bdr mb-3" style="background:var(--bg)">
          ${avatarHTML(matchedContact.name, 36)}
          <div class="flex-1">
            <div class="font-semibold text-sm">${matchedContact.name}</div>
            <div class="text-xs" style="color:var(--txts)">${matchedContact.email||matchedContact.phone||''}</div>
          </div>
          <button class="btn btn-primary btn-sm" id="link-match">Link</button>
        </div>
      ` : _form.contactId ? `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-bdr mb-3" style="background:rgba(34,197,94,0.05);border-color:var(--grn)">
          ${avatarHTML(dataService.getById('contacts',_form.contactId)?.name||_form.name, 36)}
          <div class="flex-1">
            <div class="font-semibold text-sm">${dataService.getById('contacts',_form.contactId)?.name||_form.name}</div>
            <div class="text-xs" style="color:var(--grn)">Linked</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="unlink-contact">Unlink</button>
        </div>
      ` : ''}

      ${!_form.contactId ? `
        <div class="flex flex-col gap-3">
          ${fieldGroup('Name', `<input id="fc-name" class="field-input" value="${escHtml(_form.name)}" placeholder="Full name">`)}
          ${fieldGroup('Email', `<input id="fc-email" class="field-input" type="email" value="${escHtml(_form.contactEmail)}" placeholder="email@example.com">`)}
          ${fieldGroup('Job Title', `<input id="fc-title" class="field-input" value="${escHtml(_form.jobTitle)}" placeholder="e.g. Event Director">`)}
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm flex-1" id="create-contact-btn">Create Contact</button>
            <button class="btn btn-ghost btn-sm" id="skip-contact-btn" style="color:var(--txts)">Skip</button>
          </div>
          <div class="text-xs" style="color:var(--txts)">— or link existing —</div>
          <div class="flex flex-col gap-1.5 overflow-y-auto" style="max-height:140px">
            ${contacts.map(c=>`
              <div class="contact-pick p-2.5 rounded-xl border cursor-pointer transition-all text-sm" data-contact-id="${c.id}"
                style="border-color:var(--bdr);background:var(--card)">
                ${c.name}${c.email?` <span style="color:var(--txts)">· ${c.email}</span>`:''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Summary -->
    <div class="card card-sm mb-5">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">What will be saved</div>
      <div class="flex flex-col gap-1.5 text-sm" style="color:var(--txts);line-height:2">
        <div><span style="color:var(--acc)">·</span> Call logged to timeline</div>
        ${_form.gigApproved ? `<div><span style="color:var(--grn)">·</span> Gig created — ${escHtml(_form.gigSuggestion?.name||'')}</div>` : ''}
        ${approvedTasks.length ? `<div><span style="color:var(--blu)">·</span> ${approvedTasks.length} task${approvedTasks.length!==1?'s':''} added to board</div>` : ''}
        ${!_form.contactId ? `<div><span style="color:var(--txts)">·</span> Contact: not linked</div>` : `<div><span style="color:var(--grn)">·</span> Contact linked</div>`}
      </div>
    </div>

    <!-- Token usage -->
    ${_form.cost > 0 ? `
      <div class="text-xs mb-4" style="color:var(--txtm)">
        API usage: ${_form.tokensIn} in / ${_form.tokensOut} out · ~$${_form.cost.toFixed(4)}
      </div>
    ` : ''}

    <div style="display:flex;gap:8px">
      ${btnHTML('Back','btn-ghost','sp-back')}
      ${btnHTML('Save Call','btn-primary','sp-save')}
    </div>
  `;
}

// ────────────────────────────────────────────
// Bind step events
// ────────────────────────────────────────────
function bindStep() {
  const $ = id => document.getElementById(id);

  $('sp-cancel')?.addEventListener('click', () => { stopRecording(); slidePanel.close(); });
  $('sp-back')?.addEventListener('click',   () => { collectStep(); _step--; renderStep(); });
  $('sp-next')?.addEventListener('click',   () => { if (!nextStep()) return; });
  $('sp-save')?.addEventListener('click',   saveCall);

  // Step 1 — capture mode toggles
  $('opt-record')?.addEventListener('click', () => { _form.captureMode='record'; renderStep(); });
  $('opt-upload')?.addEventListener('click', () => { _form.captureMode='upload'; renderStep(); });

  // Step 1 — recording
  $('rec-start')?.addEventListener('click', startRecording);
  $('rec-stop')?.addEventListener('click',  stopRecording);
  $('rec-redo')?.addEventListener('click',  () => { _audioBlob=null; _seconds=0; renderStep(); });

  // Step 1 — upload
  $('upload-file')?.addEventListener('change', e => handleUpload(e.target.files[0]));
  $('upload-drop')?.addEventListener('click',  () => $('upload-file')?.click());
  $('upload-drop')?.addEventListener('dragover',  e => { e.preventDefault(); $('upload-drop').style.borderColor='var(--acc)'; });
  $('upload-drop')?.addEventListener('dragleave', () => { if ($('upload-drop')) $('upload-drop').style.borderColor=''; });
  $('upload-drop')?.addEventListener('drop',  e => { e.preventDefault(); handleUpload(e.dataTransfer.files[0]); });
  $('upload-clear')?.addEventListener('click', () => { _audioBlob=null; renderStep(); });

  // Step 2 — collapsible processing log
  $('proc-hdr')?.addEventListener('click', () => toggleCollapsible('proc-hdr','proc-body'));

  // Step 3 — collapsible transcript
  $('tx-hdr')?.addEventListener('click', () => toggleCollapsible('tx-hdr','tx-body'));

  // Step 4 — chips
  document.querySelectorAll('.extract-chip-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key, i = +btn.dataset.i;
      _form[key].splice(i, 1);
      renderStep();
    });
  });
  document.querySelectorAll('.add-chip').forEach(btn => {
    btn.addEventListener('click', () => { _form[btn.dataset.key].push(''); renderStep(); });
  });

  // Step 5 — gig
  $('gig-approve')?.addEventListener('click', () => {
    collectGigEdits();
    _form.gigApproved = !_form.gigApproved;
    renderStep();
  });
  $('gig-manual')?.addEventListener('click', () => {
    _form.gigSuggestion = { name: _form.name ? `Call with ${_form.name}` : '', type:'Music', rate:1500, date:todayISO() };
    renderStep();
  });

  // Step 6 — tasks
  document.querySelectorAll('.task-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      collectTaskEdits();
      _form.tasks[+btn.dataset.i].approved = !_form.tasks[+btn.dataset.i].approved;
      renderStep();
    });
  });
  document.querySelectorAll('.task-del-btn').forEach(btn => {
    btn.addEventListener('click', () => { collectTaskEdits(); _form.tasks.splice(+btn.dataset.i,1); renderStep(); });
  });
  $('add-task-btn')?.addEventListener('click', () => {
    collectTaskEdits();
    _form.tasks.push({ title:'New task', priority:'medium', column:'To Do', approved:true });
    renderStep();
  });

  // Step 7 — contact
  $('link-match')?.addEventListener('click', () => {
    const contacts = dataService.getAll('contacts');
    const matched = contacts.find(c => c.name.toLowerCase()===_form.name.toLowerCase());
    if (matched) _form.contactId = matched.id;
    renderStep();
  });
  $('unlink-contact')?.addEventListener('click', () => { _form.contactId=null; renderStep(); });
  $('create-contact-btn')?.addEventListener('click', createContactFromCall);
  $('skip-contact-btn')?.addEventListener('click', () => { _form.contactId=null; renderStep(); });
  document.querySelectorAll('.contact-pick').forEach(el => {
    el.addEventListener('click', () => { _form.contactId=el.dataset.contactId; renderStep(); });
  });
}

// ────────────────────────────────────────────
// Navigation / collect
// ────────────────────────────────────────────
function nextStep() {
  if (_step === 1) {
    if (!_audioBlob) { toast('Capture or upload audio first.','error'); return false; }
    _step = 2;
    renderStep();
    runAnalysis();
    return true;
  }
  if (_step === 3) { collectTranscript(); }
  if (_step === 4) { collectDetails(); }
  if (_step === 5) { collectTaskEdits(); }
  if (_step === 6) { collectGigEdits(); }
  _step++;
  renderStep();
  return true;
}

function collectStep() {
  if (_step === 3) collectTranscript();
  if (_step === 4) collectDetails();
  if (_step === 5) collectTaskEdits();
  if (_step === 6) collectGigEdits();
}

function collectTranscript() {
  _form.transcript = document.getElementById('f-transcript')?.value || _form.transcript;
}

function collectDetails() {
  _form.name     = document.getElementById('f-name')?.value?.trim()  || _form.name;
  _form.jobTitle = document.getElementById('f-title')?.value?.trim() || _form.jobTitle;
  // Collect chip edits
  ['commitments','dates','amounts'].forEach(key => {
    const inputs = document.querySelectorAll(`.chip-input[data-key="${key}"]`);
    if (inputs.length) _form[key] = [...inputs].map(i=>i.value.trim()).filter(Boolean);
  });
}

function collectGigEdits() {
  if (!_form.gigSuggestion) return;
  const n = document.getElementById('gs-name')?.value;
  const t = document.getElementById('gs-type')?.value;
  const r = document.getElementById('gs-rate')?.value;
  const d = document.getElementById('gs-date')?.value;
  if (n !== undefined) _form.gigSuggestion.name = n;
  if (t !== undefined) _form.gigSuggestion.type = t;
  if (r !== undefined) _form.gigSuggestion.rate = +r;
  if (d !== undefined) _form.gigSuggestion.date = d;
}

function collectTaskEdits() {
  document.querySelectorAll('[data-task-i]').forEach(card => {
    const i   = +card.dataset.taskI;
    const ttl = card.querySelector('.task-title-input');
    const pri = card.querySelector('.task-pri');
    const col = card.querySelector('.task-col');
    if (_form.tasks[i]) {
      if (ttl) _form.tasks[i].title    = ttl.value;
      if (pri) _form.tasks[i].priority = pri.value;
      if (col) _form.tasks[i].column   = col.value;
    }
  });
}

// ────────────────────────────────────────────
// Recording
// ────────────────────────────────────────────
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime   = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    _form.audioMime = mime;
    _chunks  = [];
    _seconds = 0;
    _mediaRec = new MediaRecorder(stream, { mimeType: mime });
    _mediaRec.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
    _mediaRec.onstop = () => {
      _audioBlob = new Blob(_chunks, { type: mime });
      stream.getTracks().forEach(t => t.stop());
      clearInterval(_timerID);
      // Show done state
      const idle   = document.getElementById('rec-idle');
      const active = document.getElementById('rec-active');
      const done   = document.getElementById('rec-done');
      const lbl    = document.getElementById('rec-duration-label');
      if (idle)   idle.style.display   = 'none';
      if (active) active.style.display = 'none';
      if (done)   done.style.display   = 'block';
      if (lbl)    lbl.textContent      = fmtDuration(_seconds);
    };
    _mediaRec.start(250);

    // UI switch
    document.getElementById('rec-idle').style.display   = 'none';
    document.getElementById('rec-active').style.display = 'block';

    // Timer
    _timerID = setInterval(() => {
      _seconds++;
      const el = document.getElementById('rec-timer');
      if (el) el.textContent = fmtDuration(_seconds);
    }, 1000);
  } catch (err) {
    toast('Microphone access denied.','error');
    console.error(err);
  }
}

function stopRecording() {
  if (_mediaRec && _mediaRec.state !== 'inactive') {
    _mediaRec.stop();
  }
  clearInterval(_timerID);
}

// ────────────────────────────────────────────
// Upload
// ────────────────────────────────────────────
function handleUpload(file) {
  if (!file) return;
  _form.audioMime = file.type || 'audio/mpeg';
  const reader = new FileReader();
  reader.onload = e => {
    _audioBlob = new Blob([e.target.result], { type: file.type });
    document.getElementById('upload-drop').style.display    = 'none';
    document.getElementById('upload-preview').style.display = 'block';
    const nameEl = document.getElementById('upload-name');
    const sizeEl = document.getElementById('upload-size');
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = `${(file.size/1024/1024).toFixed(1)} MB`;
  };
  reader.readAsArrayBuffer(file);
}

// ────────────────────────────────────────────
// AI Analysis — single Anthropic call
// ────────────────────────────────────────────
async function runAnalysis() {
  updateProcLog('Converting audio…');

  // Convert blob to base64
  const b64 = await blobToBase64(_audioBlob);
  const mime = _form.audioMime || 'audio/webm';

  updateProcLog('Sending to Claude…');

  const systemPrompt = `You are a call analysis assistant for a music professional's business management app.
Analyze the audio recording and return ONLY valid JSON with these fields:
{
  "transcript": "full verbatim transcript of the audio",
  "name": "full name of the OTHER person on the call (not the user)",
  "jobTitle": "their job title or role if mentioned",
  "commitments": ["array of commitments or action items mentioned by either party"],
  "dates": ["array of specific dates or timeframes mentioned"],
  "amounts": ["array of dollar amounts or rates mentioned"],
  "gigDetected": true or false,
  "gigSuggestion": {
    "name": "suggested gig name based on the conversation",
    "type": "Music or AV or Both",
    "rate": estimated dollar amount as number (0 if unclear),
    "date": "YYYY-MM-DD if a date was mentioned, else empty string"
  },
  "tasks": [
    { "title": "action item", "priority": "low|medium|high", "column": "To Do" }
  ],
  "summary": "one sentence summary of the call"
}
Return ONLY the JSON object, no markdown, no explanation.`;

  try {
    const { send, jsonFrom, AI_MODELS } = await import('../services/aiService.js');

    updateProcLog('Sending to Claude…');

    const { content, tokens } = await send({
      model:      AI_MODELS.SMART,
      max_tokens: 2000,
      system:     systemPrompt,
      messages: [{
        role: 'user',
        content: [{
          type:   'document',
          source: { type:'base64', media_type: mime, data: b64 },
        }, {
          type: 'text',
          text: 'Analyze this call recording and return the JSON.',
        }]
      }]
    });

    updateProcLog('Parsing response…');

    _form.tokensIn  = tokens.inputTokens;
    _form.tokensOut = tokens.outputTokens;
    _form.cost      = tokens.cost;

    let parsed;
    try { parsed = jsonFrom(content); }
    catch { parsed = {}; toast('AI returned unexpected format — transcript only.','warning'); }

    _form.transcript  = parsed.transcript  || '';
    _form.name        = parsed.name        || '';
    _form.jobTitle    = parsed.jobTitle    || '';
    _form.commitments = parsed.commitments || [];
    _form.dates       = parsed.dates       || [];
    _form.amounts     = parsed.amounts     || [];
    _form.summary     = parsed.summary     || '';
    _form.tasks       = (parsed.tasks||[]).map(t => ({ ...t, approved: true }));

    if (parsed.gigDetected && parsed.gigSuggestion) {
      _form.gigSuggestion = parsed.gigSuggestion;
    } else {
      _form.gigSuggestion = null;
    }

    updateProcLog('Done.');
    _step = 3;
    renderStep();

  } catch (err) {
    console.error(err);
    toast('Analysis failed — check your API key or try again.','error');
    _step = 1; renderStep();
  }
}

// ────────────────────────────────────────────
// Contact creation from call
// ────────────────────────────────────────────
function createContactFromCall() {
  const name  = document.getElementById('fc-name')?.value?.trim();
  const email = document.getElementById('fc-email')?.value?.trim();
  const title = document.getElementById('fc-title')?.value?.trim();
  if (!name) { toast('Name is required','error'); return; }

  const contact = {
    id: uid(), name, email: email||'', phone:'', city:'', state:'TX',
    business_name: title||'', social_media:'', notes: `Created from call on ${todayISO()}.`,
    contact_type:'client', gig_type:'Music',
    total_gigs:0, total_revenue:0, last_gig_date:null,
    date_met: todayISO(), created_at: todayISO(),
  };
  dataService.save('contacts', contact);
  bus.emit('contact.created', contact);
  _form.contactId    = contact.id;
  _form.contactEmail = email || '';
  toast('Contact created');
  renderStep();
}

// ────────────────────────────────────────────
// Final save
// ────────────────────────────────────────────
function saveCall() {
  // 1. Create approved tasks
  let tasksCreated = 0;
  _form.tasks.filter(t=>t.approved).forEach(t => {
    dataService.save('tasks', { id:uid(), title:t.title, desc:'From call: '+(t.column||''), priority:t.priority||'medium', column:t.column||'To Do', color:'#60A5FA', created_at:todayISO() });
    tasksCreated++;
  });

  // 2. Create approved gig
  let gigCreated = false;
  if (_form.gigApproved && _form.gigSuggestion) {
    const g = _form.gigSuggestion;
    const gig = {
      id:uid(), name:g.name, type:g.type||'Music',
      startDate:g.date||todayISO(), endDate:g.date||todayISO(),
      oneDay:true, startTime:'', endTime:'',
      contactId:_form.contactId||'', rate:g.rate||0,
      status:'inquiry', city:'', state:'TX',
      notes:'Created from call analysis.', created_at:todayISO()
    };
    dataService.save('gigs', gig);
    bus.emit('gig.created', gig);
    gigCreated = true;
  }

  // 3. Auto-title
  const dateLabel = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const title = _form.name
    ? `Call with ${_form.name} — ${dateLabel}`
    : `Call — ${dateLabel}`;

  // 4. Save call record
  const callRecord = {
    id:         uid(),
    title,
    contactId:  _form.contactId || null,
    transcript: _form.transcript,
    summary:    _form.summary,
    name:       _form.name,
    jobTitle:   _form.jobTitle,
    commitments:_form.commitments,
    dates:      _form.dates,
    amounts:    _form.amounts,
    duration:   _seconds || 0,
    gigCreated,
    tasksCreated,
    created_at: todayISO(),
  };
  dataService.save('calls', callRecord);

  // 5. Timeline entry on contact
  if (_form.contactId) {
    dataService.addTimeline({
      contactId: _form.contactId,
      type:      'call',
      label:     `Call logged — ${title}`,
    });
    // Update contact with job title if new
    if (_form.jobTitle) {
      const c = dataService.getById('contacts', _form.contactId);
      if (c && !c.business_name) {
        dataService.save('contacts', { ...c, business_name: _form.jobTitle });
      }
    }
  }

  stopRecording();
  slidePanel.close();
  toast('Call saved');
  render();
}

// ────────────────────────────────────────────
// Call detail panel
// ────────────────────────────────────────────
function openDetail(id) {
  const c = dataService.getById('calls', id);
  if (!c) return;
  const contact = c.contactId ? dataService.getById('contacts', c.contactId) : null;

  const body = `
    <div class="mb-4">
      <div class="font-black text-base mb-1">${c.title}</div>
      <div class="text-xs" style="color:var(--txts)">
        ${formatDate(c.created_at)}
        ${c.duration ? ' · ' + fmtDuration(c.duration) : ''}
        ${contact ? ' · ' + contact.name : ''}
      </div>
    </div>

    ${c.summary ? `
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Summary</div>
        <div class="text-sm" style="line-height:1.7">${c.summary}</div>
      </div>
    ` : ''}

    ${c.name||c.jobTitle ? `
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Contact on call</div>
        <div class="font-semibold text-sm">${c.name||'—'}</div>
        ${c.jobTitle?`<div class="text-xs mt-0.5" style="color:var(--txts)">${c.jobTitle}</div>`:''}
      </div>
    ` : ''}

    ${c.commitments?.length ? `
      <div class="card card-sm">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Commitments</div>
        ${c.commitments.map(x=>`<div class="flex items-start gap-2 mb-2 text-sm"><div class="call-timeline-dot mt-1.5"></div><span>${x}</span></div>`).join('')}
      </div>
    ` : ''}

    ${c.dates?.length||c.amounts?.length ? `
      <div class="grid grid-cols-2 gap-3">
        ${c.dates?.length ? `
          <div class="card card-sm">
            <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Dates</div>
            ${c.dates.map(x=>`<div class="text-sm mb-1" style="color:var(--txts)">${x}</div>`).join('')}
          </div>
        ` : ''}
        ${c.amounts?.length ? `
          <div class="card card-sm">
            <div class="text-xs font-bold uppercase tracking-widest mb-2" style="color:var(--txts)">Amounts</div>
            ${c.amounts.map(x=>`<div class="text-sm mb-1 font-semibold" style="color:var(--acc)">${x}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    ` : ''}

    ${c.transcript ? `
      <div class="card card-sm">
        <div class="collapsible-hdr" id="det-tx-hdr" style="margin:-14px -16px 0;border:none;border-radius:0;background:transparent;padding:0 0 10px 0">
          <span class="text-xs font-bold uppercase tracking-widest" style="color:var(--txts)">Transcript</span>
          <span class="chevron-icon">▾</span>
        </div>
        <div id="det-tx-body" style="display:none">
          <div class="transcript-body mt-3">${escHtml(c.transcript)}</div>
        </div>
      </div>
    ` : ''}

    <button class="btn btn-danger btn-sm" id="detail-del-call">Delete Call</button>
  `;

  slidePanel.open(c.title, body, '');

  document.getElementById('det-tx-hdr')?.addEventListener('click', () => toggleCollapsible('det-tx-hdr','det-tx-body'));
  document.getElementById('detail-del-call')?.addEventListener('click', () => {
    if (window.confirm(`Delete "${c.title}"?`)) { deleteCall(id); slidePanel.close(); }
  });
}

function deleteCall(id) {
  dataService.remove('calls', id);
  toast('Call deleted','warning');
  render();
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
function fmtDuration(secs) {
  const m = Math.floor(secs/60), s = secs%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function updateProcLog(msg) {
  const el = document.getElementById('proc-log');
  const st = document.getElementById('proc-status');
  if (el) el.textContent = (el.textContent === 'Waiting…' ? '' : el.textContent + '\n') + msg;
  if (st) st.textContent = msg;
}

function toggleCollapsible(hdrId, bodyId) {
  const hdr  = document.getElementById(hdrId);
  const body = document.getElementById(bodyId);
  if (!hdr || !body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  hdr.classList.toggle('open', !isOpen);
}

function priColor(p) {
  return p==='high' ? '#F87171' : p==='low' ? '#22C55E' : '#E8B84B';
}

function escHtml(str='') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

registerModule('calls', { render });
