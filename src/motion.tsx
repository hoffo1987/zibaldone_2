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
const sheetFrames = (from: Rect, to: Rect, r0: number, r1: number): Keyframe[] => {
  const w = Math.min(from.width, to.width), h = Math.min(from.height, to.height);
  return [
    { transform: `translate(${from.left - to.left}px,${from.top - to.top}px)`, clipPath: `inset(0px ${to.width - w}px ${to.height - h}px 0px round ${r0}px)` },
    { transform: "translate(0px,0px)", clipPath: `inset(0px 0px 0px 0px round ${r1}px)` },
  ];
};
export const openSheet = (panel: HTMLElement, from: Rect | null) => {
  panel.getAnimations().forEach((a) => a.cancel());
  if (!moving()) return;
  const to = rectOf(panel);
  if (!from || !to || !onScreen(from)) {
    run(panel, [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: DUR.base, easing: EASE.land });
    return;
  }
  run(panel, sheetFrames(from, to, 14, 18), { duration: DUR.sheet, easing: EASE.land });
};
// Il foglio torna nella sua scheda (se è ancora visibile nell'archivio), altrimenti scende e svanisce.
export const closeSheet = (panel: HTMLElement, id: string): Promise<void> => {
  panel.getAnimations().forEach((a) => a.cancel());
  if (!moving()) return Promise.resolve();
  const home = document.querySelector<HTMLElement>(`[data-doc="${(window as any).CSS?.escape ? CSS.escape(id) : id}"]`);
  const tgt = rectOf(home?.querySelector(".paper") || home), to = rectOf(panel);
  const a = tgt && to && onScreen(tgt)
    ? run(panel, sheetFrames(tgt, to, 14, 18).reverse(), { duration: DUR.base, easing: EASE.trace, fill: "forwards" })
    : run(panel, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(14px)" }], { duration: 240, easing: EASE.exit, fill: "forwards" });
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

export const MOTION_CSS = `
/* ===== Il Circuito · sistema di movimento ===== */
.root{--e-trace:cubic-bezier(.65,0,.35,1);--e-land:cubic-bezier(.16,1,.3,1);--e-exit:cubic-bezier(.55,0,.75,.2)}
@keyframes settle{from{opacity:0;transform:translateY(14px)}}
@keyframes fd{from{opacity:0}to{opacity:1}}
@keyframes fdo{to{opacity:0}}
@keyframes railIn{from{transform:scaleY(0)}}
@keyframes traceX{from{transform:scaleX(0)}}
@keyframes nodeOn{from{transform:scale(0)}}

/* la riga: titoli in maschera */
.wdw{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.14em;margin-bottom:-.14em}
.wd{display:inline-block;animation:wdIn .72s var(--e-land) backwards;animation-delay:calc(var(--wd0,60ms) + var(--i,0)*55ms)}
@keyframes wdIn{from{transform:translateY(108%)}}

/* pagine: la sezione arriva dal lato verso cui ti sposti nel menu; sotto il titolo, la pista della sezione */
.pg{position:relative;animation:pgIn .52s var(--e-land) backwards}
@keyframes pgIn{from{opacity:0;transform:translateX(var(--pdx,0px))}}
.pg-trace{position:relative;display:block;height:9px;margin:-1.25rem 0 2rem}
.pg-trace:before{content:"";position:absolute;left:4px;right:0;top:4px;height:1px;background:linear-gradient(90deg,var(--ac),color-mix(in srgb,var(--ac) 30%,var(--ln)) 45%,var(--ln));transform-origin:0 50%;animation:traceX .76s var(--e-trace) .12s backwards}
.pg-trace:after{content:"";position:absolute;left:0;top:0;width:9px;height:9px;border-radius:50%;background:var(--am);box-shadow:0 0 0 3px color-mix(in srgb,var(--am) 22%,transparent);animation:nodeOn .4s var(--e-land) backwards}

/* ingresso nel Circuito: la corrente percorre il bordo, il pannello si accende dietro di lei, poi arriva il testo */
.boot{animation:bootWipe .85s cubic-bezier(.45,0,.15,1) .12s backwards}
@keyframes bootWipe{from{clip-path:inset(0 100% 0 0 round 18px)}to{clip-path:inset(0 0 0 0 round 18px)}}
.boot>.boot-run{position:absolute;left:0;right:0;top:0;height:2px;z-index:3;pointer-events:none;background:linear-gradient(90deg,transparent,#FBBF24 70%,#fff);transform-origin:0 50%;opacity:0;animation:bootRun .8s cubic-bezier(.45,0,.15,1) .05s}
@keyframes bootRun{0%{opacity:1;transform:scaleX(0)}85%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}
.boot .wd{--wd0:.42s}
.boot .b-1{animation:settle .6s var(--e-land) .3s backwards}
.boot .b-2{animation:settle .6s var(--e-land) .72s backwards}
.boot .b-3{animation:settle .6s var(--e-land) .84s backwards}
.hero-logo-in{animation:fd .8s linear .5s backwards}

/* indice in home: ogni riga si traccia sotto la precedente */
.idx{position:relative;animation:settle .5s var(--e-land) backwards;animation-delay:calc(var(--rd,0ms) + .12s + var(--i,0)*55ms)}
.idx:after{content:"";position:absolute;left:1rem;right:1rem;bottom:0;height:1px;background:var(--ln);transform-origin:0 50%;animation:traceX .6s var(--e-trace) backwards;animation-delay:calc(var(--rd,0ms) + .2s + var(--i,0)*55ms)}
.idx:last-child:after{display:none}

/* comparsa mentre scorri: si posa, senza glitch */
.rv{opacity:0}
.rv.in{opacity:1;animation:settle .6s var(--e-land) backwards}
.rv:not(.in) *{animation-play-state:paused!important}
.rv.in.fx-still{animation:none}
/* i fogli dell'archivio si stampano: la carta scende come sotto un plotter, poi arrivano titolo e dati */
.rv.in.fx-sheet{animation:fd .3s linear backwards}
/* la carta millimetrata c'è già; è la scrittura che si stampa, riga dopo riga, sotto la testina */
.fx-sheet .thumb{animation:plot .8s var(--e-trace) backwards;animation-delay:calc(var(--rd,0ms) + 60ms)}
.fx-sheet .paper:before{content:"";position:absolute;z-index:3;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,var(--ac) 12%,var(--ac) 88%,transparent);box-shadow:0 1px 6px color-mix(in srgb,var(--ac) 45%,transparent);opacity:0;pointer-events:none;animation:plotHead .8s var(--e-trace);animation-delay:calc(var(--rd,0ms) + 60ms)}
.fx-sheet .meta{animation:settle .5s var(--e-land) backwards;animation-delay:calc(var(--rd,0ms) + 260ms)}
@keyframes plot{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes plotHead{0%{opacity:.9;transform:translateY(0)}92%{opacity:.9}100%{opacity:0;transform:translateY(10rem)}}

/* schede: si sollevano appena, la pista sotto si accende da sinistra, l'angolo del foglio si piega: si può aprire */
.card{transition:transform .45s var(--e-land),box-shadow .45s var(--e-land),border-color .3s,opacity .3s}
@media (hover:hover){
.card:hover{transform:perspective(1200px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-4px);box-shadow:0 24px 44px -24px color-mix(in srgb,var(--ac) 45%,transparent),var(--sh2);border-color:color-mix(in srgb,var(--ac) 55%,var(--ln))}
.card:hover .thumb{transform:translateY(-6px)}
.card:hover .paper:after{transform:scale(1)}
}
.card:active{transform:translateY(-1px) scale(.985);transition-duration:.12s}
.card:after{height:2px;transform-origin:0 50%;transition:transform .6s var(--e-trace)}
.card .thumb{transition:transform .6s var(--e-land)}
.card .paper:after{content:"";position:absolute;right:0;bottom:0;width:22px;height:22px;z-index:2;pointer-events:none;background:linear-gradient(315deg,var(--pn) 0 50%,#DCE7E5 50%);border-top-left-radius:3px;box-shadow:-1px -1px 3px rgba(14,31,29,.12);transform:scale(0);transform-origin:100% 100%;transition:transform .35s var(--e-land)}
.card.gone{animation:file .34s var(--e-exit) forwards;pointer-events:none}
@keyframes file{to{opacity:0;transform:translateY(12px) scale(.95)}}
.back{animation:back .9s var(--e-land)}
@keyframes back{0%{box-shadow:0 0 0 2px var(--ac),var(--sh2)}100%{box-shadow:0 0 0 2px transparent,var(--sh1)}}

/* numeri che cambiano: la cifra nuova scende dalla riga */
.tick-n{display:inline-block;animation:tickN .36s var(--e-land)}
@keyframes tickN{from{opacity:0;transform:translateY(-.5em)}}

/* menu: la pista che si allunga */
.nind{position:absolute;z-index:0;border-radius:12px;pointer-events:none;opacity:0;background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 80%,#000));box-shadow:0 8px 20px -10px color-mix(in srgb,var(--ac) 80%,transparent);transition-property:top,bottom,left,right;transition-timing-function:var(--e-trace)}
.nb{z-index:1;background:transparent!important;border-color:transparent!important;box-shadow:none!important;transition:color .3s,background .2s}
.nb:hover,.nb:active{transform:none!important}
.nb.act{color:#fff}.root.dark .nb.act{color:#042f2a}
.nb:not(.act):hover{background:color-mix(in srgb,var(--ac) 8%,transparent)!important}
.nb.act svg{animation:nbIc .5s var(--e-land)}
@keyframes nbIc{from{transform:translateY(4px);opacity:.3}}

/* il lettore: il foglio si apre dalla scheda */
/* sfuma solo il fondo (colore e sfocatura), non il foglio che contiene */
.doc-ov{animation:ovIn .36s linear backwards}
.doc-ov.out{animation:ovOut .36s linear forwards;pointer-events:none}
@keyframes ovIn{from{background-color:transparent;-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0)}}
@keyframes ovOut{to{background-color:transparent;-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0)}}
.doc-hd{animation:settle .45s var(--e-land) .2s backwards}
.doc-tt{animation:ttIn .55s var(--e-land) backwards}
@keyframes ttIn{from{transform:translateY(.6em);clip-path:inset(0 0 100% 0)}to{clip-path:inset(-20% -5% -30% -5%)}}
.doc-swap{animation:swapX .42s var(--e-land) backwards}
@keyframes swapX{from{opacity:0;transform:translateX(calc(var(--dir,1)*32px))}}
.read-rail{position:absolute;left:9px;top:14px;bottom:14px;width:2px;border-radius:2px;z-index:4;pointer-events:none;background:color-mix(in srgb,var(--ac) 16%,transparent);transform-origin:50% 0;animation:railIn .76s var(--e-trace) .34s backwards}
.read-rail i{position:absolute;inset:0;border-radius:2px;background:linear-gradient(var(--ac),var(--am));transform-origin:50% 0;transform:scaleY(var(--rp,0))}
.read-rail b{position:absolute;left:50%;top:0;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:var(--ac);box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 22%,transparent);transform:translateY(calc(var(--rp,0)*var(--rh,0px)));transition:background .3s}
.read-rail.end b{background:var(--am);box-shadow:0 0 0 3px color-mix(in srgb,var(--am) 30%,transparent);animation:nodeEnd .6s var(--e-land)}
@keyframes nodeEnd{0%{transform:translateY(var(--rh,0px)) scale(1)}40%{transform:translateY(var(--rh,0px)) scale(1.6)}100%{transform:translateY(var(--rh,0px)) scale(1)}}

/* il circuito dell'autore: i suoi scritti in ordine di data, collegati da una pista */
.cx{padding:1.5rem 1.5rem 1.75rem 1.75rem;border-top:1px solid var(--ln);background:var(--sf)}
.cx-l{position:relative;margin-top:.9rem;list-style:none;padding:0}
.cx-l:before{content:"";position:absolute;left:5px;top:14px;bottom:14px;width:2px;background:color-mix(in srgb,var(--ac) 35%,var(--ln));transform-origin:50% 0}
.rv.in .cx-l:before{animation:railIn .7s var(--e-trace) .1s backwards}
.rv.in .cx-l li{animation:settle .45s var(--e-land) backwards;animation-delay:calc(.18s + var(--i,0)*60ms)}
.cx-n{display:grid;grid-template-columns:12px minmax(0,1fr) auto;align-items:center;gap:.9rem;width:100%;text-align:left;padding:.55rem .5rem .55rem 0;border-radius:10px;color:var(--ink);cursor:pointer}
.cx-n i{position:relative;z-index:1;width:12px;height:12px;border-radius:50%;background:var(--sf);border:2px solid var(--ac);transition:transform .3s var(--e-land),background .25s}
.cx-n .cx-t{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .2s}
.cx-n:hover i,.cx-n:focus-visible i{transform:scale(1.3);background:var(--ac)}
.cx-n:hover .cx-t{color:var(--ac)}
.cx-n:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
.cx-n[aria-current]{cursor:default}
.cx-n[aria-current] i{background:var(--am);border-color:var(--am);box-shadow:0 0 0 4px color-mix(in srgb,var(--am) 25%,transparent);transform:none}
.cx-n[aria-current] .cx-t{color:var(--ink)}

/* caricamento: fogli vuoti attraversati da una luce */
.skel{position:relative;overflow:hidden;height:15.5rem;border-radius:18px;border:1px solid var(--ln);background:var(--pn);animation:settle .5s var(--e-land) backwards;animation-delay:calc(var(--i,0)*70ms)}
.skel>span{position:absolute;left:0;right:0;top:0;height:10rem;background:#fff;background-image:linear-gradient(rgba(15,139,122,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(15,139,122,.1) 1px,transparent 1px);background-size:20px 20px;border-bottom:1px solid var(--ln)}
.skel:after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,color-mix(in srgb,var(--ac) 12%,transparent) 50%,transparent 70%);transform:translateX(-100%);animation:skel 1.5s var(--e-trace) infinite;animation-delay:calc(var(--i,0)*120ms)}
@keyframes skel{to{transform:translateX(100%)}}

/* finestre e avvisi: salgono di poco e si posano */
@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.985)}}
@keyframes popx{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes up{from{opacity:0;transform:translateY(16px)}}
.pop{animation:pop .42s var(--e-land) both}
.popx{animation:popx .36s var(--e-land) both}
.up{animation:up .6s var(--e-land) both}

/* interruttori di stato: le stelle si accendono in sequenza, come LED */
.st-on{animation:stOn .45s var(--e-land) backwards;animation-delay:calc(var(--n,0)*45ms)}
@keyframes stOn{0%{transform:scale(.4);opacity:.3}60%{transform:scale(1.18)}100%{transform:none}}

/* interruttori globali del pannello Opzioni */
.root.noreveal .fx-sheet .thumb,.root.noreveal .fx-sheet .paper:before,.root.noreveal .fx-sheet .meta,.root.noreveal .idx,.root.noreveal .idx:after,.root.noreveal .boot,.root.noreveal .boot *,.root.noreveal .cx-l:before,.root.noreveal .cx-l li,.root.noreveal .skel{animation:none!important}
.root.noreveal .boot-run{display:none}
.root.nopages .pg,.root.nopages .pg-trace:before,.root.nopages .pg-trace:after,.root.nopages .doc-swap{animation:none!important}
.root.nolift .card:hover{transform:perspective(1200px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}
.root.nolift .card:hover .thumb{transform:none}
@media (max-width:767px){.card:hover{transform:none}}
@media (prefers-reduced-motion:reduce){.read-rail b{transition:none}.rv,.wd{opacity:1;transform:none}}
`;
