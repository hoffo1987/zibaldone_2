import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpenText, ChevronDown, Feather, Loader2, Lock, PenLine, Send, SlidersHorizontal } from "lucide-react";
import { excerptOf, isDiary, rankWritings } from "./testi";
import { FRASE_MAX, SCELTI_MAX, fraseOk, fraseTra, giorno, giri, inGara, leggiCapitolo, leggiIncipit, meseDi, mesePrima, nomeMese, nomeMeseAnno, parole,
  staffettaOf, svelamentoDi, svelato, ultimoGiorno, type CapitoloPub, type Giro, type Incipit } from "./staffetta";
import { haptic } from "./haptics";
import "./staffetta.css";

// «La staffetta», in Scritti completi: l'incipit del mese, i capitoli in corsa (anonimi) e il racconto collettivo.
// Il disegno è un relè, la staffetta dei circuiti: passandoci sopra l'ancora si chiude e la corrente passa all'incipit.
// I numeri sono valvole Nixie. Per l'admin, sotto, la regia: la frase dal podio e la scelta dei capitoli.

// una cifra come in una valvola Nixie: il numero acceso dentro il vetro fumé
export const Nixie = ({ v, w = 2 }: { v: number; w?: number }) =>
  <span className="rl-nx" aria-hidden="true">{String(Math.max(0, v)).padStart(w, "0").split("").map((c, i) => <b key={i}>{c}</b>)}</span>;

const Relay = () => <span className="rl-relay" aria-hidden="true"><i className="rl-yoke" /><i className="rl-coil" /><i className="rl-arm" /><i className="rl-ct" /><i className="rl-spark" /><i className="rl-wire" /></span>;

type Props = {
  db: Firestore; admin: boolean; uid: string;
  own: any[]; pub: any[];
  onWrite: (r: { mese: string; frase: string }) => void;
  onOpen: (t: any, e?: any) => void;
  onStory: (g: Giro[], e?: any) => void;
  notify: (m: string) => void;
};

