import { writeFreddyPose } from './freddyPose';
import { headPivot } from '../../public/freddy/freddy.json';

const transform = (m, v, offset = 0, w = 0) => [0, 1, 2].map(i =>
  m[offset + i] * v[0] + m[offset + 4 + i] * v[1] + m[offset + 8 + i] * v[2] + m[offset + 12 + i] * w);

test.each([[0, 2.8, 10], [-2, 3.3, 18], [4, 3, 10]])('head faces the actual camera at %j', (...eye) => {
  const pose = new Float32Array(40);
  writeFreddyPose(pose, 3, false, eye, headPivot);
  const head = transform(pose, headPivot, 0, 1);
  const forward = transform(pose, transform(pose, [0, 0, 1], 16));
  const target = eye.map((v, i) => v - head[i]);
  const cosine = target.reduce((sum, v, i) => sum + v * forward[i], 0) / Math.hypot(...target) / Math.hypot(...forward);
  expect(cosine).toBeCloseTo(1, 6);
  // Rotating around the neck pivot must never translate the head away from the body.
  expect(Array.from(pose.slice(36, 39))).toEqual(headPivot.map(Math.fround));
});

test('reduced motion holds the settled pose and hand still', () => {
  const a = new Float32Array(40), b = new Float32Array(40);
  writeFreddyPose(a, 1, true, [0, 3, 10], headPivot);
  writeFreddyPose(b, 10, true, [0, 3, 10], headPivot);
  expect(a).toEqual(b);
});
