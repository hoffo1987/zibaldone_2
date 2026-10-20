// Glitchtrap's performance behind the podium, as a function of time: the same pose feeds the main view, the shadow
// map and every reflection. The walk is real: a captured sneaking walk (CMU motion capture, subject 139) retargeted onto
// this skeleton, with the feet locked to the floor. On top of it, the gestures that make him Glitchtrap: the lean out
// from behind the column (Help Wanted's Pizza Party ending), the slow open-hand wave beside a cocked head and the
// "come here" ripple of the fingers (Dead by Daylight's lobby), the head that always seeks the real camera, sudden
// glitches, breathing, and ears that are damped springs pushed by the head (EarSprings, the only state).
//
// Timeline (seconds after the reveal): hidden behind the column he leans out until one glowing eye shows (0.3–2.3),
// slides out and pads diagonally towards the hall (2.3–7.7), settles facing the camera, waves (8.7–12.1), beckons
// (12.1–13.9), lowers the hand and idles, waving again every fifteen seconds (from 21).
// Reduced motion: the final pose with the hand up, still.
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
// The room is in metres; the camera sits near (0, 2.75, 10.2) looking towards -z. He starts hidden behind the second
// column of the left aisle and walks out towards the hall along HEADING; the captured walk decides where he stops
// (beside the back corner of the dais) and already turns him towards the camera at both ends.
export const SCALE = 1.42;
// the actor is slimmer than the costume: his arms hang this much further out, clear of the belly and the thighs
const ARM_OUT = 14 * D;
const START = [-6.75, -3.75], HEADING = 48.4 * D;
const fwd = (yaw: number): V => [Math.sin(yaw), 0, Math.cos(yaw)];
const yawOf = (q: Q) => { const f = qrot(q, [0, 0, 1]); return Math.atan2(f[0], f[2]); };
// from the walk's frame (bind metres, +z along the walk) to the room
const H = qy(HEADING);
const toRoom = (p: V): V => { const r = qrot(H, mul(p, SCALE)); return [START[0] + r[0], r[1], START[1] + r[2]]; };

// ---------- the captured walk ----------
// A real sneaking walk (CMU motion capture, subject 139, "Sneaking"), retargeted offline onto this skeleton by
// scripts/bake-glitchtrap-walk.cjs: 60 fps, from standing still to five padded steps and a slow stop. Per frame: the
// midpoint of the hips, the two ankles (balls of the feet locked to the floor while planted) and the global rotation
// of every mapped joint.
export type WalkMeta = { version: number; fps: number; frames: number; stride: number; joints: string[] };
type Walk = { fps: number; frames: number; stride: number; slot: Int16Array; joints: number[]; data: Float32Array; duration: number; end: V };
export function attachWalk(rig: Rig, meta: WalkMeta, data: Float32Array) {
  if (meta.version !== 1 || data.length !== meta.frames * meta.stride || meta.stride !== 9 + meta.joints.length * 4) throw new Error('Glitchtrap: camminata incompleta');
  const joints = meta.joints.map((name) => { const i = rig.names.indexOf(name); if (i < 0) throw new Error(`Glitchtrap: joint ${name}`); return i; });
  const slot = new Int16Array(rig.n).fill(-1);
  joints.forEach((j, k) => (slot[j] = k));
  const last = (meta.frames - 1) * meta.stride;
  rig.walk = { fps: meta.fps, frames: meta.frames, stride: meta.stride, slot, joints, data, duration: (meta.frames - 1) / meta.fps, end: toRoom([data[last], 0, data[last + 2]]) };
}
type Frame = { root: V; ankle: V[]; rot: Q[] };
function sampleWalk(w: Walk, time: number): Frame {
  const x = clamp(time * w.fps, 0, w.frames - 1), k = Math.min(w.frames - 2, Math.floor(x)), u = x - k, d = w.data;
  const A = k * w.stride, B = A + w.stride, P0 = Math.max(0, k - 1) * w.stride, P3 = Math.min(w.frames - 1, k + 2) * w.stride;
  // positions on a Catmull-Rom curve through the frames: smooth speed at any refresh rate
  const u2 = u * u, u3 = u2 * u;
  const cr = (o: number) => 0.5 * (2 * d[A + o] + (d[B + o] - d[P0 + o]) * u + (2 * d[P0 + o] - 5 * d[A + o] + 4 * d[B + o] - d[P3 + o]) * u2 + (3 * d[A + o] - d[P0 + o] - 3 * d[B + o] + d[P3 + o]) * u3);
  const v = (o: number): V => [cr(o), cr(o + 1), cr(o + 2)];
  const q = (o: number): Q => qslerp([d[A + o], d[A + o + 1], d[A + o + 2], d[A + o + 3]], [d[B + o], d[B + o + 1], d[B + o + 2], d[B + o + 3]], u);
  return { root: v(0), ankle: [v(3), v(6)], rot: w.joints.map((_, j) => q(9 + j * 4)) };
}

