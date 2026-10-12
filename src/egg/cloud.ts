// Cloud Strife (FF VII Remake) — dolcevita a coste senza maniche, bretelle e corsetto di cuoio, pantaloni larghi,
// anfibi, spallaccio imbullonato, bracciale sul braccio sinistro, manicotto sul destro e Buster Sword
import { CharDef, Frame, Grid, P0, Raster, Skel, V, Arm, Leg, hex, rp, torsoFrame, frameAt, along, lerpV, variant } from "./rig";

const HAIR = rp("#6b4a26", "#b48a52", "#dcbc82", "#f7e6bc");
const SKIN = rp("#8c5a46", "#d29a7c", "#f0c6a6", "#ffe4cc");
const KNIT = rp("#12151f", "#232838", "#363d55", "#535c7a");
const PANTS = rp("#111117", "#22222c", "#363643", "#525261");
const BOOT = rp("#100f12", "#252328", "#3d3a42", "#5e5a64");
const GLOVE = rp("#100f12", "#211f25", "#36333b", "#524e57");
const BELT = rp("#1d130d", "#3a281c", "#5a412e", "#7d5d44");
const METAL = rp("#2c313b", "#666f7d", "#a6b0bd", "#e8eef5");
const IRON = rp("#1b1e24", "#373c46", "#5a616d", "#878f9c");
const PAUL = rp("#121418", "#272a30", "#43474f", "#868c96");
const STEEL = rp("#202328", "#41464e", "#6a7079", "#a0a7b0");
const GRIP = rp("#1b120d", "#36261a", "#55402d", "#765c43");

// ---------- testa ----------
// viso di profilo verso destra, a pixel; l'ancora (5,12) è l'attacco del collo. I capelli sono a parte, ciocca per ciocca.
const fp: Record<string, number> = {
  s: SKIN[0], S: SKIN[1], L: SKIN[2], W: SKIN[3],
  e: hex("#7cf0e4"), k: hex("#2a1a14"), m: hex("#a8685a"), r: SKIN[2],
};
const FACE: Grid = {
  ax: 5, ay: 12, pal: fp, rows: [
    "............",
    "............",
    "........LL..",
    ".......SLLL.",
    "..sSSSSkkLL.",
    "..srsSSkeLL.",
    "..srsSSSSLLW",
    "..srsSSSSLLW",
    "...ssSSSSL..",
    "....sSSSSm..",
    ".....sSSSL..",
    "......ssS...",
  ],
};
const FACE_HURT = variant(FACE, { e: "k" });

