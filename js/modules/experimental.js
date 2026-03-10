// modules/experimental.js — Labs: tool wizard with SoundCloud + Spotify scrapers

import { registerModule, setHeader, toast } from '../core.js';
import { dataService } from '../dataService.js';

let _activeTool = null;
let _scanning   = false;
let _results    = [];
let _query      = '';
let _tokensIn   = 0;
let _tokensOut  = 0;
let _cost       = 0;

const GENRE_PRESETS_SC = ['Hip-Hop','R&B','Electronic','Afrobeats','House','Trap','Lofi','Drill'];
const GENRE_PRESETS_SP = ['Pop','Hip-Hop','Latin','Dance','R&B','Afrobeats','Indie','K-Pop'];

const BEAKER_SVG = `<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#A78BFA"/><stop offset="100%" stop-color="#60A5FA"/></linearGradient>
  </defs>
  <ellipse cx="28" cy="42" rx="15" ry="6" fill="url(#bg1)" opacity="0.15"/>
  <path d="M20 10 L20 29 L10 45 Q9 47 12 48 L44 48 Q47 47 46 45 L36 29 L36 10 Z" fill="rgba(167,139,250,0.07)" stroke="url(#bg1)" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M15 40 Q14 43 16 44 L40 44 Q42 43 41 40 L33 27 L23 27 Z" fill="url(#bg1)" opacity="0.2"/>
  <circle cx="22" cy="37" r="2.2" fill="#A78BFA" opacity="0.6"/>
  <circle cx="30" cy="32" r="1.5" fill="#60A5FA" opacity="0.5"/>
  <circle cx="26" cy="42" r="1.1" fill="#A78BFA" opacity="0.45"/>
  <rect x="18" y="7" width="20" height="5" rx="2.5" fill="rgba(167,139,250,0.08)" stroke="url(#bg1)" stroke-width="1.6"/>
  <line x1="24" y1="19" x2="27" y2="19" stroke="#A78BFA" stroke-width="1.3" opacity="0.5"/>
  <line x1="24" y1="23" x2="28" y2="23" stroke="#A78BFA" stroke-width="1.3" opacity="0.4"/>
</svg>`;

