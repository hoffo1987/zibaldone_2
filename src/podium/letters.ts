// Le scritte sospese nella sala del podio coperto: lettere vere in 3D, senza cartello né riquadro. Ogni lettera è un
// rilievo pieno (fronte avorio, smusso tondo, fianchi d'ottone) fatto di strati sottili ritagliati da un atlante di campi
// di distanza (SDF, Canvas 2D con il carattere dell'app): gli strati più vicini al fronte si stringono e girano la normale
// (lo smusso), quelli dietro prendono la normale dal gradiente del campo (i fianchi). I bordi sono filtrati sull'impronta
// del pixel e passano all'MSAA come copertura (alpha to coverage), poi l'antialiasing temporale li liscia.
// Le lettere usano la stessa luce della sala (sole o luna dal finestrone, sonde, riflessi), si specchiano nel pavimento e
// fanno ombra nei fasci di luce. Si muovono una per una, piano: un'onda che sale e scende e le gira appena; quando la
// sala compare salgono al loro posto una dopo l'altra.
import { modelLightingShader, type PodiumQuality } from "./shaders";
import type { Cam } from "./stage";

export type SignText = { kicker: string; title: string[]; note: string[]; label: string };
// dove pendono le scritte: sopra il gradone più alto, davanti al finestrone
export const SIGN_AT = [0, 4.35, -0.8];

// ---------- impaginazione (senza GPU: la misura delle lettere arriva da fuori) ----------
// size: em in metri; track: spaziatura in em; bold: allargamento del contorno (unità del campo); depth: spessore (m);
// color: 0 avorio, 1 ambra, 2 oro chiaro, 3 crema velata; lead: distanza dalla linea di base precedente (in em)
type LineStyle = { size: number; track: number; bold: number; depth: number; color: number; lead: number };
const STYLES = {
  kicker: { size: 0.21, track: 0.18, bold: 0.06, depth: 0.03, color: 1, lead: 0 },
  title: { size: 0.6, track: -0.02, bold: 0.07, depth: 0.1, color: 0, lead: 1.55 },
  title2: { size: 0.6, track: -0.02, bold: 0.07, depth: 0.1, color: 2, lead: 1.08 },
  note: { size: 0.25, track: 0.01, bold: 0.04, depth: 0.035, color: 3, lead: 2.05 },
  note2: { size: 0.25, track: 0.01, bold: 0.04, depth: 0.035, color: 3, lead: 1.32 },
};
export type Metrics = { advance: (s: string) => number; box: (ch: string) => { left: number; right: number; asc: number; desc: number } };
export type Placed = { ch: string; line: number; index: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; style: LineStyle };
// righe del cartello → lettere nel piano della scritta (metri, y in alto, centrate su 0, 0). px: em del carattere misurato;
// pad: margine attorno a ogni lettera nell'atlante (px)
export function layoutSign(text: SignText, m: Metrics, px: number, pad: number) {
  const lines: [string, LineStyle][] = [
    [text.kicker.toUpperCase(), STYLES.kicker],
    ...text.title.map((t, i): [string, LineStyle] => [t, i ? STYLES.title2 : STYLES.title]),
    ...text.note.map((t, i): [string, LineStyle] => [t, i ? STYLES.note2 : STYLES.note]),
  ];
  const out: Placed[] = [];
  let base = 0, index = 0;
  lines.forEach(([str, st], line) => {
    if (line) base -= st.lead * st.size;
    const k = st.size / px, chars = Array.from(str), track = st.track * st.size;
    const width = m.advance(str) * k + track * (chars.length - 1);
    let prefix = "";
    chars.forEach((ch, i) => {
      const pen = -width / 2 + m.advance(prefix) * k + track * i;
      prefix += ch;
      if (!ch.trim()) return;
      const b = m.box(ch), w = Math.ceil(b.left + b.right) + 2 * pad, h = Math.ceil(b.asc + b.desc) + 2 * pad;
      const x0 = pen - (b.left + pad) * k, y1 = base + (b.asc + pad) * k;
      out.push({ ch, line, index: index++, x0, y0: y1 - h * k, x1: x0 + w * k, y1, cx: x0 + (w * k) / 2, cy: base + 0.36 * st.size, style: st });
    });
  });
  // il blocco centrato in altezza
  const top = Math.max(...out.map((g) => g.y1)), bottom = Math.min(...out.map((g) => g.y0)), mid = (top + bottom) / 2;
  out.forEach((g) => { g.y0 -= mid; g.y1 -= mid; g.cy -= mid; });
  return out;
}

