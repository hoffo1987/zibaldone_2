import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Tour, { TourMode, filmText } from "./Tour";
import { createFilm, MUSIC } from "./film";
import { openSheet, closeSheet, rectOf } from "../motion";
import "../styles.css";
import "../ui.css";
import "../motion.css";
import "../d3.css";

const q = new URLSearchParams(window.location.search);
const mode: TourMode = q.get("mode") === "auto" ? "auto" : q.get("mode") === "guide" ? "guide" : "film";
const targets = ["nav-home", "editor-mode", "save", "nav-diario", "scritti-switch", "nav-my_pages", "nav-podio", "bell", "options", "cta", "nav-read", "filters", "nav-authors", "hero-actions"];

// Storyboard (?board=passo in secondi): il film reso fotogramma per fotogramma a 60 fps, senza audio, con le miniature
// e il grafico della velocità della camera (scorrimento rispetto a ciò che guarda e rotazione). Serve a controllare che la
// camera non si fermi mai e che i passaggi non diano strappi. ?w=&h= dimensioni, ?from=&to= finestra, ?calm, ?low, ?admin
function Storyboard() {
  const host = useRef<HTMLDivElement>(null), chart = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => {
    const W = Number(q.get("w") || 960), H = Number(q.get("h") || 540), step = Number(q.get("board") || 0.5);
    const from = Number(q.get("from") || 0), to = Number(q.get("to") || MUSIC.end);
    const cv = document.createElement("canvas");
    cv.style.cssText = `position:fixed;left:-${W + 50}px;top:0;width:${W}px;height:${H}px`;
    document.body.appendChild(cv);
    const fonts = (document as any).fonts;
    Promise.all(["600 100px Unbounded", "700 100px 'Bricolage Grotesque'", "600 100px 'Instrument Sans'"].map((f) => fonts?.load(f).catch(() => null))).then(() => {
      const film = createFilm(cv, { text: filmText(q.has("admin"), q.get("name") ?? "Andrea"), calm: q.has("calm"), low: q.has("low") });
      const samples: number[][] = [];
      let prev: { p: number[]; f: number[]; dist: number } | null = null, next = from;
      for (let i = 0; i <= Math.round(to * 60); i++) {
        const t = i / 60;
        film.draw(t);
        const p = film.pose();
        if (p && prev) {
          const slide = (Math.hypot(p.p[0] - prev.p[0], p.p[1] - prev.p[1], p.p[2] - prev.p[2]) * 60) / Math.max(2, p.dist);
          const turn = (Math.acos(Math.min(1, p.f[0] * prev.f[0] + p.f[1] * prev.f[1] + p.f[2] * prev.f[2])) * 60 * 180) / Math.PI;
          samples.push([t, slide, turn]);
        }
        prev = p;
        if (t >= next - 1e-6 && t >= from) {
          next += step;
          const fig = document.createElement("figure"), th = document.createElement("canvas");
          const ts = Number(q.get("ts") || 1 / 3);
          th.width = Math.round(W * ts); th.height = Math.round(H * ts);
          th.getContext("2d")!.drawImage(cv, 0, 0, th.width, th.height);
          fig.appendChild(th);
          const cap = document.createElement("figcaption"); cap.textContent = `${t.toFixed(2)} s`; fig.appendChild(cap);
          host.current?.appendChild(fig);
        }
      }
      film.dispose(); cv.remove();
      // grafico: verde = scorrimento (1/s), ambra = rotazione (gradi/s / 20); in grigio gli attacchi del brano
      const c = chart.current!, g = c.getContext("2d")!, CW = c.width, CH = c.height, X = (t: number) => (t / to) * CW, Y = (v: number) => CH - 8 - Math.min(1, v / 6) * (CH - 16);
      g.fillStyle = "#03110F"; g.fillRect(0, 0, CW, CH);
      g.strokeStyle = "rgba(255,255,255,.18)";
      Object.values(MUSIC).forEach((m) => { g.beginPath(); g.moveTo(X(m), 0); g.lineTo(X(m), CH); g.stroke(); });
      [[1, "#2DD4BF"], [2, "#FBBF24"]].forEach(([k, col]) => {
        g.strokeStyle = col as string; g.lineWidth = 1.5; g.beginPath();
        samples.forEach((s, i) => { const v = k === 2 ? s[2] / 20 : s[1]; if (i) g.lineTo(X(s[0]), Y(v)); else g.moveTo(X(s[0]), Y(v)); });
        g.stroke();
      });
      // tabella: per ogni decimo di secondo il movimento minimo (scorrimento + rotazione normalizzata)
      const out: string[] = [];
      for (let t0 = 0; t0 < to; t0 += 0.1) {
        const win = samples.filter((s) => s[0] >= t0 && s[0] < t0 + 0.1); if (!win.length) continue;
        const mv = win.map((s) => s[1] + s[2] / 20), lo = Math.min(...mv), hi = Math.max(...mv);
        out.push(`${t0.toFixed(1)}\tmin ${lo.toFixed(3)}\tmax ${hi.toFixed(3)}`);
      }
      setRows(out);
    });
  }, []);
  return <main className="root dark" style={{ minHeight: "100vh", padding: 16, background: "#020807", color: "#cfe" }}>
    <style>{"figure{display:inline-block;margin:4px}figure canvas{display:block}figcaption{font:12px ui-monospace,monospace;color:#9cc}"}</style>
    <canvas ref={chart} width={1200} height={180} style={{ width: "100%", maxWidth: 1200, display: "block", marginBottom: 12 }} />
    <div ref={host} />
    <pre style={{ font: "11px ui-monospace,monospace", columns: 4 }}>{rows.join("\n")}</pre>
  </main>;
}

