// Cloud Strife — maglione SOLDIER blu notte, spallaccio, cinture incrociate, Buster Sword
import { CharDef, Grid, P0, Raster, Skel, V, hex, rp, torsoFrame, frameAt, along, variant } from "./rig";
import { drawArm, drawBlade, drawLeg } from "./kit";

const HAIR = rp("#7a4c1c", "#bf8a2e", "#e9c35a", "#fff0a6");
const SKIN = rp("#8a4f3e", "#cf8e6e", "#f1c29f", "#ffe2ca");
const KNIT = rp("#121629", "#232b4a", "#36416c", "#525f93");
const PANTS = rp("#0f1322", "#1f2740", "#2f3a5e", "#44527e");
const LEATHER = rp("#28160d", "#53311c", "#80502c", "#ad7442");
const GLOVE = rp("#100e14", "#211e28", "#36323f", "#524d5d");
const METAL = rp("#363c48", "#7a8594", "#b8c3d0", "#f0f6fb");
const PAUL = rp("#272c37", "#555f6f", "#8f9cad", "#cfd9e4");
const STEEL = rp("#2d333e", "#687585", "#a8b4c3", "#e6eef7");
const GRIP = rp("#160f0d", "#2e211b", "#4a372c", "#685040");

const hp: Record<string, number> = {
  a: HAIR[0], b: HAIR[1], c: HAIR[2], d: HAIR[3],
  s: SKIN[0], S: SKIN[1], L: SKIN[2], W: SKIN[3],
  e: hex("#7ff3ff"), k: hex("#2a1a16"), m: hex("#9b5b48"), n: KNIT[1], N: KNIT[2],
};
// testa di profilo verso destra; l'ancora è il punto d'attacco del collo
const HEAD: Grid = {
  ax: 7, ay: 14, pal: hp, rows: [
    "......d........",
    "....c.dc..c....",
    "..cc.cdcc.cc...",
    ".bcccccddccc...",
    "bbbccccdccccc..",
    ".abbccccccccccc",
    "aabbbbccccbccc.",
    ".aabbbbbcbSccb.",
    "..aabbbbbsSLcbc",
    "...abbbbsSkLLb.",
    "....abb.sSeLLL.",
    ".....ab.sSSSLLW",
    "........ssSSmS.",
    ".........ssSS..",
  ],
};
const HEAD_HURT = variant(HEAD, { e: "k" });

const LEG = { th: [6.4, 5.6] as [number, number], sh: [5.6, 5.2] as [number, number], boot: 0.48, bw: [5, 4.4] as [number, number], rT: PANTS, rS: PANTS, rB: LEATHER, cuff: LEATHER,
  foot: [-2, -2.2, 1.4, -2.2, 3.4, 0, 4.8, 1, 5, 2.6, -2, 2.6] };
const ARM = { u: [3.6, 3.2] as [number, number], l: [3.2, 3] as [number, number], rU: SKIN, rL: SKIN, rH: GLOVE, cuff: 0.4, rC: GLOVE, cw: 3.8 };
const BUSTER = {
  pommel: [-7, 2.6, METAL] as [number, number, typeof METAL], grip: [-6.5, 2.5, 2.2, GRIP] as [number, number, number, typeof GRIP],
  guard: [2.5, 4.2, 3.4, METAL] as [number, number, number, typeof METAL],
  blade: [4.2, -3.6, 38, -3.6, 44, 3.6, 4.2, 3.6], rB: STEEL, edge: 2.3, spine: -2.5, holes: [[8, 1.25], [12.5, 1.25]] as [number, number][],
};

