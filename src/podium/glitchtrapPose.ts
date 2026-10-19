// Glitchtrap's performance behind the podium, as a pure function of time: the same pose feeds the main view, the
// shadow map and every reflection. References: Help Wanted's Pizza Party ending (he leans out from the curtain and
// beckons) and the Dead by Daylight lobby (slow open-hand wave beside a cocked head, hunched stalking walk).
//
// Choreography (seconds after the reveal): hidden behind the column, he leans out until one glowing eye shows
// (0.3–2.2), slides out still bent sideways and straightens as he pads diagonally towards the hall (3–8.2): short soft
// steps placed ball first, knees never locked, the pelvis gliding at an even pace. He settles facing the camera, raises
// his left hand and waves slowly with loose fingers (9–12.3), lets the fingers ripple in a "come here" (12.3–14) and
// lowers the hand. Then he breathes, sways, twitches now and then and waves again every fifteen seconds (from 21). The head always
// seeks the real camera; the ears are springs pushed by the head's motion (EarSprings, the only state).
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
const mixV = (a: V, b: V, t: number): V => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const smoother = (x: number) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
const ramp = (t: number, a: number, b: number) => smoother((t - a) / (b - a));
// eases out with a small overshoot (the hand arrives a little past its mark and settles)
const backOut = (x: number) => { const t = smoother(x), k = 1.4; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
// a decaying wobble that starts at rest (zero value and zero speed), overshoots and dies out
const settle = (t: number, period: number, decay: number) => (t <= 0 ? 0 : Math.exp(-t / decay) * (1 - Math.cos((2 * Math.PI * t) / period)) * 0.5);

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
  n: number; parent: number[]; bind: V[]; ends: number[];
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
    n: joints.length, parent, bind, ends, root: at('_rootJoint'), pelvis: at('bip_pelvis'),
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
// column of the left aisle and walks out towards the hall, stopping beside the back corner of the dais.
export const SCALE = 1.3;
const START = [-6.75, -3.75], END = [-4.95, -2.15], CAMERA = [0, 10.2];
const yawTo = (a: number[], b: number[]) => Math.atan2(b[0] - a[0], b[1] - a[1]);
const YAW0 = yawTo(START, CAMERA), HEADING = yawTo(START, END), YAW1 = yawTo(END, CAMERA);
const PATH = norm([END[0] - START[0], 0, END[1] - START[1]]), PATH_LEN = Math.hypot(END[0] - START[0], END[1] - START[1]);
const left = (yaw: number): V => [Math.cos(yaw), 0, -Math.sin(yaw)];
const fwd = (yaw: number): V => [Math.sin(yaw), 0, Math.cos(yaw)];
const ground = (p: number): V => [START[0] + PATH[0] * p, 0, START[1] + PATH[2] * p];

export const TIMES = { peek: 0.3, peekHeld: 1.3, step: 2.2, settled: 8.95, wave: 9.65, beckon: 12.35, lower: 14.15, idle: 15.25, rewave: 21, every: 15 };
// feet: ankle position on the floor, yaw, time of heel strike (each plant lasts until the foot lifts again)
type Plant = { at: V; yaw: number; strike: number };
// the costume's thighs nearly touch at rest: the feet keep to hip-wide tracks so the legs never cross
const STAND = 0.17 * SCALE, WALK = 0.16 * SCALE, SPLAY = 7 * D;
const plantAt = (p: number | V, side: number, yaw: number, width: number, strike: number): Plant => {
  const c = typeof p === 'number' ? ground(p) : p;
  return { at: add(c, mul(left(yaw), side * width)), yaw: yaw + side * SPLAY, strike };
};
const endAt: V = [END[0], 0, END[1]];
// a slow, slightly uneven pace with long double supports: the weight moves from foot to foot without hurry
// short steps (a stalk, not a stride): five and a small closing one to stand square to the camera
const SWING = 0.64;
const STRIKES = [3.62, 4.6, 5.56, 6.54, 7.5, 8.18], LAST = STRIKES[STRIKES.length - 1];
export const PLANTS: Plant[][] = [
  [plantAt(0, 1, YAW0, STAND, -Infinity), plantAt(0.32, 1, qangle(YAW0, HEADING, 0.8), WALK, STRIKES[0]),
    plantAt(1.4, 1, HEADING, WALK, STRIKES[2]), plantAt(endAt, 1, YAW1, STAND, STRIKES[4])],
  [plantAt(0, -1, YAW0, STAND, -Infinity), plantAt(0.86, -1, HEADING, WALK, STRIKES[1]),
    plantAt(1.94, -1, qangle(HEADING, YAW1, 0.5), WALK, STRIKES[3]), plantAt(endAt, -1, YAW1, STAND, LAST)],
];
const swingTime = (strike: number) => (strike === LAST ? 0.55 : SWING);
// soft steps: the ball of the foot lands first (toes a little down), then the heel settles; a gentle toe-off
const CONTACT = 5 * D, SETTLE = 0.32, TOE_OFF = 30 * D, HEEL_OFF = 0.36, CLEAR = 0.07 * SCALE;

type FootState = { ankle: V; yaw: number; pitch: number; toe: number; swing: number; phase: number };
// +1 when the left arm is fully forward, -1 when back; continuous through the whole walk
const SWINGS = PLANTS.flatMap((ps, foot) => ps.slice(1).map((p) => ({ foot, start: p.strike - swingTime(p.strike), end: p.strike }))).sort((a, b) => a.start - b.start);
function swingPhase(t: number) {
  let v = 1;
  for (const s of SWINGS) {
    if (t < s.start) break;
    const c = Math.cos(Math.PI * smoother((t - s.start) / (s.end - s.start)));
    v = s.foot === 0 ? c : -c;
  }
  return v;
}
// ankle of a flat or rolling foot: the ball stays put while the heel rises, the heel while the toes come down
function rolled(leg: Leg, plant: Plant, pitch: number): V {
  const yaw = qy(plant.yaw), flat: V = [plant.at[0], -leg.heel[1] * SCALE, plant.at[2]];
  const pivot = pitch >= 0 ? leg.ball : leg.heel;
  const contact = add(flat, mul(qrot(yaw, pivot), SCALE));
  return add(contact, mul(qrot(qmul(yaw, qx(pitch)), mul(pivot, -1)), SCALE));
}
function footAt(leg: Leg, plants: Plant[], t: number): FootState {
  let k = 0;
  while (k + 1 < plants.length && t >= plants[k + 1].strike - swingTime(plants[k + 1].strike)) k++;
  const cur = plants[k], next = plants[k + 1];
  const lift = next ? next.strike - swingTime(next.strike) : Infinity;
  if (t < cur.strike) {
    // swinging towards cur
    const prev = plants[k - 1], start = cur.strike - swingTime(cur.strike), s = clamp01((t - start) / (cur.strike - start)), m = smoother(s);
    // the foot travels low and early, then hovers and lowers slowly onto the floor (no speed left at the touch)
    const a = rolled(leg, prev, TOE_OFF), b = rolled(leg, cur, CONTACT), reach = smoother(s ** 0.85);
    const ankle = mixV(a, b, reach);
    ankle[1] = mix(a[1], b[1], reach) + CLEAR * Math.sin(Math.PI * s ** 0.8) ** 2;
    const pitch = s < 0.5 ? mix(TOE_OFF, -4 * D, smoother(s / 0.5)) : mix(-4 * D, CONTACT, smoother((s - 0.5) / 0.5));
    return { ankle, yaw: qangle(prev.yaw, cur.yaw, reach), pitch, toe: -TOE_OFF * (1 - smoother(s / 0.35)), swing: s, phase: 1 };
  }
  // planted: the heel settles after the touch, rises before the lift
  const down = Number.isFinite(cur.strike) ? CONTACT * (1 - smoother((t - cur.strike) / SETTLE)) : 0;
  const up = Number.isFinite(lift) ? TOE_OFF * smoother(1 - (lift - t) / HEEL_OFF) : 0;
  const pitch = down + up;
  return { ankle: rolled(leg, cur, pitch), yaw: cur.yaw, pitch, toe: -Math.max(0, pitch), swing: 0, phase: 0 };
}

// pelvis over the ground: right above the stance foot halfway through each swing, halfway between the feet in the
// middle of each double support. Spaced like the steps, these keys give an almost even, gliding speed; the small
// sideways sway over the stance foot rides on the same curve.
type Key = { t: number; p: V };
const PELVIS_KEYS: Key[] = (() => {
  const along = (a: V) => clamp(dot(sub(a, ground(0)), PATH), 0, PATH_LEN);
  const planted = (foot: number, t: number) => [...PLANTS[foot]].reverse().find((p) => p.strike <= t)!;
  const side = left(HEADING), sway = 0.03 * SCALE;
  const at = (progress: number, lat: number) => add(ground(progress), mul(side, lat));
  const keys: Key[] = [{ t: TIMES.step + 0.2, p: at(0, 0) }];
  SWINGS.forEach((sw, i) => {
    const stance = planted(1 - sw.foot, sw.start), landed = planted(sw.foot, sw.end), toward = sw.foot === 0 ? -1 : 1;
    const last = i === SWINGS.length - 1, next = SWINGS[i + 1];
    if (i === 0) keys.push({ t: sw.start, p: at(0, toward * sway * 0.8) });
    keys.push({ t: (sw.start + sw.end) / 2, p: at(along(stance.at) + (i === 0 ? 0.05 : last ? -0.12 : 0), toward * sway) });
    keys.push({ t: last ? sw.end + 0.5 : (sw.end + next.start) / 2, p: at((along(stance.at) + along(landed.at)) / 2, 0) });
  });
  return keys;
})();
function hermite(keys: Key[], t: number): V {
  if (t <= keys[0].t) return keys[0].p;
  const n = keys.length;
  if (t >= keys[n - 1].t) return keys[n - 1].p;
  let i = 0;
  while (t > keys[i + 1].t) i++;
  const tangent = (k: number) => (k <= 0 || k >= n - 1 ? [0, 0, 0] : mul(sub(keys[k + 1].p, keys[k - 1].p), 1 / (keys[k + 1].t - keys[k - 1].t)));
  const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = (t - a.t) / h, s2 = s * s, s3 = s2 * s;
  return add(add(mul(a.p, 2 * s3 - 3 * s2 + 1), mul(tangent(i), (s3 - 2 * s2 + s) * h)), add(mul(b.p, -2 * s3 + 3 * s2), mul(tangent(i + 1), (s3 - s2) * h)));
}

// sudden glitches of the head: [time, roll, yaw]
const TWITCHES: number[][] = [[1.85, -16, 7], [10.8, 13, -6], [13.35, -11, 4]];
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
function evaluate(rig: Rig, t: number, still: boolean, eye: V): Pose {
  const rot: Q[] = new Array(rig.n), pos: V[] = new Array(rig.n), bind = rig.bind;
  const offset = (i: number) => mul(sub(bind[i], bind[rig.parent[i]]), SCALE);
  const fk = (i: number, delta: Q = I) => { const p = rig.parent[i]; pos[i] = add(pos[p], qrot(rot[p], offset(i))); rot[i] = qmul(rot[p], delta); };
  const place = (i: number, q: Q) => { const p = rig.parent[i]; pos[i] = add(pos[p], qrot(rot[p], offset(i))); rot[i] = q; };
  const euler = (pitch: number, roll: number, yaw = 0) => qmul(qy(yaw), qmul(qx(pitch), qz(roll)));

  // envelopes
  // the lean carries into the first steps: he slides out still bent sideways, then straightens
  const peek = still ? 0 : ramp(t, TIMES.peek, TIMES.peekHeld) * (1 - ramp(t, TIMES.step + 0.6, STRIKES[1] - 0.1));
  const stare = still ? 0 : ramp(t, TIMES.peekHeld, TIMES.step) * (1 - ramp(t, TIMES.step + 0.3, STRIKES[0] + 0.2));
  const walk = still ? 0 : ramp(t, TIMES.step + 0.3, STRIKES[0]) * (1 - ramp(t, LAST - 0.5, TIMES.settled));
  const after = still ? 1e3 : t - LAST;
  const idle = still ? 1 : ramp(t, TIMES.settled - 0.6, TIMES.settled + 1);
  const g = gesture(t, still);
  const tw = still ? { roll: 0, yaw: 0, glow: 0 } : twitch(t);
  const breath = still ? 0 : Math.sin((t / 4.2) * 2 * Math.PI);
  const sway = still ? 0 : Math.sin((t / 7.3) * 2 * Math.PI) * idle;

  // feet first: they decide where the pelvis can be
  const tf = still ? 1e3 : t;
  const feet = rig.legs.map((leg, i) => footAt(leg, PLANTS[i], tf));
  const swingSide = feet[0].phase ? 1 : feet[1].phase ? -1 : 0, swingS = feet[0].phase ? feet[0].swing : feet[1].swing;
  const swingWave = Math.sin(Math.PI * swingS) ** 2 * (swingSide ? 1 : 0);

  // pelvis
  const yaw = qangle(feet[1].yaw, feet[0].yaw, 0.5);
  const heading = qy(yaw);
  let hip = hermite(PELVIS_KEYS, tf);
  hip = add(hip, qrot(heading, [0.075 * SCALE * peek + 0.018 * SCALE * sway - 0.03 * SCALE * g.up * idle, 0, -0.03 * SCALE * peek]));
  hip = add(hip, mul(fwd(yaw), 0.05 * SCALE * settle(after, 1.1, 0.35)));
  // knees stay soft while he pads along, so the pelvis glides low with only a small rise over each step
  const bob = walk * 0.012 * SCALE * (swingSide ? Math.sin(Math.PI * swingS) ** 2 - 0.5 : -0.5);
  let y = (bind[rig.pelvis][1] - 0.006) * SCALE - 0.042 * SCALE * walk + bob + 0.004 * SCALE * breath * idle - 0.02 * SCALE * settle(after, 0.8, 0.25);
  const yawOsc = -swingSide * 4 * D * swingWave * walk, rollOsc = -swingSide * 2 * D * swingWave * walk;
  const pelvisRot = qmul(heading, euler((2 + 4 * walk) * D, rollOsc + (3 * peek + 2.5 * sway) * D, yawOsc));
  // never stretch a leg past its length: lower the pelvis smoothly where a foot is far away
  for (const [i, leg] of rig.legs.entries()) {
    const h = add([hip[0], y, hip[2]], qrot(pelvisRot, mul(sub(bind[leg.hip], bind[rig.pelvis]), SCALE)));
    const a = feet[i].ankle, reach = 0.985 * (leg.l1 + leg.l2) * SCALE, dh = Math.hypot(h[0] - a[0], h[2] - a[2]);
    const limit = y - (h[1] - (a[1] + Math.sqrt(Math.max(1e-6, reach * reach - dh * dh))));
    y = -0.012 * Math.log(Math.exp(-y / 0.012) + Math.exp(-limit / 0.012));
  }
  rot[rig.root] = heading; pos[rig.root] = [hip[0], 0, hip[2]];
  rot[rig.pelvis] = pelvisRot; pos[rig.pelvis] = [hip[0], y, hip[2]];

  // spine: hunched while stalking, bent sideways for the peek, breathing, a recoil after stopping
  const recoil = 4 * D * settle(after - 0.05, 0.9, 0.3);
  const lean = 2.5 * D * g.up * idle;
  // the spine undoes the pelvis' rocking, so the shoulders and the head stay level and quiet
  fk(rig.spine[0], euler((2 + 3 * walk) * D, -7 * D * peek - 1.5 * D * sway - 0.5 * rollOsc, -0.35 * yawOsc));
  fk(rig.spine[1], euler((3 + 4 * walk + 0.8 * breath) * D + recoil, -10 * D * peek - D * sway + lean - 0.4 * rollOsc, -0.4 * yawOsc));
  fk(rig.spine[2], euler((4 + 5 * walk + 0.8 * breath) * D + recoil * 0.6, -10 * D * peek + lean - 0.2 * rollOsc, -0.35 * yawOsc + 3 * D * g.up * idle));
  const chest = rot[rig.spine[2]];
  fk(rig.tie);

  // arms
  // the arms swing against the legs, a beat late (they are carried, not driven): the left arm comes back while the
  // left foot travels forward, and drifts through the double support
  const gait = swingPhase(tf - 0.14);
  const armSwing = (side: number) => side * gait * walk;
  for (const arm of rig.arms) {
    const s = arm.s, raised = s === 1 ? g.up * idle : 0, swing = armSwing(s) + 0.5 * settle(after, 1.0, 0.4);
    fk(arm.collar, qmul(qz(s * (10 * raised + 1.2 * breath * idle) * D), qy(-s * 4 * raised * D)));
    const shoulder = add(pos[arm.collar], qrot(rot[arm.collar], offset(arm.upper)));
    // relaxed: hanging a little in front, elbow soft, swinging with the walk
    // relaxed: hanging clear of the costume's belly and hips, a little in front, elbows soft and slightly out
    const forward = 0.5 * (swing + Math.sqrt(swing * swing + 0.04)) - 0.1;
    const flex = (10 + 8 * swing + 5 * walk) * D, abd = (17 + 3 * walk) * D, elbow = (28 + 6 * forward + 12 * walk) * D;
    const along = (angle: number, abd: number): V => qrot(qmul(qz(s * abd), qx(-angle)), [0, -1, 0]);
    const hangUpper = along(flex, abd), hangLower = along(flex + elbow, abd * 0.85);
    let wrist = add(mul(hangUpper, arm.l1 * SCALE), mul(hangLower, arm.l2 * SCALE));
    let pole = qrot(qmul(qz(s * abd), qx(-flex)), [s * 0.5, 0, -1]);
    let handQ: Q | null = null, curl = 0.42 + 0.12 * walk, spread = 0;
    if (raised > 0) {
      // the wave: upper arm out to the side, forearm upright, open palm towards the camera beside the cocked head
      const e: V = [0.96 * s, -0.16, 0.24], up: V = [0.04 * s, 1, 0.12];
      const swingA = (8 + 22 * g.wave) * D * Math.min(1, g.up * 3), l1 = arm.l1 * SCALE, l2 = arm.l2 * SCALE;
      const side: V = [s, 0, 0], fore = norm(add(mul(norm(up), Math.cos(swingA)), mul(side, Math.sin(swingA))));
      const target = add(mul(norm(e), l1), mul(fore, l2));
      const k = g.lift * raised, k2 = mix(raised, clamp01(g.lift), 0.5) * raised;
      wrist = mixV(wrist, add(target, [0, (1 - g.lift) * -0.06 * SCALE, 0]), k);
      pole = norm(mixV(pole, [0.72 * s, -0.66, 0], k2));
      // the hand lags the forearm (it is dragged, then whips): its own angle runs a little behind and further
      const lagged = gesture(t - 0.11, still), lag = (10 + 30 * lagged.wave) * D * Math.min(1, lagged.up * 3);
      const fingersUp = norm(add(mul(norm(up), Math.cos(lag)), mul(side, Math.sin(lag))));
      const palmOut = norm(qrot(qx(-(14 + 34 * g.beckon) * D), [0.12 * s, 0, 1]));
      handQ = qlook(arm.handDir, arm.palm, qrot(chest, fingersUp), qrot(chest, palmOut));
      curl = mix(curl, 0.08, raised);
      spread = 9 * D * raised * (1 - g.beckon);
    }
    wrist = add(shoulder, qrot(chest, wrist));
    pole = qrot(chest, pole);
    // two-bone IK from the shoulder
    const reach = sub(wrist, shoulder), l1 = arm.l1 * SCALE, l2 = arm.l2 * SCALE;
    const d = clamp(len(reach), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999), dir = norm(reach);
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), out = norm(sub(pole, mul(dir, dot(pole, dir))));
    const elbowP = add(shoulder, add(mul(dir, l1 * cosA), mul(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
    const upperQ = qlook(arm.upperDir, arm.pole, sub(elbowP, shoulder), out);
    place(arm.upper, upperQ);
    place(arm.lower, qlook(arm.lowerDir, arm.pole, sub(wrist, elbowP), out));
    // the shoulder helper follows the arm's swing without its twist
    const rel = qmul(qinv(rot[arm.collar]), upperQ);
    place(arm.twist, qmul(rot[arm.collar], qmul(rel, qinv(qtwist(rel, arm.upperDir)))));
    const relaxed = qmul(rot[arm.lower], qaxis(cross(arm.handDir, arm.palm), (8 + 6 * walk) * D));
    place(arm.hand, handQ ? qslerp(relaxed, handQ, clamp01(raised * 1.2)) : relaxed);
    // half of the wrist's twist goes into the forearm helper, so the sleeve does not pinch
    const wristRel = qmul(qinv(rot[arm.lower]), rot[arm.hand]);
    place(arm.forearmTwist, qmul(rot[arm.lower], qslerp(I, qtwist(wristRel, arm.lowerDir), 0.5)));
    // fingers: loosely curled at rest and never frozen, open and fanned for the wave but trailing the hand (each a
    // little later than the one before), rippling closed and open for the beckon (index first)
    const raisedWave = s === 1 ? g.amp * raised * (1 - g.beckon) : 0;
    arm.fingers.forEach((f, k) => {
      let c = curl * (k === 4 ? 0.45 : 1) + (k === 3 ? 0.06 : 0);
      if (!still) c += 0.035 * Math.sin(t * 1.7 + k * 0.9 + s) * (1 - raised);
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
  fk(rig.neck, qx((6 + 8 * walk) * D));
  fk(rig.head);
  const headFk = rot[rig.head];
  let aim = norm(sub(add(eye, [0, -1.4 - 1.6 * walk, 0]), pos[rig.head]));
  const local = qrot(qinv(chest), aim);
  const lyaw = clamp(Math.atan2(local[0], local[2]), -75 * D, 75 * D), lpitch = clamp(Math.asin(clamp(local[1], -1, 1)), -40 * D, 35 * D);
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

  // legs: two-bone IK to the ankle; the knee points along the foot, slightly outwards
  for (const [i, leg] of rig.legs.entries()) {
    const f = feet[i];
    place(leg.hip, I);
    const h = pos[leg.hip], l1 = leg.l1 * SCALE, l2 = leg.l2 * SCALE;
    const reach = sub(f.ankle, h), d = clamp(len(reach), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995), dir = norm(reach);
    const pole = fwd(qangle(yaw, f.yaw, 0.6) + leg.s * 6 * D);
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), out = norm(sub(pole, mul(dir, dot(pole, dir))));
    const knee = add(h, add(mul(dir, l1 * cosA), mul(out, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)))));
    rot[leg.hip] = qlook(leg.thigh, [0, 0, 1], sub(knee, h), out);
    place(leg.knee, qlook(leg.shin, [0, 0, 1], sub(f.ankle, knee), out));
    place(leg.foot, qmul(qy(f.yaw), qx(f.pitch)));
    fk(leg.toe, qx(f.toe));
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
export const STAGE = { START, END, YAW0, HEADING, YAW1, STRIKES, swingTime };
