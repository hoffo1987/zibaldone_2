import React, { useEffect, useState } from "react";
import { useMediaQuery } from "./useMediaQuery";

export const Text3D = React.memo(({ text, layers = 10, anim = true, className = "", delay = 0 }: { text: string; layers?: number; anim?: boolean; className?: string; delay?: number }) => {
  const compact = useMediaQuery("(max-width:767px), (pointer:coarse)");
  layers = Math.max(1, Math.min(layers, compact ? 4 : 10));
  const w = text.split(" ");
  return (
    <span key={text} className={`t3d ${anim ? "t3-in" : ""} ${className}`} style={{ ["--t3d0" as any]: `${delay}ms` }}>
      <span className="t3s" aria-hidden="true">{text}</span>
      {w.map((x, i) => (
        <React.Fragment key={i}>
          <span className="t3w" style={{ ["--i" as any]: i }}>
            {Array.from({ length: layers }, (_, j) => { const k = layers - j; return <span key={k} aria-hidden="true" className="t3l" style={{ ["--k" as any]: k, ["--kp" as any]: `${Math.round((k / layers) * 100)}%` }}>{x}</span>; })}
            <span className="t3f">{x}</span>
          </span>{i < w.length - 1 ? " " : ""}
        </React.Fragment>
      ))}
    </span>
  );
});

export const Terminal3D = React.memo(({ user, cmd: cmd0, out: out0, run = true, delay = 0 }: { user: string; cmd: string; out: string; run?: boolean; delay?: number }) => {
  const [alt, setAlt] = useState<{ cmd: string; out: string } | null>(null);
  useEffect(() => {
    let t = 0;
    const on = (e: any) => {
      const k = Number(e.detail) || 1;
      setAlt({ cmd: "gira --logo", out: `${k} ${k === 1 ? "spinta" : "spinte"} · la corrente accelera` });
      clearTimeout(t); t = window.setTimeout(() => setAlt(null), 5200);
    };
    window.addEventListener("circuito:giro", on);
    return () => { window.removeEventListener("circuito:giro", on); clearTimeout(t); };
  }, []);
  const cmd = alt ? alt.cmd : cmd0, out = alt ? alt.out : out0, fast = !!alt;
  const [n, setN] = useState(run ? 0 : cmd.length);
  const [done, setDone] = useState(!run);
  useEffect(() => {
    if (!run) { setN(cmd.length); setDone(true); return; }
    setN(0); setDone(false);
    let i = 0, t = 0;
    const tick = () => { i++; setN(i); t = window.setTimeout(i < cmd.length ? tick : () => setDone(true), i < cmd.length ? (fast ? 22 : 45 + Math.random() * 55) : fast ? 120 : 280); };
    t = window.setTimeout(tick, fast ? 0 : delay);
    return () => clearTimeout(t);
  }, [cmd, run, delay, fast]);
  return (
    <div className="term3d">
      <span className="sr-only">{`${user}@circuito: ${cmd}. ${out}`}</span>
      {[5, 4, 3, 2, 1].map((k) => <i key={k} className="tm-slab" style={{ ["--k" as any]: k }} aria-hidden="true" />)}
      <div className="tm-face" aria-hidden="true">
        <div className="tm-bar"><i /><i /><i /><span>circuito — zsh</span></div>
        <div className="tm-line"><span className="tm-u">{user}@circuito</span><span className="tm-p">:~$</span> {cmd.slice(0, n).split("").map((c, j) => <span key={j} className="tm-c">{c}</span>)}{!done && <b className="tm-caret" />}</div>
        <div className="tm-out" style={done ? undefined : { visibility: "hidden", animation: "none" }} key={done ? out : "attesa"}><span className="tm-ar">{alt ? "↻" : "→"}</span> {out}</div>
      </div>
    </div>
  );
});
