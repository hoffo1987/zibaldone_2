import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderLoop } from "../renderLoop";
import { acquireEngine, releaseEngine } from "../logo3d/engine";
import { PodiumView, podiumQuality } from "./engine";
import { STEP_X, STEP_D, STEP_TOP, TROPHY_TOP, camera, project } from "./stage";

export type PodiumProps = {
  dark: boolean;
  // targhette dei primi tre (indice 0 = primo posto); null se il posto è vuoto
  plates: (React.ReactNode | null)[];
  onFail: () => void;
};

const RETRIES = 1;
const SLOT = "podium-slot"; // spazio lasciato libero nella pagina: lì la camera inquadra il podio
// sotto questa larghezza la sala è un palco a tutta larghezza dentro la pagina e i vincitori sono schede sotto di esso
// (la stessa soglia del CSS: .podium-list e .podium-slot)
const NARROW = "(max-width: 767px)";

// La sala del podio.
//  - Schermi larghi: a tutto schermo. Lo strato della scena sta dietro ai contenuti (sopra lo sfondo) e scorre con la
//    pagina; le targhette stanno in uno strato sopra i contenuti, proiettate sopra le coppe con la stessa camera.
//  - Telefoni: la scena vive dentro lo spazio della pagina (scorre come il resto, nessuno strato fisso che salta quando la
//    barra del browser si nasconde) e le targhette diventano schede leggibili sotto il palco (le disegna la pagina).
// I numeri dei posti sono incisi nel marmo dei gradini.
export default function Podium3D({ dark, plates, onFail }: PodiumProps) {
  const host = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const plateEls = useRef<(HTMLDivElement | null)[]>([]);
  const [root, setRoot] = useState<Element | null>(null);
  const [shown, setShown] = useState(false);
  const [gen, setGen] = useState(0);
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  const darkRef = useRef(dark); darkRef.current = dark;
  const fail = useRef(onFail); fail.current = onFail;
  const retries = useRef(0);
  const placeRef = useRef<(() => void) | null>(null);
  useEffect(() => { setRoot(host.current?.closest(".root") || document.querySelector(".root") || document.body); }, []);
  useEffect(() => { placeRef.current?.(); }, [plates, root]);
  useEffect(() => {
    const mq = window.matchMedia(NARROW), on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  useEffect(() => {
    const slot = document.getElementById(SLOT);
    const el = narrow ? slot : host.current;
    if (!el) { const id = window.setTimeout(() => setGen((g) => g + 1), 120); return () => clearTimeout(id); } // la pagina non ha ancora lo spazio
    const mobile = narrow || window.matchMedia("(pointer:coarse)").matches;
    const cv = document.createElement("canvas");
    cv.className = "podium-canvas";
    cv.setAttribute("aria-hidden", "true");
    let alive = true, view: PodiumView | null = null;
    const cleanups: (() => void)[] = [];
    let W = 0, H = 0, left = 0, top = 0, ratio = 1, scale = 1;

    const measure = () => {
      if (narrow) {
        // il palco: larghezza piena, altezza fissata dal CSS su svh (non cambia quando la barra del browser si muove)
        W = el.clientWidth; H = el.clientHeight; left = 0; top = 0;
        ratio = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
        return;
      }
      // inquadratura: area libera della pagina (a destra della barra laterale, sotto titolo e mese)
      W = window.innerWidth; H = window.innerHeight;
      const aside = document.querySelector("aside");
      left = aside && getComputedStyle(aside).display !== "none" ? aside.getBoundingClientRect().right : 0;
      if (slot) {
        top = Math.max(0, slot.getBoundingClientRect().top + window.scrollY);
        slot.style.height = `${Math.max(460, H - top - 16)}px`;
      }
      ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5) * scale;
    };
    const place = () => {
      if (narrow || !W || !H) return;
      const c = camera(Math.max(1, Math.round(W * ratio)), Math.max(1, Math.round(H * ratio)), left * ratio, top * ratio);
      // la camera lavora in pixel dell'immagine: si riporta tutto in pixel CSS
      const k = 1 / ratio;
      STEP_X.forEach((x, i) => {
        const tp = project(c, [x, TROPHY_TOP[i] + 0.22, -0.15]), a = project(c, [x - 1.1, STEP_TOP[i], STEP_D]), b = project(c, [x + 1.1, STEP_TOP[i], STEP_D]);
        const p = plateEls.current[i];
        if (p && tp && a && b) { p.style.width = `${Math.max(150, (b.x - a.x) * k * 0.94)}px`; p.style.transform = `translate(${tp.x * k}px, ${tp.y * k}px) translate(-50%, -100%)`; }
      });
    };
    placeRef.current = place;
    const fit = () => { if (!alive) return; measure(); view?.resize(W, H, ratio, left, top); place(); };

    if (narrow) {
      el.appendChild(cv);
      const ro = new ResizeObserver(() => fit());
      ro.observe(el);
      cleanups.push(() => { ro.disconnect(); cv.remove(); });
    } else {
      // la scena scorre con la pagina (è un'apertura a tutto schermo, non uno sfondo fisso)
      let raf = 0;
      const scroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const y = `translate3d(0, ${-window.scrollY}px, 0)`; el.style.transform = y; if (over.current) over.current.style.transform = y; }); };
      window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", fit);
      const tick = window.setInterval(fit, 1000); // il titolo e la barra del mese possono cambiare altezza
      cleanups.push(() => { window.removeEventListener("scroll", scroll); window.removeEventListener("resize", fit); clearInterval(tick); cancelAnimationFrame(raf); cv.remove(); if (slot) slot.style.height = ""; });
      el.appendChild(cv);
      scroll();
    }
    measure(); place();

    const lost = () => {
      if (!alive) return; alive = false;
      if (retries.current++ < RETRIES) { setShown(false); setGen((g) => g + 1); } else fail.current();
    };
    acquireEngine().then(async (e) => {
      if (!alive) return;
      e.onLost.add(lost); cleanups.push(() => e.onLost.delete(lost));
      if (e.lost) { lost(); return; }
      view = new PodiumView(e.device, cv, podiumQuality(mobile));
      view.onError = (err) => { if (alive) { console.warn("Podio 3D: errore WebGPU, si usa il podio semplice.", err.message); alive = false; fail.current(); } };
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
        if (first) { first = false; requestAnimationFrame(() => cv.classList.add("on")); setShown(true); place(); }
      }, () => 60, el, () => { last = performance.now(); drawn = last; }));
    }).catch((err) => { if (alive) { console.warn("Podio 3D: WebGPU non disponibile, si usa il podio semplice.", err?.message || err); alive = false; fail.current(); } });

    return () => {
      alive = false;
      placeRef.current = null;
      cleanups.splice(0).reverse().forEach((fn) => fn());
      view?.destroy();
      releaseEngine();
    };
  }, [gen, narrow]);

  if (narrow) return <span ref={host as any} hidden />;
  const order = [1, 0, 2];
  return (
    <>
      <div ref={host} className={`podium-scene ${shown ? "on" : ""}`} aria-hidden="true"><div className="podium-scene-bg" /><i className="podium-scene-scrim" /></div>
      {root && createPortal(
        <div ref={over} className={`podium-over ${shown ? "on" : ""}`}>
          {order.map((i) => plates[i] ? <div key={`p${i}`} ref={(p) => { plateEls.current[i] = p; }} className={`podium3d-plate r${i + 1}`}>{plates[i]}</div> : null)}
        </div>, root)}
    </>
  );
}
