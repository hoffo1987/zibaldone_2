import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, type Firestore } from "firebase/firestore";
import { Sparkles, ChevronDown, Loader2, ArrowUpRight, Inbox, Send } from "lucide-react";
import { TIPI, flat, leggiScintilla, msDelGiorno, oggi, type Scintilla, type Tipo } from "./scintille";
import { readPublic, PUBLIC_VERSION } from "./testi";
import { haptic } from "./haptics";
import "./scintille.css";

// «Le tue scintille», in I miei scritti: una sezione piccola con due schede.
//   Ricevute    le frasi accese dagli altri sui propri pensieri del diario (le stesse che il client legge per le notifiche,
//               scByP in App), anonime come nel lettore;
//   Accese      quelle accese da sé sui pensieri degli altri: le voci di scintille_mie/{uid}/voci, la scintilla e il
//               titolo del pensiero (la copia pubblica in testi). Una scintilla che l'autore ha tolto non c'è più e non si mostra.
// Toccando una frase si apre il pensiero.
export type Ricevute = { id: string; title: string; list: Scintilla[] }[];
type Accesa = { s: Scintilla; pid: string; title: string | null };

const tipoLabel = (t: Tipo) => TIPI.find((x) => x.id === t)?.label || "";
const quando = (g: number) => {
  const d = oggi() - g;
  return d <= 0 ? "oggi" : d === 1 ? "ieri" : d < 7 ? `${d} giorni fa` : new Date(msDelGiorno(g)).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};
const SHOW = 3; // pensieri visibili prima di «Mostra tutte»

export function ScintilleMie({ db, uid, received, ready, find, onOpenOwn, onOpenOther, onLook }: {
  db: Firestore; uid: string; received: Ricevute; ready: boolean; find: (id: string) => any;
  onOpenOwn: (id: string) => void; onOpenOther: (t: any) => void; onLook: () => void;
}) {
  const [tab, setTab] = useState<"ricevute" | "accese">("ricevute");
  const [mine, setMine] = useState<Accesa[] | null>(null);
  const [all, setAll] = useState(false);
  const [docs, setDocs] = useState<Record<string, any>>({});

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
  const groups = tab === "ricevute" ? rec : acc, busy = tab === "ricevute" ? !ready && !late : mine === null;
  const open = (key: string) => {
    haptic("tap");
    if (tab === "ricevute") onOpenOwn(key); else if (docs[key]) onOpenOther(docs[key]);
  };
  const pick = (t: "ricevute" | "accese") => { if (t !== tab) { setTab(t); setAll(false); haptic("select"); } };

  return <section className="sc-mie pn" aria-labelledby="sc-mie-t">
    <div className="sc-mie-hd">
      <span className="sc-mie-ic" aria-hidden="true"><Sparkles size={17} /></span>
      <div className="min-w-0 flex-1"><h2 id="sc-mie-t" className="hd sc-mie-t">Le tue scintille</h2><p className="sc-mie-sub">Le frasi che brillano: quelle accese sui tuoi pensieri e quelle che hai acceso tu.</p></div>
    </div>
    <div className="sc-mie-tabs" role="tablist" aria-label="Scintille" data-i={tab === "ricevute" ? 0 : 1}>
      <span className="sc-mie-thumb" aria-hidden="true" />
      <button type="button" role="tab" aria-selected={tab === "ricevute"} onClick={() => pick("ricevute")}><Inbox size={14} aria-hidden="true" />Ricevute<b>{ready || late ? nRec : "…"}</b></button>
      <button type="button" role="tab" aria-selected={tab === "accese"} onClick={() => pick("accese")}><Send size={14} aria-hidden="true" />Accese da te<b>{mine ? nAcc : "…"}</b></button>
    </div>
    <div key={tab} className="sc-mie-body" role="tabpanel">
      {busy ? <div className="sc-mie-empty"><Loader2 size={16} className="animate-spin" /></div>
        : !groups.length ? <p className="sc-mie-empty">{tab === "ricevute" ? "Quando qualcuno accenderà una frase dei tuoi pensieri, la troverai qui. Chi l’ha accesa resta anonimo." : "Leggi il Diario: seleziona una frase che ti colpisce e accendi una scintilla. Le ritroverai qui."}</p>
        : <ul className="sc-mie-l">
          {(all ? groups : groups.slice(0, SHOW)).map((g, i) => <li key={g.key} className="sc-mie-g" style={{ ["--i" as any]: i }}>
            <button type="button" className="sc-mie-p" disabled={tab === "accese" && !docs[g.key]} onClick={() => open(g.key)}>
              <span className="sc-mie-pt">{g.title || "Pensiero ritirato"}</span>
              <span className="sc-mie-pn">{g.list.length} {g.list.length === 1 ? "scintilla" : "scintille"}</span>
              {(tab === "ricevute" || docs[g.key]) && <ArrowUpRight size={14} aria-hidden="true" />}
            </button>
            <ul>{g.list.map((s) => <li key={s.id} className="sc-mie-s">
              <q>{flat(s.cit)}</q>
              <span className="sc-mie-meta"><span className={`sc-chip t-${s.tipo}`}><Sparkles size={11} aria-hidden="true" />{tipoLabel(s.tipo)}</span><span className="sc-mie-d">{quando(s.giorno)}</span></span>
              {s.nota && <span className="sc-nota-t">{s.nota}</span>}
            </li>)}</ul>
          </li>)}
        </ul>}
      {!busy && groups.length > SHOW && <button type="button" className="sc-lst sc-mie-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Mostra meno" : `Mostra tutte (${groups.length} pensieri)`}<ChevronDown size={14} /></button>}
    </div>
  </section>;
}
