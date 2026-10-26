// Lo schermo di «Le tue scintille» in WebGPU: i quattro canali come tubi al neon in prospettiva.
// Ogni emozione è un tubo di vetro piegato nella sua forma d'onda (le stesse di onde.ts), in piedi alla sua profondità
// sopra un pavimento di vetro scuro con il reticolo. Un canale con scintille è acceso: il gas brilla nel colore
// dell'emozione, il nucleo verso il bianco dove il tubo guarda la camera, e attorno un alone stretto; sul pavimento la
// sua pozza di luce e il riflesso. Un canale senza scintille è un tubo spento: vetro scuro con il suo riflesso freddo.
// L'ampiezza e la luce crescono con le scintille. All'arrivo (e a ogni giro di manopola) i tubi si accendono da sinistra,
// uno dopo l'altro, con un fronte più caldo che corre; al passaggio del puntatore la camera si inclina appena verso di
// lui e le onde scorrono; un canale scelto resta acceso, gli altri si abbassano. A riposo non si disegna nulla.
// Disegno: MSAA 4×, profondità; il pavimento (opaco), i riflessi dei tubi sommati sopra, i tubi, gli aloni (al massimo).
import type { Tipo } from "./scintille";
import { CODICE } from "./onde";

const S = 320, R = 8; // campioni lungo il tubo e lati della sezione
const U_FLOATS = 16 + 4 + 4 + 4 * 12; // vp, occhio, varie, 4 canali
const PHOSPHOR: Record<Tipo, [number, number, number]> = {
  riconosco: [0.2, 0.82, 0.73], bellissima: [0.96, 0.72, 0.25], ridere: [0.93, 0.6, 0.36], commosso: [0.96, 0.63, 0.73],
};

