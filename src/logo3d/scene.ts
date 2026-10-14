// Il logo: geometrie raggruppate per materiale, animazione (identica a quella della versione three.js) e preparazione dei
// dati di ogni fotogramma in un unico blocco uniform. Niente GPU qui dentro: il modulo si prova anche in Node.
import { roundedSquare, extrude, fromExtrude, tube, Curve3, LineCurve3, polyline, sphere, torus, box, transform, merge, type Geo } from "./geometry";
import { MAX_OBJ, MAX_SPRITE, MAX_PARTICLE } from "./shaders";

export const TAU = Math.PI * 2;
const A0 = Math.atan2(9.6, 11.5);
export const FRONT = 5.9, BACK = -5.9;
type V3 = { x: number; y: number; z: number };
export const arcAt = (t: number, z: number): V3 => { const a = A0 + t * (TAU - 2 * A0); return { x: Math.cos(a) * 15, y: Math.sin(a) * 15, z }; };
export const lineAt = (t: number, z: number): V3 => ({ x: -1 + 16 * t, y: 0, z });
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
export const ease = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const back = (k: number) => { k = clamp01(k); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.abs(Math.pow(k - 1, 2)); };
const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

// colori come in three.js: esadecimali sRGB convertiti nello spazio lineare di lavoro
const toLin = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
export const lin = (hex: number): [number, number, number] => [toLin(((hex >> 16) & 255) / 255), toLin(((hex >> 8) & 255) / 255), toLin((hex & 255) / 255)];

export type Quality = { mobile: boolean; bevel: number; curve: number; arc: number; radial: number; sphere: number; rings: number; particles: number; trail: number; rimBevel: number };
// sui telefoni meno suddivisioni, meno scintille e scie più corte (come prima)
export const quality = (mobile: boolean): Quality => mobile
  ? { mobile, bevel: 6, curve: 24, arc: 96, radial: 14, sphere: 20, rings: 96, particles: 48, trail: 5, rimBevel: 2 }
  : { mobile, bevel: 10, curve: 40, arc: 160, radial: 20, sphere: 32, rings: 144, particles: 80, trail: 9, rimBevel: 4 };

// indexed: first/count in indici (a 16 bit, locali al gruppo, spostati di base); altrimenti in vertici
export type Batch = { first: number; count: number; base: number; indexed: boolean };
export type Meshes = {
  vertices: Float32Array; // 7 float per vertice: posizione, normale, parametro lungo la curva
  colors: Float32Array; // colori per vertice della targa (3 float, stessi indici dei suoi vertici)
  indices: Uint16Array;
  plate: Batch; gold: Batch; chip: Batch; rim: Batch; arc: Batch; line: Batch; cap: Batch; ring0: Batch; ring1: Batch;
};

const ORBITS = [
  { r: 44.5, tilt: [1.2, 0.35, 0], speed: 0.55, color: 0x5eead4, ph: 0 },
  { r: 48.5, tilt: [1.0, -0.6, 0.4], speed: -0.38, color: 0xfbbf24, ph: 2.1 },
];
const TRACES = [[[-22, -20], [-22, -6], [-12, 4], [-12, 18]], [[-4, 22], [-4, 10], [6, 0], [20, 0]], [[22, -22], [10, -22], [2, -14], [2, -4]], [[-24, 12], [-16, 20], [-6, 20]], [[14, 24], [14, 12], [22, 4]], [[-14, -24], [-4, -24], [4, -16]]];
const CAP_POS = [arcAt(0, FRONT + 2.15), lineAt(0, FRONT + 2.15), arcAt(1, FRONT + 2.15)]; // perla, perla, ambra
const NODE_R = [4.2, 3.2, 4.2];

