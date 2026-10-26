// La luce delle scintille in WebGPU. Due tele sullo stesso dispositivo dello sfondo (fieldDevice):
//   sotto  dentro la carta, dietro le parole: per ogni riga di una frase accesa un quadrato poco più grande della riga,
//          dove il fragment shader disegna un vapore caldo nella riga, un alone fuori e un filamento sotto il testo, con
//          la corrente che lo percorre (rumore che scorre lungo la frase: punti caldi che viaggiano). Quando la frase si
//          accende la testa della corrente corre da sinistra a destra e dietro di sé lascia la luce e un lampo che si spegne.
//   sopra  fissa sulla finestra, sopra il lettore: le particelle. Scintille che schizzano e cadono con la gravità, tirate
//          lungo la velocità come strisce; braci che salgono dalle frasi accese da più persone; l'onda d'urto e il
//          lampo dell'accensione; la cometa che vola dal pulsante Accendi alla frase. Le simula un compute shader; la CPU
//          scrive solo le nuove nascite in un anello di 4096 posti.
// Le posizioni sono in pixel della carta: le scintille stanno sul foglio e scorrono con lui. Sulla carta chiara la luce è
// colore premoltiplicato, mai additivo: il bianco su bianco non si vedrebbe, la luce qui è un ambra che si scalda.

const U_SIZE = 20; // res, off, clip, ptr, misc
const L_STRIDE = 12; // box, p, q
const P_STRIDE = 12; // p (pos, vel), a (vita, durata, misura, tipo), b (seme, calore, attrito, gravità)
const MAXP = 4096;
const MAXL = 256;

const COMMON = /* wgsl */ `
struct U { res: vec4f, off: vec4f, clip: vec4f, ptr: vec4f, misc: vec4f };
@group(0) @binding(0) var<uniform> u: U;
fn h1(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn n1(x: f32) -> f32 { let i = floor(x); let f = fract(x); let s = f * f * (3. - 2. * f); return mix(h1(i), h1(i + 1.), s); }
fn n2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let s = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2f(1., 0.)), s.x), mix(h2(i + vec2f(0., 1.)), h2(i + vec2f(1., 1.)), s.x), s.y);
}
fn clipOf(p: vec2f) -> vec4f { let c = u.res.xy / u.res.z; return vec4f(p.x / c.x * 2. - 1., 1. - p.y / c.y * 2., 0., 1.); }
// il colore della luce a una temperatura: brace rossa, ambra, oro, quasi bianco
fn heat(t: f32) -> vec3f {
  let x = clamp(t, 0., 1.);
  let a = mix(vec3f(.78, .2, .02), vec3f(1., .5, .06), smoothstep(0., .35, x));
  let b = mix(a, vec3f(1., .74, .22), smoothstep(.3, .7, x));
  return mix(b, vec3f(1., .95, .78), smoothstep(.72, 1., x));
}`;

