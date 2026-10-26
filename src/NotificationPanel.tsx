import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, Check, CheckCheck, ChevronDown, CornerDownRight, Sparkles, Star } from "lucide-react";
import { TIPI } from "./scintille";
import "./notifications.css";

const date = (timestamp: number) => new Date(timestamp).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const time = (timestamp: number) => new Date(timestamp).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const isUpdate = (n: any) => n.tipo === "aggiornamento";
// le scintille e gli echi sui propri pensieri del diario: calcolati dal client, con la data del solo giorno
const isSpark = (n: any) => n.tipo === "scintilla" || n.tipo === "eco";
const tipiOf = (n: any) => (n.tipi || []).map((t: string) => TIPI.find((x) => x.id === t)?.label).filter(Boolean).join(" · ");
// quanto deve restare in vista una notifica perché conti come letta
export const READ_MS = 1400;

// i gruppi per giorno: oggi, ieri, questa settimana, prima
const dayOf = (ts: number) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const groupOf = (ts: number, now = Date.now()) => {
  const days = Math.round((dayOf(now) - dayOf(ts)) / 864e5);
  return days <= 0 ? "Oggi" : days === 1 ? "Ieri" : days < 7 ? "Questa settimana" : "Prima";
};

type Filter = "tutte" | "voti" | "scintille" | "novita";
const FILTERS: { id: Filter; label: string; test: (n: any) => boolean }[] = [
  { id: "tutte", label: "Tutte", test: () => true },
  { id: "voti", label: "Voti", test: (n) => !isUpdate(n) && !isSpark(n) },
  { id: "scintille", label: "Scintille", test: isSpark },
  { id: "novita", label: "Novità", test: isUpdate },
];