// ciocca: radice (x,y) nel sistema della testa, angolo come gli arti (0 giù, 90 avanti, 180 su, -90 dietro),
// lunghezza, larghezza alla radice, curvatura (gradi aggiunti verso la punta), d = un tono più scura (strato dietro)
type Lock = [number, number, number, number, number, number, number?];
const BACK: Lock[] = [
  // nuca: punte che scendono all'indietro sul collo
  [-2.5, -5.5, -38, 6, 4.4, -6, 1],
  // dietro: ciocche lunghe quasi orizzontali che in punta si alzano
  [-4, -9, -84, 8.5, 5.6, -14, 1],
  [-3, -12.5, -118, 9.5, 5.6, -10, 1],
  // corona e cima
  [-0.5, -14, -150, 9, 5.4, -6, 1],
  [2.5, -14, 174, 7, 5, 6, 1],
  // punte sottili e lunghe che spezzano la sagoma fra una ciocca grossa e l'altra
  [-3.5, -7.5, -66, 8, 3, -12, 1],
  [-4, -11, -106, 9.5, 3, -14, 1],
  [-1.5, -14, -140, 10, 3, -8, 1],
  [1.5, -14.5, -170, 8.5, 2.8, 2, 1],
];
const MID: Lock[] = [
  [-4, -7, -60, 7, 5, -10],
  [-3.5, -11, -100, 8.5, 5.4, -14],
  [-1.5, -13.5, -133, 8.5, 5.2, -8],
  [1, -14, -165, 7.5, 4.8, -4],
  // ciuffo davanti che punta avanti e in alto sopra la fronte
  [3.5, -13, 138, 6.5, 4.6, 14],
];
const FRONT: Lock[] = [
  // ciocca davanti all'orecchio, fino alla guancia
  [1, -10, 6, 8.5, 3, 8],
  // frangia: sporge sopra il sopracciglio e ricade davanti al viso
  [4.2, -11.5, 50, 6.5, 3.6, -34],
];
const LX = 0.55, LY = -0.83; // luce dall'alto, davanti
const prof = (t: number) => (t < 0.15 ? 0.85 + t : (1 - t) / 0.85);
const drawLock = (r: Raster, F: Frame, k: Lock, g: number) => {
  const [x, y, a, l, w, b, d] = k, n = 7, c: V[] = [], ang: number[] = [];
  let p: V = { x, y };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    c.push(p); ang.push(a + b * t);
    if (i < n) p = along(p, a + b * (t + 0.5 / n), l / n);
  }
  const L: number[] = [], R: number[] = [];
  c.forEach((q, i) => {
    const hw = (w / 2) * prof(i / n), l0 = along(q, ang[i] + 90, hw), r0 = along(q, ang[i] - 90, hw);
    L.push(l0.x, l0.y); R.unshift(r0.x, r0.y);
  });
  r.poly(F, L.concat(R), HAIR, g, {
    fn: (X, Y) => {
      // punto più vicino sulla linea centrale: t lungo la ciocca e distanza con segno (positiva verso la luce)
      let best = 1e9, T = 0, side = 0;
      for (let i = 0; i < n; i++) {
        const A = c[i], B = c[i + 1], ux = B.x - A.x, uy = B.y - A.y, LL = ux * ux + uy * uy || 1e-6;
        const s = Math.max(0, Math.min(1, ((X - A.x) * ux + (Y - A.y) * uy) / LL));
        const dx = X - A.x - ux * s, dy = Y - A.y - uy * s, dd = dx * dx + dy * dy;
        if (dd < best) { best = dd; T = (i + s) / n; side = ux * dy - uy * dx; }
      }
      const nrm = along({ x: 0, y: 0 }, a + b * T + (side > 0 ? -90 : 90), 1);
      const u = (Math.sqrt(best) / Math.max(0.6, (w / 2) * prof(T))) * (nrm.x * LX + nrm.y * LY > 0 ? 1 : -1);
      return (u > 0.25 ? 3 : u > -0.35 ? 2 : 1) - (d || 0);
    },
  });
};
// calotta: la massa dei capelli sotto le ciocche, così fra una punta e l'altra non resta il vuoto
const CAP = [-2.5, -3, -5, -4.5, -6.2, -8, -5.5, -12, -3, -14.6, 1, -15.4, 4.4, -14.2, 5.8, -12, 5.2, -10.4, 3, -10, 0.4, -9.4, -1, -8, -1.4, -5];
const drawHead = (r: Raster, at: V, hurt: boolean, g0: number) => {
  const o = { x: Math.round(at.x), y: Math.round(at.y) }, F: Frame = { o, ax: { x: 1, y: 0 }, ay: { x: 0, y: 1 } };
  let g = g0;
  r.poly(F, CAP, HAIR, g++, { sh: "blob", t: -1 });
  BACK.forEach((k) => drawLock(r, F, k, g));
  g++;
  MID.forEach((k) => drawLock(r, F, k, g));
  g++;
  // il viso sta in un gruppo più alto delle ciocche davanti: così il bordo scuro cade sui capelli, non sulla pelle
  r.grid(hurt ? FACE_HURT : FACE, o, g + FRONT.length);
  FRONT.forEach((k) => drawLock(r, F, k, g++));
  return g + 1;
};

// ---------- corpo ----------
// pantaloni larghi raccolti negli anfibi allacciati
const leg = (r: Raster, L: Leg, g: number, dim = 0) => {
  const bt = lerpV(L.k, L.a, 0.52);
  r.limb(L.h, L.k, 8.4, 7.6, PANTS, g, dim);
  r.limb(L.k, bt, 7.6, 8.4, PANTS, g, dim);
  r.limb(lerpV(L.k, bt, 0.5), bt, 9, 8.6, PANTS, g, dim, 2);
  r.limb(bt, L.a, 5.6, 5.4, BOOT, g, dim);
  r.limb(bt, along(bt, L.a2, 1.4), 6.4, 6.2, BOOT, g, dim, 0);
  const Ff = frameAt(L.a, L.fa);
  r.poly(Ff, [-3.2, -3, 1.6, -3, 4, -1.2, 6.4, 0, 7, 1.4, 7, 3, -3.2, 3], BOOT, g, { dim });
  r.poly(Ff, [-3.2, 2.1, 7, 2.1, 7, 3, -3.2, 3], BOOT, g, { sh: "flat", t: 0 });
  // lacci sul davanti del gambale e cinghietta in cima
  [0.25, 0.5, 0.75].forEach((k) => r.dot(along(lerpV(bt, L.a, k), L.a2 + 90, 2.2), BOOT[3], g));
  r.dot(along(along(bt, L.a2, 0.7), L.a2 + 90, 2.8), METAL[2], g);
};

