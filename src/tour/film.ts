import { track, impulse } from "./motion";

// ===== IL FILM DELLA PRESENTAZIONE =====
// Una scena 3D disegnata su un solo canvas 2D, senza WebGL: una scheda elettronica sterminata, la targa smaltata del logo
// con la C in rilievo, chip veri come piedistalli, scritte estruse che si alzano come monumenti e si specchiano sulle
// superfici lucide, correnti sulle piste, pozze e fasci di luce. La macchina da presa segue il jingle (intro.mp3): ogni
// movimento e ogni scritta cadono su un attacco preciso del brano (misurati sul file, vedi MUSIC).
// Prima del brano c'è il buio: solo un pulsante 3D acceso dal suo LED. Premuto, la luce si propaga e il film comincia.
// Le scritte sono pre-disegnate in atlanti (faccia, fianchi, bagliore) e poi solo trasformate: a ogni fotogramma il
// canvas copia immagini già pronte, che è ciò che anche un telefono fa velocemente.

// tempi del brano in secondi: attacco, rintocco, ritorno del basso, campane, crescendo, drop e i tre colpi del ritmo
export const MUSIC = { hit: 0.06, bloom: 0.15, chime: 1.54, accent: 2.1, s1: 3.5, s2: 4.9, s3: 6.08, fall: 7.25, rise: 8.0, drop: 9.12, k1: 10.26, k2: 11.43, k3: 12.6, tag: 13.0, out: 13.45, end: 14.6 };
const HATS = [9.5, 9.9, 11.0, 11.8, 12.2, 13.0, 13.4];
const M = MUSIC;

export type FilmText = { stations: { word: string; line: string; icon: string }[]; hello: string; stamps: string[]; tag: string };
export type FilmOpts = { text: FilmText; calm: boolean; low: boolean };
// draw(t): t < 0 è l'attesa al buio col pulsante; node(): il nodo ambra del logo sullo schermo (per il volo verso il tour);
// button(): il pulsante d'accensione sullo schermo; gate(): passaggio del mouse e pressione
export type Film = {
  draw: (t: number) => void; resize: () => void; dispose: () => void;
  node: () => { x: number; y: number } | null; button: () => { x: number; y: number; r: number } | null;
  gate: (s: { hover?: boolean; press?: boolean }) => void;
};

type V3 = [number, number, number];
type Cam = { p: V3; r: V3; u: V3; f: V3; F: number; cx: number; cy: number; dist: number };
const D2R = Math.PI / 180, NEAR = 0.6, TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp01(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mulberry = (a: number) => () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// la luce principale arriva da sinistra, dall'alto e un po' da davanti
const LK: V3 = (() => { const v: V3 = [-0.45, 0.78, -0.42], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

// v = [mira x, y, z, distanza, imbardata, beccheggio, rollio, zoom]
const camera = (v: number[], W: number, H: number, F: number, sx: number, sy: number): Cam => {
  const [tx, ty, tz, dist, yaw, pitch, roll, fov] = v, ys = yaw * D2R, ps = pitch * D2R, rs = (roll || 0) * D2R;
  const f: V3 = [Math.sin(ys) * Math.cos(ps), -Math.sin(ps), Math.cos(ys) * Math.cos(ps)];
  let r: V3 = [Math.cos(ys), 0, -Math.sin(ys)], u = cross(f, r);
  if (rs) { const c = Math.cos(rs), s = Math.sin(rs), r2: V3 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s]; u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s]; r = r2; }
  return { p: [tx - f[0] * dist, ty - f[1] * dist, tz - f[2] * dist], r, u, f, F: F * (fov || 1), cx: W / 2 + sx, cy: H / 2 + sy, dist };
};
// proiezione: o = [x schermo, y schermo, profondità, scala px per unità]
const proj = (c: Cam, x: number, y: number, z: number, o: number[]) => {
  const dx = x - c.p[0], dy = y - c.p[1], dz = z - c.p[2];
  const zc = dx * c.f[0] + dy * c.f[1] + dz * c.f[2];
  if (zc < NEAR) return false;
  const k = c.F / zc;
  o[0] = c.cx + (dx * c.r[0] + dy * c.r[1] + dz * c.r[2]) * k;
  o[1] = c.cy - (dx * c.u[0] + dy * c.u[1] + dz * c.u[2]) * k;
  o[2] = zc; o[3] = k;
  return true;
};

// ---------- scritte: atlanti di glifi (faccia a piena risoluzione, fianchi a metà, bagliore a un quarto) ----------
type Glyph = { x: number; adv: number; cx: number; cw: number };
type Atlas = { c: HTMLCanvasElement; s: number };
type Label = {
  g: Glyph[]; W: number; asc: number; desc: number; pad: number; ch: number;
  face: Atlas; edge: Atlas | null; deep: Atlas | null; glow: Atlas | null;
  x: number; y: number; z: number; ry: number; ext: number; layers: number; scene: number;
  t0: number; stg: number; dur: number; stagger: "sweep" | "center"; kind: "rise" | "slam" | "fade"; out: number; outStg: number; flash: number[];
  // mirror: quota della superficie lucida che la riflette; beam: quota da cui sale il fascio di luce
  mirror: number | null; beam: number | null; glowCol: string;
};
const FACE_TOP = "#FFFFFF", FACE_BOT = "#C9F7EE";
const mkAtlas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const buildLabel = (text: string, font: string, em: number, fpx: number, o: { extrude: boolean; glow: string | null; low: boolean }): Label => {
  fpx = Math.round(Math.max(24, Math.min(o.low ? 160 : 280, fpx)));
  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = font.replace("%", String(fpx));
  const chars = Array.from(text), pxu = fpx / em;
  const m = meas.measureText("ÀÉgjpqÍ"), ascPx = Math.max(fpx * 0.8, (m as any).actualBoundingBoxAscent || fpx * 0.92), descPx = Math.max(fpx * 0.2, (m as any).actualBoundingBoxDescent || fpx * 0.24);
  const pad = Math.ceil(fpx * (o.glow ? 0.22 : 0.06)), ch = Math.ceil(ascPx + descPx + pad * 2);
  const g: Glyph[] = []; let cx = 0;
  chars.forEach((c, i) => {
    const x = meas.measureText(chars.slice(0, i).join("")).width, adv = meas.measureText(c).width;
    const cw = Math.ceil(adv + pad * 2 + fpx * 0.08);
    g.push({ x: x / pxu, adv: adv / pxu, cx, cw }); cx += cw;
  });
  const totalW = meas.measureText(text).width / pxu;
  const paint = (scale: number, fill: (gc: CanvasRenderingContext2D) => void, glow?: string) => {
    const c = mkAtlas(cx * scale, ch * scale), gc = c.getContext("2d")!;
    gc.scale(scale, scale); gc.font = meas.font; gc.textBaseline = "alphabetic";
    fill(gc);
    if (glow) { gc.shadowColor = glow; gc.shadowBlur = fpx * 0.16 * scale; gc.shadowOffsetX = 0; }
    chars.forEach((c2, i) => { if (c2 !== " ") gc.fillText(c2, g[i].cx + pad, pad + ascPx); });
    return { c, s: scale };
  };
  const face = paint(1, (gc) => { const gr = gc.createLinearGradient(0, pad, 0, pad + ascPx + descPx * 0.4); gr.addColorStop(0.15, FACE_TOP); gr.addColorStop(1, FACE_BOT); gc.fillStyle = gr; });
  const edge = o.extrude ? paint(0.5, (gc) => { gc.fillStyle = "#3FD8C1"; }) : null;
  const deep = o.extrude ? paint(0.5, (gc) => { const gr = gc.createLinearGradient(0, pad, 0, pad + ascPx); gr.addColorStop(0, "#0E5C53"); gr.addColorStop(1, "#06302B"); gc.fillStyle = gr; }) : null;
  const glow = o.glow && !o.low ? paint(0.25, (gc) => { gc.fillStyle = o.glow!; }, o.glow) : null;
  return { g, W: totalW, asc: ascPx / pxu, desc: descPx / pxu, pad: pad / pxu, ch: ch / pxu, face, edge, deep, glow, x: 0, y: 0, z: 0, ry: 0, ext: em * 0.2, layers: o.extrude ? (o.low ? 4 : 9) : 0, scene: 0, t0: 0, stg: 0.05, dur: 0.6, stagger: "sweep", kind: "rise", out: 99, outStg: 0.03, flash: [], mirror: null, beam: null, glowCol: o.glow || "#2DD4BF" };
};

// ---------- scheda: piste a 45°, piazzole, chip; tutto sul piano y = 0 (x a destra, z in avanti) ----------
type Trace = { p: number[]; c: number[]; L: number; d0: number; w: number; on: number; comet: number; v: number; amber: boolean };
type Chip = { x: number; z: number; w: number; d: number; h: number; lit: number; ped: boolean; icon?: number[][] };
const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const mkTrace = (pts: number[][], w: number, R: () => number, amber = false): Trace => {
  // la pista parte sempre dal capo più vicino al centro: la corrente esce dal logo e ci ritorna nel crescendo
  if (Math.hypot(pts[0][0], pts[0][1]) > Math.hypot(pts[pts.length - 1][0], pts[pts.length - 1][1])) pts = pts.slice().reverse();
  const p: number[] = [], c = [0];
  pts.forEach(([x, z], i) => { p.push(x, z); if (i) c.push(c[i - 1] + Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])); });
  const d0 = Math.hypot(pts[0][0], pts[0][1]);
  return { p, c, L: c[c.length - 1] || 1, d0, w, on: M.bloom + d0 / 58, comet: R() < 0.55 ? R() : -1, v: 7 + R() * 9, amber };
};
const at = (q: Trace, d: number, o: number[]) => {
  d = Math.max(0, Math.min(q.L, d));
  let i = 1; while (i < q.c.length - 1 && q.c[i] < d) i++;
  const s = (d - q.c[i - 1]) / ((q.c[i] - q.c[i - 1]) || 1);
  o[0] = q.p[(i - 1) * 2] + (q.p[i * 2] - q.p[(i - 1) * 2]) * s; o[1] = q.p[(i - 1) * 2 + 1] + (q.p[i * 2 + 1] - q.p[(i - 1) * 2 + 1]) * s;
};
const ICONS: Record<string, number[][]> = {
  pen: [[-1.2, -1.2, 0.6, 0.6, 1.2, 1.2, 0.6, 1.4, -1.4, -0.6, -1.2, -1.2], [-1.2, -1.2, -0.3, -0.3]],
  stack: [[-1.3, 0.2, 0, 0.9, 1.3, 0.2, 0, -0.5, -1.3, 0.2], [-1.3, -0.4, 0, -1.1, 1.3, -0.4]],
  star: [[0, 1.4, 0.4, 0.45, 1.35, 0.4, 0.6, -0.2, 0.85, -1.2, 0, -0.6, -0.85, -1.2, -0.6, -0.2, -1.35, 0.4, -0.4, 0.45, 0, 1.4]],
  eye: [[-1.5, 0, -0.75, 0.75, 0, 0.95, 0.75, 0.75, 1.5, 0, 0.75, -0.75, 0, -0.95, -0.75, -0.75, -1.5, 0], [-0.35, 0, 0, 0.35, 0.35, 0, 0, -0.35, -0.35, 0]],
  cup: [[-0.9, 1.1, 0.9, 1.1, 0.7, 0.1, 0, -0.3, -0.7, 0.1, -0.9, 1.1], [0, -0.3, 0, -0.9], [-0.6, -1.1, 0.6, -1.1]],
};
const STATIONS = [{ x: -10, z: 34 }, { x: 10, z: 62 }, { x: -8, z: 90 }];
const HZ = 12; // il saluto del drop sta dietro al centro della scheda
// la targa del logo: il quadrato smaltato dell'icona del sito (64 unità del disegno = 21,3 di scena), spessa, con la C in rilievo
const PS = 10.67, PR = 5.67, PH = 0.9, TITLE_Z = 8.3;
const BTN = { x: -0.33, z: 0, rb: 2.3, hb: 0.27, rc: 1.68, hc: 0.58 };

