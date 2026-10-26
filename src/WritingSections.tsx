import React from "react";
import { ArrowRight, BookOpen, FileText, ArrowUpRight, Eye, EyeOff, Feather, Flag, LockKeyhole, Pen, Signature, Star, Trophy, X } from "lucide-react";
import { plain } from "./sanitize";
import { isDiary, signatureOf, cartaOf, paperClass, type WritingKind } from "./testi";
import "./writing.css";
import "./rooms.css";
import "./compose.css";

type Sign = { on: boolean; set: (v: boolean) => void; name: string };
const KINDS = [
  { id: "complete", title: "Scritto completo", text: "Un tema, un racconto, una riflessione sviluppata. Partecipa alla selezione del mese.", icon: FileText,
    facts: [{ t: "Estratto pubblico", icon: LockKeyhole }, { t: "In gara per il podio", icon: Trophy }] },
  { id: "diary", title: "Pensiero del diario", text: "Un pensiero libero, un frammento della giornata. Si legge per intero, senza voti.", icon: BookOpen,
    facts: [{ t: "Lettura integrale", icon: Eye }, { t: "Senza voti", icon: Feather }] },
] as const;

// La scelta del tipo, come la prima voce di un modulo tecnico: il numero del passo, poi due tessere. Ognuna ha il suo
// tasto con l'icona, il LED che si accende quando è scelta e due righe su che fine farà lo scritto. Sotto, per il diario,
// la firma; in fondo una nota che dice chi potrà leggere, con l'icona del caso
export function KindPicker({ value, onChange, locked = false, sign }: { value: WritingKind; onChange: (v: WritingKind) => void; locked?: boolean; sign?: Sign }) {
  const diary = value === "diary", NoteIc = locked ? LockKeyhole : diary ? sign?.on ? Signature : EyeOff : LockKeyhole;
  return <fieldset className={`writing-picker compose pn ${locked ? "locked" : ""}`}>
    <legend className="cp-legend"><span className="cp-step" aria-hidden="true">01</span><span><span className="cp-eyebrow">Tipo di pagina</span><span className="hd cp-q">Che cosa stai scrivendo?</span></span></legend>
    <div className="cp-kinds">
      {KINDS.map(x =>
        <label key={x.id} className={`kind-option cp-kind ${value === x.id ? "selected" : ""} ${x.id}`}>
          <input type="radio" className="sr-only" name="writing-kind" value={x.id} checked={value === x.id} disabled={locked} onChange={() => onChange(x.id)} />
          <span className="cp-key" aria-hidden="true"><x.icon size={21} /></span>
          <span className="cp-kind-t">
            <span className="cp-kind-top"><b className="hd">{x.title}</b><i className="cp-led" aria-hidden="true" /></span>
            <span className="cp-kind-x">{x.text}</span>
            <span className="cp-facts" aria-hidden="true">{x.facts.map(f => <span key={f.t}><f.icon size={12} />{f.t}</span>)}</span>
          </span>
        </label>)}
    </div>
    {diary && sign && <DiarySignature {...sign} />}
    <p className="cp-note"><NoteIc size={14} aria-hidden="true" /><span>{locked ? "Il tipo resta quello scelto alla pubblicazione. Puoi modificare titolo e contenuto." : diary
      ? sign?.on ? "Tutti gli utenti potranno leggere il pensiero per intero, con il tuo nome. Puoi cambiare idea modificandolo in seguito."
        : "Tutti gli utenti potranno leggere il pensiero per intero. Il tuo nome sarà visibile solo a te e all’amministratore. Evita dettagli che ti identifichino."
      : "Gli altri utenti vedranno soltanto un breve estratto. Il testo integrale, le immagini e i disegni saranno accessibili a te e all’amministratore."}</span></p>
  </fieldset>;
}

