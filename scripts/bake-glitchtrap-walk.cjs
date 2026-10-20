// Retargets a captured sneaking walk onto Glitchtrap's skeleton for the podium secret.
// Source: CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), subject 139 trial 29 "Sneaking", BVH conversion
// by B. Hahne (cgspeed). No restrictions on use; credit in public/glitchtrap/README.md.
// Usage: node scripts/bake-glitchtrap-walk.cjs <139_29.bvh> public/glitchtrap
//
// Output walk.bin (float32, 60 fps): per frame the midpoint of the hips, the two ankle targets (feet locked while the
// ball of the foot is on the floor), then the global rotation of each mapped joint, all in the walk's own frame: metres
// of Glitchtrap's bind pose (scale applied at runtime), +z along the walk, origin under the hips at the first frame.
// Rotations follow the rig's convention (delta from the bind pose in bind-aligned axes): actor rotation × the fixed
// rotation taking Glitchtrap's bind bone (A pose) onto the actor's rest bone (T pose).
const fs = require('fs');
const path = require('path');

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node scripts/bake-glitchtrap-walk.cjs 139_29.bvh public/glitchtrap');

// ---------- the take ----------
const CLIP = { from: 1.0, to: 4.36 };   // standing, then four steps; ends with both feet down (left just landed)
const RATE = 0.85;                       // a touch slower than the actor: a bigger, heavier body
const EASE = 3.95;                       // from here the last step slows to rest
const FPS = 60;

// ---------- BVH ----------
function parse(file) {
  const tok = fs.readFileSync(file, 'utf8').split(/\s+/).filter(Boolean);
  let i = 0; const joints = [], stack = [];
  while (i < tok.length) {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') { joints.push({ name: tok[i++], parent: stack.length ? stack[stack.length - 1] : -1, offset: null, channels: [], end: null }); stack.push(joints.length - 1); }
    else if (t === 'End') { i += 3; joints[stack[stack.length - 1]].end = [+tok[i++], +tok[i++], +tok[i++]]; i++; }
    else if (t === 'OFFSET') joints[stack[stack.length - 1]].offset = [+tok[i++], +tok[i++], +tok[i++]];
    else if (t === 'CHANNELS') { const n = +tok[i++]; joints[stack[stack.length - 1]].channels = tok.slice(i, i + n); i += n; }
    else if (t === '}') stack.pop();
    else if (t === 'MOTION') break;
  }
  i++; const frames = +tok[i++]; i += 2; const dt = +tok[i++];
  const nch = joints.reduce((s, j) => s + j.channels.length, 0);
  const data = Float64Array.from(tok.slice(i, i + frames * nch), Number);
  return { joints, frames, dt, nch, data };
}

