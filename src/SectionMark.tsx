import React from "react";

// Small, reusable vector compositions. Each piece settles into place independently;
// the inner strokes then tell the section's story. Size and motion are optional.
function Piece({ children, index = 0, x = 0, y = 0, turn = 0 }: {
  children: React.ReactNode; index?: number; x?: number; y?: number; turn?: number;
}) {
  return <g className="mark-piece" style={{ "--piece-delay": `${index * 65}ms`, "--piece-x": `${x}px`, "--piece-y": `${y}px`, "--piece-turn": `${turn}deg` } as React.CSSProperties}>{children}</g>;
}

export function SectionMark({ section, size = 30, motion = true }: { section: string; size?: number; motion?: boolean }) {
  let parts: React.ReactNode;
  switch (section) {
    case "home":
      parts = <>
        <Piece x={-4} turn={-16}><path className="mark-trace" pathLength={1} d="M23 7a11 11 0 1 0 0 18" /></Piece>
        <Piece index={1} x={6}><path className="mark-trace" pathLength={1} d="M16 16h11" /><circle className="mark-fill" cx="16" cy="16" r="2" /></Piece>
        <Piece index={2} y={-5}><circle className="mark-node" cx="23" cy="7" r="2.6" /></Piece>
        <Piece index={3} y={5}><circle className="mark-accent mark-node" cx="23" cy="25" r="2.6" /></Piece>
      </>;
      break;
    case "my_pages":
      parts = <>
        <Piece x={-4} y={3} turn={-12}><path className="mark-soft" d="M8 10H5v17h15v-3" /></Piece>
        <Piece index={1} x={-2} y={2} turn={-6}><path d="M12 6H9v17h15v-3" /></Piece>
        <Piece index={2} x={4} y={-5} turn={8}><g className="mark-page"><path className="mark-surface" d="M13 3h10l5 5v12H13Z" /><path d="M23 3v5h5" /><path className="mark-trace" pathLength={1} d="M17 12h7m-7 4h4" /></g></Piece>
      </>;
      break;
    case "write":
      parts = <>
        <Piece y={3}><path className="mark-trace mark-accent" pathLength={1} d="M5 27h21" /></Piece>
        <Piece index={1} x={5} y={-5} turn={14}><g className="mark-pen"><path className="mark-surface" d="m7 23 4-11L23 3l6 6-9 12-11 4Z" /><path d="m11 12 9 9M9 23l7-7" /><circle className="mark-fill" cx="17" cy="15" r="1.6" /></g></Piece>
      </>;
      break;
    case "diario":
      parts = <>
        <Piece x={-4} turn={-8}><path className="mark-soft" d="M8 7H5v22h18v-3" /></Piece>
        <Piece index={1} x={4} turn={12}><g className="mark-leaf"><rect className="mark-surface" x="9" y="3" width="17" height="23" rx="3" /><path d="M13 3v23" /><path className="mark-trace" pathLength={1} d="M17 10h5m-5 4h5m-5 4h3" /></g></Piece>
        <Piece index={2} y={-4}><path className="mark-accent mark-ribbon" d="M20 3v5l2-1 2 1V3" /></Piece>
      </>;
      break;
    case "podio":
      parts = <>
        <Piece y={5}><path className="mark-trace" pathLength={1} d="M5 27v-7h7m8 0h7v7M12 27V16h8v11M3 28h26" /></Piece>
        <Piece index={1} y={-6}><g className="mark-crown"><path className="mark-tint" d="m9 6 3 6h8l3-6-5 2-2-5-2 5Z" /></g></Piece>
        <Piece index={2} x={5} y={-3}><path className="mark-accent mark-spark" d="M27 2v5m-2.5-2.5h5" /></Piece>
      </>;
      break;
    case "authors":
      parts = <>
        <Piece x={-6}><g className="mark-person"><circle className="mark-soft" cx="7" cy="12" r="3" /><path d="M2 24v-3a5 5 0 0 1 8-4" /></g></Piece>
        <Piece index={1} x={6}><g className="mark-person"><circle className="mark-soft" cx="25" cy="12" r="3" /><path d="M30 24v-3a5 5 0 0 0-8-4" /></g></Piece>
        <Piece index={2} y={-4}><circle className="mark-surface" cx="16" cy="8" r="4" /><path className="mark-surface" d="M9 27v-6a7 7 0 0 1 14 0v6Z" /></Piece>
        <Piece index={3} y={4}><path className="mark-accent mark-trace" pathLength={1} d="M13 23h6" /></Piece>
      </>;
      break;
    default:
      parts = <>
        <Piece x={-4} turn={-10}><rect className="mark-soft" x="3" y="7" width="6" height="21" rx="1.5" /><path d="M5 11h2" /></Piece>
        <Piece index={1} y={-5}><rect className="mark-surface" x="11" y="4" width="6" height="24" rx="1.5" /><path className="mark-trace" pathLength={1} d="M13 9h2m-2 15h2" /></Piece>
        <Piece index={2} x={5} turn={14}><g className="mark-book"><path className="mark-tint" d="m19 7 6-1 5 20-6 2Z" /><path className="mark-accent" d="m21 12 5-1" /></g></Piece>
      </>;
  }
  return <svg className={`section-mark ${motion ? "section-mark-motion" : ""}`} width={size} height={size}
    viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" data-mark={section}>{parts}</svg>;
}
