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
  Save, Search, Sun, Moon, Pencil, Minus, Square, Grid3x3, Heading2, List, Palette, Copy, Unlock, Plus
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
const SORTS: any = { newest: "Più recenti", oldest: "Più vecchi", longest: "Più lunghi", shortest: "Più brevi" };

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
  const [tab, setTab] = useState("write");
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
    if (isAdmin && tab === "read") q = collection(db, "pensieri");
    else if (isAdmin && tab === "favorites") q = query(collection(db, "pensieri"), where("isStarred", "==", true));
    else if (tab === "my_pages") q = query(collection(db, "pensieri"), where("userId", "==", user.uid));
    else return;
    setLoading(true);
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
  const logout = async () => { await signOut(auth); setIsAdmin(false); setTab("write"); };
  const adminLogin = (e: any) => {
    e.preventDefault();
    if (adminPw.toLowerCase() === "infinito") { setIsAdmin(true); setTab("read"); setAdminModal(false); setAdminPw(""); } else setAdminErr(true);
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
      else await addDoc(collection(db, "pensieri"), { ...data, author: user.displayName || "Operatore", timestamp: Date.now(), userId: user.uid, isStarred: false });
      setDone(editingId ? "edit" : "new");
    } catch { notify("Salvataggio non riuscito. Riprova."); }
    setSaving(false);
  };

  // --- azioni lista ---
  const canEdit = (t: any) => isAdmin || t.userId === user?.uid;
  const star = async (t: any) => { if (isAdmin) { await updateDoc(doc(db, "pensieri", t.id), { isStarred: !t.isStarred }); if (sel?.id === t.id) setSel({ ...sel, isStarred: !t.isStarred }); } };
  const confirmDelete = async () => {
    const list = toDelete!; setToDelete(null); setSel(null); setGone(list);
    setTimeout(async () => {
      try { const b = writeBatch(db); list.forEach((id) => b.delete(doc(db, "pensieri", id))); await b.commit(); notify(list.length > 1 ? `${list.length} progetti eliminati.` : "Progetto eliminato."); }
      catch { notify("Eliminazione non riuscita: controlla i permessi."); }
      setGone([]); setIds([]); setSelMode(false);
    }, 300);
  };
  const go = (t: string) => { setTab(t); setSelMode(false); setIds([]); setSearch(""); };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((t) => !q || `${t.title} ${t.author} ${plain(t.content)}`.toLowerCase().includes(q))
      .sort((a, b) => sortBy === "oldest" ? a.timestamp - b.timestamp : sortBy === "longest" ? (b.content?.length || 0) - (a.content?.length || 0) : sortBy === "shortest" ? (a.content?.length || 0) - (b.content?.length || 0) : b.timestamp - a.timestamp);
  }, [items, search, sortBy]);
  const words = plain(content).trim().split(/\s+/).filter(Boolean).length;

  // ================= RENDER =================
  const shell = (children: any) => <div className={`root ${dark ? "dark" : ""} min-h-screen`}><style>{CSS}</style>{children}</div>;

  if (authLoading) return shell(<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: "var(--ac)" }} /></div>);

  if (!user || resetCode) {
    const Msg = authMsg && <div className={`mb-4 p-3 rounded-lg text-sm ${authMsg.t === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{authMsg.m}</div>;
    const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
    return shell(
      <div className="min-h-screen grid md:grid-cols-2">
        <div className="mm hidden md:flex flex-col justify-between p-12" style={{ background: "var(--sf)" }}>
          <div className="flex items-center gap-3"><Logo size={36} /><span className="hd text-xl font-bold">Il Circuito</span></div>
          <div>
            <h1 className="hd text-5xl font-bold leading-tight max-w-md up">Appunti, schemi e progetti nello stesso quaderno.</h1>
            <p className="mu mt-4 max-w-sm up" style={{ animationDelay: "150ms" }}>Scrivi, incolla foto e disegna a mano libera sopra il testo. Tutto resta salvato e ordinato.</p>
          </div>
          <span className="mu text-sm">Archivio personale di elettrotecnica</span>
        </div>
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm pop">
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
                <input className="inp" type="email" required placeholder="Email" value={f.email} onChange={set("email")} />
                {authMode !== "reset" && <input className="inp" type="password" required placeholder="Password" value={f.pw} onChange={set("pw")} />}
                <button className="bt pri w-full py-3">{authMode === "login" ? "Entra" : authMode === "register" ? "Crea profilo" : "Invia link di recupero"}</button>
                {authMode === "login" && <button type="button" className="mu text-sm lk" onClick={() => { setAuthMode("reset"); setAuthMsg(null); }}>Password dimenticata?</button>}
                {authMode === "reset" && <button type="button" className="mu text-sm lk" onClick={() => { setAuthMode("login"); setAuthMsg(null); }}>Torna all'accesso</button>}
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const nav = [
    { id: "write", label: editingId ? "Modifica" : "Nuovo", icon: Pen },
    { id: "my_pages", label: "I miei progetti", icon: Bookmark },
    ...(isAdmin ? [{ id: "read", label: "Tutti", icon: Activity }, { id: "favorites", label: "Preferiti", icon: Star }] : []),
  ];
  const titles: any = { write: editingId ? "Modifica progetto" : "Nuovo progetto", my_pages: "I miei progetti", read: "Tutti i progetti", favorites: "Preferiti" };
  const isList = tab !== "write";

  return shell(
    <>
      {/* sidebar desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col p-5 gap-1 pn !rounded-none !border-y-0 !border-l-0 z-20">
        <div className="flex items-center gap-2.5 mb-8 cursor-pointer select-none" onDoubleClick={() => !isAdmin && setAdminModal(true)} title="Il Circuito">
          <Logo size={30} /><span className="hd text-lg font-bold">Il Circuito</span>
        </div>
        {nav.map((n) => <button key={n.id} onClick={() => go(n.id)} className={`bt !justify-start w-full ${tab === n.id ? "on" : "!border-transparent !bg-transparent"} nv`}><n.icon size={16} />{n.label}</button>)}
        <div className="mt-auto space-y-2">
          {isAdmin && <button onClick={() => { setIsAdmin(false); setTab("write"); }} className="bt w-full !justify-start"><Unlock size={16} />Esci da admin</button>}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 text-sm"><div className="font-semibold truncate">{user.displayName || "Operatore"}</div><div className="mu text-xs truncate">{user.email}</div></div>
            <button className="bt !p-2" onClick={() => setDark(!dark)} title="Cambia tema">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="bt !p-2" onClick={logout} title="Esci"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* barra mobile */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 pn !rounded-none !border-x-0 !border-t-0 sticky top-0 z-30 hdr">
        <div className="flex items-center gap-2" onDoubleClick={() => !isAdmin && setAdminModal(true)}><Logo size={26} /><span className="hd font-bold">Il Circuito</span></div>
        <div className="flex gap-2">
          <button className="bt !p-2" onClick={() => setDark(!dark)}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="bt !p-2" onClick={logout}><LogOut size={16} /></button>
        </div>
      </header>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 pn !rounded-none !border-x-0 !border-b-0 flex justify-around p-2 hdr">
        {nav.map((n) => <button key={n.id} onClick={() => go(n.id)} className={`bt flex-col !gap-0.5 !text-[11px] flex-1 ${tab === n.id ? "on" : "!border-transparent"}`}><n.icon size={17} />{n.label.split(" ")[0]}</button>)}
      </nav>

      <div className="md:ml-60 pb-28 md:pb-12">
        <div key={tab} className="pg max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div><h1 className="hd text-3xl md:text-5xl font-bold">{titles[tab]}</h1>{isList && !loading && <p className="mu text-sm mt-1.5">{shown.length} {shown.length === 1 ? "progetto" : "progetti"}</p>}</div>
            {isList && (
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 mu" /><input className="inp !pl-9 !w-52" placeholder="Cerca" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <select className="inp !w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>{Object.keys(SORTS).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}</select>
                {items.length > 0 && <button className={`bt ${selMode ? "on" : ""}`} onClick={() => { setSelMode(!selMode); setIds([]); }}><ListChecks size={15} />{selMode ? "Fine" : "Seleziona"}</button>}
              </div>
            )}
          </div>

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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {shown.map((t, i) => {
                const picked = ids.includes(t.id), { w, h } = dims(t);
                return (
                  <Reveal key={t.id} delay={(i % 3) * 90} className="h-full"><article onClick={() => selMode ? setIds((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]) : setSel(t)}
                    className={`pn card h-full overflow-hidden cursor-pointer ${gone.includes(t.id) ? "gone" : ""} ${picked ? "!border-[var(--ac)] ring-2 ring-[var(--ac)]" : ""}`}>
                    <div className="paper mm sm relative h-40 overflow-hidden">
                      <div className="thumb absolute inset-0">
                        {t.strokes?.length > 0 && <Drawing strokes={t.strokes} w={w} h={h} className="absolute inset-0 w-full" />}
                        <div className="rt relative p-3 line-clamp-5" dangerouslySetInnerHTML={{ __html: clean(t.content) }} />
                      </div>
                      {selMode && <div className="absolute top-2 right-2">{picked ? <CheckCircle2 className="fill-white" style={{ color: "var(--ac)" }} /> : <Circle className="text-slate-400" />}</div>}
                      {t.isStarred && <Star size={16} className="absolute top-2 left-2" style={{ fill: "var(--am)", color: "var(--am)" }} />}
                    </div>
                    <div className="p-5 border-t" style={{ borderColor: "var(--ln)" }}>
                      <h2 className="hd font-bold text-lg leading-snug line-clamp-1">{t.title}</h2>
                      <div className="mu text-xs mt-1 flex justify-between"><span className="truncate">{t.author}</span><span>{fmtDate(t.timestamp)}</span></div>
                    </div>
                  </article></Reveal>
                );
              })}
            </div>
          ))}

          {/* EDITOR */}
          {tab === "write" && (
            <form onSubmit={submit} className="space-y-4 up">
              <input className="inp !text-xl !py-3 hd font-bold" placeholder="Nome del progetto" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <div className="pn overflow-hidden">
                <div className="p-2 border-b space-y-2" style={{ borderColor: "var(--ln)", background: "var(--sf)" }} onMouseDown={(e) => { if ((e.target as any).tagName !== "INPUT" && (e.target as any).tagName !== "SELECT") e.preventDefault(); }}>
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
                      <div className="relative">
                        <button type="button" className="bt !p-2" onClick={() => setColorOpen(!colorOpen)} title="Colore testo"><Palette size={15} /></button>
                        {colorOpen && <div className="absolute z-40 top-full mt-1 pn p-2 grid grid-cols-7 gap-1.5 pop">{INK_COLORS.map((c) => <button type="button" key={c.id} title={c.name} className="w-6 h-6 rounded-full border" style={{ background: c.id, borderColor: "var(--ln)" }} onClick={() => { cmd("foreColor", c.id); setColorOpen(false); }} />)}</div>}
                      </div>
                      <label className="bt !p-2 cursor-pointer" title="Inserisci foto"><ImageIcon size={15} /><input type="file" accept="image/*" className="hidden" onChange={addImage} /></label>
                      {img && <div className="flex gap-1 items-center ml-1">
                        {["25%", "50%", "75%", "100%"].map((w) => <button type="button" key={w} className="bt !px-2 !py-1 !text-xs" onClick={() => resizeImg(w)}>{w}</button>)}
                        <button type="button" className="bt dng !p-1.5" onClick={removeImg}><Trash2 size={14} /></button>
                      </div>}
                    </>) : (<>
                      {TOOLS.map((t) => <button type="button" key={t.id} className={`bt ${tool === t.id ? "on" : ""}`} onClick={() => setTool(t.id)}><t.icon size={15} />{t.label}</button>)}
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
                      {tool !== "eraser" && <div className="grid grid-cols-14 gap-1" style={{ gridTemplateColumns: "repeat(14,minmax(0,1fr))" }}>
                        {INK_COLORS.map((c) => <button type="button" key={c.id} title={c.name} onClick={() => setColor(c.id)} className="w-6 h-6 rounded-full border-2" style={{ background: c.id, borderColor: color === c.id ? "var(--ac)" : "var(--ln)", transform: color === c.id ? "scale(1.15)" : "none" }} />)}
                      </div>}
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
                  {drawing && <div className="absolute inset-0 z-30" style={{ touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }} onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={pUp} />}
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
        </div>
      </div>

      {/* barra selezione multipla */}
      {selMode && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 pn shadow-xl flex items-center gap-2 p-2 popx">
          <span className="text-sm px-2">{ids.length} selezionati</span>
          <button className="bt" onClick={() => setIds(ids.length === shown.length ? [] : shown.map((t) => t.id))}>Tutti</button>
          <button className="bt dng" disabled={!ids.length} onClick={() => setToDelete(ids)}><Trash2 size={15} />Elimina</button>
        </div>
      )}

      {/* lettura */}
      {sel && (() => {
        const { w, h } = dims(sel);
        return (
          <div className="fade fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm" onClick={() => setSel(null)}>
            <div className="pn w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden pop" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: "var(--ln)" }}>
                <div className="flex-1 min-w-0"><h2 className="hd text-2xl font-bold truncate">{sel.title}</h2><div className="mu text-xs">{sel.author} · {fmtDate(sel.timestamp)}</div></div>
                <button className="bt !p-2" title="Copia testo" onClick={() => { navigator.clipboard?.writeText(plain(sel.content)); notify("Testo copiato."); }}><Copy size={15} /></button>
                {isAdmin && <button className="bt !p-2" onClick={() => star(sel)}><Star size={15} style={sel.isStarred ? { fill: "var(--am)", color: "var(--am)" } : {}} /></button>}
                {canEdit(sel) && <button className="bt !p-2" onClick={() => startEdit(sel)} title="Modifica"><Pencil size={15} /></button>}
                {canEdit(sel) && <button className="bt dng !p-2" onClick={() => setToDelete([sel.id])} title="Elimina"><Trash2 size={15} /></button>}
                <button className="bt !p-2" onClick={() => setSel(null)}><X size={15} /></button>
              </div>
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
