// Dispositivo WebGPU del podio, separato da quello del logo: il logo chiede la GPU a basso consumo (sui portatili con due
// GPU basta l'integrata), la sala chiede quella ad alte prestazioni. All'avvio una prova breve misura la potenza di calcolo
// della scheda (miliardi di operazioni al secondo); la fascia che ne esce sceglie qualità e risoluzione della scena.
import { softwareAdapterAllowed } from "../logo3d/engine";
import { SCORE_KEY, tierFor, type Tier } from "./gpuScore";

export { tierFor, type Tier };
export type PodiumDevice = {
  device: GPUDevice; timestamps: boolean; tier: Tier; gflops: number; adapter: { vendor: string; architecture: string };
  lost: boolean; onLost: Set<() => void>;
};

const KEEP_ALIVE_MS = 30000;

// prova: ogni filo esegue catene indipendenti di moltiplicazioni-addizioni (FMA)
const BENCH_ITERS = 256, BENCH_CHAINS = 8, BENCH_WG = 64;
const benchShader = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(${BENCH_WG}) fn bench(@builtin(global_invocation_id) id: vec3u) {
  var a = array<f32, ${BENCH_CHAINS}>(${Array.from({ length: BENCH_CHAINS }, (_, i) => `f32(id.x) * 1e-7 + ${(i + 1) * 0.1}`).join(", ")});
  for (var i = 0u; i < ${BENCH_ITERS}u; i++) {
    ${Array.from({ length: BENCH_CHAINS }, (_, i) => `a[${i}] = fma(a[${i}], 0.9999, 0.0001);`).join(" ")}
  }
  var s = 0.0;
  for (var k = 0; k < ${BENCH_CHAINS}; k++) { s += a[k]; }
  if (s == -1.0) { out[id.x % 64u] = s; } // mai vero: impedisce di eliminare il calcolo
}
`;

async function benchmark(device: GPUDevice, timestamps: boolean): Promise<number> {
  const pipe = await device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ code: benchShader }), entryPoint: "bench" } });
  const out = device.createBuffer({ size: 256, usage: GPUBufferUsage.STORAGE });
  const group = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: out } }] });
  const qs = timestamps ? device.createQuerySet({ type: "timestamp", count: 2 }) : null;
  const resolve = qs ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
  const read = qs ? device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }) : null;
  const run = async (groups: number) => {
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass(qs ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
    cp.setPipeline(pipe); cp.setBindGroup(0, group);
    for (let left = groups; left > 0; left -= 65535) cp.dispatchWorkgroups(Math.min(65535, left));
    cp.end();
    if (qs && resolve && read) { enc.resolveQuerySet(qs, 0, 2, resolve, 0); enc.copyBufferToBuffer(resolve, 0, read, 0, 16); }
    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    let ms = performance.now() - t0;
    if (read) {
      await read.mapAsync(GPUMapMode.READ);
      const t = new BigUint64Array(read.getMappedRange().slice(0)); read.unmap();
      const gpu = Number(t[1] - t[0]) / 1e6;
      if (gpu > 0 && gpu < ms * 4) ms = gpu;
    }
    return ms;
  };
  try {
    await run(64); // compilazione e risveglio della GPU
    let groups = 512, ms = 0;
    // si raddoppia il lavoro finché la prova dura abbastanza da essere misurabile (al massimo ~ un decimo di secondo)
    for (let k = 0; k < 8; k++) {
      ms = await run(groups);
      if (ms > 12 || groups >= 1 << 18) break;
      groups *= ms < 3 ? 4 : 2;
    }
    const flops = groups * BENCH_WG * BENCH_ITERS * BENCH_CHAINS * 2;
    return flops / (Math.max(ms, 0.05) * 1e6);
  } finally {
    out.destroy(); resolve?.destroy(); read?.destroy(); qs?.destroy();
  }
}

let current: { ready: Promise<PodiumDevice>; dev: PodiumDevice | null } | null = null;
let refs = 0, timer: ReturnType<typeof setTimeout> | undefined;

async function create(): Promise<PodiumDevice> {
  if (typeof navigator === "undefined" || !navigator.gpu) throw new Error("WebGPU non disponibile");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("Nessun adattatore WebGPU");
  const info: any = (adapter as any).info || {};
  if ((info.isFallbackAdapter ?? (adapter as any).isFallbackAdapter) && !softwareAdapterAllowed()) throw new Error("Adattatore WebGPU software");
  const timestamps = adapter.features.has("timestamp-query");
  const device = await adapter.requestDevice({ label: "podium", requiredFeatures: timestamps ? ["timestamp-query"] : [] });
  const dev: PodiumDevice = { device, timestamps, tier: "medium", gflops: 0, adapter: { vendor: info.vendor || "", architecture: info.architecture || "" }, lost: false, onLost: new Set() };
  device.lost.then(() => { dev.lost = true; if (current?.dev === dev) current = null; dev.onLost.forEach((f) => f()); });
  device.addEventListener("uncapturederror", (e: any) => console.error("Podio WebGPU:", e.error?.message || e));
  // la misura si ricorda per scheda (stesso fornitore e architettura): le visite successive non rifanno la prova
  const key = `${dev.adapter.vendor}|${dev.adapter.architecture}`;
  let saved: any = null;
  try { saved = JSON.parse(localStorage.getItem(SCORE_KEY) || "null"); } catch {}
  if (saved && saved.key === key && saved.gflops > 0 && Date.now() - saved.at < 7 * 864e5) dev.gflops = saved.gflops;
  else {
    dev.gflops = await benchmark(device, timestamps).catch(() => 0);
    try { localStorage.setItem(SCORE_KEY, JSON.stringify({ key, gflops: dev.gflops, at: Date.now() })); } catch {}
  }
  dev.tier = dev.gflops > 0 ? tierFor(dev.gflops) : "medium";
  return dev;
}

// fascia effettiva: sui telefoni e i tablet al massimo media (batteria e calore contano più della risoluzione)
export const capTier = (t: Tier, mobile: boolean): Tier => (mobile && (t === "ultra" || t === "high") ? "medium" : t);
export function acquirePodiumDevice(): Promise<PodiumDevice> {
  refs++;
  if (timer) { clearTimeout(timer); timer = undefined; }
  if (!current) {
    const slot: { ready: Promise<PodiumDevice>; dev: PodiumDevice | null } = { ready: null as any, dev: null };
    slot.ready = create().then((d) => { slot.dev = d; return d; }, (err) => { if (current === slot) current = null; throw err; });
    current = slot;
  }
  return current.ready;
}

export function releasePodiumDevice() {
  refs = Math.max(0, refs - 1);
  if (refs > 0 || timer || !current) return;
  timer = setTimeout(() => {
    timer = undefined;
    if (refs > 0 || !current) return;
    const slot = current; current = null;
    slot.ready.then((d) => d.device.destroy(), () => {});
  }, KEEP_ALIVE_MS);
}
