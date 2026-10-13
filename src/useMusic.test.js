import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useMusic } from "./useMusic";
import { duck } from "./sound";

let root, host, result, players, hidden, rejection;
function Harness({ enabled = false, volume = 0.35 }) { result = useMusic(enabled, volume); return null; }
beforeEach(() => {
  players = []; hidden = false; rejection = null;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  jest.spyOn(window, "Audio").mockImplementation(src => {
    const player = {
      src, paused: true, volume: 1,
      play: jest.fn(() => { if (rejection) return Promise.reject(rejection); player.paused = false; return Promise.resolve(); }),
      pause: jest.fn(() => { player.paused = true; }),
      load: jest.fn(), removeAttribute: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn()
    };
    players.push(player); return player;
  });
  host = document.createElement("div"); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); jest.restoreAllMocks(); delete global.IS_REACT_ACT_ENVIRONMENT; });
const render = async (enabled, volume = 0.35) => { await act(async () => { root.render(<Harness enabled={enabled} volume={volume} />); }); };

test("does not load disabled audio; loops, changes volume, and pauses when disabled", async () => {
  await render(false); expect(players).toHaveLength(0);
  await act(async () => result.toggle(true)); await render(true);
  expect(players).toHaveLength(1); expect(players[0].loop).toBe(true); expect(players[0].volume).toBe(0.35);
  expect(result.status).toBe("playing");
  await render(true, 0); expect(players[0].volume).toBe(0);
  await act(async () => result.toggle(false)); await render(false);
  expect(players[0].paused).toBe(true); expect(result.status).toBe("idle");
});

test("recovers from blocked autoplay on a user gesture, and suspends in background", async () => {
  rejection = new DOMException("Gesture required", "NotAllowedError");
  await render(true); expect(result.status).toBe("blocked");
  rejection = null;
  await act(async () => document.dispatchEvent(new Event("pointerdown")));
  expect(result.status).toBe("playing");
  hidden = true; act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(players[0].paused).toBe(true);
  hidden = false; await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(players[0].paused).toBe(false);
});

test("ignores a late play rejection after disabling and frees the player on unmount", async () => {
  await render(true);
  let reject;
  players[0].paused = true;
  players[0].play.mockImplementation(() => new Promise((resolve, fail) => { reject = fail; }));
  act(() => result.retry());
  await render(false);
  await act(async () => reject(new DOMException("late", "NotAllowedError")));
  expect(result.status).toBe("idle");
  act(() => root.unmount());
  expect(players[0].removeAttribute).toHaveBeenCalledWith("src");
  expect(players[0].load).toHaveBeenCalled();
  root = { unmount() {} };
});

test("ducks under long sound cues and rises back afterwards", async () => {
  await render(true, 0.5);
  act(() => duck("test", 0.2));
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  expect(players[0].volume).toBeCloseTo(0.1, 2);
  act(() => duck("test", null));
  await act(async () => { await new Promise((r) => setTimeout(r, 1350)); });
  expect(players[0].volume).toBeCloseTo(0.5, 2);
});
