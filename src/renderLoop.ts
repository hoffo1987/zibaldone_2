// A canvas owns no animation frame while hidden, outside the viewport, or held (a full-screen scene covers the site).
const loops = new Set<() => void>();
let held = false;
export function holdLoops(on: boolean) { if (held === on) return; held = on; loops.forEach((sync) => sync()); }
export function renderLoop(draw: (time: number) => void, fps: () => number, element?: Element, resume?: () => void) {
  let raf = 0, visible = !element || typeof IntersectionObserver === "undefined", disposed = false, last = -Infinity;
  const active = () => !disposed && visible && !held && !document.hidden;
  const frame = (time: number) => {
    raf = 0;
    if (!active()) return;
    const interval = 1000 / Math.max(1, fps());
    if (time - last >= interval - 0.5) { last = time; draw(time); }
    if (active()) raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    if (!active()) { cancelAnimationFrame(raf); raf = 0; return; }
    if (!raf) { last = -Infinity; resume?.(); raf = requestAnimationFrame(frame); }
  };
  const observer = element && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
    visible = entries[entries.length - 1].isIntersecting; sync();
  }) : null;
  if (element) observer?.observe(element);
  document.addEventListener("visibilitychange", sync);
  loops.add(sync);
  sync();
  return () => { disposed = true; cancelAnimationFrame(raf); observer?.disconnect(); loops.delete(sync); document.removeEventListener("visibilitychange", sync); };
}
