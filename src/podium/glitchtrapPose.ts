// Glitchtrap's performance behind the podium, as a function of time: the same pose feeds the main view, the shadow
// map and every reflection. The walk is real: a captured sneaking walk (CMU motion capture, subject 139) retargeted onto
// this skeleton, with the feet locked to the floor. On top of it, the gestures that make him Glitchtrap: the lean out
// from behind the column (Help Wanted's Pizza Party ending), the slow open-hand wave beside a cocked head and the
// "come here" ripple of the fingers (Dead by Daylight's lobby), the head that always seeks the real camera, sudden
// glitches, breathing, and ears that are damped springs pushed by the head (EarSprings, the only state).
//
// Timeline (seconds after the reveal): hidden behind the column he leans out until one glowing eye shows (0.3–2.3),
// slides out and pads diagonally behind the column (2.3–6.5), stops and turns to face the camera in one movement
// (6.5–7.7), waves with his right hand at eye level (8.6–11.3), beckons (11.3–13.1), lowers the hand and idles (the
// weight drifting between the feet, glances, the free hand swinging and drumming its fingers), waving again every
// fifteen seconds (from 21). From 16.5, every fifteen seconds, a heavy glitch takes him to another place in the hall
// (TELEPORT, SPOTS): he tenses, his image collapses and opens again elsewhere, and he rises from a crouch; the camera
// follows him there. Reduced motion: the final pose with the hand up, still, where his walk ends.
//
// Rig conventions (bind pose, metres): y up, the character faces +z, its left is +x. Every joint rotation is a delta
// from the bind pose expressed in bind-aligned axes, so a child rotates in its parent's posed frame.
type V = number[];
type Q = number[];

const D = Math.PI / 180;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
// a clamp with rounded corners (no kink in the motion where the limit starts to act)
const softClamp = (x: number, lo: number, hi: number, k = 0.06) => { const m = (x + lo + Math.hypot(x - lo, k)) / 2; return (m + hi - Math.hypot(m - hi, k)) / 2; };
const smoother = (x: number) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const ramp = (t: number, a: number, b: number) => smoother((t - a) / (b - a));
// eases out with a small overshoot (the hand arrives a little past its mark and settles)
const backOut = (x: number) => { const t = smoother(x), k = 1.4; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };

const I: Q = [0, 0, 0, 1];
const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q: Q, v: V): V => {
  const u = [q[0], q[1], q[2]], t = mul(cross(u, v), 2);
  return add(add(v, mul(t, q[3])), cross(u, t));
};
const qaxis = (axis: V, angle: number): Q => { const a = norm(axis), s = Math.sin(angle / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)]; };
const qx = (a: number) => qaxis([1, 0, 0], a), qy = (a: number) => qaxis([0, 1, 0], a), qz = (a: number) => qaxis([0, 0, 1], a);
const qnorm = (q: Q): Q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map((v) => v / l); };
const qslerp = (a: Q, b: Q, t: number): Q => {
  let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = c < 0 ? -1 : 1; c *= s;
  if (c > 0.9995) return qnorm(a.map((v, i) => v + (b[i] * s - v) * t));
  const th = Math.acos(c), k0 = Math.sin((1 - t) * th) / Math.sin(th), k1 = (Math.sin(t * th) / Math.sin(th)) * s;
  return a.map((v, i) => v * k0 + b[i] * k1);
};
// rotation from three orthonormal columns (x, y, z)
const qbasis = (x: V, y: V, z: V): Q => {
  const tr = x[0] + y[1] + z[2];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  if (x[0] > y[1] && x[0] > z[2]) { const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2; return [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  if (y[1] > z[2]) { const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2; return [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2; return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
};
const frame = (f: V, u: V) => { const a = norm(f), b = norm(sub(u, mul(a, dot(u, a)))); return [a, b, cross(a, b)]; };
// the rotation taking direction f1 to f2 while the reference u1 turns as close as possible to u2
const qlook = (f1: V, u1: V, f2: V, u2: V): Q => {
  const [a1, b1, c1] = frame(f1, u1), [a2, b2, c2] = frame(f2, u2);
  return qmul(qbasis(a2, b2, c2), qinv(qbasis(a1, b1, c1)));
};
// twist of q around an axis (swing–twist decomposition)
const qtwist = (q: Q, axis: V): Q => { const p = mul(axis, dot([q[0], q[1], q[2]], axis)); return qnorm([p[0], p[1], p[2], q[3]]); };
const qangle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ---------- the rig ----------
export type JointInfo = { name: string; parent: number; bind: number[] };
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'] as const;
type Arm = {
  s: number; collar: number; upper: number; lower: number; hand: number; twist: number; forearmTwist: number;
  l1: number; l2: number; upperDir: V; lowerDir: V; pole: V; handDir: V; palm: V;
  fingers: { joints: number[]; axis: V; spread: V }[];
};
type Leg = { s: number; hip: number; knee: number; foot: number; toe: number; l1: number; l2: number; thigh: V; shin: V; ball: V; heel: V };
export type Rig = {
  n: number; names: string[]; parent: number[]; bind: V[]; ends: number[]; walk?: Walk;
  root: number; pelvis: number; spine: number[]; neck: number; head: number; tie: number;
  ears: { a: number; b: number; s: number; seg: { r: V; u: V; l: number }[] }[]; arms: Arm[]; legs: Leg[];
};

export function makeRig(joints: JointInfo[]): Rig {
  const at = (name: string) => { const i = joints.findIndex((j) => j.name === name); if (i < 0) throw new Error(`Glitchtrap: joint ${name}`); return i; };
  const parent = joints.map((j) => j.parent), bind = joints.map((j) => j.bind.slice());
  // leaf markers carry no weights: they simply follow their parent
  const ends = joints.map((j, i) => (/_end$/.test(j.name) ? i : -1)).filter((i) => i >= 0);
  ends.forEach((i) => (bind[i] = bind[parent[i]].slice()));
  const arms = (['L', 'R'] as const).map((side): Arm => {
    const s = side === 'L' ? 1 : -1, b = (n: string) => bind[at(n)];
    const upper = at(`bip_upperArm_${side}`), lower = at(`bip_lowerArm_${side}`), hand = at(`bip_hand_${side}`);
    const sh = bind[upper], el = bind[lower], wr = bind[hand];
    const reach = norm(sub(wr, sh)), elbowOut = sub(sub(el, sh), mul(reach, dot(sub(el, sh), reach)));
    const handDir = norm(sub(b(`${side}_MiddleA_jnt`), wr));
    const across = sub(b(`${side}_IndexA_jnt`), b(`${side}_PinkyA_jnt`));
    const palm = norm(mul(cross(handDir, across), s)); // towards the palm, for both hands
    const fingers = FINGERS.map((f) => {
      const ids = ['A', 'B', 'C'].map((k) => at(`${side}_${f}${k}_jnt`));
      const dir = norm(sub(bind[ids[1]], bind[ids[0]]));
      // positive angles fold each phalanx towards the palm; spread fans the base joint away from the middle finger
      return { joints: ids, axis: norm(cross(dir, palm)), spread: palm };
    });
    return {
      s, collar: at(`bip_collar_${side}`), upper, lower, hand, twist: at(side === 'L' ? 'L_shoulderTwist_jnt' : 'bip_arm_thing'),
      forearmTwist: at(`${side}_forearmTwist_jnt`), l1: len(sub(el, sh)), l2: len(sub(wr, el)), upperDir: norm(sub(el, sh)),
      lowerDir: norm(sub(wr, el)), pole: norm(elbowOut), handDir, palm, fingers,
    };
  });
  const legs = (['L', 'R'] as const).map((side): Leg => {
    const hip = at(`bip_hip_${side}`), knee = at(`bip_knee_${side}`), foot = at(`bip_foot_${side}`), toe = at(`bip_toe_${side}`);
    return {
      s: side === 'L' ? 1 : -1, hip, knee, foot, toe, l1: len(sub(bind[knee], bind[hip])), l2: len(sub(bind[foot], bind[knee])),
      thigh: norm(sub(bind[knee], bind[hip])), shin: norm(sub(bind[foot], bind[knee])),
      // the ball of the foot (toe joint, on the floor) and the heel, both relative to the ankle
      ball: sub(bind[toe], bind[foot]), heel: [0, -bind[foot][1], -0.075],
    };
  });
  return {
    n: joints.length, names: joints.map((j) => j.name), parent, bind, ends, root: at('_rootJoint'), pelvis: at('bip_pelvis'),
    spine: ['bip_spine_0', 'bip_spine_1', 'bip_spine_2'].map(at), neck: at('bip_neck'), head: at('bip_head'), tie: at('bip_tie'),
    ears: (['L', 'R'] as const).map((side) => {
      // two segments per ear: base to middle joint, then the floppy tip (about as long, same direction at rest)
      const a = at(`bip_ear${side}1`), b = at(`bip_ear${side}2`), head = bind[at('bip_head')];
      const u = norm(sub(bind[b], bind[a])), l = len(sub(bind[b], bind[a]));
      return { a, b, s: side === 'L' ? 1 : -1, seg: [
        { r: sub(mul(add(bind[a], bind[b]), 0.5), head), u, l },
        { r: sub(add(bind[b], mul(u, l * 0.5)), head), u, l },
      ] };
    }), arms, legs,
  };
}

// ---------- the stage ----------
// The room is in metres; the camera sits near (0, 2.75, 10.2) looking towards -z, and while the secret plays it eases
// closer to the left aisle and swings round to the left (Podium3D.tsx; CAMERA is where it then stands on computers).
// He starts hidden behind the second column of the left aisle and walks out along HEADING; the captured walk decides
// where he stops (behind the back corner of the dais). Nearly half as big again as a costume: the hall is monumental.
export const SCALE = 1.85;
// the actor is slimmer than the costume: his arms hang this much further out, clear of the belly and the thighs
const ARM_OUT = 14 * D;
// The hand that waves: his right (-1; +1 is his left). Raised to his eyes, the left hand would disappear behind the
// second place's plate, which floats just beside him; the right one rises against the dark aisle.
const WAVE = -1;
// the waving arm (in an upright frame turned with the chest): where the elbow points and where the forearm does
const ELBOW = [0.58, -0.35, 0.64], FOREARM = [-0.04, 1, 0.08];
// He hides behind the column at z -1.9 (seen from the secret's camera) and walks out to the right behind it, far
// enough that neither his feet nor his swinging hands touch it or the one behind, stopping where the camera sees him
// whole: behind the corner of the dais, clear of the columns and of the plates over the cups. He peeks out towards
// LEAN.
const START = [-6.95, -3.6], HEADING = 84 * D, CAMERA = [-3.42, 8.45], LEAN = [1, 0, 0.2];
const fwd = (yaw: number): V => [Math.sin(yaw), 0, Math.cos(yaw)];
const left = (yaw: number): V => [Math.cos(yaw), 0, -Math.sin(yaw)];
const mixV = (a: V, b: V, t: number): V => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const yawOf = (q: Q) => { const f = qrot(q, [0, 0, 1]); return Math.atan2(f[0], f[2]); };
// from the walk's frame (bind metres, +z along the walk) to the room
const H = qy(HEADING);
const toRoom = (p: V): V => { const r = qrot(H, mul(p, SCALE)); return [START[0] + r[0], r[1], START[1] + r[2]]; };

// ---------- the captured walk ----------
// A real sneaking walk (CMU motion capture, subject 139, "Sneaking"), retargeted offline onto this skeleton by
// scripts/bake-glitchtrap-walk.cjs: 60 fps, from standing still to four padded steps at an even pace, then a short tail
// of the next step (the actor never stops; Glitchtrap's legs stop at `stop`, his trunk and arms run on into the tail).
// Per frame: the midpoint of the hips, the two ankles (balls of the feet locked to the floor while planted) and the
// global rotation of every mapped joint.
export type WalkMeta = { version: number; fps: number; frames: number; stop: number; stride: number; joints: string[] };
type Walk = { fps: number; frames: number; stride: number; slot: Int16Array; joints: number[]; data: Float32Array; duration: number; end: V };
export function attachWalk(rig: Rig, meta: WalkMeta, data: Float32Array) {
  if (meta.version !== 2 || data.length !== meta.frames * meta.stride || meta.stride !== 9 + meta.joints.length * 4 || !(meta.stop > 0 && meta.stop < meta.frames - 1)) throw new Error('Glitchtrap: camminata incompleta');
  const joints = meta.joints.map((name) => { const i = rig.names.indexOf(name); if (i < 0) throw new Error(`Glitchtrap: joint ${name}`); return i; });
  const slot = new Int16Array(rig.n).fill(-1);
  joints.forEach((j, k) => (slot[j] = k));
  const stop = meta.stop * meta.stride;
  rig.walk = { fps: meta.fps, frames: meta.frames, stride: meta.stride, slot, joints, data, duration: meta.stop / meta.fps, end: toRoom([data[stop], 0, data[stop + 2]]) };
}
type Frame = { root: V; ankle: V[]; rot: Q[] };
function sampleWalk(w: Walk, time: number): Frame {
  const x = clamp(time * w.fps, 0, w.frames - 1), k = Math.min(w.frames - 2, Math.floor(x)), u = x - k, d = w.data;
  const A = k * w.stride, B = A + w.stride, P0 = Math.max(0, k - 1) * w.stride, P3 = Math.min(w.frames - 1, k + 2) * w.stride;
  // positions and rotations on Catmull-Rom curves through the frames: no jolt in speed from one frame to the next, at
  // any refresh rate (rotations: on the quaternions' components, kept on one hemisphere, then normalised)
  const u2 = u * u, u3 = u2 * u;
  const spline = (p: number, a: number, b: number, n: number) => 0.5 * (2 * a + (b - p) * u + (2 * p - 5 * a + 4 * b - n) * u2 + (3 * a - p - 3 * b + n) * u3);
  const cr = (o: number) => spline(d[P0 + o], d[A + o], d[B + o], d[P3 + o]);
  const v = (o: number): V => [cr(o), cr(o + 1), cr(o + 2)];
  const quat = (at: number, ref?: Q): Q => {
    const q = [d[at], d[at + 1], d[at + 2], d[at + 3]];
    return ref && q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? q.map((x) => -x) : q;
  };
  const q = (o: number): Q => {
    const a = quat(A + o), b = quat(B + o, a), p = quat(P0 + o, a), n = quat(P3 + o, b);
    return qnorm(a.map((x, c) => spline(p[c], x, b[c], n[c])));
  };
  return { root: v(0), ankle: [v(3), v(6)], rot: w.joints.map((_, j) => q(9 + j * 4)) };
}

export const TIMES = { peek: 0.3, peekHeld: 1.3, step: 2.3, settled: 7.9, wave: 8.6, beckon: 11.3, lower: 13.1, idle: 14.2, rewave: 21, every: 15 };
// sudden glitches of the head: [time, roll, yaw, strength of the glitch]. The scripted ones are light; the heavy ones
// come with the teleports (below), a twitch as the glitch takes hold of him and another as he finds his feet again.
const TWITCHES: number[][] = [[1.85, -16, 7, 0.75], [9.75, 13, -6, 0.6], [12.3, -11, 4, 0.6]];
// ---------- the teleports ----------
// At every heavy glitch, once his first wave is over, he vanishes and reappears somewhere else in the hall: the first one
// at `first`, then every `every` seconds (4.5 s before each new wave). Before it (`pre`) he tenses and shakes, the glitch
// tearing him harder and harder, until his image collapses like an old television switched off (glitchtrap.ts); he is
// gone for `gone`, then the same line of light opens up somewhere else and he finds his feet (`post`).
export const TELEPORT = { first: 16.5, every: 15, pre: 0.9, gone: 0.25, post: 1.35 };
const teleportIndex = (t: number) => Math.floor((t - TELEPORT.first + TELEPORT.gone + TELEPORT.post) / TELEPORT.every);
// the nearest teleport around t: when it happens (the instant his image is gone) and its number, or null before the first
function teleportNear(t: number) {
  const n = teleportIndex(t);
  return n < 0 ? null : { n, at: TELEPORT.first + n * TELEPORT.every };
}
// pre: 0..1 as the glitch gathers; vanish: 0 visible .. 1 gone (collapse, nothing, opening); arrive: 1 as he lands, back
// to 0 once he stands again
function teleportPhase(t: number) {
  const k = teleportNear(t);
  if (!k) return { pre: 0, vanish: 0, arrive: 0, n: -1 };
  const u = t - k.at, out = u >= TELEPORT.gone / 2;
  const pre = ramp(u, -TELEPORT.pre, -0.05) * (u < 0 ? 1 : 0);
  const vanish = u < 0 ? ramp(u, -0.32, 0) : u < TELEPORT.gone ? 1 : 1 - ramp(u, TELEPORT.gone, TELEPORT.gone + 0.38);
  const arrive = out && u < TELEPORT.gone + TELEPORT.post ? 1 - ramp(u, TELEPORT.gone + 0.3, TELEPORT.gone + TELEPORT.post) : 0;
  return { pre, vanish, arrive, n: out ? k.n : k.n - 1 };
}
// the twitches near t: the scripted ones, then two for each teleport
function twitches(t: number) {
  const events = [...TWITCHES];
  const k = teleportNear(t);
  if (k) for (const j of [k.n - 1, k.n]) if (j >= 0) {
    const at = TELEPORT.first + j * TELEPORT.every, side = j % 2 ? 1 : -1;
    events.push([at - TELEPORT.pre + 0.05, 15 * side, -6 * side, 1], [at + TELEPORT.gone + 0.85, -12 * side, 7 * side, 0.7]);
  }
  return events;
}
function twitch(t: number) {
  let roll = 0, yaw = 0, glow = 0;
  for (const [at, r, y] of twitches(t)) {
    const u = t - at;
    if (u < 0 || u > 0.7) continue;
    const e = u < 0.06 ? smoother(u / 0.06) : u < 0.16 ? 1 : 1 - smoother((u - 0.16) / 0.5);
    roll += r * e; yaw += y * e; glow = Math.max(glow, u < 0.16 ? 1 : 0);
  }
  return { roll: roll * D, yaw: yaw * D, glow };
}

// The lights that come with him (engine.ts, glitchtrap.ts), each 0..1: the lamp over the place where he stops, which
// struggles on like an old tube as he steps under it and dips at every glitch; the glitches themselves (the green tearing
// of his image), the twitches of the head and smaller ones in between; his own glow, which flares with them.
const LAMP_ON = 5.3;
const BLINKS = [[0, 0.07], [0.2, 0.26], [0.52, 0.66], [0.9, 99]];
const pulse = (k: number) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
function glitchAt(t: number) {
  let g = 0;
  const events = twitches(t).map(([at, , , amp]) => [at, amp]);
  for (let k = Math.max(0, Math.floor(t / 2.9) - 1); k <= Math.floor(t / 2.9); k++) events.push([k * 2.9 + 2.2 * pulse(k), 0.3 + 0.25 * pulse(k + 7)]);
  for (const [at, amp] of events) {
    const u = t - at;
    if (u >= 0 && u < 0.4) g = Math.max(g, amp * (u < 0.03 ? u / 0.03 : 1 - smoother((u - 0.03) / 0.37)));
  }
  // a teleport: the glitch builds up until his image breaks, and lets go of him slowly once he is back
  const tp = teleportPhase(t), on = tp.pre > 0 || tp.vanish > 0 || tp.arrive > 0;
  return on ? Math.max(g, 0.35 + 0.65 * tp.pre * tp.pre, tp.vanish, 0.8 * tp.arrive * tp.arrive) : g;
}
// The places he can reappear in, and how the secret's camera frames each (Podium3D.tsx eases to it: offsets added to
// its motion, x, z and yaw, on computers and on phones; `camera`: where it then stands on computers, he faces it).
// Searched over the whole hall: he stands clear of columns, dais, steps and walls by 10 cm at least, and seen from
// there no column, plate or screen edge hides his head or his waving hand. 0 is where his walk brings him, behind the
// left corner of the dais; 1 the same corner on the right; 2 in front of the dais on the left, close to the camera.
type SpotView = { at: number[] | null; desk: number[]; phone: number[]; camera: number[] };
const SPOTS: SpotView[] = [
  { at: null, desk: [-0.6, -1.0, -0.28], phone: [-3.6, -1.5, 0.1], camera: CAMERA },
  { at: [5.2, -4.05], desk: [0.6, -1.0, 0.28], phone: [3.6, -1.5, -0.1], camera: [3.42, 8.45] },
  { at: [-4.45, 3.75], desk: [-0.6, 2.5, -0.28], phone: [-4.2, 4.5, 0.35], camera: [-3.42, 11.95] },
];
// where he is after teleport n (-1: before the first): never the same place twice in a row, in an order that looks random
function spotOf(n: number) {
  let s = 0;
  for (let j = 0; j <= n; j++) s = (s + 1 + Math.floor(pulse(j * 3.7 + 1.3) * (SPOTS.length - 1))) % SPOTS.length;
  return s;
}
// A place is a rigid move of his whole pose: turned about the vertical (by `yaw`) round where the walk left him (`from`)
// and set down at `to`, so the performance itself, the ear springs included, never jumps.
type Spot = { yaw: number; from: V; to: V };
const homes = new WeakMap<Rig, { at: V; face: number }>();
function home(rig: Rig) {
  let h = homes.get(rig);
  if (!h) { const b = capturedBase(rig, 0, true); h = { at: [b.hips[0], 0, b.hips[2]], face: yawOf(b.pelvis) }; homes.set(rig, h); }
  return h;
}
function spotAt(rig: Rig, n: number): Spot | null {
  const view = SPOTS[n < 0 ? 0 : spotOf(n)], place = view.at;
  if (!place) return null;
  const h = home(rig), to = [place[0], 0, place[1]], cam = view.camera;
  return { yaw: qangle(h.face, Math.atan2(cam[0] - to[0], cam[1] - to[2]), 1) - h.face, from: h.at, to };
}
const toSpot = (sp: Spot, p: V) => add(qrot(qy(sp.yaw), sub(p, sp.from)), sp.to);
const fromSpot = (sp: Spot, p: V) => add(qrot(qy(-sp.yaw), sub(p, sp.to)), sp.from);

// the waving hand's gestures: weight of the raised hand, wave phase and strength, finger ripple; repeated in the idle
const blinks = (u: number) => { let on = 0; for (const [a, b] of BLINKS) on = Math.max(on, smoother((u - a) / 0.02) * (1 - smoother((u - b) / 0.03))); return on; };
export function secretLights(seconds: number, reduced: boolean) {
  if (reduced) return { lamp: 1, glitch: 0, glow: 1, vanish: 0 };
  const t = Math.max(0, seconds), g = glitchAt(t), tp = teleportPhase(t), k = teleportNear(t);
  let lamp = blinks(t - LAMP_ON);
  // around a teleport: off as his image collapses, then on again over the new place, as at the start
  if (k) { const u = t - k.at; if (u > -0.12) lamp = Math.min(lamp, u < TELEPORT.gone + 0.3 ? 0 : blinks(u - TELEPORT.gone - 0.3)); }
  lamp *= 1 - 0.7 * g + 0.035 * Math.sin(t * 7.3) * Math.sin(t * 13.1);
  // his glow flares as he vanishes and as he comes back (a flash of green over the room)
  return { lamp: Math.max(0, lamp), glitch: g, glow: 0.8 + 0.12 * Math.sin(t * 2.3) + 0.9 * g + 2.5 * tp.vanish, vanish: tp.vanish };
}

// the waving hand's gestures: weight of the raised hand, wave phase and strength, finger ripple; repeated in the idle
type Gesture = { up: number; wave: number; phase: number; amp: number; beckon: number; lift: number };
function gesture(t: number, still: boolean): Gesture {
  if (still) return { up: 1, wave: 0, phase: 0, amp: 0, beckon: 0, lift: 1 };
  let up = ramp(t, TIMES.settled, TIMES.wave) * (1 - ramp(t, TIMES.lower, TIMES.idle));
  let lift = backOut((t - TIMES.settled - 0.12) / (TIMES.wave - TIMES.settled - 0.12));
  let phase = ((t - TIMES.wave) / 0.9) * 2 * Math.PI;
  let amp = ramp(t, TIMES.wave - 0.2, TIMES.wave + 0.35) * (1 - ramp(t, TIMES.beckon - 0.35, TIMES.beckon + 0.1));
  const beckon = ramp(t, TIMES.beckon - 0.2, TIMES.beckon + 0.3) * (1 - ramp(t, TIMES.lower - 0.3, TIMES.lower + 0.4));
  if (t > TIMES.rewave - 1) {
    // later waves: raise, two slow cycles, lower
    const u = (t - TIMES.rewave) % TIMES.every;
    if (t >= TIMES.rewave && u < 4.6) {
      up = Math.max(up, ramp(u, 0, 0.7) * (1 - ramp(u, 3.6, 4.6))); lift = backOut(u / 0.7);
      phase = ((u - 0.7) / 0.95) * 2 * Math.PI; amp = ramp(u, 0.5, 0.95) * (1 - ramp(u, 2.9, 3.5));
    }
  }
  return { up, wave: Math.sin(phase) * amp, phase, amp, beckon, lift };
}

// ---------- the costume's bulk ----------
// The thighs and the belly as elliptical tubes, measured on the mesh (bind metres): half-widths outwards, inwards,
// forwards and backwards where the tube starts, halfway and where it ends, and how far past its ends it reaches
// (as fractions of its length). The hanging hands are kept clear of them.
type Tube = { a: V; b: V; q: Q; s: number; from: number; to: number; r: number[][] };
const THIGH = { from: -0.25, to: 1.05, r: [[0.114, 0.151, 0.146, 0.142], [0.111, 0.149, 0.145, 0.128], [0.082, 0.103, 0.108, 0.098]] };
const BELLY = { from: -0.3, to: 1.1, r: [[0.241, 0.241, 0.205, 0.2], [0.22, 0.22, 0.205, 0.159], [0.211, 0.211, 0.18, 0.157]] };
// signed distance from p to the tube's skin (negative inside), along the ray from its axis. Smooth everywhere (the
// half-widths follow a parabola through the three rings, ends and limits are rounded): the arm that gives way to it
// must not jolt.
const smax = (a: number, b: number, k: number) => (a + b + Math.hypot(a - b, k)) / 2;
function tubeGap(p: V, t: Tube) {
  const ab = sub(t.b, t.a), l = len(ab), d = mul(ab, 1 / l), r = sub(p, t.a), u = dot(r, d) / l, k = softClamp(u, 0, 1);
  const half = t.r[0].map((a, j) => { const m = t.r[1][j], b = t.r[2][j]; return (a + k * (4 * m - 3 * a - b) + k * k * (2 * a - 4 * m + 2 * b)) * SCALE; });
  const q = qrot(qinv(t.q), sub(r, mul(d, u * l))), x = q[0] * t.s, z = q[2], rho = Math.hypot(x, z);
  const e = Math.hypot(x / (x > 0 ? half[0] : half[1]), z / (z > 0 ? half[2] : half[3]));
  return smax(e > 1e-6 ? rho - rho / e : -Math.min(...half), smax((t.from - u) * l, (u - t.to) * l, 0.02), 0.02);
}
// the gap the hanging hand keeps from the costume (metres), how softly the arm starts to give way, and how sharply the
// nearest part of the hand is told from the others
const HAND_GAP = { min: 0.02, soft: 0.018, sharp: 0.012 };
// how close the hand comes to the thighs and belly: a soft minimum over wrist, palm, knuckles, finger joints and
// fingertips, each with its skin's thickness (bind metres) taken off
function handGap(rig: Rig, arm: Arm, pos: V[], rot: Q[], tubes: Tube[]) {
  let sum = 0;
  const test = (p: V, r: number) => { for (const tube of tubes) sum += Math.exp(-(tubeGap(p, tube) - r * SCALE) / HAND_GAP.sharp); };
  test(pos[arm.hand], 0.06);
  test(mixV(pos[arm.hand], pos[arm.fingers[1].joints[0]], 0.5), 0.05);
  for (const f of arm.fingers) {
    const [a, b, c] = f.joints;
    test(pos[a], 0.042); test(pos[b], 0.035); test(pos[c], 0.03);
    test(add(pos[c], qrot(rot[c], mul(sub(rig.bind[c], rig.bind[b]), 0.7 * SCALE))), 0.026);
  }
  return -HAND_GAP.sharp * Math.log(sum);
}

// ---------- evaluation ----------
type Pose = { rot: Q[]; pos: V[]; glow: number; earBase: Q };
type Base = { hips: V; pelvis: Q; ankle: V[]; foot: Q[]; local: (j: number) => Q; lag: (j: number) => Q };
// The captured pose at time t: standing before the walk, the walk itself, then the stop facing the camera. The clip is
// eased in, so nothing jumps when the walk begins; past its stop frame its clock runs on ever slower (CALM seconds of
// the tail in all), so the trunk and arms come to rest instead of freezing; the stop itself lasts STOP seconds.
const EASE_IN = 0.5, CALM = 0.32, STOP = 1.2;
const walkTime = (u: number) => (u <= 0 ? 0 : u < EASE_IN ? (u * u) / (2 * EASE_IN) : u - EASE_IN / 2);
const walkDone = (w: Walk) => TIMES.step + w.duration + EASE_IN / 2;
const calmed = (w: Walk, x: number) => (x <= w.duration ? x : w.duration + CALM * (1 - Math.exp(-(x - w.duration) / CALM)));
// cubic from a (moving at rate va) to b (at rest) over T seconds, at time x: picks up any motion without a jolt
const hermite = (a: number, va: number, b: number, T: number, x: number) => {
  const s = clamp01(x / T), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * a + (s3 - 2 * s2 + s) * T * va + (3 * s2 - 2 * s3) * b;
};
const level = (q: Q) => qmul(qy(-yawOf(q)), q);
function capturedBase(rig: Rig, t: number, still: boolean): Base {
  const w = rig.walk!, x = still ? w.duration + 10 : walkTime(t - TIMES.step);
  const f = sampleWalk(w, calmed(w, x)), before = sampleWalk(w, calmed(w, x - 0.1));
  const local = (j: number) => qmul(qinv(f.rot[w.slot[rig.parent[j]]]), f.rot[w.slot[j]]);
  // how a joint turned over the last tenth of a second (room axes): loose parts trail it
  const lag = (j: number) => qmul(H, qmul(qmul(before.rot[w.slot[j]], qinv(f.rot[w.slot[j]])), qinv(H)));
  const pelvis = qmul(H, f.rot[w.slot[rig.pelvis]]);
  if (x <= w.duration) return { hips: toRoom(f.root), pelvis, ankle: f.ankle.map(toRoom), foot: rig.legs.map((l) => qmul(H, f.rot[w.slot[l.foot]])), local, lag };

  // The stop, the way a person stops and turns: the last step has just landed, the body rides on over the front foot
  // while the back foot peels off, swings round and sets down beside it, the front foot pivoting on its ball so both
  // end up facing the camera; the hips turn with them and settle between the feet, a little taller (the hunch eases
  // off). Hips and pelvis start at the speed the walk had: nothing halts and restarts. (Turning the hips alone would
  // cross his legs.)
  // (rates as the walk's splines have them at that frame: across the frames either side)
  const tau = x - w.duration, end = sampleWalk(w, w.duration), rest = sampleWalk(w, 0);
  const prev = sampleWalk(w, w.duration - 1 / w.fps), next = sampleWalk(w, w.duration + 1 / w.fps);
  const hips0 = toRoom(end.root), hipsRate = mul(sub(toRoom(next.root), toRoom(prev.root)), w.fps / 2);
  const pelvisYaw = (f: Frame) => yawOf(qmul(H, f.rot[w.slot[rig.pelvis]])), yaw0 = pelvisYaw(end), yawPrev = pelvisYaw(prev);
  const yawRate = ((qangle(yawPrev, pelvisYaw(next), 1) - yawPrev) * w.fps) / 2;
  const lastFoot = rig.legs.map((l) => qmul(H, end.rot[w.slot[l.foot]])), ballOff = rig.legs.map((l) => mul(l.ball, SCALE));
  const balls = end.ankle.map((a, i) => add(toRoom(a), qrot(lastFoot[i], ballOff[i])));
  const front = dot(sub(balls[0], balls[1]), fwd(yaw0)) > 0 ? 0 : 1, back = 1 - front;
  const face = qangle(yaw0, Math.atan2(CAMERA[0] - hips0[0], CAMERA[1] - hips0[2]), 1);
  const toeOut = (i: number) => face + rig.legs[i].s * 7 * D;
  const goal = add(add(balls[front], mul(left(face), ((rig.legs[back].s - rig.legs[front].s) / 2) * 0.34 * SCALE)), mul(fwd(face), -0.03 * SCALE));
  // the back foot peels off as the weight rolls onto the front one, swings low and sets down flat. Both feet start
  // from the walk's own roll and contact as it runs on (it keeps the balls planted): no foot stops dead.
  const stepS = clamp01((tau - 0.15) / 0.55), step = smoother(stepS), pivot = smoother(tau / 0.8);
  const rolling = rig.legs.map((l) => qmul(H, f.rot[w.slot[l.foot]])), foot: Q[] = [], ankle: V[] = [];
  const contact = (i: number) => add(toRoom(f.ankle[i]), qrot(rolling[i], ballOff[i]));
  foot[front] = qslerp(rolling[front], qy(toeOut(front)), pivot);
  ankle[front] = sub(contact(front), qrot(foot[front], ballOff[front]));
  const swingBall = add(mixV(contact(back), goal, step), [0, 0.07 * SCALE * Math.sin(Math.PI * stepS) ** 2, 0]);
  foot[back] = qmul(qslerp(rolling[back], qy(toeOut(back)), step), qx(12 * D * Math.sin(Math.PI * step)));
  ankle[back] = sub(swingBall, qrot(foot[back], ballOff[back]));
  // the hips: over the front foot while the other one travels, then centred between both
  const flat = (i: number, ball: V) => sub(ball, qrot(qy(toeOut(i)), ballOff[i]));
  // (he ends with more weight on the back foot, the one that stepped round: towards the column, clear of the plate)
  const centred = mul(add(flat(front, balls[front]), flat(back, goal)), 0.5), overFront = sub(flat(front, balls[front]), centred);
  const to = add([centred[0], mix(hips0[1], toRoom(rest.root)[1], 0.6), centred[2]], mul([overFront[0], 0, overFront[2]], 0.35 * Math.sin(Math.PI * stepS) ** 2 - 0.3 * step));
  const hips = [0, 1, 2].map((k) => hermite(hips0[k], hipsRate[k], to[k], STOP, tau));
  const yaw = hermite(yaw0, yawRate, face, 1.0, tau);
  const restPelvis = qmul(H, rest.rot[w.slot[rig.pelvis]]), settle = smoother(tau / STOP);
  const restLocal = (j: number) => qmul(qinv(rest.rot[w.slot[rig.parent[j]]]), rest.rot[w.slot[j]]);
  const upper = new Set([...rig.spine, rig.neck, ...rig.arms.flatMap((a) => [a.collar, a.upper, a.lower, a.hand])]);
  return {
    hips, pelvis: qmul(qy(yaw), qslerp(level(pelvis), level(restPelvis), settle)), ankle, foot,
    local: (j: number) => (upper.has(j) ? qslerp(local(j), restLocal(j), 0.8 * settle) : local(j)),
    lag,
  };
}

function evaluate(rig: Rig, t: number, still: boolean, eye: V): Pose {
  const rot: Q[] = new Array(rig.n), pos: V[] = new Array(rig.n), bind = rig.bind, w = rig.walk!;
  const offset = (i: number) => mul(sub(bind[i], bind[rig.parent[i]]), SCALE);
  const fk = (i: number, delta: Q = I) => { const p = rig.parent[i]; pos[i] = add(pos[p], qrot(rot[p], offset(i))); rot[i] = qmul(rot[p], delta); };
  const place = (i: number, q: Q) => { const p = rig.parent[i]; pos[i] = add(pos[p], qrot(rot[p], offset(i))); rot[i] = q; };
  const euler = (pitch: number, roll: number, yaw = 0) => qmul(qy(yaw), qmul(qx(pitch), qz(roll)));

  // envelopes
  const done = walkDone(w);
  // the lean carries into the first steps: he slides out still bent sideways, then straightens
  const peek = still ? 0 : ramp(t, TIMES.peek, TIMES.peekHeld) * (1 - ramp(t, TIMES.step + 0.3, TIMES.step + 1.6));
  const stare = still ? 0 : ramp(t, TIMES.peekHeld, TIMES.step) * (1 - ramp(t, TIMES.step, TIMES.step + 1.0));
  const walk = still ? 0 : ramp(t, TIMES.step + 0.3, TIMES.step + 1.2) * (1 - ramp(t, done - 0.6, done + 0.4));
  const idle = still ? 1 : ramp(t, TIMES.settled - 0.6, TIMES.settled + 1);
  const g = gesture(t, still);
  const tw = still ? { roll: 0, yaw: 0, glow: 0 } : twitch(t);
  const breath = still ? 0 : Math.sin((t / 4.2) * 2 * Math.PI);
  // standing, he is never still: the weight drifts from foot to foot (never quite periodic), he rocks a little, his
  // head and hands keep moving; it starts while he is still settling from the stop
  const life = still ? 0 : ramp(t, done + 0.5, done + 1.8);
  const sway = (0.75 * Math.sin((t / 7.3) * 2 * Math.PI) + 0.25 * Math.sin((t / 3.1) * 2 * Math.PI + 1)) * life;
  const rock = Math.sin((t / 5.3) * 2 * Math.PI + 0.7) * life;
  // a teleport: before it he tenses, hunched, hands out like claws, shaking; after it he lands crouched and rises
  const tp = still ? { pre: 0, vanish: 0, arrive: 0, n: -1 } : teleportPhase(t);
  const tense = tp.pre, crouch = Math.max(0.35 * tp.pre, tp.arrive), shake = tense * Math.sin(t * 61) * Math.sin(t * 37);
  const b = capturedBase(rig, t, still);

  // once he faces the camera, his chest keeps following the real one (it drifts and follows the pointer)
  const settled = still ? 1 : ramp(t, done + 0.6, done + 1.6);
  const toCamera = Math.atan2(eye[0] - b.hips[0], eye[2] - b.hips[2]), faceTurn = clamp(qangle(yawOf(b.pelvis), toCamera, 1) - yawOf(b.pelvis), -0.5, 0.5);
  const heading = qy(yawOf(b.pelvis));
  // he leans out towards the open edge of the column (+x in the room), whichever way his body faces
  const leanTo = norm(LEAN), lean3 = qrot(qinv(heading), leanTo), lx = lean3[0], lz = lean3[2];
  // pelvis: the captured one, plus the peek, the idle sway and the lean while waving
  const pelvisRot = qmul(b.pelvis, euler((0.6 * breath * idle + 0.8 * rock + 9 * crouch) * D, (3 * peek * lx + 3.5 * sway) * D));
  const hipsMid = mul(add(bind[rig.legs[0].hip], bind[rig.legs[1].hip]), 0.5);
  const hips = add(add(b.hips, mul(leanTo, 0.075 * SCALE * peek)), qrot(heading, [(0.035 * sway + 0.03 * WAVE * g.up * idle) * SCALE, (0.003 * breath * idle - 0.12 * crouch) * SCALE, 0.012 * SCALE * rock]));
  // never stretch a leg past its length: lower the hips smoothly where a foot is far away
  for (const [i, leg] of rig.legs.entries()) {
    const h = add(hips, qrot(pelvisRot, mul(sub(bind[leg.hip], hipsMid), SCALE)));
    const a = b.ankle[i], reach = 0.99 * (leg.l1 + leg.l2) * SCALE, dh = Math.hypot(h[0] - a[0], h[2] - a[2]);
    const limit = hips[1] - (h[1] - (a[1] + Math.sqrt(Math.max(1e-6, reach * reach - dh * dh))));
    hips[1] = -0.01 * Math.log(Math.exp(-hips[1] / 0.01) + Math.exp(-limit / 0.01));
  }
  rot[rig.root] = heading; pos[rig.root] = [hips[0], 0, hips[2]];
  rot[rig.pelvis] = pelvisRot; pos[rig.pelvis] = sub(hips, qrot(pelvisRot, mul(sub(hipsMid, bind[rig.pelvis]), SCALE)));

  // legs: two-bone IK onto the captured ankle (feet locked to the floor). The knee is not the actor's (thigh twist is
  // the noisiest part of a capture, and his legs are thin): it points along the foot and the hips, a little outwards.
  // The feet keep the actor's roll but never turn out more than 14° from the hips; a re-aimed planted foot turns
  // around its ball, so it does not slide.
  const hipsYaw = yawOf(pelvisRot);
  for (const [i, leg] of rig.legs.entries()) {
    place(leg.hip, I);
    const captured = yawOf(b.foot[i]), turnOut = qangle(hipsYaw, captured, 1) - hipsYaw;
    const aimed = hipsYaw + (leg.s === 1 ? softClamp(turnOut, -5 * D, 14 * D) : softClamp(turnOut, -14 * D, 5 * D));
    const footRot = qmul(qy(aimed - captured), b.foot[i]), ballOff = mul(leg.ball, SCALE);
    const ball = add(b.ankle[i], qrot(b.foot[i], ballOff)), ankle = sub(ball, qrot(footRot, ballOff));
    const h = pos[leg.hip], l1 = leg.l1 * SCALE, l2 = leg.l2 * SCALE;
    const reach = sub(ankle, h), d = clamp(len(reach), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995), dir = norm(reach);
    const pole = fwd(qangle(aimed, hipsYaw, 0.4) + leg.s * 7 * D), out = norm(sub(pole, mul(dir, dot(pole, dir))));
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const knee = add(h, add(mul(dir, l1 * cosA), mul(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
    rot[leg.hip] = qlook(leg.thigh, [0, 0, 1], sub(knee, h), out);
    place(leg.knee, qlook(leg.shin, [0, 0, 1], sub(ankle, knee), out));
    place(leg.foot, footRot);
    fk(leg.toe, b.local(leg.toe));
  }
  // spine: the captured one, bent sideways for the peek, breathing, leaning into the wave (away from the plate beside
  // him), balancing the hips' drift (the chest stays over the feet) and turning a touch with each swing of the wave
  const lean = -2.5 * D * WAVE * g.up * idle, waveTurn = 1.8 * D * WAVE * g.wave * idle;
  fk(rig.spine[0], qmul(b.local(rig.spine[0]), euler((7 * peek * lz - 0.5 * rock + 6 * crouch + 3 * tense) * D, (-7 * peek * lx - 2.6 * sway + 2.5 * shake) * D, 0.1 * faceTurn * settled)));
  fk(rig.spine[1], qmul(b.local(rig.spine[1]), euler((1.1 * breath + 10 * peek * lz + 7 * crouch + 4 * tense) * D, (-10 * peek * lx - 1.6 * sway) * D + lean, 0.12 * faceTurn * settled + waveTurn)));
  fk(rig.spine[2], qmul(b.local(rig.spine[2]), euler((1.1 * breath + 10 * peek * lz + 6 * crouch + 4 * tense) * D, (-10 * peek * lx - 0.5 * sway) * D + lean, 3 * D * WAVE * g.up * idle + 0.12 * faceTurn * settled + waveTurn + 2 * D * shake)));
  const chest = rot[rig.spine[2]];
  fk(rig.tie);

  // arms: the captured swing (loose wrists included), held a little further out from the costume's belly and thighs
  const tubes: Tube[] = [
    ...rig.legs.map((leg) => ({ a: pos[leg.hip], b: pos[leg.knee], q: rot[leg.hip], s: leg.s, ...THIGH })),
    { a: pos[rig.pelvis], b: pos[rig.spine[2]], q: rot[rig.spine[1]], s: 1, ...BELLY },
  ];
  for (const arm of rig.arms) {
    const s = arm.s, raised = s === WAVE ? g.up * idle : 0, other = s === WAVE ? 0 : g.up * idle;
    // a hanging arm is a pendulum: it swings a little behind the body's drift, the elbow softens and the fingers drum
    // now and then (little finger first); while the other hand waves this one drifts forward, the elbow bent
    const pend = ((3 * Math.sin((t / 7.3) * 2 * Math.PI - 1.2) + 1.5 * Math.sin((t / 3.1) * 2 * Math.PI + 0.2 + s)) * life + 6 * other) * D;
    const flex = ((10 + 3 * breath + 4 * Math.sin((t / 5.9) * 2 * Math.PI + s)) * life + 14 * other) * D * (1 - raised);
    const hinge = norm(cross(arm.upperDir, [0, 0, 1]));
    const drum = (k: number) => {
      const u = ((t + (s === 1 ? 0 : 1.7)) % 3.9) - 0.5 - (3 - Math.min(k, 3)) * 0.09;
      return u > 0 && u < 0.45 ? Math.sin((u / 0.45) * Math.PI) ** 2 * (k === 4 ? 0.3 : 1) : 0;
    };
    fk(arm.collar, qmul(b.local(arm.collar), qmul(qz(s * (10 * raised + 1.2 * breath * idle + 12 * tense) * D), qy(-s * 4 * raised * D))));
    const trail = b.lag(arm.lower), swingBack = 2 * Math.acos(clamp(Math.abs(trail[3]), 0, 1));
    // fingers: loosely curled and never frozen, open and fanned for the wave but trailing the hand (each a little later
    // than the one before), rippling closed and open for the beckon (index first)
    const raisedWave = s === WAVE ? g.amp * raised * (1 - g.beckon) : 0, spread = (9 * raised * (1 - g.beckon) + 14 * tense) * D;
    // relaxed fingers curl a little more from the index to the little finger, flex as the hand is dragged, and keep
    // moving a little on their own
    const RELAXED = [0.2, 0.28, 0.34, 0.4, 0.5];
    const curls = arm.fingers.map((f, k) => {
      let c = mix(RELAXED[k] + 0.05 * walk + 0.6 * swingBack, 0.08 * (k === 4 ? 0.45 : 1), raised);
      if (!still) c += (0.05 + 0.03 * walk) * Math.sin(t * (1.7 + 1.1 * walk) + k * 0.9 + s) * (1 - raised) + 0.32 * drum(k) * life * (1 - raised);
      c += 0.1 * raisedWave * (0.6 + Math.sin(g.phase - 1.1 - k * 0.45)) * (k === 4 ? 0.5 : 1);
      c = mix(c, 0.45, tense); // claws
      if (g.beckon > 0 && s === WAVE && k < 4) {
        const phase = ((t - TIMES.beckon) / 0.9 - k * 0.07) * 2 * Math.PI;
        c = mix(c, 0.15 + 0.62 * (0.5 - 0.5 * Math.cos(phase)), g.beckon);
      }
      const fan = k === 4 ? 0 : (1.5 - k) * spread * 0.7 * (1 + 0.3 * raisedWave * Math.sin(g.phase - 0.7));
      return [qmul(qaxis(f.spread, fan * s), qaxis(f.axis, c * (k === 4 ? 0.7 : 1) * 55 * D)), qaxis(f.axis, c * 75 * D), qaxis(f.axis, c * 55 * D)];
    });
    const fingers = () => arm.fingers.forEach((f, k) => f.joints.forEach((j, n) => fk(j, curls[k][n])));
    // The hand hangs relaxed (the actor's hand data is coarse) and trails the forearm's swing, then catches up; while
    // he leans out, the arm on that side swings away from the bending body. The costume's thighs and belly are far
    // wider than the actor's: wherever the hand would brush them, the whole arm swings out just enough to pass by.
    const hang = (away: number) => {
      fk(arm.upper, qmul(qx(-pend), qmul(b.local(arm.upper), qz(s * (ARM_OUT + (8 * peek + 16 * tense + 10 * crouch) * D + away)))));
      fk(arm.lower, qmul(qaxis(hinge, flex), b.local(arm.lower)));
      fk(arm.hand, qslerp(b.local(arm.hand), qaxis(cross(arm.handDir, arm.palm), 14 * D), 0.7));
      rot[arm.hand] = qmul(qslerp(I, trail, 0.75 * (1 - raised)), rot[arm.hand]);
      fingers();
      return handGap(rig, arm, pos, rot, tubes);
    };
    const gap = hang(0), slope = smax(0.15, (hang(4 * D) - gap) / (4 * D), 0.05);
    const away = (HAND_GAP.soft * Math.log1p(Math.exp((HAND_GAP.min - gap) / HAND_GAP.soft))) / slope;
    hang(35 * D * Math.tanh(away / (35 * D)));
    if (raised > 0) {
      // The wave: elbow out and forward, forearm upright, the open palm towards the camera beside the cocked head, the
      // fingers level with his eyes. Upright in the room, not along his hunched chest (that would tip the hand
      // forward, down to his chin); the chest only turns it.
      const shoulder = pos[arm.upper], l1 = arm.l1 * SCALE, l2 = arm.l2 * SCALE, upright = qy(yawOf(chest));
      const e: V = [ELBOW[0] * s, ELBOW[1], ELBOW[2]], up: V = [FOREARM[0] * s, FOREARM[1], FOREARM[2]];
      const swingA = (10 + 12 * g.wave) * D * Math.min(1, g.up * 3);
      const side: V = [s, 0, 0], fore = norm(add(mul(norm(up), Math.cos(swingA)), mul(side, Math.sin(swingA))));
      const target = add(shoulder, qrot(upright, add(add(mul(norm(e), l1), mul(fore, l2)), [0, (1 - g.lift) * -0.06 * SCALE, 0])));
      const pole = qrot(upright, norm([0.72 * s, -0.66, 0]));
      const reach = sub(target, shoulder), d = clamp(len(reach), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999), dir = norm(reach);
      const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), out = norm(sub(pole, mul(dir, dot(pole, dir))));
      const elbowP = add(shoulder, add(mul(dir, l1 * cosA), mul(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
      // the hand lags the forearm (it is dragged, then whips): its own angle runs a little behind and further
      const lagged = gesture(t - 0.11, still), lag = (12 + 19 * lagged.wave) * D * Math.min(1, lagged.up * 3);
      const fingersUp = norm(add(mul(norm(up), Math.cos(lag)), mul(side, Math.sin(lag))));
      const palmOut = norm(qrot(qx(-(14 + 34 * g.beckon) * D), [0.12 * s, 0, 1]));
      const k = clamp(g.lift * raised, 0, 1.15);
      place(arm.upper, qslerp(rot[arm.upper], qlook(arm.upperDir, arm.pole, sub(elbowP, shoulder), out), k));
      place(arm.lower, qslerp(rot[arm.lower], qlook(arm.lowerDir, arm.pole, sub(target, elbowP), out), k));
      place(arm.hand, qslerp(rot[arm.hand], qlook(arm.handDir, arm.palm, qrot(upright, fingersUp), qrot(upright, palmOut)), raised * (2 - raised)));
      fingers();
    }
    // the shoulder helper follows the arm's swing without its twist
    const rel = qmul(qinv(rot[arm.collar]), rot[arm.upper]);
    place(arm.twist, qmul(rot[arm.collar], qmul(rel, qinv(qtwist(rel, arm.upperDir)))));
    // half of the wrist's twist goes into the forearm helper, so the sleeve does not pinch
    const wristRel = qmul(qinv(rot[arm.lower]), rot[arm.hand]);
    place(arm.forearmTwist, qmul(rot[arm.lower], qslerp(I, qtwist(wristRel, arm.lowerDir), 0.5)));
  }

  // head: always seeking the real camera, chin a little down, cocked; the neck takes part of the turn
  fk(rig.neck, b.local(rig.neck));
  fk(rig.head, b.local(rig.head));
  const headFk = rot[rig.head];
  let aim = norm(sub(add(eye, [0, -1.4 - 1.4 * walk, 0]), pos[rig.head]));
  const local = qrot(qinv(chest), aim);
  // standing, the gaze never quite locks: small slow glances around the camera, a nod with each swing of the wave
  const glance = (2.2 * Math.sin((t / 4.1) * 2 * Math.PI) + 1.2 * Math.sin((t / 2.3) * 2 * Math.PI + 2)) * D * life;
  const nod = (1.5 * Math.sin((t / 3.7) * 2 * Math.PI + 1) * life + 1.5 * g.wave * idle - 26 * tp.arrive * tp.arrive) * D;
  const lyaw = clamp(Math.atan2(local[0], local[2]), -88 * D, 88 * D) + glance, lpitch = clamp(Math.asin(clamp(local[1], -1, 1)), -40 * D, 55 * D) + nod;
  aim = qrot(chest, [Math.sin(lyaw) * Math.cos(lpitch), Math.sin(lpitch), Math.cos(lyaw) * Math.cos(lpitch)]);
  aim = qrot(qy(tw.yaw), aim);
  const tilt = (22 * peek + 10 * stare + WAVE * (13 * g.up * idle * (1 - g.beckon) - 17 * g.beckon) + 7 * Math.sin((t / 9.1) * 2 * Math.PI) * idle * (1 - g.up)) * D
    + tw.roll;
  const headUp = qrot(qaxis(aim, -tilt), [0, 1, 0]);
  const want = qlook([0, 0, 1], [0, 1, 0], aim, headUp);
  const turn = qmul(want, qinv(headFk));
  rot[rig.neck] = qmul(qslerp(I, turn, 0.38), rot[rig.neck]);
  place(rig.head, want);

  // ears at rest on the head (they sag a hair as he breathes); their springs are added in writeGlitchtrapPose
  const earBase = qx(-1.5 * D * breath);
  for (const ear of rig.ears) { fk(ear.a, earBase); fk(ear.b); }

  for (const i of rig.ends) { rot[i] = rot[rig.parent[i]]; pos[i] = pos[rig.parent[i]]; }
  // the eyes light up as he leans out; they flare during a glitch
  const glow = still ? 1 : clamp01((t - 0.2) / 0.9) * (1 + 0.8 * tw.glow);
  return { rot, pos, glow, earBase };
}

// ---------- ears ----------
// Each ear segment is a damped torsional spring in the head's frame. The head's motion pushes it (the inertia of the
// ear: linear acceleration, angular acceleration, centripetal), gravity pulls it when the head tilts, and the tip is
// also whipped by its base. Integrated frame by frame in small steps; this is the pose's only state.
// push ≈ 1.5 is a uniform rod hinged at its base; the costume's tips are a little floppier
const EAR = [{ hz: 2.6, damping: 0.26, push: 1.8, gravity: 0.12 }, { hz: 2.0, damping: 0.22, push: 2.4, gravity: 0.2 }];
export class EarSprings {
  bend: V[] = []; speed: V[] = []; base: V[] = []; last = -1;
  constructor() { this.reset(); }
  reset() { this.bend = [0, 1, 2, 3].map(() => [0, 0, 0]); this.speed = [0, 1, 2, 3].map(() => [0, 0, 0]); this.base = [[0, 0, 0], [0, 0, 0]]; this.last = -1; }
  // rotation of segment k, saturating softly (a costume ear bends a lot but never folds over)
  turn(k: number): Q { const b = this.bend[k], a = len(b); return a < 1e-6 ? I : qaxis(b, 0.42 * Math.tanh(a / 0.42)); }
}
const rotvec = (q: Q): V => { const w = clamp(Math.abs(q[3]), 0, 1), s = q[3] < 0 ? -1 : 1, a = 2 * Math.acos(w), k = a < 1e-6 ? 2 : a / Math.sin(a / 2); return [q[0] * k * s, q[1] * k * s, q[2] * k * s]; };
function stepEars(ears: EarSprings, rig: Rig, t: number, head: Q, spin: V, spinRate: V, accel: V) {
  let dt = t - ears.last;
  if (ears.last < 0 || dt < 0 || dt > 0.3) { ears.reset(); dt = 0; }
  ears.last = t;
  if (dt <= 0) return;
  const inv = qinv(head), w = qrot(inv, spin), alpha = qrot(inv, spinRate), lin = qrot(inv, accel);
  const tilt = sub(qrot(inv, [0, -9.81, 0]), [0, -9.81, 0]);
  const steps = Math.ceil(dt * 240), h = dt / steps;
  for (let n = 0; n < steps; n++) rig.ears.forEach((ear, e) => ear.seg.forEach((seg, j) => {
    const k = e * 2 + j, P = EAR[j], om = 2 * Math.PI * P.hz, r = mul(seg.r, SCALE), u = seg.u;
    // a glitch snaps the head far faster than any muscle could: past ~7 m/s² the fabric's stiffness takes over
    const inertia = add(add(lin, cross(alpha, r)), cross(w, cross(w, r))), strength = len(inertia);
    const felt = add(mul(inertia, strength > 1e-6 ? -7 * Math.tanh(strength / 7) / strength : 0), mul(tilt, P.gravity));
    let push = mul(cross(u, felt), P.push / (seg.l * SCALE));
    if (j === 1) push = sub(push, mul(ears.base[e], 0.4));
    const acc = sub(sub(push, mul(ears.bend[k], om * om)), mul(ears.speed[k], 2 * P.damping * om));
    const flat = (v: V) => sub(v, mul(u, dot(v, u))); // bending only, no twist along the ear
    ears.speed[k] = flat(add(ears.speed[k], mul(acc, h)));
    ears.bend[k] = flat(add(ears.bend[k], mul(ears.speed[k], h)));
    if (j === 0) ears.base[e] = acc;
  }));
}
function placeEars(rig: Rig, pose: Pose, ears: EarSprings) {
  const fk = (i: number, delta: Q) => {
    const p = rig.parent[i];
    pose.pos[i] = add(pose.pos[p], qrot(pose.rot[p], mul(sub(rig.bind[i], rig.bind[p]), SCALE)));
    pose.rot[i] = qmul(pose.rot[p], delta);
  };
  rig.ears.forEach((ear, e) => {
    const a = ears.turn(e * 2), b = ears.turn(e * 2 + 1);
    fk(ear.a, qmul(a, pose.earBase));
    // the tip's bend is held in the head's frame: express it in the base segment's frame
    fk(ear.b, qmul(qinv(a), qmul(b, a)));
  });
  for (const i of rig.ends) { pose.rot[i] = pose.rot[rig.parent[i]]; pose.pos[i] = pose.pos[rig.parent[i]]; }
}

// Skinning matrices (column-major, world space, scale included) followed by [eye glow, seconds, glitch, vanish]. With `ears`, the
// ears move as springs driven by the head (step it with every frame's time; a jump in time resets it).
// The performance at time t where he is now: evaluated where the walk left him, with the camera brought along (so he
// still looks at it), then moved rigidly to his place.
function placed(rig: Rig, t: number, reduced: boolean, eye: V) {
  const sp = reduced ? null : spotAt(rig, teleportPhase(t).n);
  return { sp, eye: sp ? fromSpot(sp, eye) : eye };
}
function moveTo(sp: Spot | null, pose: Pose) {
  if (!sp) return pose;
  const q = qy(sp.yaw);
  for (let i = 0; i < pose.pos.length; i++) { pose.pos[i] = toSpot(sp, pose.pos[i]); pose.rot[i] = qmul(q, pose.rot[i]); }
  return pose;
}
function posed(rig: Rig, seconds: number, reduced: boolean, eye: V) {
  const t = Math.max(0, seconds), at = placed(rig, t, reduced, eye);
  return moveTo(at.sp, evaluate(rig, t, reduced, at.eye));
}
export function writeGlitchtrapPose(out: Float32Array, rig: Rig, seconds: number, reduced: boolean, eye: number[], ears?: EarSprings) {
  const t = Math.max(0, seconds), at = placed(rig, t, reduced, eye), pose = evaluate(rig, t, reduced, at.eye);
  if (ears && !reduced) {
    // the head's motion right now, from the same pure performance a moment earlier
    const h = 1 / 120, p1 = evaluate(rig, Math.max(0, t - h), false, at.eye), p2 = evaluate(rig, Math.max(0, t - 2 * h), false, at.eye);
    const R0 = pose.rot[rig.head], R1 = p1.rot[rig.head], R2 = p2.rot[rig.head];
    const spin = mul(rotvec(qmul(R0, qinv(R1))), 1 / h), before = mul(rotvec(qmul(R1, qinv(R2))), 1 / h);
    const accel = mul(add(sub(pose.pos[rig.head], mul(p1.pos[rig.head], 2)), p2.pos[rig.head]), 1 / (h * h));
    stepEars(ears, rig, t, R0, spin, mul(sub(spin, before), 1 / h), accel);
    placeEars(rig, pose, ears);
  }
  moveTo(at.sp, pose);
  for (let i = 0; i < rig.n; i++) {
    const q = pose.rot[i], b = rig.bind[i];
    const x = qrot(q, [SCALE, 0, 0]), y = qrot(q, [0, SCALE, 0]), z = qrot(q, [0, 0, SCALE]);
    const p = sub(pose.pos[i], add(add(mul(x, b[0]), mul(y, b[1])), mul(z, b[2])));
    out.set([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, p[0], p[1], p[2], 1], i * 16);
  }
  // (with reduced motion the effects' clock stands still: no scan lines running, no blinking)
  out.set([pose.glow, reduced ? 30 : t, reduced ? 0 : glitchAt(t), reduced ? 0 : teleportPhase(t).vanish], rig.n * 16);
}

// where the ankles are (for tests): world positions of the two foot joints
export function feetAt(rig: Rig, seconds: number, reduced: boolean, eye: number[]) {
  const p = posed(rig, seconds, reduced, eye);
  return rig.legs.map((l) => p.pos[l.foot]);
}
export function headAt(rig: Rig, seconds: number, reduced: boolean, eye: number[]) {
  const p = posed(rig, seconds, reduced, eye);
  return { pos: p.pos[rig.head], forward: qrot(p.rot[rig.head], [0, 0, 1]) };
}
// where his chest is (world): the green glow's source
export function chestAt(rig: Rig, seconds: number, reduced: boolean, eye: number[]) {
  return posed(rig, seconds, reduced, eye).pos[rig.spine[2]];
}
// his place at time t for the lamp (engine.ts): where his chest is once he stands there, and how the place is turned
// from where the walk left him
const rests = new WeakMap<Rig, V>();
export function placeAt(rig: Rig, seconds: number, reduced: boolean) {
  let rest = rests.get(rig);
  if (!rest) { rest = evaluate(rig, 0, true, [CAMERA[0], 2.75, CAMERA[1]]).pos[rig.spine[2]]; rests.set(rig, rest); }
  const t = Math.max(0, seconds), tp = reduced ? null : teleportPhase(t), sp = tp ? spotAt(rig, tp.n) : null;
  // the camera moves on to his next place as soon as his image starts to collapse
  const k = tp ? teleportNear(t) : null, next = k && t - k.at > -0.32 && tp && tp.n < k.n;
  const view = SPOTS[!tp ? 0 : next ? spotOf(k!.n) : tp.n < 0 ? 0 : spotOf(tp.n)];
  return { chest: sp ? toSpot(sp, rest) : rest, yaw: sp ? sp.yaw : 0, framing: { desk: view.desk, phone: view.phone } };
}
export const STAGE = { START, HEADING, CAMERA, SPOTS };
