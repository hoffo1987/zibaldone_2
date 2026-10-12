// Cloud Strife (FF VII) — dolcevita viola senza maniche, pantaloni larghi, stivaloni, bracciali, spallaccio e Buster Sword
import { CharDef, Grid, P0, Raster, Skel, V, Arm, Leg, hex, rp, torsoFrame, frameAt, along, lerpV, variant } from "./rig";

const HAIR = rp("#8a5216", "#cf9327", "#f1c84f", "#fff2a2");
const SKIN = rp("#8f5440", "#d1916c", "#f2c49c", "#ffe3c6");
const KNIT = rp("#1c1430", "#33264f", "#4b3974", "#66519a");
const PANTS = rp("#22163f", "#3b2768", "#56409a", "#7861c2");
const BOOT = rp("#2e170c", "#5e3119", "#8e5129", "#bd7a45");
const GLOVE = rp("#2f160c", "#5a2d16", "#844624", "#ab6436");
const BELT = rp("#26150c", "#4f2d18", "#7a4826", "#a46638");
const METAL = rp("#2c313b", "#666f7d", "#a6b0bd", "#e8eef5");
const PAUL = rp("#22252b", "#464b55", "#737a86", "#a8afba");
const IRON = rp("#2a2e36", "#555c68", "#8a929e", "#c4cad3");
const STEEL = rp("#30343b", "#646a73", "#959ba3", "#cfd4da");
const GRIP = rp("#3e0a0e", "#7a1820", "#b02a33", "#dc4f55");

const hp: Record<string, number> = {
  a: HAIR[0], b: HAIR[1], c: HAIR[2], d: HAIR[3],
  s: SKIN[0], S: SKIN[1], L: SKIN[2], W: SKIN[3],
  e: hex("#5fe8ff"), k: hex("#3a2014"), m: hex("#a35e48"), n: KNIT[2],
};
// testa di profilo verso destra: ciuffo enorme a punte, frangia sulla fronte; l'ancora è l'attacco del collo
const HEAD: Grid = {
  ax: 11, ay: 21, pal: hp, rows: [
    "..........d...........",
    "...b......dc.....c....",
    "....b....cdc....cc....",
    "....bb...cdcc..ccc..c.",
    ".b...bc.ccddc.cccc.cc.",
    "..bb.bbcccdcdccccccc..",
    "...bbbbccccdcddccccc..",
    "b..bbbbcccccddcccccccd",
    "...bbbbccccccdccccccd.",
    "aabbbbbcccccccdcccccdd",
    ".aabbbbbccccccccbcccc.",
    "..aabbbbbbcccccbcdbcc.",
    "aaaabbbbbbbccbbcSdccbc",
    ".aaabbbbbbbbbbSSLcbbcd",
    "...aabbbbbbbbsSkkLLbc.",
    "..aaaabbbbbbsSSSeLLb..",
    "....aaabbbbbsSSSLLLLW.",
    "......aabbb.sSSSSLLLL.",
    "........ab...sSSSmLL..",
    "..............ssSSL...",
    "..............sss.....",
  ],
};
const HEAD_HURT = variant(HEAD, { e: "k" });

// pantaloni a sbuffo: coscia e tibia larghe, rigonfiamento sopra lo stivale
const leg = (r: Raster, L: Leg, g: number, dim = 0) => {
  const bt = lerpV(L.k, L.a, 0.5);
  r.limb(L.h, L.k, 8.6, 7.6, PANTS, g, dim);
  r.limb(L.k, bt, 7.6, 8.2, PANTS, g, dim);
  r.limb(lerpV(L.k, bt, 0.55), bt, 8.8, 8.4, PANTS, g, dim, 2);
  // stivalone: gambale, risvolto e piede tozzo con suola
  r.limb(bt, L.a, 6, 5.8, BOOT, g, dim);
  r.limb(bt, along(bt, L.a2, 1.6), 7.2, 7, BOOT, g, dim, 0);
  const Ff = frameAt(L.a, L.fa);
  r.poly(Ff, [-3.4, -3, 1.8, -3, 4.2, -1, 6.6, 0.2, 7.2, 1.6, 7.2, 3, -3.4, 3], BOOT, g, { dim });
  r.poly(Ff, [-3.4, 2, 7.2, 2, 7.2, 3, -3.4, 3], BOOT, g, { sh: "flat", t: 0 });
};

// braccia nude e muscolose, bracciale di metallo borchiato, guanto marrone
const arm = (r: Raster, A: Arm, g: number, dim = 0) => {
  r.limb(A.s, A.e, 4.8, 4, SKIN, g, dim);
  const c = lerpV(A.e, A.w, 0.3);
  r.limb(A.e, c, 4, 3.8, SKIN, g, dim);
  r.limb(c, A.w, 5.2, 5, IRON, g, dim);
  r.limb(c, along(c, A.a2, 0.9), 5.8, 5.8, IRON, g, dim, 0);
  r.limb(A.w, along(A.w, A.a2, 1.6), 4.4, 3.8, GLOVE, g, dim);
  [0.35, 0.75].forEach((k) => r.dot(along(lerpV(c, A.w, k), A.a2 + 90, 1.8), METAL[3], g));
};

