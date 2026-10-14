// Motore WebGPU della sala del podio: usa lo stesso GPUDevice del logo (acquireEngine). Ogni fotogramma:
//  1. compute: mappa della luce sul piano del finestrone (telaio, nuvole, ostacoli)        512×640
//  2. compute: sonde dell'illuminazione globale (ping-pong tra due buffer)                  2880 sonde × 6 direzioni
//  3. render:  fasci di luce a metà risoluzione, mescolati con il fotogramma precedente     rgba16float
//  4. render:  la sala (superfici, riflessi, nebbia, ACES, sRGB)                             rgba8unorm
//  5. render:  FXAA sul canvas
// Un solo writeBuffer da 304 byte; al massimo due fotogrammi in coda sulla GPU.
import { shadowShader, giShader, volShader, mainShader, presentShader, GI_PROBES, U_FLOATS, SHADOW_DIM } from "./shaders";
import { camera, celestial, moodAt, type Cam } from "./stage";

export type PodiumQuality = { mobile: boolean; volScale: number; steps: number };
export const podiumQuality = (mobile: boolean): PodiumQuality => (mobile ? { mobile, volScale: 0.4, steps: 32 } : { mobile, volScale: 0.5, steps: 56 });

type Layouts = Record<"shadow" | "gi" | "vol" | "main" | "present", GPUBindGroupLayout>;

export class PodiumView {
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly ubuf: GPUBuffer;
  private readonly gi: [GPUBuffer, GPUBuffer];
  private readonly shadow: GPUTexture;
  private readonly u = new Float32Array(U_FLOATS);
  private readonly layouts: Layouts;
  private pipes!: { shadow: GPUComputePipeline; gi: GPUComputePipeline; vol: GPURenderPipeline; main: GPURenderPipeline; present: GPURenderPipeline };
  private readonly linear: GPUSampler;
  private readonly shadowGroup: GPUBindGroup;
  private readonly giGroups: GPUBindGroup[];
  private volGroups: GPUBindGroup[] = [];
  private mainGroups: GPUBindGroup[] = [];
  private presentGroup: GPUBindGroup | null = null;
  private vol: GPUTexture[] = [];
  private scene: GPUTexture | null = null;
  private size = { pw: 0, ph: 0, vw: 0, vh: 0 };
  private cam: Cam | null = null;
  private frameNo = 0; private flip = 0; private vflip = 0; private fresh = true;
  private inflight = 0;
  private dead = false;

  constructor(private readonly device: GPUDevice, readonly canvas: HTMLCanvasElement, readonly q: PodiumQuality) {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Contesto WebGPU non disponibile");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });
    const d = device, C = GPUShaderStage.COMPUTE, Fr = GPUShaderStage.FRAGMENT;
    this.ubuf = d.createBuffer({ label: "podium-u", size: U_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.gi = [0, 1].map((i) => d.createBuffer({ label: `podium-gi${i}`, size: GI_PROBES * 6 * 16, usage: GPUBufferUsage.STORAGE })) as [GPUBuffer, GPUBuffer];
    this.shadow = d.createTexture({ label: "podium-shadow", size: SHADOW_DIM, format: "rg32float", usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.linear = d.createSampler({ magFilter: "linear", minFilter: "linear" });
    const uni = (v: number) => ({ visibility: v, buffer: { type: "uniform" as const } });
    const tex = (v: number, t: GPUTextureSampleType = "unfilterable-float") => ({ visibility: v, texture: { sampleType: t } });
    const ro = (v: number) => ({ visibility: v, buffer: { type: "read-only-storage" as const } });
    const L = (entries: any[]) => d.createBindGroupLayout({ entries: entries.map((e, i) => ({ binding: i, ...e })) });
    this.layouts = {
      shadow: L([uni(C), { visibility: C, storageTexture: { access: "write-only", format: "rg32float" } }]),
      gi: L([uni(C), tex(C), ro(C), { visibility: C, buffer: { type: "storage" } }]),
      vol: L([uni(Fr), tex(Fr), ro(Fr), tex(Fr, "float")]),
      main: L([uni(Fr), tex(Fr), ro(Fr), tex(Fr, "float"), { visibility: Fr, sampler: {} }]),
      present: L([tex(Fr, "float"), { visibility: Fr, sampler: {} }]),
    };
    const shadowView = this.shadow.createView();
    this.shadowGroup = d.createBindGroup({ layout: this.layouts.shadow, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: shadowView }] });
    // gi[f] → gi[1-f]: il compute legge il fotogramma precedente e scrive il nuovo
    this.giGroups = [0, 1].map((f) => d.createBindGroup({ layout: this.layouts.gi, entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: shadowView }, { binding: 2, resource: { buffer: this.gi[f] } }, { binding: 3, resource: { buffer: this.gi[1 - f] } }] }));
  }

  async ready() {
    const d = this.device;
    const mod = (code: string, label: string) => d.createShaderModule({ label, code });
    const layout = (l: GPUBindGroupLayout) => d.createPipelineLayout({ bindGroupLayouts: [l] });
    const vol = mod(volShader, "podium-vol"), main = mod(mainShader, "podium-main"), present = mod(presentShader, "podium-present");
    const render = (m: GPUShaderModule, l: GPUBindGroupLayout, fs: string, format: GPUTextureFormat) =>
      d.createRenderPipelineAsync({ layout: layout(l), vertex: { module: m, entryPoint: "vsFull" }, fragment: { module: m, entryPoint: fs, targets: [{ format }] }, primitive: { topology: "triangle-list" } });
    const [shadow, gi, pv, pm, pp] = await Promise.all([
      d.createComputePipelineAsync({ layout: layout(this.layouts.shadow), compute: { module: mod(shadowShader, "podium-shadow"), entryPoint: "shadow" } }),
      d.createComputePipelineAsync({ layout: layout(this.layouts.gi), compute: { module: mod(giShader, "podium-gi"), entryPoint: "gi" } }),
      render(vol, this.layouts.vol, "fsVol", "rgba16float"),
      render(main, this.layouts.main, "fsMain", "rgba8unorm"),
      render(present, this.layouts.present, "fsPresent", this.format),
    ]);
    this.pipes = { shadow, gi, vol: pv, main: pm, present: pp };
  }

