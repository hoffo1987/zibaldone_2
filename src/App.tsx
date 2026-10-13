import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useId } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail, confirmPasswordReset, signInAnonymously
} from "firebase/auth";
import {
  getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, setDoc, getDoc, deleteField
} from "firebase/firestore";
import {
  Cpu, Bookmark, Loader2, Activity, Star, X, Trash2, ListChecks, CheckCircle2, Circle,
  Bold, Italic, Underline, Image as ImageIcon, LogOut, Eraser, Undo, Redo, PaintBucket, Type, Pen,
  Save, Search, Sun, Moon, Pencil, Minus, Square, Grid3x3, List, Palette, Copy, Plus, LayoutDashboard, Trophy, Users, ChevronLeft, ChevronRight, Hand, Eye, EyeOff, Camera, Award, CalendarDays, Settings, Zap, RotateCcw, Download, Bell, ChevronDown, ArrowUpRight, SlidersHorizontal, Sparkles
} from "lucide-react";
import { PannelloAdmin, STATI } from "./Valutazione";
import { clean, plain } from "./sanitize";
import { AccessoProf } from "./AccessoProf";
import { M, Words, Sheets, useFlip, useRail, useReadTrace, openSheet, closeSheet, rectOf, moving } from "./motion";
import { Text3D, Terminal3D } from "./d3";
import { renderLoop, holdLoops } from "./renderLoop";
import { useMediaQuery } from "./useMediaQuery";
import { useMusic } from "./useMusic";
import { SettingsDialog } from "./Dialog";
import * as sound from "./sound";
// il logo 3D (three.js) si carica a parte, solo quando serve: il resto del sito non lo scarica
import Logo3D from "./LogoView";
// easter egg: 3 tocchi sul logo in home → esci dall'account → 3 tocchi sul logo del login → caricamento → gioco
import EggPortal from "./EggPortal";
// presentazione del primo accesso (film + tour guidato): si scarica solo per chi deve vederla
const loadTour = () => import("./tour/Tour");
const Tour = React.lazy(loadTour);
const TOUR = "circuito:tour:";
const tourSeen = (uid: string) => { try { return localStorage.getItem(TOUR + uid) === "1"; } catch { return true; } };
const tourMark = (uid: string) => { try { localStorage.setItem(TOUR + uid, "1"); } catch {} };
// nessuna presentazione già vista su questo dispositivo: chi sta entrando è quasi certamente nuovo
const tourLikely = () => { try { for (let i = 0; i < localStorage.length; i++) if ((localStorage.key(i) || "").indexOf(TOUR) === 0) return false; return true; } catch { return false; } };
const EGG = "circuito:egg";
const eggGet = () => { try { return Number(sessionStorage.getItem(EGG) || 0); } catch { return 0; } };
const eggSet = (n: number) => { try { sessionStorage.setItem(EGG, String(n)); } catch {} };
const useTriple = (fn: (e: any) => void) => {
  const r = useRef({ n: 0, t: 0 });
  return (e: any) => { const now = Date.now(); r.current.n = now - r.current.t < 650 ? r.current.n + 1 : 1; r.current.t = now; if (r.current.n >= 3) { r.current.n = 0; fn(e); } };
};
const eggFlip = (e: any) => { const el = e?.currentTarget; if (!el || !el.animate) return; el.animate([{ transform: "perspective(500px) rotateY(0)" }, { transform: "perspective(500px) rotateY(360deg)" }], { duration: 900, easing: "cubic-bezier(.34,1.56,.64,1)" }); };

// --- FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAq02XXQkepvHsgHEN4zTZni8pp20r1jUU",
  authDomain: "zibaldone-1-prova.firebaseapp.com",
  projectId: "zibaldone-1-prova",
  storageBucket: "zibaldone-1-prova.firebasestorage.app",
  messagingSenderId: "578635223914",
  appId: "1:578635223914:web:74e1adc0de09af1a03cb13",
  measurementId: "G-S3KW241D85",
};
let auth: any, db: any;
try { const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); } catch (e) { console.error(e); }

const INK_COLORS = [
  { id: "#10211F", name: "Inchiostro" }, { id: "#334155", name: "Ardesia" }, { id: "#64748B", name: "Grigio tecnico" },
  { id: "#991B1B", name: "Rosso allarme" }, { id: "#C2410C", name: "Rame" }, { id: "#EA580C", name: "Arancio" },
  { id: "#CA8A04", name: "Oro" }, { id: "#166534", name: "Verde scheda" }, { id: "#16A34A", name: "Smeraldo LED" },
  { id: "#0284C7", name: "Azzurro display" }, { id: "#1D4ED8", name: "Blu" }, { id: "#4F46E5", name: "Indaco" },
  { id: "#7E22CE", name: "Viola" }, { id: "#DB2777", name: "Rosa" },
];
const TOOLS = [
  { id: "pen", label: "Penna", icon: Pen }, { id: "line", label: "Linea", icon: Minus },
  { id: "rect", label: "Rettangolo", icon: Square }, { id: "ellipse", label: "Ellisse", icon: Circle },
  { id: "fill", label: "Forma piena", icon: PaintBucket }, { id: "eraser", label: "Gomma", icon: Eraser }, { id: "hand", label: "Scorri", icon: Hand },
];
const SORTS: any = { newest: "Più recenti", rated: "Voto più alto", oldest: "Più vecchi", longest: "Più lunghi", shortest: "Più brevi" };

// --- UTIL ---
// clean() e plain() vivono in sanitize.ts (pulizia dell'HTML degli scritti)

// Nome e cognome: spazi sistemati e iniziali maiuscole (solo se la parola è tutta minuscola o tutta maiuscola: "De Luca" e "D'Angelo" restano com'erano)
// (le espressioni con \p{L} sono costruite con new RegExp perché i TypeScript recenti non accettano il flag "u" nei letterali con questo target)
const RE_LETTER = new RegExp("\\p{L}", "gu"), RE_MARK = new RegExp("\\p{M}", "gu"), RE_INITIAL = new RegExp("(^|['\u2019-])(\\p{L})", "gu");
const tidyName = (s: string) => s.trim().replace(/\s+/g, " ").split(" ").filter(Boolean)
  .map((w) => (w.length > 1 && (w === w.toLowerCase() || w === w.toUpperCase()) ? w.toLowerCase().replace(RE_INITIAL, (_m, a, b) => a + b.toUpperCase()) : w)).join(" ");
// un nome vero: almeno 2 lettere, niente numeri né simboli
const okName = (s: string) => s.length >= 2 && s.length <= 30 && !/[\d_@#$%^&*()+=<>[\]{}|\\/!?~`":;,]/.test(s) && (s.match(RE_LETTER) || []).length >= 2;
// handle di partenza ricavato dal nome ("Mario Rossi" → "mario.rossi"), poi modificabile dal profilo
const toHandle = (s: string) => s.normalize("NFD").replace(RE_MARK, "").toLowerCase().trim().split(/\s+/).join(".").replace(/[^a-z0-9_.]/g, "").slice(0, 20).replace(/\.+$/, "");
const dims = (t: any) => ({
  w: t.w || 900,
  h: t.h || (t.strokes || []).reduce((m: number, s: any) => s.points.reduce((mm: number, p: any) => Math.max(mm, p.y + 80), m), 400),
});
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const distSeg = (p: any, a: any, b: any) => {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
const compressImage = (file: File): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = (ev: any) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * k; c.height = img.height * k;
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = rej; img.src = ev.target.result;
  };
  r.onerror = rej; r.readAsDataURL(file);
});

// ogni logo ha il PROPRIO id di gradiente: con un id fisso, su mobile il riferimento puntava al logo della sidebar
// (display:none) e il fondo del logo non veniva disegnato, lasciando solo i tratti bianchi su sfondo chiaro
const Logo = ({ size = 32 }: { size?: number }) => {
  const gid = "lg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Il Circuito" className="lgf">
    <defs><linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#17C3AE" /><stop offset="1" stopColor="#0A4F49" /></linearGradient></defs>
    <rect width="64" height="64" rx="17" fill={`url(#${gid})`} />
    <rect x=".75" y=".75" width="62.5" height="62.5" rx="16.25" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
    <path className="lg-arc" pathLength={100} d="M43.5 22.4A15 15 0 1 0 43.5 41.6" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    <path className="lg-line" pathLength={100} d="M31 32H47" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <path className="lg-flow" d="M31 32H47" stroke="#FBBF24" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 5" />
    <circle className="lg-n" cx="43.5" cy="22.4" r="4.2" fill="#fff" />
    <circle className="lg-amber" cx="43.5" cy="41.6" r="4.2" fill="#FBBF24" />
    <circle className="lg-n" cx="31" cy="32" r="3.2" fill="#fff" />
  </svg>
  );
};
const Wordmark = ({ size = 38, fs, light, center, stack, tag = true, onLogo }: any) => (
  <div className={`flex leading-none ${stack ? "flex-col gap-4" : "gap-3"} ${stack && !center ? "items-start" : "items-center"} ${center ? "text-center" : ""}`}>
    <span className="lgw inline-flex shrink-0" onClick={onLogo}><Logo size={size} /></span>
    <div>
      <div className="wm" aria-label="Il Circuito" style={{ fontSize: fs || Math.round(size * 0.5), ["--wc" as any]: light ? "#fff" : "var(--ink)", ["--wa" as any]: light ? "#FBBF24" : "var(--ac)" }}>
        {"Il Circuito".split("").map((c, i) => <span key={i} aria-hidden="true" className="wl" style={{ ["--i" as any]: i }}>{c === " " ? "\u00A0" : c}</span>)}
      </div>
      {tag && <div className="text-xs mt-2" style={{ color: light ? "rgba(255,255,255,.7)" : "var(--mu)" }}>Archivio di scrittura</div>}
    </div>
  </div>
);
// --- SFONDI GENERATIVI: ogni pagina ha un disegno diverso, mai a tessere ripetute, ricalcolato a ogni apertura ---
type ArtFn = (g: CanvasRenderingContext2D, W: number, H: number, R: () => number, c: string, am: string) => void;
const mulberry = (a: number) => () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
// scheda elettronica: piste a 45°, piazzole, chip con piedini e piste che ne escono
const artCircuit: ArtFn = (g, W, H, R, c, am) => {
  const G = 22, pick = () => (R() < 0.13 ? `rgb(${am})` : `rgb(${c})`);
  g.lineJoin = "round"; g.lineCap = "round";
  const pad = (x: number, y: number) => { g.beginPath(); g.arc(x, y, R() < 0.3 ? 5 : 3.4, 0, 7); g.stroke(); if (R() < 0.4) { g.beginPath(); g.arc(x, y, 1.5, 0, 7); g.fill(); } };
  const walk = (x: number, y: number, d: number, segs: number) => {
    const pts = [[x, y]];
    for (let i = 0; i < segs; i++) {
      const n = 2 + Math.floor(R() * 7);
      x += DIR8[d][0] * n * G; y += DIR8[d][1] * n * G; pts.push([x, y]);
      if (x < -60 || y < -60 || x > W + 60 || y > H + 60) break;
      d = (d + (R() < 0.82 ? (R() < 0.5 ? 1 : 7) : (R() < 0.5 ? 2 : 6))) % 8;
    }
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    return pts;
  };
  g.lineWidth = 1.4;
  const nT = Math.floor((W * H) / 36000);
  for (let i = 0; i < nT; i++) {
    g.strokeStyle = g.fillStyle = pick();
    const pts = walk(Math.round((R() * W) / G) * G, Math.round((R() * H) / G) * G, Math.floor(R() * 8), 2 + Math.floor(R() * 5));
    pad(pts[0][0], pts[0][1]); if (R() < 0.8) pad(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  const nC = Math.max(2, Math.floor((W * H) / 420000));
  for (let i = 0; i < nC; i++) {
    g.strokeStyle = g.fillStyle = pick();
    const w = G * (4 + Math.floor(R() * 5)), h = G * (3 + Math.floor(R() * 4)), x = Math.round((R() * (W - w)) / G) * G, y = Math.round((R() * (H - h)) / G) * G;
    g.lineWidth = 1.6; g.strokeRect(x, y, w, h);
    g.beginPath(); g.arc(x + 9, y + 9, 3, 0, 7); g.stroke();
    g.lineWidth = 1.2;
    const pin = (px: number, py: number, dx: number, dy: number) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx * 8, py + dy * 8); g.stroke(); };
    for (let px = x + 14; px < x + w - 6; px += 11) { pin(px, y, 0, -1); pin(px, y + h, 0, 1); }
    for (let py = y + 14; py < y + h - 6; py += 11) { pin(x, py, -1, 0); pin(x + w, py, 1, 0); }
    g.lineWidth = 1.4;
    const nF = 3 + Math.floor(R() * 4);
    for (let k = 0; k < nF; k++) {
      const side = Math.floor(R() * 4), nx = Math.max(1, Math.floor((w - 20) / 11)), ny = Math.max(1, Math.floor((h - 20) / 11));
      const ox = x + 14 + 11 * Math.floor(R() * nx), oy = y + 14 + 11 * Math.floor(R() * ny);
      const st = [[ox, y - 8, 6], [x + w + 8, oy, 0], [ox, y + h + 8, 2], [x - 8, oy, 4]][side];
      const pts = walk(st[0], st[1], st[2], 2 + Math.floor(R() * 3)); pad(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }
  }
};
// cartiglio da disegno tecnico: crocette sparse, cerchi tratteggiati e quote
const artBlueprint: ArtFn = (g, W, H, R, c, am) => {
  g.lineCap = "round"; g.lineWidth = 1.2;
  const cross = (x: number, y: number, s: number) => { g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke(); };
  for (let gx = 0; gx < W; gx += 46) for (let gy = 0; gy < H; gy += 46) {
    if (R() < 0.45) continue;
    g.strokeStyle = `rgb(${R() < 0.08 ? am : c})`; cross(gx + R() * 46, gy + R() * 46, 3 + R() * 6);
  }
  g.strokeStyle = `rgb(${c})`; g.setLineDash([6, 9]);
  const nCi = Math.max(3, Math.floor((W * H) / 260000));
  for (let i = 0; i < nCi; i++) {
    const x = R() * W, y = R() * H, r = 40 + R() * 150;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    g.setLineDash([]); cross(x, y, 9); g.setLineDash([6, 9]);
  }
  g.setLineDash([]);
  g.font = "10px ui-monospace, Menlo, Consolas, monospace"; g.fillStyle = `rgb(${c})`; g.textAlign = "center";
  const nQ = Math.max(3, Math.floor((W * H) / 300000));
  for (let i = 0; i < nQ; i++) {
    const x = R() * W, y = R() * H, len = 80 + R() * 220, vert = R() < 0.4;
    g.save(); g.translate(x, y); if (vert) g.rotate(Math.PI / 2);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.moveTo(0, -6); g.lineTo(0, 6); g.moveTo(len, -6); g.lineTo(len, 6); g.stroke();
    g.fillText(`${Math.round(len)} mm`, len / 2, -7); g.restore();
  }
};
// curve di livello: archivio come una mappa topografica
const artContour: ArtFn = (g, W, H, R, c, am) => {
  g.lineWidth = 1.2; g.lineJoin = "round";
  const nB = Math.max(3, Math.floor((W * H) / 380000));
  for (let b = 0; b < nB; b++) {
    const cx = R() * W, cy = R() * H, base = 30 + R() * 50, step = 14 + R() * 10, rings = 6 + Math.floor(R() * 9), sx = 0.8 + R() * 0.8;
    const a1 = 0.12 + R() * 0.14, a2 = 0.08 + R() * 0.1, a3 = 0.04 + R() * 0.06, p1 = R() * 6.28, p2 = R() * 6.28, p3 = R() * 6.28;
    g.strokeStyle = `rgb(${R() < 0.12 ? am : c})`;
    for (let r = 0; r < rings; r++) {
      const rad = base + r * step;
      g.beginPath();
      for (let k = 0; k <= 90; k++) {
        const t = (k / 90) * Math.PI * 2, rr = rad * (1 + a1 * Math.sin(2 * t + p1 + r * 0.15) + a2 * Math.sin(3 * t + p2) + a3 * Math.sin(5 * t + p3 + r * 0.2));
        const x = cx + Math.cos(t) * rr * sx, y = cy + Math.sin(t) * rr;
        if (k) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    }
  }
};
// rete di nodi collegati ai vicini più prossimi
const artNetwork: ArtFn = (g, W, H, R, c, am) => {
  const n = Math.max(14, Math.floor((W * H) / 42000)), P: number[][] = [];
  for (let i = 0; i < n; i++) P.push([R() * W, R() * H, R()]);
  const maxD = Math.max(160, Math.sqrt((W * H) / n) * 1.9);
  g.lineWidth = 1.1; g.strokeStyle = `rgb(${c})`;
  P.forEach((p, i) => {
    const near = P.map((q, j) => [j, Math.hypot(p[0] - q[0], p[1] - q[1])]).filter((x) => x[0] !== i && x[1] < maxD).sort((a, b) => a[1] - b[1]).slice(0, 2 + Math.floor(R() * 2));
    near.forEach((x) => { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(P[x[0]][0], P[x[0]][1]); g.stroke(); });
  });
  P.forEach((p) => {
    const big = p[2] > 0.88; g.fillStyle = g.strokeStyle = `rgb(${p[2] < 0.1 ? am : c})`;
    g.beginPath(); g.arc(p[0], p[1], big ? 8 : 2.6 + p[2] * 2, 0, 7); if (big) g.stroke(); else g.fill();
    if (big) { g.beginPath(); g.arc(p[0], p[1], 2.6, 0, 7); g.fill(); }
  });
};
// cielo di puntini e scintille per il podio
const artStars: ArtFn = (g, W, H, R, c, am) => {
  const n = Math.floor((W * H) / 7000);
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = R() * H, s = R();
    g.fillStyle = `rgba(${s < 0.2 ? am : c},${0.35 + R() * 0.65})`;
    g.beginPath(); g.arc(x, y, 0.7 + s * 1.7, 0, 7); g.fill();
    if (s > 0.96) { g.strokeStyle = g.fillStyle; g.lineWidth = 1.2; const l = 6 + R() * 8; g.beginPath(); g.moveTo(x - l, y); g.lineTo(x + l, y); g.moveTo(x, y - l); g.lineTo(x, y + l); g.stroke(); }
  }
};
const ART: Record<string, ArtFn> = { home: artCircuit, write: artBlueprint, archive: artContour, authors: artNetwork, podio: artStars };
const BgArt = ({ kind, dark }: { kind: string; dark: boolean }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const seed = useRef(Math.floor(Math.random() * 2147483647));
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const g = cv.getContext("2d"); if (!g) return;
    let w0 = 0, h0 = 0, timer = 0;
    const draw = () => {
      const W = window.innerWidth, H = Math.round(window.innerHeight * 1.5);
      if (w0 && Math.abs(W - w0) < 40 && H < h0 * 1.3 && H > h0 * 0.7) return; // la barra del browser su telefono non deve rigenerare il disegno
      w0 = W; h0 = H;
      const dpr = W > 1400 ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      ART[kind]?.(g, W, H, mulberry(seed.current), dark ? "45,212,191" : "15,139,122", dark ? "251,191,36" : "202,138,4");
    };
    draw();
    const on = () => { clearTimeout(timer); timer = window.setTimeout(draw, 200); };
    window.addEventListener("resize", on);
    return () => { clearTimeout(timer); window.removeEventListener("resize", on); };
  }, [kind, dark]);
  return <canvas ref={ref} className="bd-art" aria-hidden="true" />;
};
const Backdrop = ({ tab, fx, dark, art = true, g }: { tab: string; fx: boolean; dark: boolean; art?: boolean; g: any }) => {
  const k = tab === "profile" ? "authors" : ["home", "write", "podio", "authors"].includes(tab) ? tab : "archive";
  return (<>
    <div key={k} className={`bd bd-${k} bdin fixed inset-0 z-0 pointer-events-none`}><div className="bd-w" /><div className="au a1" /><div className="au a2" /><div className="au a3" />{k === "podio" && <div className="bd-p" />}{art && <BgArt kind={k} dark={dark} />}</div>
    {fx && <FX dark={dark} g={g} />}
  </>);
};

// --- PANNELLO VERDE DEL LOGIN: schema elettrotecnico generato a caso (diverso a ogni apertura), con correnti che scorrono ---
// Stesso principio degli sfondi delle altre pagine: disegno procedurale con seme casuale, mai a tessere ripetute.
type PPath = { p: number[][]; c: number[]; L: number; a: number };
type PScene = { paths: PPath[]; lamps: number[][]; sw: number[][]; waves: number[][] };
const mkPPath = (p: number[][], a = 1): PPath => {
  const c = [0];
  for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return { p, c, L: c[c.length - 1] || 1, a };
};
const atPPath = (q: PPath, d: number): number[] => {
  d = ((d % q.L) + q.L) % q.L;
  let i = 1; while (i < q.c.length - 1 && q.c[i] < d) i++;
  const a = q.p[i - 1], b = q.p[i], s = (d - q.c[i - 1]) / (q.c[i] - q.c[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
};
const SL = 40; // lunghezza di ogni simbolo bipolare
const SYMS: Record<string, (g: CanvasRenderingContext2D) => void> = {
  res: (g) => { g.beginPath(); g.rect(0, -6, SL, 12); g.stroke(); },
  ind: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(2, 0); for (let k = 0; k < 3; k++) g.arc(8 + 12 * k, 0, 6, Math.PI, Math.PI * 2); g.lineTo(SL, 0); g.stroke(); },
  cap: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(16, 0); g.moveTo(24, 0); g.lineTo(SL, 0); g.moveTo(16, -10); g.lineTo(16, 10); g.moveTo(24, -10); g.lineTo(24, 10); g.stroke(); },
  dio: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(12, 0); g.moveTo(28, 0); g.lineTo(SL, 0); g.moveTo(12, -8); g.lineTo(12, 8); g.lineTo(28, 0); g.closePath(); g.moveTo(28, -8); g.lineTo(28, 8); g.stroke(); },
  lamp: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.moveTo(30, 0); g.lineTo(SL, 0); g.moveTo(30, 0); g.arc(20, 0, 10, 0, Math.PI * 2); g.moveTo(13, -7); g.lineTo(27, 7); g.moveTo(13, 7); g.lineTo(27, -7); g.stroke(); },
  src: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(9, 0); g.moveTo(31, 0); g.lineTo(SL, 0); g.moveTo(31, 0); g.arc(20, 0, 11, 0, Math.PI * 2); g.moveTo(14, 0); g.quadraticCurveTo(17, -8, 20, 0); g.quadraticCurveTo(23, 8, 26, 0); g.stroke(); },
  sw: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.moveTo(30, 0); g.lineTo(SL, 0); g.moveTo(10, 0); g.lineTo(29, -11); g.stroke(); g.beginPath(); g.arc(10, 0, 2.2, 0, 7); g.arc(30, 0, 2.2, 0, 7); g.stroke(); },
  fuse: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(SL, 0); g.rect(8, -5, 24, 10); g.stroke(); },
  bat: (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(14, 0); g.moveTo(32, 0); g.lineTo(SL, 0); g.moveTo(14, -10); g.lineTo(14, 10); g.moveTo(20, -5); g.lineTo(20, 5); g.moveTo(26, -10); g.lineTo(26, 10); g.moveTo(32, -5); g.lineTo(32, 5); g.stroke(); },
};
const COMPS = ["res", "ind", "cap", "dio", "lamp", "src", "sw", "fuse", "bat"];
const FORMS = ["V = R·I", "P = V·I·cosφ", "XL = 2πfL", "XC = 1/2πfC", "Z = √(R²+X²)", "50 Hz", "230 V", "400 V", "I = Q/t", "Φ = B·S", "e = −dΦ/dt", "W = ½·C·V²", "τ = R·C", "cosφ = P/S", "L1 L2 L3 N PE", "Vmax = √2·Veff", "η = Pu/Pa"];

