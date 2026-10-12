// Sephiroth — lunghi capelli d'argento, cappotto nero fino alle caviglie, spallacci, petto scoperto, Masamune
import { CharDef, Grid, P0, Raster, Skel, V, hex, rp, torsoFrame, frameAt, along, variant } from "./rig";
import { drawArm, drawBlade, drawLeg, drawStrip } from "./kit";

const HAIR = rp("#545b70", "#8e97ac", "#c8cedb", "#f3f5fa");
const SKIN = rp("#84666a", "#cdaba4", "#edd6cd", "#fff2ec");
const COAT = rp("#07070b", "#13131b", "#22222f", "#37374d");
const SILVER = rp("#2a2e39", "#5a6272", "#9199ab", "#dfe5ee");
const LEGS = rp("#0b0b12", "#191a26", "#2a2b3d", "#3f405a");
const STRAP = rp("#0b0b10", "#1b1b25", "#2c2c3b", "#454559");
const STEEL = rp("#39404f", "#8893a6", "#c8d1df", "#ffffff");

const hp: Record<string, number> = {
  a: HAIR[0], b: HAIR[1], c: HAIR[2], d: HAIR[3],
  s: SKIN[0], S: SKIN[1], L: SKIN[2], W: SKIN[3],
  g: hex("#86ff9c"), k: hex("#2a2430"), m: hex("#9c7b78"), x: COAT[2],
};
const HEAD: Grid = {
  ax: 7, ay: 14, pal: hp, rows: [
    "....abccc.......",
    "...abccddcc.....",
    "..abccddddcc....",
    ".abcccddddccc...",
    ".abccccccccdc...",
    "abbcccccsScdc...",
    "abbccccsSSLcdc..",
    "abbcc.sSkLLLcd..",
    "abbc..sSgLLLWcd.",
    "abbc..ssSSLLLcd.",
    "abc....sSmSLccd.",
    "ab......sSSScdc.",
    "a........sSbcd..",
    ".........xbcd...",
    "..........cd....",
  ],
};
const HEAD_HURT = variant(HEAD, { g: "k" });

const LEG = { th: [6.4, 5.6] as [number, number], sh: [5.2, 4.8] as [number, number], boot: 0.3, bw: [5, 4.4] as [number, number], rT: LEGS, rS: LEGS, rB: COAT, cuff: STRAP,
  foot: [-2, -2.2, 1.6, -2.2, 3.8, 0, 5.2, 1, 5.4, 2.6, -2.2, 2.6] };
const ARM = { u: [4.2, 3.8] as [number, number], l: [3.8, 3.4] as [number, number], rU: COAT, rL: COAT, rH: COAT, cuff: 0.7, rC: STRAP, cw: 4.4 };
const MASAMUNE = {
  pommel: [-10, 2.2, SILVER] as [number, number, typeof SILVER], grip: [-9.6, 2.2, 1.9, STRAP] as [number, number, number, typeof STRAP],
  guard: [2.2, 3.4, 2.6, SILVER] as [number, number, number, typeof SILVER],
  blade: [3.4, -1.1, 86, -0.9, 93, 0.5, 86, 1.1, 3.4, 1.2], rB: STEEL, edge: 0.35, spine: -0.6,
};

const strand = (r: Raster, pts: V[], w0: number, w1: number, g: number, t: number) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const k0 = i / (pts.length - 1), k1 = (i + 1) / (pts.length - 1);
    r.limb(pts[i], pts[i + 1], w0 + (w1 - w0) * k0, w0 + (w1 - w0) * k1, HAIR, g, t);
  }
};
const coat = (r: Raster, pts: V[], w0: number, w1: number, g: number) => drawStrip(r, pts, w0, w1, COAT, g);

