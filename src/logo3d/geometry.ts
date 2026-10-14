// Geometrie del logo 3D, generate sulla CPU una volta sola e poi caricate in buffer GPU statici.
// Gli algoritmi sono quelli di three.js r160 (ExtrudeGeometry, TubeGeometry, SphereGeometry, TorusGeometry, BoxGeometry
// con le stesse curve), riscritti senza dipendenze: stessi vertici e stesse normali, ma senza scaricare la libreria.

export type Geo = {
  pos: Float32Array; // xyz
  nrm: Float32Array; // xyz
  aux: Float32Array; // parametro lungo la curva (uv.x dei tubi), 0 altrove
  idx: Uint32Array;
};

type V2 = { x: number; y: number };
type V3 = { x: number; y: number; z: number };

const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const sub3 = (a: V3, b: V3) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: V3, b: V3) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len3 = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const norm3 = (a: V3) => { const l = len3(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
const dist3 = (a: V3, b: V3) => len3(sub3(a, b));

// ---------- curve 2D e profili (Path / Shape) ----------

type Curve2 = { line: boolean; at: (t: number) => V2 };

const lineCurve2 = (a: V2, b: V2): Curve2 => ({
  line: true,
  at: (t) => (t === 1 ? { x: b.x, y: b.y } : { x: (b.x - a.x) * t + a.x, y: (b.y - a.y) * t + a.y }),
});

// EllipseCurve con xRadius = yRadius e senza rotazione (è l'unico uso: Path.absarc)
const arcCurve2 = (cx: number, cy: number, r: number, a0: number, a1: number, cw: boolean): Curve2 => ({
  line: false,
  at: (t) => {
    const twoPi = Math.PI * 2;
    let d = a1 - a0;
    const same = Math.abs(d) < Number.EPSILON;
    while (d < 0) d += twoPi;
    while (d > twoPi) d -= twoPi;
    if (d < Number.EPSILON) d = same ? 0 : twoPi;
    if (cw && !same) d = d === twoPi ? -twoPi : d - twoPi;
    const a = a0 + t * d;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  },
});

export class Path2 {
  curves: Curve2[] = [];
  holes: Path2[] = [];
  private cur: V2 = { x: 0, y: 0 };
  moveTo(x: number, y: number) { this.cur = { x, y }; return this; }
  lineTo(x: number, y: number) { this.curves.push(lineCurve2(this.cur, { x, y })); this.cur = { x, y }; return this; }
  absarc(cx: number, cy: number, r: number, a0: number, a1: number, cw: boolean) {
    const c = arcCurve2(cx, cy, r, a0, a1, cw);
    if (this.curves.length > 0) { const p = c.at(0); if (p.x !== this.cur.x || p.y !== this.cur.y) this.lineTo(p.x, p.y); }
    this.curves.push(c); this.cur = c.at(1);
    return this;
  }
  // CurvePath.getPoints: archi con 2·divisions punti, segmenti con 2, mai due punti consecutivi identici
  points(divisions: number): V2[] {
    const out: V2[] = [];
    let last: V2 | null = null;
    for (const c of this.curves) {
      const res = c.line ? 1 : divisions * 2;
      for (let d = 0; d <= res; d++) {
        const p = c.at(d / res);
        if (last && last.x === p.x && last.y === p.y) continue;
        out.push(p); last = p;
      }
    }
    return out;
  }
}

// quadrato arrotondato centrato (lato 2h, raggio r), come nel logo originale
export const roundedSquare = (h: number, r: number, s = new Path2()) => {
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r); s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h); s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r); s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};

const area2 = (c: V2[]) => { let a = 0; for (let p = c.length - 1, q = 0; q < c.length; p = q++) a += c[p].x * c[q].y - c[q].x * c[p].y; return a * 0.5; };
const isClockWise = (c: V2[]) => area2(c) < 0;
const removeDupEndPts = (c: V2[]) => { const l = c.length; if (l > 2 && c[l - 1].x === c[0].x && c[l - 1].y === c[0].y) c.pop(); };

