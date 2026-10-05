import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail, confirmPasswordReset
} from "firebase/auth";
import {
  getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, setDoc
} from "firebase/firestore";
import {
  Cpu, Bookmark, Loader2, Activity, Star, X, KeyRound, Trash2, ListChecks, CheckCircle2, Circle,
  Bold, Italic, Underline, Image as ImageIcon, LogOut, Eraser, Undo, Redo, PaintBucket, Type, Pen,
  Save, Search, Sun, Moon, Pencil, Minus, Square, Grid3x3, Heading2, List, Palette, Copy, Unlock, Plus, LayoutDashboard, Trophy, Users, ChevronLeft, ChevronRight, Hand, Eye, EyeOff, Camera, Award, CalendarDays, Settings, Zap, RotateCcw
} from "lucide-react";

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
const clean = (h: string) => {
  const d = new DOMParser().parseFromString(h || "", "text/html");
  d.querySelectorAll("script,iframe,object,embed,style,link").forEach((n) => n.remove());
  d.body.querySelectorAll("img").forEach((i) => { i.setAttribute("loading", "lazy"); i.setAttribute("decoding", "async"); });
  d.body.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((a) => {
      const n = a.name.toLowerCase();
      if (n.startsWith("on") || (["href", "src"].includes(n) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    });
  });
  return d.body.innerHTML;
};
const plain = (h: string) => { const d = document.createElement("div"); d.innerHTML = clean(h); return d.textContent || ""; };
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

