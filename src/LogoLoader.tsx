import React, { useEffect, useRef } from "react";
import { renderLoop } from "./renderLoop";

// Caricamento del logo 3D: la targa in fil di ferro che ondeggia in prospettiva, una corrente che ne percorre il bordo,
// la C che si carica e le perle che si accendono una dopo l'altra. Compare solo se l'attesa dura più di un istante
// (niente lampi quando il logo è già pronto) e lascia il posto al logo con una dissolvenza.
// costanti della scena ripetute qui (non da logo3d/anim) perché il caricamento sta nel bundle principale
const TAU = Math.PI * 2, A0 = Math.atan2(9.6, 11.5), TAN = Math.tan((14.5 * Math.PI) / 180);
const cameraZ = (aspect: number) => Math.max(184, (54 / TAN) * Math.max(1, 1 / aspect));
const corner = (half: number, r: number, n: number) => {
  const pts: number[][] = [], c = half - r;
  [[c, c, 0], [-c, c, 90], [-c, -c, 180], [c, -c, 270]].forEach(([cx, cy, a0]) => { for (let k = 0; k <= n; k++) { const a = ((a0 + (k * 90) / n) * Math.PI) / 180; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } });
  return pts;
};
const EDGE = corner(31, 16, 10), INNER = corner(27.5, 13, 8);
const ARC = Array.from({ length: 49 }, (_, i) => { const a = A0 + (i / 48) * (TAU - 2 * A0); return [Math.cos(a) * 15, Math.sin(a) * 15]; });
const NODES: [number, number, number, boolean][] = [[ARC[0][0], ARC[0][1], 4.2, false], [-1, 0, 3.2, false], [ARC[48][0], ARC[48][1], 4.2, true]];
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));