export const TIMES = { peek: 0.3, peekHeld: 1.3, step: 2.3, settled: 8.7, wave: 9.4, beckon: 12.1, lower: 13.9, idle: 15.0, rewave: 21, every: 15 };
// sudden glitches of the head: [time, roll, yaw]
const TWITCHES: number[][] = [[1.85, -16, 7], [10.55, 13, -6], [13.1, -11, 4]];
function twitch(t: number) {
  let roll = 0, yaw = 0, glow = 0;
  const events = [...TWITCHES];
  if (t > 18) { const k = Math.floor((t - 18) / 11.3); for (const j of [k - 1, k]) if (j >= 0) events.push([18 + j * 11.3 + 4.1, j % 2 ? 12 : -14, j % 2 ? -5 : 6]); }
  for (const [at, r, y] of events) {
    const u = t - at;
    if (u < 0 || u > 0.7) continue;
    const e = u < 0.06 ? smoother(u / 0.06) : u < 0.16 ? 1 : 1 - smoother((u - 0.16) / 0.5);
    roll += r * e; yaw += y * e; glow = Math.max(glow, u < 0.16 ? 1 : 0);
  }
  return { roll: roll * D, yaw: yaw * D, glow };
}

// the left hand's gestures: weight of the raised hand, wave phase and strength, finger ripple; repeated in the idle
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

