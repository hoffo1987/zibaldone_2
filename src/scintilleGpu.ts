// Il segnale delle scintille in WebGPU: una tela dentro la carta, dietro le parole. Per ogni riga di una frase accesa un
// quadrato poco più grande della riga, dove il fragment shader disegna sotto il testo la traccia di ogni emozione (le
// forme d'onda di onde.ts: un canale per emozione, più spesso e più alto quante più persone l'hanno scelta), con il
// suo alone di fosforo e, appena sopra, una velatura del colore che domina.
// Quando una frase si accende il pennello dell'oscilloscopio la percorre da sinistra a destra: davanti a sé non c'è
// ancora nulla, dietro lascia la traccia ancora calda (il fosforo appena colpito, che sbiadisce in un attimo); arrivato
// in fondo l'onda si assesta con una piccola oscillazione smorzata. Col puntatore sopra il segnale si anima: l'onda
// corre e si alza un poco. Una scintilla tolta, o la luce spenta, appiattisce la traccia sulla linea e poi la spegne.
// A riposo non si muove nulla e non si disegna nulla: la tela resta com'è finché qualcosa cambia.
// Le posizioni sono in pixel della carta: la tela scorre con il foglio. La carta è chiara anche nel tema scuro: il
// colore è premoltiplicato, steso come inchiostro luminoso, mai additivo.
import type { Tipo } from "./scintille";
import { CODICE, INCHIOSTRO, seme, type Canale } from "./onde";

const U_SIZE = 24; // res, misc, 4 colori
const L_STRIDE = 16; // box, p, q, c
const MAXL = 256;

