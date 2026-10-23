// Il disegno segue il testo del foglio.
// I tratti si salvano in pixel del foglio di chi scrive (largo w). Su uno schermo di larghezza diversa il testo va a capo
// in altri punti: ingrandire il disegno in proporzione lo allontanerebbe dalle parole (e allungherebbe il foglio a vuoto).
// Ogni gruppo di tratti vicini resta invece agganciato a ciò accanto a cui è stato fatto: una parola, una riga vuota,
// una foto o la fine del testo. Il gruppo mantiene la sua misura e si sposta insieme al suo aggancio.

export type Pt = { x: number; y: number };
export type Stroke = { points: Pt[]; size?: number; tool?: string; [k: string]: any };
export type Box = { x: number; y: number; w: number; h: number };
/** Gli agganci di un testo impaginato: chiave → riquadro, rispetto all'angolo del foglio. */
export type Layout = { list: [string, Box][]; map: Map<string, Box>; end: number; width: number; pad: number };

const BLOCK = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/;

export const layoutOf = (list: [string, Box][], width: number, pad: number): Layout => ({
  list, map: new Map(list), width, pad, end: list.reduce((m, [, b]) => Math.max(m, b.y + b.h), 0),
});

/** Misura parole, righe vuote e foto del testo già impaginato in root. Le chiavi contano solo i caratteri visibili
 * (non gli spazi), così restano uguali tra l'editor e la lettura, che toglie gli spazi dei titoli centrati a mano. */
export const measure = (root: HTMLElement): Layout => {
  const o = root.getBoundingClientRect();
  const rel = (r: DOMRect | DOMRectReadOnly): Box => ({ x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height });
  const list: [string, Box][] = [];
  const range = document.createRange();
  let n = 0, blanks = 0, imgs = 0;
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const t = (node as Text).data, re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (r && r.height) list.push([`t${n}`, rel(r)]);
        n += m[0].length;
      }
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.tagName === "IMG") { list.push([`i${imgs++}`, rel(el.getBoundingClientRect())]); return; }
    if (el !== root && BLOCK.test(el.tagName) && !(el.textContent || "").trim() && !el.querySelector("img")) {
      const r = el.getBoundingClientRect();
      if (r.height) list.push([`b${blanks++}`, rel(r)]);
      return;
    }
    el.childNodes.forEach(walk);
  };
  walk(root);
  const cs = getComputedStyle(root);
  return layoutOf(list, root.clientWidth, parseFloat(cs.paddingLeft) || 0);
};

/** Come era impaginato il testo sul foglio di chi l'ha scritto: una copia invisibile larga w, con il margine dell'editor.
 * Le foto prendono la misura di quelle già caricate in live (stesso ordine), altrimenti la copia le vedrebbe alte zero. */
export const measureAt = (host: HTMLElement, html: string, w: number, live?: HTMLElement | null): Layout => {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
  const rt = document.createElement("div");
  rt.className = "rt";
  rt.style.cssText = `position:absolute;left:0;top:0;width:${w}px;padding:24px;box-sizing:border-box`;
  rt.innerHTML = html;
  const src = live ? Array.from(live.querySelectorAll("img")) : [];
  rt.querySelectorAll("img").forEach((im, i) => {
    im.removeAttribute("loading");
    const s = src[i];
    if (s && s.naturalWidth) { im.setAttribute("width", String(s.naturalWidth)); im.setAttribute("height", String(s.naturalHeight)); }
  });
  box.appendChild(rt); host.appendChild(box);
  try { return measure(rt); } finally { box.remove(); }
};

const bboxOf = (ss: Stroke[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  ss.forEach((s) => {
    const r = (s.size || 3) / 2;
    s.points.forEach((p) => { x0 = Math.min(x0, p.x - r); y0 = Math.min(y0, p.y - r); x1 = Math.max(x1, p.x + r); y1 = Math.max(y1, p.y + r); });
  });
  return { x0, y0, x1, y1 };
};
export const inkBounds = (ss: Stroke[]) => (ss.some((s) => s.points?.length) ? bboxOf(ss.filter((s) => s.points?.length)) : null);

/** Tratti vicini (a meno di una riga) formano un solo disegno: gli occhi e la bocca di una faccina si spostano insieme. */
export const groupsOf = (ss: Stroke[], gap = 32): number[][] => {
  const b = ss.map((s) => bboxOf([s])), up = ss.map((_, i) => i);
  const root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
  for (let i = 0; i < ss.length; i++)
    for (let j = i + 1; j < ss.length; j++)
      if (b[i].x0 - gap <= b[j].x1 && b[j].x0 - gap <= b[i].x1 && b[i].y0 - gap <= b[j].y1 && b[j].y0 - gap <= b[i].y1) up[root(i)] = root(j);
  const g = new Map<number, number[]>();
  ss.forEach((s, i) => { if (s.points?.length) { const r = root(i); g.set(r, [...(g.get(r) || []), i]); } });
  return Array.from(g.values());
};

// distanza da un riquadro: lo scarto verticale pesa di più, così vince la parola della stessa riga
const dist = (p: Pt, b: Box) => Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.w), 2 * Math.max(b.y - p.y, 0, p.y - b.y - b.h));

/** A che cosa è agganciato un disegno: la chiave della parola, della riga vuota o della foto (o "end", la fine del testo)
 * e dove si trovava sul foglio di chi l'ha fatto. */
