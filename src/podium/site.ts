// Il cantiere attorno al podio coperto: la sala si sta preparando per la presentazione del mese. Tutto è geometria vera
// (getta ombra nei fasci del finestrone, si riflette nel pavimento e nelle superfici lucide) con i materiali del
// cantiere (stage.ts, Mat): ponteggio di tubi e tavole, scala lunga appoggiata al muro e scala a libretto, cavalletti
// con l'asse e la cassetta degli attrezzi, secchi e barattoli di vernice, scatoloni, coni con il nastro bianco e rosso, il
// faro da cantiere col cavo, il tappeto arrotolato, il nastro di carta sui vetri, un telo da pittore sotto il ponteggio e,
// appoggiati sul telo del podio, metro, nastro, straccio, barattolo e un caffè. Lo stendardo arrotolato è in meshes.ts.
// Unità e assi come la sala: metri, y in alto, la camera guarda verso -z.
import type { MeshBuilder } from "./meshes";
import type { Drape } from "./cloth";
import { ROOM, WINDOW, CARPET, Mat } from "./stage";

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const TAU = Math.PI * 2;

// colori delle vernici (indice nella tavolozza dello shader, materiali paint e bucket)
export const PAINT = { white: 0, terracotta: 1, teal: 2, ochre: 3, red: 4, yellow: 5, blue: 6, black: 7 };
// il tappeto arrotolato davanti al podio: asse a quota r, a z dal fondo della sala
export const ROLL = { z: CARPET.z0 + 2.3, r: 0.17 };

// ---------- i teli: quello sul podio e quello da pittore a terra ----------
// due facce (sopra e sotto, a mezzo spessore dal piano simulato) e l'orlo che le chiude; normali dalla griglia,
// occlusione d'ambiente dalla curvatura (il fondo delle pieghe è in ombra) e lungo l'orlo ripiegato; uv in metri di stoffa
const CLOTH_HALF = 0.004, HEM = 0.045;
// stride: di quanti punti della griglia si guarda attorno per la curvatura (la griglia raffinata guarda più lontano: le
// pieghe restano scure come quelle della simulazione)
export function clothMesh(B: MeshBuilder, d: Drape, m: number, stride = 1) {
  const { nx, nz, pos } = d, at = (i: number, j: number): V3 => {
    const k = (Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))) * 3;
    return [pos[k], pos[k + 1], pos[k + 2]];
  };
  const nrm: V3[] = [], ao: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const n = norm(cross(sub(at(i, j + 1), at(i, j - 1)), sub(at(i + 1, j), at(i - 1, j))));
    nrm.push(n);
    // concavità: la media dei vicini sopra il punto (lungo la normale) vuol dire fondo di una piega
    const S = stride, p = at(i, j), c = [0, 1, 2].map((k) => (at(i + S, j)[k] + at(i - S, j)[k] + at(i, j + S)[k] + at(i, j - S)[k]) / 4 - p[k]);
    const cav = (c[0] * n[0] + c[1] * n[1] + c[2] * n[2]) / (d.spacing * S);
    const edge = Math.min(i, j, nx - 1 - i, nz - 1 - j) * d.spacing;
    ao.push(Math.max(0.35, Math.min(1, 1 - cav * 1.6)) * (edge < HEM ? 0.86 : 1));
  }
  for (const side of [1, -1]) {
    const base = B.count;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = at(i, j), n = nrm[j * nx + i], o = side * CLOTH_HALF;
      B.vert([p[0] + n[0] * o, Math.max(0.002, p[1] + n[1] * o), p[2] + n[2] * o], side > 0 ? n : [-n[0], -n[1], -n[2]], i * d.spacing, j * d.spacing, m, side > 0 ? ao[j * nx + i] : 0.6);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = base + j * nx + i; B.quad(a, a + 1, a + nx + 1, a + nx); }
  }
  // orlo: lungo il bordo della griglia, dalla faccia di sopra a quella di sotto
  const ring: [number, number][] = [];
  for (let i = 0; i < nx - 1; i++) ring.push([i, 0]);
  for (let j = 0; j < nz - 1; j++) ring.push([nx - 1, j]);
  for (let i = nx - 1; i > 0; i--) ring.push([i, nz - 1]);
  for (let j = nz - 1; j > 0; j--) ring.push([0, j]);
  ring.push(ring[0]);
  const e = (p: V3, n: V3, s: number): V3 => [p[0] + n[0] * s, Math.max(0.002, p[1] + n[1] * s), p[2] + n[2] * s];
  for (let k = 0; k < ring.length - 1; k++) {
    const [i0, j0] = ring[k], [i1, j1] = ring[k + 1], p0 = at(i0, j0), p1 = at(i1, j1), n0 = nrm[j0 * nx + i0], n1 = nrm[j1 * nx + i1];
    // verso l'esterno: la direzione del bordo girata nel piano del telo
    const out = norm(cross(sub(p1, p0), n0)), u0 = (i0 + j0) * d.spacing, u1 = (i1 + j1) * d.spacing;
    const a = B.vert(e(p0, n0, CLOTH_HALF), out, u0, 0, m, 0.8), b = B.vert(e(p1, n1, CLOTH_HALF), out, u1, 0, m, 0.8);
    const c = B.vert(e(p1, n1, -CLOTH_HALF), out, u1, 0.01, m, 0.7), dd = B.vert(e(p0, n0, -CLOTH_HALF), out, u0, 0.01, m, 0.7);
    B.quad(a, b, c, dd);
  }
}

