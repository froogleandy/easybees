// picker.js — Inline calendar + time picker dropdowns

import { MONTHS, DAYS_SHORT, todayISO } from './utils.js';

let _activeDropdown = null;

function closeActive() {
  if (_activeDropdown) { _activeDropdown.remove(); _activeDropdown = null; }
}
document.addEventListener('click', e => {
  if (!e.target.closest('.picker-wrap')) closeActive();
}, true);

// ── Calendar Picker ──────────────────────────
// Returns HTML string for a date picker.
// After inserting to DOM, call initCalPicker(containerId, fieldId, opts)
export function calPickerHTML(fieldId, value = '', placeholder = 'Select date') {
  return `
    <div class="picker-wrap" id="cpw-${fieldId}">
      <div class="picker-display" id="cpd-${fieldId}" data-field="${fieldId}">
        <span id="cpl-${fieldId}" class="${value ? '' : 'ph'}">${value ? formatDisplayDate(value) : placeholder}</span>
        <span class="picker-chevron">▾</span>
      </div>
      <input type="hidden" id="${fieldId}" value="${value}">
    </div>
  `;
}

export function initCalPicker(fieldId) {
  const display = document.getElementById(`cpd-${fieldId}`);
  if (!display) return;
  display.addEventListener('click', e => {
    e.stopPropagation();
    if (_activeDropdown && _activeDropdown.dataset.for === fieldId) { closeActive(); return; }
    closeActive();
    const input  = document.getElementById(fieldId);
    const val    = input?.value || todayISO();
    const wrap   = document.getElementById(`cpw-${fieldId}`);
    const drop   = buildCalDrop(fieldId, val);
    wrap.appendChild(drop);
    _activeDropdown = drop;
    display.classList.add('open');
  });
}

function buildCalDrop(fieldId, selectedISO) {
  const parts = selectedISO ? selectedISO.split('-') : todayISO().split('-');
  let yr = +parts[0], mo = +parts[1] - 1;

  const drop = document.createElement('div');
  drop.className = 'picker-dropdown';
  drop.dataset.for = fieldId;

  function paint() {
    const today     = todayISO();
    const firstDay  = new Date(yr, mo, 1).getDay();
    const totalDays = new Date(yr, mo+1, 0).getDate();
    const input     = document.getElementById(fieldId);
    const selVal    = input?.value || '';

    drop.innerHTML = `
      <div class="cal-picker">
        <div class="cal-picker-nav">
          <button id="cp-prev-${fieldId}">‹</button>
          <span>${MONTHS[mo]} ${yr}</span>
          <button id="cp-next-${fieldId}">›</button>
        </div>
        <div class="cal-picker-days">
          ${DAYS_SHORT.map(d => `<div class="cal-picker-dh">${d[0]}</div>`).join('')}
          ${Array(firstDay).fill('<button class="cal-picker-day empty" disabled></button>').join('')}
          ${Array.from({length:totalDays},(_,i) => {
            const d   = i+1;
            const iso = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const cls = [
              'cal-picker-day',
              iso === today   ? 'today'    : '',
              iso === selVal  ? 'selected' : '',
            ].filter(Boolean).join(' ');
            return `<button class="${cls}" data-iso="${iso}">${d}</button>`;
          }).join('')}
        </div>
      </div>
    `;

    drop.querySelectorAll('.cal-picker-day:not(.empty)').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const iso = btn.dataset.iso;
        const input = document.getElementById(fieldId);
        if (input) input.value = iso;
        const lbl = document.getElementById(`cpl-${fieldId}`);
        if (lbl) { lbl.textContent = formatDisplayDate(iso); lbl.classList.remove('ph'); }
        input?.dispatchEvent(new Event('change', { bubbles: true }));
        closeActive();
        document.getElementById(`cpd-${fieldId}`)?.classList.remove('open');
      });
    });

    drop.querySelector(`#cp-prev-${fieldId}`)?.addEventListener('click', e => { e.stopPropagation(); mo===0?(yr--,mo=11):mo--; paint(); });
    drop.querySelector(`#cp-next-${fieldId}`)?.addEventListener('click', e => { e.stopPropagation(); mo===11?(yr++,mo=0):mo++; paint(); });
  }

  paint();
  return drop;
}

function formatDisplayDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  const dt = new Date(+y, +m-1, +d);
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ── Time Picker ──────────────────────────────
export function timePickerHTML(fieldId, value = '', placeholder = 'Select time') {
  return `
    <div class="picker-wrap" id="tpw-${fieldId}">
      <div class="picker-display" id="tpd-${fieldId}" data-field="${fieldId}">
        <span id="tpl-${fieldId}" class="${value ? '' : 'ph'}">${value ? formatDisplayTime(value) : placeholder}</span>
        <span class="picker-chevron">▾</span>
      </div>
      <input type="hidden" id="${fieldId}" value="${value}">
    </div>
  `;
}

export function initTimePicker(fieldId) {
  const display = document.getElementById(`tpd-${fieldId}`);
  if (!display) return;
  display.addEventListener('click', e => {
    e.stopPropagation();
    if (_activeDropdown && _activeDropdown.dataset.for === fieldId) { closeActive(); return; }
    closeActive();
    const input = document.getElementById(fieldId);
    const val   = input?.value || '';
    const wrap  = document.getElementById(`tpw-${fieldId}`);
    const drop  = buildTimeDrop(fieldId, val);
    wrap.appendChild(drop);
    _activeDropdown = drop;
    display.classList.add('open');
    // Scroll to selected
    setTimeout(() => {
      drop.querySelectorAll('.selected').forEach(el => el.scrollIntoView({ block:'center' }));
    }, 30);
  });
}

function buildTimeDrop(fieldId, currentVal) {
  const [curH, curM, curA] = parseTime(currentVal);
  const hours   = Array.from({length:12}, (_,i) => String(i+1));
  const minutes = ['00','15','30','45'];
  const ampm    = ['AM','PM'];

  const drop = document.createElement('div');
  drop.className = 'picker-dropdown';
  drop.dataset.for = fieldId;

  drop.innerHTML = `
    <div class="time-picker">
      <div class="time-col">
        <div class="time-col-hdr">Hr</div>
        ${hours.map(h => `<div class="time-item${h===curH?' selected':''}" data-h="${h}">${h}</div>`).join('')}
      </div>
      <div class="time-col">
        <div class="time-col-hdr">Min</div>
        ${minutes.map(m => `<div class="time-item${m===curM?' selected':''}" data-m="${m}">${m}</div>`).join('')}
      </div>
      <div class="time-col">
        <div class="time-col-hdr">AM/PM</div>
        ${ampm.map(a => `<div class="time-item${a===curA?' selected':''}" data-a="${a}">${a}</div>`).join('')}
      </div>
    </div>
  `;

  let selH = curH||'12', selM = curM||'00', selA = curA||'AM';

  function commit() {
    const h24 = to24(selH, selA);
    const iso  = `${String(h24).padStart(2,'0')}:${selM}`;
    const input = document.getElementById(fieldId);
    if (input) input.value = iso;
    const lbl = document.getElementById(`tpl-${fieldId}`);
    if (lbl) { lbl.textContent = formatDisplayTime(iso); lbl.classList.remove('ph'); }
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  }

  drop.querySelectorAll('[data-h]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); selH = el.dataset.h; drop.querySelectorAll('[data-h]').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); commit(); });
  });
  drop.querySelectorAll('[data-m]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); selM = el.dataset.m; drop.querySelectorAll('[data-m]').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); commit(); });
  });
  drop.querySelectorAll('[data-a]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); selA = el.dataset.a; drop.querySelectorAll('[data-a]').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); commit(); });
  });

  return drop;
}

function parseTime(val) {
  if (!val) return ['12','00','AM'];
  const [h,m] = val.split(':').map(Number);
  const ampm  = h >= 12 ? 'PM' : 'AM';
  const h12   = String(h % 12 || 12);
  return [h12, String(m).padStart(2,'0'), ampm];
}

function to24(h12, ampm) {
  let h = +h12;
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h;
}

function formatDisplayTime(iso) {
  if (!iso) return '';
  const [h,m] = iso.split(':').map(Number);
  const ampm  = h >= 12 ? 'PM' : 'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;
}
