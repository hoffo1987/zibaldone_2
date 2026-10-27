import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AdminBadge from "./AdminBadge";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, where, writeBatch, type Firestore } from "firebase/firestore";
import { Sparkles, X, Reply, ChevronDown, Trash2, Loader2, EyeOff, UserRound, Sprout, CornerDownRight, ArrowUpRight } from "lucide-react";
import { TIPI, LIMITE, NOTA_MAX, CIT_MAX, indiceDi, ritrova, fondi, selezioneDi, ancoraDi, motivoNo, rangeDi, leggiScintilla, siToccano, oggi, flat,
  type Scintilla, type Ancora, type Tipo, type Indice } from "./scintille";
import { nataDaOf, readPublic, PUBLIC_VERSION } from "./testi";
import { haptic } from "./haptics";
import * as sound from "./sound";
import { moving } from "./motion";
import { renderLoop } from "./renderLoop";
import { fieldDevice, webgpuReady } from "./field/common";
import { Segnale, type Span } from "./scintilleGpu";
import { canaliDi, faseCanale, seme, tratto, NOME, type Canale } from "./onde";
import { Onda, Chip } from "./Segnali";
import "./scintille.css";

// Le scintille nel lettore di un pensiero del diario. Tre modi:
//   lettore  il pensiero di un altro: si seleziona una frase e si accende (al massimo 5), le proprie restano tenui e si tolgono
//   autore   il proprio pensiero: la barra col totale e l'interruttore, le frasi accese che brillano, toccandole emozioni e note
//   admin    vede tutte le scintille di un pensiero altrui e chi le ha accese (solo nell'elenco); come ogni lettore ne accende
// Il testo del foglio non si tocca. Sotto le parole di una frase accesa corre il suo segnale (onde.ts): un canale per
// emozione, la forma d'onda di quell'emozione, più spessa e più alta quante più persone l'hanno scelta. In WebGPU
// (scintilleGpu.ts) il pennello lo disegna accendendosi, col fosforo, e al passaggio del puntatore l'onda corre; senza
// WebGPU o col movimento ridotto le stesse tracce in SVG (TracceSvg). Le parole accese prendono il tono dell'emozione
// che domina, con la CSS Custom Highlight API.
// I comandi che galleggiano (la selezione, la scheda per accendere, il fumetto di una frase) sono portali nel body: il
// pannello del lettore si anima con transform e un fixed al suo interno non starebbe fermo.
export type ScMode = "autore" | "admin" | "lettore";
type Pick = { a: number; b: number; cit: string; anchor: Ancora | null; why: string; rect: { left: number; top: number; width: number; bottom: number } };
type Placed = { s: Scintilla; a: number; b: number };

const HL = typeof window !== "undefined" && typeof (window as any).Highlight === "function" && typeof CSS !== "undefined" && !!(CSS as any).highlights;
const NAMES = TIPI.map((t) => `sc-${t.id}`);
const setHL = (name: string, ranges: Range[]) => {
  if (!HL) return;
  const reg = (CSS as any).highlights;
  if (ranges.length) reg.set(name, new (window as any).Highlight(...ranges)); else reg.delete(name);
};
const clearHL = (names = NAMES) => { if (HL) names.forEach((n) => (CSS as any).highlights.delete(n)); };
// dentro .root, dove vivono i colori del tema (il body non li ha)
const host = () => document.querySelector<HTMLElement>(".root") || document.body;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MOSTRA = "circuito:scintille:mostra";

// --- il segnale ---
type Glow = { key: string; a: number; b: number; canali: Canale[]; fresh: boolean; focus: boolean };
type Box = { x: number; y: number; w: number; h: number };
// i pezzi di una riga (un nodo di testo per volta) diventano un solo rettangolo per riga
const righe = (rs: DOMRect[]) => {
  const out: { l: number; t: number; r: number; b: number }[] = [];
  rs.filter((q) => q.width > 1 && q.height > 1).forEach((q) => {
    const m = out.find((o) => Math.abs((o.t + o.b) / 2 - (q.top + q.bottom) / 2) < q.height / 2 && q.left <= o.r + 8 && q.right >= o.l - 8);
    if (m) { m.l = Math.min(m.l, q.left); m.r = Math.max(m.r, q.right); m.t = Math.min(m.t, q.top); m.b = Math.max(m.b, q.bottom); }
    else out.push({ l: q.left, t: q.top, r: q.right, b: q.bottom });
  });
  return out.sort((x, y) => x.t - y.t || x.l - y.l);
};
// i rettangoli delle righe di ogni frase, in pixel della carta; si rimisurano quando la carta cambia misura
function useBoxes(paper: HTMLElement, ix: Indice, spans: Glow[]) {
  const [boxes, setBoxes] = useState<Record<string, Box[]>>({});
  const sig = spans.map((g) => g.key).join("|");
  useLayoutEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      const P = paper.getBoundingClientRect(), m: Record<string, Box[]> = {};
      spans.forEach((g) => {
        const r = rangeDi(ix, g.a, g.b);
        if (r) m[g.key] = righe(Array.from(r.getClientRects())).map((q) => ({ x: q.l - P.left - paper.clientLeft, y: q.t - P.top - paper.clientTop, w: q.r - q.l, h: q.b - q.t }));
      });
      setBoxes(m);
    };
    run();
    const later = () => { if (!raf) raf = requestAnimationFrame(run); };
    const ro = new ResizeObserver(later); ro.observe(paper);
    paper.addEventListener("load", later, true);
    (document as any).fonts?.ready?.then(later);
    return () => { ro.disconnect(); paper.removeEventListener("load", later, true); cancelAnimationFrame(raf); };
  }, [paper, ix, sig]);
  return boxes;
}

