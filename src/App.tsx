import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Save, Search, Sun, Moon, Pencil, Minus, Square, Grid3x3, Heading2, List, Palette, Copy, Unlock, Plus, LayoutDashboard, Trophy, Users, ChevronLeft, ChevronRight, Hand, Eye, EyeOff, MapPin, Link2, Camera, Award, CalendarDays
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
  { id: "hand", label: "Scorri", icon: Hand }, { id: "pen", label: "Penna", icon: Pen }, { id: "line", label: "Linea", icon: Minus },
  { id: "rect", label: "Rettangolo", icon: Square }, { id: "ellipse", label: "Ellisse", icon: Circle },
  { id: "fill", label: "Forma piena", icon: PaintBucket }, { id: "eraser", label: "Gomma", icon: Eraser },
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
const Backdrop = ({ tab }: { tab: string }) => {
  const k = tab === "profile" ? "authors" : ["home", "write", "podio", "authors"].includes(tab) ? tab : "archive";
  return <div key={k} className={`bd bd-${k} fade fixed inset-0 z-0 pointer-events-none`}><div className="bd-w" /><div className="bd-p" /></div>;
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
--sh1:0 1px 2px rgba(14,31,29,.04),0 6px 16px -8px rgba(14,31,29,.10);--sh2:0 2px 4px rgba(14,31,29,.04),0 22px 44px -16px rgba(14,31,29,.26);--ez:cubic-bezier(.22,1,.36,1);
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
transition:transform .3s var(--ez),box-shadow .3s var(--ez),background .2s,border-color .2s,filter .2s}
.bt svg{transition:transform .3s var(--ez)}
.bt:hover{transform:translateY(-2px);border-color:var(--ac);box-shadow:var(--sh1)}
.bt:hover svg{transform:scale(1.15) rotate(-4deg)}
.bt:active{transform:translateY(0) scale(.97);box-shadow:none}
.bt:disabled{opacity:.4;pointer-events:none}
.bt.on{background:var(--ac);border-color:var(--ac);color:#fff} .root.dark .bt.on{color:#042f2a}
.bt.on:hover{filter:brightness(1.08);box-shadow:0 12px 26px -8px color-mix(in srgb,var(--ac) 65%,transparent)}
.bt.pri{background:var(--ink);color:var(--bg);border-color:var(--ink)} .bt.pri:hover{box-shadow:var(--sh2)}
.bt.dng{color:#dc2626;border-color:#fca5a5} .bt.dng:hover{background:#fef2f2;border-color:#dc2626}
.nv:hover{background:var(--sf)!important} .nv:hover svg{transform:translateX(3px)}
.lk{background:linear-gradient(currentColor,currentColor) 0 100%/0 1px no-repeat;transition:background-size .4s var(--ez),color .2s;cursor:pointer}
.lk:hover{background-size:100% 1px;color:var(--ink)}
.mu{color:var(--mu)}
.card{position:relative;transition:transform .45s var(--ez),box-shadow .45s var(--ez),border-color .3s,opacity .3s}
.card:hover{transform:translateY(-6px);box-shadow:var(--sh2);border-color:color-mix(in srgb,var(--ac) 55%,var(--ln))}
.card:active{transform:translateY(-2px) scale(.99)}
.card:after{content:"";position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--ac);transform:scaleX(0);transform-origin:left;transition:transform .5s var(--ez)}
.card:hover:after{transform:scaleX(1)}
.card .thumb{transition:transform .8s var(--ez)} .card:hover .thumb{transform:scale(1.05)}
.card.gone{opacity:0;transform:scale(.92)}
.paper{background:#fff;color:#10211F}
.mm{background-image:linear-gradient(rgba(15,139,122,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(15,139,122,.12) 1px,transparent 1px);background-size:20px 20px}
.rt{overflow-wrap:anywhere;line-height:32px;font-size:17px}
.rt h2{font-family:'Bricolage Grotesque',sans-serif;font-size:1.6rem;font-weight:700;line-height:40px}
.rt ul{list-style:disc;padding-left:1.5rem} .rt b{font-weight:700} .rt u{text-underline-offset:4px}
.rt img{max-width:100%;height:auto;border-radius:8px;margin:12px auto;display:block;border:1px solid #D5E0DE}
.rt:empty:before{content:attr(data-ph);color:#94a3b8;pointer-events:none}
.sm .rt{line-height:22px;font-size:13px} .sm .rt img{max-height:70px;width:auto;margin:4px 0}
.sw{cursor:pointer;transition:transform .25s var(--ez),box-shadow .25s}.sw:hover{transform:scale(1.18)}
.rv{opacity:0;transform:translateY(28px);transition:opacity .8s var(--ez),transform .8s var(--ez)}
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
.cp{position:absolute;top:100%;left:0;margin-top:.5rem;width:336px;z-index:50;box-shadow:var(--sh2);animation:pop .3s var(--ez) both}
@keyframes sheet{from{transform:translateY(100%)}to{transform:none}}
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
.rv{transform:translateY(16px)}}
@keyframes pgf{from{opacity:0}}
@keyframes pg{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}
@keyframes popx{from{opacity:0;transform:translate(-50%,12px) scale(.95)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes fd{from{opacity:0}to{opacity:1}}
@keyframes dash{to{stroke-dashoffset:0}}
.pg,.fadein{animation:pgf .45s ease-out backwards} .up{animation:up .7s var(--ez) both}
.pop{animation:pop .45s var(--ez) both} .popx{animation:popx .4s var(--ez) both} .fade{animation:fd .3s ease-out both}
.tick{stroke-dasharray:60;stroke-dashoffset:60;animation:dash .7s .25s ease-out forwards}
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
          <Star size={size} style={n <= v ? { fill: "var(--am)", color: "var(--am)" } : { color: "var(--mu)", opacity: 0.35 }} />
        </El>
      ))}
    </div>
  );
};

const ColorPicker = ({ value, onPick, label, cls = "bt", children }: any) => {
  const [o, setO] = useState(false);
  const [hov, setHov] = useState("");
  return (
    <div className="relative">
      <button type="button" className={cls} onClick={() => setO(!o)} title={label}>{children}</button>
      {o && (<>
        <div className="cpov" onClick={() => setO(false)} />
        <div className="cp pn p-5">
          <div className="flex items-center justify-between mb-4"><span className="hd font-bold text-lg">{label}</span><button type="button" className="bt !p-2 md:hidden" onClick={() => setO(false)} aria-label="Chiudi"><X size={16} /></button></div>
          <div className="grid grid-cols-5 md:grid-cols-7 gap-4 md:gap-3">
            {INK_COLORS.map((c) => (
              <button type="button" key={c.id} aria-label={c.name} onMouseEnter={() => setHov(c.name)} onMouseLeave={() => setHov("")}
                onClick={() => { onPick(c.id); setO(false); }} className="sw aspect-square w-full rounded-full"
                style={{ background: c.id, boxShadow: value === c.id ? `0 0 0 2px var(--pn),0 0 0 4px ${c.id}` : "inset 0 0 0 1px rgba(128,128,128,.5)" }} />
            ))}
          </div>
          <p className="text-sm mu mt-4 h-5">{hov || INK_COLORS.find((c) => c.id === value)?.name || "Scegli un colore"}</p>
        </div>
      </>)}
    </div>
  );
};

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
const safeUrl = (u: string) => { const v = u.trim(); if (/^https?:\/\//i.test(v)) return v; if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "#"; return `https://${v}`; };

const Reveal = ({ children, delay = 0, className = "" }: any) => {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!("IntersectionObserver" in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`rv ${on ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
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
  const rate = async (t: any, n: number) => { if (!isAdmin) return; navigator.vibrate?.(12); await updateDoc(doc(db, "pensieri", t.id), { rating: n }); if (sel?.id === t.id) setSel({ ...sel, rating: n }); };
  const star = async (t: any) => { if (isAdmin) { navigator.vibrate?.(12); await updateDoc(doc(db, "pensieri", t.id), { isStarred: !t.isStarred }); if (sel?.id === t.id) setSel({ ...sel, isStarred: !t.isStarred }); } };
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
  const shell = (children: any) => <div className={`root ${dark ? "dark" : ""} min-h-screen`}><style>{CSS}</style>{children}</div>;

  if (authLoading) return shell(<div className="flex min-h-[100dvh] items-center justify-center p-6"><Wordmark stack center size={104} fs={32} /></div>);

  if (!user || resetCode) {
    const Msg = authMsg && <div className={`mb-4 p-3 rounded-lg text-sm ${authMsg.t === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{authMsg.m}</div>;
    const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
    return shell(<>
      <Backdrop tab="home" />
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
    setPf({ displayName: p.displayName || user.displayName || "", handle: p.handle || "", status: p.status || "", bio: p.bio || "", place: p.place || "", link: p.link || "", tagsText: (p.tags || []).join(", "), avatar: p.avatar || "", banner: p.banner || "teal" });
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
    const data = { displayName: name, handle: (pf.handle || "").trim(), status: (pf.status || "").trim(), bio: (pf.bio || "").trim(), place: (pf.place || "").trim(), link: (pf.link || "").trim(),
      tags: (pf.tagsText || "").split(",").map((x: string) => x.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5), avatar: pf.avatar || "", banner: pf.banner || "teal",
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
          <div className="flex items-end justify-between -mt-12">
            <span className="rounded-full p-1 relative" style={{ background: "var(--pn)" }}><Avatar p={shownAvatar} name={name} size={96} /></span>
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
              {fld("Luogo", "place", "es. Torino", 40)}
              {fld("Sito o link", "link", "es. miosito.it", 80)}
              {fld("Interessi (separati da virgola, max 5)", "tagsText", "elettronica, poesia, jazz", 80)}
              <div className="flex gap-2 justify-end pt-2"><button type="button" className="bt" onClick={() => setEditProf(false)}>Annulla</button><button className="bt on !px-6">Salva profilo</button></div>
            </form>
          ) : (<>
            <h2 className="hd text-2xl md:text-3xl font-bold mt-3">{name}</h2>
            <div className="mu text-sm">{p.handle ? `@${p.handle}` : own ? "Aggiungi un handle" : ""}{p.status ? ` · ${p.status}` : ""}</div>
            {p.bio ? <p className="mt-4 whitespace-pre-line">{p.bio}</p> : own && <p className="mu mt-4 text-sm">Aggiungi una bio per presentarti.</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm mu">
              {p.place && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{p.place}</span>}
              {p.link && <a className="lk inline-flex items-center gap-1.5" href={safeUrl(p.link)} target="_blank" rel="noopener noreferrer"><Link2 size={15} />{p.link.replace(/^https?:\/\//i, "")}</a>}
              {ts ? <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} />Membro da {mLabel(mKey(ts))}</span> : null}
            </div>
            {p.tags?.length > 0 && <div className="flex flex-wrap gap-2 mt-4">{p.tags.map((t: string) => <span key={t} className="text-xs px-3 py-1 rounded-full" style={{ border: "1px solid var(--ln)", background: "var(--sf)" }}>#{t}</span>)}</div>}
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
                  <div onClick={() => openView(t)} className={`pn card cursor-pointer p-6 ${k === 0 ? "md:pt-10 md:pb-16 !border-[var(--am)]" : ""}`}>
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
      <Backdrop tab={tab} />
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
            <button className="bt !p-2" onClick={() => setDark(!dark)} title="Cambia tema">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="bt !p-2" onClick={logout} title="Esci"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* barra mobile */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 pn !rounded-none !border-x-0 !border-t-0 sticky top-0 z-30 hdr">
        <div className="flex items-center gap-2" onDoubleClick={() => !isAdmin && setAdminModal(true)}><Wordmark size={40} fs={19} tag={false} /></div>
        <div className="flex items-center gap-2"><button className="bt !p-2" onClick={() => setDark(!dark)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button><button onClick={() => go("profile")} aria-label="Profilo" className="rounded-full" style={tab === "profile" ? { boxShadow: "0 0 0 2px var(--ac)" } : {}}><Avatar p={profiles[user.uid]} name={myName} size={40} /></button></div>
      </header>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 pn hdr !rounded-none !border-x-0 !border-b-0 flex gap-1 px-2 pt-2" style={{ paddingBottom: "calc(.5rem + env(safe-area-inset-bottom))", display: kb ? "none" : undefined }}>
        {nav.map((n) => <button key={n.id} onClick={() => go(n.id)} aria-label={n.label} className={`bt flex-col flex-1 min-w-0 !gap-1 !px-0 !py-2 !text-[10px] ${tab === n.id ? "on" : "!border-transparent !bg-transparent"}`}><n.icon size={18} /><span className="truncate max-w-full">{n.s || n.label}</span></button>)}
      </nav>

      <div className="md:ml-60 pb-28 md:pb-12 relative">
        <div key={tab} className="pg max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div><h1 className="hd text-3xl md:text-5xl font-bold">{titles[tab]}</h1>{isList && !loading && <p className="mu text-sm mt-1.5">{shown.length} {shown.length === 1 ? "progetto" : "progetti"}</p>}</div>
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
                      <div className="mt-2 flex items-center gap-2 mu text-xs"><Avatar p={profiles[t.userId]} name={t.author} size={22} /><span className="truncate flex-1">{dn(t.userId, t.author)}</span><span>{fmtDate(t.timestamp)}</span></div>
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
                <div className={`p-2 border-b space-y-2 rounded-t-[17px] ${!drawing ? "sticky top-[64px] md:top-0 z-[35]" : ""}`} style={{ borderColor: "var(--ln)", background: "var(--sf)" }} onPointerDown={(e) => { if ((e.target as any).tagName !== "INPUT" && (e.target as any).tagName !== "SELECT") e.preventDefault(); }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex p-0.5 rounded-lg" style={{ border: "1px solid var(--ln)" }}>
                      <button type="button" className={`bt border-0 ${!drawing ? "on" : ""}`} onClick={() => setDrawing(false)}><Type size={15} />Testo</button>
                      <button type="button" className={`bt border-0 ${drawing ? "on" : ""}`} onClick={() => { setDrawing(true); setImg(null); }}><Pencil size={15} />Disegno</button>
                    </div>
                    {!drawing ? (<>
                      <button type="button" className={`bt !p-2 ${fmt.b ? "on" : ""}`} onClick={() => cmd("bold")} title="Grassetto"><Bold size={15} /></button>
                      <button type="button" className={`bt !p-2 ${fmt.i ? "on" : ""}`} onClick={() => cmd("italic")} title="Corsivo"><Italic size={15} /></button>
                      <button type="button" className={`bt !p-2 ${fmt.u ? "on" : ""}`} onClick={() => cmd("underline")} title="Sottolineato"><Underline size={15} /></button>
                      <button type="button" className="bt !p-2" onClick={() => cmd("formatBlock", "h2")} title="Titolo"><Heading2 size={15} /></button>
                      <button type="button" className="bt !p-2" onClick={() => cmd("insertUnorderedList")} title="Elenco"><List size={15} /></button>
                      <ColorPicker value="" onPick={(c: string) => cmd("foreColor", c)} label="Colore testo" cls="bt !p-2"><Palette size={15} /></ColorPicker>
                      <label className="bt !p-2 cursor-pointer" title="Inserisci foto"><ImageIcon size={15} /><input type="file" accept="image/*" className="hidden" onChange={addImage} /></label>
                      {img && <div className="flex gap-1 items-center ml-1">
                        {["25%", "50%", "75%", "100%"].map((w) => <button type="button" key={w} className="bt !px-2 !py-1 !text-xs" onClick={() => resizeImg(w)}>{w}</button>)}
                        <button type="button" className="bt dng !p-1.5" onClick={removeImg}><Trash2 size={14} /></button>
                      </div>}
                    </>) : (<>
                      {TOOLS.map((t) => <button type="button" key={t.id} title={t.label} aria-label={t.label} className={`bt ${tool === t.id ? "on" : ""}`} onClick={() => setTool(t.id)}><t.icon size={16} /><span className="hidden sm:inline">{t.label}</span></button>)}
                    </>)}
                    <div className="ml-auto flex gap-2">
                      <button type="button" className={`bt !p-2 ${grid ? "on" : ""}`} onClick={() => setGrid(!grid)} title="Griglia"><Grid3x3 size={15} /></button>
                      {drawing && <>
                        <button type="button" className="bt !p-2" disabled={!hist.length} onClick={undo} title="Annulla (Ctrl+Z)"><Undo size={15} /></button>
                        <button type="button" className="bt !p-2" disabled={!fut.length} onClick={redo} title="Ripeti (Ctrl+Y)"><Redo size={15} /></button>
                        <button type="button" className="bt dng" disabled={!strokes.length} onClick={() => { snap(); setStrokes([]); }}>Svuota</button>
                      </>}
                    </div>
                  </div>
                  {drawing && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      {tool !== "eraser" && <ColorPicker value={color} onPick={setColor} label="Colore"><span className="w-4 h-4 rounded-full" style={{ background: color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" }} />Colore</ColorPicker>}
                      <label className="flex items-center gap-2 text-xs mu">Spessore<input type="range" min={tool === "eraser" ? 5 : 1} max={tool === "eraser" ? 100 : 40} value={tool === "eraser" ? eraser : size} onChange={(e) => tool === "eraser" ? setEraser(+e.target.value) : setSize(+e.target.value)} className="accent-teal-600" /></label>
                      {tool !== "eraser" && <label className="flex items-center gap-2 text-xs mu">Opacità<input type="range" min={5} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="accent-teal-600" /></label>}
                      {(tool === "rect" || tool === "ellipse") && <label className="flex items-center gap-2 text-xs mu"><input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} />Riempi</label>}
                    </div>
                  )}
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
                  <span>{words} parole · {strokes.length} tratti{!editingId && " · bozza salvata in automatico"}</span>
                  <button type="button" className="bt !py-1 !text-xs" onClick={() => setHeight((h) => h + 300)}><Plus size={13} />Più spazio</button>
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
              <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: "var(--ln)" }}>
                <button type="button" onClick={() => setViewProf(sel.userId)} className="shrink-0" aria-label="Apri profilo"><Avatar p={profiles[sel.userId]} name={sel.author} size={44} /></button>
                <div className="flex-1 min-w-0"><h2 className="hd text-2xl font-bold truncate">{sel.title}</h2><div className="mu text-xs">{dn(sel.userId, sel.author)} · {fmtDate(sel.timestamp)}</div></div>
                <button className="bt !p-2" title="Copia testo" onClick={() => { navigator.clipboard?.writeText(plain(sel.content)); notify("Testo copiato."); }}><Copy size={15} /></button>
                {isAdmin && <button className="bt !p-2" title={sel.isStarred ? "Rimuovi segnalibro" : "Aggiungi segnalibro"} onClick={() => star(sel)}><Bookmark size={15} style={sel.isStarred ? { fill: "var(--ac)", color: "var(--ac)" } : {}} /></button>}
                {canEdit(sel) && <button className="bt !p-2" onClick={() => startEdit(sel)} title="Modifica"><Pencil size={15} /></button>}
                {canEdit(sel) && <button className="bt dng !p-2" onClick={() => setToDelete([sel.id])} title="Elimina"><Trash2 size={15} /></button>}
                <button className="bt !p-2" onClick={closeView}><X size={15} /></button>
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
