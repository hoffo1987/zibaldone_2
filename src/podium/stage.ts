// La sala del podio: architettura, podio, coppe, finestrone ad arco, percorso del sole e della luna, camera.
// Gli stessi numeri finiscono negli shader (come costanti WGSL) e servono a proiettare sulla scena le etichette HTML.
// Unità: metri; y in alto, la camera guarda verso -z.

export type Box = { c: [number, number, number]; h: [number, number, number]; m: number };
export type Cyl = { c: [number, number, number]; r: number; h: number; m: number }; // asse verticale, c = centro, h = mezza altezza
export type Sph = { c: [number, number, number]; r: number; cut: number; m: number }; // cut: quota (dal centro) sopra cui il calice è aperto

// materiali (codici condivisi con gli shader)
export const M = { floor: 1, wall: 2, ceiling: 4, sky: 6, frame: 7, stone: 30, dark: 31, colBase: 32, column: 33, gold: 40, silver: 41, bronze: 42, pedestal: 43 };
const METAL = [M.gold, M.silver, M.bronze];

export const ROOM = { x: 9, y: 12, back: -7, front: 18 };
// finestrone: rettangolo con l'arco a tutto sesto in cima (centro a quota ya, raggio = mezza larghezza)
export const WINDOW = { r: 3.7, y0: 1.7, ya: 7.6, bar: 0.085, frame: 0.2, cols: [-1.85, 0, 1.85], rows: [4.65], ring: 0.56 };

// podio: pedana a due gradini, poi i tre blocchi (primo al centro, secondo a sinistra, terzo a destra), ciascuno con base
// scura, corpo di marmo e cimasa di metallo; sopra, le coppe
const DAIS = 0.36;
export const STEP_H = [1.55, 1.05, 0.72];
export const STEP_X = [0, -2.35, 2.35];
export const STEP_D = 0.92;
const BW = 1.08;
export const BOXES: Box[] = [
  { c: [0, 0.09, 0.1], h: [4.55, 0.09, 1.95], m: M.dark },
  { c: [0, 0.27, 0.05], h: [4.1, 0.09, 1.7], m: M.stone },
];
STEP_X.forEach((x, i) => {
  const h = STEP_H[i], top = DAIS + h;
  BOXES.push({ c: [x, DAIS + 0.06, 0], h: [BW + 0.05, 0.06, STEP_D + 0.05], m: M.dark });
  BOXES.push({ c: [x, DAIS + 0.12 + (h - 0.2) / 2, 0], h: [BW, (h - 0.2) / 2, STEP_D], m: M.stone });
  BOXES.push({ c: [x, top - 0.04, 0], h: [BW + 0.045, 0.04, STEP_D + 0.045], m: METAL[i] });
});
// coppe: piedistallo, stelo, calice aperto (più grandi per i primi posti)
export const TROPHY_K = [1.15, 1.0, 0.92];
export const CYLS: Cyl[] = [];
export const SPHS: Sph[] = [];
STEP_X.forEach((x, i) => {
  const k = TROPHY_K[i], top = DAIS + STEP_H[i], z = -0.15;
  BOXES.push({ c: [x, top + 0.07 * k, z], h: [0.24 * k, 0.07 * k, 0.24 * k], m: M.pedestal });
  CYLS.push({ c: [x, top + 0.14 * k + 0.2 * k, z], r: 0.055 * k, h: 0.2 * k, m: METAL[i] });
  SPHS.push({ c: [x, top + 0.14 * k + 0.4 * k + 0.3 * k, z], r: 0.34 * k, cut: 0.12 * k, m: METAL[i] });
});
export const STEP_TOP = STEP_H.map((h) => DAIS + h);
export const TROPHY_TOP = SPHS.map((s) => s.c[1] + s.cut);
export const PODIUM_PRIMS = { boxes: BOXES.length, cyls: CYLS.length };
// colonnato: colonne scanalate su entrambi i lati, con base e capitello
export const COL_Z = [-4.9, -1.9, 1.1, 4.1, 7.1];
export const COL_X = 6.0, COL_R = 0.42;
for (const sx of [-1, 1]) for (const z of COL_Z) {
  BOXES.push({ c: [sx * COL_X, 0.25, z], h: [0.62, 0.25, 0.62], m: M.colBase });
  BOXES.push({ c: [sx * COL_X, ROOM.y - 0.45, z], h: [0.6, 0.45, 0.6], m: M.colBase });
  CYLS.push({ c: [sx * COL_X, (ROOM.y - 0.9 + 0.5) / 2, z], r: COL_R, h: (ROOM.y - 0.9 - 0.5) / 2, m: M.column });
}
// tappeto verso il podio e stendardi sulla parete di fondo
export const CARPET = { hw: 1.25, z0: 2.05 };
export const BANNERS = [{ x0: -7.4, x1: -5.3, y0: 3.4, y1: 10.8 }, { x0: 5.3, x1: 7.4, y0: 3.4, y1: 10.8 }];