// In WebGPU dove c'è, altrimenti (o col movimento ridotto) in SVG
function Luce(props: { paper: HTMLElement; ix: Indice; spans: Glow[]; on: boolean; epoch: number; fresh: string | null }) {
  const [gpu, setGpu] = useState<GPUDevice | null | undefined>(() => (moving() && webgpuReady() ? undefined : null));
  useEffect(() => {
    if (gpu !== undefined) return;
    let on = true;
    fieldDevice("low-power", process.env.REACT_APP_EMULATORS === "1").then((d) => { if (on) setGpu(d); });
    return () => { on = false; };
  }, [gpu]);
  if (gpu === undefined) return null;
  return gpu ? <GpuLayer dev={gpu} {...props} onLost={() => setGpu(null)} /> : <TracceSvg {...props} />;
}

function GpuLayer({ dev, paper, ix, spans, on, epoch, fresh, onLost }: { dev: GPUDevice; paper: HTMLElement; ix: Indice; spans: Glow[]; on: boolean; epoch: number; fresh: string | null; onLost: () => void }) {
  const boxes = useBoxes(paper, ix, spans);
  const cv = useRef<HTMLCanvasElement>(null);
  const eng = useRef<Segnale | null>(null);
  const lost = useRef(onLost); lost.current = onLost;
  const shown = useRef(on); shown.current = on;
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    let e: Segnale;
    try { e = new Segnale(dev, c, paper); } catch (err) { console.warn("Segnale delle scintille in WebGPU non partito", err); lost.current(); return; }
    eng.current = e;
    // il pennello arriva in fondo alla frase appena accesa: un tocco leggero
    e.onArrive = () => haptic("impact");
    const scroller = paper.closest<HTMLElement>("[data-sheet-scroll]");
    let paperY = 0, raf = 0;
    let pointer: PointerEvent | null = null;
    const viewport = () => e.viewport((scroller?.scrollTop || 0) - paperY);
    const fit = () => {
      const P = paper.getBoundingClientRect(), S = scroller?.getBoundingClientRect();
      paperY = P.top - (S?.top || 0) - (scroller?.clientTop || 0) + (scroller?.scrollTop || 0);
      e.fit(scroller?.clientHeight || window.innerHeight); viewport(); halt.invalidate();
    };
    const update = () => { raf = 0; const P = pointer ? paper.getBoundingClientRect() : null; viewport(); if (pointer && P) { e.pointer(pointer.clientX - P.left - paper.clientLeft, pointer.clientY - P.top - paper.clientTop, true); pointer = null; } };
    const later = () => { if (!raf) raf = requestAnimationFrame(update); };
    const ro = new ResizeObserver(fit); ro.observe(paper); if (scroller) ro.observe(scroller);
    window.addEventListener("resize", fit); scroller?.addEventListener("scroll", later, { passive: true });
    const move = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return;
      pointer = ev; later();
    };
    const leave = () => e.pointer(0, 0, false);
    paper.addEventListener("pointermove", move); paper.addEventListener("pointerleave", leave);
    const halt = renderLoop((t) => e.draw(t), () => e.fps(), paper, undefined, true);
    e.onInvalidate = halt.invalidate;
    fit(); e.show(shown.current, true);
    let gone = false;
    // dispositivo perso (driver, GPU ripresa dal sistema): restano le tracce in SVG
    dev.lost.then(() => { if (!gone) lost.current(); });
    return () => { gone = true; halt(); cancelAnimationFrame(raf); ro.disconnect(); scroller?.removeEventListener("scroll", later); window.removeEventListener("resize", fit); paper.removeEventListener("pointermove", move); paper.removeEventListener("pointerleave", leave); e.destroy(); eng.current = null; };
  }, [dev, paper]);
  const sig = spans.map((g) => `${g.key}:${g.canali.map((c) => c.tipo + c.n).join(",")}:${g.focus ? 1 : 0}`).join("|");
  const done = useRef<string | null>(null);
  useEffect(() => {
    const e = eng.current; if (!e) return;
    const list: Span[] = spans.filter((g) => boxes[g.key]?.length).map((g) => ({ key: g.key, boxes: boxes[g.key], canali: g.canali, focus: g.focus }));
    const nu = spans.find((g) => g.fresh && boxes[g.key]?.length);
    const isNew = !!nu && fresh !== done.current;
    e.set(list, isNew ? nu!.key : null);
    if (isNew) done.current = fresh;
  }, [boxes, sig]);
  const first = useRef(epoch);
  useEffect(() => { if (epoch !== first.current) eng.current?.replay(); }, [epoch]);
  useEffect(() => { eng.current?.show(on); }, [on]);
  return createPortal(<canvas ref={cv} className="scl-u" aria-hidden="true" />, paper);
}