const TOOLS = [
  {
    id: 'soundcloud',
    label: 'SoundCloud Tracker',
    tagline: 'Finds the newest tracks with the most plays',
    color: '#ff5500',
    bg: 'rgba(255,85,0,0.08)',
    border: 'rgba(255,85,0,0.22)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff5500" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  },
  {
    id: 'spotify',
    label: 'Spotify Tracker',
    tagline: 'Surfaces the hottest new releases by streams',
    color: '#1DB954',
    bg: 'rgba(29,185,84,0.08)',
    border: 'rgba(29,185,84,0.22)',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1DB954" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 11.5c2.5-1 5.5-1 8 0"/><path d="M7 14.5c3-1.3 7-1.3 10 0"/><path d="M9 17.5c2-0.8 4-0.8 6 0"/></svg>`,
  },
];

// ── Main render ──────────────────────────────────────
function render() {
  setHeader('Labs', []);
  if (!_activeTool) renderPicker();
  else renderTool();
}

// ── Step 1: Tool picker ──────────────────────────────
function renderPicker() {
  document.getElementById('module-content').innerHTML = `
    <div style="max-width:520px;margin:0 auto;padding-top:8px">
      <div style="text-align:center;margin-bottom:36px">
        <div style="display:inline-flex;flex-direction:column;align-items:center;gap:12px">
          ${BEAKER_SVG}
          <div>
            <div class="font-black" style="font-size:21px;letter-spacing:-0.5px;margin-bottom:5px">Experimental Labs</div>
            <div class="text-sm" style="color:var(--txts);line-height:1.7">AI-powered tools in active development.<br>Pick a tool to get started.</div>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-3">
        ${TOOLS.map(t => `
          <div class="labs-tool-card" data-tool="${t.id}" style="border-color:${t.border}">
            <div class="labs-tool-icon" style="background:${t.bg};border:1px solid ${t.border}">${t.icon}</div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm mb-0.5">${t.label}</div>
              <div class="text-xs" style="color:var(--txts)">${t.tagline}</div>
            </div>
            <div style="color:var(--txts);font-size:20px;flex-shrink:0;margin-left:4px">›</div>
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;margin-top:28px">
        <span class="labs-badge">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0-4 7h14l-4-7M9 14h6"/></svg>
          Claude AI + web search
        </span>
      </div>
    </div>
  `;
  document.querySelectorAll('.labs-tool-card').forEach(card => {
    card.addEventListener('click', () => { _activeTool = card.dataset.tool; _results = []; _query = ''; renderTool(); });
  });
}

// ── Step 2: Active tool ──────────────────────────────
function renderTool() {
  const tool    = TOOLS.find(t => t.id === _activeTool);
  const presets = _activeTool === 'soundcloud' ? GENRE_PRESETS_SC : GENRE_PRESETS_SP;
  document.getElementById('module-content').innerHTML = `
    <div style="max-width:840px">
      <div class="flex items-center gap-3 mb-5">
        <button class="btn btn-ghost btn-sm" id="labs-back" style="padding:5px 12px;font-size:12px">← Labs</button>
        <div class="flex items-center gap-2">
          <div style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:${tool.bg};border:1px solid ${tool.border};flex-shrink:0">${tool.icon}</div>
          <div>
            <div class="font-bold" style="font-size:13px">${tool.label}</div>
            <div style="font-size:10px;color:var(--txts)">${tool.tagline}</div>
          </div>
        </div>
      </div>

      <div class="flex gap-2 mb-3">
        <input id="sc-query" class="field-input flex-1"
          placeholder="${_activeTool==='soundcloud' ? 'Genre, artist, vibe… lofi hip-hop, afrobeats 2026' : 'Genre, artist, mood… afrobeats new, latin pop 2026'}"
          value="${escHtml(_query)}">
        <button class="btn btn-primary" id="sc-scan" style="flex-shrink:0;min-width:88px">
          ${_scanning ? `<span class="scan-pulse">Scanning…</span>` : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:4px"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><span class="btn-label">Scan</span>`}
        </button>
      </div>

      <div class="flex flex-wrap gap-1.5 mb-5">
        ${presets.map(g => `<button class="btn btn-ghost btn-sm genre-pill" data-genre="${g}" style="font-size:11px;padding:3px 11px;${_query===g?`border-color:${tool.color};color:${tool.color}`:''}">${g}</button>`).join('')}
      </div>

      ${_scanning ? `
        <div style="text-align:center;padding:48px 0">
          <div class="processing-ring" style="margin:0 auto 16px"></div>
          <div class="font-semibold text-sm mb-1">Scanning ${tool.label}…</div>
          <div class="text-xs" style="color:var(--txts)">Finding freshest tracks with the most traction</div>
        </div>
      ` : _results.length ? `
        <div class="flex items-center justify-between mb-4">
          <div class="text-xs font-bold uppercase tracking-widest" style="color:var(--txts)">${_results.length} tracks found</div>
          ${_cost > 0 ? `<div class="text-xs" style="color:var(--txtm);font-family:'JetBrains Mono',monospace">${_tokensIn}↑ ${_tokensOut}↓ · $${_cost.toFixed(4)}</div>` : ''}
        </div>
        <div class="sc-results-grid" id="sc-grid">${_results.map((t, i) => renderCard(t, i, tool)).join('')}</div>
      ` : `
        <div class="empty-state" style="padding:40px 0">
          <div style="opacity:0.18;margin-bottom:12px">${tool.icon}</div>
          <div class="empty-state-title">Ready to scan</div>
          <div class="empty-state-sub">Enter a keyword or tap a genre preset.</div>
        </div>
      `}
    </div>
  `;

  document.getElementById('labs-back')?.addEventListener('click', () => { _activeTool = null; _results = []; renderPicker(); });
  document.getElementById('sc-scan')?.addEventListener('click', runScan);
  document.getElementById('sc-query')?.addEventListener('keydown', e => { if (e.key==='Enter') runScan(); });
  document.querySelectorAll('.genre-pill').forEach(btn => {
    btn.addEventListener('click', () => { _query = btn.dataset.genre; document.getElementById('sc-query').value = _query; runScan(); });
  });
  bindEmbeds();
}

// ── Track card ────────────────────────────────────────
function renderCard(t, i, tool) {
  const url = t.url || '';
  const isSpotify = _activeTool === 'spotify';
  let embedHTML = '';
  if (!isSpotify && url) {
    const eUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23E8B84B&auto_play=false&hide_related=true&show_comments=false&visual=false`;
    embedHTML = `<div class="sc-embed-wrap" id="embed-${i}" style="display:none"><iframe scrolling="no" frameborder="no" allow="autoplay" src="${escHtml(eUrl)}" height="80"></iframe></div>`;
  } else if (isSpotify && url) {
    const m = url.match(/track\/([a-zA-Z0-9]+)/);
    if (m) embedHTML = `<div class="sc-embed-wrap" id="embed-${i}" style="display:none"><iframe src="https://open.spotify.com/embed/track/${m[1]}?utm_source=generator&theme=0" height="80" frameborder="0" allowtransparency="true" allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" style="border-radius:8px;width:100%"></iframe></div>`;
  }
  return `
    <div class="sc-card">
      ${t.artwork
        ? `<img class="sc-card-art" src="${escHtml(t.artwork)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="sc-card-art" style="display:flex;align-items:center;justify-content:center;opacity:0.12">${tool.icon}</div>`}
      <div class="sc-card-body">
        <div class="font-bold text-sm mb-0.5 truncate" title="${escHtml(t.title)}">${escHtml(t.title||'Untitled')}</div>
        <div class="text-xs mb-2 truncate" style="color:var(--txts)">${escHtml(t.artist||'')}</div>
        <div class="flex items-center gap-2 flex-wrap mb-2">
          ${t.genre  ? `<span class="tag" style="color:${tool.color};background:${tool.bg};border:1px solid ${tool.border}">${escHtml(t.genre)}</span>` : ''}
          ${t.plays  ? `<span class="sc-plays" style="color:${tool.color};font-weight:700">${escHtml(t.plays)}</span>` : ''}
          ${t.posted ? `<span class="sc-plays">${escHtml(t.posted)}</span>` : ''}
        </div>
        ${t.desc ? `<div class="text-xs mb-3" style="color:var(--txts);line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escHtml(t.desc)}</div>` : ''}
        <div class="flex gap-1.5 flex-wrap">
          ${url && embedHTML ? `<button class="btn btn-ghost btn-sm expand-embed" data-i="${i}" style="font-size:11px;padding:4px 10px">Play</button>` : ''}
          ${url ? `<a href="${escHtml(url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">Open ↗</a>` : ''}
        </div>
      </div>
      ${embedHTML}
    </div>`;
}

function bindEmbeds() {
  document.querySelectorAll('.expand-embed').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = document.getElementById(`embed-${btn.dataset.i}`);
      if (!wrap) return;
      const open = wrap.style.display !== 'none';
      wrap.style.display = open ? 'none' : 'block';
      btn.textContent    = open ? 'Play' : 'Hide';
    });
  });
}

// ── AI Scan ───────────────────────────────────────────
async function runScan() {
  const input = document.getElementById('sc-query')?.value?.trim();
  _query = input || 'new music';
  _scanning = true; _results = []; renderTool();

  const platform = _activeTool === 'spotify' ? 'Spotify' : 'SoundCloud';
  const urlEx    = _activeTool === 'spotify' ? 'open.spotify.com/track/...' : 'soundcloud.com/artist/track-slug';

  const prompt = `Search the web for the most recently uploaded ${platform} tracks matching: "${_query}".

Find tracks released in the last 30 days with the highest play/stream counts. For each track return:
- title: track name
- artist: artist or uploader name  
- url: direct ${platform} URL (e.g. https://${urlEx})
- genre: genre if visible
- plays: play/stream count as human-readable string (e.g. "1.2M", "84K")
- posted: upload date (e.g. "2 days ago", "Mar 8, 2026")
- desc: short description/tags max 100 chars
- artwork: direct image URL if findable else empty string

Return ONLY valid JSON array of up to 8 tracks sorted by plays descending. No markdown:
[{"title":"","artist":"","url":"","genre":"","plays":"","posted":"","desc":"","artwork":""}]`;

  try {
    const { labsSearch } = await import('../services/aiService.js');
    const { content, tokens } = await labsSearch(prompt);
    _tokensIn  = tokens.inputTokens;
    _tokensOut = tokens.outputTokens;
    _cost      = tokens.cost;
    const raw  = (content || []).filter(b => b.type==='text').map(b => b.text).join('');
    const clean = raw.replace(/```json|```/g,'').trim();
    const s = clean.indexOf('['), e = clean.lastIndexOf(']');
    if (s === -1 || e === -1) throw new Error('No JSON array');
    _results  = JSON.parse(clean.slice(s, e + 1));
    _scanning = false;
    if (!_results.length) toast('No tracks found — try a different keyword.', 'warning');
    renderTool();
  } catch (err) {
    console.error(err);
    _scanning = false;
    toast('Scan failed — check console.', 'error');
    renderTool();
  }
}

function escHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

registerModule('experimental', { render });
