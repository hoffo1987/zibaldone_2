import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderLoop } from "../renderLoop";
import { acquireEngine, releaseEngine } from "../logo3d/engine";
import { PodiumView, podiumQuality } from "./engine";
import { STEP_X, STEP_D, STEP_TOP, STEP_H, TROPHY_TOP, camera, project } from "./stage";

export type PodiumProps = {
  dark: boolean;
  // targhette dei primi tre (indice 0 = primo posto); null se il posto è vuoto
  plates: (React.ReactNode | null)[];
  onFail: () => void;
};

const RETRIES = 1;
const SLOT = "podium-slot"; // spazio lasciato libero nella pagina: lì la camera inquadra il podio

// La sala del podio a tutto schermo. Lo strato della scena sta dietro ai contenuti della pagina (sopra lo sfondo) e scorre
// con la pagina; numeri e targhette stanno in uno strato sopra i contenuti (cliccabili), proiettati con la stessa camera.
export default function Podium3D({ dark, plates, onFail }: PodiumProps) {
  const host = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const plateEls = useRef<(HTMLDivElement | null)[]>([]);
  const numEls = useRef<(HTMLSpanElement | null)[]>([]);
  const [root, setRoot] = useState<Element | null>(null);
  const [shown, setShown] = useState(false);
  const [gen, setGen] = useState(0);
  const darkRef = useRef(dark); darkRef.current = dark;
  const fail = useRef(onFail); fail.current = onFail;
  const retries = useRef(0);
  const placeRef = useRef<(() => void) | null>(null);
  useEffect(() => { setRoot(host.current?.closest(".root") || document.body); }, []);
  useEffect(() => { placeRef.current?.(); }, [plates, root]);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const mobile = window.matchMedia("(max-width:767px), (pointer:coarse)").matches;
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .8s ease";
    cv.setAttribute("aria-hidden", "true");
    let alive = true, view: PodiumView | null = null;
    const cleanups: (() => void)[] = [];
    let W = 0, H = 0, left = 0, top = 0, ratio = 1, scale = 1;

    // inquadratura: area libera della pagina (a destra della barra laterale, sotto titolo e mese)
    const measure = () => {
      W = window.innerWidth; H = window.innerHeight;
      const aside = document.querySelector("aside");
      left = aside && getComputedStyle(aside).display !== "none" ? aside.getBoundingClientRect().right : 0;
      const slot = document.getElementById(SLOT);
      if (slot) {
        top = Math.max(0, slot.getBoundingClientRect().top + window.scrollY);
        slot.style.height = `${Math.max(mobile ? 380 : 460, H - top - 16)}px`;
      }
      ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5) * scale;
    };
    const place = () => {
      if (!W || !H) return;
      const c = camera(Math.max(1, Math.round(W * ratio)), Math.max(1, Math.round(H * ratio)), left * ratio, top * ratio);
      // la camera lavora in pixel dell'immagine: si riporta tutto in pixel CSS
      const k = 1 / ratio;
      STEP_X.forEach((x, i) => {
        const tp = project(c, [x, TROPHY_TOP[i] + 0.22, -0.15]), a = project(c, [x - 1.1, STEP_TOP[i], STEP_D]), b = project(c, [x + 1.1, STEP_TOP[i], STEP_D]);
        const f = project(c, [x, STEP_TOP[i] - STEP_H[i] * 0.5 + 0.08, STEP_D + 0.01]);
        const p = plateEls.current[i], n = numEls.current[i];
        if (p && tp && a && b) { p.style.width = `${Math.max(mobile ? 90 : 130, (b.x - a.x) * k * 0.94)}px`; p.style.transform = `translate(${tp.x * k}px, ${tp.y * k}px) translate(-50%, -100%)`; }
        if (n && f) { n.style.transform = `translate(${f.x * k}px, ${f.y * k}px) translate(-50%, -50%)`; n.style.fontSize = `${Math.max(16, f.scale * k * STEP_H[i] * 0.62)}px`; }
      });
    };
    placeRef.current = place;
    const fit = () => { measure(); view?.resize(W, H, ratio, left, top); place(); };
    // la scena scorre con la pagina (è un'apertura a tutto schermo, non uno sfondo fisso)
    let raf = 0;
    const scroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const y = `translate3d(0, ${-window.scrollY}px, 0)`; el.style.transform = y; if (over.current) over.current.style.transform = y; }); };
    window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", fit);
    const tick = window.setInterval(fit, 1000); // il titolo e la barra del mese possono cambiare altezza
    cleanups.push(() => { window.removeEventListener("scroll", scroll); window.removeEventListener("resize", fit); clearInterval(tick); cancelAnimationFrame(raf); });
    measure(); scroll(); place();

    const lost = () => {
      if (!alive) return; alive = false;
      if (retries.current++ < RETRIES) { setShown(false); setGen((g) => g + 1); } else fail.current();
    };
    acquireEngine().then(async (e) => {
      if (!alive) return;
      e.onLost.add(lost); cleanups.push(() => e.onLost.delete(lost));
      if (e.lost) { lost(); return; }
      view = new PodiumView(e.device, cv, podiumQuality(mobile));
      await view.ready();
      if (!alive) return;
      fit();
      const t0 = performance.now();
      let last = t0, first = true, night = darkRef.current ? 1 : 0, slow = 0, fast = 0, avg = 16.7, drawn = t0;
      cleanups.push(renderLoop((now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        night += ((darkRef.current ? 1 : 0) - night) * (1 - Math.exp(-dt * 2.2)); // il sole lascia il posto alla luna piano piano
        if (!view!.render((now - t0) / 1000, night)) return;
        // risoluzione adattiva sui fotogrammi davvero disegnati: scende solo se la fluidità cala davvero
        avg += (now - drawn - avg) * 0.05; drawn = now;
        if (avg > 24) { fast = 0; if (++slow > 90 && scale > 0.6) { slow = 0; scale *= 0.85; fit(); } }
        else if (avg < 18) { slow = 0; if (++fast > 240 && scale < 1) { fast = 0; scale = Math.min(1, scale / 0.85); fit(); } }
        if (first) { first = false; el.appendChild(cv); requestAnimationFrame(() => { cv.style.opacity = "1"; }); setShown(true); place(); }
      }, () => 60, el, () => { last = performance.now(); drawn = last; }));
    }).catch((err) => { if (alive) { console.warn("Podio 3D: WebGPU non disponibile, si usa il podio semplice.", err?.message || err); alive = false; fail.current(); } });

    return () => {
      alive = false;
      cleanups.splice(0).reverse().forEach((fn) => fn());
      view?.destroy(); cv.remove();
      releaseEngine();
    };
  }, [gen]);

  const order = [1, 0, 2];
  return (
    <>
      <div ref={host} className={`podium-scene ${shown ? "on" : ""}`} aria-hidden="true"><div className="podium-scene-bg" /><i className="podium-scene-scrim" /></div>
      {root && createPortal(
        <div ref={over} className={`podium-over ${shown ? "on" : ""}`}>
          {order.map((i) => <span key={`n${i}`} ref={(n) => { numEls.current[i] = n; }} className={`podium3d-num r${i + 1}`} aria-hidden="true">{i + 1}</span>)}
          {order.map((i) => plates[i] ? <div key={`p${i}`} ref={(p) => { plateEls.current[i] = p; }} className={`podium3d-plate r${i + 1}`}>{plates[i]}</div> : null)}
        </div>, root)}
    </>
  );
}
