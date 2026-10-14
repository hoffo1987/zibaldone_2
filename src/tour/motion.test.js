import { track, impulse } from "./motion";

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
