// A canvas owns no animation frame while hidden or outside the viewport.
export function renderLoop(draw: (time: number) => void, fps: () => number, element?: Element, resume?: () => void) {
  let raf = 0, visible = !element || typeof IntersectionObserver === "undefined", disposed = false, last = -Infinity;
  const active = () => !disposed && visible && !document.hidden;
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
  sync();
  return () => { disposed = true; cancelAnimationFrame(raf); observer?.disconnect(); document.removeEventListener("visibilitychange", sync); };
}