export function StaffettaPanel({ db, admin, uid, own, pub, onWrite, onOpen, onStory, notify }: Props) {
  const cur = meseDi(Date.now());
  const [incipit, setIncipit] = useState<Incipit[] | null>(null);
  const [pubblicati, setPubblicati] = useState<Record<string, CapitoloPub[]>>({});
  const [tick, setTick] = useState(0);
  const [list, setList] = useState(false);
  const [regia, setRegia] = useState(false);

  useEffect(() => onSnapshot(collection(db, "staffetta"), (q) => {
    const l: Incipit[] = [];
    q.forEach((d) => { const x = leggiIncipit(d.id, d.data()); if (x) l.push(x); });
    setIncipit(l);
  }, (e) => { console.warn("Staffetta non letta (controlla le regole di Firestore)", e); setIncipit([]); }), [db]);
  // i capitoli pubblicati esistono solo per i mesi già svelati: un mese alla volta, pochi documenti
  const svelati = (incipit || []).filter((x) => svelato(x.mese)).map((x) => x.mese).join("|");
  useEffect(() => {
    if (!svelati) return;
    let on = true;
    (async () => {
      const got: Record<string, CapitoloPub[]> = {};
      await Promise.all(svelati.split("|").map(async (m) => {
        try { const q = await getDocs(collection(db, "staffetta", m, "capitoli")); got[m] = q.docs.map((d) => leggiCapitolo(d.id, d.data())).filter(Boolean) as CapitoloPub[]; }
        catch { got[m] = []; }
      }));
      if (on) setPubblicati(got);
    })();
    return () => { on = false; };
  }, [db, svelati, tick]);

  const ordered = useMemo(() => giri(incipit || [], pubblicati), [incipit, pubblicati]);
  const now = ordered.find((g) => g.mese === cur) || null;
  const story = ordered.filter((g) => g.capitoli.length);
  const nStory = story.reduce((n, g) => n + g.capitoli.length, 0);
  // in gara: chi non amministra li trova tra le copie anonime e i propri; nell'ordine degli id, che non tradisce nulla
  const race = useMemo(() => inGara(cur, own, pub).sort((a, b) => a.id.localeCompare(b.id)), [cur, own, pub]);
  const mine = race.filter((t) => t.userId === uid).length;

  if (incipit === null) return <section className="rl pn rl-loading" aria-busy="true"><Loader2 size={16} className="animate-spin" /></section>;
  // niente staffetta, niente racconto: chi non amministra non vede un riquadro vuoto
  if (!admin && !now && !story.length) return null;

  const write = () => { if (now) { haptic("select"); onWrite({ mese: now.mese, frase: now.frase }); } };
  const read = (e: any) => { haptic("tap"); onStory(story, e); };
  return <section className="rl pn" aria-labelledby="rl-t" data-tour="staffetta">
    <div className="rl-top">
      <Relay />
      <div className="min-w-0 flex-1">
        <p className="rl-k"><span>La staffetta</span>{now && <span className="rl-giro">giro <Nixie v={now.giro} /></span>}</p>
        <h2 id="rl-t" className="hd rl-t">Il racconto che passa di mano</h2>
        <p className="rl-sub">Ogni mese una frase dal podio diventa l’incipit: scrivi tu il capitolo dopo. I migliori entrano nel racconto del Circuito.</p>
      </div>
    </div>
    {now ? <figure className="rl-q">
      <figcaption className="rl-q-k">Incipit di {nomeMese(now.mese)} · una frase dal podio</figcaption>
      <blockquote><q>{now.frase}</q></blockquote>
    </figure> : <p className="rl-wait"><Feather size={15} aria-hidden="true" />La staffetta di {nomeMese(cur)} non è ancora partita: l’incipit arriva con una frase del podio.</p>}
    {now && <ul className="rl-facts" aria-label="La staffetta del mese">
      <li><Nixie v={race.length} /><span>{race.length === 1 ? "capitolo in corsa" : "capitoli in corsa"}{mine ? ` · ${mine} ${mine === 1 ? "è tuo" : "sono tuoi"}` : ""}</span></li>
      <li><PenLine size={14} aria-hidden="true" /><span>Si scrive fino al {giorno(ultimoGiorno(now.mese))}</span></li>
      <li><Lock size={14} aria-hidden="true" /><span>Anonimi fino al {giorno(svelamentoDi(now.mese))}, quando si svela il racconto</span></li>
    </ul>}
    <div className="rl-acts">
      {now && <button type="button" className="bt rl-go" onClick={write}><PenLine size={15} />Scrivi il capitolo<ArrowUpRight size={15} /></button>}
      {story.length > 0 && <button type="button" className="bt rl-read" onClick={read}><BookOpenText size={15} />Leggi il racconto<span className="rl-n">{nStory}</span></button>}
      {now && race.length > 0 && <button type="button" className="sc-lst rl-lst" aria-expanded={list} aria-controls="rl-l" onClick={() => setList(!list)}>Capitoli in corsa<ChevronDown size={14} /></button>}
    </div>
    {list && now && <ul id="rl-l" className="rl-l">
      {race.map((t, i) => <li key={t.id} style={{ ["--i" as any]: i }}><button type="button" className="rl-c" onClick={(e) => onOpen(t, e)}>
        <i className="rl-c-node" aria-hidden="true" />
        <span className="rl-c-t">{t.title || "Senza titolo"}</span>
        {t.userId === uid ? <span className="rl-c-me">tuo</span> : !admin && <span className="rl-c-anon">anonimo · estratto</span>}
        <ArrowUpRight size={14} aria-hidden="true" />
      </button></li>)}
    </ul>}
    {admin && <>
      <button type="button" className="rl-regia-tg" aria-expanded={regia} onClick={() => setRegia(!regia)}><SlidersHorizontal size={14} aria-hidden="true" /><span className="flex-1 text-left">Regia della staffetta</span><ChevronDown size={15} aria-hidden="true" /></button>
      {regia && <Regia db={db} cur={cur} own={own} incipit={incipit} now={now} pubblicati={pubblicati} notify={notify} reload={() => setTick((n) => n + 1)} />}
    </>}
  </section>;
}

