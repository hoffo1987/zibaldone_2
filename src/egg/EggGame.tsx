import React, { useEffect, useRef, useState } from "react";
import { Game, HUD, GalleryInfo, Btn, CAST } from "./game";
import { VH } from "./world";
import { loadSpriteSheets, SpriteSheet } from "./sprite-sheet";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Silkscreen&display=swap');
.eg{position:fixed;inset:0;z-index:300;background:#05040a;color:#e9e6ff;font-family:'Silkscreen',ui-monospace,monospace;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:egIn .6s steps(6) both}
@keyframes egIn{from{clip-path:inset(50% 0 50% 0)}to{clip-path:inset(0 0 0 0)}}
.eg *{box-sizing:border-box}
.eg-stage{position:relative;flex:none}
.eg canvas{display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges}
.eg-top{position:absolute;top:6px;right:6px;display:flex;gap:6px;z-index:5}
.eg-b{font:inherit;font-size:12px;letter-spacing:.06em;color:#e9e6ff;background:#1a1730;border:2px solid #4a4370;box-shadow:inset -2px -2px 0 #0c0a18,inset 2px 2px 0 #2c2850;padding:8px 12px;cursor:pointer;line-height:1;text-transform:uppercase}
.eg-b:hover{background:#25204a;border-color:#8a7cff}
.eg-b:active{transform:translateY(1px);box-shadow:inset 2px 2px 0 #0c0a18}
.eg-b.on{background:#3d2f8a;border-color:#b9a7ff}
.eg-b.sq{width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;font-size:14px}
.eg-hud{position:absolute;inset:0;pointer-events:none;z-index:2}
.eg-bar{position:absolute;display:flex;flex-direction:column;gap:3px;font-size:11px;text-shadow:1px 1px 0 #000}
.eg-bar .tr{height:8px;background:#120f20;border:2px solid #000;box-shadow:0 0 0 1px #4a4370;position:relative;overflow:hidden}
.eg-bar .fl{position:absolute;inset:0;transform-origin:0 50%;transition:transform .25s steps(5)}
.eg-ban{position:absolute;left:0;right:0;top:34%;text-align:center;font-size:clamp(18px,4.2vw,38px);letter-spacing:.2em;text-shadow:3px 3px 0 #000,0 0 18px rgba(150,120,255,.7);animation:egBan 2.2s steps(12) both}
@keyframes egBan{0%{opacity:0;letter-spacing:.6em}15%{opacity:1;letter-spacing:.2em}80%{opacity:1}100%{opacity:0}}
.eg-menu{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;text-align:center;background:linear-gradient(rgba(5,4,10,.25),rgba(5,4,10,.75))}
.eg-title{font-size:clamp(22px,5vw,48px);letter-spacing:.12em;line-height:1.05;text-shadow:3px 3px 0 #000,0 0 24px rgba(120,220,255,.45)}
.eg-sub{font-size:11px;letter-spacing:.3em;color:#9d96c9}
.eg-pick{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.eg-card{font:inherit;color:inherit;cursor:pointer;width:150px;padding:10px;border:2px solid #3a3460;background:#100e1e;text-align:left;box-shadow:inset -3px -3px 0 #07060e}
.eg-card.on{border-color:#ffd75a;background:#1c1838;box-shadow:0 0 0 2px #000,0 0 18px rgba(255,215,90,.35)}
.eg-card b{display:block;font-size:13px;margin-bottom:4px;font-weight:normal}
.eg-card small{display:block;font-size:9px;color:#9d96c9;line-height:1.4}
.eg-keys{font-size:9px;color:#7c76a6;line-height:1.7;max-width:420px}
.eg-pad{position:absolute;z-index:3;display:grid;gap:8px;touch-action:none}
.eg-k{font:inherit;color:#fff;border:2px solid rgba(185,167,255,.5);background:rgba(26,23,48,.55);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;touch-action:none;-webkit-tap-highlight-color:transparent}
.eg-k.dn{background:rgba(120,100,255,.55);border-color:#fff;transform:scale(.94)}
.eg-k.big{font-size:13px}
.eg-gal{position:absolute;left:0;right:0;bottom:0;z-index:4;padding:8px;display:flex;flex-direction:column;gap:6px;background:linear-gradient(transparent,rgba(5,4,10,.92) 30%)}
.eg-row{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;align-items:center}
.eg-row .eg-b{font-size:10px;padding:6px 8px}
.eg-info{font-size:10px;color:#b9b2e8;text-align:center}
@media(max-width:600px) and (orientation:portrait){
  .eg.eg-gallery{justify-content:flex-start!important;padding-top:max(48px,env(safe-area-inset-top))!important}
  .eg-gallery .eg-gal{position:fixed;bottom:max(12px,env(safe-area-inset-bottom));max-height:45vh;overflow-y:auto}
}
`;

const PICK = [
  { id: "cloud", name: "Cloud", d: "Buster Sword. Colpi lenti e pesanti, capriola. Speciale: fendente in salto." },
  { id: "clive", name: "Clive", d: "Spada lunga e fuoco di Ifrit. Combo rapide, scatto. Speciale: palla di fuoco." },
];
const ANIM_IT: Record<string, string> = {
  idle: "Guardia", run: "Corsa", walk: "Passo", dash: "Scatto", jump: "Salto", fall: "Caduta", land: "Atterraggio",
  atk1: "Fendente 1", atk2: "Fendente 2", atk3: "Colpo pesante", air: "Attacco aereo", roll: "Schivata", cast: "Magia",
  hurt: "Colpito", death: "KO", win: "Vittoria", slash: "Fendente", thrust: "Affondo", tele: "Teletrasporto", intro: "Discesa",
};

export default function EggGame({ onClose }: { onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const gm = useRef<Game | null>(null);
  const [hud, setHud] = useState<HUD | null>(null);
  const [gal, setGal] = useState<GalleryInfo | null>(null);
  const [pick, setPick] = useState("cloud");
  const [box, setBox] = useState({ w: 0, h: 0, touch: false, portrait: false, ctrl: 0 });
  const [g, setG] = useState({ id: "cloud", anim: "idle", speed: 1, paused: false, fluid: false, face: 1 });
  const [down, setDown] = useState<Record<string, boolean>>({});
  const [mute, setMute] = useState(false);
  const [assets, setAssets] = useState<"loading" | "ready" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let game: Game | null = null, disposed = false;
    setAssets("loading");
    const sheets = Object.values(CAST).map(def => def.sheet).filter((sheet): sheet is SpriteSheet => !!sheet);
    loadSpriteSheets(sheets).then(images => {
      if (disposed) return;
      game = new Game(cv.current!, setHud, setGal, images); gm.current = game;
      fit(); setAssets("ready");
    }).catch(() => { if (!disposed) setAssets("error"); });
    const coarse = !!window.matchMedia?.("(pointer: coarse)").matches;
    const fit = () => {
      const vw = window.innerWidth, vh = window.innerHeight, portrait = vh > vw * 1.05;
      // in verticale su telefono: schermo di gioco in alto, comandi sotto
      const ctrl = coarse && portrait ? Math.max(200, Math.round(vh * 0.4)) : 0;
      const bw = vw, bh = vh - ctrl - (ctrl ? 24 : 0);
      if (!(bw > 0 && bh > 0)) return; // finestra nascosta o non ancora misurata
      const W = Math.max(ctrl ? 330 : 400, Math.min(640, Math.round((VH * bw) / bh)));
      const s = Math.min(bw / W, bh / VH);
      game?.resize(W); setBox({ w: Math.floor(W * s), h: Math.floor(VH * s), touch: coarse, portrait, ctrl });
    };
    fit(); window.addEventListener("resize", fit); document.addEventListener("visibilitychange", fit);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return; e.stopPropagation();
      if (!game) { onClose(); return; }
      const sc = game.scene;
      if (sc === "play") game.setPaused(!game.paused); else if (sc === "gallery") game.title(); else onClose();
    };
    window.addEventListener("keydown", esc, true);
    const H = document.documentElement, prev = [document.body.style.overflow, H.style.overflow];
    document.body.style.overflow = H.style.overflow = "hidden";
    return () => {
      disposed = true; game?.destroy(); gm.current = null; window.removeEventListener("resize", fit); document.removeEventListener("visibilitychange", fit); window.removeEventListener("keydown", esc, true);
      document.body.style.overflow = prev[0]; H.style.overflow = prev[1];
    };
  }, [loadAttempt]);

  const G = gm.current;
  const scene = hud?.scene || "title";
  const startGal = (id: string, anim: string) => { G?.gallery(id, anim); setG((o) => ({ ...o, id, anim })); };
  const galSet = (k: Partial<typeof g>) => { setG((o) => { const n = { ...o, ...k }; if (G) Object.assign(G.gal, { speed: n.speed, paused: n.paused, fluid: n.fluid, face: n.face }); return n; }); };

  const key = (b: Btn, label: string, size: number, big = false) => {
    const on = (v: boolean) => (e: React.PointerEvent) => { e.preventDefault(); G?.setBtn(b, v); setDown((d) => ({ ...d, [b]: v })); };
    return (
      <button key={b} className={`eg-k ${down[b] ? "dn" : ""} ${big ? "big" : ""}`} style={{ width: size, height: size }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); on(true)(e); }} onPointerUp={on(false)} onPointerCancel={on(false)} onLostPointerCapture={on(false)}
        onContextMenu={(e) => e.preventDefault()} aria-label={label}>{label}</button>
    );
  };
  const bar = (label: string, v: number, max: number, col: string, style: React.CSSProperties, right = false) => (
    <div className="eg-bar" style={{ ...style, alignItems: right ? "flex-end" : "flex-start" }}>
      <span>{label}</span>
      <div className="tr" style={{ width: style.width }}><div className="fl" style={{ background: col, transform: `scaleX(${v / max})`, ...(right ? { transformOrigin: "100% 50%" } : {}) }} /></div>
    </div>
  );
  const kpx = box.portrait ? Math.max(52, Math.min(76, (box.w - 40) / 5.7)) : Math.max(52, Math.min(70, box.h * 0.17));
  const vert = box.touch && box.portrait;

  return (
    <div className={`eg${scene === "gallery" ? " eg-gallery" : ""}`} style={vert ? { justifyContent: "flex-start", paddingTop: "max(24px, env(safe-area-inset-top))" } : undefined} onContextMenu={(e) => e.preventDefault()}>
      <style>{CSS}</style>
      <div className="eg-stage" style={{ width: box.w, height: box.h }}>
        <canvas ref={cv} />
        <div className="eg-top">
          {scene === "play" && <button className="eg-b sq" onClick={() => G?.setPaused(!G.paused)} aria-label="Pausa">II</button>}
          <button className="eg-b sq" onClick={() => { const m = !mute; setMute(m); if (G) G.sfx.on = !m; }} aria-label="Audio">{mute ? "×" : "♪"}</button>
          <button className="eg-b sq" onClick={onClose} aria-label="Esci">X</button>
        </div>

        {hud && scene === "play" && (
          <div className="eg-hud">
            {bar(`${hud.hero === "cloud" ? "CLOUD" : "CLIVE"}  ${hud.hp}`, hud.hp, hud.hpMax, "linear-gradient(#7dffb0,#2fae6a)", { left: 10, top: 8, width: Math.min(180, box.w * 0.3) })}
            {hud.showBoss && bar(`SEPHIROTH  ${hud.boss}`, hud.boss, hud.bossMax, "linear-gradient(#c9b8ff,#6a4bdc)", { left: "50%", bottom: 10, width: Math.min(320, box.w * 0.6), transform: "translateX(-50%)", alignItems: "center" })}
            {hud.banner && <div key={hud.banner} className="eg-ban">{hud.banner}</div>}
          </div>
        )}

        {assets !== "ready" && <div className="eg-menu" role="status" aria-live="polite">
          <div className="eg-sub">{assets === "error" ? "Impossibile caricare gli sprite" : "Caricamento sprite…"}</div>
          {assets === "error" && <button className="eg-b" onClick={() => setLoadAttempt(n => n + 1)}>Riprova</button>}
        </div>}

        {assets === "ready" && scene === "title" && (
          <div className="eg-menu">
            <div className="eg-sub">un segreto del circuito</div>
            <div className="eg-title">ONE-WINGED<br />ANGEL</div>
            <div className="eg-pick">
              {PICK.map((p) => <button key={p.id} className={`eg-card ${pick === p.id ? "on" : ""}`} onClick={() => setPick(p.id)}><b>{p.name}</b><small>{p.d}</small></button>)}
            </div>
            <div className="eg-row">
              <button className="eg-b on" onClick={() => G?.start(pick)}>Inizia</button>
              <button className="eg-b" onClick={() => startGal(pick, "idle")}>Galleria animazioni</button>
            </div>
            {!box.touch && <div className="eg-keys">← → muovi · ↑/spazio salta · J attacca · K schiva · L speciale · Q cambia eroe · Esc pausa</div>}
          </div>
        )}

        {scene === "play" && hud?.paused && (
          <div className="eg-menu">
            <div className="eg-title">PAUSA</div>
            <div className="eg-row">
              <button className="eg-b on" onClick={() => G?.setPaused(false)}>Riprendi</button>
              <button className="eg-b" onClick={() => G?.start(hud.hero)}>Ricomincia</button>
              <button className="eg-b" onClick={() => G?.title()}>Menu</button>
            </div>
          </div>
        )}
        {(scene === "over" || scene === "win") && (
          <div className="eg-menu">
            <div className="eg-title">{scene === "win" ? "VITTORIA" : "SCONFITTA"}</div>
            <div className="eg-sub">{scene === "win" ? "l'angelo dall'ala nera è caduto" : "la lifestream ti riaccoglie"}</div>
            <div className="eg-row">
              <button className="eg-b on" onClick={() => G?.start(hud!.hero)}>{scene === "win" ? "Rigioca" : "Riprova"}</button>
              <button className="eg-b" onClick={() => G?.title()}>Menu</button>
            </div>
          </div>
        )}

        {scene === "gallery" && (
          <div className="eg-gal">
            <div className="eg-row">
              {["cloud", "clive", "seph"].map((id) => <button key={id} className={`eg-b ${g.id === id ? "on" : ""}`} onClick={() => startGal(id, CAST[id].anims[g.anim] ? g.anim : "idle")}>{CAST[id].name}</button>)}
              <button className="eg-b" onClick={() => G?.title()}>Indietro</button>
            </div>
            <div className="eg-row">
              {Object.keys(CAST[g.id].anims).map((a) => <button key={a} className={`eg-b ${g.anim === a ? "on" : ""}`} onClick={() => startGal(g.id, a)}>{ANIM_IT[a] || a}</button>)}
            </div>
            <div className="eg-row">
              <button className="eg-b" onClick={() => { galSet({ paused: true }); G?.galStep(-1); }} aria-label="Frame precedente">◀|</button>
              <button className={`eg-b ${g.paused ? "on" : ""}`} onClick={() => galSet({ paused: !g.paused })}>{g.paused ? "Play" : "Pausa"}</button>
              <button className="eg-b" onClick={() => { galSet({ paused: true }); G?.galStep(1); }} aria-label="Frame successivo">|▶</button>
              {[1, 0.5, 0.25].map((s) => <button key={s} className={`eg-b ${g.speed === s ? "on" : ""}`} onClick={() => galSet({ speed: s })}>{s === 1 ? "1×" : s === 0.5 ? "½×" : "¼×"}</button>)}
              {!CAST[g.id].sheet && <button className={`eg-b ${g.fluid ? "on" : ""}`} onClick={() => galSet({ fluid: !g.fluid })}>{g.fluid ? "Fluido" : "Pixel"}</button>}
              <button className="eg-b" onClick={() => galSet({ face: -g.face })}>Gira</button>
            </div>
            {gal && <div className="eg-info">{ANIM_IT[gal.anim] || gal.anim} · frame {gal.frame + 1}/{gal.frames} · {gal.bitmap ? "sprite disegnati" : `${gal.fps} fps`} · {gal.len.toFixed(2)}s</div>}
          </div>
        )}

        {box.touch && scene === "play" && !hud?.paused && !box.portrait && (<>
          <div className="eg-pad" style={{ left: 12, bottom: 12, gridTemplateColumns: `repeat(2,${kpx}px)` }}>{key("left", "◀", kpx, true)}{key("right", "▶", kpx, true)}</div>
          <div className="eg-pad" style={{ right: 12, bottom: 12, gridTemplateColumns: `repeat(3,${kpx}px)`, alignItems: "center", justifyItems: "center" }}>
            {key("swap", "⇄", kpx * 0.72)}{key("dodge", "SCH", kpx * 0.82)}{key("spec", "SP", kpx * 0.82)}
            <span />{key("jump", "SAL", kpx, true)}{key("atk", "ATK", kpx, true)}
          </div>
        </>)}
      </div>
      {box.touch && box.portrait && scene === "play" && !hud?.paused && (
        <div style={{ flex: 1, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px max(16px, env(safe-area-inset-bottom))" }}>
          <div className="eg-pad" style={{ position: "static", gridTemplateColumns: `repeat(2,${kpx}px)` }}>{key("left", "◀", kpx, true)}{key("right", "▶", kpx, true)}</div>
          <div className="eg-pad" style={{ position: "static", gridTemplateColumns: `repeat(3,${kpx}px)`, alignItems: "center", justifyItems: "center" }}>
            {key("swap", "⇄", kpx * 0.72)}{key("dodge", "SCH", kpx * 0.82)}{key("spec", "SP", kpx * 0.82)}
            <span />{key("jump", "SAL", kpx, true)}{key("atk", "ATK", kpx, true)}
          </div>
        </div>
      )}
    </div>
  );
}