const buildBoard = (R: () => number, low: boolean) => {
  const traces: Trace[] = [], chips: Chip[] = [];
  const keep: number[][] = [[-14, -12.5, 14, 12.5]]; // la targa e il titolo
  STATIONS.forEach((s) => keep.push([s.x - 11, s.z - 5, s.x + 11, s.z + 4]));
  const blocked = (x: number, z: number) => keep.some((k) => x > k[0] && x < k[2] && z > k[1] && z < k[3]);
  // il bus: dalla targa a ciascuna stazione, la pista che la macchina da presa segue (finisce dentro il chip)
  const bus = [
    [[10.7, 0], [13, 0], [13, 22], [5, 30], [1, 30], [1, 34], [-6, 34]],
    [[-10, 35.5], [-10, 44], [4, 58], [4, 62], [6, 62]],
    [[10, 63.5], [10, 71], [-4, 85], [-4, 90], [-6, 90]],
  ];
  bus.forEach((b) => traces.push(mkTrace(b, 0.2, R, true)));
  STATIONS.forEach((s) => chips.push({ x: s.x, z: s.z, w: 12, d: 3.4, h: 1.15, lit: 0, ped: true }));
  // piste: passeggiate a 45° su una griglia, che girano quasi sempre di 45° e qualche volta di 90°
  const G = 1.6, n = low ? 150 : 270;
  for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) {
    let x = Math.round(((R() - 0.5) * 132) / G) * G, z = Math.round((R() * 172 - 38) / G) * G, d = Math.floor(R() * 8);
    if (blocked(x, z)) continue;
    const pts = [[x, z]];
    for (let s = 2 + Math.floor(R() * 4); s > 0; s--) {
      const len = 2 + Math.floor(R() * 6); let ok = 0;
      for (let k = 1; k <= len; k++) { if (blocked(x + DIR8[d][0] * G * k, z + DIR8[d][1] * G * k)) break; ok = k; }
      if (!ok) break;
      x += DIR8[d][0] * G * ok; z += DIR8[d][1] * G * ok; pts.push([x, z]);
      d = (d + (R() < 0.82 ? (R() < 0.5 ? 1 : 7) : (R() < 0.5 ? 2 : 6))) % 8;
    }
    if (pts.length < 2) continue;
    traces.push(mkTrace(pts, R() < 0.15 ? 0.22 : 0.12, R, R() < 0.1)); i++;
  }
  // chip decorativi negli spazi liberi, bassi: lo sfondo ha profondità ma non ruba la scena
  for (let i = 0, tries = 0; i < (low ? 8 : 14) && tries < 200; tries++) {
    const w = 4 + Math.round(R() * 4) * 1.6, d = 3 + Math.round(R() * 3) * 1.6, x = (R() - 0.5) * 110, z = R() * 150 - 30;
    if ([[x - w / 2, z - d / 2], [x + w / 2, z + d / 2], [x, z]].some(([a, b]) => blocked(a, b)) || Math.hypot(x, z) < 16) continue;
    chips.push({ x, z, w, d, h: 0.45, lit: 0, ped: false }); keep.push([x - w / 2 - 1, z - d / 2 - 1, x + w / 2 + 1, z + d / 2 + 1]); i++;
  }
  return { traces, chips };
};
// contorno della targa (quadrato dagli angoli tondi), in senso antiorario visto dall'alto
const PLATE = (() => {
  const pts: number[][] = [], c = [[PS - PR, PS - PR, 0], [-(PS - PR), PS - PR, 90], [-(PS - PR), -(PS - PR), 180], [PS - PR, -(PS - PR), 270]];
  c.forEach(([cx, cz, a0]) => { for (let k = 0; k <= 6; k++) { const a = (a0 + k * 15) * D2R; pts.push([cx + Math.cos(a) * PR, cz + Math.sin(a) * PR]); } });
  return pts;
})();