// rotazione per righe: imbardata attorno a y, poi beccheggio attorno a x, poi rollio attorno a z
type M3 = number[];
const rot = (yaw = 0, pitch = 0, roll = 0): M3 => {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const Y = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], X = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Z = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  const mul = (a: M3, b: M3) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
  return mul(mul(Y, X), Z);
};
// i vertici aggiunti da fn, girati da R e spostati in t
const placed = (B: MeshBuilder, R: M3, t: V3, fn: () => void) => { const start = B.count; fn(); B.transform(start, R, t); };
// vernici e secchi: l'indice del colore nella parte intera di v (la parte frazionaria resta la coordinata)
const tagged = (B: MeshBuilder, paint: number, fn: () => void) => {
  const start = B.count; fn(); B.mapUV(start, (_, [u, v]) => [u, paint + Math.min(Math.max(v, 0), 0.999)]);
};

// trave a sezione rettangolare da a a b: w di traverso (nel piano verticale che la contiene), d di spessore. Per il legno
// le uv seguono la venatura: u lungo la trave, v di traverso (in metri, con uno scarto diverso per ogni tavola)
function beam(B: MeshBuilder, a: V3, b: V3, w: number, d: number, m: number, r = 0.005) {
  const dir = sub(b, a), len = Math.hypot(...dir), X = norm(dir);
  const ref: V3 = Math.abs(X[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], k = X[0] * ref[0] + X[1] * ref[1] + X[2] * ref[2];
  const Y = norm([ref[0] - X[0] * k, ref[1] - X[1] * k, ref[2] - X[2] * k]), Z = cross(X, Y);
  const start = B.count;
  B.box([0, 0, 0], [len / 2, w / 2, d / 2], Math.min(r, w * 0.4, d * 0.4), m, 1);
  if (m === Mat.wood) B.mapUV(start, (p) => [p[0] + len / 2 + a[0] * 0.37, p[1] + p[2] + a[2] * 0.53]);
  B.transform(start, [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]], lerp(a, b, 0.5));
}
const rod = (B: MeshBuilder, a: V3, b: V3, r: number, m: number, nr = 10) => B.tube((t) => lerp(a, b, t), r, m, 1, nr);
// disco piatto con la normale data (tappi di tubi e rotoli)
function disc(B: MeshBuilder, c: V3, n: V3, radius: number, m: number, seg = 32) {
  const t1 = norm(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])), t2 = cross(n, t1);
  const mid = B.vert(c, n, 0.5, 0.5, m);
  const ring: number[] = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    ring.push(B.vert([c[0] + (t1[0] * ca + t2[0] * sa) * radius, c[1] + (t1[1] * ca + t2[1] * sa) * radius, c[2] + (t1[2] * ca + t2[2] * sa) * radius], n, 0.5 + ca * 0.5, 0.5 + sa * 0.5, m));
  }
  for (let k = 0; k < seg; k++) B.tri(mid, ring[k], ring[(k + 1) % seg]);
}