const SHADER = /* wgsl */ `
struct U { res: vec4f, misc: vec4f, pal: array<vec4f, 4> };
@group(0) @binding(0) var<uniform> u: U;
// box: x y w h; p: inizio lungo la frase, lunghezza, intensità, seme; q: accensione, durata, sopra (puntatore o fumetto), corsa
// c: canali, codici (5 bit per canale: emozione e quante persone), velatura, accesa (0 spenta, 1 piena)
struct L { box: vec4f, p: vec4f, q: vec4f, c: vec4f };
@group(0) @binding(1) var<storage, read> ls: array<L>;
const TAU = 6.2831853; const PI = 3.14159265;
fn clipOf(p: vec2f) -> vec4f { let c = u.res.xy / u.res.z; return vec4f(p.x / c.x * 2. - 1., 1. - p.y / c.y * 2., 0., 1.); }
// le stesse onde di onde.ts
fn wave(k: u32, x: f32) -> f32 {
  if (k == 0u) { return sin(TAU * x / 24.); }
  if (k == 1u) { let e = sin(PI * x / 48.); return sin(TAU * x / 16.) * (.22 + .78 * e * e); }
  if (k == 2u) { return 2. * abs(sin(PI * x / 12.)) - 1.; }
  let f = fract(x / 48.); return sin(TAU * x / 6.) * exp(-2.4 * f) * min(1., f * 14.);
}
fn ov(d: vec4f, c: vec3f, a: f32) -> vec4f { let x = clamp(a, 0., 1.); return vec4f(c * x + d.rgb * (1. - x), x + d.a * (1. - x)); }
const PAD = vec2f(10., 16.);
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec2f, @location(1) @interpolate(flat) id: u32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let l = ls[ii];
  var cs = array(vec2f(0., 0.), vec2f(1., 0.), vec2f(0., 1.), vec2f(0., 1.), vec2f(1., 0.), vec2f(1., 1.));
  let wp = l.box.xy - PAD + cs[vi] * (l.box.zw + PAD * 2.);
  var o: VO; o.pos = clipOf(wp); o.w = wp; o.id = ii; return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let l = ls[i.id]; let p = i.w; let b = l.box; let t = u.res.w;
  let tot = max(l.p.y, 1.); let k = l.p.z; let seed = l.p.w;
  let over = l.q.z; let run = l.q.w;
  // vita: 1 accesa; spegnendo prima l'onda si appiattisce sulla linea (ampiezza), poi il filo sbiadisce (opacità)
  let life = l.c.w; let lit = min(1., life * 3.3);
  let s = l.p.x + (p.x - b.x); // dove si è lungo la frase, in pixel
  // il pennello: davanti alla testa la traccia non c'è ancora
  let T = t - l.q.x; let dur = max(l.q.y, .05);
  let hp = select(-1e5, T / dur * tot, T >= 0.);
  let drawn = smoothstep(hp + 1.5, hp - 3., s);
  let since = max(T - s / tot * dur, 0.);
  let fresh = drawn * exp(-since * 3.2) * step(0., T); // il fosforo appena colpito
  // dopo il passaggio l'onda si assesta: un'oscillazione smorzata dell'ampiezza
  let after = T - dur;
  let settle = select(1., 1. + .5 * exp(-after * 5.) * cos(after * 15.), after > 0.);
  // la traccia nasce e muore sullo zero, all'inizio e alla fine della frase
  let te = clamp(min(s, tot - s) / 10., 0., 1.); let taper = te * te * (3. - 2. * te);
  let yc = b.y + b.w + 2.; // sotto le parole, sulla riga del foglio: l'onda non tocca le lettere
  var o = vec4f(0.);
  // la velatura: il colore che domina, appena, dentro la riga; più presente sotto il puntatore e appena accesa
  let hs = b.zw * .5; let r = min(5., hs.y);
  let qd = abs(p - b.xy - hs) - hs + r; let d = length(max(qd, vec2f(0.))) + min(max(qd.x, qd.y), 0.) - r;
  let inside = smoothstep(1., -1., d) * pow(smoothstep(b.y - 2., b.y + b.w, p.y), 1.4);
  let dom = u.pal[u32(l.c.z) % 4u].rgb;
  o = ov(o, dom, inside * (.035 + .05 * k + .06 * over + .16 * fresh) * drawn * lit);
  let n = u32(l.c.x); let codes = u32(l.c.y);
  for (var c = 0u; c < 4u; c++) {
    if (c >= n) { break; }
    let code = (codes >> (c * 5u)) & 31u; let kind = code & 3u; let many = f32(code >> 2u); // persone: 1..7
    let ph = fract(seed * f32(c * 7u + 3u) * 1.618) * 96. + run;
    let amp = (2.3 + .45 * min(many, 4.) + .5 * k) * (1. + .3 * over) * settle * taper * life;
    let th = .42 + .13 * min(many, 4.) + .1 * over; // mezzo spessore del filo
    // distanza dal filo: lo scarto verticale diviso per la pendenza
    let y0 = yc - amp * wave(kind, s + ph);
    let dy = amp * (wave(kind, s + ph + .6) - wave(kind, s + ph - .6)) / 1.2;
    let dist = abs(p.y - y0) / sqrt(1. + dy * dy);
    let col = u.pal[kind].rgb;
    let halo = exp(-dist / (1.6 + .9 * over + 1.4 * fresh)) * (.14 + .1 * k + .16 * over + .45 * fresh);
    o = ov(o, col, halo * drawn * lit);
    let core = smoothstep(th + .75, th - .45, dist);
    // il fosforo appena colpito è più chiaro: verso il bianco caldo, senza perdere il colore
    o = ov(o, mix(col, vec3f(1., .97, .9), .55 * fresh), core * (.82 + .18 * k) * drawn * lit);
    // la testa del pennello mentre corre su questa riga
    let hx = b.x + hp - l.p.x;
    if (T >= 0. && T < dur + .25 && hx > b.x - 6. && hx < b.x + b.z + 6.) {
      let fade = 1. - smoothstep(dur, dur + .25, T);
      let hy = yc - amp * wave(kind, hp + ph);
      let hv = p - vec2f(hx, hy); let hd = length(hv);
      o = ov(o, col, exp(-hd / 4.5) * .55 * fade * lit);
      o = ov(o, mix(col, vec3f(1.), .7), exp(-hd * hd / 3.) * fade * lit);
    }
  }
  // dentro il proprio quadrato: niente spigoli
  let edge = min(min(p.x - (b.x - PAD.x), b.x + b.z + PAD.x - p.x), min(p.y - (b.y - PAD.y), b.y + b.w + PAD.y - p.y));
  return o * smoothstep(0., 4., edge);
}`;

const OVER: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
const pipelines = new WeakMap<GPUDevice, GPURenderPipeline>();
// Bound the backing store by the viewport, independently of the length of the writing.
export function signalSize(w: number, h: number, viewport: number, dpr: number, limit = 8192) {
  const height = Math.max(1, Math.min(h, viewport + 384));
  const scale = Math.min(dpr, 2, Math.sqrt(4e6 / Math.max(1, w * height)), limit / Math.max(1, height), limit / Math.max(1, w));
  return { height, scale, width: Math.max(1, Math.floor(w * scale)), pixelsHigh: Math.max(1, Math.floor(height * scale)) };
}

export type Span = { key: string; boxes: { x: number; y: number; w: number; h: number }[]; canali: Canale[]; focus: boolean };
type St = { span: Span; k: number; life: number; over: number; run: number; t0: number; dur: number; seed: number; dying: boolean; tot: number; fresh: boolean; arrived: boolean };

