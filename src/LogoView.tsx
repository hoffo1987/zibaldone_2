import React, { useState } from "react";
import type { Props } from "./Logo3D";
import LogoLoader from "./LogoLoader";

// Il logo 3D: WebGPU dove c'è (il modulo si scarica solo lì), altrimenti la stessa scena in Canvas 2D; se WebGPU non si
// avvia (nessun adattatore, adattatore solo software, dispositivo perso più volte) si passa al Canvas 2D. Mentre il
// modulo si scarica e WebGPU si prepara compare un caricamento animato; il logo SVG resta l'ultima risorsa.
const Scene3D = React.lazy(() => import("./Logo3D"));
const Scene2D = React.lazy(() => import("./Logo2D"));
const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as any).gpu;
class LogoBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function LogoView(props: Props) {
  const [mode, setMode] = useState<"3d" | "2d">(() => (hasWebGPU() ? "3d" : "2d"));
  const loader = <LogoLoader className={props.className} />;
  const flat = <LogoBoundary fallback={props.fallback}><React.Suspense fallback={loader}><Scene2D {...props} /></React.Suspense></LogoBoundary>;
  if (mode === "2d") return flat;
  return <LogoBoundary fallback={flat}><React.Suspense fallback={loader}><Scene3D {...props} onFail={() => setMode("2d")} /></React.Suspense></LogoBoundary>;
}
