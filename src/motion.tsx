import React, { useEffect, useLayoutEffect, useRef } from "react";

// ===== IL MOVIMENTO DEL CIRCUITO =====
// Il sito è un quaderno tecnico: gli scritti sono fogli di carta millimetrata e il circuito è il filo che li tiene insieme.
// Tre regole guidano ogni animazione:
//   1. la PISTA: ogni cambio di stato è portato da una linea che parte da un nodo e arriva a destinazione
//      (menu, intestazioni delle pagine, apertura dei fogli, avanzamento della lettura, indice dell'autore);
//   2. il FOGLIO: un documento si apre dal punto in cui si trova e ci ritorna quando lo chiudi;
//   3. la RIGA: la tipografia emerge dalla propria riga (maschera), non sfuma né ruota.
// Tre curve e quattro durate, sempre le stesse.
export const DUR = { tick: 140, base: 420, sheet: 560, trace: 760 };
export const EASE = {
  trace: "cubic-bezier(.65,0,.35,1)", // pista: parte, corre, si assesta. Simmetrica, senza rimbalzi
  land: "cubic-bezier(.16,1,.3,1)", // foglio che si posa: deciso all'inizio, morbido all'arrivo
  exit: "cubic-bezier(.55,0,.75,.2)", // uscita: si allontana accelerando
};