// ===== la regia (solo admin) =====
function Regia({ db, cur, own, incipit, now, pubblicati, notify, reload }: {
  db: Firestore; cur: string; own: any[]; incipit: Incipit[]; now: Giro | null; pubblicati: Record<string, CapitoloPub[]>; notify: (m: string) => void; reload: () => void;
}) {
  const mesi = incipit.filter((x) => x.mese <= cur).map((x) => x.mese).sort().reverse().slice(0, 3);
  return <div className="rl-regia">
    <IncipitPicker db={db} cur={cur} own={own} now={now} notify={notify} hasChapters={inGara(cur, own).length > 0} />
    {mesi.map((m) => <SceltaMese key={m} db={db} mese={m} own={own} pubblicati={pubblicati[m] || []} notify={notify} reload={reload} />)}
  </div>;
}

const excerptDi = (t: any) => (typeof t?.excerpt === "string" ? t.excerpt : excerptOf(t?.content || ""));
function IncipitPicker({ db, cur, own, now, notify, hasChapters }: { db: Firestore; cur: string; own: any[]; now: Giro | null; notify: (m: string) => void; hasChapters: boolean }) {
  const prev = mesePrima(cur);
  // le fonti possibili: gli scritti completi già svelati, prima il podio del mese scorso
  const podio = useMemo(() => rankWritings(own.filter((t) => !isDiary(t) && meseDi(t.timestamp) === prev)).filter((t) => t.svelato).slice(0, 3), [own, prev]);
  const fonti = useMemo(() => {
    const top = new Set(podio.map((t) => t.id));
    const rest = own.filter((t) => !isDiary(t) && t.svelato === true && !top.has(t.id) && excerptDi(t).length >= 3)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.timestamp - a.timestamp).slice(0, 40);
    return [...podio.filter((t) => excerptDi(t).length >= 3), ...rest];
  }, [own, podio]);
  const [id, setId] = useState("");
  const [fonte, setFonte] = useState<string | null>(null);
  const [ab, setAb] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    if (!now) { setFonte(null); return; }
    getDoc(doc(db, "staffetta", now.mese, "riservato", "fonte")).then((d) => setFonte(d.exists() ? String(d.data().id || "") : null)).catch(() => setFonte(null));
  }, [db, now?.mese, now?.frase]);
  const t = fonti.find((x) => x.id === id) || null;
  const ex = t ? excerptDi(t) : "", ws = useMemo(() => parole(ex), [ex]);
  const frase = ab ? fraseTra(ex, ws, ab[0], ab[1]) : "";
  const ok = !!t && fraseOk(ex, frase);
  const tap = (i: number) => { haptic("tap"); setAb((p) => (!p || p[0] !== p[1] ? [i, i] : [p[0], i])); };
  const pubblica = async () => {
    if (!t || !ok) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      b.set(doc(db, "staffetta", cur), { frase, creato: Date.now() });
      b.set(doc(db, "staffetta", cur, "riservato", "fonte"), { id: t.id });
      await b.commit();
      haptic("success"); notify(`L’incipit di ${nomeMese(cur)} è partito.`); setEdit(false); setAb(null); setId("");
    } catch (e) { console.error("Incipit non pubblicato", e); notify("Incipit non pubblicato: la frase deve venire dall’estratto di uno scritto già svelato."); }
    setBusy(false);
  };
  const medal = (x: any) => { const k = podio.findIndex((p) => p.id === x.id); return k >= 0 ? `${k + 1}° del podio di ${nomeMese(prev)} · ` : ""; };
  const src = fonte ? own.find((x) => x.id === fonte) : null;
  return <div className="rl-box">
    <p className="rl-box-k"><span className="rl-step">01</span>Incipit di {nomeMeseAnno(cur)}</p>
    {now && !edit ? <div className="rl-box-b">
      <p className="text-sm"><q className="rl-inline-q">{now.frase}</q></p>
      <p className="mu text-xs mt-1">Da «{src?.title || "uno scritto del podio"}». Solo tu sai da dove viene: gli altri vedono la frase.</p>
      {!hasChapters && <button type="button" className="sc-lst mt-2" onClick={() => setEdit(true)}>Cambia l’incipit</button>}
    </div> : <div className="rl-box-b">
      <label className="block text-xs mu" htmlFor="rl-src">Lo scritto da cui prendere la frase (già svelato)</label>
      <select id="rl-src" className="inp mt-1 !w-full" value={id} onChange={(e) => { setId(e.target.value); setAb(null); }}>
        <option value="">Scegli uno scritto…</option>
        {fonti.map((x) => <option key={x.id} value={x.id}>{medal(x)}{x.title} · {String(x.rating || 0).replace(".", ",")}★</option>)}
      </select>
      {!fonti.length && <p className="mu text-xs mt-2">Nessuno scritto svelato con un estratto: svela prima gli autori del podio.</p>}
      {t && <>
        <p className="mu text-xs mt-3">Tocca la prima e l’ultima parola della frase. Si sceglie solo dall’estratto pubblico.</p>
        <p className="rl-words">{ws.map((w, i) => { const on = !!ab && i >= Math.min(...ab) && i <= Math.max(...ab); return <button key={i} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => tap(i)}>{w.t}</button>; })}</p>
        <p className="rl-pre">{frase ? <q>{frase}</q> : <span className="mu">Nessuna frase scelta</span>}<span className="rl-pre-n">{frase.length}/{FRASE_MAX}</span></p>
      </>}
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="bt rl-go" disabled={!ok || busy} onClick={pubblica}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Fai partire la staffetta</button>
        {edit && <button type="button" className="bt" onClick={() => setEdit(false)}>Annulla</button>}
      </div>
    </div>}
  </div>;
}