// ---------- il film ----------
export function createFilm(cv: HTMLCanvasElement, o: FilmOpts): Film {
  const screen = cv.getContext("2d", { alpha: true })!;
  let ctx = screen;
  // Un buffer di scena e uno piccolo per lo sfocato, riutilizzati per i piani ottici.
  // I glifi a fuoco restano alla risoluzione del display.
  const layer = mkAtlas(1, 1), layerCtx = layer.getContext("2d")!, soft = mkAtlas(1, 1), softCtx = soft.getContext("2d")!;
  const supportsFilter = "filter" in softCtx;
  let layerDpr = 1, focus = 1, aperture = 0;
  const depthOf = (c: Cam, x: number, y: number, z: number) => (x - c.p[0]) * c.f[0] + (y - c.p[1]) * c.f[1] + (z - c.p[2]) * c.f[2];
  const plane = (depth: number) => {
    if (!aperture) return 2;
    const ratio = depth / focus;
    if (low) return ratio > 1.14 ? 0 : ratio < 0.86 ? 4 : 2;
    return ratio > 1.55 ? 0 : ratio > 1.14 ? 1 : ratio < 0.65 ? 4 : ratio < 0.86 ? 3 : 2;
  };
  const blurFor = (band: number) => (low ? [4, 0, 0, 0, 3.5] : [8, 3.2, 0, 2.5, 7])[band] * aperture;
  const labelBlur = (depth: number) => Math.min(8, Math.max(0, Math.abs(1 - focus / Math.max(NEAR, depth)) - 0.14) * 16) * aperture;
  const beginLayer = () => {
    ctx = layerCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.setTransform(layerDpr, 0, 0, layerDpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  };
  const composite = (blur: number, nativeDpr: number) => {
    screen.save(); screen.setTransform(nativeDpr, 0, 0, nativeDpr, 0, 0);
    if (blur > 0) {
      // La convoluzione lavora sul buffer piccolo, mai sul canvas retina a schermo intero.
      const w = soft.width, h = soft.height;
      softCtx.clearRect(0, 0, w, h);
      // Nei browser senza Canvas.filter rimane il campionamento morbido del buffer piccolo.
      if (supportsFilter) softCtx.filter = `blur(${(blur * w / W).toFixed(2)}px)`;
      softCtx.drawImage(layer, 0, 0, w, h);
      if (supportsFilter) softCtx.filter = "none";
      screen.drawImage(soft, 0, 0, W, H);
    } else screen.drawImage(layer, 0, 0, W, H);
    screen.restore();
  };
  const R = mulberry(0x2f6a1c ^ (o.text.hello.length * 7919));
  let low = o.low, W = 0, H = 0, dpr = 1, F = 1, portrait = false;
  const board = buildBoard(R, low);
  // sprite di luce e d'ombra, una volta sola
  const dot = (() => { const c = mkAtlas(64, 64), g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.2, "rgba(255,255,255,.6)"); r.addColorStop(0.55, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; })();
  const tint = (col: string, core = true) => { const c = mkAtlas(64, 64), g = c.getContext("2d")!; g.drawImage(dot, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, 64, 64); if (core) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.6; g.drawImage(dot, 16, 16, 32, 32); } return c; };
  const DOT_T = tint("#2DD4BF"), DOT_A = tint("#FBBF24"), DOT_W = tint("#CFFAF1"), DOT_K = tint("#000000", false);
  const POOL = [tint("#17C3AE", false), tint("#FBBF24", false), tint("#BFF7EC", false)];
  const teal: string[] = [], amber: string[] = [], white: string[] = [];
  for (let i = 0; i <= 50; i++) { const a = (i / 50).toFixed(2); teal.push(`rgba(45,212,191,${a})`); amber.push(`rgba(251,191,36,${a})`); white.push(`rgba(230,255,250,${a})`); }
  const qa = (arr: string[], a: number) => arr[Math.round(clamp01(a) * 50)];
  const rgb = (r: number, g: number, b: number, k: number) => `rgb(${Math.min(255, Math.round(r * k))},${Math.min(255, Math.round(g * k))},${Math.min(255, Math.round(b * k))})`;

  let labels: Label[] = [], camA: (t: number) => number[] = () => [0, 0, 0, 40, 0, 89, 0, 1], camB = camA, bg: CanvasGradient | null = null;
  type P = { x: number; y: number; vx: number; vy: number; l: number; s: number; a: boolean };
  const parts: P[] = [];
  const rings: { x: number; z: number; y: number; t0: number; r: number; amber: boolean }[] = [];
  const fired = new Set<string>();
  let lastT = -9, flow = 0, cam: Cam | null = null, gateCam: number[] = [BTN.x, PH, 0, 12, -24, 34, 0, 1];
  const frames: number[] = [];
  const gate = { hover: 0, hoverOn: false, pressAt: 0, t0: performance.now(), lastFrame: performance.now() };
  // pulviscolo che galleggia nella luce del LED, prima dell'accensione
  const motes = Array.from({ length: 34 }, () => ({ a: R() * TAU, r: 0.6 + R() * 5.5, y: R() * 4, s: 0.15 + R() * 0.35, ph: R() * TAU }));

  const FONT = {
    title: "600 %px Unbounded, 'Bricolage Grotesque', sans-serif",
    head: "700 %px 'Bricolage Grotesque', 'Instrument Sans', sans-serif",
    line: "600 %px 'Instrument Sans', system-ui, sans-serif",
  };
  // pixel per unità che la scritta avrà nella sua inquadratura: gli atlanti nascono già alla risoluzione giusta
  const pxPer = (frameW: number, k: number) => (k * W * dpr) / frameW;
  const fitDist = (frameW: number, k: number) => (frameW * F) / (k * W);
  const est = (s: string, em: number, wide = 0.58) => Array.from(s).length * em * wide;
  const splitLine = (s: string) => { const w = s.split(" "); if (w.length < 2) return [s]; let best = 1, bd = 1e9; for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length); if (d < bd) { bd = d; best = i; } } return [w.slice(0, best).join(" "), w.slice(best).join(" ")]; };
  const splitHello = (s: string) => { const i = s.indexOf(", "); return i > 0 ? [s.slice(0, i + 1), s.slice(i + 2)] : [s]; };

  const layout = () => {
    const T = o.text, kTitle = portrait ? 0.9 : 0.62, kHead = portrait ? 0.86 : 0.5, kHello = portrait ? 0.86 : 0.62;
    labels = [];
    const add = (text: string, font: string, em: number, frameW: number, k: number, extrude: boolean, glow: string | null, scene: number, at0: Partial<Label>) => {
      const L = buildLabel(text, font, em, em * pxPer(frameW, k) * 1.15, { extrude, glow, low });
      Object.assign(L, at0, { scene }); labels.push(L); return L;
    };
    // 0 · il titolo si alza dalla targa, dietro alla C, e si specchia nello smalto
    const title = add("Il Circuito", FONT.title, 3.1, est("Il Circuito", 3.1, 0.78) + 2, kTitle, true, "#2DD4BF", 0, { x: 0, y: PH, z: TITLE_Z, t0: 1.22, stg: 0.04, dur: 0.68, kind: "rise", out: M.fall + 0.25, outStg: 0.035, flash: [M.chime, M.accent], mirror: PH, beam: PH });
    // 1-3 · le stazioni: la parola in piedi sul suo chip, la spiegazione incisa sul fronte del chip
    const stW = T.stations.map((s, i) => {
      const P = STATIONS[i], lines = portrait ? splitLine(s.line) : [s.line], fw = Math.max(est(s.word, 3), ...lines.map((l) => est(l, 0.62, 0.52))) + 3;
      const t0 = [M.s1, M.s2, M.s3][i] - 0.04, chH = portrait ? 2.1 : 1.5, chD = 4, chip = board.chips[i];
      const hd = add(s.word, FONT.head, 3, fw, kHead, true, i === 2 ? "#FBBF24" : "#2DD4BF", i + 1, { x: P.x, y: chH, z: P.z + 0.5, t0, stg: 0.038, dur: 0.54, stagger: "center", kind: "rise", out: 99, flash: [t0 + 0.62], mirror: chH, beam: chH });
      const subs = lines.map((l, j) => add(l, FONT.line, 0.62, fw, kHead, false, null, i + 1, { x: P.x, y: lines.length > 1 ? chH - 0.8 - j * 0.8 : chH / 2 - 0.22, z: P.z - chD / 2 - 0.02, t0: t0 + 0.24 + j * 0.07, stg: 0, dur: 0.5, kind: "fade", out: 99 }));
      chip.w = Math.max(hd.W * 0.92, ...subs.map((x) => x.W)) + 1.8; chip.h = chH; chip.d = chD;
      return Math.max(hd.W, chip.w) + 1.5;
    });
    // 4 · il drop: il saluto, poi una parola per colpo, poi la chiusa. In verticale le parole si impilano
    const hello = portrait ? splitHello(T.hello) : [T.hello], emH = portrait ? 2.6 : 3, stampEm = portrait ? 1.5 : 1.7;
    const estW = Math.max(...hello.map((h) => est(h, emH, 0.6)), portrait ? 0 : T.stamps.reduce((a, s) => a + est(s, stampEm, 0.56) + stampEm * 0.6, 0)) + 2;
    const hl = hello.map((h, j) => add(h, FONT.head, emH, estW, kHello, true, "#2DD4BF", 4, { x: 0, y: portrait ? 10.8 - j * 2.65 : 5.2, z: HZ, t0: M.drop, stg: 0.024, dur: 0.6, stagger: "center", kind: "slam", out: M.out + 0.05, outStg: 0.022, flash: [M.k1, M.k2, M.k3], mirror: 0, beam: j === hello.length - 1 ? 0 : null }));
    const stamps = T.stamps.map((s, i) => add(s, FONT.head, stampEm, estW, kHello, true, i === 2 ? "#FBBF24" : "#5EEAD4", 4, { x: 0, y: portrait ? 6.0 - i * 1.72 : 2.9, z: HZ, t0: [M.k1, M.k2, M.k3][i] - 0.035, stg: 0.025, dur: 0.5, kind: "slam", out: M.out + 0.12 + i * 0.05, outStg: 0.02, mirror: 0 }));
    let rowW = 0;
    if (!portrait) { const gap = stampEm * 0.6; rowW = stamps.reduce((a, L) => a + L.W, 0) + gap * (stamps.length - 1); let sx = -rowW / 2; stamps.forEach((L) => { L.x = sx + L.W / 2; sx += L.W + gap; }); }
    const tag = add(T.tag, FONT.line, portrait ? 0.75 : 0.85, estW, kHello, false, null, 4, { x: 0, y: portrait ? 1.4 : 1.55, z: HZ, t0: M.tag, stg: 0, dur: 0.5, kind: "fade", out: M.out + 0.3 });
    const helloW = Math.max(...hl.map((L) => L.W), rowW, ...stamps.map((L) => (portrait ? L.W : 0)), tag.W) + 2;
    const titleW = Math.max(title.W, PS * 2) + 2;
    const dTop = (30 * F) / Math.min(W, H), dBtn = (11 * F) / Math.min(W, H);
    gateCam = [BTN.x, PH + 0.55, 0, dBtn * 1.06, -18, 42, 0, 1];

    if (o.calm) {
      // movimento ridotto: tutto nello stesso punto, le scritte si danno il cambio con una dissolvenza; la camera sta ferma
      const ends = [M.s1, M.s2, M.s3, M.drop, M.out + 0.3];
      labels.forEach((L) => {
        L.kind = "fade"; L.stg = 0; L.outStg = 0; L.flash = []; L.out = ends[L.scene] - 0.35;
        if (L.scene >= 1) { if (L.scene <= 3) { L.x -= STATIONS[L.scene - 1].x; L.y += PH; } L.z = TITLE_Z; L.mirror = null; L.beam = null; }
      });
      board.chips.forEach((k) => { if (k.ped) k.h = 0; });
      const v = [0, portrait ? 4.5 : 3, 4, fitDist(Math.max(helloW, titleW, ...stW), portrait ? 0.86 : 0.6) * 1.1, 0, 18, 0, 1];
      camA = () => v; camB = camA;
      gateCam = v.slice();
      return;
    }
    // inquadrature: la distanza nasce dalla larghezza della scritta e dallo schermo, non da numeri fissi
    const dT = fitDist(titleW, kTitle), dS = stW.map((w) => fitDist(w, kHead)), dH = fitDist(helloW, kHello);
    // in verticale la camera guarda più in basso: l'orizzonte sale e la scheda riempie lo schermo alto e stretto
    const tilt = portrait ? 12 : 0, yawK = portrait ? 0.38 : 1, XZ = [0, 1, 2];
    const st = (i: number, k: number, yaw: number, pitch: number): number[] => [STATIONS[i].x, (portrait ? 2.1 : 1.5) + 1.05, STATIONS[i].z, dS[i] * k, yaw * yawK, pitch + tilt, 0, 1];
    // Ogni stazione ha un solo arco: ingresso, lettura, uscita. Niente inversioni tra parola e parola.
    camA = track([
      { t: 0, v: gateCam.slice() },
      { t: 0.7, v: [0, PH, 0, dTop * 0.86, -7, 76, 0, 1] },
      { t: 1.12, v: [0, PH, 0.4, dTop, 0, 87, 0, 1] },
      { t: 2.02, v: [0, PH + 2.1, TITLE_Z - 2, dT * 1.23, -10, 29 + tilt, 0, 1] },
      { t: 2.72, v: [0.3, PH + 2.1, TITLE_Z - 1, dT * 1.17, 2, 24 + tilt, 0, 1] },
      { t: M.s1 + 0.02, v: st(0, 1.16, -14, 12), still: XZ },
      { t: 4.42, v: st(0, 1.06, -3, 10), still: XZ },
      { t: M.s2 + 0.03, v: st(1, 1.14, 12, 12), still: XZ },
      { t: 5.82, v: st(1, 1.06, 3, 10), still: XZ },
      { t: M.s3 + 0.13, v: st(2, 1.13, -12, 12), still: XZ },
      { t: M.fall, v: st(2, 1.04, -2, 10), still: XZ },
      // La gru apre il campo sul crescendo, poi scende al logo in un arco continuo.
      { t: M.rise, v: [0, 0, 42, dTop * 4.1, -3, 49, 0, 1] },
      { t: 8.48, v: [BTN.x, PH, 0, dTop * 2.5, 0, 72, 0, 1.04] },
      { t: M.drop, v: [BTN.x, PH, 0, 2.3, 0, 88, 0, 1.22] },
    ]);
    const hy = portrait ? 6.2 : 3.4;
    // Un dolly lento accompagna il saluto; il ritmo passa nelle lettere, con un piccolo rinculo della camera.
    camB = track([
      { t: M.drop, v: [0, hy + 0.1, HZ, dH * 1.14, -9 * yawK, 7 + tilt, 0, 1.04] },
      { t: M.k1, v: [0, hy, HZ, dH * 1.1, -5 * yawK, 7.5 + tilt, 0, 1] },
      { t: M.k2, v: [0, hy, HZ, dH * 1.06, 0, 7.5 + tilt, 0, 1] },
      { t: M.k3, v: [0, hy - 0.1, HZ, dH * 1.02, 5 * yawK, 8 + tilt, 0, 1] },
      { t: M.out, v: [0, hy - 0.1, HZ, dH, 7 * yawK, 8 + tilt, 0, 1], hold: true },
      { t: 14.25, v: [0, PH, 0, dTop * 1.08, 0, 89, 0, 1] },
      { t: M.end, v: [0, PH, 0, dTop * 1.02, 0, 89.5, 0, 1] },
    ]);
  };

  const resize = () => {
    W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
    if (W < 2 || H < 2) return; // finestra non ancora misurata (scheda in background): si riprova al prossimo resize
    dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : W < 768 ? 1.5 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    portrait = W / H < 0.85;
    F = (0.5 * Math.min(W, H)) / Math.tan(25 * D2R);
    bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#03110F"); bg.addColorStop(0.55, "#062624"); bg.addColorStop(1, "#020B0A");
    layerDpr = low ? 0.5 : 0.75;
    layer.width = Math.round(W * layerDpr); layer.height = Math.round(H * layerDpr);
    soft.width = Math.max(1, Math.round(W * (low ? 0.25 : 0.4))); soft.height = Math.max(1, Math.round(H * (low ? 0.25 : 0.4)));
    layout();
  };

  // ---------- luce ----------
  // ogni punto della scheda riceve l'ambiente (che all'accensione arriva come un'onda dal centro) più le luci vicine
  type Light = { x: number; z: number; r: number; i: number; c: number };
  let lights: Light[] = [], front = 0, amb = 0;
  const lightAt = (x: number, z: number) => {
    let s = clamp01((front - Math.hypot(x, z)) / 18) * 0.62;
    for (const L of lights) { const d2 = (x - L.x) * (x - L.x) + (z - L.z) * (z - L.z); if (d2 < L.r * L.r * 4) s += L.i * Math.exp(-d2 / (L.r * L.r)); }
    return Math.min(1.6, s);
  };

  // ---------- disegno ----------
  const pt = [0, 0, 0, 0], pa = [0, 0, 0, 0], pb = [0, 0, 0, 0], pc = [0, 0, 0, 0], tmp = [0, 0];
  let fogN = 30, fogF = 120;
  const fog = (z: number) => clamp01(1 - (z - fogN) / (fogF - fogN));
  const pads: number[][] = [[], [], [], []];
  // un'immagine (luce, ombra) stesa su un piano orizzontale: tre punti proiettati danno l'affine
  const floorSprite = (c: Cam, img: HTMLCanvasElement, x: number, y: number, z: number, r: number, alpha: number) => {
    if (alpha < 0.01 || !proj(c, x, y, z, pa) || !proj(c, x + r, y, z, pb) || !proj(c, x, y, z + r, pc)) return;
    const a = (pb[0] - pa[0]) / 32, b = (pb[1] - pa[1]) / 32, cc = (pc[0] - pa[0]) / 32, d = (pc[1] - pa[1]) / 32;
    const ga = ctx.globalAlpha;
    ctx.setTransform(a * dpr, b * dpr, cc * dpr, d * dpr, (pa[0] - 32 * a - 32 * cc) * dpr, (pa[1] - 32 * b - 32 * d) * dpr);
    ctx.globalAlpha = Math.min(1, alpha * ga); ctx.drawImage(img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = ga;
  };
  const poly = (pts: number[][]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };

  const drawTraces = (c: Cam, t: number, energy: number, traces: Trace[]) => {
    const g = ctx;
    g.lineCap = "round"; g.lineJoin = "round";
    pads.forEach((b) => { b.length = 0; });
    // piste: si accendono come un'onda che parte dal logo; la luce le rende più vive vicino a ciò che si guarda
    for (const q of traces) {
      const prog = o.calm ? 1 : clamp01(((t - q.on) * 34) / q.L);
      if (prog <= 0) continue;
      const mi = Math.floor(q.c.length / 2), mx = q.p[mi * 2], mz = q.p[mi * 2 + 1];
      if (!proj(c, mx, 0, mz, pt)) continue;
      const a0 = fog(pt[2]) * (0.3 + 0.95 * lightAt(mx, mz)); if (a0 < 0.02) continue;
      const lenOn = q.L * prog;
      g.beginPath();
      let prev = false;
      for (let i = 0; i < q.c.length; i++) {
        let x = q.p[i * 2], z = q.p[i * 2 + 1];
        const cut = q.c[i] > lenOn;
        if (cut) { at(q, lenOn, tmp); x = tmp[0]; z = tmp[1]; }
        const ok = proj(c, x, 0, z, pa);
        if (ok) { if (prev) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); }
        prev = ok;
        if (cut) break;
      }
      g.lineWidth = Math.max(0.5, Math.min(5, q.w * pt[3]));
      g.strokeStyle = qa(q.amber ? amber : teal, a0 * (q.amber ? 0.5 + energy * 0.35 : 0.26 + energy * 0.22));
      g.stroke();
      if (prog < 1) {
        at(q, lenOn, tmp);
        if (proj(c, tmp[0], 0, tmp[1], pa)) { const s = Math.max(4, 1.4 * pa[3]); g.globalCompositeOperation = "lighter"; g.globalAlpha = fog(pa[2]); g.drawImage(q.amber ? DOT_A : DOT_T, pa[0] - s / 2, pa[1] - s / 2, s, s); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; }
      } else {
        for (let e = 0; e < 2; e++) {
          const i = e ? q.c.length - 1 : 0;
          if (!proj(c, q.p[i * 2], 0, q.p[i * 2 + 1], pa)) continue;
          const a = Math.min(1, a0), r = 0.42 * pa[3]; if (a < 0.05 || r < 0.8) continue;
          pads[Math.min(3, Math.floor(a * 4))].push(pa[0], pa[1], r);
        }
      }
    }
    g.lineWidth = 1;
    pads.forEach((b, k) => {
      if (!b.length) return;
      g.beginPath(); for (let i = 0; i < b.length; i += 3) { g.moveTo(b[i] + b[i + 2], b[i + 1]); g.arc(b[i], b[i + 1], b[i + 2], 0, TAU); }
      g.strokeStyle = qa(teal, ((k + 0.5) / 4) * 0.55); g.stroke();
    });
  };

  const drawComets = (c: Cam, t: number, energy: number, converge: number, traces: Trace[]) => {
    if (o.calm) return;
    const g = ctx;
    g.globalCompositeOperation = "lighter";
    let n = 0; const cap = low ? 70 : 170;
    for (const q of traces) {
      if (q.comet < 0 || t < q.on + q.L / 34) continue;
      if (n >= cap) break;
      let d = (q.comet * (q.L + 6) + q.v * flow) % (q.L + 6);
      if (converge > 0) d = q.L - d;
      if (d < 0 || d > q.L) continue;
      at(q, d, tmp); if (!proj(c, tmp[0], 0, tmp[1], pa)) continue;
      const a = fog(pa[2]); if (a < 0.05) continue;
      n++;
      const img = q.amber || converge > 0.3 ? DOT_A : DOT_T;
      for (let j = 0; j < 4; j++) {
        at(q, d + (converge > 0 ? 1 : -1) * j * 0.55, tmp); if (!proj(c, tmp[0], 0, tmp[1], pb)) break;
        const s = Math.max(3, (1.5 - j * 0.28) * pb[3] * (1 + converge * 0.8));
        g.globalAlpha = a * (0.95 - j * 0.22); g.drawImage(img, pb[0] - s / 2, pb[1] - s / 2, s, s);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  };

  // ---------- solidi: scatole (chip, piedistalli), cilindri (pulsante), la targa ----------
  // si disegnano solo le facce rivolte alla camera, ombreggiate con la luce principale
  const shade = (n: V3) => 0.32 + 0.68 * Math.max(0, n[0] * LK[0] + n[1] * LK[1] + n[2] * LK[2]);
  const facing = (c: Cam, n: V3, x: number, y: number, z: number) => n[0] * (c.p[0] - x) + n[1] * (c.p[1] - y) + n[2] * (c.p[2] - z) > 0;
  const P2 = (c: Cam, x: number, y: number, z: number) => (proj(c, x, y, z, pa) ? [pa[0], pa[1]] : null);
  const chipTop = (c: Cam, k: Chip) => {
    if (c.p[1] <= k.h) return null;
    const out: number[][] = [];
    for (const [x, z] of [[k.x - k.w / 2, k.z - k.d / 2], [k.x + k.w / 2, k.z - k.d / 2], [k.x + k.w / 2, k.z + k.d / 2], [k.x - k.w / 2, k.z + k.d / 2]]) { const p = P2(c, x, k.h, z); if (!p) return null; out.push(p); }
    return out;
  };
  const drawChip = (c: Cam, k: Chip) => {
    if (k.h <= 0) return;
    const x0 = k.x - k.w / 2, x1 = k.x + k.w / 2, z0 = k.z - k.d / 2, z1 = k.z + k.d / 2, h = k.h;
    if (!proj(c, k.x, h, k.z, pt) || pt[2] < 4) return;
    const a = fog(pt[2]) * clamp01((pt[2] - 4) / 4); if (a < 0.03) return;
    const lit = k.lit, light = Math.min(1.25, 0.25 + lightAt(k.x, k.z)), g = ctx, sc = pt[3];
    // piedini a gabbiano: escono dai fianchi e scendono sulla scheda
    if (k.ped) {
      g.lineCap = "round"; g.lineJoin = "round"; g.beginPath();
      const leg = (x: number, z: number, dx: number, dz: number) => {
        const p1 = P2(c, x, h * 0.42, z), p2 = P2(c, x + dx * 0.45, h * 0.42, z + dz * 0.45), p3 = P2(c, x + dx * 0.62, 0.02, z + dz * 0.62), p4 = P2(c, x + dx * 0.95, 0.02, z + dz * 0.95);
        if (p1 && p2 && p3 && p4) { g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.lineTo(p4[0], p4[1]); }
      };
      const nw = Math.max(4, Math.round(k.w / 1.05));
      for (let i = 0; i < nw; i++) leg(x0 + (k.w * (i + 0.5)) / nw, z1, 0, 1);
      for (let i = 0; i < 3; i++) { const z = z0 + (k.d * (i + 0.5)) / 3; leg(x0, z, -1, 0); leg(x1, z, 1, 0); }
      g.lineWidth = Math.max(1, 0.16 * sc); g.strokeStyle = lit ? `rgba(240,200,120,${(0.85 * a).toFixed(2)})` : `rgba(170,190,186,${(0.7 * a).toFixed(2)})`; g.stroke();
      // ombra del chip sulla scheda
      floorSprite(c, DOT_K, k.x + 0.6, 0.01, k.z + 0.4, k.w * 0.7, 0.5 * a);
    }
    // corpo: nero lucido, la faccia superiore prende la luce
    const faces: [V3, number[][]][] = [
      [[0, 0, -1], [[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0]]],
      [[0, 0, 1], [[x1, 0, z1], [x0, 0, z1], [x0, h, z1], [x1, h, z1]]],
      [[-1, 0, 0], [[x0, 0, z1], [x0, 0, z0], [x0, h, z0], [x0, h, z1]]],
      [[1, 0, 0], [[x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]]],
    ];
    const base = k.ped ? [12, 32, 30] : [6, 24, 22];
    g.globalAlpha = a;
    for (const [n, q] of faces) {
      if (!facing(c, n, q[0][0], h / 2, q[0][2])) continue;
      const sp = q.map(([x, y, z]) => P2(c, x, y, z)); if (sp.some((p) => !p)) continue;
      const pts = sp as number[][];
      poly(pts);
      // il fronte sfuma verso il basso: la luce lo prende dall'alto
      const gr = g.createLinearGradient(0, (pts[2][1] + pts[3][1]) / 2, 0, (pts[0][1] + pts[1][1]) / 2);
      gr.addColorStop(0, rgb(base[0], base[1], base[2], shade(n) * light * 1.5)); gr.addColorStop(1, rgb(base[0], base[1], base[2], shade(n) * light * 0.7));
      g.fillStyle = gr; g.fill();
      if (lit && n[2] === -1) { g.lineWidth = Math.max(1, 0.05 * sc); g.strokeStyle = qa(amber, 0.25 * lit * a); g.stroke(); }
    }
    const top = chipTop(c, k);
    if (top) {
      poly(top);
      const gr = g.createLinearGradient(top[3][0], top[3][1], top[1][0], top[1][1]);
      gr.addColorStop(0, rgb(base[0] + 22, base[1] + 40, base[2] + 38, light)); gr.addColorStop(1, rgb(base[0], base[1], base[2], light * 0.9));
      g.fillStyle = gr; g.fill();
      // filo di luce sugli spigoli superiori: ambra quando la stazione è accesa
      g.lineWidth = Math.max(1, 0.07 * sc); g.strokeStyle = lit ? qa(amber, (0.5 + 0.5 * lit) * a) : qa(teal, 0.45 * a * Math.min(1, light)); g.stroke();
      if (k.ped && proj(c, x0 + 0.55, h, z0 + 0.5, pa)) { g.beginPath(); g.arc(pa[0], pa[1], Math.max(1, 0.16 * pa[3]), 0, TAU); g.fillStyle = qa(white, 0.35 * a); g.fill(); }
      // icona incisa sul piano, accanto alla parola
      if (k.icon && lit > 0) {
        g.beginPath();
        for (const pl of k.icon) {
          const upto = Math.max(1, Math.round((pl.length / 2) * clamp01(lit * 1.4)));
          let pv = false;
          for (let i = 0; i < upto; i++) { const ok = proj(c, x0 + 1.2 + pl[i * 2] * 0.4, h + 0.01, k.z - 0.85 + pl[i * 2 + 1] * 0.4, pa); if (ok) { if (pv) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); } pv = ok; }
        }
        g.lineWidth = Math.max(1, 0.11 * sc); g.strokeStyle = qa(amber, a * lit); g.stroke();
      }
    }
    g.globalAlpha = 1;
  };
  // cilindro verticale: fianco a spicchi ombreggiati con un riflesso stretto, restituisce il contorno del coperchio
  const cyl = (c: Cam, x: number, z: number, r: number, y0: number, y1: number, col: number[], gloss: number, alpha: number) => {
    const N = 40, b: number[][] = [], tp: number[][] = [];
    for (let i = 0; i < N; i++) {
      const an = (i / N) * TAU;
      if (!proj(c, x + Math.cos(an) * r, y0, z + Math.sin(an) * r, pa) || !proj(c, x + Math.cos(an) * r, y1, z + Math.sin(an) * r, pb)) return null;
      b.push([pa[0], pa[1]]); tp.push([pb[0], pb[1]]);
    }
    const g = ctx; g.globalAlpha = alpha; g.lineWidth = 0.8;
    if (y1 - y0 > 0.01) for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, am = ((i + 0.5) / N) * TAU, n: V3 = [Math.cos(am), 0, Math.sin(am)];
      if (!facing(c, n, x + n[0] * r, (y0 + y1) / 2, z + n[2] * r)) continue;
      const s = shade(n), spec = Math.pow(Math.max(0, n[0] * LK[0] + n[2] * LK[2]), 12) * gloss * 160;
      const col2 = rgb(col[0] + spec, col[1] + spec, col[2] + spec, s);
      poly([b[i], b[j], tp[j], tp[i]]); g.fillStyle = col2; g.fill(); g.strokeStyle = col2; g.stroke();
    }
    g.globalAlpha = 1;
    return tp;
  };
  const drawButton = (c: Cam, t: number) => {
    const g = ctx, now = (performance.now() - gate.t0) / 1000;
    const press = gate.pressAt ? easeOut((performance.now() - gate.pressAt) / 160) : 0;
    // dopo l'accensione il pulsante affonda nella targa e lascia il posto al nodo centrale del logo
    const sink = t < 0 ? 0 : easeInOut((t - 0.12) / 0.45), alpha = 1 - sink;
    if (alpha <= 0.01) return;
    const yb = PH, hb = BTN.hb * (1 - sink), hc = (BTN.hc - (BTN.hc - 0.28) * press) * (1 - sink);
    const breath = 0.5 + 0.5 * Math.sin(now * 1.6);
    const led = t < 0 ? (gate.pressAt ? 1 : 0.4 + 0.12 * breath + gate.hover * 0.36) : Math.max(0, 1 - t * 1.2) + 0.4;
    // ombra di contatto e pozza di luce del LED sulla targa
    floorSprite(c, DOT_K, BTN.x + 0.4, yb + 0.01, BTN.z - 0.3, BTN.rb * 2.1, 0.55 * alpha);
    g.globalCompositeOperation = "lighter";
    floorSprite(c, POOL[1], BTN.x, yb + 0.02, BTN.z, 4 + led * 3, (0.22 + led * 0.5) * alpha);
    g.globalCompositeOperation = "source-over";
    // ghiera di metallo scuro
    const ring = cyl(c, BTN.x, BTN.z, BTN.rb, yb, yb + hb, [34, 52, 50], 1, alpha);
    if (ring) {
      poly(ring); const gr = g.createLinearGradient(ring[30][0], ring[30][1], ring[10][0], ring[10][1]);
      gr.addColorStop(0, "#718581"); gr.addColorStop(0.18, "#354f4b"); gr.addColorStop(0.55, "#182b28"); gr.addColorStop(1, "#091512"); g.globalAlpha = alpha; g.fillStyle = gr; g.fill();
      g.lineWidth = 1.1; g.strokeStyle = "rgba(216,244,235,.42)"; g.stroke();
      // Fini incisioni sulla ghiera, con la luce radente del metallo satinato.
      g.lineWidth = 0.7;
      for (let i = 0; i < 48; i++) {
        const a = i * TAU / 48, r0 = BTN.rb * 0.93, r1 = BTN.rb * 0.98;
        if (!proj(c, BTN.x + Math.cos(a) * r0, yb + hb + 0.006, BTN.z + Math.sin(a) * r0, pa) || !proj(c, BTN.x + Math.cos(a) * r1, yb + hb + 0.006, BTN.z + Math.sin(a) * r1, pb)) continue;
        g.strokeStyle = `rgba(220,246,237,${(0.08 + 0.17 * Math.max(0, Math.cos(a + 2.4))).toFixed(3)})`;
        g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
      }
      g.globalAlpha = 1;
    }
    // anello del LED tra ghiera e tasto
    const ledRing: number[][] = [];
    for (let i = 0; i <= 48; i++) { const an = (i / 48) * TAU; if (proj(c, BTN.x + Math.cos(an) * (BTN.rc + 0.3), yb + hb + 0.01, BTN.z + Math.sin(an) * (BTN.rc + 0.3), pa)) ledRing.push([pa[0], pa[1]]); }
    if (ledRing.length > 40 && proj(c, BTN.x, yb, BTN.z, pt)) {
      g.globalCompositeOperation = "lighter";
      g.beginPath(); ledRing.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.globalAlpha = alpha; g.lineWidth = Math.max(1.5, 0.075 * pt[3]); g.strokeStyle = `rgba(255,207,104,${(0.45 + led * 0.45).toFixed(3)})`; g.shadowColor = "rgba(251,171,56,.8)"; g.shadowBlur = 5 + led * 12; g.stroke();
      g.shadowBlur = 0; g.shadowColor = "transparent"; g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
    }
    // il tasto: vetro scuro con il simbolo d'accensione che si accende
    const cap = cyl(c, BTN.x, BTN.z, BTN.rc, yb + hb, yb + hb + hc, [14, 40, 37], 1.4, alpha);
    if (cap && proj(c, BTN.x, yb + hb + hc, BTN.z, pt)) {
      poly(cap);
      const r = BTN.rc * pt[3], gr = g.createRadialGradient(pt[0] - r * 0.35, pt[1] - r * 0.45, r * 0.05, pt[0], pt[1], r * 1.1);
      gr.addColorStop(0, "#51756d"); gr.addColorStop(0.28, "#274b43"); gr.addColorStop(0.7, "#0e2822"); gr.addColorStop(1, "#050f0c");
      g.globalAlpha = alpha; g.fillStyle = gr; g.fill();
      g.lineWidth = 1; g.strokeStyle = "rgba(190,240,230,.28)"; g.stroke();
      // simbolo: arco aperto verso il fondo e trattino, inciso nel tasto
      const y = yb + hb + hc + 0.005, sym: number[][] = [];
      for (let i = 0; i <= 28; i++) { const an = Math.PI / 2 + 0.7 + (i / 28) * (TAU - 1.4); if (proj(c, BTN.x + Math.cos(an) * 0.62, y, BTN.z + Math.sin(an) * 0.62, pa)) sym.push([pa[0], pa[1]]); }
      g.beginPath(); sym.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      if (proj(c, BTN.x, y, BTN.z + 0.8, pa) && proj(c, BTN.x, y, BTN.z + 0.12, pb)) { g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); }
      g.lineCap = "round"; g.lineWidth = Math.max(1.5, 0.115 * pt[3]); g.strokeStyle = `rgba(255,220,153,${(0.52 + led * 0.48).toFixed(3)})`;
      g.shadowColor = "rgba(251,171,56,.8)"; g.shadowBlur = led * 9; g.stroke(); g.shadowBlur = 0; g.shadowColor = "transparent";
      // riflesso sul vetro
      g.globalCompositeOperation = "lighter"; g.globalAlpha = alpha * (0.2 + gate.hover * 0.15);
      g.drawImage(DOT_W, pt[0] - r * 0.95, pt[1] - r * 0.85, r * 0.9, r * 0.6);
      g.globalCompositeOperation = "source-over";
    }
    g.globalAlpha = 1;
    // pulviscolo nella luce
    if (t < 0.4 && !o.calm) {
      g.globalCompositeOperation = "lighter";
      for (const m of motes) {
        const y = yb + ((m.y + now * m.s) % 4.5), x = BTN.x + Math.cos(m.a + now * 0.05) * m.r, z = BTN.z + Math.sin(m.a + now * 0.05) * m.r;
        if (!proj(c, x, y, z, pa)) continue;
        const s = Math.max(1.5, 0.12 * pa[3]), fall = Math.exp(-(m.r * m.r) / 18);
        g.globalAlpha = alpha * fall * (0.3 + 0.5 * led) * (0.5 + 0.5 * Math.sin(now * 1.3 + m.ph));
        g.drawImage(DOT_A, pa[0] - s, pa[1] - s, s * 2, s * 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
  };

  const LOGO_ARC = (() => { const pts: number[] = [], A0 = Math.atan2(9.6, 11.5); for (let i = 0; i <= 64; i++) { const a = A0 + (i / 64) * (Math.PI * 2 - 2 * A0); pts.push(Math.cos(a) * 5, Math.sin(a) * 5); } return pts; })();
  const LOGO_LINE = [-0.33, 0, 5, 0];
  // la targa: fianchi smaltati e faccia con il gradiente dell'icona; restituisce il contorno della faccia
  const drawPlate = (c: Cam, bright: number) => {
    const g = ctx, b: number[][] = [], tp: number[][] = [];
    for (const [x, z] of PLATE) { if (!proj(c, x, 0, z, pa) || !proj(c, x, PH, z, pb)) return null; b.push([pa[0], pa[1]]); tp.push([pb[0], pb[1]]); }
    const n = PLATE.length, k = 0.06 + 0.94 * bright;
    floorSprite(c, DOT_K, 1.2, 0.01, -1, PS * 1.7, 0.6 * bright);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, [x0, z0] = PLATE[i], [x1, z1] = PLATE[j], nx = z1 - z0, nz = -(x1 - x0), l = Math.hypot(nx, nz) || 1, nn: V3 = [nx / l, 0, nz / l];
      if (!facing(c, nn, (x0 + x1) / 2, PH / 2, (z0 + z1) / 2)) continue;
      const col = rgb(13, 92, 84, shade(nn) * k * 1.2); poly([b[i], b[j], tp[j], tp[i]]); g.fillStyle = col; g.fill(); g.lineWidth = 0.8; g.strokeStyle = col; g.stroke();
    }
    if (c.p[1] <= PH || !proj(c, -PS, PH, PS, pa) || !proj(c, PS, PH, -PS, pb)) return null;
    // faccia: il gradiente dell'icona del sito (#22D8C0 → #07423D), illuminata dall'onda di luce
    poly(tp);
    const gr = g.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
    gr.addColorStop(0, rgb(30, 196, 174, k)); gr.addColorStop(0.55, rgb(12, 116, 104, k)); gr.addColorStop(1, rgb(5, 48, 44, k));
    g.fillStyle = gr; g.fill();
    // spigolo smussato che prende la luce, e il filetto bianco interno come sull'icona
    g.lineWidth = Math.max(1, 0.1 * pb[3]); g.strokeStyle = `rgba(200,255,245,${(0.35 * bright).toFixed(3)})`; g.stroke();
    const inner: number[][] = [];
    for (const [x, z] of PLATE) if (proj(c, x * 0.94, PH + 0.01, z * 0.94, pa)) inner.push([pa[0], pa[1]]);
    if (inner.length === n) { poly(inner); g.lineWidth = Math.max(1, 0.12 * pb[3]); g.strokeStyle = `rgba(255,255,255,${(0.22 * bright).toFixed(3)})`; g.stroke(); }
    // lucentezza dello smalto: una macchia di luce che scivola sulla faccia mentre la camera si muove
    g.globalCompositeOperation = "lighter";
    floorSprite(c, POOL[2], -3.5 + c.f[0] * 5, PH + 0.02, 4 - c.f[2] * 3, 7, 0.24 * bright);
    g.globalCompositeOperation = "source-over";
    return tp;
  };
  // perla: sfera con la luce in alto a sinistra e l'ombra sulla targa
  const sphere = (c: Cam, x: number, y: number, z: number, r: number, stops: string[]) => {
    floorSprite(c, DOT_K, x + 0.35, PH + 0.01, z - 0.25, r * 1.7, 0.6);
    if (!proj(c, x, y, z, pa)) return;
    const rr = r * pa[3], gr = ctx.createRadialGradient(pa[0] - rr * 0.38, pa[1] - rr * 0.42, rr * 0.05, pa[0], pa[1], rr);
    stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pa[0], pa[1], Math.max(1, rr), 0, TAU); ctx.fill();
  };
  const drawLogo = (c: Cam, t: number, energy: number) => {
    const g = ctx, kA = o.calm ? 1 : easeOut((t - 0.12) / 1.05), kL = o.calm ? 1 : easeOut((t - 0.82) / 0.45);
    if (!proj(c, 0, PH, 0, pb)) return;
    const sc = pb[3];
    const stroke = (pts: number[], k: number, w: number, y: number) => {
      const n = Math.round((pts.length / 2 - 1) * k); if (n < 1) return;
      g.beginPath(); let pv = false;
      for (let i = 0; i <= n; i++) { const ok = proj(c, pts[i * 2], y, pts[i * 2 + 1], pa); if (ok) { if (pv) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); } pv = ok; }
      g.lineWidth = Math.max(1.2, w * sc); g.stroke();
    };
    g.lineCap = "round"; g.lineJoin = "round";
    // la C in rilievo: strati dal verde della base al bianco della cima, poi la cima con il suo bagliore
    const layers = low ? 3 : 5;
    for (let i = 0; i < layers; i++) {
      const y = PH + 0.02 + (i / layers) * 0.42, k = i / layers;
      g.strokeStyle = rgb(14 + 120 * k, 92 + 120 * k, 84 + 110 * k, 1);
      stroke(LOGO_ARC, kA, 1.02, y); stroke(LOGO_LINE, kL, 0.66, y);
    }
    g.shadowColor = `rgba(45,212,191,${(0.7 + energy * 0.3).toFixed(2)})`; g.shadowBlur = Math.min(36, 1.1 * sc * (1 + energy));
    g.strokeStyle = "#F4FFFD";
    stroke(LOGO_ARC, kA, 0.9, PH + 0.46); stroke(LOGO_LINE, kL, 0.56, PH + 0.46);
    g.shadowBlur = 0; g.shadowColor = "transparent";
    // nodi: due perle e la sfera ambra che lampeggia sul rintocco e sul drop
    const node = (x: number, z: number, r: number, t0: number, am: boolean) => {
      const k = o.calm ? 1 : back((t - t0) / 0.42); if (k <= 0.01) return;
      const flash = am ? Math.max(0, 1 - Math.abs(t - M.chime) * 3.2) + Math.max(0, 1 - Math.abs(t - M.drop) * 2.5) + energy * 0.4 : 0;
      const ga = g.globalAlpha;
      if (am && proj(c, x, PH + 0.6, z, pa)) { const s = r * pa[3] * k * (4.5 + flash * 8); g.globalCompositeOperation = "lighter"; g.globalAlpha = Math.min(1, 0.5 + flash) * ga; g.drawImage(DOT_A, pa[0] - s / 2, pa[1] - s / 2, s, s); g.globalAlpha = ga; g.globalCompositeOperation = "source-over"; }
      sphere(c, x, PH + 0.1 + r * k, z, r * k, am ? ["#FFFBEA", "#FDE68A", "#F59E0B", "#92400E"] : ["#FFFFFF", "#E6FFFB", "#8EDFD2", "#2F7F75"]);
    };
    node(3.83, 3.2, 1.05, 0.9, false); node(-0.33, 0, 0.8, 1.02, false); node(3.83, -3.2, 1.05, 1.14, true);
  };

  // una lettera: tre angoli proiettati bastano per l'affine che porta la cella dell'atlante sullo schermo
  const glyph = (c: Cam, A: Atlas, L: Label, gi: number, ox: number, oy: number, oz: number, R3: V3, U3: V3, alpha: number) => {
    const G = L.g[gi], pxu = L.face.c.height / L.ch;
    const x0 = G.x - L.W / 2 - L.pad, x1 = x0 + G.cw / pxu, y1 = L.asc + L.pad, y0 = y1 - L.ch;
    const P = (x: number, y: number, o2: number[]) => proj(c, ox + R3[0] * x + U3[0] * y, oy + R3[1] * x + U3[1] * y, oz + R3[2] * x + U3[2] * y, o2);
    if (!P(x0, y1, pa) || !P(x1, y1, pb) || !P(x0, y0, pc) || pa[2] < 2.5) return; // troppo vicino all'obiettivo
    const sw = G.cw * A.s, sh = A.c.height;
    ctx.setTransform(((pb[0] - pa[0]) / sw) * dpr, ((pb[1] - pa[1]) / sw) * dpr, ((pc[0] - pa[0]) / sh) * dpr, ((pc[1] - pa[1]) / sh) * dpr, pa[0] * dpr, pa[1] * dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(A.c, G.cx * A.s, 0, sw, sh, 0, 0, sw, sh);
  };
  type GS = { right: V3; up: V3; bk: V3; ox: number; oy: number; oz: number; al: number; fl: number } | null;
  // stato di ogni lettera: angolo di alzata, spinta verso la camera, opacità, lampo
  const states = (L: Label, t: number): GS[] => {
    const R3: V3 = [Math.cos(L.ry * D2R), 0, -Math.sin(L.ry * D2R)], Bk: V3 = [Math.sin(L.ry * D2R), 0, Math.cos(L.ry * D2R)], st: GS[] = [];
    for (let i = 0; i < L.g.length; i++) {
      const order = L.stagger === "center" ? Math.abs(i - (L.g.length - 1) / 2) : i;
      const k = (t - (L.t0 + order * L.stg)) / L.dur, ko = (t - (L.out + i * L.outStg)) / 0.5;
      if (k <= 0 || ko >= 1) { st.push(null); continue; }
      let ang = 0, push = 0, al = 1, lift = 0;
      if (L.kind === "rise") {
        const e = back(k); ang = 88 * (1 - e); push = 0.65 * (1 - easeOut(k));
        lift = 0.13 * Math.sin(Math.PI * clamp01(k)); al = easeOut(k * 2.2);
      }
      else if (L.kind === "slam") { const e = back(k); push = 5.5 * (1 - easeOut(k)); al = easeOut(k * 2.5); ang = -9 * (1 - e); lift = 0.22 * Math.sin(Math.PI * clamp01(k)); }
      else { al = easeOut(k); lift = -0.35 * (1 - easeOut(k)); }
      if (ko > 0) { const e = easeInOut(ko); if (L.kind === "fade") al *= 1 - e; else { ang = Math.max(ang, 90 * e); al *= 1 - e * e; } }
      const twist = (L.kind === "fade" ? 0 : (i - (L.g.length - 1) / 2) * 1.1 * (1 - easeOut(k))) * D2R;
      const right: V3 = [R3[0] * Math.cos(twist) + Bk[0] * Math.sin(twist), 0, R3[2] * Math.cos(twist) + Bk[2] * Math.sin(twist)];
      const bk0 = cross(right, [0, 1, 0]);
      const ca = Math.cos(ang * D2R), sa = Math.sin(ang * D2R), up: V3 = [bk0[0] * sa, ca, bk0[2] * sa];
      let fl = 0;
      for (const f of L.flash) if (t >= f) fl = Math.max(fl, 1 - (t - f) * 2.6 - Math.abs(i - (t - f) * 26) * 0.08);
      st.push({ right, up, bk: cross(right, up), ox: L.x - Bk[0] * push, oy: L.y + lift, oz: L.z - Bk[2] * push, al, fl: Math.max(0, fl) });
    }
    return st;
  };
  const drawLabel = (c: Cam, L: Label, t: number) => {
    const n = L.g.length, st = states(L, t);
    if (L.glow) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) { const s = st[i]; if (s) glyph(c, L.glow, L, i, s.ox, s.oy, s.oz, s.right, s.up, s.al * (0.35 + s.fl * 0.9)); }
      ctx.globalCompositeOperation = "source-over";
    }
    // fianchi dal fondo verso la faccia; lo strato più vicino è chiaro, come uno smusso che prende luce
    if (L.edge && L.deep && L.layers) {
      for (let k = L.layers; k >= 1; k--) {
        const A = k === 1 ? L.edge : L.deep, d = (k * L.ext) / L.layers;
        for (let i = 0; i < n; i++) { const s = st[i]; if (s) glyph(c, A, L, i, s.ox + s.bk[0] * d, s.oy + s.bk[1] * d, s.oz + s.bk[2] * d, s.right, s.up, s.al); }
      }
    }
    for (let i = 0; i < n; i++) { const s = st[i]; if (s) glyph(c, L.face, L, i, s.ox, s.oy, s.oz, s.right, s.up, s.al); }
    if (L.glow) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) { const s = st[i]; if (s && s.fl > 0.02) glyph(c, L.glow, L, i, s.ox, s.oy, s.oz, s.right, s.up, s.fl * 0.8); }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  };
  // riflesso sulla superficie lucida sotto la scritta (smalto della targa, piano del chip, scheda): la faccia capovolta,
  // tenue, ritagliata sulla superficie che la riflette
  const drawMirror = (c: Cam, L: Label, t: number, clip: number[][] | null) => {
    if (L.mirror == null || c.p[1] <= L.mirror) return;
    const st = states(L, t), my = L.mirror;
    ctx.save();
    if (clip) { poly(clip); ctx.clip(); }
    for (let i = 0; i < L.g.length; i++) {
      const s = st[i]; if (!s) continue;
      glyph(c, L.face, L, i, s.ox, 2 * my - s.oy, s.oz, s.right, [s.up[0], -s.up[1], s.up[2]], s.al * (clip ? 0.22 : 0.1) * Math.exp(-(s.oy - my) / 6));
    }
    ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  };
  // fascio di luce che sale da sotto la parola: la illumina da dietro e dà volume all'aria
  const drawBeam = (c: Cam, L: Label, t: number) => {
    if (L.beam == null) return;
    const k = clamp01((t - L.t0) / 0.8) * (1 - clamp01((t - L.out) / 0.5)); if (k <= 0) return;
    const y0 = L.beam, y1 = y0 + L.asc * 3.4, z = L.z + 0.7, am = L.glowCol === "#FBBF24", g = ctx;
    g.globalCompositeOperation = "lighter";
    // tre fasci uno dentro l'altro: i bordi sfumano invece di tagliare l'aria
    for (const [wk, ak] of [[1, 0.35], [0.66, 0.4], [0.36, 0.45]]) {
      const w = L.W * 0.6 * wk, q: number[][] = [];
      for (const [x, y] of [[L.x - w, y0], [L.x + w, y0], [L.x + w * 1.6, y1], [L.x - w * 1.6, y1]]) { if (!proj(c, x, y, z, pa)) { g.globalCompositeOperation = "source-over"; return; } q.push([pa[0], pa[1]]); }
      const gr = g.createLinearGradient(0, (q[0][1] + q[1][1]) / 2, 0, (q[2][1] + q[3][1]) / 2);
      gr.addColorStop(0, am ? "rgba(251,191,36,.3)" : "rgba(45,212,191,.28)"); gr.addColorStop(0.3, am ? "rgba(251,191,36,.09)" : "rgba(45,212,191,.09)"); gr.addColorStop(1, "rgba(45,212,191,0)");
      g.globalAlpha = k * ak; poly(q); g.fillStyle = gr; g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  };

  const ringDraw = (c: Cam, x: number, y: number, z: number, r: number, a: number, am: boolean) => {
    const g = ctx; g.beginPath(); let pv = false;
    for (let i = 0; i <= 48; i++) { const an = (i / 48) * TAU, ok = proj(c, x + Math.cos(an) * r, y + 0.05, z + Math.sin(an) * r, pa); if (ok) { if (pv) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); } pv = ok; }
    g.lineWidth = 2; g.strokeStyle = qa(am ? amber : white, a); g.stroke();
  };
  const burst = (x: number, y: number, n: number, am: boolean, sp = 1) => {
    for (let i = 0; i < n && parts.length < 320; i++) { const an = Math.random() * TAU, v = (2 + Math.random() * 7) * sp; parts.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 1.5, l: 1, s: 6 + Math.random() * 14, a: am || Math.random() < 0.3 }); }
  };
  const once = (key: string, t: number, at0: number, fn: () => void) => { if (t >= at0 && lastT < at0 + 0.25 && !fired.has(key)) { fired.add(key); fn(); } };
  const events = (c: Cam, t: number) => {
    once("hit", t, M.hit, () => { rings.push({ x: BTN.x, y: PH, z: 0, t0: M.hit, r: 13, amber: true }); if (proj(c, BTN.x, PH + 0.8, 0, pa)) burst(pa[0], pa[1], low ? 30 : 60, true, 1.2); });
    [M.s1, M.s2, M.s3].forEach((s, i) => once("s" + i, t, s + 0.15, () => {
      const P = STATIONS[i]; rings.push({ x: P.x, y: 0, z: P.z, t0: s + 0.15, r: 12, amber: i === 2 });
      if (i === 2 && proj(c, P.x, 3.5, P.z, pa)) burst(pa[0], pa[1], low ? 24 : 48, true, 0.9);
    }));
    once("drop", t, M.drop, () => { rings.push({ x: 0, y: 0, z: HZ - 4, t0: M.drop, r: 60, amber: false }); burst(W / 2, H * 0.42, low ? 60 : 120, false, 1.6); });
    [M.k1, M.k2, M.k3].forEach((k, i) => once("k" + i, t, k, () => {
      const L = labels.find((l) => l.kind === "slam" && Math.abs(l.t0 - (k - 0.035)) < 0.01);
      rings.push({ x: L ? L.x : 0, y: 0, z: HZ, t0: k, r: 18, amber: i === 2 });
      if (L && proj(c, L.x, L.y + 0.6, L.z, pa)) burst(pa[0], pa[1], low ? 18 : 36, i === 2);
    }));
    // i piatti del ritmo: piccole onde che si aprono su piazzole a caso
    HATS.forEach((h, i) => once("h" + i, t, h, () => { for (let j = 0; j < 3; j++) { const q = board.traces[Math.floor(Math.random() * board.traces.length)]; rings.push({ x: q.p[0], y: 0, z: q.p[1], t0: h, r: 2.6, amber: (i + j) % 3 === 0 }); } }));
  };

  // Inquadratura al tempo t: respiro lento, rollio contenuto in curva, rinculo continuo sui colpi del ritmo.
  const breathe = () => {
    const s = ((gate.pressAt || performance.now()) - gate.t0) / 1000, press = gate.pressAt ? easeOut((performance.now() - gate.pressAt) / 200) : 0;
    return [Math.sin(s * 0.35) * 1.8, Math.sin(s * 0.27) * 0.7, 1 - gate.hover * 0.025 - press * 0.02];
  };
  const view = (t: number): number[] => {
    if (o.calm) return camA(0);
    if (t < 0) { const b = breathe(), v = gateCam.slice(); v[4] += b[0]; v[5] += b[1]; v[3] *= b[2]; return v; }
    const A = t < M.drop, tr = A ? camA : camB, v = tr(t);
    if (t < 0.7) { const b = breathe(), k = 1 - easeOut(t / 0.7); v[4] += b[0] * k; v[5] += b[1] * k; v[3] *= 1 + (b[2] - 1) * k; }
    const lo = A ? 0 : M.drop, hi = A ? M.drop - 0.001 : 99;
    const vy = (tr(Math.min(hi, t + 0.05))[4] - tr(Math.max(lo, t - 0.05))[4]) / 0.1;
    v[6] += Math.max(-1.8, Math.min(1.8, -vy * 0.022));
    if (!A) { const kick = [M.drop, M.k1, M.k2, M.k3].reduce((m, k) => Math.max(m, impulse(t, k)), 0); v[3] *= 1 - 0.04 * kick; }
    return v;
  };

  const draw = (t: number) => {
    if (W < 2 || H < 2) { resize(); if (W < 2 || H < 2) return; }
    // nei primi fotogrammi del film controllo se il dispositivo arranca: in quel caso meno pixel, meno strati, meno comete
    if (t >= 0 && frames.length < 50) {
      frames.push(performance.now());
      if (frames.length === 50 && !low && (frames[49] - frames[5]) / 44 > 24) {
        low = true;
        board.traces.splice(153); board.chips.splice(11);
        resize();
      }
    }
    if (t < lastT - 0.5 && t >= 0) { fired.clear(); parts.length = 0; rings.length = 0; }
    const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - lastT));
    const wallTime = performance.now(), gateDt = Math.min(0.05, (wallTime - gate.lastFrame) / 1000);
    gate.lastFrame = wallTime;
    gate.hover += ((gate.hoverOn && !gate.pressAt ? 1 : 0) - gate.hover) * (1 - Math.exp(-gateDt * 9));
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.fillStyle = bg || "#03110F"; g.fillRect(0, 0, W, H);

    // l'accensione: sull'attacco la luce parte dal pulsante e si allarga come un'onda sulla scheda
    front = o.calm ? 999 : t < M.hit ? 0 : (t - M.hit) * 58 + 4;
    amb = o.calm ? 1 : clamp01((t - M.hit) / 0.8);
    const riser = clamp01((t - M.rise) / (M.drop - M.rise));
    const kick = [M.drop, M.k1, M.k2, M.k3].reduce((m, k) => Math.max(m, t >= k ? Math.exp(-(t - k) * 6) : 0), 0);
    const energy = t < M.drop ? riser * riser : 0.35 + kick * 0.65;
    const converge = t < M.drop && t > M.rise ? Math.pow(riser, 1.6) : 0;
    flow += dt * (1 + energy * 1.6 + converge * 5);
    const v = view(t), c = (cam = camera(v, W, H, F, 0, 0));
    focus = Math.max(NEAR, c.dist);
    aperture = o.calm ? 0 : (low ? 0.6 : 1) * Math.min(1.2, Math.min(W, H) / 750) * (t < 0 ? 0.75 : 1 - riser * 0.7);
    fogN = c.dist * 1.1; fogF = c.dist * 1.1 + (portrait ? 70 : 95);
    // prima dell'accensione è buio: il cielo resta nero e diventa verde petrolio insieme alla luce
    if (amb < 1) { g.globalAlpha = 1 - amb; g.fillStyle = "#000302"; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    const hf = Math.hypot(c.f[0], c.f[2]);
    if (hf > 0.05 && amb > 0) {
      const fx = c.f[0] / hf, fz = c.f[2] / hf, dz = fx * c.f[0] + fz * c.f[2], dy = fx * c.u[0] + fz * c.u[2];
      if (dz > 0.05) {
        const hy = c.cy - (c.F * dy) / dz;
        if (hy > -H && hy < H * 2) { const hg = g.createRadialGradient(W / 2, hy, 0, W / 2, hy, Math.max(W, H) * 0.75); hg.addColorStop(0, `rgba(23,195,174,${((0.22 + energy * 0.25) * amb).toFixed(3)})`); hg.addColorStop(1, "rgba(23,195,174,0)"); g.fillStyle = hg; g.fillRect(0, 0, W, H); }
      }
    }
    // luci: ciò che si guarda, il nodo ambra del logo, le stazioni accese, il saluto (oppure, al buio, solo il LED)
    const logoA = o.calm || t < M.drop ? 1 : clamp01((t - M.out - 0.25) / 0.45);
    board.chips.forEach((k, i) => { if (i < 3) { k.lit = o.calm || t < 0 ? 0 : clamp01((t - [M.s1, M.s2, M.s3][i] + 0.1) / 0.6); k.icon = ICONS[o.text.stations[i].icon]; } });
    lights = [];
    if (t >= 0) {
      lights.push({ x: v[0], z: v[2], r: 9 + v[3] * 0.12, i: 0.42 * amb, c: 2 });
      if (logoA > 0) lights.push({ x: 3.83, z: -3.2, r: 8, i: (0.35 + Math.max(0, 1 - Math.abs(t - M.chime) * 3) * 0.9) * amb * logoA, c: 1 });
      board.chips.forEach((k, i) => { if (i < 3 && k.lit > 0 && t < M.drop) lights.push({ x: k.x, z: k.z, r: 8, i: 0.85 * k.lit, c: i === 2 ? 1 : 0 }); });
      if (t >= M.drop) lights.push({ x: 0, z: HZ, r: 15, i: 0.55 + kick * 0.7, c: 0 });
    }

    const vis = t < 0 ? [] : labels.filter((L) => t > L.t0 - 0.05 && t < L.out + 1.2 && !(t >= M.drop && L.scene >= 1 && L.scene <= 3));
    const depth = (x: number, y: number, z: number) => depthOf(c, x, y, z);
    const tracePlanes: Trace[][] = [[], [], [], [], []];
    if (t >= 0) board.traces.forEach((q) => {
      const i = Math.floor(q.c.length / 2), d = depth(q.p[i * 2], 0, q.p[i * 2 + 1]);
      if (d > NEAR) tracePlanes[plane(d)].push(q);
    });
    const solids: { d: number; f: () => void }[] = [];
    board.chips.forEach((k, i) => {
      if (t < 0 || (k.ped && t >= M.drop)) return;
      solids.push({ d: depth(k.x, k.h, k.z), f: () => {
        drawChip(c, k);
        if (k.ped) { const clip = chipTop(c, k); if (clip) vis.filter((L) => L.scene === i + 1).forEach((L) => drawMirror(c, L, t, clip)); }
      } });
    });
    if (logoA > 0) solids.push({ d: depth(0, PH, 0), f: () => {
      ctx.globalAlpha = logoA;
      const bright = o.calm ? 1 : t < 0 ? 0.025 + gate.hover * 0.018 : clamp01((front - 4) / 14);
      const top = drawPlate(c, bright);
      if (top) vis.filter((L) => L.scene === 0).forEach((L) => drawMirror(c, L, t, top));
      ctx.globalAlpha = logoA;
      drawButton(c, t);
      if (t >= 0) drawLogo(c, t, energy);
      ctx.globalAlpha = 1;
    } });
    solids.sort((a, b) => b.d - a.d);
    if (!o.calm && t >= 0) events(c, t);
    for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i].t0 > 1.1) rings.splice(i, 1);
    // Profondità di campo: geometrie, piste, riflessi e luce vengono composti dal piano più lontano al più vicino.
    // Il piano della parola non passa per il filtro e resta nitido anche sui display retina.
    const nativeDpr = dpr;
    for (let band = 0; band < 5; band++) {
      const ss = solids.filter((s) => plane(s.d) === band), ll = lights.filter((L) => plane(depth(L.x, 0, L.z)) === band);
      const rr = rings.filter((r) => plane(depth(r.x, r.y, r.z)) === band), beams = vis.filter((L) => plane(depth(L.x, L.y, L.z)) === band);
      if (!tracePlanes[band].length && !ss.length && !ll.length && !rr.length && !beams.length) continue;
      const blur = blurFor(band);
      if (blur) { beginLayer(); dpr = layerDpr; } else ctx = screen;
      if (t >= 0) drawTraces(c, t, energy, tracePlanes[band]);
      ctx.globalCompositeOperation = "lighter";
      ll.forEach((L) => floorSprite(c, POOL[L.c], L.x, 0.01, L.z, L.r * 1.6, L.i * 0.42));
      ctx.globalCompositeOperation = "source-over";
      if (t >= 0) drawComets(c, t, energy, converge, tracePlanes[band]);
      rr.forEach((r) => { const k = (t - r.t0) / 1.1; if (k >= 0) ringDraw(c, r.x, r.y, r.z, r.r * easeOut(k), (1 - k) * 0.5, r.amber); });
      ss.forEach((s) => s.f());
      beams.forEach((L) => drawBeam(c, L, t));
      if (blur) composite(blur, nativeDpr);
      ctx = screen; dpr = nativeDpr;
    }
    vis.filter((L) => L.scene === 4).forEach((L) => drawMirror(c, L, t, null));
    vis.map((L) => ({ L, d: depth(L.x, L.y, L.z) })).filter((x) => x.d > NEAR).sort((a, b) => b.d - a.d).forEach(({ L, d }) => {
      const blur = labelBlur(d);
      if (blur) { beginLayer(); dpr = layerDpr; drawLabel(c, L, t); composite(blur, nativeDpr); ctx = screen; dpr = nativeDpr; }
      else drawLabel(c, L, t);
    });

    // linee di velocità nel tuffo
    if (!o.calm && riser > 0.35 && t < M.drop && proj(c, BTN.x, PH, 0, pa)) {
      const p = (riser - 0.35) / 0.65, cx = pa[0], cy = pa[1], n = low ? 36 : 70, maxR = Math.hypot(W, H);
      g.globalCompositeOperation = "lighter"; g.lineWidth = 1.4;
      for (let i = 0; i < n; i++) {
        const an = (i * 2.399963) % TAU, ph = (i * 0.618 + t * (1.2 + p * 3)) % 1, r0 = maxR * (0.12 + ph * 0.7), r1 = r0 + maxR * (0.04 + p * p * 0.3);
        g.strokeStyle = qa(i % 5 ? teal : amber, p * 0.55 * (1 - ph * 0.4));
        g.beginPath(); g.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); g.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); g.stroke();
      }
      g.globalCompositeOperation = "source-over";
    }
    if (parts.length) {
      g.globalCompositeOperation = "lighter";
      const f = Math.pow(0.9, dt * 60);
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.l -= dt * 1.1; if (q.l <= 0) { parts.splice(i, 1); continue; }
        q.x += q.vx * dt * 60; q.y += q.vy * dt * 60; q.vx *= f; q.vy = q.vy * f + dt * 3;
        const s = q.s * q.l; g.globalAlpha = q.l; g.drawImage(q.a ? DOT_A : DOT_T, q.x - s / 2, q.y - s / 2, s, s);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    // lampi: l'accensione (caldo, dal pulsante) e il drop (bianco, preparato dal bianco che sale alla fine del tuffo)
    const flash = o.calm ? 0 : t >= M.drop ? Math.exp(-(t - M.drop) * 7) * 0.95 : riser > 0.9 ? (riser - 0.9) * 6 : 0;
    if (flash > 0.01) { g.globalAlpha = Math.min(1, flash); g.fillStyle = "#E9FFFB"; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (!o.calm && t >= M.hit && t < M.hit + 0.7 && proj(c, BTN.x, PH + 0.6, 0, pa)) {
      const k = (t - M.hit) / 0.7, s = 40 + k * Math.max(W, H) * 1.6;
      g.globalCompositeOperation = "lighter"; g.globalAlpha = (1 - k) * (1 - k) * 0.9; g.drawImage(DOT_A, pa[0] - s / 2, pa[1] - s / 2, s, s); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    lastT = t;
  };

  resize();
  return {
    draw, resize,
    node: () => (cam && proj(cam, 3.83, PH + 1, -3.2, pa) ? { x: pa[0], y: pa[1] } : null),
    button: () => {
      if (!cam || !proj(cam, BTN.x, PH + 0.5, BTN.z, pa)) return null;
      const x = pa[0], y = pa[1];
      return proj(cam, BTN.x + BTN.rb, PH + 0.5, BTN.z, pb) ? { x, y, r: Math.max(30, Math.hypot(pb[0] - x, pb[1] - y)) } : null;
    },
    gate: (s) => { if (s.hover != null) gate.hoverOn = s.hover; if (s.press && !gate.pressAt) gate.pressAt = performance.now(); },
    dispose: () => { labels = []; board.traces.length = 0; parts.length = rings.length = 0; layer.width = layer.height = soft.width = soft.height = cv.width = cv.height = 1; },
  };
}
