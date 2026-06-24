<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

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
  screenOnToday: '5h 23m',
  ram: { usedGB: 11.2, totalGB: 16 },
  cpu: { pct: 38, cores: 8, threads: 16 },
  topCpu: [
    { name: 'chrome.exe', pct: 22 },
    { name: 'Code.exe', pct: 14 },
    { name: 'node.exe', pct: 9 },
    { name: 'slack.exe', pct: 5 },
    { name: 'Teams.exe', pct: 3 },
  ],
  topRam: [
    { name: 'Code.exe', gb: 2.4 },
    { name: 'chrome.exe', gb: 1.8 },
    { name: 'Docker Desktop.exe', gb: 1.1 },
    { name: 'slack.exe', gb: 0.9 },
    { name: 'Teams.exe', gb: 0.7 },
  ],
})

const ramPct = computed(() =>
  Math.round((data.value.ram.usedGB / data.value.ram.totalGB) * 100),
)

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

onMounted(() => {
  tick()
  timer = setInterval(() => {
    tick()
    if (timerRunning.value) timerSeconds.value++
  }, 1000)
})
onUnmounted(() => {
  clearInterval(timer)
  if (holdRaf) cancelAnimationFrame(holdRaf)
})
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1>Dan's System Dashboard</h1>
      <button class="time" type="button" @click="toggleSeconds">{{ clock }}</button>
    </header>

    <div class="board">
      <div class="usage-group">
      <!-- 1. Claude -->
      <section class="card usage">
        <div class="card-top">
          <div class="card-title">
            <span class="dot" style="background: var(--claude)" />
            <h2>Claude</h2>
          </div>
          <span class="badge">{{ data.claude.plan }}</span>
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
      <section class="card usage">
        <div class="card-top">
          <div class="card-title">
            <span class="dot" style="background: var(--codex)" />
            <h2>Codex</h2>
          </div>
          <span class="badge">{{ data.codex.plan }}</span>
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

      <!-- Screen on time today -->
      <section class="card today">
        <span class="today-label">Screen on today</span>
        <span class="today-val">{{ data.screenOnToday }}</span>
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
            <span class="proc-name">{{ p.name }}</span>
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
            <span class="proc-name">{{ p.name }}</span>
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
}
.head .time {
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

/* Card board: stacked in portrait, 4 columns in landscape (Claude | Codex | CPU | RAM) */
.board {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  align-items: start;
}
@media (orientation: landscape) {
  .board {
    grid-template-columns: 150px 150px 1fr 1fr;
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
  width: 120px;
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
  position: relative;
  left: -30px;
  width: calc(100% + 30px);
}
.timer:focus,
.timer:focus-visible {
  outline: none;
  background: var(--card);
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
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.card-title h2 {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
}
.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--badge-bg);
  color: var(--badge-text);
  flex: none;
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
  width: 140px;
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
  gap: 8px;
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