function SceltaMese({ db, mese, own, pubblicati, notify, reload }: { db: Firestore; mese: string; own: any[]; pubblicati: CapitoloPub[]; notify: (m: string) => void; reload: () => void }) {
  const caps = useMemo(() => own.filter((t) => staffettaOf(t) === mese).sort((a, b) => a.timestamp - b.timestamp), [own, mese]);
  const [ids, setIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getDoc(doc(db, "staffetta", mese, "riservato", "scelta"))
      .then((d) => setIds(d.exists() && Array.isArray(d.data().ids) ? d.data().ids.filter((x: any) => typeof x === "string") : pubblicati.map((c) => c.id)))
      .catch(() => setIds([]));
  }, [db, mese]);
  const open = svelato(mese);
  const sel = (ids || []).filter((x) => caps.some((t) => t.id === x));
  const toggle = (id: string) => { haptic("select"); setIds((l) => { const x = l || []; return x.includes(id) ? x.filter((y) => y !== id) : x.length >= SCELTI_MAX ? x : [...x, id]; }); };
  const move = (id: string, d: number) => setIds((l) => { const x = [...(l || [])], i = x.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= x.length) return x; [x[i], x[j]] = [x[j], x[i]]; return x; });
  const salva = async (pubblica: boolean) => {
    setBusy(true);
    try {
      await setDoc(doc(db, "staffetta", mese, "riservato", "scelta"), { ids: sel });
      if (pubblica) {
        const b = writeBatch(db);
        sel.forEach((id, i) => { const t = caps.find((x) => x.id === id)!; b.set(doc(db, "staffetta", mese, "capitoli", id), { ordine: i, title: t.title, content: t.content || "", firma: t.author || "", autoreId: t.userId }); });
        pubblicati.filter((c) => !sel.includes(c.id)).forEach((c) => b.delete(doc(db, "staffetta", mese, "capitoli", c.id)));
        await b.commit();
        reload();
      }
      haptic("success"); notify(pubblica ? `Il racconto di ${nomeMese(mese)} è pubblicato.` : "Scelta salvata: la vedi solo tu.");
    } catch (e) { console.error("Scelta della staffetta non salvata", e); notify(pubblica ? "Pubblicazione non riuscita: il racconto si svela dal 3 del mese dopo." : "Scelta non salvata. Riprova."); }
    setBusy(false);
  };
  const published = new Set(pubblicati.map((c) => c.id));
  return <div className="rl-box">
    <p className="rl-box-k"><span className="rl-step">02</span>Capitoli di {nomeMeseAnno(mese)}<span className="rl-box-n">{sel.length}/{caps.length} scelti</span></p>
    <div className="rl-box-b">
      {ids === null ? <Loader2 size={15} className="animate-spin" /> : !caps.length ? <p className="mu text-xs">Ancora nessun capitolo.</p> : <ol className="rl-pick">
        {[...sel.map((id) => caps.find((t) => t.id === id)!), ...caps.filter((t) => !sel.includes(t.id))].map((t) => {
          const k = sel.indexOf(t.id), on = k >= 0;
          return <li key={t.id} className={on ? "on" : ""}>
            <button type="button" className="rl-pick-t" aria-pressed={on} onClick={() => toggle(t.id)}><i className="rl-led" aria-hidden="true" /><span className="rl-pick-n">{on ? k + 1 : "–"}</span><span className="min-w-0 flex-1"><b className="block truncate">{t.title}</b><span className="mu text-xs block truncate">{t.author}{t.rating ? ` · ${String(t.rating).replace(".", ",")}★` : ""}{published.has(t.id) ? " · nel racconto" : ""}</span></span></button>
            {on && <span className="rl-pick-mv"><button type="button" className="bt !p-1.5" aria-label="Sposta prima" disabled={k === 0} onClick={() => move(t.id, -1)}><ArrowUp size={13} /></button><button type="button" className="bt !p-1.5" aria-label="Sposta dopo" disabled={k === sel.length - 1} onClick={() => move(t.id, 1)}><ArrowDown size={13} /></button></span>}
          </li>;
        })}
      </ol>}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" className="bt" disabled={busy || ids === null} onClick={() => salva(false)}>Salva la scelta</button>
        <button type="button" className="bt rl-go" disabled={busy || ids === null || !open || (!sel.length && !pubblicati.length)} onClick={() => salva(true)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <BookOpenText size={15} />}Pubblica nel racconto</button>
        {!open && <span className="mu text-xs">Si pubblica dal {giorno(svelamentoDi(mese))}, quando si svela il podio: fino ad allora gli autori restano anonimi.</span>}
      </div>
    </div>
  </div>;
}

// ===== il racconto, nel lettore =====
export function Racconto({ story, name, paper }: { story: Giro[]; name: (c: CapitoloPub) => string; paper: (c: CapitoloPub) => React.ReactNode }) {
  let n = 0;
  return <div className="rc">
    {story.map((g) => <section key={g.mese} className="rc-giro" aria-label={`Giro ${g.giro}, ${nomeMeseAnno(g.mese)}`}>
      <header className="rc-hd"><span className="rc-gn">giro <Nixie v={g.giro} /></span><span className="rc-m">{nomeMeseAnno(g.mese)}</span></header>
      <blockquote className="rc-inc"><q>{g.frase}</q><span>l’incipit, da uno scritto del podio</span></blockquote>
      {g.capitoli.map((c) => { n++; return <article key={c.id} className="rc-cap">
        <header className="rc-cap-hd"><h3 className="hd rc-ct"><span className="rc-cn">Capitolo {n}</span>{c.title}</h3>
          <p className="rc-by">di {name(c)}</p></header>
        {paper(c)}
      </article>; })}
    </section>)}
  </div>;
}
