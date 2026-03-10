// dataService.js — Only file that touches localStorage.
// All modules must use these methods. Never call localStorage directly.

import { uid, todayISO, downloadCSV, downloadJSON } from './utils.js';

const PREFIX = 'eb_';

const DEMO = {
  contacts: [
    { id:'c1', name:'Marcus Rivera',  phone:'713-555-0142', email:'marcus@gmail.com',   contact_type:'client',  gig_type:'Music', city:'Houston',     state:'TX', business_name:'', social_media:'@marcusmusic', notes:'Met at Jazz Fest 2025', total_gigs:3, total_revenue:7500, last_gig_date:'2026-02-14', date_met:'2025-10-12', created_at:'2025-10-12' },
    { id:'c2', name:'Sofia Chen',     phone:'281-555-0198', email:'sofia@agency.com',    contact_type:'both',    gig_type:'AV',    city:'Austin',      state:'TX', business_name:'Chen Events', social_media:'', notes:'Corporate event planner', total_gigs:1, total_revenue:750, last_gig_date:'2026-03-01', date_met:'2026-01-15', created_at:'2026-01-15' },
    { id:'c3', name:'DJ Wavelength',  phone:'832-555-0776', email:'wave@djwave.com',     contact_type:'contact', gig_type:'Music', city:'Dallas',      state:'TX', business_name:'Wave Productions', social_media:'@djwavelength', notes:'Referred by Marcus', total_gigs:5, total_revenue:12000, last_gig_date:'2026-02-28', date_met:'2025-11-05', created_at:'2025-11-05' },
    { id:'c4', name:'Priya Nair',     phone:'512-555-0334', email:'priya@corp.com',      contact_type:'client',  gig_type:'Both',  city:'San Antonio', state:'TX', business_name:'Nair Corp', social_media:'', notes:'Annual corporate gigs', total_gigs:2, total_revenue:3200, last_gig_date:'2026-01-20', date_met:'2026-01-05', created_at:'2026-01-05' },
  ],
  gigs: [
    { id:'g1', name:'Jazz Night @ Blue Moon', type:'Music', startDate:'2026-03-15', endDate:'2026-03-15', oneDay:true,  startTime:'20:00', endTime:'23:00', contactId:'c1', rate:2500, status:'booked',   city:'Houston',     state:'TX', created_at:'2026-02-20' },
    { id:'g2', name:'Corporate Gala AV',      type:'AV',    startDate:'2026-03-22', endDate:'2026-03-23', oneDay:false, startTime:'18:00', endTime:'22:00', contactId:'c2', rate:750,  status:'inquiry',  city:'Austin',      state:'TX', created_at:'2026-02-25' },
    { id:'g3', name:'Club Prism DJ Set',      type:'Music', startDate:'2026-04-05', endDate:'2026-04-05', oneDay:true,  startTime:'22:00', endTime:'02:00', contactId:'c3', rate:1800, status:'paid',     city:'Dallas',      state:'TX', created_at:'2026-03-01' },
    { id:'g4', name:'Priya Wedding',          type:'Both',  startDate:'2026-04-12', endDate:'2026-04-12', oneDay:true,  startTime:'17:00', endTime:'22:00', contactId:'c4', rate:3200, status:'booked',   city:'San Antonio', state:'TX', created_at:'2026-03-05' },
  ],
  tasks: [
    { id:'t1', title:'Send Marcus contract',  desc:'DocuSign for Jazz Night',   column:'To Do',       color:'#E8B84B', due:'2026-03-12', created_at:'2026-03-01' },
    { id:'t2', title:'Update promo kit',      desc:'New headshots needed',      column:'To Do',       color:'#60A5FA', due:'', created_at:'2026-03-02' },
    { id:'t3', title:'Flyers for Club Prism', desc:'Canva design',              column:'In Progress', color:'#A78BFA', due:'2026-03-20', created_at:'2026-03-03' },
    { id:'t4', title:'Website refresh copy',  desc:'Bio section rewrite',       column:'Review',      color:'#34D399', due:'', created_at:'2026-03-04' },
    { id:'t5', title:'PA system audit',       desc:'Inventory complete ✓',      column:'Done',        color:'#787878', due:'', created_at:'2026-02-28' },
  ],
  invoices: [
    { id:'inv1', num:'INV-001', clientId:'c1', items:[{ desc:'Live Jazz Performance', qty:1, rate:2500 }], status:'sent',  date:'2026-03-10', dueDate:'2026-03-30', notes:'' },
    { id:'inv2', num:'INV-002', clientId:'c4', items:[{ desc:'Wedding Reception Music & AV', qty:1, rate:3200 }], status:'draft', date:'2026-03-08', dueDate:'2026-04-20', notes:'50% deposit due before event.' },
  ],
  expenses: [
    { id:'ex1', amount:245.50, date:'2026-03-05', vendor:'Guitar Center',   category:'Gear',   notes:'Cables & DI boxes', receipt:null, created_at:'2026-03-05' },
    { id:'ex2', amount:89.00,  date:'2026-03-07', vendor:'Spotify Premium', category:'Bills',  notes:'Monthly',           receipt:null, created_at:'2026-03-07' },
    { id:'ex3', amount:320.00, date:'2026-03-08', vendor:'Uber',            category:'Travel', notes:'Rides to Austin',   receipt:null, created_at:'2026-03-08' },
    { id:'ex4', amount:58.00,  date:'2026-03-09', vendor:'Torchys Tacos',   category:'Food',   notes:'Team dinner',       receipt:null, created_at:'2026-03-09' },
  ],
  timeline: [
    { id:'tl1', contactId:'c1', type:'contact_created', label:'Contact created',        date:'2025-10-12' },
    { id:'tl2', contactId:'c1', type:'gig',              label:'Gig booked — Jazz Night', date:'2026-02-20' },
    { id:'tl3', contactId:'c1', type:'invoice',          label:'Invoice sent — INV-001',  date:'2026-03-10' },
    { id:'tl4', contactId:'c4', type:'contact_created', label:'Contact created',          date:'2026-01-05' },
  ],
  calls: [],
  settings: {
    gmailClientId: '',
    gcalClientId: '',
    minimum_travel_buffer_hours: 2,
  },
};