const draw = (r: Raster, s: Skel, _c: V[][]) => {
  const F = torsoFrame(s), p = s.p;
  // braccio e gamba lontani: un tono più scuri, per dare profondità
  if (!p.ik) drawArm(r, s.arm.b, ARM, 10, 1);
  drawLeg(r, s.leg.b, LEG, 20, 1);
  // bacino, maglione dolcevita, cinture
  r.poly(F, [-4.2, -3.5, 3.8, -3.5, 4.3, 3, -4.3, 3], PANTS, 30);
  r.poly(F, [-3.6, 2, 3.4, 2, 3.9, 7, 4.7, 12, 4.3, 15.5, 2.6, 18, -1.4, 18.6, -3.9, 16.6, -4.5, 11, -4.1, 6], KNIT, 30);
  r.poly(F, [-1.8, 16.6, 2.3, 16.6, 2.1, 20.6, -1.3, 20.6], KNIT, 30, { t: -1 });
  r.poly(F, [-4.5, 0.6, 4.4, 0.6, 4.4, 2.8, -4.5, 2.8], LEATHER, 31, { sh: "cx" });
  r.poly(F, [-4.5, 3.6, 4.4, 1.4, 4.4, 2.8, -4.5, 5.1], LEATHER, 31, { sh: "cx", t: -1 });
  r.dot(along(along(s.hip, 90 - s.lean, 3.5), 180 - s.lean, 1.7), METAL[3], 31);
  drawLeg(r, s.leg.f, LEG, 40);
  // collo e testa
  r.limb(s.neck, s.head, 3.4, 3.2, SKIN, 50, 0);
  r.grid(p.ex ? HEAD_HURT : HEAD, s.head, 50);
  if (p.ik) drawArm(r, s.arm.b, ARM, 55, 1);
  drawBlade(r, s.grip, s.wa, BUSTER, 60);
  drawArm(r, s.arm.f, ARM, 70);
  // spallaccio: segue a metà la rotazione dell'omero
  const A = s.arm.f;
  r.poly(frameAt(A.s, (A.a1 - s.lean) * 0.5), [-2.2, -2.9, 1.4, -3.7, 4.3, -3.1, 5.3, -0.4, 4.7, 2.7, 1.6, 3.5, -2.2, 2.5], PAUL, 75);
  r.limb(along(A.s, A.a1, 4.2), along(A.s, A.a1, 5.2), 4, 3.8, LEATHER, 74, 0, 0);
};

const B = { ...P0, lean: 8, fu: 22, ff: 32, bu: -8, bf: 26, ft: 22, fs: -26, bt: -18, bs: -8, ba: 4, w: 58 };

