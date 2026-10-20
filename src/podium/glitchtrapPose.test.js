import fs from 'fs';
import path from 'path';
import { makeRig, attachWalk, writeGlitchtrapPose, headAt, chestAt, placeAt, EarSprings, STAGE, SCALE, TIMES, TELEPORT } from './glitchtrapPose';
import meta from '../../public/glitchtrap/glitchtrap.json';
import walkMeta from '../../public/glitchtrap/walk.json';
import { COL_X, COL_Z, STEP_X, STEP_TOP } from './stage';

const asset = (name) => fs.readFileSync(path.join(__dirname, '../../public/glitchtrap', name));
const rig = makeRig(meta.joints);
attachWalk(rig, walkMeta, new Float32Array(new Uint8Array(asset('walk.bin')).buffer));
// the camera as the secret frames it on computers (it eases towards the left aisle)
const eye = [STAGE.CAMERA[0], 2.75, STAGE.CAMERA[1]];
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

test('no finger, hand or forearm ever sinks into the thighs or the belly', () => {
  // skin the real mesh: each vertex of the hands and forearms against the nearest skin of the legs and trunk, measured
  // along that skin's normal (negative is inside)
  const bin = asset('glitchtrap.bin'), out = new Float32Array(rig.n * 16 + 4), stride = meta.stride;
  const owner = (v) => meta.joints[bin[v * stride + 32]].name, limb = [], trunk = [];
  for (let v = 0; v < meta.vertexCount; v++) {
    if (bin[v * stride + 36] < 150) continue; // vertices clearly carried by one joint
    if (/hand|lowerArm|forearmTwist|_(Index|Middle|Ring|Pinky|Thumb)/.test(owner(v))) limb.push(v);
    else if (/hip_|knee_|pelvis|spine_/.test(owner(v))) trunk.push(v);
  }
  const skin = (v) => {
    const o = v * stride, p = [0, 0, 0], n = [0, 0, 0], x = [0, 1, 2].map((k) => bin.readFloatLE(o + k * 4)), m = [0, 1, 2].map((k) => bin.readFloatLE(o + 12 + k * 4));
    for (let k = 0; k < 4; k++) {
      const w = bin[o + 36 + k] / 255; if (!w) continue;
      const j = bin[o + 32 + k] * 16;
      for (let c = 0; c < 3; c++) {
        p[c] += w * (out[j + c] * x[0] + out[j + 4 + c] * x[1] + out[j + 8 + c] * x[2] + out[j + 12 + c]);
        n[c] += w * (out[j + c] * m[0] + out[j + 4 + c] * m[1] + out[j + 8 + c] * m[2]);
      }
    }
    const l = Math.hypot(...n) || 1;
    return { p, n: n.map((c) => c / l) };
  };
  // the body's skin in 6 cm cells, so each hand vertex only looks at its neighbourhood
  const cell = (x, y, z) => ((Math.floor(x / 0.06) + 500) * 1000 + Math.floor(y / 0.06) + 500) * 1000 + Math.floor(z / 0.06) + 500;
  let worst = 0;
  for (let t = 0; t < 24; t += 0.1) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    const grid = new Map();
    for (const v of trunk) { const b = skin(v), k = cell(...b.p); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
    for (const v of limb) {
      const h = skin(v).p;
      let near = null, best = 0.06;
      for (let dx = -0.06; dx < 0.07; dx += 0.06) for (let dy = -0.06; dy < 0.07; dy += 0.06) for (let dz = -0.06; dz < 0.07; dz += 0.06) {
        for (const b of grid.get(cell(h[0] + dx, h[1] + dy, h[2] + dz)) || []) {
          const d = Math.hypot(h[0] - b.p[0], h[1] - b.p[1], h[2] - b.p[2]);
          if (d < best) { best = d; near = b; }
        }
      }
      if (near) worst = Math.min(worst, (h[0] - near.p[0]) * near.n[0] + (h[1] - near.p[1]) * near.n[1] + (h[2] - near.p[2]) * near.n[2]);
    }
  }
  expect(worst).toBeGreaterThan(-0.005);
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
  // clear of the dais (half-width 4.55, back edge at z -1.85) and well away from the column he hid behind
  const stop = rig.walk.end;
  expect(stop[0] < -4.55 - 0.4 || stop[2] < -1.85 - 0.5).toBe(true);
  expect(Math.hypot(stop[0] - STAGE.START[0], stop[2] - STAGE.START[1])).toBeGreaterThan(1.4);
  // the chin is held a little low, but the face points at whoever is watching
  for (const t of [1.5, 5, walkEnd + 2, TELEPORT.first - 2]) {
    const h = headAt(rig, t, false, eye);
    expect(angle(h.forward, eye.map((v, k) => v - h.pos[k]))).toBeLessThan((14 * Math.PI) / 180);
  }
});

