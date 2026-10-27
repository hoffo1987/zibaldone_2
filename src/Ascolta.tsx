import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { indiceDi, rangeDi, type Indice } from "./scintille";
import { Lettore, attendiVoci, frasiDi, vociItaliane, type Frase, type Stato } from "./voce";
import { haptic } from "./haptics";
import "./ascolta.css";

// Il lettore che ascolta lo scritto: una capsula di vetro che galleggia in fondo al foglio, come il mini player del
// telefono. Il tasto grande avvia e ferma; ai lati frase precedente e successiva; la pista sotto il titolo ha una tacca
// per frase (toccandola si salta lì); la velocità gira tra cinque valori; la voce si sceglie tra quelle italiane del
// sistema. Sul foglio la frase che si sente è evidenziata (::highlight, il testo non si tocca) e, dove la voce annuncia le
// parole, anche la parola; il foglio scorre da solo per tenerla in vista, a meno che non lo si stia scorrendo a mano.
const RATES = [0.85, 1, 1.15, 1.3, 1.5];
const KEY = "circuito:voce";
type Pref = { rate: number; voce: string };
const prefGet = (): Pref => { try { const p = JSON.parse(localStorage.getItem(KEY) || "{}"); return { rate: RATES.includes(p.rate) ? p.rate : 1, voce: typeof p.voce === "string" ? p.voce : "" }; } catch { return { rate: 1, voce: "" }; } };
const prefSet = (p: Pref) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
const HL = typeof window !== "undefined" && typeof (window as any).Highlight === "function" && typeof CSS !== "undefined" && !!(CSS as any).highlights;
const hl = (name: string, r: Range | null) => { if (!HL) return; const reg = (CSS as any).highlights; if (r) reg.set(name, new (window as any).Highlight(r)); else reg.delete(name); };