// Tutte le parti ferme rispetto alla targa (piastra, filetto, incastonature, circuito sul retro, chip, piedini) sono già
// trasformate nello spazio della targa: l'oro diventa un solo disegno al posto di 33 oggetti separati.
export function buildMeshes(q: Quality): Meshes {
  // targa smaltata: estrusione con smussatura profonda, colori per vertice (diagonale chiara-scura, fianchi e retro più scuri)
  const plate = transform(fromExtrude(extrude(roundedSquare(29.5, 14.5), { depth: 5.8, bevelThickness: 3.4, bevelSize: 2.6, bevelSegments: q.bevel, curveSegments: q.curve })), [0, 0, -2.9]);
  const ca = lin(0x22d8c0), cb = lin(0x07423d), side = lin(0x0d5c54), backCol = lin(0x082e2a), nv = plate.pos.length / 3;
  const colors = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const x = plate.pos[i * 3], y = plate.pos[i * 3 + 1], nz = plate.nrm[i * 3 + 2], t = clamp01((x + 32 + (32 - y)) / 128);
    for (let k = 0; k < 3; k++) {
      let c = ca[k] + (cb[k] - ca[k]) * t;
      if (Math.abs(nz) < 0.45) c += (side[k] - c) * 0.35;
      if (nz < -0.6) c += (backCol[k] - c) * 0.6;
      colors[i * 3 + k] = c;
    }
  }
  // filetto bianco: corona estrusa appena sopra la faccia della targa
  const rimShape = roundedSquare(28.3, 13.5); rimShape.holes.push(roundedSquare(27.2, 12.6));
  const rim = transform(fromExtrude(extrude(rimShape, { depth: 0.65, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: q.rimBevel, curveSegments: q.curve })), [0, 0, FRONT - 0.15]);
  // oro: incastonature, piste del retro con le loro piazzole, piedini del chip
  const capGeo = sphere(1, q.sphere, Math.round(q.sphere * 0.7));
  const gold: Geo[] = [];
  const socket = torus(1, 0.16, 8, 24);
  ([[arcAt(0, 0), 4.2], [lineAt(0, 0), 3.2], [arcAt(1, 0), 4.2]] as [V3, number][]).forEach(([p, r]) => { const s = r * 0.92; gold.push(transform(socket, [p.x, p.y, FRONT + 0.25], [s, s, s])); });
  TRACES.forEach((pts) => {
    gold.push(tube(polyline(pts, BACK - 0.5), pts.length * 2, 0.65, 6));
    [pts[0], pts[pts.length - 1]].forEach(([x, y]) => gold.push(transform(capGeo, [x, y, BACK - 0.6], [1.9, 1.9, 0.6])));
  });
  const pin = box(1.1, 2.6, 0.8);
  for (let k = 0; k < 6; k++) [-1, 1].forEach((s) => gold.push(transform(pin, [1.75 + k * 2.5, -10 + s * 6.6, BACK - 0.9])));
  const chip = transform(box(16, 11, 2.4), [8, -10, BACK - 1.4]);
  // la "C" e la pista: tubi con il parametro lungo la curva per la corrente e per il disegno progressivo
  const arc = tube(new Curve3((t) => arcAt(t, FRONT + 1.45)), q.arc, 2.55, q.radial);
  const line = tube(new LineCurve3(lineAt(0, FRONT + 1.25), lineAt(1, FRONT + 1.25)), 8, 1.55, q.radial);
  const parts: [keyof Omit<Meshes, "vertices" | "colors" | "indices">, Geo][] = [
    ["plate", plate], ["gold", merge(gold)], ["chip", chip], ["rim", rim], ["arc", arc], ["line", line], ["cap", capGeo],
    ["ring0", torus(ORBITS[0].r, 0.2, 6, q.rings)], ["ring1", torus(ORBITS[1].r, 0.2, 6, q.rings)],
  ];
  // le estrusioni (targa e filetto) non hanno vertici condivisi: si disegnano senza indici, come in three.js; gli altri
  // gruppi hanno meno di 65536 vertici e usano indici a 16 bit relativi al proprio inizio
  const plain = (name: string) => name === "plate" || name === "rim";
  let nVert = 0, nIdx = 0;
  for (const [name, g] of parts) { nVert += g.pos.length / 3; if (!plain(name)) nIdx += g.idx.length; }
  const vertices = new Float32Array(nVert * 7), indices = new Uint16Array(nIdx + (nIdx & 1)), out: any = { colors };
  let ov = 0, oi = 0;
  for (const [name, g] of parts) {
    const n = g.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const o = (ov + i) * 7;
      vertices[o] = g.pos[i * 3]; vertices[o + 1] = g.pos[i * 3 + 1]; vertices[o + 2] = g.pos[i * 3 + 2];
      vertices[o + 3] = g.nrm[i * 3]; vertices[o + 4] = g.nrm[i * 3 + 1]; vertices[o + 5] = g.nrm[i * 3 + 2]; vertices[o + 6] = g.aux[i];
    }
    if (plain(name)) out[name] = { first: ov, count: n, base: ov, indexed: false };
    else {
      if (n > 65536) throw new Error(`logo3d: troppi vertici in ${name}`);
      indices.set(g.idx, oi);
      out[name] = { first: oi, count: g.idx.length, base: ov, indexed: true };
      oi += g.idx.length;
    }
    ov += n;
  }
  return { ...out, vertices, indices };
}

