// validators.js — All validation logic. Returns { valid, message }

export function validateContact(data, existing = []) {
  if (!data.name?.trim()) return { valid:false, message:'Name is required.' };
  if (data.name.trim().length < 2) return { valid:false, message:'Name must be at least 2 characters.' };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { valid:false, message:'Invalid email address.' };
  if (data.phone && !/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/.test(data.phone.replace(/\s/g,''))) return { valid:false, message:'Invalid phone number.' };
  const dupe = existing.find(c => c.name.toLowerCase() === data.name.trim().toLowerCase() && c.id !== data.id);
  if (dupe) return { valid:false, message:`A contact named "${data.name}" already exists.` };
  return { valid:true, message:'' };
}

export function validateGig(data) {
  if (!data.name?.trim()) return { valid:false, message:'Gig name is required.' };
  if (!data.type) return { valid:false, message:'Gig type is required.' };
  if (!data.startDate) return { valid:false, message:'Start date is required.' };
  if (!data.oneDay && data.endDate && data.endDate < data.startDate) return { valid:false, message:'End date cannot be before start date.' };
  if (!data.startTime || !data.endTime) return { valid:false, message:'Start and end time are required.' };
  if (data.rate <= 0) return { valid:false, message:'Rate must be greater than $0.' };
  return { valid:true, message:'' };
}

export function checkDoubleBooking(newGig, existing) {
  return existing.filter(g => {
    if (g.id === newGig.id || g.startDate !== newGig.startDate) return false;
    const nS = toMin(newGig.startTime), nE = toMin(newGig.endTime);
    const eS = toMin(g.startTime),    eE = toMin(g.endTime);
    return nS < eE && nE > eS;
  });
}

export function checkTravelConflict(newGig, existing, bufferHours = 2) {
  return existing.filter(g => {
    if (g.id === newGig.id || g.startDate !== newGig.startDate || g.city === newGig.city) return false;
    const gap = toMin(newGig.startTime) - toMin(g.endTime);
    return gap >= 0 && gap < bufferHours * 60;
  });
}

export function validateInvoice(data) {
  if (!data.clientId) return { valid:false, message:'Please select a client.' };
  if (!data.items?.length) return { valid:false, message:'At least one line item is required.' };
  for (const it of data.items) {
    if (!it.desc?.trim()) return { valid:false, message:'All items need a description.' };
    if (it.qty <= 0) return { valid:false, message:'Quantity must be greater than 0.' };
    if (it.rate < 0)  return { valid:false, message:'Rate cannot be negative.' };
  }
  const total = data.items.reduce((s,i) => s + i.qty*i.rate, 0);
  if (total <= 0) return { valid:false, message:'Invoice total must be greater than $0.' };
  return { valid:true, message:'' };
}

export function validateExpense(data) {
  if (!data.amount || isNaN(data.amount) || +data.amount <= 0) return { valid:false, message:'Amount must be greater than $0.' };
  if (!data.date) return { valid:false, message:'Date is required.' };
  if (!data.vendor?.trim()) return { valid:false, message:'Vendor name is required.' };
  return { valid:true, message:'' };
}

function toMin(t) {
  if (!t) return 0;
  const [h,m] = t.split(':').map(Number);
  return h*60+m;
}
