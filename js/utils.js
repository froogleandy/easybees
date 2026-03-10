// utils.js — Shared utilities

export function formatDate(dateStr, style = 'short') {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '—';
  const opts = {
    short:    { month: 'short', day: 'numeric', year: 'numeric' },
    long:     { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    monthDay: { month: 'short', day: 'numeric' },
    numeric:  { month: '2-digit', day: '2-digit', year: 'numeric' },
  };
  return d.toLocaleDateString('en-US', opts[style] || opts.short);
}

export function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatCurrency(n, short = false) {
  if (n == null) return '$0';
  if (short && n >= 1000) return `$${(n/1000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:2 }).format(n);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

export function initials(name = '') {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

export function stringToColor(str = '') {
  const palette = ['#E8B84B','#60A5FA','#A78BFA','#34D399','#F87171','#FB923C','#38BDF8','#E879F9'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

export function truncate(str, max = 40) {
  return str && str.length > max ? str.slice(0, max) + '…' : (str || '');
}

export function generateInvoiceNumber(invoices = []) {
  const max = invoices.reduce((n, inv) => {
    const num = parseInt((inv.num || '').replace(/\D/g,''), 10);
    return isNaN(num) ? n : Math.max(n, num);
  }, 0);
  return `INV-${String(max + 1).padStart(3,'0')}`;
}

export function downloadCSV(data, filename, cols) {
  if (!data.length) return;
  const keys = cols || Object.keys(data[0]);
  const header = keys.join(',');
  const rows = data.map(r => keys.map(k => {
    const v = r[k] ?? '';
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
  }).join(','));
  const blob = new Blob([[header,...rows].join('\n')], { type:'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

export function downloadJSON(data, filename = 'easy-bees-backup.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export async function scanReceiptWithAI(base64, mime = 'image/jpeg') {
  const { scanReceipt } = await import('./services/aiService.js');
  return scanReceipt(base64, mime);
}

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export const GIG_STATUS = {
  inquiry:   { label:'Inquiry',   color:'#888',    bg:'rgba(136,136,136,0.1)' },
  booked:    { label:'Booked',    color:'#22C55E', bg:'rgba(34,197,94,0.1)'   },
  done:      { label:'Done',      color:'#60A5FA', bg:'rgba(96,165,250,0.1)'  },
  paid:      { label:'Paid',      color:'#34D399', bg:'rgba(52,211,153,0.1)'  },
  cancelled: { label:'Cancelled', color:'#F87171', bg:'rgba(248,113,113,0.1)' },
};

export const INVOICE_STATUS = {
  draft: { label:'Draft', color:'#787878', bg:'rgba(255,255,255,0.05)' },
  sent:  { label:'Sent',  color:'#60A5FA', bg:'rgba(96,165,250,0.1)'   },
  paid:  { label:'Paid',  color:'#22C55E', bg:'rgba(34,197,94,0.1)'    },
};

// Build a tag HTML string
export function tagHTML(status, map = GIG_STATUS) {
  const s = map[status] || map.inquiry || map.draft || { label: status, color:'#888', bg:'rgba(136,136,136,0.1)' };
  return `<span class="tag" style="color:${s.color};background:${s.bg}">${s.label}</span>`;
}

// Avatar element HTML
export function avatarHTML(name, size = 32) {
  const color = stringToColor(name);
  const text  = initials(name);
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${size*0.36}px;background:${color}">${text}</div>`;
}
