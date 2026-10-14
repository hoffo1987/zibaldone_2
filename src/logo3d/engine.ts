// Motore WebGPU del logo. Un solo GPUDevice per la pagina, condiviso da ogni logo montato: pipeline, geometrie, ambiente
// prefiltrato e texture dei bagliori si creano una volta e sopravvivono ai cambi di pagina (login → home). Nessun ripiego
// su WebGL: se WebGPU manca, o il dispositivo va perso e non torna, il componente mostra il logo SVG.
import { renderShader, envShader, OBJ_PHASE, SPRITE_PHASE, PARTICLE_PHASE, ENV_MAX_MIP, ENV_W, ENV_H } from "./shaders";
import { STUDIO, STUDIO_BG } from "./anim";
import { buildMeshes, bakeAO, FramePacker, LogoAnim, OBJ, FOV, type Meshes, type Quality } from "./scene";

// MSAA 4× ovunque: sui telefoni (GPU a tile) i campioni restano nella memoria del tile e con storeOp "discard" non
// costano banda; prima i telefoni non avevano antialiasing e i bordi della targa erano a scalini
const MSAA = 4;
const KEEP_ALIVE_MS = 60000; // dispositivo e risorse restano pronti per un minuto dopo l'ultimo logo smontato

export const webgpuAvailable = () => typeof navigator !== "undefined" && !!navigator.gpu;

// solo per le anteprime e i test automatici: in produzione un adattatore software (rasterizzazione sulla CPU) consumerebbe
// troppo per un logo decorativo, e si preferisce l'SVG
let allowSoftware = false;
export const allowSoftwareAdapter = (on: boolean) => { allowSoftware = on; };

type Pipelines = { plate: GPURenderPipeline; base: GPURenderPipeline; fancy: GPURenderPipeline | null; rim: GPURenderPipeline; ring: GPURenderPipeline; sprite: GPURenderPipeline; particle: GPURenderPipeline };
type Batches = Omit<Meshes, "vertices" | "colors" | "indices">;
type GeoBuffers = { vertex: GPUBuffer; color: GPUBuffer; index: GPUBuffer; meshes: Batches };

export class Engine {
  readonly format: GPUTextureFormat;
  readonly layout: GPUBindGroupLayout;
  private readonly pipelineLayout: GPUPipelineLayout;
  private readonly module: GPUShaderModule;
  private readonly pipelines = new Map<string, Promise<Pipelines>>();
  private readonly geos = new Map<string, GeoBuffers>();
  readonly samplers: { env: GPUSampler; glow: GPUSampler };
  env!: { tex: GPUTexture; view: GPUTextureView };
  glow!: { tex: GPUTexture; view: GPUTextureView };
  ao!: { tex: GPUTexture; view: GPUTextureView };
  lost = false;
  readonly onLost = new Set<() => void>();
  stats = { gpuBytes: 0 };

