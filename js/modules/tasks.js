// modules/tasks.js

import { registerModule, setHeader, slidePanel, modal, toast, bus, fieldGroup, btnHTML } from '../core.js';
import { dataService } from '../dataService.js';
import { formatDate, uid, todayISO } from '../utils.js';

const DEFAULT_COLS = ['Music','Visual','Merch','Friends','To Do'];
const COLORS = [
  { v:'#E8B84B', l:'Amber'  },
  { v:'#60A5FA', l:'Blue'   },
  { v:'#A78BFA', l:'Purple' },
  { v:'#34D399', l:'Green'  },
  { v:'#F87171', l:'Red'    },
  { v:'#FB923C', l:'Orange' },
  { v:'#787878', l:'Grey'   },
];
const COL_DOTS = { 'Music':'#A78BFA','Visual':'#60A5FA','Merch':'#FB923C','Friends':'#34D399','To Do':'#E8B84B' };
const PRIORITY = {
  low:    { label:'Low',    color:'#22C55E', glow:'rgba(34,197,94,0.6)'   },
  medium: { label:'Medium', color:'#E8B84B', glow:'rgba(232,184,75,0.6)'  },
  high:   { label:'High',   color:'#F87171', glow:'rgba(248,113,113,0.7)' },
};

let _dragging = null;

function getColumns() {
  const tasks = dataService.getAll('tasks');
  const cols  = dataService.getAll('columns');
  const names = cols.length ? cols.map(c=>c.name) : DEFAULT_COLS;
  const extra = [...new Set(tasks.map(t=>t.column).filter(c=>!names.includes(c)))];
  return [...names, ...extra];
}

function render() {
  setHeader('Tasks', [
    { id:'add-col',  label:'Add Column', v:'ghost',   icon:'+', onClick: openAddColumn },
    { id:'add-task', label:'Add Task',   v:'primary', icon:'+', onClick: () => openAddCard(null) },
  ]);

  const tasks = dataService.getAll('tasks');
  const cols  = getColumns();

  document.getElementById('module-content').innerHTML = `
    <div class="kanban-board pb-4">
      ${cols.map(col => {
        const cards = tasks.filter(t => t.column === col);
        const dot   = COL_DOTS[col] || '#E8B84B';
        return `
          <div class="kanban-col" data-col="${col}">
            <div class="flex items-center justify-between pb-3 border-b border-bdr">
              <div class="flex items-center gap-2 font-bold text-sm">
                <div class="w-2 h-2 rounded-full" style="background:${dot}"></div>
                ${col}
                <span class="text-xs px-2 py-0.5 rounded-full" style="background:var(--bdr);color:var(--txts)">${cards.length}</span>
              </div>
              <div class="flex gap-1">
                <button class="btn btn-ghost btn-icon btn-sm add-card-btn" data-col="${col}" title="Add card">+</button>
                <button class="btn btn-ghost btn-icon btn-sm del-col-btn" data-col="${col}" title="Delete column">×</button>
              </div>
            </div>

            <div class="drop-zone flex flex-col gap-2 min-h-12 mt-2" data-col="${col}">
              ${cards.length===0?`<div class="border border-dashed border-bdr rounded-lg p-4 text-center text-xs" style="color:var(--txts)">Drop here</div>`:''}
              ${cards.map(card => {
                const isOverdue = card.due && card.due < todayISO();
                const pri = PRIORITY[card.priority||'medium'];
                return `
                  <div class="kanban-card task-card-click" draggable="true" data-id="${card.id}" data-col="${col}">
                    <div class="flex items-center gap-2 mb-2">
                      <!-- Priority light -->
                      <div class="priority-light" style="background:${pri.color};color:${pri.color};box-shadow:0 0 6px ${pri.glow}" title="${pri.label}"></div>
                      <div class="w-full h-0.5 rounded flex-1" style="background:${card.color}"></div>
                    </div>
                    <div class="flex justify-between items-start gap-2">
                      <span class="font-semibold text-sm flex-1">${card.title}</span>
                      <button class="del-card-btn text-xs hover:opacity-100 opacity-40 transition-opacity" data-id="${card.id}" style="background:none;border:none;color:var(--txts);cursor:pointer;flex-shrink:0">×</button>
                    </div>
                    ${card.desc?`<div class="text-xs mt-1.5" style="color:var(--txts);line-height:1.5">${card.desc}</div>`:''}
                    ${card.due?`<div class="text-xs mt-2" style="color:${isOverdue?'var(--red)':'var(--txts)'}">${formatDate(card.due)}${isOverdue?' (overdue)':''}</div>`:''}
                  </div>`;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('.add-card-btn').forEach(btn => btn.addEventListener('click', () => openAddCard(btn.dataset.col)));
  document.querySelectorAll('.del-col-btn').forEach(btn => btn.addEventListener('click', () => deleteColumn(btn.dataset.col)));
  document.querySelectorAll('.del-card-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteCard(btn.dataset.id); });
  });
  document.querySelectorAll('.task-card-click').forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('.del-card-btn')) openCardDetail(card.dataset.id); });
  });

  // Drag-and-drop
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      _dragging = { id: card.dataset.id, col: card.dataset.col };
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); _dragging = null; });
  });
  document.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.closest('.kanban-col').classList.add('drag-over'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.closest('.kanban-col').classList.remove('drag-over'); });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.closest('.kanban-col').classList.remove('drag-over');
      if (!_dragging || _dragging.col === zone.dataset.col) return;
      const task = dataService.getById('tasks', _dragging.id);
      if (!task) return;
      dataService.save('tasks', { ...task, column: zone.dataset.col });
      bus.emit('task.updated', { id: _dragging.id, from: _dragging.col, to: zone.dataset.col });
      render();
    });
  });
}