// stato globale scritto da App a ogni render: animazioni spente (preset "Leggero" o interruttore) e velocità
export const M = { off: false, spd: 1 };
const reduced = () => { try { return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
export const moving = () => !M.off && !reduced() && typeof (Element.prototype as any).animate === "function";
const ms = (d: number) => d / (M.spd || 1);
// id "m": il regolatore di velocità globale di App non deve riscalare queste animazioni (la durata è già scalata qui)
const run = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => el.animate(k, { ...o, id: "m", duration: ms(Number(o.duration) || DUR.base) });

export type Rect = { left: number; top: number; width: number; height: number };
export const rectOf = (el: Element | null | undefined): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
};
const onScreen = (r: Rect) => r.top < window.innerHeight && r.top + r.height > 0 && r.left < window.innerWidth && r.left + r.width > 0;

// Il foglio si apre dalla scheda. Il pannello è già al suo posto: lo si ritaglia sulla scheda e si allarga la finestra.
// Niente deformazioni: il testo non viene mai schiacciato, cresce solo la porzione visibile del foglio.
// La finestra di partenza è la parte del pannello che somiglia a ciò che si è toccato: se si è toccata la carta di una
// scheda è la carta del lettore (bianca, con lo stesso testo all'inizio), altrimenti l'intestazione (scura, col titolo).
// Così la scheda diventa il lettore invece di trasformarsi in un altro disegno, e alla chiusura la carta torna carta.
type Win = { x: number; y: number; w: number; h: number };
// porzione visibile della carta del lettore, in coordinate del pannello (se il testo è scorso, solo quello che si vede)
const paperWin = (panel: HTMLElement, to: Rect): Win | null => {
  const p = rectOf(panel.querySelector("[data-sheet-paper]")); if (!p) return null;
  const v = rectOf(panel.querySelector("[data-sheet-scroll]")) || to;
  const top = Math.max(p.top, v.top, to.top), bottom = Math.min(p.top + p.height, v.top + v.height, to.top + to.height);
  const left = Math.max(p.left, to.left), right = Math.min(p.left + p.width, to.left + to.width);
  return bottom - top < 24 || right - left < 24 ? null : { x: left - to.left, y: top - to.top, w: right - left, h: bottom - top };
};
const sheetFrames = (from: Rect, to: Rect, win: Win | null, r0: number, r1: number): Keyframe[] => {
  const a = win || { x: 0, y: 0, w: to.width, h: to.height };
  const w = Math.min(from.width, a.w), h = Math.min(from.height, a.h);
  return [
    { transform: `translate(${from.left - to.left - a.x}px,${from.top - to.top - a.y}px)`, clipPath: `inset(${a.y}px ${to.width - a.x - w}px ${to.height - a.y - h}px ${a.x}px round ${r0}px)` },
    { transform: "translate(0px,0px)", clipPath: `inset(0px 0px 0px 0px round ${r1}px)` },
  ];
};
// paper: si è partiti dalla carta di una scheda
const mobileReader = () => window.matchMedia?.("(max-width:767px)").matches;
const readerText = (panel: HTMLElement) => panel.querySelector<HTMLElement>("[data-sheet-paper] > .rt");
export const openSheet = (panel: HTMLElement, from: Rect | null, paper = false) => {
  panel.getAnimations().forEach((a) => a.cancel());
  if (!moving()) return;
  // Il lettore mobile è a tutto schermo: cornice e carta restano opache e ferme.
  // Ritagliare o sfumare il pannello intero esponeva la pagina dietro all'intestazione.
  if (mobileReader()) {
    const text = readerText(panel);
    if (text) run(text, [{ transform: "translateY(10px)" }, { transform: "none" }], { duration: DUR.base, easing: EASE.land });
    return;
  }
  const to = rectOf(panel);
  if (!from || !to || !onScreen(from)) {
    run(panel, [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: DUR.base, easing: EASE.land });
    return;
  }
  run(panel, sheetFrames(from, to, paper ? paperWin(panel, to) : null, 14, 18), { duration: DUR.sheet, easing: EASE.land });
  // nei primi istanti il foglio si sovrappone alla scheda in dissolvenza: il testo cambia corpo senza scatti
  run(panel, [{ opacity: 0 }, { opacity: 1, offset: 0.26 }, { opacity: 1 }], { duration: DUR.sheet, easing: "linear" });
};
// Il foglio torna nella sua scheda (se è ancora visibile nell'archivio), altrimenti scende e svanisce.
export const closeSheet = (panel: HTMLElement, id: string): Promise<void> => {
  panel.getAnimations().forEach((a) => a.cancel());
  if (!moving()) return Promise.resolve();
  if (mobileReader()) {
    const text = readerText(panel);
    return text ? run(text, [{ transform: "none" }, { transform: "translateY(8px)" }], { duration: 180, easing: EASE.exit }).finished.then(() => {}, () => {}) : Promise.resolve();
  }
  const home = document.querySelector<HTMLElement>(`[data-doc="${(window as any).CSS?.escape ? CSS.escape(id) : id}"]`);
  const sheet = home?.querySelector(".paper"), tgt = rectOf(sheet || home), to = rectOf(panel);
  let a: Animation;
  if (tgt && to && onScreen(tgt)) {
    a = run(panel, sheetFrames(tgt, to, sheet ? paperWin(panel, to) : null, 14, 18).reverse(), { duration: DUR.base, easing: EASE.trace, fill: "forwards" });
    // arrivato sulla scheda il foglio si scioglie in lei
    run(panel, [{ opacity: 1 }, { opacity: 1, offset: 0.68 }, { opacity: 0 }], { duration: DUR.base, easing: "linear", fill: "forwards" });
  } else a = run(panel, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px)" }], { duration: 240, easing: EASE.exit, fill: "forwards" });
  return a.finished.then(() => {
    // la scheda che riceve il foglio si accende per un attimo: l'occhio ritrova il punto da cui era partito
    if (tgt && home) { const c = home.closest<HTMLElement>(".card") || home; c.classList.remove("back"); void c.offsetWidth; c.classList.add("back"); setTimeout(() => c.classList.remove("back"), 900); }
  }, () => {});
};

// FLIP della griglia: quando ricerca, filtri o ordinamento cambiano i risultati, le schede che restano scivolano
// nella nuova posizione invece di saltare. La lettura delle posizioni avviene durante il render (prima che il DOM cambi),
// come farebbe getSnapshotBeforeUpdate; le schede nuove entrano con la loro animazione di stampa.
type Snap = { host: Element; at: Map<string, { x: number; y: number }> };
const measure = (host: HTMLElement | null): Snap | null => {
  if (!host) return null;
  const b = host.getBoundingClientRect(), at = new Map<string, { x: number; y: number }>();
  host.querySelectorAll<HTMLElement>(":scope > [data-flip]").forEach((c) => { const r = c.getBoundingClientRect(); at.set(c.dataset.flip!, { x: r.left - b.left, y: r.top - b.top }); });
  return { host, at };
};
export const useFlip = (ref: React.RefObject<HTMLElement>, key: string) => {
  const last = useRef(key), snap = useRef<Snap | null>(null), live = useRef(new WeakMap<Element, Animation>());
  if (last.current !== key) { last.current = key; snap.current = moving() ? measure(ref.current) : null; }
  useLayoutEffect(() => {
    const s = snap.current; snap.current = null;
    const host = ref.current;
    if (!s || !host || s.host !== host) return; // pagina diversa: niente scivolamenti tra un elenco e l'altro
    const kids = Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-flip]"));
    kids.forEach((c) => live.current.get(c)?.cancel());
    const b = host.getBoundingClientRect();
    let n = 0;
    kids.forEach((c) => {
      const a = s.at.get(c.dataset.flip!); if (!a || n > 36) return;
      const r = c.getBoundingClientRect(), dx = a.x - (r.left - b.left), dy = a.y - (r.top - b.top);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (r.top > window.innerHeight + 200 && a.y + b.top > window.innerHeight + 200) return; // fuori schermo prima e dopo
      n++;
      live.current.set(c, run(c, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0px,0px)" }], { duration: DUR.sheet, easing: EASE.land }));
    });
  }, [key]);
};

// La pista del menu: l'indicatore della voce attiva non salta, si allunga verso la destinazione (il bordo che va avanti
// parte per primo) e poi si stringe, come una corrente che passa da un contatto all'altro.
export const useRail = (ref: React.RefObject<HTMLElement>, axis: "v" | "h", key: string) => {
  const prev = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current; if (!box) { prev.current = null; return; }
    const ind = box.querySelector<HTMLElement>(":scope > .nind"); if (!ind) return;
    const place = (anim: boolean) => {
      const act = box.querySelector<HTMLElement>(":scope > [data-act='1']");
      if (!act || !act.offsetWidth) { ind.style.opacity = "0"; prev.current = null; return; }
      const W = box.clientWidth, H = box.clientHeight, x = act.offsetLeft, y = act.offsetTop, w = act.offsetWidth, h = act.offsetHeight;
      const p = prev.current, go = anim && !!p && moving();
      const fwd = p ? (axis === "v" ? y > p.y : x > p.x) : true, lag = `${Math.round(ms(110))}ms`;
      // ordine delle proprietà: top, bottom, left, right
      ind.style.transitionDuration = go ? `${Math.round(ms(DUR.base))}ms` : "0ms";
      ind.style.transitionDelay = !go ? "0ms" : axis === "v" ? (fwd ? `${lag},0ms,0ms,0ms` : `0ms,${lag},0ms,0ms`) : (fwd ? `0ms,0ms,${lag},0ms` : `0ms,0ms,0ms,${lag}`);
      ind.style.top = `${y}px`; ind.style.bottom = `${H - y - h}px`; ind.style.left = `${x}px`; ind.style.right = `${W - x - w}px`; ind.style.opacity = "1";
      prev.current = { x, y };
    };
    place(true);
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => place(false)) : null; ro?.observe(box);
    return () => ro?.disconnect();
  }, [key]);
};

