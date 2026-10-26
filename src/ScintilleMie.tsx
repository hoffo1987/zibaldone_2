import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, type Firestore } from "firebase/firestore";
import { ChevronDown, Loader2, ArrowUpRight, X } from "lucide-react";
import { TIPI, flat, leggiScintilla, msDelGiorno, oggi, type Scintilla, type Tipo } from "./scintille";
import { Onda, Chip } from "./Segnali";
import { readPublic, PUBLIC_VERSION } from "./testi";
import { haptic } from "./haptics";
import { moving } from "./motion";
import { renderLoop } from "./renderLoop";
import { fieldDevice, webgpuReady } from "./field/common";
import { Strumento } from "./strumentoGpu";
import AdminBadge from "./AdminBadge";
import "./scintille.css";

// «Le tue scintille», in I miei scritti: lo strumento che legge il segnale dei propri pensieri.
//   Lo schermo   quattro canali, uno per emozione, con la sua forma d'onda (onde.ts): più è alta, più scintille di
//                quell'emozione. Toccando un canale l'elenco mostra solo quelle; al passaggio l'onda corre.
//   La manopola  due posizioni: Ricevute (le frasi accese dagli altri sui propri pensieri, anonime come nel lettore e le
//                stesse delle notifiche, scByP in App) e Accese da te (scintille_mie/{uid}/voci, con la scintilla e il
//                titolo dalla copia pubblica in testi; una scintilla tolta dall'autore non c'è più e non si mostra).
//   L'elenco     per pensiero, ogni frase con il suo segnale sotto, l'emozione, il giorno e la nota. Toccando il titolo
//                si apre il pensiero.
// L'intestazione ritrae la sezione: chiusa resta la riga con i due conteggi; la scelta si ricorda su questo dispositivo.
export type Ricevute = { id: string; title: string; list: Scintilla[] }[];
type Accesa = { s: Scintilla; pid: string; title: string | null };
type Tab = "ricevute" | "accese";

