// Il telo che copre il podio quando il podio del mese non è ancora visibile. La forma è una simulazione fisica fatta una
// volta sola fuori dall'app (scripts/bake-podium-cloth.cjs): un telo di cotone pesante lanciato un po' storto sui tre
// gradoni (le coppe sono già state tolte), che si appoggia, scivola, ricade in pieghe e si allarga sulla pedana. La
// simulazione (dinamica basata sulle posizioni, XPBD a piccoli passi) usa le stesse misure della sala (stage.ts); il
// risultato è una griglia di punti salvata in public/podium/telo.bin, che la scena trasforma in una mesh a due facce.
import { DAIS, STEP_X, STEP_H, STEP_D, COL_X, COL_Z } from "./stage";

export type Drape = { nx: number; nz: number; spacing: number; pos: Float32Array };

// ---------- gli ostacoli: funzioni di distanza con segno (negative dentro) e il loro gradiente ----------
type Hit = { d: number; gx: number; gy: number; gz: number };
type Shape = { box: number[]; dist: (x: number, y: number, z: number, o: Hit) => void };
const roundBox = (c: number[], h: number[], r: number): Shape => ({
  box: [c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2]],
  dist(x, y, z, o) {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const qx = Math.abs(px) - (h[0] - r), qy = Math.abs(py) - (h[1] - r), qz = Math.abs(pz) - (h[2] - r);
    const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0), out = Math.hypot(mx, my, mz);
    if (out > 0) { o.d = out - r; o.gx = (mx / out) * Math.sign(px); o.gy = (my / out) * Math.sign(py); o.gz = (mz / out) * Math.sign(pz); return; }
    const m = Math.max(qx, qy, qz);
    o.d = m - r; o.gx = m === qx ? Math.sign(px) || 1 : 0; o.gy = m === qy && m !== qx ? Math.sign(py) || 1 : 0; o.gz = m === qz && m !== qx && m !== qy ? Math.sign(pz) || 1 : 0;
  },
});
// il podio come lo vede il telo: pedana e gradini (le coppe sono già state tolte), più le basi delle colonne vicine
export function podiumShapes(): Shape[] {
  const shapes: Shape[] = [
    roundBox([0, 0.09, 0.1], [4.55, 0.09, 1.95], 0.025),
    roundBox([0, 0.27, 0.05], [4.1, 0.09, 1.7], 0.025),
  ];
  STEP_X.forEach((x, i) => shapes.push(roundBox([x, DAIS + STEP_H[i] / 2, 0], [1.125, STEP_H[i] / 2, STEP_D + 0.045], 0.03)));
  for (const s of [-1, 1]) for (const z of COL_Z) shapes.push(roundBox([s * COL_X, 0.4, z], [0.62, 0.4, 0.62], 0.02));
  return shapes;
}

