<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

/*
 * MOCK DATA — single source of truth for the UI.
 * Replace this ref's contents from a backend later; the template is fully reactive.
 */
const data = ref({
  claude: {
    plan: 'Max',
    fiveHour: { pct: 43, reset: 'Resets in 2h 41m' },
    weekly: { pct: 71, reset: 'Resets in 4d 6h', note: 'Pace: 12% in reserve' },
  },
  codex: {
    plan: 'Team',
    fiveHour: { pct: 2, reset: 'Resets in 1h 58m' },
    weekly: { pct: 62, reset: 'Resets in 16h 36m', note: 'Pace: 28% in reserve' },
  },
  ram: { usedGB: 11.2, totalGB: 16 },
  cpu: { pct: 38, cores: 8, threads: 16 },
  topCpu: { name: 'chrome.exe', pct: 22 },
  topRam: { name: 'Code.exe', gb: 2.4 },
})

const ramPct = computed(() =>
  Math.round((data.value.ram.usedGB / data.value.ram.totalGB) * 100),
)

const clock = ref('')
let timer
function tick() {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  clock.value = 'Updated ' + t
}
onMounted(() => {
  tick()
  timer = setInterval(tick, 30000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="screen">
    <header class="head">
      <h1>System Dashboard</h1>
      <span class="time">{{ clock }}</span>
    </header>

    <!-- 1. Claude usage -->
    <section class="card">
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
          <span class="meter-reset">{{ data.claude.fiveHour.reset }}</span>
        </div>
        <div class="bar">
          <span :style="{ width: data.claude.fiveHour.pct + '%', background: 'var(--claude)' }" />
        </div>
        <div class="meter-foot">
          <span class="meter-pct">{{ data.claude.fiveHour.pct }}% used</span>
        </div>
      </div>

      <div class="meter">
        <div class="meter-head">
          <span class="meter-label">Weekly</span>
          <span class="meter-reset">{{ data.claude.weekly.reset }}</span>
        </div>
        <div class="bar">
          <span :style="{ width: data.claude.weekly.pct + '%', background: 'var(--claude)' }" />
        </div>
        <div class="meter-foot">
          <span class="meter-pct">{{ data.claude.weekly.pct }}% used</span>
          <span class="meter-note">{{ data.claude.weekly.note }}</span>
        </div>
      </div>
    </section>

    <!-- 2. Codex usage -->
    <section class="card">
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
          <span class="meter-reset">{{ data.codex.fiveHour.reset }}</span>
        </div>
        <div class="bar">
          <span :style="{ width: data.codex.fiveHour.pct + '%', background: 'var(--codex)' }" />
        </div>
        <div class="meter-foot">
          <span class="meter-pct">{{ data.codex.fiveHour.pct }}% used</span>
        </div>
      </div>

      <div class="meter">
        <div class="meter-head">
          <span class="meter-label">Weekly</span>
          <span class="meter-reset">{{ data.codex.weekly.reset }}</span>
        </div>
        <div class="bar">
          <span :style="{ width: data.codex.weekly.pct + '%', background: 'var(--codex)' }" />
        </div>
        <div class="meter-foot">
          <span class="meter-pct">{{ data.codex.weekly.pct }}% used</span>
          <span class="meter-note">{{ data.codex.weekly.note }}</span>
        </div>
      </div>
    </section>

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

    <!-- 5. Top CPU process -->
    <div class="proc">
      <div class="proc-icon" style="background: #eaf1ff; color: var(--cpu)">⚡</div>
      <div class="proc-body">
        <div class="proc-label">Top CPU process</div>
        <div class="proc-name">{{ data.topCpu.name }}</div>
      </div>
      <div class="proc-val" style="color: var(--cpu)">{{ data.topCpu.pct }}%</div>
    </div>

    <!-- 6. Top RAM process -->
    <div class="proc">
      <div class="proc-icon" style="background: #e7f7ef; color: var(--ram)">▣</div>
      <div class="proc-body">
        <div class="proc-label">Top RAM process</div>
        <div class="proc-name">{{ data.topRam.name }}</div>
      </div>
      <div class="proc-val" style="color: var(--ram)">{{ data.topRam.gb }} GB</div>
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

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.head h1 {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.2px;
}
.head .time {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* Usage cards */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 14px 16px;
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.card-title h2 {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.2px;
}
.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--badge-bg);
  color: var(--badge-text);
}

.meter {
  margin-top: 10px;
}
.meter:first-of-type {
  margin-top: 0;
}
.meter-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.meter-label {
  font-size: 12px;
  font-weight: 600;
}
.meter-reset {
  font-size: 11px;
  color: var(--muted);
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
.meter-foot {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 6px;
}
.meter-pct {
  font-size: 12px;
  color: var(--muted);
}
.meter-note {
  font-size: 11px;
  color: var(--muted);
}

/* System stat grid */
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
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

/* Top process rows */
.proc {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.proc-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}
.proc-body {
  flex: 1;
  min-width: 0;
}
.proc-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 2px;
}
.proc-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.proc-val {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex: none;
}
</style>