// ---------- gli oggetti, ognuno nel suo sistema (origine a terra, al centro) ----------
function scaffold(B: MeshBuilder, nr: number) {
  // trabattello a due piani: montanti, correnti, traversi, diagonali, piedini, impalcati di tavole (con le fessure: i
  // fasci di luce passano a strisce), fermapiede e parapetto
  const x0 = -1, x1 = 1, z0 = -0.6, z1 = 0.6, R = 0.0242, top = 5.2, decks = [2.0, 4.0];
  for (const x of [x0, x1]) for (const z of [z0, z1]) {
    rod(B, [x, 0.06, z], [x, top, z], R, Mat.steel, nr);
    B.box([x, 0.006, z], [0.075, 0.006, 0.075], 0.002, Mat.steel, 1);
    rod(B, [x, 0.012, z], [x, 0.08, z], 0.016, Mat.steel, 8);
  }
  for (const y of [0.2, ...decks, decks[1] + 0.5, decks[1] + 1.0, decks[0] + 0.55]) {
    for (const z of [z0, z1]) rod(B, [x0 - 0.05, y, z], [x1 + 0.05, y, z], R, Mat.steel, nr);
    if (y !== decks[0] + 0.55) for (const x of [x0, x1]) rod(B, [x, y + 0.05, z0 - 0.05], [x, y + 0.05, z1 + 0.05], R, Mat.steel, nr);
  }
  // diagonali sul fronte e sui fianchi, alternate di piano in piano
  rod(B, [x0, 0.2, z1], [x1, decks[0], z1], R * 0.9, Mat.steel, nr); rod(B, [x1, decks[0], z1], [x0, decks[1], z1], R * 0.9, Mat.steel, nr);
  rod(B, [x1, 0.2, z0], [x0, decks[0], z0], R * 0.9, Mat.steel, nr); rod(B, [x0, decks[0], z0], [x1, decks[1], z0], R * 0.9, Mat.steel, nr);
  for (const x of [x0, x1]) rod(B, [x, 0.25, z0], [x, decks[0] - 0.1, z1], R * 0.9, Mat.steel, nr);
  // giunti ai nodi
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0.2, ...decks, decks[1] + 1.0]) B.box([x, y + 0.025, z], [0.045, 0.06, 0.045], 0.01, Mat.steel, 1);
  decks.forEach((y, k) => {
    const n = 5, w = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const z = z0 + w * (i + 0.5) + (k ? 0.01 : -0.012) * Math.sin(i * 2.3), sag = 0.004 * Math.sin(i * 1.7 + k);
      beam(B, [x0 - 0.12 + 0.03 * Math.sin(i * 3.1), y + 0.1 + sag, z], [x1 + 0.12 + 0.02 * Math.cos(i * 2.2), y + 0.1 - sag, z], 0.04, w - 0.025, Mat.wood, 0.004);
    }
    // fermapiede sul piano alto
    if (k === 1) for (const z of [z0, z1]) beam(B, [x0, y + 0.2, z + (z < 0 ? 0.03 : -0.03)], [x1, y + 0.2, z + (z < 0 ? 0.03 : -0.03)], 0.15, 0.025, Mat.wood, 0.003);
  });
}