export function Ascolta({ title, album, root, scroller, onClose }: {
  title: string; album: string; root: () => HTMLElement | null; scroller: () => HTMLElement | null; onClose: () => void;
}) {
  // il testo del foglio, una volta, come lo vede chi legge; il titolo si legge per primo
  const ix = useMemo<Indice | null>(() => { const el = root(); return el ? indiceDi(el) : null; }, []);
  const frasi = useMemo<Frase[]>(() => [{ a: -1, b: -1, testo: `${title}.` }, ...(ix ? frasiDi(ix.piano.text) : [])], [ix, title]);
  const [st, setSt] = useState<Stato>({ i: 0, playing: false, parola: null });
  const [voci, setVoci] = useState<SpeechSynthesisVoice[]>([]);
  const [pref, setPref] = useState<Pref>(prefGet);
  const lettore = useRef<Lettore | null>(null);
  if (!lettore.current) lettore.current = new Lettore({ titolo: title, album, frasi, onStato: setSt });
  const L = lettore.current;

  // le voci italiane; si riparte da quella scelta l'ultima volta. Si avvia subito: il tocco su «Ascolta» è il gesto che
  // il browser chiede per parlare e per l'audio delle cuffie
  useEffect(() => {
    let on = true;
    L.setRate(pref.rate);
    attendiVoci().then((vs) => {
      if (!on) return;
      setVoci(vs);
      L.setVoce(vs.find((v) => v.name === pref.voce) || vs[0] || null);
      L.play(0);
    });
    return () => { on = false; L.stop(); hl("asc-f", null); hl("asc-w", null); };
  }, []);
  // Chrome carica le voci a più riprese: l'elenco si aggiorna quando ne arrivano altre
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const upd = () => setVoci(vociItaliane());
    speechSynthesis.addEventListener("voiceschanged", upd);
    const t = setTimeout(upd, 800);
    return () => { speechSynthesis.removeEventListener("voiceschanged", upd); clearTimeout(t); };
  }, []);

  // la frase e la parola sul foglio
  const follow = useRef(0);
  useEffect(() => {
    const f = frasi[st.i];
    const r = ix && f && f.a >= 0 ? rangeDi(ix, f.a, f.b) : null;
    hl("asc-f", r);
    hl("asc-w", ix && st.parola ? rangeDi(ix, st.parola[0], st.parola[1]) : null);
    // il foglio la segue, se non lo si sta scorrendo a mano
    const sc = scroller();
    if (!r || !sc || !st.playing || Date.now() - follow.current < 5000) return;
    const b = r.getBoundingClientRect(), S = sc.getBoundingClientRect();
    if (b.top < S.top + 70 || b.bottom > S.bottom - 130) sc.scrollBy({ top: b.top - S.top - S.height * 0.32, behavior: "smooth" });
  }, [st.i, st.parola, st.playing]);
  useEffect(() => {
    const sc = scroller(); if (!sc) return;
    const mark = () => { follow.current = Date.now(); };
    sc.addEventListener("wheel", mark, { passive: true }); sc.addEventListener("touchmove", mark, { passive: true });
    return () => { sc.removeEventListener("wheel", mark); sc.removeEventListener("touchmove", mark); };
  }, []);

  const n = frasi.length, cur = Math.min(st.i, n - 1);
  const rate = (r: number) => { const p = { ...pref, rate: r }; setPref(p); prefSet(p); L.setRate(r); haptic("select"); };
  const voce = (name: string) => { const p = { ...pref, voce: name }; setPref(p); prefSet(p); L.setVoce(voci.find((v) => v.name === name) || null); haptic("select"); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); L.vai(Math.floor(((e.clientX - r.left) / r.width) * n)); haptic("tap"); };
  const short = (v: SpeechSynthesisVoice) => { const s = v.name.replace(/^(Microsoft|Google|Apple)\s+/i, "").replace(/\s*[-–(].*$/, "").replace(/\s+Online.*$/i, ""); return s.charAt(0).toUpperCase() + s.slice(1); };

  return <div className={`asc ${st.playing ? "on" : ""}`} role="region" aria-label="Ascolto dello scritto">
    <button type="button" className="asc-play" aria-label={st.playing ? "Pausa" : "Ascolta"} onClick={() => { L.toggle(); haptic("impact"); }}>
      {st.playing ? <Pause size={18} /> : <Play size={18} />}
    </button>
    <div className="asc-mid">
      <div className="asc-t">
        <span className="asc-eq" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="asc-tt">{cur === 0 ? "Il titolo" : `Frase ${cur} di ${n - 1}`}</span>
        <span className="asc-al">{album}</span>
      </div>
      {/* la pista: una tacca per frase, piena fin dove si è arrivati */}
      <div className="asc-bar" role="slider" aria-label="Posizione" aria-valuemin={1} aria-valuemax={n} aria-valuenow={cur + 1} tabIndex={0} onClick={seek}
        onKeyDown={(e) => { if (e.key === "ArrowRight") L.vai(cur + 1); if (e.key === "ArrowLeft") L.vai(cur - 1); }}
        style={{ ["--p" as any]: n > 1 ? cur / (n - 1) : 0 }}>
        <i className="asc-fill" /><i className="asc-knob" />
      </div>
    </div>
    <span className="asc-ctl">
      <button type="button" className="asc-b" aria-label="Frase precedente" disabled={cur <= 0} onClick={() => L.vai(cur - 1)}><SkipBack size={15} /></button>
      <button type="button" className="asc-b" aria-label="Frase successiva" disabled={cur >= n - 1} onClick={() => L.vai(cur + 1)}><SkipForward size={15} /></button>
      <button type="button" className="asc-b asc-rate" aria-label={`Velocità ${pref.rate}`} onClick={() => rate(RATES[(RATES.indexOf(pref.rate) + 1) % RATES.length])}>{String(pref.rate).replace(".", ",")}×</button>
      {voci.length > 1 && <label className="asc-voce"><span className="sr-only">Voce</span>
        <select value={voci.find((v) => v.name === pref.voce)?.name || voci[0].name} onChange={(e) => voce(e.target.value)}>{voci.map((v) => <option key={v.name} value={v.name}>{short(v)}</option>)}</select>
      </label>}
      <button type="button" className="asc-b" aria-label="Chiudi l’ascolto" onClick={() => { L.stop(); hl("asc-f", null); hl("asc-w", null); onClose(); }}><X size={15} /></button>
    </span>
  </div>;
}
