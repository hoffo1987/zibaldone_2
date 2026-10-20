import fs from 'fs';
import path from 'path';
import { makeRig, attachWalk, writeGlitchtrapPose, headAt, EarSprings, STAGE, SCALE, TIMES } from './glitchtrapPose';
import meta from '../../public/glitchtrap/glitchtrap.json';
import walkMeta from '../../public/glitchtrap/walk.json';
import { COL_X, COL_Z } from './stage';

const asset = (name) => fs.readFileSync(path.join(__dirname, '../../public/glitchtrap', name));
const rig = makeRig(meta.joints);
attachWalk(rig, walkMeta, new Float32Array(new Uint8Array(asset('walk.bin')).buffer));
const eye = [0, 2.75, 10.2];
const angle = (a, b) => Math.acos(Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / Math.hypot(...a) / Math.hypot(...b)));
const index = (name) => meta.joints.findIndex((j) => j.name === name);
// world position of a point given in bind coordinates, carried by joint `name`
const at = (out, name, local = meta.joints[index(name)].bind) => { const i = index(name); return [0, 1, 2].map((k) => out[i * 16 + k] * local[0] + out[i * 16 + 4 + k] * local[1] + out[i * 16 + 8 + k] * local[2] + out[i * 16 + 12 + k]); };
const walkEnd = TIMES.step + rig.walk.duration + 0.25;

test('every skinning matrix stays finite for the whole performance and the idle after it', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  for (let t = 0; t < 60; t += 1 / 30) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    expect(out.every(Number.isFinite)).toBe(true);
  }
});

test('the vertex weights reference real joints and sum to one', () => {
  const bin = asset('glitchtrap.bin');
  for (let v = 0; v < meta.vertexCount; v++) {
    const o = v * meta.stride;
    let sum = 0;
    for (let k = 0; k < 4; k++) { expect(bin[o + 32 + k]).toBeLessThan(rig.n); sum += bin[o + 36 + k]; }
    expect(sum).toBe(255);
  }
});

test('planted feet do not slide and never sink below the floor', () => {
  const out = new Float32Array(rig.n * 16 + 4), prev = {};
  for (let t = 0; t < walkEnd + 2; t += 1 / 60) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    for (const s of ['L', 'R']) {
      const ball = at(out, `bip_toe_${s}`), ankle = at(out, `bip_foot_${s}`);
      expect(ball[1]).toBeGreaterThan(-0.01);
      expect(ankle[1]).toBeGreaterThan(0.1 * SCALE);
      // while the ball of the foot is down it stays put (a few millimetres per frame at most while the lock eases in)
      if (prev[s] && ball[1] < 0.012 && prev[s][1] < 0.012) expect(Math.hypot(ball[0] - prev[s][0], ball[2] - prev[s][2])).toBeLessThan(0.008);
      prev[s] = ball;
    }
  }
});

test('the hands never sink into the thighs or the belly', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  const segment = (p, a, b) => { const ab = b.map((v, i) => v - a[i]), ap = p.map((v, i) => v - a[i]); const u = Math.max(0, Math.min(1, ap.reduce((s, v, i) => s + v * ab[i], 0) / ab.reduce((s, v) => s + v * v, 0))); return Math.hypot(...p.map((v, i) => v - (a[i] + ab[i] * u))); };
  for (let t = 0; t < 26; t += 1 / 30) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    for (const s of ['L', 'R']) {
      const palm = at(out, `bip_hand_${s}`, meta.joints[index(`bip_hand_${s}`)].bind.map((v, i) => (v + meta.joints[index(`${s}_MiddleA_jnt`)].bind[i]) / 2));
      for (const leg of ['L', 'R']) expect(segment(palm, at(out, `bip_hip_${leg}`), at(out, `bip_knee_${leg}`)) - 0.13 * SCALE).toBeGreaterThan(0.06);
      expect(segment(palm, at(out, 'bip_pelvis'), at(out, 'bip_spine_2')) - 0.22 * SCALE).toBeGreaterThan(0.06);
    }
  }
});

test('he starts hidden behind the column and ends in the open, his face turned to the camera', () => {
  const column = [-COL_X, COL_Z[1]];
  const hidden = (p) => {
    const d = [p[0] - eye[0], p[2] - eye[2]], c = [column[0] - eye[0], column[1] - eye[2]];
    return angle(d, c) < Math.asin(0.42 / Math.hypot(...c)) && Math.hypot(...d) > Math.hypot(...c);
  };
  expect(hidden(headAt(rig, 0, false, eye).pos)).toBe(true);
  const end = headAt(rig, walkEnd + 2, false, eye);
  for (const z of COL_Z) {
    const c = [-COL_X - eye[0], z - eye[2]], d = [end.pos[0] - eye[0], end.pos[2] - eye[2]];
    if (Math.hypot(...c) < Math.hypot(...d)) expect(angle(c, d)).toBeGreaterThan(Math.asin(0.9 / Math.hypot(...c)));
  }
  // beside the back corner of the dais, clear of it, and well away from the column he hid behind
  const stop = rig.walk.end;
  expect(stop[0]).toBeLessThan(-4.55 - 0.3);
  expect(Math.hypot(stop[0] - STAGE.START[0], stop[2] - STAGE.START[1])).toBeGreaterThan(2);
  // the chin is held a little low, but the face points at whoever is watching
  for (const t of [1.5, 5, walkEnd + 2, 30]) {
    const h = headAt(rig, t, false, eye);
    expect(angle(h.forward, eye.map((v, k) => v - h.pos[k]))).toBeLessThan((14 * Math.PI) / 180);
  }
});

test('reduced motion holds one still pose with the hand raised', () => {
  const a = new Float32Array(rig.n * 16 + 4), b = new Float32Array(rig.n * 16 + 4);
  writeGlitchtrapPose(a, rig, 1, true, eye);
  writeGlitchtrapPose(b, rig, 25, true, eye);
  expect(a).toEqual(b);
  expect(at(a, 'bip_hand_L')[1]).toBeGreaterThan(at(a, 'bip_head')[1] - 0.45 * SCALE);
});

test('the ears swing after a sudden turn of the head, then settle; with reduced motion they stay put', () => {
  const out = new Float32Array(rig.n * 16 + 4), ears = new EarSprings();
  const bend = () => Math.max(...ears.bend.map((b) => Math.hypot(...b)));
  let peak = 0;
  for (let t = 0; t <= 2.4; t += 1 / 60) { writeGlitchtrapPose(out, rig, t, false, eye, ears); if (t > 1.85) peak = Math.max(peak, bend()); }
  expect(peak).toBeGreaterThan((4 * Math.PI) / 180);
  // the idle long after the last gesture: only breathing and slow sways move the head
  for (let t = 16.4; t <= 21; t += 1 / 60) writeGlitchtrapPose(out, rig, t, false, eye, ears);
  expect(bend()).toBeLessThan((4 * Math.PI) / 180);
  for (const b of ears.bend) expect(b.every(Number.isFinite)).toBe(true);
  const still = new EarSprings();
  for (let t = 0; t < 3; t += 1 / 60) writeGlitchtrapPose(out, rig, t, true, eye, still);
  expect(Math.max(...still.bend.map((b) => Math.hypot(...b)))).toBe(0);
});
