// modules/profile.js — Full profile settings

import { registerModule, setHeader, toast, fieldGroup, modal, btnHTML } from '../core.js';
import { dataService } from '../dataService.js';
import { isConnected as supabaseConnected, resetClient } from '../services/supabaseService.js';
import { Auth } from '../auth.js';
import { avatarHTML } from '../utils.js';
import { getTheme, applyTheme } from './settings.js';
import { openCalSettings, openGCalSetup } from './calendar.js';

function render() {
  const user = Auth.getUser() || {};

  setHeader('Profile', [
    { id:'sign-out', label:'Sign Out', v:'ghost', onClick: () => {
      if (window.confirm('Sign out of Easy Bees?')) Auth.signOut();
    }},
  ]);

  document.getElementById('module-content').innerHTML = `
    <div style="max-width:520px">

      <!-- Avatar + identity -->
      <div class="card flex items-center gap-5 mb-5">
        <div class="profile-avatar-ring" id="avatar-ring" title="Change photo">
          ${user.photo
            ? `<img src="${escHtml(user.photo)}" alt="Profile photo" id="avatar-img">`
            : `<div style="font-size:26px;font-weight:900;color:var(--acc)">${initials(user.name)}</div>`}
          <div class="profile-avatar-edit">✏️</div>
        </div>
        <div class="flex-1">
          <div class="font-black text-lg">${escHtml(user.name || 'Your Name')}</div>
          <div class="text-sm mt-0.5" style="color:var(--txts)">${escHtml(user.email || '')}</div>
          ${user.city ? `<div class="text-xs mt-1" style="color:var(--txtm)">${escHtml(user.city)}</div>` : ''}
        </div>
        <input type="file" id="avatar-upload" accept="image/*" style="display:none">
      </div>

      <!-- Edit form -->
      <div class="card mb-5">
        <div class="text-xs font-bold uppercase tracking-widest mb-4" style="color:var(--txts)">Personal Info</div>
        <div class="flex flex-col gap-3">
          <div class="field-group">
            <label class="field-label">Full Name</label>
            <input id="p-name"  class="field-input" value="${escHtml(user.name||'')}"  placeholder="Your full name">
          </div>
          <div class="field-group">
            <label class="field-label">Email</label>
            <input id="p-email" class="field-input" type="email" value="${escHtml(user.email||'')}" placeholder="you@example.com"
              ${user.provider === 'google' ? 'readonly style="opacity:.6"' : ''}>
            ${user.provider === 'google' ? `<div class="text-xs mt-1" style="color:var(--txts)">Managed by Google — cannot be changed here.</div>` : ''}
          </div>
          <div class="field-group">
            <label class="field-label">City</label>
            <input id="p-city"  class="field-input" value="${escHtml(user.city||'')}" placeholder="e.g. Houston, TX">
          </div>
          <div class="field-group">
            <label class="field-label">Job Title</label>
            <input id="p-title" class="field-input" value="${escHtml(user.jobTitle||'')}" placeholder="e.g. Music Producer, Artist Manager">
          </div>
          <div class="field-group">
            <label class="field-label">Bio / Notes</label>
            <textarea id="p-bio" class="field-input" rows="3" placeholder="Short bio or notes about yourself">${escHtml(user.bio||'')}</textarea>
          </div>
        </div>
        <button class="btn btn-primary mt-4" id="save-profile">Save Changes</button>
      </div>

      <!-- Change password (local accounts only) -->
      ${user.provider !== 'google' ? `
        <div class="card mb-5">
          <div class="text-xs font-bold uppercase tracking-widest mb-4" style="color:var(--txts)">Change Password</div>
          <div class="flex flex-col gap-3">
            <div class="field-group">
              <label class="field-label">Current Password</label>
              <input id="pw-current" class="field-input" type="password" placeholder="Current password">
            </div>
            <div class="field-group">
              <label class="field-label">New Password</label>
              <input id="pw-new" class="field-input" type="password" placeholder="New password (min 6 chars)">
            </div>
            <div class="field-group">
              <label class="field-label">Confirm New Password</label>
              <input id="pw-new2" class="field-input" type="password" placeholder="Confirm new password">
            </div>
          </div>
          <button class="btn btn-ghost mt-4" id="save-pw">Update Password</button>
        </div>
      ` : ''}

      <!-- Account info -->
      <div class="card mb-5">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Account</div>
        <div class="flex flex-col gap-2 text-sm" style="color:var(--txts);line-height:2">
          <div class="flex justify-between"><span>Provider</span><span class="font-semibold" style="color:var(--txt)">${user.provider === 'google' ? 'Google' : 'Email + Password'}</span></div>
          <div class="flex justify-between"><span>Member since</span><span class="font-semibold" style="color:var(--txt)">${user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—'}</span></div>
          <div class="flex justify-between"><span>User ID</span><span class="font-mono text-xs" style="color:var(--txtm)">${escHtml(user.id||'')}</span></div>
        </div>
      </div>

      <!-- Connected Accounts -->
      <div class="card mb-5">
        <div class="text-xs font-bold uppercase tracking-widest mb-1" style="color:var(--txts)">Connected Accounts</div>
        <div class="text-xs mb-4" style="color:var(--txtm);line-height:1.8">Tap any account to set it up in a few steps.</div>
        <div class="flex flex-col gap-3">
          ${connectCard('google', 'Google', 'Mail · Calendar · Drive', googleIcon(), !!dataService.getSettings().gcalClientId)}
          ${connectCard('anthropic', 'Anthropic AI', 'Call Analysis · Receipt Scan · Labs', anthropicIcon(), !!dataService.getSettings().claudeApiKey)}
          ${connectCard('supabase', 'Supabase', 'Cloud Sync · Database · Storage', supabaseIcon(), supabaseConnected())}
        </div>
      </div>

      <!-- Gig Settings -->
      <div class="card mb-5">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Gig Settings</div>
        ${fieldGroup('Min travel buffer between gigs (hours)', `<input id="s-buffer" class="field-input" type="number" min="0" max="12" value="${dataService.getSettings().minimum_travel_buffer_hours??2}">`)}
        <button class="btn btn-primary mt-3" id="save-gig-settings">Save</button>
      </div>

      <!-- Calendar Settings -->
      <div class="card mb-5">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Calendar</div>
        <div class="flex flex-col gap-2">
          <button class="btn btn-ghost" id="open-cal-colors" style="justify-content:flex-start;gap:10px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Calendar Color Settings
          </button>
          <button class="btn btn-ghost" id="open-gcal-setup" style="justify-content:flex-start;gap:10px">
            <svg width="14" height="14" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Connect Google Calendar / Gmail
          </button>
        </div>
      </div>

      <!-- Data & Exports -->
      <div class="card mb-5">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--txts)">Data &amp; Exports</div>
        <div class="flex flex-col gap-2">
          <button class="btn btn-ghost" id="export-contacts" style="justify-content:flex-start;gap:10px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
            Download Contacts CSV
          </button>
          <button class="btn btn-ghost" id="export-gigs" style="justify-content:flex-start;gap:10px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            Export Gigs CSV
          </button>
          <button class="btn btn-ghost" id="export-backup" style="justify-content:flex-start;gap:10px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Full Backup
          </button>
        </div>
      </div>

      <!-- Danger -->
      <div class="card" style="border-color:rgba(248,113,113,0.15)">
        <div class="text-xs font-bold uppercase tracking-widest mb-3" style="color:var(--red)">Danger Zone</div>
        <div class="flex gap-3 flex-wrap">
          <button class="btn btn-danger btn-sm" id="profile-signout">Sign Out</button>
          <button class="btn btn-ghost btn-sm" id="profile-delete" style="color:var(--red);border-color:rgba(248,113,113,0.3)">Delete Account</button>
        </div>
      </div>
    </div>
  `;

  // Avatar upload
  document.getElementById('avatar-ring')?.addEventListener('click', () => {
    document.getElementById('avatar-upload')?.click();
  });
  document.getElementById('avatar-upload')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Photo must be under 2 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = evt => {
      const updated = { ...Auth.getUser(), photo: evt.target.result };
      Auth.saveUser(updated);
      Auth.saveAccount(updated);
      toast('Profile photo updated');
      render();
      refreshSidebarUser();
    };
    reader.readAsDataURL(file);
  });

  // Save profile
  document.getElementById('save-profile')?.addEventListener('click', () => {
    const current = Auth.getUser();
    const updated = {
      ...current,
      name:  document.getElementById('p-name')?.value?.trim()  || current.name,
      email: current.provider === 'google' ? current.email : (document.getElementById('p-email')?.value?.trim() || current.email),
      city:     document.getElementById('p-city')?.value?.trim(),
      jobTitle: document.getElementById('p-title')?.value?.trim(),
      bio:      document.getElementById('p-bio')?.value?.trim(),
    };
    Auth.saveUser(updated);
    Auth.saveAccount(updated);
    toast('Profile saved');
    render();
    refreshSidebarUser();
  });

  // Change password
  document.getElementById('save-pw')?.addEventListener('click', () => {
    const current = Auth.getUser();
    const cur  = document.getElementById('pw-current')?.value;
    const nw   = document.getElementById('pw-new')?.value;
    const nw2  = document.getElementById('pw-new2')?.value;
    if (!cur || !nw || !nw2) { toast('Fill all password fields.', 'error'); return; }
    if (Auth.hashPw(cur) !== current.pwHash) { toast('Current password is incorrect.', 'error'); return; }
    if (nw.length < 6)  { toast('New password must be at least 6 characters.', 'error'); return; }
    if (nw !== nw2)     { toast('New passwords do not match.', 'error'); return; }
    const updated = { ...current, pwHash: Auth.hashPw(nw) };
    Auth.saveUser(updated);
    Auth.saveAccount(updated);
    toast('Password updated');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value     = '';
    document.getElementById('pw-new2').value    = '';
  });

  // Sign out buttons
  document.getElementById('sign-out')?.addEventListener('click', () => {
    if (window.confirm('Sign out?')) Auth.signOut();
  });
  document.getElementById('profile-signout')?.addEventListener('click', () => {
    if (window.confirm('Sign out?')) Auth.signOut();
  });

  // Theme
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => { applyTheme(btn.dataset.theme); render(); });
  });

  // Connect account cards
  document.getElementById('connect-google')?.addEventListener('click',    () => openWizard('google'));
  document.getElementById('connect-anthropic')?.addEventListener('click', () => openWizard('anthropic'));
  document.getElementById('connect-supabase')?.addEventListener('click',  () => openWizard('supabase'));

  // Gig settings
  document.getElementById('save-gig-settings')?.addEventListener('click', () => {
    dataService.saveSetting('minimum_travel_buffer_hours', +(document.getElementById('s-buffer')?.value) || 2);
    toast('Saved');
  });

  document.getElementById('export-backup')?.addEventListener('click', () => {
    dataService.exportBackup(); toast('Backup downloaded');
  });

  // Calendar settings (delegated to calendar module)
  document.getElementById('open-cal-colors')?.addEventListener('click', () => openCalSettings());
  document.getElementById('open-gcal-setup')?.addEventListener('click', () => openGCalSetup());

  // Contacts CSV export
  document.getElementById('export-contacts')?.addEventListener('click', () => {
    dataService.exportCSV('contacts', 'contacts.csv', ['name','email','phone','city','business_name','contact_type','gig_type','total_gigs','total_revenue','date_met']);
    toast('Contacts exported');
  });

  // Gigs CSV export
  document.getElementById('export-gigs')?.addEventListener('click', () => {
    dataService.exportCSV('gigs', 'gigs.csv', ['name','type','startDate','endDate','startTime','endTime','contactName','rate','status','city','notes']);
    toast('Gigs exported');
  });

  // Delete account
  document.getElementById('profile-delete')?.addEventListener('click', () => {
    if (!window.confirm('Delete your account? This removes your profile from this device.')) return;
    const user   = Auth.getUser();
    const others = Auth.getAccounts().filter(a => a.id !== user.id);
    localStorage.setItem('eb_accounts', JSON.stringify(others));
    Auth.signOut();
  });
}

