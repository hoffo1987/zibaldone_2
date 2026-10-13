import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Volume2, VolumeX, ChevronRight } from "lucide-react";
import * as sound from "../sound";
import { Text3D } from "../d3";
import { createFilm, Film, FilmText, MUSIC } from "./film";
import "./tour.css";

// ===== LA PRESENTAZIONE DEL PRIMO ACCESSO =====
// Due tempi. Il film (film.ts): quindici secondi a tempo col jingle, il Circuito si accende e racconta cosa si fa qui.
// Poi il tour guidato: la scena si spegne in un nodo ambra che vola sul primo elemento vero del sito, e da lì una pista
// collega ogni spiegazione all'elemento di cui parla, sezione dopo sezione.

type Step = { tab: string; target: string; title: string; body: string };
const STUDENT: Step[] = [
  { tab: "home", target: "nav-home", title: "Panoramica", body: "I tuoi numeri e gli ultimi progetti, sempre aggiornati. Da qui parte tutto." },
  { tab: "write", target: "editor-mode", title: "Scrivi o disegna", body: "Scrivi come su un quaderno, aggiungi foto, oppure passa a Disegno: penna, forme, colori e gomma." },
  { tab: "write", target: "save", title: "Salva il progetto", body: "Mentre scrivi la bozza si salva da sola. Quando hai finito, salva: il progetto entra nell'archivio del mese." },
  { tab: "my_pages", target: "nav-my_pages", title: "I miei progetti", body: "Ritrovi tutto qui: cerca, filtra per mese, riapri e modifica. Dopo la lettura vedrai anche il voto." },
  { tab: "home", target: "bell", title: "Notifiche", body: "Quando un tuo scritto riceve un voto, la campanella te lo dice." },
  { tab: "home", target: "options", title: "Opzioni", body: "Tema chiaro o scuro, effetti, musica e suoni. Da qui puoi anche rivedere questa presentazione." },
  { tab: "home", target: "cta", title: "Tocca a te", body: "Il Circuito è acceso. Il primo progetto ti aspetta." },
];
const ADMIN: Step[] = [
  { tab: "home", target: "nav-home", title: "Panoramica", body: "Scritti arrivati, autori e quanti ne restano da valutare questo mese." },
  { tab: "read", target: "nav-read", title: "Tutti gli scritti", body: "Gli autori restano nascosti: leggi, dai da una a cinque stelle e solo dopo svela chi ha scritto." },
  { tab: "read", target: "filters", title: "Filtri e segnalibri", body: "Cerca, ordina per voto o per data, mostra solo i segnalati o quelli ancora da valutare." },
  { tab: "podio", target: "nav-podio", title: "Podio del mese", body: "I testi più votati salgono qui, mese per mese." },
  { tab: "authors", target: "nav-authors", title: "Autori", body: "Chi scrive, quanto scrive e con che media." },
  { tab: "home", target: "options", title: "Opzioni", body: "Tema chiaro o scuro, effetti, musica e suoni. Da qui puoi anche rivedere questa presentazione." },
  { tab: "home", target: "hero-actions", title: "Si comincia", body: "Gli scritti del mese ti aspettano. Buona lettura." },
];
const filmText = (admin: boolean, name: string): FilmText => ({
  stations: admin
    ? [{ word: "Leggi", line: "gli scritti arrivano con l'autore nascosto", icon: "eye" }, { word: "Vota", line: "da una a cinque stelle, poi svela chi ha scritto", icon: "star" }, { word: "Premia", line: "il podio del mese mette in luce i migliori", icon: "cup" }]
    : [{ word: "Scrivi", line: "testo, foto e disegni nello stesso foglio", icon: "pen" }, { word: "Conserva", line: "ogni progetto resta nel tuo archivio", icon: "stack" }, { word: "Emergi", line: "ogni mese i testi migliori vengono letti e premiati", icon: "star" }],
  hello: name ? `Ciao, ${name}` : "Ciao!",
  stamps: ["Scrivi.", "Leggi.", "Scegli."],
  tag: "Ogni mese.",
});
const captions = (f: FilmText): [number, string][] => [
  [0.15, "Il Circuito si accende."],
  [1.22, "Il Circuito"],
  ...f.stations.map((s, i) => [[MUSIC.s1, MUSIC.s2, MUSIC.s3][i], `${s.word}: ${s.line}.`] as [number, string]),
  [MUSIC.drop, `${f.hello}.`],
  [MUSIC.k1, "Scrivi, leggi, scegli. Ogni mese."],
];

