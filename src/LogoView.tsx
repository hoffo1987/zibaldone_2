import React from "react";
import type { Props } from "./Logo3D";

// il logo 3D (WebGPU) si scarica solo dove può funzionare: senza navigator.gpu resta il logo SVG e il modulo non si carica
const Scene = React.lazy(() => import("./Logo3D"));
const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as any).gpu;
class LogoBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function LogoView(props: Props) {
  if (!hasWebGPU()) return <>{props.fallback}</>;
  return <LogoBoundary fallback={props.fallback}><React.Suspense fallback={props.fallback}><Scene {...props} /></React.Suspense></LogoBoundary>;
}