const draw = (r: Raster, s: Skel, c: V[][]) => {
  const F = torsoFrame(s), p = s.p;
  // massa di capelli dietro la schiena: due ciocche per dare volume
  if (c[0] && c[0].length) strand(r, c[0], 11, 3, 5, 1);
  if (c[1] && c[1].length) strand(r, c[1], 6, 2, 6, 0);
  if (!p.ik) drawArm(r, s.arm.b, ARM, 10, 1);
  r.poly(frameAt(s.arm.b.s, (s.arm.b.a1 - s.lean) * 0.5), [-2.4, -3.2, 1.2, -3.8, 4.2, -3.2, 5, -0.4, 4.4, 3, 1.2, 3.6, -2.4, 2.8], SILVER, 11, { dim: 1, t: -1 });
  drawLeg(r, s.leg.b, LEG, 20, 1);
  if (c[2] && c[2].length) coat(r, c[2], 7, 13, 25);
  r.poly(F, [-4, -3, 3.6, -3, 4, 1, -4, 1], COAT, 30);
  r.poly(F, [-4, -2.4, 3.6, -2.4, 4.2, 6, 5, 12, 4.8, 16.5, 3, 19.6, -1.6, 20.2, -4.4, 18, -4.9, 11, -4.6, 4], COAT, 30);
  // petto scoperto e cinghie incrociate
  r.poly(F, [1.8, 9.5, 4.3, 10.5, 4.8, 15, 3.4, 18.4, 2, 16.6], SKIN, 31);
  r.poly(F, [-4.8, 5.6, 4.9, 12.4, 4.9, 13.8, -4.8, 7], STRAP, 32, { sh: "cx", t: 1 });
  r.poly(F, [-4.8, 12.6, 4.6, 5.8, 4.6, 7.2, -4.8, 14], STRAP, 32, { sh: "cx", t: 1 });
  r.poly(F, [-4.6, -0.2, 4.4, -0.2, 4.4, 1.8, -4.6, 1.8], STRAP, 33, { sh: "cx", t: 1 });
  r.dot(along(along(s.hip, 90 - s.lean, 3.4), 180 - s.lean, 0.8), SILVER[3], 33);
  r.dot(along(along(s.hip, 90 - s.lean, 1.2), 180 - s.lean, 9.5), SILVER[2], 33);
  r.poly(F, [-2.8, 17.6, 2.4, 17.6, 3, 22, -2.6, 22.4], COAT, 34, { t: 1 });
  drawLeg(r, s.leg.f, LEG, 40);
  if (c[3] && c[3].length) coat(r, c[3], 4.5, 8, 45);
  r.limb(s.neck, s.head, 3.4, 3.2, SKIN, 50, 0);
  r.grid(p.ex ? HEAD_HURT : HEAD, s.head, 50);
  if (p.ik) drawArm(r, s.arm.b, ARM, 55, 1);
  drawBlade(r, s.grip, s.wa, MASAMUNE, 60);
  drawArm(r, s.arm.f, ARM, 70);
  const A = s.arm.f;
  r.poly(frameAt(A.s, (A.a1 - s.lean) * 0.5), [-2.4, -3.2, 1.2, -3.8, 4.2, -3.2, 5, -0.4, 4.4, 3, 1.2, 3.6, -2.4, 2.8], SILVER, 75, { t: -1 });
};

const B = { ...P0, lean: -2, fu: -6, ff: 22, bu: 6, bf: 18, ft: 10, fs: -10, bt: -10, bs: -4, w: -78 };

