// Cloud: lo scheletro guida il gameplay; il disegno viene dall'atlante bitmap in src/egg/assets
// (cloud.png + cloud-frames.ts, generati da scripts/build-cloud-atlas.cjs). Se l'atlante non c'è,
// Cloud resta giocabile con il modello pixel art disegnato dal rig qui sotto.
import { CharDef, Grid, P0, Raster, Skel, V, Arm, Leg, hex, rp, torsoFrame, frameAt, along, lerpV, variant } from "./rig";
import type { SpriteSheet } from "./sprite-sheet";

// L'atlante è facoltativo: require.context non fallisce se i file mancano (un import diretto romperebbe la build)
const loadSheet = (): SpriteSheet | undefined => {
  try {
    if (process.env.NODE_ENV === "test") {
      return { src: require("./assets/cloud.png"), frames: require("./assets/cloud-frames").CLOUD_FRAMES };
    }
    const ctx = require.context("./", true, /^\.\/assets\/cloud(\.png|-frames\.ts)$/);
    const keys = ctx.keys(), png = keys.find((k) => k.endsWith(".png")), fr = keys.find((k) => k.endsWith(".ts"));
    if (!png || !fr) return undefined;
    const url = ctx(png);
    return { src: typeof url === "string" ? url : url.default, frames: ctx(fr).CLOUD_FRAMES };
  } catch {
    return undefined;
  }
};
const SHEET = loadSheet();

const HAIR = rp("#7a4614", "#c47e28", "#eab04a", "#fde3a0");
const SKIN = rp("#9a5a40", "#d99572", "#f4c39c", "#ffe2c6");
const KNIT = rp("#0f1220", "#1c2236", "#2a3250", "#414c70");
const PANTS = rp("#0e1120", "#1a2036", "#283150", "#3e4a72");
const BOOT = rp("#24130a", "#45261a", "#6a3d24", "#925a36");
const GLOVE = rp("#2e170c", "#57301a", "#7f4a28", "#a86a3c");
const BELT = rp("#2a170c", "#57331b", "#82512c", "#ab7240");
const METAL = rp("#30353f", "#5f6774", "#9aa3b0", "#d8dee6");
const STEEL = rp("#26292f", "#4c515a", "#7b818b", "#c3c8cf");
const GRIP = rp("#3e0a0e", "#7a1820", "#b02a33", "#dc4f55");
const GOLD = hex("#d8b060");

// testa di profilo verso destra, pixel per pixel: punte all'indietro e verso l'alto, frangia davanti al viso,
// ciocca davanti all'orecchio. L'ancora è l'attacco del collo, sotto la mascella.
const hp: Record<string, number> = {
  a: HAIR[0], b: HAIR[1], c: HAIR[2], d: HAIR[3],
  s: SKIN[0], S: SKIN[1], L: SKIN[2], W: SKIN[3],
  e: hex("#3a8cff"), k: hex("#3a2418"), m: hex("#b86a58"),
};
const HEAD: Grid = {
  ax: 15, ay: 20, pal: hp, rows: [
    "............d..........",
    "...........ad....d.....",
    "...........bdd..ad.....",
    "....dd.....bcd..bcd....",
    ".....ddc..acccaabcd...d",
    "......addcbcccdabccd.dd",
    "....dd.abccccccabccddcb",
    ".....ddcbaacccdaacccca.",
    "...dddccccbaccddbccdcda",
    ".ddccccccbbaacccddcccda",
    "...aabbbbcccaacdddcbdba",
    ".....aabbccbbaaSSdaada.",
    "....ddccbbbLscSSkkLLda.",
    "...bbbbccbaLscSSkeLLWa.",
    "......aabcasLdSSSSLLLW.",
    "........bca.sdSSSSSLs..",
    ".......bca..saSSSSSL...",
    "......aa.....sSSSSmL...",
    "..............ssSSL....",
    "...............sss.....",
  ],
};
const HEAD_HURT = variant(HEAD, { e: "k" });

