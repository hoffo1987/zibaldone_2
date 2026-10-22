import React, { useEffect, useId, useRef, useState } from "react";
import { Sparkles, Sun, Hourglass, HeartHandshake, Heart, Leaf, WandSparkles, Compass, Lightbulb, Globe, Quote, Shuffle, PenLine, Undo2, Check, ChevronDown, Feather } from "lucide-react";
import { SETS, setOf, draw, dailyOf, dayKey, cheerAfter, TODAY_CHEER, TIPO_LABEL, USE_NOTE, loadMemo, saveMemo, remember, paperText, type Spunto, type Scelta } from "./spunti";
import { Words, moving, rectOf } from "./motion";
import { haptic } from "./haptics";
import "./spunti.css";

const ICON: Record<Scelta, typeof Sun> = { tutti: Sparkles, oggi: Sun, ricordi: Hourglass, persone: HeartHandshake, dentro: Heart, piccole: Leaf, immagina: WandSparkles, domani: Compass, grandi: Lightbulb, intorno: Globe, incipit: Quote };
const CHOICES: { id: Scelta; name: string }[] = [{ id: "tutti", name: "Tutti" }, ...SETS];

type Deal = { s: Spunto; today: boolean; cheer: string; n: number };
// lo spunto che è sul foglio, e se il foglio è ancora com'era subito dopo (allora si può togliere o sostituire)
export type OnPaper = { id: string; untouched: boolean } | null;

const inert = (el: HTMLElement | null, on: boolean) => { if (el) (el as any).inert = on; };