export const CLOUD: CharDef = {
  id: "cloud", name: "Cloud Strife",
  body: { thigh: 13, shin: 13, ankle: 2.5, foot: 4.6, heel: 1.6, torso: 18, neck: 2, ua: 10, la: 9, shF: [0.6, 15.6], shB: [-1.6, 15.6], hipF: 1, hipB: -1.5, grip: 3.4 },
  base: B, buf: [200, 140, 100, 104], ink: hex("#0d0b16"),
  weapon: { base: 12, tip: 44 }, smear: [hex("#ffffff", 235), hex("#9fdcff", 200)],
  draw,
  anims: {
    idle: {
      len: 1.3, loop: true, fps: 12, keys: [
        { t: 0, p: {} },
        { t: 0.65, p: { lean: 10, fu: 19, ff: 34, w: 56, fs: -30, bs: -12, hy: 1, bu: -6 } },
      ],
    },
    run: {
      len: 0.6, loop: true, fps: 20, speed: 120, keys: [
        { t: 0, p: { lean: 15, fu: -30, ff: 18, w: -62, ft: 38, fs: -8, fa: -6, bt: -28, bs: -60, ba: 10, bu: 38, bf: 42, y: 0 }, e: "lin" },
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
        { t: 0, p: { lean: 18, ft: 30, fs: -60, bt: -25, bs: -50, fu: -40, ff: 20, w: -70, bu: 40, bf: 40 } },
        { t: 0.12, p: { lean: 4, ft: 55, fs: -75, bt: -8, bs: -38, fu: -20, ff: 40, w: -100, bu: 70, bf: 50 } },
      ],
    },
    fall: {
      len: 0.4, loop: true, fps: 10, ground: false, keys: [
        { t: 0, p: { lean: 2, ft: 24, fs: -30, bt: -14, bs: -28, fu: -10, ff: 40, w: -115, bu: 80, bf: 30, hy: 0 } },
        { t: 0.2, p: { ft: 20, fs: -24, bt: -18, bs: -22, bu: 86, bf: 26, w: -118 } },
      ],
    },
    land: {
      len: 0.22, fps: 15, keys: [
        { t: 0, p: { lean: 22, ft: 42, fs: -86, bt: -32, bs: -74, fu: 0, ff: 30, w: -40, bu: 30, bf: 30 } },
        { t: 0.22, p: {} },
      ],
    },
    atk1: {
      len: 0.42, fps: 20, trail: [0.05, 0.2], cancel: 0.22,
      hit: [{ t0: 0.08, t1: 0.17, box: [6, -52, 48, 0], dmg: 12, kb: 130 }],
      keys: [
        { t: 0, p: { lean: -6, fu: 165, ff: 25, w: 205, bu: -25, bf: 35, ft: 18, fs: -22, bt: -22, bs: -12, ex: 1 }, e: "in" },
        { t: 0.1, p: { lean: 22, fu: 75, ff: 5, w: 75, ft: 36, fs: -30, bt: -28, bs: -10, bu: -40, bf: 20 }, e: "out" },
        { t: 0.17, p: { lean: 27, fu: 42, ff: 2, w: 32, ex: 0 } },
        { t: 0.42, p: {} },
      ],
    },
    atk2: {
      len: 0.42, fps: 20, trail: [0.04, 0.18], cancel: 0.22,
      hit: [{ t0: 0.07, t1: 0.16, box: [4, -64, 44, 0], dmg: 12, kb: 90, ky: -160 }],
      keys: [
        { t: 0, p: { lean: 16, fu: -42, ff: 12, w: -28, ft: 30, fs: -52, bt: -22, bs: -40, bu: 30, bf: 30, ex: 1 }, e: "in" },
        { t: 0.09, p: { lean: -6, fu: 125, ff: -12, w: 150, ft: 12, fs: -8, bt: -14, bs: -6, bu: -20, bf: 40 }, e: "out" },
        { t: 0.16, p: { lean: -10, fu: 160, ff: -8, w: 178, ex: 0 } },
        { t: 0.42, p: {} },
      ],
    },
    atk3: {
      len: 0.66, fps: 20, trail: [0.13, 0.28], cancel: 0.5,
      hit: [{ t0: 0.2, t1: 0.32, box: [8, -44, 56, 2], dmg: 24, kb: 240, ky: -120 }],
      keys: [
        { t: 0, p: { lean: -12, fu: 172, ff: 30, w: 218, ik: 1, ft: 26, fs: -48, bt: -26, bs: -42, ex: 1 }, e: "out" },
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
        { t: 0, p: { rot: 0, lean: 10, fu: 100, ff: 0, w: 100, ft: 60, fs: -110, bt: 40, bs: -110, bu: 40, bf: 60 }, e: "lin" },
        { t: 0.3, p: { rot: 360 }, e: "out" },
        { t: 0.36, p: {} },
      ],
    },
    roll: {
      len: 0.4, fps: 20, keys: [
        { t: 0, p: { lean: 30, ft: 50, fs: -90, bt: -20, bs: -80, fu: -20, ff: 60, w: -40, bu: 40, bf: 80, rot: 0 }, e: "lin" },
        { t: 0.06, p: { lean: 45, ft: 85, fs: -140, bt: 70, bs: -140, rot: 30 }, e: "lin" },
        { t: 0.3, p: { rot: 360 }, e: "out" },
        { t: 0.4, p: { lean: 20, ft: 40, fs: -70, bt: -30, bs: -60, rot: 360 } },
      ],
    },
    hurt: {
      len: 0.32, fps: 15, keys: [
        { t: 0, p: { lean: -20, hx: -1, fu: -40, ff: 60, w: -50, bu: 50, bf: 50, ft: 24, fs: -24, bt: -26, bs: -14, ex: 1 }, e: "out" },
        { t: 0.32, r: true },
      ],
    },
    death: {
      len: 1.4, fps: 12, keys: [
        { t: 0, p: { lean: -20, fu: -40, ff: 60, w: -50, bu: 50, bf: 50, ex: 1 }, e: "in" },
        { t: 0.35, p: { lean: 30, ft: 82, fs: -100, bt: -5, bs: -92, ba: 10, fu: 40, ff: 20, w: 15, bu: 10, bf: 10, hy: 1 }, e: "out" },
        { t: 0.9, p: { lean: 38 } , e: "in" },
        { t: 1.2, p: { rot: 82, lean: 0, ft: 0, fs: 0, bt: -6, bs: -4, fu: 160, ff: 10, w: 160, bu: 150, bf: 20 } },
      ],
    },
    win: {
      len: 1.2, fps: 15, trail: [0.05, 0.45], keys: [
        { t: 0, p: { lean: 0, fu: 60, ff: 10, w: 90 }, e: "lin" },
        { t: 0.45, p: { w: 90 + 720, fu: 70 }, e: "out" },
        { t: 0.7, p: { lean: -4, fu: 150, ff: 110, w: 250 + 720, bu: 10, bf: 20, ft: 8, fs: -4, bt: -10, bs: -4 } },
        { t: 1.2, p: { hy: 0 } },
      ],
    },
  },
};