function stepladder(B: MeshBuilder) {
  // scala a libretto di legno, macchiata di vernice; fronte verso +z
  const top = 2.05;
  for (const s of [-1, 1]) {
    beam(B, [s * 0.25, 0, 0.44], [s * 0.19, top, 0.05], 0.032, 0.075, Mat.wood);
    beam(B, [s * 0.25, 0, -0.47], [s * 0.2, top - 0.04, -0.05], 0.032, 0.065, Mat.wood);
    // il braccio d'acciaio che tiene aperte le due metà
    rod(B, [s * 0.235, 0.95, 0.44 - 0.39 * (0.95 / top) - 0.02], [s * 0.24, 0.95, -0.47 + 0.42 * (0.95 / top) + 0.02], 0.006, Mat.steel, 6);
  }
  for (let k = 0; k < 6; k++) {
    const y = 0.3 + k * 0.29, z = 0.44 - 0.39 * (y / top), half = 0.25 - 0.06 * (y / top) - 0.01;
    beam(B, [-half, y, z - 0.01], [half, y, z - 0.01], 0.026, 0.1, Mat.wood);
  }
  for (const y of [0.5, 1.25]) { const z = -0.47 + 0.42 * (y / top); beam(B, [-0.23, y, z], [0.23, y, z], 0.06, 0.02, Mat.wood); }
  B.box([0, top + 0.02, 0], [0.24, 0.022, 0.12], 0.006, Mat.wood, 1);
  // il ripiano per il barattolo, aperto in avanti
  beam(B, [-0.2, 1.6, -0.27], [0.2, 1.6, -0.27], 0.022, 0.22, Mat.wood);
  paintCan(B, [0.04, 1.611, -0.27], PAINT.terracotta, true);
}

// scala a pioli lunga, appoggiata al muro: base a terra, cima contro la parete
function leaningLadder(B: MeshBuilder, base: V3, top: V3) {
  const side: V3 = [0.22, 0, 0], len = Math.hypot(top[0] - base[0], top[1] - base[1], top[2] - base[2]);
  for (const s of [-1, 1]) beam(B, [base[0] + s * side[0], base[1], base[2]], [top[0] + s * side[0], top[1], top[2]], 0.03, 0.08, Mat.wood);
  for (let k = 1; k * 0.3 < len - 0.15; k++) {
    const p = lerp(base, top, (k * 0.3) / len);
    rod(B, [p[0] - side[0], p[1], p[2]], [p[0] + side[0], p[1], p[2]], 0.016, Mat.wood, 12);
  }
}

function sawhorse(B: MeshBuilder) {
  beam(B, [-0.55, 0.72, 0], [0.55, 0.72, 0], 0.09, 0.09, Mat.wood);
  for (const s of [-1, 1]) for (const t of [-1, 1]) beam(B, [s * 0.42, 0.7, t * 0.03], [s * 0.5, 0, t * 0.3], 0.07, 0.045, Mat.wood);
  for (const s of [-1, 1]) beam(B, [s * 0.465, 0.3, -0.19], [s * 0.465, 0.3, 0.19], 0.09, 0.02, Mat.wood);
}

function toolbox(B: MeshBuilder) {
  tagged(B, PAINT.red, () => {
    B.box([0, 0.1, 0], [0.24, 0.1, 0.11], 0.012, Mat.paint, 1);
    B.box([0, 0.205, 0], [0.245, 0.012, 0.115], 0.006, Mat.paint, 1);
  });
  B.tube((t) => { const a = Math.PI * t; return [-0.11 * Math.cos(a), 0.22 + 0.06 * Math.sin(a), 0]; }, 0.011, Mat.rubber, 16, 8);
  B.box([0.2, 0.15, 0.113], [0.025, 0.02, 0.006], 0.003, Mat.steel, 1);
}

