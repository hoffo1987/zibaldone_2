import fs from 'fs';
import path from 'path';
import { makeRig, writeGlitchtrapPose, feetAt, headAt, EarSprings, PLANTS, STAGE, SCALE } from './glitchtrapPose';
import meta from '../../public/glitchtrap/glitchtrap.json';
import { COL_X, COL_Z } from './stage';

const rig = makeRig(meta.joints);
const eye = [0, 2.75, 10.2];
const angle = (a, b) => Math.acos(Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0) / Math.hypot(...a) / Math.hypot(...b)));

test('every skinning matrix stays finite for the whole performance and the idle after it', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  for (let t = 0; t < 60; t += 1 / 30) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    expect(out.every(Number.isFinite)).toBe(true);
  }
});

test('the vertex weights reference real joints and sum to one', () => {
  const bin = fs.readFileSync(path.join(__dirname, '../../public/glitchtrap/glitchtrap.bin'));
  for (let v = 0; v < meta.vertexCount; v++) {
    const o = v * meta.stride;
    let sum = 0;
    for (let k = 0; k < 4; k++) { expect(bin[o + 32 + k]).toBeLessThan(rig.n); sum += bin[o + 36 + k]; }
    expect(sum).toBe(255);
  }
});

test('planted feet do not slide and the ankles never sink below the floor', () => {
  for (const [i, plants] of PLANTS.entries()) {
    plants.forEach((plant, k) => {
      const next = plants[k + 1];
      // between the heel coming down and the heel lifting, the ankle is fixed on its footprint
      const from = Number.isFinite(plant.strike) ? plant.strike + 0.33 : 0, to = next ? next.strike - STAGE.swingTime(next.strike) - 0.37 : 20;
      if (to <= from) return;
      for (let t = from; t <= to; t += 0.05) {
        const foot = feetAt(rig, t, false, eye)[i];
        expect(Math.hypot(foot[0] - plant.at[0], foot[2] - plant.at[2])).toBeLessThan(0.004);
      }
    });
  }
  for (let t = 0; t < 12; t += 1 / 60) for (const foot of feetAt(rig, t, false, eye)) expect(foot[1]).toBeGreaterThan(0.12 * SCALE);
});

test('he starts hidden behind the column and ends in the open, his face turned to the camera', () => {
  const column = [-COL_X, COL_Z[1]];
  const hidden = (p) => {
    const d = [p[0] - eye[0], p[2] - eye[2]], c = [column[0] - eye[0], column[1] - eye[2]];
    return angle(d, c) < Math.asin(0.42 / Math.hypot(...c)) && Math.hypot(...d) > Math.hypot(...c);
  };
  expect(hidden(headAt(rig, 0, false, eye).pos)).toBe(true);
  const end = headAt(rig, 9, false, eye);
  for (const z of COL_Z) {
    const c = [-COL_X - eye[0], z - eye[2]], d = [end.pos[0] - eye[0], end.pos[2] - eye[2]];
    if (Math.hypot(...c) < Math.hypot(...d)) expect(angle(c, d)).toBeGreaterThan(Math.asin(0.9 / Math.hypot(...c)));
  }
  expect(Math.hypot(end.pos[0] - STAGE.END[0], end.pos[2] - STAGE.END[1])).toBeLessThan(0.4);
  // the chin is held a little low, but the face points at whoever is watching
  for (const t of [1.5, 5, 9, 30]) {
    const h = headAt(rig, t, false, eye);
    expect(angle(h.forward, eye.map((v, k) => v - h.pos[k]))).toBeLessThan((12 * Math.PI) / 180);
  }
});

test('reduced motion holds one still pose with the hand raised', () => {
  const a = new Float32Array(rig.n * 16 + 4), b = new Float32Array(rig.n * 16 + 4);
  writeGlitchtrapPose(a, rig, 1, true, eye);
  writeGlitchtrapPose(b, rig, 25, true, eye);
  expect(a).toEqual(b);
  const hand = rig.arms[0].hand, head = rig.head;
  const pos = (m, i) => [0, 1, 2].map((k) => m[i * 16 + k] * rig.bind[i][0] + m[i * 16 + 4 + k] * rig.bind[i][1] + m[i * 16 + 8 + k] * rig.bind[i][2] + m[i * 16 + 12 + k]);
  expect(pos(a, hand)[1]).toBeGreaterThan(pos(a, head)[1] - 0.45 * SCALE);
});

test('the ears swing after a sudden turn of the head, then settle; with reduced motion they stay put', () => {
  const out = new Float32Array(rig.n * 16 + 4), ears = new EarSprings();
  const bend = () => Math.max(...ears.bend.map((b) => Math.hypot(...b)));
  let peak = 0;
  for (let t = 0; t <= 2.4; t += 1 / 60) { writeGlitchtrapPose(out, rig, t, false, eye, ears); if (t > 1.85) peak = Math.max(peak, bend()); }
  expect(peak).toBeGreaterThan((4 * Math.PI) / 180);
  // the idle long after the last gesture: only breathing and slow sways move the head
  for (let t = 15.6; t <= 20.5; t += 1 / 60) writeGlitchtrapPose(out, rig, t, false, eye, ears);
  expect(bend()).toBeLessThan((4 * Math.PI) / 180);
  for (const b of ears.bend) expect(b.every(Number.isFinite)).toBe(true);
  const still = new EarSprings();
  for (let t = 0; t < 3; t += 1 / 60) writeGlitchtrapPose(out, rig, t, true, eye, still);
  expect(Math.max(...still.bend.map((b) => Math.hypot(...b)))).toBe(0);
});