// ---------- animazione ----------

export class LogoAnim {
  T: number;
  cyc = 0; flash = 0; hoverK = 0; boost = 0; orbPh = [0, 0];
  ang = 0; vel = 0; settle: number | null = null;
  drag = false; hover = false;
  ptr = { x: 0, y: 0 }; cur = { x: 0, y: 0 };
  // valori derivati, letti da pack() (aggiornati sul posto: nessuna allocazione per fotogramma)
  badgeS = 1; readonly badgeR = [0, 0, 0]; arcK = 1; lineK = 1; readonly nodeS = [4.2, 3.2, 4.2]; on = 1;
  readonly uArc = [-1, 0]; readonly uLine = [-1, 0]; readonly spark = { x: 0, y: 0, z: 0, a: 0 }; amberE = 0; lampI = 0; haloA = 0; haloS = 11.5;
  ringA = 0; trailA = 0; readonly rootR = [0, 0]; readonly rootP = [0, 0]; readonly fgP = [0, 0, 0];
  // scintille: dati di nascita (velocità, vita, istante) in un anello; la posizione si calcola sulla GPU
  readonly sp: number;
  readonly particles: Float32Array;
  private pNext = 0;
  private pEpoch = 0;
  private lastBurst = -Infinity;
  dirty: [number, number] | null = null; // intervallo di particelle da ricaricare (in indici)

  constructor(intro: boolean, readonly q: Quality, private random: () => number = Math.random) {
    this.T = intro ? 0 : 6;
    this.sp = q.particles;
    this.particles = new Float32Array(MAX_PARTICLE * 8);
    this.step(0);
  }

  get particleTime() { return this.T - this.pEpoch; }
  get introDone() { return this.T >= 1.31; } // la C e la pista sono complete: il disegno non cambia più forma