// braccio sinistro (vicino): bracciale a piastre imbullonato e guanto; destro (lontano): manicotto nero e guanto
const arm = (r: Raster, A: Arm, g: number, dim: number, near: boolean) => {
  r.limb(A.s, A.e, 4.8, 4, SKIN, g, dim);
  const c = lerpV(A.e, A.w, near ? 0.22 : 0.08);
  r.limb(A.e, c, 4, 3.9, SKIN, g, dim);
  if (near) {
    r.limb(c, A.w, 5.4, 5, IRON, g, dim);
    [0, 0.36, 0.7].forEach((k) => r.limb(lerpV(c, A.w, k), along(lerpV(c, A.w, k), A.a2, 0.8), 5.9, 5.7, IRON, g, dim, 0));
    [0.2, 0.55, 0.88].forEach((k) => r.dot(along(lerpV(c, A.w, k), A.a2 + 90, 1.9), METAL[3], g));
  } else r.limb(c, A.w, 4.4, 4.2, GLOVE, g, dim);
  r.limb(A.w, along(A.w, A.a2, 1.6), 4.4, 3.8, GLOVE, g, dim);
};

// Buster Sword: lama larga con filo smussato, due fori, guardia a blocco imbullonata, impugnatura fasciata
const buster = (r: Raster, at: V, ang: number, g: number) => {
  const F = frameAt(at, ang);
  r.poly(F, [-7.4, -1.3, 2.6, -1.3, 2.6, 1.3, -7.4, 1.3], GRIP, g, { fn: (X, Y) => (Math.floor(X * 0.9 + Y * 0.7 + 20) % 2 ? 1 : 2) + (Y < -0.4 ? 1 : 0) });
  r.limb(along(at, ang, -8.2), along(at, ang, -8.8), 3.2, 3.2, METAL, g);
  r.poly(F, [2.6, -5.2, 6, -5.2, 6, 5.2, 2.6, 5.2], IRON, g, { sh: "cy" });
  r.poly(F, [6, -4.6, 48, -4.6, 52, 1.6, 52, 4.6, 6, 4.6], STEEL, g, {
    fn: (X, Y) => {
      if (Math.hypot(X - 9.6, Y + 0.6) < 1.35 || Math.hypot(X - 13.6, Y + 0.6) < 1.35) return 0;
      if (Y > 3) return 3;
      if (Y > 2.2) return 1;
      if (Y < -3.8) return 1;
      // graffi e usura sul piatto
      if ((Math.floor(X * 1.7) * 7 + Math.floor((Y + 5) * 1.3) * 13) % 23 === 0) return 1;
      return 2;
    },
  });
  [-3.4, 0, 3.4].forEach((y) => r.dot(along(along(at, ang, 4.3), ang + 90, y), METAL[2], g));
};