export function drawLoader(g: CanvasRenderingContext2D, W: number, H: number, ratio: number, t: number) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, g.canvas.width, g.canvas.height); g.setTransform(ratio, 0, 0, ratio, 0, 0);
  const camZ = cameraZ(W / H), f = H / 2 / TAN;
  const ry = Math.sin(t * 0.9) * 0.38, rx = Math.sin(t * 0.63) * 0.16 - 0.05, cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
  const bob = Math.sin(t * 1.25) * 1.6;
  const P = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx, k = f / (camZ - z2);
    return [W / 2 + x1 * k, H / 2 - (y1 + bob) * k, k];
  };
  const path = (pts: number[][], z: number, from = 0, to = pts.length - 1, close = false) => {
    g.beginPath();
    for (let i = from; i <= to; i++) { const q = pts[((i % pts.length) + pts.length) % pts.length], p = P(q[0], q[1], z); if (i === from) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }
    if (close) g.closePath();
  };
  g.lineCap = "round"; g.lineJoin = "round";
  // la targa: faccia appena velata, due contorni (davanti e dietro) e il filetto interno
  path(EDGE, 6, 0, EDGE.length - 1, true); g.fillStyle = "rgba(34,216,192,0.07)"; g.fill();
  g.lineWidth = 1; g.strokeStyle = "rgba(94,234,212,0.16)"; path(EDGE, -6, 0, EDGE.length - 1, true); g.stroke();
  g.strokeStyle = "rgba(94,234,212,0.32)"; path(EDGE, 6, 0, EDGE.length - 1, true); g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.12)"; path(INNER, 6.4, 0, INNER.length - 1, true); g.stroke();
  for (const i of [0, 11, 22, 33]) { const a = P(EDGE[i][0], EDGE[i][1], 6), b = P(EDGE[i][0], EDGE[i][1], -6); g.strokeStyle = "rgba(94,234,212,0.14)"; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // la corrente che corre lungo il bordo: testa luminosa e scia che sfuma
  const n = EDGE.length, head = (t / 1.7) % 1 * n, tail = n * 0.3;
  for (let s = 0; s < 18; s++) {
    const a = head - (tail * (s + 1)) / 18, b = head - (tail * s) / 18, al = Math.pow(1 - s / 18, 2);
    g.lineWidth = 2.4 - s * 0.08; g.strokeStyle = `rgba(167,255,240,${(0.85 * al).toFixed(3)})`;
    path(EDGE, 6, Math.floor(a), Math.ceil(b)); g.stroke();
  }
  const hp = EDGE[((Math.floor(head) % n) + n) % n], h = P(hp[0], hp[1], 6), hr = 7 * (h[2] / 2.4);
  const hg = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], hr); hg.addColorStop(0, "rgba(255,255,255,0.95)"); hg.addColorStop(0.3, "rgba(94,234,212,0.5)"); hg.addColorStop(1, "rgba(94,234,212,0)");
  g.fillStyle = hg; g.fillRect(h[0] - hr, h[1] - hr, hr * 2, hr * 2);
  // la C si carica, poi la pista; a carica completa la sfera ambra lampeggia e tutto ricomincia sfumando
  const T = t % 2.6, kArc = ease(T / 1.25), kLine = ease((T - 1.15) / 0.45), fade = T > 2.1 ? 1 - (T - 2.1) / 0.5 : 1;
  const unit = P(0, 0, 7)[2];
  g.lineWidth = 5.1 * unit; g.strokeStyle = "rgba(255,255,255,0.07)"; path(ARC, 7); g.stroke(); g.beginPath(); { const a = P(-1, 0, 7), b = P(15, 0, 7); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); } g.lineWidth = 3.1 * unit; g.stroke();
  g.shadowColor = "rgba(45,212,191,0.8)"; g.shadowBlur = 10 * ratio;
  const end = Math.round(48 * kArc);
  if (end > 0) { g.lineWidth = 3.6 * unit; g.strokeStyle = `rgba(244,255,253,${(0.92 * fade).toFixed(3)})`; path(ARC, 7, 0, end); g.stroke(); }
  if (kLine > 0) { const a = P(-1, 0, 7), b = P(-1 + 16 * kLine, 0, 7); g.lineWidth = 2.2 * unit; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.shadowBlur = 0; g.shadowColor = "transparent";
  NODES.forEach(([x, y, r, amber], i) => {
    const on = i === 0 ? ease(T / 0.2) : i === 1 ? ease((T - 1.15) / 0.2) : ease((T - 1.25) / 0.15), p = P(x, y, 8), R = r * p[2] * (0.55 + 0.45 * on);
    const gr = g.createRadialGradient(p[0] - R * 0.35, p[1] - R * 0.4, R * 0.05, p[0], p[1], R);
    const col = amber ? ["255,251,234", "253,230,138", "245,158,11"] : ["255,255,255", "230,255,251", "94,170,160"];
    const al = (0.25 + 0.75 * on) * fade;
    gr.addColorStop(0, `rgba(${col[0]},${al})`); gr.addColorStop(0.55, `rgba(${col[1]},${al})`); gr.addColorStop(1, `rgba(${col[2]},${al * 0.9})`);
    g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], Math.max(0.5, R), 0, TAU); g.fill();
    if (amber && on > 0) {
      const gl = R * (3 + 2 * Math.max(0, 1 - (T - 1.4) * 2)), gg = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], gl);
      gg.addColorStop(0, `rgba(251,191,36,${(0.55 * on * fade).toFixed(3)})`); gg.addColorStop(1, "rgba(251,191,36,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = gg; g.fillRect(p[0] - gl, p[1] - gl, gl * 2, gl * 2); g.globalCompositeOperation = "source-over";
    }
  });
}

export default function LogoLoader({ className = "", hide = false }: { className?: string; hide?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const cv = document.createElement("canvas");
    let g: CanvasRenderingContext2D | null = null;
    try { g = cv.getContext("2d"); } catch {}
    if (!g) return;
    cv.style.cssText = "width:100%;height:100%;display:block";
    el.appendChild(cv);
    let W = 0, H = 0, ratio = 1;
    const fit = () => {
      W = el.clientWidth; H = el.clientHeight; ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (W && H) { cv.width = Math.round(W * ratio); cv.height = Math.round(H * ratio); }
    };
    fit();
    const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(el);
    const t0 = performance.now();
    // il primo fotogramma può avere un orario di poco precedente a t0: il tempo non va mai sotto zero
    const stop = renderLoop((now) => { if (W && H) drawLoader(g!, W, H, ratio, Math.max(0, (now - t0) / 1000)); }, () => 30, el);
    return () => { stop(); ro?.disconnect(); cv.remove(); };
  }, []);
  // entra dopo 150 ms e solo allora diventa visibile; esce in dissolvenza quando arriva il logo
  return <div ref={host} className={`logo-loader ${className}`} aria-hidden="true" style={{ opacity: hide ? 0 : undefined, transition: "opacity .45s ease", animation: hide ? undefined : "logoLoaderIn .35s ease .15s both" }} />;
}