// pantaloni larghi con pieghe, raccolti negli stivali di cuoio allacciati
const leg = (r: Raster, L: Leg, g: number, dim = 0) => {
  const bt = lerpV(L.k, L.a, 0.56);
  r.limb(L.h, L.k, 7.8, 7.2, PANTS, g, dim);
  r.limb(L.k, bt, 7.2, 8, PANTS, g, dim);
  r.limb(lerpV(L.k, bt, 0.5), bt, 8.6, 8.2, PANTS, g, dim, 2);
  // pieghe del tessuto: tratti chiari e scuri in diagonale su coscia e polpaccio
  [[L.h, L.k, 0.3, 1.6, 1], [L.h, L.k, 0.65, -0.8, 1], [L.k, bt, 0.45, 1.2, 1], [L.h, L.k, 0.5, 0.4, 0], [L.k, bt, 0.75, -1.2, 0]].forEach(([a, b, k, o, hi]) => {
    const A = a as V, Bv = b as V, c = along(lerpV(A, Bv, k as number), L.a1 + 90, o as number);
    r.line(c, along(c, L.a1 + 140, 1.6), hi ? PANTS[3 - dim] : PANTS[0], g);
  });
  r.limb(bt, L.a, 5.4, 5.2, BOOT, g, dim);
  r.limb(bt, along(bt, L.a2, 1.4), 6.4, 6.2, BOOT, g, dim, 0);
  const Ff = frameAt(L.a, L.fa);
  r.poly(Ff, [-3.2, -3, 1.6, -3, 4, -1.2, 6.2, 0, 6.8, 1.4, 6.8, 3, -3.2, 3], BOOT, g, { dim });
  r.poly(Ff, [-3.2, 2.1, 6.8, 2.1, 6.8, 3, -3.2, 3], BOOT, g, { sh: "flat", t: 0 });
  [0.3, 0.65].forEach((k) => r.dot(along(lerpV(bt, L.a, k), L.a2 + 90, 2.2), BOOT[3], g));
};

// braccia nude, bracciale di metallo borchiato al polso, guanto di cuoio
const arm = (r: Raster, A: Arm, g: number, dim = 0) => {
  r.limb(A.s, A.e, 5.4, 4.4, SKIN, g, dim);
  const c = lerpV(A.e, A.w, 0.55);
  r.limb(A.e, c, 4.6, 4.1, SKIN, g, dim);
  r.limb(c, A.w, 5.2, 5, METAL, g, dim);
  r.limb(c, along(c, A.a2, 0.9), 5.8, 5.8, METAL, g, dim, 0);
  r.limb(A.w, along(A.w, A.a2, 1.6), 4.4, 3.8, GLOVE, g, dim);
  [0.3, 0.75].forEach((k) => r.dot(along(lerpV(c, A.w, k), A.a2 + 90, 1.8), METAL[3], g));
};

// Buster Sword: guardia con tre rivetti, due feritoie, filo chiaro in basso, punta a scalpello, impugnatura rossa
const buster = (r: Raster, at: V, ang: number, g: number) => {
  const F = frameAt(at, ang);
  r.limb(along(at, ang, -7), along(at, ang, 2.6), 2.4, 2.4, GRIP, g);
  r.limb(along(at, ang, -8), along(at, ang, -8.5), 3, 3, METAL, g);
  r.poly(F, [2.6, -5, 5.6, -5, 5.6, 5, 2.6, 5], METAL, g, { sh: "cy" });
  r.poly(F, [5.6, -4.4, 46, -4.4, 50, 1.4, 50, 4.4, 5.6, 4.4], STEEL, g, {
    fn: (X, Y) => {
      if (X > 8 && X < 10.4 && Y > -2.6 && Y < 0.8) return 0;
      if (X > 12 && X < 14.4 && Y > -2.6 && Y < 0.8) return 0;
      if (Y > 2.8) return 3;
      if (Y > 2) return 1;
      if (Y < -3.6) return 1;
      return X > 30 && Y < -1 ? 1 : 2;
    },
  });
  [-3.3, 0, 3.3].forEach((y) => r.dot(along(along(at, ang, 4.1), ang + 90, y), METAL[3], g));
};

