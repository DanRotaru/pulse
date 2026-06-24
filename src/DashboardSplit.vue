<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  authPassword: {
    type: String,
    required: true,
  },
})

/*
 * MOCK DATA — single source of truth for the UI.
 * Replace this ref's contents from a backend later; the template is fully reactive.
 */
const data = ref({
  claude: {
    plan: 'Team',
    fiveHour: { pct: 43, reset: '2h 41m' },
    weekly: { pct: 71, reset: '4d 6h', note: '12% reserve' },
  },
  codex: {
    plan: 'Team',
    fiveHour: { pct: 2, reset: '1h 58m' },
    weekly: { pct: 62, reset: '16h 36m', note: '28% reserve' },
  },
  lastBootTime: '—',
  ram: { usedGB: 11.2, totalGB: 16 },
  cpu: { pct: 38, cores: 8, threads: 16 },
  topCpu: [
  ],
  topRam: [
  ],
})

const ramPct = computed(() =>
  data.value.ram.usedPercent ??
  Math.round((data.value.ram.usedGB / data.value.ram.totalGB) * 100),
)

// --- Live system metrics via Server-Sent Events ---
// The Express server broadcasts a `stats` event every ~2s on /sse.
const connected = ref(false)
let es = null

function formatBootTime(seconds) {
  const total = Math.floor(seconds || 0)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function applyStats(s) {
  // CPU / RAM gauges + top-process lists. The server sends `top: [{name, value}]`;
  // map `value` onto the field each list renders (pct for CPU, gb for RAM).
  data.value.cpu = {
    pct: s.cpu.usedPercent,
    cores: s.cpu.cores,
    threads: s.cpu.threads,
  }
  data.value.ram = {
    usedGB: s.ram.usedGB,
    totalGB: s.ram.totalGB,
    usedPercent: s.ram.usedPercent,
  }
  data.value.topCpu = s.cpu.top.map((p) => ({ name: p.name, pct: p.value }))
  data.value.topRam = s.ram.top.map((p) => ({ name: p.name, gb: p.value }))
  data.value.lastBootTime = formatBootTime(s.uptimeSeconds)
}

// --- Claude / Codex usage ---
// The server fetches account-wide usage (5-hour + weekly windows) from the
// Claude/Codex OAuth APIs and broadcasts it on the SSE `usage` event every 5m.
// Clicking a usage card forces an immediate single-agent refresh.

// Compact duration like "5h", "5d 6h", "12m" — matches the mock's reset labels.
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  return `${Math.max(1, mins)}m`
}

// "How much of the window is still in reserve" — compares elapsed time against
// usage. Positive = pacing under budget, negative = burning faster than the clock.
function reserveNote(win) {
  const used = win?.usedPercent
  if (used === null || used === undefined || !win?.resetsAt || !win?.windowMinutes) return ''
  const windowMs = win.windowMinutes * 60000
  const startMs = win.resetsAt - windowMs
  const elapsed = Math.max(0, Math.min(1, (Date.now() - startMs) / windowMs))
  if (elapsed <= 0) return ''
  const reserve = Math.round(elapsed * 100 - used)
  if (reserve > 0) return `${reserve}% reserve`
  if (reserve < 0) return `${Math.abs(reserve)}% over`
  return 'on pace'
}

// Map one server usage object → the {plan, fiveHour, weekly} shape the template renders.
function toAgentView(u) {
  return {
    plan: u?.plan ?? '—',
    fiveHour: {
      pct: Math.round(u?.primary?.usedPercent ?? 0),
      reset: formatDuration(u?.primary?.resetsAt - Date.now()) ?? '—',
    },
    weekly: {
      pct: Math.round(u?.secondary?.usedPercent ?? 0),
      reset: formatDuration(u?.secondary?.resetsAt - Date.now()) ?? '—',
      note: reserveNote(u?.secondary),
    },
  }
}

function applyUsage(payload) {
  if (payload?.claude) data.value.claude = toAgentView(payload.claude)
  if (payload?.codex) data.value.codex = toAgentView(payload.codex)
}

// Per-agent in-flight flag so the card can show it is refreshing.
const loading = ref({ claude: false, codex: false })

function authHeaders() {
  return { 'x-dashboard-password': props.authPassword }
}