// la stoffa non passa attraverso sé stessa: i punti lontani sulla griglia ma vicini nello spazio si respingono (griglia
// di celle con l'indirizzo calcolato, ordinata per conteggio a ogni passo)
const TABLE = 1 << 16;
const cellStart = new Int32Array(TABLE + 1), cellOf: { ids: Int32Array; key: Int32Array } = { ids: new Int32Array(0), key: new Int32Array(0) };
function selfCollide(x: Float32Array, nx: number, n: number, r: number) {
  if (cellOf.ids.length < n) { cellOf.ids = new Int32Array(n); cellOf.key = new Int32Array(n); }
  const size = 2 * r, ids = cellOf.ids, key = cellOf.key;
  const hash = (ix: number, iy: number, iz: number) => ((Math.imul(ix, 92837111) ^ Math.imul(iy, 689287499) ^ Math.imul(iz, 283923481)) >>> 0) & (TABLE - 1);
  cellStart.fill(0);
  for (let p = 0; p < n; p++) { const k = hash(Math.floor(x[p * 3] / size), Math.floor(x[p * 3 + 1] / size), Math.floor(x[p * 3 + 2] / size)); key[p] = k; cellStart[k + 1]++; }
  for (let k = 0; k < TABLE; k++) cellStart[k + 1] += cellStart[k];
  const fill = cellStart.slice(0, TABLE);
  for (let p = 0; p < n; p++) ids[fill[key[p]]++] = p;
  const min2 = size * size;
  for (let p = 0; p < n; p++) {
    const px = x[p * 3], py = x[p * 3 + 1], pz = x[p * 3 + 2], ip = p % nx, jp = (p / nx) | 0;
    const cx = Math.floor(px / size), cy = Math.floor(py / size), cz = Math.floor(pz / size);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const k = hash(cx + dx, cy + dy, cz + dz);
      for (let e = cellStart[k], end = cellStart[k + 1]; e < end; e++) {
        const q = ids[e];
        if (q <= p) continue;
        const iq = q % nx, jq = (q / nx) | 0;
        if (Math.abs(iq - ip) <= 2 && Math.abs(jq - jp) <= 2) continue; // vicini di stoffa: ci pensano i vincoli
        const ux = x[q * 3] - px, uy = x[q * 3 + 1] - py, uz = x[q * 3 + 2] - pz, d2 = ux * ux + uy * uy + uz * uz;
        if (d2 >= min2 || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), push = (size - d) / (2 * d);
        x[p * 3] -= ux * push; x[p * 3 + 1] -= uy * push; x[p * 3 + 2] -= uz * push;
        x[q * 3] += ux * push; x[q * 3 + 1] += uy * push; x[q * 3 + 2] += uz * push;
      }
    }
  }
}

// numeri pseudo-casuali ripetibili (la stessa simulazione dà sempre lo stesso telo)
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export type DrapeOptions = {
  // tilt: pendenza iniziale lungo la larghezza (un lato lanciato più alto); wave: ampiezza delle onde del lancio (m)
  width: number; depth: number; spacing: number; center: number[]; height: number; yaw: number; tilt: number; wave: number;
  // bend: rigidezza a flessione della stoffa (N·m); drag: frenata dell'aria (1/s), alta = il telo si posa piano
  // self: raggio dell'autocollisione (m), 0 la spegne
  seconds: number; substeps: number; stretch: number; shear: number; compress: number; bend: number; drag: number; friction: number; thickness: number; self: number; seed: number;
  onProgress?: (k: number) => void;
};
export const TELO: DrapeOptions = {
  width: 11, depth: 7.2, spacing: 0.075, center: [0.1, 0, 0.15], height: 2.4, yaw: 0.09, tilt: -0.06, wave: 0.15,
  seconds: 7, substeps: 14, stretch: 1e-6, shear: 1.2e-2, compress: 2e-3, bend: 3e-3, drag: 2.5, friction: 0.4, thickness: 0.028, self: 0.022, seed: 9,
};

