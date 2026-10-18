// La sala del podio: dimensioni, materiali, percorso del sole e della luna, camera, atmosfere. Gli stessi numeri servono
// alle geometrie (meshes.ts), agli shader (come costanti WGSL) e alla proiezione delle targhette HTML.
// Unità: metri; y in alto, la camera guarda verso -z.

// codici dei materiali (attributo dei vertici, letto dagli shader)
export const Mat = {
  floor: 1, carpet: 2, wall: 3, coffer: 4, ceiling: 5, wainscot: 6, stone: 7, darkStone: 8, step1: 9, step2: 10, step3: 11, frame: 12, pedestal: 13, banner: 14,
  gold: 20, silver: 21, bronze: 22, cupGold: 23, cupSilver: 24, cupBronze: 25,
  // il cantiere (podio coperto): telo, legno, tubi d'acciaio, secchi di vernice, cartone, coni, nastro bianco e rosso,
  // metallo verniciato, nastro di carta, gomma
  cloth: 15, wood: 16, steel: 17, bucket: 18, cardboard: 19, cone: 26, tape: 27, paint: 28, masking: 29, rubber: 30,
};
// le coppe hanno codici propri (stesso metallo del posto): girano sul piedistallo e si sollevano al passaggio del puntatore

export const ROOM = { x: 9, y: 12, back: -7, front: 18 };
// finestrone: rettangolo con l'arco a tutto sesto (centro a quota ya, raggio = mezza larghezza), strombo profondo depth
export const WINDOW = { r: 3.7, y0: 1.7, ya: 7.6, bar: 0.085, frame: 0.2, cols: [-1.85, 0, 1.85], rows: [4.65], ring: 0.56, depth: 0.6 };
// piano su cui si tabula la luce dell'astro: appena oltre lo strombo (tutto ciò che fa ombra sta davanti)
export const LIGHT_PLANE = ROOM.back - WINDOW.depth - 0.15;
export const LIGHT_RECT = { x0: -5.2, x1: 5.2, y0: 0.6, y1: 12.6 };

export const DAIS = 0.36;
export const STEP_H = [1.55, 1.05, 0.72];
export const STEP_X = [0, -2.35, 2.35];
export const STEP_D = 0.92;
export const STEP_TOP = STEP_H.map((h) => DAIS + h);
export const TROPHY_K = [1.15, 1.0, 0.92];
export const TROPHY_TOP = STEP_X.map((_, i) => STEP_TOP[i] + 0.91 * TROPHY_K[i]);
export const COL_X = 6.0, COL_Z = [-4.9, -1.9, 1.1, 4.1, 7.1], COL_TOP = 10.6;
export const CARPET = { hw: 1.25, z0: 2.05 };
export const BANNERS = [{ x0: -7.6, x1: -5.4, y0: 3.4, y1: 10.2 }, { x0: 5.4, x1: 7.6, y0: 3.4, y1: 10.2 }];

// forme semplificate per l'illuminazione globale (la luce che rimbalza è a bassa frequenza: bastano scatole e cilindri)
export type ProxyBox = { c: number[]; h: number[]; m: number };
export const PROXY_BOXES: ProxyBox[] = [
  { c: [0, 0.09, 0.1], h: [4.55, 0.09, 1.95], m: Mat.darkStone },
  { c: [0, 0.27, 0.05], h: [4.1, 0.09, 1.7], m: Mat.stone },
  ...STEP_X.map((x, i) => ({ c: [x, DAIS + STEP_H[i] / 2, 0], h: [1.1, STEP_H[i] / 2, STEP_D], m: Mat.step1 + i })),
  ...[-1, 1].map((s) => ({ c: [s * COL_X, COL_TOP + 0.45, 1.1], h: [0.6, 0.45, 6.7], m: Mat.stone })),
];
export const PROXY_CYLS = [-1, 1].flatMap((s) => COL_Z.map((z) => ({ c: [s * COL_X, COL_TOP / 2, z], r: 0.45, h: COL_TOP / 2 })));
export const PROXY_SPHS = STEP_X.map((x, i) => ({ c: [x, STEP_TOP[i] + 0.7 * TROPHY_K[i], -0.15], r: 0.3 * TROPHY_K[i], m: Mat.gold + i }));

