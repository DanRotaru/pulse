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
  ram: { usedGB: 11.2, totalGB: 16 },
  cpu: { pct: 38, cores: 8, threads: 16 },
  topCpu: [
    { name: 'chrome.exe', pct: 22 },
    { name: 'Code.exe', pct: 14 },
  ],
  topRam: [
    { name: 'Code.exe', gb: 2.4 },
    { name: 'chrome.exe', gb: 1.8 },
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
onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1>System Dashboard</h1>
      <button class="time" type="button" @click="toggleSeconds">{{ clock }}</button>
    </header>

    <!-- 1 & 2. Claude + Codex usage as two 50% cards -->
    <div class="grid">
      <!-- Claude -->
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

      <!-- Codex -->
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
    </div>

    <!-- 3 & 4. RAM / CPU -->
    <div class="grid">
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
      </div>

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
      </div>
    </div>

    <!-- 5. Top 3 CPU processes -->
    <section class="proc-card">
      <div class="proc-head">
        <div class="proc-icon" style="background: #eaf1ff; color: var(--cpu)">⚡</div>
        <span class="proc-title">Top CPU processes</span>
      </div>
      <ul class="proc-list">
        <li v-for="p in data.topCpu" :key="p.name">
          <span class="proc-name">{{ p.name }}</span>
          <span class="proc-val" style="color: var(--cpu)">{{ p.pct }}%</span>
        </li>
      </ul>
    </section>

    <!-- 6. Top 3 RAM processes -->
    <section class="proc-card">
      <div class="proc-head">
        <div class="proc-icon" style="background: #e7f7ef; color: var(--ram)">▣</div>
        <span class="proc-title">Top RAM processes</span>
      </div>
      <ul class="proc-list">
        <li v-for="p in data.topRam" :key="p.name">
          <span class="proc-name">{{ p.name }}</span>
          <span class="proc-val" style="color: var(--ram)">{{ p.gb }} GB</span>
        </li>
      </ul>
    </section>
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

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: stretch;
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
}

/* Top process cards (top 3 each) */
.proc-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px 14px;
}
.proc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.proc-icon {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.proc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}
.proc-list {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.proc-list li {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 7px 9px;
  border-radius: 9px;
  background: var(--track);
}
.proc-name {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.proc-val {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex: none;
}
</style>
