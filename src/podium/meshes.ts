// Geometrie della sala del podio, generate una volta: superfici parametriche (torniti, colonne scanalate, coppe, anse,
// stendardi), scatole con gli spigoli arrotondati, la parete di fondo con il vano ad arco, telaio, montanti, modanature,
// cassettoni. Ogni vertice: posizione, normale, uv, materiale, occlusione d'ambiente (cavità di scanalature e modanature).
import { ROOM, WINDOW, STEP_X, STEP_H, STEP_D, DAIS, TROPHY_K, COL_X, COL_Z, COL_TOP, CARPET, BANNERS, Mat } from "./stage";

export const VERTEX_FLOATS = 10; // pos 3, nrm 3, uv 2, materiale, occlusione
type V3 = [number, number, number];
const TAU = Math.PI * 2;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class MeshBuilder {
  v: number[] = [];
  idx: number[] = [];
  get count() { return this.v.length / VERTEX_FLOATS; }
  vert(p: V3, n: V3, u: number, w: number, m: number, ao = 1) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, w, m, ao); return this.count - 1; }
  // triangolo con l'avvolgimento antiorario visto dal lato della normale (per lo scarto delle facce posteriori)
  tri(a: number, b: number, c: number) {
    // Same winding calculation with scalars: this runs hundreds of thousands of times at scene startup.
    // Avoid thirteen temporary arrays per triangle without changing any vertex, normal or triangle.
    const v = this.v, ai = a * VERTEX_FLOATS, bi = b * VERTEX_FLOATS, ci = c * VERTEX_FLOATS;
    const ux = v[bi] - v[ai], uy = v[bi + 1] - v[ai + 1], uz = v[bi + 2] - v[ai + 2];
    const vx = v[ci] - v[ai], vy = v[ci + 1] - v[ai + 1], vz = v[ci + 2] - v[ai + 2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const nx = v[ai + 3] + v[bi + 3] + v[ci + 3], ny = v[ai + 4] + v[bi + 4] + v[ci + 4], nz = v[ai + 5] + v[bi + 5] + v[ci + 5];
    if (gx * nx + gy * ny + gz * nz < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number) { this.tri(a, b, c); this.tri(a, c, d); }

  // superficie parametrica f(u, v) con u, v in [0, 1]; normali dalle derivate (verso: side = ±1)
  surface(nu: number, nv: number, f: (u: number, v: number) => V3, m: number, o: { side?: number; ao?: (u: number, v: number) => number; uv?: (u: number, v: number) => [number, number]; wrapU?: boolean } = {}) {
    const side = o.side ?? 1, e = 1e-4, base = this.count;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = f(u, v);
      const u0 = Math.max(0, u - e), u1 = Math.min(1, u + e), v0 = Math.max(0, v - e), v1 = Math.min(1, v + e);
      let pu1 = f(u1, v), pu0 = f(u0, v), pv1 = f(u, v1), pv0 = f(u, v0);
      let ux = pu1[0] - pu0[0], uy = pu1[1] - pu0[1], uz = pu1[2] - pu0[2];
      let vx = pv1[0] - pv0[0], vy = pv1[1] - pv0[1], vz = pv1[2] - pv0[2];
      // ai poli (raggio nullo) la derivata si prende appena accanto
      const vn = v < 0.99 ? v + 0.01 : v - 0.01, un = u < 0.99 ? u + 0.01 : u - 0.01;
      if (Math.hypot(ux, uy, uz) < 1e-12) { pu1 = f(u1, vn); pu0 = f(u0, vn); ux = pu1[0] - pu0[0]; uy = pu1[1] - pu0[1]; uz = pu1[2] - pu0[2]; }
      if (Math.hypot(vx, vy, vz) < 1e-12) { pv1 = f(un, v1); pv0 = f(un, v0); vx = pv1[0] - pv0[0]; vy = pv1[1] - pv0[1]; vz = pv1[2] - pv0[2]; }
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz) || 1;
      const n: V3 = side < 0 ? [-(nx / length), -(ny / length), -(nz / length)] : [nx / length, ny / length, nz / length];
      const t = o.uv ? o.uv(u, v) : [u, v];
      this.vert(p, n, t[0], t[1], m, o.ao ? o.ao(u, v) : 1);
    }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * row + i;
      this.quad(a, a + 1, a + row + 1, a + row);
    }
  }

  // tornito attorno all'asse verticale per (cx, cz): profilo [raggio, quota] dal basso; spigoli vivi dove il profilo si spezza
  lathe(cx: number, cz: number, strips: [number, number][][], m: number, seg = 64, o: { flutes?: { n: number; depth: number; y0: number; y1: number }; ao?: number[][] } = {}) {
    strips.forEach((pr, si) => {
      const L: number[] = [0]; for (let k = 1; k < pr.length; k++) L.push(L[k - 1] + Math.hypot(pr[k][0] - pr[k - 1][0], pr[k][1] - pr[k - 1][1]));
      const total = L[L.length - 1] || 1;
      const profileCache = new Map<number, number[]>();
      const at = (v: number) => {
        const saved = profileCache.get(v); if (saved) return saved;
        const s = v * total; let k = 1; while (k < pr.length - 1 && L[k] < s) k++;
        const t = (s - L[k - 1]) / Math.max(1e-9, L[k] - L[k - 1]);
        const point = [pr[k - 1][0] + (pr[k][0] - pr[k - 1][0]) * t, pr[k - 1][1] + (pr[k][1] - pr[k - 1][1]) * t, k - 1 + t];
        profileCache.set(v, point); return point;
      };
      const fl = o.flutes;
      const channel = (a: number) => { if (!fl) return 0; const x = ((a / TAU) * fl.n % 1) * 2 - 1; return Math.abs(x) < 0.8 ? Math.sqrt(1 - (x / 0.8) ** 2) : 0; };
      const angleCache = new Map<number, number[]>();
      const angle = (a: number) => {
        let saved = angleCache.get(a);
        if (!saved) { saved = [Math.cos(a), Math.sin(a), channel(a)]; angleCache.set(a, saved); }
        return saved;
      };
      const fade = (y: number) => (!fl ? 0 : Math.min(1, Math.max(0, (y - fl.y0) / 0.12)) * Math.min(1, Math.max(0, (fl.y1 - y) / 0.12)));
      this.surface(seg, Math.max(1, (pr.length - 1) * (fl ? 3 : 2)), (u, v) => {
        const a = angle(u * TAU), [r0, y] = at(v), r = r0 - (fl ? fl.depth * a[2] * fade(y) : 0);
        return [cx + a[0] * r, y, cz - a[1] * r];
      }, m, { ao: (u, v) => { const [, y, k] = at(v); const base = o.ao?.[si] ? o.ao[si][Math.min(o.ao[si].length - 1, Math.round(k))] : 1; return base * (1 - 0.5 * angle(u * TAU)[2] * fade(y)); } });
    });
  }

  // scatola con gli spigoli arrotondati (raggio r): ogni faccia copre metà dell'arrotondamento, senza giunte
  box(c: V3, h: V3, r: number, m: number, seg = 3) {
    r = Math.min(r, h[0] * 0.99, h[1] * 0.99, h[2] * 0.99);
    const line = (H: number) => {
      const out = [-H];
      for (let k = seg - 1; k >= 1; k--) out.push(-(H - r) - r * Math.tan((Math.PI / 4) * (k / seg)));
      out.push(-(H - r), H - r);
      for (let k = 1; k < seg; k++) out.push(H - r + r * Math.tan((Math.PI / 4) * (k / seg)));
      out.push(H);
      return r > 1e-5 ? out : [-H, H];
    };
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
      const b = (ax + 1) % 3, d = (ax + 2) % 3, lb = line(h[b]), ld = line(h[d]), base = this.count;
      for (const vb of lb) for (const vd of ld) {
        const q: V3 = [0, 0, 0], sp: V3 = [0, 0, 0];
        sp[ax] = s * h[ax]; sp[b] = vb; sp[d] = vd;
        for (let k = 0; k < 3; k++) q[k] = Math.max(-(h[k] - r), Math.min(h[k] - r, sp[k]));
        let n = sub(sp, q); const ln = Math.hypot(...n);
        n = ln > 1e-9 ? [n[0] / ln, n[1] / ln, n[2] / ln] : [ax === 0 ? s : 0, ax === 1 ? s : 0, ax === 2 ? s : 0];
        const p: V3 = [c[0] + q[0] + n[0] * r, c[1] + q[1] + n[1] * r, c[2] + q[2] + n[2] * r];
        this.vert(p, n, (vb / h[b] + 1) / 2, (vd / h[d] + 1) / 2, m);
      }
      const row = ld.length;
      for (let i = 0; i < lb.length - 1; i++) for (let j = 0; j < ld.length - 1; j++) { const a = base + i * row + j; this.quad(a, a + row, a + row + 1, a + 1); }
    }
  }

  // tubo lungo una curva (anse, aste): sezione circolare di raggio r
  tube(curve: (t: number) => V3, r: number, m: number, nt = 32, nr = 16) {
    this.surface(nr, nt, (u, v) => {
      const p = curve(v), q = curve(Math.min(1, v + 0.002)), q0 = curve(Math.max(0, v - 0.002));
      const t = norm(sub(q, q0)), a = Math.abs(t[1]) < 0.9 ? [0, 1, 0] as V3 : [1, 0, 0] as V3;
      const n1 = norm(cross(t, a)), n2 = cross(t, n1), ang = u * TAU;
      return [p[0] + (n1[0] * Math.cos(ang) + n2[0] * Math.sin(ang)) * r, p[1] + (n1[1] * Math.cos(ang) + n2[1] * Math.sin(ang)) * r, p[2] + (n1[2] * Math.cos(ang) + n2[2] * Math.sin(ang)) * r];
    }, m);
  }

  // profilo 2D [sporgenza, quota] estruso lungo una spezzata orizzontale (modanature): out = normale verso la sala
  molding(path: [number, number][], outs: [number, number][], profile: [number, number][], y0: number, m: number) {
    for (let s = 0; s < path.length - 1; s++) {
      const a = path[s], b = path[s + 1], o = outs[s];
      this.surface(1, profile.length * 3, (u, v) => {
        const k = Math.min(profile.length - 1.0001, v * (profile.length - 1)), i = Math.floor(k), t = k - i;
        const off = profile[i][0] + (profile[i + 1][0] - profile[i][0]) * t, y = profile[i][1] + (profile[i + 1][1] - profile[i][1]) * t;
        return [a[0] + (b[0] - a[0]) * u + o[0] * off, y0 + y, a[1] + (b[1] - a[1]) * u + o[1] * off];
      }, m, { ao: (_, v) => 0.75 + 0.25 * Math.abs(Math.sin(v * Math.PI * (profile.length - 1))) });
    }
  }
}