const draw = (r: Raster, s: Skel, _c: V[][]) => {
  const F = torsoFrame(s), p = s.p;
  // braccio e gamba lontani: un tono più scuri, per dare profondità
  if (!p.ik) arm(r, s.arm.b, 10, 1, false);
  leg(r, s.leg.b, 20, 1);
  // bacino, dolcevita a coste, corsetto di cuoio con doppia cintura
  r.poly(F, [-5, -4.5, 4.6, -4.5, 5.4, 1, 4.8, 3.4, -5.2, 3.4, -5.6, 0], PANTS, 30);
  r.poly(F, [-4.2, 6, 4.4, 6, 4.8, 8, 5.6, 12, 5.2, 15.8, 3.2, 18.4, -1.6, 19, -4.6, 17, -5.4, 11.4, -4.8, 7.4], KNIT, 30, {
    fn: (X, Y) => {
      const base = X > 3 ? 3 : X > -1.2 ? 2 : X > -3.8 ? 1 : 0;
      return base - ((Math.floor(X + 20) & 1) && Y < 17 ? 1 : 0) + (Y > 13 && X > 0 ? 1 : 0);
    },
  });
  r.poly(F, [-2.2, 17, 2.8, 17, 2.8, 21.6, -1.8, 21.6], KNIT, 30, { fn: (X) => ((Math.floor(X + 20) & 1) ? 1 : 2) });
  r.poly(F, [-5.4, 2.4, 5.2, 2.4, 5.6, 5, 5.4, 9, -5.2, 9, -5.6, 5], BELT, 31, { sh: "cx" });
  // fregio sul corsetto
  r.poly(F, [2.6, 4.4, 4.6, 4.4, 4.6, 7.2, 2.6, 7.2], BELT, 32, { sh: "flat", t: 1 });
  r.poly(F, [-5.4, -0.6, 5.3, -0.6, 5.3, 2.4, -5.4, 2.4], BELT, 32, { sh: "cx", t: -1 });
  const bk = along(along(s.hip, 90 - s.lean, 4.8), 180 - s.lean, 0.9);
  r.poly(frameAt(bk, 180 - s.lean), [-1.2, -1.1, 1.2, -1.1, 1.2, 1.1, -1.2, 1.1], METAL, 33, { sh: "cy" });
  // bretella: dalla spalla scende dritta al corsetto
  r.poly(F, [1.2, 18.6, 3, 18.4, 4.6, 9, 3, 9], BELT, 31, { sh: "cx" });
  leg(r, s.leg.f, 40);
  // collo e testa
  r.limb(s.neck, s.head, 3.6, 3.4, SKIN, 50, 0);
  let g = drawHead(r, s.head, !!p.ex, 100);
  if (p.ik) arm(r, s.arm.b, g++, 1, false);
  buster(r, s.grip, s.wa, g++);
  arm(r, s.arm.f, g++, 0, true);
  // spallaccio: piastra bombata con bordo ribattuto e tre bulloni; segue a metà la rotazione dell'omero
  const A = s.arm.f, pa = (A.a1 - s.lean) * 0.5, PF = frameAt(along(A.s, A.a1, 1.6), pa);
  const at = (X: number, Y: number): V => ({ x: PF.o.x + PF.ax.x * X + PF.ay.x * Y, y: PF.o.y + PF.ax.y * X + PF.ay.y * Y });
  r.limb(along(A.s, A.a1, 4.8), along(A.s, A.a1, 6), 5.2, 4.8, BELT, g++, 0, 0);
  r.poly(PF, [-4.4, -1.6, -3.8, -4, -1.8, -5.2, 1.8, -5.2, 4.4, -4, 5.6, -0.6, 5, 3.4, 1.8, 5, -1.8, 4.8, -3.8, 3, -4.4, 0.6], PAUL, g, {
    fn: (X, Y) => {
      // bordo consumato chiaro in alto, piastra scura e bombata, lato in ombra verso il basso
      const e = Math.max(Math.abs(X - 0.6) / 5, Math.abs(Y) / 5.1);
      if (e > 0.84) return X < 1 ? 3 : 1;
      return (Y < -1.6 ? 2 : 1) + (X < -1.5 && Y < 1 ? 1 : 0) - (X > 3.4 ? 1 : 0);
    },
  });
  // bulloni sporgenti sul bordo alto (verso la nuca) e una testa di rivetto sul davanti
  [1, 3.6].forEach((Y) => { const b0 = at(-4, Y); r.limb(b0, along(b0, pa + 196, 2.4), 2, 1.6, METAL, g + 1); });
  r.dot(at(0, -2.6), METAL[3], g + 1);
};

// posa base come la figure di riferimento: gambe larghe e piegate, spadone impugnato a due mani
const B = { ...P0, lean: 12, fu: 26, ff: 30, bu: -8, bf: 26, ft: 36, fs: -44, fa: 8, bt: -34, bs: -4, ba: 34, w: 96, ik: 1 };