// Anonimo o firmato: due scelte affiancate, l'anonimato resta la scelta di partenza. Ognuna ha il suo piccolo cartellino:
// da anonimo il nome viene coperto da due bande, come in un documento censurato; firmando, la firma si traccia da sola
function DiarySignature({ on, set, name }: Sign) {
  const options = [
    { id: false, title: "Anonimo", text: "Nessuno vedrà chi l’ha scritto" },
    { id: true, title: "Con il tuo nome", text: `Firmato «${name}»` },
  ];
  return <div className="diary-sign" role="radiogroup" aria-label="Come firmi il pensiero?">
    <p className="diary-sign-q"><span className="cp-step sm" aria-hidden="true">02</span>Come firmi il pensiero?</p>
    <div className="diary-sign-row" style={{ "--sign-i": on ? 1 : 0 } as React.CSSProperties}>
      <span className="diary-sign-ind" aria-hidden="true" />
      {options.map(o => <label key={String(o.id)} className={`diary-sign-opt ${on === o.id ? "selected" : ""}`}>
        <input type="radio" name="diary-sign" className="sr-only" checked={on === o.id} onChange={() => set(o.id)} />
        {o.id
          ? <span className="ds-art ds-sig" aria-hidden="true"><svg viewBox="0 0 56 34"><path className="ds-ink" pathLength={1} d="M5 23c3-7 6-12 8-10s-3 11 0 10 5-12 8-11-1 9 2 9 4-6 7-6 1 5 4 4 5-4 8-3 3 2 6 1" /><path className="ds-base" d="M5 28.5h46" /></svg></span>
          : <span className="ds-art ds-anon" aria-hidden="true"><i className="ds-face" /><i className="ds-bar" /><i className="ds-bar" /></span>}
        <span className="min-w-0"><b className="block text-sm">{o.title}</b><span className="mu text-xs block truncate">{o.text}</span></span>
      </label>)}
    </div>
  </div>;
}

export function WritingIntro({ diary, onWrite }: { diary: boolean; onWrite: () => void }) {
  return <section className={`writing-intro pn ${diary ? "diary-intro" : "complete-intro"}`}>
    {/* la scena a destra: lo schedario degli scritti completi (le schede con le linguette, la targhetta, la maniglia di rame),
        il fascio di pagine del diario legato con lo spago e il cartellino; passandoci sopra il cassetto si apre e il cartellino oscilla */}
    {diary
      ? <span className="wi-scene wi-bundle" aria-hidden="true"><i className="wb-page p3" /><i className="wb-page p2" /><span className="wb-top"><i className="wb-page p1" /><i className="wb-twine h" /><i className="wb-twine v" /><i className="wb-knot" /><i className="wb-tag" /></span></span>
      : <span className="wi-scene wi-catalog" aria-hidden="true"><i className="wc-card c1" /><i className="wc-card c2" /><i className="wc-card c3" /><i className="wc-drawer" /><i className="wc-label" /><i className="wc-pull" /></span>}
    <div className="relative"><p className="writing-eyebrow">{diary ? "Il quaderno del Circuito" : "La biblioteca del Circuito"}</p>
      <h2 className="hd text-2xl md:text-3xl font-bold mt-2">{diary ? "Una pausa, una pagina." : "Scritti che prendono forma."}</h2>
      <p className="mu mt-3 max-w-2xl">{diary ? "Le cose che passano per la testa, senza dover diventare un tema. Qui ogni pensiero ha spazio: lo leggiamo per intero, senza voti o classifiche. Chi scrive sceglie se firmarlo o restare anonimo."
        : "Temi, racconti e riflessioni a cui dedicare tempo. Qui trovi gli estratti; l’amministratore legge i testi integrali e seleziona gli scritti per il podio del mese."}</p>
      <div className="writing-promises"><span><EyeOff size={14} />{diary ? "Anonimo o firmato, scegli tu" : "Lettura anonima"}</span><span>{diary ? <BookOpen size={14} /> : <LockKeyhole size={14} />}{diary ? "Lettura integrale" : "Solo un estratto pubblico"}</span></div>
      <button className="bt wi-cta mt-5" onClick={onWrite}><Pen size={15} />{diary ? "Affida un pensiero al diario" : "Scrivi uno scritto completo"}<ArrowUpRight size={15} /></button>
    </div>
  </section>;
}