// elemento visibile con quel data-tour (sidebar e barra mobile hanno gli stessi: vale quello che si vede)
const findTarget = (id: string): HTMLElement | null => {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
  return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.getClientRects().length > 0; }) || null;
};

// mode: "auto" film e poi tour (primo accesso), "film" solo il filmato, "guide" solo il tour guidato (dalle Opzioni)
export type TourMode = "auto" | "film" | "guide";
export type TourProps = { mode: TourMode; admin: boolean; name: string; calm: boolean; low: boolean; nav: (tab: string) => void; hold: (on: boolean) => void; onDone: (to?: string) => void };

export default function Tour({ mode, admin, name, calm, low, nav, hold, onDone }: TourProps) {
  const steps = admin ? ADMIN : STUDENT;
  const [phase, setPhase] = useState<"prep" | "gate" | "film" | "guide">(mode === "guide" ? "guide" : "prep");
  const [muted, setMuted] = useState(!sound.enabled());
  const [caption, setCaption] = useState("");
  const [pressed, setPressed] = useState(false);
  const host = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), prog = useRef<HTMLElement>(null), spark = useRef<HTMLElement>(null);
  const power = useRef<HTMLButtonElement>(null), hint = useRef<HTMLParagraphElement>(null);
  const film = useRef<Film | null>(null);
  const clock = useRef<{ voice: ReturnType<typeof sound.play>; t0: number; lead: number; paused: number; hiddenAt: number }>({ voice: null, t0: 0, lead: 0, paused: 0, hiddenAt: 0 });
  const done = useRef(onDone); done.current = onDone;
  const holdRef = useRef(hold); holdRef.current = hold;
  const text = useRef(filmText(admin, name)).current;

  // il volume della musica di sottofondo scende per tutta la presentazione
  useEffect(() => {
    if (mode === "guide") return;
    sound.duck("intro", sound.DUCK.intro);
    return () => { sound.duck("intro", null); holdRef.current(false); };
  }, []);

  // preparazione: font delle scritte e jingle, poi il buio con il pulsante d'accensione
  useEffect(() => {
    if (mode === "guide") return;
    let off = false;
    sound.preload("intro");
    const fonts = (document as any).fonts;
    const ready = fonts ? Promise.race([Promise.all(["600 100px Unbounded", "700 100px 'Bricolage Grotesque'", "600 100px 'Instrument Sans'"].map((f) => fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
    ready.then(() => {
      if (off || !cv.current) return;
      film.current = createFilm(cv.current, { text, calm, low });
      setPhase("gate");
    });
    // ruotando il telefono le scritte si ridisegnano per la nuova inquadratura (una volta sola, a rotazione finita)
    let timer = 0;
    const rs = () => { clearTimeout(timer); timer = window.setTimeout(() => film.current?.resize(), 150); };
    window.addEventListener("resize", rs);
    return () => { off = true; clearTimeout(timer); window.removeEventListener("resize", rs); clock.current.voice?.stop(0.4); film.current?.dispose(); film.current = null; };
  }, []);

  // l'attesa al buio: il pulsante 3D respira, il vero pulsante (invisibile) gli sta sopra per mouse, tastiera e lettori di schermo
  useEffect(() => {
    if (phase !== "gate") return;
    let raf = 0;
    const frame = () => {
      const f = film.current; if (!f) return;
      f.draw(-1);
      const b = f.button(), p = power.current, h = hint.current;
      if (b && p) { p.style.transform = `translate(${(b.x - b.r * 1.25).toFixed(1)}px,${(b.y - b.r * 1.25).toFixed(1)}px)`; p.style.width = p.style.height = `${(b.r * 2.5).toFixed(1)}px`; }
      if (b && h) h.style.transform = `translate(-50%,${(b.y + b.r * 1.5).toFixed(1)}px)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    power.current?.focus({ preventScroll: true } as any);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const now = () => {
    const c = clock.current;
    return c.voice ? sound.now() - c.voice.at + c.voice.off - c.lead : (performance.now() - c.t0 - c.paused) / 1000;
  };
  const started = useRef(false);
  const start = (music: boolean) => {
    if (started.current) return;
    started.current = true;
    const c = clock.current, b = sound.buffer("intro");
    // se il decoder aggiunge qualche millisecondo di silenzio in testa, lo tolgo dall'orologio
    c.lead = b ? Math.max(0, Math.min(0.1, b.duration - 14.7735)) : 0;
    c.voice = music ? sound.play("intro", { when: sound.now() + 0.06 }) : null;
    c.t0 = performance.now() + (music ? 0 : 60);
    setMuted(!c.voice);
    holdRef.current(true);
    setPhase("film");
  };
  // la pressione: il tasto affonda, e appena il jingle è pronto si accende la luce
  const powerOn = (withMusic: boolean) => {
    if (pressed) return;
    sound.unlock(); // nello stesso gesto: su iPhone è l'unico modo per avere l'audio
    setPressed(true);
    film.current?.gate({ press: true });
    const min = new Promise((r) => setTimeout(r, 260));
    if (!withMusic || !sound.enabled()) { min.then(() => start(false)); return; }
    const late = setTimeout(() => start(false), 2500);
    Promise.all([sound.load("intro"), min]).then(([b]) => { clearTimeout(late); start(!!b && sound.running()); });
  };
  const toggleMute = () => {
    const c = clock.current, t = Math.max(0, now());
    if (c.voice) { c.voice.stop(0.25); c.voice = null; c.t0 = performance.now() - t * 1000; c.paused = 0; setMuted(true); return; }
    sound.unlock();
    // se il jingle non è ancora pronto (si era scelto di guardare senza audio) lo si decodifica e si entra al punto giusto
    const resume = () => { if (clock.current.voice) return; const t2 = Math.max(0, now()), v = sound.play("intro", { offset: t2 + 0.05, when: sound.now() + 0.05, force: true }); if (v) { c.voice = v; setMuted(false); } };
    if (sound.buffer("intro")) resume(); else sound.load("intro").then(resume);
  };
  // fine del film: col primo accesso si passa al tour guidato, rivedendo solo il filmato si torna al sito
  const finish = () => {
    if (mode === "film") { host.current?.classList.add("tr-out"); setTimeout(() => done.current(), 460); return; }
    setPhase("guide");
  };

  // il film: un fotogramma per ogni frame dello schermo, con il tempo letto dalla musica
  useEffect(() => {
    if (phase !== "film") return;
    let raf = 0, cap = -1, landed = false, ended = false, freed = false;
    const caps = captions(text), body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const vis = () => { const c = clock.current; if (c.voice) return; if (document.hidden) c.hiddenAt = performance.now(); else if (c.hiddenAt) { c.paused += performance.now() - c.hiddenAt; c.hiddenAt = 0; } };
    document.addEventListener("visibilitychange", vis);
    const frame = () => {
      const t = now();
      film.current?.draw(t);
      if (prog.current) prog.current.style.transform = `scaleX(${Math.min(1, Math.max(0, t / MUSIC.end)).toFixed(4)})`;
      let k = -1; caps.forEach(([at], i) => { if (t >= at) k = i; });
      if (k !== cap) { cap = k; if (k >= 0) setCaption(caps[k][1]); }
      // sul finale la pagina riprende a muoversi sotto la scena: le sue animazioni d'ingresso partono mentre il film svanisce
      if (t >= MUSIC.out && !freed) { freed = true; holdRef.current(false); }
      if (t >= 14.05 && !landed && mode !== "film") { landed = true; land(); }
      if (t >= MUSIC.end + 0.05 && !ended) { ended = true; finish(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); document.body.style.overflow = body; };
  }, [phase]);

  // il nodo ambra lascia la scheda e vola sul primo elemento del tour; la scena intanto si spegne
  const land = () => {
    host.current?.classList.add("tr-out");
    const from = film.current?.node(), el = findTarget(steps[0].target), s = spark.current;
    if (!from || !el || !s || !s.animate) return;
    const r = el.getBoundingClientRect(), to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    s.style.display = "block";
    s.animate([
      { transform: `translate(${from.x}px,${from.y}px) scale(1.4)`, opacity: 1 },
      { transform: `translate(${(from.x + to.x) / 2}px,${Math.min(from.y, to.y) - 60}px) scale(1.1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${to.x}px,${to.y}px) scale(.6)`, opacity: 0 },
    ], { duration: 620, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
  };
  const skip = () => {
    const c = clock.current; c.voice?.stop(0.6); c.voice = null;
    holdRef.current(false);
    host.current?.classList.add("tr-out");
    if (mode === "film") { setTimeout(() => done.current(), 340); return; }
    setTimeout(() => setPhase("guide"), 320);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key !== "Escape" || phase === "guide") return; e.stopPropagation(); if (phase === "film") skip(); else done.current(); };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [phase]);

  return (
    <div ref={host} className={`tour ${phase === "guide" ? "tr-guide" : ""}`} role="dialog" aria-modal="true" aria-label="Presentazione del Circuito">
      {phase !== "guide" && <div className="tr-film">
        <canvas ref={cv} aria-hidden="true" />
        <i className="tr-vig" aria-hidden="true" />
        <i ref={prog} className="tr-prog" aria-hidden="true" />
        <p className="sr-only" aria-live="polite">{caption}</p>
        {phase === "gate" && <>
          <button ref={power} type="button" className="tr-power3d" onClick={() => powerOn(true)} aria-label="Accendi il Circuito: parte la presentazione con musica"
            onPointerEnter={() => film.current?.gate({ hover: true })} onPointerLeave={() => film.current?.gate({ hover: false })}
            onFocus={() => film.current?.gate({ hover: true })} onBlur={() => film.current?.gate({ hover: false })} />
          <p ref={hint} className={`tr-hint ${pressed ? "off" : ""}`} aria-hidden="true">Premi per accendere</p>
          {!pressed && <button type="button" className="tr-link tr-silent" onClick={() => powerOn(false)}>Guarda senza audio</button>}
        </>}
        {phase === "film" && <div className="tr-bar">
          <button type="button" className="tr-btn" onClick={toggleMute} aria-label={muted ? "Attiva l'audio" : "Disattiva l'audio"}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button type="button" className="tr-btn" onClick={skip} autoFocus>{mode === "film" ? "Chiudi" : "Salta intro"}<ChevronRight size={15} /></button>
        </div>}
        {phase !== "film" && !pressed && <button type="button" className="tr-btn tr-close" onClick={() => done.current()}>{mode === "film" ? "Chiudi" : "Salta"}</button>}
      </div>}
      <i ref={spark} className="tr-spark" aria-hidden="true" />
      {phase === "guide" && <Guide steps={steps} nav={nav} onDone={(to) => done.current(to)} admin={admin} />}
    </div>
  );
}

// ===== IL TOUR GUIDATO =====
// Il buio copre il sito tranne l'elemento di cui si parla; il foro si sposta da un elemento all'altro e una pista con la
// sua corrente collega la scheda della spiegazione al foro. Si avanza col pulsante o con le frecce, Esc chiude.
const PAD = 8, GAP = 30;
type Box = { x: number; y: number; w: number; h: number };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 4);
const rrect = (b: Box, r: number) => { r = Math.min(r, b.w / 2, b.h / 2); return `M${b.x + r} ${b.y}H${b.x + b.w - r}A${r} ${r} 0 0 1 ${b.x + b.w} ${b.y + r}V${b.y + b.h - r}A${r} ${r} 0 0 1 ${b.x + b.w - r} ${b.y + b.h}H${b.x + r}A${r} ${r} 0 0 1 ${b.x} ${b.y + b.h - r}V${b.y + r}A${r} ${r} 0 0 1 ${b.x + r} ${b.y}Z`; };

function Guide({ steps, nav, onDone, admin }: { steps: Step[]; nav: (tab: string) => void; onDone: (to?: string) => void; admin: boolean }) {
  const [i, setI] = useState(0);
  const dir = useRef(1);
  const svg = useRef<SVGSVGElement>(null), card = useRef<HTMLDivElement>(null), primary = useRef<HTMLButtonElement>(null);
  const hole = useRef<SVGPathElement>(null), ring = useRef<SVGPathElement>(null), run = useRef<SVGPathElement>(null), wire = useRef<SVGPathElement>(null), pulse = useRef<SVGPathElement>(null), n1 = useRef<SVGCircleElement>(null), n2 = useRef<SVGCircleElement>(null);
  const tab = useRef(""); // al primo passo si va sempre alla sua sezione (la presentazione si può rivedere da ogni pagina)
  const step = steps[i], last = i === steps.length - 1;

  // il foro parte puntiforme dove è atterrato il nodo ambra e si apre sull'elemento
  const from = useRef<Box | null>(null), cur = useRef<Box | null>(null), t0 = useRef(performance.now()), cardAt = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (step.tab !== tab.current) { tab.current = step.tab; nav(step.tab); }
    from.current = cur.current; t0.current = performance.now();
    const w = wire.current; if (w) { w.classList.remove("tg-draw"); void w.getBoundingClientRect(); w.classList.add("tg-draw"); }
    primary.current?.focus({ preventScroll: true } as any);
  }, [i]);

  useEffect(() => {
    let raf = 0, missing = 0, scrolled = false;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = findTarget(step.target), W = window.innerWidth, H = window.innerHeight;
      if (!el) { if (++missing > 50) { missing = 0; go(dir.current); } return; } // dopo ~0,8 s senza bersaglio salto il passo
      missing = 0;
      // un gruppo di pulsanti va a capo e occupa tutta la riga: il foro abbraccia solo i pulsanti
      let r: { left: number; top: number; right: number; bottom: number; width: number; height: number } = el.getBoundingClientRect();
      if (el.dataset.tourFit != null && el.children.length) {
        const rs = Array.from(el.children).map((k) => k.getBoundingClientRect()).filter((q) => q.width > 0);
        if (rs.length) { const L = Math.min(...rs.map((q) => q.left)), T = Math.min(...rs.map((q) => q.top)), Rr = Math.max(...rs.map((q) => q.right)), B = Math.max(...rs.map((q) => q.bottom)); r = { left: L, top: T, right: Rr, bottom: B, width: Rr - L, height: B - T }; }
      }
      if (!scrolled && (r.top < 70 || r.bottom > H - 90)) { scrolled = true; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
      const target: Box = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
      const k = ease((performance.now() - t0.current) / 560), a = from.current || { x: target.x + target.w / 2, y: target.y + target.h / 2, w: 0, h: 0 };
      const b: Box = { x: lerp(a.x, target.x, k), y: lerp(a.y, target.y, k), w: lerp(a.w, target.w, k), h: lerp(a.h, target.h, k) };
      cur.current = b;
      const rad = Math.min(18, b.h / 2), d = rrect(b, rad);
      hole.current?.setAttribute("d", `M0 0H${W}V${H}H0Z ${d}`);
      ring.current?.setAttribute("d", d); run.current?.setAttribute("d", d);
      // la scheda: accanto se l'elemento sta nella barra laterale, sopra se è in basso, sotto se è in alto
      const c = card.current; if (!c) return;
      const cw = c.offsetWidth, ch = c.offsetHeight, m = 16;
      let side: "r" | "a" | "b" = target.x + target.w < 320 && W >= 768 ? "r" : target.y + target.h / 2 > H * 0.55 ? "a" : "b";
      let x = side === "r" ? target.x + target.w + GAP : target.x + target.w / 2 - cw / 2, y = side === "r" ? target.y + target.h / 2 - ch / 2 : side === "a" ? target.y - GAP - ch : target.y + target.h + GAP;
      if (side === "a" && y < m) { side = "b"; y = target.y + target.h + GAP; }
      if (side === "b" && y + ch > H - m) { side = "a"; y = Math.max(m, target.y - GAP - ch); }
      x = Math.max(m, Math.min(W - cw - m, x)); y = Math.max(m, Math.min(H - ch - m, y));
      const p = cardAt.current;
      const nx = p ? lerp(p.x, x, 0.2) : x, ny = p ? lerp(p.y, y, 0.2) : y;
      cardAt.current = { x: nx, y: ny };
      c.style.transform = `translate3d(${nx.toFixed(1)}px,${ny.toFixed(1)}px,0)`;
      // la pista: dal bordo della scheda al bordo del foro, dritta e poi a 45°, come sulle schede elettroniche
      let sx: number, sy: number, ex: number, ey: number, path: string;
      if (side === "r") {
        sx = nx; sy = Math.max(ny + 24, Math.min(ny + ch - 24, b.y + b.h / 2)); ex = b.x + b.w; ey = Math.max(b.y + rad, Math.min(b.y + b.h - rad, sy));
        const dx = sx - ex, dy = ey - sy, run2 = Math.max(0, dx - Math.abs(dy));
        path = `M${sx} ${sy}H${sx - run2}L${ex} ${ey}`;
      } else {
        ex = Math.max(b.x + rad, Math.min(b.x + b.w - rad, nx + cw / 2)); sx = Math.max(nx + 24, Math.min(nx + cw - 24, ex));
        sy = side === "a" ? ny + ch : ny; ey = side === "a" ? b.y : b.y + b.h;
        const dy = Math.abs(ey - sy), dx = ex - sx, run2 = Math.max(0, dy - Math.abs(dx)), sg = side === "a" ? 1 : -1;
        path = `M${sx} ${sy}V${sy + sg * run2}L${ex} ${ey}`;
      }
      wire.current?.setAttribute("d", path); pulse.current?.setAttribute("d", path);
      n1.current?.setAttribute("cx", String(sx)); n1.current?.setAttribute("cy", String(sy));
      n2.current?.setAttribute("cx", String(ex)); n2.current?.setAttribute("cy", String(ey));
      svg.current?.setAttribute("viewBox", `0 0 ${W} ${H}`);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [i]);

  const go = (d: number) => {
    const j = i + d;
    if (j < 0) return;
    if (j >= steps.length) { onDone(); return; }
    dir.current = d;
    sound.play(d > 0 ? "enter" : "back");
    setI(j);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onDone(); }
      else if (e.key === "Tab") {
        // il fuoco resta nella scheda: sotto il velo il sito non è raggiungibile
        const els = Array.from(card.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || []);
        if (!els.length) return;
        const k = els.indexOf(document.activeElement as HTMLElement), n = (k + (e.shiftKey ? -1 : 1) + els.length) % els.length;
        e.preventDefault(); els[k < 0 ? 0 : n].focus();
      }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  return (
    <div className="tg">
      <svg ref={svg} className="tg-svg" width="100%" height="100%" aria-hidden="true">
        <path ref={hole} className="tg-veil" fillRule="evenodd" />
        <path ref={ring} className="tg-ring" />
        <path ref={run} className="tg-run" pathLength={100} />
        <path ref={wire} className="tg-wire tg-draw" pathLength={100} />
        <path ref={pulse} className="tg-pulse" pathLength={100} />
        <circle ref={n1} className="tg-n1" r={4.5} />
        <circle ref={n2} className="tg-n2" r={5.5} />
      </svg>
      <div ref={card} className="tg-card pn" role="group" aria-roledescription="passo del tour" aria-label={`${i + 1} di ${steps.length}: ${step.title}`}>
        <div className="tg-top">
          <span className="tg-n">{String(i + 1).padStart(2, "0")} <i>/</i> {String(steps.length).padStart(2, "0")}</span>
          <button type="button" className="tg-skip lk mu" onClick={() => onDone()}>Salta il tour</button>
        </div>
        <div key={i} className="tg-body">
          <h3 className="hd tg-t"><Text3D text={step.title} layers={5} className="t3-ink" anim /></h3>
          <p className="tg-p mu">{step.body}</p>
        </div>
        <div className="tg-dots" aria-hidden="true">{steps.map((_, j) => <i key={j} className={j < i ? "done" : j === i ? "on" : ""} />)}</div>
        <div className="tg-act">
          <button type="button" className="bt" onClick={() => go(-1)} disabled={i === 0}>Indietro</button>
          {last && !admin && <button type="button" className="bt" onClick={() => onDone()}>Fine</button>}
          <button ref={primary} type="button" className="bt on" onClick={() => (last ? onDone(admin ? undefined : "write") : go(1))}>{last ? (admin ? "Fine" : "Inizia a scrivere") : "Avanti"}<ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}