export const CLOUD: CharDef = {
  id: "cloud", name: "Cloud Strife",
  body: { thigh: 13, shin: 13, ankle: 2.5, foot: 4.6, heel: 1.6, torso: 18, neck: 2, ua: 10, la: 9, shF: [0.6, 15.6], shB: [-1.6, 15.6], hipF: 1, hipB: -1.5, grip: 4 },
  base: B, buf: [240, 170, 120, 130], ink: hex("#0d0b16"),
  weapon: { base: 14, tip: 52 }, smear: [hex("#ffffff", 235), hex("#9fdcff", 200)],
  draw,
  anims: {
    idle: {
      len: 1.3, loop: true, fps: 12, keys: [
        { t: 0, p: {} },
        { t: 0.65, p: { lean: 14, fu: 23, ff: 32, w: 92, fs: -48, bs: -8, hy: 1 } },
      ],
    },
    run: {
      len: 0.6, loop: true, fps: 20, speed: 120, keys: [
        { t: 0, p: { ik: 0, lean: 15, fu: -30, ff: 18, w: -62, ft: 38, fs: -8, fa: -6, bt: -28, bs: -60, ba: 10, bu: 38, bf: 42, y: 0 }, e: "lin" },
        { t: 0.075, p: { ft: 22, fs: -30, fa: 0, bt: -10, bs: -88, ba: 0, y: 1, bu: 20, bf: 48, fu: -27 }, e: "lin" },
        { t: 0.15, p: { ft: -2, fs: -18, bt: 26, bs: -100, y: 0, bu: -6, bf: 42, w: -64 }, e: "lin" },
        { t: 0.225, p: { ft: -32, fs: -12, fa: 12, bt: 50, bs: -58, y: -2, bu: -32, bf: 30, fu: -32 }, e: "lin" },
        { t: 0.3, p: { ft: -28, fs: -60, fa: 10, bt: 38, bs: -8, ba: -6, y: 0, bu: -40, bf: 26, w: -62 }, e: "lin" },
        { t: 0.375, p: { ft: -10, fs: -88, fa: 0, bt: 22, bs: -30, ba: 0, y: 1, bu: -22, bf: 34, fu: -27 }, e: "lin" },
        { t: 0.45, p: { ft: 26, fs: -100, bt: -2, bs: -18, y: 0, bu: 8, bf: 42, w: -64 }, e: "lin" },
        { t: 0.525, p: { ft: 50, fs: -58, bt: -32, bs: -12, ba: 12, y: -2, bu: 30, bf: 44, fu: -32 }, e: "lin" },
      ],
    },
    jump: {
      len: 0.3, fps: 15, ground: false, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 18, ft: 30, fs: -60, bt: -25, bs: -50, fu: -40, ff: 20, w: -70, bu: 40, bf: 40 } },
        { t: 0.12, p: { lean: 4, ft: 55, fs: -75, bt: -8, bs: -38, fu: -20, ff: 40, w: -100, bu: 70, bf: 50 } },
      ],
    },
    fall: {
      len: 0.4, loop: true, fps: 10, ground: false, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 2, ft: 24, fs: -30, bt: -14, bs: -28, fu: -10, ff: 40, w: -115, bu: 80, bf: 30, hy: 0 } },
        { t: 0.2, p: { ft: 20, fs: -24, bt: -18, bs: -22, bu: 86, bf: 26, w: -118 } },
      ],
    },
    land: {
      len: 0.22, fps: 15, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 22, ft: 42, fs: -86, bt: -32, bs: -74, fu: 0, ff: 30, w: -40, bu: 30, bf: 30 } },
        { t: 0.22, p: {} },
      ],
    },
    atk1: {
      len: 0.42, fps: 20, trail: [0.05, 0.2], cancel: 0.22,
      hit: [{ t0: 0.08, t1: 0.17, box: [6, -52, 48, 0], dmg: 12, kb: 130 }],
      keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: -6, fu: 165, ff: 25, w: 205, bu: -25, bf: 35, ft: 18, fs: -22, bt: -22, bs: -12, ex: 1 }, e: "in" },
        { t: 0.1, p: { lean: 22, fu: 75, ff: 5, w: 75, ft: 36, fs: -30, bt: -28, bs: -10, bu: -40, bf: 20 }, e: "out" },
        { t: 0.17, p: { lean: 27, fu: 42, ff: 2, w: 32, ex: 0 } },
        { t: 0.42, p: {} },
      ],
    },
    atk2: {
      len: 0.42, fps: 20, trail: [0.04, 0.18], cancel: 0.22,
      hit: [{ t0: 0.07, t1: 0.16, box: [4, -64, 44, 0], dmg: 12, kb: 90, ky: -160 }],
      keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 16, fu: -42, ff: 12, w: -28, ft: 30, fs: -52, bt: -22, bs: -40, bu: 30, bf: 30, ex: 1 }, e: "in" },
        { t: 0.09, p: { lean: -6, fu: 125, ff: -12, w: 150, ft: 12, fs: -8, bt: -14, bs: -6, bu: -20, bf: 40 }, e: "out" },
        { t: 0.16, p: { lean: -10, fu: 160, ff: -8, w: 178, ex: 0 } },
        { t: 0.42, p: {} },
      ],
    },
    atk3: {
      len: 0.66, fps: 20, trail: [0.13, 0.28], cancel: 0.5,
      hit: [{ t0: 0.2, t1: 0.32, box: [8, -44, 56, 2], dmg: 24, kb: 240, ky: -120 }],
      keys: [
        { t: 0, p: { lean: -12, fu: 172, ff: 30, w: 218, ik: 1, ft: 26, fs: -48, fa: 0, bt: -26, bs: -42, ba: 4, ex: 1 }, e: "out" },
        { t: 0.14, p: { y: -12, lean: -2, fu: 186, ff: 22, w: 228, ft: 52, fs: -95, bt: 10, bs: -100 }, e: "in" },
        { t: 0.24, p: { y: 0, lean: 32, fu: 62, ff: 2, w: 44, ft: 46, fs: -44, bt: -42, bs: -30 } },
        { t: 0.34, p: { lean: 35, fu: 58, w: 40, ex: 0 } },
        { t: 0.66, r: true },
      ],
    },
    air: {
      len: 0.36, fps: 20, ground: false, trail: [0.02, 0.3],
      hit: [{ t0: 0.04, t1: 0.3, box: [-30, -60, 44, 10], dmg: 10, kb: 90 }],
      keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, rot: 0, lean: 10, fu: 100, ff: 0, w: 100, ft: 60, fs: -110, bt: 40, bs: -110, bu: 40, bf: 60 }, e: "lin" },
        { t: 0.3, p: { rot: 360 }, e: "out" },
        { t: 0.36, p: {} },
      ],
    },
    roll: {
      len: 0.4, fps: 20, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 30, ft: 50, fs: -90, bt: -20, bs: -80, fu: -20, ff: 60, w: -40, bu: 40, bf: 80, rot: 0 }, e: "lin" },
        { t: 0.06, p: { lean: 45, ft: 85, fs: -140, bt: 70, bs: -140, rot: 30 }, e: "lin" },
        { t: 0.3, p: { rot: 360 }, e: "out" },
        { t: 0.4, p: { lean: 20, ft: 40, fs: -70, bt: -30, bs: -60, rot: 360 } },
      ],
    },
    hurt: {
      len: 0.32, fps: 15, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: -20, hx: -1, fu: -40, ff: 60, w: -50, bu: 50, bf: 50, ft: 24, fs: -24, bt: -26, bs: -14, ex: 1 }, e: "out" },
        { t: 0.32, r: true },
      ],
    },
    death: {
      len: 1.4, fps: 12, keys: [
        { t: 0, p: { ik: 0, lean: -20, fu: -40, ff: 60, w: -50, bu: 50, bf: 50, ex: 1 }, e: "in" },
        { t: 0.35, p: { lean: 30, ft: 82, fs: -100, bt: -5, bs: -92, ba: 10, fu: 40, ff: 20, w: 15, bu: 10, bf: 10, hy: 1 }, e: "out" },
        { t: 0.9, p: { lean: 38 } , e: "in" },
        { t: 1.2, p: { rot: 82, lean: 0, ft: 0, fs: 0, bt: -6, bs: -4, fu: 160, ff: 10, w: 160, bu: 150, bf: 20 } },
      ],
    },
    win: {
      len: 1.2, fps: 15, trail: [0.05, 0.45], keys: [
        { t: 0, p: { ik: 0, lean: 0, fu: 60, ff: 10, w: 90 }, e: "lin" },
        { t: 0.45, p: { w: 90 + 720, fu: 70 }, e: "out" },
        { t: 0.7, p: { lean: -4, fu: 150, ff: 110, w: 250 + 720, bu: 10, bf: 20, ft: 8, fs: -4, fa: 0, bt: -10, bs: -4, ba: 4 } },
        { t: 1.2, p: { hy: 0 } },
      ],
    },
  },
};
