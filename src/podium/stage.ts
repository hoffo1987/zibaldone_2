// Il podio del mese in 3D: la sala, il podio, il finestrone e il percorso del sole e della luna. I numeri qui sono gli
// stessi degli shader (che li ricevono come costanti) e servono anche a proiettare sui gradini le etichette HTML.
// Unità: metri; y in alto, la camera guarda verso -z.

export type Box = { c: [number, number, number]; h: [number, number, number] };
// gradini: primo (al centro, il più alto), secondo (a sinistra), terzo (a destra); sotto, un basamento largo e basso
export const STEPS: Box[] = [
  { c: [0, 0.92, 0], h: [1.12, 0.8, 0.95] },
  { c: [-2.3, 0.67, 0.05], h: [1.12, 0.55, 0.9] },
  { c: [2.3, 0.5, 0.05], h: [1.12, 0.38, 0.9] },
];
export const PLINTH: Box = { c: [0, 0.06, 0.05], h: [3.75, 0.06, 1.35] };
// la sala: pavimento y = 0, soffitto y = 8, pareti x = ±8, parete di fondo z = -5 con il finestrone
export const ROOM = { x: 8, y: 10.5, back: -5, front: 16 };
export const WINDOW = { x0: -4.2, x1: 4.2, y0: 1.3, y1: 9.8, bar: 0.1, frame: 0.22, cols: [-2.1, 0, 2.1], rows: [4.15, 7.0] };

// camera: sopra i gradini (si vedono le cime di metallo) e rivolta appena in alto, così nel finestrone si vede l'astro
export const CAMERA = { pos: [0, 2.75, 8.8] as [number, number, number], target: [0, 2.85, -5] as [number, number, number], fov: 44 };

export type Cam = { pos: number[]; right: number[]; up: number[]; fwd: number[]; tan: number; aspect: number };
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// px, py: piccolo spostamento della camera che segue il puntatore (parallasse), in -1..1
export function camera(aspect: number, px = 0, py = 0): Cam {
  const pos = [CAMERA.pos[0] + px * 0.7, CAMERA.pos[1] + py * 0.35, CAMERA.pos[2]];
  // su schermi stretti la camera arretra per tenere dentro tutto il podio
  if (aspect < 1.45) pos[2] += (1.45 - aspect) * 7;
  const fwd = norm([CAMERA.target[0] - pos[0], CAMERA.target[1] - pos[1], CAMERA.target[2] - pos[2]]);
  const right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
  return { pos, right, up, fwd, tan: Math.tan(((CAMERA.fov / 2) * Math.PI) / 180), aspect };
}
// punto del mondo → pixel CSS nel riquadro w × h (null se dietro la camera)
export function project(c: Cam, p: number[], w: number, h: number) {
  const d = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]];
  const z = d[0] * c.fwd[0] + d[1] * c.fwd[1] + d[2] * c.fwd[2];
  if (z <= 0.01) return null;
  const x = (d[0] * c.right[0] + d[1] * c.right[1] + d[2] * c.right[2]) / (z * c.tan * c.aspect);
  const y = (d[0] * c.up[0] + d[1] * c.up[1] + d[2] * c.up[2]) / (z * c.tan);
  return { x: (x * 0.5 + 0.5) * w, y: (0.5 - y * 0.5) * h, scale: h / (2 * z * c.tan) };
}

// Il sole (giorno) e la luna (notte) si muovono di continuo dietro al finestrone, dall'alto verso la sala: la direzione è
// quella verso l'astro (z negativa: sta dietro la parete di fondo).
export function celestial(t: number, night: boolean) {
  const ph = night ? 1.7 : 0;
  const az = -0.16 + 0.13 * Math.sin(t * 0.041 + ph) + 0.03 * Math.sin(t * 0.13 + ph * 2);
  const el = 0.34 + 0.04 * Math.sin(t * 0.033 + ph) + 0.01 * Math.sin(t * 0.21);
  const l = Math.hypot(az, el, 1);
  return [az / l, el / l, -1 / l];
}

// Le due atmosfere. Colori lineari; il passaggio dall'una all'altra è graduale.
export type Mood = { sun: number[]; sunI: number; skyTop: number[]; skyHor: number[]; wall: number[]; floor: number[]; stone: number[]; plinth: number[]; frame: number[]; fog: number; dust: number; cover: number; exposure: number; ambient: number };
export const DAY: Mood = {
  sun: [1.0, 0.86, 0.66], sunI: 7.5, skyTop: [0.42, 0.66, 1.0], skyHor: [1.0, 0.93, 0.82], wall: [0.74, 0.76, 0.73], floor: [0.5, 0.52, 0.5],
  stone: [0.86, 0.87, 0.85], plinth: [0.55, 0.58, 0.56], frame: [0.18, 0.2, 0.2], fog: 0.011, dust: 0.85, cover: 0.8, exposure: 0.98, ambient: 0.015,
};
export const NIGHT: Mood = {
  sun: [0.62, 0.78, 1.0], sunI: 3.4, skyTop: [0.002, 0.005, 0.016], skyHor: [0.01, 0.025, 0.045], wall: [0.06, 0.11, 0.11], floor: [0.03, 0.06, 0.06],
  stone: [0.07, 0.14, 0.13], plinth: [0.04, 0.08, 0.08], frame: [0.02, 0.03, 0.03], fog: 0.0105, dust: 1.0, cover: 0.75, exposure: 1.45, ambient: 0.005,
};
const mix = (a: number[], b: number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);
export const moodAt = (k: number): Mood => {
  const o: any = {};
  (Object.keys(DAY) as (keyof Mood)[]).forEach((key) => { const a = DAY[key], b = NIGHT[key]; o[key] = Array.isArray(a) ? mix(a, b as number[], k) : (a as number) + ((b as number) - (a as number)) * k; });
  return o;
};