const draw = (r: Raster, s: Skel, _c: V[][]) => {
  const F = torsoFrame(s), p = s.p;
  // braccio e gamba lontani: un tono più scuri, per dare profondità
  if (!p.ik) arm(r, s.arm.b, 10, 1);
  leg(r, s.leg.b, 20, 1);
  // bacino, dolcevita a coste, cintura con fibbia dorata
  r.poly(F, [-5.4, -4.5, 5, -4.5, 5.6, 1, 5.2, 3.2, -5.6, 3.2, -6, 0], PANTS, 30);
  r.poly(F, [-4.8, 2.4, 4.6, 2.4, 5.2, 6, 6.4, 10.5, 6, 14, 3.8, 16.8, -1.8, 17.4, -5.4, 15.4, -6, 10, -5.4, 5.6], KNIT, 30, {
    fn: (X, Y) => {
      const base = X > 2.8 ? 3 : X > -1.2 ? 2 : X > -3.6 ? 1 : 0;
      return base - ((Math.floor(X + 20) & 1) && Y < 15.4 ? 1 : 0);
    },
  });
  r.poly(F, [-2, 15.4, 2.6, 15.4, 2.6, 19.4, -1.6, 19.4], KNIT, 30, { fn: (X) => ((Math.floor(X + 20) & 1) ? 1 : 2) });
  r.poly(F, [-5.8, 0.6, 5.6, 0.6, 5.6, 3, -5.8, 3], BELT, 31, { sh: "cx" });
  const bk = along(along(s.hip, 90 - s.lean, 5), 180 - s.lean, 1.8);
  r.poly(frameAt(bk, 180 - s.lean), [-1.4, -1.3, 1.4, -1.3, 1.4, 1.3, -1.4, 1.3], BELT, 32, { fn: (X, Y) => (Math.abs(X) > 0.6 || Math.abs(Y) > 0.6 ? 3 : 0) });
  r.dot(bk, GOLD, 32);
  // bretella con borchie: dalla spalla scende sul petto fino alla cintura
  r.poly(F, [1.2, 16.8, 3, 16.6, 5.2, 3, 3.4, 3], BELT, 31, { sh: "cx" });
  [6, 10, 14].forEach((y) => r.dot(along(along(s.hip, 180 - s.lean, y), 90 - s.lean, 4.3 - (y - 3) * 0.15), METAL[3], 31));
  leg(r, s.leg.f, 40);
  // collo e testa
  r.limb(s.neck, s.head, 3.6, 3.4, SKIN, 50, 0);
  r.grid(p.ex ? HEAD_HURT : HEAD, s.head, 50);
  if (p.ik) arm(r, s.arm.b, 55, 1);
  buster(r, s.grip, s.wa, 60);
  arm(r, s.arm.f, 70);
  // spallaccio: piastra di metallo sulla spalla con due bulloni a punta
  const A = s.arm.f, pa = (A.a1 - s.lean) * 0.5, PF = frameAt(along(A.s, A.a1, 1.8), pa);
  const at = (X: number, Y: number): V => ({ x: PF.o.x + PF.ax.x * X + PF.ay.x * Y, y: PF.o.y + PF.ax.y * X + PF.ay.y * Y });
  r.poly(PF, [-2.8, -1, -2.3, -2.7, -0.8, -3.5, 1.3, -3.4, 2.9, -2.4, 3.5, 0, 3, 2.4, 1.1, 3.3, -1.1, 3.2, -2.5, 2.1, -2.8, 0.5], METAL, 75);
  [0.4, 2.4].forEach((Y) => { const b0 = at(-2.4, Y); r.limb(b0, along(b0, pa + 196, 2), 1.6, 1, METAL, 76); });
  r.dot(at(0.4, -1.4), METAL[3], 76);
};

// posa base come lo sprite di riferimento: in piedi, gambe appena aperte, spadone tenuto con una mano in avanti
const B = { ...P0, lean: 5, fu: 10, ff: 72, bu: -8, bf: 16, ft: 20, fs: -16, fa: -4, bt: -18, bs: -6, ba: 24, w: 94 };

