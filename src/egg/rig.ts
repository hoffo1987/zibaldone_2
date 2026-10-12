// Mini motore "rig → pixel": uno scheletro 2D animato a keyframe viene rasterizzato
// a bassa risoluzione con ombreggiatura a bande e outline, come fa Dead Cells con i
// suoi modelli 3D. Nessuna dipendenza dal DOM: gira anche in node per le anteprime.

export type V = { x: number; y: number };
export const V2 = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const scl = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const RAD = Math.PI / 180;
// convenzione angoli degli arti: 0 = giù, +90 = avanti (verso cui guarda), 180 = su, -90 = dietro
export const dir = (deg: number): V => ({ x: Math.sin(deg * RAD), y: Math.cos(deg * RAD) });
export const angOf = (d: V) => Math.atan2(d.x, d.y) / RAD;
export const along = (p: V, deg: number, d: number): V => ({ x: p.x + Math.sin(deg * RAD) * d, y: p.y + Math.cos(deg * RAD) * d });

// --- colori: 0xAABBGGRR, pronti per un ImageData little-endian ---
export type Col = number;
export type Ramp = Col[]; // 4 toni, dal più scuro al più chiaro
export const hex = (h: string, a = 255): Col => {
  const n = parseInt(h.slice(1), 16);
  return ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
export const rp = (...h: string[]): Ramp => h.map((x) => hex(x));
export const alpha = (c: Col, a: number): Col => (((c & 0xffffff) | (a << 24)) >>> 0);
export const darken = (c: Col, k: number): Col => {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  // le ombre scivolano leggermente verso il blu-viola
  return ((255 << 24) | (Math.min(255, b * k * 1.1 + 6) << 16) | ((g * k * 0.92) << 8) | (r * k * 0.95)) >>> 0;
};
export const mixC = (c: Col, d: Col, t: number): Col => {
  const r = lerp(c & 255, d & 255, t), g = lerp((c >> 8) & 255, (d >> 8) & 255, t), b = lerp((c >> 16) & 255, (d >> 16) & 255, t);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

// --- testa e dettagli disegnati a mano, pixel per pixel ---
export interface Grid { rows: string[]; pal: Record<string, Col>; ax: number; ay: number; _c?: Int32Array; w?: number; h?: number }
export const variant = (g: Grid, swap: Record<string, string>, rows?: Record<number, string>): Grid => ({
  ...g, _c: undefined,
  rows: g.rows.map((r, i) => (rows && rows[i] != null ? rows[i] : r.split("").map((ch) => (swap[ch] != null ? swap[ch] : ch)).join(""))),
});

// --- luce: dall'alto, leggermente davanti e verso chi guarda ---
const LN = Math.hypot(0.5, 0.66, 0.58);
const LX = 0.5 / LN, LY = -0.66 / LN, LZ = 0.58 / LN;
const tone = (i: number) => (i > 0.76 ? 3 : i > 0.34 ? 2 : i > -0.06 ? 1 : 0);

export interface Frame { o: V; ax: V; ay: V }
// sh: blob = volume tondeggiante, cx/cy = cilindro che varia lungo x o lungo y, flat = tono fisso
export interface PolyOpt { dim?: number; sh?: "blob" | "cx" | "cy" | "flat"; t?: number; fn?: (x: number, y: number) => number }

export class Raster {
  col: Uint32Array; grp: Uint8Array; rid: Uint8Array; ton: Uint8Array;
  ramps: Ramp[] = [];
  constructor(public w: number, public h: number, public ax: number, public ay: number) {
    const n = w * h;
    this.col = new Uint32Array(n); this.grp = new Uint8Array(n); this.rid = new Uint8Array(n); this.ton = new Uint8Array(n);
  }
  clear() { this.col.fill(0); this.grp.fill(0); this.rid.fill(255); this.ramps.length = 0; }
  private reg(r: Ramp) { let i = this.ramps.indexOf(r); if (i < 0) { i = this.ramps.length; this.ramps.push(r); } return i; }
  private bb(x0: number, y0: number, x1: number, y1: number) {
    return [Math.max(0, Math.floor(x0 + this.ax)), Math.max(0, Math.floor(y0 + this.ay)), Math.min(this.w - 1, Math.ceil(x1 + this.ax)), Math.min(this.h - 1, Math.ceil(y1 + this.ay))];
  }
  private put(i: number, r: Ramp, ri: number, t: number, g: number) {
    t = t < 0 ? 0 : t > 3 ? 3 : t;
    this.col[i] = r[t]; this.grp[i] = g; this.rid[i] = ri; this.ton[i] = t;
  }

  // segmento "cilindrico" (arti, capelli, code): rastremato, con estremi arrotondati
  limb(a: V, b: V, w0: number, w1: number, r: Ramp, g: number, dim = 0, caps = 3) {
    const ri = this.reg(r);
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-4;
    const ux = dx / L, uy = dy / L, px = -uy, py = ux;
    const r0 = w0 / 2, r1 = w1 / 2, rm = Math.max(r0, r1) + 1;
    const [x0, y0, x1, y1] = this.bb(Math.min(a.x, b.x) - rm, Math.min(a.y, b.y) - rm, Math.max(a.x, b.x) + rm, Math.max(a.y, b.y) + rm);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const wx = x - this.ax + 0.5, wy = y - this.ay + 0.5, rx = wx - a.x, ry = wy - a.y;
      const t = (rx * ux + ry * uy) / L, s = rx * px + ry * py;
      let nx = 0, ny = 0, nz = 0, ok = false;
      if (t >= 0 && t <= 1) {
        const hw = r0 + (r1 - r0) * t;
        if (Math.abs(s) <= hw) { const n = s / hw; nx = px * n; ny = py * n; nz = Math.sqrt(1 - n * n); ok = true; }
      }
      if (!ok && caps) {
        const ca = caps & 1 ? Math.hypot(rx, ry) : 1e9, cb = caps & 2 ? Math.hypot(wx - b.x, wy - b.y) : 1e9;
        if (t < 0.5 && ca <= r0 && r0 > 0.6) { nx = rx / r0; ny = ry / r0; ok = true; }
        else if (t >= 0.5 && cb <= r1 && r1 > 0.6) { nx = (wx - b.x) / r1; ny = (wy - b.y) / r1; ok = true; }
        if (ok) nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      }
      if (ok) this.put(y * this.w + x, r, ri, tone(nx * LX + ny * LY + nz * LZ) - dim, g);
    }
  }

  // poligono in un sistema locale (es. busto: x avanti, y su; lama: x lungo, y di traverso)
  poly(f: Frame, pts: number[], r: Ramp, g: number, o: PolyOpt = {}) {
    const ri = this.reg(r);
    let lx0 = 1e9, ly0 = 1e9, lx1 = -1e9, ly1 = -1e9, wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const X = pts[i * 2], Y = pts[i * 2 + 1];
      lx0 = Math.min(lx0, X); lx1 = Math.max(lx1, X); ly0 = Math.min(ly0, Y); ly1 = Math.max(ly1, Y);
      const wx = f.o.x + f.ax.x * X + f.ay.x * Y, wy = f.o.y + f.ax.y * X + f.ay.y * Y;
      wx0 = Math.min(wx0, wx); wx1 = Math.max(wx1, wx); wy0 = Math.min(wy0, wy); wy1 = Math.max(wy1, wy);
    }
    const cx = (lx0 + lx1) / 2, cy = (ly0 + ly1) / 2, hx = (lx1 - lx0) / 2 + 0.5, hy = (ly1 - ly0) / 2 + 0.5;
    const [x0, y0, x1, y1] = this.bb(wx0 - 1, wy0 - 1, wx1 + 1, wy1 + 1);
    const sh = o.sh || "blob", dim = o.dim || 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - this.ax + 0.5 - f.o.x, dy = y - this.ay + 0.5 - f.o.y;
      const X = dx * f.ax.x + dy * f.ax.y, Y = dx * f.ay.x + dy * f.ay.y;
      if (X < lx0 - 0.01 || X > lx1 + 0.01 || Y < ly0 - 0.01 || Y > ly1 + 0.01) continue;
      // point in polygon (pari/dispari)
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
        if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) continue;
      let t: number;
      if (o.fn) t = o.fn(X, Y);
      else if (sh === "flat") t = o.t != null ? o.t : 2;
      else {
        const a = sh === "cy" ? 0 : (X - cx) / hx, b = sh === "cx" ? 0 : (Y - cy) / hy;
        const nx = f.ax.x * a + f.ay.x * b, ny = f.ax.y * a + f.ay.y * b, nz = Math.sqrt(Math.max(0, 1 - a * a - b * b));
        t = tone(nx * LX + ny * LY + nz * LZ * 1.05) + (o.t || 0);
      }
      this.put(y * this.w + x, r, ri, t - dim, g);
    }
  }

  // sprite a griglia (teste, mani, dettagli): non ruota, come nella pixel art vera
  grid(G: Grid, at: V, g: number) {
    if (!G._c) {
      G.h = G.rows.length; G.w = G.rows[0].length; G._c = new Int32Array(G.w * G.h);
      G.rows.forEach((row, y) => row.split("").forEach((ch, x) => { G._c![y * G.w! + x] = G.pal[ch] != null ? G.pal[ch] | 0 : 0; }));
    }
    const ox = Math.round(at.x) - G.ax + this.ax, oy = Math.round(at.y) - G.ay + this.ay;
    for (let y = 0; y < G.h!; y++) for (let x = 0; x < G.w!; x++) {
      const c = G._c[y * G.w! + x]; if (!c) continue;
      const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
      const i = Y * this.w + X; this.col[i] = c >>> 0; this.grp[i] = g; this.rid[i] = 255;
    }
  }
  dot(p: V, c: Col, g: number) {
    const X = Math.floor(p.x + this.ax), Y = Math.floor(p.y + this.ay);
    if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) return;
    const i = Y * this.w + X; this.col[i] = c; this.grp[i] = g; this.rid[i] = 255;
  }
  line(a: V, b: V, c: Col, g: number) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
    for (let i = 0; i <= n; i++) this.dot(lerpV(a, b, i / n), c, g);
  }

  // passate finali: linee interne fra parti sovrapposte + contorno esterno selettivo
  finish(ink: Col) {
    const { w, h, col, grp, rid, ton } = this;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, g = grp[i]; if (!g) continue;
      if (grp[i - 1] > g || grp[i + 1] > g || grp[i - w] > g || grp[i + w] > g) {
        const ri = rid[i];
        col[i] = ri !== 255 && ton[i] > 0 ? this.ramps[ri][0] : darken(col[i], 0.55);
      }
    }
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (grp[i]) continue;
      let j = -1;
      if (grp[i - 1] && grp[i - 1] < 250) j = i - 1; else if (grp[i + 1] && grp[i + 1] < 250) j = i + 1;
      else if (grp[i - w] && grp[i - w] < 250) j = i - w; else if (grp[i + w] && grp[i + w] < 250) j = i + w;
      if (j < 0) continue;
      col[i] = mixC(darken(col[j], 0.3), ink, 0.55); grp[i] = 250;
    }
  }

  // riempimento convesso con alpha (scie dei fendenti): dopo finish, niente contorno
  fill(pts: V[], c: Col) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach((p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    const [X0, Y0, X1, Y1] = this.bb(x0, y0, x1, y1), n = pts.length;
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y; }
    const sg = area >= 0 ? 1 : -1, ca = c >>> 24;
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const px = x - this.ax + 0.5, py = y - this.ay + 0.5; let ok = true;
      for (let i = 0; i < n && ok; i++) { const a = pts[i], b = pts[(i + 1) % n]; if (((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x)) * sg < 0) ok = false; }
      if (!ok) continue;
      const i = y * this.w + x, e = this.col[i];
      this.col[i] = !(e >>> 24) || ca === 255 ? c : mixC(e, c, ca / 255);
      if (!this.grp[i]) this.grp[i] = 251;
    }
  }
}

