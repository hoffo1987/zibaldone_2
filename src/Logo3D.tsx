import React, { useEffect, useRef, useState } from "react";
import { renderLoop, steadyFps } from "./renderLoop";
import { acquireEngine, releaseEngine, LogoView, webgpuAvailable, type Engine } from "./logo3d/engine";
import { LogoAnim, quality } from "./logo3d/scene";
import { bindLogoInput, watchSize } from "./logo3d/input";
import LogoLoader from "./LogoLoader";

// onFail: chi lo passa (LogoView) mostra il logo in Canvas 2D quando WebGPU non si avvia; altrimenti resta il fallback
export type Props = { intro?: boolean; spd?: number; fps?: number; fallback: React.ReactNode; className?: string; onFail?: () => void };

const RETRIES = 2; // tentativi dopo una perdita del dispositivo WebGPU (driver aggiornato, GPU azzerata), poi si rinuncia
const FILL: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" };

function Logo3D({ intro = true, spd = 1, fps = 30, fallback, className = "", onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState(() => !webgpuAvailable());
  const [shown, setShown] = useState(false); // primo fotogramma presentato: il canvas compare e il caricamento sfuma
  const [loaderGone, setLoaderGone] = useState(false);
  const [gen, setGen] = useState(0);
  const retries = useRef(0);
  const config = useRef({ spd, fps }); config.current = { spd, fps };
  const fresh = useRef(intro); // dopo una perdita del dispositivo il logo riparte senza rifare l'entrata
  const failed = useRef(onFail); failed.current = onFail;

  useEffect(() => { if (fail) failed.current?.(); }, [fail]);
  useEffect(() => {
    if (!shown) { setLoaderGone(false); return; }
    const t = setTimeout(() => setLoaderGone(true), 500); return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    const el = host.current; if (!el || fail) return;
    const mobile = window.matchMedia("(max-width:767px), (pointer:coarse)").matches;
    const q = quality(mobile);
    const anim = new LogoAnim(fresh.current, q);
    const cv = document.createElement("canvas");
    cv.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y;opacity:0;transition:opacity .45s ease";
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
    }).catch((err) => { if (alive) { console.warn("Logo 3D: WebGPU non disponibile, si usa il logo in Canvas 2D.", err?.message || err); setFail(true); } });

    const start = (v: LogoView) => {
      cleanups.push(bindLogoInput(el, cv, anim));
      // dimensioni: densità dei pixel limitata, ridotta ancora se la GPU non sta al passo
      let presented = false, last = { w: 0, h: 0, ratio: 1 };
      const size = watchSize(el, mobile, (w, h, ratio) => {
        last = { w, h, ratio };
        v.resize(w, h, ratio * v.scale);
        if (presented) v.render(anim); // niente fotogramma vuoto dopo il ridimensionamento del canvas
      });
      v.onScale = () => { v.resize(last.w, last.h, last.ratio * v.scale); };
      cleanups.push(size.stop);

      let t = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - t) / 1000) * (config.current.spd || 1); t = now;
        anim.step(dt);
        if (!v.render(anim, 1000 / (config.current.fps || 30))) return;
        if (!presented) {
          presented = true; el.appendChild(cv); setShown(true);
          requestAnimationFrame(() => { cv.style.opacity = "1"; });
        }
      };
      cleanups.push(renderLoop(step, vsync => steadyFps(config.current.fps || 30, vsync), el, () => { t = performance.now(); }));
    };

    return () => {
      alive = false;
      cleanups.splice(0).reverse().forEach((fn) => fn());
      view?.destroy(); cv.remove();
      releaseEngine();
      engine = null;
    };
  }, [fail, gen]);

  if (fail) return onFail ? <LogoLoader className={className} /> : <>{fallback}</>;
  return (
    <div ref={host} className={className} style={{ position: "relative" }} role="button" tabIndex={0} aria-label="Il Circuito: logo in 3D. Premi per farlo girare, o trascinalo" title="Trascinalo o cliccalo: gira e mostra il circuito sul retro">
      {!loaderGone && <div style={FILL}><LogoLoader className="logo-loader-fill" hide={shown} /></div>}
    </div>
  );
}

export default React.memo(Logo3D);
