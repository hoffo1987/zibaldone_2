import { ResolutionGovernor } from './resolution';

test('keeps targets stable during interaction and after isolated slow frames', () => {
  const g = new ResolutionGovernor(); g.reset(0);
  for (let t = 4000; t < 12000; t += 500) expect(g.sample(1, 0.5, t, true, 0.4, 1.5)).toBe(1);
  expect(g.sample(1, 0.5, 13000, false, 0.4, 1.5)).toBe(1);
  expect(g.sample(1, 1, 13500, false, 0.4, 1.5)).toBe(1);
  expect(g.sample(1, 0.5, 14000, false, 0.4, 1.5)).toBe(1);
});

test('responds to sustained GPU pressure, then allows targets to settle', () => {
  const g = new ResolutionGovernor(); g.reset(0);
  expect(g.sample(1, 0.55, 1000, false, 0.4, 1.5)).toBe(1);
  expect(g.sample(1, 0.55, 4000, false, 0.4, 1.5)).toBe(1);
  expect(g.sample(1, 0.55, 4500, false, 0.4, 1.5)).toBe(1);
  expect(g.sample(1, 0.55, 5000, false, 0.4, 1.5)).toBe(0.8);
  for (let t = 5500; t < 8500; t += 500) expect(g.sample(0.8, 0.55, t, false, 0.4, 1.5)).toBe(0.8);
});

test('small measurement oscillations never churn textures and recovery needs sustained headroom', () => {
  const g = new ResolutionGovernor();
  for (let t = 0; t < 10000; t += 500) expect(g.sample(0.8, t % 1000 ? 0.78 : 0.84, t, false, 0.4, 1.5)).toBe(0.8);
  for (let i = 0; i < 7; i++) expect(g.sample(0.8, 1.2, 12000 + i * 500, false, 0.4, 1.5)).toBe(0.8);
  expect(g.sample(0.8, 1.2, 15500, false, 0.4, 1.5)).toBe(0.9);
});
