// A canvas owns no animation frame while hidden, outside the viewport, or held (a full-screen scene covers the site).
//
// One clock for every canvas: all running loops are driven by a single requestAnimationFrame. Each loop still draws at
// its own rate, but loops with about the same rate draw on the same display refreshes. Every refresh in which any canvas
// changes makes the browser composite the whole page again, and behind glass that means re-running every backdrop
// filter: four 30 fps canvases out of phase cost four times the frames of four canvases in step, for the same picture.
// A loop that is about to be due (within half its interval) when another loop of about the same rate draws, draws with
// it; from then on they stay in step, because they share the frame and the interval.
type Loop = { due: () => boolean; near: (rate: number) => boolean; rate: () => number; run: () => void; keep: () => boolean; drop: () => void };
const loops = new Set<() => void>();
let held = false;
export function holdLoops(on: boolean) { if (held === on) return; held = on; loops.forEach((sync) => sync()); }
let backgroundHeld = false;
export const backgroundActive = () => !held && !backgroundHeld && !document.hidden;
export function holdBackground(on: boolean) { if (backgroundHeld === on) return; backgroundHeld = on; loops.forEach(sync => sync()); }
// Steady pacing: draw every k display refreshes, k being the multiple nearest to the wanted rate (rounding towards more
// frames). At 144 Hz, 60 wanted gives every other refresh: 72 even frames instead of 48 uneven ones.
export const refreshes = (want: number, vsync: number) => Math.max(1, Math.floor(1000 / want / vsync + 0.35));
// the fps to ask renderLoop for: it draws once (k - 0.4) refreshes have passed, that is exactly every k
export const steadyFps = (want: number, vsync: number) => (vsync ? 1000 / ((refreshes(want, vsync) - 0.4) * vsync + 0.5) : want);

// ---------------------------------------------------------------- the shared clock
const running = new Set<Loop>();
let clock = 0, prev = 0, vsync = 0, now = 0;
const tickAll = (time: number) => {
  clock = 0; now = time;
  const step = time - prev; prev = time;
  // long steps (frames the browser skipped) weigh little, just enough to follow a display with another refresh rate
  if (step > 2 && step < 40) vsync = vsync ? vsync + (step - vsync) * (step < vsync * 1.5 ? 0.05 : 0.01) : step;
  const list = Array.from(running), due = list.map((l) => l.due());
  const rates = list.filter((_, i) => due[i]).map((l) => l.rate());
  list.forEach((l, i) => { if (due[i] || (rates.length && rates.some((r) => l.near(r)))) l.run(); });
  list.forEach((l) => { if (running.has(l) && !l.keep()) { running.delete(l); l.drop(); } });
  if (running.size && !clock) clock = requestAnimationFrame(tickAll);
};
const enlist = (l: Loop) => {
  if (!running.size) prev = 0;
  running.add(l);
  if (!clock) clock = requestAnimationFrame(tickAll);
};
const dismiss = (l: Loop) => {
  running.delete(l);
  if (!running.size && clock) { cancelAnimationFrame(clock); clock = 0; }
};

// fps receives the estimated display refresh period (ms, 0 until known), so a caller can ask for an exact multiple of it
// pause runs when a running loop is put to sleep: a canvas whose last frame must not stay frozen on screen clears it there
export function renderLoop(draw: (time: number) => void, fps: (vsync: number) => number, element?: Element, resume?: () => void, foreground = false, pause?: () => void) {
  let on = false, visible = !element || typeof IntersectionObserver === "undefined", disposed = false, last = -Infinity;
  const active = () => !disposed && visible && !held && (foreground || !backgroundHeld) && !document.hidden;
  const interval = () => 1000 / Math.max(1, fps(vsync));
  const loop: Loop = {
    due: () => active() && now - last >= interval() - 0.5,
    rate: () => interval(),
    // about the same rate (within a quarter), and due within half an interval anyway: drawing now costs no extra frames
    near: (r: number) => { if (!active()) return false; const i = interval(); return Math.abs(r - i) <= i * 0.25 && now - last >= i * 0.5; },
    run: () => { last = now; draw(now); },
    // An event-driven canvas can sleep completely; invalidate wakes it without a polling frame.
    keep: () => active() && fps(vsync) > 0,
    drop: () => { on = false; },
  };
  const sync = () => {
    if (!active()) { if (on) { on = false; dismiss(loop); pause?.(); } return; }
    if (!on) { on = true; last = -Infinity; resume?.(); enlist(loop); }
  };
  const observer = element && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting; sync();
  }) : null;
  if (element) observer?.observe(element);
  document.addEventListener("visibilitychange", sync);
  loops.add(sync);
  sync();
  const stop = () => { disposed = true; if (on) { on = false; dismiss(loop); } observer?.disconnect(); loops.delete(sync); document.removeEventListener("visibilitychange", sync); };
  stop.invalidate = () => { last = -Infinity; sync(); };
  return stop;
}
