import { celIndex, stepCel, drawCel, loadSpriteSheets } from "./sprite-sheet";
import { CLOUD } from "./cloud";
import { CLIVE } from "./clive";
import { SEPH } from "./seph";
import { Puppet } from "./rig";

test("every Cloud animation has ordered exposures pointing to complete atlas cells", () => {
  expect(Object.keys(CLOUD.sheet.frames)).toHaveLength(42); // 24 pose disegnate + 18 intermedie
  for (const animation of Object.values(CLOUD.anims)) {
    expect(animation.cels[0].t).toBe(0);
    animation.cels.forEach((cel, i) => {
      expect(cel.t).toBeLessThan(animation.len);
      if (i) expect(cel.t).toBeGreaterThan(animation.cels[i - 1].t);
      const { rect, anchor } = CLOUD.sheet.frames[cel.frame];
      expect(rect[0] + rect[2]).toBeLessThanOrEqual(960);
      expect(rect[1] + rect[3]).toBeLessThanOrEqual(896);
      expect(anchor).toEqual([80, 110]);
    });
  }
});

test("loops wrap at the seam and non-looping clips hold the final exposure", () => {
  expect(celIndex(CLOUD.anims.run, 0.6)).toBe(0);
  expect(celIndex(CLOUD.anims.run, 600.2)).toBe(6);
  expect(celIndex(CLOUD.anims.run, -0.01)).toBe(17);
  expect(celIndex(CLOUD.anims.death, 20)).toBe(3);
  expect(celIndex(CLOUD.anims.death, -2)).toBe(0);
});

test("attack art starts on the exact hit window, and clears on recovery", () => {
  for (const [name, active] of [["atk1", "slash"], ["atk2", "uppercut"], ["atk3", "heavySlash"]]) {
    const a = CLOUD.anims[name], hit = a.hit[0];
    expect(a.cels[celIndex(a, hit.t0)].frame).toBe(active);
    expect(a.cels[celIndex(a, hit.t0 - 0.001)].frame).not.toBe(active);
    expect(a.cels[celIndex(a, hit.t1 + 0.001)].frame).not.toBe(active);
  }
});

test("gallery stepping follows variable exposure times and clamps held poses", () => {
  expect(stepCel(CLOUD.anims.atk1, 0, 1)).toBe(0.08);
  expect(stepCel(CLOUD.anims.atk1, 0, -1)).toBe(0);
  expect(stepCel(CLOUD.anims.death, 1.4, 1)).toBe(1);
  expect(stepCel(CLOUD.anims.run, 0, -1)).toBeCloseTo(17 / 30);
  expect(stepCel(CLOUD.anims.run, 17 / 30, 1)).toBe(0);
});

test("bitmap rendering uses integer destination pixels without rescaling", () => {
  const ctx = { drawImage: jest.fn(), imageSmoothingEnabled: true }, image = {};
  drawCel(ctx, image, CLOUD.sheet, { frame: "idle0", offset: [-2, 0] }, 120.2, 130.3);
  expect(ctx.imageSmoothingEnabled).toBe(false);
  expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 160, 128, 38, 20, 160, 128);
});

test("the other characters still render through their existing rig", () => {
  for (const def of [CLIVE, SEPH]) {
    const puppet = new Puppet(def);
    puppet.update(0.1); puppet.solve(); puppet.stepChains(1 / 60, 230);
    expect(puppet.render().col.some(pixel => pixel !== 0)).toBe(true);
  }
});

test("sprite loading deduplicates requests and allows retry after failure", async () => {
  const OriginalImage = global.Image, requests = [];
  global.Image = class { set src(value) { this.url = value; requests.push(this); } };
  try {
    const sheet = { src: "test-cloud.png", frames: {} };
    const failed = loadSpriteSheets([sheet, sheet]);
    expect(requests).toHaveLength(1);
    requests[0].onerror();
    await expect(failed).rejects.toThrow("Unable to load");
    const retry = loadSpriteSheets([sheet]);
    expect(requests).toHaveLength(2);
    requests[1].onload();
    expect((await retry)[sheet.src]).toBe(requests[1]);
  } finally { global.Image = OriginalImage; }
});