// crepe della lama: spezzate nel sistema locale (x lungo la lama, y di traverso)
const CRACKS = [
  [16, -1.2, 18.5, 0.6, 21, 0.2, 23.5, 2],
  [19.5, 0.4, 21, -2.6],
  [27, -3.6, 28.5, -1.2, 31, -1.8, 33, 0.8, 35.5, 0.4],
  [33, 0.8, 34, 2.6],
  [38, 2.4, 40, 0, 42.5, 0.6, 44, -2.4, 46.5, -2],
  [42.5, 0.6, 44.5, 2.4],
];
const crack = (X: number, Y: number) => {
  let m = 9;
  CRACKS.forEach((c) => {
    for (let i = 0; i + 3 < c.length; i += 2) {
      const ax = c[i], ay = c[i + 1], bx = c[i + 2] - ax, by = c[i + 3] - ay, L = bx * bx + by * by;
      const t = Math.max(0, Math.min(1, ((X - ax) * bx + (Y - ay) * by) / L));
      m = Math.min(m, Math.hypot(X - ax - bx * t, Y - ay - by * t));
    }
  });
  return m;
};

// Buster Sword: lama larga e scheggiata, due fori alla base, guardia a cornice, impugnatura rossa
const buster = (r: Raster, at: V, ang: number, g: number) => {
  const F = frameAt(at, ang);
  r.limb(along(at, ang, -7), along(at, ang, 2.6), 2.6, 2.6, GRIP, g);
  r.limb(along(at, ang, -8.2), along(at, ang, -8.6), 3.2, 3.2, METAL, g);
  r.poly(F, [2.6, -5.4, 5.4, -5.4, 5.4, 5.4, 2.6, 5.4], METAL, g, { sh: "cy" });
  r.poly(F, [5.4, -4.6, 48, -4.6, 52, 1.2, 52, 4.6, 5.4, 4.6], STEEL, g, {
    fn: (X, Y) => {
      if (Math.hypot(X - 9, Y + 0.4) < 1.35 || Math.hypot(X - 13, Y + 0.4) < 1.35) return 0;
      if (X < 6.4) return 1;
      if (Y > 3.2) return 3;
      if (Y < -3.6) return 1;
      const d = crack(X, Y);
      if (d < 0.55) return 1;
      if (d < 1.3 && crack(X, Y - 1) < 0.55) return 3;
      return 2;
    },
  });
  // borchie della guardia
  [-3.6, 3.6].forEach((y) => r.dot(along(along(at, ang, 4), ang + 90, y), METAL[3], g));
};

const draw = (r: Raster, s: Skel, _c: V[][]) => {
  const F = torsoFrame(s), p = s.p;
  // braccio e gamba lontani: un tono più scuri, per dare profondità
  if (!p.ik) arm(r, s.arm.b, 10, 1);
  leg(r, s.leg.b, 20, 1);
  // bacino (sbuffo dei pantaloni), dolcevita a coste, cintura con fibbia tonda
  r.poly(F, [-5, -4.5, 4.6, -4.5, 5.4, 1, 4.8, 3.4, -5.2, 3.4, -5.6, 0], PANTS, 30);
  r.poly(F, [-4.2, 2.6, 4, 2.6, 4.6, 7, 5.6, 12, 5.2, 15.8, 3.2, 18.4, -1.6, 19, -4.6, 17, -5.4, 11.4, -4.8, 6.4], KNIT, 30, {
    fn: (X, Y) => {
      const base = X > 3 ? 3 : X > -1.2 ? 2 : X > -3.8 ? 1 : 0;
      return base - (((Math.floor(X + 20) & 1) && Y > 4 && Y < 17) ? 1 : 0) + (Y > 13 && X > 0 ? 1 : 0);
    },
  });
  r.poly(F, [-2, 17, 2.6, 17, 2.6, 21, -1.6, 21], KNIT, 30, { sh: "cx", t: -1 });
  // tracolla dello spallaccio: dalla spalla scende in diagonale sul petto
  r.poly(F, [1, 18.4, 3.2, 18, 5.6, 9.6, 5.4, 6.8], BELT, 31, { sh: "cx" });
  r.poly(F, [-5.4, 0.4, 5.3, 0.4, 5.3, 3.2, -5.4, 3.2], BELT, 31, { sh: "cx" });
  const bk = along(along(s.hip, 90 - s.lean, 4.6), 180 - s.lean, 1.8);
  r.limb(bk, along(bk, 90 - s.lean, 0.6), 3.4, 3.4, METAL, 32);
  leg(r, s.leg.f, 40);
  // collo e testa
  r.limb(s.neck, s.head, 3.6, 3.4, SKIN, 50, 0);
  r.grid(p.ex ? HEAD_HURT : HEAD, s.head, 50);
  if (p.ik) arm(r, s.arm.b, 55, 1);
  buster(r, s.grip, s.wa, 60);
  arm(r, s.arm.f, 70);
  // spallaccio a cupola su una piastra più bassa, con due bulloni: segue a metà la rotazione dell'omero
  const A = s.arm.f, pa = (A.a1 - s.lean) * 0.5, PF = frameAt(along(A.s, A.a1, 1.4), pa);
  const at = (X: number, Y: number): V => ({ x: PF.o.x + PF.ax.x * X + PF.ay.x * Y, y: PF.o.y + PF.ax.y * X + PF.ay.y * Y });
  r.limb(along(A.s, A.a1, 4.6), along(A.s, A.a1, 5.8), 5.2, 4.8, BELT, 73, 0, 0);
  r.poly(PF, [1.4, -4, 5.4, -3.4, 5.8, 0, 5.4, 3.4, 1.4, 4], PAUL, 74, { t: -1 });
  r.poly(PF, [-4.2, -1.4, -3.6, -3.6, -1.8, -4.6, 1.4, -4.6, 3.6, -3.2, 4, 0, 3.6, 3.2, 1.4, 4.6, -1.8, 4.4, -3.6, 2.8, -4.2, 0.6], PAUL, 75);
  [-1.6, 2].forEach((Y) => r.limb(at(-3.6, Y), along(at(-3.6, Y), pa + 205 + Y * 4, 2.6), 1.9, 1.2, METAL, 76));
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
