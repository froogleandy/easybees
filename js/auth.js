// auth.js — Sign In / Sign Up gate
// Stores user in eb_user localStorage. Supports local accounts + Google SSO.

export const Auth = {
  // ── Storage ────────────────────────────────────
  getUser() {
    try { return JSON.parse(localStorage.getItem('eb_user') || 'null'); } catch { return null; }
  },
  saveUser(u) {
    localStorage.setItem('eb_user', JSON.stringify(u));
    window.dispatchEvent(new CustomEvent('eb:userchanged', { detail: u }));
  },
  signOut() {
    localStorage.removeItem('eb_user');
    location.reload();
  },

  // ── Accounts registry (multi-user on same device) ─
  getAccounts() {
    try { return JSON.parse(localStorage.getItem('eb_accounts') || '[]'); } catch { return []; }
  },
  saveAccount(account) {
    const list = this.getAccounts();
    const idx  = list.findIndex(a => a.email === account.email);
    if (idx >= 0) list[idx] = account; else list.push(account);
    localStorage.setItem('eb_accounts', JSON.stringify(list));
  },
  findAccount(email) {
    return this.getAccounts().find(a => a.email.toLowerCase() === email.toLowerCase()) || null;
  },

  // ── Simple password hash (not cryptographic — browser only) ─
  hashPw(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) {
      h = Math.imul(31, h) + pw.charCodeAt(i) | 0;
    }
    return h.toString(36);
  },

  // ── Init — renders auth screen if no user ──────
  init(onSuccess) {
    const user = this.getUser();
    if (user) { onSuccess(user); return; }
    this._renderAuth(onSuccess);
  },

  // ── Render auth screen ─────────────────────────
  _renderAuth(onSuccess) {
    let tab = 'signin'; // 'signin' | 'signup'
    let err = '';

    const mount = () => {
      const existing = document.getElementById('auth-screen');
      if (existing) existing.remove();

      const el = document.createElement('div');
      el.id = 'auth-screen';
      el.innerHTML = `
        <div class="auth-card">
          <!-- Logo -->
          <div class="auth-logo">
            <div class="auth-logo-mark" style="margin:0 auto 10px">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity=".15" fill="var(--acc)"/>
                <path d="M8 12l4-8 4 8-4 2-4-2z" fill="var(--acc)" opacity=".7"/>
                <path d="M6 15h12v2a6 6 0 0 1-12 0v-2z" fill="var(--acc)" opacity=".4"/>
              </svg>
            </div>
            <div class="font-black text-xl tracking-tight" style="color:var(--acc)">Easy Bees</div>
            <div class="text-xs mt-1 uppercase tracking-widest" style="color:var(--txts)">Music Manager</div>
          </div>

          <!-- Tab bar -->
          <div class="auth-tab-bar">
            <button class="auth-tab${tab==='signin'?' active':''}" data-tab="signin">Sign In</button>
            <button class="auth-tab${tab==='signup'?' active':''}" data-tab="signup">Create Account</button>
          </div>

          <!-- Error -->
          ${err ? `<div class="mb-4 px-3 py-2 rounded-lg text-sm" style="background:rgba(248,113,113,0.1);color:#F87171;border:1px solid rgba(248,113,113,0.2)">${escHtml(err)}</div>` : ''}

          <!-- Fields -->
          <div class="flex flex-col gap-3">
            ${tab === 'signup' ? `
              <input id="auth-name" class="field-input" placeholder="Full name" autocomplete="name">
            ` : ''}
            <input id="auth-email" class="field-input" type="email" placeholder="Email address" autocomplete="email">
            <input id="auth-pw"    class="field-input" type="password" placeholder="Password" autocomplete="${tab==='signup'?'new-password':'current-password'}">
            ${tab === 'signup' ? `
              <input id="auth-pw2" class="field-input" type="password" placeholder="Confirm password" autocomplete="new-password">
            ` : ''}
          </div>

          <!-- Submit -->
          <button class="btn btn-primary w-full mt-4" id="auth-submit" style="width:100%;justify-content:center;min-height:44px">
            ${tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          <!-- Divider -->
          <div class="auth-divider">or continue with</div>

          <!-- Google -->
          <button class="auth-google-btn" id="auth-google">
            <svg width="17" height="17" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          ${tab === 'signin' ? `
            <div class="text-center mt-4">
              <button class="text-xs" style="color:var(--txts);background:none;border:none;cursor:pointer" id="auth-forgot">Forgot password?</button>
            </div>
          ` : ''}
        </div>
      `;
      document.body.appendChild(el);

      // Tab switch
      el.querySelectorAll('.auth-tab').forEach(btn => {
        btn.addEventListener('click', () => { tab = btn.dataset.tab; err = ''; mount(); });
      });

      // Enter key submits
      el.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('#auth-submit')?.click(); });
      });

      // Submit
      el.querySelector('#auth-submit')?.addEventListener('click', () => {
        const email = el.querySelector('#auth-email')?.value?.trim();
        const pw    = el.querySelector('#auth-pw')?.value;
        const name  = el.querySelector('#auth-name')?.value?.trim();
        const pw2   = el.querySelector('#auth-pw2')?.value;

        if (!email || !pw) { err = 'Email and password are required.'; mount(); return; }

        if (tab === 'signup') {
          if (!name) { err = 'Please enter your full name.'; mount(); return; }
          if (pw.length < 6) { err = 'Password must be at least 6 characters.'; mount(); return; }
          if (pw !== pw2)    { err = 'Passwords do not match.'; mount(); return; }
          if (Auth.findAccount(email)) { err = 'An account with that email already exists.'; mount(); return; }

          const user = {
            id:       `u_${Date.now()}`,
            name,
            email,
            pwHash:   Auth.hashPw(pw),
            photo:    null,
            city:     '',
            bio:      '',
            createdAt: new Date().toISOString(),
            provider: 'local',
          };
          Auth.saveAccount(user);
          Auth.saveUser(user);
          el.remove();
          onSuccess(user);

        } else {
          const account = Auth.findAccount(email);
          if (!account) { err = 'No account found. Create one first.'; mount(); return; }
          if (account.provider === 'google') { err = 'This account uses Google sign-in.'; mount(); return; }
          if (account.pwHash !== Auth.hashPw(pw)) { err = 'Incorrect password.'; mount(); return; }
          Auth.saveUser(account);
          el.remove();
          onSuccess(account);
        }
      });

      // Google sign-in
      el.querySelector('#auth-google')?.addEventListener('click', async () => {
        const settings = JSON.parse(localStorage.getItem('eb_settings') || '{}');
        const clientId = settings.gmailClientId || settings.gcalClientId || '';
        if (!clientId) {
          err = 'No Google Client ID configured. Sign up with email first, then add your OAuth Client ID in Settings.';
          mount(); return;
        }
        try {
          await loadGIS();
          window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
            callback: async resp => {
              if (resp.error) { err = 'Google sign-in failed.'; mount(); return; }
              const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${resp.access_token}` }
              }).then(r => r.json());
              const user = {
                id:       `g_${info.sub}`,
                name:     info.name || '',
                email:    info.email || '',
                photo:    info.picture || null,
                city:     '',
                bio:      '',
                createdAt: new Date().toISOString(),
                provider: 'google',
              };
              Auth.saveAccount(user);
              Auth.saveUser(user);
              el.remove();
              onSuccess(user);
            },
          }).requestAccessToken({ prompt: 'select_account' });
        } catch(e) {
          err = 'Google sign-in failed — check your OAuth Client ID.';
          mount();
        }
      });

      // Forgot password
      el.querySelector('#auth-forgot')?.addEventListener('click', () => {
        const email = el.querySelector('#auth-email')?.value?.trim();
        if (!email) { err = 'Enter your email first.'; mount(); return; }
        const account = Auth.findAccount(email);
        if (!account) { err = 'No account found for that email.'; mount(); return; }
        err = '';
        // Simple reset: prompt for new password
        const newPw = window.prompt('Enter a new password (min 6 chars):');
        if (!newPw || newPw.length < 6) return;
        account.pwHash = Auth.hashPw(newPw);
        Auth.saveAccount(account);
        err = '';
        mount();
        setTimeout(() => {
          const errEl = document.querySelector('#auth-screen .mb-4');
          if (!errEl) {
            const card = document.querySelector('.auth-card');
            const notice = document.createElement('div');
            notice.className = 'mb-4 px-3 py-2 rounded-lg text-sm';
            notice.style.cssText = 'background:rgba(34,197,94,0.1);color:#22C55E;border:1px solid rgba(34,197,94,0.2)';
            notice.textContent = 'Password updated. Sign in now.';
            card.insertBefore(notice, card.querySelector('.auth-tab-bar').nextSibling);
          }
        }, 50);
      });
    };

    mount();
  },
};

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