// ================= scheletro =================
export interface Pose {
  x: number; y: number; rot: number; lean: number; hx: number; hy: number;
  fu: number; ff: number; bu: number; bf: number; // braccia: omero (relativo al busto), avambraccio (relativo all'omero)
  ft: number; fs: number; fa: number; bt: number; bs: number; ba: number; // gambe: coscia (assoluta), tibia e piede (relativi)
  w: number; ik: number; ex: number; // arma (angolo assoluto), mano dietro sull'elsa, espressione
}
export const P0: Pose = { x: 0, y: 0, rot: 0, lean: 0, hx: 0, hy: 0, fu: 0, ff: 0, bu: 0, bf: 0, ft: 0, fs: 0, fa: 0, bt: 0, bs: 0, ba: 0, w: 0, ik: 0, ex: 0 };
const STEP: (keyof Pose)[] = ["ik", "ex"];

export interface Body {
  thigh: number; shin: number; ankle: number; foot: number; heel: number;
  torso: number; neck: number; ua: number; la: number;
  shF: [number, number]; shB: [number, number]; hipF: number; hipB: number; grip: number;
}
export interface Arm { s: V; e: V; w: V; a1: number; a2: number }
export interface Leg { h: V; k: V; a: V; a1: number; a2: number; fa: number; heel: V; toe: V }
export interface Skel {
  hip: V; neck: V; head: V; up: V; fwd: V; lean: number; rot: number;
  arm: { f: Arm; b: Arm }; leg: { f: Leg; b: Leg }; grip: V; wa: number; p: Pose;
}
const fr = (o: V, ax: V, ay: V): Frame => ({ o, ax, ay });
export const torsoFrame = (s: Skel): Frame => fr(s.hip, s.fwd, s.up);
export const frameAt = (o: V, deg: number): Frame => { const a = dir(deg); return fr(o, a, { x: -a.y, y: a.x }); };

