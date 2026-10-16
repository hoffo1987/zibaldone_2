// Motore WebGPU della sala del podio: GPUDevice dedicato (acquirePodiumDevice). Una volta all'avvio: geometrie
// (meshes.ts), texture procedurali di marmo e stoffa con le mip, l'atlante dei numeri incisi e dell'emblema (Canvas 2D).
// Ogni fotogramma:
//  1. compute: nuvole sul piano del vetro + mip (la penombra delle nuvole sceglie il livello)
//  2. render:  profondità dal piano del vetro lungo la luce (mappa d'ombra, filtrata poi con PCSS)
//  3. compute: un dodicesimo delle sonde di luce, raggi fissi (niente sfarfallio), rimbalzi multipli dal riuso
//  4. render:  una faccia della cubemap della sala (riflessi delle superfici lucide) + mip
//  5. render:  la sala capovolta per il riflesso del pavimento, a risoluzione ridotta + mip
//  6. render:  la sala con MSAA 4×: superfici, cielo, pulviscolo nei raggi
//  7. render:  fasci di luce a risoluzione ridotta, accumulati con il fotogramma precedente
//  8. render:  composizione (sui computer i campioni dell'MSAA pesati sulla luminanza), bloom, ACES, sRGB
//  9. render:  dalla risoluzione della scena (adattiva) ai pixel dello schermo, Catmull-Rom, sul canvas
// Il canvas ha sempre i pixel dello schermo: cambiare la risoluzione della scena non lo ridimensiona (niente lampi) e
// l'immagine non passa dal filtro bilineare del browser. Al massimo tre fotogrammi in coda sulla GPU.
import { buildScene, VERTEX_FLOATS } from "./meshes";
import { texgenShader, mipShader, cloudShader, shadowShader, giShader, sceneShader, volShader, postShader, combineMSShader, GI_PROBES, FRAME_FLOATS, PASS_FLOATS, type PodiumQuality } from "./shaders";
import { camera, viewProj, celestial, moodAt, lightMatrix, LIGHT_RECT, STILL, type Cam, type CamMotion } from "./stage";
import type { Freddy } from './freddy';

export { podiumQuality, type PodiumQuality } from "./shaders";

const MSAA = 4;
const HDR: GPUTextureFormat = "rgba16float";
const CLOUD = [512, Math.round((512 * (LIGHT_RECT.y1 - LIGHT_RECT.y0)) / (LIGHT_RECT.x1 - LIGHT_RECT.x0))];
const ENV_POS = [0, 3.0, 0.6]; // centro della cubemap: sopra il primo gradino, all'altezza delle coppe
const PLANAR_MIPS = 6, ENV_MIPS = 8;
const RT = GPUTextureUsage;
const mipCount = (w: number, h: number) => Math.floor(Math.log2(Math.max(w, h))) + 1;
type Geometry = { vertex: GPUBuffer; index: GPUBuffer; ranges: Record<string, [number, number]> };
// The podium device is retained for 30 seconds between visits. Keep its immutable mesh buffers as well,
// so reopening the room does not regenerate and upload 161,539 vertices. Device destruction frees the buffers.
const geometryCache = new WeakMap<GPUDevice, Map<boolean, Geometry>>();
const pipelineCache = new WeakMap<GPUDevice, Map<string, Promise<any>>>();
type Materials = { marble: GPUTexture; fabric: GPUTexture; decal: GPUTexture; initialized: boolean };
const materialCache = new WeakMap<GPUDevice, Map<boolean, Materials>>();
function materials(device: GPUDevice, mobile: boolean): Materials {
  let variants = materialCache.get(device);
  if (!variants) { variants = new Map(); materialCache.set(device, variants); }
  const saved = variants.get(mobile); if (saved) return saved;
  const ms = mobile ? 512 : 1024, usage = RT.STORAGE_BINDING | RT.TEXTURE_BINDING;
  const marble = device.createTexture({ label: "podium-marble", size: [ms, ms], format: "rgba8unorm", mipLevelCount: mipCount(ms, ms), usage });
  const fabric = device.createTexture({ label: "podium-fabric", size: [256, 256], format: "rgba8unorm", mipLevelCount: mipCount(256, 256), usage });
  const decal = device.createTexture({ label: "podium-decal", size: [1024, 1024], format: "rgba8unorm", mipLevelCount: mipCount(1024, 1024), usage: usage | RT.COPY_DST | RT.RENDER_ATTACHMENT });
  const result = { marble, fabric, decal, initialized: false }; variants.set(mobile, result); return result;
}
function geometry(device: GPUDevice, mobile: boolean): Geometry {
  let variants = geometryCache.get(device);
  if (!variants) { variants = new Map(); geometryCache.set(device, variants); }
  const saved = variants.get(mobile); if (saved) return saved;
  const mesh = buildScene(mobile), usage = GPUBufferUsage.COPY_DST;
  const vertex = device.createBuffer({ label: "podium-vertices", size: mesh.vertices.byteLength, usage: GPUBufferUsage.VERTEX | usage });
  const index = device.createBuffer({ label: "podium-indices", size: mesh.indices.byteLength, usage: GPUBufferUsage.INDEX | usage });
  device.queue.writeBuffer(vertex, 0, mesh.vertices); device.queue.writeBuffer(index, 0, mesh.indices);
  const result = { vertex, index, ranges: mesh.ranges }; variants.set(mobile, result); return result;
}

// facce della cubemap (convenzione WebGPU: +X, -X, +Y, -Y, +Z, -Z): direzione, destra e alto dell'immagine
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