// secchio di plastica: parete, bordo, interno con la vernice (aperto) o coperchio
function bucket(B: MeshBuilder, p: V3, paint: number, open: boolean, seg: number) {
  const [x, y, z] = p;
  tagged(B, paint, () => {
    B.lathe(x, z, [[[0.125, y], [0.15, y + 0.31]]], Mat.bucket, seg);
    B.lathe(x, z, [[[0.15, y + 0.31], [0.159, y + 0.316], [0.158, y + 0.333], [0.146, y + 0.336], ...(open ? [[0.139, y + 0.25]] as [number, number][] : [[0.0, y + 0.342]] as [number, number][])]], Mat.bucket, seg);
    if (open) B.lathe(x, z, [[[0.139, y + 0.25], [0.0, y + 0.255]]], Mat.paint, seg);
  });
  // il manico di filo d'acciaio, abbassato di lato
  B.tube((t) => { const a = Math.PI * (0.1 + 0.8 * t); return [x + 0.155 * Math.cos(a), y + 0.27 + 0.05 * Math.sin(a), z - 0.03 - 0.12 * Math.sin(a)]; }, 0.003, Mat.steel, 20, 5);
}
// barattolo di latta con l'etichetta del colore
function paintCan(B: MeshBuilder, p: V3, paint: number, open: boolean, seg = 32) {
  const [x, y, z] = p;
  B.lathe(x, z, [[[0, y], [0.085, y], [0.088, y + 0.01], [0.088, y + 0.17], [0.083, y + 0.178], ...(open ? [[0.08, y + 0.15]] as [number, number][] : [[0.0, y + 0.18]] as [number, number][])]], Mat.steel, seg);
  tagged(B, paint, () => {
    B.lathe(x, z, [[[0.0886, y + 0.03], [0.0886, y + 0.14]]], Mat.paint, seg);
    if (open) B.lathe(x, z, [[[0.08, y + 0.15], [0.0, y + 0.152]]], Mat.paint, seg);
  });
}

function cone(B: MeshBuilder, seg: number) {
  B.box([0, 0.016, 0], [0.19, 0.016, 0.19], 0.02, Mat.rubber, 1);
  B.lathe(0, 0, [[[0.155, 0.03], [0.16, 0.045], [0.15, 0.06], [0.04, 0.69], [0.03, 0.71], [0.0, 0.712]]], Mat.cone, seg);
}

function carton(B: MeshBuilder, h: V3, open = false) {
  B.box([0, h[1], 0], h, 0.01, Mat.cardboard, 1);
  // nastro da pacchi lungo il coperchio e giù per i due fianchi corti
  B.box([0, 2 * h[1] + 0.0008, 0], [h[0] + 0.001, 0.0008, 0.025], 0.0004, Mat.masking, 1);
  for (const s of [-1, 1]) B.box([s * (h[0] + 0.0008), 2 * h[1] - 0.07, 0], [0.0008, 0.07, 0.025], 0.0004, Mat.masking, 1);
  if (open) for (const s of [-1, 1]) placed(B, rot(0, 0, s * 0.35), [s * h[0], 2 * h[1], 0], () => B.box([s * h[0] * 0.5, 0.004, 0], [h[0] * 0.5, 0.004, h[2] * 0.98], 0.002, Mat.cardboard, 1));
}

function worklamp(B: MeshBuilder) {
  // faro da cantiere su treppiede, due proiettori gialli puntati verso il podio (spenti)
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.3; rod(B, [0, 1.05, 0], [0.48 * Math.cos(a), 0.01, 0.48 * Math.sin(a)], 0.012, Mat.steel, 8); }
  rod(B, [0, 0.95, 0], [0, 1.95, 0], 0.017, Mat.steel, 10);
  rod(B, [-0.36, 1.95, 0], [0.36, 1.95, 0], 0.014, Mat.steel, 8);
  for (const s of [-1, 1]) placed(B, rot(0, -0.38, 0), [s * 0.3, 2.03, 0.02], () => {
    tagged(B, PAINT.yellow, () => B.box([0, 0, 0], [0.13, 0.105, 0.06], 0.015, Mat.paint, 1));
    B.box([0, 0, 0.063], [0.11, 0.085, 0.004], 0.002, Mat.frame, 1);
    for (let g = -2; g <= 2; g++) rod(B, [g * 0.04, -0.09, 0.075], [g * 0.04, 0.09, 0.075], 0.003, Mat.steel, 5);
    B.tube((t) => [-0.15 + 0.3 * t, -0.08 - 0.05 * Math.sin(Math.PI * t), -0.02], 0.007, Mat.steel, 10, 6);
  });
}