const ik2 = (s: V, t: V, l1: number, l2: number): [number, number] => {
  const d = sub(t, s), dist = clamp(Math.hypot(d.x, d.y), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = angOf(d), c = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), al = Math.acos(c) / RAD;
  // scegli il gomito più basso: è quello naturale con l'arma impugnata a due mani
  const ea = along(s, base + al, l1), eb = along(s, base - al, l1);
  const a1 = ea.y > eb.y ? base + al : base - al, e = along(s, a1, l1);
  return [a1, angOf(sub(t, e))];
};

export function solve(B: Body, p: Pose, grounded: boolean): Skel {
  const stand = B.thigh + B.shin + B.ankle;
  const hip = V2(p.x, -stand + (grounded ? 0 : p.y));
  const up = dir(180 - p.lean), fwd = dir(90 - p.lean);
  const T = (f: number, u: number) => V2(hip.x + fwd.x * f + up.x * u, hip.y + fwd.y * f + up.y * u);
  const neck = T(0, B.torso), head = add(neck, add(scl(up, B.neck), V2(p.hx, p.hy)));
  const arm = (sh: [number, number], u: number, l: number): Arm => {
    const s = T(sh[0], sh[1]), a1 = u - p.lean, e = along(s, a1, B.ua), a2 = a1 + l, w = along(e, a2, B.la);
    return { s, e, w, a1, a2 };
  };
  const leg = (off: number, t: number, sh: number, ft: number): Leg => {
    const h = V2(hip.x + off, hip.y), k = along(h, t, B.thigh), a2 = t + sh, a = along(k, a2, B.shin);
    const fa = a2 + 90 + ft, dn = fa - 90;
    const heel = along(along(a, dn, B.ankle), fa, -B.heel), toe = along(along(a, dn, B.ankle), fa, B.foot);
    return { h, k, a, a1: t, a2, fa, heel, toe };
  };
  const f = arm(B.shF, p.fu, p.ff);
  const grip = along(f.w, f.a2, 1.5);
  let b = arm(B.shB, p.bu, p.bf);
  if (p.ik) {
    const tgt = along(grip, p.w, -B.grip);
    const [a1, a2] = ik2(b.s, tgt, B.ua, B.la), e = along(b.s, a1, B.ua);
    b = { s: b.s, e, w: along(e, a2, B.la), a1, a2 };
  }
  const S: Skel = {
    hip, neck, head, up, fwd, lean: p.lean, rot: p.rot,
    arm: { f, b }, leg: { f: leg(B.hipF, p.ft, p.fs, p.fa), b: leg(B.hipB, p.bt, p.bs, p.ba) }, grip, wa: p.w, p,
  };
  const pts = (): V[] => [S.hip, S.neck, S.head, S.grip, S.arm.f.s, S.arm.f.e, S.arm.f.w, S.arm.b.s, S.arm.b.e, S.arm.b.w,
    S.leg.f.h, S.leg.f.k, S.leg.f.a, S.leg.f.heel, S.leg.f.toe, S.leg.b.h, S.leg.b.k, S.leg.b.a, S.leg.b.heel, S.leg.b.toe];
  if (p.rot) {
    // rotazione di tutto il corpo (capriole, cadute) attorno al baricentro
    const c = lerpV(hip, neck, 0.35), cs = Math.cos(p.rot * RAD), sn = Math.sin(p.rot * RAD);
    pts().forEach((q) => { const dx = q.x - c.x, dy = q.y - c.y; q.x = c.x + dx * cs - dy * sn; q.y = c.y + dx * sn + dy * cs; });
    S.up = dir(180 - p.lean - p.rot); S.fwd = dir(90 - p.lean - p.rot); S.lean = p.lean + p.rot;
    [S.arm.f, S.arm.b].forEach((a) => { a.a1 -= p.rot; a.a2 -= p.rot; });
    [S.leg.f, S.leg.b].forEach((l) => { l.a1 -= p.rot; l.a2 -= p.rot; l.fa -= p.rot; });
    S.wa -= p.rot;
  }
  if (grounded) {
    // appoggia a terra il punto più basso del corpo (piedi, ginocchia, mani...), tenendo conto dello spessore
    let low = -1e9;
    pts().forEach((q) => {
      const pad = q === S.hip || q === S.neck ? 3.5 : q === S.leg.f.k || q === S.leg.b.k ? 2 : q === S.arm.f.w || q === S.arm.b.w ? 1.5 : 0;
      if (q !== S.grip) low = Math.max(low, q.y + pad);
    });
    const dy = -low + p.y;
    pts().forEach((q) => { q.y += dy; });
  }
  return S;
}