const quando = (g: number) => {
  const d = oggi() - g;
  return d <= 0 ? "oggi" : d === 1 ? "ieri" : d < 7 ? `${d} giorni fa` : new Date(msDelGiorno(g)).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const SHOW = 3; // pensieri visibili prima di «Mostra tutte»
const FOLD = "circuito:scintille:ritratte";
const foldGet = () => { try { return localStorage.getItem(FOLD) === "1"; } catch { return false; } };
const foldSet = (v: boolean) => { try { localStorage.setItem(FOLD, v ? "1" : "0"); } catch {} };
const label = (t: Tipo) => TIPI.find((x) => x.id === t)!.label;

export function ScintilleMie({ db, uid, received, ready, find, taggedAdmin = false, onOpenOwn, onOpenOther, onLook }: {
  db: Firestore; uid: string; received: Ricevute; ready: boolean; find: (id: string) => any;
  taggedAdmin?: boolean; onOpenOwn: (id: string) => void; onOpenOther: (t: any) => void; onLook: () => void;
}) {
  const [tab, setTab] = useState<Tab>("ricevute");
  const [mine, setMine] = useState<Accesa[] | null>(null);
  const [all, setAll] = useState(false);
  const [docs, setDocs] = useState<Record<string, any>>({});
  const [shut, setShut] = useState(foldGet);
  const [solo, setSolo] = useState<Tipo | null>(null); // il canale scelto sullo schermo
  const [hl, setHl] = useState<Tipo | null>(null); // il canale sotto il puntatore (dallo schermo o da una frase)
  const fold = () => { const v = !shut; setShut(v); foldSet(v); haptic("select"); };
  // lo schermo in WebGPU, dove c'è (lo stesso dispositivo dello sfondo); altrimenti le tracce in piano
  const [gpu, setGpu] = useState<GPUDevice | null>(null);
  useEffect(() => {
    if (!webgpuReady()) return;
    let on = true;
    fieldDevice("low-power", process.env.REACT_APP_EMULATORS === "1").then((d) => { if (on) setGpu(d); });
    return () => { on = false; };
  }, []);

  // all'apertura le ricevute si rileggono (al massimo ogni 30 secondi, come per la campanella)
  useEffect(() => { onLook(); }, []);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const vs = await getDocs(query(collection(db, "scintille_mie", uid, "voci"), orderBy("giorno", "desc"), limit(60)));
        const voci = vs.docs.map((d) => ({ sid: d.id, pid: String(d.data().pensieroId || "") })).filter((v) => v.pid);
        const pids = Array.from(new Set(voci.map((v) => v.pid)));
        const titles: Record<string, any> = {};
        await Promise.all(pids.map(async (pid) => {
          const own = find(pid);
          if (own) { titles[pid] = own; return; }
          try { const t = await getDoc(doc(db, "testi", pid)); titles[pid] = t.exists() && t.data()?.version === PUBLIC_VERSION ? readPublic(t.data(), t.id) : null; } catch { titles[pid] = null; }
        }));
        const found: Accesa[] = [];
        await Promise.all(voci.map(async (v) => {
          try {
            const d = await getDoc(doc(db, "pensieri", v.pid, "scintille", v.sid));
            const s = d.exists() ? leggiScintilla(d.id, d.data()) : null;
            if (s) found.push({ s, pid: v.pid, title: titles[v.pid]?.title || null });
          } catch {}
        }));
        if (on) { setDocs(titles); setMine(found); }
      } catch (e) {
        console.warn("Scintille accese non lette (controlla le regole di Firestore)", e);
        if (on) setMine([]);
      }
    })();
    return () => { on = false; };
  }, [db, uid]);

  // i pensieri con almeno una scintilla, dal più acceso di recente
  const rec = useMemo(() => received.filter((r) => r.list.length).map((r) => ({ key: r.id, title: r.title, list: [...r.list].sort((a, b) => b.giorno - a.giorno) }))
    .sort((a, b) => b.list[0].giorno - a.list[0].giorno), [received]);
  const acc = useMemo(() => {
    const m = new Map<string, { key: string; title: string | null; list: Scintilla[] }>();
    (mine || []).forEach((x) => { const g = m.get(x.pid) || { key: x.pid, title: x.title, list: [] }; g.list.push(x.s); m.set(x.pid, g); });
    return Array.from(m.values()).map((g) => ({ ...g, list: g.list.sort((a, b) => b.giorno - a.giorno) })).sort((a, b) => b.list[0].giorno - a.list[0].giorno);
  }, [mine]);
  const nRec = rec.reduce((n, g) => n + g.list.length, 0), nAcc = (mine || []).length;
  // se un pensiero non si lascia leggere le ricevute non arriverebbero mai: dopo qualche secondo si mostra quello che c'è
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), 5000); return () => clearTimeout(t); }, []);
  const okRec = ready || late, okAcc = mine !== null;
  const groups = tab === "ricevute" ? rec : acc, busy = tab === "ricevute" ? !okRec : !okAcc;
  // quante scintille per emozione, sul canale scelto con la manopola
  const counts = useMemo(() => {
    const c: Record<Tipo, number> = { riconosco: 0, bellissima: 0, ridere: 0, commosso: 0 };
    groups.forEach((g) => g.list.forEach((s) => { c[s.tipo]++; }));
    return c;
  }, [groups]);
  const shown = useMemo(() => (solo ? groups.map((g) => ({ ...g, list: g.list.filter((s) => s.tipo === solo) })).filter((g) => g.list.length) : groups), [groups, solo]);
  const total = groups.reduce((n, g) => n + g.list.length, 0);
  const open = (key: string) => {
    haptic("tap");
    if (tab === "ricevute") onOpenOwn(key); else if (docs[key]) onOpenOther(docs[key]);
  };
  const pick = (t: Tab) => { if (t !== tab) { setTab(t); setAll(false); setSolo(null); setHl(null); haptic("select"); } };
  const lane = (t: Tipo) => { setSolo(solo === t ? null : t); setAll(false); haptic("select"); };

  return <section className={`stm pn ${shut ? "shut" : ""}`} aria-labelledby="stm-t" data-hl={hl || solo || undefined}>
    <h2 className="stm-h"><button type="button" className="stm-hd" aria-expanded={!shut} aria-controls="stm-fold" onClick={fold}>
      <span className="stm-ic" aria-hidden="true"><Onda tipo="bellissima" w={30} h={22} a={7} stroke={1.8} fade={5} /></span>
      <span className="min-w-0 flex-1 block">
        <span id="stm-t" className="hd stm-t block">Le tue scintille</span>
        <span className="stm-sub block">{shut
          ? <span className="stm-rd"><span><b>{okRec ? nRec : "…"}</b> ricevute</span><span><b>{okAcc ? nAcc : "…"}</b> accese da te</span></span>
          : "Il segnale delle frasi che hanno colpito: quelle accese sui tuoi pensieri e quelle che hai acceso tu."}</span>
      </span>
      <span className="stm-fl" aria-hidden="true"><ChevronDown size={16} /></span>
      <span className="sr-only">{shut ? " · tocca per aprire" : " · tocca per ritrarre"}</span>
    </button></h2>
    {/* chiusa, il contenuto resta montato (i dati restano) ma non si raggiunge con la tastiera */}
    <div id="stm-fold" className="stm-fold" {...(shut ? { inert: "" } : {})}><div className="stm-in">
      <div className="stm-deck">
        {/* lo schermo: in WebGPU i tubi al neon in prospettiva, altrimenti le quattro tracce in piano */}
        <div className="stm-scr" role="group" aria-label={`Scintille ${tab === "ricevute" ? "ricevute" : "accese da te"} per emozione`}>
          {gpu ? <Schermo3D dev={gpu} counts={counts} tab={tab} busy={busy} hl={hl} solo={solo} onHover={setHl} onPick={lane} onLost={() => setGpu(null)} />
            : <div key={tab} className={`stm-lanes ${busy ? "wait" : ""}`}>
              {TIPI.map((t, i) => {
                const n = counts[t.id], on = !busy && n > 0;
                return <button key={t.id} type="button" className={`stm-lane t-${t.id} ${on ? "" : "zero"}`} style={{ ["--i" as any]: i }}
                  aria-pressed={solo === t.id} disabled={!on} aria-label={`${t.label}: ${n} ${n === 1 ? "scintilla" : "scintille"}${solo === t.id ? ", mostrate da sole" : ""}`}
                  onClick={() => lane(t.id)} onPointerEnter={(e) => { if (e.pointerType === "mouse" && on) setHl(t.id); }} onPointerLeave={() => setHl(null)}>
                  <span className="stm-lane-k" aria-hidden="true"><b>{busy ? "…" : n}</b>{t.label}</span>
                  <span className="stm-lane-w" aria-hidden="true">
                    {on ? <Onda tipo={t.id} h={30} a={Math.min(11, 3.5 + 2 * n)} stroke={1.6} fade={18} ph={i * 13} className={`stm-trace ${hl === t.id || solo === t.id ? "run" : ""}`} /> : <i className="stm-zero" />}
                    <i className="stm-beam" />
                  </span>
                </button>;
              })}
            </div>}
        </div>
        {/* la manopola: due posizioni, Ricevute e Accese da te */}
        <div className="stm-sel" role="tablist" aria-label="Quali scintille">
          <button type="button" role="tab" aria-selected={tab === "ricevute"} className="stm-ch" onClick={() => pick("ricevute")}>
            <span className="stm-ch-t">Ricevute</span><span className="stm-ch-n">{okRec ? nRec : "…"}</span>
          </button>
          <button type="button" className={`stm-knob ${tab}`} tabIndex={-1} aria-hidden="true" onClick={() => pick(tab === "ricevute" ? "accese" : "ricevute")}>
            <i className="stm-knob-sk" /><i className="stm-knob-cap" /><i className="stm-knob-tick" />
          </button>
          <button type="button" role="tab" aria-selected={tab === "accese"} className="stm-ch r" onClick={() => pick("accese")}>
            <span className="stm-ch-n">{okAcc ? nAcc : "…"}</span><span className="stm-ch-t">Accese da te</span>
          </button>
        </div>
      </div>
      <div key={`${tab}:${solo || ""}`} className="stm-body" role="tabpanel">
        {solo && <p className="stm-solo"><span className={`stm-solo-k t-${solo}`}>Solo <b>{label(solo)}</b></span><button type="button" className="sc-lst" onClick={() => { setSolo(null); haptic("select"); }}>Tutte le emozioni<X size={13} /></button></p>}
        {busy ? <div className="stm-empty"><Loader2 size={16} className="animate-spin" /></div>
          : !shown.length ? <p className="stm-empty">{tab === "ricevute" ? "Quando qualcuno accenderà una frase dei tuoi pensieri, il suo segnale arriverà qui. Le scintille restano anonime, salvo quelle con il sigillo Admin." : "Leggi il Diario: seleziona una frase che ti colpisce e accendi una scintilla. Il suo segnale resterà qui."}</p>
          : <ul className="stm-l">
            {(all ? shown : shown.slice(0, SHOW)).map((g, i) => <li key={g.key} className="stm-g" style={{ ["--i" as any]: i }}>
              <button type="button" className="stm-gh" disabled={tab === "accese" && !docs[g.key]} onClick={() => open(g.key)}>
                <span className="stm-gt">{g.title || "Pensiero ritirato"}</span>
                <span className="stm-gn">{g.list.length} {g.list.length === 1 ? "scintilla" : "scintille"}</span>
                {(tab === "ricevute" || docs[g.key]) && <ArrowUpRight size={14} aria-hidden="true" />}
              </button>
              <ul>{g.list.map((s) => <li key={s.id} className={`stm-s t-${s.tipo}`}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setHl(s.tipo); }} onPointerLeave={() => setHl(null)}>
                <q className="stm-q">{flat(s.cit)}</q>
                <span className="stm-meta"><Chip tipo={s.tipo} /><AdminBadge active={s.admin === true || (tab === "accese" && taggedAdmin)} /><span className="stm-d">{quando(s.giorno)}</span></span>
                {s.nota && <p className="stm-nota">{s.nota}</p>}
              </li>)}</ul>
            </li>)}
          </ul>}
        {!busy && shown.length > SHOW && <button type="button" className="sc-lst stm-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Mostra meno" : `Mostra tutte (${shown.length} pensieri)`}<ChevronDown size={14} /></button>}
      </div>
    </div></div>
  </section>;
}

