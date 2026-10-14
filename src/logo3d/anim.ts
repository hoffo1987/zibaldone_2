// Il logo senza GPU: costanti della composizione, animazione (identica a quella della versione three.js) e pose degli
// oggetti nello spazio del mondo. Lo usano sia il motore WebGPU sia il logo in Canvas 2D; si prova anche in Node.

export const TAU = Math.PI * 2;
export const A0 = Math.atan2(9.6, 11.5);
export const FRONT = 5.9, BACK = -5.9;
export const PLATE_TOP = 6.3; // faccia anteriore della targa (profondità 5,8 + smussatura 3,4, spostata di -2,9)
// numeri massimi di elementi negli array uniform degli shader
export const MAX_OBJ = 12, MAX_SPRITE = 24, MAX_PARTICLE = 80;
export type V3 = { x: number; y: number; z: number };
export const arcAt = (t: number, z: number): V3 => { const a = A0 + t * (TAU - 2 * A0); return { x: Math.cos(a) * 15, y: Math.sin(a) * 15, z }; };
export const lineAt = (t: number, z: number): V3 => ({ x: -1 + 16 * t, y: 0, z });
export const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
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

export const ORBITS = [
  { r: 44.5, tilt: [1.2, 0.35, 0], speed: 0.55, color: 0x5eead4, ph: 0 },
  { r: 48.5, tilt: [1.0, -0.6, 0.4], speed: -0.38, color: 0xfbbf24, ph: 2.1 },
];
export const TRACES = [[[-22, -20], [-22, -6], [-12, 4], [-12, 18]], [[-4, 22], [-4, 10], [6, 0], [20, 0]], [[22, -22], [10, -22], [2, -14], [2, -4]], [[-24, 12], [-16, 20], [-6, 20]], [[14, 24], [14, 12], [22, 4]], [[-14, -24], [-4, -24], [4, -16]]];
export const CAP_POS = [arcAt(0, FRONT + 2.15), lineAt(0, FRONT + 2.15), arcAt(1, FRONT + 2.15)]; // perla, perla, ambra
export const NODE_R = [4.2, 3.2, 4.2];
export const ARC_Z = FRONT + 1.45, ARC_R = 2.55, LINE_Z = FRONT + 1.25, LINE_R = 1.55;
export const LAMP = arcAt(1, FRONT + 9.5), HALO = arcAt(1, FRONT + 3.8);
export const KEY = (() => { const l = Math.hypot(60, 80, 115); return [60 / l, 80 / l, 115 / l]; })();
export const RIM = (() => { const l = Math.hypot(-100, 15, -70); return [-100 / l, 15 / l, -70 / l]; })();
export const FOV = 29;
// lo "studio" che si riflette sul logo: pannelli luminosi [larghezza, altezza, colore, intensità, x, y, z] rivolti
// verso l'origine, su uno sfondo verde scurissimo
export const STUDIO_BG = 0x06100e;
export const STUDIO: [number, number, number, number, number, number, number][] = [
  [10, 6, 0xffffff, 3.6, 3.5, 5.5, 6], [14, 3.5, 0xffffff, 1.1, 0, -2.5, 9], [4.5, 11, 0x2dd4bf, 2.6, -8, 1.5, 1.5],
  [11, 1.5, 0xfbbf24, 2.8, 4, -6, -2], [3, 3, 0xffffff, 5.0, -4, 7, 5], [16, 16, 0x0e3b36, 0.55, 0, 0, -10],
];

// ---------- animazione ----------

export class LogoAnim {
  T: number;
  cyc = 0; flash = 0; hoverK = 0; boost = 0; orbPh = [0, 0];
  ang = 0; vel = 0; settle: number | null = null;
  drag = false; hover = false;
  ptr = { x: 0, y: 0 }; cur = { x: 0, y: 0 };
  // valori derivati, letti da chi disegna (aggiornati sul posto: nessuna allocazione per fotogramma)
  badgeS = 1; readonly badgeR = [0, 0, 0]; arcK = 1; lineK = 1; readonly nodeS = [4.2, 3.2, 4.2]; on = 1;
  readonly uArc = [-1, 0]; readonly uLine = [-1, 0]; readonly spark = { x: 0, y: 0, z: 0, a: 0 }; amberE = 0; lampI = 0; haloA = 0; haloS = 11.5;
  ringA = 0; trailA = 0; readonly rootR = [0, 0]; readonly rootP = [0, 0]; readonly fgP = [0, 0, 0];
  // scintille: dati di nascita (velocità, vita, istante) in un anello; la posizione si calcola in forma chiusa
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
  // crescita media delle tre perle durante l'entrata (0..1)
  get nodeK() { return clamp01((this.nodeS[0] / NODE_R[0] + this.nodeS[1] / NODE_R[1] + Math.min(1, this.nodeS[2] / NODE_R[2])) / 3); }

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

// ---------- pose: matrici 4×4 per colonne, in Float64Array riusate ----------

export type M = Float64Array;
// T·R(xyz)·S come Object3D.updateMatrix (rotazioni di Eulero in ordine XYZ, scala uniforme)
export const compose = (out: M, px: number, py: number, pz: number, rx: number, ry: number, rz: number, s: number) => {
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  out[0] = c * e * s; out[1] = (af + be * d) * s; out[2] = (bf - ae * d) * s; out[3] = 0;
  out[4] = -c * f * s; out[5] = (ae - bf * d) * s; out[6] = (be + af * d) * s; out[7] = 0;
  out[8] = d * s; out[9] = -b * c * s; out[10] = a * c * s; out[11] = 0;
  out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  return out;
};
export const mul = (out: M, a: M, b: M) => {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
  }
  return out;
};
export const point = (out: V3, m: M, x: number, y: number, z: number) => {
  out.x = m[0] * x + m[4] * y + m[8] * z + m[12]; out.y = m[1] * x + m[5] * y + m[9] * z + m[13]; out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
};
export const m4 = () => new Float64Array(16);

// gerarchia della scena: radice (fluttua e segue il puntatore), rotazione, entrata, primo piano (C, pista, perle), orbite
export class Pose {
  readonly root = m4(); readonly spin = m4(); readonly badge = m4(); readonly wb = m4(); readonly fg = m4(); readonly wfg = m4();
  readonly tmp = m4(); readonly tilt = ORBITS.map(() => m4()); readonly wo = ORBITS.map(() => m4());
  constructor() { ORBITS.forEach((o, i) => compose(this.tilt[i], 0, 0, 0, o.tilt[0], o.tilt[1], o.tilt[2], 1)); }
  update(a: LogoAnim) {
    compose(this.root, 0, a.rootP[0], a.rootP[1], a.rootR[0], a.rootR[1], 0, 1);
    compose(this.spin, 0, 0, 0, 0, a.ang, -a.vel * 0.0045, 1);
    compose(this.badge, 0, 0, 0, a.badgeR[0], a.badgeR[1], a.badgeR[2], a.badgeS);
    mul(this.wb, mul(this.tmp, this.root, this.spin), this.badge);
    compose(this.fg, a.fgP[0], a.fgP[1], a.fgP[2], 0, 0, 0, 1);
    mul(this.wfg, this.wb, this.fg);
    for (let i = 0; i < ORBITS.length; i++) mul(this.wo[i], this.root, this.tilt[i]);
  }
}

// camera come PerspectiveCamera(29°) che arretra quando il riquadro è stretto
export const cameraZ = (aspect: number) => Math.max(184, (54 / Math.tan(((FOV / 2) * Math.PI) / 180)) * Math.max(1, 1 / aspect));