const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Il Circuito" className="lgf">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#17C3AE" /><stop offset="1" stopColor="#0A4F49" /></linearGradient></defs>
    <rect width="64" height="64" rx="17" fill="url(#lg)" />
    <rect x=".75" y=".75" width="62.5" height="62.5" rx="16.25" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
    <path className="lg-arc" pathLength={100} d="M43.5 22.4A15 15 0 1 0 43.5 41.6" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    <path className="lg-line" pathLength={100} d="M31 32H47" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <path className="lg-flow" d="M31 32H47" stroke="#FBBF24" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 5" />
    <circle className="lg-n" cx="43.5" cy="22.4" r="4.2" fill="#fff" />
    <circle className="lg-amber" cx="43.5" cy="41.6" r="4.2" fill="#FBBF24" />
    <circle className="lg-n" cx="31" cy="32" r="3.2" fill="#fff" />
  </svg>
);
const Wordmark = ({ size = 38, fs, light, center, stack, tag = true }: any) => (
  <div className={`flex leading-none ${stack ? "flex-col gap-4" : "gap-3"} ${stack && !center ? "items-start" : "items-center"} ${center ? "text-center" : ""}`}>
    <span className="lgw inline-flex shrink-0"><Logo size={size} /></span>
    <div>
      <div className="wm" aria-label="Il Circuito" style={{ fontSize: fs || Math.round(size * 0.5), ["--wc" as any]: light ? "#fff" : "var(--ink)", ["--wa" as any]: light ? "#FBBF24" : "var(--ac)" }}>
        {"Il Circuito".split("").map((c, i) => <span key={i} aria-hidden="true" className="wl" style={{ ["--i" as any]: i }}>{c === " " ? "\u00A0" : c}</span>)}
      </div>
      {tag && <div className="text-xs mt-2" style={{ color: light ? "rgba(255,255,255,.7)" : "var(--mu)" }}>Archivio di scrittura</div>}
    </div>
  </div>
);
const Backdrop = ({ tab, fx, dark }: { tab: string; fx: boolean; dark: boolean }) => {
  const k = tab === "profile" ? "authors" : ["home", "write", "podio", "authors"].includes(tab) ? tab : "archive";
  return (<>
    <div key={k} className={`bd bd-${k} bdin fixed inset-0 z-0 pointer-events-none`}><div className="bd-w" /><div className="au a1" /><div className="au a2" /><div className="au a3" /><div className="bd-p" /></div>
    {fx && <FX dark={dark} />}
  </>);
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

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@600&text=Il%20Circuito&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Instrument+Sans:wght@400;500;600&display=swap');
.root{--bg:#EDF2F1;--pn:#FFFFFF;--ink:#0E1F1D;--mu:#5B706D;--ln:#DCE6E4;--sf:#F4F8F7;--ac:#0F8B7A;--am:#E8A100;
--sh1:0 1px 2px rgba(14,31,29,.04),0 6px 16px -8px rgba(14,31,29,.10);--sh2:0 2px 4px rgba(14,31,29,.04),0 22px 44px -16px rgba(14,31,29,.26);--ez:cubic-bezier(.22,1,.36,1);--out:cubic-bezier(.16,1,.3,1);--snap:cubic-bezier(.77,0,.18,1);--spring:cubic-bezier(.34,1.56,.64,1);
font-family:'Instrument Sans',system-ui,sans-serif;color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;
background:var(--bg)}
.root.dark{--bg:#091312;--pn:#102120;--ink:#E2EFEB;--mu:#8AA7A2;--ln:#1E3532;--sf:#0C1B1A;--ac:#2DD4BF;--am:#FBBF24;
--sh1:0 1px 2px rgba(0,0,0,.3),0 8px 20px -10px rgba(0,0,0,.55);--sh2:0 24px 50px -18px rgba(0,0,0,.75)}
*{scrollbar-width:thin;scrollbar-color:var(--ln) transparent}
::selection{background:color-mix(in srgb,var(--ac) 30%,transparent)}
.hd{font-family:'Bricolage Grotesque','Instrument Sans',sans-serif;letter-spacing:-.025em}
.pn{background:var(--pn);border:1px solid var(--ln);border-radius:18px;box-shadow:var(--sh1)}
.hdr{background:color-mix(in srgb,var(--pn) 78%,transparent);backdrop-filter:blur(14px) saturate(1.4)}
.inp{width:100%;background:var(--sf);border:1px solid var(--ln);border-radius:12px;padding:.7rem 1rem;font-size:.95rem;outline:none;color:var(--ink);transition:border-color .2s,box-shadow .25s var(--ez),background .2s}
.inp:hover{border-color:color-mix(in srgb,var(--ac) 45%,var(--ln))}
.inp:focus,.bt:focus-visible{border-color:var(--ac);box-shadow:0 0 0 4px color-mix(in srgb,var(--ac) 20%,transparent)}
.bt{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.55rem .95rem;border-radius:12px;font-size:.85rem;font-weight:600;border:1px solid var(--ln);background:var(--pn);color:var(--ink);outline:none;cursor:pointer;
transition:transform .4s var(--spring),box-shadow .4s var(--spring),background .3s,border-color .3s,filter .3s,letter-spacing .3s}
.bt svg{transition:transform .4s var(--spring),fill .3s}
.bt:hover{transform:translate(var(--tx,0px),calc(var(--ty,0px) - 4px)) scale(1.03);border-color:var(--ac);box-shadow:0 10px 20px -8px color-mix(in srgb,var(--ac) 50%,transparent),var(--sh1);letter-spacing:.02em}
.bt:hover svg{transform:scale(1.25) rotate(-8deg);fill:color-mix(in srgb,var(--ac) 20%,transparent)}
.bt:active{transform:translateY(2px) scale(.94);box-shadow:none;letter-spacing:0}
.bt:disabled{opacity:.4;pointer-events:none}
.bt.on{background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 80%,#000));border-color:var(--ac);color:#fff} .root.dark .bt.on{color:#042f2a}
.bt.on:hover{filter:brightness(1.15);box-shadow:0 14px 30px -6px color-mix(in srgb,var(--ac) 80%,transparent);transform:translate(var(--tx,0px),calc(var(--ty,0px) - 4px)) scale(1.05)}
.bt.pri{background:var(--ink);color:var(--bg);border-color:var(--ink)} .bt.pri:hover{box-shadow:var(--sh2)}
.bt.dng{color:#dc2626;border-color:#fca5a5} .bt.dng:hover{background:#fef2f2;border-color:#dc2626}
.nv:hover{background:var(--sf)!important} .nv:hover svg{transform:translateX(3px)}
.lk{background:linear-gradient(currentColor,currentColor) 0 100%/0 1px no-repeat;transition:background-size .4s var(--ez),color .2s;cursor:pointer}
.lk:hover{background-size:100% 1px;color:var(--ink)}
.mu{color:var(--mu)}
.card{position:relative;transition:transform .5s var(--spring),box-shadow .5s var(--spring),border-color .4s,opacity .3s}
.card:hover{transform:perspective(1200px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-8px) scale(1.02);box-shadow:0 30px 60px -20px color-mix(in srgb,var(--ac) 40%,transparent),var(--sh2);border-color:color-mix(in srgb,var(--ac) 70%,var(--ln))}
.card:active{transform:perspective(1200px) rotateX(calc(var(--rx,0deg)*0.5)) rotateY(calc(var(--ry,0deg)*0.5)) translateY(2px) scale(.97);box-shadow:var(--sh1)}
.card:after{content:"";position:absolute;left:0;bottom:0;height:4px;width:100%;background:linear-gradient(90deg,var(--ac),var(--am));transform:scaleX(0);transform-origin:center;transition:transform .6s var(--spring);border-radius:0 0 18px 18px}
.card:hover:after{transform:scaleX(1)}
.card .thumb{transition:transform .8s var(--ez)} .card:hover .thumb{transform:scale(1.05)}
.card.gone{animation:shred .32s var(--snap) forwards;pointer-events:none}
.paper{background:#fff;color:#10211F}
.mm{background-image:linear-gradient(rgba(15,139,122,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(15,139,122,.12) 1px,transparent 1px);background-size:20px 20px}
.rt{overflow-wrap:anywhere;line-height:32px;font-size:17px}
.rt h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.6rem;font-weight:700;line-height:40px}
.rt ul{list-style:disc;padding-left:1.5rem} .rt b{font-weight:700} .rt u{text-underline-offset:4px}
.rt img{max-width:100%;height:auto;border-radius:8px;margin:12px auto;display:block;border:1px solid #D5E0DE}
.rt:empty:before{content:attr(data-ph);color:#94a3b8;pointer-events:none}
.sm .rt{line-height:22px;font-size:13px} .sm .rt img{max-height:70px;width:auto;margin:4px 0}
.sw{cursor:pointer;transition:transform .25s var(--ez),box-shadow .25s}.sw:hover{transform:scale(1.18)}
.rv{opacity:0}
.rv.in{opacity:1;transform:none}
.root{--m-circuit:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' fill='none' stroke='black' stroke-width='1.5'%3E%3Cpath d='M0 40H50L70 60V100H120L140 120V160M30 0V30L50 50M160 80H110L90 100M140 0V18M30 160V142M0 80H18M160 40H148'/%3E%3Ccircle cx='50' cy='40' r='3.5'/%3E%3Ccircle cx='120' cy='100' r='3.5'/%3E%3Ccircle cx='30' cy='30' r='3.5'/%3E%3Ccircle cx='110' cy='80' r='3.5'/%3E%3C/svg%3E");
--m-cross:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' fill='none' stroke='black' stroke-width='1.3'%3E%3Cpath d='M28 22V34M22 28H34'/%3E%3C/svg%3E");
--m-hatch:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' fill='none' stroke='black' stroke-width='1.2'%3E%3Cpath d='M-4 4L4 -4M0 28L28 0M24 32L32 24'/%3E%3C/svg%3E");
--m-net:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220' stroke='black' stroke-width='1.3'%3E%3Cpath d='M30 40L110 90M110 90L190 50M110 90L90 180M90 180L180 170'/%3E%3Ccircle cx='30' cy='40' r='4'/%3E%3Ccircle cx='110' cy='90' r='5'/%3E%3Ccircle cx='190' cy='50' r='4'/%3E%3Ccircle cx='90' cy='180' r='4'/%3E%3Ccircle cx='180' cy='170' r='4'/%3E%3C/svg%3E")}
.bd{position:fixed}
.bd-w,.bd-p{position:absolute;inset:0}
.bd-p{background:var(--ac);opacity:.11;-webkit-mask-image:var(--m);mask-image:var(--m);-webkit-mask-size:var(--ts,160px);mask-size:var(--ts,160px)}
.root.dark .bd-p{opacity:.15}
.bd:after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,transparent 25%,color-mix(in srgb,var(--bg) 88%,transparent) 100%)}
.bd-home .bd-w{background:radial-gradient(760px 460px at 92% -6%,color-mix(in srgb,var(--ac) 24%,transparent),transparent 70%),radial-gradient(620px 520px at 0% 100%,color-mix(in srgb,var(--am) 14%,transparent),transparent 70%)}
.bd-home .bd-p{--m:var(--m-circuit);--ts:160px}
.bd-write .bd-w{background:linear-gradient(180deg,color-mix(in srgb,var(--ac) 12%,transparent),transparent 50%)}
.bd-write .bd-p{--m:var(--m-cross);--ts:56px;opacity:.16}
.bd-archive .bd-w{background:radial-gradient(700px 480px at 8% -4%,color-mix(in srgb,var(--ac) 18%,transparent),transparent 70%),radial-gradient(640px 500px at 100% 100%,color-mix(in srgb,#64748B 16%,transparent),transparent 70%)}
.bd-archive .bd-p{--m:var(--m-hatch);--ts:28px;opacity:.08}
.bd-authors .bd-w{background:radial-gradient(700px 520px at 20% 10%,color-mix(in srgb,var(--ac) 18%,transparent),transparent 70%),radial-gradient(600px 460px at 100% 90%,color-mix(in srgb,#0284C7 14%,transparent),transparent 70%)}
.bd-authors .bd-p{--m:var(--m-net);--ts:220px}
.bd-podio .bd-w{background:radial-gradient(820px 520px at 50% -12%,color-mix(in srgb,var(--am) 26%,transparent),transparent 72%)}
.bd-podio .bd-p{background:repeating-conic-gradient(from -45deg at 50% -8%,var(--am) 0 2.5deg,transparent 2.5deg 9deg);-webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 0,#000,transparent);mask-image:radial-gradient(ellipse 80% 70% at 50% 0,#000,transparent);opacity:.18}
.brandpanel{position:relative;overflow:hidden;color:#fff;background:radial-gradient(620px 420px at 100% 0,rgba(251,191,36,.2),transparent 60%),linear-gradient(155deg,#0E7468,#08403C 55%,#052321);border-color:transparent}
.brandpanel>:not(.bd-p){position:relative}
.brandpanel .mu{color:rgba(255,255,255,.75)}
.bd-p.w{background:#fff;opacity:.09;--m:var(--m-circuit);--ts:160px}
@media (hover:none){.bt:hover{transform:none;box-shadow:none}}
.wm{font-family:'Unbounded','Bricolage Grotesque',sans-serif;font-weight:600;white-space:nowrap;letter-spacing:-.01em}
.wl{display:inline-block;color:var(--wc);opacity:0;animation:wl .7s var(--ez) calc(var(--i)*60ms + .2s) forwards,lw 7s ease-in-out calc(2.4s + var(--i)*90ms) infinite}
@keyframes wl{from{opacity:0;transform:translateY(.7em) rotate(6deg)}to{opacity:1;transform:none}}
@keyframes lw{0%,14%,100%{color:var(--wc)}7%{color:var(--wa)}}
.lgw{transition:transform .5s var(--ez);cursor:pointer}.lgw:hover{transform:rotate(-8deg) scale(1.08)}
.lgf{animation:lgfl 5s ease-in-out infinite}
@keyframes lgfl{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.lg-arc,.lg-line{stroke-dasharray:100;stroke-dashoffset:100;animation:lgd 1.1s var(--ez) .15s forwards}
.lg-line{animation-duration:.5s;animation-delay:.8s}
@keyframes lgd{to{stroke-dashoffset:0}}
.lg-flow{opacity:0;animation:lgs .9s linear 1.4s infinite,fd .4s 1.4s forwards}
@keyframes lgs{to{stroke-dashoffset:-7}}
.lg-n,.lg-amber{transform-box:fill-box;transform-origin:center;animation:lgp .55s var(--ez) .9s both}
.lg-amber{animation:lgp .55s var(--ez) 1.05s both,lgb 2.8s ease-in-out 2s infinite}
@keyframes lgp{from{opacity:0;transform:scale(0)}to{opacity:1;transform:none}}
@keyframes lgb{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}
.cpov{position:fixed;inset:0;z-index:40}
@media (max-width:767px){.root:has(.cpov) nav.hdr{display:none}}
.cp{position:absolute;top:100%;left:0;margin-top:.5rem;width:336px;z-index:50;box-shadow:var(--sh2);animation:cpIn .4s var(--out) backwards;transform-origin:0 0}
.cp-r{left:auto;right:0;transform-origin:100% 0}
@keyframes sheet{0%{transform:translateY(100%) scale(.95);opacity:0;border-radius:40px}100%{transform:none;opacity:1;border-radius:24px 24px 0 0}}
.root{min-height:100dvh;-webkit-tap-highlight-color:transparent}
.bt{touch-action:manipulation}
.inp{font-size:16px}
.bd{contain:strict}
@media (pointer:coarse){.bt{min-height:44px;min-width:44px}}
@media (max-width:767px){
.cpov{background:rgba(0,0,0,.4);animation:fd .25s both}
.cp{position:fixed;left:0;right:0;bottom:0;top:auto;margin:0;width:auto;border-radius:24px 24px 0 0;padding-bottom:calc(1.5rem + env(safe-area-inset-bottom))!important;animation:sheet .4s var(--ez) both;max-height:80dvh;overflow-y:auto}
.backdrop-blur-sm{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
.hdr{backdrop-filter:blur(8px)}
.card:hover{transform:none;box-shadow:var(--sh1)}
}
@keyframes pgf{from{opacity:0}}
@property --ang{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes ang{to{--ang:360deg}}
.bt:not(.absolute){position:relative}
.bt{overflow:hidden}
.bt:before,.card:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s}
.bt:before{background:radial-gradient(90px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,currentColor 22%,transparent),transparent 70%)}
.card:before{z-index:1;background:radial-gradient(280px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--ac) 26%,transparent),transparent 65%)}
.bt:hover:before,.card:hover:before,.card:active:before{opacity:1}
.bt.rip:after{content:"";position:absolute;left:var(--px,50%);top:var(--py,50%);width:8px;height:8px;margin:-4px;border-radius:50%;background:color-mix(in srgb,currentColor 40%,transparent);pointer-events:none;animation:ripl .65s var(--ez) forwards}
@keyframes ripl{to{transform:scale(32);opacity:0}}
.au{position:absolute;width:60vmax;height:60vmax;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--c) 34%,transparent),transparent);will-change:transform;animation:aur 24s ease-in-out infinite alternate}
.a1{--c:var(--ac);left:-18vmax;top:-24vmax}.a2{--c:var(--am);right:-24vmax;top:22vh;animation-duration:30s}.a3{--c:#6366F1;left:18vw;bottom:-34vmax;animation-duration:36s;opacity:.7}
@keyframes aur{to{transform:translate(9vw,7vh) scale(1.22) rotate(35deg)}}
.bd-p{inset:-25vh 0;transform:translateY(calc(var(--sy,0)*-.12px))}
.bd-podio .bd-p{inset:0;transform:none}
.prog{position:fixed;top:0;left:0;right:0;height:3px;z-index:90;transform-origin:0 50%;transform:scaleX(var(--sp,0));background:linear-gradient(90deg,var(--ac),var(--am));box-shadow:0 0 12px var(--ac);pointer-events:none}
.spinring{display:inline-block;padding:4px;border-radius:50%;background:conic-gradient(from var(--ang),var(--ac),var(--am),#6366F1,var(--ac));animation:ang 5s linear infinite}
.pn.spin-b{border:2px solid transparent;background:linear-gradient(var(--pn),var(--pn)) padding-box,conic-gradient(from var(--ang),transparent 55%,var(--am),var(--ac),transparent) border-box;animation:ang 6s linear infinite}
@keyframes boot{0%{opacity:0;transform:translateY(22px) skewX(-5deg) scale(.96)}35%{opacity:.7;transform:translateX(-3px) skewX(2deg)}48%{opacity:.25;transform:translateX(3px)}62%{opacity:1;transform:translateX(-1px)}100%{opacity:1;transform:none}}
.rv.in{transition:none;animation:boot .8s var(--ez) backwards}
::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}
::view-transition-new(root){animation:vtr .75s var(--ez)}
@keyframes vtr{from{clip-path:circle(0 at var(--vx,50%) var(--vy,50%))}to{clip-path:circle(150vmax at var(--vx,50%) var(--vy,50%))}}
.root.nointro .rv{opacity:1;transform:none}.root.nointro .rv.in{animation:none}
.root.nointro .wl,.root.nointro .lg-n,.root.nointro .lg-amber{animation:none;opacity:1}.root.nointro .lg-arc,.root.nointro .lg-line{animation:none;stroke-dashoffset:0}
.root.noaurora .au{display:none}
.noglow .bt:before,.noglow .card:before,.noglow .bt.rip:after{display:none}
.root.lite *,.root.lite *:before,.root.lite *:after{animation:none!important;transition:none!important}
.root.lite .bd,.root.lite .prog{display:none}
.root.lite .rv{opacity:1;transform:none}
.root.lite .wl,.root.lite .lg-n,.root.lite .lg-amber{opacity:1}
.root.lite .lg-arc,.root.lite .lg-line,.root.lite .tick{stroke-dashoffset:0}
.root.lite .hdr,.root.lite .backdrop-blur-sm{backdrop-filter:none!important}
@keyframes pg{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:none}}
@keyframes up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:perspective(1000px) rotateX(-15deg) translateY(30px) scale(.85)}100%{opacity:1;transform:none}}
@keyframes popx{0%{opacity:0;transform:perspective(1000px) rotateX(-15deg) translate(-50%,30px) scale(.85)}100%{opacity:1;transform:translate(-50%,0)}}
@keyframes fd{from{opacity:0}to{opacity:1}}
@keyframes dash{to{stroke-dashoffset:0}}
.up{animation:up .7s var(--ez) both}
.pop{animation:pop .45s var(--ez) both} .popx{animation:popx .4s var(--ez) both} .fade{animation:fd .3s ease-out both}
.tick{stroke-dasharray:60;stroke-dashoffset:60;animation:dash .7s .25s ease-out forwards}
/* ===== MOTION SYSTEM: ogni elemento ha un ingresso (e un'uscita) tutto suo ===== */
.rv:not(.in) *{animation-play-state:paused!important}
.rv.in.fx-wipe{animation:rvWipe 1.05s var(--snap) backwards}
.rv.in.fx-flip{animation:rvFlip .85s var(--out) backwards;transform-origin:50% 0}
.rv.in.fx-rise{animation:rvRise .95s var(--spring) backwards;transform-origin:50% 100%}
.rv.in.fx-zoom{animation:rvZoom .75s var(--out) backwards}
.rv.in.fx-deal{animation:rvDeal .8s var(--out) backwards}
@keyframes rvWipe{from{clip-path:inset(0 100% 0 0 round 18px)}to{clip-path:inset(0 0 0 0 round 18px)}}
@keyframes rvFlip{from{opacity:0;transform:perspective(800px) rotateX(-80deg) translateY(-12px)}}
@keyframes rvRise{from{opacity:0;transform:translateY(110px) scaleY(.4)}}
@keyframes rvZoom{from{opacity:0;transform:scale(.8);filter:blur(10px)}}
@keyframes rvDeal{from{opacity:0;transform:translate(var(--dx,0px),140px) rotate(var(--rot,0deg)) scale(.86)}}
.cas>*:not(.bd-p){animation:casUp .65s var(--out) backwards}
.cas>:nth-child(1){animation-delay:calc(var(--cb,0s) + 60ms)}.cas>:nth-child(2){animation-delay:calc(var(--cb,0s) + 120ms)}.cas>:nth-child(3){animation-delay:calc(var(--cb,0s) + 180ms)}.cas>:nth-child(4){animation-delay:calc(var(--cb,0s) + 240ms)}
.cas>:nth-child(5){animation-delay:calc(var(--cb,0s) + 300ms)}.cas>:nth-child(6){animation-delay:calc(var(--cb,0s) + 360ms)}.cas>:nth-child(7){animation-delay:calc(var(--cb,0s) + 420ms)}.cas>:nth-child(8){animation-delay:calc(var(--cb,0s) + 480ms)}
.cas>:nth-child(9){animation-delay:calc(var(--cb,0s) + 540ms)}.cas>:nth-child(10){animation-delay:calc(var(--cb,0s) + 600ms)}.cas>:nth-child(11){animation-delay:calc(var(--cb,0s) + 660ms)}.cas>:nth-child(12){animation-delay:calc(var(--cb,0s) + 720ms)}.cas>:nth-child(n+13){animation-delay:calc(var(--cb,0s) + 780ms)}
.cas-l>*:not(.bd-p){animation-name:casL}
.cas>.swap{animation:swapIn .5s var(--out) backwards}
.cas>.fld{animation:fldIn .45s var(--out) backwards}
.fld{transform-origin:50% 0}
@keyframes casUp{from{opacity:0;transform:translateY(20px)}}
@keyframes casL{from{opacity:0;transform:translateX(-30px)}}
@keyframes swapIn{from{opacity:0;transform:translateY(10px);filter:blur(6px)}}
@keyframes fldIn{from{opacity:0;transform:scaleY(.5) translateY(-10px)}}
/* pagine: ogni sezione entra in modo diverso */
.pg{position:relative;animation:.8s var(--spring) backwards}
.pg-home{animation-name:pgHome;animation-duration:1s;animation-timing-function:var(--out)}
.pg-write{animation-name:pgWrite;transform-origin:50% 0;animation-duration:.9s;animation-timing-function:var(--spring)}
.pg-my_pages{animation-name:pgMine;animation-duration:.8s}
.pg-read{animation-name:pgRead;animation-duration:.8s;animation-timing-function:var(--snap)}
.pg-podio{animation-name:pgPodio;animation-duration:1.1s;animation-timing-function:var(--spring)}
.pg-authors{animation-name:pgAuth;animation-duration:1s;animation-timing-function:var(--spring)}
.pg-profile{animation-name:pgProf;animation-duration:1s;animation-timing-function:var(--snap)}
@media (min-width:768px){.pg-profile{animation-name:pgProfD}}
@keyframes pgHome{0%{opacity:0;transform:scale(0.8) translateY(40px) rotate(-2deg);filter:blur(10px)}100%{opacity:1;transform:none;filter:blur(0)}}
@keyframes pgWrite{0%{opacity:0;transform:perspective(1600px) rotateX(35deg) translateY(120px) scale(0.9);filter:blur(8px)}100%{opacity:1;transform:none;filter:blur(0)}}
@keyframes pgMine{0%{opacity:0;transform:perspective(1000px) rotateY(-20deg) translateX(80px) skewX(-8deg);filter:drop-shadow(0 0 20px var(--ac))}100%{opacity:1;transform:none;filter:drop-shadow(0 0 0 transparent)}}
@keyframes pgRead{0%{clip-path:polygon(50% 100%, 50% 100%, 50% 100%, 50% 100%);transform:scale(0.95);opacity:0}100%{clip-path:polygon(0 0, 100% 0, 100% 100%, 0 100%);transform:none;opacity:1}}
@keyframes pgPodio{0%{opacity:0;transform:translateY(-100px) scale(0.8) rotate(-5deg);filter:drop-shadow(0 30px 40px var(--am))}100%{opacity:1;transform:none;filter:drop-shadow(0 0 0 transparent)}}
@keyframes pgAuth{0%{opacity:0;transform:perspective(1200px) translateZ(200px) rotateY(15deg) scale(1.2);filter:blur(15px)}100%{opacity:1;transform:none;filter:blur(0)}}
@keyframes pgProf{0%{clip-path:circle(0% at 50% 50%);transform:scale(0.8) rotate(-10deg);opacity:0}100%{clip-path:circle(150% at 50% 50%);transform:none;opacity:1}}
@keyframes pgProfD{0%{clip-path:circle(0% at 50% 50%);transform:scale(0.8) rotate(-10deg);opacity:0}100%{clip-path:circle(150% at 50% 50%);transform:none;opacity:1}}
.trace{position:absolute;top:0;left:1rem;right:1rem;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--ac) 20%,var(--am) 80%,transparent);box-shadow:0 0 12px var(--ac);transform-origin:0 50%;opacity:0;pointer-events:none;animation:trace 1s var(--snap) .05s}
@keyframes trace{0%{opacity:1;transform:scaleX(0)}65%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}
.bdin{animation:bdIn 1.1s var(--ez) backwards}
@keyframes bdIn{from{opacity:0;transform:scale(1.06)}}
/* navigazione: indicatore liquido + icona animata per voce */
.nb{z-index:1}
.nb.act{color:#fff}.root.dark .nb.act{color:#042f2a}
.nb.act:hover{background:transparent!important}
.nb.act svg{animation:var(--ia,none) .75s var(--ez);transform-origin:50% 30%}
.nind{position:absolute;z-index:0;border-radius:12px;background:var(--ac);box-shadow:0 10px 24px -10px color-mix(in srgb,var(--ac) 80%,transparent);pointer-events:none;opacity:0;overflow:hidden;transition:top .55s var(--ez) var(--da,0ms),bottom .55s var(--ez) var(--db,0ms),left .55s var(--ez) var(--da,0ms),right .55s var(--ez) var(--db,0ms),opacity .3s}
.nind.v{left:0;right:0;top:var(--a,0px);bottom:var(--b,100%)}
.nind.h{top:0;bottom:0;left:var(--a,0px);right:var(--b,100%)}
.nind:after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.4) 50%,transparent 65%);transform:translateX(-120%);animation:shine 4s ease-in-out 1s infinite}
@keyframes shine{0%,65%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
@keyframes icHome{from{transform:scale(.4) rotate(-180deg)}}
@keyframes icWrite{0%,100%{transform:none}20%{transform:rotate(-22deg) translate(-2px,1px)}40%{transform:rotate(12deg) translate(2px,-1px)}60%{transform:rotate(-12deg)}80%{transform:rotate(6deg)}}
@keyframes icMine{0%{transform:translateY(-12px);opacity:0}55%{transform:translateY(3px) scaleY(.85);opacity:1}100%{transform:none}}
@keyframes icRead{0%{transform:scaleX(.1)}45%{transform:scale(1.3,1.4)}100%{transform:none}}
@keyframes icPodio{0%,100%{transform:none}20%{transform:rotate(18deg) translateY(-3px)}40%{transform:rotate(-14deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-4deg)}}
@keyframes icAuth{0%{transform:scale(1)}30%{transform:scale(1.4) translateY(-4px)}60%{transform:scale(.88)}100%{transform:none}}
/* selettori a pillola scorrevole */
.seg-ind{position:absolute;top:4px;bottom:4px;left:4px;border-radius:12px;background:var(--ac);box-shadow:0 8px 18px -8px color-mix(in srgb,var(--ac) 75%,transparent);transition:transform .6s var(--spring)}
.seg.soft .seg-ind{background:var(--pn);box-shadow:var(--sh1)}
.seg .bt{transition:color .3s,transform .3s var(--ez)}
.seg-on{color:#fff!important}.root.dark .seg-on{color:#042f2a!important}.seg.soft .seg-on{color:var(--ink)!important}
.seg-on svg{animation:segP .5s var(--spring)}
@keyframes segP{from{transform:scale(.4) rotate(-40deg)}}
/* overlay e modali: ognuno con ingresso e uscita unici */
.ov{animation:ovIn .4s var(--ez) backwards}
.ov.out{animation:ovOut .34s var(--ez) forwards;pointer-events:none}
@keyframes ovIn{from{background-color:transparent;-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0)}}
@keyframes ovOut{to{background-color:transparent;-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0)}}
.m-doc{animation:docIn .6s var(--out) backwards}
.out .m-doc{animation:docOut .34s var(--snap) forwards}
@keyframes docIn{from{opacity:0;transform:translate(var(--ox,0px),var(--oy,60px)) scale(var(--sx,.92),var(--sy,.92));border-radius:26px}35%{opacity:1}}
@keyframes docOut{to{opacity:0;transform:translate(var(--ox,0px),var(--oy,60px)) scale(var(--sx,.92),var(--sy,.92))}}
.m-doc .doc-h{animation:hIn .55s var(--out) .22s backwards}
@keyframes hIn{from{opacity:0;transform:translateY(-14px)}}
.acts>*{flex:1}
.print{position:relative;animation:print 1s var(--snap) .3s backwards}
.print:before{content:"";position:absolute;left:0;right:0;top:0;height:2px;z-index:5;pointer-events:none;background:var(--ac);box-shadow:0 0 16px 3px var(--ac);opacity:0;animation:scan 1s var(--snap) .3s}
@keyframes print{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes scan{0%{top:0;opacity:1}85%{opacity:1}100%{top:100%;opacity:0}}
.m-card{animation:cardIn .75s var(--out) backwards;transform-origin:50% 100%}
.out .m-card{animation:cardOut .3s var(--snap) forwards}
@keyframes cardIn{from{opacity:0;transform:perspective(1200px) rotateX(-32deg) rotateY(16deg) translateY(70px) scale(.88)}}
@keyframes cardOut{to{opacity:0;transform:perspective(1200px) rotateX(18deg) translateY(50px) scale(.92)}}
.m-crt{animation:crtOn .65s var(--snap) backwards}
.out .m-crt{animation:crtOff .4s var(--snap) forwards}
.m-crt .cas{--cb:.38s}
@keyframes crtOn{0%{opacity:0;transform:scale(.5,.006);filter:brightness(3)}40%{opacity:1;transform:scale(1,.006);filter:brightness(2.2)}100%{transform:none;filter:none}}
@keyframes crtOff{0%{transform:none}55%{opacity:1;transform:scale(1,.006);filter:brightness(2.5)}100%{opacity:0;transform:scale(0,.006)}}
.m-warn{animation:warnIn .65s var(--ez) backwards}
.out .m-warn{animation:implode .36s var(--snap) forwards}
.m-warn .wi{animation:wiPulse 1.4s ease-in-out .6s infinite}
@keyframes warnIn{0%{opacity:0;transform:scale(.85)}30%{opacity:1;transform:scale(1.03) translateX(-10px);box-shadow:0 0 0 6px rgba(220,38,38,.35),var(--sh2)}45%{transform:translateX(8px)}60%{transform:translateX(-6px)}75%{transform:translateX(3px)}100%{transform:none}}
@keyframes implode{to{opacity:0;transform:scale(.3) rotate(-10deg);filter:blur(6px)}}
@keyframes wiPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}50%{box-shadow:0 0 0 12px rgba(220,38,38,0)}}
.m-vault{animation:vaultIn .6s var(--out) backwards}
.out .m-vault{animation:vaultOut .3s var(--snap) forwards}
.m-vault .key{animation:keyT 1s var(--spring) .2s backwards}
@keyframes vaultIn{from{opacity:0;transform:scale(1.3);filter:blur(12px)}}
@keyframes vaultOut{to{opacity:0;transform:scale(1.2);filter:blur(10px)}}
@keyframes keyT{from{opacity:0;transform:rotate(-220deg) scale(.2)}}
.shk{animation:shk .45s var(--ez)}
@keyframes shk{20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
.m-done{animation:doneIn .7s var(--spring) backwards}
.out .m-done{animation:doneOut .35s var(--snap) forwards}
@keyframes doneIn{from{opacity:0;transform:scale(.4) translateY(40px)}}
@keyframes doneOut{to{opacity:0;transform:translateY(-60px) scale(.9)}}
.burst{position:relative;width:76px;height:76px;margin:0 auto .9rem}
.burst svg{position:relative;width:100%;height:100%}
.burst .rg{position:absolute;inset:0;border-radius:50%;border:2px solid var(--ac);opacity:0;animation:rg 1s var(--out) .35s}
.burst .rg+.rg{border-color:var(--am);animation-delay:.5s}
.burst i{position:absolute;left:50%;top:50%;width:4px;height:12px;margin:-6px 0 0 -2px;border-radius:3px;background:var(--c);opacity:0;animation:spark .8s var(--out) .4s}
@keyframes rg{from{opacity:.9;transform:scale(.5)}to{opacity:0;transform:scale(2.3)}}
@keyframes spark{0%{opacity:1;transform:rotate(var(--a)) translateY(-22px) scaleY(1.2)}100%{opacity:0;transform:rotate(var(--a)) translateY(-72px) scaleY(.3)}}
.toast{animation:tIn .55s var(--spring) backwards;overflow:hidden}
.toast.out{animation:tOut .3s var(--snap) forwards}
.toast:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--ac),var(--am));transform-origin:0 50%;animation:tBar 3.2s linear forwards}
@keyframes tIn{from{opacity:0;transform:translate(-50%,-160%) scale(.85)}}
@keyframes tOut{to{opacity:0;transform:translate(-50%,-160%) scale(.9)}}
@keyframes tBar{to{transform:scaleX(0)}}
.selbar{animation:selIn .6s var(--out) backwards}
.selbar.out{animation:selOut .3s var(--snap) forwards;pointer-events:none}
@keyframes selIn{from{opacity:0;clip-path:inset(0 46% 0 46% round 18px);transform:translate(-50%,24px)}to{clip-path:inset(0 0 0 0 round 18px)}}
@keyframes selOut{to{opacity:0;clip-path:inset(0 46% 0 46% round 18px);transform:translate(-50%,24px)}}
@keyframes cpIn{from{opacity:0;transform:translateY(-8px) scale(.9);clip-path:inset(0 0 100% 0 round 18px)}to{clip-path:inset(0 0 0 0 round 18px)}}
.cp.out{animation:cpOut .22s var(--snap) forwards}
.cpov.out{animation:fdo .22s forwards;pointer-events:none}
@keyframes cpOut{to{opacity:0;transform:translateY(-6px) scale(.94)}}
@keyframes fdo{to{opacity:0}}
.cp .sw{animation:swIn .45s var(--spring) backwards;animation-delay:calc(.08s + var(--i,0)*16ms)}
@keyframes swIn{from{transform:scale(0) rotate(-90deg)}}
@keyframes sheetUp{from{transform:translateY(100%)}}
@keyframes sheetDown{to{transform:translateY(100%)}}
@keyframes cardUpM{from{transform:translateY(100%) scale(.92);border-radius:44px}}
@media (max-width:767px){
.m-card{animation:cardUpM .6s var(--out) backwards}
.m-crt{animation:sheetUp .55s var(--out) backwards}
.out .m-card,.out .m-crt{animation:sheetDown .3s var(--snap) forwards}
.m-crt .cas{--cb:.18s}
.cp.out{animation:sheetDown .28s var(--snap) forwards}}
/* micro-interazioni */
@keyframes shred{to{opacity:0;transform:scale(.7,.05) skewX(24deg);filter:blur(6px)}}
.st-on{animation:stPop .55s var(--spring) backwards;animation-delay:calc(var(--n,0)*55ms)}
@keyframes stPop{from{transform:scale(0) rotate(-120deg)}}
.bm-pop{animation:bmPop .55s var(--ez)}
@keyframes bmPop{0%{transform:translateY(-10px) scale(.4)}60%{transform:translateY(2px) scale(1.3)}100%{transform:none}}
.tb.on svg{animation:tbOn .45s var(--spring)}
@keyframes tbOn{from{transform:scale(.5) rotate(-20deg)}}
.tb-t{animation:tbT .4s var(--out) backwards}.tb-d{animation:tbD .4s var(--out) backwards}
@keyframes tbT{from{opacity:0;transform:translateX(-24px)}}
@keyframes tbD{from{opacity:0;transform:translateX(24px)}}
.pf-bn{animation:bnIn .9s var(--snap) backwards}
@keyframes bnIn{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
.pf-bn .bd-p{animation:bnPan 22s linear infinite}
@keyframes bnPan{to{-webkit-mask-position:160px 160px;mask-position:160px 160px}}
.pf-av{display:inline-block;animation:avIn .9s var(--spring) .3s backwards}
@keyframes avIn{from{opacity:0;transform:scale(.2) rotate(-160deg)}}
.badge{animation:bdgIn .55s var(--spring) backwards;animation-delay:calc(.7s + var(--i,0)*90ms)}
@keyframes bdgIn{from{opacity:0;transform:scale(.3) translateY(10px)}}
.msr{animation:msr .55s var(--out) backwards}.msl{animation:msl .55s var(--out) backwards}
@keyframes msr{from{opacity:0;transform:translateX(70px)}}
@keyframes msl{from{opacity:0;transform:translateX(-70px)}}
.mlab{display:inline-block;animation:mlab .5s var(--spring) backwards}
@keyframes mlab{from{opacity:0;transform:perspective(400px) rotateX(-90deg)}}
.medal{animation:medal 1.1s var(--out) backwards;animation-delay:calc(var(--md,0ms) + .45s)}
@keyframes medal{from{opacity:0;transform:perspective(300px) rotateY(720deg) scale(.3)}}
.wdw{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.1em;margin-bottom:-.1em}
.wd{display:inline-block;animation:wdIn 1s var(--out) backwards;animation-delay:calc(.25s + var(--i,0)*65ms)}
@keyframes wdIn{from{opacity:0;transform:translateY(115%) rotate(6deg)}}
.ldr{display:inline-flex;gap:5px;align-items:center;height:30px}
.ldr i{width:5px;height:100%;border-radius:3px;background:linear-gradient(var(--ac),var(--am));animation:eq 1s ease-in-out infinite}
.ldr i:nth-child(2){animation-delay:-.85s}.ldr i:nth-child(3){animation-delay:-.7s}.ldr i:nth-child(4){animation-delay:-.55s}.ldr i:nth-child(5){animation-delay:-.4s}
@keyframes eq{0%,100%{transform:scaleY(.25);opacity:.45}50%{transform:scaleY(1);opacity:1}}
.empty{animation:empIn .7s var(--spring) backwards}
.empty>svg:first-child{animation:bob 3.2s ease-in-out .7s infinite}
@keyframes empIn{from{opacity:0;transform:translateY(30px) scale(.94)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px) rotate(-4deg)}}
.root.nointro .cas>*,.root.nointro .pf-av,.root.nointro .pf-bn,.root.nointro .badge,.root.nointro .medal,.root.nointro .wd,.root.nointro .st-on{animation:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.tick{stroke-dashoffset:0}.rv{opacity:1;transform:none}.wl,.lg-n,.lg-amber{opacity:1}.lg-arc,.lg-line{stroke-dashoffset:0}}
`;

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
    const t = setTimeout(() => { setKeep(null); setOut(false); }, ms);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v || keep || null, out && !v];
};

const Pop = ({ label, trigger, cls = "bt", wrap = "", right, children }: any) => {
  const [o, setO] = useState(false);
  const [show, out] = usePresence(o ? 1 : null, 240);
  return (
    <div className={`relative ${wrap}`}>
      <button type="button" className={cls} onClick={() => setO(!o)} title={label} aria-label={label}>{trigger}</button>
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
const ColorPicker = ({ value, onPick, label, cls = "bt", wrap = "", children }: any) => (
  <Pop label={label} cls={cls} wrap={wrap} trigger={children}>
    {(close: any) => <Swatches value={value} cols="grid-cols-5 md:grid-cols-7" onPick={(c: string) => { onPick(c); close(); }} />}
  </Pop>
);
const TB = ({ on, fn, icon: Icon, label }: any) => (
  <button type="button" title={label} aria-label={label} onClick={fn} className={`bt tb !min-w-0 !px-0 ${on ? "on" : ""}`}><Icon size={18} /></button>
);

const BANNERS = [
  { id: "teal", g: "linear-gradient(135deg,#17C3AE,#0A4F49)" }, { id: "amber", g: "linear-gradient(135deg,#FBBF24,#C2410C)" },
  { id: "indigo", g: "linear-gradient(135deg,#818CF8,#1E1B4B)" }, { id: "rose", g: "linear-gradient(135deg,#FB7185,#881337)" },
  { id: "sky", g: "linear-gradient(135deg,#38BDF8,#1E3A8A)" }, { id: "slate", g: "linear-gradient(135deg,#94A3B8,#0F172A)" },
];
const AV = ["#0F8B7A", "#C2410C", "#4F46E5", "#DB2777", "#0284C7", "#CA8A04", "#7E22CE"];
const Avatar = ({ p, name = "?", size = 40 }: any) => {
  const h = Array.from(String(name)).reduce((a, c) => a + c.charCodeAt(0), 0);
  return p?.avatar
    ? <img src={p.avatar} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <span className="rounded-full shrink-0 inline-flex items-center justify-center font-bold text-white uppercase" style={{ width: size, height: size, background: AV[h % AV.length], fontSize: size * 0.4 }}>{String(name).slice(0, 2)}</span>;
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

const DEF = { level: "full", fx: true, glow: true, aurora: true, intro: true, sound: false, vibrate: true, text: 1 };
let actx: any = null;
const blip = (f = 660) => { try { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; actx = actx || new AC(); const o = actx.createOscillator(), g = actx.createGain(); o.type = "square"; o.frequency.value = f; g.gain.setValueAtTime(0.03, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.08); o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.09); } catch {} };

const Scramble = ({ text, on }: any) => {
  const [t, setT] = useState(text);
  useEffect(() => {
    if (!on) { setT(text); return; }
    const chars = "01/|<>_#=+*"; let f = 0; const N = 20;
    const id = setInterval(() => { f++; setT(text.split("").map((c: string, i: number) => (c === " " || i < (f / N) * text.length ? c : chars[Math.floor(Math.random() * chars.length)])).join("")); if (f >= N) { clearInterval(id); setT(text); } }, 32);
    return () => clearInterval(id);
  }, [text, on]);
  return <>{t}</>;
};

const FX = ({ dark }: { dark: boolean }) => {
  const bg = useRef<HTMLCanvasElement>(null);
  const fg = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const a = bg.current, b = fg.current; if (!a || !b) return;
    const ca = a.getContext("2d")!, cb = b.getContext("2d")!;
    const G = 48, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, raf = 0, last = 0;
    const fit = () => { W = window.innerWidth; H = window.innerHeight; [a, b].forEach((c) => { c.width = W * dpr; c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px"; c.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0); }); };
    fit(); window.addEventListener("resize", fit);
    const pulses: any[] = [], sparks: any[] = [];
    const spawn = (x = Math.random() * W, y = Math.random() * H) => { const h = Math.random() < 0.5, s = Math.random() < 0.5 ? 1 : -1; pulses.push({ x: Math.round(x / G) * G, y: Math.round(y / G) * G, dx: h ? s : 0, dy: h ? 0 : s, t: [], n: 0, max: 160 + Math.random() * 240, am: Math.random() < 0.25 }); };
    for (let i = 0; i < (W < 600 ? 7 : 14); i++) spawn();
    const down = (e: PointerEvent) => {
      for (let i = 0; i < 16; i++) { const an = (i / 16) * Math.PI * 2, v = 2 + Math.random() * 3.5; sparks.push({ x: e.clientX, y: e.clientY, vx: Math.cos(an) * v, vy: Math.sin(an) * v, l: 1 }); }
      sparks.push({ x: e.clientX, y: e.clientY, r: 4, l: 1, ring: true }); spawn(e.clientX, e.clientY);
    };
    window.addEventListener("pointerdown", down, { passive: true });
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || ts - last < 32) return; last = ts;
      const c = dark ? "45,212,191" : "15,139,122";
      ca.clearRect(0, 0, W, H); cb.clearRect(0, 0, W, H); ca.lineWidth = 1.6; ca.lineCap = "round";
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        for (let k = 0; k < 2; k++) {
          p.x += p.dx * 2; p.y += p.dy * 2;
          if (p.x % G === 0 && p.y % G === 0 && Math.random() < 0.3) { if (p.dx) { p.dx = 0; p.dy = Math.random() < 0.5 ? 1 : -1; } else { p.dy = 0; p.dx = Math.random() < 0.5 ? 1 : -1; } }
        }
        p.t.push([p.x, p.y]); if (p.t.length > 22) p.t.shift(); p.n++;
        const col = p.am ? "251,191,36" : c;
        for (let k = 1; k < p.t.length; k++) { ca.strokeStyle = `rgba(${col},${(k / p.t.length) * 0.55})`; ca.beginPath(); ca.moveTo(p.t[k - 1][0], p.t[k - 1][1]); ca.lineTo(p.t[k][0], p.t[k][1]); ca.stroke(); }
        ca.fillStyle = `rgba(${col},.9)`; ca.beginPath(); ca.arc(p.x, p.y, 2.6, 0, 7); ca.fill();
        if (p.n > p.max || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) { pulses.splice(i, 1); spawn(); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.l -= s.ring ? 0.05 : 0.04;
        if (s.l <= 0) { sparks.splice(i, 1); continue; }
        cb.lineWidth = 2;
        if (s.ring) { s.r += 5; cb.strokeStyle = `rgba(${c},${s.l * 0.7})`; cb.beginPath(); cb.arc(s.x, s.y, s.r, 0, 7); cb.stroke(); }
        else { s.x += s.vx; s.y += s.vy; s.vx *= 0.94; s.vy *= 0.94; cb.strokeStyle = `rgba(251,191,36,${s.l})`; cb.beginPath(); cb.moveTo(s.x, s.y); cb.lineTo(s.x - s.vx * 2.5, s.y - s.vy * 2.5); cb.stroke(); }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); window.removeEventListener("pointerdown", down); };
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
const Seg = ({ v, set, items, big, soft }: any) => {
  const n = items.length, idx = Math.max(0, items.findIndex(([id]: any) => id === v));
  return (
    <div className={`seg relative grid gap-1 p-1 rounded-2xl ${soft ? "soft" : ""}`} style={{ background: soft ? "var(--sf)" : "var(--ln)", border: soft ? "1px solid var(--ln)" : undefined, gridTemplateColumns: `repeat(${n},1fr)` }}>
      <span className="seg-ind" style={{ width: `calc((100% - ${8 + (n - 1) * 4}px) / ${n})`, transform: `translateX(calc(${idx} * (100% + 4px)))` }} />
      {items.map(([id, label]: any) => <button type="button" key={String(id)} onClick={(e) => set(id, e)} className={`bt !border-0 !bg-transparent !px-1 ${big ? "" : "!text-xs"} ${v === id ? "seg-on" : "mu"}`}>{label}</button>)}
    </div>
  );
};

// numeri che "contano" fino al valore (con easing esponenziale)
const CountUp = ({ v, on }: any) => {
  const [n, setN] = useState(on ? 0 : v);
  const from = useRef(on ? 0 : v);
  useEffect(() => {
    if (!on || LITE) { setN(v); from.current = v; return; }
    const a = from.current, t0 = performance.now(), D = 1200; let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 4), x = Math.round(a + (v - a) * e); setN(x); from.current = x; if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [v, on]);
  return <>{Number(n).toLocaleString("it-IT")}</>;
};
// caricamento a "segnale" (barre stile equalizzatore)
const Loading = ({ cls = "py-24" }: any) => <div className={`${cls} flex justify-center`} role="status" aria-label="Caricamento"><span className="ldr"><i /><i /><i /><i /><i /></span></div>;

const Reveal = ({ children, delay = 0, className = "", fx = "", style }: any) => {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!("IntersectionObserver" in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`rv ${fx ? `fx-${fx}` : ""} ${on ? "in" : ""} ${className}`} style={{ animationDelay: `${delay}ms`, ...style }}>{children}</div>;
};

export default function App() {
  // auth
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [f, setF] = useState({ email: "", pw: "", name: "", newPw: "" });
  const [authMsg, setAuthMsg] = useState<{ t: "err" | "ok"; m: string } | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  // ui
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("circuito:dark") === "1"; } catch { return false; } });
  const [opts, setOpts] = useState<any>(() => { let o: any = {}; try { o = JSON.parse(localStorage.getItem("circuito:opts") || "{}"); } catch {} const red = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; return { ...DEF, ...(red && !o.level ? { level: "lite" } : {}), ...o }; });
  const [optOpen, setOptOpen] = useState(false);
  const lite = opts.level === "lite", mid = opts.level === "mid";
  const E = { fx: !lite && !mid && !!opts.fx, glow: !lite && !mid && !!opts.glow, aurora: !lite && !mid && !!opts.aurora, intro: !lite && !!opts.intro };
  const setOpt = (k: string, v: any) => setOpts((o: any) => ({ ...o, [k]: v }));
  const [tab, setTab] = useState("home");
  const [month, setMonth] = useState(() => mKey(Date.now()));
  const [monthFilter, setMonthFilter] = useState("all");
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [visible, setVisible] = useState(18);
  const [kb, setKb] = useState(false);
  const [profiles, setProfiles] = useState<any>({});
  const [editProf, setEditProf] = useState(false);
  const [pf, setPf] = useState<any>({});
  const [viewProf, setViewProf] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [toast, setToast] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminModal, setAdminModal] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminErr, setAdminErr] = useState(false);
  // list
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  useEffect(() => { setVisible(18); }, [search, sortBy, monthFilter, onlyMarked, tab]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => {
    if (!user || !db) return;
    return onSnapshot(collection(db, "profili"), (snap: any) => { const m: any = {}; snap.forEach((d: any) => { m[d.id] = d.data(); }); setProfiles(m); }, () => {});
  }, [user]);
  useEffect(() => { try { setIsAdmin(!!user && localStorage.getItem("circuito:admin") === user.uid); } catch {} }, [user]);
  useEffect(() => {
    const i = (e: any) => { const t = e.target; setKb(!!t?.isContentEditable || t?.tagName === "TEXTAREA" || (t?.tagName === "INPUT" && !["range", "checkbox", "file"].includes(t.type))); };
    const o = () => setKb(false);
    window.addEventListener("focusin", i); window.addEventListener("focusout", o);
    return () => { window.removeEventListener("focusin", i); window.removeEventListener("focusout", o); };
  }, []);
  useEffect(() => {
    history.replaceState({ tab: "home" }, "");
    const pop = (e: PopStateEvent) => { setSel(null); setTab(e.state?.tab || "home"); };
    const esc = (e: KeyboardEvent) => { if (e.key !== "Escape") return; if (history.state?.v) history.back(); else { setSel(null); setToDelete(null); setAdminModal(false); setViewProf(null); } };
    window.addEventListener("popstate", pop); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", esc); };
  }, []);
  const [sel, setSel] = useState<any>(null);
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
  const [fmt, setFmt] = useState({ b: false, i: false, u: false });
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
    if (!d.startViewTransition || lite || !e) { setDark(next); return; }
    const h = document.documentElement; h.style.setProperty("--vx", `${e.clientX}px`); h.style.setProperty("--vy", `${e.clientY}px`);
    d.startViewTransition(() => new Promise<void>((res) => { setDark(next); setTimeout(res, 80); }));
  };
  useEffect(() => {
    if (lite) return;
    let raf = 0;
    const f = () => { raf = 0; const h = document.documentElement; const y = window.scrollY, m = h.scrollHeight - window.innerHeight; h.style.setProperty("--sy", String(y)); h.style.setProperty("--sp", m > 0 ? String(Math.min(1, y / m)) : "0"); };
    const on = () => { if (!raf) raf = requestAnimationFrame(f); };
    window.addEventListener("scroll", on, { passive: true }); f();
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [lite]);
  useEffect(() => {
    if (!E.glow && !opts.sound) return;
    let raf = 0, el: any = null, ev: any = null;
    const run = () => {
      raf = 0; if (!el || !ev) return;
      const r = el.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      el.style.setProperty("--mx", `${x}px`); el.style.setProperty("--my", `${y}px`);
      if (ev.pointerType !== "mouse") return;
      if (el.classList.contains("card")) { el.style.setProperty("--rx", `${((y / r.height - 0.5) * -7).toFixed(2)}deg`); el.style.setProperty("--ry", `${((x / r.width - 0.5) * 7).toFixed(2)}deg`); }
      else { el.style.setProperty("--tx", `${((x / r.width - 0.5) * 6).toFixed(1)}px`); el.style.setProperty("--ty", `${((y / r.height - 0.5) * 4).toFixed(1)}px`); }
    };
    const mv = (e: any) => { if (!E.glow) return; const t = e.target?.closest?.(".card,.bt"); if (!t) return; el = t; ev = e; if (!raf) raf = requestAnimationFrame(run); };
    const out = (e: any) => { const t = e.target?.closest?.(".card,.bt"); if (t) ["--rx", "--ry", "--tx", "--ty"].forEach((k) => t.style.removeProperty(k)); };
    const dn = (e: any) => {
      const t = e.target?.closest?.(".card,.bt"); if (!t) return;
      if (opts.sound) blip(480 + Math.random() * 360);
      if (!E.glow) return;
      const r = t.getBoundingClientRect(); t.style.setProperty("--mx", `${e.clientX - r.left}px`); t.style.setProperty("--my", `${e.clientY - r.top}px`);
      if (t.classList.contains("bt")) { t.style.setProperty("--px", `${e.clientX - r.left}px`); t.style.setProperty("--py", `${e.clientY - r.top}px`); t.classList.remove("rip"); void t.offsetWidth; t.classList.add("rip"); }
    };
    document.addEventListener("pointermove", mv, { passive: true }); document.addEventListener("pointerout", out, { passive: true }); document.addEventListener("pointerdown", dn, { passive: true });
    return () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerout", out); document.removeEventListener("pointerdown", dn); cancelAnimationFrame(raf); };
  }, [E.glow, opts.sound]);
  useEffect(() => {
    const lock = sel || adminModal || toDelete || done || viewProf;
    document.body.style.overflow = lock ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sel, adminModal, toDelete, done, viewProf]);

  // auth state + link reset password
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("mode") === "resetPassword" && p.get("oobCode")) { setResetCode(p.get("oobCode")); setAuthLoading(false); return; }
    return onAuthStateChanged(auth, (u: any) => { setUser(u); setAuthLoading(false); });
  }, []);

  // dati
  useEffect(() => {
    if (!user || !db) return;
    let q: any;
    if (isAdmin && ["read", "home", "podio", "authors"].includes(tab)) q = collection(db, "pensieri");
    else if (tab === "my_pages" || tab === "home" || tab === "profile") q = query(collection(db, "pensieri"), where("userId", "==", user.uid));
    else return;
    setLoading(true); setItems([]);
    return onSnapshot(q, (s: any) => {
      setItems(s.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setLoading(false); notify("Impossibile leggere i progetti."); });
  }, [user, isAdmin, tab]);

  // bozza: ripristino + salvataggio automatico
  useEffect(() => {
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
    e.preventDefault(); setAuthMsg(null); setAuthLoading(true);
    try {
      if (authMode === "reset") { await sendPasswordResetEmail(auth, f.email); setAuthMsg({ t: "ok", m: "Link di recupero inviato. Controlla la posta." }); }
      else if (authMode === "register") { const c = await createUserWithEmailAndPassword(auth, f.email, f.pw); await updateProfile(c.user, { displayName: f.name.trim() || "Operatore" }); }
      else await signInWithEmailAndPassword(auth, f.email, f.pw);
    } catch (x: any) {
      const m: any = { "auth/email-already-in-use": "Questa email è già registrata.", "auth/invalid-credential": "Email o password errate.", "auth/weak-password": "La password deve avere almeno 6 caratteri.", "auth/invalid-email": "L'email non è valida.", "auth/user-not-found": "Utente non trovato.", "auth/missing-email": "Inserisci un'email." };
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
  const logout = async () => { await signOut(auth); try { localStorage.removeItem("circuito:admin"); } catch {} setIsAdmin(false); setTab("home"); };
  const adminLogin = (e: any) => {
    e.preventDefault();
    if (adminPw.toLowerCase() === "infinito") { setIsAdmin(true); try { localStorage.setItem("circuito:admin", user.uid); } catch {} setTab("home"); setAdminModal(false); setAdminPw(""); } else setAdminErr(true);
  };

  // --- editor handlers ---
  const cmd = (c: string, v?: string) => {
    document.execCommand(c, false, v);
    editorRef.current?.focus(); setContent(editorRef.current.innerHTML); readFmt();
  };
  const readFmt = () => setFmt({ b: document.queryCommandState("bold"), i: document.queryCommandState("italic"), u: document.queryCommandState("underline") });
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
    if (JSON.stringify(data).length > 950000) return notify("Progetto troppo pesante: riduci le immagini o il disegno.");
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
    try { const b = writeBatch(db); chosen.forEach((t) => b.update(doc(db, "pensieri", t.id), { isStarred: val })); await b.commit(); notify(val ? "Segnalibro aggiunto." : "Segnalibro rimosso."); }
    catch { notify("Operazione non riuscita."); }
    setIds([]); setSelMode(false);
  };
  const rate = async (t: any, n: number) => { if (!isAdmin) return; if (opts.vibrate) navigator.vibrate?.(12); await updateDoc(doc(db, "pensieri", t.id), { rating: n }); if (sel?.id === t.id) setSel({ ...sel, rating: n }); };
  const star = async (t: any) => { if (isAdmin) { if (opts.vibrate) navigator.vibrate?.(12); await updateDoc(doc(db, "pensieri", t.id), { isStarred: !t.isStarred }); if (sel?.id === t.id) setSel({ ...sel, isStarred: !t.isStarred }); } };
  const confirmDelete = async () => {
    const list = toDelete!; setToDelete(null); setSel(null); setGone(list);
    setTimeout(async () => {
      try { const b = writeBatch(db); list.forEach((id) => b.delete(doc(db, "pensieri", id))); await b.commit(); notify(list.length > 1 ? `${list.length} progetti eliminati.` : "Progetto eliminato."); }
      catch { notify("Eliminazione non riuscita: controlla i permessi."); }
      setGone([]); setIds([]); setSelMode(false);
    }, 300);
  };
  const openView = (t: any) => { history.pushState({ tab, v: 1 }, ""); setSel(t); };
  const closeView = () => { if (history.state?.v) history.back(); else setSel(null); };
  const go = (t: string) => { if (t !== tab) history.pushState({ tab: t }, ""); setTab(t); setSelMode(false); setIds([]); setSearch(""); setMonthFilter("all"); setOnlyMarked(false); };

  const prepared = useMemo(() => items.map((t) => ({ ...t, _tx: plain(t.content), _img: /<img/.test(t.content || "") })), [items]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prepared
      .filter((t) => (monthFilter === "all" || mKey(t.timestamp) === monthFilter) && (!onlyMarked || t.isStarred) && (!q || `${t.title} ${t.author} ${t._tx}`.toLowerCase().includes(q)))
      .sort((a, b) => sortBy === "rated" ? (b.rating || 0) - (a.rating || 0) || b.timestamp - a.timestamp : sortBy === "oldest" ? a.timestamp - b.timestamp : sortBy === "longest" ? (b.content?.length || 0) - (a.content?.length || 0) : sortBy === "shortest" ? (a.content?.length || 0) - (b.content?.length || 0) : b.timestamp - a.timestamp);
  }, [prepared, search, sortBy, monthFilter, onlyMarked]);
  const words = plain(content).trim().split(/\s+/).filter(Boolean).length;

  // ================= RENDER =================
  const shell = (children: any) => <div className={`root ${dark ? "dark" : ""} ${lite ? "lite" : ""} ${E.glow ? "" : "noglow"} ${E.aurora ? "" : "noaurora"} ${E.intro ? "" : "nointro"} min-h-screen`}><style>{CSS}</style><div className="prog" />{children}</div>;

  if (authLoading) return shell(<div className="flex min-h-[100dvh] items-center justify-center p-6"><Wordmark stack center size={104} fs={32} /></div>);

  if (!user || resetCode) {
    const Msg = authMsg && <div className={`mb-4 p-3 rounded-lg text-sm ${authMsg.t === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{authMsg.m}</div>;
    const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
    return shell(<>
      <Backdrop tab="home" fx={E.fx} dark={dark} />
      <div className="relative z-10 min-h-screen grid md:grid-cols-2">
        <div className="brandpanel hidden md:flex flex-col justify-between p-12"><div className="bd-p w" />
          <Wordmark light size={56} fs={26} />
          <div>
            <h1 className="hd text-5xl font-bold leading-tight max-w-md up">Scrivi senza limiti. Ogni mese emergono i testi migliori.</h1>
            <p className="mu mt-4 max-w-sm up" style={{ animationDelay: "150ms" }}>Testo, foto e disegni a mano libera nello stesso foglio. Ogni mese i testi migliori vengono letti e premiati.</p>
          </div>
          <span className="mu text-sm">Archivio di scrittura</span>
        </div>
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm pop"><div className="md:hidden mb-10"><Wordmark stack center size={88} fs={30} /></div>
            {resetCode ? (
              <form onSubmit={submitNewPw} className="space-y-4">
                <h2 className="hd text-3xl font-bold mb-2">Scegli una nuova password</h2>
                {Msg}
                <input className="inp" type="password" minLength={6} required autoFocus placeholder="Almeno 6 caratteri" value={f.newPw} onChange={set("newPw")} />
                <button className="bt pri w-full py-3">Aggiorna password</button>
              </form>
            ) : (
              <form onSubmit={submitAuth} className="space-y-4">
                <h2 className="hd text-3xl font-bold">{authMode === "login" ? "Bentornato" : authMode === "register" ? "Crea il tuo profilo" : "Recupera l'accesso"}</h2>
                {authMode !== "reset" && (
                  <div className="flex p-1 rounded-xl sf" style={{ background: "var(--sf)", border: "1px solid var(--ln)" }}>
                    {["login", "register"].map((m) => <button type="button" key={m} onClick={() => { setAuthMode(m); setAuthMsg(null); }} className={`bt flex-1 border-0 ${authMode === m ? "" : "!bg-transparent mu"}`}>{m === "login" ? "Accedi" : "Registrati"}</button>)}
                  </div>
                )}
                {Msg}
                {authMode === "register" && <input className="inp" required placeholder="Nome operatore" value={f.name} onChange={set("name")} />}
                <input className="inp" type="email" required placeholder="Email" autoComplete="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={set("email")} />
                {authMode !== "reset" && <div className="relative"><input className="inp !pr-12" type={showPw ? "text" : "password"} required placeholder="Password" autoComplete={authMode === "register" ? "new-password" : "current-password"} value={f.pw} onChange={set("pw")} /><div className="absolute right-1.5 inset-y-0 flex items-center"><button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Nascondi password" : "Mostra password"} className="bt !border-0 !bg-transparent !p-2">{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>}
                <button className="bt pri w-full py-3">{authMode === "login" ? "Entra" : authMode === "register" ? "Crea profilo" : "Invia link di recupero"}</button>
                {authMode === "login" && <button type="button" className="mu text-sm lk" onClick={() => { setAuthMode("reset"); setAuthMsg(null); }}>Password dimenticata?</button>}
                {authMode === "reset" && <button type="button" className="mu text-sm lk" onClick={() => { setAuthMode("login"); setAuthMsg(null); }}>Torna all'accesso</button>}
              </form>
            )}
          </div>
        </div>
      </div>
    </>);
  }

  const nav: any[] = [
    { id: "home", label: "Panoramica", s: "Home", icon: LayoutDashboard },
    { id: "write", label: editingId ? "Modifica" : "Nuovo progetto", s: editingId ? "Modifica" : "Nuovo", icon: Pen },
    { id: "my_pages", label: "I miei progetti", s: "Miei", icon: Bookmark },
    ...(isAdmin ? [
      { id: "read", label: "Tutti gli scritti", s: "Tutti", icon: Activity },
      { id: "podio", label: "Podio del mese", s: "Podio", icon: Trophy }, { id: "authors", label: "Autori", icon: Users },
    ] : []),
  ];
  const monthOpts: string[] = Array.from(new Set<string>(items.map((t: any) => mKey(t.timestamp)))).sort().reverse();
  const monthNow = mKey(Date.now());
  const thisMonth = items.filter((t) => mKey(t.timestamp) === monthNow);
  const myName = profiles[user.uid]?.displayName || user.displayName || "Operatore";
  const first = myName.split(" ")[0];
  const dn = (uid: string, fb: string) => profiles[uid]?.displayName || fb;
  const wc = (t: any) => plain(t.content).trim().split(/\s+/).filter(Boolean).length;
  const Row = ({ t, rank }: any) => (
    <button key={t.id} onClick={() => openView(t)} className="nv w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-colors">
      {rank && <span className="hd w-8 text-center font-bold mu">{rank}</span>}
      <Avatar p={profiles[t.userId]} name={t.author} size={36} />
      <div className="flex-1 min-w-0"><div className="font-semibold truncate">{t.title}</div><div className="mu text-xs">{dn(t.userId, t.author)} · {fmtDate(t.timestamp)}</div></div>
      {isAdmin && <Stars v={t.rating || 0} size={14} />}
    </button>
  );

  const startEditProf = () => {
    const p = profiles[user.uid] || {};
    setPf({ displayName: p.displayName || user.displayName || "", handle: p.handle || "", status: p.status || "", bio: p.bio || "", avatar: p.avatar || "", banner: p.banner || "teal" });
    setEditProf(true);
  };
  const pickAvatar = async (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { setPf({ ...pf, avatar: await avatarFrom(f) }); } catch { notify("Immagine non valida."); }
    e.target.value = "";
  };
  const saveProf = async (e: any) => {
    e.preventDefault();
    const name = (pf.displayName || "").trim() || "Operatore";
    const data = { displayName: name, handle: (pf.handle || "").trim(), status: (pf.status || "").trim(), bio: (pf.bio || "").trim(), avatar: pf.avatar || "", banner: pf.banner || "teal",
      createdAt: profiles[user.uid]?.createdAt || Date.now(), updatedAt: Date.now() };
    try { await setDoc(doc(db, "profili", user.uid), data); if (name !== user.displayName) await updateProfile(user, { displayName: name }); setEditProf(false); notify("Profilo aggiornato."); }
    catch { notify("Salvataggio del profilo non riuscito."); }
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
    return (
      <div>
        <div className="relative h-32 md:h-40" style={{ background: bn.g }}><div className="bd-p w" /></div>
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
                <div className="flex flex-wrap gap-3 mt-2">{BANNERS.map((b) => <button type="button" key={b.id} aria-label={`Copertina ${b.id}`} onClick={() => setPf({ ...pf, banner: b.id })} className="sw w-11 h-11 rounded-xl" style={{ background: b.g, boxShadow: pf.banner === b.id ? "0 0 0 2px var(--pn),0 0 0 4px var(--ac)" : "none" }} />)}</div></div>
              {fld("Nome visualizzato", "displayName", "Il tuo nome", 30)}
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
      <button className="bt dng w-full md:hidden" onClick={logout}><LogOut size={16} />Esci dall'account</button>
    </div>
  );

  const stats = isAdmin
    ? [{ l: "Scritti ricevuti", v: items.length, i: Cpu }, { l: "Autori", v: new Set(items.map((t) => t.userId)).size, i: Users }, { l: "Questo mese", v: thisMonth.length, i: Activity }, { l: "Da valutare", v: thisMonth.filter((t) => !t.rating).length, i: Star }]
    : [{ l: "I tuoi progetti", v: items.length, i: Bookmark }, { l: "Questo mese", v: thisMonth.length, i: Activity }, { l: "Parole scritte", v: items.reduce((a, t) => a + wc(t), 0), i: Pen }];
  const recent = [...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const homeView = (
    <div className="space-y-8">
      <Reveal><div className="pn brandpanel p-8 md:p-12"><div className="bd-p w" /><span className="hidden md:block" style={{ position: "absolute", right: 48, top: "50%", transform: "translateY(-50%)" }}><Logo size={170} /></span><span className="md:hidden block mb-5"><Logo size={76} /></span>
        <h2 className="hd text-3xl md:text-5xl font-bold max-w-xl leading-tight">Ciao {first}, {isAdmin ? "ecco cosa è arrivato." : "cosa vuoi scrivere oggi?"}</h2>
        <p className="mu mt-3 max-w-md">{isAdmin ? `Ci sono ${thisMonth.filter((t) => !t.rating).length} scritti di ${mLabel(monthNow)} ancora senza voto.` : "Scrivi liberamente, aggiungi foto e disegni. A fine mese gli scritti vengono letti e i migliori selezionati."}</p>
        <div className="flex flex-wrap gap-2 mt-7">
          <button className="bt !px-5 !py-3" onClick={() => go("write")}><Pen size={16} />Scrivi un progetto</button>
          {isAdmin && <button className="bt !px-5 !py-3" onClick={() => go("podio")}><Trophy size={16} />Vai al podio</button>}
        </div>
      </div></Reveal>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((x, i) => <Reveal key={x.l} delay={i * 70} className="h-full"><div className="pn card p-5 h-full"><x.i size={18} className="mu" /><div className="hd text-4xl font-bold mt-3">{x.v}</div><div className="mu text-sm">{x.l}</div></div></Reveal>)}
      </div>
      <Reveal><div className="pn p-2">
        <h3 className="hd text-lg font-bold px-4 pt-4 pb-2">Ultimi progetti</h3>
        {loading ? <div className="p-6 flex justify-center"><Loader2 className="animate-spin" style={{ color: "var(--ac)" }} /></div>
          : recent.length === 0 ? <p className="mu text-sm px-4 pb-5">Ancora niente qui. Il primo progetto comparirà in questa lista.</p>
          : recent.map((t) => <Row key={t.id} t={t} />)}
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
                  <div onClick={() => openView(t)} className={`pn card cursor-pointer p-6 ${k === 0 ? "md:pt-10 md:pb-16 spin-b" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="hd w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: k === 0 ? "var(--am)" : "var(--sf)", color: k === 0 ? "#3b2a00" : "var(--ink)" }}>{k + 1}</span>
                      <Stars v={t.rating || 0} size={16} />
                    </div>
                    <h3 className="hd text-xl font-bold mt-5 line-clamp-2">{t.title}</h3>
                    <div className="flex items-center gap-2 mt-2"><Avatar p={profiles[t.userId]} name={t.author} size={24} /><span className="mu text-sm">{dn(t.userId, t.author)}</span></div>
                    <p className="mu text-sm mt-3 line-clamp-3">{plain(t.content)}</p>
                  </div>
                </Reveal>
              ); })}
          </div>
          {rest.length > 0 && <Reveal className="mt-8"><div className="pn p-2"><h3 className="hd text-lg font-bold px-4 pt-4 pb-2">In lizza</h3>{rest.map((t, i) => <Row key={t.id} t={t} rank={i + 4} />)}</div></Reveal>}
        </>)}
    </div>
  );

  const authors: any[] = Object.values(items.reduce((m: any, t) => { const k = t.userId || t.author; const a = (m[k] = m[k] || { name: dn(t.userId, t.author || "?"), uid: t.userId, n: 0, r: [], last: 0 }); a.n++; if (t.rating) a.r.push(t.rating); a.last = Math.max(a.last, t.timestamp); return m; }, {}))
    .map((a: any) => ({ ...a, avg: a.r.length ? a.r.reduce((x: number, y: number) => x + y, 0) / a.r.length : 0 })).sort((a: any, b: any) => b.n - a.n);
  const authorsView = loading ? <div className="py-24 flex justify-center"><Loader2 className="animate-spin" style={{ color: "var(--ac)" }} /></div> : authors.length === 0 ? (
    <div className="pn p-12 text-center max-w-md mx-auto"><Users className="mx-auto mb-4 mu" size={36} /><h3 className="hd text-xl font-bold">Ancora nessun autore</h3><p className="mu text-sm mt-1">Compariranno appena arriva il primo scritto.</p></div>
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
      <Backdrop tab={tab} fx={E.fx} dark={dark} />
      {/* sidebar desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col p-5 gap-1 pn !rounded-none !border-y-0 !border-l-0 z-20">
        <div className="flex items-center gap-2.5 mb-8 cursor-pointer select-none" onDoubleClick={() => !isAdmin && setAdminModal(true)} title="Il Circuito">
          <Wordmark stack size={52} fs={22} />
        </div>
        {nav.map((n) => <button key={n.id} onClick={() => go(n.id)} className={`bt !justify-start w-full ${tab === n.id ? "on" : "!border-transparent !bg-transparent"} nv`}><n.icon size={16} />{n.label}</button>)}
        <div className="mt-auto space-y-2">
          {isAdmin && <button onClick={() => { try { localStorage.removeItem("circuito:admin"); } catch {} setIsAdmin(false); setTab("home"); }} className="bt w-full !justify-start"><Unlock size={16} />Esci da admin</button>}
          <div className="flex items-center gap-2">
            <button onClick={() => go("profile")} className="nv flex-1 min-w-0 flex items-center gap-2.5 text-left rounded-xl p-1.5"><Avatar p={profiles[user.uid]} name={myName} size={36} /><span className="min-w-0 text-sm"><span className="block font-semibold truncate">{myName}</span><span className="block mu text-xs truncate">{user.email}</span></span></button>
            <button className="bt !p-2" onClick={() => setOptOpen(true)} title="Opzioni" aria-label="Opzioni"><Settings size={18} /></button>
            <button className="bt !p-2" onClick={logout} title="Esci"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* barra mobile */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 pn !rounded-none !border-x-0 !border-t-0 sticky top-0 z-30 hdr">
        <div className="flex items-center gap-2" onDoubleClick={() => !isAdmin && setAdminModal(true)}><Wordmark size={40} fs={19} tag={false} /></div>
        <div className="flex items-center gap-2"><button className="bt !p-2" onClick={() => setOptOpen(true)} aria-label="Opzioni"><Settings size={18} /></button><button onClick={() => go("profile")} aria-label="Profilo" className="rounded-full" style={tab === "profile" ? { boxShadow: "0 0 0 2px var(--ac)" } : {}}><Avatar p={profiles[user.uid]} name={myName} size={40} /></button></div>
      </header>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 pn hdr !rounded-none !border-x-0 !border-b-0 flex gap-1 px-2 pt-2" style={{ paddingBottom: "calc(.5rem + env(safe-area-inset-bottom))", display: kb || (tab === "write" && drawing) ? "none" : undefined }}>
        {nav.map((n) => <button key={n.id} onClick={() => go(n.id)} aria-label={n.label} className={`bt flex-col flex-1 min-w-0 !gap-1 !px-0 !py-2 !text-[10px] ${tab === n.id ? "on" : "!border-transparent !bg-transparent"}`}><n.icon size={18} /><span className="truncate max-w-full">{n.s || n.label}</span></button>)}
      </nav>

      <div className="md:ml-60 pb-28 md:pb-12 relative">
        <div key={tab} className="pg max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div><h1 className="hd text-3xl md:text-5xl font-bold"><Scramble text={titles[tab]} on={E.intro} /></h1>{isList && !loading && <p className="mu text-sm mt-1.5">{shown.length} {shown.length === 1 ? "progetto" : "progetti"}</p>}</div>
            {isList && (
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative w-full sm:w-auto"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 mu" /><input className="inp !pl-9 !pr-9 !w-full sm:!w-52" placeholder="Cerca" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button type="button" onClick={() => setSearch("")} aria-label="Cancella ricerca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 mu"><X size={15} /></button>}</div>
                <select className="inp !w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{Object.keys(SORTS).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}</select>
                <select className="inp !w-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}><option value="all">Tutti i mesi</option>{monthOpts.map((k) => <option key={k} value={k}>{mLabel(k)}</option>)}</select>
                {isAdmin && tab === "read" && <button className={`bt ${onlyMarked ? "on" : ""}`} onClick={() => setOnlyMarked(!onlyMarked)}><Bookmark size={15} style={onlyMarked ? { fill: "currentColor" } : {}} />Segnalati{items.some((t) => t.isStarred) ? ` (${items.filter((t) => t.isStarred).length})` : ""}</button>}
                {items.length > 0 && <button className={`bt ${selMode ? "on" : ""}`} onClick={() => { setSelMode(!selMode); setIds([]); }}><ListChecks size={15} />{selMode ? "Fine" : "Seleziona"}</button>}
              </div>
            )}
          </div>

          {tab === "home" && homeView}
          {tab === "profile" && profilePage}
          {tab === "podio" && podioView}
          {tab === "authors" && authorsView}
          {/* LISTA */}
          {isList && (loading ? (
            <div className="py-24 flex justify-center"><Loader2 className="animate-spin" style={{ color: "var(--ac)" }} /></div>
          ) : shown.length === 0 ? (
            <div className="pn p-12 text-center max-w-md mx-auto up">
              <Cpu className="mx-auto mb-4 mu" size={36} />
              <h3 className="hd text-xl font-bold mb-1">{search ? "Nessun risultato" : "Ancora nessun progetto"}</h3>
              <p className="mu text-sm mb-5">{search ? "Prova con un'altra parola." : "Crea il primo: puoi scrivere, aggiungere foto e disegnare."}</p>
              {!search && <button className="bt pri" onClick={() => go("write")}><Plus size={15} />Nuovo progetto</button>}
            </div>
          ) : (
            <><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {shown.slice(0, visible).map((t, i) => {
                const picked = ids.includes(t.id), { w, h } = dims(t);
                return (
                  <Reveal key={t.id} delay={(i % 3) * 90} className="h-full"><article onClick={() => selMode ? setIds((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]) : openView(t)}
                    className={`pn card h-full overflow-hidden cursor-pointer ${gone.includes(t.id) ? "gone" : ""} ${picked ? "!border-[var(--ac)] ring-2 ring-[var(--ac)]" : ""}`}>
                    <div className="paper mm sm relative h-40 overflow-hidden">
                      <div className="thumb absolute inset-0">
                        {t.strokes?.length > 0 && <Drawing strokes={t.strokes} w={w} h={h} className="absolute inset-0 w-full" />}
                        <p className="relative p-3 text-[13px] leading-[22px] line-clamp-5" style={{ overflowWrap: "anywhere" }}>{t._tx.slice(0, 260) || (t._img ? "Contenuto con immagini" : "")}</p>
                      </div>
                      {selMode && <div className="absolute top-2 right-2">{picked ? <CheckCircle2 className="fill-white" style={{ color: "var(--ac)" }} /> : <Circle className="text-slate-400" />}</div>}
                      {isAdmin && !selMode && <button type="button" aria-label="Segnalibro" title={t.isStarred ? "Rimuovi segnalibro" : "Aggiungi segnalibro"} onClick={(e) => { e.stopPropagation(); star(t); }} className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ background: "rgba(255,255,255,.92)", boxShadow: "var(--sh1)" }}><Bookmark size={16} style={t.isStarred ? { fill: "var(--ac)", color: "var(--ac)" } : { color: "#64748b" }} /></button>}
                    </div>
                    <div className="p-5 border-t" style={{ borderColor: "var(--ln)" }}>
                      <h2 className="hd font-bold text-lg leading-snug line-clamp-1">{t.title}</h2>
                      <div className="mt-2 flex items-center gap-2 mu text-xs"><Avatar p={profiles[t.userId]} name={t.author} size={22} /><span className="truncate flex-1">{dn(t.userId, t.author)}</span><span className="shrink-0">{fmtDate(t.timestamp)}</span></div>
                      {isAdmin && <div className="mt-3"><Stars v={t.rating || 0} onSet={(n: number) => rate(t, n)} size={15} /></div>}
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
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl" style={{ background: "var(--ln)" }}>
                    <button type="button" className={`bt !border-0 ${!drawing ? "on" : "!bg-transparent"}`} onClick={() => setDrawing(false)}><Type size={16} />Testo</button>
                    <button type="button" className={`bt !border-0 ${drawing ? "on" : "!bg-transparent"}`} onClick={() => { setDrawing(true); setImg(null); }}><Pencil size={16} />Disegno</button>
                  </div>
                </div>
                <div className="sticky top-[64px] md:top-0 z-[35] p-2 pt-0 space-y-2 border-b" style={{ borderColor: "var(--ln)", background: "var(--sf)" }} onPointerDown={(e) => { const t = (e.target as any).tagName; if (t !== "INPUT" && t !== "SELECT") e.preventDefault(); }}>
                  {!drawing ? (<>
                    <div className="grid grid-cols-7 gap-1.5 pt-2">
                      <TB on={fmt.b} fn={() => cmd("bold")} icon={Bold} label="Grassetto" />
                      <TB on={fmt.i} fn={() => cmd("italic")} icon={Italic} label="Corsivo" />
                      <TB on={fmt.u} fn={() => cmd("underline")} icon={Underline} label="Sottolineato" />
                      <TB fn={() => cmd("formatBlock", "h2")} icon={Heading2} label="Titolo" />
                      <TB fn={() => cmd("insertUnorderedList")} icon={List} label="Elenco" />
                      <ColorPicker value="" onPick={(c: string) => cmd("foreColor", c)} label="Colore del testo" cls="bt !min-w-0 !px-0 w-full" wrap="min-w-0"><Palette size={18} /></ColorPicker>
                      <label className="bt !min-w-0 !px-0 cursor-pointer" title="Inserisci foto"><ImageIcon size={18} /><input type="file" accept="image/*" className="hidden" onChange={addImage} /></label>
                    </div>
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
                    onInput={(e: any) => setContent(e.currentTarget.innerHTML)} onClick={pickImg} onKeyUp={readFmt} onMouseUp={readFmt}
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
                <button className="bt on !px-6 !py-3" disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{editingId ? "Salva modifiche" : "Salva progetto"}</button>
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
      {sel && (() => {
        const { w, h } = dims(sel);
        return (
          <div className="fade fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm" onClick={closeView}>
            <div className="pn w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden pop" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 border-b" style={{ borderColor: "var(--ln)" }}>
                <div className="flex items-center gap-3 min-w-0 w-full md:w-auto md:flex-1">
                  <button type="button" onClick={() => setViewProf(sel.userId)} className="shrink-0" aria-label="Apri profilo"><Avatar p={profiles[sel.userId]} name={sel.author} size={44} /></button>
                  <div className="flex-1 min-w-0"><h2 className="hd text-xl md:text-2xl font-bold line-clamp-2 md:truncate">{sel.title}</h2><div className="mu text-xs truncate">{dn(sel.userId, sel.author)} · {fmtDate(sel.timestamp)}</div></div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end self-end md:self-auto w-full md:w-auto">
                  <button className="bt flex-1 md:flex-none justify-center !p-2" title="Copia testo" onClick={() => { navigator.clipboard?.writeText(plain(sel.content)); notify("Testo copiato."); }}><Copy size={15} /><span className="md:hidden text-xs">Copia</span></button>
                  {isAdmin && <button className="bt flex-1 md:flex-none justify-center !p-2" title={sel.isStarred ? "Rimuovi segnalibro" : "Aggiungi segnalibro"} onClick={() => star(sel)}><Bookmark size={15} style={sel.isStarred ? { fill: "var(--ac)", color: "var(--ac)" } : {}} /><span className="md:hidden text-xs">Salva</span></button>}
                  {canEdit(sel) && <button className="bt flex-1 md:flex-none justify-center !p-2" onClick={() => startEdit(sel)} title="Modifica"><Pencil size={15} /><span className="md:hidden text-xs">Modifica</span></button>}
                  {canEdit(sel) && <button className="bt dng flex-1 md:flex-none justify-center !p-2" onClick={() => setToDelete([sel.id])} title="Elimina"><Trash2 size={15} /><span className="md:hidden text-xs">Elimina</span></button>}
                  <button className="bt flex-1 md:flex-none justify-center !p-2" onClick={closeView}><X size={15} /><span className="md:hidden text-xs">Chiudi</span></button>
                </div>
              </div>
              {isAdmin && <div className="flex items-center gap-3 px-4 py-2.5 border-b text-sm" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}><span className="mu">Voto</span><Stars v={sel.rating || 0} onSet={(n: number) => rate(sel, n)} size={22} /></div>}
              <div className="overflow-y-auto">
                <div className="paper mm relative" style={{ aspectRatio: `${w}/${h}` }}>
                  {sel.strokes?.length > 0 && <Drawing strokes={sel.strokes} w={w} h={h} className="absolute inset-0 w-full h-full" />}
                  <div className="rt relative p-6" dangerouslySetInnerHTML={{ __html: clean(sel.content) }} />
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

      {optOpen && (
        <div className="fade fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60" onClick={() => setOptOpen(false)}>
          <div className="pn w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 pop !rounded-b-none md:!rounded-b-[18px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5"><h3 className="hd text-2xl font-bold">Opzioni</h3><button className="bt !p-2" onClick={() => setOptOpen(false)} aria-label="Chiudi"><X size={16} /></button></div>
            <h4 className="text-xs mu mb-2">Aspetto</h4>
            <Seg v={dark} set={(v: boolean, e: any) => setTheme(v, e)} items={[[false, <><Sun size={14} />Chiaro</>], [true, <><Moon size={14} />Scuro</>]]} />
            <div className="h-2" />
            <Seg v={opts.text} set={(v: number) => setOpt("text", v)} items={[[0.9, "Testo piccolo"], [1, "Normale"], [1.12, "Grande"]]} />
            <h4 className="text-xs mu mt-6 mb-2">Effetti e animazioni</h4>
            <Seg v={opts.level} set={(v: string) => setOpt("level", v)} items={[["full", "Spettacolo"], ["mid", "Equilibrato"], ["lite", "Leggero"]]} />
            <p className="text-xs mu mt-2">{({ full: "Tutti gli effetti attivi, regolabili qui sotto.", mid: "Niente circuito vivo, aurora e inclinazione: più leggero.", lite: "Nessuna animazione né effetto: massima velocità e batteria." } as any)[opts.level]}</p>
            <div className="mt-2">
              <Sw on={opts.fx} off={opts.level !== "full"} set={(v: boolean) => setOpt("fx", v)} label="Circuito vivo" hint="Impulsi di corrente sullo sfondo e scintille quando tocchi" />
              <Sw on={opts.glow} off={opts.level !== "full"} set={(v: boolean) => setOpt("glow", v)} label="Bagliore, 3D e onde" hint="Luce che segue il dito, card che si inclinano, onde sui pulsanti" />
              <Sw on={opts.aurora} off={opts.level !== "full"} set={(v: boolean) => setOpt("aurora", v)} label="Aurora animata" hint="Luci in movimento dietro le pagine" />
              <Sw on={opts.intro} off={lite} set={(v: boolean) => setOpt("intro", v)} label="Titoli, logo e card animati" hint="Titoli che si decodificano, card che si accendono" />
            </div>
            <h4 className="text-xs mu mt-4 mb-1">Altro</h4>
            <Sw on={opts.sound} set={(v: boolean) => setOpt("sound", v)} label="Suoni" hint="Piccoli bip elettronici al tocco" />
            <Sw on={opts.vibrate} set={(v: boolean) => setOpt("vibrate", v)} label="Vibrazione" hint="Feedback tattile su segnalibro e voti" />
            <div className="flex gap-2 mt-5">
              <button className="bt flex-1" onClick={() => setOpts({ ...DEF })}><RotateCcw size={15} />Ripristina</button>
              <button className="bt on flex-1" onClick={() => setOpt("level", "lite")}><Zap size={15} />Elimina effetti</button>
            </div>
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

      {/* admin */}
      {adminModal && (
        <div className="fade fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={() => setAdminModal(false)}>
          <form onSubmit={adminLogin} className="pn p-6 max-w-sm w-full pop" onClick={(e) => e.stopPropagation()}>
            <KeyRound className="mb-3" style={{ color: "var(--ac)" }} />
            <h3 className="hd text-xl font-bold mb-3">Accesso amministratore</h3>
            <input type="password" autoFocus className="inp mb-1" style={adminErr ? { borderColor: "#dc2626" } : {}} placeholder="Password" value={adminPw} onChange={(e) => { setAdminPw(e.target.value); setAdminErr(false); }} />
            <p className="text-xs text-red-600 h-4 mb-3">{adminErr ? "Password errata." : ""}</p>
            <div className="flex gap-2 justify-end"><button type="button" className="bt" onClick={() => setAdminModal(false)}>Annulla</button><button className="bt pri" disabled={!adminPw.trim()}>Sblocca</button></div>
          </form>
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
    </>
  );
}