const SHADER = /* wgsl */ `
struct Ch { col: vec4f, p: vec4f, q: vec4f }; // col: rgb, acceso; p: z, ampiezza, luce, rilievo; q: fase, fronte, tipo, -
struct U { vp: mat4x4f, eye: vec4f, misc: vec4f, ch: array<Ch, 4> }; // eye: xyz, t; misc: X, pavimento, lunghezza, raggio
@group(0) @binding(0) var<uniform> u: U;
const TAU = 6.2831853; const PI = 3.14159265;
fn wave(k: u32, x: f32) -> f32 {
  if (k == 0u) { return sin(TAU * x / 24.); }
  if (k == 1u) { let e = sin(PI * x / 48.); return sin(TAU * x / 16.) * (.22 + .78 * e * e); }
  if (k == 2u) { return 2. * abs(sin(PI * x / 12.)) - 1.; }
  let f = fract(x / 48.); return sin(TAU * x / 6.) * exp(-2.4 * f) * min(1., f * 14.);
}
// il punto del tubo c a xn (0..1 da sinistra a destra); agli estremi l'onda si posa sullo zero
fn curve(c: u32, xn: f32) -> vec3f {
  let ch = u.ch[c]; let X = u.misc.x;
  let t = clamp(min(xn, 1. - xn) * 12., 0., 1.); let e = t * t * (3. - 2. * t);
  return vec3f(mix(-X, X, xn), ch.p.y * e * wave(u32(ch.q.z), xn * u.misc.z + ch.q.x), ch.p.x);
}
// quanto il canale è acceso a xn: il fronte dell'accensione corre da sinistra, con la testa più calda
fn power(c: u32, xn: f32) -> vec2f {
  let f = u.ch[c].q.y; let on = smoothstep(f + .01, f - .03, xn);
  let head = exp(-pow((xn - f) * 26., 2.)) * step(f, 1.05);
  return vec2f(on, head);
}
fn mirror(p: vec3f, m: bool) -> vec3f { return select(p, vec3f(p.x, 2. * u.misc.y - p.y, p.z), m); }

// --- il pavimento: vetro scuro, reticolo che sfuma lontano, le pozze di luce dei canali accesi
struct FO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vFloor(@builtin(vertex_index) vi: u32) -> FO {
  var cs = array(vec2f(-1., -1.), vec2f(1., -1.), vec2f(-1., 1.), vec2f(-1., 1.), vec2f(1., -1.), vec2f(1., 1.));
  let q = cs[vi]; let w = vec3f(q.x * 6., u.misc.y, mix(-4.5, 2.5, q.y * .5 + .5));
  var o: FO; o.pos = u.vp * vec4f(w, 1.); o.w = w; return o;
}
@fragment fn fFloor(i: FO) -> @location(0) vec4f {
  let p = i.w; let g = p.xz / .25;
  let fw = fwidth(g); let gl = abs(fract(g - .5) - .5) / max(fw, vec2f(1e-4));
  let line = 1. - min(min(gl.x, gl.y), 1.);
  let far = smoothstep(-4.2, -.5, p.z) * smoothstep(5.5, 2.5, abs(p.x));
  var c = vec3f(.016, .04, .036) + vec3f(.47, .94, .84) * line * .085 * far;
  for (var k = 0u; k < 4u; k++) {
    let ch = u.ch[k]; let xn = (p.x / u.misc.x) * .5 + .5;
    let inside = smoothstep(-.04, .03, xn) * smoothstep(1.04, .97, xn);
    let pw = power(k, clamp(xn, 0., 1.));
    let pool = exp(-abs(p.z - ch.p.x) * 5.5) * ch.p.z * ch.col.w * inside * (pw.x + pw.y);
    c += ch.col.rgb * pool * (.16 + .1 * ch.p.w);
  }
  // l'orizzonte del vetro sfuma nel fondo dello schermo (lo disegna il CSS dietro la tela)
  let a = smoothstep(-4.4, -2.6, p.z);
  return vec4f(c * a, a);
}

// --- i tubi: una sezione di R lati lungo la curva; le istanze 4..7 sono i riflessi sotto il pavimento
struct TO { @builtin(position) pos: vec4f, @location(0) n: vec3f, @location(1) w: vec3f, @location(2) @interpolate(flat) c: u32, @location(3) xn: f32, @location(4) @interpolate(flat) m: u32 };
@vertex fn vTube(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> TO {
  let c = ii % 4u; let m = ii >= 4u;
  let quad = vi / 6u; let k = vi % 6u;
  var di = array(0u, 1u, 0u, 0u, 1u, 1u); var dj = array(0u, 0u, 1u, 1u, 0u, 1u);
  let i = quad / ${R}u + di[k]; let j = (quad % ${R}u) + dj[k];
  let xn = f32(i) / f32(${S}u);
  let p = curve(c, xn); let e = .5 / f32(${S}u);
  let tg = normalize(curve(c, min(xn + e, 1.)) - curve(c, max(xn - e, 0.)));
  let n0 = normalize(cross(tg, vec3f(0., 0., 1.))); let b0 = cross(tg, n0);
  let a = f32(j) / f32(${R}u) * TAU; let d = n0 * cos(a) + b0 * sin(a);
  var o: TO; let w = mirror(p + d * u.misc.w, m);
  o.pos = u.vp * vec4f(w, 1.); o.n = select(d, vec3f(d.x, -d.y, d.z), m); o.w = w; o.c = c; o.xn = xn; o.m = select(0u, 1u, m);
  return o;
}
@fragment fn fTube(i: TO) -> @location(0) vec4f {
  let ch = u.ch[i.c]; let v = normalize(u.eye.xyz - i.w); let n = normalize(i.n);
  let nv = abs(dot(n, v)); let pw = power(i.c, i.xn);
  let lit = ch.col.w * ch.p.z * pw.x;
  // acceso: il gas nel colore, il nucleo verso il bianco al centro del tubo, la testa del fronte più calda
  let core = pow(nv, 3.) * (lit + pw.y * ch.col.w);
  var col = ch.col.rgb * (.18 + 1.25 * lit * (.35 + .65 * nv)) + vec3f(1.) * core * .55 + ch.col.rgb * pw.y * ch.col.w * .9;
  // spento: vetro scuro con il riflesso della stanza in alto
  let l = normalize(vec3f(-.3, 1., .6)); let h = normalize(l + v);
  let spec = pow(max(dot(n, h), 0.), 40.) * .35;
  let glass = vec3f(.06, .09, .09) + vec3f(.75, .9, .88) * spec + vec3f(.1, .16, .15) * pow(1. - nv, 2.);
  col = mix(glass, col, clamp(ch.col.w * (.25 + pw.x * .75), 0., 1.));
  if (i.m == 1u) {
    // il riflesso: più tenue e sfuma allontanandosi dal pavimento
    let fade = exp(-(u.misc.y - i.w.y) * 5.);
    return vec4f(col * .13 * fade, 0.);
  }
  return vec4f(col, 1.);
}

// --- gli aloni: una striscia rivolta alla camera, con la luce che cala come una gaussiana
struct GO { @builtin(position) pos: vec4f, @location(0) d: f32, @location(1) @interpolate(flat) c: u32, @location(2) xn: f32, @location(3) @interpolate(flat) m: u32 };
@vertex fn vGlow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GO {
  let c = ii % 4u; let m = ii >= 4u;
  let seg = vi / 6u; let k = vi % 6u;
  var di = array(0u, 1u, 0u, 0u, 1u, 1u); var side = array(-1., -1., 1., 1., -1., 1.);
  let xn = f32(seg + di[k]) / f32(${S}u);
  // la tangente presa larga (qualche campione): sulle creste strette la striscia non si ripiega su sé stessa
  let p = curve(c, xn); let e = 3. / f32(${S}u);
  let tg = normalize(curve(c, min(xn + e, 1.)) - curve(c, max(xn - e, 0.)));
  let sd = normalize(cross(tg, normalize(u.eye.xyz - p)));
  let ch = u.ch[c]; let wdt = u.misc.w * (4. + 1.5 * ch.p.w);
  var o: GO; let w = mirror(p + sd * side[k] * wdt, m);
  o.pos = u.vp * vec4f(w, 1.); o.d = side[k]; o.c = c; o.xn = xn; o.m = select(0u, 1u, m); return o;
}
@fragment fn fGlow(i: GO) -> @location(0) vec4f {
  let ch = u.ch[i.c]; let pw = power(i.c, i.xn);
  let a = exp(-i.d * i.d * 4.) * ch.col.w * (ch.p.z * pw.x * (.32 + .3 * ch.p.w) + pw.y * .9) * select(1., .25, i.m == 1u);
  return vec4f(ch.col.rgb * a, 0.);
}`;

