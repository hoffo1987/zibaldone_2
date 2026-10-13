import React, { useEffect, useState } from "react";

export const Text3D = ({ text, layers = 10, anim = true, className = "", delay = 0 }: { text: string; layers?: number; anim?: boolean; className?: string; delay?: number }) => {
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
};

export const Terminal3D = ({ user, cmd: cmd0, out: out0, run = true, delay = 0 }: { user: string; cmd: string; out: string; run?: boolean; delay?: number }) => {
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
  }, [cmd, run]);
  return (
    <div className="term3d">
      <span className="sr-only">{`${user}@circuito: ${cmd}. ${out}`}</span>
      {[5, 4, 3, 2, 1].map((k) => <i key={k} className="tm-slab" style={{ ["--k" as any]: k }} aria-hidden="true" />)}
      <div className="tm-face" aria-hidden="true">
        <div className="tm-bar"><i /><i /><i /><span>circuito — zsh</span></div>
        <div className="tm-line"><span className="tm-u">{user}@circuito</span><span className="tm-p">:~$</span> {cmd.slice(0, n).split("").map((c, j) => <span key={j} className="tm-c">{c}</span>)}{!done && <b className="tm-caret" />}</div>
        <div className="tm-out" style={done ? undefined : { visibility: "hidden", animation: "none" }} key={done ? out : "attesa"}><span className="tm-ar">{alt ? "↻" : "→"}</span> {out}<b className="tm-caret" /></div>
      </div>
    </div>
  );
};

