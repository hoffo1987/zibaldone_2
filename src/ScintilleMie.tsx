import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, type Firestore } from "firebase/firestore";
import { ChevronDown, Loader2, ArrowUpRight, X } from "lucide-react";
import { TIPI, flat, leggiScintilla, msDelGiorno, oggi, type Scintilla, type Tipo } from "./scintille";
import { faseCanale, seme } from "./onde";
import { Onda, Chip } from "./Segnali";
import { readPublic, PUBLIC_VERSION } from "./testi";
import { haptic } from "./haptics";
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
// due cifre, come sul display di uno strumento
const dd = (n: number | null) => (n === null ? "--" : String(Math.min(99, n)).padStart(2, "0"));
const label = (t: Tipo) => TIPI.find((x) => x.id === t)!.label;

export function ScintilleMie({ db, uid, received, ready, find, onOpenOwn, onOpenOther, onLook }: {
  db: Firestore; uid: string; received: Ricevute; ready: boolean; find: (id: string) => any;
  onOpenOwn: (id: string) => void; onOpenOther: (t: any) => void; onLook: () => void;
}) {
  const [tab, setTab] = useState<Tab>("ricevute");
  const [mine, setMine] = useState<Accesa[] | null>(null);
  const [all, setAll] = useState(false);
  const [docs, setDocs] = useState<Record<string, any>>({});
  const [shut, setShut] = useState(foldGet);
  const [solo, setSolo] = useState<Tipo | null>(null); // il canale scelto sullo schermo
  const [hl, setHl] = useState<Tipo | null>(null); // il canale sotto il puntatore (dallo schermo o da una frase)
  const fold = () => { const v = !shut; setShut(v); foldSet(v); haptic("select"); };

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
  const last = groups[0]?.list[0]?.giorno;

  return <section className={`sm pn ${shut ? "shut" : ""}`} aria-labelledby="sm-t" data-hl={hl || solo || undefined}>
    <h2 className="sm-h"><button type="button" className="sm-hd" aria-expanded={!shut} aria-controls="sm-fold" onClick={fold}>
      <span className="sm-ic" aria-hidden="true"><Onda tipo="bellissima" w={30} h={22} a={7} stroke={1.8} fade={5} /></span>
      <span className="min-w-0 flex-1 block">
        <span id="sm-t" className="hd sm-t block">Le tue scintille</span>
        <span className="sm-sub block">{shut
          ? <span className="sm-rd"><span><b>{dd(okRec ? nRec : null)}</b> ricevute</span><span><b>{dd(okAcc ? nAcc : null)}</b> accese da te</span></span>
          : "Il segnale delle frasi che hanno colpito: quelle accese sui tuoi pensieri e quelle che hai acceso tu."}</span>
      </span>
      <span className="sm-fl" aria-hidden="true"><ChevronDown size={16} /></span>
      <span className="sr-only">{shut ? " · tocca per aprire" : " · tocca per ritrarre"}</span>
    </button></h2>
    {/* chiusa, il contenuto resta montato (i dati restano) ma non si raggiunge con la tastiera */}
    <div id="sm-fold" className="sm-fold" {...(shut ? { inert: "" } : {})}><div className="sm-in">
      <div className="sm-deck">
        {/* lo schermo: si ridisegna, canale per canale, a ogni giro di manopola */}
        <div className="sm-scr" role="group" aria-label={`Scintille ${tab === "ricevute" ? "ricevute" : "accese da te"} per emozione`}>
          <div className="sm-scr-hd" aria-hidden="true">
            <span><i className="sm-rec" />{tab === "ricevute" ? "CH · Ricevute" : "CH · Accese da te"}</span>
            <span>TOT <b>{busy ? "--" : dd(total)}</b></span>
          </div>
          <div key={tab} className={`sm-lanes ${busy ? "wait" : ""}`}>
            {TIPI.map((t, i) => {
              const n = counts[t.id], on = !busy && n > 0;
              return <button key={t.id} type="button" className={`sm-lane t-${t.id} ${on ? "" : "zero"} ${hl === t.id ? "hl" : ""}`} style={{ ["--i" as any]: i }}
                aria-pressed={solo === t.id} disabled={!on} aria-label={`${t.label}: ${n} ${n === 1 ? "scintilla" : "scintille"}${solo === t.id ? ", mostrate da sole" : ""}`}
                onClick={() => lane(t.id)} onPointerEnter={(e) => { if (e.pointerType === "mouse" && on) setHl(t.id); }} onPointerLeave={() => setHl(null)}>
                <span className="sm-lane-k" aria-hidden="true">CH{i + 1}<span>{t.label}</span></span>
                <span className="sm-lane-w" aria-hidden="true">
                  {on ? <Onda tipo={t.id} h={30} a={Math.min(11, 3.5 + 2 * n)} stroke={1.6} fade={18} ph={i * 13} className={`sm-trace ${hl === t.id || solo === t.id ? "run" : ""}`} /> : <i className="sm-zero" />}
                  <i className="sm-beam" />
                </span>
                <span className="sm-lane-n" aria-hidden="true">{busy ? "--" : dd(n)}</span>
              </button>;
            })}
          </div>
          <div className="sm-scr-ft" aria-hidden="true">
            <span>{busy ? "in ascolto…" : total ? `${groups.length} ${groups.length === 1 ? "pensiero" : "pensieri"}` : "nessun segnale"}</span>
            <span>{!busy && last !== undefined ? `ultima ${quando(last)}` : ""}</span>
          </div>
        </div>
        {/* la manopola: due posizioni, Ricevute e Accese da te */}
        <div className="sm-sel" role="tablist" aria-label="Quali scintille">
          <button type="button" role="tab" aria-selected={tab === "ricevute"} className="sm-ch" onClick={() => pick("ricevute")}>
            <i className="sm-led" aria-hidden="true" /><span className="sm-ch-t"><b>Ricevute</b><small>sui tuoi pensieri</small></span><span className="sm-ch-n">{dd(okRec ? nRec : null)}</span>
          </button>
          <button type="button" className={`sm-knob ${tab}`} tabIndex={-1} aria-hidden="true" onClick={() => pick(tab === "ricevute" ? "accese" : "ricevute")}>
            <i className="sm-knob-sk" /><i className="sm-knob-cap"><i className="sm-knob-tick" /></i>
          </button>
          <button type="button" role="tab" aria-selected={tab === "accese"} className="sm-ch r" onClick={() => pick("accese")}>
            <span className="sm-ch-n">{dd(okAcc ? nAcc : null)}</span><span className="sm-ch-t"><b>Accese<span className="sm-long"> da te</span></b><small>sui pensieri degli altri</small></span><i className="sm-led" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div key={`${tab}:${solo || ""}`} className="sm-body" role="tabpanel">
        {solo && <p className="sm-solo"><span className={`sm-solo-k t-${solo}`}>Solo il canale <b>{label(solo)}</b></span><button type="button" className="sc-lst" onClick={() => { setSolo(null); haptic("select"); }}>Tutti i canali<X size={13} /></button></p>}
        {busy ? <div className="sm-empty"><Loader2 size={16} className="animate-spin" /></div>
          : !shown.length ? <p className="sm-empty">{tab === "ricevute" ? "Quando qualcuno accenderà una frase dei tuoi pensieri, il suo segnale arriverà qui. Chi l’ha accesa resta anonimo." : "Leggi il Diario: seleziona una frase che ti colpisce e accendi una scintilla. Il suo segnale resterà qui."}</p>
          : <ul className="sm-l">
            {(all ? shown : shown.slice(0, SHOW)).map((g, i) => <li key={g.key} className="sm-g" style={{ ["--i" as any]: i }}>
              <button type="button" className="sm-gh" disabled={tab === "accese" && !docs[g.key]} onClick={() => open(g.key)}>
                <span className="sm-gt">{g.title || "Pensiero ritirato"}</span>
                <span className="sm-gn">{g.list.length} {g.list.length === 1 ? "scintilla" : "scintille"}</span>
                {(tab === "ricevute" || docs[g.key]) && <ArrowUpRight size={14} aria-hidden="true" />}
              </button>
              <ul>{g.list.map((s, j) => <li key={s.id} className={`sm-s t-${s.tipo}`} style={{ ["--j" as any]: Math.min(i * 2 + j, 10) }}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setHl(s.tipo); }} onPointerLeave={() => setHl(null)}>
                <q className="sm-q">{flat(s.cit)}</q>
                <Onda tipo={s.tipo} h={12} a={3.2} stroke={1.5} fade={22} ph={faseCanale(seme(s.id), 0)} className="sm-sig" />
                <span className="sm-meta"><Chip tipo={s.tipo} /><span className="sm-d">{quando(s.giorno)}</span></span>
                {s.nota && <p className="sm-nota">{s.nota}</p>}
              </li>)}</ul>
            </li>)}
          </ul>}
        {!busy && shown.length > SHOW && <button type="button" className="sc-lst sm-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Mostra meno" : `Mostra tutte (${shown.length} pensieri)`}<ChevronDown size={14} /></button>}
      </div>
    </div></div>
  </section>;
}
