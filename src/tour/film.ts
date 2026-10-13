// ===== IL FILM DELLA PRESENTAZIONE =====
// Una scena 3D disegnata su un solo canvas 2D, senza WebGL: una scheda elettronica sterminata, scritte estruse che si
// alzano dalla scheda come monumenti, correnti che corrono sulle piste. La macchina da presa segue il jingle (intro.mp3):
// ogni movimento e ogni scritta cadono su un attacco preciso del brano (misurati sul file, vedi MUSIC).
// Le scritte sono pre-disegnate in atlanti (faccia, fianchi, bagliore) e poi solo trasformate: a ogni fotogramma il
// canvas copia immagini già pronte, che è ciò che anche un telefono fa velocemente.

// tempi del brano in secondi: attacco, rintocco, ritorno del basso, campane, crescendo, drop e i tre colpi del ritmo
export const MUSIC = { hit: 0.06, bloom: 0.15, chime: 1.54, accent: 2.1, s1: 3.5, s2: 4.9, s3: 6.08, fall: 7.25, rise: 8.0, drop: 9.12, k1: 10.26, k2: 11.43, k3: 12.6, tag: 13.0, out: 13.45, end: 14.6 };
const HATS = [9.5, 9.9, 11.0, 11.8, 12.2, 13.0, 13.4];
const M = MUSIC;

export type FilmText = { stations: { word: string; line: string; icon: string }[]; hello: string; stamps: string[]; tag: string };
export type FilmOpts = { text: FilmText; calm: boolean; low: boolean };
// node(): dove si trova sullo schermo il nodo ambra del logo (serve al volo finale verso il tour guidato)
export type Film = { draw: (t: number) => void; resize: () => void; dispose: () => void; node: () => { x: number; y: number } | null };

type V3 = [number, number, number];
type Cam = { p: V3; r: V3; u: V3; f: V3; F: number; cx: number; cy: number; dist: number };
const D2R = Math.PI / 180, NEAR = 0.6;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp01(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mulberry = (a: number) => () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------- macchina da presa: chiavi con tangenti di Hermite (velocità continua), alcune ferme, alcune con easing proprio ----------
// still: componenti ferme in quella chiave (es. il punto mirato si posa sulla scritta mentre angolo e distanza scorrono)
type Key = { t: number; v: number[]; hold?: boolean; still?: number[]; ease?: (u: number) => number };
const track = (keys: Key[]) => {
  const m = keys.map((k, i) => {
    if (k.hold || i === 0 || i === keys.length - 1 || keys[i - 1].ease || k.ease) return k.v.map(() => 0);
    const a = keys[i - 1], b = keys[i + 1];
    return k.v.map((_, j) => (k.still && k.still.indexOf(j) >= 0 ? 0 : (b.v[j] - a.v[j]) / (b.t - a.t)));
  });
  return (t: number): number[] => {
    if (t <= keys[0].t) return keys[0].v.slice();
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v.slice();
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = clamp01((t - a.t) / h);
    if (a.ease) { const e = a.ease(s); return a.v.map((x, j) => x + (b.v[j] - x) * e); }
    const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return a.v.map((x, j) => h00 * x + h10 * h * m[i][j] + h01 * b.v[j] + h11 * h * m[i + 1][j]);
  };
};
const camera = (v: number[], W: number, H: number, F: number, sx: number, sy: number): Cam => {
  const [tx, ty, tz, dist, yaw, pitch, roll] = v, ys = yaw * D2R, ps = pitch * D2R, rs = (roll || 0) * D2R;
  const f: V3 = [Math.sin(ys) * Math.cos(ps), -Math.sin(ps), Math.cos(ys) * Math.cos(ps)];
  let r: V3 = [Math.cos(ys), 0, -Math.sin(ys)], u = cross(f, r);
  if (rs) { const c = Math.cos(rs), s = Math.sin(rs), r2: V3 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s]; u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s]; r = r2; }
  return { p: [tx - f[0] * dist, ty - f[1] * dist, tz - f[2] * dist], r, u, f, F, cx: W / 2 + sx, cy: H / 2 + sy, dist };
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
  t0: number; stg: number; dur: number; kind: "rise" | "slam" | "fade"; out: number; outStg: number; flash: number[];
};
const FACE_TOP = "#FFFFFF", FACE_BOT = "#C9F7EE";
const mkAtlas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const buildLabel = (text: string, font: string, em: number, fpx: number, o: { extrude: boolean; glow: string | null; low: boolean }): Label => {
  fpx = Math.round(Math.max(24, Math.min(o.low ? 160 : 280, fpx)));
  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = `${font.replace("%", String(fpx))}`;
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
  const edge = o.extrude ? paint(0.5, (gc) => { gc.fillStyle = "#35C9B2"; }) : null;
  const deep = o.extrude ? paint(0.5, (gc) => { gc.fillStyle = "#0A4A43"; }) : null;
  const glow = o.glow && !o.low ? paint(0.25, (gc) => { gc.fillStyle = o.glow!; }, o.glow) : null;
  return { g, W: totalW, asc: ascPx / pxu, desc: descPx / pxu, pad: pad / pxu, ch: ch / pxu, face, edge, deep, glow, x: 0, y: 0, z: 0, ry: 0, ext: em * 0.2, layers: o.extrude ? (o.low ? 4 : 9) : 0, scene: 0, t0: 0, stg: 0.05, dur: 0.6, kind: "rise", out: 99, outStg: 0.03, flash: [] };
};