// three.js inserisce un segmento lungo ~1e-15 prima dell'ultimo arco (il punto d'arrivo dell'arco precedente differisce
// per arrotondamento): il calcolo della smussatura lo prende per uno spigolo rovesciato e sul bordo sinistro della targa
// compariva una tacca. Togliendo i punti praticamente coincidenti la smussatura torna continua.
const near2 = (a: V2, b: V2) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
const dropNearDuplicates = (c: V2[]) => {
  for (let i = c.length - 1; i > 0; i--) if (near2(c[i], c[i - 1])) c.splice(i, 1);
  if (c.length > 2 && near2(c[c.length - 1], c[0])) c.pop(); // anche la chiusura: l'ultimo arco torna sul primo punto
  return c;
};

// Triangolazione dei coperchi. I profili del logo sono convessi (la targa) o una corona tra due profili stellati attorno
// all'origine (il filetto): un ventaglio e una "cerniera" angolare bastano e danno triangoli antiorari come earcut. La
// triangolazione non cambia l'aspetto: i coperchi sono piani e il colore della targa varia linearmente con la posizione.
const triangulate = (contour: V2[], holes: V2[][]): number[][] => {
  const faces: number[][] = [];
  const ccw = (a: V2, b: V2, c: V2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const push = (pts: V2[], i: number, j: number, k: number) => { const s = ccw(pts[i], pts[j], pts[k]); if (s > 0) faces.push([i, j, k]); else if (s < 0) faces.push([i, k, j]); };
  if (!holes.length) {
    for (let i = 1; i < contour.length - 1; i++) push(contour, 0, i, i + 1);
    return faces;
  }
  // corona: si percorrono i due anelli nello stesso verso angolare e si cuciono
  const hole = holes[0], n = contour.length, m = hole.length, all = contour.concat(hole);
  const ang = (p: V2) => Math.atan2(p.y, p.x);
  const outerDir = isClockWise(contour) ? -1 : 1, holeDir = isClockWise(hole) ? -1 : 1;
  const ho = (j: number) => (holeDir === outerDir ? j : m - 1 - j); // indice nel buco seguendo il verso del contorno
  const start = (pts: V2[], len: number, map: (k: number) => number) => { let best = 0, bv = Infinity; for (let k = 0; k < len; k++) { const a = ang(pts[map(k)]); if (a < bv) { bv = a; best = k; } } return best; };
  const unwrap = (a: number, ref: number) => { while (a - ref > Math.PI) a -= 2 * Math.PI; while (ref - a > Math.PI) a += 2 * Math.PI; return a; };
  let i = start(contour, n, (k) => k), j = start(hole, m, ho);
  // si parte dal punto di angolo minimo di entrambi gli anelli, poi si avanza sempre su quello "più indietro"
  let ci = 0, cj = 0, ref = ang(contour[i]);
  while (ci < n || cj < m) {
    const oi = (i + ci) % n, oj = ho((j + cj) % m) + n;
    const ni = (i + ci + 1) % n, nj = ho((j + cj + 1) % m) + n;
    const ai = unwrap(ang(contour[ni]), ref) * outerDir, aj = unwrap(ang(hole[nj - n]), ref) * outerDir;
    if (cj >= m || (ci < n && ai <= aj)) { push(all, oi, ni, oj); ci++; ref = ang(contour[ni]); }
    else { push(all, oi, nj, oj); cj++; ref = ang(hole[nj - n]); }
  }
  return faces;
};

export type ExtrudeOptions = { depth: number; bevelThickness: number; bevelSize: number; bevelSegments: number; curveSegments: number; exact?: boolean };

// ExtrudeGeometry di three.js (con smussatura, un solo passo, nessun percorso di estrusione): geometria non indicizzata
// con normali di faccia, come computeVertexNormals() su una geometria senza indici
export function extrude(shape: Path2, o: ExtrudeOptions): { pos: number[]; nrm: number[] } {
  const steps = 1, { depth, bevelThickness, bevelSize, bevelSegments, curveSegments } = o, bevelOffset = 0;
  let vertices = shape.points(curveSegments);
  const holes = shape.holes.map((h) => h.points(curveSegments));
  if (!o.exact) { dropNearDuplicates(vertices); holes.forEach(dropNearDuplicates); }
  if (!isClockWise(vertices)) {
    vertices = vertices.reverse();
    for (let h = 0; h < holes.length; h++) if (isClockWise(holes[h])) holes[h] = holes[h].reverse();
  }
  removeDupEndPts(vertices); holes.forEach(removeDupEndPts);
  const faces = triangulate(vertices, holes);
  const contour = vertices;
  for (const h of holes) vertices = vertices.concat(h);

  const getBevelVec = (inPt: V2, inPrev: V2, inNext: V2): V2 => {
    let tx: number, ty: number, shrink: number;
    const vpx = inPt.x - inPrev.x, vpy = inPt.y - inPrev.y, vnx = inNext.x - inPt.x, vny = inNext.y - inPt.y;
    const vpl2 = vpx * vpx + vpy * vpy, collinear0 = vpx * vny - vpy * vnx;
    if (Math.abs(collinear0) > Number.EPSILON) {
      const vpl = Math.sqrt(vpl2), vnl = Math.sqrt(vnx * vnx + vny * vny);
      const psx = inPrev.x - vpy / vpl, psy = inPrev.y + vpx / vpl, nsx = inNext.x - vny / vnl, nsy = inNext.y + vnx / vnl;
      const sf = ((nsx - psx) * vny - (nsy - psy) * vnx) / (vpx * vny - vpy * vnx);
      tx = psx + vpx * sf - inPt.x; ty = psy + vpy * sf - inPt.y;
      const tl2 = tx * tx + ty * ty;
      if (tl2 <= 2) return { x: tx, y: ty };
      shrink = Math.sqrt(tl2 / 2);
    } else {
      let same = false;
      if (vpx > Number.EPSILON) { if (vnx > Number.EPSILON) same = true; }
      else if (vpx < -Number.EPSILON) { if (vnx < -Number.EPSILON) same = true; }
      else if (Math.sign(vpy) === Math.sign(vny)) same = true;
      if (same) { tx = -vpy; ty = vpx; shrink = Math.sqrt(vpl2); }
      else { tx = vpx; ty = vpy; shrink = Math.sqrt(vpl2 / 2); }
    }
    return { x: tx / shrink, y: ty / shrink };
  };
  const moves = (ring: V2[]) => ring.map((p, i) => getBevelVec(p, ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length]));
  const contourMoves = moves(contour), holesMoves = holes.map(moves);
  const verticesMoves = contourMoves.concat(...holesMoves);
  const vlen = vertices.length;

  const place: number[] = [];
  const v = (x: number, y: number, z: number) => { place.push(x, y, z); };
  const layer = (bs: number, z: number) => {
    contour.forEach((p, i) => v(p.x + contourMoves[i].x * bs, p.y + contourMoves[i].y * bs, z));
    holes.forEach((h, k) => h.forEach((p, i) => v(p.x + holesMoves[k][i].x * bs, p.y + holesMoves[k][i].y * bs, z)));
  };
  for (let b = 0; b < bevelSegments; b++) { const t = b / bevelSegments; layer(bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset, -bevelThickness * Math.cos((t * Math.PI) / 2)); }
  const bs = bevelSize + bevelOffset;
  for (let i = 0; i < vlen; i++) v(vertices[i].x + verticesMoves[i].x * bs, vertices[i].y + verticesMoves[i].y * bs, 0);
  for (let s = 1; s <= steps; s++) for (let i = 0; i < vlen; i++) v(vertices[i].x + verticesMoves[i].x * bs, vertices[i].y + verticesMoves[i].y * bs, (depth / steps) * s);
  for (let b = bevelSegments - 1; b >= 0; b--) { const t = b / bevelSegments; layer(bevelSize * Math.sin((t * Math.PI) / 2) + bevelOffset, depth + bevelThickness * Math.cos((t * Math.PI) / 2)); }

  const pos: number[] = [];
  const add = (i: number) => { pos.push(place[i * 3], place[i * 3 + 1], place[i * 3 + 2]); };
  const f3 = (a: number, b: number, c: number) => { add(a); add(b); add(c); };
  const f4 = (a: number, b: number, c: number, d: number) => { add(a); add(b); add(d); add(b); add(c); add(d); };
  for (const f of faces) f3(f[2], f[1], f[0]);
  const top = vlen * (steps + bevelSegments * 2);
  for (const f of faces) f3(f[0] + top, f[1] + top, f[2] + top);
  const sidewalls = (ring: V2[], off: number) => {
    for (let i = ring.length - 1; i >= 0; i--) {
      const j = i, k = i - 1 < 0 ? ring.length - 1 : i - 1;
      for (let s = 0, sl = steps + bevelSegments * 2; s < sl; s++) {
        const s1 = vlen * s, s2 = vlen * (s + 1);
        f4(off + j + s1, off + k + s1, off + k + s2, off + j + s2);
      }
    }
  };
  sidewalls(contour, 0);
  let off = contour.length;
  for (const h of holes) { sidewalls(h, off); off += h.length; }
  return { pos, nrm: faceNormals(pos) };
}

