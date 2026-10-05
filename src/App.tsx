import React, { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail, confirmPasswordReset
} from "firebase/auth";
import {
  getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where
} from "firebase/firestore";
import {
  Cpu, Bookmark, Loader2, Activity, Star, X, KeyRound, Trash2, ListChecks, CheckCircle2, Circle,
  Bold, Italic, Underline, Image as ImageIcon, LogOut, Eraser, Undo, Redo, PaintBucket, Type, Pen,
  Save, Search, Sun, Moon, Pencil, Minus, Square, Grid3x3, Heading2, List, Palette, Copy, Unlock, Plus, LayoutDashboard, Trophy, Users, ChevronLeft, ChevronRight
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
  { id: "fill", label: "Forma piena", icon: PaintBucket }, { id: "eraser", label: "Gomma", icon: Eraser },
];
const SORTS: any = { newest: "Più recenti", rated: "Voto più alto", oldest: "Più vecchi", longest: "Più lunghi", shortest: "Più brevi" };

// --- UTIL ---
const clean = (h: string) => {
  const d = new DOMParser().parseFromString(h || "", "text/html");
  d.querySelectorAll("script,iframe,object,embed,style,link").forEach((n) => n.remove());
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
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
    <path d="M20 50h18l8-24 14 48 8-24h12" />
    <circle cx="14" cy="50" r="6" fill="var(--ac)" stroke="none" /><circle cx="88" cy="50" r="6" fill="var(--ac)" stroke="none" />
  </svg>
);

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
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Instrument+Sans:wght@400;500;600&display=swap');
.root{--bg:#EDF2F1;--pn:#FFFFFF;--ink:#0E1F1D;--mu:#5B706D;--ln:#DCE6E4;--sf:#F4F8F7;--ac:#0F8B7A;--am:#E8A100;
--sh1:0 1px 2px rgba(14,31,29,.04),0 6px 16px -8px rgba(14,31,29,.10);--sh2:0 2px 4px rgba(14,31,29,.04),0 22px 44px -16px rgba(14,31,29,.26);--ez:cubic-bezier(.22,1,.36,1);
font-family:'Instrument Sans',system-ui,sans-serif;color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;
background:radial-gradient(900px 420px at 85% -8%,color-mix(in srgb,var(--ac) 12%,transparent),transparent 70%) fixed,var(--bg)}
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
@keyframes pg{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}
@keyframes popx{from{opacity:0;transform:translate(-50%,12px) scale(.95)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes fd{from{opacity:0}to{opacity:1}}
@keyframes dash{to{stroke-dashoffset:0}}
.pg{animation:pg .6s var(--ez) both} .up{animation:up .7s var(--ez) both}
.pop{animation:pop .45s var(--ez) both} .popx{animation:popx .4s var(--ez) both} .fade{animation:fd .3s ease-out both}
.tick{stroke-dasharray:60;stroke-dashoffset:60;animation:dash .7s .25s ease-out forwards}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.tick{stroke-dashoffset:0}.rv{opacity:1;transform:none}}
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
        <div className="fixed inset-0 z-40" onClick={() => setO(false)} />
        <div className="absolute z-50 top-full left-0 mt-2 pn p-5 pop w-[336px] max-w-[88vw]" style={{ boxShadow: "var(--sh2)" }}>
          <div className="grid grid-cols-7 gap-3">
            {INK_COLORS.map((c) => (
              <button type="button" key={c.id} aria-label={c.name} onMouseEnter={() => setHov(c.name)} onMouseLeave={() => setHov("")}
                onClick={() => { onPick(c.id); setO(false); }} className="sw aspect-square w-full rounded-full"
                style={{ background: c.id, boxShadow: value === c.id ? `0 0 0 2px var(--pn),0 0 0 4px ${c.id}` : "inset 0 0 0 1px rgba(0,0,0,.14)" }} />
            ))}
          </div>
          <p className="text-sm mu mt-4 h-5">{hov || INK_COLORS.find((c) => c.id === value)?.name || "Scegli un colore"}</p>
        </div>
      </>)}
    </div>
  );
};

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
    const lock = sel || adminModal || toDelete || done;
    document.body.style.overflow = lock ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sel, adminModal, toDelete, done]);

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
    else if (isAdmin && tab === "favorites") q = query(collection(db, "pensieri"), where("isStarred", "==", true));
    else if (tab === "my_pages" || tab === "home") q = query(collection(db, "pensieri"), where("userId", "==", user.uid));
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
      if (d) { setTitle(d.title || ""); setContent(d.content || ""); setStrokes(d.strokes || []); setHeight(d.height || 600); setLoadTick((n) => n + 1); }
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
      else if (authMode === "register") { const c = await createUserWithEmailAndPassword(auth, f.email, f.pw); await updateProf