import React from "react";
import { Plus } from "lucide-react";
import "./empty-circuit.css";

// quando la raccolta è vuota il circuito è aperto: dalla piazzola di partenza la pista arriva fino a una scheda
// tratteggiata, il posto del primo scritto, e dall'altra parte prosegue verso il LED, spento. Passandoci sopra la corrente
// corre lungo la pista fino al contatto e la scheda che manca si accende; il LED resta spento finché lo scritto non c'è
export function EmptyCircuit({ search, onWrite }: { search: string; onWrite: () => void }) {
  const q = search.trim(), short = q.length > 18 ? q.slice(0, 17) + "…" : q;
  return <div className="pn empty-circuit up">
    <svg className="ec-board" viewBox="0 0 320 150" aria-hidden="true">
      <path className="ec-trace" d="M39 75H62l14-14h18l14 14h8M94 61V42M208 75h14l12-12h10M268 63h6l12 12h4M222 75v24" />
      <path className="ec-flow" d="M39 75H62l14-14h18l14 14h8" pathLength={100} />
      <circle className="ec-via" cx="94" cy="38" r="3.2" /><circle className="ec-via" cx="222" cy="103" r="3.2" />
      <rect className="ec-pad" x="21" y="66" width="18" height="18" rx="4" /><circle className="ec-hole" cx="30" cy="75" r="3.4" />
      <g className="ec-slot">
        <rect className="ec-card" x="124" y="20" width="76" height="110" rx="10" />
        <rect className="ec-sk" x="134" y="32" width="38" height="4.5" rx="2.2" />
        <rect className="ec-sk" x="134" y="44" width="56" height="3" rx="1.5" /><rect className="ec-sk" x="134" y="51" width="50" height="3" rx="1.5" />
        <rect className="ec-sk" x="134" y="58" width="54" height="3" rx="1.5" /><rect className="ec-sk" x="134" y="65" width="32" height="3" rx="1.5" />
        <path className="ec-perf" d="M128 90h68" />
        <circle className="ec-plus" cx="143" cy="110" r="9" /><path className="ec-plus-x" d="M143 106v8M139 110h8" />
        <rect className="ec-sk" x="157" y="105" width="32" height="4" rx="2" /><rect className="ec-sk" x="157" y="113" width="20" height="3" rx="1.5" />
      </g>
      <circle className="ec-contact ec-in" cx="120" cy="75" r="4" /><circle className="ec-contact" cx="204" cy="75" r="4" />
      <rect className="ec-res" x="244" y="58" width="24" height="10" rx="4" />
      <rect className="ec-band b1" x="249" y="58" width="2.6" height="10" /><rect className="ec-band b2" x="254.5" y="58" width="2.6" height="10" /><rect className="ec-band b3" x="260" y="58" width="2.6" height="10" />
      <circle className="ec-led-rim" cx="300" cy="75" r="12.5" /><circle className="ec-led" cx="300" cy="75" r="10" /><circle className="ec-glint" cx="296.5" cy="71.5" r="2.8" />
    </svg>
    <p className="ec-tag"><i />{q ? <>Nessun contatto per «{short}»</> : "Circuito aperto · manca il primo scritto"}</p>
    <h3 className="hd text-xl font-bold mb-1">{q ? "Nessun risultato" : "Ancora nessuno scritto"}</h3>
    <p className="mu text-sm mb-5">{q ? "Prova con un'altra parola." : "Crea il primo: puoi scrivere, aggiungere foto e disegnare."}</p>
    {!q && <button className="bt pri" onClick={onWrite}><Plus size={15} />Nuovo scritto</button>}
  </div>;
}
