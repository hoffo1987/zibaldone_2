import { track, impulse, glide, direct, follower, jiggle } from "./motion";

test("camera stays inside shot bounds even with uneven timings and direction changes", () => {
  const keys = [{ t: 0, v: [0, 20] }, { t: 0.4, v: [12, 9] }, { t: 1.8, v: [13, 14] }, { t: 2, v: [-5, 3] }];
  const view = track(keys);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    for (let j = 0; j <= 100; j++) {
      view(a.t + (b.t - a.t) * j / 100).forEach((v, axis) => {
        expect(v).toBeGreaterThanOrEqual(Math.min(a.v[axis], b.v[axis]) - 1e-8);
        expect(v).toBeLessThanOrEqual(Math.max(a.v[axis], b.v[axis]) + 1e-8);
      });
    }
  }
});

test("camera velocity and acceleration join smoothly at a moving shot", () => {
  const view = track([{ t: 0, v: [0] }, { t: 1, v: [4] }, { t: 2.5, v: [9] }]);
  const h = 0.0001, v = t => view(t)[0];
  expect((v(1) - v(1 - h)) / h).toBeCloseTo((v(1 + h) - v(1)) / h, 3);
  expect((v(1) - 2 * v(1 - h) + v(1 - 2 * h)) / h ** 2).toBeCloseTo(0, 1);
  expect((v(1 + 2 * h) - 2 * v(1 + h) + v(1)) / h ** 2).toBeCloseTo(0, 1);
});

test("held axes remain fixed and rhythm impulses start without a jump", () => {
  const view = track([{ t: 0, v: [2, 30] }, { t: 1, v: [2, 20], still: [0] }, { t: 2, v: [2, 10] }]);
  expect(view(0.7)[0]).toBe(2);
  expect(view(-1)).toEqual([2, 30]);
  expect(view(3)).toEqual([2, 10]);
  expect(impulse(1, 2)).toBe(0);
  expect(impulse(2, 2)).toBe(0);
  expect(impulse(2.00001, 2)).toBeLessThan(0.001);
  expect(impulse(3, 2)).toBe(0);
});

test("a key with an imposed velocity is crossed without stopping, and the track can keep drifting", () => {
  const view = track([{ t: 0, v: [0] }, { t: 1, v: [10], d: [2] }, { t: 2, v: [12], d: [2] }], true);
  const h = 0.0001, v = t => view(t)[0];
  expect((v(1 + h) - v(1 - h)) / (2 * h)).toBeCloseTo(2, 2);
  expect((v(2.5) - v(2.4)) / 0.1).toBeCloseTo(2, 5);
  expect(v(3)).toBeCloseTo(14, 8);
});

test("a glide leaves and lands softly, and its fastest moment comes early", () => {
  expect(glide(0)).toBe(0); expect(glide(1)).toBe(1);
  const h = 0.0001, speed = s => (glide(s + h) - glide(s - h)) / (2 * h);
  expect(speed(h)).toBeLessThan(0.001); expect(speed(1 - h)).toBeLessThan(0.001);
  let peak = 0, at = 0;
  for (let s = 0; s <= 1; s += 0.01) { const k = speed(Math.min(1 - h, Math.max(h, s))); if (k > peak) { peak = k; at = s; } }
  expect(at).toBeGreaterThan(0.25); expect(at).toBeLessThan(0.4);
  for (let s = 0; s < 1; s += 0.02) expect(glide(s + 0.02)).toBeGreaterThanOrEqual(glide(s));
});

test("a blend between moving shots keeps the speed of each shot at its ends", () => {
  const A = t => [t * 2], B = t => [100 + t * -3];
  const view = direct(A, [{ at: 1, len: 1, shot: B }]);
  const h = 0.0001, v = t => view(t)[0];
  expect((v(1 - h) - v(1 - 2 * h)) / h).toBeCloseTo(2, 2);
  expect((v(1 + 2 * h) - v(1 + h)) / h).toBeCloseTo(2, 1);
  expect((v(2 + 2 * h) - v(2 + h)) / h).toBeCloseTo(-3, 2);
  expect(v(3)).toBeCloseTo(91, 8);
});

test("the camera follower tracks a steady move closely and settles on a stop", () => {
  const f = follower(2.4, 0.72, 1.6), dt = 1 / 60;
  let y = f.step([0], dt);
  for (let i = 1; i <= 120; i++) y = f.step([i * dt * 10], dt);
  expect(Math.abs(y[0] - 20)).toBeLessThan(0.6);
  for (let i = 0; i < 180; i++) y = f.step([20], dt);
  expect(y[0]).toBeCloseTo(20, 2);
  expect(f.step([50], 0.5)).toEqual([50]);
  expect(jiggle(-0.1)).toBe(0); expect(Math.abs(jiggle(3))).toBeLessThan(1e-6);
});