// anteprima del pensiero: gli a capo restano (si legge come è stato scritto) ma senza righe vuote ripetute né spazi
// indivisibili in fila, che sul foglio a righe lasciavano buchi e righe spostate
const preview = (html: string) => plain(html || "").replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n\s*/g, "\n").trim();
export function DiaryCards({ items, onOpen, author, drawing }: { items: any[]; onOpen: (t: any, e: any) => void; author: (t: any) => string; drawing: (t: any) => React.ReactNode }) {
  return <div className="diary-grid grid sm:grid-cols-2 gap-5">
    {items.map(t => <article key={t.id} data-doc={t.id} className="diary-card pn" role="button" tabIndex={0} aria-label={`Leggi il pensiero ${t.title}`} onClick={e => onOpen(t, e)} onKeyDown={e => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); onOpen(t, e); } }}>
      {/* in alto il titolo e sotto la firma (o la voce anonima); sul foglio soltanto il pensiero */}
      <div className={`diary-card-top ${signatureOf(t) ? "signed" : ""}`}>{signatureOf(t) ? <Signature size={18} /> : <BookOpen size={18} />}<div className="min-w-0 flex-1"><h3 className="hd font-bold text-lg leading-snug line-clamp-2">{t.title}</h3><span className="diary-card-by block truncate">{author(t)}</span></div><ArrowUpRight size={17} className="shrink-0 mt-1" /></div>
      <div className={`paper diary-paper ${paperClass(cartaOf(t))}`}><p className="whitespace-pre-line line-clamp-6">{preview(t.content) || "Un pensiero disegnato, oltre le parole."}</p>{drawing(t)}</div>
      <p className="diary-card-foot"><Feather size={13} aria-hidden="true" />Un pensiero da leggere, senza giudizi.</p>
    </article>)}
  </div>;
}

export function ReadingNotice({ item }: { item: any }) {
  return <div className={`reading-notice ${isDiary(item) ? "diary-notice" : ""}`} role="note">
    {isDiary(item) ? signatureOf(item) ? <><Signature size={19} /><div><b>Pensiero del diario · firmato</b><p>L’autore ha scelto di firmare questo pensiero. Non riceve voti, categorie o posizioni in classifica.</p></div></>
      : <><EyeOff size={19} /><div><b>Pensiero del diario · lettura integrale</b><p>Il nome dell’autore è visibile solo all’amministratore e all’autore stesso. Questo pensiero non riceve voti, categorie o posizioni in classifica.</p></div></>
      : <><LockKeyhole size={19} /><div><b>Stai leggendo soltanto un estratto</b><p>Per tutelare lo scritto, il testo integrale, le immagini e i disegni sono riservati all’autore e all’amministratore.</p></div></>}
  </div>;
}

// il capitolo della staffetta: nell'editor la frase da cui parte e che fine farà il capitolo (anonimo come ogni scritto
// completo; se l'admin lo sceglie, nel racconto si legge per intero e con il nome), nel lettore solo il legame
export function RelayChip({ mese, frase, locked, reading, onRemove }: { mese: string; frase?: string; locked?: boolean; reading?: boolean; onRemove?: () => void }) {
  return <div className="rl-chip" role={reading ? "note" : undefined}>
    <Flag size={16} aria-hidden="true" />
    <span className="rl-chip-b">
      <span className="rl-chip-k">{reading ? `Capitolo della staffetta di ${mese}` : locked ? `Capitolo della staffetta di ${mese}` : `Il capitolo della staffetta di ${mese}`}</span>
      {frase && <q>{frase}</q>}
      {!reading && <span className="rl-chip-n">Resta anonimo e partecipa al podio come ogni scritto completo. Se l’amministratore lo sceglie per il racconto collettivo, dal 3 del mese dopo si leggerà per intero, con il tuo nome.</span>}
    </span>
    {!locked && !reading && onRemove && <button type="button" className="bt !p-2" aria-label="Togli il legame con la staffetta" title="Non è un capitolo" onClick={onRemove}><X size={14} /></button>}
  </div>;
}