// nastro bianco e rosso: un nastro piatto (due facce) che pende tra i punti, appena attorcigliato
function tape(B: MeshBuilder, pts: V3[], sag: number[]) {
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(8, Math.round(len * 10));
    const center = (t: number): V3 => { const p = lerp(a, b, t); return [p[0], p[1] - sag[i] * 4 * t * (1 - t), p[2]]; };
    const edge = (t: number, v: number): V3 => {
      const p = center(t), q = center(Math.min(1, t + 0.01)), q0 = center(Math.max(0, t - 0.01));
      const T = norm([q[0] - q0[0], q[1] - q0[1], q[2] - q0[2]]), N0 = norm(cross(T, [0, 1, 0])), A0 = cross(N0, T);
      const th = 0.45 * Math.sin(t * 7 + i * 2.1), w = 0.075 * (v - 0.5);
      return [p[0] + (A0[0] * Math.cos(th) + N0[0] * Math.sin(th)) * w, p[1] + (A0[1] * Math.cos(th) + N0[1] * Math.sin(th)) * w, p[2] + (A0[2] * Math.cos(th) + N0[2] * Math.sin(th)) * w];
    };
    for (const side of [1, -1]) B.surface(1, n, (u, v) => edge(v, u), Mat.tape, { side, uv: (u, v) => [along + v * len, u] });
    along += len;
  }
}

// telo da pittore steso a terra: griglia con le gobbe basse e un lembo ripiegato
function dropSheet(B: MeshBuilder, w: number, d: number, s: number) {
  const nx = Math.round(w / s) + 1, nz = Math.round(d / s) + 1, pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const u = i * s, v = j * s, k = (j * nx + i) * 3;
    const bump = Math.max(0, Math.sin(u * 2.3 + v * 0.7) * Math.sin(v * 3.1 - u * 0.4) + 0.3 * Math.sin(u * 7.1 + v * 5.3)) * 0.018;
    // l'ultimo mezzo metro ripiegato sopra il resto
    const fold = Math.max(0, u - (w - 0.5));
    pos[k] = u - 2 * fold * (1 - 0.06 * Math.sin(v * 2)); pos[k + 1] = 0.006 + bump + (fold > 0 ? 0.012 + 0.03 * Math.sin(Math.min(fold / 0.5, 1) * Math.PI) : 0); pos[k + 2] = v;
  }
  clothMesh(B, { nx, nz, spacing: s, pos }, Mat.cloth);
}

// la quota del telo sopra (x, z): il punto più alto entro qualche centimetro
function clothTop(d: Drape, x: number, z: number) {
  let top = 0;
  for (let p = 0; p < d.nx * d.nz; p++) if (Math.abs(d.pos[p * 3] - x) < 0.09 && Math.abs(d.pos[p * 3 + 2] - z) < 0.09) top = Math.max(top, d.pos[p * 3 + 1]);
  return top;
}
// metro da falegname giallo, aperto a zig-zag
function foldingRule(B: MeshBuilder) {
  let p: V3 = [0, 0.003, 0], a = 0;
  tagged(B, PAINT.yellow, () => {
    for (let k = 0; k < 5; k++) {
      const q: V3 = [p[0] + Math.cos(a) * 0.2, 0.003 + k * 0.0042, p[2] + Math.sin(a) * 0.2];
      beam(B, [p[0], 0.003 + k * 0.0042, p[2]], q, 0.004, 0.017, Mat.paint, 0.001);
      p = q; a += k % 2 ? 0.9 : -1.15;
    }
  });
}
// straccio sporco di vernice, appallottolato
function rag(B: MeshBuilder) {
  const n = 9, s = 0.045, pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i - 4) * s, v = (j - 4) * s, k = (j * n + i) * 3, r = Math.hypot(u, v);
    pos[k] = u * (1 - 0.25 * Math.sin(v * 31)); pos[k + 1] = 0.035 * Math.max(0, 1 - r / 0.2) * (0.7 + 0.3 * Math.sin(u * 40 + v * 23)) + 0.006; pos[k + 2] = v * (1 - 0.2 * Math.cos(u * 27));
  }
  clothMesh(B, { nx: n, nz: n, spacing: s, pos }, Mat.cloth);
}
// bicchiere di carta del caffè col coperchio e la fascetta
function coffee(B: MeshBuilder) {
  tagged(B, PAINT.white, () => B.lathe(0, 0, [[[0, 0], [0.028, 0], [0.04, 0.115], [0.043, 0.118], [0.042, 0.128], [0.03, 0.13], [0, 0.131]]], Mat.paint, 24));
  B.lathe(0, 0, [[[0.0325, 0.035], [0.037, 0.085]]], Mat.cardboard, 24);
}