// Senza WebGPU: le stesse tracce in SVG, una per riga, che continuano da una riga all'altra. Il pennello è una tendina
// che si apre da sinistra; col movimento ridotto sono già lì, ferme.
function TracceSvg({ paper, ix, spans, on, epoch }: { paper: HTMLElement; ix: Indice; spans: Glow[]; on: boolean; epoch: number }) {
  const boxes = useBoxes(paper, ix, spans);
  const still = !moving();
  const layer = <div className={`sct ${on ? "on" : ""} ${still ? "still" : ""}`} aria-hidden="true">
    {spans.map((g, i) => {
      const bs = boxes[g.key];
      if (!bs?.length) return null;
      const tot = bs.reduce((n, b) => n + b.w, 0), sd = seme(g.key), k = Math.min(1, 0.35 + 0.18 * g.canali.reduce((a, c) => a + c.n, 0));
      let acc = 0;
      return <span key={`${epoch}:${g.key}`} className={`sct-p ${g.fresh ? "fresh" : ""} ${g.focus ? "focus" : ""}`} style={{ ["--d" as any]: `${g.fresh ? 120 : Math.min(i, 8) * 130}ms` }}>
        {bs.map((b, j) => {
          const s0 = acc; acc += b.w;
          const st: any = { left: b.x - 2, top: b.y + b.h - 6, width: b.w + 4, height: 16, "--o": (s0 / tot).toFixed(3), "--f": (b.w / tot).toFixed(3), "--dur": `${Math.min(g.fresh ? 1600 : 1100, Math.max(g.fresh ? 700 : 400, tot / (g.fresh ? 0.52 : 0.82)))}ms` };
          return <svg key={j} className="sct-l" style={st}>
            {g.canali.slice(0, 4).map((c, ci) => <path key={c.tipo} className={`o-${c.tipo}`} d={tratto(c.tipo, s0 - 2, b.w + 4, tot, 8, 2.3 + 0.45 * Math.min(c.n, 4) + 0.5 * k, faseCanale(sd, ci))}
              fill="none" strokeWidth={0.9 + 0.26 * Math.min(c.n, 4)} strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>;
        })}
      </span>;
    })}
  </div>;
  return createPortal(layer, paper);
}

// i rettangoli di una frase contengono il punto toccato?
const hit = (ix: Indice, a: number, b: number, x: number, y: number) => {
  const r = rangeDi(ix, a, b);
  return !!r && Array.from(r.getClientRects()).some((q) => x >= q.left - 3 && x <= q.right + 3 && y >= q.top - 3 && y <= q.bottom + 3);
};

export function ScintilleReader({ db, uid, item, mode, rt, compact, profiles, taggedAdmin = false, onReceived, onReply, notify }: {
  db: Firestore; uid: string; item: any; mode: ScMode; rt: () => HTMLElement | null; compact: boolean; profiles: Record<string, any>;
  taggedAdmin?: boolean; onReceived?: (id: string, list: Scintilla[]) => void; onReply: (r: { id: string; cit: string }) => void; notify: (m: string) => void;
}) {
  const id: string = item.id;
  const reader = mode === "lettore", lights = mode !== "autore"; // chi può accendere: chiunque non sia l'autore
  // lettore: le proprie; autore e admin: tutte
  const [list, setList] = useState<Scintilla[] | null>(null);
  const pz = useRef<string[]>([]); // le voci del tetto di chi legge, come sono su Firestore
  const [mieIds, setMieIds] = useState<string[]>([]);
  const setPz = (v: string[]) => { pz.current = v; setMieIds(v); };
  const [paper, setPaper] = useState<HTMLElement | null>(null);
  const [epoch, setEpoch] = useState(0); // riaccendendo le frasi la corrente ripassa
  const [ix, setIx] = useState<Indice | null>(null);
  const [show, setShow] = useState(() => { try { return localStorage.getItem(MOSTRA) !== "0"; } catch { return true; } });
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const pickRef = useRef(pick); pickRef.current = pick;
  const [compose, setCompose] = useState<Pick | null>(null);
  const [pop, setPop] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [who, setWho] = useState<Record<string, string> | null>(null);
  const [whoBusy, setWhoBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null); // l'autore toglie una scintilla ricevuta: secondo tocco per confermare
  const received = useRef(onReceived); received.current = onReceived;

  // --- lettura ---
  useEffect(() => {
    let on = true;
    setList(null); setPick(null); setCompose(null); setPop(null); setWho(null); setPz([]);
    (async () => {
      try {
        if (reader) {
          const vs = await getDocs(query(collection(db, "scintille_mie", uid, "voci"), where("pensieroId", "==", id)));
          const sids = vs.docs.map((d) => d.id), found: Scintilla[] = [], stale: string[] = [];
          await Promise.all(sids.map(async (sid) => {
            const s = await getDoc(doc(db, "pensieri", id, "scintille", sid));
            const x = s.exists() ? leggiScintilla(sid, s.data()) : null;
            if (x) found.push(x); else if (!s.exists()) stale.push(sid);
          }));
          let left = sids;
          // tolte dall'autore: la voce se ne va e il posto torna libero (una alla volta, come vogliono le regole)
          for (const sid of stale) {
            const rest = left.filter((x) => x !== sid), b = writeBatch(db);
            b.delete(doc(db, "scintille_mie", uid, "voci", sid)); b.set(doc(db, "scintille_mie", uid, "pezzi", id), { voci: rest });
            try { await b.commit(); left = rest; } catch { break; }
          }
          if (on) { setPz(left); setList(found.sort((a, b) => a.giorno - b.giorno)); }
        } else {
          const s = await getDocs(collection(db, "pensieri", id, "scintille"));
          const found = s.docs.map((d) => leggiScintilla(d.id, d.data())).filter(Boolean) as Scintilla[];
          // l'admin che legge il pensiero di un altro può accenderne: servono le sue voci per il tetto
          const own = lights ? (await getDocs(query(collection(db, "scintille_mie", uid, "voci"), where("pensieroId", "==", id)))).docs.map((d) => d.id) : [];
          if (on) { setPz(own); setList(found); received.current?.(id, found); }
        }
      } catch (e) {
        if (on) setList([]);
        console.warn("Scintille non lette (controlla le regole di Firestore)", e);
      }
    })();
    return () => { on = false; };
  }, [db, id, uid, reader, lights]);

  // --- il testo del foglio ---
  useEffect(() => { const el = rt(); setIx(el ? indiceDi(el) : null); setPaper(el?.closest<HTMLElement>("[data-sheet-paper]") || null); }, [id, item.content]);

  const placed = useMemo(() => {
    const at: Placed[] = [], lost: Scintilla[] = [];
    if (ix && list) list.forEach((s) => { const p = ritrova(ix.piano.text, s); if (p) at.push({ s, ...p }); else lost.push(s); });
    return { at, lost };
  }, [ix, list]);
  const tratti = useMemo(() => fondi(placed.at.map((p) => ({ a: p.a, b: p.b, id: p.s.id }))), [placed]);
  const lit = reader || (show && !!list?.length);
  // i canali di ogni tratto: le emozioni delle scintille che lo coprono
  const tipoDi = useMemo(() => new Map((list || []).map((s) => [s.id, s.tipo] as [string, Tipo])), [list]);
  const glow = useMemo<Glow[]>(() => (reader
    ? placed.at.map((p) => ({ key: `${p.a}-${p.b}`, a: p.a, b: p.b, canali: canaliDi([p.s.tipo]), fresh: p.s.id === fresh, focus: !!pop?.ids.includes(p.s.id) }))
    : tratti.map((t) => ({ key: `${t.a}-${t.b}`, a: t.a, b: t.b, canali: canaliDi(t.ids.map((x) => tipoDi.get(x)).filter(Boolean) as Tipo[]), fresh: !!fresh && t.ids.includes(fresh), focus: !!pop && t.ids.some((x) => pop.ids.includes(x)) }))), [reader, placed, tratti, tipoDi, fresh, pop]);
  // la luce si spegne piano e, riaccesa, la corrente ripassa lungo le frasi
  const wasLit = useRef(lit);
  useEffect(() => { if (lit && !wasLit.current) setEpoch((e) => e + 1); wasLit.current = lit; }, [lit]);
  useEffect(() => { if (!fresh) return; const t = setTimeout(() => setFresh(null), 2600); return () => clearTimeout(t); }, [fresh]);
  // le parole accese prendono il tono dell'emozione che domina (per chi legge: della propria)
  useEffect(() => {
    if (!HL || !ix || !lit) return;
    const by: Record<string, Range[]> = {};
    glow.forEach((g) => { const r = rangeDi(ix, g.a, g.b), c = g.canali[0]; if (r && c) (by[c.tipo] = by[c.tipo] || []).push(r); });
    TIPI.forEach((t) => setHL(`sc-${t.id}`, by[t.id] || []));
    return () => clearHL();
  }, [ix, glow, lit]);
  useEffect(() => () => clearHL(), []);

  // --- la selezione di chi legge ---
  const pressing = useRef(false);
  useEffect(() => {
    if (!lights || !ix) return;
    let raf = 0, hide = 0;
    const check = () => {
      raf = 0;
      const el = rt(), sel = window.getSelection(), span = el ? selezioneDi(ix, el, sel) : null;
      if (!span) {
        clearTimeout(hide);
        if (!pickRef.current) return;
        // un tocco sulla barra toglie la selezione prima del clic: la barra aspetta un momento
        hide = window.setTimeout(() => { if (!pressing.current) setPick(null); }, 260);
        return;
      }
      clearTimeout(hide);
      const raw = flat(ix.piano.text.slice(span.a, span.b)), anchor = ancoraDi(ix.piano.text, span.a, span.b);
      const r = sel!.getRangeAt(0).getBoundingClientRect();
      setPick({ ...span, cit: raw, anchor, why: anchor ? "" : motivoNo(raw), rect: { left: r.left, top: r.top, width: r.width, bottom: r.bottom } });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    const sc = rt()?.closest("[data-sheet-scroll]");
    document.addEventListener("selectionchange", on);
    sc?.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { document.removeEventListener("selectionchange", on); sc?.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); clearTimeout(hide); };
  }, [lights, ix]);

  // --- toccare una frase accesa ---
  useEffect(() => {
    const el = rt();
    if (!el || !ix) return;
    const tap = (e: MouseEvent) => {
      const sel = window.getSelection();
      if ((sel && !sel.isCollapsed) || (!reader && !show)) return;
      const spans = reader ? placed.at.map((p) => ({ a: p.a, b: p.b, ids: [p.s.id] })) : tratti;
      const ids = Array.from(new Set(spans.filter((t) => hit(ix, t.a, t.b, e.clientX, e.clientY)).flatMap((t) => t.ids)));
      if (!ids.length) return;
      setSure(null); setPop({ x: e.clientX, y: e.clientY, ids }); haptic("tap");
    };
    el.addEventListener("click", tap);
    return () => el.removeEventListener("click", tap);
  }, [ix, placed, tratti, reader, show]);
  useEffect(() => {
    if (!pop) return;
    const out = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.(".sc-pop")) setPop(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setPop(null); } };
    const sc = rt()?.closest("[data-sheet-scroll]"), gone = () => setPop(null);
    const t = setTimeout(() => document.addEventListener("pointerdown", out, true), 0);
    document.addEventListener("keydown", esc, true); sc?.addEventListener("scroll", gone, { passive: true });
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", out, true); document.removeEventListener("keydown", esc, true); sc?.removeEventListener("scroll", gone); };
  }, [pop]);

  // --- accendere e togliere ---
  const mine = reader ? list || [] : (list || []).filter((s) => mieIds.includes(s.id));
  const full = mine.length >= LIMITE;
  const overlaps = !!pick && placed.at.some((p) => mieIds.includes(p.s.id) && siToccano(p, pick));
  const light = async (p: Pick, tipo: Tipo, nota: string) => {
    if (!p.anchor || full) return false;
    const ref = doc(collection(db, "pensieri", id, "scintille")), g = oggi(), note = nota.trim().slice(0, NOTA_MAX);
    const data: any = { ...p.anchor, tipo, giorno: g };
    if (taggedAdmin) data.admin = true;
    if (note) data.nota = note;
    try {
      const b = writeBatch(db);
      b.set(ref, data);
      b.set(doc(db, "scintille_mie", uid, "voci", ref.id), { pensieroId: id, giorno: g });
      b.set(doc(db, "scintille_mie", uid, "pezzi", id), { voci: [...pz.current, ref.id] });
      await b.commit();
      setPz([...pz.current, ref.id]);
      setList((l) => [...(l || []), { id: ref.id, ...data, nota: note }]);
      setFresh(ref.id); haptic("success"); sound.spark(true);
      window.getSelection()?.removeAllRanges(); setPick(null);
      notify("Scintilla accesa: chi l’ha scritto vedrà la frase brillare.");
      return true;
    } catch (e) {
      console.warn("Scintilla non accesa", e); haptic("warning");
      notify("Scintilla non accesa. Riprova tra poco.");
      return false;
    }
  };
  const remove = async (sid: string) => {
    try {
      if (pz.current.includes(sid)) {
        const rest = pz.current.filter((x) => x !== sid), b = writeBatch(db);
        b.delete(doc(db, "pensieri", id, "scintille", sid)); b.delete(doc(db, "scintille_mie", uid, "voci", sid));
        b.set(doc(db, "scintille_mie", uid, "pezzi", id), { voci: rest });
        await b.commit(); setPz(rest);
      } else await deleteDoc(doc(db, "pensieri", id, "scintille", sid));
      const next = (list || []).filter((s) => s.id !== sid);
      setList(next); if (!reader) received.current?.(id, next);
      setPop((p) => (p ? (p.ids.length > 1 ? { ...p, ids: p.ids.filter((x) => x !== sid) } : null) : p)); setSure(null);
      haptic("impact"); sound.spark(false);
    } catch (e) { console.warn("Scintilla non tolta", e); notify("Non è stato possibile togliere la scintilla. Riprova."); }
  };
  const reply = (cit: string) => { window.getSelection()?.removeAllRanges(); setPick(null); setPop(null); onReply({ id, cit: flat(cit).slice(0, CIT_MAX) }); };
  const toggle = () => { const v = !show; setShow(v); haptic("select"); try { localStorage.setItem(MOSTRA, v ? "1" : "0"); } catch {} if (!v) setPop(null); };
  // admin: chi ha acceso cosa, chiedendo le voci di ogni profilo per questo pensiero (solo a richiesta)
  const whoLoad = async () => {
    setWhoBusy(true);
    const m: Record<string, string> = {};
    try {
      await Promise.all(Object.keys(profiles).map(async (u) => {
        const s = await getDocs(query(collection(db, "scintille_mie", u, "voci"), where("pensieroId", "==", id)));
        s.forEach((d) => { m[d.id] = u; });
      }));
      setWho(m); setOpen(true);
    } catch (e) { console.warn("Identità delle scintille non lette", e); notify("Non è stato possibile leggere chi le ha accese."); }
    setWhoBusy(false);
  };
  const whoName = (sid: string) => { const u = who?.[sid]; return u ? profiles[u]?.displayName || "Utente senza profilo" : who ? "Sconosciuto" : ""; };

  // --- gli elenchi ---
  const byCit = (xs: Scintilla[]) => {
    const m = new Map<string, Scintilla[]>();
    xs.forEach((s) => { const k = flat(s.cit); m.set(k, [...(m.get(k) || []), s]); });
    return Array.from(m.entries());
  };
  const order = useMemo(() => [...placed.at].sort((x, y) => x.a - y.a).map((p) => p.s), [placed]);
  const entry = (s: Scintilla, actions = true) => (
    <li key={s.id} className="sc-it">
      <Chip tipo={s.tipo} />
      <AdminBadge active={s.admin === true || (taggedAdmin && mieIds.includes(s.id))} />
      {s.nota && <span className="sc-nota-t">{s.nota}</span>}
      {mode === "admin" && who && <span className="sc-who"><UserRound size={11} aria-hidden="true" />{whoName(s.id)}</span>}
      {actions && <span className="sc-it-acts">
        {mieIds.includes(s.id) ? <button type="button" className="sc-lnk" onClick={() => remove(s.id)}><Trash2 size={12} />Togli{reader ? "" : " la tua"}</button>
          : <button type="button" className={`sc-lnk ${sure === s.id ? "warn" : ""}`} onClick={() => (sure === s.id ? remove(s.id) : setSure(s.id))}><Trash2 size={12} />{sure === s.id ? "Conferma: togli" : "Togli"}</button>}
      </span>}
    </li>
  );
  // sotto la frase citata, il suo segnale: l'emozione che domina tra quelle accese lì
  const sig = (xs: Scintilla[]) => { const c = canaliDi(xs.map((s) => s.tipo))[0]; return c ? <span className={`sc-sig t-${c.tipo}`}><Onda tipo={c.tipo} h={10} a={2.6} stroke={1.3} fade={14} /></span> : null; };
  const group = ([cit, xs]: [string, Scintilla[]], lost = false) => (
    <li key={cit} className={`sc-g ${lost ? "lost" : ""}`}>
      <div className="sc-g-hd"><q>{cit}</q>{!reader && <span className="sc-g-n">{xs.length}</span>}</div>
      {!lost && sig(xs)}
      <ul>{xs.map((s) => entry(s))}</ul>
      {!lost && <button type="button" className="sc-lnk" onClick={() => reply(cit)}><Reply size={12} />Rispondi con un pensiero</button>}
    </li>
  );
  const listOpen = open;
  const total = list?.length || 0;

  // --- la barra in cima ---
  const bar = reader ? (
    <div className="rd-bar sc-bar sc-reader">
      <span className="rd-k"><Sparkles size={13} aria-hidden="true" />Scintille</span>
      <span className="sc-hint">{total ? <>Le tue qui: <b>{total}</b> di {LIMITE}</> : compact ? "Tieni premuta una frase per accenderla" : "Seleziona una frase che ti ha colpito per accenderla"}</span>
      <span className="flex-1" />
      {total > 0 && <button type="button" className="sc-lst" aria-expanded={open} onClick={() => setOpen(!open)}>Le tue<ChevronDown size={14} /></button>}
    </div>
  ) : (
    <div className={`rd-bar sc-bar ${total ? "has" : ""}`}>
      <span className="rd-k"><Sparkles size={13} aria-hidden="true" />Scintille</span>
      {list === null ? <span className="sc-hint mu">…</span> : total ? <span className="sc-hint"><b key={total} className="sc-n">{total}</b> {total === 1 ? "accesa" : "accese"}{placed.lost.length > 0 && <span className="mu"> · {placed.lost.length} su frasi cambiate</span>}</span>
        : <span className="sc-hint mu">{mode === "admin" ? "Nessuna scintilla: seleziona una frase per accenderne una." : "Quando qualcuno accende una frase, qui la vedrai brillare."}</span>}
      {mode === "admin" && mine.length > 0 && <span className="sc-hint mu">· le tue {mine.length} di {LIMITE}</span>}
      <span className="flex-1" />
      {mode === "admin" && total > 0 && <button type="button" className="sc-lst" disabled={whoBusy} onClick={() => (who ? setWho(null) : whoLoad())}>{whoBusy ? <Loader2 size={13} className="animate-spin" /> : <UserRound size={13} />}{who ? "Nascondi nomi" : "Chi le ha accese"}</button>}
      {total > 0 && <button type="button" className="sc-lst" aria-expanded={listOpen} onClick={() => setOpen(!listOpen)}>Elenco<ChevronDown size={14} /></button>}
      {total > 0 && <button type="button" role="switch" aria-checked={show} aria-label="Mostra le scintille sul foglio" className={`sc-sw ${show ? "on" : ""}`} onClick={toggle}><i aria-hidden="true" /></button>}
    </div>
  );

  return <>
    {bar}
    {paper && ix && glow.length > 0 && <Luce paper={paper} ix={ix} spans={glow} on={lit} epoch={epoch} fresh={fresh} />}
    {listOpen && list && <div className="sc-list">
      {reader ? <ul>{order.map((s) => <li key={s.id} className="sc-g"><div className="sc-g-hd"><q>{flat(s.cit)}</q></div>{sig([s])}<ul>{entry(s)}</ul></li>)}{placed.lost.length > 0 && placed.lost.map((s) => <li key={s.id} className="sc-g lost"><div className="sc-g-hd"><q>{flat(s.cit)}</q></div><ul>{entry(s)}</ul></li>)}</ul>
        : <>
          {order.length > 0 && <ul>{byCit(order).map((g) => group(g))}</ul>}
          {placed.lost.length > 0 && <><p className="sc-lost-h">Frasi che non ci sono più</p><ul>{byCit(placed.lost).map((g) => group(g, true))}</ul></>}
        </>}
    </div>}

    {/* la barra della selezione: sul computer sopra la frase, sul telefono in basso (non litiga col menu di sistema) */}
    {lights && pick && !compose && createPortal(
      <div className={`sc-pick ${compact ? "dock" : "float"} ${!compact && pick.rect.top < 90 ? "below" : ""}`} role="toolbar" aria-label="Frase selezionata"
        style={compact ? undefined : { left: Math.max(140, Math.min(window.innerWidth - 140, pick.rect.left + pick.rect.width / 2)), top: pick.rect.top < 90 ? pick.rect.bottom + 10 : pick.rect.top - 10 }}
        onPointerDown={() => { pressing.current = true; }} onPointerUp={() => setTimeout(() => { pressing.current = false; }, 500)} onPointerCancel={() => { pressing.current = false; }}
        onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
        {pick.anchor && !full && !overlaps
          ? <button type="button" className="sc-go" onClick={() => { setCompose(pick); haptic("select"); }}><Sparkles size={15} />Scintilla</button>
          : <span className="sc-why">{full ? `Hai già acceso ${LIMITE} scintille qui` : overlaps ? "Questa frase l’hai già accesa" : pick.why === "lunga" ? `Al massimo ${CIT_MAX} caratteri` : "Seleziona almeno tre parole"}</span>}
        {pick.cit.length > 0 && pick.cit.length <= CIT_MAX && <button type="button" className="sc-rep" aria-label="Rispondi con un pensiero" onClick={() => reply(pick.cit)}><Reply size={15} /><span className="sc-long">Rispondi con un pensiero</span><span className="sc-short">Rispondi</span></button>}
      </div>, host())}

    {compose && createPortal(<Compose pick={compose} compact={compact} taggedAdmin={taggedAdmin} onClose={() => setCompose(null)} onLight={async (t, n) => { if (await light(compose, t, n)) setCompose(null); }} />, host())}

    {pop && list && createPortal(
      <div className="sc-pop pn" role="dialog" aria-label="Scintille su questa frase" style={{ left: Math.max(16, Math.min(window.innerWidth - 316, pop.x - 150)), top: pop.y > window.innerHeight * 0.55 ? undefined : pop.y + 16, bottom: pop.y > window.innerHeight * 0.55 ? window.innerHeight - pop.y + 16 : undefined }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sc-pop-hd"><span className="rd-k"><Sparkles size={13} aria-hidden="true" />{reader ? "La tua scintilla" : plural(pop.ids.length, "scintilla", "scintille")}</span><button type="button" className="sc-x" aria-label="Chiudi" onClick={() => setPop(null)}><X size={14} /></button></div>
        {byCit(list.filter((s) => pop.ids.includes(s.id))).map(([cit, xs]) => <div key={cit} className="sc-pop-g">
          <q>{cit}</q>
          {sig(xs)}
          <ul>{xs.map((s) => entry(s))}</ul>
          {!reader && <button type="button" className="sc-lnk" onClick={() => reply(cit)}><Reply size={12} />Rispondi con un pensiero</button>}
        </div>)}
        {!reader && <p className="sc-anon"><EyeOff size={11} aria-hidden="true" />{mode === "admin" ? "Le identità sono solo nell’elenco. Le scintille dell’Admin portano il suo sigillo." : "Chi le ha accese resta anonimo, salvo il sigillo delle scintille dell’Admin."}</p>}
      </div>, host())}
  </>;
}

// La scheda per accendere: la frase, quattro emozioni fisse e una nota facoltativa. Ogni emozione mostra la sua onda;
// scelta, l'onda si disegna sotto la frase citata, come la vedrà chi l'ha scritta. Sul telefono la scheda sale dal basso
// e resta sopra la tastiera.
function Compose({ pick, compact, taggedAdmin, onClose, onLight }: { pick: Pick; compact: boolean; taggedAdmin: boolean; onClose: () => void; onLight: (t: Tipo, nota: string) => Promise<void> }) {
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [kb, setKb] = useState(0);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !compact) return;
    const f = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    f(); vv.addEventListener("resize", f); vv.addEventListener("scroll", f);
    return () => { vv.removeEventListener("resize", f); vv.removeEventListener("scroll", f); };
  }, [compact]);
  const go = async () => {
    if (!tipo || busy) return;
    setBusy(true); await onLight(tipo, nota); setBusy(false);
  };
  return <div className="sc-ov" onClick={(e) => { e.stopPropagation(); onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Accendi una scintilla" className={`sc-sheet pn ${compact ? "dock" : ""} ${tipo ? `t-${tipo}` : ""}`} style={compact ? { bottom: kb } : undefined}
      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="sc-sheet-hd"><span className="rd-k"><Sparkles size={13} aria-hidden="true" />Accendi una scintilla</span><button type="button" className="sc-x" aria-label="Chiudi" onClick={onClose}><X size={15} /></button></div>
      <figure className="sc-q">
        <blockquote>{pick.cit}</blockquote>
        {/* l'anteprima del segnale: la riga vuota aspetta, scelta l'emozione il pennello la traccia */}
        <span className="sc-q-sig" aria-hidden="true">{tipo ? <Onda key={tipo} tipo={tipo} h={14} a={4} stroke={1.6} fade={10} className="sc-q-on" /> : <i className="sc-q-flat" />}</span>
      </figure>
      <p className="sc-tipi-k" id="sc-tipi-k">Che segnale ti ha lasciato?</p>
      <div role="radiogroup" aria-labelledby="sc-tipi-k" className="sc-tipi">
        {TIPI.map((t, i) => <button key={t.id} ref={i === 0 ? first : undefined} type="button" role="radio" aria-checked={tipo === t.id} className={`sc-tipo t-${t.id} ${tipo === t.id ? "on" : ""}`} onClick={() => { setTipo(t.id); haptic("select"); }}>
          <span className="sc-tipo-w"><Onda tipo={t.id} h={18} a={5.5} stroke={1.6} fade={6} /></span>
          <span className="sc-tipo-t"><b>{t.label}</b><small>{NOME[t.id]}</small></span>
        </button>)}
      </div>
      <label className="sc-field"><span>Una nota, se vuoi</span>
        <textarea className="inp" rows={2} maxLength={NOTA_MAX} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Che cosa ti ha fatto pensare?" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }} />
        <small aria-live="polite">{nota.length}/{NOTA_MAX}</small>
      </label>
      <p className="sc-priv"><EyeOff size={12} aria-hidden="true" />{taggedAdmin ? "Questa scintilla porterà il tuo sigillo Admin, insieme all’emozione e alla nota." : "Chi l’ha scritto vedrà il segnale sotto la frase, l’emozione e la nota, mai il tuo nome."}</p>
      <div className="sc-acts">
        <button type="button" className="bt" onClick={onClose}>Annulla</button>
        <button type="button" className="bt on sc-light" disabled={!tipo || busy} onClick={go}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}Accendi</button>
      </div>
    </div>
  </div>;
}