// Avanzamento della lettura: una pista nel margine del foglio che si riempie mentre scorri; arrivata in fondo il nodo diventa ambra.
export const useReadTrace = (scroll: React.RefObject<HTMLElement>, rail: React.RefObject<HTMLElement>, key: any) => {
  useEffect(() => {
    const s = scroll.current, r = rail.current; if (!s || !r) return;
    let raf = 0;
    const upd = () => {
      raf = 0;
      const m = s.scrollHeight - s.clientHeight, p = m > 8 ? Math.min(1, Math.max(0, s.scrollTop / m)) : 1;
      r.style.setProperty("--rp", p.toFixed(4)); r.style.setProperty("--rh", `${r.clientHeight}px`);
      r.classList.toggle("end", p > 0.985);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(upd); };
    upd();
    s.addEventListener("scroll", on, { passive: true });
    const ro = "ResizeObserver" in window ? new ResizeObserver(on) : null;
    if (ro) { ro.observe(s); Array.from(s.children).forEach((c) => ro.observe(c)); }
    return () => { s.removeEventListener("scroll", on); ro?.disconnect(); cancelAnimationFrame(raf); };
  }, [key]);
};

// Titoli che emergono dalla propria riga, parola per parola (maschera tipografica, senza dissolvenze né rotazioni)
export const Words = ({ text, on = true }: { text: string; on?: boolean }) => {
  if (!on) return <>{text}</>;
  const w = text.split(" ");
  return (
    <React.Fragment key={text}>
      {w.map((x, i) => <React.Fragment key={i}><span className="wdw"><span className="wd" style={{ ["--i" as any]: i }}>{x}</span></span>{i < w.length - 1 ? " " : ""}</React.Fragment>)}
    </React.Fragment>
  );
};

// Fogli in arrivo mentre l'archivio si carica: la stessa forma delle schede, con una luce che li attraversa
export const Sheets = ({ n = 3 }: { n?: number }) => (
  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" role="status" aria-label="Caricamento">
    {Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ ["--i" as any]: i }}><span /></div>)}
  </div>
);