  step(dt: number) {
    const T = (this.T += dt);
    const kIn = back((T - 0.05) / 1.0);
    this.badgeS = 0.35 + 0.65 * Math.min(1.06, kIn);
    this.badgeR[0] = 0.9 * (1 - ease(T / 1.0)); this.badgeR[1] = -2.6 * (1 - ease(T / 1.1)); this.badgeR[2] = 0.4 * (1 - ease(T / 1.0));
    this.arcK = ease((T - 0.35) / 0.8);
    this.lineK = ease((T - 0.95) / 0.35);
    for (let i = 0; i < 3; i++) this.nodeS[i] = NODE_R[i] * Math.max(0.0001, back((T - 0.85 - i * 0.14) / 0.45));
    const on = (this.on = ease((T - 1.25) / 0.5));
    this.hoverK = damp(this.hoverK, this.hover ? 1 : 0, 6, dt);
    this.boost = Math.max(0, this.boost - dt * 0.5);
    const CYCLE = 2.6;
    if (T > 1.4) this.cyc += (dt / CYCLE) * (1 + this.boost * 2.2 + this.hoverK * 0.6);
    const c = (this.cyc % 1) * CYCLE, prevFlash = this.flash;
    const arcPh = c / 1.15, linePh = (c - 1.2) / 0.4;
    const gain = on * (1 + this.hoverK * 0.5 + this.boost * 0.6);
    this.uArc[0] = arcPh < 1.25 ? arcPh : -1; this.uArc[1] = gain;
    this.uLine[0] = linePh > -0.1 && linePh < 1.3 ? linePh : -1; this.uLine[1] = gain;
    const sp = this.spark;
    if (arcPh >= 0 && arcPh <= 1) { const a = A0 + arcPh * (TAU - 2 * A0); sp.x = Math.cos(a) * 15; sp.y = Math.sin(a) * 15; sp.z = FRONT + 4.35; sp.a = on * 0.92 * Math.sin((Math.min(1, arcPh * 6) * Math.PI) / 2); }
    else if (linePh >= 0 && linePh <= 1) { sp.x = -1 + 16 * linePh; sp.y = 0; sp.z = FRONT + 3.55; sp.a = on * 0.78 * (1 - linePh * 0.5); }
    else sp.a = 0;
    this.flash = arcPh >= 1 && arcPh < 1.25 ? 1 : Math.max(0, prevFlash - dt * 1.6);
    const flash = this.flash;
    this.amberE = on * (0.6 + 3.4 * flash + this.hoverK * 0.45);
    this.lampI = on * (1.4 + 6.5 * flash);
    this.haloA = on * (0.28 + 0.72 * flash);
    this.haloS = 11.5 + 16.5 * flash;
    this.nodeS[2] = 4.2 * (T > 1.5 ? 1 + 0.14 * flash : Math.max(0.0001, back((T - 1.13) / 0.45)));
    for (let i = 0; i < ORBITS.length; i++) this.orbPh[i] += dt * ORBITS[i].speed * (1 + this.boost * 2.5 + this.hoverK * 0.5);
    this.ringA = 0.11 * ease((T - 1.5) / 0.8) * (1 + this.hoverK * 1.2);
    this.trailA = ease((T - 1.7) / 0.6);
    if (!this.drag) {
      if (Math.abs(this.vel) > 2.4 && this.settle === null) this.vel *= Math.exp(-dt * 0.85);
      else {
        if (this.settle === null) {
          const p = (this.ang + this.vel * 0.25) / TAU;
          this.settle = (this.vel > 0.3 ? Math.ceil(p - 0.08) : this.vel < -0.3 ? Math.floor(p + 0.08) : Math.round(p)) * TAU;
        }
        this.vel += (-(this.ang - this.settle) * 26 - this.vel * 8.5) * dt;
        if (Math.abs(this.ang - this.settle) < 0.0005 && Math.abs(this.vel) < 0.002) { this.ang = this.settle; this.vel = 0; }
      }
      this.ang += this.vel * dt;
    }
    this.cur.x = damp(this.cur.x, this.ptr.x, 6.5, dt); this.cur.y = damp(this.cur.y, this.ptr.y, 6.5, dt);
    this.rootR[0] = this.cur.y * 0.48 + Math.sin(T * 0.75) * 0.06; this.rootR[1] = this.cur.x * 0.74 + Math.sin(T * 0.55) * 0.11;
    this.rootP[0] = Math.sin(T * 1.25) * 1.9 + Math.cos(T * 0.65) * 0.5; this.rootP[1] = -60 * (1 - ease((T - 0.05) / 0.9)) + this.hoverK * 12;
    this.fgP[0] = this.cur.x * 1.15; this.fgP[1] = -this.cur.y * 1.15; this.fgP[2] = this.hoverK * 0.85 + this.boost * 0.6;
  }

  // trascinamento orizzontale (dx in pixel, dt in secondi dall'ultimo movimento)
  dragBy(dx: number, dt: number) { const d = dx * 0.013; this.ang += d; this.vel = damp(this.vel, d / dt, 18, dt); this.settle = null; }

  // spinta: accelera la rotazione e la corrente, e fa esplodere le scintille dal centro
  kick() { this.vel = Math.min(42, this.vel + 9.5); this.settle = null; this.boost = 1; this.burst(this.q.mobile ? 24 : 44); }