const UNDER = COMMON + /* wgsl */ `
struct L { box: vec4f, p: vec4f, q: vec4f }; // box: x y w h; p: inizio lungo la frase, lunghezza, intensità, seme; q: accensione, durata, tipo, fuoco
@group(0) @binding(1) var<storage, read> ls: array<L>;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec2f, @location(1) @interpolate(flat) id: u32 };
fn padOf(l: L) -> f32 { return 16. + 26. * l.p.z + 10. * l.q.w; }
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let l = ls[ii]; let pad = padOf(l);
  var cs = array(vec2f(0., 0.), vec2f(1., 0.), vec2f(0., 1.), vec2f(0., 1.), vec2f(1., 0.), vec2f(1., 1.));
  let wp = l.box.xy - pad + cs[vi] * (l.box.zw + pad * 2.);
  var o: VO; o.pos = clipOf(wp + u.off.xy); o.w = wp; o.id = ii; return o;
}
// sopra quello che c'è già, in colore premoltiplicato
fn ov(d: vec4f, c: vec3f, a: f32) -> vec4f { let x = clamp(a, 0., 1.); return vec4f(c * x + d.rgb * (1. - x), x + d.a * (1. - x)); }
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let l = ls[i.id]; let p = i.w; let b = l.box; let t = u.res.w;
  let k = l.p.z; let seed = l.p.w; let tot = max(l.p.y, 1.);
  let mine = l.q.z > .5; let focus = l.q.w;
  // distanza dal rettangolo arrotondato della riga
  let hs = b.zw * .5; let r = min(6., hs.y);
  let qd = abs(p - b.xy - hs) - hs + r; let d = length(max(qd, vec2f(0.))) + min(max(qd.x, qd.y), 0.) - r;
  let s = l.p.x + (p.x - b.x); // dove si è lungo la frase, in pixel
  let T = t - l.q.x; let dur = max(l.q.y, .05);
  let hp = select(-1e5, T / dur * tot, T >= 0.); // la testa della corrente
  let lit = smoothstep(hp + 2., hp - 22., s);
  let since = max(T - s / tot * dur, 0.); // da quanto la testa è passata di qui
  let flash = lit * exp(-since * 2.4) * step(0., T);
  // il respiro della valvola: lento e irregolare, ognuna col suo
  let br = .84 + .12 * n1(t * .45 + seed * 31.) + .07 * n1(t * 2.1 + seed * 7.) - .035;
  // la corrente: punti caldi che corrono lungo il filamento
  let cur = n2(vec2f(s * .035 - t * 1.6, seed * 9.)) * .6 + n2(vec2f(s * .1 - t * 3.1, seed * 3. + 4.)) * .4;
  let hot = smoothstep(.45, .95, cur);
  let yf = b.y + b.w - 2.; let dy = p.y - yf;
  let ends = smoothstep(-2., 6., min(p.x - b.x, b.x + b.z - p.x));
  let inside = smoothstep(1., -1., d);
  let pd = length((p - u.ptr.xy) * vec2f(.5, 1.));
  let warm = u.ptr.z * exp(-pd / 46.) * step(d, 4.);
  let on = lit * br * u.ptr.w;
  var o = vec4f(0.);
  // l'alone: caldo e raccolto, più forte verso il filamento
  let low = smoothstep(b.y - 4., b.y + b.w + 2., p.y);
  let bl = exp(-max(d, 0.) / (4. + 6. * k + 5. * focus)) * (.35 + .65 * low);
  o = ov(o, vec3f(1., .6, .12), bl * (.1 + .2 * k + .14 * focus + .3 * flash + .12 * warm) * on * select(1., .45, mine));
  // il vapore nella riga: sale dal filamento e svanisce verso l'alto, la carta resta leggibile
  let vg = pow(smoothstep(b.y - 2., b.y + b.w, p.y), 1.6);
  o = ov(o, vec3f(1., .74, .3), inside * vg * (.1 + .2 * k + .12 * focus + .25 * flash + .15 * warm) * on * select(1., .25, mine));
  // il filamento: un filo sottile e pieno, percorso dai punti caldi, con il suo bagliore stretto
  let th = .8 + .35 * k + .3 * focus;
  var core = exp(-dy * dy / (th * th)) * ends;
  let fg = exp(-abs(dy) / (1.5 + 2. * k + 1.5 * hot)) * ends;
  if (mine) { core *= smoothstep(.62, .5, fract(s / 7.5 - t * .35)); }
  o = ov(o, vec3f(1., .5, .04), fg * (.25 + .2 * k + .35 * hot + .4 * flash) * on * select(1., .5, mine));
  o = ov(o, mix(vec3f(.93, .42, 0.), vec3f(1., .78, .28), clamp(hot * .8 + flash * .7 + focus * .3, 0., 1.)), core * (.7 + .3 * k) * on);
  // la testa, mentre corre su questa riga: un nucleo d'oro, l'alone e un lampo orizzontale come un arco elettrico
  let hx = b.x + hp - l.p.x;
  if (T >= 0. && T < dur + .3 && hx > b.x - 10. && hx < b.x + b.z + 10.) {
    let fade = 1. - smoothstep(dur, dur + .3, T);
    let hv = p - vec2f(hx, yf); let hd = length(hv * vec2f(.8, 1.));
    let halo = exp(-hd / 13.) * .7 + exp(-abs(hv.y) / 1.4 - abs(hv.x) / 38.) * .9;
    o = ov(o, vec3f(1., .55, .08), halo * fade * u.ptr.w);
    o = ov(o, vec3f(1., .86, .45), exp(-hd * hd / 16.) * fade * u.ptr.w);
  }
  // dentro il proprio quadrato: la luce si spegne prima del bordo, così non si vedono gli spigoli
  let win = 1. - smoothstep(padOf(l) * .45, padOf(l) * .95, max(d, 0.));
  return o * win;
}`;