// Prova del lettore (?sheet): una scheda dell'archivio e il lettore, con le stesse classi e le stesse funzioni del sito.
// ?at=ms ferma tutte le animazioni a quel punto dell'apertura (con &close, della chiusura): serve a fotografarle
const TXT = "Quest'anno è diverso dagli altri. La maturità, che fino a poco tempo fa sembrava qualcosa di lontano, adesso è praticamente davanti a noi. Guardandoci indietro, sembra strano pensare a quanta strada abbiamo fatto per arrivare fin qui. Tra lezioni, verifiche, momenti di stanchezza e giornate in cui avremmo preferito essere da tutt'altra parte, siamo arrivati all'ultimo anno.";
function SheetLab() {
  const [open, setOpen] = useState(false), [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null), origin = useRef<any>(null);
  const show = (e: any) => { const el = e.currentTarget, sheet = el.querySelector(".paper"); origin.current = { r: rectOf(sheet || el), paper: !!sheet }; setOpen(true); };
  const hide = () => { if (!panel.current) return; setClosing(true); closeSheet(panel.current, "d1").then(() => { setOpen(false); setClosing(false); }); };
  useLayoutEffect(() => { if (open && panel.current && !closing) openSheet(panel.current, origin.current?.r, origin.current?.paper); }, [open]);
  useEffect(() => {
    if (!q.has("at")) return;
    const at = Number(q.get("at")), freeze = () => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = at; });
    const t1 = setTimeout(() => { (document.querySelector(q.has("row") ? "[data-row]" : "[data-doc]") as HTMLElement)?.click(); if (!q.has("close")) requestAnimationFrame(freeze); }, 300);
    const t2 = q.has("close") ? setTimeout(() => { (document.querySelector(".doc-ov") as HTMLElement)?.click(); requestAnimationFrame(freeze); }, 1400) : 0;
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return <main className="root dark" style={{ minHeight: "100vh", padding: 32, background: "var(--bg)" }}>
    <h1 className="hd text-3xl font-bold mb-6" style={{ color: "var(--ink)" }}>Tutti gli scritti</h1>
    <div className="grid grid-cols-3 gap-6" style={{ maxWidth: 980 }}>
      <article data-doc="d1" onClick={show} className="pn card h-full overflow-hidden cursor-pointer">
        <div className="paper mm sm relative h-40 overflow-hidden"><div className="thumb absolute inset-0"><p className="relative p-3 text-[13px] leading-[22px] line-clamp-5">{TXT}</p></div></div>
        <div className="meta p-5 border-t" style={{ borderColor: "var(--ln)" }}><h2 className="hd font-bold text-lg leading-snug line-clamp-1" style={{ color: "var(--ink)" }}>Una fine che sa di inizio</h2><div className="mt-2 mu text-xs">Gianluca Castiglione · 17 set 2026</div></div>
      </article>
      <button data-row="1" data-doc="d1" onClick={show} className="pn nv w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left self-start" style={{ color: "var(--ink)" }}><div className="flex-1 min-w-0"><div className="font-semibold truncate">Una fine che sa di inizio</div><div className="mu text-xs">Riga della home</div></div></button>
    </div>
    {open && <div className={`doc-ov fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 ${closing ? "out" : ""}`} onClick={hide}>
      <div ref={panel} role="dialog" className="pn w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="doc-hd relative overflow-hidden shrink-0 flex items-center justify-between gap-3 p-4 border-b" style={{ borderColor: "var(--ln)", color: "var(--ink)" }}><div><h2 className="doc-tt hd text-2xl font-bold">Una fine che sa di inizio</h2><div className="mu text-xs">Gianluca Castiglione · 17 set 2026</div></div><button className="bt !p-2" onClick={hide}>×</button></div>
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div data-sheet-scroll="" className="overflow-y-auto flex-1 min-h-0">
            <div className="flex items-center gap-3 px-4 py-2 border-b text-sm" style={{ borderColor: "var(--ln)", background: "var(--sf)", color: "var(--ink)" }}><span className="mu">Voto</span>★★★★★</div>
            <div className="paper mm relative" data-sheet-paper="" style={{ aspectRatio: "900/520" }}><div className="rt relative p-6">{TXT}</div></div>
          </div>
        </div>
      </div>
    </div>}
  </main>;
}