// ── Sidebar user row ───────────────────────────────
export function refreshSidebarUser() {
  const user = Auth.getUser();
  if (!user) return;
  const el = document.getElementById('sidebar-user');
  if (!el) return;

  el.innerHTML = `
    <div class="su-avatar">
      ${user.photo
        ? `<img src="${escHtml(user.photo)}" class="profile-avatar-sm" alt="" style="position:relative">`
        : `<div class="profile-avatar-sm profile-avatar-initials">${initials(user.name)}</div>`}
      <div class="su-cog">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:var(--txts)"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </div>
    </div>
    <div class="flex-1 min-w-0 su-name-wrap">
      <div class="su-name font-bold truncate" style="font-size:12px">${escHtml(user.name || 'You')}</div>
      <div class="su-email truncate" style="font-size:10px;color:var(--txts)">${escHtml(user.email || '')}</div>
    </div>
    <svg class="su-cog-desktop" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--txts);flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  `;
}

// ── Dashboard profile widget (exported for dashboard use) ─
export function dashProfileWidget(user) {
  if (!user) return '';
  return `
    <div class="dash-profile-widget" id="dash-profile-btn" title="View profile">
      ${user.photo
        ? `<img src="${escHtml(user.photo)}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--acc);flex-shrink:0" alt="">`
        : `<div style="width:38px;height:38px;border-radius:50%;background:rgba(232,184,75,0.12);border:2px solid rgba(232,184,75,0.3);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:var(--acc);flex-shrink:0">${initials(user.name)}</div>`}
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm truncate">${escHtml(user.name || 'Your Profile')}</div>
        <div class="text-xs truncate" style="color:var(--txts)">${escHtml(user.email || '')}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--txts);flex-shrink:0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </div>
  `;
}