// Il pannello delle notifiche. Tre tipi ben distinti: i voti ai propri scritti (una scheda dorata col voto in medaglia,
// che apre lo scritto), le scintille e gli echi sui propri pensieri del diario (anonimi, col solo giorno: una valvola
// accesa col numero delle frasi) e le novità del Circuito (la nota dell'aggiornamento con la sua versione). Quelle da leggere
// stanno tutte insieme in cima, prima delle già lette divise per giorno, e ci restano finché il pannello è aperto
// (anche dopo averle lette), così l'elenco non salta sotto il dito. Una notifica si considera letta quando è rimasta
// in vista per un momento: il suo LED si riempie come un timer e diventa una spunta. Si può anche segnare tutto come
// letto, o leggerne una toccandola. Dove manca IntersectionObserver (test, browser vecchi) vale la regola di prima:
// dopo un momento si leggono tutte quelle aperte.
export default function NotificationPanel({ list, onRead, onOpen, stars }: {
  list: any[]; onRead: (ids: string[]) => void; onOpen: (n: any) => void; stars: (v: number) => React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("tutte");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // done: già comunicate come lette; lit: lette in questa apertura (mostrano la spunta); reading: in vista, il timer corre
  const done = useRef(new Set<string>());
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [reading, setReading] = useState<Set<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const read = useRef(onRead); read.current = onRead;
  const unreadOf = (n: any) => !n.letta && !done.current.has(n.id);

  const commit = (ids: string[]) => {
    // quelle già lette (anche in un'altra apertura) non si riscrivono: tenerle o toccarle non cambia nulla
    const fresh = ids.filter((id) => !done.current.has(id) && !list.find((n) => n.id === id)?.letta);
    if (!fresh.length) return;
    fresh.forEach((id) => { done.current.add(id); const t = timers.current.get(id); if (t) clearTimeout(t); timers.current.delete(id); });
    setLit((s) => { const x = new Set(s); fresh.forEach((id) => x.add(id)); return x; });
    setReading((s) => { const x = new Set(s); fresh.forEach((id) => x.delete(id)); return x; });
    read.current(fresh);
  };
  const commitRef = useRef(commit); commitRef.current = commit;

  // fresh: da leggere quando il pannello si è aperto (o arrivate dopo). Restano nel gruppo in cima fino alla chiusura
  const fresh = useRef(new Set<string>());
  list.forEach((n) => { if (unreadOf(n)) fresh.current.add(n.id); });
  const shown = list.filter(FILTERS.find((f) => f.id === filter)!.test);
  const top = shown.filter((n) => fresh.current.has(n.id)), past = shown.filter((n) => !fresh.current.has(n.id));
  const unread = list.filter(unreadOf);
  const unreadKey = top.filter(unreadOf).map((n) => n.id).join("|");
  const box = useRef<HTMLDivElement>(null);

  // in vista per READ_MS → letta. Senza IntersectionObserver, tutte quelle mostrate insieme
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  useEffect(() => {
    const ids = unreadKey ? unreadKey.split("|") : [];
    // i timer di quelle ancora da leggere continuano: quando un'altra viene letta l'elenco cambia, ma non si riparte da zero
    const map = timers.current;
    map.forEach((t, id) => { if (!ids.includes(id)) { clearTimeout(t); map.delete(id); } });
    setReading((s) => { const x = new Set(Array.from(s).filter((id) => ids.includes(id))); return x.size === s.size ? s : x; });
    if (!ids.length) return;
    if (typeof IntersectionObserver === "undefined" || !box.current) {
      setReading(new Set(ids));
      const t = setTimeout(() => commitRef.current(ids), READ_MS);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const id = (e.target as HTMLElement).dataset.nid!;
        if (!id || done.current.has(id)) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (map.has(id)) return;
          setReading((s) => new Set(s).add(id));
          map.set(id, setTimeout(() => { map.delete(id); commitRef.current([id]); }, READ_MS));
        } else {
          const t = map.get(id); if (t) clearTimeout(t); map.delete(id);
          setReading((s) => { if (!s.has(id)) return s; const x = new Set(s); x.delete(id); return x; });
        }
      });
    // si misura sul contenitore che scorre davvero: l'elenco sul computer, il foglio che sale dal basso sul telefono
    }, { root: getComputedStyle(box.current).overflowY === "visible" ? box.current.closest<HTMLElement>(".cp") : box.current, threshold: [0, 0.6, 1] });
    box.current.querySelectorAll<HTMLElement>("[data-nid]").forEach((el) => { if (ids.includes(el.dataset.nid!)) io.observe(el); });
    return () => io.disconnect();
  }, [unreadKey]);

  if (!list.length) return <div className="nt-empty"><span className="nt-empty-art" aria-hidden="true"><Bell size={22} /><i /></span><b>Nessuna notifica per ora</b><span>Qui trovi i voti ai tuoi scritti, le scintille sui tuoi pensieri e le novità dell’applicazione.</span></div>;

  const count = (f: typeof FILTERS[number]) => ({ all: list.filter(f.test).length, new: list.filter((n) => f.test(n) && unreadOf(n)).length });
  const card = (n: any, i: number) => {
    const st = unreadOf(n) ? reading.has(n.id) ? "unread reading" : "unread" : lit.has(n.id) ? "just-read" : "read";
    const led = <span className="nt-led" aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" pathLength={1} /></svg><Check size={10} strokeWidth={3.5} /></span>;
    if (n.tipo === "scintilla") return <button key={n.id} type="button" data-nid={n.id} className={`nt-card spark ${st}`} style={{ ["--i" as any]: i }} onClick={() => { commit([n.id]); onOpen(n); }}>
      <span className="nt-valve" aria-hidden="true"><Sparkles size={15} /><b>{n.conteggio}</b></span>
      <span className="nt-body">
        <span className="nt-top"><span className="nt-kind"><Sparkles size={11} />{n.conteggio === 1 ? "Una frase accesa" : `${n.conteggio} frasi accese`}</span>{led}</span>
        <span className="nt-title">«{n.titolo}»</span>
        {tipiOf(n) && <span className="nt-msg">{tipiOf(n)}</span>}
        <span className="nt-foot"><span className="nt-when">{date(n.timestamp)}</span><span className="nt-go">Apri il pensiero<ArrowUpRight size={13} /></span></span>
      </span>
    </button>;
    if (n.tipo === "eco") return <button key={n.id} type="button" data-nid={n.id} className={`nt-card eco ${st}`} style={{ ["--i" as any]: i }} onClick={() => { commit([n.id]); onOpen(n); }}>
      <span className="nt-key" aria-hidden="true"><CornerDownRight size={17} /></span>
      <span className="nt-body">
        <span className="nt-top"><span className="nt-kind">Un pensiero è nato dal tuo</span>{led}</span>
        <span className="nt-title">«{n.titolo}»</span>
        <span className="nt-msg nt-cit">{n.cit}</span>
        <span className="nt-foot"><span className="nt-when">{date(n.timestamp)}</span><span className="nt-go">Leggilo<ArrowUpRight size={13} /></span></span>
      </span>
    </button>;
    return isUpdate(n)
      ? <article key={n.id} data-nid={n.id} aria-label={`Aggiornamento ${n.versione}`} className={`nt-card upd ${st}`} style={{ ["--i" as any]: i }} onClick={() => commit([n.id])}>
        <span className="nt-key" aria-hidden="true"><Sparkles size={17} /></span>
        <div className="nt-body">
          <div className="nt-top"><span className="nt-kind">Novità del Circuito</span><span className="nt-ver">v{n.versione}</span>{led}</div>
          <p className="nt-title">{n.titolo}</p>
          <p className={`nt-msg ${open[n.id] ? "open" : ""}`}>{n.messaggio}</p>
          <div className="nt-foot"><span className="nt-when">{date(n.timestamp)}</span>
            {(n.messaggio || "").length > 150 && <button type="button" className="nt-more" aria-expanded={!!open[n.id]} onClick={(e) => { e.stopPropagation(); commit([n.id]); setOpen((o) => ({ ...o, [n.id]: !o[n.id] })); }}>{open[n.id] ? "Riduci" : "Leggi tutto"}<ChevronDown size={13} /></button>}</div>
        </div>
      </article>
      : <button key={n.id} type="button" data-nid={n.id} className={`nt-card vote ${st}`} style={{ ["--i" as any]: i }} onClick={() => { commit([n.id]); onOpen(n); }}>
        <span className="nt-medal" aria-hidden="true"><b>{String(n.voto ?? "").replace(".", ",")}</b><small>/5</small></span>
        <span className="nt-body">
          <span className="nt-top"><span className="nt-kind"><Star size={11} />Hai ricevuto un voto</span>{led}</span>
          <span className="nt-title">«{n.titolo}»</span>
          <span className="nt-stars">{stars(n.voto)}</span>
          <span className="nt-foot"><span className="nt-when">{date(n.timestamp)} · {time(n.timestamp)}</span><span className="nt-go">Apri lo scritto<ArrowUpRight size={13} /></span></span>
        </span>
      </button>;
  };
  const topLeft = top.filter(unreadOf).length;
  let last = "";
  return <div className="nt">
    <div className="nt-head">
      <span className={`nt-sum ${unread.length ? "" : "clear"}`} aria-live="polite">
        <i aria-hidden="true">{unread.length ? null : <Check size={11} strokeWidth={3.5} />}</i>
        {unread.length ? <><b key={unread.length}>{unread.length}</b> da leggere</> : "Tutto letto"}
      </span>
      <button type="button" className="nt-all" disabled={!unread.length} onClick={() => commit(unread.map((n) => n.id))}><CheckCheck size={14} />Segna tutte come lette</button>
    </div>
    <div className="nt-tabs" role="tablist" aria-label="Tipo di notifiche" style={{ ["--t" as any]: FILTERS.findIndex((f) => f.id === filter), ["--n" as any]: FILTERS.length }}>
      <span className="nt-tab-ind" aria-hidden="true" />
      {FILTERS.map((f) => { const c = count(f); return <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`nt-tab ${f.id}`} onClick={() => setFilter(f.id)}>
        {f.label}<span className="nt-tab-n">{c.all}</span>{c.new > 0 && <i className="nt-tab-dot" aria-label={`${c.new} da leggere`} />}
      </button>; })}
    </div>
    <div ref={box} className="nt-list" aria-label="Elenco notifiche">
      {!shown.length && <p className="nt-none">{filter === "voti" ? "Ancora nessun voto: arriverà quando un tuo scritto completo sarà valutato e svelato." : filter === "scintille" ? "Ancora nessuna scintilla: arriverà quando qualcuno accenderà una frase dei tuoi pensieri del diario." : "Nessuna novità da mostrare."}</p>}
      {top.length > 0 && <>
        <p className={`nt-day nt-fresh ${topLeft ? "" : "done"}`}><span>{topLeft ? "Da leggere" : "Appena lette"}</span><b>{topLeft || top.length}</b></p>
        {top.map(card)}
      </>}
      {past.map((n, i) => {
        const g = groupOf(n.timestamp), head = g !== last; last = g;
        return <React.Fragment key={n.id}>
          {head && <p className="nt-day"><span>{top.length > 0 && i === 0 ?`Già lette · ${g}` : g}</span></p>}
          {card(n, top.length + i)}
        </React.Fragment>;
      })}
    </div>
  </div>;
}

// La campanella col numero: quando si legge il numero scende con un piccolo salto, a zero il bollino se ne va con una
// spunta e un lampo; quando arriva qualcosa di nuovo la campanella suona
export function BellMark({ count }: { count: number }) {
  const prev = useRef(count);
  const [mode, setMode] = useState<"" | "down" | "up">("");
  const [leaving, setLeaving] = useState(false);
  const [ring, setRing] = useState(0);
  useLayoutEffect(() => {
    const p = prev.current; prev.current = count;
    if (count === p) return;
    if (count > p) { setRing((r) => r + 1); setMode("up"); setLeaving(false); return; }
    setMode("down");
    if (count === 0 && p > 0) { setLeaving(true); const t = setTimeout(() => setLeaving(false), 900); return () => clearTimeout(t); }
  }, [count]);
  return <>
    <span key={ring} className={`bm-bell ${ring ? "ring" : ""}`}><Bell size={18} /></span>
    {count > 0 ? <span key={`${count}-${mode}`} className={`bm-badge ${mode}`}>{count}</span>
      : leaving && <span className="bm-badge gone" aria-hidden="true"><Check size={10} strokeWidth={3.5} /><i /></span>}
  </>;
}