// A blank view shown while a refresh is in flight — clears stale numbers so it is
// obvious a fresh fetch is happening rather than the old values lingering.
function loadingView() {
  return {
    plan: '—',
    fiveHour: { pct: 0, reset: '…' },
    weekly: { pct: 0, reset: '…', note: '' },
  }
}

// Force-refresh a single agent (on card click). The server also re-broadcasts the
// updated usage over SSE, but we apply the response directly for instant feedback.
async function refreshUsage(agent) {
  if (loading.value[agent]) return // ignore re-clicks while a fetch is in flight
  loading.value[agent] = true
  data.value[agent] = loadingView() // clear stale data before the request
  try {
    const res = await fetch(`/api/usage/${agent}`, { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data.value[agent] = toAgentView(await res.json())
  } catch (err) {
    console.error(`Failed to refresh ${agent} usage:`, err)
    data.value[agent] = { ...loadingView(), fiveHour: { pct: 0, reset: 'error' } }
  } finally {
    loading.value[agent] = false
  }
}

const clock = ref('')
const showSeconds = ref(false)
let timer
function tick() {
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false }
  if (showSeconds.value) opts.second = '2-digit'
  clock.value = 'Updated ' + new Date().toLocaleTimeString([], opts)
}
function toggleSeconds() {
  showSeconds.value = !showSeconds.value
  tick()
}

// Tapping the title toggles fullscreen. Uses the standard Fullscreen API with a
// webkit fallback for older Safari/iOS.
function toggleFullscreen() {
  const el = document.documentElement
  const isFull = document.fullscreenElement || document.webkitFullscreenElement
  if (isFull) {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
  }
}

// Stopwatch timer
const timerSeconds = ref(0)
const timerRunning = ref(false)
const timerDisplay = computed(() => {
  const total = timerSeconds.value
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (total < 60) return `${s}s`
  if (h === 0) return `${m}m ${s}s`
  return `${h}h ${m}m ${s}s`
})
function toggleTimer() {
  timerRunning.value = !timerRunning.value
}
function resetTimer() {
  timerRunning.value = false
  timerSeconds.value = 0
}

// Tap = play/pause, hold 1s = reset (with top progress bar)
const HOLD_MS = 1000
const holdProgress = ref(0)
let holdRaf = null
let holdStart = 0
let holdFired = false

function startHold() {
  holdFired = false
  holdStart = performance.now()
  const step = (now) => {
    const p = Math.min((now - holdStart) / HOLD_MS, 1)
    holdProgress.value = p
    if (p >= 1) {
      holdFired = true
      resetTimer()
      holdProgress.value = 0
      holdRaf = null
      return
    }
    holdRaf = requestAnimationFrame(step)
  }
  holdRaf = requestAnimationFrame(step)
}
function endHold() {
  if (holdRaf) {
    cancelAnimationFrame(holdRaf)
    holdRaf = null
  }
  holdProgress.value = 0
  if (!holdFired) toggleTimer() // short press → play/pause
  holdFired = false
}
function cancelHold() {
  if (holdRaf) {
    cancelAnimationFrame(holdRaf)
    holdRaf = null
  }
  holdProgress.value = 0
  holdFired = false
}

function connectSSE() {
  es = new EventSource('/sse')
  es.addEventListener('open', () => (connected.value = true))
  es.addEventListener('error', () => (connected.value = false))
  es.addEventListener('stats', (e) => {
    connected.value = true
    try {
      applyStats(JSON.parse(e.data))
    } catch (err) {
      console.error('Bad stats payload:', err)
    }
  })
  es.addEventListener('usage', (e) => {
    try {
      applyUsage(JSON.parse(e.data))
    } catch (err) {
      console.error('Bad usage payload:', err)
    }
  })
}

// Pull the current usage snapshot once on load so the cards show real data
// immediately instead of waiting for the next 5-minute SSE broadcast.
async function loadUsage() {
  try {
    const res = await fetch('/api/usage', { headers: authHeaders() })
    if (res.ok) applyUsage(await res.json())
  } catch (err) {
    console.error('Failed to load usage:', err)
  }
}

onMounted(() => {
  tick()
  timer = setInterval(() => {
    tick()
    if (timerRunning.value) timerSeconds.value++
  }, 1000)
  connectSSE()
  loadUsage()
})
onUnmounted(() => {
  clearInterval(timer)
  if (holdRaf) cancelAnimationFrame(holdRaf)
  if (es) es.close()
})
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1 @click="toggleFullscreen" title="Toggle fullscreen">Dan's System Dashboard</h1>
      <button class="time" type="button" @click="toggleSeconds">
        <span class="live" :class="{ on: connected }" :title="connected ? 'Live' : 'Disconnected'" />
        {{ clock }}
      </button>
    </header>

    <div class="board">
      <div class="usage-group">
      <!-- 1. Claude -->
      <section class="card usage" :class="{ loading: loading.claude }">
        <div class="card-top" @click="refreshUsage('claude')">
          <div class="card-title">
            <svg width="16px" height="16px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="hsl(14.8, 63.1%, 59.6%)">
              <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"/>
            </svg>

            <h2>Claude</h2>
            <span v-if="loading.claude" class="spinner" />
          </div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span class="meter-label">5-hour</span>
            <span class="meter-pct">{{ data.claude.fiveHour.pct }}%</span>
          </div>
          <div class="bar">
            <span :style="{ width: data.claude.fiveHour.pct + '%', background: 'var(--claude)' }" />
          </div>
          <div class="meter-reset">Resets in {{ data.claude.fiveHour.reset }}</div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span class="meter-label">Weekly</span>
            <span class="meter-pct">{{ data.claude.weekly.pct }}%</span>
          </div>
          <div class="bar">
            <span :style="{ width: data.claude.weekly.pct + '%', background: 'var(--claude)' }" />
          </div>
          <div class="meter-reset">
            {{ data.claude.weekly.reset }} · {{ data.claude.weekly.note }}
          </div>
        </div>
      </section>

      <!-- 2. Codex -->
      <section class="card usage" :class="{ loading: loading.codex }">
        <div class="card-top" @click="refreshUsage('codex')">
          <div class="card-title">
            <svg viewBox="0 0 24 24" width="24px" height="24px" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19.503 0H4.496A4.496 4.496 0 000 4.496v15.007A4.496 4.496 0 004.496 24h15.007A4.496 4.496 0 0024 19.503V4.496A4.496 4.496 0 0019.503 0z"
                fill="#fff"/>
              <path
                d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z"
                fill="url(#lobe-icons-codex-_R_0_)"/>
              <defs>
                <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-codex-_R_0_" x1="12" x2="12" y1="3"
                                y2="21">
                  <stop stop-color="#B1A7FF"/>
                  <stop offset=".5" stop-color="#7A9DFF"/>
                  <stop offset="1" stop-color="#3941FF"/>
                </linearGradient>
              </defs>
            </svg>

            <h2>Codex</h2>
            <span v-if="loading.codex" class="spinner" />
          </div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span class="meter-label">5-hour</span>
            <span class="meter-pct">{{ data.codex.fiveHour.pct }}%</span>
          </div>
          <div class="bar">
            <span :style="{ width: data.codex.fiveHour.pct + '%', background: 'var(--codex)' }" />
          </div>
          <div class="meter-reset">Resets in {{ data.codex.fiveHour.reset }}</div>
        </div>

        <div class="meter">
          <div class="meter-head">
            <span class="meter-label">Weekly</span>
            <span class="meter-pct">{{ data.codex.weekly.pct }}%</span>
          </div>
          <div class="bar">
            <span :style="{ width: data.codex.weekly.pct + '%', background: 'var(--codex)' }" />
          </div>
          <div class="meter-reset">
            {{ data.codex.weekly.reset }} · {{ data.codex.weekly.note }}
          </div>
        </div>
      </section>

      <!-- Last boot time -->
      <section class="card today">
        <span class="today-label">Last boot time</span>
        <span class="today-val">{{ data.lastBootTime }}</span>
      </section>

      <!-- Stopwatch timer: tap card = play/pause, hold 2s = reset -->
      <section
        class="card timer"
        :class="{ running: timerRunning }"
        role="button"
        tabindex="0"
        :aria-label="timerRunning ? 'Pause (hold to reset)' : 'Play (hold to reset)'"
        @pointerdown.prevent="startHold"
        @pointerup="endHold"
        @pointerleave="cancelHold"
        @contextmenu.prevent
      >
        <div class="timer-progress" :style="{ width: holdProgress * 100 + '%' }" />
        <div class="timer-val">{{ timerDisplay }}</div>
      </section>
      </div>

      <!-- 3 & 5. CPU + its top processes -->
      <div class="stat">
        <div class="stat-head">
          <span class="stat-label">CPU</span>
          <span class="dot" style="background: var(--cpu)" />
        </div>
        <div class="stat-value">{{ data.cpu.pct }}<small> %</small></div>
        <div class="bar">
          <span :style="{ width: data.cpu.pct + '%', background: 'var(--cpu)' }" />
        </div>
        <div class="stat-sub">{{ data.cpu.cores }} cores · {{ data.cpu.threads }} threads</div>
        <ul class="proc-list">
          <li v-for="p in data.topCpu" :key="p.name">
            <span class="proc-name" :title="p.name">{{ p.name }}</span>
            <span class="proc-val" style="color: var(--cpu)">{{ p.pct }}%</span>
          </li>
        </ul>
      </div>

      <!-- 4 & 6. RAM + its top processes -->
      <div class="stat">
        <div class="stat-head">
          <span class="stat-label">RAM</span>
          <span class="dot" style="background: var(--ram)" />
        </div>
        <div class="stat-value">
          {{ data.ram.usedGB }}<small> / {{ data.ram.totalGB }} GB</small>
        </div>
        <div class="bar">
          <span :style="{ width: ramPct + '%', background: 'var(--ram)' }" />
        </div>
        <div class="stat-sub">{{ ramPct }}% used</div>
        <ul class="proc-list">
          <li v-for="p in data.topRam" :key="p.name">
            <span class="proc-name" :title="p.name">{{ p.name }}</span>
            <span class="proc-val" style="color: var(--ram)">{{ p.gb }} GB</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen {
  height: 100%;
  max-width: 440px;
  margin: 0 auto;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Landscape: use the full width and lay cards out in 4 columns */
@media (orientation: landscape) {
  .screen {
    max-width: 1100px;
  }
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h1 {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.2px;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.head .time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  /* reset button chrome — render as plain tappable text */
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  font-family: inherit;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}
.live {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #c9ccd1;
  transition: background 0.3s ease;
  display: none;
}
.live.on {
  /*display: block;*/
}

/* Card board: stacked in portrait, 4 columns in landscape (Claude | Codex | CPU | RAM) */
.board {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  align-items: start;
}
@media (orientation: landscape) {
  .board {
    grid-template-columns: 150px 150px 140px 140px;
  }
}

/* Claude + Codex side by side, with the today / timer cards beneath them */
.usage-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-content: start;
  min-width: 0;
}
@media (orientation: landscape) {
  .usage-group {
    grid-column: span 2;
  }
}

/* Screen-on-today card (compact) */
.today {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 10px 13px;
}

@media (orientation: landscape) {
  .today {
    width: 120px;
  }
}

.today-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.today-val {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

/* Stopwatch timer card — whole card is the control (tap = play/pause, hold = reset) */
.timer {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 13px;
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

@media (orientation: landscape) {
  .timer {
    position: relative;
    left: -30px;
    width: calc(100% + 30px);
  }
}

.timer:focus,
.timer:focus-visible {
  outline: none;
  background: var(--card);
}

.timer:hover {
  background-color: var(--track);
}

/* Hold-to-reset progress bar across the top of the card */
.timer-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  width: 0;
  background: var(--ram);
  border-top-left-radius: 16px;
}
.timer-val {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
  position: relative;
  top: -5px;
}

/* Usage cards (compact, side by side) */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 13px 13px;
}
.usage {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.card-title h2 {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
}

/* Refreshing state — dim the card's numbers and show a small spinner */
.usage.loading .meter {
  opacity: 0.45;
  transition: opacity 0.2s ease;
}
.spinner {
  width: 12px;
  height: 12px;
  margin-left: auto;
  border: 2px solid var(--track);
  border-top-color: var(--muted);
  border-radius: 50%;
  flex: none;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.meter-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 5px;
}
.meter-label {
  font-size: 16px;
  font-weight: 600;
}
.meter-pct {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.meter-reset {
  font-size: 12px;
  color: var(--muted);
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}
.bar > span {
  display: block;
  height: 100%;
  border-radius: 999px;
  min-width: 8px;
  transition: width 0.4s ease;
}

/* System stats */
.stat {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}


@media (orientation: landscape) {
  .stat {
    width: 140px;

  }
}


.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}
.stat-value small {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.stat-sub {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

/* Top processes — inline list inside the CPU / RAM cards */
.proc-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}
.proc-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 5px;
  min-width: 0;
}
.proc-name {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.proc-val {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex: none;
}
</style>