// Il pannello degli spunti, sotto la scelta «Pensiero del diario». Un mazzo di foglietti: se ne pesca uno, se ne
// sceglie il tema, e quello che piace va sul foglio con «Scrivi da qui».
export function DiaryPrompts({ show, uid, onPaper, onUse, onRemove }: {
  show: boolean; uid: string; onPaper: OnPaper;
  onUse: (s: Spunto, from: HTMLElement | null) => void; onRemove: (to: HTMLElement | null) => void;
}) {
  const memo = useRef(loadMemo(uid));
  const [open, setOpen] = useState(memo.current.open);
  const [set, setSet] = useState<Scelta>("tutti");
  // il primo foglietto è lo spunto di oggi, finché oggi non ci si è scritto sopra
  const [deal, setDeal] = useState<Deal>(() => {
    const now = new Date(), m = memo.current;
    return m.daily === dayKey(now) ? { s: draw({ set: "tutti", now, seen: m.seen }), today: false, cheer: cheerAfter(""), n: 0 } : { s: dailyOf(now), today: true, cheer: TODAY_CHEER, n: 0 };
  });
  const [out, setOut] = useState<Deal | null>(null);
  const [spin, setSpin] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null), bodyRef = useRef<HTMLDivElement>(null), textRef = useRef<HTMLParagraphElement>(null), setsRef = useRef<HTMLDivElement>(null);
  const outT = useRef(0);
  const hid = useId(), bid = useId();

  useEffect(() => { memo.current.seen = remember(memo.current.seen, deal.s.id); saveMemo(uid, memo.current); }, [deal.s.id, uid]);
  useEffect(() => { inert(wrapRef.current, !show); }, [show]);
  useEffect(() => { inert(bodyRef.current, !open); }, [open]);
  useEffect(() => () => clearTimeout(outT.current), []);

  // il foglietto di prima esce di lato mentre il nuovo sale dal mazzo
  const next = (to: Scelta) => {
    const s = draw({ set: to, now: new Date(), seen: memo.current.seen, prev: deal.s });
    if (moving()) { setOut(deal); clearTimeout(outT.current); outT.current = window.setTimeout(() => setOut(null), 480); }
    setDeal({ s, today: false, cheer: cheerAfter(deal.cheer), n: deal.n + 1 });
    setSpin((x) => x + 1);
  };
  const pick = (to: Scelta) => {
    if (to === set) return;
    setSet(to); next(to);
    // il tema scelto resta in vista nella fila che scorre (telefono)
    const box = setsRef.current, el = box?.querySelector<HTMLElement>(`[data-set="${to}"]`);
    if (box && el && box.scrollWidth > box.clientWidth) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: moving() ? "smooth" : "auto" });
  };
  const toggle = () => { const o = !open; setOpen(o); memo.current.open = o; saveMemo(uid, memo.current); };
  const use = () => {
    if (deal.today) { memo.current.daily = dayKey(new Date()); saveMemo(uid, memo.current); }
    haptic("success");
    onUse(deal.s, textRef.current);
  };

  const here = onPaper?.id === deal.s.id, removable = here && !!onPaper?.untouched;
  const note = removable ? "È sul foglio. Se non ti convince, puoi toglierlo o pescarne un altro." : here ? "È sul foglio: adesso la pagina è tua." : USE_NOTE[deal.s.tipo];
  const card = (d: Deal, leaving: boolean) => {
    const Ic = ICON[d.s.set];
    return <article key={`${leaving ? "o" : "c"}${d.n}`} className={`sp-card ${leaving ? "out" : ""}`} aria-hidden="true">
      <div className="sp-meta">
        <span className="sp-theme"><Ic size={13} aria-hidden="true" />{setOf(d.s.set).name}</span><i className="sp-dot" /><span>{TIPO_LABEL[d.s.tipo]}</span>
        {!leaving && here ? <span className="sp-stamp"><Check size={11} strokeWidth={3} />Sul foglio</span> : d.today ? <span className="sp-today">Spunto di oggi</span> : null}
      </div>
      <p ref={leaving ? undefined : textRef} className="sp-text hd"><Words text={d.s.text} on={!leaving} /></p>
      <p className="sp-cheer"><Feather size={12} aria-hidden="true" />{d.cheer}</p>
    </article>;
  };

  return <div ref={wrapRef} className={`sp-wrap ${show ? "on" : ""}`} aria-hidden={!show}>
    <div className="sp-fold"><div className="sp-pad">
      <section className={`spunti pn ${open ? "open" : ""}`} aria-labelledby={hid}>
        <div className="sp-head">
          <span className="sp-mark" aria-hidden="true"><Feather size={18} /></span>
          <div className="sp-head-t">
            <p className="sp-eyebrow">Spunti per il diario</p>
            <h2 id={hid} className="hd sp-title">Non sai da dove cominciare?</h2>
            <p className="sp-sub">{open ? "Pesca una domanda o mezza frase: il resto lo scrivi tu." : here ? `Sul foglio: «${deal.s.text}»` : "Una domanda o mezza frase per rompere il ghiaccio. Il resto lo scrivi tu."}</p>
          </div>
          {open ? <button type="button" className="bt sp-toggle" aria-expanded="true" aria-controls={bid} aria-label="Nascondi gli spunti" onClick={toggle}><span className="sp-toggle-l">Nascondi</span><ChevronDown size={16} /></button>
            : <button type="button" className="bt sp-cta" aria-expanded="false" aria-controls={bid} onClick={toggle}><Sparkles size={16} />Pesca uno spunto</button>}
        </div>
        <div id={bid} ref={bodyRef} className={`sp-body ${open ? "" : "shut"}`}><div className="sp-body-in"><div className="sp-body-pad">
          <div ref={setsRef} className="sp-sets" role="radiogroup" aria-label="Tema degli spunti">
            {CHOICES.map((c) => { const Ic = ICON[c.id], on = set === c.id; return <button type="button" key={c.id} data-set={c.id} role="radio" aria-checked={on} data-haptic="select" className="sp-chip" onClick={() => pick(c.id)}><Ic size={15} aria-hidden="true" />{c.name}</button>; })}
          </div>
          {set !== "tutti" && <p key={set} className="sp-blurb">{setOf(set).blurb}</p>}
          <div className="sp-stage" data-deal={deal.n % 2}>
            {out && card(out, true)}
            {card(deal, false)}
          </div>
          <p className="sr-only" aria-live="polite">{`${deal.today ? "Spunto di oggi. " : ""}${TIPO_LABEL[deal.s.tipo]}: ${deal.s.text}`}</p>
          <div className="sp-actions">
            <p className="sp-note">{note}</p>
            <div className="sp-btns">
              <button type="button" className="bt sp-next" onClick={() => next(set)} style={{ ["--spin" as any]: `${spin * 180}deg` }}><Shuffle size={16} aria-hidden="true" />Un altro</button>
              {/* due pulsanti distinti (key): passando dall'uno all'altro i colori non sfumano, il testo non sparisce mai */}
              {removable ? <button key="off" type="button" className="bt sp-off" onClick={() => onRemove(textRef.current)}><Undo2 size={16} aria-hidden="true" />Togli dal foglio</button>
                : <button key="use" type="button" className="bt sp-use" disabled={here} data-haptic="off" onClick={use}>{here ? <><Check size={16} aria-hidden="true" />Sul foglio</> : <><PenLine size={16} aria-hidden="true" />Scrivi da qui</>}</button>}
            </div>
          </div>
        </div></div></div>
      </section>
    </div></div>
  </div>;
}