const SIM = COMMON + /* wgsl */ `
struct P { p: vec4f, a: vec4f, b: vec4f };
@group(0) @binding(1) var<storage, read_write> ps: array<P>;
@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= arrayLength(&ps)) { return; }
  var q = ps[i]; let dt = u.misc.y;
  if (q.a.x <= 0.) { return; }
  q.a.x -= dt;
  let kind = u32(q.a.w) % 8u;
  var v = q.p.zw;
  if (kind == 1u) {
    // le braci salgono nell'aria calda e vagano
    let e = .02; let x = q.p.xy * .018 + vec2f(q.b.x * 13., u.res.w * .25);
    let c = vec2f(n2(x + vec2f(0., e)) - n2(x - vec2f(0., e)), -(n2(x + vec2f(e, 0.)) - n2(x - vec2f(e, 0.)))) / (2. * e);
    v += c * 26. * dt + vec2f(0., -14.) * dt;
  }
  v.y += q.b.w * dt;
  v *= exp(-q.b.z * dt);
  q.p = vec4f(q.p.xy + v * dt, v);
  ps[i] = q;
}`;

const PARTS = COMMON + /* wgsl */ `
struct P { p: vec4f, a: vec4f, b: vec4f };
@group(0) @binding(1) var<storage, read> ps: array<P>;
struct VO { @builtin(position) pos: vec4f, @location(0) l: vec2f, @location(1) @interpolate(flat) id: u32, @location(2) s: vec2f, @location(3) w: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let q = ps[ii]; var o: VO; o.id = ii;
  if (q.a.x <= 0.) { o.pos = vec4f(2., 2., 0., 1.); return o; }
  var cs = array(vec2f(-1., -1.), vec2f(1., -1.), vec2f(-1., 1.), vec2f(-1., 1.), vec2f(1., -1.), vec2f(1., 1.));
  let c = cs[vi]; let kind = u32(q.a.w) % 8u; let sz = q.a.z;
  var dir = vec2f(1., 0.); var half = vec2f(sz * 3., sz * 3.);
  if (kind == 0u || kind == 3u) {
    // la scintilla si allunga lungo la velocità: la scia di un'esposizione breve
    let v = q.p.zw; let sp = length(v);
    if (sp > 1e-3) { dir = v / sp; }
    half = vec2f(sz * 2.2 + sp * .028, sz * 2.2);
  }
  if (kind == 2u) { let age = q.a.y - q.a.x; half = vec2f(sz + age * 260. + 6.); }
  if (kind == 4u) { half = vec2f(sz * 4.); }
  let nrm = vec2f(-dir.y, dir.x);
  let lp = c * half;
  let wp = q.p.xy + dir * lp.x + nrm * lp.y;
  o.pos = clipOf(wp + u.off.xy); o.l = lp; o.s = half; o.w = wp + u.off.xy; return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let q = ps[i.id]; let kind = u32(q.a.w) % 8u; let loose = q.a.w >= 8.;
  if (!loose && (i.w.x < u.clip.x || i.w.y < u.clip.y || i.w.x > u.clip.z || i.w.y > u.clip.w)) { discard; }
  let life = clamp(q.a.x / max(q.a.y, 1e-3), 0., 1.); let sz = q.a.z;
  var I = 0.; var T = q.b.y * life;
  if (kind == 0u || kind == 3u) {
    // capsula: nucleo pieno e bagliore attorno
    let hx = max(i.s.x - i.s.y, 0.); let x = clamp(i.l.x, -hx, hx);
    let dd = length(vec2f(i.l.x - x, i.l.y));
    let tail = mix(.35, 1., smoothstep(-hx, hx, i.l.x)); // più calda in testa
    I = (exp(-dd * dd / (sz * sz * .7)) * 1.4 + exp(-dd / (sz * 2.2)) * .55) * tail;
    I *= smoothstep(0., .18, life) + select(0., 1., kind == 3u);
    T = q.b.y * (.35 + .65 * life) * tail;
  } else if (kind == 1u) {
    let dd = length(i.l);
    let tw = .65 + .35 * n1(u.res.w * 6. + q.b.x * 50.);
    I = (exp(-dd * dd / (sz * sz * .6)) + exp(-dd / (sz * 1.8)) * .3) * tw * smoothstep(0., .25, life) * smoothstep(1., .85, life);
  } else if (kind == 2u) {
    // l'onda d'urto: un anello sottile che si allarga e si spegne
    let R = i.s.x - 6.; let dd = abs(length(i.l) - R);
    I = exp(-dd * dd / 6.) * life * life * .9 + exp(-dd / 9.) * life * .25;
    T = .55 + .3 * life;
  } else {
    let dd = length(i.l);
    I = exp(-dd * dd / (sz * sz * 2.2)) * life * 1.1;
    T = .6 + .4 * life;
  }
  // sulla carta il bianco sparisce: la parte più calda resta oro
  let A = clamp(I * u.ptr.w, 0., .97);
  return vec4f(heat(min(T, .7)) * A, A);
}`;