const ADD: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "zero", dstFactor: "one" } };
// gli aloni si prendono il massimo, non si sommano: dove la striscia si sovrappone (creste, incroci) la luce non raddoppia
const MAX: GPUBlendState = { color: { operation: "max", srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "zero", dstFactor: "one" } };
const OVER: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };

// matrici in colonna, profondità 0..1 come vuole WebGPU
const persp = (fy: number, asp: number, n: number, f: number) => { const t = 1 / Math.tan(fy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, f / (n - f), -1, 0, 0, (n * f) / (n - f), 0]; };
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const look = (e: number[], t: number[]) => { const z = norm(sub(e, t)), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]; };
const mul = (a: number[], b: number[]) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };

export type Canale4 = { tipo: Tipo; n: number }[]; // i quattro canali, nell'ordine di TIPI
type Ch = { tipo: Tipo; n: number; amp: number; light: number; on: number; emph: number; phase: number; front: number; delay: number };

export class Strumento {
  private readonly ub: GPUBuffer; private readonly ud = new Float32Array(U_FLOATS);
  private readonly pFloor: GPURenderPipeline; private readonly pTube: GPURenderPipeline; private readonly pRefl: GPURenderPipeline; private readonly pGlow: GPURenderPipeline;
  private readonly bind: GPUBindGroup[];
  private readonly cx: GPUCanvasContext; private readonly format: GPUTextureFormat;
  private msaa: GPUTexture | null = null; private depth: GPUTexture | null = null;
  private ch: Ch[] = [];
  private hl = -1; private t = 0; private last = 0; private busy = 0; private dirty = true;
  private ptr = [0, 0, 0]; private cam = [0, 0]; private still: boolean;
  private vp: number[] = []; private eye: number[] = [0, 0, 0]; private X = 2; private W = 1; private H = 1; private sc = 1;
  private tags: (HTMLElement | null)[] = [];

