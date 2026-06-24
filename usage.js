import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Claude + Codex rate-limit usage. Both are account-wide and fetched live from
// the providers' OAuth usage endpoints using the locally logged-in tokens:
//   - Claude Code does NOT persist rate-limit usage in its session JSONL logs
//     (those only carry per-message token counts), so it must be fetched live.
//   - Codex rate limits are account-wide; the live API stays accurate even when
//     Codex hasn't run in a while. We fall back to scanning the local session
//     logs only when the live API is unreachable.
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

const CODEX_SCAN_CAP = 300;

export function emptyUsage(agent, error = null) {
  return {
    agent,
    plan: null,
    primary: { usedPercent: null, windowMinutes: 300, resetsAt: null },
    secondary: { usedPercent: null, windowMinutes: 10080, resetsAt: null },
    updatedAt: null,
    source: null,
    error,
  };
}

function normalizePercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function readLimitPercent(limit) {
  return limit?.used_percent ?? limit?.used_percentage ?? limit?.usedPercent ?? limit?.usedPercentage;
}

function readWindowMinutes(limit, fallback) {
  return Number(limit?.window_minutes ?? limit?.windowMinutes) || fallback;
}

function readResetsAt(limit) {
  const n = Number(limit?.resets_at ?? limit?.resetsAt);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Codex stores resets_at as Unix *seconds*; normalize everything to milliseconds.
  return n < 1e12 ? n * 1000 : n;
}

function usageFromRateLimits(agent, filePath, timestamp, rateLimits) {
  return {
    agent,
    plan: rateLimits?.plan_type || null,
    primary: {
      usedPercent: normalizePercent(readLimitPercent(rateLimits?.primary)),
      windowMinutes: readWindowMinutes(rateLimits?.primary, 300),
      resetsAt: readResetsAt(rateLimits?.primary),
    },
    secondary: {
      usedPercent: normalizePercent(readLimitPercent(rateLimits?.secondary)),
      windowMinutes: readWindowMinutes(rateLimits?.secondary, 10080),
      resetsAt: readResetsAt(rateLimits?.secondary),
    },
    updatedAt: timestamp ? Date.parse(timestamp) || null : null,
    source: filePath,
    error: null,
  };
}

// --- Codex -----------------------------------------------------------------

async function readCodexAuth() {
  const path = join(homedir(), '.codex', 'auth.json');
  let raw;
  try { raw = await fsp.readFile(path, 'utf8'); } catch { return null; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const tokens = parsed?.tokens || {};
  if (!tokens.access_token) return null;
  return {
    path,
    parsed,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    accountId: tokens.account_id || null,
  };
}

// Exchange the refresh token for a fresh access token and persist it back to
// auth.json (mirroring the Codex CLI), so usage keeps working across long idle
// periods. Returns the new access token or null on failure.
async function refreshCodexToken(auth) {
  if (!auth?.refreshToken) return null;
  let res;
  try {
    res = await fetch(CODEX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CODEX_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        scope: 'openid profile email',
      }),
    });
  } catch { return null; }
  if (!res.ok) return null;
  let json;
  try { json = await res.json(); } catch { return null; }
  if (!json?.access_token) return null;

  const updated = {
    ...auth.parsed,
    tokens: {
      ...auth.parsed.tokens,
      access_token: json.access_token,
      id_token: json.id_token || auth.parsed.tokens?.id_token,
      refresh_token: json.refresh_token || auth.refreshToken,
    },
    last_refresh: new Date().toISOString(),
  };
  try { await fsp.writeFile(auth.path, JSON.stringify(updated, null, 2)); } catch { /* non-fatal */ }
  auth.parsed = updated;
  auth.accessToken = json.access_token;
  auth.refreshToken = updated.tokens.refresh_token;
  return json.access_token;
}

async function fetchCodexUsageJson(auth, token) {
  const headers = { Authorization: `Bearer ${token}` };
  if (auth.accountId) headers['chatgpt-account-id'] = auth.accountId;
  return fetch(CODEX_USAGE_URL, { headers });
}

function codexWindowFromApi(win, fallbackMinutes) {
  return {
    usedPercent: normalizePercent(win?.used_percent),
    windowMinutes: Number(win?.limit_window_seconds)
      ? Math.round(win.limit_window_seconds / 60)
      : fallbackMinutes,
    resetsAt: readResetsAt({ resets_at: win?.reset_at }),
  };
}

// Fetch account-wide Codex usage from the ChatGPT backend. Returns a usage object
// on success, or null if the API is unreachable (so the caller can fall back to
// scanning the local session logs).
async function getCodexUsageFromApi() {
  const auth = await readCodexAuth();
  if (!auth) return null;

  let res;
  try { res = await fetchCodexUsageJson(auth, auth.accessToken); } catch { return null; }

  // Token expired after a long idle period — refresh once and retry.
  if (res.status === 401) {
    const fresh = await refreshCodexToken(auth);
    if (!fresh) return null;
    try { res = await fetchCodexUsageJson(auth, fresh); } catch { return null; }
  }
  if (!res.ok) return null;

  let json;
  try { json = await res.json(); } catch { return null; }
  const rl = json?.rate_limit;
  if (!rl) return null;

  return {
    agent: 'codex',
    plan: json?.plan_type || null,
    primary: codexWindowFromApi(rl.primary_window, 300),
    secondary: codexWindowFromApi(rl.secondary_window, 10080),
    updatedAt: Date.now(),
    source: CODEX_USAGE_URL,
    error: null,
  };
}