// ---------- la sala ----------
export type SceneMesh = { vertices: Float32Array; indices: Uint32Array; ranges: Record<string, [number, number]> };

const openHalf = (y: number) => {
  if (y < WINDOW.y0 || y > WINDOW.ya + WINDOW.r) return 0;
  return y <= WINDOW.ya ? WINDOW.r : Math.sqrt(Math.max(0, WINDOW.r ** 2 - (y - WINDOW.ya) ** 2));
};

export function buildScene(mobile: boolean): SceneMesh {
  const B = new MeshBuilder(), ranges: Record<string, [number, number]> = {};
  const mark = (name: string, fn: () => void) => { const a = B.idx.length; fn(); ranges[name] = [a, B.idx.length - a]; };
  const SEG = mobile ? 40 : 72;
  const { x: RX, y: RY, back: RB, front: RF } = ROOM;

  // pavimento e tappeto (fuori dai riflessi planari: sono il piano che riflette)
  mark("floor", () => {
    B.surface(1, 1, (u, v) => [-RX + 2 * RX * u, 0, RB + (RF - RB) * v], Mat.floor, { side: -1, uv: (u, v) => [u, v] });
    B.box([0, 0.012, (CARPET.z0 + RF) / 2], [CARPET.hw, 0.012, (RF - CARPET.z0) / 2], 0.008, Mat.carpet, 2);
  });

  mark("room", () => {
    // parete di fondo con il vano ad arco: strisce orizzontali, il vano tagliato con i trapezi esatti sul bordo
    const ys = [0, WINDOW.y0];
    for (let k = 1; k <= 24; k++) ys.push(WINDOW.y0 + ((WINDOW.ya - WINDOW.y0) * k) / 24);
    for (let k = 1; k <= 48; k++) ys.push(WINDOW.ya + WINDOW.r * Math.sin((Math.PI / 2) * (k / 48)));
    ys.push(RY);
    const n: V3 = [0, 0, 1];
    for (let k = 0; k < ys.length - 1; k++) {
      const y0 = ys[k], y1 = ys[k + 1], w0 = openHalf(y0 + 1e-6), w1 = openHalf(y1 - 1e-6);
      if (w0 === 0 && w1 === 0 && (y1 <= WINDOW.y0 || y0 >= WINDOW.ya + WINDOW.r - 1e-6)) {
        const a = B.vert([-RX, y0, RB], n, 0, y0, Mat.wall), b = B.vert([RX, y0, RB], n, 1, y0, Mat.wall), c = B.vert([RX, y1, RB], n, 1, y1, Mat.wall), d = B.vert([-RX, y1, RB], n, 0, y1, Mat.wall);
        B.quad(a, b, c, d); continue;
      }
      for (const s of [-1, 1]) {
        const a = B.vert([s * RX, y0, RB], n, 0, y0, Mat.wall), b = B.vert([s * w0, y0, RB], n, 0, y0, Mat.wall), c = B.vert([s * w1, y1, RB], n, 0, y1, Mat.wall), d = B.vert([s * RX, y1, RB], n, 0, y1, Mat.wall);
        B.quad(a, b, c, d);
      }
    }
    // strombo: lo spessore del muro attorno al vano (le facce guardano dentro il vano)
    const outline: [number, number][] = [];
    for (let k = 0; k <= 12; k++) outline.push([-WINDOW.r, WINDOW.y0 + ((WINDOW.ya - WINDOW.y0) * k) / 12]);
    for (let k = 1; k <= 48; k++) { const a = Math.PI - (Math.PI * k) / 48; outline.push([Math.cos(a) * WINDOW.r, WINDOW.ya + Math.sin(a) * WINDOW.r]); }
    for (let k = 1; k <= 12; k++) outline.push([WINDOW.r, WINDOW.ya - ((WINDOW.ya - WINDOW.y0) * k) / 12]);
    outline.push([-WINDOW.r, WINDOW.y0]);
    for (let k = 0; k < outline.length - 1; k++) {
      const [x0, y0] = outline[k], [x1, y1] = outline[k + 1];
      const t = norm([x1 - x0, y1 - y0, 0]), nn: V3 = [t[1], -t[0], 0]; // verso l'interno del vano (percorso orario visto dalla sala)
      const a = B.vert([x0, y0, RB], nn, 0, 0, Mat.wall, 0.85), b = B.vert([x1, y1, RB], nn, 1, 0, Mat.wall, 0.85), c = B.vert([x1, y1, RB - WINDOW.depth], nn, 1, 1, Mat.wall, 0.6), d = B.vert([x0, y0, RB - WINDOW.depth], nn, 0, 1, Mat.wall, 0.6);
      B.quad(a, b, c, d);
    }
    // davanzale
    B.box([0, WINDOW.y0 - 0.07, RB + 0.12], [WINDOW.r + 0.35, 0.07, 0.2], 0.02, Mat.stone);
    // pareti laterali, parete frontale, soffitto
    for (const s of [-1, 1]) B.surface(1, 1, (u, v) => [s * RX, RY * v, RB + (RF - RB) * u], Mat.wall, { side: s, uv: (u, v) => [u, v] });
    B.surface(1, 1, (u, v) => [-RX + 2 * RX * u, RY * v, RF], Mat.wall, { side: -1 });
    B.surface(1, 1, (u, v) => [-RX + 2 * RX * u, RY, RB + (RF - RB) * v], Mat.coffer, { side: 1 });
    // cassettoni: travi incrociate sotto il soffitto
    for (let x = -RX + 2.25; x < RX - 0.5; x += 2.25) B.box([x, RY - 0.17, (RB + RF) / 2], [0.14, 0.17, (RF - RB) / 2], 0.03, Mat.ceiling);
    for (let z = RB + 2.25; z < RF - 0.5; z += 2.25) B.box([0, RY - 0.17, z], [RX, 0.17, 0.14], 0.03, Mat.ceiling);
    // zoccolatura: battiscopa, pannelli in rilievo, cimasa; cornicione in alto
    const walls: { path: [number, number][]; outs: [number, number][] }[] = [
      { path: [[-RX, RF], [-RX, RB]], outs: [[1, 0]] }, { path: [[-RX, RB], [RX, RB]], outs: [[0, 1]] }, { path: [[RX, RB], [RX, RF]], outs: [[-1, 0]] },
    ];
    const dado: [number, number][] = [[0, 0], [0.05, 0.02], [0.07, 0.06], [0.05, 0.1], [0.07, 0.13], [0, 0.16]];
    const base: [number, number][] = [[0, 0], [0.05, 0], [0.05, 0.16], [0.03, 0.2], [0, 0.22]];
    const crown: [number, number][] = [[0, 0], [0.06, 0.04], [0.08, 0.12], [0.2, 0.25], [0.32, 0.36], [0.34, 0.44], [0, 0.46]];
    for (const w of walls) { B.molding(w.path, w.outs, base, 0, Mat.wainscot); B.molding(w.path, w.outs, dado, 1.22, Mat.stone); B.molding(w.path, w.outs, crown, RY - 0.8, Mat.ceiling); }
    for (const s of [-1, 1]) for (let z = RB + 0.8; z < RF - 1.5; z += 2.0) B.box([s * (RX - 0.02), 0.72, z + 0.8], [0.025, 0.36, 0.7], 0.012, Mat.wainscot, 2);
    for (let x = -RX + 0.9; x < RX - 1.2; x += 1.8) if (Math.abs(x + 0.75) > WINDOW.r + 0.4) B.box([x + 0.75, 0.72, RB + 0.02], [0.68, 0.36, 0.025], 0.012, Mat.wainscot, 2);
    // lesene ai lati del finestrone e lungo le pareti laterali, dietro le colonne
    for (const s of [-1, 1]) {
      B.box([s * (WINDOW.r + 0.85), RY / 2, RB + 0.09], [0.32, RY / 2, 0.09], 0.02, Mat.stone);
      B.box([s * (WINDOW.r + 0.85), RY - 1.25, RB + 0.15], [0.42, 0.16, 0.15], 0.02, Mat.stone);
      for (const z of COL_Z) B.box([s * (RX - 0.08), RY / 2, z], [0.08, RY / 2, 0.36], 0.02, Mat.stone);
    }
  });

  mark("window", () => {
    // telaio nel vano, montanti, traverse e raggiera: scuri e in rilievo (proiettano le ombre dei fasci)
    const zc = RB - WINDOW.depth * 0.5, dz = 0.12, fr = WINDOW.frame, br = WINDOW.bar;
    for (const s of [-1, 1]) B.box([s * (WINDOW.r - fr / 2), (WINDOW.y0 + WINDOW.ya) / 2, zc], [fr / 2, (WINDOW.ya - WINDOW.y0) / 2, dz], 0.01, Mat.frame);
    B.box([0, WINDOW.y0 + fr / 2, zc], [WINDOW.r, fr / 2, dz], 0.01, Mat.frame);
    const ring = (R: number, w: number) => {
      // nastro a sezione rettangolare lungo il semicerchio (faccia, interno, esterno)
      const P = (a: number, rr: number, z: number): V3 => [Math.cos(a) * rr, WINDOW.ya + Math.sin(a) * rr, z];
      B.surface(48, 1, (u, v) => P(Math.PI * u, R - w + 2 * w * v, zc + dz), Mat.frame, { side: -1 });
      B.surface(48, 1, (u, v) => P(Math.PI * u, R - w, zc + dz - 2 * dz * v), Mat.frame, { side: 1 });
      B.surface(48, 1, (u, v) => P(Math.PI * u, R + w, zc + dz - 2 * dz * v), Mat.frame, { side: -1 });
    };
    ring(WINDOW.r - fr / 2, fr / 2); ring(WINDOW.r * WINDOW.ring, br);
    for (const x of WINDOW.cols) {
      const top = WINDOW.ya + Math.sqrt(Math.max(0, (WINDOW.r - fr) ** 2 - x * x));
      B.box([x, (WINDOW.y0 + top) / 2, zc], [br, (top - WINDOW.y0) / 2, dz * 0.85], 0.008, Mat.frame);
    }
    for (const y of [...WINDOW.rows, WINDOW.ya]) B.box([0, y, zc], [WINDOW.r - fr / 2, br, dz * 0.85], 0.008, Mat.frame);
  });

  mark("columns", () => {
    // colonne doriche: plinto, base attica tornita, fusto rastremato con 20 scanalature, collarino, echino, abaco;
    // sopra, la trabeazione (architrave e cornice) che corre lungo il colonnato
    const R = 0.42, y0 = 0.62, y1 = COL_TOP - 0.62;
    const shaft: [number, number][] = [];
    for (let k = 0; k <= 16; k++) { const t = k / 16; shaft.push([R * (1 - 0.13 * Math.pow(t, 1.6)), y0 + (y1 - y0) * t]); }
    for (const sx of [-1, 1]) for (const z of COL_Z) {
      const x = sx * COL_X;
      B.box([x, 0.14, z], [0.62, 0.14, 0.62], 0.02, Mat.stone);
      B.lathe(x, z, [[[0.6, 0.28], [0.6, 0.31], [0.57, 0.38], [0.5, 0.42], [0.47, 0.45], [0.49, 0.5], [0.47, 0.55], [0.43, 0.58], [R + 0.03, 0.6], [R, y0]]], Mat.stone, SEG, { ao: [[1, 1, 0.95, 0.8, 0.7, 0.85, 0.9, 0.85, 0.9, 1]] });
      B.lathe(x, z, [shaft], Mat.stone, mobile ? 100 : 160, { flutes: { n: 20, depth: 0.035, y0: y0 + 0.05, y1: y1 - 0.05 } });
      const rt = R * 0.87;
      B.lathe(x, z, [[[rt, y1], [rt + 0.035, y1 + 0.03], [rt, y1 + 0.06], [rt - 0.01, y1 + 0.14], [rt + 0.06, y1 + 0.22], [0.5, y1 + 0.32], [0.56, y1 + 0.4]]], Mat.stone, SEG, { ao: [[1, 0.9, 0.8, 1, 1, 1, 1]] });
      B.box([x, y1 + 0.5, z], [0.6, 0.1, 0.6], 0.02, Mat.stone);
    }
    for (const sx of [-1, 1]) {
      const z0 = COL_Z[0] - 0.7, z1 = COL_Z[COL_Z.length - 1] + 0.7, zc = (z0 + z1) / 2;
      B.box([sx * COL_X, COL_TOP + 0.3, zc], [0.5, 0.3, (z1 - z0) / 2], 0.02, Mat.stone);
      B.box([sx * COL_X, COL_TOP + 0.72, zc], [0.62, 0.12, (z1 - z0) / 2 + 0.1], 0.02, Mat.stone);
    }
  });

  mark("podium", () => {
    // pedana a due gradini; blocchi con base, corpo di marmo (numero inciso sul fronte) e cimasa di metallo
    B.box([0, 0.09, 0.1], [4.55, 0.09, 1.95], 0.025, Mat.darkStone);
    B.box([0, 0.27, 0.05], [4.1, 0.09, 1.7], 0.025, Mat.stone);
    STEP_X.forEach((x, i) => {
      const h = STEP_H[i], top = DAIS + h;
      B.box([x, DAIS + 0.06, 0], [1.13, 0.06, STEP_D + 0.05], 0.015, Mat.darkStone);
      B.box([x, DAIS + 0.12 + (h - 0.2) / 2, 0], [1.08, (h - 0.2) / 2, STEP_D], 0.03, Mat.step1 + i);
      B.box([x, top - 0.04, 0], [1.125, 0.04, STEP_D + 0.045], 0.012, Mat.gold + i);
    });
  });

  mark("trophies", () => {
    // coppe tornite: piede, stelo con il nodo, calice con il labbro e l'interno; due anse
    STEP_X.forEach((x, i) => {
      const k = TROPHY_K[i], top = DAIS + STEP_H[i], z = -0.15, m = Mat.cupGold + i;
      B.box([x, top + 0.07 * k, z], [0.24 * k, 0.07 * k, 0.24 * k], 0.015, Mat.pedestal);
      const y = top + 0.14 * k, P = (pts: number[][]) => pts.map(([r, h]) => [r * k, y + h * k] as [number, number]);
      B.lathe(x, z, [
        P([[0.0, 0], [0.2, 0], [0.21, 0.02], [0.19, 0.04], [0.11, 0.08], [0.06, 0.13], [0.045, 0.18]]),
        P([[0.045, 0.18], [0.07, 0.21], [0.085, 0.235], [0.07, 0.26], [0.04, 0.29], [0.04, 0.36], [0.07, 0.39]]),
        P([[0.07, 0.39], [0.16, 0.42], [0.25, 0.48], [0.3, 0.56], [0.32, 0.65], [0.325, 0.72], [0.34, 0.75], [0.345, 0.765], [0.33, 0.77], [0.31, 0.75], [0.3, 0.66], [0.28, 0.56], [0.22, 0.48], [0.12, 0.44], [0.0, 0.43]]),
      ], m, SEG, { ao: [[1, 1, 1, 1, 0.9, 0.85, 0.85], [0.85, 0.9, 1, 1, 1, 1, 0.9], [0.9, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.75, 0.6, 0.5, 0.42, 0.38]] });
      for (const s of [-1, 1]) B.tube((t) => {
        const a = -1.3 + 2.6 * t;
        return [x + s * (0.3 + 0.13 * Math.cos(a) + 0.02) * k, y + (0.6 + 0.12 * Math.sin(a)) * k, z];
      }, 0.022 * k, m, 28, 12);
    });
  });

  mark("banners", () => {
    // stendardi: asta con i pomoli e stoffa con le pieghe e la coda a rondine
    for (const b of BANNERS) {
      const cx = (b.x0 + b.x1) / 2, hw = (b.x1 - b.x0) / 2, zc = RB + 0.32;
      B.tube((t) => [b.x0 - 0.15 + (b.x1 - b.x0 + 0.3) * t, b.y1 + 0.05, zc], 0.03, Mat.bronze, 8, 10);
      for (const s of [-1, 1]) B.lathe(cx + s * (hw + 0.2), zc, [[[0.0, b.y1 - 0.03], [0.05, b.y1 - 0.01], [0.065, b.y1 + 0.05], [0.05, b.y1 + 0.11], [0.0, b.y1 + 0.13]]], Mat.bronze, 20);
      B.surface(mobile ? 24 : 40, mobile ? 40 : 72, (u, v) => {
        const x = b.x0 + 2 * hw * u, tail = 0.75 * (1 - Math.abs(u * 2 - 1));
        const y = b.y1 - (b.y1 - b.y0 - tail * (v > 0.9 ? (v - 0.9) * 10 : 0)) * v;
        const fold = Math.sin(u * TAU * 3.5) * 0.045 * (0.5 + 0.5 * v) + Math.sin(u * TAU * 7 + 1) * 0.012;
        return [x, Math.max(y, b.y0 + tail * 0.0), zc + 0.03 + fold + 0.06 * Math.sin(v * Math.PI) * 0.4];
      }, Mat.banner, { side: -1, uv: (u, v) => [u, v] });
    }
  });

  const vertices = new Float32Array(B.v), indices = new Uint32Array(B.idx);
  return { vertices, indices, ranges };
}
