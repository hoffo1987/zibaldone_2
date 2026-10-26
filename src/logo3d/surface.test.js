import { bakeSurface } from "./surface";

test("the surface texture is deterministic and its full mip chain filters grain and normals", () => {
  const levels = bakeSurface();
  expect(levels).toEqual(bakeSurface());
  expect(levels).toHaveLength(9);
  levels.forEach((data, mip) => expect(data.length).toBe((256 >> mip) ** 2 * 4));
  const channel = (level, k) => Array.from(level.filter((_, i) => i % 4 === k));
  for (const k of [1, 2]) {
    expect(Math.max(...channel(levels[0], k)) - Math.min(...channel(levels[0], k))).toBeGreaterThan(20);
    expect(levels[8][k]).toBeGreaterThanOrEqual(127);
    expect(levels[8][k]).toBeLessThanOrEqual(129);
  }
});