  burst(n: number) {
    // nessuna scintilla ancora viva: si riparte da un'origine dei tempi nuova (precisione dei float32 sulla GPU)
    if (this.T - this.lastBurst > 1.5) { this.pEpoch = this.T; this.particles.fill(0); this.dirty = [0, this.sp]; }
    this.lastBurst = this.T;
    const born = this.T - this.pEpoch, rnd = this.random;
    for (let k = 0; k < n; k++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % this.sp;
      const a = rnd() * TAU, b = (rnd() - 0.5) * Math.PI, v = 45 + rnd() * 75, life = 0.7 + rnd() * 0.6, o = i * 8;
      this.particles[o] = Math.cos(a) * Math.cos(b) * v; this.particles[o + 1] = Math.sin(a) * Math.cos(b) * v; this.particles[o + 2] = Math.sin(b) * v * 0.6 + 25;
      this.particles[o + 3] = life; this.particles[o + 4] = born;
      this.dirty = this.dirty ? [Math.min(this.dirty[0], i), Math.max(this.dirty[1], i + 1)] : [i, i + 1];
    }
    if (n >= this.sp) this.dirty = [0, this.sp];
  }
}

// ---------- dati del fotogramma ----------

export const FRAME_FLOATS = 868; // struttura Frame di shaders.ts (3472 byte)
const OBJ0 = 100, SPR0 = 580, OBJF = 40, SPRF = 12;
export const OBJ = { plate: 0, gold: 1, chip: 2, rim: 3, arc: 4, line: 5, pearl: 6, amber: 8, ring0: 9, ring1: 10 };
export const FOV = 29;

type M = Float64Array;
// T·R(xyz)·S come Object3D.updateMatrix (rotazioni di Eulero in ordine XYZ, scala uniforme)
const compose = (out: M, px: number, py: number, pz: number, rx: number, ry: number, rz: number, s: number) => {
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  out[0] = c * e * s; out[1] = (af + be * d) * s; out[2] = (bf - ae * d) * s; out[3] = 0;
  out[4] = -c * f * s; out[5] = (ae - bf * d) * s; out[6] = (be + af * d) * s; out[7] = 0;
  out[8] = d * s; out[9] = -b * c * s; out[10] = a * c * s; out[11] = 0;
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
};
const mul = (out: M, a: M, b: M) => {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
  }
  return out;
};
const point = (out: V3, m: M, x: number, y: number, z: number) => {
  out.x = m[0] * x + m[4] * y + m[8] * z + m[12]; out.y = m[1] * x + m[5] * y + m[9] * z + m[13]; out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
};
const m4 = () => new Float64Array(16);

const C = {
  white: lin(0xffffff), gold: lin(0xe8b04a), chip: lin(0x0b1f1d), current: lin(0xf4fffd), amber: lin(0xfbbf24), sheen: lin(0x9ff3e4),
  spark: lin(0xffe2a0), sky: lin(0xdffcf7), ground: lin(0x062521), teal: lin(0x2dd4bf), ptr: lin(0x99f6e4),
};
const ORBIT_COL = ORBITS.map((o) => lin(o.color));
const LAMP = arcAt(1, FRONT + 9.5), HALO = arcAt(1, FRONT + 3.8);
const KEY = (() => { const l = Math.hypot(60, 80, 115); return [60 / l, 80 / l, 115 / l]; })();
const RIM = (() => { const l = Math.hypot(-100, 15, -70); return [-100 / l, 15 / l, -70 / l]; })();

// Riempie il blocco uniform del fotogramma. Restituisce quante istanze di bagliori disegnare.
export class FramePacker {
  readonly data = new Float32Array(FRAME_FLOATS);
  private v: V3 = { x: 0, y: 0, z: 0 };
  private s = { root: m4(), spin: m4(), badge: m4(), wb: m4(), fg: m4(), wfg: m4(), tmp: m4(), tilt: ORBITS.map(() => m4()), wo: ORBITS.map(() => m4()), cap: m4(), wc: m4(), view: m4(), proj: m4() };
  camZ = 184;
  readonly lite: boolean;
  readonly sprites: number;