export function PublicExcerpt({ excerpt }: { excerpt: string }) {
  return <div className="paper excerpt-paper p-6 md:p-10" data-sheet-paper=""><p className="whitespace-pre-wrap text-lg leading-relaxed">{excerpt || "Questo scritto non contiene un estratto testuale disponibile."}{excerpt && "…"}</p><div className="excerpt-end" aria-hidden="true" /><p className="mu text-sm mt-5 flex items-center gap-2"><LockKeyhole size={16} />Il resto dello scritto rimane riservato.</p></div>;
}

// la grafia sul quaderno del Diario: archetti di altezze diverse sulle righe del foglio (passo 13 px), qualche asta che
// sale e qualche coda che scende, come una calligrafia vista da lontano. L'ultima riga si scrive passandoci sopra: è un
// tratto solo, senza spazi tra le parole, perché il tratteggio che la disegna scorra continuo
export const scrawl = (x: number, y: number, n: number, seed: number, gaps = true) => {
  let d = `M${x} ${y}`;
  for (let i = 0; i < n; i++) {
    const k = (seed * 7 + i * 5) % 11, w = 3.2 + (k % 3) * .8, h = k === 3 ? 8.5 : k === 8 ? -4 : 2.6 + (k % 4) * .7;
    d += ` q${(w / 2).toFixed(1)} ${(-h).toFixed(1)} ${w.toFixed(1)} 0`;
    if (gaps && k === 5) d += " m3.5 0";
  }
  return d;
};
const DIARY_LINES = [scrawl(24, 30, 16, 1), scrawl(20, 43, 18, 2), scrawl(20, 56, 11, 3)];
const DIARY_PENDING = scrawl(20, 69, 14, 4, false);

// i due riquadri della Panoramica: ogni stanza ha il suo oggetto. Per gli Scritti completi una pila di fogli composti con
// il sigillo della selezione del mese, per il Diario il quaderno di pelle col nastrino. Inclinando il riquadro gli oggetti
// stanno a profondità diverse; al passaggio i fogli si aprono a ventaglio e sul quaderno si scrive una riga in più
export function RoomCard({ kind, onOpen }: { kind: WritingKind; onOpen: () => void }) {
  const diary = kind === "diary";
  return <button type="button" className={`pn card room-card ${diary ? "room-diary" : "room-complete"} text-left`} onClick={onOpen} data-snd="nav">
    <span className="room-art" aria-hidden="true">
      <span className="room-bg" />
      {diary
        ? <span className="room-obj ra-book">
          <i className="ra-cover" />
          <span className="ra-page"><svg viewBox="0 0 112 132" width="112" height="132">{DIARY_LINES.map(d => <path key={d} d={d} />)}<path className="ra-pending" d={DIARY_PENDING} pathLength={1} /></svg></span>
          <i className="ra-ribbon" />
        </span>
        : <span className="room-obj ra-stack">
          <i className="ra-sheet s3" /><i className="ra-sheet s2" /><i className="ra-sheet s1" />
          <i className="ra-tails" /><i className="ra-seal"><Star size={15} strokeWidth={2.2} /></i>
        </span>}
    </span>
    <span className="room-tx">
      <span className={`kind-badge ${diary ? "diary" : ""}`}>{diary ? "Diario" : "Scritti completi"}</span>
      <span className="hd text-xl font-bold mt-3 block">{diary ? "Lascia un pensiero" : "Dai forma alle tue idee"}</span>
      <span className="mu text-sm mt-2 block">{diary ? "Pagine da leggere per intero, anonime o firmate, senza voti o categorie." : "Temi e racconti, estratti da leggere e selezione del mese."}</span>
      <span className="room-go">{diary ? "Apri il diario" : "Entra negli scritti"}<ArrowRight size={14} /></span>
    </span>
  </button>;
}