// ── Seed on first load ─────────────────────
function seed() {
  if (localStorage.getItem(PREFIX + '_seeded')) return;
  Object.entries(DEMO).forEach(([k,v]) => {
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
  });
  localStorage.setItem(PREFIX + '_seeded', '1');
}

// ── Core CRUD ──────────────────────────────
function _get(col) {
  try { return JSON.parse(localStorage.getItem(PREFIX + col)) || []; }
  catch { return []; }
}

function _set(col, data) {
  localStorage.setItem(PREFIX + col, JSON.stringify(data));
}

export const dataService = {
  init() { seed(); },

  getAll(col)      { return _get(col); },
  getById(col, id) { return _get(col).find(r => r.id === id) || null; },

  save(col, record) {
    const list = _get(col);
    const idx  = list.findIndex(r => r.id === record.id);
    if (idx >= 0) list[idx] = record;
    else list.push({ id: uid(), created_at: todayISO(), ...record });
    _set(col, list);
    return record;
  },

  remove(col, id) {
    _set(col, _get(col).filter(r => r.id !== id));
  },

  query(col, fn) { return _get(col).filter(fn); },

  // Settings
  getSettings() {
    try { return JSON.parse(localStorage.getItem(PREFIX + 'settings')) || {}; }
    catch { return {}; }
  },
  saveSetting(key, value) {
    const s = this.getSettings();
    s[key] = value;
    localStorage.setItem(PREFIX + 'settings', JSON.stringify(s));
  },

  // Timeline
  addTimeline(entry) {
    const list = _get('timeline');
    list.push({ id: uid(), date: todayISO(), ...entry });
    _set('timeline', list);
  },
  getTimeline(contactId) {
    return _get('timeline').filter(t => t.contactId === contactId).sort((a,b) => b.date.localeCompare(a.date));
  },

  // Exports
  exportCSV(col, filename, cols) { downloadCSV(this.getAll(col), filename || `${col}.csv`, cols); },
  exportBackup() {
    const backup = {};
    ['contacts','gigs','tasks','invoices','expenses','timeline','calls'].forEach(c => backup[c] = _get(c));
    downloadJSON(backup, `easy-bees-backup-${todayISO()}.json`);
  },
};
