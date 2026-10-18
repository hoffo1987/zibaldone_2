import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PodiumCover, PodiumScene, PodiumSign, PodiumSlot } from "../PodiumStage";
import { nextReveal, revealCopy } from "../podiumReveal";
import { allowSoftwareAdapter } from "../logo3d/engine";
import "../styles.css";
import "../ui.css";
import "../d3.css";

// Anteprima locale della sala del podio, senza accesso né Firebase: la stessa impaginazione della pagina (barra laterale,
// titolo, barra del mese, spazio del podio) con tre vincitori finti. ?dark per la notte; ?podiohud e ?podiotier come
// nell'app
const q = new URLSearchParams(window.location.search);
// ?software: anche con la GPU emulata sulla CPU (prove automatiche senza scheda video)
if (q.has("software")) allowSoftwareAdapter(true);
const WINNERS = [
  { title: "Il Primo mese del quinto anno", who: "Stefano Russotto", stars: 4 },
  { title: "Lettera a chi resta", who: "Giulia Ferri", stars: 4 },
  { title: "Le scale di via Po", who: "Marco Lenti", stars: 3 },
];
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

// ?coperto: il podio non ancora visibile, sotto il telo e in mezzo al cantiere, con il cartello (?oggi=AAAA-MM-GG per
// provare le date)
const covered = q.has("coperto");
const sign = <PodiumSign {...revealCopy(nextReveal(q.get("oggi") ? new Date(`${q.get("oggi")}T12:00`) : new Date()))} />;

function Preview() {
  const [dark, setDark] = useState(q.has("dark"));
  const [failed, setFailed] = useState(false);
  const plates = WINNERS.map((w, k) => (
    <div role="button" tabIndex={0} className="pdm-card" onClick={() => console.info(`posto ${k + 1}`)}>
      <div className="flex items-center justify-between gap-2"><span className="pdm-rank">{k + 1}° posto</span><span style={{ color: "var(--am)", fontSize: 13 }}>{stars(w.stars)}</span></div>
      <div className="hd font-bold leading-snug mt-1 line-clamp-2">{w.title}</div>
      <div className="pdm-who flex items-center gap-2 mt-1.5 min-w-0"><span className="mu text-xs truncate">{w.who}</span></div>
    </div>
  ));
  const list = WINNERS.map((w, k) => (
    <div key={k} role="button" tabIndex={0} className={`pdm-row r${k + 1}`}>
      <span className="pdm-medal hd" aria-hidden="true">{k + 1}</span>
      <div className="min-w-0 flex-1"><div className="pdm-row-title hd">{w.title}</div><div className="pdm-row-meta"><span className="who">{w.who}</span></div></div>
    </div>
  ));
  return (
    <div className={`root ${dark ? "dark" : ""} min-h-screen`}>
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col p-5 gap-1 pn !rounded-none !border-y-0 !border-l-0 z-20">
        <div className="hd text-2xl font-bold">Il Circuito</div>
        <div className="mu text-xs mb-6">Anteprima del podio</div>
        <button className="bt" onClick={() => setDark((d) => !d)}>{dark ? "Giorno" : "Notte"}</button>
      </aside>
      <main className="md:ml-60 px-4 md:px-10 pt-10 pb-24 relative z-10">
        <div className="max-w-6xl mx-auto">
          <h1 className="hd text-5xl font-bold mb-8">Podio del mese</h1>
          {!covered && <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <span className="hd text-xl font-bold">Ottobre 2026</span>
            <button className="bt">Valuta ora</button>
          </div>}
          {failed ? (covered ? <PodiumCover sign={sign} /> : <p className="mu">WebGPU non è partito: nell'app qui c'è il podio semplice.</p>) : <PodiumSlot list={covered ? undefined : list} />}
        </div>
      </main>
      {!failed && <PodiumScene dark={dark} plates={covered ? [] : plates} covered={covered} sign={covered ? sign : undefined} onFail={() => setFailed(true)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
