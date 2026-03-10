// app.js — Main entry point

import './picker.js';
import { Auth }              from './auth.js';
import { initCore, navigate } from './core.js';
import { refreshSidebarUser } from './modules/profile.js';
// Services — imported for side-effect registration only
import './services/aiService.js';
import './services/driveService.js';
import './services/calendarService.js';
import './services/supabaseService.js';

import './modules/dashboard.js';
import './modules/mail.js';
import './modules/contacts.js';
import './modules/gigs.js';
import './modules/calendar.js';
import './modules/tasks.js';
import './modules/money.js';
import './modules/vault.js';
import './modules/calls.js';
import './modules/activity.js';
import './modules/experimental.js';
import './modules/profile.js';

document.addEventListener('DOMContentLoaded', () => {
  // ── Auth gate ──────────────────────────────────
  Auth.init(user => {
    // Build sidebar user row if not already there
    injectSidebarUser();

    initCore();
    navigate('dashboard');

    // Keep sidebar user in sync when profile changes
    window.addEventListener('eb:userchanged', () => refreshSidebarUser());

    // Mobile sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const menuBtn = document.getElementById('mobile-menu-btn');
    function openSidebar()  { sidebar.classList.add('mobile-open'); overlay.style.display='block'; }
    function closeSidebar() { sidebar.classList.remove('mobile-open'); overlay.style.display='none'; }
    menuBtn?.addEventListener('click', () => sidebar.classList.contains('mobile-open') ? closeSidebar() : openSidebar());
    overlay?.addEventListener('click', closeSidebar);
    document.getElementById('sidebar-nav')?.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });
});

function injectSidebarUser() {
  const footer = document.getElementById('sidebar-footer');
  if (!footer) return;

  // Replace version footer with user row
  footer.id    = 'sidebar-user';
  footer.className = '';
  footer.style = '';
  refreshSidebarUser();

  footer.addEventListener('click', () => navigate('profile'));
}