// la simulazione: telo di cotone (0,32 kg/m²) che cade da fermo; vincoli di distanza tra vicini (stiramento e taglio,
// rigidi) e tra i punti a due passi (flessione, cedevole); urti contro il podio e il pavimento con l'attrito
export function drape(o: DrapeOptions = TELO): Drape {
  const nx = Math.round(o.width / o.spacing) + 1, nz = Math.round(o.depth / o.spacing) + 1, n = nx * nz, s = o.spacing;
  const x = new Float32Array(n * 3), prev = new Float32Array(n * 3), v = new Float32Array(n * 3);
  const rand = rng(o.seed), cy = Math.cos(o.yaw), sy = Math.sin(o.yaw);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3, u = i * s - o.width / 2, w = j * s - o.depth / 2;
    // appena ondulato e storto: un telo lanciato non cade mai piatto né in squadra
    x[k] = o.center[0] + u * cy + w * sy;
    x[k + 1] = o.height + u * o.tilt + o.wave * Math.sin(u * 0.9 + 1) * Math.sin(w * 1.3 + 0.4) + 0.01 * rand();
    x[k + 2] = o.center[2] - u * sy + w * cy;
  }
  // vincoli: [a, b, lunghezza, cedevolezza]
  const ca: number[] = [], cb: number[] = [], rest: number[] = [], comp: number[] = [];
  const link = (a: number, b: number, c: number) => { ca.push(a); cb.push(b); rest.push(Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2])); comp.push(c); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * nx + i;
    if (i + 1 < nx) link(a, a + 1, o.stretch);
    if (j + 1 < nz) link(a, a + nx, o.stretch);
    // il taglio cedevole: rigido, il reticolo si bloccherebbe e il telo non potrebbe fare pieghe
    if (i + 1 < nx && j + 1 < nz) { link(a, a + nx + 1, o.shear); link(a + 1, a + nx, o.shear); }
  }
  const A = Int32Array.from(ca), B = Int32Array.from(cb), L = Float32Array.from(rest), C = Float32Array.from(comp);
  // flessione: la differenza seconda lungo le righe e le colonne (x[i-1] + x[i+1] - 2 x[i]) tende a zero; con la
  // cedevolezza s² / rigidezza la risposta non dipende dal passo della griglia, e lo zig-zag (che le molle tra punti a due
  // passi non vedono) costa più di tutto
  const bends: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * nx + i;
    if (i > 0 && i + 1 < nx) bends.push(a - 1, a, a + 1);
    if (j > 0 && j + 1 < nz) bends.push(a - nx, a, a + nx);
  }
  const T = Int32Array.from(bends), bendK = (s * s) / o.bend;
  const shapes = podiumShapes(), hit: Hit = { d: 0, gx: 0, gy: 0, gz: 0 }, best: Hit = { d: 0, gx: 0, gy: 0, gz: 0 };
  const mass = 0.32 * s * s, w = 1 / mass, h = 1 / 60 / o.substeps, th = o.thickness;
  // gli ostacoli per cella di mezzo metro in pianta: ogni punto prova solo quelli della sua cella
  const G = 0.5, gx0 = -10, gz0 = -8, gw = 40, gd = 32, cells: Shape[][] = Array.from({ length: gw * gd }, () => []);
  for (const sh of shapes) {
    const b = sh.box;
    for (let gz = Math.max(0, Math.floor((b[2] - th - gz0) / G)); gz <= Math.min(gd - 1, Math.floor((b[5] + th - gz0) / G)); gz++)
      for (let gx = Math.max(0, Math.floor((b[0] - th - gx0) / G)); gx <= Math.min(gw - 1, Math.floor((b[3] + th - gx0) / G)); gx++) cells[gz * gw + gx].push(sh);
  }
  const near = (px: number, pz: number) => {
    const gx = Math.floor((px - gx0) / G), gz = Math.floor((pz - gz0) / G);
    return gx >= 0 && gz >= 0 && gx < gw && gz < gd ? cells[gz * gw + gx] : [];
  };
  const frames = Math.round(o.seconds * 60);
  for (let f = 0; f < frames; f++) {
    // nell'ultimo secondo l'aria frena sempre di più: il telo si ferma dove si è posato
    const settle = Math.max(0, (f - (frames - 60)) / 60), damp = 1 - (o.drag / 60 / o.substeps + 0.03 * settle * settle);
    for (let sub = 0; sub < o.substeps; sub++) {
      for (let k = 0; k < n * 3; k += 3) {
        prev[k] = x[k]; prev[k + 1] = x[k + 1]; prev[k + 2] = x[k + 2];
        v[k] *= damp; v[k + 1] = (v[k + 1] - 9.81 * h) * damp; v[k + 2] *= damp;
        x[k] += v[k] * h; x[k + 1] += v[k + 1] * h; x[k + 2] += v[k + 2] * h;
      }
      // Gauss-Seidel avanti e indietro a passi alterni: un verso solo trascinerebbe il telo da una parte
      const fwd = (f * o.substeps + sub) % 2 === 0;
      for (let q = 0; q < A.length; q++) {
        const c = fwd ? q : A.length - 1 - q, a = A[c] * 3, b = B[c] * 3;
        const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2], l = Math.hypot(dx, dy, dz);
        if (l < 1e-9) continue;
        // la stoffa resiste a tirare, quasi niente a comprimersi: così si piega in poche onde ampie, non in grinze minute
        const k = (l < L[c] ? Math.max(C[c], o.compress) : C[c]) / (h * h), dl = -(l - L[c]) / (2 * w + k) * w / l;
        x[a] += dx * dl; x[a + 1] += dy * dl; x[a + 2] += dz * dl;
        x[b] -= dx * dl; x[b + 1] -= dy * dl; x[b + 2] -= dz * dl;
      }
      for (let p = 0; p < n; p++) {
        const k = p * 3, px = x[k], py = x[k + 1], pz = x[k + 2];
        best.d = py - th; best.gx = 0; best.gy = 1; best.gz = 0;
        for (const sh of near(px, pz)) {
          const bb = sh.box;
          if (px < bb[0] - th || px > bb[3] + th || py < bb[1] - th || py > bb[4] + th || pz < bb[2] - th || pz > bb[5] + th) continue;
          sh.dist(px, py, pz, hit);
          if (hit.d - th < best.d) { best.d = hit.d - th; best.gx = hit.gx; best.gy = hit.gy; best.gz = hit.gz; }
        }
        if (best.d >= 0) continue;
        // fuori dall'ostacolo lungo la normale, poi l'attrito sul movimento tangente di questo passo
        x[k] -= best.gx * best.d; x[k + 1] -= best.gy * best.d; x[k + 2] -= best.gz * best.d;
        const mx = x[k] - prev[k], my = x[k + 1] - prev[k + 1], mz = x[k + 2] - prev[k + 2];
        const mn = mx * best.gx + my * best.gy + mz * best.gz;
        const tx = mx - mn * best.gx, ty = my - mn * best.gy, tz = mz - mn * best.gz, tl = Math.hypot(tx, ty, tz);
        const keep = tl > 1e-12 ? Math.max(0, 1 - (o.friction * -best.d) / tl) : 0;
        x[k] -= tx * (1 - keep); x[k + 1] -= ty * (1 - keep); x[k + 2] -= tz * (1 - keep);
      }
      for (let q = 0; q < T.length; q += 3) {
        const t = fwd ? q : T.length - 3 - q, a = T[t] * 3, m = T[t + 1] * 3, b = T[t + 2] * 3;
        const dx = x[a] + x[b] - 2 * x[m], dy = x[a + 1] + x[b + 1] - 2 * x[m + 1], dz = x[a + 2] + x[b + 2] - 2 * x[m + 2];
        const l = Math.hypot(dx, dy, dz);
        if (l < 1e-9) continue;
        const dl = -l / (6 * w + bendK / (h * h)) * w / l;
        x[a] += dx * dl; x[a + 1] += dy * dl; x[a + 2] += dz * dl;
        x[b] += dx * dl; x[b + 1] += dy * dl; x[b + 2] += dz * dl;
        x[m] -= 2 * dx * dl; x[m + 1] -= 2 * dy * dl; x[m + 2] -= 2 * dz * dl;
      }
      if (o.self > 0) selfCollide(x, nx, n, o.self);
      // velocità dai passi fatti, con un tetto: una spinta d'urto non deve diventare un lancio
      for (let k = 0; k < n * 3; k += 3) {
        let vx = (x[k] - prev[k]) / h, vy = (x[k + 1] - prev[k + 1]) / h, vz = (x[k + 2] - prev[k + 2]) / h;
        const sp = Math.hypot(vx, vy, vz);
        if (sp > 20) { vx *= 20 / sp; vy *= 20 / sp; vz *= 20 / sp; }
        v[k] = vx; v[k + 1] = vy; v[k + 2] = vz;
      }
    }
    o.onProgress?.(f / frames);
  }
  return { nx, nz, spacing: s, pos: x };
}

