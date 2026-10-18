import React from "react";
import { Hourglass } from "lucide-react";
import type { SignText } from "./podium/letters";

// Il podio del mese in 3D (WebGPU) a tutto schermo; il modulo si scarica solo quando serve.
const Podium3D = React.lazy(() => import("./podium/Podium3D"));
export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as any).gpu;
class Boundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
// la scena (sta nella radice dell'app, fuori dal contenitore della pagina): se WebGPU non parte chiama onFail.
// covered: il podio non ancora visibile, sotto il telo e in mezzo al cantiere, con le scritte delle date sospese nella sala
export function PodiumScene({ dark, plates, onFail, covered, sign }: { dark: boolean; plates: (React.ReactNode | null)[]; onFail: () => void; covered?: boolean; sign?: SignText }) {
  return <Boundary onError={onFail}><React.Suspense fallback={null}><Podium3D dark={dark} plates={plates} onFail={onFail} covered={covered} sign={sign} /></React.Suspense></Boundary>;
}
// lo spazio lasciato libero nella pagina, dove la camera inquadra il podio (sui telefoni è il palco che contiene la scena);
// list: i vincitori come schede sotto il palco, mostrate solo sugli schermi stretti (sui larghi sono targhette sopra le coppe)
export const PodiumSlot = ({ list }: { list?: React.ReactNode }) => (
  <>
    <div id="podium-slot" className="podium-slot" />
    {list ? <div className="podium-list">{list}</div> : null}
  </>
);

// il cartello del podio coperto, quando la sala 3D non c'è (podio semplice): lavori in corso, con la data in cui il podio
// si scopre. La clessidra si gira con calma, i puntini aspettano, il nastro a strisce scorre piano
export function PodiumSign({ title, body }: { title: string; body: string }) {
  return (
    <div className="podium-sign-card">
      <div className="podium-sign-kicker">
        <span className="podium-sign-glass" aria-hidden="true"><Hourglass size={14} strokeWidth={2.4} /></span>
        <span>Lavori in corso</span>
        <span className="podium-sign-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <h2 className="podium-sign-title hd">{title}</h2>
      <p className="podium-sign-body">{body}</p>
      <div className="podium-sign-tape" aria-hidden="true" />
    </div>
  );
}

// senza WebGPU (o con le animazioni spente): lo stesso cartello appeso sopra un disegno del podio coperto
export function PodiumCover({ sign }: { sign: React.ReactNode }) {
  return (
    <div className="podium-cover pn">
      <div className="podium-sign podium-sign-flat"><div className="podium-sign-swing"><i className="podium-sign-string" /><i className="podium-sign-string r" />{sign}</div></div>
      <svg className="podium-cover-art" viewBox="0 0 400 170" aria-hidden="true">
        <defs>
          <linearGradient id="pc-cloth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--pc-hi)" /><stop offset="1" stopColor="var(--pc-lo)" /></linearGradient>
          <pattern id="pc-tape" width="16" height="8" patternUnits="userSpaceOnUse" patternTransform="skewX(-40)"><rect width="8" height="8" fill="#c2201b" /><rect x="8" width="8" height="8" fill="#f1f0ec" /></pattern>
        </defs>
        <path d="M36 150 C40 118 52 92 64 86 L128 82 C136 60 140 44 150 40 L250 40 C260 44 264 70 272 96 L336 98 C350 104 360 126 366 150 Z" fill="url(#pc-cloth)" />
        <path d="M150 40 C152 74 146 116 138 150 M250 40 C249 80 256 118 264 150 M200 42 C203 82 196 120 201 150 M86 86 C84 110 80 130 74 150 M318 98 C320 118 326 136 330 150" fill="none" stroke="var(--pc-fold)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M20 152 Q200 140 380 152" fill="none" stroke="url(#pc-tape)" strokeWidth="6" />
      </svg>
    </div>
  );
}