export const SEPH: CharDef = {
  id: "seph", name: "Sephiroth",
  body: { thigh: 15, shin: 15, ankle: 2.5, foot: 5.4, heel: 1.8, torso: 20, neck: 2.4, ua: 11, la: 10, shF: [0.4, 17.6], shB: [-1.8, 17.6], hipF: 1, hipB: -1.6, grip: 3.6 },
  base: B, buf: [300, 220, 150, 150], ink: hex("#060509"),
  weapon: { base: 30, tip: 93 }, smear: [hex("#ffffff", 240), hex("#b9a7ff", 200)],
  chains: [
    { n: 8, seg: 4.6, at: (s) => along(along(s.head, 90 - s.lean, -4.5), 180 - s.lean, 8), rest: -16, stiff: 0.16, grav: 300, drag: 0.08, push: 40, flow: 0.9 },
    { n: 7, seg: 4.3, at: (s) => along(along(s.head, 90 - s.lean, -1.5), 180 - s.lean, 9), rest: -9, stiff: 0.2, grav: 300, drag: 0.08, push: 30, flow: 0.85 },
    { n: 7, seg: 4.6, at: (s) => along(along(s.hip, 90 - s.lean, -3.4), 180 - s.lean, 0.5), rest: -14, stiff: 0.2, grav: 420, drag: 0.08, push: 30, flow: 0.7 },
    { n: 6, seg: 4.6, at: (s) => along(along(s.hip, 90 - s.lean, 3), 180 - s.lean, 0), rest: 14, stiff: 0.26, grav: 420, drag: 0.1, flow: 0.5 },
  ],
  draw,
  anims: {
    idle: {
      len: 1.8, loop: true, fps: 10, keys: [
        { t: 0, p: {} },
        { t: 0.9, p: { lean: -1, hy: 1, fu: -8, w: -80, fs: -12 } },
      ],
    },
    walk: {
      len: 1, loop: true, fps: 14, speed: 40, keys: [
        { t: 0, p: { ft: 22, fs: -6, bt: -16, bs: -14, bu: 14, y: 0 }, e: "lin" },
        { t: 0.25, p: { ft: 4, fs: -10, bt: 6, bs: -40, bu: 4, y: -1 }, e: "lin" },
        { t: 0.5, p: { ft: -16, fs: -14, bt: 22, bs: -6, bu: -6, y: 0 }, e: "lin" },
        { t: 0.75, p: { ft: 6, fs: -40, bt: 4, bs: -10, bu: 4, y: -1 }, e: "lin" },
      ],
    },
    dash: {
      len: 0.4, loop: true, fps: 16, speed: 260, keys: [
        { t: 0, p: { lean: 24, ft: 36, fs: -50, bt: -40, bs: -30, fu: -40, ff: 10, w: -95, bu: -30, bf: 20, y: 0 } },
        { t: 0.2, p: { lean: 26, ft: 38, fs: -54, bt: -42, bs: -26, y: 0 } },
      ],
    },
    slash: {
      len: 0.95, fps: 20, trail: [0.4, 0.6], cancel: 0.85,
      hit: [{ t0: 0.42, t1: 0.58, box: [-10, -90, 100, 0], dmg: 18, kb: 220, ky: -100 }],
      keys: [
        { t: 0, p: {} , e: "out" },
        { t: 0.38, p: { lean: -10, fu: -70, ff: 30, w: -118, ft: 30, fs: -40, bt: -26, bs: -20, ex: 1 }, e: "in" },
        { t: 0.5, p: { lean: 22, fu: 92, ff: 4, w: -268, ft: 42, fs: -36, bt: -36, bs: -10, bu: -30, bf: 40 }, e: "out" },
        { t: 0.6, p: { lean: 26, fu: 70, ff: 0, w: -330 }, e: "io" },
        { t: 0.95, p: { lean: -2, fu: -6, ff: 22, w: -438, ft: 10, fs: -10, bt: -10, bs: -4, bu: 6, bf: 18, ex: 0 } },
      ],
    },
    thrust: {
      len: 0.8, fps: 20, trail: [0.32, 0.46], cancel: 0.7,
      hit: [{ t0: 0.34, t1: 0.5, box: [10, -46, 110, -26], dmg: 16, kb: 260 }],
      keys: [
        { t: 0, p: {} },
        { t: 0.3, p: { lean: -8, fu: -50, ff: 100, w: 92, bu: 60, bf: 40, ft: 14, fs: -30, bt: -30, bs: -30, ex: 1 }, e: "in" },
        { t: 0.4, p: { lean: 22, fu: 86, ff: 2, w: 90, bu: -50, bf: 20, ft: 60, fs: -64, bt: -52, bs: -4 }, e: "out" },
        { t: 0.55, p: { lean: 24, fu: 88, w: 90 } },
        { t: 0.8, p: { lean: -2, fu: -6, ff: 22, w: -78, ft: 10, fs: -10, bt: -10, bs: -4, bu: 6, bf: 18, ex: 0 } },
      ],
    },
    cast: {
      len: 0.9, fps: 16, cancel: 0.8, keys: [
        { t: 0, p: {} },
        { t: 0.3, p: { lean: -6, bu: 170, bf: 10, hy: -1 }, e: "out" },
        { t: 0.7, p: { lean: -8, bu: 175, bf: 6 } },
        { t: 0.9, p: { bu: 6, bf: 18, hy: 0 } },
      ],
    },
    tele: {
      len: 0.5, fps: 16, keys: [
        { t: 0, p: {} },
        { t: 0.25, p: { lean: 10, ft: 30, fs: -60, bt: -20, bs: -50, fu: -30, w: -100 }, e: "out" },
        { t: 0.5, p: { lean: 6, ft: 20, fs: -40, bt: -16, bs: -30 } },
      ],
    },
    hurt: {
      len: 0.4, fps: 15, keys: [
        { t: 0, p: { lean: -14, hx: -1, fu: -30, ff: 40, w: -60, bu: 30, bf: 40, ft: 16, fs: -18, bt: -20, bs: -10, ex: 1 }, e: "out" },
        { t: 0.4, r: true },
      ],
    },
    death: {
      len: 2, fps: 10, keys: [
        { t: 0, p: { lean: -14, fu: -30, ff: 40, w: -60, bu: 30, bf: 40, ex: 1 }, e: "in" },
        { t: 0.6, p: { lean: 22, ft: 84, fs: -100, bt: -4, bs: -92, ba: 10, fu: 30, ff: 10, w: 20, bu: 4, bf: 10, hy: 1 }, e: "out" },
        { t: 2, p: { lean: 26 } },
      ],
    },
    intro: {
      len: 1.2, fps: 12, ground: false, keys: [
        { t: 0, p: { lean: 0, ft: 4, fs: -4, bt: -6, bs: -2, fu: -4, ff: 10, w: -60, bu: 10, bf: 10, fa: 30, ba: 30 } },
        { t: 1.2, p: { ft: 8, fs: -8, bt: -8, bs: -6, fa: 20, ba: 20 } },
      ],
    },
    win: {
      len: 1.6, fps: 12, keys: [
        { t: 0, p: {} },
        { t: 0.5, p: { lean: -6, bu: 120, bf: 100, hy: -1 } },
        { t: 1.6, p: { lean: -6, bu: 122, bf: 104 } },
      ],
    },
  },
};