// ── Card Detail (slide panel) ────────────────
function openCardDetail(id) {
  const card = dataService.getById('tasks', id);
  if (!card) return;
  const cols = getColumns();
  const isOverdue = card.due && card.due < todayISO();

  const body = `
    <!-- Priority -->
    <div class="card card-sm mb-1">
      <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Priority</div>
      <div class="flex gap-3">
        ${Object.entries(PRIORITY).map(([k,p])=>`
          <button class="pri-btn flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-sans text-sm font-semibold cursor-pointer transition-all" data-pri="${k}"
            style="border-color:${(card.priority||'medium')===k?p.color:'var(--bdr)'};background:${(card.priority||'medium')===k?p.color+'18':'var(--card)'};color:${(card.priority||'medium')===k?p.color:'var(--txts)'}">
            <div class="priority-light" style="background:${p.color};color:${p.color};box-shadow:0 0 6px ${p.glow}"></div>
            ${p.label}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Title & desc -->
    <div class="card card-sm">
      ${fieldGroup('Title', `<input id="cd-title" class="field-input" value="${card.title}">`)}
      ${fieldGroup('Description', `<textarea id="cd-desc" class="field-input" rows="3" placeholder="Notes, context…">${card.desc||''}</textarea>`)}
    </div>

    <!-- Column + Due + Color -->
    <div class="card card-sm">
      ${fieldGroup('Column', `<select id="cd-col" class="field-input">${cols.map(c=>`<option value="${c}"${c===card.column?' selected':''}>${c}</option>`).join('')}</select>`)}
      ${fieldGroup('Due Date', `<input id="cd-due" class="field-input" type="date" value="${card.due||''}">`)}
      <div class="field-group">
        <label class="field-label">Color Tag</label>
        <div class="flex gap-2 flex-wrap mt-1">
          ${COLORS.map(c=>`<div class="color-dot${card.color===c.v?' selected':''}" data-color="${c.v}" style="background:${c.v}" title="${c.l}"></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <button class="btn btn-primary flex-1" id="cd-save">Save</button>
      <button class="btn btn-danger btn-sm" id="cd-delete">Delete</button>
    </div>
  `;

  slidePanel.open(card.title, body, '');

  let selPri = card.priority || 'medium';
  let selColor = card.color;

  // Priority buttons
  document.querySelectorAll('.pri-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selPri = btn.dataset.pri;
      document.querySelectorAll('.pri-btn').forEach(b=>{
        const p = PRIORITY[b.dataset.pri];
        const active = b.dataset.pri === selPri;
        b.style.borderColor = active ? p.color : 'var(--bdr)';
        b.style.background  = active ? p.color+'18' : 'var(--card)';
        b.style.color       = active ? p.color : 'var(--txts)';
      });
    });
  });

  // Color dots
  document.querySelectorAll('.color-dot').forEach(dot=>{
    dot.addEventListener('click', ()=>{
      selColor = dot.dataset.color;
      document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });

  document.getElementById('cd-save')?.addEventListener('click', ()=>{
    const title = document.getElementById('cd-title')?.value?.trim();
    if (!title) { toast('Title is required','error'); return; }
    dataService.save('tasks', {
      ...card,
      title,
      desc:     document.getElementById('cd-desc')?.value  || '',
      due:      document.getElementById('cd-due')?.value   || '',
      column:   document.getElementById('cd-col')?.value   || card.column,
      color:    selColor || card.color,
      priority: selPri,
    });
    bus.emit('task.updated', { id: card.id });
    slidePanel.close();
    toast('Task saved');
    render();
  });

  document.getElementById('cd-delete')?.addEventListener('click', ()=>{
    dataService.remove('tasks', id);
    slidePanel.close();
    toast('Task deleted','warning');
    render();
  });
}

// ── Add Card Modal ───────────────────────────
function openAddCard(col) {
  let selColor = '#E8B84B';
  const cols = getColumns();

  modal.open('Add Task', `
    ${fieldGroup('Title *', `<input id="m-title" class="field-input" placeholder="Card title…">`)}
    ${fieldGroup('Description', `<textarea id="m-desc" class="field-input" rows="2" placeholder="Optional notes…"></textarea>`)}
    ${!col ? fieldGroup('Column', `<select id="m-col" class="field-input">${cols.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>`) : `<input type="hidden" id="m-col" value="${col}">`}
    ${fieldGroup('Due Date', `<input id="m-due" class="field-input" type="date">`)}
    <div class="field-group mb-3">
      <label class="field-label">Priority</label>
      <div class="flex gap-2 mt-1">
        ${Object.entries(PRIORITY).map(([k,p])=>`
          <button class="mpri-btn flex items-center gap-2 px-3 py-2 rounded-lg border font-sans text-xs font-semibold cursor-pointer transition-all" data-pri="${k}"
            style="border-color:${k==='medium'?p.color:'var(--bdr)'};background:${k==='medium'?p.color+'18':'transparent'};color:${k==='medium'?p.color:'var(--txts)'}">
            <div class="priority-light" style="width:6px;height:6px;background:${p.color};box-shadow:0 0 5px ${p.glow}"></div>
            ${p.label}
          </button>
        `).join('')}
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Color Tag</label>
      <div class="flex gap-2 flex-wrap mt-1">
        ${COLORS.map(c=>`<div class="color-dot${c.v==='#E8B84B'?' selected':''}" data-color="${c.v}" style="background:${c.v}" title="${c.l}"></div>`).join('')}
      </div>
    </div>
  `, `${btnHTML('Cancel','btn-ghost','m-cancel')} ${btnHTML('Add Task','btn-primary','m-save')}`);

  let selPri = 'medium';
  document.querySelectorAll('.mpri-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selPri = btn.dataset.pri;
      document.querySelectorAll('.mpri-btn').forEach(b=>{
        const p=PRIORITY[b.dataset.pri]; const active=b.dataset.pri===selPri;
        b.style.borderColor=active?p.color:'var(--bdr)';b.style.background=active?p.color+'18':'transparent';b.style.color=active?p.color:'var(--txts)';
      });
    });
  });

  document.getElementById('m-cancel')?.addEventListener('click', () => modal.close());
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => { selColor=dot.dataset.color; document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected')); dot.classList.add('selected'); });
  });
  document.getElementById('m-save')?.addEventListener('click', () => {
    const title = document.getElementById('m-title')?.value?.trim();
    if (!title) { toast('Title is required','error'); return; }
    const card = { id:uid(), title, desc:document.getElementById('m-desc')?.value||'', due:document.getElementById('m-due')?.value||'', column:document.getElementById('m-col')?.value||'To Do', color:selColor, priority:selPri, created_at:todayISO() };
    dataService.save('tasks', card);
    bus.emit('task.updated', card);
    modal.close(); toast('Task added'); render();
  });
}