test('reduced motion holds one still pose with the hand raised', () => {
  const a = new Float32Array(rig.n * 16 + 4), b = new Float32Array(rig.n * 16 + 4);
  writeGlitchtrapPose(a, rig, 1, true, eye);
  writeGlitchtrapPose(b, rig, 25, true, eye);
  expect(a).toEqual(b);
  expect(at(a, 'bip_hand_R')[1]).toBeGreaterThan(at(a, 'bip_head')[1] - 0.45 * SCALE);
});

test('the ears swing after a sudden turn of the head, then settle; with reduced motion they stay put', () => {
  const out = new Float32Array(rig.n * 16 + 4), ears = new EarSprings();
  const bend = () => Math.max(...ears.bend.map((b) => Math.hypot(...b)));
  let peak = 0;
  for (let t = 0; t <= 2.4; t += 1 / 60) { writeGlitchtrapPose(out, rig, t, false, eye, ears); if (t > 1.85) peak = Math.max(peak, bend()); }
  expect(peak).toBeGreaterThan((4 * Math.PI) / 180);
  // the idle long after the last gesture: only breathing and slow sways move the head
  for (let t = 18.3; t <= 21; t += 1 / 60) writeGlitchtrapPose(out, rig, t, false, eye, ears);
  expect(bend()).toBeLessThan((4 * Math.PI) / 180);
  for (const b of ears.bend) expect(b.every(Number.isFinite)).toBe(true);
  const still = new EarSprings();
  for (let t = 0; t < 3; t += 1 / 60) writeGlitchtrapPose(out, rig, t, true, eye, still);
  expect(Math.max(...still.bend.map((b) => Math.hypot(...b)))).toBe(0);
});

test('no part of him ever goes through the columns or their bases', () => {
  // skin (a sample of) the real mesh on the CPU and test it against plinth, turned base and shaft of the aisle columns
  const bin = asset('glitchtrap.bin'), out = new Float32Array(rig.n * 16 + 4), stride = meta.stride;
  const inside = (p) => {
    let deepest = -1;
    for (const z of COL_Z) {
      const dx = p[0] + COL_X, dz = p[2] - z, r = Math.hypot(dx, dz);
      const d = p[1] < 0.28 ? Math.min(0.62 - Math.abs(dx), 0.62 - Math.abs(dz)) : p[1] < 0.62 ? 0.6 - r : 0.42 - r;
      deepest = Math.max(deepest, d);
    }
    return deepest;
  };
  let worst = -1;
  for (let t = 0; t < 12; t += 0.1) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    for (let v = 0; v < meta.vertexCount; v += 3) {
      const o = v * stride, p = [0, 0, 0], x = bin.readFloatLE(o), y = bin.readFloatLE(o + 4), z = bin.readFloatLE(o + 8);
      for (let k = 0; k < 4; k++) {
        const w = bin[o + 36 + k] / 255; if (!w) continue;
        const m = bin[o + 32 + k] * 16;
        for (let c = 0; c < 3; c++) p[c] += w * (out[m + c] * x + out[m + 4 + c] * y + out[m + 8 + c] * z + out[m + 12 + c]);
      }
      worst = Math.max(worst, inside(p));
    }
  }
  expect(worst).toBeLessThan(-0.02);
});

