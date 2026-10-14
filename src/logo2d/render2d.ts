// Il logo in Canvas 2D, per i browser senza WebGPU. Stessa scena, stessa animazione (LogoAnim) e stesse luci della
// versione WebGPU: la targa è proiettata in prospettiva con la sua smussatura e i fianchi, ogni faccia è illuminata con
// lo stesso materiale fisico degli shader (GGX, strato trasparente, riflessi dello studio di pannelli luminosi, ACES +
// sRGB) calcolato in JavaScript; C e pista sono tubi ombreggiati con la corrente che li percorre, poi perle, ombre di
// contatto, bagliori, orbite davanti e dietro la targa, scintille. Nessuna allocazione per fotogramma nei calcoli.
import {
  TAU, BACK, PLATE_TOP, arcAt, lin, clamp01, ORBITS, TRACES, CAP_POS, NODE_R, ARC_Z, ARC_R, LINE_Z, LINE_R, LAMP, HALO, KEY, RIM,
  FOV, STUDIO, STUDIO_BG, Pose, cameraZ, type LogoAnim, type Quality, type V3,
} from "../logo3d/anim";

type C3 = [number, number, number];
const PI = Math.PI;
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; };

// ---------- materiale fisico (porting di fsPhysical, senza velluto e iridescenza) ----------
type Mat = { color: C3; metal: number; rough: number; cc: number; ccRough: number; envI: number };
const STUDIO_L = STUDIO.map(([w, h, col, k, x, y, z]) => {
  // orientamento di Object3D.lookAt(0,0,0) con "su" = +y, come nel compute shader dell'ambiente
  const d = Math.hypot(x, y, z), c = lin(col), n = [-x / d, -y / d, -z / d];
  const ex = norm([n[2], 0, -n[0]]), ey = [n[1] * ex[2] - n[2] * ex[1], n[2] * ex[0] - n[0] * ex[2], n[0] * ex[1] - n[1] * ex[0]];
  return { pos: [x, y, z], n, ex, ey, hw: w / 2, hh: h / 2, dir: [x / d, y / d, z / d], col: [c[0] * k, c[1] * k, c[2] * k], solid: (w * h) / (d * d) };
});
const BG = lin(STUDIO_BG);
const SKY = lin(0xdffcf7).map((c) => c * 0.65), GROUND = lin(0x062521).map((c) => c * 0.65);
const KEY_C = lin(0xffffff).map((c) => c * 2.1), RIM_C = lin(0x2dd4bf).map((c) => c * 2.8);
const soft = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
// radianza dello studio in direzione r: il pannello colpito dal raggio, con i bordi sfumati quanto la rugosità
// (l'equivalente dei livelli sfocati dell'ambiente prefiltrato)
const env = (r: ArrayLike<number>, rough: number, out: number[]) => {
  out[0] = BG[0]; out[1] = BG[1]; out[2] = BG[2];
  const blur = 0.02 + rough * rough * 1.1;
  for (const p of STUDIO_L) {
    const den = dot(r, p.n); if (den > -1e-4) continue; // il raggio deve andare verso la faccia luminosa
    const t = dot(p.pos, p.n) / den; if (t <= 0) continue;
    const qx = r[0] * t - p.pos[0], qy = r[1] * t - p.pos[1], qz = r[2] * t - p.pos[2], b = blur * t;
    const u = Math.abs(qx * p.ex[0] + qy * p.ex[1] + qz * p.ex[2]), v = Math.abs(qx * p.ey[0] + qy * p.ey[1] + qz * p.ey[2]);
    const w = soft((p.hw - u) / (2 * b) + 0.5) * soft((p.hh - v) / (2 * b) + 0.5) * Math.min(1, (p.hw * p.hh) / ((p.hw + b) * (p.hh + b)) * 1.15);
    out[0] += (p.col[0] - BG[0]) * w; out[1] += (p.col[1] - BG[1]) * w; out[2] += (p.col[2] - BG[2]) * w;
  }
  return out;
};
const envDiffuse = (n: ArrayLike<number>, out: number[]) => {
  out[0] = BG[0]; out[1] = BG[1]; out[2] = BG[2];
  for (const p of STUDIO_L) { const k = Math.max(0, dot(n, p.dir)) * p.solid / PI; out[0] += p.col[0] * k; out[1] += p.col[1] * k; out[2] += p.col[2] * k; }
  return out;
};
const dfg = (dotNV: number, r: number) => {
  const r0 = -r + 1, r1 = -0.0275 * r + 0.0425, r2 = -0.572 * r + 1.04, r3 = 0.022 * r - 0.04;
  const a004 = Math.min(r0 * r0, Math.pow(2, -9.28 * dotNV)) * r0 + r1;
  return [-1.04 * a004 + r2, 1.04 * a004 + r3];
};
const ggx = (N: ArrayLike<number>, V: ArrayLike<number>, L: ArrayLike<number>, rough: number, f0: number) => {
  const H = norm([L[0] + V[0], L[1] + V[1], L[2] + V[2]]), nl = Math.max(0, dot(N, L)), nv = Math.max(1e-4, dot(N, V)), nh = Math.max(0, dot(N, H)), vh = Math.max(0, dot(V, H));
  const a = rough * rough, a2 = a * a, dd = nh * nh * (a2 - 1) + 1, D = a2 / (PI * dd * dd);
  const Vis = 0.5 / Math.max(nl * Math.sqrt(a2 + (1 - a2) * nv * nv) + nv * Math.sqrt(a2 + (1 - a2) * nl * nl), 1e-6);
  const F = f0 + (1 - f0) * Math.pow(2, (-5.55473 * vh - 6.98316) * vh);
  return nl * D * Vis * F;
};
const tmpA = [0, 0, 0], tmpB = [0, 0, 0], tmpR = [0, 0, 0];
// colore lineare in uscita da una superficie con normale N vista da V (entrambe nel mondo, normalizzate)
export const shade = (m: Mat, N: ArrayLike<number>, V: ArrayLike<number>, out: number[], ao = 1, tint?: ArrayLike<number>) => {
  const nv = Math.max(1e-4, dot(N, V)), base = tint || m.color;
  const rough = Math.max(m.rough, 0.0525), ccr = Math.max(m.ccRough, 0.0525);
  const diff = [base[0] * (1 - m.metal), base[1] * (1 - m.metal), base[2] * (1 - m.metal)];
  const f0 = [0.04 + (base[0] - 0.04) * m.metal, 0.04 + (base[1] - 0.04) * m.metal, 0.04 + (base[2] - 0.04) * m.metal];
  // riflessione: R piegata verso N quanto la rugosità, come iblRadiance
  const d2 = 2 * dot(N, V);
  tmpR[0] = d2 * N[0] - V[0]; tmpR[1] = d2 * N[1] - V[1]; tmpR[2] = d2 * N[2] - V[2];
  const hemi = 0.5 * N[1] + 0.5, irr = [GROUND[0] + (SKY[0] - GROUND[0]) * hemi, GROUND[1] + (SKY[1] - GROUND[1]) * hemi, GROUND[2] + (SKY[2] - GROUND[2]) * hemi];
  const ed = envDiffuse(N, tmpA), rad = env(tmpR, rough, tmpB), fab = dfg(nv, rough);
  const kl = Math.max(0, dot(N, KEY)), kr = Math.max(0, dot(N, RIM)), sk = ggx(N, V, KEY, rough, 0.04), sr = ggx(N, V, RIM, rough, 0.04);
  const ccK = ggx(N, V, KEY, ccr, 0.04), ccRad = env(tmpR, ccr, [0, 0, 0]), ccFab = dfg(nv, ccr), fcc = 0.04 + 0.96 * Math.pow(2, (-5.55473 * nv - 6.98316) * nv);
  const dirAO = 1 + (ao - 1) * 0.45;
  for (let i = 0; i < 3; i++) {
    const fss = f0[i] * fab[0] + fab[1];
    const direct = (diff[i] / PI) * (KEY_C[i] * kl + RIM_C[i] * kr) + (KEY_C[i] * sk + RIM_C[i] * sr) * (m.metal ? f0[i] / 0.04 : 1);
    const indirect = (diff[i] * (irr[i] / PI + ed[i] * m.envI) * (1 - fss)) * ao + rad[i] * m.envI * fss * ao;
    let o = direct * dirAO + indirect;
    o = o * (1 - m.cc * fcc) + (KEY_C[i] * ccK * dirAO + ccRad[i] * m.envI * (0.04 * ccFab[0] + ccFab[1]) * ao) * m.cc;
    out[i] = o;
  }
  return out;
};
// ACESFilmic (esposizione 1,06) + sRGB: identico a outColor degli shader
const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];
const rrt = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const tm = [0, 0, 0];
export const toSRGB = (c: ArrayLike<number>, out: number[] = [0, 0, 0]) => {
  const e = 1.06 / 0.6, r = c[0] * e, g = c[1] * e, b = c[2] * e;
  for (let i = 0; i < 3; i++) tm[i] = rrt(ACES_IN[i] * r + ACES_IN[3 + i] * g + ACES_IN[6 + i] * b);
  for (let i = 0; i < 3; i++) {
    const x = Math.min(1, Math.max(0, ACES_OUT[i] * tm[0] + ACES_OUT[3 + i] * tm[1] + ACES_OUT[6 + i] * tm[2]));
    out[i] = 255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 0.41666) - 0.055);
  }
  return out;
};
const css = (c: ArrayLike<number>, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
const litCss = (m: Mat, N: ArrayLike<number>, V: ArrayLike<number>, a = 1, ao = 1, tint?: ArrayLike<number>) => css(toSRGB(shade(m, N, V, [0, 0, 0], ao, tint)), a);

const MAT = {
  plate: { color: [1, 1, 1] as C3, metal: 0.08, rough: 0.26, cc: 0.95, ccRough: 0.1, envI: 0.95 },
  gold: { color: lin(0xe8b04a), metal: 1, rough: 0.22, cc: 0.4, ccRough: 0, envI: 1.35 },
  chip: { color: lin(0x0b1f1d), metal: 0, rough: 0.35, cc: 0.8, ccRough: 0, envI: 1 },
  tube: { color: lin(0xf4fffd), metal: 0.04, rough: 0.16, cc: 1, ccRough: 0.05, envI: 1.15 },
  pearl: { color: lin(0xffffff), metal: 0, rough: 0.14, cc: 1, ccRough: 0.06, envI: 1 },
  amber: { color: lin(0xfbbf24), metal: 0, rough: 0.16, cc: 1, ccRough: 0, envI: 1 },
};
const PLATE_A = lin(0x22d8c0), PLATE_B = lin(0x07423d), PLATE_SIDE = lin(0x0d5c54), PLATE_BACK = lin(0x082e2a);

// ---------- geometria della targa nello spazio locale ----------
const contour = (half: number, r: number, n: number) => {
  const pts: number[][] = [], c = half - r;
  [[c, c, 0], [-c, c, 90], [-c, -c, 180], [c, -c, 270]].forEach(([cx, cy, a0]) => { for (let k = 0; k <= n; k++) { const a = ((a0 + (k * 90) / n) * PI) / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } });
  return pts;
};

type Ctx = CanvasRenderingContext2D;
export type Logo2D = { resize(w: number, h: number, ratio: number): void; draw(a: LogoAnim): void };

export function createLogo2D(cv: HTMLCanvasElement, q: Quality): Logo2D | null {
  const g = cv.getContext("2d", { alpha: true }) as Ctx | null;
  if (!g) return null;
  const mobile = q.mobile, NC = mobile ? 5 : 8, K = mobile ? 2 : 4;
  // anelli del profilo: faccia anteriore, smussatura, fianco, smussatura, faccia posteriore
  const rings: number[][][] = [];
  for (let j = 0; j <= K; j++) { const th = (j / K) * (PI / 2), off = 2.6 * Math.sin(th); rings.push(contour(29.5 + off, 14.5 + off, NC).map(([x, y]) => [x, y, 2.9 + 3.4 * Math.cos(th)])); }
  for (let j = K; j >= 0; j--) { const th = (j / K) * (PI / 2), off = 2.6 * Math.sin(th); rings.push(contour(29.5 + off, 14.5 + off, NC).map(([x, y]) => [x, y, -2.9 - 3.4 * Math.cos(th)])); }
  const NR = rings.length, NP = rings[0].length;
  // facce laterali: normale locale e colore di base come i colori per vertice della versione WebGPU
  const quads: { i: number; e: number; n: number[]; col: C3 }[] = [];
  for (let i = 0; i < NR - 1; i++) for (let e = 0; e < NP; e++) {
    const f = (e + 1) % NP, a = rings[i][e], b = rings[i][f], c = rings[i + 1][e];
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-6 && Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) < 1e-6) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
    if (n[0] * mx + n[1] * my + n[2] * mz < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
    const t = clamp01((mx + 32 + (32 - my)) / 128), col: C3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let x = PLATE_A[k] + (PLATE_B[k] - PLATE_A[k]) * t;
      if (Math.abs(n[2]) < 0.45) x += (PLATE_SIDE[k] - x) * 0.35;
      if (n[2] < -0.6) x += (PLATE_BACK[k] - x) * 0.6;
      col[k] = x;
    }
    quads.push({ i, e, n, col });
  }
  const rimIn = contour(27.2, 12.6, NC), rimOut = contour(28.3, 13.5, NC);
  const arcN = mobile ? 40 : 64, arcPts = Array.from({ length: arcN + 1 }, (_, i) => arcAt(i / arcN, ARC_Z));
  const orbN = mobile ? 56 : 96;

  // bagliori: lo stesso gradiente radiale della texture WebGPU, uno per colore
  const sprite = (rgb: ArrayLike<number>) => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    if (x) {
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32), s = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;
      [[0, 1], [0.18, 0.65], [0.5, 0.15], [1, 0]].forEach(([o, a]) => gr.addColorStop(o, `rgba(${s},${a})`));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    }
    return c;
  };
  const SPR = {
    amber: sprite(toSRGB(lin(0xfbbf24))), spark: sprite(toSRGB(lin(0xffe2a0))), sparks: sprite(toSRGB([1, 0.75, 0.3])),
    orb: ORBITS.map((o) => sprite(toSRGB(lin(o.color)))),
  };
  const ORB_CSS = ORBITS.map((o) => toSRGB(lin(o.color)));

  const pose = new Pose();
  let W = 1, H = 1, ratio = 1, camZ = 184, f = 1;
  const pr = new Float64Array(NR * NP * 2);
  const wv: V3 = { x: 0, y: 0, z: 0 }, sp = [0, 0, 0];
  // proiezione: punto locale → mondo (matrice m) → schermo in pixel CSS; sp = [x, y, px per unità]
  const toWorld = (m: Float64Array, x: number, y: number, z: number) => {
    wv.x = m[0] * x + m[4] * y + m[8] * z + m[12]; wv.y = m[1] * x + m[5] * y + m[9] * z + m[13]; wv.z = m[2] * x + m[6] * y + m[10] * z + m[14];
    return wv;
  };
  const project = (p: V3) => { const k = f / (camZ - p.z); sp[0] = W / 2 + p.x * k; sp[1] = H / 2 - p.y * k; sp[2] = k; return sp; };
  const P = (m: Float64Array, x: number, y: number, z: number) => project(toWorld(m, x, y, z));
  const rot = (m: Float64Array, n: ArrayLike<number>, out: number[]) => {
    const s = Math.hypot(m[0], m[1], m[2]);
    out[0] = (m[0] * n[0] + m[4] * n[1] + m[8] * n[2]) / s; out[1] = (m[1] * n[0] + m[5] * n[1] + m[9] * n[2]) / s; out[2] = (m[2] * n[0] + m[6] * n[1] + m[10] * n[2]) / s;
    return out;
  };
  const viewDir = (p: V3, out: number[]) => { out[0] = -p.x; out[1] = -p.y; out[2] = camZ - p.z; return norm(out); };
  // il piano della faccia (anteriore o posteriore) come trasformazione affine: lì si disegnano ombre, incastonature, piste
  const planeTransform = (m: Float64Array, z: number) => {
    const o = P(m, 0, 0, z), ox = o[0], oy = o[1], ax = P(m, 1, 0, z), axx = ax[0] - ox, axy = ax[1] - oy, b = P(m, 0, 1, z);
    g.setTransform(axx * ratio, axy * ratio, (b[0] - ox) * ratio, (b[1] - oy) * ratio, ox * ratio, oy * ratio);
  };
  const glow = (img: HTMLCanvasElement, p: V3, size: number, alpha: number) => {
    if (alpha <= 0.003) return;
    const s = project(p), px = size * s[2];
    g.globalAlpha = Math.min(1, alpha); g.drawImage(img, s[0] - px / 2, s[1] - px / 2, px, px);
  };
  const nW = [0, 0, 0], vW = [0, 0, 0], tW = [0, 0, 0];

  // orbite e loro scie, metà dietro e metà davanti alla targa (cz: profondità del centro della targa)
  const orbits = (a: LogoAnim, front: boolean, cz: number) => {
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.globalCompositeOperation = "lighter"; g.lineWidth = 1.5; g.lineCap = "round";
    for (let i = 0; i < ORBITS.length; i++) {
      const o = ORBITS[i], m = pose.wo[i];
      if (a.ringA > 0.002) {
        g.strokeStyle = css(ORB_CSS[i], Math.min(1, a.ringA * 1.4)); g.beginPath();
        let prevIn = false;
        for (let k = 0; k <= orbN; k++) {
          const t = (k / orbN) * TAU, w = toWorld(m, Math.cos(t) * o.r, Math.sin(t) * o.r, 0), inFront = w.z >= cz, s = project(w);
          if (inFront === front) { if (prevIn) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }
          prevIn = inFront === front;
        }
        g.stroke();
      }
      for (let j = 0; j < q.trail; j++) {
        const ang = a.orbPh[i] + o.ph - j * 0.035 * Math.sign(o.speed), w = toWorld(m, Math.cos(ang) * o.r, Math.sin(ang) * o.r, 0);
        if ((w.z >= cz) === front) glow(SPR.orb[i], w, 8.2 - j * 0.6, a.trailA * (0.95 - j * 0.1));
      }
    }
    // scintille dello scoppio: stessa traiettoria in forma chiusa degli shader
    const now = a.particleTime;
    for (let i = 0; i < a.sp; i++) {
      const o = i * 8, life0 = a.particles[o + 3], age = now - a.particles[o + 4], life = life0 - age;
      if (life0 <= 0 || life <= 0 || age < 0) continue;
      const k = (1 - Math.exp(-2.2 * age)) / 2.2, w = toWorld(pose.root, a.particles[o] * k, a.particles[o + 1] * k, 6 + a.particles[o + 2] * k);
      if ((w.z >= cz) === front) glow(SPR.sparks, w, 3.8 * Math.tan((FOV / 2) * PI / 180) * 2.2, Math.min(life, 1));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  };

  // tubo (C o pista): strati sfalsati verso la luce, dal lato in ombra al riflesso, poi la corrente
  const tube = (pts: V3[], n: number, r: number, cur: number, gain: number, cap: CanvasLineCap) => {
    if (n < 1) return;
    const m = pose.wfg, s0 = P(m, pts[0].x, pts[0].y, pts[0].z), k = s0[2], R = r * k;
    // direzione della luce chiave sullo schermo e normali di riferimento della sezione
    const lx = KEY[0], ly = -KEY[1], ll = Math.hypot(lx, ly) || 1, ox = lx / ll, oy = ly / ll;
    const path = (dx: number, dy: number, from = 0, to = n) => {
      g.beginPath();
      for (let i = from; i <= to; i++) { const s = P(m, pts[i].x, pts[i].y, pts[i].z); if (i === from) g.moveTo(s[0] + dx, s[1] + dy); else g.lineTo(s[0] + dx, s[1] + dy); }
    };
    const V = [0, 0, 1], sec = (th: number) => { tW[0] = Math.sin(th) * ox; tW[1] = -Math.sin(th) * oy; tW[2] = Math.cos(th); return tW; };
    g.setTransform(ratio, 0, 0, ratio, 0, 0); g.lineCap = cap; g.lineJoin = "round";
    const layers: [number, number, number, number][] = [[-1.05, 2, 0, 1], [-0.25, 1.62, 0.16, 1], [0.45, 1.05, 0.38, 1], [0.85, 0.45, 0.55, 0.9]];
    for (const [th, wk, off, al] of layers) { g.strokeStyle = litCss(MAT.tube, sec(th), V, al); g.lineWidth = Math.max(1, R * wk); path(ox * R * off, oy * R * off); g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = Math.max(0.6, R * 0.16); path(ox * R * 0.62, oy * R * 0.62); g.stroke();
    // corrente: testa calda e scia, mescolate sul colore del tubo come negli shader
    if (gain > 0 && cur >= -0.3) {
      g.lineWidth = R * 1.85; g.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const d = cur - (i + 0.5) / (pts.length - 1);
        const head = Math.exp(-d * d * 1400), tail = d > 0 ? Math.exp(-d * 6) * 0.78 : 0, kk = Math.min(1, (head + tail) * gain) * 0.94;
        if (kk < 0.02) continue;
        const hk = Math.min(1, head * 1.25);
        g.strokeStyle = `rgba(255,${(143 + (242 - 143) * hk) | 0},${(20 + (199 - 20) * hk) | 0},${kk.toFixed(3)})`;
        path(0, 0, i, i + 1); g.stroke();
      }
    }
  };
  // sfera ombreggiata: gradiente radiale con il riflesso verso la luce chiave e il bordo che riflette la targa
  const ball = (m: Float64Array, c: V3, r: number, mat: Mat, emis: number) => {
    const s = P(m, c.x, c.y, c.z), x = s[0], y = s[1], R = r * s[2];
    if (R < 0.3) return;
    const lx = KEY[0], ly = -KEY[1], ll = Math.hypot(lx, ly), ox = lx / ll, oy = ly / ll, V = [0, 0, 1];
    const n = (th: number) => { tW[0] = Math.sin(th) * ox; tW[1] = -Math.sin(th) * oy; tW[2] = Math.cos(th); return tW; };
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const gr = g.createRadialGradient(x + ox * R * 0.38, y + oy * R * 0.38, R * 0.04, x, y, R);
    const e = mat === MAT.amber ? emis : 0, ec = [MAT.amber.color[0] * e, MAT.amber.color[1] * e, MAT.amber.color[2] * e];
    const stop = (o: number, th: number) => { const c = shade(mat, n(th), V, [0, 0, 0]); c[0] += ec[0]; c[1] += ec[1]; c[2] += ec[2]; gr.addColorStop(o, css(toSRGB(c))); };
    stop(0, 0.55); stop(0.35, 0.15); stop(0.75, -0.6); stop(1, -1.25);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = Math.max(0.5, R * 0.08); g.beginPath(); g.arc(x, y, R * 0.82, -2.3 + Math.atan2(oy, ox), -1.1 + Math.atan2(oy, ox)); g.stroke();
  };

  const linePts = Array.from({ length: 9 }, (_, i) => ({ x: -1 + 2 * i, y: 0, z: LINE_Z }));
  // ombra di contatto morbida: un tratto scuro nascosto sotto l'oggetto che proietta un'ombra sfocata attorno
  // (shadowBlur è in pixel del dispositivo e non segue la trasformazione: si converte dalla scala della targa)
  const shadowStroke = (draw: () => void, w: number, a: number, unitPx: number) => {
    g.shadowColor = `rgba(1,24,20,${(0.75 * a).toFixed(3)})`; g.shadowBlur = Math.max(1, w * 1.1 * unitPx * ratio);
    g.lineWidth = w * 0.8; g.strokeStyle = `rgba(1,24,20,${(0.5 * a).toFixed(3)})`; draw(); g.stroke();
    g.shadowBlur = 0; g.shadowColor = "transparent";
  };
  const front = (a: LogoAnim, V0: number[]) => {
    const m = pose.wb;
    // faccia: gradiente diagonale dell'icona (chiaro in alto a sinistra) illuminato come uno smalto lucido; il materiale si
    // valuta in cinque punti della diagonale, ognuno con la sua direzione di vista (riflessi dello studio compresi)
    rot(m, [0, 0, 1], nW);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const lid = () => { g.beginPath(); for (let e = 0; e < NP; e++) { const i = e * 2; if (e === 0) g.moveTo(pr[i], pr[i + 1]); else g.lineTo(pr[i], pr[i + 1]); } g.closePath(); };
    const p0 = P(m, -32, 32, PLATE_TOP), x0 = p0[0], y0 = p0[1], p1 = P(m, 32, -32, PLATE_TOP);
    const gr = g.createLinearGradient(x0, y0, p1[0], p1[1]), col = [0, 0, 0];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, w = toWorld(m, -32 + 64 * t, 32 - 64 * t, PLATE_TOP);
      for (let i = 0; i < 3; i++) col[i] = PLATE_A[i] + (PLATE_B[i] - PLATE_A[i]) * t;
      gr.addColorStop(t, litCss(MAT.plate, nW, viewDir(w, tW), 1, 1, col));
    }
    lid(); g.fillStyle = gr; g.fill();
    g.save(); lid(); g.clip();
    planeTransform(m, PLATE_TOP);
    g.globalCompositeOperation = "lighter";
    // luce del puntatore e lampada ambra: due macchie calde/fredde sulla vernice
    const la = Math.min(0.5, a.lampI * 0.045);
    if (la > 0.01) { const rg = g.createRadialGradient(LAMP.x, LAMP.y, 0, LAMP.x, LAMP.y, 22); rg.addColorStop(0, `rgba(251,191,36,${la.toFixed(3)})`); rg.addColorStop(1, "rgba(251,191,36,0)"); g.fillStyle = rg; g.fillRect(LAMP.x - 22, LAMP.y - 22, 44, 44); }
    const px = a.cur.x * 26, py = -a.cur.y * 22, pa = 0.07 + a.hoverK * 0.08;
    const pg = g.createRadialGradient(px, py, 0, px, py, 30); pg.addColorStop(0, `rgba(153,246,228,${pa.toFixed(3)})`); pg.addColorStop(1, "rgba(153,246,228,0)");
    g.fillStyle = pg; g.fillRect(px - 30, py - 30, 60, 60);
    g.globalCompositeOperation = "source-over";
    // ombre di contatto (come l'occlusione precalcolata della versione WebGPU), poi le incastonature d'oro
    g.lineCap = "round"; g.lineJoin = "round";
    const arcEnd = Math.round(arcN * a.arcK), unit = P(m, 0, 0, PLATE_TOP)[2];
    if (arcEnd > 0) shadowStroke(() => { g.beginPath(); for (let i = 0; i <= arcEnd; i++) { const p = arcPts[i]; if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); } }, ARC_R * 2, 1, unit);
    if (a.lineK > 0.01) shadowStroke(() => { g.beginPath(); g.moveTo(-1, 0); g.lineTo(-1 + 16 * a.lineK, 0); }, LINE_R * 2, 1, unit);
    CAP_POS.forEach((c, i) => {
      const r = a.nodeS[i]; if (r < 0.05) return;
      const sg = g.createRadialGradient(c.x, c.y, r * 0.6, c.x, c.y, r * 1.75); sg.addColorStop(0, "rgba(2,26,22,0.42)"); sg.addColorStop(1, "rgba(2,26,22,0)");
      g.fillStyle = sg; g.beginPath(); g.arc(c.x, c.y, r * 1.75, 0, TAU); g.fill();
      g.strokeStyle = litCss(MAT.gold, nW, V0); g.lineWidth = 0.34; g.beginPath(); g.arc(c.x, c.y, NODE_R[i] * 0.92, 0, TAU); g.stroke();
    });
    g.restore();
    // filetto bianco semitrasparente, leggermente in rilievo
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const rimPath = (pts: number[][], z: number) => { pts.forEach(([x, y], i) => { const s2 = P(m, x, y, z); if (i === 0) g.moveTo(s2[0], s2[1]); else g.lineTo(s2[0], s2[1]); }); g.closePath(); };
    g.beginPath(); rimPath(rimOut, PLATE_TOP + 0.35); rimPath(rimIn.slice().reverse(), PLATE_TOP + 0.35);
    g.fillStyle = litCss(MAT.plate, nW, V0, 0.34, 1, [1, 1, 1]); g.fill();
    // C, pista, perle e sfera ambra
    tube(arcPts, Math.round(arcN * a.arcK), ARC_R, a.uArc[0], a.uArc[1], "round");
    if (a.lineK > 0.01) { linePts.forEach((p, i) => { p.x = -1 + 2 * i * a.lineK; }); tube(linePts, 8, LINE_R, a.uLine[0] / a.lineK, a.uLine[1], "butt"); }
    for (let i = 0; i < 3; i++) ball(pose.wfg, CAP_POS[i], a.nodeS[i], i === 2 ? MAT.amber : MAT.pearl, a.amberE);
  };

  // oro: tavolozza fissa modulata dall'orientamento (i metalli lucidi in sola luce analitica virano al bianco)
  const goldCss = (lightness: number) => {
    const k = clamp01(lightness), c = k < 0.5 ? [138 + (217 - 138) * k * 2, 90 + (164 - 90) * k * 2, 22 + (65 - 22) * k * 2] : [217 + (255 - 217) * (k - 0.5) * 2, 164 + (230 - 164) * (k - 0.5) * 2, 65 + (163 - 65) * (k - 0.5) * 2];
    return css(c);
  };
  const backSide = (V0: number[]) => {
    const m = pose.wb, z = BACK - 0.5;
    rot(m, [0, 0, -1], nW);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    const last = (NR - 1) * NP * 2;
    // retro: lo stesso gradiente diagonale della faccia, scurito verso il colore del retro come nella versione WebGPU
    const p0 = P(m, -32, 32, -PLATE_TOP), x0 = p0[0], y0 = p0[1], p1 = P(m, 32, -32, -PLATE_TOP);
    const gr = g.createLinearGradient(x0, y0, p1[0], p1[1]), col = [0, 0, 0];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, w = toWorld(m, -32 + 64 * t, 32 - 64 * t, -PLATE_TOP);
      for (let i = 0; i < 3; i++) { const x = PLATE_A[i] + (PLATE_B[i] - PLATE_A[i]) * t; col[i] = x + (PLATE_BACK[i] - x) * 0.6; }
      gr.addColorStop(t, litCss(MAT.plate, nW, viewDir(w, tW), 1, 1, col));
    }
    g.beginPath(); for (let e = 0; e < NP; e++) { const i = last + e * 2; if (e === 0) g.moveTo(pr[i], pr[i + 1]); else g.lineTo(pr[i], pr[i + 1]); } g.closePath();
    g.fillStyle = gr; g.fill();
    // circuito d'oro: piste, piazzole, chip con i piedini
    planeTransform(m, z);
    g.lineCap = "round"; g.lineJoin = "round";
    const face = clamp01(dot(nW, V0)), gd = goldCss(0.18 + 0.2 * face), gm = goldCss(0.42 + 0.15 * face), gl = goldCss(0.8);
    for (const pts of TRACES) {
      for (const [c, w, o] of [[gd, 1.35, 0], [gm, 0.95, 0.12], [gl, 0.32, 0.3]] as [string, number, number][]) {
        g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x - o, y + o) : g.moveTo(x - o, y + o))); g.stroke();
      }
      for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
        const pg = g.createRadialGradient(x - 0.6, y + 0.6, 0.1, x, y, 1.9); pg.addColorStop(0, gl); pg.addColorStop(0.45, gm); pg.addColorStop(1, gd);
        g.fillStyle = pg; g.beginPath(); g.arc(x, y, 1.9, 0, TAU); g.fill();
      }
    }
    g.fillStyle = gm; for (let k = 0; k < 6; k++) for (const s of [-1, 1]) g.fillRect(1.75 + k * 2.5 - 0.55, -10 + s * 6.6 - 1.3, 1.1, 2.6);
    // chip: la sua faccia esterna sporge di 2,6 dal retro
    planeTransform(m, BACK - 2.6);
    const cg = g.createLinearGradient(0, -4.5, 16, -15.5); cg.addColorStop(0, litCss(MAT.chip, nW, V0, 1, 1, [0.06, 0.07, 0.07])); cg.addColorStop(1, litCss(MAT.chip, nW, V0));
    g.fillStyle = cg; g.fillRect(0, -15.5, 16, 11);
    g.strokeStyle = "rgba(255,255,255,0.1)"; g.lineWidth = 0.3; g.strokeRect(0.6, -14.9, 14.8, 9.8);
  };

  return {
    resize(w, h, r) {
      W = w; H = h; ratio = r;
      const pw = Math.max(1, Math.floor(w * r)), ph = Math.max(1, Math.floor(h * r));
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      camZ = cameraZ(w / h); f = H / 2 / Math.tan(((FOV / 2) * PI) / 180);
    },
    draw(a) {
      pose.update(a);
      const m = pose.wb;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < NR; i++) for (let e = 0; e < NP; e++) { const p = rings[i][e], s = P(m, p[0], p[1], p[2]), o = (i * NP + e) * 2; pr[o] = s[0]; pr[o + 1] = s[1]; }
      const c = toWorld(m, 0, 0, 0), cz = c.z, V0 = viewDir(c, vW);
      orbits(a, false, cz);
      // fianchi e smussature: la targa è convessa, basta scartare le facce rivolte altrove
      g.setTransform(ratio, 0, 0, ratio, 0, 0); g.lineWidth = 0.6; g.lineJoin = "round";
      for (const qd of quads) {
        rot(m, qd.n, nW);
        const p = rings[qd.i][qd.e], w = toWorld(m, p[0], p[1], p[2]);
        if (nW[0] * -w.x + nW[1] * -w.y + nW[2] * (camZ - w.z) <= 0) continue;
        const col = litCss(MAT.plate, nW, viewDir(w, tW), 1, 1, qd.col), f2 = (qd.e + 1) % NP, i0 = (qd.i * NP + qd.e) * 2, i1 = (qd.i * NP + f2) * 2, i2 = ((qd.i + 1) * NP + f2) * 2, i3 = ((qd.i + 1) * NP + qd.e) * 2;
        g.beginPath(); g.moveTo(pr[i0], pr[i0 + 1]); g.lineTo(pr[i1], pr[i1 + 1]); g.lineTo(pr[i2], pr[i2 + 1]); g.lineTo(pr[i3], pr[i3 + 1]); g.closePath();
        g.fillStyle = col; g.fill(); g.strokeStyle = col; g.stroke();
      }
      rot(m, [0, 0, 1], nW);
      if (dot(nW, V0) > 0) front(a, V0); else backSide(V0);
      // bagliori: alone ambra sulla fine della C e testa della corrente
      g.setTransform(ratio, 0, 0, ratio, 0, 0); g.globalCompositeOperation = "lighter";
      // (dietro la targa li nasconderebbe il test di profondità)
      if (dot(nW, V0) > 0) {
        glow(SPR.amber, toWorld(pose.wfg, HALO.x, HALO.y, HALO.z), a.haloS * a.badgeS, a.haloA);
        glow(SPR.spark, toWorld(pose.wfg, a.spark.x, a.spark.y, a.spark.z), 9.5 * a.badgeS, a.spark.a);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      orbits(a, true, cz);
    },
  };
}
