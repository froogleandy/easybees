// services/aiService.js
// Single Anthropic API client. All AI calls route through here.
// Handles: key management, model selection, token tracking, error normalisation.

import { dataService } from '../dataService.js';

// ── Models ──────────────────────────────────────────────────────────────────
export const AI_MODELS = {
  FAST:    'claude-haiku-4-5-20251001',      // quick structured tasks
  DEFAULT: 'claude-sonnet-4-6',              // general purpose
  SMART:   'claude-opus-4-6',               // heavy reasoning / call analysis
};

// ── Token cost per million tokens (USD) ─────────────────────────────────────
const COST_PER_M = {
  [AI_MODELS.FAST]:    { in: 0.25,  out: 1.25  },
  [AI_MODELS.DEFAULT]: { in: 3.00,  out: 15.00 },
  [AI_MODELS.SMART]:   { in: 15.00, out: 75.00 },
};

// ── Session token accumulator ────────────────────────────────────────────────
let _session = { inputTokens: 0, outputTokens: 0, cost: 0 };

export function getSessionUsage() { return { ..._session }; }
export function resetSessionUsage() { _session = { inputTokens: 0, outputTokens: 0, cost: 0 }; }

function trackUsage(model, usage = {}) {
  const rates = COST_PER_M[model] ?? COST_PER_M[AI_MODELS.DEFAULT];
  const inp   = usage.input_tokens  || 0;
  const out   = usage.output_tokens || 0;
  const cost  = (inp * rates.in + out * rates.out) / 1_000_000;
  _session.inputTokens  += inp;
  _session.outputTokens += out;
  _session.cost         += cost;
  _updateTokenWidget(inp, out, cost);
  return { inputTokens: inp, outputTokens: out, cost };
}

function _updateTokenWidget(inp, out, cost) {
  const el = document.getElementById('token-tracker');
  if (!el) return;
  el.classList.remove('hidden');
  const fmt = n => n.toLocaleString();
  const c   = n => `$${n.toFixed(4)}`;
  document.getElementById('tt-last')?.  setAttribute('data-val', `${fmt(inp)} / ${fmt(out)}`);
  document.getElementById('tt-cost')?.  setAttribute('data-val', c(cost));
  document.getElementById('tt-total')?.setAttribute('data-val', c(_session.cost));
  // Simple live update
  const last  = document.getElementById('tt-last');
  const costEl= document.getElementById('tt-cost');
  const total = document.getElementById('tt-total');
  if (last)  last.textContent  = `${fmt(inp)} / ${fmt(out)}`;
  if (costEl)costEl.textContent = c(cost);
  if (total) total.textContent  = c(_session.cost);
}

// ── Core request ─────────────────────────────────────────────────────────────
/**
 * send({ model?, messages, system?, tools?, max_tokens?, stream? })
 * Returns { content, usage, tokens }
 */
export async function send({
  model      = AI_MODELS.DEFAULT,
  messages,
  system,
  tools,
  max_tokens = 2000,
}) {
  const apiKey = dataService.getSettings().claudeApiKey;
  if (!apiKey) throw new AIError('no_key', 'No Anthropic API key configured. Add one in Profile → Connected Accounts.');

  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  if (tools)  body.tools  = tools;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new AIError(err.error?.type || 'api_error', err.error?.message || `HTTP ${res.status}`);
  }

  const data   = await res.json();
  const tokens = trackUsage(model, data.usage);
  return { content: data.content, usage: data.usage, tokens };
}

// ── Convenience: extract first text block ────────────────────────────────────
export function textFrom(content = []) {
  return content.find(b => b.type === 'text')?.text || '';
}

// ── Convenience: JSON from text block ────────────────────────────────────────
export function jsonFrom(content = []) {
  const raw = textFrom(content).replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

// ── High-level tasks ─────────────────────────────────────────────────────────

/**
 * Analyse a call audio/transcript and extract structured data.
 * @param {string} audioBase64 - base64 encoded audio
 * @param {string} mime        - audio mime type
 */
export async function analyseCall(audioBase64, mime = 'audio/webm') {
  const { content, tokens } = await send({
    model:      AI_MODELS.SMART,
    max_tokens: 2500,
    messages: [{
      role: 'user',
      content: [
        {
          type:   'document',
          source: { type: 'base64', media_type: mime, data: audioBase64 },
        },
        {
          type: 'text',
          text: `You are analysing a music business call recording.
Return ONLY valid JSON (no markdown) with this exact shape:
{
  "transcript": "full verbatim transcript",
  "summary": "2-3 sentence summary",
  "name": "person's name if mentioned",
  "jobTitle": "their job title if mentioned",
  "commitments": ["array of commitments made"],
  "dates": ["array of dates/deadlines mentioned"],
  "amounts": ["array of dollar amounts mentioned"],
  "suggestedTasks": [
    { "title": "task title", "priority": "low|medium|high", "due": "YYYY-MM-DD or empty" }
  ],
  "suggestedGig": {
    "name": "gig name or empty",
    "type": "event type or empty",
    "date": "YYYY-MM-DD or empty",
    "rate": 0
  }
}`,
        },
      ],
    }],
  });
  return { data: jsonFrom(content), tokens };
}

/**
 * Scan a receipt image and extract amount, date, vendor.
 * @param {string} base64 - base64 image data
 * @param {string} mime   - image mime type
 */
export async function scanReceipt(base64, mime = 'image/jpeg') {
  const { content, tokens } = await send({
    model:      AI_MODELS.DEFAULT,
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
        { type: 'text',  text: 'Extract from this receipt: grand total (number only), date (YYYY-MM-DD), store/vendor name. Return ONLY valid JSON: {"amount":"X","date":"Y","vendor":"Z"}. Use empty string if not found.' },
      ],
    }],
  });
  return { result: jsonFrom(content), tokens };
}

/**
 * Web-search powered Labs research query.
 * @param {string} prompt - user query
 */
export async function labsSearch(prompt) {
  const body = {
    model:      AI_MODELS.DEFAULT,
    max_tokens: 2000,
    messages:   [{ role: 'user', content: prompt }],
    tools:      [{ type: 'web_search_20250305', name: 'web_search' }],
  };

  const apiKey = dataService.getSettings().claudeApiKey;
  if (!apiKey) throw new AIError('no_key', 'No Anthropic API key set.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new AIError(err.error?.type || 'api_error', err.error?.message || `HTTP ${res.status}`);
  }

  const data   = await res.json();
  const tokens = trackUsage(AI_MODELS.DEFAULT, data.usage);
  return { content: data.content, tokens };
}

// ── Error class ──────────────────────────────────────────────────────────────
export class AIError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'AIError';
  }
}