test('he stops in one movement: the hips slow down to rest and never halt and set off again', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  const hips = (t) => { writeGlitchtrapPose(out, rig, t, false, eye); return at(out, 'bip_pelvis'); };
  const speeds = [];
  for (let t = walkEnd - 0.5; t < TIMES.settled; t += 1 / 60) {
    const a = hips(t), b = hips(t + 1 / 60);
    speeds.push([t, Math.hypot(b[0] - a[0], b[2] - a[2]) * 60]);
  }
  // against his walking speed: at rest once below a twentieth of it, and from then on only the idle sway (no new start)
  const v0 = Math.max(...speeds.filter(([t]) => t <= walkEnd).map(([, v]) => v));
  const rest = speeds.find(([t, v]) => t > walkEnd && v < 0.05 * v0)?.[0] ?? null;
  expect(rest).not.toBeNull();
  for (const [t, v] of speeds) if (t > rest) expect(v).toBeLessThan(0.1 * v0);
  // still moving well after the last step has landed, at rest before the hand rises
  expect(rest).toBeGreaterThan(walkEnd + 0.9);
  expect(rest).toBeLessThan(TIMES.settled);
});

test('he waves beside his head at eye level, on the side away from the second place plate', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  for (let t = TIMES.wave + 0.3; t < TIMES.beckon; t += 0.05) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    const head = at(out, 'bip_head'), wrist = at(out, 'bip_hand_R'), view = head.map((v, k) => v - eye[k]);
    const right = [-view[2], 0, view[0]].map((v, _, a) => v / Math.hypot(a[0], a[2]));
    const across = (wrist[0] - head[0]) * right[0] + (wrist[2] - head[2]) * right[2];
    expect(wrist[1]).toBeGreaterThan(head[1]);
    // to the left on screen (the plate floats to his right there), never in front of his face
    expect(across).toBeLessThan(-0.4);
  }
});

test('standing, the free hand and its fingers never freeze', () => {
  const out = new Float32Array(rig.n * 16 + 4), hand = [], finger = [];
  for (let t = TIMES.idle + 1; t < TIMES.rewave; t += 0.25) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    hand.push(at(out, 'bip_hand_L'));
    finger.push(at(out, 'L_PinkyC_jnt').map((v, k) => v - hand[hand.length - 1][k]));
  }
  const spread = (pts) => Math.max(...[0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]))));
  expect(spread(hand)).toBeGreaterThan(0.04);
  expect(spread(finger)).toBeGreaterThan(0.02);
});

test('the knees always point the way the feet do, so the legs never look twisted', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  const heading = (name) => { const i = index(name), f = [out[i * 16 + 8], out[i * 16 + 10]]; return Math.atan2(f[0], f[1]); };
  for (let t = 0; t < 14; t += 1 / 20) {
    writeGlitchtrapPose(out, rig, t, false, eye);
    for (const s of ['L', 'R']) {
      const d = Math.atan2(Math.sin(heading(`bip_hip_${s}`) - heading(`bip_foot_${s}`)), Math.cos(heading(`bip_hip_${s}`) - heading(`bip_foot_${s}`)));
      expect(Math.abs(d)).toBeLessThan((25 * Math.PI) / 180);
    }
  }
});

