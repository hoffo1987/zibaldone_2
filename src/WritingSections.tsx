import React from "react";
import { BookOpen, FileText, ArrowUpRight, EyeOff, LockKeyhole, Pen, Signature } from "lucide-react";
import { plain } from "./sanitize";
import { isDiary, signatureOf, type WritingKind } from "./testi";
import "./writing.css";

type Sign = { on: boolean; set: (v: boolean) => void; name: string };
export function KindPicker({ value, onChange, locked = false, sign }: { value: WritingKind; onChange: (v: WritingKind) => void; locked?: boolean; sign?: Sign }) {
  return <fieldset className="writing-picker pn p-4 md:p-5">
    <legend className="hd font-bold px-2">Che cosa stai scrivendo?</legend>
    <div className="grid sm:grid-cols-2 gap-3">
      {([{ id: "complete", title: "Scritto completo", text: "Un tema, un racconto, una riflessione sviluppata. Partecipa alla selezione del mese.", icon: FileText },
        { id: "diary", title: "Pensiero del diario", text: "Un pensiero libero, un frammento della giornata. Si legge per intero, senza voti.", icon: BookOpen }] as const).map(x =>
        <label key={x.id} className={`kind-option ${value === x.id ? "selected" : ""} ${x.id}`}>
          <input type="radio" name="writing-kind" value={x.id} checked={value === x.id} disabled={locked} onChange={() => onChange(x.id)} />
          <x.icon size={23} aria-hidden="true" /><span><b className="hd block text-base">{x.title}</b><span className="mu text-sm block mt-1">{x.text}</span></span>
        </label>)}
    </div>
    {value === "diary" && sign && <DiarySignature {...sign} />}
    <p className="mu text-xs mt-3">{locked ? "Il tipo resta quello scelto alla pubblicazione. Puoi modificare titolo e contenuto." : value === "diary"
      ? sign?.on ? "Tutti gli utenti potranno leggere il pensiero per intero, con il tuo nome. Puoi cambiare idea modificandolo in seguito."
        : "Tutti gli utenti potranno leggere il pensiero per intero. Il tuo nome sarà visibile solo a te e all’amministratore. Evita dettagli che ti identifichino."
      : "Gli altri utenti vedranno soltanto un breve estratto. Il testo integrale, le immagini e i disegni saranno accessibili a te e all’amministratore."}</p>
  </fieldset>;
}

// Anonimo o firmato: due scelte affiancate, l'anonimato resta la scelta di partenza.
function DiarySignature({ on, set, name }: Sign) {
  const options = [
    { id: false, title: "Anonimo", text: "Nessuno vedrà chi l’ha scritto", icon: EyeOff },
    { id: true, title: "Con il tuo nome", text: `Firmato «${name}»`, icon: Signature },
  ];
  return <div className="diary-sign" role="radiogroup" aria-label="Come firmi il pensiero?">
    <p className="diary-sign-q">Come firmi il pensiero?</p>
    <div className="diary-sign-row" style={{ "--sign-i": on ? 1 : 0 } as React.CSSProperties}>
      <span className="diary-sign-ind" aria-hidden="true" />
      {options.map(o => <label key={String(o.id)} className={`diary-sign-opt ${on === o.id ? "selected" : ""}`}>
        <input type="radio" name="diary-sign" className="sr-only" checked={on === o.id} onChange={() => set(o.id)} />
        <o.icon size={18} aria-hidden="true" /><span className="min-w-0"><b className="block text-sm">{o.title}</b><span className="mu text-xs block truncate">{o.text}</span></span>
      </label>)}
    </div>
  </div>;
}

export function WritingIntro({ diary, onWrite }: { diary: boolean; onWrite: () => void }) {
  return <section className={`writing-intro pn ${diary ? "diary-intro" : "complete-intro"}`}>
    <div className="writing-symbol" aria-hidden="true">{diary ? <BookOpen size={36} /> : <FileText size={36} />}</div>
    <div className="relative"><p className="writing-eyebrow">{diary ? "Il quaderno del Circuito" : "La biblioteca del Circuito"}</p>
      <h2 className="hd text-2xl md:text-3xl font-bold mt-2">{diary ? "Una pausa, una pagina." : "Scritti che prendono forma."}</h2>
      <p className="mu mt-3 max-w-2xl">{diary ? "Le cose che passano per la testa, senza dover diventare un tema. Qui ogni pensiero ha spazio: lo leggiamo per intero, senza voti o classifiche. Chi scrive sceglie se firmarlo o restare anonimo."
        : "Temi, racconti e riflessioni a cui dedicare tempo. Qui trovi gli estratti; l’amministratore legge i testi integrali e seleziona gli scritti per il podio del mese."}</p>
      <div className="writing-promises"><span><EyeOff size={14} />{diary ? "Anonimo o firmato, scegli tu" : "Lettura anonima"}</span><span>{diary ? <BookOpen size={14} /> : <LockKeyhole size={14} />}{diary ? "Lettura integrale" : "Solo un estratto pubblico"}</span></div>
      <button className="bt mt-5" onClick={onWrite}><Pen size={15} />{diary ? "Affida un pensiero al diario" : "Scrivi uno scritto completo"}<ArrowUpRight size={15} /></button>
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
      <div className="paper diary-paper"><p className="whitespace-pre-line line-clamp-6">{preview(t.content) || "Un pensiero disegnato, oltre le parole."}</p>{drawing(t)}</div>
      <p className="mu text-xs mt-4">Un pensiero da leggere, senza giudizi.</p>
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

export function PublicExcerpt({ excerpt }: { excerpt: string }) {
  return <div className="paper excerpt-paper p-6 md:p-10" data-sheet-paper=""><p className="whitespace-pre-wrap text-lg leading-relaxed">{excerpt || "Questo scritto non contiene un estratto testuale disponibile."}{excerpt && "…"}</p><div className="excerpt-end" aria-hidden="true" /><p className="mu text-sm mt-5 flex items-center gap-2"><LockKeyhole size={16} />Il resto dello scritto rimane riservato.</p></div>;
}