const drawPanelArt = (g: CanvasRenderingContext2D, W: number, H: number, R: () => number): PScene => {
  const S: PScene = { paths: [], lamps: [], sw: [], waves: [] };
  const WH = "255,255,255", AM = "251,191,36";
  const st = (a: number, am = false) => { g.strokeStyle = g.fillStyle = `rgba(${am ? AM : WH},${a})`; };
  const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const pk = (a: any[]): any => a[Math.floor(R() * a.length)];
  const reg = (p: number[][], a = 1) => { S.paths.push(mkPPath(p, a)); };
  const dot = (x: number, y: number) => { g.beginPath(); g.arc(x, y, 2.8, 0, 7); g.fill(); };
  const txt = (s: string, x: number, y: number, size = 11, a = 0.26) => { st(a); g.font = `${size}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`; g.fillText(s, x, y); };
  g.lineCap = "round"; g.lineJoin = "round";
  // filo da (x1,y1) a (x2,y2) con un componente al centro
  const seg = (x1: number, y1: number, x2: number, y2: number, type?: string) => {
    const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1);
    if (!type || L < SL + 12) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); return; }
    const s = (L - SL) / 2;
    g.save(); g.translate(x1, y1); g.rotate(a);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0); g.moveTo(s + SL, 0); g.lineTo(L, 0); g.stroke();
    g.translate(s, 0); SYMS[type](g); g.restore();
    const cx = x1 + Math.cos(a) * (s + SL / 2), cy = y1 + Math.sin(a) * (s + SL / 2);
    if (type === "lamp" || type === "src") S.lamps.push([cx, cy]);
    if (type === "sw") S.sw.push([x1 + Math.cos(a) * (s + 30), y1 + Math.sin(a) * (s + 30)]);
  };
  const gnd = (x: number, y: number) => {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8);
    g.moveTo(x - 9, y + 8); g.lineTo(x + 9, y + 8); g.moveTo(x - 6, y + 12); g.lineTo(x + 6, y + 12); g.moveTo(x - 3, y + 16); g.lineTo(x + 3, y + 16); g.stroke();
  };
  const tag = () => pk(["R", "C", "L", "D", "V", "T", "Q", "F"]) + ri(1, 9);

  // 1) anello RLC con eventuale ramo in parallelo
  const loop = (x: number, y: number, w: number, h: number) => {
    const x2 = x + w, y2 = y + h; st(0.22); g.lineWidth = 1.5;
    seg(x, y, x2, y, pk(COMPS)); seg(x2, y, x2, y2, pk(COMPS)); seg(x2, y2, x, y2, pk(COMPS)); seg(x, y2, x, y, pk(COMPS));
    reg([[x, y], [x2, y], [x2, y2], [x, y2], [x, y]]);
    if (R() < 0.6 && w >= 150) {
      const mx = Math.round((x + w / 2) / 10) * 10; seg(mx, y, mx, y2, pk(COMPS)); dot(mx, y); dot(mx, y2); reg([[mx, y], [mx, y2]]);
    }
    dot(x, y); dot(x2, y2); txt(tag(), x + 4, y - 9);
  };
  // 2) quadro elettrico: sbarra e partenze con interruttori verso terra
  const bus = (x: number, y: number, w: number, h: number) => {
    const by = y + 14; st(0.26); g.lineWidth = 3.4; seg(x, by, x + w, by); reg([[x, by], [x + w, by]], 0.8);
    g.lineWidth = 1.5; st(0.22);
    const n = Math.max(2, Math.floor(w / 58));
    for (let i = 0; i < n; i++) {
      const fx = Math.round((x + 26 + (i * (w - 52)) / (n - 1)) / 2) * 2, fy = y + h - 22 - ri(0, 14);
      dot(fx, by); seg(fx, by, fx, fy, pk(["sw", "fuse", "res", "lamp", "ind"])); gnd(fx, fy); reg([[fx, by], [fx, fy]]);
    }
    txt("L1 L2 L3", x, by - 9);
  };
  // 3) trasformatore monofase con sorgente e carico
  const trafo = (x: number, y: number, w: number, h: number) => {
    const cx = x + w / 2, cy = y + h / 2, px = cx - 14, sx = cx + 14, ty = y + 8, by = y + h - 8, lx = x + 10, rx = x + w - 10;
    st(0.22); g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const yy = cy - 21 + 14 * k;
      g.beginPath(); g.arc(px, yy, 7, Math.PI / 2, Math.PI * 1.5); g.stroke();
      g.beginPath(); g.arc(sx, yy, 7, -Math.PI / 2, Math.PI / 2); g.stroke();
    }
    g.beginPath(); g.moveTo(cx - 3, cy - 31); g.lineTo(cx - 3, cy + 31); g.moveTo(cx + 3, cy - 31); g.lineTo(cx + 3, cy + 31); g.stroke();
    seg(px, cy - 28, px, ty); seg(px, ty, lx, ty); seg(lx, ty, lx, by, "src"); seg(lx, by, px, by); seg(px, by, px, cy + 28);
    seg(sx, cy - 28, sx, ty); seg(sx, ty, rx, ty); seg(rx, ty, rx, by, pk(["lamp", "res", "ind", "lamp"])); seg(rx, by, sx, by); seg(sx, by, sx, cy + 28);
    reg([[px, cy - 28], [px, ty], [lx, ty], [lx, by], [px, by], [px, cy + 28]]);
    reg([[sx, cy + 28], [sx, by], [rx, by], [rx, ty], [sx, ty], [sx, cy - 28]]);
    txt(pk(["230/12 V", "400/230 V", "20kV/400V", "1:10"]), cx - 28, y - 2);
  };
  // 4) tre tensioni sfasate di 120° (le onde vengono disegnate in animazione)
  const phases = (x: number, y: number, w: number, h: number) => {
    st(0.2); g.lineWidth = 1.2; g.strokeRect(x, y, w, h);
    g.lineWidth = 1; st(0.12);
    g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2);
    for (let tx = x + 20; tx < x + w; tx += 20) { g.moveTo(tx, y); g.lineTo(tx, y + 5); g.moveTo(tx, y + h - 5); g.lineTo(tx, y + h); }
    g.stroke();
    S.waves.push([x, y, w, h, R() * 6.28]); txt("L1 L2 L3 · 50 Hz", x + 2, y + h + 13);
  };
  // 5) linea ad alta tensione: tralicci a traliccio e conduttori con catenaria
  const pylon = (x: number, y: number, w: number, h: number) => {
    const n = w > 240 ? 3 : 2, th = Math.min(h - 16, 150), y2 = y + h, tops = y2 - th, xs: number[] = [];
    st(0.2); g.lineWidth = 1.3;
    for (let i = 0; i < n; i++) {
      const tx = Math.round(x + 22 + (i * (w - 44)) / (n - 1)); xs.push(tx);
      g.beginPath(); g.moveTo(tx - 13, y2); g.lineTo(tx - 3, tops); g.moveTo(tx + 13, y2); g.lineTo(tx + 3, tops);
      const lv = 6;
      for (let k = 0; k <= lv; k++) {
        const yy = y2 - (th * k) / lv, hw = 13 - (10 * k) / lv;
        g.moveTo(tx - hw, yy); g.lineTo(tx + hw, yy);
        if (k < lv) { const y3 = y2 - (th * (k + 1)) / lv, hw2 = 13 - (10 * (k + 1)) / lv; g.moveTo(tx - hw, yy); g.lineTo(tx + hw2, y3); }
      }
      g.moveTo(tx - 18, tops + 8); g.lineTo(tx + 18, tops + 8); g.moveTo(tx - 14, tops + 26); g.lineTo(tx + 14, tops + 26); g.stroke();
      [[-18, 8], [18, 8], [-14, 26], [14, 26]].forEach(([ox, oy]) => { g.beginPath(); g.moveTo(tx + ox, tops + oy); g.lineTo(tx + ox, tops + oy + 5); g.stroke(); });
    }
    st(0.2); g.lineWidth = 1.1;
    for (let i = 0; i + 1 < n; i++) {
      [[-18, 13], [18, 13], [-14, 31], [14, 31]].forEach(([ox, oy], j) => {
        const ax = xs[i] + ox, bx = xs[i + 1] + ox, ay = tops + oy, sag = 12 + (j > 1 ? 4 : 0), pts: number[][] = [];
        g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, ay + sag * 2, bx, ay); g.stroke();
        for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([ax + (bx - ax) * u, ay + sag * 4 * u * (1 - u)]); }
        reg(pts, 0.9);
      });
    }
    txt(pk(["380 kV", "132 kV", "220 kV", "20 kV"]), x + 2, y + 10);
  };
  // 6) ponte di Graetz: quattro diodi
  const bridge = (x: number, y: number, w: number, h: number) => {
    const d = Math.min(56, Math.floor((h - 36) / 2)), cx = x + w / 2, cy = y + h / 2;
    st(0.22); g.lineWidth = 1.5;
    seg(cx - d, cy, cx, cy - d, "dio"); seg(cx + d, cy, cx, cy - d, "dio"); seg(cx, cy + d, cx - d, cy, "dio"); seg(cx, cy + d, cx + d, cy, "dio");
    seg(cx - d, cy, x + 8, cy); seg(cx + d, cy, x + w - 8, cy); seg(cx, cy - d, cx, y + 6); seg(cx, cy + d, cx, y + h - 6);
    dot(cx - d, cy); dot(cx + d, cy); dot(cx, cy - d); dot(cx, cy + d);
    reg([[cx - d, cy], [cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]]); reg([[x + 8, cy], [cx - d, cy]], 0.8); reg([[cx, y + h - 6], [cx, cy + d]], 0.8);
    txt("~", x + 10, cy - 7, 14); txt("~", x + w - 20, cy - 7, 14); txt("+", cx + 7, y + 14, 13); txt("−", cx + 7, y + h - 6, 13);
  };
  // 7) motore trifase alimentato da tre linee con sezionatori
  const motor = (x: number, y: number, w: number, h: number) => {
    const cy = y + h / 2, mx = x + w - 36, r = 27; st(0.22); g.lineWidth = 1.5;
    g.beginPath(); g.arc(mx, cy, r, 0, Math.PI * 2); g.stroke();
    txt("M", mx - 8, cy + 1, 17, 0.3); txt("3~", mx - 7, cy + 15, 11, 0.3);
    [-15, 0, 15].forEach((o, i) => {
      const ex = mx - Math.sqrt(r * r - o * o); seg(x, cy + o, ex, cy + o, "sw"); reg([[x, cy + o], [ex, cy + o]]);
      txt("L" + (i + 1), x - 1, cy + o - 4, 9, 0.24);
    });
  };

  // posizionamento a caso senza sovrapposizioni
  const boxes: number[][] = [];
  const free = (x: number, y: number, w: number, h: number, m = 18) => x >= 12 && y >= 12 && x + w <= W - 12 && y + h <= H - 12 && boxes.every((b) => x > b[0] + b[2] + m || x + w + m < b[0] || y > b[1] + b[3] + m || y + h + m < b[1]);
  const MOTIFS: any[] = [[loop, 170, 270, 100, 150, 3], [bus, 180, 270, 120, 170, 2], [trafo, 190, 250, 110, 150, 2], [phases, 170, 240, 80, 110, 2], [pylon, 210, 300, 130, 190, 2], [bridge, 150, 200, 140, 170, 2], [motor, 190, 250, 90, 110, 2]];
  const used = MOTIFS.map(() => 0); // quante copie di ogni schema: niente ripetizioni a tappeto
  if (W > 220 && H > 220) {
    for (let i = 0; i < 700; i++) {
      const mi = Math.floor(R() * MOTIFS.length), m = MOTIFS[mi]; if (used[mi] >= m[5]) continue;
      const w = ri(m[1], m[2]), h = ri(m[3], m[4]);
      const x = Math.round(ri(12, Math.max(12, W - w - 12)) / 10) * 10, y = Math.round(ri(12, Math.max(12, H - h - 12)) / 10) * 10;
      if (!free(x, y, w, h)) continue;
      used[mi]++; boxes.push([x - 2, y - 14, w + 4, h + 30]); m[0](x, y, w, h);
    }
    // piste ortogonali negli spazi rimasti
    const inBox = (x: number, y: number) => x < 12 || y < 12 || x > W - 12 || y > H - 12 || boxes.some((b) => x > b[0] - 10 && x < b[0] + b[2] + 10 && y > b[1] - 10 && y < b[1] + b[3] + 10);
    const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], G = 20, nT = Math.floor((W * H) / 14000);
    g.lineWidth = 1.2;
    for (let i = 0; i < nT; i++) {
      let x = Math.round((R() * W) / G) * G, y = Math.round((R() * H) / G) * G, d = ri(0, 3); if (inBox(x, y)) continue;
      const pts = [[x, y]];
      for (let s = ri(2, 5); s > 0; s--) {
        const n = ri(2, 7); let ok = 0;
        for (let k = 1; k <= n; k++) { if (inBox(x + DX[d] * k * G, y + DY[d] * k * G)) break; ok = k; }
        if (!ok) break;
        x += DX[d] * ok * G; y += DY[d] * ok * G; pts.push([x, y]); d = (d + (R() < 0.5 ? 1 : 3)) % 4;
      }
      if (pts.length < 2) continue;
      st(0.1); g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      [pts[0], pts[pts.length - 1]].forEach(([px, py]) => { g.beginPath(); g.arc(px, py, 3.4, 0, 7); g.stroke(); });
      if (R() < 0.45) reg(pts, 0.55);
    }
    // formule e grandezze nei vuoti
    const deck: string[] = [];
    const peekForm = (): string => { // mazzo rimescolato: ogni formula compare una sola volta
      if (!deck.length) { const a = FORMS.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); const tmp = a[k]; a[k] = a[j]; a[j] = tmp; } deck.push(...a); }
      return deck[deck.length - 1];
    };
    for (let i = 0, nF = Math.min(FORMS.length, Math.floor((W * H) / 52000)), tries = 0; i < nF && tries < 200; tries++) {
      const s = peekForm(), w = s.length * 7 + 6, x = ri(14, Math.max(14, W - w - 14)), y = ri(30, Math.max(30, H - 30));
      if (!free(x, y - 14, w, 22, 10)) continue;
      deck.pop();
      boxes.push([x, y - 14, w, 22]); txt(s, x, y, 12, 0.22); i++;
    }
  }
  return S;
};

// disegna ciò che si muove: cariche nei fili, bagliori delle lampade, onde trifase, scintille sugli interruttori
const animPanelArt = (g: CanvasRenderingContext2D, S: PScene, t: number, speed: number, moving: boolean) => {
  g.lineCap = "round";
  if (moving) {
    S.paths.forEach((q, qi) => {
      const n = Math.max(1, Math.round(q.L / 130)), v = 44 + (qi % 5) * 9;
      for (let k = 0; k < n; k++) {
        const d0 = t * v * speed + (k / n) * q.L + qi * 37;
        for (let j = 0; j < 4; j++) {
          const p = atPPath(q, d0 - j * 6);
          g.fillStyle = `rgba(251,191,36,${(0.92 - j * 0.22) * q.a})`;
          g.beginPath(); g.arc(p[0], p[1], 2.5 - j * 0.38, 0, 7); g.fill();
        }
      }
    });
    S.lamps.forEach((p, i) => {
      const a = 0.12 + 0.1 * Math.sin(t * speed * 2.2 + i * 1.7), gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 28);
      gr.addColorStop(0, `rgba(251,191,36,${a * 2})`); gr.addColorStop(1, "rgba(251,191,36,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], 28, 0, 7); g.fill();
    });
    S.sw.forEach((p, i) => {
      const per = 5 + (i % 5) * 2.3, ph = (t * speed + i * 1.9) % per; if (ph > 0.35) return;
      const a = 1 - ph / 0.35, seed = Math.floor((t * speed + i * 1.9) / per) * 7 + i;
      g.strokeStyle = `rgba(255,236,170,${a})`; g.lineWidth = 1.3; g.beginPath();
      for (let k = 0; k < 6; k++) {
        const an = Math.sin(seed * 12.9898 + k * 78.233) * 6.28, l = 6 + ((Math.sin(seed * 3.1 + k * 5.7) + 1) * 5);
        g.moveTo(p[0], p[1]); g.lineTo(p[0] + Math.cos(an) * l * 0.5 + Math.sin(an * 3) * 2, p[1] + Math.sin(an) * l * 0.5); g.lineTo(p[0] + Math.cos(an) * l, p[1] + Math.sin(an) * l);
      }
      g.stroke();
    });
  }
  S.waves.forEach((w) => {
    g.lineWidth = 1.4;
    for (let ph = 0; ph < 3; ph++) {
      g.strokeStyle = ph === 2 ? "rgba(251,191,36,.62)" : ph === 1 ? "rgba(190,255,240,.5)" : "rgba(255,255,255,.5)";
      g.beginPath();
      for (let x = 4; x <= w[2] - 4; x += 3) {
        const y = w[1] + w[3] / 2 + Math.sin((x / (w[2] / 2.2)) * Math.PI * 2 - (moving ? t * speed * 3 : 0) + ph * 2.094 + w[4]) * (w[3] / 2 - 8);
        if (x === 4) g.moveTo(w[0] + x, y); else g.lineTo(w[0] + x, y);
      }
      g.stroke();
    }
  });
};

const PanelArt = ({ art, anim, speed = 1, fps = 30 }: { art: boolean; anim: boolean; speed?: number; fps?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const seed = useRef(Math.floor(Math.random() * 2147483647)); // nuovo disegno a ogni apertura
  const pr = useRef({ speed, fps }); pr.current = { speed, fps }; // letti a ogni frame, senza rigenerare il disegno
  useEffect(() => {
    const cv = ref.current; if (!art || !cv) return;
    const host = cv.parentElement as HTMLElement | null, ctx = cv.getContext("2d"); if (!host || !ctx) return;
    const stat = document.createElement("canvas"), sg = stat.getContext("2d"); if (!sg) return;
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches), moving = anim && !reduce;
    let W = 0, H = 0, S: PScene | null = null, timer = 0;
    const t0 = performance.now();
    const paint = (t: number) => { if (!S) return; ctx.clearRect(0, 0, W, H); ctx.drawImage(stat, 0, 0, W, H); animPanelArt(ctx, S, t, pr.current.speed, moving); };
    const build = () => {
      const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
      if (S && Math.abs(w - W) < 24 && Math.abs(h - H) < 24) return;
      W = w; H = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = stat.width = Math.round(W * dpr); cv.height = stat.height = Math.round(H * dpr);
      sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.clearRect(0, 0, W, H); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = drawPanelArt(sg, W, H, mulberry(seed.current));
      paint((performance.now() - t0) / 1000);
    };
    const frame = (ts: number) => {
      if (!S) return;
      paint((performance.now() - t0) / 1000);
    };
    build();
    const stop = moving ? renderLoop(frame, () => pr.current.fps || 30, cv) : () => {};
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => { clearTimeout(timer); timer = window.setTimeout(build, 150); }) : null; ro?.observe(host);
    return () => { stop(); clearTimeout(timer); ro?.disconnect(); };
  }, [art, anim]);
  return art ? <canvas ref={ref} className="pnl-art" aria-hidden="true" /> : null;
};

const Shape = ({ s }: any) => {
  const p = s.points; if (!p?.length) return null;
  const a = p[0], b = p[p.length - 1];
  const c: any = { stroke: s.color, strokeWidth: s.size || 3, strokeOpacity: s.opacity ?? 1, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  if (s.tool === "line") return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...c} />;
  if (s.tool === "rect" || s.tool === "ellipse") {
    const f = s.filled ? { fill: s.color, fillOpacity: s.opacity ?? 1 } : {};
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    return s.tool === "rect" ? <rect x={x} y={y} width={w} height={h} {...c} {...f} /> : <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...c} {...f} />;
  }
  const pts = p.map((q: any) => `${q.x},${q.y}`).join(" ");
  return s.tool === "fill" ? <polygon points={pts} {...c} fill={s.color} fillOpacity={s.opacity ?? 1} /> : <polyline points={pts} {...c} />;
};
const Drawing = ({ strokes, w, h, className = "" }: any) => (
  <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMinYMin meet">
    {(strokes || []).map((s: any, i: number) => <Shape key={i} s={s} />)}
  </svg>
);

// --- APP ANDROID (APK) ---
// Il link all'APK si trova su Firestore, nel documento  app_config/android  con i campi:
//   apkUrl  (testo, obbligatorio)  link https diretto al file .apk
//   version (testo, facoltativo)   es. "1.0.3", mostrato sul pulsante
// Per aggiornare l'app basta cambiare quel documento dalla console Firebase: nessun nuovo deploy del sito.
// Se il documento non esiste (o non è leggibile) il pulsante resta nascosto.
let apkCache: { url: string; version?: string } | null | undefined;
const loadApk = async () => {
  if (apkCache !== undefined) return apkCache;
  try {
    if (!db) return null;
    const s = await getDoc(doc(db, "app_config", "android"));
    const d: any = s.exists() ? s.data() : null;
    const url = d && typeof d.apkUrl === "string" ? d.apkUrl.trim() : "";
    apkCache = /^https:\/\//i.test(url) ? { url, version: d.version ? String(d.version).trim() : undefined } : null;
    return apkCache;
  } catch (e) {
    console.warn("APK: impossibile leggere app_config/android (controlla le regole di Firestore)", e);
    return null; // niente cache: riprova al prossimo montaggio (es. dopo il login)
  }
};
// Non ha senso proporre l'APK a chi usa già l'app installata o a chi è su iPhone/iPad
const skipApk = () => {
  try {
    const w: any = window, ua = navigator.userAgent;
    return !!w.Capacitor?.isNativePlatform?.() || window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true || /iPad|iPhone|iPod/.test(ua) || /; wv\)/.test(ua);
  } catch { return false; }
};
const ApkDownload = ({ compact, divider, className = "" }: { compact?: boolean; divider?: boolean; className?: string }) => {
  const [info, setInfo] = useState<{ url: string; version?: string } | null>(null);
  useEffect(() => {
    let on = true;
    loadApk().then((r) => { if (on && r) setInfo(r); });
    return () => { on = false; };
  }, []);
  if (!info || skipApk()) return null;
  return (
    <div className={`${divider ? "mt-6 pt-6" : ""} ${className}`} style={divider ? { borderTop: "1px solid var(--ln)" } : undefined}>
      <a href={info.url} download rel="noopener noreferrer" className={`bt pri w-full no-underline ${compact ? "" : "py-3"}`} title={info.version ? `Versione ${info.version}` : undefined}>
        <Download size={16} />{compact ? "Scarica app Android" : `Scarica l'app Android${info.version ? ` · v${info.version}` : ""}`}
      </a>
      {!compact && <p className="mu text-xs mt-2 text-center">Dopo il download apri il file .apk e, se richiesto, consenti l'installazione da questa fonte.</p>}
    </div>
  );
};



const mKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const mLabel = (k: string) => { const [y, m] = k.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" }); };

const Stars = ({ v = 0, onSet, size = 16 }: any) => {
  const El: any = onSet ? "button" : "span";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <El key={n} {...(onSet ? { type: "button", title: `${n} su 5`, onClick: (e: any) => { e.stopPropagation(); onSet(v === n ? 0 : n); } } : {})} className="transition-transform hover:scale-125 inline-flex">
          <Star key={n <= v ? "on" : "off"} size={size} className={n <= v ? "st-on" : ""} style={n <= v ? { fill: "var(--am)", color: "var(--am)", ["--n" as any]: n } : { color: "var(--mu)", opacity: 0.35 }} />
        </El>
      ))}
    </div>
  );
};

// mantiene montato un elemento il tempo necessario per la sua animazione d'uscita
let LITE = false;
const usePresence = (v: any, ms = 320): [any, boolean] => {
  const [keep, setKeep] = useState<any>(v || null);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (v) { setKeep(v); setOut(false); return; }
    if (!keep) return;
    if (LITE) { setKeep(null); return; }
    setOut(true);
    const t = setTimeout(() => { setKeep(null); setOut(false); }, ms / GSPD);
    return () => clearTimeout(t);
  }, [v]);
  return [v || keep || null, out && !v];
};

const Pop = ({ label, trigger, cls = "bt", wrap = "", right, tour, children }: any) => {
  const [o, setO] = useState(false);
  const [show, out] = usePresence(o ? 1 : null, 240);
  return (
    <div className={`relative ${wrap}`}>
      <button type="button" className={cls} onClick={() => setO(!o)} title={label} aria-label={label} data-tour={tour}>{trigger}</button>
      {show && (<>
        <div className={`cpov ${out ? "out" : ""}`} onClick={() => setO(false)} />
        <div className={`cp pn p-5 ${right ? "cp-r" : ""} ${out ? "out" : ""}`}>
          <div className="flex items-center justify-between mb-4"><span className="hd font-bold text-lg">{label}</span><button type="button" className="bt !p-2 md:hidden" onClick={() => setO(false)} aria-label="Chiudi"><X size={16} /></button></div>
          {typeof children === "function" ? children(() => setO(false)) : children}
        </div>
      </>)}
    </div>
  );
};
const Swatches = ({ value, onPick, cols = "grid-cols-7" }: any) => (
  <div className={`grid ${cols} gap-3`}>
    {INK_COLORS.map((c, i) => <button type="button" key={c.id} aria-label={c.name} title={c.name} onClick={() => onPick(c.id)} className="sw aspect-square w-full rounded-full" style={{ ["--i" as any]: i, background: c.id, boxShadow: value === c.id ? `0 0 0 2px var(--pn),0 0 0 4px ${c.id}` : "inset 0 0 0 1px rgba(128,128,128,.5)" }} />)}
  </div>
);
// on = formattazione attiva (pulsante pieno); open = pannello aperto (bordo evidenziato); badge = piccolo indicatore (es. colore corrente)
const TB = ({ on, fn, icon: Icon, label, open, badge }: any) => (
  <button type="button" title={label} aria-label={label} aria-pressed={on === undefined ? undefined : !!on} aria-expanded={open === undefined ? undefined : !!open} data-open={open ? "true" : undefined} onClick={fn} className={`bt tb !min-w-0 !px-0 ${on ? "on" : ""}`}><Icon size={18} />{badge}</button>
);
const AaIcon = ({ size = 18 }: any) => <span aria-hidden="true" style={{ fontSize: size * 0.95, fontWeight: 800, lineHeight: 1, letterSpacing: "-.02em" }}>Aa</span>;
// dimensioni del testo: "n" = normale (nessuno stile salvato)
const SIZES = [
  { id: "s", em: 0.8, px: 12, label: "Piccolo" },
  { id: "n", em: 1, px: 16, label: "Normale" },
  { id: "l", em: 1.35, px: 20, label: "Grande" },
  { id: "xl", em: 1.8, px: 25, label: "Enorme" },
];
const rgbHex = (c: string) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ""); return m ? "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("").toUpperCase() : ""; };

const BANNERS = [
  { id: "teal", g: "linear-gradient(135deg,#17C3AE,#0A4F49)" }, { id: "amber", g: "linear-gradient(135deg,#FBBF24,#C2410C)" },
  { id: "indigo", g: "linear-gradient(135deg,#818CF8,#1E1B4B)" }, { id: "rose", g: "linear-gradient(135deg,#FB7185,#881337)" },
  { id: "sky", g: "linear-gradient(135deg,#38BDF8,#1E3A8A)" }, { id: "slate", g: "linear-gradient(135deg,#94A3B8,#0F172A)" },
];
const AV = ["#0F8B7A", "#C2410C", "#4F46E5", "#DB2777", "#0284C7", "#CA8A04", "#7E22CE"];
// iniziali di nome e cognome ("Mario Rossi" → "MR"); con una sola parola, le prime due lettere
const initials = (name: string) => { const w = name.trim().split(/\s+/).filter(Boolean); return w.length > 1 ? Array.from(w[0])[0] + Array.from(w[w.length - 1])[0] : Array.from(w[0] || "?").slice(0, 2).join(""); };
const Avatar = ({ p, name = "?", size = 40 }: any) => {
  const h = Array.from(String(name)).reduce((a, c) => a + c.charCodeAt(0), 0);
  return p?.avatar
    ? <img src={p.avatar} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className="rounded-full shrink-0 inline-flex items-center justify-center font-bold text-white uppercase" style={{ width: size, height: size, background: AV[h % AV.length], fontSize: size * 0.4 }}>{initials(String(name))}</span>;
};
const avatarFrom = (file: File): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = (ev: any) => {
    const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 256; const m = Math.min(im.width, im.height); c.getContext("2d")?.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 256, 256); res(c.toDataURL("image/jpeg", 0.8)); };
    im.onerror = rej; im.src = ev.target.result;
  };
  r.onerror = rej; r.readAsDataURL(file);
});