// ---------- atlante dei campi di distanza ----------
const INF = 1e20;
// trasformata di distanza esatta lungo una riga o una colonna (Felzenszwalb, Huttenlocher): distanze al quadrato
function edt1(g: Float64Array, off: number, stride: number, n: number, f: Float64Array, v: Int32Array, z: Float64Array) {
  for (let q = 0; q < n; q++) f[q] = g[off + q * stride];
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1, k = 0; q < n; q++) {
    let s = 0;
    do { const r = v[k]; s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; g[off + q * stride] = f[r] + (q - r) * (q - r); }
}
function edt(g: Float64Array, w: number, h: number) {
  const n = Math.max(w, h), f = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1(g, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1(g, y * w, 1, w, f, v, z);
}
// campo con segno da una maschera con i bordi sfumati (la copertura dei pixel di bordo dà la posizione sub-pixel):
// 0,5 sul contorno, sopra dentro, sotto fuori; spread: distanza (px) che copre metà della scala
export function signedField(alpha: ArrayLike<number>, w: number, h: number, spread: number) {
  const n = w * h, outer = new Float64Array(n), inner = new Float64Array(n), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = alpha[i] / 255;
    if (a >= 1) { outer[i] = 0; inner[i] = INF; } else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
    else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0; }
  }
  edt(outer, w, h); edt(inner, w, h);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(255 * (0.5 - (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / (2 * spread)))));
  return out;
}

type Atlas = { data: Uint8Array; w: number; h: number; cells: Map<string, number[]> };
// le lettere che servono, una cella ciascuna, a scaffali; il campo calcolato cella per cella
function buildAtlas(chars: string[], g: CanvasRenderingContext2D, px: number, pad: number, spread: number, width: number): Atlas {
  const cells = new Map<string, number[]>(), boxes = chars.map((ch) => { const t = g.measureText(ch); return { ch, left: t.actualBoundingBoxLeft, right: t.actualBoundingBoxRight, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent }; });
  let x = 0, y = 0, row = 0;
  const spots = boxes.map((b) => {
    const w = Math.ceil(b.left + b.right) + 2 * pad, h = Math.ceil(b.asc + b.desc) + 2 * pad;
    if (x + w > width) { x = 0; y += row; row = 0; }
    const at = [x, y, w, h]; x += w; row = Math.max(row, h);
    return at;
  });
  const H = Math.max(4, Math.ceil((y + row) / 4) * 4), data = new Uint8Array(width * H);
  const scratch = document.createElement("canvas"), sg = scratch.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
  boxes.forEach((b, i) => {
    const [cx, cy, w, h] = spots[i];
    scratch.width = w; scratch.height = h;
    sg.font = g.font; sg.textBaseline = "alphabetic"; sg.fillStyle = "#fff";
    sg.clearRect(0, 0, w, h); sg.fillText(b.ch, pad + b.left, pad + b.asc);
    const rgba = sg.getImageData(0, 0, w, h).data, alpha = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) alpha[p] = rgba[p * 4 + 3];
    const field = signedField(alpha, w, h, spread);
    for (let r = 0; r < h; r++) data.set(field.subarray(r * w, r * w + w), (cy + r) * width + cx);
    cells.set(b.ch, [cx / width, cy / H, (cx + w) / width, (cy + h) / H]);
  });
  return { data, w: width, h: H, cells };
}

