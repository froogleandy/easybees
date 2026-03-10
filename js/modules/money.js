// modules/money.js — Invoices + Expenses combined

import { registerModule, setHeader, modal, toast, bus, fieldGroup, btnHTML, updateTokenTracker } from '../core.js';
import { dataService } from '../dataService.js';
import { formatDate, formatCurrency, generateInvoiceNumber, INVOICE_STATUS, tagHTML, uid, todayISO, scanReceiptWithAI, fileToBase64 } from '../utils.js';
import { validateInvoice, validateExpense } from '../validators.js';

let _tab     = 'invoices';
let _invFilter = 'all';
let _expFilter = 'all';

function render() {
  setHeader('Money', [
    { id:'new',    label: _tab==='invoices'?'New Invoice':'Add Expense', v:'primary', icon:'+', onClick: _tab==='invoices' ? openNewInvoice : openAddExpense },
    { id:'export', label:'Export CSV', v:'ghost', icon:'↓', onClick: doExport },
    { id:'backup', label:'Backup',     v:'ghost', icon:'', onClick: () => { dataService.exportBackup(); toast('Backup downloaded'); } },
  ]);

  document.getElementById('module-content').innerHTML = `
    <!-- Tabs -->
    <div class="flex border-b border-bdr mb-6" style="margin:-28px -30px 24px;padding:0 30px">
      <button class="money-tab${_tab==='invoices'?' active':''}" id="tab-invoices">Invoices</button>
      <button class="money-tab${_tab==='expenses'?' active':''}" id="tab-expenses">Expenses</button>
    </div>
    <div id="money-body"></div>
  `;

  document.getElementById('tab-invoices')?.addEventListener('click', () => { _tab='invoices'; render(); });
  document.getElementById('tab-expenses')?.addEventListener('click', () => { _tab='expenses'; render(); });

  _tab === 'invoices' ? renderInvoices() : renderExpenses();
}