  constructor(readonly q: Quality) {
    this.lite = q.mobile;
    this.sprites = 2 + 2 * q.trail;
    ORBITS.forEach((o, i) => compose(this.s.tilt[i], 0, 0, 0, o.tilt[0], o.tilt[1], o.tilt[2], 1));
    const d = this.data;
    // parti fisse del blocco: luci direzionali ed emisferica, esposizione
    d.set([C.sky[0] * 0.65, C.sky[1] * 0.65, C.sky[2] * 0.65, 0], 52);
    d.set([C.ground[0] * 0.65, C.ground[1] * 0.65, C.ground[2] * 0.65, 0], 56);
    d.set([0, 1, 0, 0], 60);
    d.set([KEY[0], KEY[1], KEY[2], 0, RIM[0], RIM[1], RIM[2], 0], 64);
    d.set([2.1 * C.white[0], 2.1 * C.white[1], 2.1 * C.white[2], 0, 2.8 * C.teal[0], 2.8 * C.teal[1], 2.8 * C.teal[2], 0], 72);
    d[96] = 1.06; d[99] = 3.8 * Math.tan(((FOV / 2) * Math.PI) / 180); // dimensione delle scintille (gl_PointSize 3.8 con attenuazione)
    // materiali (le parti animate si aggiornano in pack)
    const mat = (k: number, col: number[], a: number, rough: number, metal: number, cc: number, ccr: number, envI: number, emis = [0, 0, 0], sheen = [0, 0, 0, 1], irid = [0, 1.3, 400]) => {
      const o = OBJ0 + k * OBJF;
      d.set([col[0], col[1], col[2], a, emis[0], emis[1], emis[2], envI, rough, metal, cc, ccr, sheen[0], sheen[1], sheen[2], sheen[3], irid[0], irid[1], irid[2], 0, -1, 0, 0, 0], o + 16);
    };
    const lite = this.lite;
    mat(OBJ.plate, C.white, 1, 0.26, 0.08, 0.95, 0.1, 0.95);
    mat(OBJ.gold, C.gold, 1, 0.22, 1, 0.4, 0, 1.35);
    mat(OBJ.chip, C.chip, 1, 0.35, 0, 0.8, 0, 1);
    mat(OBJ.rim, C.white, 0.34, 0.22, 0, 1, 0, 1);
    for (const k of [OBJ.arc, OBJ.line]) mat(k, C.current, 1, 0.16, 0.04, 1, 0.05, 1.15, [0.05, 0.05, 0.05], lite ? [0, 0, 0, 1] : [...C.sheen, 0.35], [lite ? 0 : 0.32, 1.45, 400]);
    for (const k of [OBJ.pearl, OBJ.pearl + 1]) mat(k, C.white, 1, 0.14, 0, 1, 0.06, 1, [0, 0, 0], lite ? [0, 0, 0, 1] : [...C.sheen, 1], [lite ? 0 : 0.35, 1.3, 400]);
    mat(OBJ.amber, C.amber, 1, 0.16, 0, 1, 0, 1);
    ORBITS.forEach((o, i) => { const c = lin(o.color); d.set([c[0], c[1], c[2], 0], OBJ0 + (OBJ.ring0 + i) * OBJF + 16); });
  }

  // camera come PerspectiveCamera(29°) che arretra quando il riquadro è stretto; proiezione con profondità 0..1 (WebGPU)
  resize(w: number, h: number) {
    const aspect = w / h, near = 1, far = 1000, tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    this.camZ = Math.max(184, (54 / tan) * Math.max(1, 1 / aspect));
    const p = this.s.proj; p.fill(0);
    p[0] = 1 / (aspect * tan); p[5] = 1 / tan; p[10] = -far / (far - near); p[11] = -1; p[14] = (-far * near) / (far - near);
    const v = this.s.view; compose(v, 0, 0, -this.camZ, 0, 0, 0, 1);
    this.data.set(v, 0); this.data.set(p, 16); this.data.set([0, 0, this.camZ, 0], 48);
  }

