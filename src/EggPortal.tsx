import React, { useEffect, useRef, useState } from "react";
import * as sound from "./sound";
import "./egg-portal.css";

// Il passaggio dal sito al gioco segreto. Lo schermo si apre dal logo appena toccato, la barra si riempie seguendo
// nota per nota il suono di caricamento, poi lo schermo si chiude a riga come un vecchio televisore e il gioco si
// riapre dalla stessa riga (la sua animazione d'ingresso). Intanto si scaricano il gioco e i suoi sprite.
const loadGame = () => import("./egg/EggGame");
const EggGame = React.lazy(loadGame);

// loading.mp3 in secondi: ping d'avvio, quattro cicli di sei note a 126 ms l'una, ping finale, coda
export const LOAD = { ping: 0.012, cycles: [0.176, 1.176, 2.176, 3.176], note: 0.126, done: 3.696, close: 3.8, end: 3.98 };
const BLOCKS = LOAD.cycles.length * 6;
const blockAt = (i: number) => LOAD.cycles[Math.floor(i / 6)] + (i % 6) * LOAD.note;
// i quattro cicli passano dal verde del Circuito al viola del gioco
const GROUP = ["#2DD4BF", "#5EEAD4", "#8a7cff", "#b9a7ff"];
const LINES = ["circuito@segreto:~$ avvia --livello-nascosto", "corrente deviata · lifestream instabile", "accesso consentito"];