// quaternions [x, y, z, w]
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qaxis = (ax, a) => { const s = Math.sin(a / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)]; };
const qrot = (q, v) => { const u = [q[0], q[1], q[2]], c = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const t = c(u, v).map((x) => 2 * x); const w = c(u, t); return [v[0] + q[3] * t[0] + w[0], v[1] + q[3] * t[1] + w[1], v[2] + q[3] * t[2] + w[2]]; };
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q) => { const l = Math.hypot(...q); return q.map((v) => v / l); };
const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const AX = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
function basis(f, u) { const a = norm(f), b = norm(sub(u, mul(a, dot(u, a)))); return [a, b, cross(a, b)]; }
function fromBasis(x, y, z) {
  const tr = x[0] + y[1] + z[2];
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  if (x[0] > y[1] && x[0] > z[2]) { const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2; return [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  if (y[1] > z[2]) { const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2; return [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2; return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
}
// rotation taking frame (f1, u1) onto (f2, u2)
const look = (f1, u1, f2, u2) => { const a = basis(f1, u1), b = basis(f2, u2); return qmul(fromBasis(...b), qinv(fromBasis(...a))); };

const bvh = parse(source);
const J = (name) => { const i = bvh.joints.findIndex((j) => j.name === name); if (i < 0) throw new Error(name); return i; };
// global rotations and positions of one captured frame (BVH: parent × offset × channel rotations in channel order)
function pose(f) {
  const rot = [], pos = []; let c = f * bvh.nch;
  bvh.joints.forEach((j, k) => {
    let q = [0, 0, 0, 1], p = j.offset.slice();
    for (const ch of j.channels) { const v = bvh.data[c++]; if (ch.endsWith('position')) p[{ X: 0, Y: 1, Z: 2 }[ch[0]]] = v; else q = qmul(q, qaxis(AX[ch[0]], (v * Math.PI) / 180)); }
    if (j.parent < 0) { rot.push(q); pos.push(p); }
    else { rot.push(qmul(rot[j.parent], q)); pos.push(add(pos[j.parent], qrot(rot[j.parent], j.offset))); }
  });
  return { rot, pos };
}

// ---------- Glitchtrap's bind pose ----------
const meta = JSON.parse(fs.readFileSync(path.join(output, 'glitchtrap.json'), 'utf8'));
const G = (name) => { const i = meta.joints.findIndex((j) => j.name === name); if (i < 0) throw new Error(name); return i; };
const bind = (name) => meta.joints[G(name)].bind;
const restOf = (name, child) => bvh.joints[J(child)].offset; // actor's rest bone (all rotations zero)
const palm = (side) => {
  const hand = bind(`bip_hand_${side}`), dir = norm(sub(bind(`${side}_MiddleA_jnt`), hand));
  return norm(mul(cross(dir, sub(bind(`${side}_IndexA_jnt`), bind(`${side}_PinkyA_jnt`))), side === 'L' ? 1 : -1));
};
// [our joint, actor joint, our bone, actor bone, our reference, actor reference]
const fwd = [0, 0, 1], up = [0, 1, 0];
const bone = (a, b) => sub(bind(b), bind(a));
const MAP = [
  ['bip_pelvis', 'Hips', up, up, fwd, fwd],
  ['bip_spine_0', 'LowerBack', bone('bip_spine_0', 'bip_spine_1'), restOf('LowerBack', 'Spine'), fwd, fwd],
  ['bip_spine_1', 'Spine', bone('bip_spine_1', 'bip_spine_2'), restOf('Spine', 'Spine1'), fwd, fwd],
  ['bip_spine_2', 'Spine1', bone('bip_spine_2', 'bip_neck'), restOf('Spine1', 'Neck1'), fwd, fwd],
  ['bip_neck', 'Neck1', bone('bip_neck', 'bip_head'), restOf('Neck1', 'Head'), fwd, fwd],
  ['bip_head', 'Head', up, up, fwd, fwd],
  ...['L', 'R'].flatMap((s) => {
    const S = s === 'L' ? 'Left' : 'Right', sign = s === 'L' ? 1 : -1;
    return [
      [`bip_collar_${s}`, `${S}Shoulder`, bone(`bip_collar_${s}`, `bip_upperArm_${s}`), restOf(`${S}Shoulder`, `${S}Arm`), fwd, fwd],
      [`bip_upperArm_${s}`, `${S}Arm`, bone(`bip_upperArm_${s}`, `bip_lowerArm_${s}`), restOf(`${S}Arm`, `${S}ForeArm`), fwd, fwd],
      [`bip_lowerArm_${s}`, `${S}ForeArm`, bone(`bip_lowerArm_${s}`, `bip_hand_${s}`), restOf(`${S}ForeArm`, `${S}Hand`), fwd, fwd],
      [`bip_hand_${s}`, `${S}Hand`, bone(`bip_hand_${s}`, `${s}_MiddleA_jnt`), [sign, 0, 0], palm(s), [0, -1, 0]],
      [`bip_hip_${s}`, `${S}UpLeg`, bone(`bip_hip_${s}`, `bip_knee_${s}`), restOf(`${S}UpLeg`, `${S}Leg`), fwd, fwd],
      [`bip_knee_${s}`, `${S}Leg`, bone(`bip_knee_${s}`, `bip_foot_${s}`), restOf(`${S}Leg`, `${S}Foot`), fwd, fwd],
      [`bip_foot_${s}`, `${S}Foot`, bone(`bip_foot_${s}`, `bip_toe_${s}`), restOf(`${S}Foot`, `${S}ToeBase`), up, up],
      [`bip_toe_${s}`, `${S}ToeBase`, fwd, fwd, up, up],
    ];
  }),
];
const fix = MAP.map(([, , ours, theirs, ourRef, theirRef]) => look(ours, ourRef, theirs, theirRef));

// scale: Glitchtrap's leg over the actor's leg
const actorLeg = len(bvh.joints[J('LeftLeg')].offset) + len(bvh.joints[J('LeftFoot')].offset);
const ourLeg = len(bone('bip_hip_L', 'bip_knee_L')) + len(bone('bip_knee_L', 'bip_foot_L'));
const K = ourLeg / actorLeg;

// ---------- sampling with time warp ----------
// Light smoothing of the capture before resampling: σ ≈ 1.5 frames at 120 Hz for the legs and every position (the
// contacts depend on them), σ ≈ 4 frames for the trunk, the head and the arms, whose markers jitter (the spine kicks
// once mid-walk, and the hands swinging from it would kick too).
const f0 = Math.floor(CLIP.from / bvh.dt) - 12, f1 = Math.ceil(CLIP.to / bvh.dt) + 12;
const raw = []; for (let f = f0; f <= f1; f++) raw.push(pose(f));
const nj = bvh.joints.length;
for (let k = 1; k < raw.length; k++) for (let j = 0; j < nj; j++) if (dot4(raw[k].rot[j], raw[k - 1].rot[j]) < 0) raw[k].rot[j] = raw[k].rot[j].map((v) => -v);
function dot4(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; }
const gauss = (sigma) => { const r = Math.ceil(sigma * 2.5), w = []; for (let d = -r; d <= r; d++) w.push(Math.exp(-(d * d) / (2 * sigma * sigma))); const sum = w.reduce((a, b) => a + b, 0); return { r, w: w.map((v) => v / sum) }; };
const FINE = gauss(1.5), CALM = gauss(4);
const kernel = bvh.joints.map((j) => (/LowerBack|Spine|Neck|Head|Shoulder|Arm|Hand/.test(j.name) ? CALM : FINE));
const blur = (k, K, get) => K.w.reduce((s, w, d) => s + w * get(raw[Math.min(raw.length - 1, Math.max(0, k + d - K.r))]), 0);
const smooth = raw.map((_, k) => ({
  rot: Array.from({ length: nj }, (_, j) => qnorm([0, 1, 2, 3].map((c) => blur(k, kernel[j], (p) => p.rot[j][c])))),
  pos: Array.from({ length: nj }, (_, j) => [0, 1, 2].map((c) => blur(k, FINE, (p) => p.pos[j][c]))),
}));
const at = (time) => {
  const x = time / bvh.dt - f0, k = Math.min(smooth.length - 2, Math.max(0, Math.floor(x))), u = x - k, A = smooth[k], B = smooth[k + 1];
  return {
    rot: A.rot.map((q, j) => qnorm(q.map((v, c) => v + (B.rot[j][c] - v) * u))),
    pos: A.pos.map((p, j) => p.map((v, c) => v + (B.pos[j][c] - v) * u)),
  };
};
// clip time for an output time: steady RATE, then a quadratic ease-out that lands exactly on CLIP.to
const easeLen = (2 * (CLIP.to - EASE)) / RATE, steady = (EASE - CLIP.from) / RATE, total = steady + easeLen;
const clipTime = (u) => (u <= steady ? CLIP.from + u * RATE : EASE + (CLIP.to - EASE) * (2 * ((u - steady) / easeLen) - ((u - steady) / easeLen) ** 2));

// the walk's frame: +z along the actor's overall direction, origin under the hips-mid of the first frame
const hipsMid = (p) => mul(add(p.pos[J('LeftUpLeg')], p.pos[J('RightUpLeg')]), 0.5);
const first = at(CLIP.from), last = at(CLIP.to);
const travel = sub(hipsMid(last), hipsMid(first)), heading = Math.atan2(travel[0], travel[2]);
const toWalk = qaxis([0, 1, 0], -heading);
// The walk is kept rigid, exactly as captured: turning it while a foot is planted would drag the feet. Glitchtrap turns
// towards the camera with his upper body once he has stopped (glitchtrapPose.ts).

// contacts: the ball of the foot on the floor and nearly still (captured clip, before the warp)
const toes = [J('LeftToeBase'), J('RightToeBase')], ankles = [J('LeftFoot'), J('RightFoot')];
const planted = (time, s) => {
  const a = at(time).pos[toes[s]], b = at(time + 1 / 120).pos[toes[s]];
  return a[1] < 1.3 && Math.hypot(a[0] - b[0], a[2] - b[2]) * 120 < 3.2;
};

// The costume's feet are twice the actor's: keep Glitchtrap's own ball of the foot on the floor while the actor's is
// planted, and hang his ankle from it with his own foot (so the toes never sink when the heel lifts).
const footAt = [MAP.findIndex((m) => m[0] === 'bip_foot_L'), MAP.findIndex((m) => m[0] === 'bip_foot_R')];
const footVec = [bone('bip_foot_L', 'bip_toe_L'), bone('bip_foot_R', 'bip_toe_R')];
const BALL = bind('bip_toe_L')[1], ANKLE = bind('bip_foot_L')[1];
const heelVec = [0, -ANKLE, -0.075]; // from the ankle down to the back of the heel, on the floor
// floor: the captured ankles of planted feet, lifted or lowered to Glitchtrap's ankle height
const groundAnkles = [];
for (let c = CLIP.from; c < CLIP.to; c += 0.05) for (const s of [0, 1]) if (planted(c, s)) groundAnkles.push(at(c).pos[ankles[s]][1] * K);
groundAnkles.sort((a, b) => a - b);
const floor = groundAnkles[Math.floor(groundAnkles.length / 2)] - ANKLE;

const n = Math.round(total * FPS) + 1, frames = [];
let root = [0, 0, 0], prev = null;
for (let k = 0; k < n; k++) {
  const u = Math.min(total, k / FPS), p = at(clipTime(u)), R = toWalk;
  const h = hipsMid(p);
  if (prev) { const d = qrot(R, sub(h, prev)); root = add(root, [d[0] * K, 0, d[2] * K]); }
  root[1] = h[1] * K - floor;
  prev = h;
  const rots = MAP.map(([, actor], m) => qmul(qmul(R, p.rot[J(actor)]), fix[m]));
  const free = [0, 1].map((s) => add(root, mul(qrot(R, sub(p.pos[ankles[s]], h)), K)));
  const toBall = [0, 1].map((s) => qrot(rots[footAt[s]], footVec[s]));
  frames.push({ root: root.slice(), free, toBall, rots, ankle: free.slice(), planted: [0, 1].map((s) => planted(clipTime(u), s)) });
}
// contact runs: bridge flickers shorter than 0.2 s and ignore touches shorter than 0.07 s
for (const s of [0, 1]) {
  const on = frames.map((f) => f.planted[s]);
  for (let k = 0; k < n; k++) if (!on[k]) { let e = k; while (e + 1 < n && !on[e + 1]) e++; if (k > 0 && e < n - 1 && e - k + 1 < 12) for (let j = k; j <= e; j++) on[j] = true; k = e; }
  for (let k = 0; k < n; k++) if (on[k]) { let e = k; while (e + 1 < n && on[e + 1]) e++; if (e - k + 1 < 4) for (let j = k; j <= e; j++) on[j] = false; k = e; }
  frames.forEach((f, k) => (f.planted[s] = on[k]));
}
// While planted, the ball stays where it touched down and the ankle swings around it. Ease into the lock over the
// first frames of contact and out of it over the first frames of the swing, so the foot never snaps.
const BLEND = 10, ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
for (const s of [0, 1]) {
  for (let k = 0; k < n;) {
    if (!frames[k].planted[s]) { k++; continue; }
    let e = k; while (e + 1 < n && frames[e + 1].planted[s]) e++;
    // lock where the foot is flattest in the first half of the contact: there Glitchtrap's ankle is the actor's.
    // From that flat footprint the foot rolls like a real one: around the heel while the toes are up, around the ball
    // while the heel is up (blended across flat), so neither end ever goes through the floor.
    let flat = k;
    for (let j = k; j <= k + (e - k) / 2; j++) if (Math.abs(frames[j].toBall[s][1] - footVec[s][1]) < Math.abs(frames[flat].toBall[s][1] - footVec[s][1])) flat = j;
    const yawOnly = (q) => { const f = qrot(q, [0, 0, 1]), a = Math.atan2(f[0], f[2]); return qaxis([0, 1, 0], a); };
    const qf = yawOnly(frames[flat].rots[footAt[s]]);
    const ball0 = add(frames[flat].free[s], frames[flat].toBall[s]), lockBall = [ball0[0], BALL, ball0[2]];
    const ankleFlat = sub(lockBall, qrot(qf, footVec[s])), heelFlat = add(ankleFlat, qrot(qf, heelVec));
    for (let j = k; j < n && (j <= e || (j - e < BLEND && !frames[j].planted[s])); j++) {
      // a foot already down at the first frame is simply locked; a touchdown eases in
      const w = j <= e ? (k === 0 ? 1 : ease((j - k + 1) / BLEND)) : 1 - ease((j - e) / BLEND);
      const q = frames[j].rots[footAt[s]], toBall = frames[j].toBall[s];
      const onBall = sub(lockBall, toBall), onHeel = sub(heelFlat, qrot(q, heelVec));
      // toes down past flat: the ball carries the foot; toes up: the heel does
      const roll = ease((footVec[s][1] - toBall[1]) / 0.03 + 0.5);
      const locked = add(mul(onHeel, 1 - roll), mul(onBall, roll));
      frames[j].ankle[s] = add(mul(frames[j].free[s], 1 - w), mul(locked, w));
    }
    k = e + 1;
  }
}

// the costume's long feet skim lower than the actor's: never let the heel or the ball go through the floor
for (const f of frames) for (const s of [0, 1]) {
  const q = f.rots[footAt[s]], lowest = Math.min(qrot(q, footVec[s])[1] - (BALL - 0), qrot(q, heelVec)[1]);
  // a soft floor (softplus): the foot is eased up as it nears the boards, without a kink in its path
  const under = BALL - (f.ankle[s][1] + lowest);
  f.ankle[s][1] += 0.006 * Math.log1p(Math.exp(under / 0.006));
}
if (process.env.DEBUG_WALK) for (let k = 0; k < n; k += 6) console.log(k, (k / FPS).toFixed(2), frames[k].planted.map(Number).join(''), [0, 1].map((s) => len(sub(frames[k].ankle[s], frames[k].free[s])).toFixed(3)).join(' '), frames[k].root.map((v) => v.toFixed(3)).join(','));
const stride = 3 + 6 + MAP.length * 4, buf = new Float32Array(n * stride);
frames.forEach((f, k) => buf.set([...f.root, ...f.ankle[0], ...f.ankle[1], ...f.rots.flat()], k * stride));
fs.writeFileSync(path.join(output, 'walk.bin'), Buffer.from(buf.buffer));
fs.writeFileSync(path.join(output, 'walk.json'), JSON.stringify({ version: 1, fps: FPS, frames: n, stride, joints: MAP.map(([ours]) => ours),
  source: 'CMU Graphics Lab Motion Capture Database, subject 139 trial 29 (Sneaking)', clip: CLIP, rate: RATE }));
const end = frames[n - 1].root;
console.log(`walk: ${n} frames (${total.toFixed(2)} s), travel ${Math.hypot(end[0], end[2]).toFixed(3)} m at bind scale (${end.map((v) => v.toFixed(3)).join(', ')}), K ${K.toFixed(4)}`);