  pack(a: LogoAnim) {
    const d = this.data, s = this.s, v = this.v;
    compose(s.root, 0, a.rootP[0], a.rootP[1], a.rootR[0], a.rootR[1], 0, 1);
    compose(s.spin, 0, 0, 0, 0, a.ang, -a.vel * 0.0045, 1);
    compose(s.badge, 0, 0, 0, a.badgeR[0], a.badgeR[1], a.badgeR[2], a.badgeS);
    mul(s.wb, mul(s.tmp, s.root, s.spin), s.badge);
    compose(s.fg, a.fgP[0], a.fgP[1], a.fgP[2], 0, 0, 0, 1);
    mul(s.wfg, s.wb, s.fg);
    for (let i = 0; i < ORBITS.length; i++) mul(s.wo[i], s.root, s.tilt[i]);
    d.set(s.root, 32);
    d.set(s.wb, OBJ0 + OBJ.plate * OBJF); d.set(s.wb, OBJ0 + OBJ.gold * OBJF); d.set(s.wb, OBJ0 + OBJ.chip * OBJF); d.set(s.wb, OBJ0 + OBJ.rim * OBJF);
    const arc = OBJ0 + OBJ.arc * OBJF, line = OBJ0 + OBJ.line * OBJF;
    d.set(s.wfg, arc); d.set(s.wfg, line);
    d[arc + 36] = a.uArc[0]; d[arc + 37] = a.uArc[1]; d[line + 36] = a.uLine[0]; d[line + 37] = a.uLine[1];
    for (let i = 0; i < 3; i++) {
      const p = CAP_POS[i];
      d.set(mul(s.wc, s.wfg, compose(s.cap, p.x, p.y, p.z, 0, 0, 0, a.nodeS[i])), OBJ0 + (OBJ.pearl + i) * OBJF);
    }
    const amber = OBJ0 + OBJ.amber * OBJF, e = a.amberE;
    d[amber + 20] = C.amber[0] * e; d[amber + 21] = C.amber[1] * e; d[amber + 22] = C.amber[2] * e;

    // ordine dei trasparenti come in three.js: prima ciò che sta dietro al filetto, poi il filetto, poi il resto
    const rimZ = point(v, s.wb, 0, 0, FRONT - 0.15).z, rootPhase = s.root[14] < rimZ ? 0 : 1;
    for (let i = 0; i < ORBITS.length; i++) { const o = OBJ0 + (OBJ.ring0 + i) * OBJF; d.set(s.wo[i], o); d[o + 19] = a.ringA; d[o + 35] = rootPhase; }
    d[97] = a.particleTime; d[98] = rootPhase;

    // luci puntiformi: quella che segue il puntatore e la lampada ambra sulla fine della C
    point(v, s.wfg, LAMP.x, LAMP.y, LAMP.z);
    d[80] = a.cur.x * 65; d[81] = -a.cur.y * 55; d[82] = 95; d[83] = 220; d[84] = v.x; d[85] = v.y; d[86] = v.z; d[87] = 68;
    d[88] = C.ptr[0] * 1.4; d[89] = C.ptr[1] * 1.4; d[90] = C.ptr[2] * 1.4; d[91] = 1.5;
    d[92] = C.amber[0] * a.lampI; d[93] = C.amber[1] * a.lampI; d[94] = C.amber[2] * a.lampI; d[95] = 1.2;

    // bagliori: alone ambra, testa della corrente, scie delle due orbite
    let o = SPR0;
    const sprite = (size: number, col: readonly number[], alpha: number) => {
      d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z; d[o + 3] = size;
      d[o + 4] = col[0]; d[o + 5] = col[1]; d[o + 6] = col[2]; d[o + 7] = alpha;
      d[o + 8] = v.z < rimZ ? 0 : 1;
      o += SPRF;
    };
    point(v, s.wfg, HALO.x, HALO.y, HALO.z); sprite(a.haloS * a.badgeS, C.amber, a.haloA);
    point(v, s.wfg, a.spark.x, a.spark.y, a.spark.z); sprite(9.5 * a.badgeS, C.spark, a.spark.a);
    for (let i = 0; i < ORBITS.length; i++) {
      const orb = ORBITS[i];
      for (let j = 0; j < this.q.trail; j++) {
        const ang = a.orbPh[i] + orb.ph - j * 0.035 * Math.sign(orb.speed);
        point(v, s.wo[i], Math.cos(ang) * orb.r, Math.sin(ang) * orb.r, 0);
        sprite(8.2 - j * 0.6, ORBIT_COL[i], a.trailA * (0.95 - j * 0.1));
      }
    }
    return (o - SPR0) / SPRF;
  }
}

if (MAX_OBJ < 11 || MAX_SPRITE < 20) throw new Error("logo3d: dimensioni degli array uniform insufficienti");
