import React, { useEffect, useRef, useState } from "react";
import { renderLoop } from "./renderLoop";
import { LogoAnim, quality } from "./logo3d/anim";
import { bindLogoInput, watchSize } from "./logo3d/input";
import { createLogo2D } from "./logo2d/render2d";
import type { Props } from "./Logo3D";

// Il logo per i browser senza WebGPU: la stessa scena e la stessa animazione del logo 3D, disegnate in Canvas 2D.
// Se anche il Canvas 2D manca resta il logo SVG.
function Logo2D({ intro = true, spd = 1, fps = 30, fallback, className = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState(false);
  const config = useRef({ spd, fps }); config.current = { spd, fps };
  const fresh = useRef(intro);

  useEffect(() => {
    const el = host.current; if (!el || fail) return;
    const mobile = window.matchMedia("(max-width:767px), (pointer:coarse)").matches;
    const q = quality(mobile), anim = new LogoAnim(fresh.current, q);
    const cv = document.createElement("canvas");
    cv.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
    let r: ReturnType<typeof createLogo2D> = null;
    try { r = createLogo2D(cv, q); } catch {}
    if (!r) { setFail(true); return; }
    const view = r;
    el.appendChild(cv);
    const unbind = bindLogoInput(el, cv, anim);
    // risoluzione adattiva: se il disegno supera un terzo del tempo del fotogramma la densità dei pixel scende
    let scale = 1, slow = 0, base = 1, cw = 0, ch = 0;
    const size = watchSize(el, mobile, (w, h, ratio) => { cw = w; ch = h; base = ratio; view.resize(w, h, Math.max(1, ratio * scale)); view.draw(anim); });
    let last = performance.now();
    const stop = renderLoop((now) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (config.current.spd || 1); last = now;
      anim.step(dt);
      const t0 = performance.now();
      view.draw(anim);
      const ms = performance.now() - t0, budget = 1000 / (config.current.fps || 30);
      slow = ms > budget / 3 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 20 && base * scale > 1) { slow = 0; scale *= 0.8; view.resize(cw, ch, Math.max(1, base * scale)); }
    }, () => config.current.fps || 30, el, () => { last = performance.now(); });
    return () => { stop(); size.stop(); unbind(); cv.remove(); };
  }, [fail]);

  if (fail) return <>{fallback}</>;
  return <div ref={host} className={className} role="button" tabIndex={0} aria-label="Il Circuito: logo in 3D. Premi per farlo girare, o trascinalo" title="Trascinalo o cliccalo: gira e mostra il circuito sul retro" />;
}

export default React.memo(Logo2D);
