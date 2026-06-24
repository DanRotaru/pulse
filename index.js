import express from 'express';
import SSE from 'express-sse';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectStats } from './stats.js';
import { collectUsage, getClaudeUsage, getCodexUsage, emptyUsage } from './usage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '12345';
const AUTH_COOKIE = 'dash_auth';
// Bind to all network interfaces by default so the dashboard is reachable from
// other devices on the same network (phones, tablets, other PCs on the WiFi).
const host = process.env.HOST || '0.0.0.0';

// Collect non-internal IPv4 addresses so we can print reachable LAN URLs.
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

// SSE instance
const sse = new SSE();

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

function passwordFromRequest(req) {
  return String(req.get('x-dashboard-password') || readCookie(req, AUTH_COOKIE) || '');
}

function isAuthorized(req) {
  return passwordFromRequest(req) === DASHBOARD_PASSWORD;
}

function requireAuth(req, res, next) {
  if (isAuthorized(req)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/api/auth', (req, res) => {
  if (!isAuthorized(req)) {
    res.clearCookie(AUTH_COOKIE);
    return res.status(401).json({ ok: false });
  }

  res.cookie(AUTH_COOKIE, DASHBOARD_PASSWORD, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.delete('/api/auth', (req, res) => {
  res.clearCookie(AUTH_COOKIE, { sameSite: 'strict' });
  res.json({ ok: true });
});

// Static files served from /public
app.use(express.static(join(__dirname, 'public')));

// SSE stream endpoint — clients connect via EventSource('/sse')
app.get('/sse', requireAuth, sse.init);

// One-shot JSON endpoint (handy for debugging / polling clients)
app.get('/api/stats', requireAuth, async (req, res, next) => {
  try {
    res.json(await collectStats());
  } catch (err) {
    next(err);
  }
});

// --- Claude / Codex usage ---------------------------------------------------
// Usage is comparatively expensive (live OAuth API calls) and changes slowly, so
// it is refreshed on a 5-minute cadence rather than alongside the 2s stats. The
// last good snapshot is cached and broadcast over SSE as a separate `usage` event.
let usageCache = null;

// Refresh both agents and push to all connected clients.
async function broadcastUsage() {
  try {
    usageCache = await collectUsage();
    sse.send(usageCache, 'usage');
  } catch (err) {
    console.error('Failed to collect usage:', err.message);
  }
}

// Both agents at once — used for the client's initial load.
app.get('/api/usage', requireAuth, async (req, res, next) => {
  try {
    if (!usageCache) usageCache = await collectUsage();
    res.json(usageCache);
  } catch (err) {
    next(err);
  }
});

// Single agent — triggered when the user clicks the Claude or Codex card. The
// refreshed value is merged into the cache and re-broadcast so every client stays
// in sync, then returned to the caller.
app.get('/api/usage/:agent', requireAuth, async (req, res, next) => {
  const agent = String(req.params.agent || '');
  try {
    let data;
    if (agent === 'claude') data = await getClaudeUsage();
    else if (agent === 'codex') data = await getCodexUsage();
    else return res.status(400).json(emptyUsage(agent, 'usage is available only for codex or claude'));

    usageCache = { ...(usageCache || {}), updated: new Date().toISOString(), [agent]: data };
    sse.send(usageCache, 'usage');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Poll system metrics and broadcast to all connected clients
const INTERVAL_MS = 2000;
async function broadcast() {
  try {
    sse.send(await collectStats(), 'stats');
  } catch (err) {
    console.error('Failed to collect stats:', err.message);
  }
}
setInterval(broadcast, INTERVAL_MS);
broadcast();

// Usage refreshes far less often (slow-moving, expensive to fetch).
const USAGE_INTERVAL_MS = 5 * 60 * 1000;
setInterval(broadcastUsage, USAGE_INTERVAL_MS);
broadcastUsage();

app.listen(port, host, () => {
  console.log(`Server listening on http://localhost:${port}`);
  for (const ip of lanAddresses()) {
    console.log(`  on your network: http://${ip}:${port}`);
  }
});