  constructor(readonly device: GPUDevice, readonly adapterInfo: { vendor: string; architecture: string; fallback: boolean }) {
    this.format = navigator.gpu.getPreferredCanvasFormat();
    const V = GPUShaderStage.VERTEX, Fr = GPUShaderStage.FRAGMENT;
    this.layout = device.createBindGroupLayout({
      label: "logo",
      entries: [
        { binding: 0, visibility: V | Fr, buffer: { type: "uniform" } },
        { binding: 1, visibility: V, buffer: { type: "uniform" } },
        { binding: 2, visibility: Fr, texture: {} },
        { binding: 3, visibility: Fr, sampler: {} },
        { binding: 4, visibility: Fr, texture: {} },
        { binding: 5, visibility: Fr, sampler: {} },
        { binding: 6, visibility: Fr, texture: {} },
      ],
    });
    this.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.module = device.createShaderModule({ label: "logo", code: renderShader });
    this.samplers = { env: device.createSampler({ magFilter: "linear", minFilter: "linear" }), glow: device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" }) };
    device.lost.then(() => {
      this.lost = true;
      if (current && current.engine === this) current = null;
      this.onLost.forEach((fn) => fn());
    });
  }

  async init() {
    const ready = this.buildEnv();
    this.buildGlow();
    this.buildAO();
    await ready;
  }

  // ---- ambiente prefiltrato (compute) ----
  // Lo "studio" del logo originale (sei pannelli luminosi attorno all'origine) si calcola per raggi direttamente nel livello
  // più nitido dell'atlante, poi la stessa catena di sfocature gaussiane di PMREMGenerator (stesse sigma, stessi assi polari,
  // stessi pesi, stessa disposizione "cubeUV") produce i livelli di rugosità. Tutto sulla GPU, una volta per dispositivo.
  private async buildEnv() {
    const d = this.device, usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
    const atlas = d.createTexture({ label: "env", size: [ENV_W, ENV_H], format: "rgba16float", usage });
    const temp = d.createTexture({ label: "env-temp", size: [ENV_W, ENV_H], format: "rgba16float", usage });
    const module = d.createShaderModule({ label: "env", code: envShader });
    const [studio, blur] = await Promise.all([
      d.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "studio" } }),
      d.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "blur" } }),
    ]);
    const sampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
    // livello "mip" m: facce di 2^max(m,4) texel (bordo compreso); sotto m = 4 i livelli stanno affiancati a 16 px
    const level = (m: number) => { const size = 2 ** Math.max(m, 4); return { size, x: Math.max(4 - m, 0) * 48, y: 4 * (2 ** ENV_MAX_MIP - size) }; };

    const params = d.createBuffer({ size: 512 + 256 * 20, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const studioData = new Float32Array(128), top = level(ENV_MAX_MIP);
    const linc = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map((c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)));
    studioData.set([...linc(STUDIO_BG), 0], 0);
    new Uint32Array(studioData.buffer).set([top.size, 0, top.x, top.y], 4);
    STUDIO.forEach(([w, h, color, k, x, y, z], i) => {
      // orientamento di Object3D.lookAt(0,0,0) con "su" = +y: z del pannello verso l'origine
      const l = Math.hypot(x, y, z), nz = [-x / l, -y / l, -z / l];
      let ex = [nz[2], 0, -nz[0]]; const el = Math.hypot(ex[0], ex[1], ex[2]) || 1; ex = ex.map((c) => c / el); // up × z
      const ey = [nz[1] * ex[2] - nz[2] * ex[1], nz[2] * ex[0] - nz[0] * ex[2], nz[0] * ex[1] - nz[1] * ex[0]];
      const c = linc(color).map((v) => v * k);
      studioData.set([x, y, z, 0, ex[0], ex[1], ex[2], w / 2, ey[0], ey[1], ey[2], h / 2, nz[0], nz[1], nz[2], 0, c[0], c[1], c[2], 0], 8 + i * 20);
    });
    d.queue.writeBuffer(params, 0, studioData);

    const PHI = (1 + Math.sqrt(5)) / 2, IP = 1 / PHI;
    const AXES = [[1, 1, 1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, PHI, IP], [0, PHI, -IP], [IP, 0, PHI], [-IP, 0, PHI], [PHI, IP, 0], [-PHI, IP, 0]];
    // sigma (radianti) dei livelli di PMREMGenerator con il cubemap a 256 px: 1/2^m fino a 16 px, poi i livelli extra
    const SIGMA: Record<number, number> = { 7: 1 / 128, 6: 1 / 64, 5: 1 / 32, 4: 1 / 16, 3: 0.125, 2: 0.215, 1: 0.35, 0: 0.446, [-1]: 0.526, [-2]: 0.582 };
    let slot = 0;
    const enc = d.createCommandEncoder({ label: "env" });
    const pass = enc.beginComputePass();
    pass.setPipeline(studio);
    pass.setBindGroup(0, d.createBindGroup({ layout: studio.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: params, offset: 0, size: 512 } }, { binding: 1, resource: atlas.createView() }] }));
    pass.dispatchWorkgroups(Math.ceil((3 * top.size) / 8), Math.ceil((2 * top.size) / 8));
    pass.setPipeline(blur);
    // mezza sfocatura di _halfBlur: legge il livello mipIn di src e scrive il livello mOut di dst
    const half = (src: GPUTexture, dst: GPUTexture, sigma: number, mipIn: number, mOut: number, pole: number[], lat: boolean) => {
      const out = level(mOut), rpp = Math.PI / (2 * (level(mipIn).size - 1)), sp = sigma / rpp, samples = Math.min(20, 1 + Math.floor(3 * sp));
      const w: number[] = []; let sum = 0;
      for (let i = 0; i < 20; i++) { const x = i / sp, wt = Math.exp((-x * x) / 2); w.push(wt); if (i === 0) sum += wt; else if (i < samples) sum += 2 * wt; }
      const buf = new ArrayBuffer(128), f = new Float32Array(buf), u = new Uint32Array(buf);
      f.set([pole[0], pole[1], pole[2], lat ? 1 : 0, rpp, mipIn, 0, 0], 0); u.set([out.size, samples, out.x, out.y], 8); f.set(w.map((x) => x / sum), 12);
      const offset = 512 + 256 * slot++;
      d.queue.writeBuffer(params, offset, buf);
      pass.setBindGroup(0, d.createBindGroup({ layout: blur.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: params, offset, size: 128 } }, { binding: 1, resource: src.createView() }, { binding: 2, resource: sampler }, { binding: 3, resource: dst.createView() }] }));
      pass.dispatchWorkgroups(Math.ceil((3 * out.size) / 8), Math.ceil((2 * out.size) / 8));
    };
    // livello più nitido: la sfocatura iniziale di fromScene (0.03 rad) insieme a quella del suo livello
    const s0 = Math.sqrt(0.03 * 0.03 + SIGMA[ENV_MAX_MIP] * SIGMA[ENV_MAX_MIP]);
    half(atlas, temp, s0, ENV_MAX_MIP, ENV_MAX_MIP, [0, 1, 0], true);
    half(temp, atlas, s0, ENV_MAX_MIP, ENV_MAX_MIP, [0, 1, 0], false);
    for (let m = ENV_MAX_MIP - 1; m >= -2; m--) {
      const sigma = Math.sqrt(SIGMA[m] * SIGMA[m] - SIGMA[m + 1] * SIGMA[m + 1]), pole = AXES[(7 - m) % AXES.length];
      half(atlas, temp, sigma, m + 1, m, pole, true);
      half(temp, atlas, sigma, m, m, pole, false);
    }
    pass.end();
    d.queue.submit([enc.finish()]);
    await d.queue.onSubmittedWorkDone();
    temp.destroy(); params.destroy();
    this.env = { tex: atlas, view: atlas.createView() };
    this.stats.gpuBytes += ENV_W * ENV_H * 8;
  }

  // ---- texture dei bagliori: lo stesso gradiente radiale del canvas originale, con le mip (filtro a scatola) ----
  private buildGlow() {
    const S = 128, LEVELS = 8, stops = [[0, 1], [0.18, 0.65], [0.5, 0.15], [1, 0]];
    const alpha = (r: number) => { if (r >= 1) return 0; for (let i = 1; i < stops.length; i++) if (r <= stops[i][0]) { const [r0, a0] = stops[i - 1], [r1, a1] = stops[i]; return a0 + ((a1 - a0) * (r - r0)) / (r1 - r0); } return 0; };
    const tex = this.device.createTexture({ label: "glow", size: [S, S], format: "r8unorm", mipLevelCount: LEVELS, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    let level = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) level[y * S + x] = Math.round(alpha(Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64) * 255);
    for (let l = 0, size = S; l < LEVELS; l++, size >>= 1) {
      if (l > 0) {
        const prev = level, ps = size * 2; level = new Float32Array(size * size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) level[y * size + x] = (prev[2 * y * ps + 2 * x] + prev[2 * y * ps + 2 * x + 1] + prev[(2 * y + 1) * ps + 2 * x] + prev[(2 * y + 1) * ps + 2 * x + 1]) / 4;
      }
      this.device.queue.writeTexture({ texture: tex, mipLevel: l }, Uint8Array.from(level, (v) => Math.round(v)), { bytesPerRow: size }, [size, size]);
    }
    this.glow = { tex, view: tex.createView() };
    this.stats.gpuBytes += (S * S * 4) / 3;
  }

  // ---- occlusione d'ambiente della faccia della targa: calcolata una volta, 64 KB ----
  private buildAO() {
    const S = 128, tex = this.device.createTexture({ label: "ao", size: [S, S], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: tex }, bakeAO(S), { bytesPerRow: S * 4 }, [S, S]);
    this.ao = { tex, view: tex.createView() };
    this.stats.gpuBytes += S * S * 4;
  }

  // ---- geometrie: un vertex buffer, un index buffer e i colori della targa per ogni livello di qualità ----
  geometry(q: Quality): GeoBuffers {
    const key = q.mobile ? "m" : "d";
    let g = this.geos.get(key);
    if (g) return g;
    const meshes = buildMeshes(q);
    const upload = (data: Float32Array | Uint16Array, usage: number, label: string) => {
      const b = this.device.createBuffer({ label, size: data.byteLength, usage, mappedAtCreation: true });
      new (data.constructor as any)(b.getMappedRange()).set(data); b.unmap();
      this.stats.gpuBytes += data.byteLength;
      return b;
    };
    const { vertices, colors, indices, ...batches } = meshes; // dopo il caricamento sulla GPU restano solo gli intervalli di disegno
    g = { meshes: batches, vertex: upload(vertices, GPUBufferUsage.VERTEX, "logo-vertices"), color: upload(colors, GPUBufferUsage.VERTEX, "logo-colors"), index: upload(indices, GPUBufferUsage.INDEX, "logo-indices") };
    this.geos.set(key, g);
    return g;
  }

  // ---- pipeline: create in modo asincrono (nessun blocco del thread principale) e riusate da ogni logo ----
  pipelinesFor(samples: number, lite: boolean): Promise<Pipelines> {
    const key = `${samples}|${lite}`;
    let p = this.pipelines.get(key);
    if (!p) { p = this.createPipelines(samples, lite); this.pipelines.set(key, p); }
    return p;
  }

  private async createPipelines(samples: number, lite: boolean): Promise<Pipelines> {
    const d = this.device, module = this.module, layout = this.pipelineLayout, format = this.format;
    const vtx: GPUVertexBufferLayout = { arrayStride: 28, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x4" }] };
    const col: GPUVertexBufferLayout = { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x3" }] };
    const additive: GPUBlendState = { color: { srcFactor: "src-alpha", dstFactor: "one" }, alpha: { srcFactor: "src-alpha", dstFactor: "one" } };
    const normal: GPUBlendState = { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
    const make = (label: string, vs: string, buffers: GPUVertexBufferLayout[], fs: string, o: { constants?: Record<string, number>; blend?: GPUBlendState; depthWrite?: boolean; strip?: boolean; cull?: GPUCullMode } = {}) =>
      d.createRenderPipelineAsync({
        label, layout,
        vertex: { module, entryPoint: vs, buffers },
        fragment: { module, entryPoint: fs, targets: [{ format, blend: o.blend }], constants: o.constants },
        primitive: { topology: o.strip ? "triangle-strip" : "triangle-list", cullMode: o.cull ?? "back", frontFace: "ccw" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: o.depthWrite ?? true, depthCompare: "less-equal" },
        multisample: { count: samples },
      });
    const [plate, base, fancy, rim, ring, sprite, particle] = await Promise.all([
      make("plate", "vsMeshColor", [vtx, col], "fsPhysical", { constants: { PLATE: 1 } }),
      make("physical", "vsMesh", [vtx], "fsPhysical"),
      lite ? Promise.resolve(null) : make("physical-sheen-iridescence", "vsMesh", [vtx], "fsPhysical", { constants: { SHEEN: 1, IRID: 1 } }),
      make("rim", "vsMesh", [vtx], "fsPhysical", { constants: { TRANSPARENT: 1 }, blend: normal }),
      make("ring", "vsRing", [vtx], "fsFlat", { blend: additive, depthWrite: false }),
      make("glow", "vsSprite", [], "fsGlow", { blend: additive, depthWrite: false, strip: true, cull: "none" }),
      make("sparks", "vsParticle", [], "fsGlow", { blend: additive, depthWrite: false, strip: true, cull: "none" }),
    ]);
    return { plate, base, fancy, rim, ring, sprite, particle };
  }

  destroy() {
    this.geos.forEach((g) => { g.vertex.destroy(); g.color.destroy(); g.index.destroy(); });
    this.geos.clear();
    this.env?.tex.destroy(); this.glow?.tex.destroy(); this.ao?.tex.destroy();
    this.device.destroy();
  }
}

// ---------- dispositivo condiviso ----------

let current: { engine: Engine | null; ready: Promise<Engine> } | null = null;
let refs = 0, releaseTimer: ReturnType<typeof setTimeout> | undefined;

async function createEngine(): Promise<Engine> {
  if (!webgpuAvailable()) throw new Error("WebGPU non disponibile");
  // un logo decorativo non deve svegliare la GPU dedicata dei portatili con due GPU: basta quella integrata
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("Nessun adattatore WebGPU");
  const info: any = (adapter as any).info || {};
  const fallback = !!(info.isFallbackAdapter ?? (adapter as any).isFallbackAdapter);
  if (fallback && !allowSoftware) throw new Error("Adattatore WebGPU software: si usa il logo SVG");
  const device = await adapter.requestDevice({ label: "logo3d" });
  device.addEventListener("uncapturederror", (e: any) => console.error("logo3d WebGPU:", e.error?.message || e));
  const engine = new Engine(device, { vendor: info.vendor || "", architecture: info.architecture || "", fallback });
  await engine.init();
  if (engine.lost) throw new Error("Dispositivo WebGPU perso durante l'avvio");
  return engine;
}

export function acquireEngine(): Promise<Engine> {
  refs++;
  if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = undefined; }
  if (!current) {
    const slot: { engine: Engine | null; ready: Promise<Engine> } = { engine: null, ready: null as any };
    slot.ready = createEngine().then((e) => { slot.engine = e; return e; }, (err) => { if (current === slot) current = null; throw err; });
    current = slot;
  }
  return current.ready;
}

export function releaseEngine() {
  refs = Math.max(0, refs - 1);
  if (refs > 0 || releaseTimer || !current) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = undefined;
    if (refs > 0 || !current) return;
    const slot = current; current = null;
    slot.ready.then((e) => e.destroy(), () => {});
  }, KEEP_ALIVE_MS);
}