export const CLOUD: CharDef = {
  id: "cloud", name: "Cloud Strife",
  body: { thigh: 14.5, shin: 14.5, ankle: 2.5, foot: 4.6, heel: 1.6, torso: 16.5, neck: 2, ua: 10, la: 9, shF: [0.6, 14.2], shB: [-1.6, 14.2], hipF: 1, hipB: -1.5, grip: 4 },
  base: B, buf: [240, 170, 120, 130], ink: hex("#0d0b16"),
  weapon: { base: 14, tip: 50 }, smear: [hex("#ffffff", 235), hex("#9fdcff", 200)],
  sheet: SHEET, draw,
  anims: {
    idle: {
      // respiro: pausa in alto e in basso, due fotogrammi intermedi in salita e in discesa
      cels: [{ t: 0, frame: "idle0" }, { t: 0.3, frame: "idleA" }, { t: 0.42, frame: "idleB" }, { t: 0.54, frame: "idle1" },
        { t: 0.86, frame: "idleB" }, { t: 0.98, frame: "idleA" }, { t: 1.1, frame: "idle0" }],
      len: 1.3, loop: true, fps: 12, keys: [
        { t: 0, p: {} },
        { t: 0.65, p: { lean: 6, fu: 8, ff: 70, w: 91, fs: -19, bs: -8, hy: 1 } },
      ],
    },
    run: {
      // ciclo di 12 pose disegnate in sequenza, 25 fotogrammi al secondo: in 0,48 s il passo disegnato
      // corrisponde alla velocità di corsa, così i piedi non scivolano
      cels: Array.from({ length: 12 }, (_, i) => ({ t: i * 0.04, frame: `run${i}` })),
      len: 0.48, loop: true, fps: 20, speed: 120, keys: [
        { t: 0, p: { ik: 0, lean: 15, fu: -30, ff: 18, w: -62, ft: 38, fs: -8, fa: -6, bt: -28, bs: -60, ba: 10, bu: 38, bf: 42, y: 0 }, e: "lin" },
        { t: 0.06, p: { ft: 22, fs: -30, fa: 0, bt: -10, bs: -88, ba: 0, y: 1, bu: 20, bf: 48, fu: -27 }, e: "lin" },
        { t: 0.12, p: { ft: -2, fs: -18, bt: 26, bs: -100, y: 0, bu: -6, bf: 42, w: -64 }, e: "lin" },
        { t: 0.18, p: { ft: -32, fs: -12, fa: 12, bt: 50, bs: -58, y: -2, bu: -32, bf: 30, fu: -32 }, e: "lin" },
        { t: 0.24, p: { ft: -28, fs: -60, fa: 10, bt: 38, bs: -8, ba: -6, y: 0, bu: -40, bf: 26, w: -62 }, e: "lin" },
        { t: 0.3, p: { ft: -10, fs: -88, fa: 0, bt: 22, bs: -30, ba: 0, y: 1, bu: -22, bf: 34, fu: -27 }, e: "lin" },
        { t: 0.36, p: { ft: 26, fs: -100, bt: -2, bs: -18, y: 0, bu: 8, bf: 42, w: -64 }, e: "lin" },
        { t: 0.42, p: { ft: 50, fs: -58, bt: -32, bs: -12, ba: 12, y: -2, bu: 30, bf: 44, fu: -32 }, e: "lin" },
      ],
    },
    jump: {
      cels: [{ t: 0, frame: "jump" }, { t: 0.2, frame: "jumpFall" }],
      len: 0.3, fps: 15, ground: false, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 18, ft: 30, fs: -60, bt: -25, bs: -50, fu: -40, ff: 20, w: -70, bu: 40, bf: 40 } },
        { t: 0.12, p: { lean: 4, ft: 55, fs: -75, bt: -8, bs: -38, fu: -20, ff: 40, w: -100, bu: 70, bf: 50 } },
      ],
    },
    fall: {
      cels: [{ t: 0, frame: "fall" }],
      len: 0.4, loop: true, fps: 10, ground: false, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 2, ft: 24, fs: -30, bt: -14, bs: -28, fu: -10, ff: 40, w: -115, bu: 80, bf: 30, hy: 0 } },
        { t: 0.2, p: { ft: 20, fs: -24, bt: -18, bs: -22, bu: 86, bf: 26, w: -118 } },
      ],
    },
    land: {
      cels: [{ t: 0, frame: "land" }, { t: 0.1, frame: "heavyRecover" }, { t: 0.17, frame: "idle1" }],
      len: 0.22, fps: 15, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 22, ft: 42, fs: -86, bt: -32, bs: -74, fu: 0, ff: 30, w: -40, bu: 30, bf: 30 } },
        { t: 0.22, p: {} },
      ],
    },
    atk1: {
      cels: [{ t: 0, frame: "windup" }, { t: 0.08, frame: "slash" }, { t: 0.17, frame: "follow" }, { t: 0.225, frame: "followRecover" }, { t: 0.28, frame: "heavyRecover" }, { t: 0.36, frame: "idle0" }],
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
      cels: [{ t: 0, frame: "follow" }, { t: 0.07, frame: "uppercut" }, { t: 0.16, frame: "windup" }, { t: 0.3, frame: "idle1" }, { t: 0.38, frame: "idle0" }],
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
      cels: [{ t: 0, frame: "windup" }, { t: 0.12, frame: "heavyWindup" }, { t: 0.2, frame: "heavySlash" }, { t: 0.26, frame: "heavySlashRecover" }, { t: 0.32, frame: "heavyRecover" }, { t: 0.41, frame: "recoverFollow" }, { t: 0.5, frame: "follow" }, { t: 0.6, frame: "idle0" }],
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
      cels: [{ t: 0, frame: "jump" }, { t: 0.04, frame: "air" }, { t: 0.12, frame: "roll1", offset: [0, -4] }, { t: 0.2, frame: "roll0", offset: [0, -18] }, { t: 0.26, frame: "air" }, { t: 0.3, frame: "fall" }],
      len: 0.36, fps: 20, ground: false, trail: [0.02, 0.3],
      hit: [{ t0: 0.04, t1: 0.3, box: [-30, -60, 44, 10], dmg: 10, kb: 90 }],
      keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, rot: 0, lean: 10, fu: 100, ff: 0, w: 100, ft: 60, fs: -110, bt: 40, bs: -110, bu: 40, bf: 60 }, e: "lin" },
        { t: 0.3, p: { rot: 360 }, e: "out" },
        { t: 0.36, p: {} },
      ],
    },
    roll: {
      cels: [{ t: 0, frame: "land" }, { t: 0.06, frame: "roll0" }, { t: 0.14, frame: "roll1" }, { t: 0.23, frame: "roll0" }, { t: 0.31, frame: "land" }, { t: 0.37, frame: "idle1" }],
      len: 0.4, fps: 20, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: 30, ft: 50, fs: -90, bt: -20, bs: -80, fu: -20, ff: 60, w: -40, bu: 40, bf: 80, rot: 0 }, e: "lin" },
        { t: 0.06, p: { lean: 45, ft: 85, fs: -140, bt: 70, bs: -140, rot: 30 }, e: "lin" },
        { t: 0.3, p: { rot: 360 }, e: "out" },
        { t: 0.4, p: { lean: 20, ft: 40, fs: -70, bt: -30, bs: -60, rot: 360 } },
      ],
    },
    hurt: {
      cels: [{ t: 0, frame: "hurt", offset: [-2, 0] }, { t: 0.16, frame: "hurt" }, { t: 0.26, frame: "idle1" }],
      len: 0.32, fps: 15, keys: [
        { t: 0, p: { ik: 0, fa: 0, ba: 4, lean: -20, hx: -1, fu: -40, ff: 60, w: -50, bu: 50, bf: 50, ft: 24, fs: -24, bt: -26, bs: -14, ex: 1 }, e: "out" },
        { t: 0.32, r: true },
      ],
    },
    death: {
      cels: [{ t: 0, frame: "hurt" }, { t: 0.3, frame: "land" }, { t: 0.7, frame: "roll0" }, { t: 1, frame: "death" }],
      len: 1.4, fps: 12, keys: [
        { t: 0, p: { ik: 0, lean: -20, fu: -40, ff: 60, w: -50, bu: 50, bf: 50, ex: 1 }, e: "in" },
        { t: 0.35, p: { lean: 30, ft: 82, fs: -100, bt: -5, bs: -92, ba: 10, fu: 40, ff: 20, w: 15, bu: 10, bf: 10, hy: 1 }, e: "out" },
        { t: 0.9, p: { lean: 38 } , e: "in" },
        { t: 1.2, p: { rot: 82, lean: 0, ft: 0, fs: 0, bt: -6, bs: -4, fu: 160, ff: 10, w: 160, bu: 150, bf: 20 } },
      ],
    },
    win: {
      cels: [{ t: 0, frame: "idle0" }, { t: 0.18, frame: "windup" }, { t: 0.42, frame: "win" }],
      len: 1.2, fps: 15, trail: [0.05, 0.45], keys: [
        { t: 0, p: { ik: 0, lean: 0, fu: 60, ff: 10, w: 90 }, e: "lin" },
        { t: 0.45, p: { w: 90 + 720, fu: 70 }, e: "out" },
        { t: 0.7, p: { lean: -4, fu: 150, ff: 110, w: 250 + 720, bu: 10, bf: 20, ft: 8, fs: -4, fa: 0, bt: -10, bs: -4, ba: 4 } },
        { t: 1.2, p: { hy: 0 } },
      ],
    },
  },
};
