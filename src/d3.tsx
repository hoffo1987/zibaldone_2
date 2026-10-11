import React, { useEffect, useState } from "react";

// ===== SCRITTE IN TRE DIMENSIONI =====
// Le lettere sono estruse con strati di testo impilati nello spazio (CSS 3D): funziona con i caratteri del sito,
// con le lettere accentate, e il testo resta testo vero (selezionabile e letto dagli screen reader: gli strati sono nascosti).
// Il blocco si inclina seguendo il puntatore (variabili --gx/--gy impostate da App), così si vedono i fianchi delle lettere.

export const Text3D = ({ text, layers = 10, anim = true, className = "", delay = 0 }: { text: string; layers?: number; anim?: boolean; className?: string; delay?: number }) => {
  const w = text.split(" ");
  return (
    <span key={text} className={`t3d ${anim ? "t3-in" : ""} ${className}`} style={{ ["--t3d0" as any]: `${delay}ms` }}>
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

// Il terminale del Circuito: una finestra di vetro spessa che fluttua nello spazio. Il comando si batte un tasto alla volta
// (ogni carattere cala dall'alto verso il vetro), poi la risposta riporta i numeri veri dell'archivio.
export const Terminal3D = ({ user, cmd, out, run = true, delay = 0 }: { user: string; cmd: string; out: string; run?: boolean; delay?: number }) => {
  const [n, setN] = useState(run ? 0 : cmd.length);
  const [done, setDone] = useState(!run);
  useEffect(() => {
    if (!run) { setN(cmd.length); setDone(true); return; }
    setN(0); setDone(false);
    let i = 0, t = 0;
    const tick = () => { i++; setN(i); t = window.setTimeout(i < cmd.length ? tick : () => setDone(true), i < cmd.length ? 45 + Math.random() * 55 : 280); };
    t = window.setTimeout(tick, delay);
    return () => clearTimeout(t);
  }, [cmd, run]);
  return (
    <div className="term3d">
      <span className="sr-only">{`${user}@circuito: ${cmd}. ${out}`}</span>
      {[4, 3, 2, 1].map((k) => <i key={k} className="tm-slab" style={{ ["--k" as any]: k }} aria-hidden="true" />)}
      <div className="tm-face" aria-hidden="true">
        <div className="tm-bar"><i /><i /><i /><span>circuito — zsh</span></div>
        <div className="tm-line"><span className="tm-u">{user}@circuito</span><span className="tm-p">:~$</span> {cmd.slice(0, n).split("").map((c, j) => <span key={j} className="tm-c">{c}</span>)}{!done && <b className="tm-caret" />}</div>
        {done && <div className="tm-out"><span className="tm-ar">→</span> {out}<b className="tm-caret" /></div>}
      </div>
    </div>
  );
};

export const D3_CSS = `
/* ===== 3D: scritte estruse e terminale ===== */
@property --dz{syntax:'<length>';inherits:true;initial-value:0px}
.t3d{--dz:1.5px;display:inline-block;max-width:100%;transform-style:preserve-3d;transform:perspective(1100px) rotateX(calc(var(--bx,7deg) + var(--gy,0)*-9deg)) rotateY(calc(var(--by,-9deg) + var(--gx,0)*15deg));transition:transform .7s cubic-bezier(.16,1,.3,1)}
.t3w{position:relative;display:inline-block;transform-style:preserve-3d;white-space:nowrap}
.t3d,.t3d *{text-shadow:none!important} /* le ombre del pannello, ripetute su ogni strato, impasterebbero le lettere */
.t3f{position:relative;display:inline-block;transform:translateZ(.2px);color:var(--t3f,currentColor)}
.t3l{position:absolute;left:0;top:0;transform:translateZ(calc(var(--k)*var(--dz)*-1));color:color-mix(in srgb,var(--t3b) var(--kp),var(--t3a));-webkit-user-select:none;user-select:none;pointer-events:none}
/* entrata: ogni parola si ribalta in piedi come un blocco, poi le lettere si estrudono verso di te */
.t3-in{animation:t3dz 1.1s cubic-bezier(.16,1,.3,1) backwards;animation-delay:calc(var(--t3d0,0ms) + 320ms)}
@keyframes t3dz{from{--dz:0px}}
.t3-in .t3w{animation:t3up .85s cubic-bezier(.2,.85,.3,1.2) backwards;animation-delay:calc(var(--t3d0,0ms) + var(--i,0)*75ms)}
@keyframes t3up{from{transform:translateY(.6em) translateZ(-160px) rotateX(-88deg)}}
/* colori: titoli delle pagine (inchiostro con fianchi verdi) e titolo del pannello (bianco con fianchi verde profondo) */
.t3-ink{--t3a:var(--ac);--t3b:color-mix(in srgb,var(--ac) 25%,#000);--dz:1.35px;--bx:5deg;--by:-7deg}
.root.dark .t3-ink{--t3a:#5EEAD4;--t3b:#0A5A51}
.t3-hero{--t3a:#8FE8DA;--t3b:#03241F;--dz:1.45px;--bx:9deg;--by:-11deg}
.t3-hero .t3f{background:linear-gradient(180deg,#fff 30%,#D6FFF8);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none}
.t3-glint .t3f{background:linear-gradient(105deg,#fff 42%,#FDE68A 50%,#fff 58%) 120% 0/260% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:t3glint 1.4s cubic-bezier(.65,0,.35,1) 1.5s backwards}
@keyframes t3glint{from{background-position:120% 0}to{background-position:-20% 0}}
/* sui telefoni non c'è un puntatore da seguire: il titolo oscilla piano da solo, così i fianchi restano visibili */
@media (hover:none){.t3-hero{animation:t3sway 9s ease-in-out infinite}.t3-hero.t3-in{animation:t3dz 1.1s cubic-bezier(.16,1,.3,1) calc(var(--t3d0,0ms) + 320ms) backwards,t3sway 9s ease-in-out infinite}}
@keyframes t3sway{0%,100%{transform:perspective(1100px) rotateX(9deg) rotateY(-14deg)}50%{transform:perspective(1100px) rotateX(5deg) rotateY(-4deg)}}

/* il terminale: vetro spesso, testo che galleggia sopra la superficie */
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.term3d{position:relative;display:inline-block;max-width:100%;margin-bottom:1.4rem;transform-style:preserve-3d;transform:perspective(900px) rotateX(calc(16deg + var(--gy,0)*-12deg)) rotateY(calc(-16deg + var(--gx,0)*20deg)) rotateZ(-1.5deg);transition:transform .6s cubic-bezier(.16,1,.3,1);animation:tmIn 1s cubic-bezier(.16,1,.3,1) backwards}
@keyframes tmIn{from{transform:perspective(900px) rotateX(70deg) rotateY(-30deg) translateZ(-200px) translateY(40px)}}
.tm-slab{position:absolute;inset:0;border-radius:14px;background:color-mix(in srgb,#021A17 calc(55% + var(--k)*10%),#0E7468);transform:translateZ(calc(var(--k)*-3px))}
.tm-face{position:relative;transform-style:preserve-3d;border-radius:14px;padding:.6rem 1rem .9rem;min-width:min(27rem,100%);background:linear-gradient(160deg,rgba(6,40,36,.9),rgba(3,22,20,.92));border:1px solid rgba(94,234,212,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 30px 50px -20px rgba(0,0,0,.6);font:600 .92rem/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#CFFAF1}
@media (max-width:767px){.tm-face{font-size:.78rem;min-width:0}}
.tm-bar{display:flex;align-items:center;gap:.35rem;margin-bottom:.35rem;font-size:.66rem;color:rgba(207,250,241,.55);transform:translateZ(6px)}
.tm-bar i{width:.55rem;height:.55rem;border-radius:50%;background:#F87171}.tm-bar i+i{background:#FBBF24}.tm-bar i+i+i{background:#34D399;margin-right:.4rem}
.tm-line,.tm-out{white-space:pre-wrap;transform:translateZ(22px);text-shadow:0 0 10px rgba(45,212,191,.75),0 0 2px rgba(255,255,255,.6)}
.tm-u{color:#5EEAD4}.tm-p{color:#FBBF24}
.tm-c{display:inline-block;white-space:pre;animation:tmKey .42s cubic-bezier(.2,.9,.3,1.25) backwards}
@keyframes tmKey{from{transform:translateZ(110px) translateY(-14px) scale(1.9);color:#fff;text-shadow:0 0 22px #FBBF24}}
.tm-out{color:#FDE68A;text-shadow:0 0 12px rgba(251,191,36,.7);animation:tmOut .55s steps(6,end) backwards}
@keyframes tmOut{0%{opacity:0;transform:translateZ(60px)}40%{opacity:1}60%{opacity:.3}100%{opacity:1;transform:translateZ(22px)}}
.tm-ar{color:#5EEAD4}
.tm-caret{display:inline-block;width:.5em;height:1em;margin-left:.15em;vertical-align:-.15em;background:#FBBF24;box-shadow:0 0 10px #FBBF24;animation:blink 1s steps(2) infinite}

/* il logo 3D e i suoi contenitori */
.logo3d>canvas{filter:drop-shadow(0 24px 30px rgba(0,0,0,.35))}
.root.lite .t3l,.root.nomotion .t3l{transform:translateZ(calc(var(--k)*-1.3px))}
@media (prefers-reduced-motion:reduce){.t3d,.term3d{transition:none}}
`;
