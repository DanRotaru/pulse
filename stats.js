import si from 'systeminformation';

const BYTES_PER_GB = 1024 ** 3;
const toGB = (bytes) => bytes / BYTES_PER_GB;

// How often the expensive process/RAM snapshot is refreshed. The CPU load gauge
// still updates on every collectStats() call (cheap, Node-native); only the heavy
// per-process list is throttled to this cadence to keep CPU overhead low.
const HEAVY_TTL_MS = Number(process.env.PROC_INTERVAL_MS) || 5000;

// si.cpu() is static hardware info, so we fetch it once and reuse it. We only need
// the logical-core (thread) count from it for the dashboard.
let cpuInfoPromise = null;
function getCpuInfo() {
  if (!cpuInfoPromise) cpuInfoPromise = si.cpu().catch(() => ({}));
  return cpuInfoPromise;
}

// --- Throttled heavy snapshot (RAM + top processes) -------------------------
// si.mem() and si.processes() are comparatively expensive on Windows. Calling
// them every 2s drives CPU up, so we refresh at most once per HEAVY_TTL_MS and
// serve the cached result in between, never starting a second collection while
// one is already in flight.
let heavyCache = null;
let heavyAt = 0;
let heavyInFlight = null;

function buildHeavy(mem, procs) {
  const usedRam = mem.active; // matches Task Manager's "in use"

  // Aggregate processes by name (like Task Manager groups chrome.exe, etc.)
  // and drop the synthetic Windows idle process.
  const byName = new Map();
  for (const p of procs.list) {
    if (/^(System Idle Process|Idle)$/i.test(p.name)) continue;
    const acc = byName.get(p.name) || { name: p.name, cpu: 0, memRss: 0 };
    acc.cpu += p.cpu;
    acc.memRss += p.memRss;
    byName.set(p.name, acc);
  }
  const grouped = [...byName.values()];

  const topCpu = [...grouped]
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, 5)
    .map((p) => ({ name: p.name, value: Math.round(p.cpu) }));

  const topMem = [...grouped]
    .sort((a, b) => b.memRss - a.memRss)
    .slice(0, 5)
    .map((p) => ({ name: p.name, value: +toGB(p.memRss * 1024).toFixed(1) }));

  return {
    ram: {
      usedGB: +toGB(usedRam).toFixed(1),
      totalGB: Math.round(toGB(mem.total)),
      usedPercent: Math.round((usedRam / mem.total) * 100),
      top: topMem,
    },
    topCpu,
  };
}

async function getHeavy() {
  const now = Date.now();
  if (heavyCache && now - heavyAt < HEAVY_TTL_MS) return heavyCache;
  if (heavyInFlight) return heavyInFlight; // coalesce concurrent refreshes

  heavyInFlight = (async () => {
    const [mem, procs] = await Promise.all([si.mem(), si.processes()]);
    heavyCache = buildHeavy(mem, procs);
    heavyAt = Date.now();
    return heavyCache;
  })()
    .catch((err) => {
      // On failure keep serving the last good snapshot if we have one.
      if (heavyCache) return heavyCache;
      throw err;
    })
    .finally(() => {
      heavyInFlight = null;
    });

  return heavyInFlight;
}

/**
 * Collect the system metrics shown on the dashboard:
 *  - CPU: load %, logical-core (thread) count, top processes by CPU%
 *  - RAM: used / total (GB), used %, top processes by memory
 *  - Last boot time: derived from system uptime
 *
 * The CPU load % and uptime are read fresh on every call via cheap Node-native
 * paths. The RAM + per-process lists come from a throttled, cached snapshot.
 */
export async function collectStats() {
  const [cpuInfo, load, time, heavy] = await Promise.all([
    getCpuInfo(),
    si.currentLoad(),
    si.time(),
    getHeavy(),
  ]);

  return {
    updated: new Date().toISOString(),
    cpu: {
      usedPercent: Math.round(load.currentLoad),
      cores: cpuInfo.physicalCores || null,
      threads: cpuInfo.cores || cpuInfo.physicalCores || null,
      top: heavy.topCpu,
    },
    ram: heavy.ram,
    uptimeSeconds: time.uptime,
  };
}