// ---------- shader ----------
const signStructs = /* wgsl */ `
struct Glyph { rect: vec4f, uv: vec4f, a: vec4f, b: vec4f, c: vec4f };
// rect: piano della scritta (m); uv: cella dell'atlante; a: indice della lettera, riga, colore, em (m);
// b: centro della lettera (x, y), ritardo della comparsa (s), spessore (m); c: grassetto, campo per metro, -, -
struct Sign { origin: vec4f, right: vec4f, up: vec4f, fwd: vec4f, look: vec4f };
// origin.w: tempo della sala; right.w: secondi dalla comparsa; up.w: movimento (0 fermo, 1 vivo); fwd.w: strati;
// look: luce propria del fronte, notte (0 … 1), -, -
@group(2) @binding(0) var<uniform> S: Sign;
@group(2) @binding(1) var<storage, read> G: array<Glyph>;
@group(2) @binding(2) var atlas: texture_2d<f32>;
@group(2) @binding(3) var atlasSamp: sampler;
struct Letter { p: vec3f, r: vec3f, u: vec3f, f: vec3f, uv: vec2f, z: f32, alpha: f32 };
// lo smusso: un quarto di cerchio largo poco più di un centesimo dell'em (le aste restano piene), con i primi strati
// fitti dentro di esso e gli altri distribuiti sul resto dello spessore
fn bevel(em: f32) -> f32 { return 0.012 * em; }
fn sliceDepth(si: u32, slices: u32, depth: f32, rb: f32) -> f32 {
  let kb = select(2u, 3u, slices >= 10u);
  if (si <= kb) { return rb * f32(si) / f32(kb); }
  return rb + (depth - rb) * f32(si - kb) / f32(max(slices - 1u - kb, 1u));
}
// la lettera gi, strato si, vertice vi (striscia di quattro): comparsa, onda, rotazione attorno al suo centro
fn letter(gi: u32, si: u32, slices: u32, vi: u32) -> Letter {
  let g = G[gi];
  let c = vec2f(f32(vi & 1u), f32(vi >> 1u));
  let q = mix(g.rect.xy, g.rect.zw, c);
  var o: Letter;
  o.uv = vec2f(mix(g.uv.x, g.uv.z, c.x), mix(g.uv.w, g.uv.y, c.y));
  o.z = select(sliceDepth(si, slices, g.b.w, bevel(g.a.w)), 0.0, slices <= 1u);
  let k = saturate((S.right.w - g.b.z) / 1.4); let e = 1.0 - (1.0 - k) * (1.0 - k) * (1.0 - k);
  o.alpha = e;
  let t = S.origin.w; let i = g.a.x; let mv = S.up.w; let em = g.a.w;
  // un'onda lenta che attraversa le parole: ogni lettera sale e scende di poco e si gira appena
  let bob = mv * em * (0.05 * sin(t * 0.62 - i * 0.31) + 0.018 * sin(t * 1.13 - i * 0.57 + g.a.y));
  let yaw = mv * (0.13 * sin(t * 0.41 - i * 0.27 + g.a.y * 0.9));
  let pitch = mv * (0.07 * sin(t * 0.53 - i * 0.19 + 1.3));
  let cy = cos(yaw); let sy = sin(yaw); let cp = cos(pitch); let sp = sin(pitch);
  // rotazione: prima attorno all'alto della lettera, poi attorno alla sua destra
  let rot = mat3x3f(vec3f(cy, 0.0, -sy), vec3f(0.0, 1.0, 0.0), vec3f(sy, 0.0, cy)) * mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, cp, sp), vec3f(0.0, -sp, cp));
  let l = rot * vec3f(q.x - g.b.x, q.y - g.b.y, -o.z);
  let rise = -(1.0 - e) * 1.1 * em;
  let s = vec3f(g.b.x, g.b.y + bob + rise, 0.0) + l;
  let B = mat3x3f(S.right.xyz, S.up.xyz, S.fwd.xyz);
  o.p = S.origin.xyz + B * s;
  o.r = B * rot[0]; o.u = B * rot[1]; o.f = B * rot[2];
  return o;
}
`;
const letterShader = (q: PodiumQuality) => /* wgsl */ `${modelLightingShader(q)}${signStructs}
struct LOut { @builtin(position) pos: vec4f,
  @location(0) @interpolate(perspective, centroid) wp: vec3f, @location(1) uv: vec2f,
  @location(2) @interpolate(flat) gi: u32, @location(3) @interpolate(flat) si: u32,
  @location(4) @interpolate(flat) r: vec3f, @location(5) @interpolate(flat) u: vec3f, @location(6) @interpolate(flat) f: vec3f,
  @location(7) @interpolate(flat) za: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> LOut {
  let slices = u32(S.fwd.w); let gi = ii / slices; let si = ii % slices;
  let l = letter(gi, si, slices, vi);
  var o: LOut;
  o.pos = P.vp * vec4f(select(l.p, vec3f(l.p.x, -l.p.y, l.p.z), P.misc.y == 1.0), 1.0);
  o.wp = l.p; o.uv = l.uv; o.gi = gi; o.si = si; o.r = l.r; o.u = l.u; o.f = l.f; o.za = vec2f(l.z, l.alpha);
  return o;
}
// i colori del fronte: di giorno scuri (verde petrolio, ambra, bronzo) contro il finestrone luminoso; di notte chiari
// (avorio, ambra, oro, crema) con la loro luce propria contro la sala buia
var<private> DAY_INKS: array<vec3f, 4> = array<vec3f, 4>(vec3f(0.01, 0.12, 0.105), vec3f(0.55, 0.28, 0.035), vec3f(0.34, 0.17, 0.04), vec3f(0.035, 0.11, 0.1));
var<private> NIGHT_INKS: array<vec3f, 4> = array<vec3f, 4>(vec3f(0.93, 0.89, 0.8), vec3f(0.95, 0.58, 0.16), vec3f(0.96, 0.78, 0.42), vec3f(0.8, 0.77, 0.7));
@fragment fn fs(i: LOut) -> @location(0) vec4f {
  let g = G[i.gi]; let slices = u32(S.fwd.w);
  let d = textureSample(atlas, atlasSamp, i.uv).r;
  let fw = max(fwidth(d), 1e-4);
  let dn = normalize(i.f); let dx = dpdx(dn); let dy = dpdy(dn);
  let kr = min(0.3 * (dot(dx, dx) + dot(dy, dy)), 0.2);
  // smusso tondo: gli strati vicini al fronte si stringono lungo un quarto di cerchio
  let rb = bevel(g.a.w); let zb = min(i.za.x, rb);
  let inset = rb - sqrt(max(rb * rb - (rb - zb) * (rb - zb), 0.0));
  let th = 0.5 - g.c.x + inset * g.c.y;
  let cover = saturate((d - th) / fw + 0.5) * i.za.y;
  if (P.misc.y != 0.0 && cover < 0.5) { discard; }
  if (cover <= 0.002) { return vec4f(0.0); }
  // normale: il fronte guarda avanti, il fondo indietro, i fianchi verso fuori (gradiente del campo), lo smusso in mezzo
  let ts = vec2f(textureDimensions(atlas));
  let gx = textureSampleLevel(atlas, atlasSamp, i.uv + vec2f(1.5 / ts.x, 0.0), 0.0).r - textureSampleLevel(atlas, atlasSamp, i.uv - vec2f(1.5 / ts.x, 0.0), 0.0).r;
  let gy = textureSampleLevel(atlas, atlasSamp, i.uv - vec2f(0.0, 1.5 / ts.y), 0.0).r - textureSampleLevel(atlas, atlasSamp, i.uv + vec2f(0.0, 1.5 / ts.y), 0.0).r;
  let out = -(normalize(i.r) * gx + normalize(i.u) * gy);
  let side = out * inverseSqrt(max(dot(out, out), 1e-10));
  let sb = select(0.0, (rb - zb) / rb, rb > 0.0);
  var n = normalize(side * sqrt(max(1.0 - sb * sb, 0.0)) + dn * sb);
  let front = i.si == 0u; let back = i.si + 1u == slices;
  if (front) { n = dn; } else if (back) { n = -dn; }
  // fronte e smusso: avorio (o ambra e oro per l'occhiello e la data); fianchi: ottone spazzolato
  let ink = mix(DAY_INKS[u32(g.a.z)], NIGHT_INKS[u32(g.a.z)], S.look.y);
  let face = select(smoothstep(0.35, 0.95, sb), 1.0, front);
  var s: Surf;
  s.alb = mix(vec3f(0.86, 0.66, 0.33), ink, face); s.metal = mix(0.85, 0.0, face); s.rough = mix(0.32, 0.36, face);
  s.n = n; s.ao = mix(0.85, 1.0, face); s.kind = 2u; s.sheen = 0.0;
  var eye = P.pos.xyz; if (P.misc.y == 1.0) { eye.y = -eye.y; }
  var col = shadeSurface(s, 0u, i.wp, n, eye, i.pos.xy, kr);
  // una luce propria morbida sul fronte: le scritte si leggono anche nella penombra e di notte
  col += NIGHT_INKS[u32(g.a.z)] * S.look.x * face;
  return vec4f(finite3(col), cover);
}
`;
const letterShadow = /* wgsl */ `${signStructs}
@group(0) @binding(0) var<uniform> light: mat4x4f;
struct SOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) gi: u32, @location(2) alpha: f32 };
// in ombra basta il fronte: le lettere sono sottili rispetto alla penombra
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) gi: u32) -> SOut {
  let l = letter(gi, 0u, 1u, vi);
  var o: SOut; o.pos = light * vec4f(l.p, 1.0); o.uv = l.uv; o.gi = gi; o.alpha = l.alpha;
  return o;
}
@fragment fn fs(i: SOut) {
  let g = G[i.gi];
  if (textureSampleLevel(atlas, atlasSamp, i.uv, 0.0).r < 0.5 - g.c.x || i.alpha < 0.5) { discard; }
}
`;