// copertina del profilo da un'immagine: scalata e compressa per stare nei limiti di Firestore (come l'avatar)
const bannerFrom = (file: File): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = (ev: any) => {
    const im = new Image();
    im.onload = () => {
      const draw = (W: number) => {
        const k = W / im.width, H = Math.min(Math.round(im.height * k), Math.round(W * 0.67)), sh = Math.min(im.height, H / k);
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const g = c.getContext("2d"); if (!g) return "";
        g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
        g.drawImage(im, 0, Math.max(0, (im.height - sh) / 2), im.width, sh, 0, 0, W, H);
        let q = 0.82, out = c.toDataURL("image/jpeg", q);
        while (out.length > 300000 && q > 0.45) { q -= 0.07; out = c.toDataURL("image/jpeg", q); }
        return out;
      };
      let W = Math.min(1200, im.width), out = draw(W);
      while (out.length > 380000 && W > 480) { W = Math.round(W * 0.8); out = draw(W); }
      if (!out || out.length > 380000) rej(new Error("immagine troppo pesante")); else res(out);
    };
    im.onerror = rej; im.src = ev.target.result;
  };
  r.onerror = rej; r.readAsDataURL(file);
});

// sfx: tick al passaggio, suono del cambio di sezione, caricamento del gioco e jingle della presentazione (sound.ts)
const DEF = { level: "full", fx: true, glow: true, aurora: true, intro: true, d3: true, sfx: true, sfxVol: 1, music: false, musicVol: 0.35, vibrate: true, text: 1, vib: 1 };

// Modalità "Personalizzato": ogni effetto si accende o spegne da solo e ogni intensità si regola a piacere.
// I valori qui sotto sono quelli del preset "Spettacolo".
const CDEF: any = {
  motion: true,                                                        // animazioni e transizioni dell'interfaccia
  pulses: true, sparks: true, aurora: true, art: true, parallax: true, prog: true, // sfondo
  rain: true, scan: true,                                              // riquadro iniziale
  glow: true, tilt: true, ripple: true, lift: true,                    // pulsanti e card
  titles: true, logo: true, reveal: true, pages: true, theme: true, blur: true,    // ingressi e transizioni
  d3: true,                                                            // logo, titoli e terminale in 3D
  spd: 1, dens: 14, rainD: 1, auroraI: 1, artI: 1, glowI: 1, tiltI: 1, fps: 30,    // intensità
};
const OFF: any = { motion: false, pulses: false, sparks: false, aurora: false, art: false, parallax: false, prog: false, rain: false, scan: false, glow: false, tilt: false, ripple: false, lift: false, titles: false, logo: false, reveal: false, pages: false, theme: false, blur: false, d3: false };
const CBASE: any = {
  full: { ...CDEF },
  mid: { ...CDEF, pulses: false, sparks: false, rain: false, glow: false, tilt: false, ripple: false, aurora: false },
  lite: { ...CDEF, ...OFF },
};
const CBOOL = Object.keys(CDEF).filter((k) => typeof CDEF[k] === "boolean");
// configurazione grafica effettiva: i preset vengono tradotti negli stessi interruttori del "Personalizzato"
const resolveG = (o: any): any => {
  if (o.level === "custom") {
    const c = { ...CDEF, ...(o.c || {}) };
    return { ...c, lite: false, nomotion: !c.motion };
  }
  const lite = o.level === "lite", on = o.level !== "lite" && o.level !== "mid";
  return {
    ...CDEF, lite, nomotion: lite, motion: !lite,
    pulses: on && !!o.fx, sparks: on && !!o.fx, rain: on && !!o.fx,
    glow: on && !!o.glow, tilt: on && !!o.glow, ripple: on && !!o.glow,
    aurora: on && !!o.aurora,
    art: !lite, parallax: !lite, prog: !lite, theme: !lite, blur: !lite,
    titles: !lite && !!o.intro, logo: !lite && !!o.intro, reveal: !lite && !!o.intro,
    d3: !lite && o.d3 !== false,
  };
};
let GSPD = 1;  // velocità globale delle animazioni (serve anche ai timer fuori da React)
// prima apertura della sessione: l'ingresso nel Circuito si vede per intero una volta sola, poi le pagine entrano in modo asciutto
const FIRST = (() => { try { const s = sessionStorage.getItem("circuito:ingresso"); sessionStorage.setItem("circuito:ingresso", "1"); return !s; } catch { return true; } })();
const NAV_ORDER = ["home", "write", "my_pages", "read", "podio", "authors", "profile"];

const Scramble = ({ text, on }: any) => {
  const [t, setT] = useState(text);
  useEffect(() => {
    if (!on) { setT(text); return; }
    const chars = "01/|<>_#=+*"; let f = 0; const N = 20;
    const id = setInterval(() => { f++; setT(text.split("").map((c: string, i: number) => (c === " " || i < (f / N) * text.length ? c : chars[Math.floor(Math.random() * chars.length)])).join("")); if (f >= N) { clearInterval(id); setT(text); } }, Math.max(8, Math.round(32 / GSPD)));
    return () => clearInterval(id);
  }, [text, on]);
  return <>{t}</>;
};