// Il legame tra pensieri: «Nato da un pensiero», con la frase citata, e «N pensieri nati da qui». Rivela solo il legame,
// mai chi. L'originale si apre se esiste ancora; se è stato ritirato resta la citazione.
export function EchiDelPensiero({ db, item, find, onOpen }: { db: Firestore; item: any; find: (id: string) => any; onOpen: (t: any) => void }) {
  const nata = nataDaOf(item);
  const [orig, setOrig] = useState<any | null | undefined>(undefined);
  const [kids, setKids] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const look = useRef(find); look.current = find;
  useEffect(() => {
    if (!nata) { setOrig(undefined); return; }
    let on = true; setOrig(undefined);
    const mine = look.current(nata.id);
    if (mine) { setOrig(mine); return; }
    getDoc(doc(db, "testi", nata.id)).then((s) => { if (on) setOrig(s.exists() && s.data()?.version === PUBLIC_VERSION ? readPublic(s.data(), s.id) : null); }).catch(() => { if (on) setOrig(null); });
    return () => { on = false; };
  }, [db, nata?.id]);
  useEffect(() => {
    let on = true; setKids([]); setOpen(false);
    getDocs(query(collection(db, "testi"), where("version", "==", PUBLIC_VERSION), where("nataDa.id", "==", item.id), limit(30)))
      .then((s) => { if (on) setKids(s.docs.map((d) => look.current(d.id) || readPublic(d.data(), d.id))); })
      .catch((e) => console.warn("Echi non letti", e));
    return () => { on = false; };
  }, [db, item.id]);
  if (!nata && !kids.length) return null;
  return <>
    {nata && <div className="rd-bar sc-eco from">
      <span className="rd-k"><Sprout size={13} aria-hidden="true" />Nato da un pensiero</span>
      <q className="sc-eco-q">{nata.cit}</q>
      {orig ? <><AdminBadge active={orig.admin === true} /><button type="button" className="sc-lst" onClick={() => onOpen(orig)}>Leggi l’originale<ArrowUpRight size={13} /></button></>
        : orig === null && <span className="sc-gone">pensiero ritirato</span>}
    </div>}
    {kids.length > 0 && <div className="rd-bar sc-eco kids">
      <button type="button" className="sc-kids" aria-expanded={open} onClick={() => setOpen(!open)}><CornerDownRight size={14} aria-hidden="true" /><b>{kids.length}</b> {kids.length === 1 ? "pensiero nato da qui" : "pensieri nati da qui"}<ChevronDown size={14} /></button>
      {open && <ul className="sc-kids-l">{kids.map((k) => <li key={k.id}><button type="button" onClick={() => onOpen(k)}><span className="sc-kid-t">{k.title || "Senza titolo"}</span><AdminBadge active={k.admin === true} />{nataDaOf(k) && <q>{nataDaOf(k)!.cit}</q>}</button></li>)}</ul>}
    </div>}
  </>;
}
