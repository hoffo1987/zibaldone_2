import React from "react";
import { FileClock, PenLine, Trash2 } from "lucide-react";
import { plain } from "./sanitize";
import "./bozze.css";

// Le bozze salvate nel Circuito, in I miei scritti: i fogli non ancora inviati, solo di chi li scrive (bozze/{id}, vedi
// firestore.rules). Ognuna ha il suo titolo, l'inizio del testo e quando è stata salvata; «Continua» la riapre sul
// foglio, «Elimina» la toglie. Inviando lo scritto la bozza se ne va da sola.
export type Bozza = { id: string; title: string; content: string; strokes: any[]; w: number; h: number; kind: "complete" | "diary"; firmato?: boolean; carta?: string; nataDa?: { id: string; cit: string }; createdAt: number; updatedAt: number };

const quando = (ms: number) => {
  const d = new Date(ms), oggi = new Date();
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === oggi.toDateString()) return `oggi alle ${ora}`;
  const ieri = new Date(oggi); ieri.setDate(oggi.getDate() - 1);
  if (d.toDateString() === ieri.toDateString()) return `ieri alle ${ora}`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + ` alle ${ora}`;
};

export function Bozze({ list, current, onContinue, onDelete }: { list: Bozza[]; current: string | null; onContinue: (b: Bozza) => void; onDelete: (b: Bozza) => void }) {
  if (!list.length) return null;
  return <section className="bz pn" aria-labelledby="bz-t">
    <div className="bz-hd">
      <span className="bz-ic" aria-hidden="true"><FileClock size={18} /></span>
      <div className="min-w-0 flex-1"><h2 id="bz-t" className="hd bz-t">Bozze</h2><p className="bz-sub">Fogli salvati e non ancora inviati. Li vedi solo tu: riprendili quando vuoi.</p></div>
      <span className="bz-n">{list.length}</span>
    </div>
    <ul className="bz-l">
      {list.map((b, i) => {
        const testo = plain(b.content || "").replace(/\s+/g, " ").trim();
        return <li key={b.id} className={`bz-it ${b.kind === "diary" ? "diary" : ""} ${current === b.id ? "now" : ""}`} style={{ ["--i" as any]: i }}>
          <div className="bz-body">
            <span className={`kind-badge ${b.kind === "diary" ? "diary" : ""}`}>{b.kind === "diary" ? "Pensiero del diario" : "Scritto completo"}</span>
            <h3 className="bz-tt">{b.title.trim() || "Senza titolo"}</h3>
            <p className="bz-x">{testo ? testo.slice(0, 160) + (testo.length > 160 ? "…" : "") : b.strokes?.length ? "Un foglio disegnato." : "Foglio ancora vuoto."}</p>
            <p className="bz-d">{current === b.id ? "Aperta sul foglio · " : ""}Salvata {quando(b.updatedAt)}</p>
          </div>
          <div className="bz-acts">
            <button type="button" className="bt on" onClick={() => onContinue(b)}><PenLine size={15} />Continua</button>
            <button type="button" className="bt" aria-label={`Elimina la bozza ${b.title || "senza titolo"}`} title="Elimina la bozza" onClick={() => onDelete(b)}><Trash2 size={15} /></button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