export default function EggPortal({ origin, onClose }: { origin: { x: number; y: number } | null; onClose: () => void }) {
  const [game, setGame] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;

  useEffect(() => {
    sound.duck("egg", sound.DUCK.egg);
    return () => sound.duck("egg", null);
  }, []);

  useEffect(() => {
    const el = host.current; if (!el) return;
    // il carattere pixel del gioco: lo chiedo subito, così le scritte del caricamento lo usano già
    if (!document.querySelector("link[data-silkscreen]")) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Silkscreen&display=swap"; l.dataset.silkscreen = "1"; document.head.appendChild(l); }
    const chunk = loadGame().then(() => true, () => true);
    import("./egg/game").then(({ CAST }) => Object.values(CAST).forEach((d: any) => { if (d.sheet) { const i = new Image(); i.src = d.sheet.src; } })).catch(() => {});
    const blocks = Array.from(el.querySelectorAll<HTMLElement>(".egl-b")), pct = el.querySelector<HTMLElement>(".egl-pct"), lines = Array.from(el.querySelectorAll<HTMLElement>(".egl-l"));
    let raf = 0, voice: ReturnType<typeof sound.play> = null, t0 = 0, lit = -1, stage = 0, off = false, paused = 0, hiddenAt = 0;
    // l'orologio è il suono stesso, quando c'è: barra e note restano allineate anche se il telefono rallenta
    const clock = () => (voice ? sound.now() - voice.at : (performance.now() - t0 - paused) / 1000);
    const frame = () => {
      const t = clock();
      if (t >= LOAD.ping && stage < 1) { stage = 1; el.classList.add("on"); }
      let n = 0; while (n < BLOCKS && t >= blockAt(n)) n++;
      if (n - 1 !== lit) {
        for (let i = lit + 1; i < n; i++) blocks[i]?.classList.add("lit");
        if (n - 1 > lit && n > 0) { const b = blocks[n - 1]; b?.classList.remove("hit"); void b?.offsetWidth; b?.classList.add("hit"); }
        lit = n - 1;
        el.style.setProperty("--p", (n / BLOCKS).toFixed(3));
      }
      const p = t >= LOAD.done ? 100 : Math.round((n / BLOCKS) * 96);
      if (pct && pct.textContent !== `${p}%`) pct.textContent = `${p}%`;
      lines.forEach((l, i) => l.classList.toggle("in", t >= [0.05, 1.2, LOAD.done][i]));
      if (t >= LOAD.done && stage < 2) { stage = 2; el.classList.add("done"); }
      if (t >= LOAD.close && stage < 3) {
        stage = 3; el.classList.add("off");
        // il gioco entra solo quando il suo codice è arrivato; se la rete è lenta la scritta "pronto" resta accesa
        chunk.then(() => window.setTimeout(() => { if (!off) setGame(true); }, 170));
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const start = (withSound: boolean) => {
      if (off || t0) return;
      t0 = performance.now();
      if (withSound) voice = sound.play("loading", { when: sound.now() + 0.02 });
      raf = requestAnimationFrame(frame);
    };
    // aspetto il suono al massimo 350 ms: oltre, l'animazione parte da sola e il suono non viene più suonato (sarebbe fuori tempo)
    if (sound.enabled() && sound.running()) {
      const late = window.setTimeout(() => start(false), 350);
      sound.load("loading").then((b) => { window.clearTimeout(late); start(!!b); });
    } else start(false);
    const vis = () => { if (voice) return; if (document.hidden) hiddenAt = performance.now(); else if (hiddenAt) { paused += performance.now() - hiddenAt; hiddenAt = 0; } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && stage < 3) { e.stopPropagation(); close.current(); } };
    document.addEventListener("visibilitychange", vis); window.addEventListener("keydown", esc, true);
    return () => { off = true; cancelAnimationFrame(raf); voice?.stop(0.12); document.removeEventListener("visibilitychange", vis); window.removeEventListener("keydown", esc, true); };
  }, []);

  if (game) return <React.Suspense fallback={<div className="fixed inset-0 z-[300]" style={{ background: "#05040a" }} />}><EggGame onClose={onClose} /></React.Suspense>;
  const o = origin || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return (
    <div ref={host} className="egl" style={{ ["--ox" as any]: `${o.x}px`, ["--oy" as any]: `${o.y}px` }} role="status" aria-live="polite" aria-label="Caricamento del livello segreto">
      <div className="egl-in">
        <PixelLogo />
        <div className="egl-term">{LINES.map((l, i) => <div key={i} className={`egl-l ${i === 2 ? "egl-ok" : ""}`}>{i === 0 ? <><b>circuito@segreto</b>:~$ {l.split("$ ")[1]}</> : l}</div>)}</div>
        <div className="egl-bar" aria-hidden="true">{GROUP.map((c, g) => <span key={g} className="egl-g">{Array.from({ length: 6 }, (_, i) => <i key={i} className="egl-b" style={{ ["--c" as any]: c }} />)}</span>)}</div>
        <div className="egl-row"><span>caricamento</span><span className="egl-pct">0%</span></div>
      </div>
      <i className="egl-scan" aria-hidden="true" />
    </div>
  );
}

// il logo del Circuito ridisegnato a bassa risoluzione: il sito diventa pixel art prima di lasciare il posto al gioco
const PixelLogo = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, g = c?.getContext("2d"); if (!c || !g) return;
    const S = 22, k = S / 64; c.width = c.height = S;
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#0E7468"; g.beginPath(); (g as any).roundRect ? (g as any).roundRect(0, 0, S, S, 6) : g.rect(0, 0, S, S); g.fill();
    g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineWidth = 5 * k;
    g.beginPath(); g.arc(32 * k, 32 * k, 15 * k, Math.atan2(-9.6, 11.5), Math.atan2(9.6, 11.5), true); g.stroke();
    g.lineWidth = 3 * k; g.beginPath(); g.moveTo(31 * k, 32 * k); g.lineTo(47 * k, 32 * k); g.stroke();
    g.fillStyle = "#fff"; [[43.5, 22.4, 4.2], [31, 32, 3.2]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x * k, y * k, r * k, 0, 7); g.fill(); });
    g.fillStyle = "#FBBF24"; g.beginPath(); g.arc(43.5 * k, 41.6 * k, 4.2 * k, 0, 7); g.fill();
    // soglia sull'alfa: niente bordi sfumati, solo pixel pieni
    const d = g.getImageData(0, 0, S, S); for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0; g.putImageData(d, 0, 0);
  }, []);
  return <canvas ref={ref} className="egl-logo" aria-hidden="true" />;
};