export type Anchor = Box & { k: string };
const round = (v: number) => Math.round(v * 10) / 10;
const centerOf = (ss: Stroke[]) => { const b = bboxOf(ss); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; };
const pick = (c: Pt, from: Layout): Anchor => {
  let a: [string, Box] | undefined, bd = Infinity;
  // una riga vuota vince di poco su una parola: chi disegna tra due paragrafi disegna nello spazio, non sulla parola sopra
  if (c.y <= from.end) for (const e of from.list) { const d = dist(c, e[1]) - (e[0][0] === "b" ? 12 : 0); if (d < bd) { bd = d; a = e; } }
  return a ? { k: a[0], x: round(a[1].x), y: round(a[1].y), w: round(a[1].w), h: round(a[1].h) } : { k: "end", x: 0, y: round(from.end), w: 0, h: 0 };
};

/** Al salvataggio: ogni tratto ricorda il suo aggancio sul foglio vero di chi scrive. L'impaginazione di quel telefono
 * (caratteri ingranditi dal sistema, per esempio) non si può ricostruire con certezza altrove. */
export const anchorInk = (ss: Stroke[], layout: Layout): Stroke[] => {
  const out = ss.map(({ a, ...s }) => s as Stroke);
  groupsOf(out).forEach((g) => { const a = pick(centerOf(g.map((i) => out[i])), layout); g.forEach((i) => { out[i] = { ...out[i], a }; }); });
  return out;
};

/** Porta i tratti impaginati per il foglio `from` sul foglio `to`. Se i tratti hanno l'aggancio salvato si usa quello,
 * altrimenti (scritti salvati prima) si ricava da `from`, la ricostruzione del foglio di chi l'ha scritto. */
export const relayout = (ss: Stroke[], from: Layout, to: Layout): Stroke[] => {
  const out = ss.map(({ a, ...s }) => s as Stroke);
  const inner = (l: Layout) => Math.max(1, l.width - 2 * l.pad);
  groupsOf(ss).forEach((g) => {
    const bb = bboxOf(g.map((i) => ss[i])), c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
    const saved: Anchor | undefined = ss[g[0]].a, a = saved || pick(c, from), nb = to.map.get(a.k);
    // in orizzontale, di base, il disegno resta alla stessa frazione della riga (a destra resta a destra)
    let dx = to.pad + ((c.x - from.pad) / inner(from)) * inner(to) - c.x, dy = a.k === "end" ? to.end - a.y : 0, k = 1;
    if (nb) {
      if (a.k[0] === "t") { dx = nb.x - a.x; dy = nb.y - a.y; } // con la sua parola
      else if (a.k[0] === "i") { k = a.w ? nb.w / a.w : 1; dx = nb.x - a.x * k; dy = nb.y - a.y * k; } // sulla foto, che può cambiare misura
      else {
        dy = nb.y - a.y; // su una riga vuota
        // ricostruita (non salvata): se il disegno sta in una riga vuota, ci si mette al centro; la ricostruzione può sbagliare di una riga
        if (!saved && bb.y1 - bb.y0 <= nb.h + 40 && Math.abs(c.y - a.y - a.h / 2) <= a.h / 2 + 32) dy = nb.y + nb.h / 2 - c.y;
      }
    } else if (a.k !== "end") dy = to.end - from.end;
    // non deve uscire dal foglio: se è più largo si rimpicciolisce, poi rientra dai bordi
    const w = (bb.x1 - bb.x0) * k, fit = Math.min(1, (to.width - 4) / Math.max(1, w));
    const cx = c.x * k + dx, cy = c.y * k + dy, half = (w * fit) / 2;
    const sx = Math.max(half + 2 - cx, Math.min(0, to.width - 2 - half - cx));
    const sy = Math.max(0, ((bb.y1 - bb.y0) * k * fit) / 2 - cy);
    const f = k * fit;
    g.forEach((i) => {
      const s = out[i];
      out[i] = { ...s, ...(f === 1 ? {} : { size: Math.max(1, Math.round((s.size || 3) * Math.min(1, f) * 10) / 10) }), points: s.points.map((p) => ({ x: cx + sx + (p.x - c.x) * f, y: cy + sy + (p.y - c.y) * f })) };
    });
  });
  return out;
};

/** Per le anteprime: i disegni dall'alto finché stanno in un riquadro alto span px. Due faccine a mille pixel di distanza
 * ridotte nella stessa scheda diventerebbero due puntini: si vede la prima, alla sua misura. */
export const inkPreviewOf = (ss: Stroke[], span = 240): Stroke[] => {
  const gs = groupsOf(ss).map((g) => ({ g, b: bboxOf(g.map((i) => ss[i])) })).sort((a, b) => a.b.y0 - b.b.y0);
  if (!gs.length) return [];
  const top = gs[0].b.y0;
  return gs.filter((x, i) => i === 0 || x.b.y1 - top <= span).flatMap((x) => x.g.sort((a, b) => a - b).map((i) => ss[i]));
};

/** Il punto più basso del disegno (con il tratto), per allungare il foglio quanto serve. */
export const inkBottom = (ss: Stroke[]) => ss.reduce((m, s) => s.points.reduce((b, p) => Math.max(b, p.y + (s.size || 3) / 2), m), 0);