// atlante delle incisioni (canale rosso): in alto i numeri 1, 2, 3 (celle 256×512, schiacciate in orizzontale perché il
// gradino le stende su un quadrato), in basso a sinistra l'emblema degli stendardi (corona d'alloro e stella)
function decalCanvas() {
  const S = 1024, cv = document.createElement("canvas");
  cv.width = S; cv.height = S;
  const g = cv.getContext("2d");
  if (!g) return cv;
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
  g.fillStyle = "#fff"; g.strokeStyle = "#fff";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.filter = "blur(2px)";
  ["1", "2", "3"].forEach((d, i) => {
    g.setTransform(0.5, 0, 0, 1, i * 256 + 128, 268);
    g.font = "700 470px Georgia, 'Times New Roman', serif";
    g.fillText(d, 0, 0);
  });
  // emblema: il quadrato dell'atlante copre 2,2 × 2,6 m di stoffa, si allarga in orizzontale per tenerlo tondo
  g.setTransform(1.17, 0, 0, 1, 256, 768);
  g.filter = "blur(1.2px)";
  g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 205, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 186, 0, Math.PI * 2); g.stroke();
  for (const s of [-1, 1]) {
    // rami d'alloro: foglie a goccia lungo un arco, dal basso verso l'alto
    for (let k = 0; k < 11; k++) {
      const a = Math.PI / 2 + s * (0.35 + k * 0.215), r = 150;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      for (const side of [-1, 1]) {
        g.save(); g.translate(x, y); g.rotate(a + s * Math.PI / 2 + side * 0.55 * s);
        g.beginPath(); g.ellipse(0, -side * 17, 9, 22, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 150, Math.PI / 2 + s * 0.3, Math.PI / 2 + s * 2.55, s < 0); g.stroke();
  }
  g.beginPath();
  for (let k = 0; k < 10; k++) { const r = k % 2 ? 38 : 92, a = -Math.PI / 2 + (k * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}

// pw, ph: la scena; cw, ch: il canvas (pixel dello schermo)
type Sized = {
  pw: number; ph: number; cw: number; ch: number; vw: number; vh: number; rw: number; rh: number;
  textures: GPUTexture[];
  color: GPUTextureView; depth: GPUTextureView; scene: GPUTextureView | null; comb: GPUTextureView; ldr: GPUTextureView;
  vol: GPUTextureView[]; planar: GPUTextureView; planarDepth: GPUTextureView; bloom: GPUTextureView[];
  bundle: GPURenderBundle;
  frameMain: GPUBindGroup; volGroups: GPUBindGroup[]; planarMips: GPUBindGroup[];
  combine: GPUBindGroup[]; down: GPUBindGroup[]; up: GPUBindGroup[]; tone: GPUBindGroup; final: GPUBindGroup;
};

export class PodiumView {
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly frameBuf: GPUBuffer;
  private readonly passBuf: { main: GPUBuffer; planar: GPUBuffer; env: GPUBuffer[] };
  private readonly postBuf: [GPUBuffer, GPUBuffer, GPUBuffer]; // primo livello del bloom / gli altri passaggi / il passaggio finale
  private readonly gi: GPUBuffer;
  private readonly vbuf: GPUBuffer;
  private readonly ibuf: GPUBuffer;
  private readonly ranges: Record<string, [number, number]>;
  private readonly shadow: GPUTexture;
  private readonly cloud: GPUTexture;
  private readonly marble: GPUTexture;
  private readonly fabric: GPUTexture;
  private readonly decal: GPUTexture;
  private readonly materials: Materials;
  private readonly env: GPUTexture;
  private readonly envDepth: GPUTexture;
  private readonly shadowView: GPUTextureView;
  private readonly envDepthView: GPUTextureView;
  private readonly dummy2d: GPUTexture;
  private readonly dummyCube: GPUTexture;
  private readonly samplers: { cmp: GPUSampler; lin: GPUSampler; aniso: GPUSampler };
  private readonly layouts: { frameRW: GPUBindGroupLayout; frame: GPUBindGroupLayout; pass: GPUBindGroupLayout; volx: GPUBindGroupLayout; post: GPUBindGroupLayout; postMS: GPUBindGroupLayout };
  private readonly frameData = new Float32Array(FRAME_FLOATS);
  private readonly passData = new Float32Array(PASS_FLOATS);
  private readonly postData = new Float32Array(4);
  private readonly ownTextures: GPUTexture[] = [];
  private pipes: any = null;
  private groups: any = null;
  private sized: Sized | null = null;
  private cam: Cam | null = null;
  private base: { pw: number; ph: number; left: number; top: number } | null = null;
  private motion: CamMotion = STILL;
  private readonly cups = new Float32Array(12);
  // tempo della GPU per fotogramma (ms), misurato con le marche temporali dove il dispositivo le offre: in tutto e la
  // parte che non dipende dalla risoluzione (nuvole, ombre, sonde, cubemap)
  private readonly ts: { set: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer[]; busy: boolean[] } | null = null;
  gpuMs = 0;
  gpuFixedMs = 0;
  // sui computer l'MSAA si risolve a mano, pesato sulla luminanza; sui telefoni lo risolve l'hardware (memoria)
  private readonly weighted: boolean;
  private frameNo = 0; private vflip = 0; private fresh = true; private warm = false; private envAll = true;
  private inflight = 0;
  private dead = false;
  private freddy: Freddy | null = null;
  private freddyPending: Promise<boolean> | null = null;
  private freddyAbort = new AbortController();
  private freddyVisible = false;
  private secretLight = 0;
  onError: ((e: Error) => void) | null = null;

  constructor(private readonly device: GPUDevice, readonly canvas: HTMLCanvasElement, readonly q: PodiumQuality, timestamps = false) {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("Contesto WebGPU non disponibile");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });
    const d = device;
    const buf = (label: string, size: number, usage: number) => d.createBuffer({ label, size, usage });
    const UNI = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.frameBuf = buf("podium-frame", FRAME_FLOATS * 4, UNI);
    this.passBuf = { main: buf("podium-pass", PASS_FLOATS * 4, UNI), planar: buf("podium-pass-planar", PASS_FLOATS * 4, UNI), env: FACES.map((_, i) => buf(`podium-pass-env${i}`, PASS_FLOATS * 4, UNI)) };
    this.postBuf = [buf("podium-post0", 16, UNI), buf("podium-post1", 16, UNI), buf("podium-post2", 16, UNI)];
    this.weighted = !q.mobile;
    this.gi = buf("podium-gi", GI_PROBES * 6 * 16, GPUBufferUsage.STORAGE);
    if (timestamps) this.ts = {
      set: d.createQuerySet({ type: "timestamp", count: 3 }),
      resolve: buf("podium-ts", 24, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC),
      read: [0, 1, 2].map((i) => buf(`podium-ts-read${i}`, 24, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST)),
      busy: [false, false, false],
    };

    const mesh = geometry(d, q.mobile);
    this.ranges = mesh.ranges; this.vbuf = mesh.vertex; this.ibuf = mesh.index;

    const tex = (desc: GPUTextureDescriptor) => { const t = d.createTexture(desc); this.ownTextures.push(t); return t; };
    this.shadow = tex({ label: "podium-shadow", size: q.shadow, format: "depth32float", usage: RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING });
    this.cloud = tex({ label: "podium-clouds", size: CLOUD, format: HDR, mipLevelCount: mipCount(CLOUD[0], CLOUD[1]), usage: RT.STORAGE_BINDING | RT.TEXTURE_BINDING });
    this.materials = materials(d, q.mobile);
    this.marble = this.materials.marble; this.fabric = this.materials.fabric; this.decal = this.materials.decal;
    this.env = tex({ label: "podium-env", size: [q.envSize, q.envSize, 6], format: HDR, mipLevelCount: ENV_MIPS, usage: RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING | RT.STORAGE_BINDING });
    this.envDepth = tex({ label: "podium-env-depth", size: [q.envSize, q.envSize], format: "depth24plus", usage: RT.RENDER_ATTACHMENT });
    this.shadowView = this.shadow.createView();
    this.envDepthView = this.envDepth.createView();
    this.dummy2d = tex({ label: "podium-dummy", size: [1, 1], format: HDR, usage: RT.TEXTURE_BINDING });
    this.dummyCube = tex({ label: "podium-dummy-cube", size: [1, 1, 6], format: HDR, usage: RT.TEXTURE_BINDING });

    this.samplers = {
      cmp: d.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" }),
      lin: d.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" }),
      aniso: d.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear", addressModeU: "repeat", addressModeV: "repeat", maxAnisotropy: 8 }),
    };

    const C = GPUShaderStage.COMPUTE, VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, Fr = GPUShaderStage.FRAGMENT;
    const frameEntries = (v: number, gi: GPUBufferBindingType): GPUBindGroupLayoutEntry[] => [
      { binding: 0, visibility: v, buffer: { type: "uniform" } },
      { binding: 1, visibility: v, texture: { sampleType: "depth" } },
      { binding: 2, visibility: v, sampler: { type: "comparison" } },
      { binding: 3, visibility: v, texture: { sampleType: "float" } },
      { binding: 4, visibility: v, sampler: { type: "filtering" } },
      { binding: 5, visibility: v, buffer: { type: gi } },
      { binding: 6, visibility: v, texture: { sampleType: "float" } },
      { binding: 7, visibility: v, texture: { sampleType: "float" } },
      { binding: 8, visibility: v, texture: { sampleType: "float" } },
      { binding: 9, visibility: v, sampler: { type: "filtering" } },
      { binding: 10, visibility: v, texture: { sampleType: "float", viewDimension: "cube" } },
      { binding: 11, visibility: v, texture: { sampleType: "float" } },
    ];
    this.layouts = {
      frameRW: d.createBindGroupLayout({ label: "podium-frame-rw", entries: frameEntries(C, "storage") }),
      frame: d.createBindGroupLayout({ label: "podium-frame", entries: frameEntries(VF, "read-only-storage") }),
      pass: d.createBindGroupLayout({ label: "podium-pass", entries: [{ binding: 0, visibility: VF, buffer: { type: "uniform" } }] }),
      volx: d.createBindGroupLayout({ label: "podium-volx", entries: [{ binding: 0, visibility: Fr, texture: { sampleType: "depth", multisampled: true } }, { binding: 1, visibility: Fr, texture: { sampleType: "unfilterable-float" } }] }),
      post: d.createBindGroupLayout({ label: "podium-post", entries: [{ binding: 0, visibility: Fr, texture: { sampleType: "float" } }, { binding: 1, visibility: Fr, sampler: { type: "filtering" } }, { binding: 2, visibility: Fr, texture: { sampleType: "float" } }, { binding: 3, visibility: Fr, buffer: { type: "uniform" } }] }),
      postMS: d.createBindGroupLayout({ label: "podium-post-ms", entries: [{ binding: 0, visibility: Fr, texture: { sampleType: "unfilterable-float", multisampled: true } }, { binding: 1, visibility: Fr, sampler: { type: "filtering" } }, { binding: 2, visibility: Fr, texture: { sampleType: "float" } }, { binding: 3, visibility: Fr, buffer: { type: "uniform" } }] }),
    };

    // le sei camere della cubemap non cambiano mai
    const E = q.envSize;
    FACES.forEach(([fwd, right, up], i) => {
      const c: Cam = { pos: ENV_POS, right, up, fwd, tan: 1, cx: E / 2, cy: E / 2, h: E, w: E };
      this.device.queue.writeBuffer(this.passBuf.env[i], 0, this.packPass(c, viewProj(c, 0.05, 90), 2, E, E));
    });
  }

  private packPass(c: Cam, vp: Float32Array, mode: number, tw: number, th: number, sx = 1, sy = 1) {
    const p = this.passData;
    p.set(vp, 0);
    p.set([c.pos[0], c.pos[1], c.pos[2], c.tan, c.right[0], c.right[1], c.right[2], c.cx * sx, c.up[0], c.up[1], c.up[2], c.cy * sy, c.fwd[0], c.fwd[1], c.fwd[2], c.h * sy, 0, mode, tw, th], 16);
    return p;
  }

  private frameGroup(layout: GPUBindGroupLayout, env: GPUTextureView, planar: GPUTextureView) {
    const s = this.samplers;
    const res = [this.frameBuf, this.shadow.createView(), s.cmp, this.cloud.createView(), s.lin, this.gi, this.marble.createView(), this.fabric.createView(), this.decal.createView(), s.aniso, env, planar];
    return this.device.createBindGroup({ layout, entries: res.map((r, i) => ({ binding: i, resource: r instanceof GPUBuffer ? { buffer: r } : r })) });
  }

  // catena delle mip con il compute (riduzione 2×2): un gruppo per livello
  private mipGroups(pipe: GPUComputePipeline, t: GPUTexture, levels: number, array = false, face = 0, layers = 6) {
    const out: GPUBindGroup[] = [];
    for (let k = 1; k < levels; k++) {
      const view = (l: number) => t.createView(array ? { dimension: "2d-array", baseMipLevel: l, mipLevelCount: 1, baseArrayLayer: face, arrayLayerCount: layers } : { baseMipLevel: l, mipLevelCount: 1 });
      out.push(this.device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: view(k - 1) }, { binding: 1, resource: view(k) }] }));
    }
    return out;
  }
  private runMips(cp: GPUComputePassEncoder, pipe: GPUComputePipeline, groups: GPUBindGroup[], w: number, h: number, layers = 1) {
    cp.setPipeline(pipe);
    groups.forEach((g, k) => { cp.setBindGroup(0, g); cp.dispatchWorkgroups(Math.ceil(Math.max(1, w >> (k + 1)) / 8), Math.ceil(Math.max(1, h >> (k + 1)) / 8), layers); });
  }

  private async buildPipelines() {
    const d = this.device, q = this.q, L = this.layouts;
    const mod = (code: string, label: string) => d.createShaderModule({ label, code });
    const scene = mod(sceneShader(q), "podium-scene"), post = mod(postShader, "podium-post"), vol = mod(volShader(q), "podium-vol");
    const pl = (...g: GPUBindGroupLayout[]) => d.createPipelineLayout({ bindGroupLayouts: g });
    const compute = (code: string, label: string, entryPoint: string, layout: GPUPipelineLayout | "auto" = "auto") => d.createComputePipelineAsync({ label, layout, compute: { module: mod(code, label), entryPoint } });
    const vertexLayout = (full: boolean): GPUVertexBufferLayout[] => [{
      arrayStride: VERTEX_FLOATS * 4,
      attributes: full
        ? [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" }, { shaderLocation: 2, offset: 24, format: "float32x2" }, { shaderLocation: 3, offset: 32, format: "float32" }, { shaderLocation: 4, offset: 36, format: "float32" }]
        : [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 2, offset: 24, format: "float32x2" }, { shaderLocation: 3, offset: 32, format: "float32" }],
    }];
    const sceneLayout = pl(L.frame, L.pass);
    type RO = { vs: string; fs: string; msaa: boolean; cull?: GPUCullMode; depth: "write" | "test" | "sky"; strip?: boolean; add?: boolean; buffers?: boolean; depthFormat?: GPUTextureFormat };
    const render = (o: RO) => d.createRenderPipelineAsync({
      layout: sceneLayout,
      vertex: { module: scene, entryPoint: o.vs, buffers: o.buffers ? vertexLayout(true) : [] },
      fragment: { module: scene, entryPoint: o.fs, targets: [{ format: HDR, blend: o.add ? { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } } : undefined }] },
      primitive: { topology: o.strip ? "triangle-strip" : "triangle-list", cullMode: o.cull ?? "none", frontFace: "ccw" },
      depthStencil: { format: o.depthFormat ?? "depth32float", depthWriteEnabled: o.depth === "write", depthCompare: o.depth === "sky" ? "less-equal" : "less" },
      multisample: { count: o.msaa ? MSAA : 1 },
    });
    const full = (module: GPUShaderModule, fs: string, layout: GPUPipelineLayout, format: GPUTextureFormat, add = false) => d.createRenderPipelineAsync({
      layout, vertex: { module, entryPoint: "vsFull" },
      fragment: { module, entryPoint: fs, targets: [{ format, blend: add ? { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } } : undefined }] },
      primitive: { topology: "triangle-list" },
    });
    const postLayout = pl(L.post);
    const [texgen, mip8, mip16, mipCube, clouds, gi, shadow, main, sky, dust, flat, flatSky, volP, combine, down, up, tone, final] = await Promise.all([
      compute(texgenShader, "podium-texgen", "texgen"),
      compute(mipShader("rgba8unorm", false), "podium-mip8", "mip"),
      compute(mipShader("rgba16float", false), "podium-mip16", "mip"),
      compute(mipShader("rgba16float", true), "podium-mipcube", "mip"),
      compute(cloudShader, "podium-clouds", "clouds"),
      compute(giShader(q), "podium-gi", "gi", pl(L.frameRW)),
      d.createRenderPipelineAsync({
        label: "podium-shadow", layout: "auto",
        vertex: { module: mod(shadowShader, "podium-shadow"), entryPoint: "vsShadow", buffers: vertexLayout(false) },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
      }),
      render({ vs: "vsScene", fs: "fsScene", msaa: true, cull: "back", depth: "write", buffers: true }),
      render({ vs: "vsSky", fs: "fsSky", msaa: true, depth: "sky" }),
      render({ vs: "vsDust", fs: "fsDust", msaa: true, depth: "test", strip: true, add: true }),
      // riflessi (cubemap e pavimento): l'immagine è specchiata, l'avvolgimento dei triangoli si inverte
      render({ vs: "vsScene", fs: "fsScene", msaa: false, cull: "front", depth: "write", buffers: true, depthFormat: "depth24plus" }),
      render({ vs: "vsSky", fs: "fsSky", msaa: false, depth: "sky", depthFormat: "depth24plus" }),
      full(vol, "fsVol", pl(L.frame, L.pass, L.volx), HDR),
      this.weighted ? full(mod(combineMSShader, "podium-combine-ms"), "fsCombineMS", pl(L.postMS), HDR) : full(post, "fsCombine", postLayout, HDR),
      full(post, "fsDown", postLayout, HDR),
      full(post, "fsUp", postLayout, HDR, true),
      full(post, "fsTone", postLayout, HDR),
      full(post, "fsFinal", postLayout, this.format),
    ]);
    return { texgen, mip8, mip16, mipCube, clouds, gi, shadow, main, sky, dust, flat, flatSky, vol: volP, combine, down, up, tone, final };
  }

  async ready() {
    const d = this.device, L = this.layouts;
    let variants = pipelineCache.get(d);
    if (!variants) { variants = new Map(); pipelineCache.set(d, variants); }
    const key = JSON.stringify([this.format, this.q]);
    let ready = variants.get(key);
    if (!ready) {
      ready = this.buildPipelines(); variants.set(key, ready);
      const cache = variants;
      ready.catch(() => { if (cache.get(key) === ready) cache.delete(key); });
    }
    const pipes = await ready;
    if (this.dead) return;
    this.pipes = pipes;
    const { clouds, gi, shadow, mip8, mip16, mipCube } = pipes;

    // gruppi che non dipendono dalle dimensioni del canvas
    const dummy2d = this.dummy2d.createView(), dummyCube = this.dummyCube.createView({ dimension: "cube" });
    this.groups = {
      clouds: d.createBindGroup({ layout: clouds.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.frameBuf } }, { binding: 1, resource: this.cloud.createView({ baseMipLevel: 0, mipLevelCount: 1 }) }] }),
      cloudMips: this.mipGroups(mip16, this.cloud, this.cloud.mipLevelCount),
      shadow: d.createBindGroup({ layout: shadow.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.frameBuf } }] }),
      gi: this.frameGroup(L.frameRW, dummyCube, dummy2d),
      // nei riflessi la cubemap e il riflesso planare non si leggono (e non si possono leggere mentre si disegnano)
      frameOff: this.frameGroup(L.frame, dummyCube, dummy2d),
      envMips: FACES.map((_, face) => this.mipGroups(mipCube, this.env, ENV_MIPS, true, face, 1)),
      envFaces: FACES.map((_, i) => this.env.createView({ dimension: "2d", baseArrayLayer: i, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 })),
      passMain: d.createBindGroup({ layout: L.pass, entries: [{ binding: 0, resource: { buffer: this.passBuf.main } }] }),
      passPlanar: d.createBindGroup({ layout: L.pass, entries: [{ binding: 0, resource: { buffer: this.passBuf.planar } }] }),
      passEnv: this.passBuf.env.map((b) => d.createBindGroup({ layout: L.pass, entries: [{ binding: 0, resource: { buffer: b } }] })),
      envView: this.env.createView({ dimension: "cube" }),
    };
    const G = this.groups;
    G.envBundles = G.passEnv.map((pass: GPUBindGroup) => this.sceneBundle(false, G.frameOff, pass, ["trophies"]));
    G.planarBundle = this.sceneBundle(false, G.frameOff, G.passPlanar, ["floor"]);

    // texture procedurali e atlante delle incisioni, una volta
    if (this.materials.initialized) return;
    d.queue.copyExternalImageToTexture({ source: decalCanvas() }, { texture: this.decal }, [1024, 1024]);
    const enc = d.createCommandEncoder({ label: "podium-init" });
    const cp = enc.beginComputePass();
    cp.setPipeline(pipes.texgen);
    cp.setBindGroup(0, d.createBindGroup({ layout: pipes.texgen.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.marble.createView({ baseMipLevel: 0, mipLevelCount: 1 }) }, { binding: 1, resource: this.fabric.createView({ baseMipLevel: 0, mipLevelCount: 1 }) }] }));
    cp.dispatchWorkgroups(Math.ceil(this.marble.width / 8), Math.ceil(this.marble.height / 8));
    this.runMips(cp, mip8, this.mipGroups(mip8, this.marble, this.marble.mipLevelCount), this.marble.width, this.marble.height);
    this.runMips(cp, mip8, this.mipGroups(mip8, this.fabric, this.fabric.mipLevelCount), this.fabric.width, this.fabric.height);
    this.runMips(cp, mip8, this.mipGroups(mip8, this.decal, this.decal.mipLevelCount), this.decal.width, this.decal.height);
    cp.end();
    d.queue.submit([enc.finish()]);
    this.materials.initialized = true;
  }

  // w, h: viewport in pixel CSS; ratio: pixel della scena per pixel CSS; out: pixel del canvas per pixel CSS (quelli dello
  // schermo); left, top: barra laterale e intestazione
  resize(w: number, h: number, ratio: number, out: number, left: number, top: number) {
    const pw = Math.max(1, Math.round(w * ratio)), ph = Math.max(1, Math.round(h * ratio));
    const cw = Math.max(1, Math.round(w * out)), ch = Math.max(1, Math.round(h * out));
    this.base = { pw, ph, left: left * ratio, top: top * ratio };
    this.cam = camera(pw, ph, left * ratio, top * ratio, this.motion);
    const z = this.sized;
    if (!this.pipes || this.dead || (z && pw === z.pw && ph === z.ph && cw === z.cw && ch === z.ch)) return;
    const d = this.device, q = this.q, L = this.layouts, P = this.pipes;
    this.sized?.textures.forEach((t) => t.destroy());
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const textures: GPUTexture[] = [];
    const tex = (label: string, tw: number, th: number, format: GPUTextureFormat, usage: number, o: { samples?: number; mips?: number } = {}) => {
      const t = d.createTexture({ label, size: [Math.max(1, tw), Math.max(1, th)], format, usage, sampleCount: o.samples ?? 1, mipLevelCount: o.mips ?? 1 });
      textures.push(t); return t;
    };
    const vw = Math.max(1, Math.round(pw * q.volScale)), vh = Math.max(1, Math.round(ph * q.volScale));
    const rw = Math.max(1, Math.round(pw * q.planarScale)), rh = Math.max(1, Math.round(ph * q.planarScale));
    const color = tex("podium-msaa", pw, ph, HDR, RT.RENDER_ATTACHMENT | (this.weighted ? RT.TEXTURE_BINDING : 0), { samples: MSAA });
    const depth = tex("podium-depth", pw, ph, "depth32float", RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING, { samples: MSAA });
    const scene = this.weighted ? null : tex("podium-scene", pw, ph, HDR, RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING);
    const comb = tex("podium-comb", pw, ph, HDR, RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING);
    const ldr = tex("podium-ldr", pw, ph, HDR, RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING);
    const vol = [0, 1].map((i) => tex(`podium-vol${i}`, vw, vh, HDR, RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING));
    const planarMips = Math.min(PLANAR_MIPS, mipCount(rw, rh));
    const planar = tex("podium-planar", rw, rh, HDR, RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING | RT.STORAGE_BINDING, { mips: planarMips });
    const planarDepth = tex("podium-planar-depth", rw, rh, "depth24plus", RT.RENDER_ATTACHMENT);
    const bloom: GPUTexture[] = [];
    for (let k = 0; k < q.bloom; k++) bloom.push(tex(`podium-bloom${k}`, pw >> (k + 1), ph >> (k + 1), HDR, RT.RENDER_ATTACHMENT | RT.TEXTURE_BINDING));
    const lin = this.samplers.lin, dummy = this.dummy2d.createView();
    const postGroup = (src: GPUTextureView, aux: GPUTextureView, buffer: number, layout = L.post) => d.createBindGroup({ layout, entries: [{ binding: 0, resource: src }, { binding: 1, resource: lin }, { binding: 2, resource: aux }, { binding: 3, resource: { buffer: this.postBuf[buffer] } }] });
    const depthView = depth.createView(), colorView = color.createView(), sceneView = scene ? scene.createView() : null;
    const frameMain = this.frameGroup(L.frame, this.groups.envView, planar.createView());
    this.sized = {
      pw, ph, cw, ch, vw, vh, rw, rh, textures,
      color: colorView, depth: depthView, scene: sceneView, comb: comb.createView(), ldr: ldr.createView(),
      vol: vol.map((v) => v.createView()), planar: planar.createView({ baseMipLevel: 0, mipLevelCount: 1 }), planarDepth: planarDepth.createView(), bloom: bloom.map((b) => b.createView()),
      bundle: this.sceneBundle(true, frameMain, this.groups.passMain, []),
      frameMain,
      // vol[v] si scrive leggendo vol[1-v]
      volGroups: [0, 1].map((v) => d.createBindGroup({ layout: L.volx, entries: [{ binding: 0, resource: depthView }, { binding: 1, resource: vol[1 - v].createView() }] })),
      planarMips: this.mipGroups(P.mip16, planar, planarMips),
      combine: [0, 1].map((v) => (sceneView ? postGroup(sceneView, vol[v].createView(), 1) : postGroup(colorView, vol[v].createView(), 1, L.postMS))),
      down: bloom.map((b, k) => postGroup(k === 0 ? comb.createView() : bloom[k - 1].createView(), dummy, k === 0 ? 0 : 1)),
      up: bloom.slice(1).map((b) => postGroup(b.createView(), dummy, 1)),
      tone: postGroup(comb.createView(), bloom[0].createView(), 1),
      final: postGroup(ldr.createView(), dummy, 2),
    };
    this.fresh = true;
  }

  get camera() { return this.cam; }

  prepareSecret(): Promise<boolean> {
    if (this.dead) return Promise.resolve(false);
    if (this.freddy) return Promise.resolve(true);
    if (!this.freddyPending) this.freddyPending = import('./freddy')
      .then(({ Freddy }) => {
        if (this.dead) return null;
        return Freddy.load(this.device, [this.passBuf.main, this.passBuf.planar, ...this.passBuf.env, this.frameBuf], this.freddyAbort.signal, this.q, this.layouts.frame, this.layouts.pass);
      }).then(model => {
        if (!model) return false;
        if (this.dead) { model.destroy(); return false; }
        this.freddy = model; return true;
      }).catch(err => {
        if (!this.dead) console.warn('Impossibile caricare la sorpresa del podio.', err);
        return false;
      }).finally(() => { this.freddyPending = null; });
    return this.freddyPending;
  }

  private writeFrame(t: number, night: number, turn: number) {
    const s = this.sized!, m = moodAt(night), q = this.q;
    const a = celestial(t, false), b = celestial(t, true);
    const l = a.map((x, i) => x + (b[i] - x) * night), n = Math.hypot(l[0], l[1], l[2]), L = l.map((x) => x / n);
    const u = this.frameData;
    u.set(lightMatrix(L), 0);
    u.set([
      L[0], L[1], L[2], m.sunI, ...m.sun, night, ...m.skyTop, m.exposure, ...m.skyHor, m.ambient,
      ...m.wall, m.fog, ...m.wainscot, m.dust, ...m.ceiling, m.cover, ...m.tileA, t, ...m.tileB, this.frameNo % 4096,
      ...m.stone, q.steps, ...m.darkStone, this.fresh ? 1 : 0.45, ...m.carpet, turn, ...m.banner, this.secretLight, ...m.frame, 0,
      s.pw, s.ph, s.vw, s.vh,
    ], 16);
    u.set(this.cups, 76);
    this.device.queue.writeBuffer(this.frameBuf, 0, u);
    return m;
  }

  private giPass(enc: GPUCommandEncoder) {
    const cp = enc.beginComputePass({ label: "podium-gi" });
    cp.setPipeline(this.pipes.gi); cp.setBindGroup(0, this.groups.gi);
    cp.dispatchWorkgroups(Math.ceil(GI_PROBES / this.q.giPeriod) * 6);
    cp.end();
  }

  private lightPasses(enc: GPUCommandEncoder, stamp = false) {
    const P = this.pipes, G = this.groups;
    const cp = enc.beginComputePass({ label: "podium-clouds", ...(stamp && this.ts ? { timestampWrites: { querySet: this.ts.set, beginningOfPassWriteIndex: 0 } } : {}) });
    cp.setPipeline(P.clouds); cp.setBindGroup(0, G.clouds); cp.dispatchWorkgroups(Math.ceil(CLOUD[0] / 8), Math.ceil(CLOUD[1] / 8));
    this.runMips(cp, P.mip16, G.cloudMips, CLOUD[0], CLOUD[1]);
    cp.end();
    const sp = enc.beginRenderPass({ label: "podium-shadow", colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
    sp.setPipeline(P.shadow); sp.setBindGroup(0, G.shadow);
    sp.setVertexBuffer(0, this.vbuf); sp.setIndexBuffer(this.ibuf, "uint32");
    sp.drawIndexed(this.ibuf.size / 4);
    if (this.freddyVisible) this.freddy?.draw(sp, 8);
    sp.end();
  }

  private drawScene(p: GPURenderPassEncoder | GPURenderBundleEncoder, skip: string[]) {
    p.setVertexBuffer(0, this.vbuf); p.setIndexBuffer(this.ibuf, "uint32");
    for (const [name, [first, count]] of Object.entries(this.ranges)) if (!skip.includes(name) && count > 0) p.drawIndexed(count, 1, first);
  }

  // The draw order, geometry, shaders and uniforms are unchanged. Only record the immutable commands once;
  // uniform buffers still supply the live camera, light, cups and banners on every frame.
  private sceneBundle(main: boolean, frame: GPUBindGroup, pass: GPUBindGroup, skip: string[]) {
    const P = this.pipes;
    const b = this.device.createRenderBundleEncoder({ colorFormats: [HDR], depthStencilFormat: main ? "depth32float" : "depth24plus", sampleCount: main ? MSAA : 1 });
    b.setBindGroup(0, frame); b.setBindGroup(1, pass);
    b.setPipeline(main ? P.main : P.flat); this.drawScene(b, skip);
    b.setPipeline(main ? P.sky : P.flatSky); b.draw(3);
    if (main) { b.setPipeline(P.dust); b.draw(4, this.q.dust); }
    return b.finish();
  }

  // t: secondi; night: 0 giorno … 1 notte; motion: camera; cups: per coppa [angolo, sollevamento, bagliore].
  // Restituisce false se il fotogramma è stato saltato (GPU indietro)
  render(t: number, night: number, motion: CamMotion = STILL, cups?: ArrayLike<number>, secretSeconds = -1, reducedMotion = false) {
    if (this.dead || !this.pipes || !this.sized || !this.base || this.inflight >= 3) return false;
    this.motion = motion;
    if (cups) this.cups.set(cups);
    const b = this.base;
    this.cam = camera(b.pw, b.ph, b.left, b.top, motion);
    const d = this.device, q = this.q, s = this.sized, P = this.pipes, G = this.groups, c = this.cam;
    const first = !this.warm;
    const visible = secretSeconds >= 0 && !!this.freddy;
    if (visible !== this.freddyVisible) this.envAll = true; // No stale face retains Freddy after switching to day.
    this.freddyVisible = visible;
    this.secretLight = visible ? Math.min(1, secretSeconds / 1.1) : 0;
    if (this.freddyVisible) this.freddy!.update(secretSeconds, reducedMotion, c.pos);
    if (first) d.pushErrorScope("validation");

    // all'avvio le sonde si riempiono subito (due giri completi: anche il secondo rimbalzo), poi un turno per fotogramma
    if (!this.warm) {
      for (let k = 0; k < q.giPeriod * 2; k++) {
        this.writeFrame(t, night, k % q.giPeriod);
        const enc = d.createCommandEncoder({ label: "podium-warm" });
        if (k === 0) this.lightPasses(enc);
        this.giPass(enc);
        d.queue.submit([enc.finish()]);
      }
      this.warm = true;
    }
    const m = this.writeFrame(t, night, this.frameNo % q.giPeriod);
    const vp = viewProj(c);
    d.queue.writeBuffer(this.passBuf.main, 0, this.packPass(c, vp, 0, s.pw, s.ph));
    const kx = s.rw / s.pw, ky = s.rh / s.ph;
    d.queue.writeBuffer(this.passBuf.planar, 0, this.packPass(c, vp, 1, s.rw, s.rh, kx, ky));
    const post = this.postData;
    post.set([m.exposure, 0.075 / q.bloom, this.frameNo % 4096, 1]); d.queue.writeBuffer(this.postBuf[0], 0, post);
    post[3] = 0; d.queue.writeBuffer(this.postBuf[1], 0, post);
    post.set([s.cw, s.ch, this.frameNo % 4096, 0]); d.queue.writeBuffer(this.postBuf[2], 0, post);

    const enc = d.createCommandEncoder({ label: "podium" });
    this.lightPasses(enc, true);
    this.giPass(enc);

    // cubemap: una faccia per fotogramma (tutte e sei la prima volta)
    const faces = this.envAll ? [0, 1, 2, 3, 4, 5] : [this.frameNo % 6];
    this.envAll = false;
    for (const f of faces) {
      // fin qui il lavoro non dipende dalla risoluzione della scena
      const stamp = this.ts && f === faces[faces.length - 1] ? { timestampWrites: { querySet: this.ts.set, endOfPassWriteIndex: 1 } } : {};
      const p = enc.beginRenderPass({ label: "podium-env", colorAttachments: [{ view: G.envFaces[f], loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }], depthStencilAttachment: { view: this.envDepthView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" }, ...stamp });
      p.executeBundles([G.envBundles[f]]);
      if (this.freddyVisible) this.freddy?.draw(p, f + 2, G.frameOff);
      p.end();
    }
    // riflesso del pavimento
    {
      const p = enc.beginRenderPass({ label: "podium-planar", colorAttachments: [{ view: s.planar, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }], depthStencilAttachment: { view: s.planarDepth, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" } });
      p.executeBundles([G.planarBundle]);
      if (this.freddyVisible) this.freddy?.draw(p, 1, G.frameOff);
      p.end();
    }
    {
      const cp = enc.beginComputePass({ label: "podium-mips" });
      // The other five faces have not changed. Their mip levels already contain these exact texels.
      for (const f of faces) this.runMips(cp, P.mipCube, G.envMips[f], q.envSize, q.envSize);
      this.runMips(cp, P.mip16, s.planarMips, s.rw, s.rh);
      cp.end();
    }
    // la sala
    {
      const color: GPURenderPassColorAttachment = s.scene ? { view: s.color, resolveTarget: s.scene, loadOp: "clear", storeOp: "discard", clearValue: [0, 0, 0, 1] } : { view: s.color, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] };
      const p = enc.beginRenderPass({ label: "podium-main", colorAttachments: [color], depthStencilAttachment: { view: s.depth, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
      p.executeBundles([s.bundle]);
      if (this.freddyVisible) this.freddy?.draw(p, 0, s.frameMain);
      p.end();
    }
    const v = this.vflip;
    const full = (view: GPUTextureView, pipe: GPURenderPipeline, groups: GPUBindGroup[], load = false, stamp = false) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load ? "load" : "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }], ...(stamp && this.ts ? { timestampWrites: { querySet: this.ts.set, endOfPassWriteIndex: 2 } } : {}) });
      p.setPipeline(pipe); groups.forEach((g, i) => p.setBindGroup(i, g)); p.draw(3); p.end();
    };
    full(s.vol[v], P.vol, [s.frameMain, G.passMain, s.volGroups[v]]);
    full(s.comb, P.combine, [s.combine[v]]);
    s.bloom.forEach((b, k) => full(b, P.down, [s.down[k]]));
    for (let k = s.bloom.length - 1; k >= 1; k--) full(s.bloom[k - 1], P.up, [s.up[k - 1]], true);
    full(s.ldr, P.tone, [s.tone]);
    full(this.ctx.getCurrentTexture().createView(), P.final, [s.final], false, true);
    const ts = this.ts, slot = ts ? ts.busy.indexOf(false) : -1;
    if (ts && slot >= 0) { enc.resolveQuerySet(ts.set, 0, 3, ts.resolve, 0); enc.copyBufferToBuffer(ts.resolve, 0, ts.read[slot], 0, 24); ts.busy[slot] = true; }
    d.queue.submit([enc.finish()]);
    if (ts && slot >= 0) {
      const rb = ts.read[slot];
      rb.mapAsync(GPUMapMode.READ).then(() => {
        const v = new BigUint64Array(rb.getMappedRange().slice(0)); rb.unmap(); ts.busy[slot] = false;
        const ms = Number(v[2] - v[0]) / 1e6, fixed = Number(v[1] - v[0]) / 1e6;
        if (ms > 0 && ms < 1000 && fixed >= 0 && fixed <= ms) {
          this.gpuMs = this.gpuMs ? this.gpuMs + (ms - this.gpuMs) * 0.1 : ms;
          this.gpuFixedMs = this.gpuFixedMs ? this.gpuFixedMs + (fixed - this.gpuFixedMs) * 0.1 : fixed;
        }
      }, () => { ts.busy[slot] = false; });
    }
    if (first) d.popErrorScope().then((e) => { if (e && !this.dead) { this.dead = true; this.onError?.(new Error(e.message)); } }, () => {});

    this.vflip = 1 - v; this.frameNo++; this.fresh = false;
    this.inflight++;
    d.queue.onSubmittedWorkDone().then(() => { this.inflight--; }, () => { this.inflight = 0; });
    return true;
  }

  destroy() {
    if (this.dead && !this.sized && !this.ownTextures.length) return;
    this.dead = true;
    this.freddyAbort.abort(); this.freddy?.destroy(); this.freddy = null;
    this.sized?.textures.forEach((t) => t.destroy()); this.sized = null;
    this.ownTextures.splice(0).forEach((t) => t.destroy());
    this.ts?.set.destroy();
    [...(this.ts ? [this.ts.resolve, ...this.ts.read] : []), this.frameBuf, this.passBuf.main, this.passBuf.planar, ...this.passBuf.env, ...this.postBuf, this.gi].forEach((b) => b.destroy());
    try { this.ctx.unconfigure(); } catch {}
  }
}