// ---------- un logo su un canvas ----------

export class LogoView {
  private readonly context: GPUCanvasContext;
  private readonly frame: GPUBuffer;
  private readonly particles: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly packer: FramePacker;
  private readonly geo: GeoBuffers;
  private readonly samples: number;
  private pipes: Pipelines | null = null;
  private bundle: GPURenderBundle | null = null;
  private color: GPUTexture | null = null;
  private depth: GPUTexture | null = null;
  // descrittore del passaggio riusato a ogni fotogramma: cambia solo la texture del canvas
  private readonly colorAtt: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" };
  private readonly depthAtt: GPURenderPassDepthStencilAttachment = { view: null as unknown as GPUTextureView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" };
  private readonly passDesc: GPURenderPassDescriptor = { colorAttachments: [this.colorAtt], depthStencilAttachment: this.depthAtt };
  private size = { w: 0, h: 0, pw: 0, ph: 0 };
  private dead = false;
  // Qualità adattiva: ogni 15 fotogrammi si misura quanto impiega la GPU a completare il lavoro inviato. Se per tre misure
  // di fila supera il 60% del tempo del fotogramma la risoluzione interna scende del 20% (mai sotto un pixel per pixel
  // CSS); se resta sotto il 20% per una ventina di misure risale. L'animazione e il disegno restano identici.
  scale = 1;
  minScale = 1;
  onScale: (() => void) | null = null;
  private probe = { n: 0, slow: 0, fast: 0, busy: false };

  constructor(private readonly engine: Engine, readonly canvas: HTMLCanvasElement, readonly q: Quality) {
    const d = engine.device;
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Contesto WebGPU non disponibile");
    this.context = ctx;
    ctx.configure({ device: d, format: engine.format, alphaMode: "premultiplied" });
    this.samples = MSAA;
    this.packer = new FramePacker(q);
    this.geo = engine.geometry(q);
    this.frame = d.createBuffer({ label: "logo-frame", size: this.packer.data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particles = d.createBuffer({ label: "logo-sparks", size: 80 * 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const e = engine.env, s = engine.samplers;
    this.bindGroup = d.createBindGroup({
      layout: engine.layout,
      entries: [
        { binding: 0, resource: { buffer: this.frame } }, { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: e.view }, { binding: 3, resource: s.env },
        { binding: 4, resource: engine.glow.view }, { binding: 5, resource: s.glow },
        { binding: 6, resource: engine.ao.view },
      ],
    });
  }

  async ready() { this.pipes = await this.engine.pipelinesFor(this.samples, this.q.mobile); }

  // dimensione in pixel CSS e densità dei pixel: il canvas si ridimensiona solo quando cambia davvero
  resize(w: number, h: number, ratio: number) {
    this.minScale = Math.min(1, 1 / Math.max(1, ratio / this.scale));
    const pw = Math.max(1, Math.floor(w * ratio)), ph = Math.max(1, Math.floor(h * ratio));
    if (w !== this.size.w || h !== this.size.h) this.packer.resize(w, h);
    // unità del mondo per pixel a distanza 1 dalla camera (spessore minimo delle orbite)
    this.packer.data[51] = (2 * Math.tan(((FOV / 2) * Math.PI) / 180)) / ph;
    if (pw === this.size.pw && ph === this.size.ph) { this.size.w = w; this.size.h = h; return; }
    this.size = { w, h, pw, ph };
    this.canvas.width = pw; this.canvas.height = ph;
    this.color?.destroy(); this.depth?.destroy();
    const d = this.engine.device;
    // MSAA: i campioni restano nella memoria di lavoro della GPU (storeOp "discard") e si risolvono direttamente nel canvas
    this.color = this.samples > 1 ? d.createTexture({ label: "logo-msaa", size: [pw, ph], format: this.engine.format, sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    this.depth = d.createTexture({ label: "logo-depth", size: [pw, ph], format: "depth24plus", sampleCount: this.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    if (this.color) { this.colorAtt.view = this.color.createView(); this.colorAtt.storeOp = "discard"; }
    else this.colorAtt.storeOp = "store";
    this.depthAtt.view = this.depth.createView();
  }

  get pixelSize() { return { w: this.size.pw, h: this.size.ph }; }

  // disegno di tutta la scena; durante l'entrata la C e la pista crescono, poi la sequenza è sempre la stessa e si
  // registra una volta sola in un render bundle
  private encode(p: GPURenderPassEncoder | GPURenderBundleEncoder, arcCount: number, lineCount: number) {
    const P = this.pipes!, m = this.geo.meshes, nSprites = this.packer.sprites, nParticles = this.q.particles;
    p.setBindGroup(0, this.bindGroup);
    p.setIndexBuffer(this.geo.index, "uint16");
    p.setVertexBuffer(0, this.geo.vertex);
    p.setVertexBuffer(1, this.geo.color);
    p.setPipeline(P.plate);
    p.draw(m.plate.count, 1, m.plate.first, OBJ.plate);
    p.setPipeline(P.base);
    p.drawIndexed(m.gold.count, 1, m.gold.first, m.gold.base, OBJ.gold);
    p.drawIndexed(m.chip.count, 1, m.chip.first, m.chip.base, OBJ.chip);
    p.drawIndexed(m.cap.count, 1, m.cap.first, m.cap.base, OBJ.amber);
    if (P.fancy) p.setPipeline(P.fancy);
    if (arcCount) p.drawIndexed(arcCount, 1, m.arc.first, m.arc.base, OBJ.arc);
    if (lineCount) p.drawIndexed(lineCount, 1, m.line.first, m.line.base, OBJ.line);
    p.drawIndexed(m.cap.count, 2, m.cap.first, m.cap.base, OBJ.pearl);
    // trasparenti: ciò che sta dietro al filetto, il filetto, ciò che sta davanti (gli shader scartano l'altra fase)
    for (const phase of [0, 1]) {
      if (phase) { p.setPipeline(P.rim); p.draw(m.rim.count, 1, m.rim.first, OBJ.rim); }
      p.setPipeline(P.ring);
      p.drawIndexed(m.ring0.count, 1, m.ring0.first, m.ring0.base, OBJ.ring0 + phase * OBJ_PHASE);
      p.drawIndexed(m.ring1.count, 1, m.ring1.first, m.ring1.base, OBJ.ring1 + phase * OBJ_PHASE);
      p.setPipeline(P.sprite);
      p.draw(4, nSprites, 0, phase * SPRITE_PHASE);
      p.setPipeline(P.particle);
      p.draw(4, nParticles, 0, phase * PARTICLE_PHASE);
    }
  }

  private adapt(ms: number, interval: number) {
    const p = this.probe;
    if (ms > interval * 0.6) { p.fast = 0; if (++p.slow >= 3 && this.scale > this.minScale) { p.slow = 0; this.scale = Math.max(this.minScale, this.scale * 0.8); this.onScale?.(); } }
    else if (ms < interval * 0.2) { p.slow = 0; if (++p.fast >= 20 && this.scale < 1) { p.fast = 0; this.scale = Math.min(1, this.scale / 0.8); this.onScale?.(); } }
    else p.slow = p.fast = 0;
  }

  render(anim: LogoAnim, interval = 1000 / 30) {
    if (this.dead || this.engine.lost || !this.pipes || !this.depth) return false;
    const d = this.engine.device, m = this.geo.meshes;
    this.packer.pack(anim);
    d.queue.writeBuffer(this.frame, 0, this.packer.data);
    if (anim.dirty) { const [a, b] = anim.dirty; d.queue.writeBuffer(this.particles, a * 32, anim.particles, a * 8, (b - a) * 8); anim.dirty = null; }
    const target = this.context.getCurrentTexture().createView();
    if (this.color) this.colorAtt.resolveTarget = target; else this.colorAtt.view = target;
    const enc = d.createCommandEncoder();
    const pass = enc.beginRenderPass(this.passDesc);
    if (anim.introDone) {
      if (!this.bundle) {
        const be = d.createRenderBundleEncoder({ label: "logo", colorFormats: [this.engine.format], depthStencilFormat: "depth24plus", sampleCount: this.samples });
        this.encode(be, m.arc.count, m.line.count);
        this.bundle = be.finish();
      }
      pass.executeBundles([this.bundle]);
    } else {
      this.encode(pass, Math.floor((m.arc.count * anim.arcK) / 3) * 3, Math.floor((m.line.count * anim.lineK) / 3) * 3);
    }
    pass.end();
    d.queue.submit([enc.finish()]);
    const p = this.probe;
    if (++p.n % 15 === 0 && !p.busy) {
      p.busy = true;
      const t0 = performance.now();
      d.queue.onSubmittedWorkDone().then(() => { p.busy = false; if (!this.dead) this.adapt(performance.now() - t0, interval); }, () => { p.busy = false; });
    }
    return true;
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.color?.destroy(); this.depth?.destroy();
    this.frame.destroy(); this.particles.destroy();
    try { this.context.unconfigure(); } catch {}
  }
}