// ================= animazioni =================
export type Ease = "lin" | "in" | "out" | "io" | "step";
// r: riparte dalla posa base invece che dalla chiave precedente (una chiave vuota fa lo stesso)
export interface Key { t: number; p?: Partial<Pose>; e?: Ease; r?: boolean }
export interface Hit { t0: number; t1: number; box: [number, number, number, number]; dmg: number; kb: number; ky?: number }
export interface Anim {
  len: number; keys: Key[]; loop?: boolean; fps?: number; ground?: boolean;
  speed?: number; // velocità "virtuale" in galleria, per far reagire capelli e mantelli
  trail?: [number, number]; hit?: Hit[]; cancel?: number; // da quando si può concatenare l'azione successiva
  _f?: Pose[];
}
const EZ: Record<Ease, (k: number) => number> = {
  lin: (k) => k, in: (k) => k * k * k, out: (k) => 1 - Math.pow(1 - k, 3), io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), step: () => 0,
};
export function sample(a: Anim, base: Pose, t: number): Pose {
  if (!a._f) { let cur: Pose = { ...base }; a._f = a.keys.map((k) => (cur = { ...(k.r || !k.p || !Object.keys(k.p).length ? base : cur), ...k.p })); }
  const K = a.keys, F = a._f, n = K.length;
  t = a.loop ? ((t % a.len) + a.len) % a.len : clamp(t, 0, a.len);
  let i = 0; while (i < n - 1 && K[i + 1].t <= t) i++;
  let A = F[i], B: Pose, t0 = K[i].t, t1: number;
  if (i < n - 1) { B = F[i + 1]; t1 = K[i + 1].t; }
  else if (a.loop) { B = F[0]; t1 = a.len; }
  else return { ...A };
  const k = EZ[K[i].e || "io"](t1 > t0 ? (t - t0) / (t1 - t0) : 0), out: any = {};
  (Object.keys(A) as (keyof Pose)[]).forEach((q) => { out[q] = STEP.indexOf(q) >= 0 ? A[q] : A[q] + (B[q] - A[q]) * k; });
  return out as Pose;
}

