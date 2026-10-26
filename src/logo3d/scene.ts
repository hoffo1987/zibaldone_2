// Il logo per la GPU: geometrie raggruppate per materiale, occlusione d'ambiente precalcolata e preparazione dei dati di
// ogni fotogramma in un unico blocco uniform. Niente GPU qui dentro: il modulo si prova anche in Node.
import { roundedSquare, roundedPlate, extrude, fromExtrude, tube, Curve3, LineCurve3, polyline, sphere, torus, box, transform, merge, type Geo } from "./geometry";
import {
  TAU, A0, FRONT, BACK, PLATE_TOP, MAX_OBJ, MAX_SPRITE, arcAt, lineAt, clamp01, lin, ORBITS, TRACES, CAP_POS, NODE_R, ARC_Z, ARC_R, LINE_Z, LINE_R,
  LAMP, HALO, KEY, RIM, FOV, Pose, point, cameraZ, compose, mul, m4, type Quality, type LogoAnim, type V3,
} from "./anim";
export { TAU, FRONT, BACK, arcAt, lineAt, ease, lin, quality, LogoAnim, FOV } from "./anim";
export type { Quality } from "./anim";

// indexed: first/count in indici (a 16 bit, locali al gruppo, spostati di base); altrimenti in vertici
export type Batch = { first: number; count: number; base: number; indexed: boolean };
export type Meshes = {
  vertices: Float32Array; // 7 float per vertice: posizione, normale, parametro lungo la curva
  colors: Float32Array; // colori per vertice della targa (3 float, stessi indici dei suoi vertici)
  indices: Uint16Array;
  plate: Batch; gold: Batch; chip: Batch; rim: Batch; arc: Batch; line: Batch; cap: Batch; ring0: Batch; ring1: Batch;
};