// normali calcolate sulle posizioni già arrotondate a float32, come fa three.js sul buffer della geometria
const faceNormals = (pos: number[]) => {
  const nrm = new Array<number>(pos.length), f = Math.fround;
  for (let i = 0; i < pos.length; i += 9) {
    const ax = f(pos[i]), ay = f(pos[i + 1]), az = f(pos[i + 2]), bx = f(pos[i + 3]), by = f(pos[i + 4]), bz = f(pos[i + 5]), cx = f(pos[i + 6]), cy = f(pos[i + 7]), cz = f(pos[i + 8]);
    const cbx = cx - bx, cby = cy - by, cbz = cz - bz, abx = ax - bx, aby = ay - by, abz = az - bz;
    let nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 9; k += 3) { nrm[i + k] = nx; nrm[i + k + 1] = ny; nrm[i + k + 2] = nz; }
  }
  return nrm;
};

// ---------- curve 3D e tubi ----------

// Curve di three.js: getPoint(t) definita dalla curva, il resto (lunghezze d'arco, parametrizzazione uniforme, tangenti
// numeriche, terne di Frenet) uguale alla classe base
export class Curve3 {
  private lengths: number[] | null = null;
  constructor(public getPoint: (t: number) => V3) {}
  getLengths(divisions = 200) {
    if (this.lengths && this.lengths.length === divisions + 1) return this.lengths;
    const cache = [0]; let last = this.getPoint(0), sum = 0;
    for (let p = 1; p <= divisions; p++) { const cur = this.getPoint(p / divisions); sum += dist3(cur, last); cache.push(sum); last = cur; }
    return (this.lengths = cache);
  }
  getLength() { const l = this.getLengths(); return l[l.length - 1]; }
  getUtoTmapping(u: number) {
    const a = this.getLengths(), il = a.length, target = u * a[il - 1];
    let low = 0, high = il - 1, i = 0;
    while (low <= high) {
      i = Math.floor(low + (high - low) / 2);
      const c = a[i] - target;
      if (c < 0) low = i + 1; else if (c > 0) high = i - 1; else { high = i; break; }
    }
    i = high;
    if (a[i] === target) return i / (il - 1);
    return (i + (target - a[i]) / (a[i + 1] - a[i])) / (il - 1);
  }
  getPointAt(u: number) { return this.getPoint(this.getUtoTmapping(u)); }
  getTangent(t: number) {
    const d = 0.0001; let t1 = t - d, t2 = t + d;
    if (t1 < 0) t1 = 0; if (t2 > 1) t2 = 1;
    return norm3(sub3(this.getPoint(t2), this.getPoint(t1)));
  }
  getTangentAt(u: number) { return this.getTangent(this.getUtoTmapping(u)); }
}