// ---------- camera ----------
// Ferma (i fasci si accumulano nel tempo senza scie). Il centro ottico sta nel mezzo dell'area dei contenuti.
export type Cam = { pos: number[]; right: number[]; up: number[]; fwd: number[]; tan: number; cx: number; cy: number; h: number; w: number };
// movimento della camera: spostamento (m) e rotazione attorno al podio (rad); la deriva lenta, il mouse e il trascinamento
export type CamMotion = { x: number; y: number; z: number; yaw: number };
export const STILL: CamMotion = { x: 0, y: 0, z: 0, yaw: 0 };
export const TROPHY_Z = -0.15;
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// w, h: viewport in pixel; left: larghezza coperta a sinistra (barra laterale); top: altezza occupata in alto
export function camera(w: number, h: number, left = 0, top = 0, m: CamMotion = STILL): Cam {
  const cw = Math.max(1, w - left), ch = Math.max(1, h - top), aspect = cw / ch;
  const tan = Math.tan((22 * Math.PI) / 180);
  // schermi stretti (telefoni): la camera arretra quanto basta perché i tre gradini entrino in larghezza, non di più
  const fitZ = 3.95 / (tan * aspect);
  const narrow = Math.max(0, 1 - aspect);
  const p0 = [0, 2.75 + narrow * 0.6, Math.max(10.2, fitZ)];
  const t0 = [0, 2.6 + narrow * 1.2, ROOM.back];
  // la camera gira attorno al centro del podio e si sposta; il punto guardato segue a metà (parallasse)
  const cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
  const rot = (p: number[]) => [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy];
  const pr = rot(p0), tr = rot(t0);
  const pos = [pr[0] + m.x, pr[1] + m.y, pr[2] + m.z];
  const target = [tr[0] + m.x * 0.5, tr[1] + m.y * 0.5, tr[2]];
  const fwd = norm([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
  const right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
  return { pos, right, up, fwd, tan: tan * (h / ch), cx: left + cw / 2, cy: top + ch / 2, h, w };
}
export function project(c: Cam, p: number[]) {
  const d = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]];
  const z = d[0] * c.fwd[0] + d[1] * c.fwd[1] + d[2] * c.fwd[2];
  if (z <= 0.01) return null;
  const k = c.h / 2 / (z * c.tan);
  return { x: c.cx + (d[0] * c.right[0] + d[1] * c.right[1] + d[2] * c.right[2]) * k, y: c.cy - (d[0] * c.up[0] + d[1] * c.up[1] + d[2] * c.up[2]) * k, scale: k };
}
// matrice di proiezione (per colonne, mondo → clip) della camera, con il centro ottico decentrato
export function viewProj(c: Cam, near = 0.1, far = 90) {
  const k = c.h / 2 / c.tan, sx = (2 * k) / c.w, sy = (2 * k) / c.h, ox = (2 * c.cx) / c.w - 1, oy = 1 - (2 * c.cy) / c.h;
  const A = far / (far - near), Bz = (-far * near) / (far - near);
  const R = c.right, U = c.up, F = c.fwd, P = c.pos;
  const row = (v: number[], s: number) => [v[0] * s, v[1] * s, v[2] * s, -(v[0] * P[0] + v[1] * P[1] + v[2] * P[2]) * s];
  const rx = row(R, sx), ry = row(U, sy), rw = row(F, 1);
  const r0 = rx.map((x, i) => x + rw[i] * ox), r1 = ry.map((y, i) => y + rw[i] * oy), r2 = rw.map((x, i) => x * A + (i === 3 ? Bz : 0)), r3 = rw;
  const m = new Float32Array(16);
  for (let col = 0; col < 4; col++) { m[col * 4] = r0[col]; m[col * 4 + 1] = r1[col]; m[col * 4 + 2] = r2[col]; m[col * 4 + 3] = r3[col]; }
  return m;
}

// spostamento sub-pixel dell'antialiasing temporale: sequenza di Halton (2, 3), otto posizioni nel pixel, con la media
// esattamente al centro (l'immagine accumulata non si sposta)
export const JITTER: [number, number][] = (() => {
  const h = (n: number, b: number) => { let f = 1, r = 0; for (let k = n; k > 0; k = Math.floor(k / b)) { f /= b; r += f * (k % b); } return r; };
  const raw = Array.from({ length: 8 }, (_, i) => [h(i + 1, 2), h(i + 1, 3)]);
  const mx = raw.reduce((s, p) => s + p[0], 0) / 8, my = raw.reduce((s, p) => s + p[1], 0) / 8;
  return raw.map(([x, y]) => [x - mx, y - my] as [number, number]);
})();
// la stessa matrice con l'immagine spostata di (jx, jy) pixel (y verso il basso) su un bersaglio w × h
export function jittered(vp: Float32Array, jx: number, jy: number, w: number, h: number) {
  const m = new Float32Array(vp), dx = (2 * jx) / w, dy = (-2 * jy) / h;
  for (let col = 0; col < 4; col++) { m[col * 4] += m[col * 4 + 3] * dx; m[col * 4 + 1] += m[col * 4 + 3] * dy; }
  return m;
}
// inversa di una matrice 4×4 per colonne (dalla profondità di un pixel alla posizione nel mondo)
export function invert4(m: ArrayLike<number>) {
  const a = Array.from(m), o = new Float32Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const k = Math.abs(det) > 1e-20 ? 1 / det : 0;
  o.set([
    a11 * b11 - a12 * b10 + a13 * b09, a02 * b10 - a01 * b11 - a03 * b09, a31 * b05 - a32 * b04 + a33 * b03, a22 * b04 - a21 * b05 - a23 * b03,
    a12 * b08 - a10 * b11 - a13 * b07, a00 * b11 - a02 * b08 + a03 * b07, a32 * b02 - a30 * b05 - a33 * b01, a20 * b05 - a22 * b02 + a23 * b01,
    a10 * b10 - a11 * b08 + a13 * b06, a01 * b08 - a00 * b10 - a03 * b06, a30 * b04 - a31 * b02 + a33 * b00, a21 * b02 - a20 * b04 - a23 * b00,
    a11 * b07 - a10 * b09 - a12 * b06, a00 * b09 - a01 * b07 + a02 * b06, a31 * b01 - a30 * b03 - a32 * b00, a20 * b03 - a21 * b01 + a22 * b00,
  ].map((x) => x * k));
  return o;
}

