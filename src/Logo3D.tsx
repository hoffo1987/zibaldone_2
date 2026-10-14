import React, { useEffect, useRef, useState } from "react";
import { renderLoop } from "./renderLoop";
import { acquireEngine, releaseEngine, LogoView, webgpuAvailable, type Engine } from "./logo3d/engine";
import { LogoAnim, quality } from "./logo3d/scene";

export type Props = { intro?: boolean; spd?: number; fps?: number; fallback: React.ReactNode; className?: string };

const RETRIES = 2; // tentativi dopo una perdita del dispositivo WebGPU (driver aggiornato, GPU azzerata), poi logo SVG

function Logo3D({ intro = true, spd = 1, fps = 30, fallback, className = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState(() => !webgpuAvailable());
  const [shown, setShown] = useState(false); // primo fotogramma presentato: da qui il canvas sostituisce l'SVG
  const [gen, setGen] = useState(0);
  const retries = useRef(0);
  const config = useRef({ spd, fps }); config.current = { spd, fps };
  const fresh = useRef(intro); // dopo una perdita del dispositivo il logo riparte senza rifare l'entrata

  useEffect(() => {
    const el = host.current; if (!el || fail) return;
    const mobile = window.matchMedia("(max-width:767px), (pointer:coarse)").matches;
    const q = quality(mobile);
    const anim = new LogoAnim(fresh.current, q);
    const cv = document.createElement("canvas");
    cv.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
    let alive = true, view: LogoView | null = null, engine: Engine | null = null;
    const cleanups: (() => void)[] = [];
    const lost = () => { if (!alive) return; alive = false; if (retries.current++ < RETRIES) { fresh.current = false; setShown(false); setGen((g) => g + 1); } else setFail(true); };

    acquireEngine().then(async (e) => {
      if (!alive) return;
      engine = e;
      e.onLost.add(lost); cleanups.push(() => e.onLost.delete(lost));
      if (e.lost) { lost(); return; }
      view = new LogoView(e, cv, q);
      await view.ready();
      if (!alive) return;
      start(view);
    }).catch((err) => { if (alive) { console.warn("Logo 3D: WebGPU non disponibile, si usa il logo SVG.", err?.message || err); setFail(true); } });

    const start = (v: LogoView) => {
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
      cleanups.push(() => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
        cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointerenter", enter); cv.removeEventListener("pointerleave", leave); el.removeEventListener("keydown", keyDown);
      });

      // dimensioni: densità dei pixel limitata come prima (1,5 sui telefoni, 2 altrove), ridotta se la GPU non sta al passo
      let dpr = window.devicePixelRatio || 1;
      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
        v.resize(w, h, Math.min(dpr, mobile ? 1.5 : 2) * v.scale);
        if (presented) v.render(anim); // niente fotogramma vuoto dopo il ridimensionamento del canvas
      };
      v.onScale = fit;
      let presented = false;
      const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(el);
      let mq: MediaQueryList | null = null;
      const watchDpr = () => { mq?.removeEventListener?.("change", onDpr); mq = window.matchMedia?.(`(resolution: ${dpr}dppx)`) || null; mq?.addEventListener?.("change", onDpr); };
      const onDpr = () => { dpr = window.devicePixelRatio || 1; watchDpr(); fit(); };
      watchDpr();
      cleanups.push(() => { ro?.disconnect(); mq?.removeEventListener?.("change", onDpr); });
      fit();

      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000) * (config.current.spd || 1); last = now;
        anim.step(dt);
        if (!v.render(anim, 1000 / (config.current.fps || 30))) return;
        if (!presented) {
          presented = true; el.appendChild(cv); setShown(true);
        }
      };
      const stop = renderLoop(step, () => config.current.fps || 30, el, () => { last = performance.now(); });
      cleanups.push(stop);
    };

    return () => {
      alive = false;
      cleanups.splice(0).reverse().forEach((fn) => fn());
      view?.destroy(); cv.remove();
      releaseEngine();
      engine = null;
    };
  }, [fail, gen]);

  if (fail) return <>{fallback}</>;
  return (
    <div ref={host} className={className} style={shown ? undefined : { position: "relative" }} role="button" tabIndex={0} aria-label="Il Circuito: logo in 3D. Premi per farlo girare, o trascinalo" title="Trascinalo o cliccalo: gira e mostra il circuito sul retro">
      {!shown && <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>{fallback}</div>}
    </div>
  );
}

export default React.memo(Logo3D);