function initials(name = '') {
  return name.split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase() || '?';
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Connect Account Wizard ─────────────────────────
function openWizard(type) {
  if (type === 'google')    openGoogleWizard();
  if (type === 'anthropic') openAnthropicWizard();
  if (type === 'supabase')   openSupabaseWizard();
}

function openGoogleWizard() {
  const current = dataService.getSettings().gcalClientId || dataService.getSettings().gmailClientId || '';
  modal.open('Connect Google', `
    <div class="flex items-center gap-3 mb-5 p-3 rounded-xl" style="background:rgba(66,133,244,0.06);border:1px solid rgba(66,133,244,0.15)">
      ${googleIcon(20)}
      <div>
        <div class="font-bold text-sm">Google Workspace</div>
        <div class="text-xs" style="color:var(--txts)">Enables Mail, Calendar &amp; Drive in Easy Bees</div>
      </div>
    </div>

    <div class="flex flex-col gap-0 mb-5" style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden">
      ${wizStep(1,'Go to Google Cloud Console',
        `Open <a href="https://console.cloud.google.com" target="_blank" rel="noopener" style="color:var(--acc)">console.cloud.google.com</a> and sign in with your Google account.`)}
      ${wizStep(2,'Create or select a project',
        `Click the project dropdown at the top → <strong>New Project</strong>. Name it anything, e.g. <em>Easy Bees</em>.`)}
      ${wizStep(3,'Enable APIs',
        `Go to <strong>APIs &amp; Services → Library</strong>. Search and enable: <span style="color:var(--acc)">Gmail API</span>, <span style="color:var(--acc)">Google Calendar API</span>, <span style="color:var(--acc)">Google Drive API</span>.`)}
      ${wizStep(4,'Create OAuth credentials',
        `<strong>APIs &amp; Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong>. Set Application type to <em>Web application</em>. Under Authorized JavaScript origins add your domain (or <code style="font-size:10px;background:var(--bg);padding:1px 5px;border-radius:4px">http://localhost</code> for local use).`)}
      ${wizStep(5,'Paste your Client ID below', ``)}
    </div>

    <div class="field-group mb-4">
      <label class="field-label">OAuth Client ID</label>
      <input id="wiz-google-id" class="field-input" value="${escHtml(current)}" placeholder="xxxxxxxx.apps.googleusercontent.com" spellcheck="false">
    </div>
    <div id="wiz-google-err" class="text-xs mb-2" style="color:var(--red);display:none"></div>
  `, `
    ${btnHTML('Cancel', 'btn-ghost', 'wiz-cancel')}
    ${btnHTML('Save &amp; Connect', 'btn-primary', 'wiz-google-save')}
  `);

  document.getElementById('wiz-cancel')?.addEventListener('click', () => modal.close());
  document.getElementById('wiz-google-save')?.addEventListener('click', () => {
    const val = document.getElementById('wiz-google-id')?.value?.trim();
    const err = document.getElementById('wiz-google-err');
    if (!val || !val.includes('.apps.googleusercontent.com')) {
      err.textContent = 'Paste a valid Client ID ending in .apps.googleusercontent.com';
      err.style.display = 'block'; return;
    }
    dataService.saveSetting('gcalClientId',  val);
    dataService.saveSetting('gmailClientId', val);
    modal.close();
    toast('Google connected');
    render();
  });
}

function openAnthropicWizard() {
  const current = dataService.getSettings().claudeApiKey || '';
  modal.open('Connect Anthropic AI', `
    <div class="flex items-center gap-3 mb-5 p-3 rounded-xl" style="background:rgba(232,184,75,0.06);border:1px solid rgba(232,184,75,0.15)">
      ${anthropicIcon(20)}
      <div>
        <div class="font-bold text-sm">Anthropic Claude</div>
        <div class="text-xs" style="color:var(--txts)">Powers call analysis, receipt scanning &amp; Labs</div>
      </div>
    </div>

    <div class="flex flex-col gap-0 mb-5" style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden">
      ${wizStep(1,'Go to Anthropic Console',
        `Open <a href="https://console.anthropic.com" target="_blank" rel="noopener" style="color:var(--acc)">console.anthropic.com</a> and sign in or create a free account.`)}
      ${wizStep(2,'Open API Keys',
        `In the left sidebar click <strong>API Keys</strong>.`)}
      ${wizStep(3,'Create a new key',
        `Click <strong>Create Key</strong>. Give it a name like <em>Easy Bees</em>. Copy the key — it starts with <code style="font-size:10px;background:var(--bg);padding:1px 5px;border-radius:4px">sk-ant-</code>.`)}
      ${wizStep(4,'Paste it below', ``)}
    </div>

    <div class="field-group mb-4">
      <label class="field-label">Anthropic API Key</label>
      <input id="wiz-ant-key" class="field-input" type="password" value="${escHtml(current)}" placeholder="sk-ant-api03-…" spellcheck="false" autocomplete="off">
    </div>
    <div id="wiz-ant-err" class="text-xs mb-2" style="color:var(--red);display:none"></div>
  `, `
    ${btnHTML('Cancel', 'btn-ghost', 'wiz-cancel')}
    ${btnHTML('Save Key', 'btn-primary', 'wiz-ant-save')}
  `);

  document.getElementById('wiz-cancel')?.addEventListener('click', () => modal.close());
  document.getElementById('wiz-ant-save')?.addEventListener('click', () => {
    const val = document.getElementById('wiz-ant-key')?.value?.trim();
    const err = document.getElementById('wiz-ant-err');
    if (!val || !val.startsWith('sk-ant-')) {
      err.textContent = 'Key must start with sk-ant-';
      err.style.display = 'block'; return;
    }
    dataService.saveSetting('claudeApiKey', val);
    modal.close();
    toast('Anthropic AI connected');
    render();
  });
}

// ── HTML helpers ──────────────────────────────────
function connectCard(id, name, sub, logo, isConnected) {
  return `
    <div class="connect-account-card${isConnected ? ' connected' : ''}" id="connect-${id}" style="cursor:pointer">
      <div class="connect-logo">${logo}</div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm">${name}</div>
        <div class="text-xs" style="color:var(--txts)">${sub}</div>
      </div>
      ${isConnected
        ? `<div class="flex items-center gap-1.5 text-xs font-semibold" style="color:#22C55E;flex-shrink:0">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
             Connected
           </div>`
        : `<div class="flex items-center gap-1 text-xs font-semibold flex-shrink:0" style="color:var(--acc)">
             Set up
             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
           </div>`}
    </div>`;
}

function wizStep(n, title, body) {
  return `
    <div class="wizard-step" style="padding:12px 16px">
      <div class="wizard-step-num">${n}</div>
      <div class="flex-1">
        <div class="text-sm font-semibold mb-0.5">${title}</div>
        ${body ? `<div class="text-xs" style="color:var(--txts);line-height:1.7">${body}</div>` : ''}
      </div>
    </div>`;
}

function supabaseIcon(size=18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.33 12.57.72 13.33 1.396 13.33h7.007l-.012 9.542c.015.986 1.26 1.41 1.874.637l9.262-11.649c.434-.52.044-1.28-.632-1.28h-7.007L11.9 1.037z" fill="#3ECF8E"/>
  </svg>`;
}

function openSupabaseWizard() {
  const s = dataService.getSettings();
  const currentUrl = s.supabaseUrl || '';
  const currentKey = s.supabaseAnonKey || '';

  modal.open('Connect Supabase', `
    <div class="flex items-center gap-3 mb-5 p-3 rounded-xl" style="background:rgba(62,207,142,0.06);border:1px solid rgba(62,207,142,0.2)">
      ${supabaseIcon(20)}
      <div>
        <div class="font-bold text-sm">Supabase</div>
        <div class="text-xs" style="color:var(--txts)">Cloud sync, database &amp; file storage for Easy Bees</div>
      </div>
    </div>

    <div class="flex flex-col gap-0 mb-5" style="border:1px solid var(--bdr);border-radius:12px;overflow:hidden">
      ${wizStep(1,'Create a free Supabase project',
        `Go to <a href="https://supabase.com" target="_blank" rel="noopener" style="color:var(--acc)">supabase.com</a>, sign up free, then click <strong>New Project</strong>. Choose a name, region, and password.`)}
      ${wizStep(2,'Get your project credentials',
        `In your project dashboard go to <strong>Settings → API</strong>. You'll find your <em>Project URL</em> and <em>anon/public</em> key there.`)}
      ${wizStep(3,'Paste both below', ``)}
    </div>

    <div class="flex flex-col gap-3 mb-4">
      <div class="field-group">
        <label class="field-label">Project URL</label>
        <input id="wiz-sb-url" class="field-input" value="${escHtml(currentUrl)}" placeholder="https://xxxxxxxxxxxx.supabase.co" spellcheck="false">
      </div>
      <div class="field-group">
        <label class="field-label">Anon / Public Key</label>
        <input id="wiz-sb-key" class="field-input" type="password" value="${escHtml(currentKey)}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" spellcheck="false" autocomplete="off">
      </div>
    </div>
    <div id="wiz-sb-err" class="text-xs mb-2" style="color:var(--red);display:none"></div>
  `, `
    ${btnHTML('Cancel', 'btn-ghost', 'wiz-cancel')}
    ${btnHTML('Save &amp; Connect', 'btn-primary', 'wiz-sb-save')}
  `);

  document.getElementById('wiz-cancel')?.addEventListener('click', () => modal.close());
  document.getElementById('wiz-sb-save')?.addEventListener('click', () => {
    const url = document.getElementById('wiz-sb-url')?.value?.trim();
    const key = document.getElementById('wiz-sb-key')?.value?.trim();
    const err = document.getElementById('wiz-sb-err');
    if (!url || !url.startsWith('https://')) {
      err.textContent = 'Enter your Supabase Project URL starting with https://';
      err.style.display = 'block'; return;
    }
    if (!key || !key.startsWith('eyJ')) {
      err.textContent = 'Paste your anon/public key — it starts with eyJ';
      err.style.display = 'block'; return;
    }
    dataService.saveSetting('supabaseUrl',      url);
    dataService.saveSetting('supabaseAnonKey',  key);
    resetClient(); // clear cached client so next call uses new creds
    modal.close();
    toast('Supabase connected');
    render();
  });
}

function googleIcon(size=18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;
}

function anthropicIcon(size=18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <path d="M13.8 3h-3.6L4 21h3.8l1.3-3.5h5.8l1.3 3.5H20L13.8 3zm-3.5 11.5 1.7-4.8 1.7 4.8H10.3z" fill="var(--acc)"/>
  </svg>`;
}

registerModule('profile', { render });