// Walk ~/.codex/sessions/<year>/<month>/<day>/rollout-*.jsonl newest-first.
async function findCodexSessionFiles() {
  const sessionsRoot = join(homedir(), '.codex', 'sessions');
  const candidates = [];
  let years;
  try { years = await fsp.readdir(sessionsRoot); } catch { return []; }
  years.sort((a, b) => b.localeCompare(a));

  outer: for (const y of years) {
    let months;
    try { months = await fsp.readdir(join(sessionsRoot, y)); } catch { continue; }
    months.sort((a, b) => b.localeCompare(a));
    for (const m of months) {
      let days;
      try { days = await fsp.readdir(join(sessionsRoot, y, m)); } catch { continue; }
      days.sort((a, b) => b.localeCompare(a));
      for (const d of days) {
        let files;
        try { files = await fsp.readdir(join(sessionsRoot, y, m, d)); } catch { continue; }
        files.sort((a, b) => b.localeCompare(a));
        for (const f of files) {
          if (!f.startsWith('rollout-') || !f.endsWith('.jsonl')) continue;
          const path = join(sessionsRoot, y, m, d, f);
          try {
            const stat = await fsp.stat(path);
            candidates.push({ path, mtime: stat.mtimeMs });
            if (candidates.length >= CODEX_SCAN_CAP) break outer;
          } catch { /* ignore */ }
        }
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates;
}

export async function getCodexUsage() {
  const live = await getCodexUsageFromApi();
  if (live) return live;

  // Fall back to the local session logs when the live API is unavailable.
  const candidates = await findCodexSessionFiles();
  for (const c of candidates.slice(0, 100)) {
    let text;
    try { text = await fsp.readFile(c.path, 'utf8'); } catch { continue; }
    let latest = null;
    for (const line of text.split('\n')) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (
          entry.type === 'event_msg' &&
          entry.payload?.type === 'token_count' &&
          entry.payload.rate_limits
        ) {
          latest = usageFromRateLimits('codex', c.path, entry.timestamp, entry.payload.rate_limits);
        }
      } catch { /* ignore malformed log lines */ }
    }
    if (latest) return latest;
  }
  return emptyUsage('codex', 'No Codex rate-limit usage found');
}

// --- Claude ----------------------------------------------------------------

async function readClaudeOAuth() {
  const path = join(homedir(), '.claude', '.credentials.json');
  let raw;
  try { raw = await fsp.readFile(path, 'utf8'); } catch { return {}; }
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth || {};
    return { token: oauth.accessToken || null, plan: oauth.subscriptionType || null };
  } catch { return {}; }
}

function claudeWindowFromApi(win, fallbackMinutes) {
  const resetsAtMs = win?.resets_at ? Date.parse(win.resets_at) : NaN;
  return {
    usedPercent: normalizePercent(win?.utilization),
    windowMinutes: fallbackMinutes,
    resetsAt: Number.isFinite(resetsAtMs) ? resetsAtMs : null,
  };
}

export async function getClaudeUsage() {
  const { token, plan } = await readClaudeOAuth();
  if (!token) {
    return emptyUsage('claude', 'Sign in to Claude to see usage (no OAuth token found)');
  }

  let res;
  try {
    res = await fetch(CLAUDE_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.1.34',
      },
    });
  } catch (err) {
    return emptyUsage('claude', `Failed to reach Claude usage API: ${err?.message || err}`);
  }

  if (!res.ok) {
    return emptyUsage('claude', `Claude usage API returned ${res.status}`);
  }

  let json;
  try { json = await res.json(); } catch {
    return emptyUsage('claude', 'Claude usage API returned invalid JSON');
  }

  // The endpoint has been observed returning the windows at the top level; some
  // responses nest them under `data`. Accept either shape.
  const data = json?.data || json;
  const fiveHour = data?.five_hour;
  const sevenDay = data?.seven_day;
  if (!fiveHour && !sevenDay) {
    return emptyUsage('claude', 'Claude usage API response missing usage windows');
  }

  return {
    agent: 'claude',
    plan,
    primary: claudeWindowFromApi(fiveHour, 300),
    secondary: claudeWindowFromApi(sevenDay, 10080),
    updatedAt: Date.now(),
    source: CLAUDE_USAGE_URL,
    error: null,
  };
}

// Fetch both agents' usage at once (for the periodic broadcast / one-shot API).
export async function collectUsage() {
  const [claude, codex] = await Promise.all([
    getClaudeUsage().catch((err) => emptyUsage('claude', err?.message || String(err))),
    getCodexUsage().catch((err) => emptyUsage('codex', err?.message || String(err))),
  ]);
  return { updated: new Date().toISOString(), claude, codex };
}