// --- lo spunto sul foglio ---
// Scrive lo spunto in fondo all'editor (o al posto del foglio vuoto): la domanda in corsivo con una riga libera sotto,
// la mezza frase da continuare. Restituisce la riga dello spunto, il suo testo e dove mettere il cursore.
export function inkInto(ed: HTMLElement, s: Spunto) {
  const doc = ed.ownerDocument;
  if (!(ed.textContent || "").trim() && !ed.querySelector("img")) ed.innerHTML = "";
  const empty = (el: Element | null) => !!el && el.tagName === "DIV" && !el.textContent && !el.querySelector("img");
  const add = () => ed.appendChild(doc.createElement("div"));
  const text = doc.createTextNode(paperText(s));
  let tail = ed.lastElementChild;
  // dopo quello che c'è già, la domanda si stacca di una riga; la mezza frase va a capo e basta
  if (ed.childNodes.length && !empty(tail) && s.tipo !== "incipit") add().appendChild(doc.createElement("br"));
  tail = ed.lastElementChild;
  const line = ed.childNodes.length && ed.lastChild === tail && empty(tail) && s.tipo === "incipit" ? (tail as HTMLElement) : add();
  line.textContent = "";
  if (s.tipo === "incipit") line.appendChild(text);
  else { line.appendChild(doc.createElement("i")).appendChild(text); add().appendChild(doc.createElement("br")); }
  const caret = () => {
    const r = doc.createRange();
    if (s.tipo === "incipit") r.setStart(text, text.length); else r.setStart(ed.lastChild!, 0);
    r.collapse(true); return r;
  };
  return { line, text, caret };
}

// lo spunto è in un punto comodo da guardare (non sotto la barra in alto, non dietro la tastiera)
const comfy = (r: DOMRect) => r.top > window.innerHeight * 0.18 && r.bottom < window.innerHeight * 0.72;
// aspetta che lo scorrimento morbido finisca (o che non parta affatto). Con la pagina in secondo piano i fotogrammi si
// fermano: dopo un secondo si va avanti comunque
const still = () => new Promise<void>((res) => {
  let y = window.scrollY, calm = 0, n = 0, moved = false, over = false;
  const end = () => { if (!over) { over = true; res(); } };
  const tick = () => {
    if (over) return;
    n++; const d = Math.abs(window.scrollY - y); y = window.scrollY;
    if (d > 0.5) { moved = true; calm = 0; } else calm++;
    if ((moved ? calm >= 3 : n >= 8) || n > 90) end(); else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(end, 1000);
});
// la copia che vola: stesso carattere, interlinea e larghezza della riga sul foglio, così all'arrivo combacia
const ghostOf = (line: HTMLElement, ed: HTMLElement, s: Spunto, at: DOMRect) => {
  const cs = getComputedStyle(ed), g = document.createElement("div");
  g.className = "sp-ghost";
  g.setAttribute("aria-hidden", "true");
  Object.assign(g.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, color: cs.color, letterSpacing: cs.letterSpacing });
  if (s.tipo === "incipit") g.textContent = line.textContent; else g.appendChild(document.createElement("i")).textContent = line.textContent;
  document.body.appendChild(g);
  return g;
};
const fontPx = (el: Element) => parseFloat(getComputedStyle(el).fontSize) || 16;
const lineOf = (el: Element) => parseFloat(getComputedStyle(el).lineHeight) || fontPx(el) * 1.3;