// ================= catene fisiche (capelli, code del cappotto) =================
// flow: quanto il "vento apparente" (dovuto al movimento) stende la catena nella direzione opposta
export interface ChainDef { n: number; seg: number; at: (s: Skel) => V; rest: number; stiff: number; grav?: number; drag?: number; push?: number; flow?: number }
export class Chain {
  p: V[] = []; o: V[] = []; ok = false; la: V | null = null; vel: V = { x: 0, y: 0 };
  constructor(public d: ChainDef) {}
  step(anchor: V, face: number, dt: number, floor: number, rest: number) {
    const d = this.d, ra = face > 0 ? rest : -rest;
    let rd = dir(ra);
    if (!this.ok) { this.p = []; for (let i = 0; i < d.n; i++) this.p.push(add(anchor, scl(rd, d.seg * i))); this.o = this.p.map((q) => ({ ...q })); this.ok = true; this.la = null; this.vel = { x: 0, y: 0 }; }
    if (this.la && dt > 1e-3) {
      const k = Math.min(1, dt * 12);
      this.vel.x += ((anchor.x - this.la.x) / dt - this.vel.x) * k; this.vel.y += ((anchor.y - this.la.y) / dt - this.vel.y) * k;
    }
    this.la = { ...anchor };
    const sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > 4) {
      const w = Math.min(1, sp / 240) * (d.flow != null ? d.flow : 0.75), wx = rd.x * (1 - w) - (this.vel.x / sp) * w, wy = rd.y * (1 - w) - (this.vel.y / sp) * w, L = Math.hypot(wx, wy) || 1;
      rd = { x: wx / L, y: wy / L };
    }
    const g = (d.grav != null ? d.grav : 380) * dt * dt, drag = d.drag != null ? d.drag : 0.12, push = (d.push || 0) * face * dt * dt;
    this.p[0] = { ...anchor }; this.o[0] = { ...anchor };
    for (let i = 1; i < d.n; i++) {
      const q = this.p[i], o = this.o[i], vx = (q.x - o.x) * (1 - drag), vy = (q.y - o.y) * (1 - drag);
      this.o[i] = { ...q }; q.x += vx - push; q.y += vy + g;
    }
    for (let it = 0; it < 3; it++) for (let i = 1; i < d.n; i++) {
      const a = this.p[i - 1], q = this.p[i], k = d.stiff * (1 - (i / d.n) * 0.5);
      q.x += (a.x + rd.x * d.seg - q.x) * k; q.y += (a.y + rd.y * d.seg - q.y) * k;
      const dx = q.x - a.x, dy = q.y - a.y, L = Math.hypot(dx, dy) || 1e-4;
      q.x = a.x + (dx / L) * d.seg; q.y = a.y + (dy / L) * d.seg;
      if (q.y > floor) q.y = floor;
    }
  }
}

