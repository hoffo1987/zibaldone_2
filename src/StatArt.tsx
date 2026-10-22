import React from "react";
import { scrawl } from "./WritingSections";
import "./stat-art.css";

// i numeri della Panoramica: ogni riquadro ha il suo colore e il suo oggetto, come le due stanze sopra. Il vassoio della
// posta per gli scritti ricevuti, i ritratti degli autori, il blocco del calendario col giorno di oggi, la stella da dare,
// la cartellina dei propri scritti, la stilografica delle parole scritte
export type StatKind = "received" | "authors" | "month" | "rate" | "mine" | "words";

const INK = [scrawl(7, 15, 13, 5), scrawl(7, 28, 10, 6)];
const INK_PENDING = scrawl(7, 41, 12, 7, false);

function Calendar() {
  const now = new Date();
  return <span className="sa-cal"><b>{now.toLocaleDateString("it-IT", { month: "long" })}</b><em>{now.getDate()}</em></span>;
}

const ART: Record<StatKind, () => React.ReactNode> = {
  received: () => <>
    <i className="sa-sheet sa-a" /><i className="sa-sheet sa-b" />
    <i className="sa-env" /><i className="sa-tray" />
  </>,
  authors: () => <><i className="sa-av sa-l1" /><i className="sa-av sa-r1" /><i className="sa-av sa-c1" /></>,
  month: () => <><i className="sa-pad" /><Calendar /><i className="sa-rings" /></>,
  rate: () => <>
    <span className="sa-card"><b>★★</b>★★★</span>
    <span className="sa-starw"><i className="sa-star" /></span>
    <i className="sa-spark sa-s1" /><i className="sa-spark sa-s2" />
  </>,
  mine: () => <>
    <i className="sa-fback" /><i className="sa-sheet sa-a" /><i className="sa-sheet sa-b" />
    <i className="sa-mark" /><i className="sa-ffront" />
  </>,
  words: () => <>
    <span className="sa-paper"><svg viewBox="0 0 70 48" width="70" height="48">{INK.map(d => <path key={d} d={d} />)}<path className="sa-pending" d={INK_PENDING} pathLength={1} /></svg></span>
    <span className="sa-pen"><i className="sa-nib" /></span>
  </>,
};

export function StatArt({ k }: { k: StatKind }) {
  return <span className="stat-art" aria-hidden="true"><span className="stat-bg" /><span className="stat-obj">{ART[k]()}</span></span>;
}
