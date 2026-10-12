import { Game } from "./game";
import { CLOUD } from "./cloud";

let game;
beforeEach(() => {
  jest.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
    if (!this.testContext) this.testContext = new Proxy({
      drawImage: jest.fn(), putImageData: jest.fn(), scale: jest.fn(),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    return this.testContext;
  });
  global.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
  game = new Game(document.createElement("canvas"), () => {}, () => {}, { [CLOUD.sheet.src]: {} });
  game.sfx.on = false;
});
afterEach(() => { game.destroy(); jest.restoreAllMocks(); delete global.ImageData; });

test("Cloud paints atlas exposures, mirrors, flashes, and leaves bitmap dodge ghosts", () => {
  game.start("cloud");
  const sprite = game.hero.s;
  sprite.paint(); sprite.paint();
  expect(sprite.cx.drawImage).toHaveBeenCalledTimes(1); // repeated held frame is cached
  expect(sprite.cx.putImageData).not.toHaveBeenCalled();
  sprite.p.face = -1; sprite.flash = 0.1;
  sprite.draw(game.x, 0, 0);
  expect(game.x.scale).toHaveBeenCalledWith(-1, 1);
  expect(sprite.tcx.drawImage).toHaveBeenCalled();
  game.setBtn("dodge", true);
  for (let i = 0; i < 10; i++) game.tick(1 / 60);
  expect(game.st).toBe("roll");
  expect(game.ghosts.length).toBeGreaterThan(0);
  expect(game.ghosts[0].ax).toBe(sprite.p.r.ax);
});

test("jump, attack recovery, hero swap and gallery stepping preserve gameplay state", () => {
  game.start("cloud"); game.setBtn("jump", true); game.tick(1 / 60);
  expect(game.ground).toBe(false); expect(game.hero.s.p.anim).toBe("jump");
  game.start("cloud"); game.setBtn("spec", true);
  for (let i = 0; i < 45; i++) game.tick(1 / 60);
  expect(game.st).toBe("move"); expect(game.hero.s.p.anim).toBe("idle");
  game.setBtn("swap", true); game.tick(1 / 60);
  expect(game.hero.id).toBe("clive"); game.hero.s.paint();
  expect(game.hero.s.cx.putImageData).toHaveBeenCalled();
  game.gallery("cloud", "atk1"); game.gal.paused = true;
  game.galStep(1); game.tick(1 / 60);
  expect(game.galSprites.cloud.p.t).toBe(0.08);
  game.galStep(-1); expect(game.galSprites.cloud.p.t).toBe(0);
});
