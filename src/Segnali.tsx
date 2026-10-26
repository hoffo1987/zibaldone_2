import React, { useLayoutEffect, useRef, useState } from "react";
import { TIPI, type Tipo } from "./scintille";
import { FRAME, percorso } from "./onde";

// Un'onda disegnata in SVG: il glifo di un'emozione (nelle etichette), la traccia sotto una frase, una corsia dello
// schermo. Il percorso è lungo un FRAME in più della figura: quando l'onda corre (classe .run, solo al passaggio o
// sul canale scelto) scivola indietro di un FRAME e ricomincia identica. Le estremità sfumano con una maschera, così la
// traccia nasce e muore sulla linea anche mentre corre. w = 0: larga quanto il suo contenitore.
export function Onda({ tipo, w = 0, h = 12, a = 3.5, ph = 0, stroke = 1.4, fade = 8, className = "", style }: {
  tipo: Tipo; w?: number; h?: number; a?: number; ph?: number; stroke?: number; fade?: number; className?: string; style?: React.CSSProperties;
}) {
  const box = useRef<SVGSVGElement>(null);
  const [mw, setMw] = useState(w || 0);
  useLayoutEffect(() => {
    if (w || !box.current) return;
    const el = box.current, ro = new ResizeObserver(() => setMw(Math.round(el.getBoundingClientRect().width)));
    setMw(Math.round(el.getBoundingClientRect().width)); ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  const W = w || mw;
  const mask = fade ? `linear-gradient(90deg,transparent,#000 ${fade}px,#000 calc(100% - ${fade}px),transparent)` : undefined;
  return <svg ref={box} className={`onda o-${tipo} ${className}`} width={w || "100%"} height={h} aria-hidden="true" focusable="false"
    style={{ ...style, WebkitMaskImage: mask, maskImage: mask }}>
    {W > 0 && <g className="onda-g"><path d={percorso(tipo, W + FRAME, h / 2, a, ph, 0)} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" /></g>}
  </svg>;
}

// l'etichetta di un'emozione: il suo glifo d'onda e il nome
export const Chip = ({ tipo }: { tipo: Tipo }) =>
  <span className={`sc-chip t-${tipo}`}><Onda tipo={tipo} w={18} h={10} a={3.2} stroke={1.5} fade={3} />{TIPI.find((x) => x.id === tipo)?.label}</span>;
