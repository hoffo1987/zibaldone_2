// Clive Rosfield — giaccone scuro dal colletto alto, cinghie di cuoio, barba corta, spada lunga e il fuoco di Ifrit
import { CharDef, Grid, P0, Raster, Skel, V, hex, rp, torsoFrame, frameAt, along, variant } from "./rig";
import { drawArm, drawBlade, drawLeg, drawStrip } from "./kit";

const HAIR = rp("#100b0b", "#241a17", "#3b2b25", "#5a4237");
const SKIN = rp("#7b4736", "#c08367", "#e6b391", "#f8d4b8");
const COAT = rp("#0b0c13", "#171a27", "#262b3d", "#3c4359");
const LEATHER = rp("#25160e", "#4a2c1a", "#744628", "#a0663a");
const PANTS = rp("#15110f", "#2a221e", "#3f342d", "#584a41");
const DARK = rp("#1a1b20", "#363943", "#5a5f6b", "#8d94a3");
const IRON = rp("#24262d", "#4f5460", "#858d9b", "#c2cad7");
const STEEL = rp("#2a303b", "#657183", "#a4b0c1", "#e8f0f9");

const hp: Record<string, number> = {
  a: HAIR[0], b: HAIR[1], c: HAIR[2], d: HAIR[3],
  s: SKIN[0], S: SKIN[1], L: SKIN[2], W: SKIN[3],
  e: hex("#40627e"), k: hex("#1a1110"), m: hex("#8a4c3c"), n: hex("#3a2a24"), t: hex("#2f2238"),
};
const HEAD: Grid = {
  ax: 6, ay: 13, pal: hp, rows: [
    "...aabbbb...",
    ".aabbbccbbc.",
    "aabbbbbccdcb",
    "abbbbbbbbcbc",
    ".abbbbbbsbcb",
    ".aabbbbsSSLc",
    "..abbssSkLL.",
    "..aabSsSeLLW",
    "...absssSLLL",
    "....aansSLS.",
    "......nnSmS.",
    ".......nnnn.",
    "........nn..",
  ],
};
const HEAD_HURT = variant(HEAD, { e: "k" });

const LEG = { th: [6.6, 5.8] as [number, number], sh: [5.4, 5] as [number, number], boot: 0.38, bw: [5.2, 4.4] as [number, number], rT: PANTS, rS: PANTS, rB: LEATHER, cuff: LEATHER,
  foot: [-2, -2.2, 1.6, -2.2, 3.6, 0, 5, 1, 5.2, 2.6, -2, 2.6] };
const ARM = { u: [4.2, 3.8] as [number, number], l: [3.8, 3.4] as [number, number], rU: COAT, rL: COAT, rH: LEATHER, cuff: 0.62, rC: LEATHER, cw: 4.2 };
const SWORD = {
  pommel: [-5, 2.8, IRON] as [number, number, typeof IRON], grip: [-4.6, 2.4, 2, LEATHER] as [number, number, number, typeof LEATHER],
  guard: [2.4, 3.8, 4.6, IRON] as [number, number, number, typeof IRON],
  blade: [3.8, -2, 32, -1.9, 36, 0, 32, 2, 3.8, 2.1], rB: STEEL, edge: 1.1, spine: -1.2, fuller: [6, 27] as [number, number],
};

const tail = (r: Raster, pts: V[], w0: number, w1: number, g: number, dim: number) => drawStrip(r, pts, w0, w1, COAT, g, dim);