export const D3_CSS = `
/* ===== 3D: scritte estruse, terminale e profondità diorama ===== */
@property --dz{syntax:'<length>';inherits:true;initial-value:0px}
.t3d{--dz:1.65px;position:relative;display:inline-block;max-width:100%;transform-style:preserve-3d;transform:perspective(1100px) rotateX(calc(var(--bx,7deg) + var(--gy,0)*-10deg)) rotateY(calc(var(--by,-9deg) + var(--gx,0)*16deg));transition:transform .65s cubic-bezier(.16,1,.3,1)}
.t3w{position:relative;display:inline-block;transform-style:preserve-3d;white-space:nowrap}
.t3d,.t3d *{text-shadow:none!important}
.t3f{position:relative;display:inline-block;transform:translateZ(.4px);color:var(--t3f,currentColor);filter:drop-shadow(0 1px 0 rgba(255,255,255,.18))}
.t3l{position:absolute;left:0;top:0;transform:translateZ(calc(var(--k)*var(--dz)*-1));color:color-mix(in srgb,var(--t3b) var(--kp),var(--t3a));-webkit-user-select:none;user-select:none;pointer-events:none}
.t3-in{animation:t3dz 1.1s cubic-bezier(.16,1,.3,1) backwards;animation-delay:calc(var(--t3d0,0ms) + 320ms)}
@keyframes t3dz{from{--dz:0px}}
.t3-in .t3w{animation:t3up .85s cubic-bezier(.2,.85,.3,1.2) backwards;animation-delay:calc(var(--t3d0,0ms) + var(--i,0)*75ms)}
@keyframes t3up{from{transform:translateY(.6em) translateZ(-160px) rotateX(-88deg)}}
.t3s{position:absolute;left:0;top:0;width:100%;color:var(--t3s,rgba(1,25,22,.55));filter:blur(var(--t3sb,6px));transform:translateZ(var(--sz,-26px)) translate(calc(var(--sx,5px) + var(--gx,0)*-5px),calc(var(--sy,10px) + var(--gy,0)*-5px));-webkit-user-select:none;user-select:none;pointer-events:none;transition:transform .65s cubic-bezier(.16,1,.3,1)}
.t3-in .t3s{animation:t3sIn 1.1s ease backwards;animation-delay:calc(var(--t3d0,0ms) + 380ms)}
@keyframes t3sIn{from{opacity:0}}
.t3-ink{--t3a:var(--ac);--t3b:color-mix(in srgb,var(--ac) 30%,#021412);--dz:1.25px;--bx:4.5deg;--by:-6deg;--sz:-26px;--sx:5px;--sy:9px;--t3sb:5px;--t3s:rgba(14,31,29,.22)}
.root.dark .t3-ink{--t3a:#5EEAD4;--t3b:#07423B;--t3s:rgba(0,0,0,.6)}
.t3-hero{--t3a:#E8FFFB;--t3b:#0E6358;--dz:1.35px;--bx:9deg;--by:-11deg;--sz:-34px}
.t3-hero .t3f{background:linear-gradient(180deg,#fff 32%,#CCFBF1);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none}
.t3-glint .t3f{background:linear-gradient(105deg,#fff 42%,#FDE68A 50%,#fff 58%) 120% 0/260% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:t3glint 1.4s cubic-bezier(.65,0,.35,1) 1.5s backwards}
@keyframes t3glint{from{background-position:120% 0}to{background-position:-20% 0}}
@media (hover:none){.t3-hero{animation:t3sway 9s ease-in-out infinite}.t3-hero.t3-in{animation:t3dz 1.1s cubic-bezier(.16,1,.3,1) calc(var(--t3d0,0ms) + 320ms) backwards,t3sway 9s ease-in-out infinite}}
@keyframes t3sway{0%,100%{transform:perspective(1100px) rotateX(9deg) rotateY(-14deg)}50%{transform:perspective(1100px) rotateX(5deg) rotateY(-4deg)}}

/* il terminale: vetro spesso stratificato, riflesso diagonale e testo sospeso */
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.term3d{position:relative;display:inline-block;max-width:100%;margin-bottom:1.4rem;transform-style:preserve-3d;transform:perspective(950px) rotateX(calc(15deg + var(--gy,0)*-13deg)) rotateY(calc(-15deg + var(--gx,0)*21deg)) rotateZ(-1.5deg);transition:transform .55s cubic-bezier(.16,1,.3,1);animation:tmIn 1s cubic-bezier(.16,1,.3,1) backwards}
@keyframes tmIn{from{transform:perspective(950px) rotateX(70deg) rotateY(-30deg) translateZ(-200px) translateY(40px)}}
.tm-slab{position:absolute;inset:0;border-radius:14px;background:color-mix(in srgb,#021A17 calc(50% + var(--k)*9%),#149686);border:1px solid rgba(45,212,191,.14);transform:translateZ(calc(var(--k)*-3.2px))}
.tm-face{position:relative;transform-style:preserve-3d;border-radius:14px;padding:.65rem 1.05rem .95rem;min-width:min(27rem,100%);background:linear-gradient(135deg,rgba(255,255,255,.1) 0%,transparent 42%),linear-gradient(160deg,rgba(6,42,38,.92),rgba(2,20,18,.95));border:1px solid rgba(94,234,212,.52);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 0 rgba(45,212,191,.2),0 32px 56px -20px rgba(0,0,0,.68);font:600 .92rem/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#CFFAF1}
@media (max-width:767px){.tm-face{font-size:.78rem;min-width:0}}
.tm-bar{display:flex;align-items:center;gap:.35rem;margin-bottom:.35rem;font-size:.66rem;color:rgba(207,250,241,.55);transform:translateZ(8px)}
.tm-bar i{width:.55rem;height:.55rem;border-radius:50%;background:#F87171;box-shadow:0 0 6px rgba(248,113,113,.5)}.tm-bar i+i{background:#FBBF24;box-shadow:0 0 6px rgba(251,191,36,.5)}.tm-bar i+i+i{background:#34D399;box-shadow:0 0 6px rgba(52,211,153,.5);margin-right:.4rem}
.tm-line,.tm-out{white-space:pre-wrap;transform:translateZ(24px);text-shadow:0 0 10px rgba(45,212,191,.75),0 0 2px rgba(255,255,255,.6)}
.tm-u{color:#5EEAD4}.tm-p{color:#FBBF24}
.tm-c{display:inline-block;white-space:pre;animation:tmKey .42s cubic-bezier(.2,.9,.3,1.25) backwards}
@keyframes tmKey{from{transform:translateZ(110px) translateY(-14px) scale(1.9);color:#fff;text-shadow:0 0 22px #FBBF24}}
.tm-out{color:#FDE68A;text-shadow:0 0 12px rgba(251,191,36,.7);animation:tmOut .55s steps(6,end) backwards}
@keyframes tmOut{0%{opacity:0;transform:translateZ(60px)}40%{opacity:1}60%{opacity:.3}100%{opacity:1;transform:translateZ(24px)}}
.tm-ar{color:#5EEAD4}
.tm-caret{display:inline-block;width:.5em;height:1em;margin-left:.15em;vertical-align:-.15em;background:#FBBF24;box-shadow:0 0 10px #FBBF24;animation:blink 1s steps(2) infinite}

/* ===== DIORAMA E SCHEDE 3D ===== */
.pn.hero.h3d{overflow:visible!important;transform-style:preserve-3d;transform:perspective(1500px) rotateX(calc(var(--ny,0)*-6.5deg)) rotateY(calc(var(--nx,0)*9.5deg));transition:transform 1.1s cubic-bezier(.22,1,.36,1),box-shadow .5s;will-change:transform;box-shadow:0 42px 95px -26px rgba(10,79,73,.75),0 0 0 1px rgba(255,255,255,.28),inset 0 1px 0 rgba(255,255,255,.38)}
.h3d>.hrain,.h3d:before,.h3d:after{border-radius:inherit}
.h3d>.hrain{translate:0 0 1px}
.h3d.boot{animation:h3dIn 1.25s cubic-bezier(.16,1,.3,1) .05s backwards}
@keyframes h3dIn{from{transform:perspective(1500px) rotateX(26deg) rotateY(-9deg) translateY(50px) translateZ(-260px)}}
.h3d .boot-run{display:none}
.l3d{display:flex;flex-direction:column;justify-content:space-between;padding:3rem;transform-style:preserve-3d;transform:perspective(2400px) rotateX(calc(var(--ny,0)*-4.5deg)) rotateY(calc(var(--nx,0)*6.5deg));transition:transform 1.1s cubic-bezier(.22,1,.36,1);will-change:transform}
.l3d-col{align-self:center;width:min(34rem,100%);margin:auto 0}
.l3d-logo{width:min(220px,46%);aspect-ratio:1;margin:0 0 1.75rem -14px}
.brandpanel>.l3d{position:absolute;inset:0}
.brandpanel:has(>.l3d)>canvas.pnl-art{filter:blur(1.4px) brightness(.82);transform:scale(1.02)}
.zl{transform-style:preserve-3d;translate:0 0 var(--z,0px)}
.h3d .t3d,.l3d .t3d{transform:none;transition:none}
.h3d .t3-hero{--dz:1.45px;--sz:-74px;--sx:11px;--sy:22px;--t3sb:9px;--t3s:rgba(0,14,12,.62)}
.l3d .t3-hero{--dz:1.5px;--sz:-48px;--sx:9px;--sy:18px;--t3sb:8px;--t3s:rgba(0,12,10,.65)}
.h3d .term3d{transform:rotateX(9deg) rotateY(-12deg) rotateZ(-1.5deg);animation-name:tmIn3}
@keyframes tmIn3{from{transform:rotateX(70deg) rotateY(-30deg) translateZ(-160px)}}
.zsh{position:absolute;pointer-events:none;border-radius:50%;background:radial-gradient(closest-side,rgba(1,22,19,.65),rgba(1,22,19,.28) 60%,transparent);filter:blur(8px);translate:0 0 2px}
.zsh-rect{position:absolute;inset:0;border-radius:14px;background:rgba(1,22,19,.48);filter:blur(13px);transform:translateZ(var(--sd,-70px)) translate(14px,26px);pointer-events:none}
@media (hover:none){
.h3d{animation:h3dSway 11s ease-in-out infinite}
.h3d .t3-hero,.l3d .t3-hero{animation:none}
.h3d .t3-hero.t3-in,.l3d .t3-hero.t3-in{animation:t3dz 1.1s cubic-bezier(.16,1,.3,1) calc(var(--t3d0,0ms) + 320ms) backwards}
}
@keyframes h3dSway{0%,100%{transform:perspective(1500px) rotateX(3deg) rotateY(-5deg)}50%{transform:perspective(1500px) rotateX(-2deg) rotateY(4deg)}}

/* Profondità 3D su card, contatori e modulo login quando ci si muove sopra col mouse */
@media (hover:hover){
.card{transform-style:preserve-3d}
.card:hover{transform:perspective(1100px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-5px) translateZ(6px);box-shadow:0 26px 48px -22px color-mix(in srgb,var(--ac) 48%,transparent),0 4px 0 -1px color-mix(in srgb,var(--ac) 30%,var(--ln)),var(--sh2)}
.card:hover .meta{transform:translateZ(10px)}
.card .meta{transition:transform .45s cubic-bezier(.16,1,.3,1)}
}

.f3d{position:relative;padding:2rem;border-radius:24px;background:color-mix(in srgb,var(--pn) 86%,transparent);border:1px solid var(--ln);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 50px 90px -38px rgba(14,31,29,.48),0 18px 32px -16px rgba(14,31,29,.26);transform:perspective(1350px) rotateX(calc(var(--gy,0)*-2.4deg)) rotateY(calc(var(--gx,0)*3.4deg)) translateZ(0);transition:transform .85s cubic-bezier(.16,1,.3,1)}
.f3d:focus-within{transform:none}
.root.dark .f3d{box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 50px 90px -38px rgba(0,0,0,.82)}
@media (max-width:767px){.f3d{padding:0;background:none;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;transform:none}}

.logo3d{outline:none;border-radius:28px}
.logo3d:focus-visible{box-shadow:0 0 0 2px rgba(251,191,36,.9),0 0 0 6px rgba(251,191,36,.25)}
.logo3d>canvas{filter:drop-shadow(0 16px 22px rgba(0,0,0,.28))}
.root.lite .t3l,.root.nomotion .t3l{transform:translateZ(calc(var(--k)*-1.3px))}
@media (prefers-reduced-motion:reduce){.t3d,.term3d{transition:none}}
`;