// Lo spunto vola dal foglietto al foglio: si stacca (il foglietto si fa più chiaro), fa un piccolo arco e si posa sulla
// sua riga, che un evidenziatore rosa segna per un attimo. Poi il cursore aspetta subito dopo. Con le animazioni spente
// la riga è già lì e il cursore pure.
export async function inkFlight(from: HTMLElement | null, line: HTMLElement, text: Text, ed: HTMLElement, s: Spunto, done: () => void) {
  if (!comfy(line.getBoundingClientRect())) {
    const r = line.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.4, behavior: moving() ? "smooth" : "auto" });
    if (moving()) await still();
  }
  const src = rectOf(from);
  if (!moving() || !src) { done(); return; }
  line.classList.add("sp-hold");
  const at = line.getBoundingClientRect(), g = ghostOf(line, ed, s, at);
  // la riga del foglio, ingrandita, è più alta di quella del foglietto: la copia parte un poco più su, a filo del testo
  const k = fontPx(from!) / fontPx(ed), dx = src.left - at.left, dy = src.top - at.top - (lineOf(ed) * k - lineOf(from!)) / 2;
  // la copia va a capo come sul foglio, più largo del foglietto: alla partenza la si ritaglia sulla riga del foglietto
  const cut = `inset(-8px ${Math.max(0, at.width - src.width / k)}px -8px -8px)`, open = "inset(-8px -8px -8px -8px)";
  from!.animate([{ opacity: 1 }, { opacity: 0.2, offset: 0.18 }, { opacity: 0.2, offset: 0.75 }, { opacity: 1 }], { duration: 1000, easing: "ease-out" });
  const fly = g.animate([
    { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(-1.5deg)`, opacity: 0, clipPath: cut },
    { transform: `translate(${dx * 0.9}px,${dy * 0.9 - 8}px) scale(${k}) rotate(-1.2deg)`, opacity: 1, clipPath: cut, offset: 0.16 },
    { transform: `translate(${dx * 0.42}px,${dy * 0.42 - 30}px) scale(${(k + 1) / 2}) rotate(.6deg)`, opacity: 1, clipPath: open, offset: 0.55 },
    { transform: "translate(0px,0px) scale(1) rotate(0deg)", opacity: 1, clipPath: open },
  ], { duration: 760, easing: "cubic-bezier(.45,0,.2,1)" });
  // la riga non deve restare invisibile: se l'animazione non arriva in fondo (pagina in secondo piano) si posa lo stesso
  let landed = false;
  const land = () => {
    if (landed) return; landed = true; clearTimeout(safe);
    line.classList.remove("sp-hold"); if (!line.getAttribute("class")) line.removeAttribute("class");
    if (fly.playState !== "finished") { fly.cancel(); g.remove(); }
    else g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).finished.then(() => g.remove(), () => g.remove());
    marker(text, ed);
    done();
  };
  const safe = window.setTimeout(land, 1500);
  fly.finished.then(land, land);
}

// l'evidenziatore: una passata rosa sotto le righe appena arrivate, che poi si asciuga
const marker = (text: Text, ed: HTMLElement) => {
  const paper = ed.parentElement; if (!paper) return;
  const p = paper.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(text);
  Array.from(r.getClientRects()).filter((x) => x.width > 4).forEach((x, i) => {
    const m = document.createElement("i");
    m.className = "sp-glow";
    Object.assign(m.style, { left: `${x.left - p.left - 3}px`, top: `${x.top - p.top + x.height * 0.5}px`, width: `${x.width + 6}px`, height: `${x.height * 0.5}px` });
    paper.appendChild(m);
    m.animate([{ transform: "scaleX(0)", opacity: 1 }, { transform: "scaleX(1)", opacity: 1, offset: 0.28 }, { transform: "scaleX(1)", opacity: 1, offset: 0.55 }, { transform: "scaleX(1)", opacity: 0 }],
      { duration: 1500, delay: i * 110, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }).finished.then(() => m.remove(), () => m.remove());
    setTimeout(() => m.remove(), 2200 + i * 110);
  });
};

// «Togli dal foglio»: la riga torna nel foglietto da cui era partita, poi il foglio è com'era prima
export function inkBack(line: HTMLElement | null, to: HTMLElement | null, ed: HTMLElement, s: Spunto, restore: () => void) {
  const dst = rectOf(to), at = line && line.isConnected ? line.getBoundingClientRect() : null;
  if (!moving() || !dst || !at || !at.width) { restore(); return; }
  const g = ghostOf(line!, ed, s, at);
  restore();
  const k = fontPx(to!) / fontPx(ed), dx = dst.left - at.left, dy = dst.top - at.top - (lineOf(ed) * k - lineOf(to!)) / 2;
  const cut = `inset(-8px ${Math.max(0, at.width - dst.width / k)}px -8px -8px)`, open = "inset(-8px -8px -8px -8px)";
  to!.animate([{ opacity: 0.2 }, { opacity: 0.2, offset: 0.6 }, { opacity: 1 }], { duration: 640, easing: "ease-out" });
  g.animate([
    { transform: "translate(0px,0px) scale(1)", opacity: 1, clipPath: open },
    { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 26}px) scale(${(k + 1) / 2}) rotate(-.6deg)`, opacity: 1, clipPath: open, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0, clipPath: cut },
  ], { duration: 620, easing: "cubic-bezier(.45,0,.2,1)", fill: "forwards" }).finished.then(() => g.remove(), () => g.remove());
  setTimeout(() => g.remove(), 1400);
}