// ---------- il file: intestazione e posizioni quantizzate (decimi di millimetro) ----------
// intestazione di 36 byte: "TELO", colonne e righe, passo, minimo e scala per asse; poi x, y, z di ogni punto (uint16)
const MAGIC = 0x4f4c4554, HEAD = 36;
export function encodeDrape(d: Drape): ArrayBuffer {
  const n = d.nx * d.nz, buf = new ArrayBuffer(HEAD + n * 6), head = new DataView(buf);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], d.pos[p * 3 + c]); hi[c] = Math.max(hi[c], d.pos[p * 3 + c]); }
  const scale = hi.map((h, c) => Math.max(h - lo[c], 1e-6) / 65535);
  head.setUint32(0, MAGIC, true); head.setUint16(4, d.nx, true); head.setUint16(6, d.nz, true); head.setFloat32(8, d.spacing, true);
  for (let c = 0; c < 3; c++) { head.setFloat32(12 + c * 4, lo[c], true); head.setFloat32(24 + c * 4, scale[c], true); }
  const q = new Uint16Array(buf, HEAD, n * 3);
  for (let p = 0; p < n * 3; p++) q[p] = Math.round((d.pos[p] - lo[p % 3]) / scale[p % 3]);
  return buf;
}
export function decodeDrape(buf: ArrayBuffer): Drape {
  const head = new DataView(buf);
  if (buf.byteLength < HEAD || head.getUint32(0, true) !== MAGIC) throw new Error("telo.bin non valido");
  const nx = head.getUint16(4, true), nz = head.getUint16(6, true), spacing = head.getFloat32(8, true), n = nx * nz;
  if (buf.byteLength !== HEAD + n * 6) throw new Error("telo.bin troncato");
  const lo = [0, 1, 2].map((c) => head.getFloat32(12 + c * 4, true)), scale = [0, 1, 2].map((c) => head.getFloat32(24 + c * 4, true));
  const q = new Uint16Array(buf, HEAD, n * 3), pos = new Float32Array(n * 3);
  for (let p = 0; p < n * 3; p++) pos[p] = lo[p % 3] + q[p] * scale[p % 3];
  return { nx, nz, spacing, pos };
}

