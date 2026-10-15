import React from "react";

// Il podio del mese in 3D (WebGPU) a tutto schermo; il modulo si scarica solo quando serve.
const Podium3D = React.lazy(() => import("./podium/Podium3D"));
export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as any).gpu;
class Boundary extends React.Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
// la scena (sta nella radice dell'app, fuori dal contenitore della pagina): se WebGPU non parte chiama onFail
export function PodiumScene({ dark, plates, onFail }: { dark: boolean; plates: (React.ReactNode | null)[]; onFail: () => void }) {
  return <Boundary onError={onFail}><React.Suspense fallback={null}><Podium3D dark={dark} plates={plates} onFail={onFail} /></React.Suspense></Boundary>;
}
// lo spazio lasciato libero nella pagina, dove la camera inquadra il podio (sui telefoni è il palco che contiene la scena);
// list: i vincitori come schede sotto il palco, mostrate solo sugli schermi stretti (sui larghi sono targhette sopra le coppe)
export const PodiumSlot = ({ list }: { list?: React.ReactNode }) => (
  <>
    <div id="podium-slot" className="podium-slot" aria-hidden="true" />
    {list ? <div className="podium-list">{list}</div> : null}
  </>
);