// ---------- scheda: piste a 45°, piazzole, chip; tutto sul piano y = 0 (x a destra, z in avanti) ----------
type Trace = { p: number[]; c: number[]; L: number; d0: number; w: number; on: number; comet: number; v: number; amber: boolean };
type Chip = { x: number; z: number; w: number; d: number; lit: number; icon?: number[][] };
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
const HZ = 12; // il saluto del drop sta dietro al logo: il logo resta sul pavimento, in primo piano e in basso

const buildBoard = (R: () => number, low: boolean) => {
  const traces: Trace[] = [], chips: Chip[] = [];
  const keep: number[][] = [[-8, -7, 9, 7], [-15, 6, 15, 12]]; // logo e titolo
  STATIONS.forEach((s) => keep.push([s.x - 10, s.z - 7, s.x + 10, s.z + 2]));
  const blocked = (x: number, z: number) => keep.some((k) => x > k[0] && x < k[2] && z > k[1] && z < k[3]);
  // il bus: dal logo a ciascuna stazione, la pista che la macchina da presa segue
  const bus = [
    [[5.3, 0], [9, 0], [9, 22], [1, 30], [-6, 30]],
    [[-10, 32.5], [-10, 44], [4, 58], [6, 58]],
    [[10, 60.5], [10, 71], [-4, 85], [-4, 86]],
  ];
  bus.forEach((b) => traces.push(mkTrace(b, 0.2, R, true)));
  STATIONS.forEach((s) => chips.push({ x: s.x, z: s.z - 3, w: 8, d: 4, lit: 0 }));
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
  // chip decorativi negli spazi liberi
  for (let i = 0, tries = 0; i < (low ? 8 : 14) && tries < 200; tries++) {
    const w = 4 + Math.round(R() * 4) * 1.6, d = 3 + Math.round(R() * 3) * 1.6, x = (R() - 0.5) * 110, z = R() * 150 - 30;
    if ([[x - w / 2, z - d / 2], [x + w / 2, z + d / 2], [x, z]].some(([a, b]) => blocked(a, b)) || Math.hypot(x, z) < 16) continue;
    chips.push({ x, z, w, d, lit: 0 }); keep.push([x - w / 2 - 1, z - d / 2 - 1, x + w / 2 + 1, z + d / 2 + 1]); i++;
  }
  return { traces, chips };
};