const OVER: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };

export type Span = { key: string; boxes: { x: number; y: number; w: number; h: number }[]; level: number; mine: boolean; focus: boolean };
type St = { span: Span; k: number; focus: number; t0: number; dur: number; seed: number; dying: number; tot: number; burst: number; ember: number; shed: number; grade: "big" | "small" | "" };
type Comet = { key: string; from: [number, number]; t0: number; dur: number; last?: number[] };

const seedOf = (k: string) => { let h = 2166136261; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const LEVEL = [0, 0.42, 0.62, 0.82, 1];

export class Luce {
  private readonly uU: GPUBuffer; private readonly uO: GPUBuffer; private readonly lb: GPUBuffer; private readonly pb: GPUBuffer;
  private readonly pUnder: GPURenderPipeline; private readonly pParts: GPURenderPipeline; private readonly pSim: GPUComputePipeline;
  private readonly bUnder: GPUBindGroup; private readonly bParts: GPUBindGroup; private readonly bSim: GPUBindGroup;
  private readonly cu: GPUCanvasContext; private readonly co: GPUCanvasContext;
  private readonly ud = new Float32Array(U_SIZE); private readonly od = new Float32Array(U_SIZE);
  private readonly ld = new Float32Array(MAXL * L_STRIDE);
  private readonly born = new Float32Array(MAXP * P_STRIDE); private nb = 0; private ring = 0;
  private st = new Map<string, St>();
  private comets: Comet[] = [];
  private t = 0; private last = 0; private alive = 0; private busy = 0;
  private on = 1; private want = 1; private ptr = [0, 0, 0, 0];
  private sU = 1; private sO = 1; private cleared = true;
  onBurst?: (big: boolean) => void;

  constructor(private readonly dev: GPUDevice, private readonly under: HTMLCanvasElement, private readonly over: HTMLCanvasElement, private readonly paper: HTMLElement, private readonly scroller: HTMLElement | null) {
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.cu = under.getContext("webgpu")!; this.co = over.getContext("webgpu")!;
    this.cu.configure({ device: dev, format, alphaMode: "premultiplied" });
    this.co.configure({ device: dev, format, alphaMode: "premultiplied" });
    const U = GPUBufferUsage;
    this.uU = dev.createBuffer({ label: "scintille-sotto", size: U_SIZE * 4, usage: U.UNIFORM | U.COPY_DST });
    this.uO = dev.createBuffer({ label: "scintille-sopra", size: U_SIZE * 4, usage: U.UNIFORM | U.COPY_DST });
    this.lb = dev.createBuffer({ label: "scintille-righe", size: this.ld.byteLength, usage: U.STORAGE | U.COPY_DST });
    this.pb = dev.createBuffer({ label: "scintille-particelle", size: MAXP * P_STRIDE * 4, usage: U.STORAGE | U.COPY_DST });
    const mu = dev.createShaderModule({ label: "scintille-sotto", code: UNDER });
    const mp = dev.createShaderModule({ label: "scintille-particelle", code: PARTS });
    const ms = dev.createShaderModule({ label: "scintille-simulazione", code: SIM });
    const pipe = (m: GPUShaderModule) => dev.createRenderPipeline({ label: m.label, layout: "auto", vertex: { module: m, entryPoint: "vs" }, fragment: { module: m, entryPoint: "fs", targets: [{ format, blend: OVER }] }, primitive: { topology: "triangle-list" } });
    this.pUnder = pipe(mu); this.pParts = pipe(mp);
    this.pSim = dev.createComputePipeline({ label: "scintille-simulazione", layout: "auto", compute: { module: ms, entryPoint: "sim" } });
    const bind = (p: GPURenderPipeline | GPUComputePipeline, u: GPUBuffer, s: GPUBuffer) => dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: { buffer: s } }] });
    this.bUnder = bind(this.pUnder, this.uU, this.lb); this.bParts = bind(this.pParts, this.uO, this.pb); this.bSim = bind(this.pSim, this.uO, this.pb);
  }

  // la tela sotto copre la carta; se la carta è molto lunga si scende di risoluzione (la luce è morbida, regge)
  fit() {
    const W = this.paper.clientWidth, H = this.paper.clientHeight, dpr = window.devicePixelRatio || 1;
    this.sU = Math.max(0.35, Math.min(dpr, 2, Math.sqrt(5e6 / Math.max(1, W * H)), 8000 / Math.max(1, H), 8000 / Math.max(1, W)));
    this.under.width = Math.max(1, Math.round(W * this.sU)); this.under.height = Math.max(1, Math.round(H * this.sU));
    this.sO = Math.min(dpr, window.innerWidth < 768 ? 2 : 1.25);
    this.over.width = Math.max(1, Math.round(window.innerWidth * this.sO)); this.over.height = Math.max(1, Math.round(window.innerHeight * this.sO));
  }

  // le frasi accese. Una frase nuova si accende (le nuove insieme, una dopo l'altra); una che sparisce si spegne
  set(spans: Span[], fresh?: string | null) {
    const seen = new Set<string>();
    let n = 0;
    spans.forEach((sp) => {
      seen.add(sp.key);
      const s = this.st.get(sp.key), tot = sp.boxes.reduce((a, b) => a + b.w, 0);
      if (s) { s.span = sp; s.tot = tot; s.dying = 0; return; }
      const big = sp.key === fresh;
      this.st.set(sp.key, { span: sp, k: 0, focus: 0, t0: 1e9, dur: 0, seed: seedOf(sp.key), dying: 0, tot, burst: 0, ember: 0, shed: 0, grade: big ? "big" : "small" });
      if (!big) this.light(sp.key, (n++ % 8) * 0.15);
    });
    // una frase che si fonde con una nuova (due scintille che si toccano) non si spegne: passa la luce alla nuova
    const over = (a: Span, b: Span) => a.boxes.some((p) => b.boxes.some((q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h));
    this.st.forEach((s, key) => {
      if (seen.has(key) || s.dying) return;
      s.dying = this.t;
      if (spans.some((sp) => over(sp, s.span))) s.k = 0; else this.fizzle(s);
    });
  }

  // riaccendere tutto: la corrente ripassa, frase per frase
  replay() { let i = 0; this.st.forEach((s, key) => { if (!s.dying) { s.grade = "small"; this.light(key, (i++ % 8) * 0.15); } }); }

  // una frase si accende: la corrente parte da sinistra; con from (un punto della finestra) prima vola la cometa
  ignite(key: string, from?: [number, number] | null) {
    const s = this.st.get(key); if (!s) return;
    s.grade = "big";
    if (from) {
      s.t0 = 1e9;
      const b = s.span.boxes[0], P = this.paper.getBoundingClientRect();
      const to: [number, number] = [b.x + P.left + this.paper.clientLeft, b.y + b.h - 2 + P.top + this.paper.clientTop];
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
      this.comets.push({ key, from, t0: this.t, dur: Math.min(0.75, 0.32 + dist / 1600) });
    } else this.light(key, 0);
    this.busy = this.t + 3;
  }

  private light(key: string, delay: number) {
    const s = this.st.get(key); if (!s) return;
    s.t0 = this.t + delay; s.dur = Math.min(1.5, Math.max(0.42, s.tot / 900)); s.burst = 0; s.shed = 0;
    this.busy = Math.max(this.busy, s.t0 + s.dur + 2.5);
  }

  // snap: subito, senza dissolvenza (all'apertura, con la luce già spenta)
  show(v: boolean, snap = false) { this.want = v ? 1 : 0; if (snap) this.on = this.want; this.busy = Math.max(this.busy, this.t + 1); }
  pointer(x: number, y: number, inside: boolean) { this.ptr[0] = x; this.ptr[1] = y; this.ptr[3] = inside ? 1 : 0; }
  // quanto spesso disegnare: pieno mentre succede qualcosa, piano a riposo, quasi mai a luce spenta
  fps() { return this.t < this.busy || this.alive > 0 || this.comets.length ? 60 : this.on < 0.01 ? 4 : 30; }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, kind: number, heat: number, drag: number, grav: number) {
    if (this.nb >= MAXP) return;
    this.born.set([x, y, vx, vy, life, life, size, kind, Math.random(), heat, drag, grav], this.nb * P_STRIDE);
    this.nb++; this.alive = Math.max(this.alive, life);
  }

  // lo scoppio alla fine della frase: scintille che schizzano in alto e ricadono, un'onda e un lampo
  private burst(x: number, y: number, big: boolean, k: number) {
    const n = big ? 46 : Math.round(6 + 8 * k);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rnd(-1.35, 1.35) * (big ? 1.25 : 1), v = rnd(big ? 140 : 70, big ? 420 : 200);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.45, big ? 1.25 : 0.8), rnd(0.9, big ? 1.9 : 1.4), 0, rnd(0.8, 1), rnd(1.6, 3.2), rnd(380, 620));
    }
    if (big) {
      this.spawn(x, y, 0, 0, 0.6, 4, 2, 1, 0, 0);
      this.spawn(x, y, 0, 0, 0.5, 13, 4, 1, 0, 0);
      for (let i = 0; i < 6; i++) this.spawn(x + rnd(-6, 6), y, rnd(-20, 20), rnd(-40, -20), rnd(2.4, 3.6), rnd(1.4, 2.1), 1, 0.8, 0.4, 0);
    } else this.spawn(x, y, 0, 0, 0.32, 6 + 3 * k, 4, 0.8, 0, 0);
    this.onBurst?.(big);
  }

  // una frase che si spegne: poche scintille fredde che cadono
  private fizzle(s: St) {
    s.span.boxes.forEach((b) => {
      for (let i = 0; i < Math.min(10, Math.round(b.w / 40)); i++) this.spawn(b.x + rnd(0, b.w), b.y + b.h - 2, rnd(-30, 30), rnd(-60, 10), rnd(0.35, 0.7), rnd(0.7, 1.1), 0, 0.5, 2.5, 300);
    });
    this.busy = Math.max(this.busy, this.t + 1.5);
  }

  private head(s: St, along: number): [number, number] | null {
    let acc = 0;
    for (const b of s.span.boxes) { if (along <= acc + b.w) return [b.x + along - acc, b.y + b.h - 2.5]; acc += b.w; }
    const b = s.span.boxes[s.span.boxes.length - 1];
    return b ? [b.x + b.w, b.y + b.h - 2.5] : null;
  }

  draw(now: number) {
    const raw = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016); this.last = now;
    const dt = raw; this.t += dt;
    const ease = 1 - Math.exp(-dt * 6);
    this.on += (this.want - this.on) * (1 - Math.exp(-dt * (this.want ? 5 : 3.2)));
    this.ptr[2] += (this.ptr[3] - this.ptr[2]) * (1 - Math.exp(-dt * 8));
    const P = this.paper.getBoundingClientRect(), ox = P.left + this.paper.clientLeft, oy = P.top + this.paper.clientTop;
    const C = this.scroller?.getBoundingClientRect() || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

    // la cometa: una curva dal pulsante alla frase, con la scia
    this.comets = this.comets.filter((c) => {
      const s = this.st.get(c.key); if (!s) return false;
      const b = s.span.boxes[0]; if (!b) return false;
      const to = [b.x + 2, b.y + b.h - 2.5], from = [c.from[0] - ox, c.from[1] - oy];
      const u = Math.min(1, (this.t - c.t0) / c.dur), e = u * u * (3 - 2 * u);
      const mid = [(from[0] + to[0]) / 2 + (to[1] - from[1]) * 0.18, Math.min(from[1], to[1]) - 70];
      const at = (v: number) => [0, 1].map((j) => (1 - v) * (1 - v) * from[j] + 2 * (1 - v) * v * mid[j] + v * v * to[j]);
      const p = at(e), q = at(Math.max(0, e - 0.04));
      const vx = (p[0] - q[0]) / Math.max(dt, 1e-3), vy = (p[1] - q[1]) / Math.max(dt, 1e-3);
      this.spawn(p[0], p[1], vx * 0.25, vy * 0.25, 0.05, 3.2, 3 + 8, 1, 0, 0);
      this.spawn(p[0], p[1], 0, 0, 0.06, 7, 4 + 8, 1, 0, 0);
      // la scia: tante scintille lungo il tratto fatto in questo fotogramma, così resta continua a ogni velocità
      const prev = c.last || p, seg = Math.hypot(p[0] - prev[0], p[1] - prev[1]), n = Math.min(24, 2 + Math.round(seg / 5));
      for (let i = 0; i < n; i++) {
        const f = i / n, x = prev[0] + (p[0] - prev[0]) * f, y = prev[1] + (p[1] - prev[1]) * f;
        this.spawn(x + rnd(-1.5, 1.5), y + rnd(-1.5, 1.5), -vx * rnd(0.01, 0.06) + rnd(-30, 30), -vy * rnd(0.01, 0.06) + rnd(-30, 30), rnd(0.18, 0.5), rnd(0.6, 1.2), 0 + 8, rnd(0.7, 1), 3, 160);
      }
      c.last = p;
      if (u >= 1) { this.light(c.key, 0); s.grade = "big"; return false; }
      return true;
    });

    let nl = 0;
    this.st.forEach((s, key) => {
      const target = s.dying ? 0 : LEVEL[Math.max(0, Math.min(4, s.span.level))];
      s.k += (target - s.k) * ease;
      s.focus += ((s.span.focus && !s.dying ? 1 : 0) - s.focus) * ease;
      if (s.dying && s.k < 0.01) { this.st.delete(key); return; }
      const T = this.t - s.t0;
      // durante la corsa la testa perde scintille; alla fine lo scoppio
      if (T >= 0 && T < s.dur && !s.dying) {
        s.shed += dt * (s.grade === "big" ? 70 : 18);
        const h = this.head(s, (T / s.dur) * s.tot);
        while (s.shed >= 1 && h) { s.shed--; this.spawn(h[0], h[1], rnd(-90, 30), rnd(-150, -30), rnd(0.25, 0.6), rnd(0.7, 1.2), 0, rnd(0.75, 1), 2.4, 520); }
      }
      if (T >= s.dur && !s.burst && !s.dying && s.dur > 0) {
        s.burst = 1;
        const h = this.head(s, s.tot);
        if (h && !s.span.mine) this.burst(h[0], h[1], s.grade === "big", s.k);
        else if (h) this.burst(h[0], h[1], false, 0.2);
        s.grade = "";
      }
      // le braci: solo dalle frasi accese da più persone, poche e lente
      if (!s.span.mine && !s.dying && T > s.dur && this.on > 0.5) {
        s.ember += dt * [0, 0, 0.35, 0.8, 1.5][s.span.level] * (1 + s.focus);
        while (s.ember >= 1) {
          s.ember--;
          const b = s.span.boxes[Math.floor(Math.random() * s.span.boxes.length)];
          if (b) this.spawn(b.x + rnd(0.05, 0.95) * b.w, b.y + b.h * rnd(0.3, 0.9), rnd(-8, 8), rnd(-26, -12), rnd(2.2, 4.2), rnd(1.1, 1.9), 1, 0.85, 0.3, 0);
        }
      }
      let acc = 0;
      s.span.boxes.forEach((b) => {
        if (nl >= MAXL) return;
        this.ld.set([b.x, b.y, b.w, b.h, acc, s.tot, s.k, s.seed, s.t0, s.dur || 1, s.span.mine ? 1 : 0, s.focus], nl * L_STRIDE);
        acc += b.w; nl++;
      });
    });

    const enc = this.dev.createCommandEncoder();
    // sotto
    this.ud.set([this.under.width, this.under.height, this.sU, this.t, 0, 0, 0, 0, 0, 0, 0, 0, this.ptr[0], this.ptr[1], this.ptr[2], this.on, 0, dt, 0, 0]);
    this.dev.queue.writeBuffer(this.uU, 0, this.ud);
    if (nl) this.dev.queue.writeBuffer(this.lb, 0, this.ld, 0, nl * L_STRIDE);
    const pu = enc.beginRenderPass({ colorAttachments: [{ view: this.cu.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }] });
    if (nl && this.on > 0.003) { pu.setPipeline(this.pUnder); pu.setBindGroup(0, this.bUnder); pu.draw(6, nl); }
    pu.end();
    // sopra: le nascite nell'anello, un passo di simulazione, le particelle
    if (this.nb) {
      const first = Math.min(this.nb, MAXP - this.ring);
      this.dev.queue.writeBuffer(this.pb, this.ring * P_STRIDE * 4, this.born, 0, first * P_STRIDE);
      if (this.nb > first) this.dev.queue.writeBuffer(this.pb, 0, this.born, first * P_STRIDE, (this.nb - first) * P_STRIDE);
      this.ring = (this.ring + this.nb) % MAXP; this.nb = 0;
    }
    if (this.alive > 0 || !this.cleared) {
      this.od.set([this.over.width, this.over.height, this.sO, this.t, ox, oy, 0, 0, C.left, C.top, C.right, C.bottom, 0, 0, 0, Math.max(this.on, 0.0), 0, dt, 0, 0]);
      this.dev.queue.writeBuffer(this.uO, 0, this.od);
      if (this.alive > 0) {
        const cp = enc.beginComputePass(); cp.setPipeline(this.pSim); cp.setBindGroup(0, this.bSim); cp.dispatchWorkgroups(MAXP / 64); cp.end();
      }
      const po = enc.beginRenderPass({ colorAttachments: [{ view: this.co.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }] });
      if (this.alive > 0) { po.setPipeline(this.pParts); po.setBindGroup(0, this.bParts); po.draw(6, MAXP); }
      po.end();
      this.cleared = this.alive <= 0;
      this.alive = Math.max(0, this.alive - dt);
    }
    this.dev.queue.submit([enc.finish()]);
  }

  destroy() {
    this.uU.destroy(); this.uO.destroy(); this.lb.destroy(); this.pb.destroy();
    try { this.cu.unconfigure(); this.co.unconfigure(); } catch {}
  }
}