const FX = ({ dark, g }: { dark: boolean; g: any }) => {
  const bg = useRef<HTMLCanvasElement>(null);
  const fg = useRef<HTMLCanvasElement>(null);
  const gr = useRef(g); gr.current = g; // le impostazioni si leggono a ogni frame: cambiarle non riavvia l'animazione
  useEffect(() => {
    const a = bg.current, b = fg.current; if (!a || !b) return;
    const ca = a.getContext("2d")!, cb = b.getContext("2d")!;
    const G = 48, dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.25 : 1.5);
    let W = 0, H = 0;
    const fit = () => { W = window.innerWidth; H = window.innerHeight; [a, b].forEach((c) => { c.width = W * dpr; c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px"; c.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0); }); };
    fit(); window.addEventListener("resize", fit);
    const pulses: any[] = [], sparks: any[] = [];
    const spawn = (x = Math.random() * W, y = Math.random() * H, once = false) => { const h = Math.random() < 0.5, s = Math.random() < 0.5 ? 1 : -1; pulses.push({ x: Math.round(x / G) * G, y: Math.round(y / G) * G, dx: h ? s : 0, dy: h ? 0 : s, t: [], n: 0, max: 160 + Math.random() * 240, am: Math.random() < 0.25, once }); };
    const down = (e: PointerEvent) => {
      if (gr.current.sparks) {
        for (let i = 0; i < 16; i++) { const an = (i / 16) * Math.PI * 2, v = 2 + Math.random() * 3.5; sparks.push({ x: e.clientX, y: e.clientY, vx: Math.cos(an) * v, vy: Math.sin(an) * v, l: 1 }); }
        sparks.push({ x: e.clientX, y: e.clientY, r: 4, l: 1, ring: true });
      }
      if (gr.current.pulses) spawn(e.clientX, e.clientY, true); // l'impulso nato dal tocco si spegne da solo
    };
    window.addEventListener("pointerdown", down, { passive: true });
    const frame = (ts: number) => {
      const cfg = gr.current;
      const c = dark ? "45,212,191" : "15,139,122";
      ca.clearRect(0, 0, W, H); cb.clearRect(0, 0, W, H); ca.lineWidth = 1.6; ca.lineCap = "round";
      // numero di impulsi voluto (su schermi piccoli la metà): si aggiunge o si toglie senza riavviare nulla
      const want = cfg.pulses ? Math.max(1, Math.round(cfg.dens * (W < 600 ? 0.5 : 1))) : 0;
      let nb = 0; for (const q of pulses) if (!q.once) nb++;
      for (; nb < want; nb++) spawn();
      for (; nb > want; nb--) { const k = pulses.findIndex((q) => !q.once); if (k >= 0) pulses.splice(k, 1); }
      if (!cfg.pulses) pulses.length = 0;
      const steps = Math.max(1, Math.round(2 * (cfg.spd || 1)));
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        for (let k = 0; k < steps; k++) {
          p.x += p.dx * 2; p.y += p.dy * 2;
          if (p.x % G === 0 && p.y % G === 0 && Math.random() < 0.3) { if (p.dx) { p.dx = 0; p.dy = Math.random() < 0.5 ? 1 : -1; } else { p.dy = 0; p.dx = Math.random() < 0.5 ? 1 : -1; } }
        }
        p.t.push([p.x, p.y]); if (p.t.length > 22) p.t.shift(); p.n++;
        const col = p.am ? "251,191,36" : c;
        for (let k = 1; k < p.t.length; k++) { ca.strokeStyle = `rgba(${col},${(k / p.t.length) * 0.55})`; ca.beginPath(); ca.moveTo(p.t[k - 1][0], p.t[k - 1][1]); ca.lineTo(p.t[k][0], p.t[k][1]); ca.stroke(); }
        ca.fillStyle = `rgba(${col},.9)`; ca.beginPath(); ca.arc(p.x, p.y, 2.6, 0, 7); ca.fill();
        if (p.n > p.max || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) { pulses.splice(i, 1); if (!p.once) spawn(); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.l -= s.ring ? 0.05 : 0.04;
        if (s.l <= 0) { sparks.splice(i, 1); continue; }
        cb.lineWidth = 2;
        if (s.ring) { s.r += 5; cb.strokeStyle = `rgba(${c},${s.l * 0.7})`; cb.beginPath(); cb.arc(s.x, s.y, s.r, 0, 7); cb.stroke(); }
        else { s.x += s.vx; s.y += s.vy; s.vx *= 0.94; s.vy *= 0.94; cb.strokeStyle = `rgba(251,191,36,${s.l})`; cb.beginPath(); cb.moveTo(s.x, s.y); cb.lineTo(s.x - s.vx * 2.5, s.y - s.vy * 2.5); cb.stroke(); }
      }
    };
    const stop = renderLoop(frame, () => gr.current.fps || 30);
    return () => { stop(); window.removeEventListener("resize", fit); window.removeEventListener("pointerdown", down); };
  }, [dark]);
  return (<>
    <canvas ref={bg} className="fixed inset-0 pointer-events-none" style={{ opacity: 0.8 }} aria-hidden="true" />
    <canvas ref={fg} className="fixed inset-0 pointer-events-none z-[95]" aria-hidden="true" />
  </>);
};

const Sw = ({ on, set, label, hint, off }: any) => (
  <button type="button" role="switch" aria-checked={!!on && !off} disabled={off} onClick={() => set(!on)} className="w-full flex items-center justify-between gap-4 py-3 text-left disabled:opacity-40">
    <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-xs mu">{hint}</span>}</span>
    <span className="relative w-12 h-7 rounded-full shrink-0" style={{ background: on && !off ? "var(--ac)" : "var(--ln)", transition: "background .25s" }}><span className="absolute top-1 w-5 h-5 rounded-full bg-white" style={{ left: on && !off ? 24 : 4, transition: "left .25s var(--ez)" }} /></span>
  </button>
);
// selettore con pillola che scorre (con rimbalzo) sotto l'opzione attiva
const Seg = ({ v, set, items, big, soft, cols }: any) => {
  const n = items.length, idx = Math.max(0, items.findIndex(([id]: any) => id === v));
  const c = cols || n, rows = Math.ceil(n / c), ci = idx % c, ri = Math.floor(idx / c); // "cols" dispone le opzioni su più righe
  return (
    <div className={`seg relative grid gap-1 p-1 rounded-2xl ${soft ? "soft" : ""}`} style={{ background: soft ? "var(--sf)" : "var(--ln)", border: soft ? "1px solid var(--ln)" : undefined, gridTemplateColumns: `repeat(${c},1fr)` }}>
      <span className="seg-ind" style={{ width: `calc((100% - ${8 + (c - 1) * 4}px) / ${c})`, ...(rows > 1 ? { bottom: "auto", height: `calc((100% - ${8 + (rows - 1) * 4}px) / ${rows})` } : {}), transform: `translate(calc(${ci} * (100% + 4px)), calc(${ri} * (100% + 4px)))` }} />
      {items.map(([id, label]: any) => <button type="button" key={String(id)} onClick={(e) => set(id, e)} className={`bt !border-0 !bg-transparent !px-1 ${big ? "" : "!text-xs"} ${v === id ? "seg-on" : "mu"}`}>{label}</button>)}
    </div>
  );
};

// cursore per regolare un valore (velocità, intensità, densità…)
const Rng = ({ label, hint, v, set, min, max, step, fmt }: any) => (
  <label className="block py-2">
    <span className="flex items-baseline justify-between gap-3 text-sm"><span className="font-semibold">{label}</span><span className="mu text-xs tabular-nums shrink-0">{fmt ? fmt(v) : v}</span></span>
    {hint && <span className="block text-xs mu">{hint}</span>}
    <input type="range" className="rng" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} aria-label={label} />
  </label>
);
const Sub = ({ children }: any) => <h5 className="text-[11px] font-bold uppercase tracking-wider mu mt-5 mb-0.5">{children}</h5>;

// numeri che "contano" fino al valore (con easing esponenziale)
const CountUp = ({ v, on, delay = 0 }: any) => {
  const [n, setN] = useState(on ? 0 : v);
  const from = useRef(on ? 0 : v);
  useEffect(() => {
    if (!on || LITE) { setN(v); from.current = v; return; }
    // il conteggio parte quando la sua scheda compare, non prima: i numeri "si caricano" sotto gli occhi
    const a = from.current, t0 = performance.now() + delay / GSPD, D = 900 / GSPD; let raf = 0;
    const step = (t: number) => { const k = Math.max(0, Math.min(1, (t - t0) / D)), e = 1 - Math.pow(1 - k, 4), x = Math.round(a + (v - a) * e); setN(x); from.current = x; if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [v, on]);
  return <>{Number(n).toLocaleString("it-IT")}</>;
};
// caricamento a "segnale" (barre stile equalizzatore)
const Loading = ({ cls = "py-24" }: any) => <div className={`${cls} flex justify-center`} role="status" aria-label="Caricamento"><span className="ldr"><i /><i /><i /><i /><i /></span></div>;

// pioggia di codice del riquadro iniziale, in profondità: le colonne stanno a distanze diverse (quelle vicine sono più grandi,
// più veloci e più luminose, quelle lontane piccole e tenui) e scorrono in parallasse quando muovi il mouse.
// Ogni tanto compare una parola; vicino al puntatore la pioggia accelera e si accende d'ambra.
const HeroRain = ({ on, speed = 1, dens = 1, fps = 30 }: { on: boolean; speed?: number; dens?: number; fps?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const pr = useRef({ speed, dens, fps }); pr.current = { speed, dens, fps }; // letti a ogni frame, senza riavviare la pioggia
  useEffect(() => {
    const cv = ref.current; if (!on || !cv) return;
    const host = cv.parentElement as HTMLElement, ctx = cv.getContext("2d"); if (!host || !ctx) return;
    const GL = "0101010101ABCDEF<>/{}[]=+#", WORDS = ["CIRCUITO", "SCRIVI", "LEGGI", "SCEGLI", "IDEE", "MESE"];
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.25 : 1.5);
    let W = 0, H = 0, cw = 16, lh = 18, last = performance.now();
    let cols: any[] = [];
    const ptr = { x: -999, nx: 0, ny: 0 }, cam = { x: 0, y: 0 };
    const rc = () => GL[Math.floor(Math.random() * GL.length)];
    const mk = (c: any, init: boolean) => {
      c.rows = Math.ceil(H / (lh * c.z)) + 2;
      c.speed = (5 + Math.random() * 11) * (0.45 + c.z * 0.6);
      c.len = 8 + Math.floor(Math.random() * 16);
      c.word = Math.random() < 0.1 ? WORDS[Math.floor(Math.random() * WORDS.length)] : "";
      if (c.word) c.len = Math.max(c.len, c.word.length + 3);
      c.top = c.word ? Math.floor(Math.random() * Math.max(1, c.rows - c.word.length)) : 0;
      c.head = init ? Math.random() * c.rows : -Math.random() * c.rows * 0.6 - 1;
      c.ch = Array.from({ length: c.rows + 2 }, rc);
    };
    const fit = () => {
      W = host.clientWidth; H = host.clientHeight; if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cw = W < 600 ? 14 : 16; lh = W < 600 ? 16 : 18;
      // tre piani di profondità mescolati: lontano (piccolo), medio, vicino (grande); si disegnano dal più lontano
      cols = Array.from({ length: Math.ceil((W + 120) / cw) }, (_, i) => {
        const p = Math.random(), z = p < 0.45 ? 0.45 + Math.random() * 0.2 : p < 0.85 ? 0.75 + Math.random() * 0.25 : 1.25 + Math.random() * 0.4;
        const c: any = { x: i * cw - 60 + Math.random() * 6, z, r: Math.random() }; mk(c, true); return c;
      }).sort((a, b) => a.z - b.z);
    };
    fit();
    const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(host);
    const mv = (e: PointerEvent) => { const r = host.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.nx = (e.clientX - r.left) / r.width - 0.5; ptr.ny = (e.clientY - r.top) / r.height - 0.5; };
    const lv = () => { ptr.x = -999; ptr.nx = 0; ptr.ny = 0; };
    host.addEventListener("pointermove", mv, { passive: true }); host.addEventListener("pointerleave", lv, { passive: true });
    const frame = (ts: number) => {
      if (!W) return;
      const el = ts - last, P = pr.current; last = ts;
      const dt = Math.min(0.1, el / 1000);
      cam.x += (ptr.nx - cam.x) * Math.min(1, dt * 4); cam.y += (ptr.ny - cam.y) * Math.min(1, dt * 4);
      ctx.clearRect(0, 0, W, H); ctx.textBaseline = "top";
      let fz = 0;
      for (const c of cols) {
        if (c.r > P.dens) continue; // densità: solo una parte delle colonne è attiva
        const L = lh * c.z;
        if (c.z !== fz) { fz = c.z; ctx.font = `600 ${Math.round((lh - 4) * c.z)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`; }
        const ox = -cam.x * 70 * (c.z - 0.7), oy = -cam.y * 40 * (c.z - 0.7), px = c.x + ox; // parallasse: i piani vicini si spostano di più
        const d = Math.abs(px + (cw * c.z) / 2 - ptr.x), near = d < 80 ? 1 - d / 80 : 0;
        c.head += c.speed * (1 + near * 1.8) * dt * P.speed;
        if (Math.random() < 0.04) c.ch[Math.floor(Math.random() * c.ch.length)] = rc();
        const h = Math.floor(c.head), base = near > 0.15 ? "251,191,36" : "190,255,240", dim = c.z < 0.7 ? 0.45 : c.z < 1.1 ? 0.85 : 1;
        for (let k = 0; k < c.len; k++) {
          const r = h - k; if (r < 0 || r >= c.rows) continue;
          const wi = c.word ? r - c.top : -1, inW = wi >= 0 && wi < c.word.length, f = 1 - k / c.len, a = f * f * 0.5 * dim;
          ctx.fillStyle = k === 0 ? `rgba(255,255,255,${(0.85 + near * 0.15) * dim})` : inW ? `rgba(251,191,36,${Math.max(a * 1.6, 0.6 * dim)})` : `rgba(${base},${a})`;
          ctx.fillText(inW ? c.word[wi] : c.ch[r], px, r * L + oy);
        }
        if (h - c.len > c.rows) mk(c, false);
      }
    };
    const stop = renderLoop(frame, () => pr.current.fps || 30, cv, () => { last = performance.now(); });
    return () => { stop(); ro?.disconnect(); host.removeEventListener("pointermove", mv); host.removeEventListener("pointerleave", lv); };
  }, [on]);
  return on ? <canvas ref={ref} className="hrain" aria-hidden="true" /> : null;
};

const Reveal = ({ children, delay = 0, className = "", fx = "", style, flip }: any) => {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!("IntersectionObserver" in window)) { setOn(true); return; }
    // basta che una qualunque notifica del gruppo dica "visibile": con [fuori, dentro] insieme la prima non deve nascondere tutto per sempre
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} data-flip={flip} className={`rv ${fx ? `fx-${fx}` : ""} ${on ? "in" : ""} ${className}`} style={{ animationDelay: `${delay}ms`, ["--rd" as any]: `${delay}ms`, ...style }}>{children}</div>;
};

const NotifPanel = ({ list, onRead, onOpen }: any) => {
  const [fresh] = useState<string[]>(() => list.filter((n: any) => !n.letta).map((n: any) => n.id));
  useEffect(() => {
    if (!fresh.length) return;
    const t = setTimeout(() => onRead(fresh), 1400);
    return () => clearTimeout(t);
  }, []);
  if (!list.length) return <p className="mu text-sm">Nessuna notifica per ora. Quando uno dei tuoi scritti riceve un voto lo trovi qui.</p>;
  return (
    <div className="space-y-2 max-h-[55dvh] overflow-y-auto">
      {list.map((n: any) => (
        <button type="button" key={n.id} onClick={onOpen} className="nv w-full text-left rounded-xl p-3 flex gap-3 items-start" style={{ background: fresh.includes(n.id) ? "color-mix(in srgb,var(--ac) 12%,transparent)" : "var(--sf)", border: "1px solid var(--ln)" }}>
          <Award size={18} style={{ color: "var(--am)" }} className="shrink-0 mt-0.5" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">«{n.titolo}»</span><span className="block mu text-xs mb-1.5">Hai ricevuto un voto · {fmtDate(n.timestamp)}</span><Stars v={n.voto} size={16} /></span>
        </button>
      ))}
    </div>
  );
};

export default function App() {
  // auth
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [f, setF] = useState({ email: "", pw: "", name: "", surname: "", newPw: "" });
  const [authMsg, setAuthMsg] = useState<{ t: "err" | "ok"; m: string } | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  // il gioco segreto si apre dal punto toccato, con la schermata di caricamento a tempo col suono (EggPortal)
  const [egg, setEgg] = useState<{ x: number; y: number } | null>(null);
  const eggHome = useTriple((e) => { eggSet(1); eggFlip(e); });
  const eggLogin = useTriple((e) => { if (eggGet() === 2) { eggFlip(e); sound.unlock(); setEgg({ x: e?.clientX ?? window.innerWidth / 2, y: e?.clientY ?? window.innerHeight / 2 }); } });
  // ui
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("circuito:dark") === "1"; } catch { return false; } });
  const [opts, setOpts] = useState<any>(() => { let o: any = {}; try { o = JSON.parse(localStorage.getItem("circuito:opts") || "{}"); } catch {} const red = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; const mobile = !!window.matchMedia?.("(max-width:767px), (pointer:coarse)").matches; return { ...DEF, ...(!o.level ? { level: red ? "lite" : mobile ? "mid" : "full" } : {}), ...o }; });
  const [optOpen, setOptOpen] = useState(false);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width:767px), (pointer:coarse)");
  const resolved = resolveG(opts);
  const G = reducedMotion || resolved.nomotion ? { ...resolved, ...OFF, d3: resolved.d3, nomotion: true } : resolved; // configurazione grafica effettiva (preset o "Personalizzato")
  const lite = G.lite;
  LITE = G.nomotion; GSPD = G.spd; M.off = G.nomotion; M.spd = G.spd;
  const setOpt = (k: string, v: any) => setOpts((o: any) => ({ ...o, [k]: v }));
  const music = useMusic(!!opts.music, opts.musicVol ?? 0.35);
  const setMusic = (on: boolean) => { music.toggle(on); setOpt("music", on); };
  // suoni: sblocco al primo gesto, livello dalle Opzioni, tick su ciò che è interattivo
  const sfxOn = opts.sfx !== false;
  useEffect(() => { sound.installSound(); }, []);
  useEffect(() => { sound.configure(sfxOn, opts.sfxVol ?? 1); }, [sfxOn, opts.sfxVol]);
  useEffect(() => (sfxOn ? sound.bindUiSounds() : undefined), [sfxOn]);
  const setC = (k: string, v: any) => setOpts((o: any) => ({ ...o, level: "custom", c: { ...CDEF, ...(o.c || {}), [k]: v } }));
  // passando a "Personalizzato" la prima volta si parte da ciò che si vede adesso; le volte dopo si ritrova la propria scelta
  const setLevel = (v: string) => setOpts((o: any) => { if (v === "custom" && !o.c) { const g: any = resolveG(o), c: any = {}; Object.keys(CDEF).forEach((k) => { c[k] = g[k]; }); return { ...o, level: v, c }; } return { ...o, level: v }; });
  const baseOn = (p: string) => setOpts((o: any) => ({ ...o, level: "custom", c: { ...CBASE[p] } }));
  const buzz = (p: number | number[]) => { if (!opts.vibrate) return; const k = opts.vib || 1; navigator.vibrate?.(Array.isArray(p) ? p.map((x, i) => (i % 2 ? x : Math.round(x * k))) : Math.round(p * k)); };
  const [tab, setTab] = useState("home");
  // presentazione del primo accesso: una volta per account su questo dispositivo; dalle Opzioni si può rivedere
  const [tour, setTour] = useState<"" | "auto" | "replay">("");
  const [tourHold, setTourHold] = useState(false);
  const [month, setMonth] = useState(() => mKey(Date.now()));
  const [monthFilter, setMonthFilter] = useState("all");
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [unrated, setUnrated] = useState(false);
  const [statoF, setStatoF] = useState("all");
  const [visible, setVisible] = useState(18);
  const [kb, setKb] = useState(false);
  const [profiles, setProfiles] = useState<any>({});
  const [editProf, setEditProf] = useState(false);
  const [pf, setPf] = useState<any>({});
  const [viewProf, setViewProf] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [toast, setToast] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  // Titolare = admin creato a mano dalla console. Il professore entra con un link monouso: sessione anonima, senza email né password.
  const [isOwner, setIsOwner] = useState(false);
  const isProf = !!user?.isAnonymous;
  const [profToken, setProfToken] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const redeemRef = useRef(false);
  // list
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [vals, setVals] = useState<any>({});
  const [valsReady, setValsReady] = useState(false);
  useEffect(() => {
    if (!user || !db || !isAdmin) { setVals({}); setValsReady(false); return; }
    return onSnapshot(collection(db, "valutazioni"), (s: any) => { const m: any = {}; s.forEach((d: any) => { m[d.id] = d.data(); }); setVals(m); setValsReady(true); }, () => {});
  }, [user, isAdmin]);
  // Voto e segnalibro restano privati in valutazioni/{id} (solo admin): l'autore non li legge mai.
  // Il voto viene copiato nello scritto solo allo svelamento; il segnalibro non esce mai da lì.
  // Per l'admin sovrappongo i valori privati a quelli dello scritto; chi non è admin vede solo i voti già svelati.
  const items = useMemo(
    () => (!isAdmin ? rawItems : rawItems.map((t) => {
      const v = vals[t.id];
      if (!v) return t;
      const o = { ...t };
      if (!t.svelato && v.voto != null) o.rating = v.voto;
      if (v.segnalibro != null) o.isStarred = v.segnalibro;
      return o;
    })),
    [rawItems, vals, isAdmin]
  );
  // Migrazione una tantum: i voti non ancora svelati e i segnalibri già dati stanno ancora nello scritto (leggibili dall'autore).
  // Li sposto in valutazioni e li tolgo dallo scritto, appena l'admin apre l'app.
  const migTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!db || !isAdmin || !valsReady) return;
    const oldVote = (t: any) => t.rating !== undefined && !t.svelato;
    const todo = rawItems.filter((t) => (oldVote(t) || t.isStarred === true) && !migTried.current.has(t.id));
    if (!todo.length) return;
    todo.forEach((t) => migTried.current.add(t.id));
    (async () => {
      try {
        for (let i = 0; i < todo.length; i += 150) {
          const b = writeBatch(db);
          todo.slice(i, i + 150).forEach((t) => {
            const patch: any = {};
            if (oldVote(t) && t.rating > 0 && vals[t.id]?.voto == null) patch.voto = t.rating;
            if (t.isStarred === true && vals[t.id]?.segnalibro == null) patch.segnalibro = true;
            if (Object.keys(patch).length) b.set(doc(db, "valutazioni", t.id), { ...patch, updatedAt: Date.now() }, { merge: true });
            const upd: any = {};
            if (oldVote(t)) upd.rating = deleteField();
            if (t.isStarred === true) upd.isStarred = false;
            b.update(doc(db, "pensieri", t.id), upd);
          });
          await b.commit();
        }
      } catch (e) { console.warn("Migrazione di voti e segnalibri non riuscita (controlla le regole di Firestore)", e); }
    })();
  }, [rawItems, vals, valsReady, isAdmin]);
  const [notifs, setNotifs] = useState<any[]>([]);
  useEffect(() => {
    if (!user || !db || isProf) { setNotifs([]); return; }
    return onSnapshot(query(collection(db, "notifiche"), where("userId", "==", user.uid)), (s: any) => setNotifs(s.docs.map((d: any) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.timestamp - a.timestamp)), () => {});
  }, [user]);
  useEffect(() => { setVisible(18); }, [search, sortBy, monthFilter, onlyMarked, unrated, tab]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  const profOk = !isProf || isAdmin;
  useEffect(() => {
    if (!user || !db || !profOk) return;
    return onSnapshot(collection(db, "profili"), (snap: any) => { const m: any = {}; snap.forEach((d: any) => { m[d.id] = d.data(); }); setProfiles(m); }, () => {});
  }, [user, profOk]);
  // Admin = chi ha il documento  admins/{uid}  su Firestore (creato a mano dalla console): nessuna password nel sito.
  useEffect(() => {
    if (!user || !db) { setIsAdmin(false); setIsOwner(false); setAdminChecked(false); return; }
    if (redeemRef.current) return; // durante l'attivazione del link ci pensa redeemProf
    let on = true;
    setAdminChecked(false);
    getDoc(doc(db, "admins", user.uid))
      .then((s: any) => { if (on) { setIsAdmin(s.exists()); setIsOwner(s.exists() && s.data()?.ruolo !== "professore"); } })
      .catch(() => { if (on) { setIsAdmin(false); setIsOwner(false); } })
      .finally(() => { if (on) setAdminChecked(true); });
    return () => { on = false; };
  }, [user]);
  useEffect(() => {
    const i = (e: any) => { const t = e.target; setKb(!!t?.isContentEditable || t?.tagName === "TEXTAREA" || (t?.tagName === "INPUT" && !["range", "checkbox", "file"].includes(t.type))); };
    const o = () => setKb(false);
    window.addEventListener("focusin", i); window.addEventListener("focusout", o);
    return () => { window.removeEventListener("focusin", i); window.removeEventListener("focusout", o); };
  }, []);
  useEffect(() => {
    history.replaceState({ tab: "home" }, "");
    const pop = (e: PopStateEvent) => { setSel(null); setTab(e.state?.tab || "home"); };
    const esc = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (history.state?.v) history.back(); else { setSel(null); setToDelete(null); setViewProf(null); } };
    window.addEventListener("popstate", pop); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", esc); };
  }, []);
  const [sel, setSel] = useState<any>(null);
  const [rvl, setRvl] = useState<string | null>(null);
  const [confirmRvl, setConfirmRvl] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => { setConfirmRvl(false); if (rvl && sel?.id !== rvl) setRvl(null); }, [sel?.id]);
  const [selMode, setSelMode] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<string[] | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  // editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [strokes, setStrokes] = useState<any[]>([]);
  const [hist, setHist] = useState<any[][]>([]);
  const [fut, setFut] = useState<any[][]>([]);
  const [cur, setCur] = useState<any>(null);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#10211F");
  const [size, setSize] = useState(3);
  const [opacity, setOpacity] = useState(100);
  const [eraser, setEraser] = useState(24);
  const [filled, setFilled] = useState(false);
  const [grid, setGrid] = useState(true);
  const [height, setHeight] = useState(600);
  const [fmt, setFmt] = useState({ b: false, i: false, u: false, size: "n", color: "" });
  const [panel, setPanel] = useState<null | "size" | "color">(null);
  const savedRange = useRef<Range | null>(null);
  // scelta di colore/dimensione fatta col solo cursore (ancora nessun testo scritto): si mostra subito nella toolbar
  const pendFmt = useRef<{ node: Node | null; off: number; size?: string; color?: string } | null>(null);
  const sizeEm = useRef(0); // dimensione (em) scelta col solo cursore, usata quando si inizia a scrivere
  const fmtBusy = useRef(false); // true mentre un comando di formattazione sta lavorando: l'evento input che execCommand scatena non deve toccare il risultato
  const tbTouch = useRef(0); // istante dell'ultimo tocco sulla toolbar: gli scroll subito dopo sono causati dal testo che cambia, non dall'utente
  const [tbHide, setTbHide] = useState(false); // su telefono la toolbar si nasconde scorrendo verso il basso
  const [colorOpen, setColorOpen] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const down = useRef(false);
  const draftKey = user ? `circuito:bozza:${user.uid}` : "";

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3200); };
  const err = (m: string) => setAuthMsg({ t: "err", m });

  useEffect(() => { try { localStorage.setItem("circuito:dark", dark ? "1" : "0"); } catch {} }, [dark]);
  useEffect(() => { try { localStorage.setItem("circuito:opts", JSON.stringify(opts)); } catch {} document.documentElement.style.fontSize = `${16 * (opts.text || 1)}px`; }, [opts]);
  const setTheme = (next: boolean, e?: any) => {
    const d: any = document;
    if (next === dark) return;
    if (!d.startViewTransition || lite || !G.theme || !e) { setDark(next); return; }
    const h = document.documentElement; h.style.setProperty("--vx", `${e.clientX}px`); h.style.setProperty("--vy", `${e.clientY}px`);
    d.startViewTransition(() => new Promise<void>((res) => { setDark(next); setTimeout(res, 80); }));
  };
  useEffect(() => {
    if (lite) return;
    let raf = 0;
    // parallasse e barra di avanzamento si spengono da sole: la variabile resta a zero
    const f = () => { raf = 0; const h = document.documentElement; const y = window.scrollY, m = h.scrollHeight - window.innerHeight; h.style.setProperty("--sy", G.parallax ? String(y) : "0"); h.style.setProperty("--sp", G.prog && m > 0 ? String(Math.min(1, y / m)) : "0"); };
    const on = () => { if (!raf) raf = requestAnimationFrame(f); };
    window.addEventListener("scroll", on, { passive: true }); f();
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [lite, G.parallax, G.prog]);
  // velocità globale: rallenta o accelera ogni animazione e transizione CSS (anche quelle che nascono dopo)
  useEffect(() => {
    const doc: any = document;
    if (typeof doc.getAnimations !== "function") return;
    let raf = 0;
    const apply = () => { raf = 0; try { doc.getAnimations().forEach((a: any) => { if (a.id !== "m" && a.playState !== "finished" && a.playbackRate !== G.spd) a.playbackRate = G.spd; }); } catch {} };
    const sched = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    if (G.spd !== 1) { document.addEventListener("animationstart", sched, true); document.addEventListener("transitionrun", sched, true); }
    return () => { document.removeEventListener("animationstart", sched, true); document.removeEventListener("transitionrun", sched, true); cancelAnimationFrame(raf); };
  }, [G.spd]);
  useEffect(() => {
    if (!G.glow && !G.tilt && !G.ripple) return;
    let raf = 0, el: any = null, ev: any = null;
    const run = () => {
      raf = 0; if (!el || !ev) return;
      const r = el.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (G.glow) { el.style.setProperty("--mx", `${x}px`); el.style.setProperty("--my", `${y}px`); }
      if (!G.tilt || ev.pointerType !== "mouse") return;
      const k = G.tiltI;
      if (el.classList.contains("card")) { el.style.setProperty("--rx", `${((y / r.height - 0.5) * -3 * k).toFixed(2)}deg`); el.style.setProperty("--ry", `${((x / r.width - 0.5) * 3 * k).toFixed(2)}deg`); }
      else { el.style.setProperty("--tx", `${((x / r.width - 0.5) * 6 * k).toFixed(1)}px`); el.style.setProperty("--ty", `${((y / r.height - 0.5) * 4 * k).toFixed(1)}px`); }
    };
    const mv = (e: any) => { if (e.pointerType !== "mouse") return; if (!G.glow && !G.tilt) return; const t = e.target?.closest?.(".card,.bt"); if (!t) return; el = t; ev = e; if (!raf) raf = requestAnimationFrame(run); };
    const out = (e: any) => { const t = e.target?.closest?.(".card,.bt"); if (t) ["--rx", "--ry", "--tx", "--ty"].forEach((k) => t.style.removeProperty(k)); };
    const dn = (e: any) => {
      const t = e.target?.closest?.(".card,.bt"); if (!t) return;
      const r = t.getBoundingClientRect();
      if (G.glow) { t.style.setProperty("--mx", `${e.clientX - r.left}px`); t.style.setProperty("--my", `${e.clientY - r.top}px`); }
      if (G.ripple && t.classList.contains("bt")) { t.style.setProperty("--px", `${e.clientX - r.left}px`); t.style.setProperty("--py", `${e.clientY - r.top}px`); t.classList.remove("rip"); void t.offsetWidth; t.classList.add("rip"); }
    };
    document.addEventListener("pointermove", mv, { passive: true }); document.addEventListener("pointerout", out, { passive: true }); document.addEventListener("pointerdown", dn, { passive: true });
    return () => {
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerout", out); document.removeEventListener("pointerdown", dn); cancelAnimationFrame(raf);
      document.querySelectorAll<HTMLElement>(".card,.bt").forEach(el => ["--rx", "--ry", "--tx", "--ty"].forEach(key => el.style.removeProperty(key)));
    };
  }, [G.glow, G.tilt, G.ripple, G.tiltI]);
  useEffect(() => {
    const lock = sel || toDelete || done || viewProf || optOpen;
    document.body.style.overflow = lock ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sel, toDelete, done, viewProf, optOpen]);

  // link del professore:  https://sito/#prof=<64 caratteri>  Il token sta dopo il # (non viene mai inviato a nessun server)
  // e lo tolgo subito dall'indirizzo, tenendolo solo in memoria.
  useEffect(() => {
    const m = /^#prof=([0-9a-fA-F]{64})$/.exec(window.location.hash);
    if (!m) return;
    setProfToken(m[1].toLowerCase());
    window.history.replaceState(window.history.state, document.title, window.location.pathname + window.location.search);
  }, []);
  // chi è già dentro con il proprio account non usa il link: lo scarto senza consumarlo
  useEffect(() => {
    if (profToken && user && !user.isAnonymous && !redeeming) { setProfToken(null); notify("Per usare un link professore devi prima uscire dal tuo account."); }
  }, [profToken, user, redeeming]);
  // una sessione anonima senza accesso valido (link scaduto, accesso revocato) non deve restare aperta
  useEffect(() => {
    if (user?.isAnonymous && adminChecked && !isAdmin && !redeeming) signOut(auth).catch(() => {});
  }, [user, adminChecked, isAdmin, redeeming]);

  // auth state + link reset password
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") === "resetPassword" && p.get("oobCode")) { setResetCode(p.get("oobCode")); setAuthLoading(false); return; }
    return onAuthStateChanged(auth, (u: any) => { if (u && eggGet() === 2) eggSet(0); setUser(u); setAuthLoading(false); });
  }, []);

  // dati
  const dataScope = isAdmin && ["read", "home", "podio", "authors"].includes(tab) ? "all" : ["my_pages", "home", "profile"].includes(tab) ? "mine" : "none";
  useEffect(() => {
    if (!user || !db || (isProf && !isAdmin) || dataScope === "none") return;
    const q = dataScope === "all" ? collection(db, "pensieri") : query(collection(db, "pensieri"), where("userId", "==", user.uid));
    setLoading(true); setRawItems([]);
    return onSnapshot(q, (s: any) => {
      setRawItems(s.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setLoading(false); notify("Impossibile leggere i progetti."); });
  }, [user, isAdmin, isProf, dataScope]);

  // bozza: ripristino + salvataggio automatico
  useEffect(() => {
    // a ogni cambio di account riparto da un foglio vuoto: altrimenti il testo di chi è uscito finirebbe nella bozza di chi entra
    setEditingId(null); setTitle(""); setContent(""); setStrokes([]); setHist([]); setFut([]); setHeight(600); setDrawing(false); setImg(null); setLoadTick((n) => n + 1);
    if (!draftKey) return;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (d) { setTitle(d.title || ""); setContent(d.content || ""); setStrokes(d.strokes || []); setHeight(d.height || 600); setLoadTick((n) => n + 1); notify("Bozza ripristinata."); }
    } catch {}
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || editingId || (!title && !plain(content).trim() && !strokes.length)) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ title, content, strokes, height })); } catch {} }, 800);
    return () => clearTimeout(t);
  }, [title, content, strokes, height, editingId, draftKey]);
  useEffect(() => { if (tab === "write" && editorRef.current) editorRef.current.innerHTML = clean(content); }, [tab, loadTick]);

  // scorciatoie disegno
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!drawing || !(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z") { e.preventDefault(); undo(); } else if (e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  // --- auth handlers ---
  const submitAuth = async (e: any) => {
    e.preventDefault(); setAuthMsg(null);
    // nel gesto dell'invio: l'audio si sblocca (iPhone compreso) e, per chi entra per la prima volta, parte il download della presentazione
    sound.unlock();
    if (authMode !== "reset" && tourLikely()) { sound.preload("intro"); loadTour().catch(() => {}); }
    const email = f.email.trim(); // la tastiera del telefono aggiunge spesso uno spazio in fondo
    let full = "";
    if (authMode === "register") {
      // nome e cognome veri e obbligatori: servono per riconoscere chi scrive (l'handle si cambia poi dal profilo)
      const n = tidyName(f.name), c = tidyName(f.surname);
      if (!okName(n) || !okName(c)) return err("Inserisci il tuo nome e il tuo cognome: almeno 2 lettere ciascuno, senza numeri o simboli.");
      full = `${n} ${c}`;
    }
    setAuthLoading(true);
    try {
      if (authMode === "reset") { await sendPasswordResetEmail(auth, email); setAuthMsg({ t: "ok", m: "Link di recupero inviato. Controlla la posta." }); }
      else if (authMode === "register") {
        const c = await createUserWithEmailAndPassword(auth, email, f.pw);
        // da qui l'account esiste già: un intoppo sul profilo non deve far sembrare fallita la registrazione
        try { await updateProfile(c.user, { displayName: full }); } catch (x) { console.warn("Nome non salvato nell'account", x); }
        try { const now = Date.now(); await setDoc(doc(db, "profili", c.user.uid), { displayName: full, handle: toHandle(full), status: "", bio: "", avatar: "", banner: "teal", createdAt: now, updatedAt: now }); }
        catch (x) { console.warn("Profilo non creato (controlla le regole di Firestore)", x); }
      }
      else await signInWithEmailAndPassword(auth, email, f.pw);
    } catch (x: any) {
      const m: any = { "auth/email-already-in-use": "Questa email è già registrata.", "auth/invalid-credential": "Email o password errate.", "auth/wrong-password": "Email o password errate.", "auth/weak-password": "La password deve avere almeno 6 caratteri.", "auth/invalid-email": "L'email non è valida.", "auth/user-not-found": "Utente non trovato.", "auth/missing-email": "Inserisci un'email.", "auth/missing-password": "Inserisci la password.", "auth/too-many-requests": "Troppi tentativi. Aspetta qualche minuto e riprova.", "auth/network-request-failed": "Connessione assente o instabile. Controlla la rete e riprova.", "auth/user-disabled": "Questo account è stato disattivato.", "auth/operation-not-allowed": "La registrazione con email non è attiva: avvisa chi gestisce il sito." };
      err(m[x.code] || `Errore: ${x.message}`);
    }
    setAuthLoading(false);
  };
  const submitNewPw = async (e: any) => {
    e.preventDefault(); setAuthMsg(null); setAuthLoading(true);
    try {
      await confirmPasswordReset(auth, resetCode!, f.newPw);
      setAuthMsg({ t: "ok", m: "Password aggiornata. Ora puoi accedere." });
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => { setResetCode(null); setAuthMode("login"); setAuthMsg(null); }, 2500);
    } catch { err("Il link è scaduto o non è valido."); }
    setAuthLoading(false);
  };
  // Attivazione del link: accesso anonimo + un'unica scrittura atomica (crea admins/{uid} e brucia l'invito).
  // Le regole di Firestore controllano che l'invito esista, non sia scaduto e venga eliminato nella stessa operazione.
  const redeemProf = async () => {
    if (!profToken || redeemRef.current) return;
    const token = profToken;
    sound.unlock(); sound.preload("intro"); loadTour().catch(() => {});
    redeemRef.current = true; setRedeeming(true); setAuthMsg(null);
    try {
      const cred = await signInAnonymously(auth);
      const b = writeBatch(db);
      b.set(doc(db, "admins", cred.user.uid), { ruolo: "professore", invito: token, creatoIl: Date.now() });
      b.delete(doc(db, "inviti", token));
      await b.commit();
      const s = await getDoc(doc(db, "admins", cred.user.uid));
      if (!s.exists()) throw new Error("accesso non registrato");
      setIsAdmin(true); setIsOwner(false); setAdminChecked(true);
      setProfToken(null);
    } catch (x: any) {
      setProfToken(null);
      try { if (auth.currentUser?.isAnonymous) await signOut(auth); } catch {}
      setIsAdmin(false); setIsOwner(false); setAdminChecked(false);
      const off = x?.code === "auth/operation-not-allowed" || x?.code === "auth/admin-restricted-operation";
      err(off ? "L'accesso professore non è ancora attivato su Firebase. Avvisa chi ti ha dato il link." : "Il link non è valido, è già stato usato oppure è scaduto. Chiedi un nuovo link.");
    }
    redeemRef.current = false; setRedeeming(false);
  };
  const logout = async () => {
    if (isProf && !window.confirm("Se esci, per rientrare serve un nuovo link dal titolare. Vuoi uscire?")) return;
    if (eggGet() === 1) eggSet(2);
    // chiudo ogni finestra aperta: sui PC condivisi non deve restare nulla dell'account che esce
    setSel(null); setViewProf(null); setEditProf(false); setOptOpen(false); setToDelete(null); setDone(null); setSelMode(false); setIds([]);
    // il professore che esce toglie anche il proprio accesso: nell'elenco del titolare non resta un dispositivo fantasma
    if (isProf) { try { await deleteDoc(doc(db, "admins", user.uid)); } catch {} }
    await signOut(auth); setIsAdmin(false); setIsOwner(false); setTab("home");
  };

  // --- editor handlers ---
  // Legge la formattazione sotto il cursore a ogni cambio di selezione (anche con il tocco su mobile) e ricorda l'ultima selezione
  const readFmt = () => {
    const ed = editorRef.current, sel = window.getSelection();
    if (!ed || !sel || !sel.rangeCount || !sel.anchorNode || !ed.contains(sel.anchorNode)) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    const start: any = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    let size = sizeIdOf(sel.anchorNode);
    // testo selezionato: se i pezzi hanno dimensioni diverse nessun pulsante è acceso ("" = misto)
    if (!sel.isCollapsed) { const ids = new Set(textNodesIn(sel.getRangeAt(0)).map((n: any) => sizeIdOf(n))); if (ids.size === 1) size = Array.from(ids)[0] as string; else if (ids.size > 1) size = ""; }
    let color = start ? rgbHex(getComputedStyle(start).color) : "";
    // scelta appena fatta col solo cursore: vale finché il cursore non si sposta (poi si legge dal testo)
    const p = pendFmt.current;
    if (p) {
      if (sel.isCollapsed && sel.anchorNode === p.node && sel.anchorOffset === p.off) { if (p.size) size = p.size; if (p.color) color = p.color; }
      else pendFmt.current = null;
    }
    const b = document.queryCommandState("bold"), i = document.queryCommandState("italic"), u = document.queryCommandState("underline");
    setFmt((f) => (f.b === b && f.i === i && f.u === u && f.size === size && f.color === color ? f : { b, i, u, size, color }));
  };
  useEffect(() => {
    if (tab !== "write" || drawing) return;
    document.addEventListener("selectionchange", readFmt);
    return () => document.removeEventListener("selectionchange", readFmt);
  }, [tab, drawing]);
  useEffect(() => { setPanel(null); }, [tab, drawing]);
  useEffect(() => {
    if (tab !== "write") { setTbHide(false); return; }
    if (kb || drawing) return; // si sta scrivendo o disegnando: la toolbar e i suoi pannelli non si toccano
    let last = window.scrollY, raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY, d = y - last;
        // cambiando dimensione/colore il testo si ridimensiona e il browser scrolla da solo per tenere visibile il cursore:
        // non è l'utente che scorre, quindi la toolbar e il pannello aperto non vanno toccati
        if (Date.now() - tbTouch.current < 1500) { last = y; return; }
        if (Math.abs(d) < 10) return;
        last = y;
        if (!window.matchMedia("(max-width:767px)").matches) { setTbHide(false); return; }
        if (d > 0) { if (y > 140) { setTbHide(true); setPanel(null); } } else setTbHide(false);
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [tab, kb, drawing]);
  useEffect(() => {
    if (panel !== "color") return;
    const box: any = document.querySelector(".swr"), el: any = box && box.querySelector('[aria-pressed="true"]');
    if (box && el) box.scrollLeft = el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, [panel]);
  const tbHidden = tbHide && !kb && !drawing; // con la tastiera aperta (si sta scrivendo) la toolbar resta sempre visibile
  // Esegue un comando sul testo SENZA riaprire la tastiera: se l'editor non ha il focus si ripristina l'ultima selezione
  // (il focus serve solo come ripiego se il browser non applica il comando senza)
  const restoreSel = () => {
    const ed = editorRef.current, sel = window.getSelection(), r = savedRange.current;
    if (!ed || !sel || !r || !ed.contains(r.commonAncestorContainer)) return false;
    sel.removeAllRanges(); sel.addRange(r); return true;
  };
  // probe: cosa confrontare prima/dopo per capire se il comando ha avuto effetto (di base l'HTML)
  const withSel = (fn: () => void, probe?: () => string) => {
    const ed = editorRef.current; if (!ed || drawing) return;
    const snap = probe || (() => ed.innerHTML);
    const focused = document.activeElement === ed;
    if (!focused) restoreSel();
    const before = snap();
    fmtBusy.current = true;
    try {
      fn();
      if (!focused && snap() === before) { ed.focus(); restoreSel(); fn(); }
    } finally { fmtBusy.current = false; }
    setContent(ed.innerHTML); readFmt();
    tbTouch.current = Date.now(); // il layout cambia dopo il comando: gli scroll che seguono non sono dell'utente
  };
  // con il solo cursore grassetto/corsivo/ecc. non cambiano l'HTML ma cambiano lo stato: va controllato anche quello,
  // altrimenti il comando veniva rieseguito e quindi annullato (serviva toccare due volte)
  const cmd = (c: string, v?: string) => withSel(() => { document.execCommand(c, false, v); },
    () => { let s = ""; try { s = String(document.queryCommandState(c)); } catch {} return (editorRef.current?.innerHTML || "") + "|" + s; });
  // --- struttura del testo ---
  // posizione della selezione come "numero di caratteri dall'inizio": resta valida anche quando i nodi vengono spostati o spezzati
  const textOffsets = (r: Range): [number, number] | null => {
    const ed = editorRef.current; if (!ed) return null;
    try { const pre = document.createRange(); pre.selectNodeContents(ed); pre.setEnd(r.startContainer, r.startOffset); const a = pre.toString().length; return [a, a + r.toString().length]; } catch { return null; }
  };
  const setTextOffsets = (a: number, b: number) => {
    const ed = editorRef.current, sel: any = window.getSelection(); if (!ed || !sel) return;
    try {
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let n: any, pos = 0, sn: any = null, so = 0, en: any = null, eo = 0, last: any = null;
      // cursore semplice: resta in fondo al testo che ha appena scritto (non all'inizio del pezzo dopo, che può avere un'altra dimensione)
      const coll = a === b;
      while ((n = w.nextNode())) {
        const len = n.length; last = n;
        if (!sn && (coll ? a <= pos + len : a < pos + len)) { sn = n; so = a - pos; }
        if (!en && b <= pos + len) { en = n; eo = b - pos; }
        pos += len;
      }
      if (!sn && last) { sn = last; so = last.length; }
      if (!en && last) { en = last; eo = last.length; }
      if (sn && en) { const nr = document.createRange(); nr.setStart(sn, so); nr.setEnd(en, eo); sel.removeAllRanges(); sel.addRange(nr); }
    } catch {}
  };
  const INLINE = new Set(["SPAN", "FONT", "B", "I", "U", "S", "STRONG", "EM", "STRIKE", "A", "CODE", "SUB", "SUP"]);
  const nodeIndex = (n: Node) => Array.prototype.indexOf.call((n.parentNode as Node).childNodes, n) as number;
  // spezza il testo e tutti gli elementi in linea (span, grassetto…) che passano da quel punto: dopo, il punto è un bordo netto
  const splitAt = (node: Node, off: number) => {
    const ed = editorRef.current; if (!ed) return;
    let parent: any, idx: number;
    if (node.nodeType === 3) {
      const t: any = node;
      if (off > 0 && off < t.length) t.splitText(off);
      parent = t.parentNode; idx = nodeIndex(t) + (off > 0 ? 1 : 0);
    } else { parent = node; idx = off; }
    while (parent && parent !== ed && INLINE.has(parent.tagName)) {
      const gp: any = parent.parentNode;
      if (idx > 0 && idx < parent.childNodes.length) {
        const clone = parent.cloneNode(false);
        while (parent.childNodes.length > idx) clone.appendChild(parent.childNodes[idx]);
        gp.insertBefore(clone, parent.nextSibling);
        idx = nodeIndex(parent) + 1;
      } else idx = nodeIndex(parent) + (idx > 0 ? 1 : 0);
      parent = gp;
    }
  };
  const isolate = (r: Range) => { const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset; splitAt(ec, eo); splitAt(sc, so); };
  // dimensione (id di SIZES) di un nodo: quella dello span più vicino che ne ha una
  const sizeIdOf = (n: Node) => {
    const ed = editorRef.current;
    for (let e: any = n.nodeType === 3 ? n.parentElement : n; e && e !== ed; e = e.parentElement) {
      if (e.style && e.style.fontSize) { const v = parseFloat(e.style.fontSize); return SIZES.reduce((a, b) => (Math.abs(b.em - v) < Math.abs(a.em - v) ? b : a)).id; }
    }
    return "n";
  };
  const textNodesIn = (r: Range) => {
    const ed = editorRef.current, out: any[] = []; if (!ed) return out;
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n: any;
    while ((n = w.nextNode())) if (n.length && r.intersectsNode(n)) out.push(n);
    return out;
  };
  const unwrapEl = (el: any) => { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove(); };
  // unisce gli span di dimensione uguali e vicini (altrimenti ogni cambio ne lascia uno in più)
  const mergeSizeSpans = () => {
    const ed = editorRef.current; if (!ed) return;
    const only = (el: any) => el && el.nodeType === 1 && el.tagName === "SPAN" && el.attributes.length === 1 && el.style.fontSize;
    Array.from(ed.querySelectorAll("span")).forEach((el: any) => {
      if (!el.isConnected || !only(el)) return;
      let nx: any = el.nextSibling;
      while (only(nx) && nx.style.fontSize === el.style.fontSize) { while (nx.firstChild) el.appendChild(nx.firstChild); const d = nx; nx = nx.nextSibling; d.remove(); }
    });
  };
  // toglie dimensione o colore SOLO da ciò che la selezione tocca: prima si spezzano gli span ai suoi bordi, così il testo fuori non cambia
  const stripFmt = (kind: "size" | "color") => {
    const ed = editorRef.current, sel = window.getSelection(); if (!ed || !sel || !sel.rangeCount) return;
    let r = sel.getRangeAt(0);
    const offs = textOffsets(r);
    if (offs) { isolate(r); setTextOffsets(offs[0], offs[1]); r = sel.getRangeAt(0); }
    // l'elenco degli elementi toccati si fa prima di modificare: durante lo scarto il range cambia e i controlli successivi sbaglierebbero
    const hit = Array.from(ed.querySelectorAll("span,font")).filter((el: any) => r.intersectsNode(el));
    hit.forEach((el: any) => {
      if (kind === "size") { el.style.removeProperty("font-size"); el.removeAttribute("size"); } else { el.style.removeProperty("color"); el.removeAttribute("color"); }
      if (!el.getAttribute("style")) el.removeAttribute("style");
      if (!el.attributes.length) unwrapEl(el);
    });
    // spostando il testo il browser azzera la selezione: senza di lei il comando che segue non troverebbe nulla da formattare
    if (offs) setTextOffsets(offs[0], offs[1]);
  };
  // dimensione sul testo selezionato: ogni pezzo di testo toccato prende la dimensione scelta, il resto resta com'è
  const sizeSelection = (em: number) => {
    const ed = editorRef.current, sel: any = window.getSelection(); if (!ed || !sel || !sel.rangeCount) return;
    stripFmt("size");
    const r = sel.getRangeAt(0), offs = textOffsets(r); if (!offs) return;
    if (em !== 1) textNodesIn(r).forEach((n: any) => {
      const sp = document.createElement("span"); sp.style.fontSize = em + "em";
      n.parentNode.insertBefore(sp, n); sp.appendChild(n);
    });
    mergeSizeSpans();
    setTextOffsets(offs[0], offs[1]);
  };
  // una sola dimensione per volta: se span è dentro un altro span con dimensione, quello si spezza attorno a lui e perde la sua
  // (le dimensioni sono in em: annidate si moltiplicherebbero, 0,8 dentro 1,8 darebbe 1,44)
  const unnestSize = (sp: any) => {
    const ed = editorRef.current; if (!ed) return;
    const outer: any[] = [];
    for (let a = sp.parentElement; a && a !== ed; a = a.parentElement) if (a.style && a.style.fontSize) outer.push(a);
    if (!outer.length) return;
    const r = document.createRange(); r.selectNode(sp); isolate(r);
    for (let a = sp.parentElement; a && a !== ed; ) {
      const up = a.parentElement;
      if (a.style && a.style.fontSize) { a.style.removeProperty("font-size"); if (!a.getAttribute("style")) a.removeAttribute("style"); if (!a.attributes.length) unwrapEl(a); }
      a = up;
    }
  };
  const setFmtSize = (id: string) => withSel(() => {
    const ed = editorRef.current, sel: any = window.getSelection(); if (!ed || !sel || !sel.rangeCount) return;
    const sz = SIZES.find((x) => x.id === id); if (!sz) return;
    if (sel.isCollapsed) {
      // solo il cursore: la dimensione vale per ciò che si scrive da qui in poi, il testo già scritto non cambia
      // (i <font> creati dal browser mentre si scrive li sistema fixFonts)
      sizeEm.current = sz.em;
      document.execCommand("fontSize", false, id === "n" ? "3" : "7");
      pendFmt.current = { node: sel.anchorNode, off: sel.anchorOffset, size: id };
      return;
    }
    sizeEm.current = 0; // niente dimensione "in attesa" di una scelta vecchia: qui si applica subito al testo selezionato
    sizeSelection(sz.em);
    pendFmt.current = null;
  });
  const setFmtColor = (c: string) => withSel(() => {
    const sel: any = window.getSelection(); if (!sel || !sel.rangeCount) return;
    if (sel.isCollapsed) {
      // solo il cursore: il colore vale per ciò che si scrive da qui in poi, il testo già colorato resta com'è
      const a: any = sel.anchorNode, el = a && (a.nodeType === 3 ? a.parentElement : a);
      const now = el ? rgbHex(getComputedStyle(el).color) : "";
      if (c !== now) document.execCommand("foreColor", false, c);
      pendFmt.current = { node: sel.anchorNode, off: sel.anchorOffset, color: c };
      return;
    }
    stripFmt("color");
    if (c !== INK_COLORS[0].id) document.execCommand("foreColor", false, c); // l'inchiostro è il colore normale: basta togliere
    pendFmt.current = null;
  }, () => { let v = ""; try { v = String(document.queryCommandValue("foreColor")); } catch {} return (editorRef.current?.innerHTML || "") + "|" + v; });
  // dopo ogni digitazione: i <font size> che il browser crea per la dimensione scelta col solo cursore diventano span con la dimensione giusta
  const fixFonts = () => {
    const ed = editorRef.current; if (!ed || fmtBusy.current) return;
    const list = ed.querySelectorAll('font[size="7"],font[size="3"]'); if (!list.length) return;
    const sel: any = window.getSelection();
    const offs = sel && sel.rangeCount && ed.contains(sel.anchorNode) ? textOffsets(sel.getRangeAt(0)) : null;
    list.forEach((f: any) => {
      const big = f.getAttribute("size") === "7";
      if (big && !sizeEm.current) { f.removeAttribute("size"); if (!f.attributes.length) unwrapEl(f); return; } // nessuna dimensione scelta: non deve restare un testo gigante
      const sp = document.createElement("span"); sp.style.fontSize = (big ? sizeEm.current : 1) + "em"; // size 3 = "torna normale"
      const col = f.getAttribute("color"); if (col) sp.style.color = col;
      while (f.firstChild) sp.appendChild(f.firstChild);
      f.replaceWith(sp);
      unnestSize(sp);
      if (!big) { sp.style.removeProperty("font-size"); if (!sp.getAttribute("style")) sp.removeAttribute("style"); if (!sp.attributes.length) unwrapEl(sp); }
    });
    mergeSizeSpans();
    if (offs) setTextOffsets(offs[0], offs[1]);
  };
  const addImage = async (e: any) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const src = await compressImage(file);
      editorRef.current.focus(); document.execCommand("insertImage", false, src);
      editorRef.current.querySelectorAll("img").forEach((im: any) => { if (!im.style.width) { im.style.width = "50%"; im.style.cursor = "pointer"; } });
      setContent(editorRef.current.innerHTML);
    } catch { notify("Immagine non valida."); }
    e.target.value = "";
  };
  const pickImg = (e: any) => {
    img?.style.removeProperty("outline");
    if (e.target.tagName === "IMG") { e.target.style.outline = "3px solid #0F8B7A"; setImg(e.target); } else setImg(null);
  };
  const resizeImg = (w: string) => { if (img) { img.style.width = w; setContent(editorRef.current.innerHTML); } };
  const removeImg = () => { img?.remove(); setImg(null); setContent(editorRef.current.innerHTML); };

  const snap = () => { setHist((h) => [...h.slice(-49), strokes]); setFut([]); };
  const undo = () => { if (!hist.length) return; setFut((x) => [...x, strokes]); setStrokes(hist[hist.length - 1]); setHist((h) => h.slice(0, -1)); };
  const redo = () => { if (!fut.length) return; setHist((h) => [...h, strokes]); setStrokes(fut[fut.length - 1]); setFut((x) => x.slice(0, -1)); };
  const pos = (e: any) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const erase = (x: number, y: number) => {
    const r = eraser / 2;
    setStrokes((prev) => {
      const out: any[] = [];
      prev.forEach((s) => {
        const a = s.points[0], b = s.points[s.points.length - 1];
        if (s.tool === "line") { if (distSeg({ x, y }, a, b) > r + (s.size || 3) / 2) out.push(s); return; }
        if (s.tool === "rect" || s.tool === "ellipse") {
          const hit = x >= Math.min(a.x, b.x) - r && x <= Math.max(a.x, b.x) + r && y >= Math.min(a.y, b.y) - r && y <= Math.max(a.y, b.y) + r;
          if (!hit) out.push(s); return;
        }
        let seg: any[] = [];
        s.points.forEach((p: any) => {
          if ((p.x - x) ** 2 + (p.y - y) ** 2 > r * r) seg.push(p);
          else { if (seg.length) out.push({ ...s, points: seg }); seg = []; }
        });
        if (seg.length) out.push({ ...s, points: seg });
      });
      return out;
    });
  };
  const pDown = (e: any) => {
    if (tool === "hand") return;
    e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); down.current = true;
    const { x, y } = pos(e); snap();
    if (tool === "eraser") erase(x, y);
    else setCur({ tool, color, size, opacity: opacity / 100, filled, points: [{ x, y }, { x: x + 0.01, y }] });
  };
  const pMove = (e: any) => {
    if (!down.current) return; e.preventDefault();
    const p = pos(e);
    if (tool === "eraser") return erase(p.x, p.y);
    setCur((c: any) => {
      if (!c) return c;
      if (["line", "rect", "ellipse"].includes(c.tool)) return { ...c, points: [c.points[0], p] };
      const l = c.points[c.points.length - 1];
      return Math.hypot(p.x - l.x, p.y - l.y) < 1.5 ? c : { ...c, points: [...c.points, p] };
    });
    if (p.y > height - 120) setHeight((h) => h + 300);
  };
  const pUp = (e: any) => {
    if (!down.current) return; down.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (cur) { setStrokes((s) => [...s, cur]); setCur(null); }
  };

  const resetForm = () => {
    setEditingId(null); setTitle(""); setContent(""); setStrokes([]); setHist([]); setFut([]); setHeight(600);
    setDrawing(false); setImg(null); setLoadTick((n) => n + 1);
    try { localStorage.removeItem(draftKey); } catch {}
  };
  const startEdit = (t: any) => {
    setEditingId(t.id); setTitle(t.title); setContent(t.content || ""); setStrokes(t.strokes || []);
    setHist([]); setFut([]); setHeight(t.h || 600); setSel(null); setDrawing(false); setTab("write"); setLoadTick((n) => n + 1);
  };

  const submit = async (e: any) => {
    e.preventDefault();
    const html = clean(editorRef.current?.innerHTML || "");
    if (!user || !(plain(html).trim() || /<img/.test(html) || strokes.length)) return;
    const st = strokes.map((s) => ({ ...s, points: s.points.map((p: any) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) }));
    const data = { title: title.trim() || "Senza titolo", content: html, strokes: st, w: Math.round(canvasRef.current?.clientWidth || 900), h: Math.round(height) };
    // il limite di Firestore è di ~1 MB in byte (non in caratteri: accenti ed emoji ne pesano di più)
    if (new Blob([JSON.stringify(data)]).size > 950000) return notify("Progetto troppo pesante: riduci le immagini o il disegno.");
    setSaving(true);
    try {
      if (editingId) await updateDoc(doc(db, "pensieri", editingId), { ...data, updatedAt: Date.now() });
      else await addDoc(collection(db, "pensieri"), { ...data, author: profiles[user.uid]?.displayName || user.displayName || "Operatore", timestamp: Date.now(), userId: user.uid, isStarred: false });
      setDone(editingId ? "edit" : "new");
    } catch { notify("Salvataggio non riuscito. Riprova."); }
    setSaving(false);
  };

  // --- azioni lista ---
  const canEdit = (t: any) => isAdmin || t.userId === user?.uid;
  const bulkMark = async () => {
    const chosen = items.filter((t) => ids.includes(t.id)); const val = !chosen.every((t) => t.isStarred);
    try { const b = writeBatch(db); chosen.forEach((t) => b.set(doc(db, "valutazioni", t.id), { segnalibro: val, updatedAt: Date.now() }, { merge: true })); await b.commit(); notify(val ? "Segnalibro aggiunto." : "Segnalibro rimosso."); }
    catch { notify("Operazione non riuscita."); }
    setIds([]); setSelMode(false);
  };
  const markRead = async (ids: string[]) => { try { const b = writeBatch(db); ids.forEach((id) => b.update(doc(db, "notifiche", id), { letta: true })); await b.commit(); } catch {} };
  const reveal = async (t: any) => {
    if (!isAdmin || t.svelato || !(t.rating > 0)) return;
    try {
      const b = writeBatch(db);
      b.update(doc(db, "pensieri", t.id), { svelato: true, rating: t.rating });
      b.set(doc(collection(db, "notifiche")), { userId: t.userId, pensieroId: t.id, titolo: t.title, voto: t.rating, timestamp: Date.now(), letta: false });
      await b.commit();
      buzz([20, 40, 30]);
      setRvl(t.id); setSel({ ...sel, svelato: true });
    } catch { notify("Svelamento non riuscito: pubblica le nuove regole di Firestore."); }
    setConfirmRvl(false);
  };
  const rate = async (t: any, n: number) => {
    if (!isAdmin || t.svelato) return;
    buzz(12);
    try { await setDoc(doc(db, "valutazioni", t.id), { voto: n, updatedAt: Date.now() }, { merge: true }); }
    catch { return notify("Voto non salvato: pubblica le nuove regole di Firestore."); }
    if (sel?.id === t.id) setSel({ ...sel, rating: n });
  };
  const star = async (t: any) => { if (isAdmin) { buzz(12); try { await setDoc(doc(db, "valutazioni", t.id), { segnalibro: !t.isStarred, updatedAt: Date.now() }, { merge: true }); } catch { return notify("Segnalibro non salvato: pubblica le nuove regole di Firestore."); } if (sel?.id === t.id) setSel({ ...sel, isStarred: !t.isStarred }); } };
  const confirmDelete = async () => {
    const list = toDelete!; setToDelete(null); setSel(null); setGone(list);
    setTimeout(async () => {
      try { const b = writeBatch(db); list.forEach((id) => b.delete(doc(db, "pensieri", id))); await b.commit(); notify(list.length > 1 ? `${list.length} progetti eliminati.` : "Progetto eliminato."); }
      catch { notify("Eliminazione non riuscita: controlla i permessi."); }
      setGone([]); setIds([]); setSelMode(false);
    }, 300 / GSPD);
  };
  // il foglio si aprirà dal punto in cui è stato toccato (la carta della scheda, o la riga dell'elenco)
  const origin = useRef<{ id: string; r: any } | null>(null);
  const [swap, setSwap] = useState(0); // ultimo passaggio tra scritti nel lettore: -1 indietro, 1 avanti, 0 nessuno
  const openView = (t: any, e?: any) => {
    const el: any = e?.currentTarget, r = rectOf(el?.querySelector?.(".paper") || el);
    origin.current = r ? { id: t.id, r } : null;
    setSwap(0); history.pushState({ tab, v: 1 }, ""); setSel(t);
  };
  const stepTo = (t: any, d: number) => { setSwap(d); setSel(t); };
  const closeView = () => { if (history.state?.v) history.back(); else setSel(null); };
  const go = (t: string) => { if (isProf && (t === "my_pages" || t === "profile" || (t === "write" && !editingId))) return; if (t !== tab) history.pushState({ tab: t }, ""); setTab(t); setSelMode(false); setIds([]); setSearch(""); setMonthFilter("all"); setOnlyMarked(false); setUnrated(false); setStatoF("all"); };

  // ================= SUONO E PRESENTAZIONE =================
  // cambio di sezione: i due click salgono andando avanti nel menu e scendono tornando indietro (anche col tasto Indietro)
  const sndTab = useRef(tab);
  useEffect(() => {
    const p = sndTab.current; sndTab.current = tab;
    if (p === tab || !user || tour) return; // durante il tour guidato i passi suonano da soli
    sound.play(NAV_ORDER.indexOf(tab) >= NAV_ORDER.indexOf(p) ? "enter" : "back");
  }, [tab]);
  // entrando dal login si sente l'ingresso; non al semplice ricaricamento della pagina, né quando parte la presentazione
  const fromLogin = useRef(false);
  useEffect(() => {
    if (!user) { if (!authLoading) fromLogin.current = true; return; }
    if (!adminChecked || !fromLogin.current) return;
    fromLogin.current = false;
    if (tourSeen(user.uid)) sound.play("enter");
  }, [user, adminChecked, authLoading]);
  const tourName = user ? (isProf ? "Professore" : String(profiles[user.uid]?.displayName || user.displayName || "").trim().split(" ")[0]) : "";
  const wantTour = !!user && adminChecked && !redeeming && !tour && !tourSeen(user.uid);
  useEffect(() => {
    if (!wantTour) return;
    if (tourName) { setTour("auto"); return; }
    // il nome di un account appena creato arriva un attimo dopo, col profilo: lo aspetto un poco
    const t = setTimeout(() => setTour("auto"), 2500);
    return () => clearTimeout(t);
  }, [wantTour, tourName]);
  const holdTour = (on: boolean) => { setTourHold(on); holdLoops(on); };
  // il tour cambia sezione senza riempire la cronologia: alla fine il tasto Indietro non ripercorre i passi
  const tourNav = (t: string) => { history.replaceState({ tab: t }, ""); setSel(null); setTab(t); setSelMode(false); setIds([]); setSearch(""); setMonthFilter("all"); setOnlyMarked(false); setUnrated(false); setStatoF("all"); };
  const endTour = (to?: string) => { if (user) tourMark(user.uid); holdTour(false); setTour(""); if (to) go(to); else tourNav("home"); };
  const tourLow = (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as any).deviceMemory || 8) <= 3;

  const prepared = useMemo(() => items.map((t) => {
    const text = plain(t.content);
    return { ...t, _tx: text, _words: text.trim().split(/\s+/).filter(Boolean).length, _img: /<img/.test(t.content || "") };
  }), [items]);
  const wordCounts = useMemo(() => new Map(prepared.map(t => [t.id, t._words])), [prepared]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prepared
      .filter((t) => (monthFilter === "all" || mKey(t.timestamp) === monthFilter) && (!onlyMarked || t.isStarred) && (!unrated || !t.rating) && (statoF === "all" || (vals[t.id]?.stato || "da_leggere") === statoF) && (!q || `${t.title} ${isAdmin && !t.svelato && t.userId !== user?.uid ? "" : t.author} ${t._tx}`.toLowerCase().includes(q)))
      .sort((a, b) => sortBy === "rated" ? (b.rating || 0) - (a.rating || 0) || b.timestamp - a.timestamp : sortBy === "oldest" ? a.timestamp - b.timestamp : sortBy === "longest" ? (b.content?.length || 0) - (a.content?.length || 0) : sortBy === "shortest" ? (a.content?.length || 0) - (b.content?.length || 0) : b.timestamp - a.timestamp);
  }, [prepared, search, sortBy, monthFilter, onlyMarked, unrated, statoF, vals, isAdmin, user]);
  const words = useMemo(() => plain(content).trim().split(/\s+/).filter(Boolean).length, [content]);

  // ================= MOVIMENTO =================
  // la pagina nuova arriva dal lato verso cui ti sposti nel menu
  const pdx = useRef(0), prevTab = useRef(tab);
  if (prevTab.current !== tab) { pdx.current = NAV_ORDER.indexOf(tab) >= NAV_ORDER.indexOf(prevTab.current) ? 18 : -18; prevTab.current = tab; }
  const heroIntro = useRef(FIRST);
  useEffect(() => { if (tab !== "home") heroIntro.current = false; }, [tab]);
  // archivio: le schede che restano scivolano nella nuova posizione quando cambiano ricerca, filtri o ordinamento
  const gridRef = useRef<HTMLDivElement>(null);
  useFlip(gridRef, `${tab}:${shown.slice(0, visible).map((t) => t.id).join("|")}`);
  // menu: la pista che segue la voce attiva
  const railV = useRef<HTMLDivElement>(null), railH = useRef<HTMLElement>(null);
  const railKey = `${tab}:${user?.uid || ""}:${adminChecked}:${isAdmin}:${!!editingId}`;
  useRail(railV, "v", railKey); useRail(railH, "h", railKey);
  // lettore: il foglio resta montato durante l'uscita, per poter tornare nella sua scheda
  const [vs, setVs] = useState<any>(null);
  const view = sel || vs;
  const sheetRef = useRef<HTMLDivElement>(null), readRef = useRef<HTMLDivElement>(null), railRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (sel) { if (closing) sheetRef.current?.getAnimations().forEach((a) => a.cancel()); setVs(sel); setClosing(false); return; }
    if (!vs) return;
    const p = sheetRef.current;
    if (!p || !moving()) { setVs(null); setSwap(0); return; }
    let on = true;
    setClosing(true);
    closeSheet(p, vs.id).then(() => { if (on) { setVs(null); setClosing(false); setSwap(0); } });
    return () => { on = false; };
  }, [sel]);
  useLayoutEffect(() => {
    if (!view) { opened.current = false; return; }
    if (opened.current || !sheetRef.current) return;
    opened.current = true;
    const o = origin.current; origin.current = null;
    openSheet(sheetRef.current, o && o.id === view.id ? o.r : null);
  }, [view?.id]);
  useReadTrace(readRef, railRef, view?.id);
  // 3D: le scritte estruse e il terminale si inclinano verso il puntatore (solo con il mouse; sui telefoni oscillano da sole)
  useEffect(() => {
    if (!G.d3 || G.nomotion || compact) return;
    let raf = 0, x = 0, y = 0;
    const apply = () => { raf = 0; document.querySelector<HTMLElement>(".root")?.style.setProperty("--gx", x.toFixed(3)); document.querySelector<HTMLElement>(".root")?.style.setProperty("--gy", y.toFixed(3)); };
    const mv = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; x = (e.clientX / window.innerWidth) * 2 - 1; y = (e.clientY / window.innerHeight) * 2 - 1; if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("pointermove", mv, { passive: true });
    return () => { window.removeEventListener("pointermove", mv); cancelAnimationFrame(raf); const root = document.querySelector<HTMLElement>(".root"); root?.style.removeProperty("--gx"); root?.style.removeProperty("--gy"); };
  }, [G.d3, G.nomotion, compact]);
  // un solo logo 3D alla volta (un solo contesto WebGL): quello grande su schermi larghi, quello piccolo su telefono
  const [wide, setWide] = useState(() => !!window.matchMedia?.("(min-width:768px)").matches);
  useEffect(() => {
    const m = window.matchMedia?.("(min-width:768px)"); if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener ? m.addEventListener("change", on) : m.addListener(on);
    return () => { m.removeEventListener ? m.removeEventListener("change", on) : m.removeListener(on); };
  }, []);

  // ================= RENDER =================
  const no = (k: string, cls: string) => (G[k] ? "" : cls);
  const gStyle: any = { "--gi": G.glowI, "--ai": G.auroraI, "--ao": G.artI };
  const settingsDialog = optOpen && (
        <SettingsDialog onClose={() => setOptOpen(false)}>
            <div className="flex items-center justify-between mb-5"><h3 id="settings-title" className="hd text-2xl font-bold">Opzioni</h3><button className="bt !p-2" onClick={() => setOptOpen(false)} aria-label="Chiudi"><X size={16} /></button></div>
            <h4 className="text-xs mu mb-2">Aspetto</h4>
            <Seg v={dark} set={(v: boolean, e: any) => setTheme(v, e)} items={[[false, <><Sun size={14} />Chiaro</>], [true, <><Moon size={14} />Scuro</>]]} />
            <div className="h-2" />
            <Seg v={opts.text} set={(v: number) => setOpt("text", v)} items={[[0.9, "Testo piccolo"], [1, "Normale"], [1.12, "Grande"]]} />
            <h4 className="text-xs mu mt-6 mb-2">Effetti e animazioni</h4>
            <Seg cols={2} v={opts.level} set={(v: string) => setLevel(v)} items={[["full", "Spettacolo"], ["mid", "Equilibrato"], ["lite", "Leggero"], ["custom", <><SlidersHorizontal size={13} />Personalizzato</>]]} />
            <p className="text-xs mu mt-2">{({ full: "Tutti gli effetti attivi, regolabili qui sotto.", mid: "Niente circuito vivo, aurora e inclinazione: più leggero.", lite: "Nessuna animazione né effetto: massima velocità e batteria.", custom: `Scegli tu ogni effetto e quanto deve essere intenso · ${CBOOL.filter((k) => G[k]).length} di ${CBOOL.length} attivi.` } as any)[opts.level]}</p>
            {opts.level !== "custom" ? (
              <div className="mt-2">
                <Sw on={opts.fx} off={opts.level !== "full"} set={(v: boolean) => setOpt("fx", v)} label="Circuito vivo" hint="Impulsi di corrente sullo sfondo, scintille al tocco e pioggia di codice nel riquadro iniziale" />
                <Sw on={opts.glow} off={opts.level !== "full"} set={(v: boolean) => setOpt("glow", v)} label="Bagliore, 3D e onde" hint="Luce che segue il dito, card che si inclinano, onde sui pulsanti" />
                <Sw on={opts.aurora} off={opts.level !== "full"} set={(v: boolean) => setOpt("aurora", v)} label="Aurora animata" hint="Luci in movimento dietro le pagine" />
                <Sw on={opts.intro} off={lite} set={(v: boolean) => setOpt("intro", v)} label="Titoli, logo e fogli animati" hint="Titoli che emergono dalla riga, fogli dell'archivio che si stampano" />
                <Sw on={opts.d3 !== false} off={lite} set={(v: boolean) => setOpt("d3", v)} label="Logo e titoli in 3D" hint="Logo tridimensionale che segue il mouse (cliccalo), titoli in rilievo, terminale fluttuante" />
                <button type="button" className="bt w-full mt-2" onClick={() => setLevel("custom")}><SlidersHorizontal size={15} />Regola ogni dettaglio</button>
              </div>
            ) : (
              <div className="mt-1">
                <div className="flex items-center gap-2 mt-2 mb-1">
                  <span className="text-xs mu shrink-0">Parti da</span>
                  <div className="flex gap-1.5 flex-1">
                    {([["full", "Spettacolo"], ["mid", "Equilibrato"], ["lite", "Leggero"]] as any).map(([id, l]: any) => <button type="button" key={id} className="bt flex-1 !text-xs !px-1 !py-1.5" onClick={() => baseOn(id)}>{l}</button>)}
                  </div>
                </div>
                <Sw on={G.motion} set={(v: boolean) => setC("motion", v)} label="Animazioni dell'interfaccia" hint="Se lo spegni nessun elemento si muove: tutto compare subito" />

                <Sub>Sfondo</Sub>
                <Sw on={G.pulses} set={(v: boolean) => setC("pulses", v)} label="Impulsi di corrente" hint="Scintille di luce che corrono lungo le piste del circuito" />
                {G.pulses && <Rng label="Quantità di impulsi" hint="Sugli schermi piccoli sono la metà" v={G.dens} set={(v: number) => setC("dens", v)} min={2} max={40} step={1} />}
                <Sw on={G.sparks} set={(v: boolean) => setC("sparks", v)} label="Scintille al tocco" hint="Una raggiera di scintille dove clicchi o tocchi" />
                <Sw on={G.aurora} set={(v: boolean) => setC("aurora", v)} label="Aurora animata" hint="Luci in movimento dietro le pagine" />
                {G.aurora && <Rng label="Intensità aurora" v={G.auroraI} set={(v: number) => setC("auroraI", v)} min={0.1} max={1} step={0.05} fmt={(v: number) => `${Math.round(v * 100)}%`} />}
                <Sw on={G.art} set={(v: boolean) => setC("art", v)} label="Disegno di circuiti" hint="Schema elettronico che cambia a ogni sezione" />
                {G.art && <Rng label="Visibilità del disegno" v={G.artI} set={(v: number) => setC("artI", v)} min={0.2} max={2.5} step={0.1} fmt={(v: number) => `${Math.round(v * 100)}%`} />}
                <Sw on={G.parallax} set={(v: boolean) => setC("parallax", v)} label="Parallasse" hint="Lo sfondo scorre più piano della pagina" />
                <Sw on={G.prog} set={(v: boolean) => setC("prog", v)} label="Barra di avanzamento" hint="Linea luminosa in alto che segue lo scorrimento" />

                <Sub>Riquadro iniziale</Sub>
                <Sw on={G.rain} set={(v: boolean) => setC("rain", v)} label="Pioggia di codice" hint="Colonne di 0, 1 ed esadecimale che cadono e reagiscono al mouse" />
                {G.rain && <Rng label="Densità della pioggia" v={G.rainD} set={(v: number) => setC("rainD", v)} min={0.1} max={1} step={0.05} fmt={(v: number) => `${Math.round(v * 100)}%`} />}
                <Sw on={G.scan} set={(v: boolean) => setC("scan", v)} label="Linee di scansione" hint="Righe sottili e fascio di luce che scende sul riquadro" />

                <Sub>Pulsanti e card</Sub>
                <Sw on={G.glow} set={(v: boolean) => setC("glow", v)} label="Bagliore" hint="Luce che segue il dito o il mouse" />
                {G.glow && <Rng label="Intensità bagliore" v={G.glowI} set={(v: number) => setC("glowI", v)} min={0.1} max={1} step={0.05} fmt={(v: number) => `${Math.round(v * 100)}%`} />}
                <Sw on={G.tilt} set={(v: boolean) => setC("tilt", v)} label="Inclinazione 3D" hint="Card e pulsanti si inclinano verso il mouse" />
                {G.tilt && <Rng label="Forza dell'inclinazione" v={G.tiltI} set={(v: number) => setC("tiltI", v)} min={0.2} max={2.5} step={0.1} fmt={(v: number) => `${Math.round(v * 100)}%`} />}
                <Sw on={G.ripple} set={(v: boolean) => setC("ripple", v)} label="Onde sui pulsanti" hint="Un'onda parte dal punto in cui premi" />
                <Sw on={G.lift} set={(v: boolean) => setC("lift", v)} label="Sollevamento" hint="I fogli si alzano al passaggio e l'angolo si piega" />

                <Sub>Ingressi e transizioni</Sub>
                <Sw on={G.titles} set={(v: boolean) => setC("titles", v)} label="Titoli che emergono" hint="Le parole dei titoli salgono dalla propria riga, una dopo l'altra" />
                <Sw on={G.logo} set={(v: boolean) => setC("logo", v)} label="Logo animato" hint="Il logo si disegna e la corrente lo attraversa" />
                <Sw on={G.d3} set={(v: boolean) => setC("d3", v)} label="Logo e titoli in 3D" hint="Logo tridimensionale in WebGL, titoli estrusi e terminale fluttuante che seguono il mouse" />
                <Sw on={G.reveal} set={(v: boolean) => setC("reveal", v)} label="Fogli e sezioni che compaiono" hint="L'ingresso nel Circuito, i fogli dell'archivio che si stampano, i numeri che si caricano" />
                <Sw on={G.pages} set={(v: boolean) => setC("pages", v)} label="Transizione tra le pagine" hint="La pagina arriva dal lato verso cui ti sposti, e la pista sotto il titolo si traccia" />
                <Sw on={G.theme} set={(v: boolean) => setC("theme", v)} label="Onda al cambio tema" hint="Il passaggio chiaro/scuro si allarga dal punto in cui tocchi" />
                <Sw on={G.blur} set={(v: boolean) => setC("blur", v)} label="Sfocature" hint="Barra in alto e finestre semitrasparenti. Spegnile se lo schermo scatta" />

                <Sub>Velocità e prestazioni</Sub>
                <Rng label="Velocità delle animazioni" hint="Vale per animazioni, transizioni, circuito e pioggia di codice" v={G.spd} set={(v: number) => setC("spd", v)} min={0.25} max={2} step={0.05} fmt={(v: number) => `×${v.toFixed(2).replace(/0$/, "")}`} />
                <div className="py-2">
                  <span className="block text-sm font-semibold">Fluidità degli effetti</span>
                  <span className="block text-xs mu mb-2">Fotogrammi al secondo di circuito e pioggia di codice: meno scatti con più, meno batteria con meno</span>
                  <Seg v={G.fps} set={(v: number) => setC("fps", v)} items={[[20, "20 fps"], [30, "30 fps"], [60, "60 fps"]]} />
                </div>
              </div>
            )}
            <h4 className="text-xs mu mt-4 mb-1">Musica e feedback</h4>
            <Sw on={opts.music} set={setMusic} label="Musica di sottofondo" hint="Mii Channel (Plaza) · riproduzione continua" />
            {opts.music && <Rng label="Volume della musica" v={opts.musicVol ?? 0.35} set={(v: number) => setOpt("musicVol", v)} min={0} max={1} step={0.05} fmt={(v: number) => Math.round(v * 100) + "%"} />}
            {opts.music && music.status === "blocked" && <button type="button" className="bt w-full" onClick={music.retry}>Riprendi musica</button>}
            {opts.music && music.status === "error" && <p className="text-xs mu" role="status">Impossibile riprodurre la musica. <button type="button" className="lk" onClick={music.retry}>Riprova</button></p>}
            <Sw on={sfxOn} set={(v: boolean) => { setOpt("sfx", v); if (v) { sound.unlock(); sound.configure(true, opts.sfxVol ?? 1); sound.play("enter"); } }} label="Effetti sonori" hint="Tick al passaggio, suono tra le sezioni, caricamento del gioco segreto e jingle di benvenuto" />
            {sfxOn && <Rng label="Volume degli effetti" hint="La musica di sottofondo si abbassa da sola quando parla un effetto lungo" v={opts.sfxVol ?? 1} set={(v: number) => { setOpt("sfxVol", v); sound.configure(true, v); sound.play("klick"); }} min={0.05} max={1} step={0.05} fmt={(v: number) => `${Math.round(v * 100)}%`} />}
            <Sw on={opts.vibrate} set={(v: boolean) => setOpt("vibrate", v)} label="Vibrazione" hint="Feedback tattile su segnalibro e voti" />
            {opts.vibrate && <div className="py-2"><span className="block text-xs font-semibold mb-1.5">Forza della vibrazione</span><Seg v={opts.vib ?? 1} set={(v: number) => setOpt("vib", v)} items={[[0.6, "Leggera"], [1, "Normale"], [1.6, "Forte"]]} /></div>}
            {user && <button type="button" className="bt w-full mt-3" onClick={() => { setOptOpen(false); setTour("replay"); }}><Sparkles size={15} />Rivedi la presentazione</button>}
            {isOwner && <AccessoProf db={db} notify={notify} />}
            <div className="flex gap-2 mt-5">
              <button className="bt flex-1" onClick={() => setOpts({ ...DEF })}><RotateCcw size={15} />Ripristina</button>
              <button className="bt on flex-1" onClick={() => setOpt("level", "lite")}><Zap size={15} />Elimina effetti</button>
            </div>
        </SettingsDialog>
      );
  const shell = (children: any) => <div style={gStyle} className={`root ${dark ? "dark" : ""} ${lite ? "lite" : ""} ${G.nomotion && !lite ? "nomotion" : ""} ${no("glow", "noglow")} ${no("ripple", "noripple")} ${no("aurora", "noaurora")} ${no("titles", "notitles")} ${no("logo", "nologo")} ${no("reveal", "noreveal")} ${no("pages", "nopages")} ${no("scan", "noscan")} ${no("prog", "noprog")} ${no("blur", "noblur")} ${no("lift", "nolift")} ${tourHold ? "tour-hold" : ""} min-h-screen`}><div className="prog" />{children}{settingsDialog}</div>;

  if (authLoading || redeeming || (user && !adminChecked)) return shell(<div className="flex min-h-[100dvh] items-center justify-center p-6"><Wordmark stack center size={104} fs={32} /></div>);

  // diorama del pannello d'accesso: il puntatore inclina lo spazio (variabili --nx/--ny, da -1 a 1)
  const d3live = G.d3 && !G.nomotion;
  const stageMove = (e: any) => { if (!d3live || e.pointerType !== "mouse") return; const el = e.currentTarget, r = el.getBoundingClientRect(); el.style.setProperty("--nx", (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3)); el.style.setProperty("--ny", (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3)); };
  const stageLeave = (e: any) => { ["--nx", "--ny"].forEach((k) => e.currentTarget.style.removeProperty(k)); };

  if (!user || resetCode) {
    const Msg = authMsg && <div className={`mb-4 p-3 rounded-lg text-sm ${authMsg.t === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{authMsg.m}</div>;
    const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
    return shell(<>
      <Backdrop tab="home" fx={G.pulses || G.sparks} dark={dark} art={G.art} g={G} />
      <div className="relative z-10 min-h-screen grid md:grid-cols-2">
        <div className={`brandpanel hidden md:flex flex-col justify-between p-12 ${G.reveal ? "boot" : ""}`} onPointerMove={stageMove} onPointerLeave={stageLeave}>{G.reveal && <i className="boot-run" aria-hidden="true" />}<PanelArt art={G.art} anim={G.pulses} speed={G.spd} fps={G.fps} />
          {d3live ? (
            // diorama: lo schema elettrico resta sul fondo; marchio, logo, titolo e sottotitolo galleggiano a profondità diverse
            <div className="l3d">
              <span className="zl block" style={{ ["--z" as any]: "16px" }}><Wordmark light size={56} fs={26} onLogo={eggLogin} /></span>
              {/* logo e titolo in un'unica colonna al centro del pannello: vicino al centro della prospettiva niente si sposta verso i bordi */}
              <div className="zl l3d-col" style={{ ["--z" as any]: "0px" }}>
                {wide && <span className="zl block relative l3d-logo" style={{ ["--z" as any]: "0px" }} onClick={eggLogin}>
                  <span className="zsh" style={{ left: "18%", width: "64%", bottom: "-4%", height: "14%" }} aria-hidden="true" />
                  <span className="zl block absolute inset-0" style={{ ["--z" as any]: "75px" }}><Logo3D className="logo3d w-full h-full" intro={G.logo} spd={G.spd} fps={G.fps} fallback={<Logo size={120} />} /></span>
                </span>}
                <h1 className="zl hd text-5xl font-bold leading-tight" style={{ ["--z" as any]: "45px" }}><Text3D text="Scrivi senza limiti. Ogni mese emergono i testi migliori." layers={12} anim={G.titles} className="t3-hero t3-glint" delay={300} /></h1>
                <p className="zl mu mt-5 max-w-sm b-2" style={{ ["--z" as any]: "22px" }}>Testo, foto e disegni a mano libera nello stesso foglio. Ogni mese i testi migliori vengono letti e premiati.</p>
              </div>
              <span className="zl mu text-sm" style={{ ["--z" as any]: "8px" }}>Archivio di scrittura</span>
            </div>
          ) : <>
            <Wordmark light size={56} fs={26} onLogo={eggLogin} />
            <div>
              <h1 className="hd text-5xl font-bold leading-tight max-w-md">{G.d3 ? <Text3D text="Scrivi senza limiti. Ogni mese emergono i testi migliori." layers={12} anim={G.titles} className="t3-hero t3-glint" delay={300} /> : <Words text="Scrivi senza limiti. Ogni mese emergono i testi migliori." on={G.titles} />}</h1>
              <p className="mu mt-4 max-w-sm b-2">Testo, foto e disegni a mano libera nello stesso foglio. Ogni mese i testi migliori vengono letti e premiati.</p>
            </div>
            <span className="mu text-sm">Archivio di scrittura</span>
          </>}
        </div>
        <div className="flex items-center justify-center p-6">
          <div className={`w-full ${d3live ? "max-w-md" : "max-w-sm"} pop`}><div className={d3live ? "f3d" : ""}><div className="md:hidden mb-10"><Wordmark stack center size={88} fs={30} onLogo={eggLogin} /></div>
            {resetCode ? (
              <form onSubmit={submitNewPw} className="space-y-4">
                <h2 className="hd text-3xl font-bold mb-2">Scegli una nuova password</h2>
                {Msg}
                <input className="inp" type="password" minLength={6} required autoFocus placeholder="Almeno 6 caratteri" value={f.newPw} onChange={set("newPw")} />
                <button className="bt pri w-full py-3">Aggiorna password</button>
              </form>
            ) : profToken ? (
              <div className="space-y-4">
                <h2 className="hd text-3xl font-bold">Accesso professore</h2>
                {Msg}
                <p className="mu text-sm">Questo link ti apre la modalità professore, senza account né password. Funziona una sola volta: dopo l'uso si disattiva e questo dispositivo resta collegato.</p>
                <button type="button" className="bt pri w-full py-3" onClick={redeemProf}>Entra come professore</button>
                <button type="button" className="mu text-sm lk" onClick={() => { setProfToken(null); setAuthMsg(null); }}>Annulla</button>
              </div>
            ) : (
              <form onSubmit={submitAuth} className="space-y-4">
                <h2 className="hd text-3xl font-bold">{authMode === "login" ? "Bentornato" : authMode === "register" ? "Crea il tuo profilo" : "Recupera l'accesso"}</h2>
                {authMode !== "reset" && (
                  <div className="flex p-1 rounded-xl sf" style={{ background: "var(--sf)", border: "1px solid var(--ln)" }}>
                    {["login", "register"].map((m) => <button type="button" key={m} onClick={() => { setAuthMode(m); setAuthMsg(null); }} className={`bt flex-1 border-0 ${authMode === m ? "" : "!bg-transparent mu"}`}>{m === "login" ? "Accedi" : "Registrati"}</button>)}
                  </div>
                )}
                {Msg}
                {authMode === "register" && <>
                  <div className="grid grid-cols-2 gap-3">
                    <input className="inp" required maxLength={30} placeholder="Nome" autoComplete="given-name" aria-label="Nome" value={f.name} onChange={set("name")} />
                    <input className="inp" required maxLength={30} placeholder="Cognome" autoComplete="family-name" aria-label="Cognome" value={f.surname} onChange={set("surname")} />
                  </div>
                  <p className="mu text-xs -mt-1">Scrivi il tuo vero nome e cognome, così sai chi sei tra i compagni. L'handle (@nome) lo potrai cambiare dal profilo.</p>
                </>}
                <input className="inp" type="email" required placeholder="Email" autoComplete="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={set("email")} />
                {authMode !== "reset" && <div className="relative"><input className="inp !pr-12" type={showPw ? "text" : "password"} required placeholder="Password" autoComplete={authMode === "register" ? "new-password" : "current-password"} value={f.pw} onChange={set("pw")} /><div className="absolute right-1.5 inset-y-0 flex items-center"><button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Nascondi password" : "Mostra password"} className="bt !border-0 !bg-transparent !p-2">{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>}
                <button className="bt pri w-full py-3">{authMode === "login" ? "Entra" : authMode === "register" ? "Crea profilo" : "Invia link di recupero"}</button>
                {authMode === "login" && <button type="button" className="mu text-sm lk" onClick={() => { setAuthMode("reset"); setAuthMsg(null); }}>Password dimenticata?</button>}
                {authMode === "reset" && <button type="button" className="mu text-sm lk" onClick={() => { setAuthMode("login"); setAuthMsg(null); }}>Torna all'accesso</button>}
              </form>
            )}
            {!resetCode && !profToken && <ApkDownload divider />}
            <button type="button" className="bt w-full mt-5" onClick={() => setOptOpen(true)}><Settings size={16} />Opzioni</button>
          </div></div>
        </div>
      </div>
      {egg && <EggPortal origin={egg} onClose={() => setEgg(null)} />}
    </>);
  }

  const nav: any[] = ([
    { id: "home", label: "Panoramica", s: "Home", icon: LayoutDashboard },
    { id: "write", label: editingId ? "Modifica" : "Nuovo progetto", s: editingId ? "Modifica" : "Nuovo", icon: Pen },
    { id: "my_pages", label: "I miei progetti", s: "Miei", icon: Bookmark },
    ...(isAdmin ? [
      { id: "read", label: "Tutti gli scritti", s: "Tutti", icon: Activity },
      { id: "podio", label: "Podio del mese", s: "Podio", icon: Trophy }, { id: "authors", label: "Autori", icon: Users },
    ] : []),
  ]).filter((n: any) => !isProf || (n.id !== "my_pages" && (n.id !== "write" || !!editingId))); // il professore non scrive progetti suoi: può solo correggere
  const monthOpts: string[] = Array.from(new Set<string>(items.map((t: any) => mKey(t.timestamp)))).sort().reverse();
  const monthNow = mKey(Date.now());
  const thisMonth = items.filter((t) => mKey(t.timestamp) === monthNow);
  const myName = isProf ? "Professore" : (profiles[user.uid]?.displayName || user.displayName || "Operatore");
  const first = myName.split(" ")[0];
  const dn = (uid: string, fb: string) => profiles[uid]?.displayName || fb;
  const hid = (t: any) => isAdmin && !t.svelato && t.userId !== user.uid;
  const Who = ({ t, size }: any) => hid(t)
    ? <span className="rounded-full shrink-0 inline-flex items-center justify-center" style={{ width: size, height: size, background: "var(--sf)", border: "1px dashed var(--mu)" }}><EyeOff size={size * 0.5} className="mu" /></span>
    : <Avatar p={profiles[t.userId]} name={t.author} size={size} />;
  const wn = (t: any) => hid(t) ? "Autore nascosto" : dn(t.userId, t.author);
  const unread = notifs.filter((n) => !n.letta).length;
  const bell = (r: boolean) => (
    <Pop label="Notifiche" right={r} cls="bt !p-2 relative" tour="bell" trigger={<><Bell size={18} />{unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: "var(--am)", color: "#3b2a00" }}>{unread}</span>}</>}>
      {(close: any) => <NotifPanel list={notifs} onRead={markRead} onOpen={() => { close(); go("my_pages"); }} />}
    </Pop>
  );
  const wc = (t: any) => wordCounts.get(t.id) || 0;
  const Row = ({ t, rank, i = 0 }: any) => (
    <button key={t.id} data-doc={t.id} onClick={(e) => openView(t, e)} className="nv idx w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-colors" style={{ ["--i" as any]: i }}>
      {rank && <span className="hd w-8 text-center font-bold mu">{rank}</span>}
      <Who t={t} size={36} />
      <div className="flex-1 min-w-0"><div className="font-semibold truncate">{t.title}</div><div className="mu text-xs">{wn(t)} · {fmtDate(t.timestamp)}</div></div>
      {isAdmin && <Stars v={t.rating || 0} size={14} />}
    </button>
  );

  const startEditProf = () => {
    const p = profiles[user.uid] || {};
    setPf({ displayName: p.displayName || user.displayName || "", handle: p.handle || "", status: p.status || "", bio: p.bio || "", avatar: p.avatar || "", banner: p.banner || "teal", bannerImg: p.bannerImg || "", bannerY: typeof p.bannerY === "number" ? p.bannerY : 50 });
    setEditProf(true);
  };
  const pickBanner = async (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const img = await bannerFrom(f); setPf((q: any) => ({ ...q, bannerImg: img, bannerY: 50 })); } catch { notify("Immagine non valida o troppo pesante."); }
    e.target.value = "";
  };
  const pickAvatar = async (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { setPf({ ...pf, avatar: await avatarFrom(f) }); } catch { notify("Immagine non valida."); }
    e.target.value = "";
  };
  const saveProf = async (e: any) => {
    e.preventDefault();
    const name = tidyName(pf.displayName || "");
    const prev = (profiles[user.uid]?.displayName || user.displayName || "").trim();
    // nome e cognome si possono correggere, ma non sostituire con un soprannome; chi ha già un nome salvato può lasciarlo com'è
    if (!name) return notify("Il nome non può essere vuoto.");
    if (name !== prev && (name.split(" ").length < 2 || !okName(name.replace(/ /g, "")))) return notify("Scrivi nome e cognome, senza numeri o simboli.");
    const data = { displayName: name, handle: (pf.handle || "").trim(), status: (pf.status || "").trim(), bio: (pf.bio || "").trim(), avatar: pf.avatar || "", banner: pf.banner || "teal",
      createdAt: profiles[user.uid]?.createdAt || Date.now(), updatedAt: Date.now() } as any;
    // l'immagine della copertina si scrive solo se c'è: senza, il documento resta valido anche con le vecchie regole
    if (pf.bannerImg) { data.bannerImg = pf.bannerImg; data.bannerY = Math.max(0, Math.min(100, Number(pf.bannerY ?? 50))); }
    try { await setDoc(doc(db, "profili", user.uid), data); if (name !== user.displayName) await updateProfile(user, { displayName: name }); setEditProf(false); notify("Profilo aggiornato."); }
    catch { notify(pf.bannerImg ? "Salvataggio non riuscito: pubblica le nuove regole di Firestore per usare una copertina personale." : "Salvataggio del profilo non riuscito."); }
  };
  const fld = (label: string, key: string, ph = "", max = 60, fmt?: (v: string) => string) => (
    <label className="block"><span className="text-xs mu">{label}</span>
      <input className="inp mt-1" maxLength={max} placeholder={ph} value={pf[key] || ""} onChange={(e) => setPf({ ...pf, [key]: fmt ? fmt(e.target.value) : e.target.value })} /></label>
  );
  const profileView = (uid: string, own: boolean) => {
    const p = profiles[uid] || {};
    const name = p.displayName || (own ? user.displayName : items.find((t) => t.userId === uid)?.author) || "Operatore";
    const mine = items.filter((t) => t.userId === uid);
    const showStats = own || (isAdmin && ["read", "home", "podio", "authors"].includes(tab));
    const words = mine.reduce((a, t) => a + wc(t), 0);
    const badges = [mine.length >= 1 && "Primo scritto", mine.length >= 5 && "Costante", mine.length >= 20 && "Prolifico", mine.some((t) => t.strokes?.length) && "Disegnatore", mine.some((t) => /<img/.test(t.content || "")) && "Fotografo", words >= 1000 && "Mille parole"].filter(Boolean) as string[];
    const bn = BANNERS.find((b) => b.id === (own && editProf ? pf.banner : p.banner)) || BANNERS[0];
    const ts = own ? (user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0) : p.createdAt;
    const shownAvatar = own && editProf ? { avatar: pf.avatar } : p;
    const src = own && editProf ? pf : p;
    const bImg = typeof src.bannerImg === "string" && /^data:image\//.test(src.bannerImg) ? src.bannerImg : "";
    return (
      <div>
        <div className="relative h-32 md:h-40 overflow-hidden" style={{ background: bn.g }}>
          {bImg && <img src={bImg} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `50% ${typeof src.bannerY === "number" ? src.bannerY : 50}%` }} />}
        </div>
        <div className="px-5 md:px-8 pb-7">
          <div className="relative z-10 flex items-end justify-between -mt-12">
            <span className="spinring"><span className="block rounded-full p-1" style={{ background: "var(--pn)" }}><Avatar p={shownAvatar} name={name} size={96} /></span></span>
            {own && !editProf && <button className="bt" onClick={startEditProf}><Pencil size={15} />Modifica profilo</button>}
          </div>
          {own && editProf ? (
            <form onSubmit={saveProf} className="space-y-4 mt-5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="bt cursor-pointer"><Camera size={15} />Cambia foto<input type="file" accept="image/*" className="hidden" onChange={pickAvatar} /></label>
                {pf.avatar && <button type="button" className="bt dng" onClick={() => setPf({ ...pf, avatar: "" })}>Rimuovi</button>}
              </div>
              <div><span className="text-xs mu">Copertina</span>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <label className="bt cursor-pointer"><ImageIcon size={15} />{pf.bannerImg ? "Cambia immagine" : "Carica immagine"}<input type="file" accept="image/*" className="hidden" onChange={pickBanner} /></label>
                  {pf.bannerImg && <button type="button" className="bt dng" onClick={() => setPf({ ...pf, bannerImg: "", bannerY: 50 })}>Rimuovi</button>}
                </div>
                {pf.bannerImg && <Rng label="Posizione dell'immagine" hint="Sposta su o giù la parte che resta visibile" v={pf.bannerY ?? 50} set={(v: number) => setPf({ ...pf, bannerY: v })} min={0} max={100} step={1} fmt={(v: number) => (v <= 5 ? "In alto" : v >= 95 ? "In basso" : `${v}%`)} />}
                <div className="flex flex-wrap gap-3 mt-3">{BANNERS.map((b) => <button type="button" key={b.id} aria-label={`Copertina ${b.id}`} onClick={() => setPf({ ...pf, banner: b.id, bannerImg: "", bannerY: 50 })} className="sw w-11 h-11 rounded-xl" style={{ background: b.g, boxShadow: !pf.bannerImg && pf.banner === b.id ? "0 0 0 2px var(--pn),0 0 0 4px var(--ac)" : "none" }} />)}</div></div>
              {fld("Nome e cognome", "displayName", "es. Mario Rossi", 60)}
              {fld("Handle", "handle", "es. mario.rossi", 20, (v) => v.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
              {fld("Stato", "status", "es. Scrivo di notte ✍️", 40)}
              <label className="block"><span className="text-xs mu flex justify-between"><span>Bio</span><span>{(pf.bio || "").length}/160</span></span>
                <textarea className="inp mt-1 min-h-[96px]" maxLength={160} placeholder="Raccontati in poche righe" value={pf.bio || ""} onChange={(e) => setPf({ ...pf, bio: e.target.value })} /></label>
              <div className="flex gap-2 justify-end pt-2"><button type="button" className="bt" onClick={() => setEditProf(false)}>Annulla</button><button className="bt on !px-6">Salva profilo</button></div>
            </form>
          ) : (<>
            <h2 className="hd text-2xl md:text-3xl font-bold mt-3">{name}</h2>
            <div className="mu text-sm">{p.handle ? `@${p.handle}` : own ? "Aggiungi un handle" : ""}{p.status ? ` · ${p.status}` : ""}</div>
            {p.bio ? <p className="mt-4 whitespace-pre-line">{p.bio}</p> : own && <p className="mu mt-4 text-sm">Aggiungi una bio per presentarti.</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm mu">
              {ts ? <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} />Membro da {mLabel(mKey(ts))}</span> : null}
            </div>
            {showStats && <div className="grid grid-cols-3 gap-3 mt-6">{[["Scritti", mine.length], ["Parole", words], ["Questo mese", mine.filter((t) => mKey(t.timestamp) === monthNow).length]].map(([l, v]) => <div key={String(l)} className="rounded-xl p-3 text-center" style={{ background: "var(--sf)", border: "1px solid var(--ln)" }}><div className="hd text-2xl font-bold">{v}</div><div className="mu text-xs">{l}</div></div>)}</div>}
            {showStats && badges.length > 0 && <div className="flex flex-wrap gap-2 mt-4">{badges.map((b) => <span key={b} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "color-mix(in srgb,var(--am) 20%,transparent)" }}><Award size={13} />{b}</span>)}</div>}
          </>)}
        </div>
      </div>
    );
  };
  const profilePage = (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="pn overflow-hidden">{profileView(user.uid, true)}</div>
      <button className="bt w-full" onClick={() => setOptOpen(true)}><Settings size={16} />Opzioni</button>
      <ApkDownload className="md:hidden" />
      <button className="bt dng w-full md:hidden" onClick={logout}><LogOut size={16} />Esci dall'account</button>
    </div>
  );

  const stats = isAdmin
    ? [{ l: "Scritti ricevuti", v: items.length, i: Cpu, a: () => go("read") },
      { l: "Autori", v: new Set(items.map((t) => t.userId)).size, i: Users, a: () => go("authors") },
      { l: "Questo mese", v: thisMonth.length, i: Activity, a: () => { go("read"); setMonthFilter(monthNow); } },
      { l: "Da valutare", v: thisMonth.filter((t) => !t.rating).length, i: Star, a: () => { go("read"); setMonthFilter(monthNow); setUnrated(true); } }]
    : [{ l: "I tuoi progetti", v: items.length, i: Bookmark, a: () => go("my_pages") },
      { l: "Questo mese", v: thisMonth.length, i: Activity, a: () => { go("my_pages"); setMonthFilter(monthNow); } },
      { l: "Parole scritte", v: items.reduce((a, t) => a + wc(t), 0), i: Pen, a: () => go("my_pages") }];
  const recent = [...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const heroMove = (e: any) => {
    // si misura sul contenitore e non sul pannello: il pannello si inclina e, all'ingresso, si muove e si rimpicciolisce; il suo rettangolo
    // dà coordinate sbagliate e a mouse fermo l'inclinazione sbagliata restava finché non si rimuoveva il puntatore (o si cambiava pagina)
    const el = e.currentTarget, r = (el.parentElement || el).getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.setProperty("--hx", `${x}px`); el.style.setProperty("--hy", `${y}px`);
    el.style.setProperty("--nx", String((x / r.width - 0.5) * 2)); el.style.setProperty("--ny", String((y / r.height - 0.5) * 2));
  };
  const heroLeave = (e: any) => { ["--nx", "--ny"].forEach((k) => e.currentTarget.style.removeProperty(k)); };
  const toRate = thisMonth.filter((t) => !t.rating).length;
  // primo ingresso della sessione: la corrente percorre il bordo del pannello e lo accende; dopo, la home entra asciutta
  const boot = heroIntro.current && G.reveal;
  // 3D nel pannello: il logo WebGL (non con le animazioni spente), il terminale che batte il comando e risponde con i numeri veri
  const logo3d = G.d3 && !G.nomotion, heroLogoFresh = G.logo;
  const termUser = isAdmin ? "admin" : first.toLowerCase().replace(/[^a-z0-9]/g, "") || "utente", termCmd = isAdmin ? "ls --nuovi" : "scrivi --nuovo";
  const termOut = loading ? "lettura dell'archivio…" : isAdmin
    ? `${thisMonth.length} ${thisMonth.length === 1 ? "scritto" : "scritti"} questo mese · ${toRate} da valutare`
    : `${items.length} ${items.length === 1 ? "progetto" : "progetti"} · ${items.reduce((a, t) => a + wc(t), 0).toLocaleString("it-IT")} parole`;
  const heroTitle = `Ciao ${first}, ${isAdmin ? "ecco cosa è arrivato." : "cosa vuoi scrivere oggi?"}`;
  const homeView = (
    <div className="space-y-8">
      <Reveal fx={boot ? "still" : ""}><div className={`pn brandpanel hero p-8 md:p-12 ${boot ? "boot" : ""} ${logo3d ? "h3d" : ""}`} onPointerMove={heroMove} onPointerLeave={heroLeave}>{boot && <i className="boot-run" aria-hidden="true" />}<HeroRain on={G.rain} speed={G.spd} dens={G.rainD} fps={G.fps} />
        {logo3d ? (wide
          ? <>
            {/* ombra del logo sul pannello: sta sul piano, il logo 90 px sopra; inclinando il pannello si separano */}
            <span className="zsh hidden md:block w-[150px] h-[46px] lg:w-[220px] lg:h-[62px]" style={{ position: "absolute", right: "min(9%, 70px)", top: "calc(50% + 110px)" }} aria-hidden="true" />
            <span className="zl block w-[230px] h-[230px] lg:w-[340px] lg:h-[340px]" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", ["--z" as any]: "150px" }} onClick={eggHome}><React.Suspense fallback={<span className="hero-logo block"><Logo size={170} /></span>}><Logo3D className="logo3d w-full h-full" intro={heroLogoFresh} spd={G.spd} fps={G.fps} fallback={<span className="hero-logo block"><Logo size={170} /></span>} /></React.Suspense></span>
          </>
          : <span className="zl block mb-3 w-[132px] h-[132px]" style={{ ["--z" as any]: "60px" }} onClick={eggHome}><React.Suspense fallback={<Logo size={76} />}><Logo3D className="logo3d w-full h-full" intro={heroLogoFresh} spd={G.spd} fps={G.fps} fallback={<Logo size={76} />} /></React.Suspense></span>
        ) : <><span className="hidden md:block" style={{ position: "absolute", right: 48, top: "50%", transform: "translateY(-50%)" }}><span className={`hero-logo block ${boot ? "hero-logo-in" : ""}`} onClick={eggHome}><Logo size={170} /></span></span><span className="md:hidden block mb-5" onClick={eggHome}><Logo size={76} /></span></>}
        {G.d3
          ? <div className="b-1 zl relative z-[1] w-fit max-w-full" style={{ ["--z" as any]: "100px" }}>{logo3d && <i className="zsh-rect" style={{ ["--sd" as any]: "-100px" }} aria-hidden="true" />}<Terminal3D user={termUser} cmd={termCmd} out={termOut} run={!G.nomotion} delay={boot ? 1150 : 380} /></div>
          : <div className="b-1"><span className="hero-term"><i className="hero-led" />{termUser + "@circuito:~$ " + termCmd}<b className="caret" /></span></div>}
        <h2 className="zl hd text-3xl md:text-5xl font-bold max-w-xl leading-tight relative z-[1]" style={{ ["--z" as any]: "70px" }}>{G.d3 ? <Text3D text={heroTitle} layers={12} anim={G.titles} className="t3-hero t3-glint" delay={boot ? 420 : 0} /> : <Words text={heroTitle} on={G.titles} />}</h2>
        <p className="zl mu mt-3 max-w-md b-2" style={{ ["--z" as any]: "40px" }}>{isAdmin ? `Ci sono ${thisMonth.filter((t) => !t.rating).length} scritti di ${mLabel(monthNow)} ancora senza voto.` : "Scrivi liberamente, aggiungi foto e disegni. A fine mese gli scritti vengono letti e i migliori selezionati."}</p>
        <div className="zl flex flex-wrap gap-2 mt-7 b-3" style={{ ["--z" as any]: "55px" }} data-tour="hero-actions" data-tour-fit="">
          <button className="bt cta !px-5 !py-3" onClick={() => go("write")} data-tour="cta" data-snd="nav"><Pen size={16} />Scrivi un progetto</button>
          {isAdmin && toRate > 0 && <button className="bt ghost !px-5 !py-3" onClick={() => { go("read"); setMonthFilter(monthNow); setUnrated(true); }}><Star size={16} />Valuta ora ({toRate})</button>}
          {isAdmin && <button className="bt ghost !px-5 !py-3" onClick={() => go("podio")}><Trophy size={16} />Vai al podio</button>}
        </div>
      </div></Reveal>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((x, i) => <Reveal key={x.l} delay={(boot ? 620 : 0) + i * 70} className="h-full"><button type="button" onClick={x.a} data-snd="nav" className="pn card stat p-5 h-full w-full"><ArrowUpRight size={18} className="go" aria-hidden="true" /><x.i size={18} className="mu" /><div className="hd text-4xl font-bold mt-3 tabular-nums"><CountUp v={x.v} on={G.reveal} delay={(boot ? 620 : 0) + i * 70 + 150} /></div><div className="mu text-sm">{x.l}</div></button></Reveal>)}
      </div>
      <Reveal delay={boot ? 820 : 0}><div className="pn p-2">
        <div className="flex items-center justify-between px-4 pt-4 pb-2"><h3 className="hd text-lg font-bold">Ultimi progetti</h3><button type="button" data-snd="nav" className="mu text-sm lk inline-flex items-center gap-1" onClick={() => go(isAdmin ? "read" : "my_pages")}>Vedi tutti<ArrowUpRight size={14} /></button></div>
        {loading ? <div className="p-6 flex justify-center"><Loader2 className="animate-spin" style={{ color: "var(--ac)" }} /></div>
          : recent.length === 0 ? <p className="mu text-sm px-4 pb-5">Ancora niente qui. Il primo progetto comparirà in questa lista.</p>
          : recent.map((t, i) => <Row key={t.id} t={t} i={i} />)}
      </div></Reveal>
    </div>
  );

  const mItems = items.filter((t) => mKey(t.timestamp) === month);
  const ranked = mItems.filter((t) => t.rating > 0 || t.isStarred).sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.isStarred ? 1 : 0) - (a.isStarred ? 1 : 0) || a.timestamp - b.timestamp);
  const top = ranked.slice(0, 3), rest = ranked.slice(3);
  const shiftM = (d: number) => { const [y, m] = month.split("-").map(Number); setMonth(mKey(new Date(y, m - 1 + d, 1).getTime())); };
  const podioView = (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-2">
          <button className="bt !p-2.5" onClick={() => shiftM(-1)} aria-label="Mese precedente"><ChevronLeft size={16} /></button>
          <span className="hd text-xl font-bold capitalize min-w-[190px] text-center">{mLabel(month)}</span>
          <button className="bt !p-2.5" onClick={() => shiftM(1)} aria-label="Mese successivo"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-3 text-sm mu">
          <span>{mItems.length} scritti · {mItems.filter((t) => !t.rating).length} da valutare</span>
          <button className="bt" onClick={() => { setTab("read"); setMonthFilter(month); setSortBy("newest"); }}>Valuta ora</button>
        </div>
      </div>
      {loading ? <div className="py-24 flex justify-center"><Loader2 className="animate-spin" style={{ color: "var(--ac)" }} /></div>
        : ranked.length === 0 ? (
          <div className="pn p-12 text-center max-w-md mx-auto"><Trophy className="mx-auto mb-4 mu" size={36} />
            <h3 className="hd text-xl font-bold mb-1">Nessun finalista per {mLabel(month)}</h3>
            <p className="mu text-sm mb-5">Dai un voto da 1 a 5 stelle agli scritti: i più votati salgono qui sul podio.</p>
            <button className="bt pri" onClick={() => { setTab("read"); setMonthFilter(month); }}>Apri gli scritti del mese</button></div>
        ) : (<>
          <div className="grid md:grid-cols-3 gap-5 items-end">
            {[1, 0, 2].map((k) => { const t = top[k]; if (!t) return <div key={k} className="hidden md:block" />;
              return (
                <Reveal key={t.id} delay={k * 120}>
                  <div data-doc={t.id} onClick={(e) => openView(t, e)} className={`pn card cursor-pointer p-6 ${k === 0 ? "md:pt-10 md:pb-16 spin-b" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="hd w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: k === 0 ? "var(--am)" : "var(--sf)", color: k === 0 ? "#3b2a00" : "var(--ink)" }}>{k + 1}</span>
                      <Stars v={t.rating || 0} size={16} />
                    </div>
                    <h3 className="hd text-xl font-bold mt-5 line-clamp-2">{t.title}</h3>
                    <div className="flex items-center gap-2 mt-2"><Who t={t} size={24} /><span className="mu text-sm">{wn(t)}</span></div>
                    <p className="mu text-sm mt-3 line-clamp-3">{plain(t.content)}</p>
                  </div>
                </Reveal>
              ); })}
          </div>
          {rest.length > 0 && <Reveal className="mt-8"><div className="pn p-2"><h3 className="hd text-lg font-bold px-4 pt-4 pb-2">In lizza</h3>{rest.map((t, i) => <Row key={t.id} t={t} rank={i + 4} i={i} />)}</div></Reveal>}
        </>)}
    </div>
  );

  const authors: any[] = Object.values(items.filter((t) => t.svelato || t.userId === user.uid).reduce((m: any, t) => { const k = t.userId || t.author; const a = (m[k] = m[k] || { name: dn(t.userId, t.author || "?"), uid: t.userId, n: 0, r: [], last: 0 }); a.n++; if (t.rating) a.r.push(t.rating); a.last = Math.max(a.last, t.timestamp); return m; }, {}))
    .map((a: any) => ({ ...a, avg: a.r.length ? a.r.reduce((x: number, y: number) => x + y, 0) / a.r.length : 0 })).sort((a: any, b: any) => b.n - a.n);
  const authorsView = loading ? <div className="py-24 flex justify-center"><Loader2 className="animate-spin" style={{ color: "var(--ac)" }} /></div> : authors.length === 0 ? (
    <div className="pn p-12 text-center max-w-md mx-auto"><Users className="mx-auto mb-4 mu" size={36} /><h3 className="hd text-xl font-bold">Ancora nessun autore</h3><p className="mu text-sm mt-1">Compariranno dopo lo svelamento del loro primo scritto.</p></div>
  ) : (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {authors.map((a, i) => (
        <Reveal key={a.name + i} delay={(i % 3) * 90} className="h-full">
          <div className="pn card h-full p-6 cursor-pointer" onClick={() => { setTab("read"); setSearch(a.name); setMonthFilter("all"); }}>
            <div className="flex items-center gap-4">
              <button type="button" aria-label="Apri profilo" onClick={(e) => { e.stopPropagation(); setViewProf(a.uid); }}><Avatar p={profiles[a.uid]} name={a.name} size={48} /></button>
              <div className="min-w-0"><div className="hd font-bold text-lg truncate">{a.name}</div><div className="mu text-xs">Ultimo invio {fmtDate(a.last)}</div></div>
            </div>
            <div className="flex justify-between items-end mt-6">
              <div><div className="hd text-3xl font-bold">{a.n}</div><div className="mu text-xs">{a.n === 1 ? "scritto" : "scritti"}</div></div>
              <div className="text-right"><Stars v={Math.round(a.avg)} size={14} /><div className="mu text-xs mt-1">{a.avg ? `media ${a.avg.toFixed(1)}` : "senza voti"}</div></div>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
  const titles: any = { write: editingId ? "Modifica progetto" : "Nuovo progetto", my_pages: "I miei progetti", read: "Tutti gli scritti", home: "Panoramica", profile: "Il tuo profilo", podio: "Podio del mese", authors: "Autori" };
  const isList = ["my_pages", "read"].includes(tab);

  return shell(
    <>
      <Backdrop tab={tab} fx={G.pulses || G.sparks} dark={dark} art={G.art} g={G} />
      {/* sidebar desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col p-5 gap-1 pn !rounded-none !border-y-0 !border-l-0 z-20">
        <div className="flex items-center gap-2.5 mb-8 cursor-pointer select-none" title="Il Circuito">
          <Wordmark stack size={52} fs={22} />
          <div className="ml-auto self-start">{bell(false)}</div>
        </div>
        <div ref={railV} className="relative flex flex-col gap-1">
          <span className="nind" aria-hidden="true" />
          {nav.map((n) => <button key={n.id} data-act={tab === n.id ? "1" : undefined} data-tour={"nav-" + n.id} data-snd="nav" aria-current={tab === n.id ? "page" : undefined} onClick={() => go(n.id)} className={`bt nb !justify-start w-full ${tab === n.id ? "act" : ""}`}><n.icon size={16} />{n.label}</button>)}
        </div>
        <div className="mt-auto space-y-2">
          <ApkDownload compact />
          <div className="flex items-center gap-2">
            <button onClick={() => go("profile")} data-snd="nav" className="nv flex-1 min-w-0 flex items-center gap-2.5 text-left rounded-xl p-1.5"><Avatar p={profiles[user.uid]} name={myName} size={36} /><span className="min-w-0 text-sm"><span className="block font-semibold truncate">{myName}</span><span className="block mu text-xs truncate">{isProf ? "Accesso professore" : user.email}</span></span></button>
            <button className="bt !p-2" onClick={() => setOptOpen(true)} title="Opzioni" aria-label="Opzioni" data-tour="options"><Settings size={18} /></button>
            <button className="bt !p-2" onClick={logout} title="Esci"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* barra mobile */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 pn !rounded-none !border-x-0 !border-t-0 sticky top-0 z-30 hdr">
        <div className="flex items-center gap-2"><Wordmark size={40} fs={19} tag={false} /></div>
        <div className="flex items-center gap-2">{bell(true)}<button className="bt !p-2" onClick={() => setOptOpen(true)} aria-label="Opzioni" data-tour="options"><Settings size={18} /></button><button onClick={() => go("profile")} data-snd="nav" aria-label="Profilo" className="rounded-full" style={tab === "profile" ? { boxShadow: "0 0 0 2px var(--ac)" } : {}}><Avatar p={profiles[user.uid]} name={myName} size={40} /></button></div>
      </header>
      <nav ref={railH} className="md:hidden fixed bottom-0 inset-x-0 z-30 pn hdr !rounded-none !border-x-0 !border-b-0 flex gap-1 px-2 pt-2" style={{ paddingBottom: "calc(.5rem + env(safe-area-inset-bottom))", display: kb || (tab === "write" && drawing) ? "none" : undefined }}>
        <span className="nind" aria-hidden="true" />
        {nav.map((n) => <button key={n.id} data-act={tab === n.id ? "1" : undefined} data-tour={"nav-" + n.id} data-snd="nav" aria-current={tab === n.id ? "page" : undefined} onClick={() => go(n.id)} aria-label={n.label} className={`bt nb flex-col flex-1 min-w-0 !gap-1 !px-0 !py-2 !text-[10px] ${tab === n.id ? "act" : ""}`}><n.icon size={18} /><span className="truncate max-w-full">{n.s || n.label}</span></button>)}
      </nav>

      <div className="md:ml-60 pb-28 md:pb-12 relative">
        <div key={tab} className="pg max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12" style={{ ["--pdx" as any]: `${pdx.current}px` }}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div><h1 className="hd text-3xl md:text-5xl font-bold">{G.d3 ? <Text3D text={titles[tab]} layers={9} anim={G.titles} className="t3-ink" /> : <Words text={titles[tab]} on={G.titles} />}</h1>{isList && !loading && <p className="mu text-sm mt-1.5" aria-live="polite"><span key={shown.length} className="tick-n">{shown.length}</span> {shown.length === 1 ? "progetto" : "progetti"}</p>}</div>
            {isList && (
              <div className="flex flex-wrap gap-2 items-center" data-tour="filters">
                <div className="relative w-full sm:w-auto"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 mu" /><input className="inp !pl-9 !pr-9 !w-full sm:!w-52" placeholder="Cerca" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button type="button" onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 mu"><X size={15} /></button>}</div>
                <select className="inp !w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{Object.keys(SORTS).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}</select>
                <select className="inp !w-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}><option value="all">Tutti i mesi</option>{monthOpts.map((k) => <option key={k} value={k}>{mLabel(k)}</option>)}</select>
                {isAdmin && tab === "read" && <select className="inp !w-auto" value={statoF} onChange={(e) => setStatoF(e.target.value)}><option value="all">Tutti gli stati</option>{STATI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                {isAdmin && tab === "read" && <button className={`bt ${onlyMarked ? "on" : ""}`} onClick={() => setOnlyMarked(!onlyMarked)}><Bookmark size={15} style={onlyMarked ? { fill: "currentColor" } : {}} />Segnalati{items.some((t) => t.isStarred) ? ` (${items.filter((t) => t.isStarred).length})` : ""}</button>}
                {isAdmin && tab === "read" && <button className={`bt ${unrated ? "on" : ""}`} onClick={() => setUnrated(!unrated)}><Star size={15} style={unrated ? { fill: "currentColor" } : {}} />Da valutare</button>}
                {items.length > 0 && <button className={`bt ${selMode ? "on" : ""}`} onClick={() => { setSelMode(!selMode); setIds([]); }}><ListChecks size={15} />{selMode ? "Fine" : "Seleziona"}</button>}
              </div>
            )}
          </div>
          <i className="pg-trace" aria-hidden="true" />

          {tab === "home" && homeView}
          {tab === "profile" && profilePage}
          {tab === "podio" && podioView}
          {tab === "authors" && authorsView}
          {/* LISTA */}
          {isList && (loading ? (
            <Sheets />
          ) : shown.length === 0 ? (
            <div className="pn p-12 text-center max-w-md mx-auto up">
              <Cpu className="mx-auto mb-4 mu" size={36} />
              <h3 className="hd text-xl font-bold mb-1">{search ? "Nessun risultato" : "Ancora nessun progetto"}</h3>
              <p className="mu text-sm mb-5">{search ? "Prova con un'altra parola." : "Crea il primo: puoi scrivere, aggiungere foto e disegnare."}</p>
              {!search && <button className="bt pri" onClick={() => go("write")}><Plus size={15} />Nuovo progetto</button>}
            </div>
          ) : (
            <><div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {shown.slice(0, visible).map((t, i) => {
                const picked = ids.includes(t.id), { w, h } = dims(t);
                // ritmo d'ingresso: onda diagonale (riga + colonna) sulle prime due righe; più giù, mentre scorri, solo lo sfasamento di colonna
                const j = i % 18, wave = (j % 3) * 65 + (j < 6 ? Math.floor(j / 3) * 65 : 0);
                return (
                  <Reveal key={t.id} flip={t.id} delay={wave} fx="sheet" className="h-full"><article data-doc={t.id} onClick={(e) => selMode ? setIds((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]) : openView(t, e)}
                    className={`pn card h-full overflow-hidden cursor-pointer ${gone.includes(t.id) ? "gone" : ""} ${picked ? "!border-[var(--ac)] ring-2 ring-[var(--ac)]" : ""}`}>
                    <div className="paper mm sm relative h-40 overflow-hidden">
                      <div className="thumb absolute inset-0">
                        {t.strokes?.length > 0 && <Drawing strokes={t.strokes} w={w} h={h} className="absolute inset-0 w-full" />}
                        <p className="relative p-3 text-[13px] leading-[22px] line-clamp-5" style={{ overflowWrap: "anywhere" }}>{t._tx.slice(0, 260) || (t._img ? "Contenuto con immagini" : "")}</p>
                      </div>
                      {isAdmin && vals[t.id]?.stato && vals[t.id].stato !== "da_leggere" && <span className="absolute top-2 left-2 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: vals[t.id].stato === "scelto" ? "var(--am)" : "rgba(255,255,255,.92)", color: vals[t.id].stato === "scelto" ? "#3b2a00" : "#0E1F1D", boxShadow: "var(--sh1)" }}>{STATI.find(([k]) => k === vals[t.id].stato)?.[1]}</span>}
                      {selMode && <div className="absolute top-2 right-2">{picked ? <CheckCircle2 className="fill-white" style={{ color: "var(--ac)" }} /> : <Circle className="text-slate-400" />}</div>}
                      {isAdmin && !selMode && <button type="button" aria-label="Segnalibro" title={t.isStarred ? "Rimuovi segnalibro" : "Aggiungi segnalibro"} onClick={(e) => { e.stopPropagation(); star(t); }} className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ background: "rgba(255,255,255,.92)", boxShadow: "var(--sh1)" }}><Bookmark size={16} style={t.isStarred ? { fill: "var(--ac)", color: "var(--ac)" } : { color: "#64748b" }} /></button>}
                    </div>
                    <div className="meta p-5 border-t" style={{ borderColor: "var(--ln)" }}>
                      <h2 className="hd font-bold text-lg leading-snug line-clamp-1">{t.title}</h2>
                      <div className="mt-2 flex items-center gap-2 mu text-xs"><Who t={t} size={22} /><span className="truncate flex-1">{wn(t)}</span><span className="shrink-0">{fmtDate(t.timestamp)}</span></div>
                      {isAdmin && <div className="mt-3"><Stars v={t.rating || 0} onSet={t.svelato ? undefined : (n: number) => rate(t, n)} size={15} /></div>}
                      {!isAdmin && t.svelato && t.rating > 0 && <div className="mt-3 flex items-center gap-2"><Stars v={t.rating} size={15} /><span className="mu text-xs">voto ricevuto</span></div>}
                    </div>
                  </article></Reveal>
                );
              })}
            </div>
            {shown.length > visible && <div className="flex justify-center mt-8"><button className="bt !px-6 !py-3" onClick={() => setVisible((v) => v + 18)}>Mostra altri ({shown.length - visible})</button></div>}
            </>
          ))}

          {/* EDITOR */}
          {tab === "write" && (
            <form onSubmit={submit} className="space-y-4 fadein">
              <input className="inp !text-xl !py-3 hd font-bold" placeholder="Nome del progetto" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <div className="pn">
                <div className="p-2 rounded-t-[17px]" style={{ background: "var(--sf)" }}>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl" style={{ background: "var(--ln)" }} data-tour="editor-mode">
                    <button type="button" className={`bt !border-0 ${!drawing ? "on" : "!bg-transparent"}`} onClick={() => setDrawing(false)}><Type size={16} />Testo</button>
                    <button type="button" className={`bt !border-0 ${drawing ? "on" : "!bg-transparent"}`} onClick={() => { setDrawing(true); setImg(null); }}><Pencil size={16} />Disegno</button>
                  </div>
                </div>
                <div className="tbw sticky top-[64px] md:top-0 z-[35] p-2 pt-0 space-y-2 border-b" data-hide={tbHidden ? "1" : undefined} style={{ borderColor: "var(--ln)", background: "var(--sf)" }} onPointerDown={(e) => { tbTouch.current = Date.now(); const t = (e.target as any).tagName; if (t !== "INPUT" && t !== "SELECT") e.preventDefault(); }} onMouseDown={(e) => { const t = (e.target as any).tagName; if (t !== "INPUT" && t !== "SELECT") e.preventDefault(); }}>
                  {!drawing ? (<>
                    <div className="grid grid-cols-7 gap-1.5 pt-2">
                      <TB on={fmt.b} fn={() => cmd("bold")} icon={Bold} label="Grassetto" />
                      <TB on={fmt.i} fn={() => cmd("italic")} icon={Italic} label="Corsivo" />
                      <TB on={fmt.u} fn={() => cmd("underline")} icon={Underline} label="Sottolineato" />
                      <TB on={fmt.size !== "n"} open={panel === "size"} fn={() => setPanel(panel === "size" ? null : "size")} icon={AaIcon} label="Dimensione del testo" />
                      <TB fn={() => cmd("insertUnorderedList")} icon={List} label="Elenco" />
                      <TB on={!!fmt.color && fmt.color !== INK_COLORS[0].id} open={panel === "color"} fn={() => setPanel(panel === "color" ? null : "color")} icon={Palette} label="Colore del testo"
                        badge={fmt.color && fmt.color !== INK_COLORS[0].id ? <span className="absolute left-1/2 -translate-x-1/2 bottom-1 h-[3px] w-4 rounded-full" style={{ background: fmt.color, boxShadow: "0 0 0 1px rgba(255,255,255,.7)" }} /> : null} />
                      <label className="bt !min-w-0 !px-0 cursor-pointer" title="Inserisci foto"><ImageIcon size={18} /><input type="file" accept="image/*" className="hidden" onChange={addImage} /></label>
                    </div>
                    {panel === "size" && <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Dimensione del testo">
                      {SIZES.map((z) => <button type="button" key={z.id} aria-pressed={fmt.size === z.id} onClick={() => setFmtSize(fmt.size === z.id ? "n" : z.id)} className={`bt tb !min-w-0 !px-1 !gap-1 flex-col !py-1 ${fmt.size === z.id ? "on" : ""}`}><span style={{ fontSize: z.px, fontWeight: 700, lineHeight: 1 }}>A</span><span className="text-[10px] leading-none opacity-80">{z.label}</span></button>)}
                    </div>}
                    {panel === "color" && <div className="swr flex gap-2.5 overflow-x-auto py-1.5" role="group" aria-label="Colore del testo">
                      {INK_COLORS.map((c) => { const cur = (fmt.color || INK_COLORS[0].id) === c.id; return <button type="button" key={c.id} aria-label={c.name} aria-pressed={cur} title={c.name} onClick={() => setFmtColor(c.id)} className="sws rounded-full w-9 h-9 shrink-0" style={{ background: c.id, boxShadow: cur ? `0 0 0 2px var(--sf),0 0 0 4px ${c.id}` : "inset 0 0 0 1px rgba(128,128,128,.5)" }} />; })}
                    </div>}
                    {img && <div className="flex items-center gap-1.5">
                      {["25%", "50%", "75%", "100%"].map((w) => <button type="button" key={w} className="bt flex-1 !min-w-0 !px-0 !text-xs" onClick={() => resizeImg(w)}>{w}</button>)}
                      <button type="button" className="bt dng !px-0 !min-w-0 w-11 shrink-0" onClick={removeImg} aria-label="Elimina immagine"><Trash2 size={16} /></button>
                    </div>}
                  </>) : (<>
                    <div className="grid grid-cols-7 gap-1.5 pt-2">{TOOLS.map((t) => <TB key={t.id} on={tool === t.id} fn={() => setTool(t.id)} icon={t.icon} label={t.label} />)}</div>
                    <div className="flex items-center gap-1.5">
                      <Pop label="Colore e spessore" wrap="flex-1 min-w-0" cls="bt w-full !justify-start" trigger={<>
                        <span className="w-5 h-5 rounded-full shrink-0" style={tool === "eraser" ? { border: "2px solid currentColor" } : { background: color, boxShadow: "inset 0 0 0 1px rgba(128,128,128,.5)" }} />
                        <span className="truncate">{TOOLS.find((t) => t.id === tool)?.label}{tool !== "hand" && ` · ${tool === "eraser" ? eraser : size}px`}</span></>}>
                        <div className="space-y-5">
                          {tool !== "eraser" && tool !== "hand" && <div><span className="text-xs mu">Colore</span><div className="mt-2"><Swatches value={color} onPick={setColor} /></div></div>}
                          {tool !== "hand" && <label className="block"><span className="flex justify-between text-sm"><span>Spessore</span><b>{tool === "eraser" ? eraser : size}px</b></span>
                            <input type="range" className="w-full h-9 accent-teal-600" min={tool === "eraser" ? 5 : 1} max={tool === "eraser" ? 100 : 40} value={tool === "eraser" ? eraser : size} onChange={(e) => tool === "eraser" ? setEraser(+e.target.value) : setSize(+e.target.value)} /></label>}
                          {tool !== "eraser" && tool !== "hand" && <label className="block"><span className="flex justify-between text-sm"><span>Opacità</span><b>{opacity}%</b></span>
                            <input type="range" className="w-full h-9 accent-teal-600" min={5} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>}
                          {(tool === "rect" || tool === "ellipse") && <label className="flex items-center justify-between text-sm"><span>Riempi la forma</span><input type="checkbox" className="w-6 h-6 accent-teal-600" checked={filled} onChange={(e) => setFilled(e.target.checked)} /></label>}
                          {tool === "hand" ? <p className="mu text-sm">Con "Scorri" il dito sposta la pagina senza disegnare.</p>
                            : <div className="paper rounded-xl h-16 flex items-center justify-center"><span className="rounded-full" style={tool === "eraser" ? { width: Math.min(eraser, 56), height: Math.min(eraser, 56), border: "2px solid #64748b" } : { width: Math.min(size, 48), height: Math.min(size, 48), background: color, opacity: opacity / 100 }} /></div>}
                        </div>
                      </Pop>
                      <button type="button" className="bt !px-0 !min-w-0 w-11 shrink-0" disabled={!hist.length} onClick={undo} aria-label="Annulla"><Undo size={18} /></button>
                      <button type="button" className="bt !px-0 !min-w-0 w-11 shrink-0" disabled={!fut.length} onClick={redo} aria-label="Ripeti"><Redo size={18} /></button>
                      <button type="button" className="bt dng !px-0 !min-w-0 w-11 shrink-0" disabled={!strokes.length} onClick={() => { snap(); setStrokes([]); }} aria-label="Svuota il disegno"><Trash2 size={18} /></button>
                    </div>
                  </>)}
                </div>

                <div ref={canvasRef} className={`paper relative ${grid ? "mm" : ""}`} style={{ minHeight: height }}>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {strokes.map((s, i) => <Shape key={i} s={s} />)}
                    {cur && <Shape s={cur} />}
                  </svg>
                  <div ref={editorRef} contentEditable={!drawing} suppressContentEditableWarning data-ph="Scrivi appunti, formule, note di cablaggio…"
                    className="rt relative p-6 outline-none" style={{ minHeight: height, caretColor: "#0F8B7A" }}
                    onInput={(e: any) => { fixFonts(); setContent(e.currentTarget.innerHTML); }} onClick={pickImg}
                    onKeyDown={(e) => { if (e.key === "Enter") document.execCommand("formatBlock", false, "div"); }} />
                  {drawing && <div className="absolute inset-0 z-30" style={{ touchAction: tool === "hand" ? "pan-y" : "none", cursor: tool === "hand" ? "grab" : tool === "eraser" ? "cell" : "crosshair" }} onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={pUp} />}
                </div>
                <div className="flex justify-between items-center px-4 py-2 text-xs mu border-t" style={{ borderColor: "var(--ln)" }}>
                  <span className="truncate">{drawing ? `${strokes.length} tratti` : `${words} parole`}{!editingId && " · bozza automatica"}</span>
                  <div className="flex gap-1.5 shrink-0"><button type="button" className={`bt !p-2 ${grid ? "on" : ""}`} onClick={() => setGrid(!grid)} aria-label="Griglia"><Grid3x3 size={16} /></button><button type="button" className="bt !text-xs" onClick={() => setHeight((h) => h + 300)}><Plus size={14} />Spazio</button></div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                {(editingId || title || strokes.length > 0 || words > 0) && <button type="button" className="bt" onClick={() => { if (confirm("Scartare le modifiche?")) resetForm(); }}>{editingId ? "Annulla modifica" : "Scarta bozza"}</button>}
                <button className="bt on !px-6 !py-3" disabled={saving} data-tour="save">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{editingId ? "Salva modifiche" : "Salva progetto"}</button>
              </div>
            </form>
          )}
          <Reveal className="mt-16"><div className="flex flex-col items-center gap-3 py-8"><Wordmark stack center size={64} fs={24} /><p className="mu text-xs">Scrivi, leggi, scegli. Ogni mese.</p></div></Reveal>
        </div>
      </div>

      {/* barra selezione multipla */}
      {selMode && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 pn shadow-xl flex items-center gap-2 p-2 popx">
          <span className="text-sm px-2">{ids.length} selezionati</span>
          <button className="bt" onClick={() => setIds(ids.length === shown.length ? [] : shown.map((t) => t.id))}>Tutti</button>
          {isAdmin && <button className="bt" disabled={!ids.length} onClick={bulkMark}><Bookmark size={15} />Segnalibro</button>}
          <button className="bt dng" disabled={!ids.length} onClick={() => setToDelete(ids)}><Trash2 size={15} />Elimina</button>
        </div>
      )}

      {/* lettura */}
      {view && (() => {
        const sel = view; // durante l'uscita resta visibile l'ultimo scritto aperto
        const { w, h } = dims(sel);
        const si = shown.findIndex((x) => x.id === sel.id);
        const hidS = hid(sel), fresh = rvl === sel.id;
        // il circuito dell'autore: i suoi scritti in ordine di data. Solo autori visibili, e solo scritti già svelati
        // (altrimenti il raggruppamento tradirebbe chi ha scritto un testo ancora anonimo)
        const mates = hidS ? [] : prepared.filter((x) => x.userId === sel.userId && !hid(x)).sort((a, b) => a.timestamp - b.timestamp);
        const mi = mates.findIndex((x) => x.id === sel.id), m0 = Math.max(0, Math.min(mi - 3, mates.length - 7)), near = mates.slice(m0, m0 + 7);
        const own = sel.userId === user.uid;
        return (
          <div className={`doc-ov fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm ${closing ? "out" : ""}`} onClick={closeView}>
            <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={sel.title} className="pn w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="doc-hd relative overflow-hidden shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 border-b" style={{ borderColor: "var(--ln)" }}>
                {fresh && <span className="rvl-sweep" />}
                <div className="flex items-center gap-3 min-w-0 w-full md:w-auto md:flex-1">
                  {hidS ? <Who t={sel} size={44} /> : <button type="button" onClick={() => setViewProf(sel.userId)} className="shrink-0" aria-label="Apri profilo">{fresh ? <span className="rvl-av"><i className="rg" /><i className="rg" /><span className="pf-av"><Avatar p={profiles[sel.userId]} name={sel.author} size={44} /></span></span> : <Avatar p={profiles[sel.userId]} name={sel.author} size={44} />}</button>}
                  <div className="flex-1 min-w-0"><h2 key={sel.id} className="doc-tt hd text-xl md:text-2xl font-bold line-clamp-2 md:truncate">{sel.title}</h2><div className="mu text-xs truncate">{hidS ? "Autore nascosto" : fresh ? <span className="rvl-name"><Scramble text={dn(sel.userId, sel.author)} on /></span> : dn(sel.userId, sel.author)} · {fmtDate(sel.timestamp)}</div></div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end self-end md:self-auto w-full md:w-auto">
                  <button className="bt flex-1 md:flex-none justify-center !p-2" title="Copia testo" aria-label="Copia testo" onClick={() => { navigator.clipboard?.writeText(plain(sel.content)); notify("Testo copiato."); }}><Copy size={15} /></button>
                  {isAdmin && <button className="bt flex-1 md:flex-none justify-center !p-2" title={sel.isStarred ? "Rimuovi segnalibro" : "Aggiungi segnalibro"} aria-label="Segnalibro" onClick={() => star(sel)}><Bookmark size={15} style={sel.isStarred ? { fill: "var(--ac)", color: "var(--ac)" } : {}} /></button>}
                  {canEdit(sel) && <button className="bt flex-1 md:flex-none justify-center !p-2" onClick={() => startEdit(sel)} title="Modifica" aria-label="Modifica"><Pencil size={15} /></button>}
                  {canEdit(sel) && <button className="bt dng flex-1 md:flex-none justify-center !p-2" onClick={() => setToDelete([sel.id])} title="Elimina" aria-label="Elimina"><Trash2 size={15} /></button>}
                  {si >= 0 && shown.length > 1 && <><button className="bt flex-1 md:flex-none justify-center !p-2" disabled={si <= 0} onClick={() => stepTo(shown[si - 1], -1)} aria-label="Scritto precedente"><ChevronLeft size={15} /></button><button className="bt flex-1 md:flex-none justify-center !p-2" disabled={si >= shown.length - 1} onClick={() => stepTo(shown[si + 1], 1)} aria-label="Scritto successivo"><ChevronRight size={15} /></button></>}
                  <button className="bt flex-1 md:flex-none justify-center !p-2" onClick={closeView} title="Chiudi" aria-label="Chiudi"><X size={15} /></button>
                </div>
              </div>
              <div className="relative flex-1 min-h-0 flex flex-col">
              {/* la pista di lettura: si disegna aprendo il foglio, poi segue lo scorrimento; in fondo il nodo diventa ambra */}
              <div ref={railRef} className="read-rail" aria-hidden="true"><i /><b /></div>
              <div key={sel.id} ref={readRef} className={`overflow-y-auto flex-1 min-h-0 ${swap ? "doc-swap" : ""}`} style={{ ["--dir" as any]: swap || 1 }}>
              {isAdmin && <div className="flex items-center gap-3 px-4 py-2 border-b text-sm" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}><span className="mu">Voto</span><Stars v={sel.rating || 0} onSet={sel.svelato ? undefined : (n: number) => rate(sel, n)} size={22} />{sel.svelato && <span className="mu text-xs">definitivo</span>}</div>}
              {hidS && <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 py-2.5 border-b" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}>
                <div className="text-sm min-w-0"><b>Autore nascosto.</b> <span className="mu">{sel.rating > 0 ? "Puoi svelarlo: dopo lo svelamento il voto non si cambia più." : "Dai da 1 a 5 stelle per poterlo svelare."}</span></div>
                <button type="button" className={`bt w-full sm:w-auto shrink-0 ${confirmRvl ? "on" : ""}`} disabled={!(sel.rating > 0)} onClick={() => confirmRvl ? reveal(sel) : setConfirmRvl(true)}><Eye size={15} />{confirmRvl ? "Conferma: voto definitivo" : "Svela autore"}</button>
              </div>}
              {!isAdmin && sel.svelato && sel.rating > 0 && <div className="flex items-center gap-3 px-4 py-2.5 border-b text-sm" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}><span className="mu">Il tuo voto</span><Stars v={sel.rating} size={22} /></div>}
              {isAdmin && <>
                <button type="button" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border-b text-sm text-left" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}>
                  <span className="mu">Stato e nota privata <span className="font-semibold" style={{ color: "var(--ink)" }}>· {(STATI.find(([k]) => k === (vals[sel.id]?.stato || "da_leggere")) || ["", "Da leggere"])[1]}{vals[sel.id]?.nota ? " · con nota" : ""}</span></span>
                  <ChevronDown size={16} className="mu shrink-0" style={{ transform: panelOpen ? "rotate(180deg)" : "none", transition: "transform .25s" }} />
                </button>
                {panelOpen && <PannelloAdmin db={db} id={sel.id} notify={notify} />}
              </>}
                <div className="paper mm relative" style={{ aspectRatio: `${w}/${h}` }}>
                  {sel.strokes?.length > 0 && <Drawing strokes={sel.strokes} w={w} h={h} className="absolute inset-0 w-full h-full" />}
                  <div className="rt relative p-6" dangerouslySetInnerHTML={{ __html: clean(sel.content) }} />
                </div>
                {near.length > 1 && (
                  <Reveal>
                    <nav className="cx" aria-label={own ? "I tuoi scritti" : `Scritti di ${dn(sel.userId, sel.author)}`}>
                      <h3 className="hd font-bold text-lg">{own ? "Nel tuo circuito" : `Nel circuito di ${dn(sel.userId, sel.author)}`}</h3>
                      <p className="mu text-xs">{mates.length} scritti, in ordine di data{mates.length > near.length ? ` · ne vedi ${near.length}` : ""}</p>
                      <ol className="cx-l">
                        {near.map((x, i) => {
                          const cur = x.id === sel.id;
                          return <li key={x.id} style={{ ["--i" as any]: i }}><button type="button" className="cx-n" aria-current={cur ? "true" : undefined} onClick={() => { if (!cur) stepTo(x, x.timestamp > sel.timestamp ? 1 : -1); }}><i aria-hidden="true" /><span className="cx-t">{x.title}</span><span className="mu text-xs shrink-0">{cur ? "stai leggendo" : fmtDate(x.timestamp)}</span></button></li>;
                        })}
                      </ol>
                    </nav>
                  </Reveal>
                )}
              </div>
              </div>
            </div>
          </div>
        );
      })()}

      {viewProf && (
        <div className="fade fixed inset-0 z-[65] flex items-end md:items-center justify-center bg-black/60" onClick={() => setViewProf(null)}>
          <div className="pn w-full max-w-lg max-h-[92dvh] overflow-y-auto pop relative !rounded-b-none md:!rounded-b-[18px]" onClick={(e) => e.stopPropagation()}>
            <button className="bt !p-2 absolute top-3 right-3 z-10" onClick={() => setViewProf(null)} aria-label="Chiudi"><X size={15} /></button>
            {profileView(viewProf, false)}
          </div>
        </div>
      )}

      {/* conferma eliminazione */}
      {toDelete && (
        <div className="fade fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={() => setToDelete(null)}>
          <div className="pn p-6 max-w-sm w-full pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="hd text-xl font-bold mb-1">{toDelete.length > 1 ? `Eliminare ${toDelete.length} progetti?` : "Eliminare il progetto?"}</h3>
            <p className="mu text-sm mb-5">L'operazione non si può annullare.</p>
            <div className="flex gap-2 justify-end"><button className="bt" onClick={() => setToDelete(null)}>Annulla</button><button className="bt on !bg-red-600 !border-red-600 !text-white" onClick={confirmDelete}>Elimina</button></div>
          </div>
        </div>
      )}

      {/* salvataggio riuscito */}
      {done && (
        <div className="fade fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="pn p-8 max-w-sm w-full text-center pop">
            <svg viewBox="0 0 64 64" width="72" height="72" className="mx-auto mb-3" fill="none" stroke="var(--ac)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="32" cy="32" r="28" opacity=".3" /><path className="tick" d="M18 33l9 9 19-20" /></svg>
            <h3 className="hd text-2xl font-bold">{done === "edit" ? "Modifiche salvate" : "Progetto salvato"}</h3>
            <div className="flex gap-2 mt-6 justify-center">
              <button className="bt" onClick={() => { setDone(null); resetForm(); }}><Plus size={15} />Nuovo</button>
              <button className="bt pri" onClick={() => { setDone(null); resetForm(); go("my_pages"); }}>Vai ai miei progetti</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] pn px-4 py-2 text-sm shadow-lg popx">{toast}</div>}

      {/* presentazione: il velo scuro copre il sito finché il film non è pronto, così la home non lampeggia prima */}
      {(tour || wantTour) && (tour
        ? <React.Suspense fallback={<div className="fixed inset-0 z-[110]" style={{ background: "#03110F" }} />}><Tour key={tour} admin={isAdmin} name={tourName} calm={!!G.nomotion} low={tourLow} nav={tourNav} hold={holdTour} onDone={endTour} /></React.Suspense>
        : <div className="fixed inset-0 z-[110]" style={{ background: "#03110F" }} />)}
    </>
  );
}