// Lo schermo in WebGPU (strumentoGpu.ts): la tela e, sopra, le etichette dei canali appese all'inizio di ogni tubo.
// Le etichette sono i pulsanti veri (per la tastiera e i lettori di schermo); toccare un tubo fa lo stesso.
function Schermo3D({ dev, counts, tab, busy, hl, solo, onHover, onPick, onLost }: {
  dev: GPUDevice; counts: Record<Tipo, number>; tab: Tab; busy: boolean; hl: Tipo | null; solo: Tipo | null;
  onHover: (t: Tipo | null) => void; onPick: (t: Tipo) => void; onLost: () => void;
}) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), eng = useRef<Strumento | null>(null);
  const tags = useRef<(HTMLButtonElement | null)[]>([]);
  const lost = useRef(onLost); lost.current = onLost;
  const chans = TIPI.map((t) => ({ tipo: t.id, n: busy ? 0 : counts[t.id] }));
  const sig = chans.map((c) => c.n).join(",");
  useEffect(() => {
    const c = cv.current; if (!c) return;
    let e: Strumento;
    try { e = new Strumento(dev, c, !moving()); } catch (err) { console.warn("Schermo delle scintille in WebGPU non partito", err); lost.current(); return; }
    eng.current = e; e.tagsOn(tags.current); e.fit(); e.set(chans, true);
    const ro = new ResizeObserver(() => e.fit()); ro.observe(c);
    const halt = renderLoop((t) => e.draw(t), () => e.fps(), c);
    let gone = false;
    dev.lost.then(() => { if (!gone) lost.current(); });
    return () => { gone = true; halt(); ro.disconnect(); e.destroy(); eng.current = null; };
  }, [dev]);
  // un giro di manopola (o i dati appena arrivati): i tubi si riaccendono da sinistra
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } eng.current?.set(chans, true); }, [tab, busy]);
  useEffect(() => { eng.current?.set(chans, false); }, [sig]);
  const on = hl || solo;
  useEffect(() => { eng.current?.highlight(on ? TIPI.findIndex((t) => t.id === on) : -1); }, [on]);
  const at = (cx: number, cy: number) => { const r = box.current!.getBoundingClientRect(); return [cx - r.left, cy - r.top, r.width, r.height]; };
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !eng.current) return;
    const [x, y, w, h] = at(e.clientX, e.clientY); eng.current.pointer((x / w) * 2 - 1, (y / h) * 2 - 1, true);
    if ((e.target as Element).closest(".stm-tag")) return;
    const i = eng.current.pick(x, y), t = i >= 0 && counts[TIPI[i].id] > 0 ? TIPI[i].id : null;
    if (t !== hl) onHover(t);
  };
  const leave = () => { eng.current?.pointer(0, 0, false); onHover(null); };
  const click = (e: React.MouseEvent) => {
    if (!eng.current || (e.target as Element).closest(".stm-tag")) return;
    const [x, y] = at(e.clientX, e.clientY), i = eng.current.pick(x, y);
    if (i >= 0 && counts[TIPI[i].id] > 0) onPick(TIPI[i].id);
  };
  return <div ref={box} className="stm-3d" onPointerMove={move} onPointerLeave={leave} onClick={click}>
    <canvas ref={cv} className="stm-cv" aria-hidden="true" />
    {TIPI.map((t, i) => {
      const n = busy ? 0 : counts[t.id];
      return <button key={t.id} ref={(el) => { tags.current[i] = el; }} type="button" className={`stm-tag t-${t.id} ${n ? "" : "zero"} ${on === t.id ? "on" : ""}`}
        aria-pressed={solo === t.id} disabled={!n} aria-label={`${t.label}: ${n} ${n === 1 ? "scintilla" : "scintille"}${solo === t.id ? ", mostrate da sole" : ""}`}
        onClick={() => onPick(t.id)} onPointerEnter={(e) => { if (e.pointerType === "mouse" && n) onHover(t.id); }}>
        <b aria-hidden="true">{busy ? "…" : n}</b><span aria-hidden="true">{t.label}</span>
      </button>;
    })}
  </div>;
}
