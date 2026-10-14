import React, { useEffect, useRef, useState } from "react";
import { renderLoop } from "../renderLoop";
import { acquireEngine, releaseEngine } from "../logo3d/engine";
import { PodiumView, podiumQuality } from "./engine";
import { STEPS, camera, project } from "./stage";

export type PodiumProps = {
  dark: boolean;
  // targhette dei primi tre (indice 0 = primo posto); null se il posto è vuoto
  plates: (React.ReactNode | null)[];
  onFail: () => void;
};

const RETRIES = 1;

// La sala del podio in WebGPU: il canvas disegna la scena, sopra ci sono i numeri incisi sui gradini e le targhette dei
// vincitori, proiettati con la stessa camera degli shader e aggiornati a ogni fotogramma (seguono la parallasse).
export default function Podium3D({ dark, plates, onFail }: PodiumProps) {
  const host = useRef<HTMLDivElement>(null);
  const plateEls = useRef<(HTMLDivElement | null)[]>([]);
  const numEls = useRef<(HTMLSpanElement | null)[]>([]);
  const [shown, setShown] = useState(false);
  const [gen, setGen] = useState(0);
  const darkRef = useRef(dark); darkRef.current = dark;
  const fail = useRef(onFail); fail.current = onFail;
  const retries = useRef(0);
  const placeRef = useRef<(() => void) | null>(null);
  // nuove targhette (cambio di mese): si posizionano subito, anche se il 3D non disegna ancora
  useEffect(() => { placeRef.current?.(); }, [plates]);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const mobile = window.matchMedia("(max-width:767px), (pointer:coarse)").matches;
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .6s ease";
    cv.setAttribute("aria-hidden", "true");
    let alive = true, view: PodiumView | null = null;
    const cleanups: (() => void)[] = [];
    let night = darkRef.current ? 1 : 0, px = 0, py = 0, tx = 0, ty = 0, W = 0, H = 0, ratio = 1;

    // posizioni delle etichette: anche prima che la GPU sia pronta (il contenuto non aspetta il 3D)
    const place = () => {
      if (!W || !H) return;
      const c = camera(W / H, px, py);
      STEPS.forEach((s, i) => {
        const top = s.c[1] + s.h[1], front = s.c[2] + s.h[2];
        const a = project(c, [s.c[0] - s.h[0], top, front], W, H), b = project(c, [s.c[0] + s.h[0], top, front], W, H), t = project(c, [s.c[0], top, s.c[2]], W, H);
        const f = project(c, [s.c[0], s.c[1] + 0.06, front], W, H);
        const p = plateEls.current[i], n = numEls.current[i];
        if (p && a && b && t) { p.style.width = `${Math.max(90, (b.x - a.x) * 0.94)}px`; p.style.transform = `translate(${t.x}px, ${Math.min(a.y, t.y) - 10}px) translate(-50%, -100%)`; }
        if (n && f) { n.style.transform = `translate(${f.x}px, ${f.y}px) translate(-50%, -50%)`; n.style.fontSize = `${Math.max(18, f.scale * s.h[1] * 0.95)}px`; }
      });
    };
    placeRef.current = place;
    const fit = () => {
      W = el.clientWidth; H = el.clientHeight; ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
      view?.resize(W, H, ratio); place();
    };
    const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(el);
    cleanups.push(() => ro?.disconnect());
    fit();
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)); ty = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
    };
    const leave = () => { tx = 0; ty = 0; };
    el.addEventListener("pointermove", move, { passive: true }); el.addEventListener("pointerleave", leave);
    cleanups.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); });

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
      view.onScale = () => view?.resize(W, H, ratio);
      view.resize(W, H, ratio);
      const t0 = performance.now();
      let last = t0, first = true;
      cleanups.push(renderLoop((now) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        night += ((darkRef.current ? 1 : 0) - night) * (1 - Math.exp(-dt * 2.2)); // passaggio graduale tra sole e luna
        px += (tx - px) * (1 - Math.exp(-dt * 3)); py += (ty - py) * (1 - Math.exp(-dt * 3));
        if (!view!.render((now - t0) / 1000, night, px, py, 1000 / 60)) return;
        place();
        if (first) { first = false; el.appendChild(cv); requestAnimationFrame(() => { cv.style.opacity = "1"; }); setShown(true); }
      }, () => 60, el, () => { last = performance.now(); }));
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
    <div ref={host} className={`podium3d ${shown ? "on" : ""}`}>
      <div className="podium3d-bg" aria-hidden="true" />
      {order.map((i) => (
        <span key={`n${i}`} ref={(n) => { numEls.current[i] = n; }} className={`podium3d-num r${i + 1}`} aria-hidden="true">{i + 1}</span>
      ))}
      {order.map((i) => plates[i] ? (
        <div key={`p${i}`} ref={(p) => { plateEls.current[i] = p; }} className={`podium3d-plate r${i + 1}`}>{plates[i]}</div>
      ) : null)}
    </div>
  );
}