// ---------- il cantiere al suo posto nella sala ----------
export function buildSite(B: MeshBuilder, mobile: boolean, cloth: Drape) {
  const SEG = mobile ? 24 : 40, start = B.count;
  // sopra il telo, appoggiati dove capita: metro pieghevole, rotolo di nastro, uno straccio, un barattolo chiuso e il caffè
  const on = (x: number, z: number) => clothTop(cloth, x, z) + 0.004;
  placed(B, rot(0.5), [0.42, on(0.42, 0.25), 0.25], () => foldingRule(B));
  placed(B, rot(0), [-0.45, on(-0.45, -0.35), -0.35], () => B.lathe(0, 0, [[[0.04, 0], [0.064, 0], [0.064, 0.048], [0.04, 0.048], [0.04, 0]]], Mat.masking, 28));
  placed(B, rot(-0.3), [0.05, on(0.05, -0.2) - 0.006, -0.2], () => rag(B));
  placed(B, rot(0.8), [-2.55, on(-2.55, -0.25), -0.25], () => paintCan(B, [0, 0, 0], PAINT.ochre, false));
  placed(B, rot(0), [2.75, on(2.75, 0.3), 0.3], () => coffee(B));
  // dietro il podio, davanti alla metà destra del finestrone: il ponteggio con un telo sotto e i secchi alla base
  placed(B, rot(-0.04), [3.05, 0.004, -5.65], () => dropSheet(B, 3.4, 2.4, 0.1));
  placed(B, rot(0.02), [3.0, 0, -5.75], () => scaffold(B, mobile ? 10 : 18));
  bucket(B, [2.2, 0.03, -4.55], PAINT.white, true, SEG);
  bucket(B, [1.82, 0.03, -4.85], PAINT.teal, false, SEG);
  paintCan(B, [2.55, 0.03, -4.3], PAINT.ochre, false);
  placed(B, rot(0.5), [3.55, 2.13, -5.55], () => bucket(B, [0, 0, 0], PAINT.white, true, SEG));
  placed(B, rot(-0.3), [2.5, 4.13, -5.5], () => carton(B, [0.3, 0.13, 0.22]));
  // un rullo su un'asta lunga appoggiata al parapetto del primo piano
  const foot: V3 = [1.55, 0.02, -3.95], head: V3 = [2.32, 2.78, -5.11];
  tagged(B, PAINT.blue, () => rod(B, foot, head, 0.013, Mat.paint, 8));
  rod(B, head, [head[0], head[1] + 0.12, head[2] + 0.02], 0.005, Mat.steel, 6);
  tagged(B, PAINT.white, () => rod(B, [head[0] - 0.12, head[1] + 0.13, head[2] + 0.03], [head[0] + 0.12, head[1] + 0.13, head[2] + 0.03], 0.03, Mat.paint, 14));
  // sul primo piano del ponteggio: un barattolo aperto e la vaschetta col rullo
  placed(B, rot(-0.4), [2.6, 2.13, -5.45], () => paintCan(B, [0, 0, 0], PAINT.teal, true));
  placed(B, rot(0.25, 0.12), [3.0, 2.16, -5.95], () => {
    tagged(B, PAINT.black, () => B.box([0, 0.02, 0], [0.17, 0.02, 0.22], 0.01, Mat.paint, 1));
    tagged(B, PAINT.white, () => B.box([0, 0.041, -0.06], [0.14, 0.003, 0.12], 0.002, Mat.paint, 1));
  });
  // a sinistra del finestrone una scala lunga appoggiata al muro; più avanti la scala a libretto aperta
  leaningLadder(B, [-3.95, 0, -5.85], [-3.95, 4.5, -6.93]);
  placed(B, rot(0.62), [-4.75, 0, -4.35], () => stepladder(B));
  // in fondo a sinistra i cavalletti con l'asse, la cassetta e un barattolo (si scoprono girando attorno al podio)
  for (const x of [-5.35, -3.75]) placed(B, rot(0.03), [x, 0, -5.95], () => sawhorse(B));
  beam(B, [-6.0, 0.787, -5.92], [-3.15, 0.79, -6.02], 0.035, 0.32, Mat.wood, 0.004);
  placed(B, rot(-0.12), [-4.3, 0.808, -5.97], () => toolbox(B));
  placed(B, rot(0.3), [-3.55, 0.808, -5.92], () => paintCan(B, [0, 0, 0], PAINT.white, true));
  bucket(B, [-2.9, 0, -5.3], PAINT.terracotta, false, SEG);
  // a destra, tra la pedana e le colonne: scatoloni impilati, quello in cima aperto
  placed(B, rot(0.08), [5.0, 0, -3.75], () => carton(B, [0.34, 0.24, 0.26]));
  placed(B, rot(-0.17), [4.97, 0.48, -3.78], () => carton(B, [0.3, 0.2, 0.22]));
  placed(B, rot(0.12), [5.02, 0.88, -3.74], () => carton(B, [0.24, 0.15, 0.18], true));
  placed(B, rot(0.35), [4.95, 0, -3.05], () => carton(B, [0.22, 0.15, 0.18]));
  // davanti: il tappeto arrotolato, i coni e il nastro legato alle colonne, il faro col cavo che va al muro
  const rollZ = ROLL.z, rr = ROLL.r;
  B.tube((t) => [-CARPET.hw + 2 * CARPET.hw * t, rr, rollZ], rr, Mat.carpet, 1, mobile ? 28 : 40);
  for (const s of [-1, 1]) disc(B, [s * CARPET.hw, rr, rollZ], [s, 0, 0], rr, Mat.carpet, mobile ? 28 : 40);
  const cones: V3[] = [[-3.25, 0, 4.25], [3.45, 0, 4.15]];
  cones.forEach((c, i) => placed(B, rot(i * 0.6 + 0.2), c, () => cone(B, SEG)));
  tape(B, [[-5.58, 0.95, 4.1], [cones[0][0], 0.63, cones[0][2]], [cones[1][0], 0.63, cones[1][2]], [5.58, 0.95, 4.1]], [0.08, 0.2, 0.08]);
  placed(B, rot(2.36), [-4.55, 0, 4.75], () => worklamp(B));
  const cable: V3[] = [[-4.55, 0.4, 4.75], [-4.5, 0.012, 4.95], [-5.0, 0.012, 5.4], [-6.2, 0.012, 5.1], [-7.4, 0.012, 5.7], [-8.6, 0.012, 5.5], [-ROOM.x + 0.02, 0.35, 5.6]];
  B.tube((t) => {
    // Catmull-Rom attraverso i punti del cavo
    const f = t * (cable.length - 1), i = Math.min(cable.length - 2, Math.floor(f)), u = f - i;
    const p0 = cable[Math.max(0, i - 1)], p1 = cable[i], p2 = cable[i + 1], p3 = cable[Math.min(cable.length - 1, i + 2)];
    return [0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u * u * u)) as V3;
  }, 0.009, Mat.rubber, mobile ? 60 : 110, 6);
  // nastro di carta a croce su due vetri del finestrone (le croci finiscono anche nei fasci di luce)
  const zt = ROOM.back - WINDOW.depth * 0.5 + 0.115, c = WINDOW.cols, fr = WINDOW.frame, br = WINDOW.bar;
  const panes: [number, number, number, number][] = [[c[1] + br + 0.06, WINDOW.y0 + fr + 0.06, c[2] - br - 0.06, WINDOW.rows[0] - br - 0.06], [c[0] + br + 0.06, WINDOW.rows[0] + br + 0.06, c[1] - br - 0.06, WINDOW.ya - br - 0.06]];
  for (const [xa, ya, xb, yb] of panes) {
    beam(B, [xa, ya, zt], [xb, yb, zt], 0.048, 0.002, Mat.masking, 0.0008);
    beam(B, [xa, yb, zt + 0.003], [xb, ya, zt + 0.003], 0.048, 0.002, Mat.masking, 0.0008);
  }
  B.clampFloor(start);
}