// ---------- sulla GPU ----------
export class Letters {
  private buffers: GPUBuffer[] = [];
  private textures: GPUTexture[] = [];
  private pipes!: { main: GPURenderPipeline; flat: GPURenderPipeline; shadow: GPURenderPipeline };
  private group!: GPUBindGroup;
  private passes: GPUBindGroup[] = [];
  private uniform!: GPUBuffer;
  private data = new Float32Array(20);
  private glyphs = 0;
  private slices = 1;
  private born = -1;
  private constructor(private device: GPUDevice) {}

  // passBuffers: le camere della sala (0 principale, 1 riflesso del pavimento, 2-7 cubemap) e il fotogramma (8: la luce)
  static async create(device: GPUDevice, text: SignText, q: PodiumQuality, frameLayout: GPUBindGroupLayout, passLayout: GPUBindGroupLayout, passBuffers: GPUBuffer[]) {
    const out = new Letters(device);
    try { await out.init(text, q, frameLayout, passLayout, passBuffers); return out; }
    catch (e) { out.destroy(); throw e; }
  }

  private async init(text: SignText, q: PodiumQuality, frameLayout: GPUBindGroupLayout, passLayout: GPUBindGroupLayout, passBuffers: GPUBuffer[]) {
    const d = this.device, px = q.mobile ? 88 : 128, pad = Math.round(px * 0.11), spread = Math.round(px * 0.09);
    const family = "'Bricolage Grotesque', 'Instrument Sans', sans-serif", font = `500 ${px}px ${family}`;
    const fonts = (document as any).fonts;
    if (fonts?.load) await Promise.race([fonts.load(font, `${text.kicker}${text.title.join("")}${text.note.join("")}`).catch(() => null), new Promise((r) => setTimeout(r, 2500))]);
    const cv = document.createElement("canvas"), g = cv.getContext("2d") as CanvasRenderingContext2D;
    if (!g) throw new Error("Scritte del podio: Canvas 2D non disponibile");
    g.font = font;
    const metrics: Metrics = {
      advance: (s) => g.measureText(s).width,
      box: (ch) => { const t = g.measureText(ch); return { left: t.actualBoundingBoxLeft, right: t.actualBoundingBoxRight, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent }; },
    };
    const placed = layoutSign(text, metrics, px, pad);
    const atlas = buildAtlas(Array.from(new Set(placed.map((p) => p.ch))), g, px, pad, spread, q.mobile ? 1024 : 2048);
    const tex = d.createTexture({ label: "podium-letters", size: [atlas.w, atlas.h], format: "r8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.textures.push(tex);
    d.queue.writeTexture({ texture: tex }, atlas.data, { bytesPerRow: atlas.w }, [atlas.w, atlas.h]);
    const n = placed.length, gd = new Float32Array(n * 20);
    placed.forEach((p, i) => {
      const st = p.style, uv = atlas.cells.get(p.ch)!;
      // la comparsa: tutte le lettere in circa tre secondi, una dopo l'altra
      gd.set([p.x0, p.y0, p.x1, p.y1, ...uv, p.index, p.line, st.color, st.size, p.cx, p.cy, 0.35 + (2.6 * i) / Math.max(1, n - 1), st.depth, st.bold, px / (st.size * 2 * spread), 0, 0], i * 20);
    });
    const buffer = (data: Float32Array, usage: number, label: string) => { const b = d.createBuffer({ label, size: Math.max(16, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST }); this.buffers.push(b); d.queue.writeBuffer(b, 0, data); return b; };
    const glyphBuf = buffer(gd, GPUBufferUsage.STORAGE, "podium-letters-glyphs");
    this.uniform = buffer(this.data, GPUBufferUsage.UNIFORM, "podium-letters-sign");
    this.glyphs = n; this.slices = q.mobile ? 7 : q.tier === "ultra" ? 16 : 12;
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, F = GPUShaderStage.FRAGMENT;
    const own = d.createBindGroupLayout({ label: "podium-letters", entries: [
      { binding: 0, visibility: VF, buffer: { type: "uniform" } }, { binding: 1, visibility: VF, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: F, texture: {} }, { binding: 3, visibility: F, sampler: {} },
    ] });
    const uni = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }] });
    const sampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.group = d.createBindGroup({ layout: own, entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer: glyphBuf } }, { binding: 2, resource: tex.createView() }, { binding: 3, resource: sampler }] });
    this.passes = passBuffers.map((b, i) => d.createBindGroup({ layout: i === 8 ? uni : passLayout, entries: [{ binding: 0, resource: { buffer: b } }] }));
    const module = d.createShaderModule({ label: "podium-letters", code: letterShader(q) });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [frameLayout, passLayout, own] });
    const pipeline = (main: boolean) => d.createRenderPipelineAsync({
      label: `podium-letters-${main ? "main" : "reflection"}`, layout,
      vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-strip", cullMode: "none" },
      multisample: main ? { count: 4, alphaToCoverageEnabled: true } : { count: 1 },
      depthStencil: { format: main ? "depth32float" : "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });
    const sm = d.createShaderModule({ label: "podium-letters-shadow", code: letterShadow });
    const [main, flat, shadow] = await Promise.all([pipeline(true), pipeline(false), d.createRenderPipelineAsync({
      label: "podium-letters-shadow", layout: d.createPipelineLayout({ bindGroupLayouts: [uni, uni, own] }),
      vertex: { module: sm, entryPoint: "vs" }, fragment: { module: sm, entryPoint: "fs", targets: [] },
      primitive: { topology: "triangle-strip", cullMode: "none" },
      depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
    })]);
    this.pipes = { main, flat, shadow };
  }

  // t: tempo della sala; night: 0 giorno … 1 notte; still: niente movimento (preferenze o animazioni spente)
  update(t: number, night: number, c: Cam, still: boolean) {
    const now = performance.now() / 1000;
    if (this.born < 0) this.born = now;
    // la scritta guarda un po' verso la camera quando la sala gira (resta leggibile) e galleggia piano
    const o = SIGN_AT, dx = c.pos[0] - o[0], dz = c.pos[2] - o[2], l = Math.hypot(dx, dz) || 1;
    let fx = (dx / l) * 0.55, fz = 1 - 0.55 + (dz / l) * 0.55;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const float = still ? 0 : 0.05 * Math.sin(t * 0.33);
    this.data.set([o[0], o[1] + float, o[2], t, fz, 0, -fx, still ? 99 : now - this.born, 0, 1, 0, still ? 0 : 1, fx, 0, fz, this.slices, 0.42 * night * night, night, 0, 0]);
    this.device.queue.writeBuffer(this.uniform, 0, this.data);
  }

  // pass: 0 la sala (MSAA), 1 il riflesso del pavimento, 8 l'ombra
  draw(p: GPURenderPassEncoder, pass: number, lighting?: GPUBindGroup) {
    if (!this.glyphs || this.born < 0) return;
    if (pass === 8) {
      p.setPipeline(this.pipes.shadow); p.setBindGroup(0, this.passes[8]); p.setBindGroup(1, this.passes[8]); p.setBindGroup(2, this.group);
      p.draw(4, this.glyphs); return;
    }
    p.setPipeline(pass === 0 ? this.pipes.main : this.pipes.flat);
    p.setBindGroup(0, lighting!); p.setBindGroup(1, this.passes[pass]); p.setBindGroup(2, this.group);
    p.draw(4, this.glyphs * this.slices);
  }

  destroy() { this.buffers.splice(0).forEach((b) => b.destroy()); this.textures.splice(0).forEach((t) => t.destroy()); this.glyphs = 0; }
}