  constructor(private readonly dev: GPUDevice, private readonly canvas: HTMLCanvasElement, still: boolean) {
    this.still = still;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.cx = canvas.getContext("webgpu")!;
    this.cx.configure({ device: dev, format: this.format, alphaMode: "premultiplied" });
    this.ub = dev.createBuffer({ label: "strumento", size: U_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const m = dev.createShaderModule({ label: "strumento", code: SHADER });
    const layout = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
    const pl = dev.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipe = (vs: string, fs: string, blend: GPUBlendState, write: boolean, test: GPUCompareFunction) => dev.createRenderPipeline({
      label: `strumento-${vs}`, layout: pl, vertex: { module: m, entryPoint: vs }, fragment: { module: m, entryPoint: fs, targets: [{ format: this.format, blend }] },
      primitive: { topology: "triangle-list" }, depthStencil: { format: "depth24plus", depthWriteEnabled: write, depthCompare: test }, multisample: { count: 4 },
    });
    this.pFloor = pipe("vFloor", "fFloor", OVER, true, "less");
    this.pRefl = pipe("vTube", "fTube", ADD, false, "always");
    this.pTube = pipe("vTube", "fTube", OVER, true, "less");
    this.pGlow = pipe("vGlow", "fGlow", MAX, false, "less-equal");
    this.bind = [dev.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.ub } }] })];
  }

  // la tela segue il suo riquadro; MSAA e profondità alla sua misura
  fit() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height); this.sc = dpr;
    const w = Math.max(1, Math.round(this.W * dpr)), h = Math.max(1, Math.round(this.H * dpr));
    if (this.canvas.width === w && this.canvas.height === h && this.msaa) { this.dirty = true; return; }
    this.canvas.width = w; this.canvas.height = h;
    this.msaa?.destroy(); this.depth?.destroy();
    this.msaa = this.dev.createTexture({ size: [w, h], format: this.format, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depth = this.dev.createTexture({ size: [w, h], format: "depth24plus", sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.wake(0.2);
  }

  // i canali (sempre quattro, nell'ordine di TIPI); sweep: si riaccendono da sinistra
  set(cs: Canale4, sweep: boolean) {
    cs.forEach((c, i) => {
      const o = this.ch[i] || (this.ch[i] = { tipo: c.tipo, n: 0, amp: 0, light: 0, on: 0, emph: 0, phase: i * 13, front: 0, delay: 0 });
      o.tipo = c.tipo; o.n = c.n;
      if (sweep) { o.front = this.still ? 1.2 : -0.08; o.delay = this.still ? 0 : 0.12 + i * 0.13; }
    });
    this.wake(sweep ? 2.2 : 0.8);
  }
  highlight(i: number) { if (i !== this.hl) { this.hl = i; this.wake(0.8); } }
  // il puntatore sullo schermo (in -1..1): la camera si inclina verso di lui
  pointer(x: number, y: number, inside: boolean) { this.ptr = [x, y, inside ? 1 : 0]; this.wake(inside ? 0.6 : 1); }
  // le etichette HTML dei canali, appese all'inizio di ogni tubo
  tagsOn(els: (HTMLElement | null)[]) { this.tags = els; this.dirty = true; }
  private wake(s: number) { this.busy = Math.max(this.busy, this.t + s); this.dirty = true; }
  fps() { return this.t < this.busy ? 60 : 1; }

  // il canale più vicino a un punto dello schermo (pixel nel riquadro), seguendo la sua linea proiettata
  pick(px: number, py: number) {
    let best = -1, bd = 1e9;
    this.ch.forEach((c, i) => {
      const a = this.project([-this.X, 0, this.zOf(i)]), b = this.project([this.X, 0, this.zOf(i)]);
      if (!a || !b) return;
      const f = Math.max(0, Math.min(1, (px - a[0]) / Math.max(1, b[0] - a[0]))), y = a[1] + (b[1] - a[1]) * f;
      const d = Math.abs(py - y) - c.amp * 60;
      if (d < bd) { bd = d; best = i; }
    });
    return bd < 26 ? best : -1;
  }
  private zOf(i: number) { return 0.62 - i * 0.66; }
  private project(p: number[]) {
    const m = this.vp; if (!m.length) return null;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return w > 0 ? [(x / w * 0.5 + 0.5) * this.W, (0.5 - y / w * 0.5) * this.H] : null;
  }

  draw(now: number) {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016); this.last = now; this.t += dt;
    if (this.t >= this.busy && !this.dirty) return;
    if (!this.msaa || !this.depth || !this.ch.length) return;
    const k = 1 - Math.exp(-dt * 7);
    let moving = false;
    // la camera: in alto davanti al pavimento; col puntatore sopra si inclina verso di lui
    const tx = this.still ? 0 : this.ptr[0] * this.ptr[2], ty = this.still ? 0 : this.ptr[1] * this.ptr[2];
    this.cam[0] += (tx - this.cam[0]) * k; this.cam[1] += (ty - this.cam[1]) * k;
    if (Math.abs(tx - this.cam[0]) + Math.abs(ty - this.cam[1]) > 0.002) moving = true;
    const asp = this.W / this.H, fy = (24 * Math.PI) / 180;
    // sui formati stretti (il telefono) la camera sale: i canali si separano di più in altezza
    const narrow = Math.max(0, Math.min(1, (2.6 - asp) / 1.1));
    this.eye = [this.cam[0] * 0.55, 2.35 + 0.85 * narrow - this.cam[1] * 0.25, 3.7 - 0.35 * narrow];
    const target = [this.cam[0] * 0.12, -0.32 + 0.14 * narrow, -0.45 - 0.15 * narrow];
    this.vp = mul(persp(fy, asp, 0.1, 30), look(this.eye, target));
    // la larghezza dei tubi: quanto entra davanti, con un margine per le etichette
    const dFront = Math.hypot(this.eye[0], this.eye[1], this.eye[2] - this.zOf(0));
    this.X = Math.min(2.7, dFront * Math.tan(fy / 2) * asp * 0.84);
    const anyHl = this.hl >= 0;
    this.ch.forEach((c, i) => {
      const n = Math.min(c.n, 6), lit = c.n > 0 ? 1 : 0;
      const amp = c.n > 0 ? 0.075 + 0.04 * n : 0, light = c.n > 0 ? 0.55 + 0.075 * n : 0;
      const emph = anyHl ? (this.hl === i ? 1 : 0) : 0, dim = anyHl && this.hl !== i ? 0.22 : 1;
      c.amp += (amp - c.amp) * k; c.light += (light * dim - c.light) * k; c.on += (lit - c.on) * k; c.emph += (emph - c.emph) * k;
      if (Math.abs(amp - c.amp) + Math.abs(light * dim - c.light) + Math.abs(lit - c.on) + Math.abs(emph - c.emph) > 0.003) moving = true;
      // il fronte dell'accensione, dopo la sua attesa
      if (c.delay > 0) { c.delay -= dt; moving = true; } else if (c.front < 1.2) { c.front = Math.min(1.2, c.front + dt / 0.85); moving = true; }
      // le onde scorrono col puntatore sopra (il canale indicato più svelto)
      if (!this.still && (this.ptr[2] || c.emph > 0.01)) { c.phase = (c.phase + dt * (14 + 30 * c.emph)) % 96; moving = true; }
      const col = PHOSPHOR[c.tipo], o = 24 + i * 12;
      this.ud.set([col[0], col[1], col[2], c.on, this.zOf(i), c.amp * (1 + 0.25 * c.emph), c.light, c.emph, c.phase, c.front, CODICE[c.tipo], 0], o);
    });
    this.ud.set(this.vp, 0);
    this.ud.set([this.eye[0], this.eye[1], this.eye[2], this.t, this.X, -0.42, 170, 0.019], 16);
    if (moving) this.wake(0.25);
    this.dirty = false;
    this.dev.queue.writeBuffer(this.ub, 0, this.ud);
    const enc = this.dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msaa.createView(), resolveTarget: this.cx.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "discard" }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
    });
    pass.setBindGroup(0, this.bind[0]);
    pass.setPipeline(this.pFloor); pass.draw(6);
    pass.setPipeline(this.pRefl); pass.draw(S * R * 6, 4, 0, 4);
    pass.setPipeline(this.pTube); pass.draw(S * R * 6, 4);
    pass.setPipeline(this.pGlow); pass.draw(S * 6, 4);
    pass.end();
    this.dev.queue.submit([enc.finish()]);
    // le etichette all'inizio di ogni tubo, un po' sopra
    this.tags.forEach((el, i) => {
      const p = this.project([-this.X, 0, this.zOf(i)]);
      if (el && p) el.style.transform = `translate(${Math.round(p[0])}px,${Math.round(p[1])}px)`;
    });
  }

  destroy() { this.ub.destroy(); this.msaa?.destroy(); this.depth?.destroy(); try { this.cx.unconfigure(); } catch {} }
}