export class LineCurve3 extends Curve3 {
  constructor(public a: V3, public b: V3) {
    super((t) => (t === 1 ? v3(b.x, b.y, b.z) : v3((b.x - a.x) * t + a.x, (b.y - a.y) * t + a.y, (b.z - a.z) * t + a.z)));
  }
  getPointAt(u: number) { return this.getPoint(u); }
  getTangent() { return norm3(sub3(this.b, this.a)); }
  getTangentAt() { return this.getTangent(); }
}

// CurvePath: getPoint(t) cammina per lunghezza d'arco lungo i segmenti
export const curvePath = (curves: LineCurve3[]) => {
  let lens: number[] | null = null;
  const curveLengths = () => { if (!lens) { let s = 0; lens = curves.map((c) => (s += c.getLength())); } return lens; };
  return new Curve3((t) => {
    const cl = curveLengths(), d = t * cl[cl.length - 1];
    for (let i = 0; i < cl.length; i++) {
      if (cl[i] >= d) { const c = curves[i], seg = c.getLength(), u = seg === 0 ? 0 : 1 - (cl[i] - d) / seg; return c.getPointAt(u); }
    }
    return v3();
  });
};

export const polyline = (pts: number[][], z: number) => {
  const cs: LineCurve3[] = [];
  for (let i = 1; i < pts.length; i++) cs.push(new LineCurve3(v3(pts[i - 1][0], pts[i - 1][1], z), v3(pts[i][0], pts[i][1], z)));
  return curvePath(cs);
};