function Preview() {
  const [open, setOpen] = useState(true), [held, hold] = useState(false), [tab, nav] = useState("home");
  return <main className={`root dark ${held ? "tour-hold" : ""}`} style={{ minHeight: "100vh", padding: 24 }}>
    <h1 className="hd" style={{ fontSize: 30 }}>Presentazione · Il Circuito</h1>
    <p>Anteprima locale del componente reale. Sezione del tour: {tab}.</p>
    <p style={{ margin: "16px 0" }}><a className="bt" href="/">Studente</a>{" "}<a className="bt" href="/?admin=1">Valutatore</a>{" "}<a className="bt" href="/?calm=1">Movimento ridotto</a>{" "}<a className="bt" href="/?low=1">Qualità leggera</a>{" "}<a className="bt" href="/?mode=auto">Film e tour</a>{" "}<a className="bt" href="/?board=0.5">Storyboard</a></p>
    <button className="bt on" onClick={() => setOpen(true)}>Rivedi</button>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
      {targets.map((target) => <button key={target} className="bt" data-tour={target}>{target}</button>)}
    </div>
    {open && <Tour mode={mode} admin={q.has("admin")} name={q.get("name") ?? "Andrea"} calm={q.has("calm") || matchMedia("(prefers-reduced-motion: reduce)").matches} low={q.has("low")} nav={nav} hold={hold} onDone={() => { hold(false); setOpen(false); }} />}
  </main>;
}
createRoot(document.getElementById("root")!).render(q.has("board") ? <Storyboard /> : q.has("sheet") ? <SheetLab /> : <Preview />);