// ---------- il sole (giorno) e la luna (notte) ----------
// si muovono di continuo dietro il finestrone; la direzione è quella verso l'astro (z negativa: oltre la parete)
export function celestial(t: number, night: boolean) {
  const ph = night ? 1.7 : 0;
  const az = -0.02 + 0.05 * Math.sin(t * 0.05 + ph) + 0.012 * Math.sin(t * 0.13 + ph * 2);
  const el = 0.4 + 0.025 * Math.sin(t * 0.04 + ph) + 0.005 * Math.sin(t * 0.17);
  const l = Math.hypot(az, el, 1);
  return [az / l, el / l, -1 / l];
}
// matrice della luce: punto del mondo → posizione sul piano del vetro (clip x, y) e distanza percorsa dalla luce (z)
export const LIGHT_DEPTH = 64;
export function lightMatrix(L: number[]) {
  const ax = L[0] / L[2], ay = L[1] / L[2], zq = LIGHT_PLANE, r = LIGHT_RECT;
  const hx = (r.x1 - r.x0) / 2, hy = (r.y1 - r.y0) / 2, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  const rows = [[1 / hx, 0, -ax / hx, (ax * zq - cx) / hx], [0, 1 / hy, -ay / hy, (ay * zq - cy) / hy], [0, 0, -1 / L[2] / LIGHT_DEPTH, zq / L[2] / LIGHT_DEPTH], [0, 0, 0, 1]];
  const m = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) m[col * 4 + row] = rows[row][col];
  return m;
}

// ---------- le due atmosfere (colori lineari; il passaggio è graduale) ----------
export type Mood = {
  sun: number[]; sunI: number; skyTop: number[]; skyHor: number[]; wall: number[]; wainscot: number[]; ceiling: number[]; tileA: number[]; tileB: number[];
  stone: number[]; darkStone: number[]; carpet: number[]; banner: number[]; frame: number[]; fog: number; dust: number; cover: number; exposure: number; ambient: number;
};
export const DAY: Mood = {
  sun: [1.0, 0.86, 0.66], sunI: 9.0, skyTop: [0.16, 0.34, 0.82], skyHor: [0.48, 0.62, 0.86], wall: [0.68, 0.64, 0.56], wainscot: [0.36, 0.45, 0.42], ceiling: [0.74, 0.7, 0.62],
  tileA: [0.86, 0.84, 0.79], tileB: [0.28, 0.38, 0.36], stone: [0.9, 0.88, 0.84], darkStone: [0.1, 0.18, 0.17], carpet: [0.012, 0.15, 0.13], banner: [0.02, 0.25, 0.21],
  frame: [0.1, 0.11, 0.11], fog: 0.002, dust: 0.9, cover: 0.42, exposure: 1.55, ambient: 0.008,
};
export const NIGHT: Mood = {
  sun: [0.6, 0.76, 1.0], sunI: 4.0, skyTop: [0.002, 0.005, 0.016], skyHor: [0.01, 0.025, 0.045], wall: [0.09, 0.14, 0.14], wainscot: [0.04, 0.08, 0.08], ceiling: [0.09, 0.13, 0.13],
  tileA: [0.12, 0.16, 0.16], tileB: [0.03, 0.06, 0.06], stone: [0.2, 0.25, 0.24], darkStone: [0.02, 0.04, 0.04], carpet: [0.006, 0.07, 0.065], banner: [0.012, 0.11, 0.1],
  frame: [0.02, 0.03, 0.03], fog: 0.0065, dust: 1.0, cover: 0.6, exposure: 1.9, ambient: 0.004,
};
const mix = (a: number[], b: number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);
export const moodAt = (k: number): Mood => {
  const o: any = {};
  (Object.keys(DAY) as (keyof Mood)[]).forEach((key) => { const a = DAY[key], b = NIGHT[key]; o[key] = Array.isArray(a) ? mix(a, b as number[], k) : (a as number) + ((b as number) - (a as number)) * k; });
  return o;
};