// Tutte le parti ferme rispetto alla targa (piastra, filetto, incastonature, circuito sul retro, chip, piedini) sono già
// trasformate nello spazio della targa: tutti i dettagli d'oro richiedono un solo disegno.
export function buildMeshes(q: Quality): Meshes {
  // Smalto su una scocca raccordata: gli anelli condividono i vertici e le normali sono continue fino ai coperchi.
  const plate = roundedPlate(29.5, 14.5, 5.8, 2.6, 3.4, q.bevel, q.curve);
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
  // Due filetti metallici incassati sui fianchi rendono leggibile lo spessore anche durante la rotazione.
  const edge = roundedSquare(31.95, 16.95).points(q.curve);
  const edgePoints = edge.map((p) => [p.x, p.y]); edgePoints.push(edgePoints[0]);
  for (const z of [-1.8, 1.8]) gold.push(tube(polyline(edgePoints, z), q.curve * 8, 0.22, 8));
  const socket = torus(1, 0.16, 8, 24);
  ([[arcAt(0, 0), 4.2], [lineAt(0, 0), 3.2], [arcAt(1, 0), 4.2]] as [V3, number][]).forEach(([p, r]) => { const s = r * 0.92; gold.push(transform(socket, [p.x, p.y, FRONT + 0.25], [s, s, s])); });
  TRACES.forEach((pts) => {
    gold.push(tube(polyline(pts, BACK - 0.5), pts.length * 2, 0.65, 6));
    [pts[0], pts[pts.length - 1]].forEach(([x, y]) => gold.push(transform(capGeo, [x, y, BACK - 0.6], [1.9, 1.9, 0.6])));
  });
  const pin = box(1.1, 2.6, 0.8);
  for (let k = 0; k < 6; k++) [-1, 1].forEach((s) => gold.push(transform(pin, [1.75 + k * 2.5, -10 + s * 6.6, BACK - 0.9])));
  // Piccole teste metalliche e chip con spigoli raccordati, veri volumi anche sul retro.
  for (const x of [-21, 21]) for (const y of [-21, 21]) {
    gold.push(transform(socket, [x, y, PLATE_TOP + 0.08], [0.8, 0.8, 0.8]));
    gold.push(transform(capGeo, [x, y, PLATE_TOP + 0.12], [0.55, 0.55, 0.18]));
  }
  const chip = transform(roundedPlate(5, 0.8, 1.7, 0.35, 0.35, q.rimBevel, 8), [8, -10, BACK - 1.4], [1.5, 1, 1]);
  // la "C" e la pista: tubi con il parametro lungo la curva per la corrente e per il disegno progressivo
  const arc = tube(new Curve3((t) => arcAt(t, ARC_Z)), q.arc, ARC_R, q.radial);
  const line = tube(new LineCurve3(lineAt(0, LINE_Z), lineAt(1, LINE_Z)), 8, LINE_R, q.radial);
  const parts: [keyof Omit<Meshes, "vertices" | "colors" | "indices">, Geo][] = [
    ["plate", plate], ["gold", merge(gold)], ["chip", chip], ["rim", rim], ["arc", arc], ["line", line], ["cap", capGeo],
    ["ring0", torus(ORBITS[0].r, 0.2, 6, q.rings)], ["ring1", torus(ORBITS[1].r, 0.2, 6, q.rings)],
  ];
  // Il solo filetto estruso non ha vertici condivisi; tutte le superfici parametriche usano indici.
  // I gruppi hanno meno di 65536 vertici e usano indici a 16 bit relativi al proprio inizio.
  const plain = (name: string) => name === "rim";
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

// ---------- occlusione d'ambiente della faccia della targa ----------
// Calcolata una volta (forme analitiche: la C e la pista come cilindri adagiati, le perle come sfere, il filetto come un
// gradino basso) in una texture 128×128 che copre la faccia: r filetto, g C, b pista, a perle. I canali separati
// permettono di far comparire ogni ombra insieme all'oggetto che la proietta durante l'entrata.
export const AO_EXTENT = 34; // la texture copre x, y in [-34, 34] (la targa arriva a ±32,1)
const roundedSdf = (x: number, y: number, half: number, r: number) => {
  const qx = Math.abs(x) - (half - r), qy = Math.abs(y) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
export function bakeAO(size = 128): Uint8Array {
  const out = new Uint8Array(size * size * 4), E = AO_EXTENT;
  const hArc = ARC_Z - PLATE_TOP, hLine = LINE_Z - PLATE_TOP, ends = [arcAt(0, 0), arcAt(1, 0)];
  // cilindro di raggio r con l'asse a quota h, a distanza d dall'asse: frazione di cielo coperta (approssimata)
  const cyl = (d: number, r: number, h: number) => Math.min(1, (1.3 * r * h) / (d * d + h * h));
  for (let j = 0; j < size; j++) {
    const y = E - ((j + 0.5) / size) * 2 * E;
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 * E - E, o = (j * size + i) * 4;
      const sIn = roundedSdf(x, y, 27.2, 12.6), sOut = roundedSdf(x, y, 28.3, 13.5);
      const dRim = sIn < 0 ? -sIn : sOut > 0 ? sOut : 0;
      let a = Math.atan2(y, x); if (a < 0) a += TAU;
      const dArc = a >= A0 && a <= TAU - A0 ? Math.abs(Math.hypot(x, y) - 15) : Math.min(...ends.map((e) => Math.hypot(x - e.x, y - e.y)));
      const dLine = Math.hypot(x - Math.min(15, Math.max(-1, x)), y);
      let pearls = 0;
      CAP_POS.forEach((c, k) => {
        const h = c.z - PLATE_TOP, dx = c.x - x, dy = c.y - y, l2 = dx * dx + dy * dy + h * h, l = Math.sqrt(l2);
        pearls += Math.min(1, (1.4 * NODE_R[k] * NODE_R[k] * h) / (l2 * l));
      });
      out[o] = Math.round(255 * 0.32 * Math.exp(-dRim / 0.7));
      out[o + 1] = Math.round(255 * cyl(dArc, ARC_R, hArc));
      out[o + 2] = Math.round(255 * cyl(dLine, LINE_R, hLine));
      out[o + 3] = Math.round(255 * clamp01(pearls));
    }
  }
  return out;
}

// ---------- dati del fotogramma ----------

export const FRAME_FLOATS = 868; // struttura Frame di shaders.ts (3472 byte)
const OBJ0 = 100, SPR0 = 580, OBJF = 40, SPRF = 12;
export const OBJ = { plate: 0, gold: 1, chip: 2, rim: 3, arc: 4, line: 5, pearl: 6, amber: 8, ring0: 9, ring1: 10 };


const C = {
  white: lin(0xffffff), gold: lin(0xe8b04a), chip: lin(0x0b1f1d), current: lin(0xf4fffd), amber: lin(0xfbbf24), sheen: lin(0x9ff3e4),
  spark: lin(0xffe2a0), sky: lin(0xe8fcf8), ground: lin(0x52746b), teal: lin(0x2dd4bf), ptr: lin(0x99f6e4),
};
const ORBIT_COL = ORBITS.map((o) => lin(o.color));

// Riempie il blocco uniform del fotogramma. Restituisce quante istanze di bagliori disegnare.
export class FramePacker {
  readonly data = new Float32Array(FRAME_FLOATS);
  private v: V3 = { x: 0, y: 0, z: 0 };
  private s = { cap: m4(), wc: m4(), view: m4(), proj: m4() };
  readonly pose = new Pose();
  camZ = 184;
  readonly lite: boolean;
  readonly sprites: number;

  constructor(readonly q: Quality) {
    this.lite = q.mobile;
    this.sprites = 2 + 2 * q.trail;
    const d = this.data;
    // parti fisse del blocco: luci direzionali ed emisferica, esposizione
    d.set([C.sky[0] * 0.9, C.sky[1] * 0.9, C.sky[2] * 0.9, 0], 52);
    d.set([C.ground[0] * 0.85, C.ground[1] * 0.85, C.ground[2] * 0.85, 0], 56);
    d.set([0, 1, 0, 0], 60);
    d.set([KEY[0], KEY[1], KEY[2], 0, RIM[0], RIM[1], RIM[2], 0], 64);
    d.set([2.8 * C.white[0], 2.8 * C.white[1], 2.8 * C.white[2], 0, 3.1 * C.teal[0], 3.1 * C.teal[1], 3.1 * C.teal[2], 0], 72);
    d[96] = 1.06; d[99] = 3.8 * Math.tan(((FOV / 2) * Math.PI) / 180); // dimensione delle scintille (gl_PointSize 3.8 con attenuazione)
    // materiali (le parti animate si aggiornano in pack)
    const mat = (k: number, col: number[], a: number, rough: number, metal: number, cc: number, ccr: number, envI: number, emis = [0, 0, 0], sheen = [0, 0, 0, 1], irid = [0, 1.3, 400]) => {
      const o = OBJ0 + k * OBJF;
      d.set([col[0], col[1], col[2], a, emis[0], emis[1], emis[2], envI, rough, metal, cc, ccr, sheen[0], sheen[1], sheen[2], sheen[3], irid[0], irid[1], irid[2], 0, -1, 0, 0, 0], o + 16);
    };
    const lite = this.lite;
    mat(OBJ.plate, C.white, 1, 0.3, 0.12, 0.9, 0.16, 1.05);
    mat(OBJ.gold, C.gold, 1, 0.28, 1, 0.35, 0.12, 1.35);
    mat(OBJ.chip, C.chip, 1, 0.35, 0, 0.8, 0, 1);
    mat(OBJ.rim, C.white, 0.34, 0.22, 0, 1, 0, 1);
    for (const k of [OBJ.arc, OBJ.line]) mat(k, C.current, 1, 0.16, 0.04, 1, 0.05, 1.15, [0.05, 0.05, 0.05], lite ? [0, 0, 0, 1] : [...C.sheen, 0.35], [lite ? 0 : 0.32, 1.45, 400]);
    for (const k of [OBJ.pearl, OBJ.pearl + 1]) mat(k, C.white, 1, 0.14, 0, 1, 0.06, 1, [0, 0, 0], lite ? [0, 0, 0, 1] : [...C.sheen, 1], [lite ? 0 : 0.35, 1.3, 400]);
    mat(OBJ.amber, C.amber, 1, 0.16, 0, 1, 0, 1);
    ORBITS.forEach((o, i) => { const c = lin(o.color); d.set([c[0], c[1], c[2], 0], OBJ0 + (OBJ.ring0 + i) * OBJF + 16); });
    // ombra di contatto sulla parte bassa di C, pista e perle, dove toccano la targa (irid.w dei materiali fisici)
    for (const k of [OBJ.arc, OBJ.line, OBJ.pearl, OBJ.pearl + 1, OBJ.amber]) d[OBJ0 + k * OBJF + 35] = 0.6;
  }

  // camera come PerspectiveCamera(29°) che arretra quando il riquadro è stretto; proiezione con profondità 0..1 (WebGPU)
  resize(w: number, h: number) {
    const aspect = w / h, near = 1, far = 1000, tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    this.camZ = cameraZ(aspect);
    const p = this.s.proj; p.fill(0);
    p[0] = 1 / (aspect * tan); p[5] = 1 / tan; p[10] = -far / (far - near); p[11] = -1; p[14] = (-far * near) / (far - near);
    const v = this.s.view; compose(v, 0, 0, -this.camZ, 0, 0, 0, 1);
    this.data.set(v, 0); this.data.set(p, 16); this.data.set([0, 0, this.camZ, 0], 48);
  }

  pack(a: LogoAnim) {
    const d = this.data, s = this.s, P = this.pose, v = this.v;
    P.update(a);
    d.set(P.root, 32);
    d.set(P.wb, OBJ0 + OBJ.plate * OBJF); d.set(P.wb, OBJ0 + OBJ.gold * OBJF); d.set(P.wb, OBJ0 + OBJ.chip * OBJF); d.set(P.wb, OBJ0 + OBJ.rim * OBJF);
    const arc = OBJ0 + OBJ.arc * OBJF, line = OBJ0 + OBJ.line * OBJF;
    d.set(P.wfg, arc); d.set(P.wfg, line);
    d[arc + 36] = a.uArc[0]; d[arc + 37] = a.uArc[1]; d[line + 36] = a.uLine[0]; d[line + 37] = a.uLine[1];
    for (let i = 0; i < 3; i++) {
      const p = CAP_POS[i];
      d.set(mul(s.wc, P.wfg, compose(s.cap, p.x, p.y, p.z, 0, 0, 0, a.nodeS[i])), OBJ0 + (OBJ.pearl + i) * OBJF);
    }
    // occlusione della targa durante l'entrata: compare insieme alla C, alla pista e alle perle che la proiettano
    const plate = OBJ0 + OBJ.plate * OBJF;
    d[plate + 36] = a.arcK; d[plate + 38] = a.lineK; d[plate + 39] = a.nodeK;
    const amber = OBJ0 + OBJ.amber * OBJF, e = a.amberE;
    d[amber + 20] = C.amber[0] * e; d[amber + 21] = C.amber[1] * e; d[amber + 22] = C.amber[2] * e;

    // ordine dei trasparenti come in three.js: prima ciò che sta dietro al filetto, poi il filetto, poi il resto
    const rimZ = point(v, P.wb, 0, 0, FRONT - 0.15).z, rootPhase = P.root[14] < rimZ ? 0 : 1;
    for (let i = 0; i < ORBITS.length; i++) { const o = OBJ0 + (OBJ.ring0 + i) * OBJF; d.set(P.wo[i], o); d[o + 19] = a.ringA; d[o + 35] = rootPhase; }
    d[97] = a.particleTime; d[98] = rootPhase;

    // luci puntiformi: quella che segue il puntatore e la lampada ambra sulla fine della C
    point(v, P.wfg, LAMP.x, LAMP.y, LAMP.z);
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
    point(v, P.wfg, HALO.x, HALO.y, HALO.z); sprite(a.haloS * a.badgeS, C.amber, a.haloA);
    point(v, P.wfg, a.spark.x, a.spark.y, a.spark.z); sprite(9.5 * a.badgeS, C.spark, a.spark.a);
    for (let i = 0; i < ORBITS.length; i++) {
      const orb = ORBITS[i];
      for (let j = 0; j < this.q.trail; j++) {
        const ang = a.orbPh[i] + orb.ph - j * 0.035 * Math.sign(orb.speed);
        point(v, P.wo[i], Math.cos(ang) * orb.r, Math.sin(ang) * orb.r, 0);
        sprite(8.2 - j * 0.6, ORBIT_COL[i], a.trailA * (0.95 - j * 0.1));
      }
    }
    return (o - SPR0) / SPRF;
  }
}

if (MAX_OBJ < 11 || MAX_SPRITE < 20) throw new Error("logo3d: dimensioni degli array uniform insufficienti");