// ---------- il film ----------
export function createFilm(cv: HTMLCanvasElement, o: FilmOpts): Film {
  const ctx = cv.getContext("2d", { alpha: true })!;
  const R = mulberry(0x2f6a1c ^ (o.text.hello.length * 7919));
  let low = o.low, W = 0, H = 0, dpr = 1, F = 1, portrait = false;
  const board = buildBoard(R, low);
  // sprite di luce, una volta sola
  const dot = (() => { const c = mkAtlas(64, 64), g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.2, "rgba(255,255,255,.6)"); r.addColorStop(0.55, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; })();
  const tint = (col: string) => { const c = mkAtlas(64, 64), g = c.getContext("2d")!; g.drawImage(dot, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = col; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.6; g.drawImage(dot, 16, 16, 32, 32); return c; };
  const DOT_T = tint("#2DD4BF"), DOT_A = tint("#FBBF24");
  const teal: string[] = [], amber: string[] = [], white: string[] = [];
  for (let i = 0; i <= 50; i++) { const a = (i / 50).toFixed(2); teal.push(`rgba(45,212,191,${a})`); amber.push(`rgba(251,191,36,${a})`); white.push(`rgba(230,255,250,${a})`); }
  const qa = (arr: string[], a: number) => arr[Math.round(clamp01(a) * 50)];

  let labels: Label[] = [], camA: (t: number) => number[] = () => [0, 0, 0, 40, 0, 89, 0], camB = camA, bg: CanvasGradient | null = null;
  type P = { x: number; y: number; vx: number; vy: number; l: number; s: number; a: boolean };
  const parts: P[] = [];
  const rings: { x: number; z: number; t0: number; r: number; amber: boolean }[] = [];
  const fired = new Set<string>();
  let lastT = -1, flow = 0, cam: Cam | null = null;
  const frames: number[] = [];

  const FONT = {
    title: "600 %px Unbounded, 'Bricolage Grotesque', sans-serif",
    head: "700 %px 'Bricolage Grotesque', 'Instrument Sans', sans-serif",
    line: "500 %px 'Instrument Sans', system-ui, sans-serif",
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
    // 0 · il titolo si alza dalla scheda dietro al logo
    const title = add("Il Circuito", FONT.title, 2.6, est("Il Circuito", 2.6, 0.78) + 2, kTitle, true, "#2DD4BF", 0, { x: 0, y: 0.25, z: 9, t0: 1.22, stg: 0.055, dur: 0.75, kind: "rise", out: M.fall + 0.25, outStg: 0.035, flash: [M.chime, M.accent] });
    // 1-3 · le stazioni lungo il bus
    const stW = T.stations.map((s, i) => {
      const P = STATIONS[i], lines = portrait ? splitLine(s.line) : [s.line], fw = Math.max(est(s.word, 3), ...lines.map((l) => est(l, 0.62, 0.5))) + 2;
      const t0 = [M.s1, M.s2, M.s3][i] - 0.04;
      const hd = add(s.word, FONT.head, 3, fw, kHead, true, i === 2 ? "#FBBF24" : "#2DD4BF", i + 1, { x: P.x, y: portrait ? 1.95 : 1.7, z: P.z, t0, stg: 0.045, dur: 0.62, kind: "rise", out: 99 });
      const subs = lines.map((l, j) => add(l, FONT.line, 0.62, fw, kHead, false, null, i + 1, { x: P.x, y: portrait ? 1.0 - j * 0.82 : 0.45, z: P.z, t0: t0 + 0.32 + j * 0.08, stg: 0, dur: 0.5, kind: "fade", out: 99 }));
      return Math.max(hd.W, ...subs.map((x) => x.W)) + 2;
    });
    // 4 · il drop: il saluto, poi una parola per colpo, poi la chiusa. In verticale le parole si impilano
    const hello = portrait ? splitHello(T.hello) : [T.hello], emH = portrait ? 2.6 : 3, stampEm = portrait ? 1.5 : 1.7;
    const estW = Math.max(...hello.map((h) => est(h, emH, 0.6)), portrait ? 0 : T.stamps.reduce((a, s) => a + est(s, stampEm, 0.56) + stampEm * 0.6, 0)) + 2;
    const hl = hello.map((h, j) => add(h, FONT.head, emH, estW, kHello, true, "#2DD4BF", 4, { x: 0, y: portrait ? 10.8 - j * 2.65 : 5.2, z: HZ, t0: M.drop, stg: 0.028, dur: 0.5, kind: "slam", out: M.out + 0.05, outStg: 0.022, flash: [M.k1, M.k2, M.k3] }));
    const stamps = T.stamps.map((s, i) => add(s, FONT.head, stampEm, estW, kHello, true, i === 2 ? "#FBBF24" : "#5EEAD4", 4, { x: 0, y: portrait ? 6.0 - i * 1.72 : 2.9, z: HZ, t0: [M.k1, M.k2, M.k3][i] - 0.035, stg: 0.022, dur: 0.42, kind: "slam", out: M.out + 0.12 + i * 0.05, outStg: 0.02 }));
    let rowW = 0;
    if (!portrait) { const gap = stampEm * 0.6; rowW = stamps.reduce((a, L) => a + L.W, 0) + gap * (stamps.length - 1); let sx = -rowW / 2; stamps.forEach((L) => { L.x = sx + L.W / 2; sx += L.W + gap; }); }
    const tag = add(T.tag, FONT.line, portrait ? 0.75 : 0.85, estW, kHello, false, null, 4, { x: 0, y: portrait ? 1.4 : 1.55, z: HZ, t0: M.tag, stg: 0, dur: 0.5, kind: "fade", out: M.out + 0.3 });
    const helloW = Math.max(...hl.map((L) => L.W), rowW, ...stamps.map((L) => (portrait ? L.W : 0)), tag.W) + 2;
    const titleW = title.W + 2;

    if (o.calm) {
      // movimento ridotto: tutto nello stesso punto, le scritte si danno il cambio con una dissolvenza; la camera sta ferma
      const ends = [M.s1, M.s2, M.s3, M.drop, M.out + 0.3];
      labels.forEach((L) => { L.kind = "fade"; L.stg = 0; L.outStg = 0; if (L.scene >= 1 && L.scene <= 3) L.x -= STATIONS[L.scene - 1].x; L.z = 9; L.out = ends[L.scene] - 0.35; L.flash = []; });
      const v = [0, portrait ? 4.5 : 2.6, 9, fitDist(Math.max(helloW, titleW, ...stW), portrait ? 0.86 : 0.6) * 1.05, 0, 9, 0];
      camA = camB = () => v;
      return;
    }
    // inquadrature: la distanza nasce dalla larghezza della scritta e dallo schermo, non da numeri fissi
    const dT = fitDist(titleW, kTitle), dS = stW.map((w) => fitDist(w, kHead)), dH = fitDist(helloW, kHello), dTop = (24 * F) / Math.min(W, H);
    // in verticale la camera guarda più in basso: l'orizzonte sale e la scheda riempie lo schermo alto e stretto
    const tilt = portrait ? 12 : 0;
    const st = (i: number, sy: number, k: number, yaw: number, pitch = 9): number[] => [STATIONS[i].x, sy, STATIONS[i].z, dS[i] * k, yaw * (portrait ? 0.35 : 1), pitch + tilt, 0];
    const XZ = [0, 1, 2];
    const hy = portrait ? 6.2 : 3.4;
    camA = track([
      { t: 0, v: [-0.33, 0, 0.3, dTop * 1.12, 0, 89.5, 0] },
      { t: 0.95, v: [-0.1, 0, 0.5, dTop, 0, 88, 0] },
      { t: 2.05, v: [0, portrait ? 2.2 : 1.7, 5.6, dT * 1.22, -5, 25 + tilt, 0] },
      { t: 2.75, v: [0.6, portrait ? 2.2 : 1.8, 6.4, dT * 1.14, 3, 21 + tilt, 0] },
      { t: 3.35, v: st(0, 2.4, 1.3, -20, 11), still: XZ },
      { t: 4.55, v: st(0, 2.2, 1.04, -7), still: XZ },
      { t: 5.1, v: st(1, 2.4, 1.24, 18, 11), still: XZ },
      { t: 5.95, v: st(1, 2.2, 1.04, 7), still: XZ },
      { t: 6.45, v: st(2, 2.4, 1.24, -17, 11), still: XZ },
      { t: 7.3, v: st(2, 2.2, 1.0, -6), hold: true },
      { t: M.rise, v: [0, 0, 46, dTop * 6.2, 0, 46, 0], hold: true },
      // il tuffo: prima la camera punta il logo, poi ci cade dentro accelerando fino al drop
      { t: 8.6, v: [-0.33, 0, 0, dTop * 4.4, 0, 70, 0], hold: true, ease: (u) => u * u * u },
      { t: M.drop, v: [-0.33, 0, 0, 2.2, 0, 88, 0] },
    ]);
    camB = track([
      { t: M.drop, v: [0, hy + 0.1, HZ, dH * 1.16, 0, 7 + tilt, 0] },
      { t: M.k1, v: [0, hy, HZ, dH * 1.08, -3.5, 7.5 + tilt, -0.6] },
      { t: M.k2, v: [0, hy, HZ, dH * 1.04, 3, 7.5 + tilt, 0.5] },
      { t: M.k3, v: [0, hy - 0.1, HZ, dH * 1.0, -2, 8 + tilt, -0.3] },
      { t: M.out, v: [0, hy - 0.1, HZ, dH * 0.97, 0, 8 + tilt, 0], hold: true, ease: easeInOut },
      { t: 14.25, v: [-0.33, 0, 0, dTop * 1.1, 0, 89, 0] },
      { t: M.end, v: [-0.33, 0, 0, dTop * 1.04, 0, 89.5, 0] },
    ]);
  };

  const resize = () => {
    W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : W < 768 ? 1.5 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    portrait = W / H < 0.85;
    F = (0.5 * Math.min(W, H)) / Math.tan(25 * D2R);
    bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#03110F"); bg.addColorStop(0.55, "#052220"); bg.addColorStop(1, "#020B0A");
    layout();
  };

  // ---------- disegno ----------
  const pt = [0, 0, 0, 0], pa = [0, 0, 0, 0], pb = [0, 0, 0, 0], pc = [0, 0, 0, 0], tmp = [0, 0];
  let fogN = 30, fogF = 120;
  const fog = (z: number) => clamp01(1 - (z - fogN) / (fogF - fogN));
  const pads: number[][] = [[], [], [], []];

  const drawBoard = (c: Cam, t: number, energy: number, converge: number) => {
    const g = ctx;
    g.lineCap = "round"; g.lineJoin = "round";
    pads.forEach((b) => { b.length = 0; });
    // piste: si accendono come un'onda che parte dal logo; dopo, la corrente le percorre
    for (const q of board.traces) {
      const prog = o.calm ? 1 : clamp01(((t - q.on) * 34) / q.L);
      if (prog <= 0) continue;
      const mi = Math.floor(q.c.length / 2);
      if (!proj(c, q.p[mi * 2], 0, q.p[mi * 2 + 1], pt)) continue;
      const a0 = fog(pt[2]); if (a0 < 0.02) continue;
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
      g.strokeStyle = qa(q.amber ? amber : teal, a0 * (q.amber ? 0.55 + energy * 0.35 : 0.3 + energy * 0.25));
      g.stroke();
      if (prog < 1) {
        // testina che disegna la pista
        at(q, lenOn, tmp);
        if (proj(c, tmp[0], 0, tmp[1], pa)) { const s = Math.max(4, 1.4 * pa[3]); g.globalCompositeOperation = "lighter"; g.globalAlpha = a0; g.drawImage(q.amber ? DOT_A : DOT_T, pa[0] - s / 2, pa[1] - s / 2, s, s); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; }
      } else {
        // piazzole ai capi, raccolte per opacità e disegnate dopo con quattro tratti in tutto
        for (let e = 0; e < 2; e++) {
          const i = e ? q.c.length - 1 : 0;
          if (!proj(c, q.p[i * 2], 0, q.p[i * 2 + 1], pa)) continue;
          const a = fog(pa[2]), r = 0.42 * pa[3]; if (a < 0.05 || r < 0.8) continue;
          pads[Math.min(3, Math.floor(a * 4))].push(pa[0], pa[1], r);
        }
      }
    }
    g.lineWidth = 1;
    pads.forEach((b, k) => {
      if (!b.length) return;
      g.beginPath(); for (let i = 0; i < b.length; i += 3) { g.moveTo(b[i] + b[i + 2], b[i + 1]); g.arc(b[i], b[i + 1], b[i + 2], 0, 6.2832); }
      g.strokeStyle = qa(teal, ((k + 0.5) / 4) * 0.55); g.stroke();
    });
    // chip
    for (const k of board.chips) {
      const corners = [[k.x - k.w / 2, k.z - k.d / 2], [k.x + k.w / 2, k.z - k.d / 2], [k.x + k.w / 2, k.z + k.d / 2], [k.x - k.w / 2, k.z + k.d / 2]];
      const sp: number[][] = []; let ok = true;
      for (const [x, z] of corners) { if (!proj(c, x, 0, z, pa)) { ok = false; break; } sp.push([pa[0], pa[1], pa[2], pa[3]]); }
      if (!ok) continue;
      const a = fog(sp[0][2]); if (a < 0.03) continue;
      const lit = k.lit;
      g.beginPath(); sp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = `rgba(${lit ? "12,58,52" : "4,28,26"},${(0.92 * a).toFixed(2)})`; g.fill();
      g.lineWidth = Math.max(1, 0.1 * sp[0][3]); g.strokeStyle = qa(lit ? amber : teal, a * (0.45 + lit * 0.5)); g.stroke();
      g.beginPath();
      const n = Math.max(3, Math.floor(k.w / 0.9));
      for (let i = 1; i < n; i++) {
        const x = k.x - k.w / 2 + (k.w * i) / n;
        if (proj(c, x, 0, k.z - k.d / 2, pa) && proj(c, x, 0, k.z - k.d / 2 - 0.6, pb)) { g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); }
        if (proj(c, x, 0, k.z + k.d / 2, pa) && proj(c, x, 0, k.z + k.d / 2 + 0.6, pb)) { g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); }
      }
      g.strokeStyle = qa(teal, a * 0.5); g.lineWidth = Math.max(0.8, 0.12 * sp[0][3]); g.stroke();
      // l'icona della stazione si incide sul chip quando la stazione si accende
      if (k.icon && lit > 0) {
        g.beginPath();
        for (const poly of k.icon) {
          const upto = Math.max(1, Math.round((poly.length / 2) * clamp01(lit * 1.4)));
          let pv = false;
          for (let i = 0; i < upto; i++) { const ok2 = proj(c, k.x + poly[i * 2] * 1.35, 0.02, k.z + poly[i * 2 + 1] * 1.35, pa); if (ok2) { if (pv) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); } pv = ok2; }
        }
        g.lineWidth = Math.max(1.2, 0.2 * sp[0][3]); g.strokeStyle = qa(amber, a * lit); g.stroke();
      }
    }
    // correnti: comete sulle piste accese; nel crescendo tornano tutte verso il logo, sempre più veloci
    if (o.calm) return;
    g.globalCompositeOperation = "lighter";
    let n = 0; const cap = low ? 70 : 170;
    for (const q of board.traces) {
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

  const LOGO_ARC = (() => { const pts: number[] = [], A0 = Math.atan2(9.6, 11.5); for (let i = 0; i <= 64; i++) { const a = A0 + (i / 64) * (Math.PI * 2 - 2 * A0); pts.push(Math.cos(a) * 5, Math.sin(a) * 5); } return pts; })();
  const LOGO_LINE = [-0.33, 0, 5, 0];
  const drawLogo = (c: Cam, t: number, energy: number, la: number) => {
    const g = ctx, kA = o.calm ? 1 : easeOut((t - 0.12) / 1.05), kL = o.calm ? 1 : easeOut((t - 0.82) / 0.45);
    if (!proj(c, 0, 0, 0, pb)) return;
    const sc = pb[3];
    const stroke = (pts: number[], k: number, w: number) => {
      const n = Math.round((pts.length / 2 - 1) * k); if (n < 1) return;
      g.beginPath(); let pv = false;
      for (let i = 0; i <= n; i++) { const ok = proj(c, pts[i * 2], 0.05, pts[i * 2 + 1], pa); if (ok) { if (pv) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); } pv = ok; }
      g.lineWidth = Math.max(1.5, w * sc); g.stroke();
    };
    g.lineCap = "round";
    // anima bianca con il suo bagliore (un solo tracciato: l'ombra sfocata costa poco)
    g.shadowColor = `rgba(45,212,191,${(0.75 + energy * 0.25).toFixed(2)})`; g.shadowBlur = Math.min(40, 1.3 * sc * (1 + energy));
    g.strokeStyle = "#F4FFFD";
    stroke(LOGO_ARC, kA, 0.95); stroke(LOGO_LINE, kL, 0.6);
    g.shadowBlur = 0; g.shadowColor = "transparent";
    // nodi: due perle e il nodo ambra che lampeggia sul rintocco e sul drop
    const node = (x: number, z: number, r: number, t0: number, am: boolean) => {
      const k = o.calm ? 1 : back((t - t0) / 0.42); if (k <= 0.01 || !proj(c, x, 0.1, z, pa)) return;
      const flash = am ? Math.max(0, 1 - Math.abs(t - M.chime) * 3.2) + Math.max(0, 1 - Math.abs(t - M.drop) * 2.5) + energy * 0.4 : 0;
      const rr = r * pa[3] * k;
      if (am) { const s = rr * (5 + flash * 8); g.globalCompositeOperation = "lighter"; g.globalAlpha = Math.min(1, 0.55 + flash) * la; g.drawImage(DOT_A, pa[0] - s / 2, pa[1] - s / 2, s, s); g.globalAlpha = la; g.globalCompositeOperation = "source-over"; }
      g.fillStyle = am ? "#FBBF24" : "#FFFFFF"; g.beginPath(); g.arc(pa[0], pa[1], Math.max(1, rr), 0, 6.2832); g.fill();
    };
    node(3.83, 3.2, 1.15, 0.9, false); node(-0.33, 0, 0.85, 1.02, false); node(3.83, -3.2, 1.15, 1.14, true);
  };

  // una lettera: tre angoli proiettati bastano per l'affine che porta la cella dell'atlante sullo schermo
  const glyph = (c: Cam, A: Atlas, L: Label, gi: number, ox: number, oy: number, oz: number, R3: V3, U3: V3, alpha: number) => {
    const G = L.g[gi], pxu = L.face.c.height / L.ch; // px dell'atlante (a scala 1) per unità di mondo
    const x0 = G.x - L.W / 2 - L.pad, x1 = x0 + G.cw / pxu, y1 = L.asc + L.pad, y0 = y1 - L.ch;
    const P = (x: number, y: number, o2: number[]) => proj(c, ox + R3[0] * x + U3[0] * y, oy + R3[1] * x + U3[1] * y, oz + R3[2] * x + U3[2] * y, o2);
    if (!P(x0, y1, pa) || !P(x1, y1, pb) || !P(x0, y0, pc)) return;
    const sw = G.cw * A.s, sh = A.c.height;
    ctx.setTransform(((pb[0] - pa[0]) / sw) * dpr, ((pb[1] - pa[1]) / sw) * dpr, ((pc[0] - pa[0]) / sh) * dpr, ((pc[1] - pa[1]) / sh) * dpr, pa[0] * dpr, pa[1] * dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(A.c, G.cx * A.s, 0, sw, sh, 0, 0, sw, sh);
  };
  type GS = { up: V3; bk: V3; ox: number; oy: number; oz: number; al: number; fl: number } | null;
  const drawLabel = (c: Cam, L: Label, t: number) => {
    const rc = Math.cos(L.ry * D2R), rs = Math.sin(L.ry * D2R);
    const R3: V3 = [rc, 0, -rs], Bk: V3 = [rs, 0, rc];
    const n = L.g.length, st: GS[] = [];
    // stato di ogni lettera: angolo di alzata, spinta verso la camera, opacità, lampo
    for (let i = 0; i < n; i++) {
      const k = (t - (L.t0 + i * L.stg)) / L.dur, ko = (t - (L.out + i * L.outStg)) / 0.5;
      if (k <= 0 || ko >= 1) { st.push(null); continue; }
      let ang = 0, push = 0, al = 1, lift = 0;
      if (L.kind === "rise") { ang = 90 * (1 - back(k)); al = clamp01(k * 3.5); }
      else if (L.kind === "slam") { const e = easeOut(k); push = 16 * (1 - e) * (1 - e); al = clamp01(k * 4); ang = -12 * (1 - e); }
      else { al = easeOut(k); lift = -0.35 * (1 - easeOut(k)); }
      if (ko > 0) { const e = easeInOut(ko); if (L.kind === "fade") al *= 1 - e; else { ang = Math.max(ang, 90 * e); al *= 1 - e * e; } }
      const ca = Math.cos(ang * D2R), sa = Math.sin(ang * D2R);
      const up: V3 = [Bk[0] * sa, ca, Bk[2] * sa];
      let fl = 0;
      for (const f of L.flash) if (t >= f) fl = Math.max(fl, 1 - (t - f) * 2.6 - Math.abs(i - (t - f) * 26) * 0.08);
      st.push({ up, bk: cross(R3, up), ox: L.x - Bk[0] * push, oy: L.y + lift, oz: L.z - Bk[2] * push, al, fl: Math.max(0, fl) });
    }
    if (L.glow) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) { const s = st[i]; if (s) glyph(c, L.glow, L, i, s.ox, s.oy, s.oz, R3, s.up, s.al * (0.35 + s.fl * 0.9)); }
      ctx.globalCompositeOperation = "source-over";
    }
    // fianchi dal fondo verso la faccia; lo strato più vicino è chiaro, come uno smusso che prende luce
    if (L.edge && L.deep && L.layers) {
      for (let k = L.layers; k >= 1; k--) {
        const A = k === 1 ? L.edge : L.deep, d = (k * L.ext) / L.layers;
        for (let i = 0; i < n; i++) { const s = st[i]; if (s) glyph(c, A, L, i, s.ox + s.bk[0] * d, s.oy + s.bk[1] * d, s.oz + s.bk[2] * d, R3, s.up, s.al); }
      }
    }
    for (let i = 0; i < n; i++) { const s = st[i]; if (s) glyph(c, L.face, L, i, s.ox, s.oy, s.oz, R3, s.up, s.al); }
    if (L.glow) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) { const s = st[i]; if (s && s.fl > 0.02) glyph(c, L.glow, L, i, s.ox, s.oy, s.oz, R3, s.up, s.fl * 0.8); }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  };

  const ring = (c: Cam, x: number, z: number, r: number, a: number, am: boolean) => {
    const g = ctx; g.beginPath(); let pv = false;
    for (let i = 0; i <= 48; i++) { const an = (i / 48) * 6.2832, ok = proj(c, x + Math.cos(an) * r, 0.05, z + Math.sin(an) * r, pa); if (ok) { if (pv) g.lineTo(pa[0], pa[1]); else g.moveTo(pa[0], pa[1]); } pv = ok; }
    g.lineWidth = 2; g.strokeStyle = qa(am ? amber : white, a); g.stroke();
  };
  const burst = (x: number, y: number, n: number, am: boolean, sp = 1) => {
    for (let i = 0; i < n && parts.length < 320; i++) { const an = Math.random() * 6.2832, v = (2 + Math.random() * 7) * sp; parts.push({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 1.5, l: 1, s: 6 + Math.random() * 14, a: am || Math.random() < 0.3 }); }
  };
  const once = (key: string, t: number, at0: number, fn: () => void) => { if (t >= at0 && lastT < at0 + 0.25 && !fired.has(key)) { fired.add(key); fn(); } };
  const events = (c: Cam, t: number) => {
    once("bloom", t, M.bloom, () => rings.push({ x: 0, z: 0, t0: M.bloom, r: 34, amber: true }));
    [M.s1, M.s2, M.s3].forEach((s, i) => once("s" + i, t, s + 0.15, () => {
      const P = STATIONS[i]; rings.push({ x: P.x, z: P.z - 3, t0: s + 0.15, r: 11, amber: i === 2 });
      if (i === 2 && proj(c, P.x, 2.5, P.z, pa)) burst(pa[0], pa[1], low ? 24 : 48, true, 0.9);
    }));
    once("drop", t, M.drop, () => { rings.push({ x: 0, z: 0, t0: M.drop, r: 60, amber: false }); burst(W / 2, H * 0.42, low ? 60 : 120, false, 1.6); });
    [M.k1, M.k2, M.k3].forEach((k, i) => once("k" + i, t, k, () => {
      const L = labels.find((l) => l.kind === "slam" && Math.abs(l.t0 - (k - 0.035)) < 0.01);
      rings.push({ x: L ? L.x : 0, z: HZ, t0: k, r: 18, amber: i === 2 });
      if (L && proj(c, L.x, L.y + 0.6, L.z, pa)) burst(pa[0], pa[1], low ? 18 : 36, i === 2);
    }));
    // i piatti del ritmo: piccole onde che si aprono su piazzole a caso
    HATS.forEach((h, i) => once("h" + i, t, h, () => { for (let j = 0; j < 3; j++) { const q = board.traces[Math.floor(Math.random() * board.traces.length)]; rings.push({ x: q.p[0], z: q.p[1], t0: h, r: 2.6, amber: (i + j) % 3 === 0 }); } }));
  };

  const draw = (t: number) => {
    // nei primi fotogrammi controllo se il dispositivo arranca: in quel caso meno pixel, meno strati, meno comete
    if (frames.length < 50) {
      frames.push(performance.now());
      if (frames.length === 50 && !low && (frames[49] - frames[5]) / 44 > 24) { low = true; resize(); }
    }
    if (t < lastT - 0.5) { fired.clear(); parts.length = 0; rings.length = 0; }
    const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - lastT));
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.fillStyle = bg || "#03110F"; g.fillRect(0, 0, W, H);

    // energia del brano: sale col crescendo, picchi su drop e colpi
    const riser = clamp01((t - M.rise) / (M.drop - M.rise));
    const kick = [M.drop, M.k1, M.k2, M.k3].reduce((m, k) => Math.max(m, t >= k ? Math.exp(-(t - k) * 6) : 0), 0);
    const energy = t < M.drop ? riser * riser : 0.35 + kick * 0.65;
    const converge = t < M.drop && t > M.rise ? Math.pow(riser, 1.6) : 0;
    flow += dt * (1 + energy * 1.6 + converge * 5);
    const shake = o.calm || t < M.drop ? 0 : kick * 7;
    const c = (cam = camera(t < M.drop ? camA(t) : camB(t), W, H, F, Math.sin(t * 93) * shake, Math.cos(t * 71) * shake * 0.7));
    fogN = c.dist * 1.1; fogF = c.dist * 1.1 + (portrait ? 70 : 95);
    // luce dell'orizzonte
    const hf = Math.hypot(c.f[0], c.f[2]);
    if (hf > 0.05) {
      const fx = c.f[0] / hf, fz = c.f[2] / hf, dz = fx * c.f[0] + fz * c.f[2], dy = fx * c.u[0] + fz * c.u[2];
      if (dz > 0.05) {
        const hy = c.cy - (c.F * dy) / dz;
        if (hy > -H && hy < H * 2) { const hg = g.createRadialGradient(W / 2, hy, 0, W / 2, hy, Math.max(W, H) * 0.75); hg.addColorStop(0, `rgba(23,195,174,${(0.2 + energy * 0.25).toFixed(3)})`); hg.addColorStop(1, "rgba(23,195,174,0)"); g.fillStyle = hg; g.fillRect(0, 0, W, H); }
      }
    }
    board.chips.forEach((k, i) => { if (i < 3) { k.lit = o.calm ? 0 : clamp01((t - [M.s1, M.s2, M.s3][i] + 0.1) / 0.6); k.icon = ICONS[o.text.stations[i].icon]; } });
    drawBoard(c, t, energy, converge);
    // ci si tuffa nel logo e lo si attraversa: dopo il lampo il saluto ha la scena per sé; il logo torna nel finale dall'alto
    const logoA = o.calm || t < M.drop ? 1 : clamp01((t - M.out - 0.25) / 0.45);
    if (logoA > 0) { g.globalAlpha = logoA; drawLogo(c, t, energy, logoA); g.globalAlpha = 1; }
    if (!o.calm) events(c, t);
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i], k = (t - r.t0) / 1.1; if (k > 1) { rings.splice(i, 1); continue; } if (k >= 0) ring(c, r.x, r.z, r.r * easeOut(k), (1 - k) * 0.8, r.amber); }

    // scritte, dalla più lontana
    labels.map((L) => ({ L, d: (L.x - c.p[0]) * c.f[0] + (L.y - c.p[1]) * c.f[1] + (L.z - c.p[2]) * c.f[2] }))
      // dopo il drop si guarda il saluto: le stazioni, lontane alle sue spalle, non devono fare da sfondo
      .filter((v) => v.d > NEAR && t > v.L.t0 - 0.05 && t < v.L.out + 1.2 && !(t >= M.drop && v.L.scene >= 1 && v.L.scene <= 3)).sort((a, b) => b.d - a.d)
      .forEach((v) => drawLabel(c, v.L, t));

    // linee di velocità nel tuffo
    if (!o.calm && riser > 0.35 && t < M.drop && proj(c, -0.33, 0, 0, pa)) {
      const p = (riser - 0.35) / 0.65, cx = pa[0], cy = pa[1], n = low ? 36 : 70, maxR = Math.hypot(W, H);
      g.globalCompositeOperation = "lighter"; g.lineWidth = 1.4;
      for (let i = 0; i < n; i++) {
        const an = (i * 2.399963) % 6.2832, ph = (i * 0.618 + t * (1.2 + p * 3)) % 1, r0 = maxR * (0.12 + ph * 0.7), r1 = r0 + maxR * (0.04 + p * p * 0.3);
        g.strokeStyle = qa(i % 5 ? teal : amber, p * 0.5 * (1 - ph * 0.4));
        g.beginPath(); g.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); g.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1); g.stroke();
      }
      g.globalCompositeOperation = "source-over";
    }
    // scintille, in coordinate di schermo
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
    // il lampo del drop (preparato dal bianco che sale negli ultimi istanti del tuffo)
    const flash = o.calm ? 0 : t >= M.drop ? Math.exp(-(t - M.drop) * 7) * 0.95 : riser > 0.9 ? (riser - 0.9) * 6 : 0;
    if (flash > 0.01) { g.globalAlpha = Math.min(1, flash); g.fillStyle = "#E9FFFB"; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    // prima dell'attacco un solo punto ambra respira al centro; sull'attacco esplode
    if (t < M.bloom + 0.6 && proj(c, -0.33, 0, 0, pa)) {
      const a = t < M.hit ? 0.55 + 0.25 * Math.sin(t * 20) : Math.max(0, 1 - (t - M.hit) / 0.6), s = 26 + (t >= M.hit ? (t - M.hit) * 700 : 0);
      g.globalCompositeOperation = "lighter"; g.globalAlpha = a; g.drawImage(DOT_A, pa[0] - s / 2, pa[1] - s / 2, s, s); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    lastT = t;
  };

  resize();
  return {
    draw, resize,
    node: () => (cam && proj(cam, 3.83, 0.1, -3.2, pa) ? { x: pa[0], y: pa[1] } : null),
    dispose: () => { labels = []; board.traces.length = 0; cv.width = cv.height = 1; },
  };
}
