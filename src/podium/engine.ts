// Motore WebGPU del podio: usa lo stesso GPUDevice del logo (acquireEngine) e tre pipeline create una volta.
// Ogni fotogramma: 1 compute (sonde di luce, ping-pong tra due buffer), 1 passaggio a metà risoluzione (fasci di luce),
// 1 passaggio sul canvas (superfici, riflessi, composizione). Un solo writeBuffer da 224 byte per fotogramma.
import { giShader, volShader, mainShader, GI_PROBES, U_FLOATS } from "./shaders";
import { camera, celestial, moodAt } from "./stage";

export type PodiumQuality = { mobile: boolean; volScale: number; steps: number; aa: boolean };
export const podiumQuality = (mobile: boolean): PodiumQuality => (mobile ? { mobile, volScale: 0.4, steps: 22, aa: true } : { mobile, volScale: 0.5, steps: 36, aa: true });

export class PodiumView {
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly ubuf: GPUBuffer;
  private readonly gi: [GPUBuffer, GPUBuffer];
  private readonly u = new Float32Array(U_FLOATS);
  private pipes!: { gi: GPUComputePipeline; vol: GPURenderPipeline; main: GPURenderPipeline };
  private readonly layouts: { gi: GPUBindGroupLayout; vol: GPUBindGroupLayout; main: GPUBindGroupLayout };
  private giGroups: GPUBindGroup[] = [];
  private volGroups: GPUBindGroup[] = [];
  private mainGroups: GPUBindGroup[] = [];
  private vol: GPUTexture | null = null;
  private readonly sampler: GPUSampler;
  private size = { w: 0, h: 0, pw: 0, ph: 0, vw: 0, vh: 0 };
  private frameNo = 0;
  private flip = 0;
  private dead = false;
  // risoluzione adattiva come nel logo: si misura il tempo della GPU ogni 15 fotogrammi
  scale = 1;
  onScale: (() => void) | null = null;
  private probe = { slow: 0, fast: 0, busy: false };
  private inflight = 0; // fotogrammi inviati e non ancora completati dalla GPU

