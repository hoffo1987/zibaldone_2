import React, { useState } from "react";

// Il podio del mese in 3D (WebGPU) dove si può; altrimenti, o se WebGPU non si avvia, il podio semplice di sempre.
// Il modulo 3D si scarica solo quando serve.
const Podium3D = React.lazy(() => import("./podium/Podium3D"));
const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator && !!(navigator as any).gpu;
class Boundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function PodiumStage({ enabled, dark, plates, fallback }: { enabled: boolean; dark: boolean; plates: (React.ReactNode | null)[]; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!enabled || failed || !hasWebGPU()) return <>{fallback}</>;
  return (
    <Boundary fallback={fallback}>
      <React.Suspense fallback={<div className="podium3d"><div className="podium3d-bg" /></div>}>
        <Podium3D dark={dark} plates={plates} onFail={() => setFailed(true)} />
      </React.Suspense>
    </Boundary>
  );
}