// rotazione di v attorno all'asse (unitario) come Matrix4.makeRotationAxis + applyMatrix4
const rotAxis = (v: V3, ax: V3, angle: number): V3 => {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c, x = ax.x, y = ax.y, z = ax.z, tx = t * x, ty = t * y;
  return v3(
    (tx * x + c) * v.x + (tx * y - s * z) * v.y + (tx * z + s * y) * v.z,
    (tx * y + s * z) * v.x + (ty * y + c) * v.y + (ty * z - s * x) * v.z,
    (tx * z - s * y) * v.x + (ty * z + s * x) * v.y + (t * z * z + c) * v.z
  );
};

const frenetFrames = (curve: Curve3, segments: number) => {
  const tangents: V3[] = [], normals: V3[] = [], binormals: V3[] = [];
  for (let i = 0; i <= segments; i++) tangents[i] = curve.getTangentAt(i / segments);
  let min = Number.MAX_VALUE, normal = v3();
  const tx = Math.abs(tangents[0].x), ty = Math.abs(tangents[0].y), tz = Math.abs(tangents[0].z);
  if (tx <= min) { min = tx; normal = v3(1, 0, 0); }
  if (ty <= min) { min = ty; normal = v3(0, 1, 0); }
  if (tz <= min) normal = v3(0, 0, 1);
  const vec = norm3(cross3(tangents[0], normal));
  normals[0] = cross3(tangents[0], vec);
  binormals[0] = cross3(tangents[0], normals[0]);
  for (let i = 1; i <= segments; i++) {
    normals[i] = { ...normals[i - 1] };
    const ax = cross3(tangents[i - 1], tangents[i]);
    if (len3(ax) > Number.EPSILON) {
      const theta = Math.acos(Math.min(1, Math.max(-1, dot3(tangents[i - 1], tangents[i]))));
      normals[i] = rotAxis(normals[i], norm3(ax), theta);
    }
    binormals[i] = cross3(tangents[i], normals[i]);
  }
  return { normals, binormals };
};

// TubeGeometry aperta: anelli di radialSegments+1 vertici, uv.x = i / tubularSegments (usato come parametro "aT")
export function tube(curve: Curve3, tubular: number, radius: number, radial: number): Geo {
  const { normals: N, binormals: B } = frenetFrames(curve, tubular);
  const pos: number[] = [], nrm: number[] = [], aux: number[] = [], idx: number[] = [];
  for (let i = 0; i <= tubular; i++) {
    const P = curve.getPointAt(i / tubular);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2, sin = Math.sin(v), cos = -Math.cos(v);
      const n = norm3(v3(cos * N[i].x + sin * B[i].x, cos * N[i].y + sin * B[i].y, cos * N[i].z + sin * B[i].z));
      nrm.push(n.x, n.y, n.z); pos.push(P.x + radius * n.x, P.y + radius * n.y, P.z + radius * n.z); aux.push(i / tubular);
    }
  }
  for (let j = 1; j <= tubular; j++) for (let i = 1; i <= radial; i++) {
    const a = (radial + 1) * (j - 1) + (i - 1), b = (radial + 1) * j + (i - 1), c = (radial + 1) * j + i, d = (radial + 1) * (j - 1) + i;
    idx.push(a, b, d, b, c, d);
  }
  return pack(pos, nrm, aux, idx);
}

export function sphere(radius: number, ws: number, hs: number): Geo {
  ws = Math.max(3, Math.floor(ws)); hs = Math.max(2, Math.floor(hs));
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [], grid: number[][] = [];
  let index = 0;
  for (let iy = 0; iy <= hs; iy++) {
    const row: number[] = [], v = iy / hs;
    for (let ix = 0; ix <= ws; ix++) {
      const u = ix / ws;
      const x = -radius * Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI), y = radius * Math.cos(v * Math.PI), z = radius * Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      pos.push(x, y, z); const n = norm3(v3(x, y, z)); nrm.push(n.x, n.y, n.z); row.push(index++);
    }
    grid.push(row);
  }
  for (let iy = 0; iy < hs; iy++) for (let ix = 0; ix < ws; ix++) {
    const a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1];
    if (iy !== 0) idx.push(a, b, d);
    if (iy !== hs - 1) idx.push(b, c, d);
  }
  return pack(pos, nrm, null, idx);
}

