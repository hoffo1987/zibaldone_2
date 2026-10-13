import React from "react";
import type { Props } from "./Logo3D";

const Scene = React.lazy(() => import("./Logo3D"));
class LogoBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export default function LogoView(props: Props) {
  return <LogoBoundary fallback={props.fallback}><React.Suspense fallback={props.fallback}><Scene {...props} /></React.Suspense></LogoBoundary>;
}
