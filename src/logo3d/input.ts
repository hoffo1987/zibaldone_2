// Interazioni del logo, uguali per la versione WebGPU e per quella in Canvas 2D: il puntatore inclina la scena, il
// trascinamento la fa girare, un clic (o Invio/spazio) le dà una spinta e avvisa il terminale fluttuante.
import type { LogoAnim } from "./anim";

export function bindLogoInput(el: HTMLElement, cv: HTMLElement, anim: LogoAnim) {
  const ptr = anim.ptr;
  let pointerId: number | null = null, dragY = 0, dragX = 0, dragMoved = 0, lastMove = 0, spins = 0;
  const look = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    ptr.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
    ptr.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
  };
  const kick = () => { anim.kick(); spins++; window.dispatchEvent(new CustomEvent("circuito:giro", { detail: spins })); };
  const down = (e: PointerEvent) => { if (!e.isPrimary || e.button !== 0) return; pointerId = e.pointerId; anim.drag = true; dragY = e.clientY; dragX = e.clientX; dragMoved = 0; lastMove = performance.now(); try { cv.setPointerCapture(e.pointerId); } catch {} cv.style.cursor = "grabbing"; };
  const move = (e: PointerEvent) => {
    look(e);
    if (!anim.drag || e.pointerId !== pointerId) return;
    const dy = e.clientY - dragY; dragY = e.clientY; dragMoved += Math.abs(dy);
    const dx = e.clientX - dragX, now = performance.now(), dt = Math.max(8, now - lastMove) / 1000;
    dragX = e.clientX; dragMoved += Math.abs(dx); lastMove = now;
    anim.dragBy(dx, dt);
  };
  const up = (e: PointerEvent) => {
    if (!anim.drag || e.pointerId !== pointerId) return; anim.drag = false; pointerId = null; cv.style.cursor = anim.hover ? "grab" : "";
    try { cv.releasePointerCapture(e.pointerId); } catch {}
    if (e.type !== "pointercancel" && dragMoved < 5) kick();
    else if (performance.now() - lastMove > 90) anim.vel = 0;
  };
  const enter = () => { anim.hover = true; if (!anim.drag) cv.style.cursor = "grab"; };
  const leave = () => { anim.hover = false; if (!anim.drag) cv.style.cursor = ""; };
  const keyDown = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kick(); } };
  window.addEventListener("pointermove", move, { passive: true });
  cv.addEventListener("pointerdown", down); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  cv.addEventListener("pointerenter", enter); cv.addEventListener("pointerleave", leave); el.addEventListener("keydown", keyDown);
  return () => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
    cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointerenter", enter); cv.removeEventListener("pointerleave", leave); el.removeEventListener("keydown", keyDown);
  };
}

// dimensioni del canvas: densità dei pixel limitata (1,5 sui telefoni, 2 altrove), aggiornata se cambia lo zoom o lo schermo
export function watchSize(el: HTMLElement, mobile: boolean, fit: (w: number, h: number, ratio: number) => void) {
  let dpr = window.devicePixelRatio || 1;
  const run = () => { const w = el.clientWidth, h = el.clientHeight; if (w && h) fit(w, h, Math.min(dpr, mobile ? 1.5 : 2)); };
  const ro = "ResizeObserver" in window ? new ResizeObserver(run) : null; ro?.observe(el);
  let mq: MediaQueryList | null = null;
  const watchDpr = () => { mq?.removeEventListener?.("change", onDpr); mq = window.matchMedia?.(`(resolution: ${dpr}dppx)`) || null; mq?.addEventListener?.("change", onDpr); };
  const onDpr = () => { dpr = window.devicePixelRatio || 1; watchDpr(); run(); };
  watchDpr();
  run();
  return { refit: run, stop: () => { ro?.disconnect(); mq?.removeEventListener?.("change", onDpr); } };
}