  // w, h: viewport in pixel CSS; ratio: pixel del dispositivo per pixel CSS; left, top: barra laterale e intestazione
  resize(w: number, h: number, ratio: number, left: number, top: number) {
    const pw = Math.max(1, Math.round(w * ratio)), ph = Math.max(1, Math.round(h * ratio));
    this.cam = camera(pw, ph, left * ratio, top * ratio);
    if (pw === this.size.pw && ph === this.size.ph) return;
    const d = this.device;
    this.canvas.width = pw; this.canvas.height = ph;
    const vw = Math.max(1, Math.round(pw * this.q.volScale)), vh = Math.max(1, Math.round(ph * this.q.volScale));
    this.size = { pw, ph, vw, vh };
    this.vol.forEach((t) => t.destroy()); this.scene?.destroy();
    this.vol = [0, 1].map((i) => d.createTexture({ label: `podium-vol${i}`, size: [vw, vh], format: "rgba16float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }));
    this.scene = d.createTexture({ label: "podium-scene", size: [pw, ph], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const shadowView = this.shadow.createView(), u = { binding: 0, resource: { buffer: this.ubuf } };
    // vol[v] si scrive leggendo vol[1-v]; la scena legge il volume appena scritto e le sonde più recenti
    this.volGroups = [0, 1].flatMap((g) => [0, 1].map((v) => d.createBindGroup({ layout: this.layouts.vol, entries: [u, { binding: 1, resource: shadowView }, { binding: 2, resource: { buffer: this.gi[g] } }, { binding: 3, resource: this.vol[1 - v].createView() }] })));
    this.mainGroups = [0, 1].flatMap((g) => [0, 1].map((v) => d.createBindGroup({ layout: this.layouts.main, entries: [u, { binding: 1, resource: shadowView }, { binding: 2, resource: { buffer: this.gi[g] } }, { binding: 3, resource: this.vol[v].createView() }, { binding: 4, resource: this.linear }] })));
    this.presentGroup = d.createBindGroup({ layout: this.layouts.present, entries: [{ binding: 0, resource: this.scene.createView() }, { binding: 1, resource: this.linear }] });
    this.fresh = true;
  }

  get camera() { return this.cam; }

  // t: secondi; night: 0 giorno … 1 notte. Restituisce false se il fotogramma è stato saltato (GPU indietro)
  render(t: number, night: number) {
    if (this.dead || !this.pipes || !this.scene || !this.cam || this.inflight >= 2) return false;
    const { pw, ph, vw, vh } = this.size, c = this.cam, m = moodAt(night), L = celestial(t, night > 0.5), u = this.u;
    u.set([...c.pos, c.tan, ...c.right, c.cx, ...c.up, c.cy, ...c.fwd, c.h], 0);
    u.set([L[0], L[1], L[2], m.sunI, ...m.sun, night, ...m.skyTop, m.exposure, ...m.skyHor, m.ambient], 16);
    u.set([...m.wall, m.fog, ...m.wainscot, m.dust, ...m.tileA, m.cover, ...m.tileB, t, ...m.stone, this.frameNo % 4096, ...m.dark, this.q.steps, ...m.column, this.fresh ? 1 : 0.1], 32);
    u.set([...m.carpet, 0, ...m.banner, 0, ...m.frame, 0, pw, ph, vw, vh], 60);
    this.device.queue.writeBuffer(this.ubuf, 0, u);
    const d = this.device, enc = d.createCommandEncoder({ label: "podium" }), g = this.flip, v = this.vflip;
    const cp = enc.beginComputePass();
    cp.setPipeline(this.pipes.shadow); cp.setBindGroup(0, this.shadowGroup); cp.dispatchWorkgroups(Math.ceil(SHADOW_DIM[0] / 8), Math.ceil(SHADOW_DIM[1] / 8));
    cp.setPipeline(this.pipes.gi); cp.setBindGroup(0, this.giGroups[g]); cp.dispatchWorkgroups(Math.ceil((GI_PROBES * 6) / 64));
    cp.end();
    const latest = 1 - g;
    const pass = (view: GPUTextureView, pipe: GPURenderPipeline, group: GPUBindGroup) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
      p.setPipeline(pipe); p.setBindGroup(0, group); p.draw(3); p.end();
    };
    pass(this.vol[v].createView(), this.pipes.vol, this.volGroups[latest * 2 + v]);
    pass(this.scene.createView(), this.pipes.main, this.mainGroups[latest * 2 + v]);
    pass(this.ctx.getCurrentTexture().createView(), this.pipes.present, this.presentGroup!);
    d.queue.submit([enc.finish()]);
    this.flip = latest; this.vflip = 1 - v; this.frameNo++; this.fresh = false;
    this.inflight++;
    d.queue.onSubmittedWorkDone().then(() => { this.inflight--; }, () => { this.inflight = 0; });
    return true;
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.vol.forEach((t) => t.destroy()); this.scene?.destroy(); this.shadow.destroy(); this.ubuf.destroy(); this.gi.forEach((b) => b.destroy());
    try { this.ctx.unconfigure(); } catch {}
  }
}
