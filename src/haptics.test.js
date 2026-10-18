import { haptic, bindUiHaptics, configureHaptics } from "./haptics";

let calls;
beforeEach(() => { calls = []; navigator.vibrate = (p) => { calls.push(p); return true; }; configureHaptics(true, 1); });

test("each gesture has its own short pattern, and strength stretches the pulses but not the pauses", () => {
  haptic("tap"); haptic("success");
  expect(calls).toEqual([[7], [8, 70, 18]]);
  configureHaptics(true, 1.6); haptic("select");
  expect(calls[2]).toEqual([8, 26, 11]);
  configureHaptics(false); haptic("impact");
  expect(calls).toHaveLength(3);
});

test("slider ticks never pile up", () => {
  const t0 = performance.now(), spy = jest.spyOn(performance, "now");
  spy.mockReturnValue(t0 + 1000); haptic("tick");
  spy.mockReturnValue(t0 + 1010); haptic("tick");
  spy.mockReturnValue(t0 + 1060); haptic("tick");
  expect(calls).toEqual([[4], [4]]);
  spy.mockRestore();
});

test("taps vibrate by what was touched: switches click twice, buttons once, disabled buttons not at all", () => {
  const off = bindUiHaptics();
  document.body.innerHTML = `<button id="b">Ok</button><button id="s" role="switch">x</button><button id="d" disabled>no</button><a id="n" href="#" data-snd="nav">Home</a><p id="p">testo</p>`;
  ["b", "s", "d", "n", "p"].forEach((id) => document.getElementById(id).click());
  expect(calls).toEqual([[7], [5, 26, 7], [10]]);
  off();
});