// ─── INVOICES ──────────────────────────────────────────────
function renderInvoices() {
  const invoices = dataService.getAll('invoices');
  const contacts = dataService.getAll('contacts');
  const invTotal = inv => inv.items.reduce((s,i)=>s+i.qty*i.rate, 0);
  const filtered = invoices.filter(i => _invFilter==='all'||i.status===_invFilter).sort((a,b)=>b.date.localeCompare(a.date));

  const totalBilled = invoices.reduce((s,i)=>s+invTotal(i),0);
  const outstanding = invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+invTotal(i),0);
  const paid        = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+invTotal(i),0);

  document.getElementById('money-body').innerHTML = `
    <!-- Summary -->
    <div class="grid grid-cols-3 gap-3 mb-5">
      ${[['Total Billed',formatCurrency(totalBilled),'var(--txt)'],['Outstanding',formatCurrency(outstanding),'var(--org)'],['Paid',formatCurrency(paid),'var(--grn)']].map(([l,v,c])=>`
        <div class="card" style="padding:14px 18px">
          <div class="text-xs uppercase tracking-widest font-bold mb-2" style="color:var(--txts)">${l}</div>
          <div class="text-2xl font-black" style="color:${c}">${v}</div>
        </div>
      `).join('')}
    </div>

    <!-- Filter -->
    <div class="filter-tabs mb-4">
      ${['all','draft','sent','paid'].map(s=>`<button class="filter-tab${_invFilter===s?' active':''}" data-f="${s}">${s==='all'?'All':INVOICE_STATUS[s]?.label||s}</button>`).join('')}
    </div>

    <!-- List -->
    ${filtered.length===0?`<div class="empty-state"><div class="empty-state-icon" style="font-size:24px;color:var(--txts)">—</div><div class="empty-state-title">No invoices</div><div class="empty-state-sub">Create your first invoice.</div></div>`:`
      <div class="flex flex-col gap-3">
        ${filtered.map(inv=>{
          const cl  = contacts.find(c=>c.id===inv.clientId);
          const tot = invTotal(inv);
          return `<div class="card flex justify-between items-center gap-4" style="padding:14px 18px;cursor:pointer" data-inv-id="${inv.id}">
            <div class="flex-1">
              <div class="text-xs font-bold mb-1" style="color:var(--acc)">${inv.num}</div>
              <div class="font-bold text-sm">${cl?.name||'Unknown Client'}</div>
              <div class="text-xs mt-0.5" style="color:var(--txts)">Issued ${formatDate(inv.date)} · Due ${formatDate(inv.dueDate)||'—'}</div>
            </div>
            <div class="flex items-center gap-3 no-nav">
              ${tagHTML(inv.status, INVOICE_STATUS)}
              <span class="font-black text-lg" style="color:var(--acc)">${formatCurrency(tot)}</span>
              ${inv.status!=='paid'?`<button class="btn btn-green btn-sm mark-paid" data-id="${inv.id}">✓ Mark Paid</button>`:''}
              <button class="btn btn-ghost btn-icon btn-sm del-inv" data-id="${inv.id}" title="Delete">×</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `}
  `;

  document.querySelectorAll('.filter-tab[data-f]').forEach(btn=>btn.addEventListener('click',()=>{_invFilter=btn.dataset.f;renderInvoices();}));
  document.querySelectorAll('[data-inv-id]').forEach(el=>el.addEventListener('click',e=>{if(!e.target.closest('.no-nav'))openViewInvoice(el.dataset.invId);}));
  document.querySelectorAll('.mark-paid').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();markPaid(btn.dataset.id);}));
  document.querySelectorAll('.del-inv').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();deleteInvoice(btn.dataset.id);}));
}

function openNewInvoice() {
  const contacts = dataService.getAll('contacts');
  const invoices = dataService.getAll('invoices');
  let items = [{ desc:'', qty:1, rate:0 }];
  let clientId='', status='draft', dueDate='', notes='';

  function renderBody() {
    const total = items.reduce((s,i)=>s+i.qty*i.rate,0);
    modal.body().innerHTML = `
      ${fieldGroup('Client *', `<select id="m-client" class="field-input"><option value="">Select client…</option>${contacts.map(c=>`<option value="${c.id}"${c.id===clientId?' selected':''}>${c.name}</option>`).join('')}</select>`)}
      <div class="field-row-2">
        ${fieldGroup('Due Date', `<input id="m-due" class="field-input" type="date" value="${dueDate}">`)}
        ${fieldGroup('Status', `<select id="m-status" class="field-input"><option value="draft"${status==='draft'?' selected':''}>Draft</option><option value="sent"${status==='sent'?' selected':''}>Sent</option><option value="paid"${status==='paid'?' selected':''}>Paid</option></select>`)}
      </div>
      <div>
        <div class="flex justify-between items-center mb-2"><label class="field-label">Line Items</label><button class="btn btn-ghost btn-sm" id="add-row">+ Add Row</button></div>
        <div id="line-items" class="flex flex-col gap-2">
          ${items.map((it,i)=>`<div class="line-item-row">
            <input class="field-input li-desc" data-i="${i}" value="${it.desc}" placeholder="Description" style="font-size:13px">
            <input type="number" class="field-input li-qty" data-i="${i}" value="${it.qty}" min="1" style="font-size:13px;text-align:center">
            <input type="number" class="field-input li-rate" data-i="${i}" value="${it.rate}" placeholder="Rate" style="font-size:13px">
            <span class="font-bold text-sm text-right" style="color:var(--acc)">${formatCurrency(it.qty*it.rate)}</span>
            ${items.length>1?`<button class="del-row text-gray-600 hover:text-red-400" data-i="${i}" style="background:none;border:none;cursor:pointer;font-size:18px">×</button>`:'<div></div>'}
          </div>`).join('')}
        </div>
        <div class="text-right mt-3 font-black text-xl" style="color:var(--acc)">Total: ${formatCurrency(total)}</div>
      </div>
      ${fieldGroup('Notes', `<input id="m-notes" class="field-input" value="${notes}" placeholder="Payment terms, notes…">`)}
    `;

    document.getElementById('m-client')?.addEventListener('change',e=>clientId=e.target.value);
    document.getElementById('m-due')?.addEventListener('change',e=>dueDate=e.target.value);
    document.getElementById('m-status')?.addEventListener('change',e=>status=e.target.value);
    document.getElementById('m-notes')?.addEventListener('change',e=>notes=e.target.value);
    document.getElementById('add-row')?.addEventListener('click',()=>{collectItems();items.push({desc:'',qty:1,rate:0});renderBody();});
    document.querySelectorAll('.del-row').forEach(btn=>btn.addEventListener('click',()=>{collectItems();items.splice(+btn.dataset.i,1);renderBody();}));
    document.querySelectorAll('.li-desc,.li-qty,.li-rate').forEach(el=>el.addEventListener('blur',collectItems));
  }

  function collectItems() {
    document.querySelectorAll('.li-desc').forEach((el,i)=>{ items[i]={ desc:el.value, qty:+document.querySelectorAll('.li-qty')[i]?.value||1, rate:+document.querySelectorAll('.li-rate')[i]?.value||0 }; });
  }

  modal.open('New Invoice', '', `${btnHTML('Cancel','btn-ghost','m-cancel')} ${btnHTML('Create Invoice','btn-primary','m-save')}`, 'modal-lg');
  renderBody();

  document.getElementById('m-cancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('m-save')?.addEventListener('click',()=>{
    collectItems();
    clientId = document.getElementById('m-client')?.value||clientId;
    dueDate  = document.getElementById('m-due')?.value||dueDate;
    status   = document.getElementById('m-status')?.value||status;
    notes    = document.getElementById('m-notes')?.value||notes;

    const v = validateInvoice({ clientId, items });
    if (!v.valid) { toast(v.message,'error'); return; }
    const inv = { id:uid(), num:generateInvoiceNumber(dataService.getAll('invoices')), clientId, items, status, date:todayISO(), dueDate, notes };
    dataService.save('invoices',inv);
    dataService.addTimeline({ contactId:clientId, type:'invoice', label:`Invoice created — ${inv.num}` });
    bus.emit('invoice.created',inv);
    modal.close(); toast('Invoice created ✓'); renderInvoices();
  });
}

function openViewInvoice(id) {
  const inv  = dataService.getById('invoices',id);
  if (!inv) return;
  const contacts = dataService.getAll('contacts');
  const cl   = contacts.find(c=>c.id===inv.clientId);
  const tot  = inv.items.reduce((s,i)=>s+i.qty*i.rate,0);
  modal.open(inv.num, `
    <div class="p-4 rounded-xl border border-bdr" style="background:var(--bg)">
      <div class="flex justify-between mb-6">
        <div><div class="font-black text-xl" style="color:var(--acc)">Easy Bees </div><div class="text-xs mt-1" style="color:var(--txts)">Music Business Manager</div></div>
        <div class="text-right"><div class="font-bold text-lg">${inv.num}</div><div class="text-xs mt-1" style="color:var(--txts)">Issued ${formatDate(inv.date)}</div>${inv.dueDate?`<div class="text-xs" style="color:var(--txts)">Due ${formatDate(inv.dueDate)}</div>`:''}</div>
      </div>
      ${cl?`<div class="mb-5"><div class="text-xs uppercase tracking-widest font-bold mb-1" style="color:var(--txts)">Bill To</div><div class="font-semibold">${cl.name}</div>${cl.email?`<div class="text-sm" style="color:var(--txts)">${cl.email}</div>`:''}</div>`:''}
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
        <thead><tr style="border-bottom:1px solid var(--bdr)">${['Description','Qty','Rate','Amount'].map(h=>`<th style="padding:7px 0;text-align:${h==='Description'?'left':'right'};font-size:10px;color:var(--txts);text-transform:uppercase;letter-spacing:0.07em">${h}</th>`).join('')}</tr></thead>
        <tbody>${inv.items.map(li=>`<tr style="border-bottom:1px solid var(--bdr)">${[li.desc,li.qty,formatCurrency(li.rate),formatCurrency(li.qty*li.rate)].map((v,i)=>`<td style="padding:9px 0;font-size:13px;text-align:${i===0?'left':'right'};color:${i===3?'var(--txt)':'var(--txts)'};font-weight:${i===3?600:400}">${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <div class="text-right border-t border-bdr pt-3"><div class="text-2xl font-black" style="color:var(--acc)">Total: ${formatCurrency(tot)}</div></div>
      ${inv.notes?`<div class="mt-4 text-xs border-t border-bdr pt-3" style="color:var(--txts)">${inv.notes}</div>`:''}
    </div>
  `, `${btnHTML('Close','btn-ghost','m-cancel')} ${inv.status!=='paid'?btnHTML('Mark Paid ✓','btn-green','m-paid'):''}`, 'modal-lg');
  document.getElementById('m-cancel')?.addEventListener('click',()=>modal.close());
  document.getElementById('m-paid')?.addEventListener('click',()=>{markPaid(id);modal.close();});
}

function markPaid(id) {
  const inv = dataService.getById('invoices',id);
  if (!inv) return;
  dataService.save('invoices',{...inv,status:'paid'});
  const amt = inv.items.reduce((s,i)=>s+i.qty*i.rate,0);
  const cl  = dataService.getById('contacts',inv.clientId);
  if (cl) dataService.save('contacts',{...cl, total_revenue:(cl.total_revenue||0)+amt});
  dataService.addTimeline({ contactId:inv.clientId, type:'invoice_paid', label:`Invoice paid — ${inv.num}` });
  bus.emit('invoice.paid',inv);
  toast('Invoice marked paid ✓');
  renderInvoices();
}

function deleteInvoice(id) {
  const inv = dataService.getById('invoices',id);
  if (!window.confirm(`Delete ${inv?.num||'invoice'}?`)) return;
  dataService.remove('invoices',id);
  toast('Invoice deleted','warning');
  renderInvoices();
}

// ─── EXPENSES ──────────────────────────────────────────────
const EXP_CATS = ['Food','Travel','Gear','Bills','Other'];

function renderExpenses() {
  const expenses = dataService.getAll('expenses');
  const filtered = expenses.filter(e=>_expFilter==='all'||e.category===_expFilter).sort((a,b)=>b.date.localeCompare(a.date));
  const now   = todayISO().slice(0,7);
  const month = expenses.filter(e=>e.date?.startsWith(now)).reduce((s,e)=>s+e.amount,0);
  const total = expenses.reduce((s,e)=>s+e.amount,0);
  const cats  = [...new Set(expenses.map(e=>e.category))];

  document.getElementById('money-body').innerHTML = `
    <!-- Summary -->
    <div class="grid grid-cols-3 gap-3 mb-5">
      ${[['This Month',formatCurrency(month),'var(--red)'],['Total Logged',formatCurrency(total),'var(--org)'],['Receipts',expenses.filter(e=>e.receipt).length,'var(--acc)']].map(([l,v,c])=>`
        <div class="card" style="padding:14px 18px">
          <div class="text-xs uppercase tracking-widest font-bold mb-2" style="color:var(--txts)">${l}</div>
          <div class="text-2xl font-black" style="color:${c}">${v}</div>
        </div>
      `).join('')}
    </div>

    <!-- Category filter - sleek pill row -->
    <div class="exp-filter-row mb-5">
      ${['All','Food','Travel','Gear','Bills'].map(cat => {
        const val = cat === 'All' ? 'all' : cat;
        const active = _expFilter === val;
        return `<button class="exp-filter-btn${active?' active':''}" data-f="${val}">${cat}</button>`;
      }).join('')}
    </div>

    <!-- List -->
    ${filtered.length===0?`<div class="empty-state"><div class="empty-state-icon" style="font-size:24px;color:var(--txts)">—</div><div class="empty-state-title">No expenses yet</div><div class="empty-state-sub">Add your first expense — AI will scan your receipt.</div></div>`:`
      <div class="flex flex-col gap-3">
        ${filtered.map(ex=>`
          <div class="card flex justify-between items-center gap-4" style="padding:14px 18px">
            <div class="flex gap-4 items-center flex-1">
              <div style="width:46px;height:46px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center">
                ${ex.receipt?`<img src="data:image/jpeg;base64,${ex.receipt}" style="width:100%;height:100%;object-fit:cover">`:'<span style="font-size:20px;color:var(--txts)">+</span>'}
              </div>
              <div>
                <div class="font-bold text-sm">${ex.vendor}</div>
                <div class="text-xs mt-0.5" style="color:var(--txts)">${formatDate(ex.date)} · <span style="color:var(--acc);font-weight:600">${ex.category}</span></div>
                ${ex.notes?`<div class="text-xs mt-0.5" style="color:var(--txtm)">${ex.notes}</div>`:''}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-black text-lg" style="color:var(--red)">−${formatCurrency(ex.amount)}</span>
              <button class="btn btn-ghost btn-icon btn-sm del-exp" data-id="${ex.id}" title="Delete">×</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;

  document.querySelectorAll('.exp-filter-btn[data-f]').forEach(btn=>btn.addEventListener('click',()=>{_expFilter=btn.dataset.f;renderExpenses();}));
  document.querySelectorAll('.del-exp').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();deleteExpense(btn.dataset.id);}));
}

function openAddExpense() {
  let _file=null, _b64=null, _mime='image/jpeg';
  let form = { amount:'', date:todayISO(), vendor:'', category:'Equipment', notes:'' };

  modal.open('Add Expense', buildExpenseBody(form, null, false), `${btnHTML('Cancel','btn-ghost','m-cancel')} ${btnHTML('Save Expense','btn-primary','m-save')}`);
  bindExpenseEvents();

  function buildExpenseBody(f, preview, scanning) {
    return `
      <!-- Drop Zone -->
      <div id="receipt-zone" class="receipt-zone${preview?' has-file':''}">
        <input type="file" id="receipt-file" accept="image/*" style="display:none">
        ${scanning?`<div class="loading"><div class="spinner"></div>  AI scanning receipt…</div>`:
          preview?`<img src="data:${_mime};base64,${preview}" style="max-width:100%;max-height:150px;border-radius:8px;object-fit:cover"><div class="text-xs mt-2 font-semibold" style="color:var(--grn)">✓ AI extracted data — edit if needed</div>`:
          `<div class="text-2xl mb-3" style="color:var(--txts)">+</div><div class="font-semibold text-sm" style="color:var(--txts)">Drop receipt or tap to upload</div><div class="text-xs mt-1" style="color:var(--txtm)">Claude AI auto-detects total, date & vendor</div>`
        }
      </div>
      <div class="field-row-2">
        ${fieldGroup('Amount ($) *', `<input id="m-amount" class="field-input" type="number" value="${f.amount}" placeholder="0.00">`)}
        ${fieldGroup('Date *', `<input id="m-date" class="field-input" type="date" value="${f.date}">`)}
      </div>
      ${fieldGroup('Vendor / Store *', `<input id="m-vendor" class="field-input" value="${f.vendor}" placeholder="Store name">`)}
      ${fieldGroup('Category', `<select id="m-cat" class="field-input">${EXP_CATS.map(c=>`<option value="${c}"${c===f.category?' selected':''}>${c}</option>`).join('')}</select>`)}
      ${fieldGroup('Notes', `<input id="m-notes" class="field-input" value="${f.notes}" placeholder="Optional…">`)}
    `;
  }

  function bindExpenseEvents() {
    document.getElementById('receipt-zone')?.addEventListener('click', () => document.getElementById('receipt-file')?.click());
    document.getElementById('receipt-zone')?.addEventListener('dragover', e => { e.preventDefault(); document.getElementById('receipt-zone').classList.add('drag-over'); });
    document.getElementById('receipt-zone')?.addEventListener('dragleave', () => document.getElementById('receipt-zone')?.classList.remove('drag-over'));
    document.getElementById('receipt-zone')?.addEventListener('drop', e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
    document.getElementById('receipt-file')?.addEventListener('change', e => handleFile(e.target.files[0]));
    document.getElementById('m-cancel')?.addEventListener('click', () => modal.close());
    document.getElementById('m-save')?.addEventListener('click', saveExpense);
  }

  async function handleFile(file) {
    if (!file) return;
    _file=file; _mime=file.type||'image/jpeg';
    _b64 = await fileToBase64(file);
    modal.body().innerHTML = buildExpenseBody(form, _b64, true);
    try {
      const { result, tokens } = await scanReceiptWithAI(_b64, _mime);
      form.amount = result.amount || form.amount;
      form.date   = result.date   || form.date;
      form.vendor = result.vendor || form.vendor;
      updateTokenTracker(tokens);
    } catch(e) {
      toast('AI scan failed — fill in manually','warning');
    }
    modal.body().innerHTML = buildExpenseBody(form, _b64, false);
    bindExpenseEvents();
  }

  function saveExpense() {
    const f = {
      amount:   document.getElementById('m-amount')?.value,
      date:     document.getElementById('m-date')?.value,
      vendor:   document.getElementById('m-vendor')?.value,
      category: document.getElementById('m-cat')?.value,
      notes:    document.getElementById('m-notes')?.value,
    };
    const v = validateExpense(f);
    if (!v.valid) { toast(v.message,'error'); return; }
    const exp = { id:uid(), ...f, amount:+f.amount, receipt:_b64||null, created_at:todayISO() };
    dataService.save('expenses',exp);
    bus.emit('expense.added',exp);
    modal.close(); toast('Expense saved ✓'); renderExpenses();
  }
}

function deleteExpense(id) {
  if (!window.confirm('Delete this expense?')) return;
  dataService.remove('expenses',id);
  toast('Expense deleted','warning');
  renderExpenses();
}

function doExport() {
  if (_tab==='invoices') dataService.exportCSV('invoices','easy-bees-invoices.csv',['num','clientId','date','dueDate','status']);
  else dataService.exportCSV('expenses','easy-bees-expenses.csv',['date','vendor','category','amount','notes']);
  toast('CSV exported ✓');
}

registerModule('money', { render });