  constructor(private readonly device: GPUDevice, readonly canvas: HTMLCanvasElement, readonly q: PodiumQuality) {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Contesto WebGPU non disponibile");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });
    const d = device, C = GPUShaderStage.COMPUTE, Fr = GPUShaderStage.FRAGMENT;
    this.ubuf = d.createBuffer({ label: "podium-u", size: U_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const giSize = GI_PROBES * 6 * 16;
    this.gi = [0, 1].map((i) => d.createBuffer({ label: `podium-gi${i}`, size: giSize, usage: GPUBufferUsage.STORAGE })) as [GPUBuffer, GPUBuffer];
    this.sampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.layouts = {
      gi: d.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: "uniform" } }, { binding: 1, visibility: C, buffer: { type: "read-only-storage" } }, { binding: 2, visibility: C, buffer: { type: "storage" } }] }),
      vol: d.createBindGroupLayout({ entries: [{ binding: 0, visibility: Fr, buffer: { type: "uniform" } }, { binding: 1, visibility: Fr, buffer: { type: "read-only-storage" } }] }),
      main: d.createBindGroupLayout({ entries: [{ binding: 0, visibility: Fr, buffer: { type: "uniform" } }, { binding: 1, visibility: Fr, buffer: { type: "read-only-storage" } }, { binding: 2, visibility: Fr, texture: {} }, { binding: 3, visibility: Fr, sampler: {} }] }),
    };
    // gi[f] → gi[1-f]: il compute legge il fotogramma precedente e scrive il nuovo, che leggono i due passaggi grafici
    this.giGroups = [0, 1].map((f) => d.createBindGroup({ layout: this.layouts.gi, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.gi[f] } }, { binding: 2, resource: { buffer: this.gi[1 - f] } }] }));
    this.volGroups = [0, 1].map((f) => d.createBindGroup({ layout: this.layouts.vol, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.gi[f] } }] }));
  }

  async ready() {
    const d = this.device;
    const mod = (code: string, label: string) => d.createShaderModule({ label, code });
    const vs = (m: GPUShaderModule) => ({ module: m, entryPoint: "vsFull" });
    const vol = mod(volShader, "podium-vol"), main = mod(mainShader, "podium-main");
    const [gi, pv, pm] = await Promise.all([
      d.createComputePipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.layouts.gi] }), compute: { module: mod(giShader, "podium-gi"), entryPoint: "gi" } }),
      d.createRenderPipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.layouts.vol] }), vertex: vs(vol), fragment: { module: vol, entryPoint: "fsVol", targets: [{ format: "rgba16float" }] }, primitive: { topology: "triangle-list" } }),
      d.createRenderPipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.layouts.main] }), vertex: vs(main), fragment: { module: main, entryPoint: "fsMain", targets: [{ format: this.format }] }, primitive: { topology: "triangle-list" } }),
    ]);
    this.pipes = { gi, vol: pv, main: pm };
  }

  resize(w: number, h: number, ratio: number) {
    const r = ratio * this.scale, pw = Math.max(1, Math.round(w * r)), ph = Math.max(1, Math.round(h * r));
    this.size.w = w; this.size.h = h;
    if (pw === this.size.pw && ph === this.size.ph) return;
    this.canvas.width = pw; this.canvas.height = ph;
    const vw = Math.max(1, Math.round(pw * this.q.volScale)), vh = Math.max(1, Math.round(ph * this.q.volScale));
    this.size = { w, h, pw, ph, vw, vh };
    this.vol?.destroy();
    this.vol = this.device.createTexture({ label: "podium-vol", size: [vw, vh], format: "rgba16float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const view = this.vol.createView();
    this.mainGroups = [0, 1].map((f) => this.device.createBindGroup({ layout: this.layouts.main, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.gi[f] } }, { binding: 2, resource: view }, { binding: 3, resource: this.sampler }] }));
  }

  // t: secondi; night: 0 giorno … 1 notte; px, py: parallasse del puntatore (-1..1)
  render(t: number, night: number, px: number, py: number, interval: number) {
    if (this.dead || !this.pipes || !this.vol) return false;
    // al massimo due fotogrammi in coda: se la GPU è indietro si salta il disegno invece di accumulare lavoro
    if (this.inflight >= 2) return true;
    const { pw, ph, vw, vh, w, h } = this.size;
    const c = camera(w / h, px, py), m = moodAt(night), L = celestial(t, night > 0.5);
    const u = this.u;
    u.set([...c.pos, c.tan, ...c.right, c.aspect, ...c.up, t, ...c.fwd, this.frameNo % 1024], 0);
    u.set([L[0], L[1], L[2], m.sunI, ...m.sun, night, ...m.skyTop, m.exposure, ...m.skyHor, m.ambient], 16);
    u.set([...m.wall, m.fog, ...m.floor, m.dust, ...m.stone, m.cover, ...m.plinth, this.q.steps, ...m.frame, this.q.aa ? 1 : 0, pw, ph, vw, vh], 32);
    this.device.queue.writeBuffer(this.ubuf, 0, u);
    const f = this.flip, enc = this.device.createCommandEncoder({ label: "podium" });
    const cp = enc.beginComputePass();
    cp.setPipeline(this.pipes.gi); cp.setBindGroup(0, this.giGroups[f]); cp.dispatchWorkgroups(Math.ceil((GI_PROBES * 6) / 64)); cp.end();
    const latest = 1 - f;
    const vp = enc.beginRenderPass({ colorAttachments: [{ view: this.vol.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
    vp.setPipeline(this.pipes.vol); vp.setBindGroup(0, this.volGroups[latest]); vp.draw(3); vp.end();
    const mp = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
    mp.setPipeline(this.pipes.main); mp.setBindGroup(0, this.mainGroups[latest]); mp.draw(3); mp.end();
    this.device.queue.submit([enc.finish()]);
    this.flip = latest; this.frameNo++;
    this.inflight++;
    this.device.queue.onSubmittedWorkDone().then(() => { this.inflight--; }, () => { this.inflight = 0; });
    if (this.frameNo % 15 === 0 && !this.probe.busy) {
      const p = this.probe, t0 = performance.now(); p.busy = true;
      this.device.queue.onSubmittedWorkDone().then(() => {
        p.busy = false; if (this.dead) return;
        const ms = performance.now() - t0;
        if (ms > interval * 0.7) { p.fast = 0; if (++p.slow >= 2 && this.scale > 0.45) { p.slow = 0; this.scale *= 0.85; this.onScale?.(); } }
        else if (ms < interval * 0.25) { p.slow = 0; if (++p.fast >= 12 && this.scale < 1) { p.fast = 0; this.scale = Math.min(1, this.scale / 0.85); this.onScale?.(); } }
        else p.slow = p.fast = 0;
      }, () => { p.busy = false; });
    }
    return true;
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.vol?.destroy(); this.ubuf.destroy(); this.gi.forEach((b) => b.destroy());
    try { this.ctx.unconfigure(); } catch {}
  }
}