// ---------- evaluation ----------
type Pose = { rot: Q[]; pos: V[]; glow: number; earBase: Q };
type Base = { hips: V; pelvis: Q; ankle: V[]; foot: Q[]; local: (j: number) => Q };
// the captured pose at time t: standing before the walk, the walk itself, then the last frame with the hunch eased off,
// the weight settled between the feet and the back heel down
// the captured clip starts while the actor already moves: it is eased in, so nothing jumps when the walk begins
const EASE_IN = 0.5;
const walkTime = (u: number) => (u <= 0 ? 0 : u < EASE_IN ? (u * u) / (2 * EASE_IN) : u - EASE_IN / 2);
const walkDone = (w: Walk) => TIMES.step + w.duration + EASE_IN / 2;
function capturedBase(rig: Rig, t: number, still: boolean): Base {
  const w = rig.walk!, done = walkDone(w);
  const f = sampleWalk(w, still ? w.duration : walkTime(t - TIMES.step));
  const local = (j: number) => qmul(qinv(f.rot[w.slot[rig.parent[j]]]), f.rot[w.slot[j]]);
  const base: Base = { hips: toRoom(f.root), pelvis: qmul(H, f.rot[w.slot[rig.pelvis]]), ankle: f.ankle.map(toRoom), foot: rig.legs.map((l) => qmul(H, f.rot[w.slot[l.foot]])), local };
  const s = still ? 0.8 : 0.8 * ramp(t, done - 0.1, done + 1.1);
  if (s <= 0) return base;
  const rest = sampleWalk(w, 0);
  const restLocal = (j: number) => qmul(qinv(rest.rot[w.slot[rig.parent[j]]]), rest.rot[w.slot[j]]);
  const upper = new Set([...rig.spine, rig.neck, ...rig.arms.flatMap((a) => [a.collar, a.upper, a.lower, a.hand])]);
  const restPelvis = qmul(H, rest.rot[w.slot[rig.pelvis]]);
  const pelvisRest = qmul(qy(yawOf(base.pelvis) - yawOf(restPelvis)), restPelvis);
  const feetMid = mul(add(base.ankle[0], base.ankle[1]), 0.5), stand = toRoom(rest.root)[1];
  const flat = base.foot.map((q) => qslerp(q, qy(yawOf(q)), s / 0.8));
  return {
    hips: [mix(base.hips[0], feetMid[0], 0.55 * s), mix(base.hips[1], stand, 0.6 * s), mix(base.hips[2], feetMid[2], 0.55 * s)],
    pelvis: qslerp(base.pelvis, pelvisRest, s),
    // the back heel comes down: the foot turns flat around the ball, which stays where it is
    ankle: base.ankle.map((a, i) => { const ball = mul(rig.legs[i].ball, SCALE); return sub(add(a, qrot(base.foot[i], ball)), qrot(flat[i], ball)); }),
    foot: flat,
    local: (j: number) => (upper.has(j) ? qslerp(local(j), restLocal(j), s) : local(j)),
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
  const sway = still ? 0 : Math.sin((t / 7.3) * 2 * Math.PI) * idle;
  const b = capturedBase(rig, t, still);

  // the walk is kept as captured; once he has stopped, his hips and then his chest turn towards the camera
  const settled = still ? 1 : ramp(t, done - 0.2, done + 1.4);
  const toCamera = Math.atan2(eye[0] - b.hips[0], eye[2] - b.hips[2]), faceTurn = qangle(yawOf(b.pelvis), toCamera, 1) - yawOf(b.pelvis);
  const heading = qy(yawOf(b.pelvis) + 0.5 * faceTurn * settled);
  // he leans out towards the open edge of the column (+x in the room), whichever way his body faces
  const leanTo = norm([1, 0, 0.2]), lean3 = qrot(qinv(heading), leanTo), lx = lean3[0], lz = lean3[2];
  // pelvis: the captured one, plus the peek, the idle sway and the lean while waving
  const pelvisRot = qmul(qy(0.5 * faceTurn * settled), qmul(b.pelvis, euler(0.6 * breath * idle * D, (3 * peek * lx + 2 * sway) * D)));
  const hipsMid = mul(add(bind[rig.legs[0].hip], bind[rig.legs[1].hip]), 0.5);
  const hips = add(add(b.hips, mul(leanTo, 0.075 * SCALE * peek)), qrot(heading, [(0.015 * sway - 0.03 * g.up * idle) * SCALE, 0.003 * SCALE * breath * idle, 0]));
  // never stretch a leg past its length: lower the hips smoothly where a foot is far away
  for (const [i, leg] of rig.legs.entries()) {
    const h = add(hips, qrot(pelvisRot, mul(sub(bind[leg.hip], hipsMid), SCALE)));
    const a = b.ankle[i], reach = 0.99 * (leg.l1 + leg.l2) * SCALE, dh = Math.hypot(h[0] - a[0], h[2] - a[2]);
    const limit = hips[1] - (h[1] - (a[1] + Math.sqrt(Math.max(1e-6, reach * reach - dh * dh))));
    hips[1] = -0.01 * Math.log(Math.exp(-hips[1] / 0.01) + Math.exp(-limit / 0.01));
  }
  rot[rig.root] = heading; pos[rig.root] = [hips[0], 0, hips[2]];
  rot[rig.pelvis] = pelvisRot; pos[rig.pelvis] = sub(hips, qrot(pelvisRot, mul(sub(hipsMid, bind[rig.pelvis]), SCALE)));

  // spine: the captured one, bent sideways for the peek, breathing, leaning away from the raised hand
  const lean = 2.5 * D * g.up * idle;
  fk(rig.spine[0], qmul(b.local(rig.spine[0]), euler(7 * D * peek * lz, -7 * D * peek * lx - 1.5 * D * sway, 0.1 * faceTurn * settled)));
  fk(rig.spine[1], qmul(b.local(rig.spine[1]), euler((0.8 * breath + 10 * peek * lz) * D, -10 * D * peek * lx - D * sway + lean, 0.12 * faceTurn * settled)));
  fk(rig.spine[2], qmul(b.local(rig.spine[2]), euler((0.8 * breath + 10 * peek * lz) * D, -10 * D * peek * lx + lean, 3 * D * g.up * idle + 0.12 * faceTurn * settled)));
  const chest = rot[rig.spine[2]];
  fk(rig.tie);

  // arms: the captured swing (loose wrists included), held a little further out from the costume's belly and thighs
  for (const arm of rig.arms) {
    const s = arm.s, raised = s === 1 ? g.up * idle : 0;
    fk(arm.collar, qmul(b.local(arm.collar), qmul(qz(s * (10 * raised + 1.2 * breath * idle) * D), qy(-s * 4 * raised * D))));
    // while he leans out, the arm on that side swings away from the bending body instead of sinking into it
    fk(arm.upper, qmul(b.local(arm.upper), qz(s * (ARM_OUT + (s === 1 ? 24 : 6) * D * peek))));
    fk(arm.lower, b.local(arm.lower));
    fk(arm.hand, b.local(arm.hand));
    if (raised > 0) {
      // the wave: upper arm out to the side, forearm upright, open palm towards the camera beside the cocked head
      const shoulder = pos[arm.upper], l1 = arm.l1 * SCALE, l2 = arm.l2 * SCALE;
      // (close beside the face: the second place's plate floats just to his left on most screens)
      const e: V = [0.8 * s, -0.26, 0.54], up: V = [0, 1, 0.15];
      const swingA = (8 + 22 * g.wave) * D * Math.min(1, g.up * 3);
      const side: V = [s, 0, 0], fore = norm(add(mul(norm(up), Math.cos(swingA)), mul(side, Math.sin(swingA))));
      const target = add(shoulder, qrot(chest, add(add(mul(norm(e), l1), mul(fore, l2)), [0, (1 - g.lift) * -0.06 * SCALE, 0])));
      const pole = qrot(chest, norm([0.72 * s, -0.66, 0]));
      const reach = sub(target, shoulder), d = clamp(len(reach), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999), dir = norm(reach);
      const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), out = norm(sub(pole, mul(dir, dot(pole, dir))));
      const elbowP = add(shoulder, add(mul(dir, l1 * cosA), mul(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
      // the hand lags the forearm (it is dragged, then whips): its own angle runs a little behind and further
      const lagged = gesture(t - 0.11, still), lag = (10 + 30 * lagged.wave) * D * Math.min(1, lagged.up * 3);
      const fingersUp = norm(add(mul(norm(up), Math.cos(lag)), mul(side, Math.sin(lag))));
      const palmOut = norm(qrot(qx(-(14 + 34 * g.beckon) * D), [0.12 * s, 0, 1]));
      const k = clamp(g.lift * raised, 0, 1.15);
      place(arm.upper, qslerp(rot[arm.upper], qlook(arm.upperDir, arm.pole, sub(elbowP, shoulder), out), k));
      place(arm.lower, qslerp(rot[arm.lower], qlook(arm.lowerDir, arm.pole, sub(target, elbowP), out), k));
      place(arm.hand, qslerp(rot[arm.hand], qlook(arm.handDir, arm.palm, qrot(chest, fingersUp), qrot(chest, palmOut)), clamp01(raised * 1.2)));
    }
    // the shoulder helper follows the arm's swing without its twist
    const rel = qmul(qinv(rot[arm.collar]), rot[arm.upper]);
    place(arm.twist, qmul(rot[arm.collar], qmul(rel, qinv(qtwist(rel, arm.upperDir)))));
    // half of the wrist's twist goes into the forearm helper, so the sleeve does not pinch
    const wristRel = qmul(qinv(rot[arm.lower]), rot[arm.hand]);
    place(arm.forearmTwist, qmul(rot[arm.lower], qslerp(I, qtwist(wristRel, arm.lowerDir), 0.5)));
    // fingers: loosely curled and never frozen, open and fanned for the wave but trailing the hand (each a little later
    // than the one before), rippling closed and open for the beckon (index first)
    const raisedWave = s === 1 ? g.amp * raised * (1 - g.beckon) : 0, spread = 9 * D * raised * (1 - g.beckon);
    const curl = mix(0.4 + 0.1 * walk, 0.08, raised);
    arm.fingers.forEach((f, k) => {
      let c = curl * (k === 4 ? 0.45 : 1) + (k === 3 ? 0.06 : 0);
      if (!still) c += (0.05 + 0.04 * walk) * Math.sin(t * (1.7 + 1.1 * walk) + k * 0.9 + s) * (1 - raised);
      c += 0.1 * raisedWave * (0.6 + Math.sin(g.phase - 1.1 - k * 0.45)) * (k === 4 ? 0.5 : 1);
      if (g.beckon > 0 && s === 1 && k < 4) {
        const phase = ((t - TIMES.beckon) / 0.9 - k * 0.07) * 2 * Math.PI;
        c = mix(c, 0.15 + 0.62 * (0.5 - 0.5 * Math.cos(phase)), g.beckon);
      }
      const fan = k === 4 ? 0 : (1.5 - k) * spread * 0.7 * (1 + 0.3 * raisedWave * Math.sin(g.phase - 0.7));
      const base = qmul(qaxis(f.spread, fan * s), qaxis(f.axis, c * (k === 4 ? 0.6 : 1) * 55 * D));
      fk(f.joints[0], base);
      fk(f.joints[1], qaxis(f.axis, c * 75 * D));
      fk(f.joints[2], qaxis(f.axis, c * 55 * D));
    });
  }

  // head: always seeking the real camera, chin a little down, cocked; the neck takes part of the turn
  fk(rig.neck, b.local(rig.neck));
  fk(rig.head, b.local(rig.head));
  const headFk = rot[rig.head];
  let aim = norm(sub(add(eye, [0, -1.4 - 1.4 * walk, 0]), pos[rig.head]));
  const local = qrot(qinv(chest), aim);
  const lyaw = clamp(Math.atan2(local[0], local[2]), -75 * D, 75 * D), lpitch = clamp(Math.asin(clamp(local[1], -1, 1)), -40 * D, 55 * D);
  aim = qrot(chest, [Math.sin(lyaw) * Math.cos(lpitch), Math.sin(lpitch), Math.cos(lyaw) * Math.cos(lpitch)]);
  aim = qrot(qy(tw.yaw), aim);
  const tilt = (22 * peek + 10 * stare + 13 * g.up * idle * (1 - g.beckon) - 17 * g.beckon + 7 * Math.sin((t / 9.1) * 2 * Math.PI) * idle * (1 - g.up)) * D
    + tw.roll;
  const headUp = qrot(qaxis(aim, -tilt), [0, 1, 0]);
  const want = qlook([0, 0, 1], [0, 1, 0], aim, headUp);
  const turn = qmul(want, qinv(headFk));
  rot[rig.neck] = qmul(qslerp(I, turn, 0.38), rot[rig.neck]);
  place(rig.head, want);

  // ears at rest on the head (they sag a hair as he breathes); their springs are added in writeGlitchtrapPose
  const earBase = qx(-1.5 * D * breath);
  for (const ear of rig.ears) { fk(ear.a, earBase); fk(ear.b); }

  // legs: the captured leg, then two-bone IK onto the ankle target (feet locked to the floor); the knee keeps the
  // captured knee's direction
  for (const [i, leg] of rig.legs.entries()) {
    fk(leg.hip, b.local(leg.hip));
    fk(leg.knee, b.local(leg.knee));
    const h = pos[leg.hip], kneeFk = pos[leg.knee], ankle = b.ankle[i], l1 = leg.l1 * SCALE, l2 = leg.l2 * SCALE;
    const reach = sub(ankle, h), d = clamp(len(reach), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995), dir = norm(reach);
    const along = fwd(yawOf(b.foot[i])), bend = sub(sub(kneeFk, h), mul(dir, dot(sub(kneeFk, h), dir)));
    const out = len(bend) > 1e-4 ? norm(bend) : norm(sub(along, mul(dir, dot(along, dir))));
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const knee = add(h, add(mul(dir, l1 * cosA), mul(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
    rot[leg.hip] = qlook(leg.thigh, [0, 0, 1], sub(knee, h), out);
    place(leg.knee, qlook(leg.shin, [0, 0, 1], sub(ankle, knee), out));
    place(leg.foot, b.foot[i]);
    fk(leg.toe, b.local(leg.toe));
  }
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

// Skinning matrices (column-major, world space, scale included) followed by [eye glow, 0, 0, 0]. With `ears`, the
// ears move as springs driven by the head (step it with every frame's time; a jump in time resets it).
export function writeGlitchtrapPose(out: Float32Array, rig: Rig, seconds: number, reduced: boolean, eye: number[], ears?: EarSprings) {
  const t = Math.max(0, seconds), pose = evaluate(rig, t, reduced, eye);
  if (ears && !reduced) {
    // the head's motion right now, from the same pure performance a moment earlier
    const h = 1 / 120, p1 = evaluate(rig, Math.max(0, t - h), false, eye), p2 = evaluate(rig, Math.max(0, t - 2 * h), false, eye);
    const R0 = pose.rot[rig.head], R1 = p1.rot[rig.head], R2 = p2.rot[rig.head];
    const spin = mul(rotvec(qmul(R0, qinv(R1))), 1 / h), before = mul(rotvec(qmul(R1, qinv(R2))), 1 / h);
    const accel = mul(add(sub(pose.pos[rig.head], mul(p1.pos[rig.head], 2)), p2.pos[rig.head]), 1 / (h * h));
    stepEars(ears, rig, t, R0, spin, mul(sub(spin, before), 1 / h), accel);
    placeEars(rig, pose, ears);
  }
  for (let i = 0; i < rig.n; i++) {
    const q = pose.rot[i], b = rig.bind[i];
    const x = qrot(q, [SCALE, 0, 0]), y = qrot(q, [0, SCALE, 0]), z = qrot(q, [0, 0, SCALE]);
    const p = sub(pose.pos[i], add(add(mul(x, b[0]), mul(y, b[1])), mul(z, b[2])));
    out.set([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, p[0], p[1], p[2], 1], i * 16);
  }
  out.set([pose.glow, 0, 0, 0], rig.n * 16);
}

// where the ankles are (for tests): world positions of the two foot joints
export function feetAt(rig: Rig, seconds: number, reduced: boolean, eye: number[]) {
  const p = evaluate(rig, Math.max(0, seconds), reduced, eye);
  return rig.legs.map((l) => p.pos[l.foot]);
}
export function headAt(rig: Rig, seconds: number, reduced: boolean, eye: number[]) {
  const p = evaluate(rig, Math.max(0, seconds), reduced, eye);
  return { pos: p.pos[rig.head], forward: qrot(p.rot[rig.head], [0, 0, 1]) };
}
export const STAGE = { START, HEADING };