function openAddColumn() {
  modal.open('Add Column', `
    ${fieldGroup('Column Name *', `<input id="m-colname" class="field-input" placeholder="e.g. In Progress">`)}
  `, `${btnHTML('Cancel','btn-ghost','m-cancel')} ${btnHTML('Add Column','btn-primary','m-save')}`);
  document.getElementById('m-cancel')?.addEventListener('click', () => modal.close());
  document.getElementById('m-save')?.addEventListener('click', () => {
    const name = document.getElementById('m-colname')?.value?.trim();
    if (!name) { toast('Name is required','error'); return; }
    const cols = dataService.getAll('columns');
    if (cols.find(c=>c.name===name)) { toast('Already exists','error'); return; }
    dataService.save('columns', { id:uid(), name });
    modal.close(); toast('Column added'); render();
  });
}

function deleteColumn(col) {
  const tasks = dataService.query('tasks', t => t.column === col);
  if (!window.confirm(`Delete "${col}"${tasks.length ? ` and ${tasks.length} card(s)` : ''}?`)) return;
  tasks.forEach(t => dataService.remove('tasks', t.id));
  const cols = dataService.getAll('columns');
  const c = cols.find(c=>c.name===col);
  if (c) dataService.remove('columns', c.id);
  toast(`"${col}" deleted`,'warning'); render();
}

function deleteCard(id) {
  dataService.remove('tasks', id);
  toast('Card deleted','warning'); render();
}

registerModule('tasks', { render });
