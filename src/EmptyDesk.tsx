import React from "react";
import { Plus } from "lucide-react";
import "./empty-desk.css";

// quando la raccolta è vuota: una macchina da scrivere sulla scrivania, sotto la luce della lampada, con il primo foglio
// già infilato. Sul foglio è battuto «Il mio primo» e, passandoci sopra, il carrello scorre e finisce la parola; accanto,
// due fogli appallottolati. Se è una ricerca a non trovare niente, sul foglio c'è la parola cercata
export function EmptyDesk({ search, onWrite }: { search: string; onWrite: () => void }) {
  const q = search.trim(), typed = q ? `«${q.length > 14 ? q.slice(0, 13) + "…" : q}»` : "Il mio primo", more = q ? "" : " scritto";
  return <div className="pn empty-desk up">
    <div className="ed-scene" aria-hidden="true">
      <i className="ed-ball ed-b1" /><i className="ed-ball ed-b2" />
      <span className="ed-tw">
        <span className="ed-carriage" style={{ "--n": typed.length, "--n2": typed.length + more.length } as React.CSSProperties}>
          <span className="ed-paper"><span className="ed-line">{typed}<span className="ed-more">{more}</span><b className="ed-caret" /></span></span>
          <i className="ed-platen" /><i className="ed-bell" />
        </span>
        <i className="ed-body" /><i className="ed-guide" />
        <i className="ed-key ed-k1" /><i className="ed-key ed-k2" /><i className="ed-key ed-k3" /><i className="ed-key ed-k4" />
      </span>
    </div>
    <h3 className="hd text-xl font-bold mb-1">{q ? "Nessun risultato" : "Ancora nessuno scritto"}</h3>
    <p className="mu text-sm mb-5">{q ? "Prova con un'altra parola." : "Crea il primo: puoi scrivere, aggiungere foto e disegnare."}</p>
    {!q && <button className="bt pri" onClick={onWrite}><Plus size={15} />Nuovo scritto</button>}
  </div>;
}