// i canali in un solo numero: per ognuno 2 bit di emozione e 3 di persone (fino a 7)
const pack = (cs: Canale[]) => cs.slice(0, 4).reduce((a, c, i) => a + ((CODICE[c.tipo] | (Math.min(7, Math.max(1, c.n)) << 2)) << (i * 5)), 0);
const dominante = (cs: Canale[]) => cs[0] || { tipo: "bellissima" as Tipo, n: 0 }; // i canali arrivano già col più scelto in testa

export type { Canale };
export class Segnale {
  private readonly ub: GPUBuffer; private readonly lb: GPUBuffer;
  private readonly pipe: GPURenderPipeline; private readonly bind: GPUBindGroup;
  private readonly cx: GPUCanvasContext;
  private readonly ud = new Float32Array(U_SIZE); private readonly ld = new Float32Array(MAXL * L_STRIDE);
  private st = new Map<string, St>();
  private t = performance.now() / 1000; private last = 0; private busy = 0; private dirty = true;
  private on = 1; private want = 1; private px = 0; private py = 0; private inside = false;
  private sc = 1;
  private offset = 0; private height = 1; private paperHeight = 1;
  onInvalidate?: () => void;
  onArrive?: () => void; // il pennello è arrivato in fondo alla frase appena accesa

  constructor(private readonly dev: GPUDevice, private readonly canvas: HTMLCanvasElement, private readonly paper: HTMLElement) {
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.cx = canvas.getContext("webgpu")!;
    this.cx.configure({ device: dev, format, alphaMode: "premultiplied" });
    const U = GPUBufferUsage;
    this.ub = dev.createBuffer({ label: "segnale", size: U_SIZE * 4, usage: U.UNIFORM | U.COPY_DST });
    this.lb = dev.createBuffer({ label: "segnale-righe", size: this.ld.byteLength, usage: U.STORAGE | U.COPY_DST });
    let pipe = pipelines.get(dev);
    if (!pipe) {
      const m = dev.createShaderModule({ label: "segnale", code: SHADER });
      pipe = dev.createRenderPipeline({ label: "segnale", layout: "auto", vertex: { module: m, entryPoint: "vs" }, fragment: { module: m, entryPoint: "fs", targets: [{ format, blend: OVER }] }, primitive: { topology: "triangle-list" } });
      pipelines.set(dev, pipe);
    }
    this.pipe = pipe;
    this.bind = dev.createBindGroup({ layout: this.pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.ub } }, { binding: 1, resource: { buffer: this.lb } }] });
    (Object.keys(CODICE) as Tipo[]).forEach((tp) => { const c = INCHIOSTRO[tp]; this.ud.set([c[0] / 255, c[1] / 255, c[2] / 255, 1], 8 + CODICE[tp] * 4); });
  }

  // la tela copre la carta; il filo è sottile e vuole i pixel veri: si scende di risoluzione solo con fogli enormi
  fit(viewport = window.innerHeight) {
    const W = this.paper.clientWidth, H = this.paper.clientHeight, dpr = window.devicePixelRatio || 1;
    const size = signalSize(W, H, viewport, dpr, this.dev.limits.maxTextureDimension2D);
    this.sc = size.scale; this.height = size.height; this.paperHeight = H;
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.pixelsHigh) this.canvas.height = size.pixelsHigh;
    this.canvas.style.height = `${size.height}px`; this.canvas.style.bottom = "auto";
    this.dirty = true;
  }
  viewport(top: number) {
    const offset = Math.floor(Math.max(0, Math.min(this.paperHeight - this.height, top - 192)));
    if (offset === this.offset) return;
    this.offset = offset; this.canvas.style.transform = `translateY(${offset}px)`;
    this.dirty = true; this.onInvalidate?.();
  }

  // le frasi accese: una nuova entra col pennello (le nuove una dopo l'altra), una che sparisce si appiattisce e si spegne
  set(spans: Span[], fresh?: string | null) {
    const seen = new Set<string>();
    let n = 0;
    spans.forEach((sp) => {
      seen.add(sp.key);
      const s = this.st.get(sp.key), tot = sp.boxes.reduce((a, b) => a + b.w, 0);
      if (s) { s.span = sp; s.tot = tot; s.dying = false; return; }
      this.st.set(sp.key, { span: sp, k: 0, life: 1, over: 0, run: 0, t0: 1e9, dur: 0, seed: seme(sp.key), dying: false, tot, fresh: sp.key === fresh, arrived: false });
      this.sweep(sp.key, sp.key === fresh ? 0.12 : (n++ % 8) * 0.13);
    });
    this.st.forEach((s, key) => { if (!seen.has(key)) s.dying = true; });
    this.wake(1.5);
  }

  // riaccendere tutto: il pennello ripassa, frase per frase
  replay() { let i = 0; this.st.forEach((s, key) => { if (!s.dying) this.sweep(key, (i++ % 8) * 0.13); }); }

  private sweep(key: string, delay: number) {
    const s = this.st.get(key); if (!s) return;
    // il pennello va a velocità costante (un po' più calmo per la frase appena accesa), mai troppo lento
    s.t0 = this.t + delay; s.dur = Math.min(s.fresh ? 1.6 : 1.1, Math.max(s.fresh ? 0.7 : 0.4, s.tot / (s.fresh ? 520 : 820))); s.arrived = false;
    this.wake(delay + s.dur + 1.2);
  }

  // snap: subito, senza dissolvenza (all'apertura)
  show(v: boolean, snap = false) { this.want = v ? 1 : 0; if (snap) this.on = this.want; this.wake(1.5); }
  pointer(x: number, y: number, inside: boolean) { this.px = x; this.py = y; this.inside = inside; this.wake(0.6); }
  private wake(sec: number) { this.t = performance.now() / 1000; this.busy = Math.max(this.busy, this.t + sec); this.dirty = true; this.onInvalidate?.(); }
  // a riposo un disegno al secondo, solo per accorgersi di cambiare: il lavoro vero lo salta draw()
  fps() { return this.t < this.busy ? 60 : 0; }

  draw(now: number) {
    const dt = Math.min(0.25, this.last ? (now - this.last) / 1000 : 0.016); this.last = now; this.t = now / 1000;
    const moving = this.t < this.busy;
    if (!moving && !this.dirty) return;
    const ease = 1 - Math.exp(-dt * 7), hoverEase = 1 - Math.exp(-dt * 9);
    this.on += (this.want - this.on) * (1 - Math.exp(-dt * (this.want ? 6 : 4)));
    let anim = Math.abs(this.want - this.on) > 0.002;
    let nl = 0;
    this.st.forEach((s, key) => {
      const target = Math.min(1, 0.35 + 0.18 * s.span.canali.reduce((a, c) => a + c.n, 0));
      s.k += (target - s.k) * ease;
      s.life += ((s.dying ? 0 : 1) - s.life) * (1 - Math.exp(-dt * 4.5));
      if (s.dying && s.life < 0.01) { this.st.delete(key); return; }
      // sotto il puntatore (col margine dell'onda sotto la riga) o con il fumetto aperto: il segnale si anima
      const hov = !s.dying && (s.span.focus || (this.inside && s.span.boxes.some((b) => this.px >= b.x - 4 && this.px <= b.x + b.w + 4 && this.py >= b.y - 4 && this.py <= b.y + b.h + 12)));
      s.over += ((hov ? 1 : 0) - s.over) * hoverEase;
      s.run = (s.run + dt * 34 * s.over) % 96;
      if (Math.abs(s.k - target) > 0.003 || Math.abs(s.life - (s.dying ? 0 : 1)) > 0.003 || s.over > 0.003 || (hov && s.over < 0.997)) anim = true;
      const T = this.t - s.t0;
      if (T > -0.5 && T < s.dur + 1.2) anim = true;
      if (s.fresh && !s.arrived && T >= s.dur) { s.arrived = true; s.fresh = false; this.onArrive?.(); }
      const dom = dominante(s.span.canali);
      let acc = 0;
      s.span.boxes.forEach((b) => {
        const start = acc; acc += b.w;
        if (nl >= MAXL || b.y + b.h + 16 < this.offset || b.y - 16 > this.offset + this.height) return;
        this.ld.set([b.x, b.y - this.offset, b.w, b.h, start, s.tot, s.k, s.seed, s.t0, s.dur || 1, Math.max(s.over, s.span.focus ? 1 : 0), s.run,
          Math.min(4, s.span.canali.length), pack(s.span.canali), CODICE[dom.tipo], s.life * this.on], nl * L_STRIDE);
        nl++;
      });
    });
    if (anim) this.busy = Math.max(this.busy, this.t + 0.25);
    this.dirty = false;
    this.ud.set([this.canvas.width, this.canvas.height, this.sc, this.t, Math.max(this.on, 0), dt, 0, 0], 0);
    this.dev.queue.writeBuffer(this.ub, 0, this.ud);
    if (nl) this.dev.queue.writeBuffer(this.lb, 0, this.ld, 0, nl * L_STRIDE);
    const enc = this.dev.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.cx.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }] });
    if (nl && this.on > 0.003) { pass.setPipeline(this.pipe); pass.setBindGroup(0, this.bind); pass.draw(6, nl); }
    pass.end();
    this.dev.queue.submit([enc.finish()]);
  }

  destroy() {
    this.ub.destroy(); this.lb.destroy();
    try { this.cx.unconfigure(); } catch {}
  }
}