export function torus(radius: number, tubeR: number, radialSegments: number, tubularSegments: number): Geo {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let j = 0; j <= radialSegments; j++) for (let i = 0; i <= tubularSegments; i++) {
    const u = (i / tubularSegments) * Math.PI * 2, v = (j / radialSegments) * Math.PI * 2;
    const x = (radius + tubeR * Math.cos(v)) * Math.cos(u), y = (radius + tubeR * Math.cos(v)) * Math.sin(u), z = tubeR * Math.sin(v);
    pos.push(x, y, z); const n = norm3(v3(x - radius * Math.cos(u), y - radius * Math.sin(u), z)); nrm.push(n.x, n.y, n.z);
  }
  for (let j = 1; j <= radialSegments; j++) for (let i = 1; i <= tubularSegments; i++) {
    const a = (tubularSegments + 1) * j + i - 1, b = (tubularSegments + 1) * (j - 1) + i - 1, c = (tubularSegments + 1) * (j - 1) + i, d = (tubularSegments + 1) * j + i;
    idx.push(a, b, d, b, c, d);
  }
  return pack(pos, nrm, null, idx);
}

// BoxGeometry con un segmento per lato (stesse facce e normali; l'ordine dei vertici non conta)
export function box(w: number, h: number, d: number): Geo {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const face = (n: V3, u: V3, v: V3) => {
    const o = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push((n.x * w + a * u.x * w + b * v.x * w) / 2, (n.y * h + a * u.y * h + b * v.y * h) / 2, (n.z * d + a * u.z * d + b * v.z * d) / 2);
      nrm.push(n.x, n.y, n.z);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  // u × v = n: triangoli antiorari visti dall'esterno
  face(v3(1, 0, 0), v3(0, 0, -1), v3(0, 1, 0)); face(v3(-1, 0, 0), v3(0, 0, 1), v3(0, 1, 0));
  face(v3(0, 1, 0), v3(1, 0, 0), v3(0, 0, -1)); face(v3(0, -1, 0), v3(1, 0, 0), v3(0, 0, 1));
  face(v3(0, 0, 1), v3(1, 0, 0), v3(0, 1, 0)); face(v3(0, 0, -1), v3(-1, 0, 0), v3(0, 1, 0));
  return pack(pos, nrm, null, idx);
}

export const fromExtrude = (e: { pos: number[]; nrm: number[] }): Geo => pack(e.pos, e.nrm, null, Array.from({ length: e.pos.length / 3 }, (_, i) => i));

function pack(pos: number[], nrm: number[], aux: number[] | null, idx: number[]): Geo {
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), aux: aux ? new Float32Array(aux) : new Float32Array(pos.length / 3), idx: new Uint32Array(idx) };
}

// scala (anche non uniforme), poi trasla; le normali seguono l'inversa trasposta come in three.js
export function transform(g: Geo, t: [number, number, number], s: [number, number, number] = [1, 1, 1]): Geo {
  const pos = new Float32Array(g.pos.length), nrm = new Float32Array(g.nrm.length);
  for (let i = 0; i < g.pos.length; i += 3) {
    pos[i] = g.pos[i] * s[0] + t[0]; pos[i + 1] = g.pos[i + 1] * s[1] + t[1]; pos[i + 2] = g.pos[i + 2] * s[2] + t[2];
    const nx = g.nrm[i] / s[0], ny = g.nrm[i + 1] / s[1], nz = g.nrm[i + 2] / s[2], l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nrm[i] = nx / l; nrm[i + 1] = ny / l; nrm[i + 2] = nz / l;
  }
  return { pos, nrm, aux: g.aux, idx: g.idx };
}

export function merge(parts: Geo[]): Geo {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const out: Geo = { pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), aux: new Float32Array(nv), idx: new Uint32Array(ni) };
  let ov = 0, oi = 0;
  for (const p of parts) {
    out.pos.set(p.pos, ov * 3); out.nrm.set(p.nrm, ov * 3); out.aux.set(p.aux, ov);
    for (let i = 0; i < p.idx.length; i++) out.idx[oi + i] = p.idx[i] + ov;
    ov += p.pos.length / 3; oi += p.idx.length;
  }
  return out;
}