test('at every heavy glitch he vanishes and reappears somewhere else, never twice in the same place in a row', () => {
  const out = new Float32Array(rig.n * 16 + 4);
  const vanish = (t) => { writeGlitchtrapPose(out, rig, t, false, eye); return out[rig.n * 16 + 3]; };
  const glitch = (t) => { writeGlitchtrapPose(out, rig, t, false, eye); return out[rig.n * 16 + 2]; };
  const places = new Set();
  for (let n = 0; n < 8; n++) {
    const at = TELEPORT.first + n * TELEPORT.every;
    // the glitch builds up to its heaviest, his image is gone at that instant and whole again a second later
    expect(glitch(at - 0.1)).toBeGreaterThan(0.85);
    expect(vanish(at - 1.2)).toBe(0); expect(vanish(at + 0.1)).toBe(1); expect(vanish(at + 1.0)).toBe(0);
    const before = chestAt(rig, at - 1.2, false, eye), after = chestAt(rig, at + 1.8, false, eye);
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(2);
    // between two teleports he stays where he is (only the small glitches, no jumps)
    const settled = chestAt(rig, at + 2, false, eye), later = chestAt(rig, at + TELEPORT.every - 1.2, false, eye);
    expect(Math.hypot(later[0] - settled[0], later[2] - settled[2])).toBeLessThan(0.6);
    places.add(`${Math.round(after[0])},${Math.round(after[2])}`);
  }
  // all of the places come round
  expect(places.size).toBe(STAGE.SPOTS.length);
  // with reduced motion he stays put
  expect(chestAt(rig, TELEPORT.first + 3, true, eye)).toEqual(chestAt(rig, 1, true, eye));
});

test('wherever he reappears he stands clear of the columns, the dais, the steps and the walls, facing his camera', () => {
  const bin = asset('glitchtrap.bin'), out = new Float32Array(rig.n * 16 + 4), stride = meta.stride;
  const solid = (p) => {
    let d = -9;
    for (const sx of [-1, 1]) for (const z of COL_Z) {
      const dx = p[0] - sx * COL_X, dz = p[2] - z, r = Math.hypot(dx, dz);
      d = Math.max(d, p[1] < 0.28 ? Math.min(0.62 - Math.abs(dx), 0.62 - Math.abs(dz)) : p[1] < 0.62 ? 0.6 - r : 0.42 - r);
    }
    d = Math.max(d, Math.min(4.55 - Math.abs(p[0]), p[2] + 1.85, 2.05 - p[2], 0.36 - p[1]));
    STEP_X.forEach((x, i) => { d = Math.max(d, Math.min(1.1 - Math.abs(p[0] - x), 0.92 - Math.abs(p[2]), STEP_TOP[i] - p[1])); });
    return Math.max(d, Math.abs(p[0]) - 8.93, -6.93 - p[2]);
  };
  let worst = -9;
  for (let n = 0; n < 6; n++) {
    const at = TELEPORT.first + n * TELEPORT.every;
    // the camera that frames this place (on computers)
    const place = STAGE.SPOTS.find((s) => { const c = chestAt(rig, at + 2, false, eye); return s.at && Math.hypot(s.at[0] - c[0], s.at[1] - c[2]) < 1; }) || STAGE.SPOTS[0];
    const cam = [place.camera[0], 2.75, place.camera[1]];
    for (let t = at + 0.6; t < at + TELEPORT.every - 1.2; t += 0.4) {
      writeGlitchtrapPose(out, rig, t, false, cam);
      for (let v = 0; v < meta.vertexCount; v += 5) {
        const o = v * stride, p = [0, 0, 0], x = bin.readFloatLE(o), y = bin.readFloatLE(o + 4), z = bin.readFloatLE(o + 8);
        for (let k = 0; k < 4; k++) {
          const w = bin[o + 36 + k] / 255; if (!w) continue;
          const m = bin[o + 32 + k] * 16;
          for (let c = 0; c < 3; c++) p[c] += w * (out[m + c] * x + out[m + 4 + c] * y + out[m + 8 + c] * z + out[m + 12 + c]);
        }
        worst = Math.max(worst, solid(p));
      }
    }
    const h = headAt(rig, at + 3, false, cam);
    expect(angle(h.forward, cam.map((v, k) => v - h.pos[k]))).toBeLessThan((14 * Math.PI) / 180);
    expect(placeAt(rig, at + 3, false).framing.desk).toEqual(place.desk);
  }
  expect(worst).toBeLessThan(-0.05);
});