const draw = (r: Raster, s: Skel, c: V[][]) => {
  const F = torsoFrame(s), p = s.p;
  if (!p.ik) drawArm(r, s.arm.b, ARM, 10, 1);
  drawLeg(r, s.leg.b, LEG, 20, 1);
  if (c[0] && c[0].length) tail(r, c[0], 6.5, 9.5, 25, 0);
  r.poly(F, [-4.2, -3, 3.8, -3, 4.2, 1, -4.2, 1], PANTS, 30);
  r.poly(F, [-4.2, -2.4, 3.8, -2.4, 4.3, 6, 5.1, 12, 4.7, 16.5, 2.9, 19.4, -1.8, 20, -4.5, 17.6, -5, 11, -4.8, 4], COAT, 30);
  // colletto alto e cinghia di cuoio sul petto
  r.poly(F, [-2.6, 17.4, 2.7, 17.4, 3.4, 21.6, -2.4, 21.9], COAT, 31, { t: 1 });
  r.poly(F, [-4.6, 6.4, 4.8, 14.4, 4.8, 16.4, -4.8, 8.4], LEATHER, 31, { sh: "cx" });
  r.poly(F, [-5, 0, 4.7, 0, 4.7, 2.4, -5, 2.4], LEATHER, 32, { sh: "cx" });
  r.dot(along(along(s.hip, 90 - s.lean, 3.8), 180 - s.lean, 1.4), IRON[3], 32);
  r.dot(along(along(s.hip, 90 - s.lean, 3.2), 180 - s.lean, 11.8), IRON[2], 32);
  drawLeg(r, s.leg.f, LEG, 40);
  if (c[1] && c[1].length) tail(r, c[1], 4.5, 6.5, 45, 0);
  r.limb(s.neck, s.head, 3.6, 3.4, SKIN, 50, 0);
  r.grid(p.ex ? HEAD_HURT : HEAD, s.head, 50);
  if (p.ik) drawArm(r, s.arm.b, ARM, 55, 1);
  drawBlade(r, s.grip, s.wa, SWORD, 60);
  drawArm(r, s.arm.f, ARM, 70);
  const A = s.arm.f;
  r.poly(frameAt(A.s, (A.a1 - s.lean) * 0.5), [-2.4, -3.2, 1.2, -3.8, 3.8, -3.2, 4.6, -0.2, 4, 3, 1.2, 3.6, -2.4, 2.8], DARK, 75, { t: -1 });
  r.limb(along(A.s, A.a1, 3.4), along(A.s, A.a1, 4.2), 4.6, 4.4, LEATHER, 76, 0, 0);
};

const B = { ...P0, lean: 5, fu: 26, ff: 40, bu: 12, bf: 38, ft: 20, fs: -24, bt: -16, bs: -10, ba: 4, w: 72 };