// la griglia del telo raffinata k volte con Catmull-Rom (passa per i punti simulati): pieghe tonde e contorni lisci
// invece degli spigoli dei 7,5 cm della simulazione
export function refineDrape(d: Drape, k: number): Drape {
  if (k <= 1) return d;
  const nx = (d.nx - 1) * k + 1, nz = (d.nz - 1) * k + 1, pos = new Float32Array(nx * nz * 3);
  const W = Array.from({ length: k }, (_, r) => { const t = r / k, t2 = t * t, t3 = t2 * t; return [(-t + 2 * t2 - t3) / 2, (2 - 5 * t2 + 3 * t3) / 2, (t + 4 * t2 - 3 * t3) / 2, (-t2 + t3) / 2]; });
  const src = (i: number, j: number) => (Math.max(0, Math.min(d.nz - 1, j)) * d.nx + Math.max(0, Math.min(d.nx - 1, i))) * 3;
  for (let J = 0; J < nz; J++) for (let I = 0; I < nx; I++) {
    const i0 = Math.floor(I / k), j0 = Math.floor(J / k), wx = W[I % k], wz = W[J % k], o = (J * nx + I) * 3;
    for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
      const w = wx[a] * wz[b], s = src(i0 - 1 + a, j0 - 1 + b);
      pos[o] += w * d.pos[s]; pos[o + 1] += w * d.pos[s + 1]; pos[o + 2] += w * d.pos[s + 2];
    }
  }
  return { nx, nz, spacing: d.spacing / k, pos };
}

// il telo cotto, scaricato una volta per pagina (serve solo a chi vede il podio coperto)
let loading: Promise<Drape> | null = null;
export function loadDrape(): Promise<Drape> {
  if (!loading) {
    loading = fetch(`${process.env.PUBLIC_URL || ""}/podium/telo.bin`)
      .then((r) => { if (!r.ok) throw new Error(`telo.bin: ${r.status}`); return r.arrayBuffer(); })
      .then(decodeDrape);
    loading.catch(() => { loading = null; });
  }
  return loading;
}