// ---------- camera ----------
// Ferma (i fasci di luce si accumulano nel tempo senza scie): il movimento è tutto nella luce. Il centro ottico sta nel
// mezzo dell'area dei contenuti (decentramento: la barra laterale e il titolo non spostano il podio fuori centro).
export type Cam = { pos: number[]; right: number[]; up: number[]; fwd: number[]; tan: number; cx: number; cy: number; h: number };
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// w, h: viewport; left: larghezza coperta a sinistra (barra laterale); top: altezza occupata in alto (titolo e mese)
export function camera(w: number, h: number, left = 0, top = 0): Cam {
  const cw = Math.max(1, w - left), ch = Math.max(1, h - top), aspect = cw / ch;
  const tan = Math.tan((22 * Math.PI) / 180);
  // la parte utile è larga circa 11 m al podio: su schermi stretti la camera arretra e sale un poco
  const narrow = Math.max(0, 1.5 - aspect);
  const pos = [0, 2.9 + narrow * 0.9, 13.0 + narrow * 10];
  const target = [0, 3.0 + narrow * 0.4, ROOM.back];
  const fwd = norm([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
  const right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
  // campo visivo riferito all'area utile; centro ottico nel suo mezzo
  return { pos, right, up, fwd, tan: tan * (h / ch), cx: left + cw / 2, cy: top + ch / 2, h };
}
export function project(c: Cam, p: number[]) {
  const d = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]];
  const z = d[0] * c.fwd[0] + d[1] * c.fwd[1] + d[2] * c.fwd[2];
  if (z <= 0.01) return null;
  const k = c.h / 2 / (z * c.tan);
  return { x: c.cx + (d[0] * c.right[0] + d[1] * c.right[1] + d[2] * c.right[2]) * k, y: c.cy - (d[0] * c.up[0] + d[1] * c.up[1] + d[2] * c.up[2]) * k, scale: k };
}

// ---------- il sole (giorno) e la luna (notte) ----------
// si muovono di continuo dietro il finestrone; la direzione è quella verso l'astro (z negativa: oltre la parete)
export function celestial(t: number, night: boolean) {
  const ph = night ? 1.7 : 0;
  const az = -0.04 + 0.07 * Math.sin(t * 0.037 + ph) + 0.018 * Math.sin(t * 0.11 + ph * 2);
  const el = 0.32 + 0.03 * Math.sin(t * 0.029 + ph) + 0.007 * Math.sin(t * 0.17);
  const l = Math.hypot(az, el, 1);
  return [az / l, el / l, -1 / l];
}

// ---------- le due atmosfere (colori lineari; il passaggio è graduale) ----------
export type Mood = {
  sun: number[]; sunI: number; skyTop: number[]; skyHor: number[]; wall: number[]; wainscot: number[]; tileA: number[]; tileB: number[]; stone: number[]; dark: number[];
  column: number[]; carpet: number[]; banner: number[]; frame: number[]; fog: number; dust: number; cover: number; exposure: number; ambient: number;
};
export const DAY: Mood = {
  sun: [1.0, 0.87, 0.68], sunI: 9.0, skyTop: [0.3, 0.52, 0.95], skyHor: [0.66, 0.77, 0.92], wall: [0.8, 0.79, 0.74], wainscot: [0.5, 0.57, 0.55],
  tileA: [0.86, 0.85, 0.81], tileB: [0.56, 0.63, 0.61], stone: [0.9, 0.9, 0.88], dark: [0.14, 0.22, 0.21], column: [0.86, 0.85, 0.81],
  carpet: [0.03, 0.3, 0.26], banner: [0.02, 0.28, 0.24], frame: [0.12, 0.13, 0.13], fog: 0.006, dust: 0.9, cover: 0.62, exposure: 1.05, ambient: 0.012,
};
export const NIGHT: Mood = {
  sun: [0.6, 0.76, 1.0], sunI: 4.0, skyTop: [0.002, 0.005, 0.016], skyHor: [0.01, 0.025, 0.045], wall: [0.075, 0.12, 0.12], wainscot: [0.04, 0.075, 0.075],
  tileA: [0.08, 0.12, 0.12], tileB: [0.025, 0.05, 0.05], stone: [0.17, 0.23, 0.22], dark: [0.02, 0.04, 0.04], column: [0.1, 0.15, 0.15],
  carpet: [0.01, 0.12, 0.11], banner: [0.012, 0.11, 0.1], frame: [0.02, 0.03, 0.03], fog: 0.009, dust: 1.0, cover: 0.62, exposure: 1.9, ambient: 0.005,
};
const mix = (a: number[], b: number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);
export const moodAt = (k: number): Mood => {
  const o: any = {};
  (Object.keys(DAY) as (keyof Mood)[]).forEach((key) => { const a = DAY[key], b = NIGHT[key]; o[key] = Array.isArray(a) ? mix(a, b as number[], k) : (a as number) + ((b as number) - (a as number)) * k; });
  return o;
};