export const CLIVE: CharDef = {
  id: "clive", name: "Clive Rosfield",
  body: { thigh: 14, shin: 14, ankle: 2.5, foot: 5, heel: 1.6, torso: 19.5, neck: 2, ua: 10.5, la: 9.5, shF: [0.6, 17], shB: [-1.8, 17], hipF: 1, hipB: -1.6, grip: 3 },
  base: B, buf: [200, 140, 100, 104], ink: hex("#0c0a10"),
  weapon: { base: 10, tip: 36 }, smear: [hex("#fff3b0", 240), hex("#ff8a2a", 210)],
  chains: [
    { n: 5, seg: 4.4, at: (s) => along(along(s.hip, 90 - s.lean, -3.6), 180 - s.lean, 0.5), rest: -16, stiff: 0.22, grav: 420, drag: 0.1, push: 30, flow: 0.7 },
    { n: 4, seg: 4.2, at: (s) => along(along(s.hip, 90 - s.lean, 3), 180 - s.lean, 0), rest: 12, stiff: 0.3, grav: 420, drag: 0.12, flow: 0.45 },
  ],
  draw,
  anims: {
    idle: {
      len: 1.4, loop: true, fps: 12, keys: [
        { t: 0, p: {} },
        { t: 0.7, p: { lean: 7, fu: 23, ff: 42, w: 70, fs: -28, bs: -13, hy: 1, bu: 14, bf: 42 } },
      ],
    },
    run: {
      len: 0.56, loop: true, fps: 20, speed: 130, keys: [
        { t: 0, p: { lean: 16, fu: -36, ff: 22, w: -74, ft: 40, fs: -8, fa: -6, bt: -30, bs: -62, ba: 10, bu: 42, bf: 50, y: 0 }, e: "lin" },
        { t: 0.07, p: { ft: 22, fs: -30, fa: 0, bt: -10, bs: -90, ba: 0, y: 1, bu: 22, bf: 54, fu: -33 }, e: "lin" },
        { t: 0.14, p: { ft: -2, fs: -18, bt: 28, bs: -104, y: 0, bu: -6, bf: 48, w: -76 }, e: "lin" },
        { t: 0.21, p: { ft: -34, fs: -12, fa: 12, bt: 52, bs: -58, y: -2, bu: -36, bf: 36, fu: -38 }, e: "lin" },
        { t: 0.28, p: { ft: -30, fs: -62, fa: 10, bt: 40, bs: -8, ba: -6, y: 0, bu: -44, bf: 30, w: -74 }, e: "lin" },
        { t: 0.35, p: { ft: -10, fs: -90, fa: 0, bt: 22, bs: -30, ba: 0, y: 1, bu: -24, bf: 40, fu: -33 }, e: "lin" },
        { t: 0.42, p: { ft: 28, fs: -104, bt: -2, bs: -18, y: 0, bu: 8, bf: 48, w: -76 }, e: "lin" },
        { t: 0.49, p: { ft: 52, fs: -58, bt: -34, bs: -12, ba: 12, y: -2, bu: 34, bf: 50, fu: -38 }, e: "lin" },
      ],
    },
    jump: {
      len: 0.3, fps: 15, ground: false, keys: [
        { t: 0, p: { lean: 16, ft: 30, fs: -60, bt: -25, bs: -50, fu: -40, ff: 30, w: -80, bu: 40, bf: 40 } },
        { t: 0.12, p: { lean: 2, ft: 58, fs: -80, bt: -6, bs: -40, fu: -24, ff: 50, w: -110, bu: 76, bf: 50 } },
      ],
    },
    fall: {
      len: 0.4, loop: true, fps: 10, ground: false, keys: [
        { t: 0, p: { lean: 0, ft: 26, fs: -34, bt: -14, bs: -26, fu: -14, ff: 46, w: -120, bu: 84, bf: 30 } },
        { t: 0.2, p: { ft: 22, fs: -26, bt: -18, bs: -22, bu: 90, bf: 26, w: -124 } },
      ],
    },
    land: {
      len: 0.22, fps: 15, keys: [
        { t: 0, p: { lean: 20, ft: 44, fs: -88, bt: -34, bs: -76, fu: 0, ff: 40, w: -40, bu: 40, bf: 30 } },
        { t: 0.22, p: {} },
      ],
    },
    atk1: {
      len: 0.34, fps: 24, trail: [0.04, 0.15], cancel: 0.16,
      hit: [{ t0: 0.06, t1: 0.13, box: [6, -54, 42, 0], dmg: 8, kb: 90 }],
      keys: [
        { t: 0, p: { lean: -4, fu: 160, ff: 30, w: 200, bu: 30, bf: 60, ft: 22, fs: -26, bt: -22, bs: -12, ex: 1 }, e: "in" },
        { t: 0.08, p: { lean: 20, fu: 80, ff: 4, w: 82, ft: 38, fs: -32, bt: -28, bs: -10, bu: -30, bf: 30 }, e: "out" },
        { t: 0.14, p: { lean: 24, fu: 48, ff: 0, w: 36, ex: 0 } },
        { t: 0.34, p: {} },
      ],
    },
    atk2: {
      len: 0.34, fps: 24, trail: [0.03, 0.14], cancel: 0.16,
      hit: [{ t0: 0.05, t1: 0.12, box: [4, -62, 40, 0], dmg: 8, kb: 70, ky: -120 }],
      keys: [
        { t: 0, p: { lean: 14, fu: -40, ff: 20, w: -40, ft: 32, fs: -52, bt: -22, bs: -40, bu: 40, bf: 40, ex: 1 }, e: "in" },
        { t: 0.07, p: { lean: -6, fu: 120, ff: -10, w: 145, ft: 14, fs: -8, bt: -14, bs: -6, bu: -20, bf: 40 }, e: "out" },
        { t: 0.13, p: { lean: -10, fu: 150, ff: -6, w: 172, ex: 0 } },
        { t: 0.34, p: {} },
      ],
    },
    atk3: {
      len: 0.5, fps: 24, trail: [0.12, 0.24], cancel: 0.36,
      hit: [{ t0: 0.14, t1: 0.26, box: [10, -46, 62, -14], dmg: 16, kb: 200 }],
      keys: [
        { t: 0, p: { lean: -8, fu: -60, ff: 120, w: 95, bu: 70, bf: 50, ft: 10, fs: -20, bt: -30, bs: -30, ex: 1 }, e: "in" },
        { t: 0.12, p: { lean: 26, fu: 82, ff: 6, w: 92, bu: -50, bf: 30, ft: 60, fs: -60, bt: -48, bs: -6 }, e: "out" },
        { t: 0.26, p: { lean: 28, fu: 86, w: 91, ex: 0 } },
        { t: 0.5, p: {} },
      ],
    },
    cast: {
      len: 0.5, fps: 20, cancel: 0.36, keys: [
        { t: 0, p: { lean: -6, bu: -60, bf: 120, fu: 10, ff: 40, w: -40, ft: 18, fs: -20, bt: -26, bs: -14, ex: 1 }, e: "in" },
        { t: 0.14, p: { lean: 18, bu: 96, bf: 2, fu: -30, ff: 30, w: -70, ft: 40, fs: -40, bt: -34, bs: -8 }, e: "out" },
        { t: 0.3, p: { lean: 16, bu: 92, ex: 0 } },
        { t: 0.5, p: {} },
      ],
    },
    air: {
      len: 0.32, fps: 24, ground: false, trail: [0.04, 0.16],
      hit: [{ t0: 0.06, t1: 0.18, box: [0, -50, 44, 20], dmg: 9, kb: 80, ky: 120 }],
      keys: [
        { t: 0, p: { lean: -10, fu: 170, ff: 30, w: 210, ft: 50, fs: -90, bt: 10, bs: -80, bu: 40, bf: 60 }, e: "in" },
        { t: 0.1, p: { lean: 26, fu: 60, ff: 0, w: 30 }, e: "out" },
        { t: 0.32, p: { lean: 20, fu: 40, w: 10 } },
      ],
    },
    roll: {
      len: 0.32, fps: 20, keys: [
        { t: 0, p: { lean: 34, ft: 70, fs: -100, bt: -50, bs: -40, fu: -50, ff: 40, w: -80, bu: -60, bf: 40, y: 0 }, e: "out" },
        { t: 0.18, p: { lean: 30, ft: 60, fs: -90, bt: -60, bs: -30 } },
        { t: 0.32, p: { lean: 18, ft: 40, fs: -60, bt: -30, bs: -40 } },
      ],
    },
    hurt: {
      len: 0.32, fps: 15, keys: [
        { t: 0, p: { lean: -18, hx: -1, fu: -40, ff: 60, w: -60, bu: 50, bf: 60, ft: 24, fs: -24, bt: -26, bs: -14, ex: 1 }, e: "out" },
        { t: 0.32, r: true },
      ],
    },
    death: {
      len: 1.4, fps: 12, keys: [
        { t: 0, p: { lean: -18, fu: -40, ff: 60, w: -60, bu: 50, bf: 60, ex: 1 }, e: "in" },
        { t: 0.35, p: { lean: 28, ft: 82, fs: -100, bt: -5, bs: -92, ba: 10, fu: 40, ff: 20, w: 12, bu: 10, bf: 10, hy: 1 }, e: "out" },
        { t: 0.9, p: { lean: 36 }, e: "in" },
        { t: 1.2, p: { rot: 82, lean: 0, ft: 0, fs: 0, bt: -6, bs: -4, fu: 160, ff: 10, w: 160, bu: 150, bf: 20 } },
      ],
    },
    win: {
      len: 1.1, fps: 15, trail: [0.05, 0.3], keys: [
        { t: 0, p: { lean: 4, fu: 60, ff: 10, w: 90 }, e: "out" },
        { t: 0.3, p: { lean: -6, fu: 170, ff: 10, w: 200, bu: 20, bf: 30 } },
        { t: 0.6, p: { lean: 0, fu: -10, ff: 20, w: -20, ft: 8, fs: -4, bt: -10, bs: -4, bu: 6, bf: 10 } },
        { t: 1.1, p: { hy: 0 } },
      ],
    },
  },
};