// ================= personaggio =================
export interface CharDef {
  id: string; name: string; body: Body; base: Pose; anims: Record<string, Anim>;
  buf: [number, number, number, number]; ink: Col;
  chains?: ChainDef[]; chainRest?: (s: Skel, i: number) => number;
  weapon: { base: number; tip: number }; smear: [Col, Col];
  draw(r: Raster, s: Skel, c: V[][]): void;
}

export class Puppet {
  anim = "idle"; t = 0; face = 1; x = 0; y = 0; done = false; fluid = false; hold = false;
  chains: Chain[]; skel!: Skel; pose!: Pose; q = -1; A: Anim;
  smear: { g: V; a: number }[] = [];
  r: Raster;
  constructor(public def: CharDef) {
    this.chains = (def.chains || []).map((d) => new Chain(d)); this.A = def.anims.idle;
    const [w, h, ax, ay] = def.buf; this.r = new Raster(w, h, ax, ay);
    this.solve();
  }
  play(name: string, force = false) {
    if (!this.def.anims[name] || (name === this.anim && !force)) return;
    this.anim = name; this.A = this.def.anims[name]; this.t = 0; this.done = false; this.q = -1; this.smear = [];
  }
  frameIdx() { const A = this.A, fps = A.fps || 15; return Math.floor(this.t * fps + 1e-6); }
  update(dt: number) {
    if (!this.hold) this.t += dt;
    const A = this.A;
    if (!A.loop && this.t >= A.len) { this.done = true; this.t = A.len; }
  }
  solve() {
    const A = this.A, fps = A.fps || 15;
    const tq = this.fluid ? this.t : Math.floor(this.t * fps + 1e-6) / fps;
    this.pose = sample(A, this.def.base, tq);
    this.skel = solve(this.def.body, this.pose, A.ground !== false);
    const q = Math.floor(tq * fps + 1e-6);
    if (q !== this.q) {
      this.q = q;
      const tr = A.trail;
      if (tr && tq >= tr[0] && tq <= tr[1]) this.smear.push({ g: { ...this.skel.grip }, a: this.skel.wa });
      else if (this.smear.length) this.smear.shift();
      while (this.smear.length > 3) this.smear.shift();
    }
  }
  // world <-> locale (lo sprite è sempre disegnato verso destra, poi specchiato)
  toWorld(p: V): V { return V2(this.x + p.x * this.face, this.y + p.y); }
  toLocal(p: V): V { return V2((p.x - this.x) * this.face, p.y - this.y); }
  stepChains(dt: number, floor: number) {
    this.chains.forEach((c, i) => {
      const rest = this.def.chainRest ? this.def.chainRest(this.skel, i) : c.d.rest;
      c.step(this.toWorld(c.d.at(this.skel)), this.face, dt, floor, rest);
    });
  }
  resetChains() { this.chains.forEach((c) => { c.ok = false; }); }
  render(): Raster {
    const r = this.r; r.clear();
    const loc = this.chains.map((c) => c.p.map((q) => this.toLocal(q)));
    this.def.draw(r, this.skel, loc);
    r.finish(this.def.ink);
    this.drawSmear();
    return r;
  }
  // scia del fendente: mezzaluna che si assottiglia verso la coda, nucleo chiaro sul filo
  private drawSmear() {
    const S = this.smear, w = this.def.weapon; if (S.length < 2) return;
    const [c1, c2] = this.def.smear, segs: { g: V; a: number }[] = [];
    for (let i = 0; i < S.length - 1; i++) {
      const A = S[i], B = S[i + 1], n = Math.max(2, Math.ceil(Math.abs(B.a - A.a) / 8));
      for (let k = i ? 1 : 0; k <= n; k++) segs.push({ g: lerpV(A.g, B.g, k / n), a: lerp(A.a, B.a, k / n) });
    }
    const L = w.tip - w.base, N = segs.length - 1;
    for (let j = 0; j < N; j++) {
      const P = segs[j], Q = segs[j + 1], u0 = j / N, u1 = (j + 1) / N;
      const in0 = w.tip - L * 0.8 * u0, in1 = w.tip - L * 0.8 * u1, co0 = w.tip - L * 0.3 * u0, co1 = w.tip - L * 0.3 * u1;
      this.r.fill([along(P.g, P.a, in0), along(P.g, P.a, w.tip), along(Q.g, Q.a, w.tip), along(Q.g, Q.a, in1)], alpha(c2, Math.round(70 + 140 * u1)));
      if (u1 > 0.35) this.r.fill([along(P.g, P.a, co0), along(P.g, P.a, w.tip), along(Q.g, Q.a, w.tip), along(Q.g, Q.a, co1)], c1);
    }
  }
}
