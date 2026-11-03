// Il vetro liquido (Opzioni › Aspetto › Vetro › Liquido), sul modello del Liquid Glass di Apple: una lastra che non
// si limita a sfocare ciò che ha dietro, ma lo piega come una lente spessa. Al centro la lastra è piana e lascia
// vedere il fondo quasi com'è; verso il bordo la superficie si curva e il disegno del circuito si stira e si piega,
// tanto più quanto la lastra è grande (una lastra grande è un vetro più spesso). La luce arriva da un punto solo,
// lo stesso per tutto il sito, e segue piano il puntatore: i fili di luce sui bordi si spostano verso di lei.
//
// Tutto il vetro della lastra è un filtro SVG messo nel backdrop-filter, che soltanto i browser Chromium sanno
// disegnare (altrove resta il resto del vetro liquido, con la sfocatura normale): al centro il fondo sfocato (la
// smerigliatura), sul bordo lo stesso fondo quasi nitido ma piegato verso l'interno (feDisplacementMap), e fra i due
// un passaggio morbido. Ogni misura di lastra ha la sua mappa: la distanza dal bordo arrotondato diventa uno
// spostamento verso l'interno (canali rosso e verde) e il peso del bordo (canale blu). Le lastre della stessa misura e
// della stessa smerigliatura la condividono. Il filtro arriva alla lastra come variabile CSS (--lq-f): il CSS lo usa
// solo dove la lastra è davvero di vetro.

const SEL = ".root .pn:not(.hero), .root .shell-sidebar, .root .shell-dock";
const MAX_FILTERS = 160;

type Made = { id: string; used: number };
const made = new Map<string, Made>();
let defs: SVGDefsElement | null = null, seq = 0, tick = 0;

const NS = "http://www.w3.org/2000/svg";
const ensureDefs = () => {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "vetro-defs"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
  defs = document.createElementNS(NS, "defs") as SVGDefsElement;
  svg.appendChild(defs); document.body.appendChild(svg);
  return defs;
};

// lo spessore del bordo che piega la luce: un settimo del lato corto, fra 10 e 26 px (resta fuori dal testo, che nelle
// lastre comincia almeno a 20 px dal bordo)
export const bandOf = (w: number, h: number) => Math.max(10, Math.min(26, Math.min(w, h) * 0.14));

// la mappa di una lastra w×h con raggio r: fuori dalla fascia del bordo 128/128 (nessuno spostamento) e blu a zero;
// dentro la fascia uno spostamento verso l'interno che cresce col quadrato dell'avvicinarsi al bordo, come su una
// superficie convessa, e un blu che sale morbido fino al bordo (quanto si vede il fondo piegato invece di quello sfocato).
// Disegnata a mezza risoluzione (al massimo 640 px di lato): la mappa è liscia, il filtro la riporta alla misura vera
// un punto (px, py) della lastra: lo spostamento verso l'interno (vx, vy, fra -1 e 1) e il peso del bordo (rim, 0..0,88)
export const lensAt = (px: number, py: number, w: number, h: number, r: number, band: number): [number, number, number] => {
  const cx = w / 2, cy = h / 2, ix = w / 2 - r, iy = h / 2 - r, sx = px < cx ? -1 : 1, sy = py < cy ? -1 : 1;
  const qx = Math.abs(px - cx) - ix, qy = Math.abs(py - cy) - iy;
  let din: number, gx: number, gy: number;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; din = r - l; gx = (sx * qx) / l; gy = (sy * qy) / l; }
  else { din = r - Math.max(qx, qy); if (qx > qy) { gx = sx; gy = 0; } else { gx = 0; gy = sy; } }
  if (din >= band) return [0, 0, 0];
  const t = Math.min(1, 1 - Math.max(0, din) / band), m = t * t, u = Math.min(1, t * 1.35);
  return [-gx * m, -gy * m, 0.88 * u * u * (3 - 2 * u)];
};

export const lensMap = (w: number, h: number, r: number, band: number) => {
  const res = Math.min(0.5, 640 / Math.max(w, h));
  const W = Math.max(2, Math.round(w * res)), H = Math.max(2, Math.round(h * res));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); if (!g) return "";
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [vx, vy, rim] = lensAt((x + 0.5) / res, (y + 0.5) / res, w, h, r, band);
    const i = (y * W + x) * 4;
    d[i] = Math.round(128 + vx * 127); d[i + 1] = Math.round(128 + vy * 127); d[i + 2] = Math.round(rim * 255); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
};

const filterFor = (w: number, h: number, r: number, frost: number) => {
  const key = `${w}x${h}r${r}f${frost}`;
  const hit = made.get(key); if (hit) { hit.used = ++tick; return hit.id; }
  const band = bandOf(w, h), href = lensMap(w, h, r, band); if (!href) return "";
  const id = `lq${++seq}`, f = document.createElementNS(NS, "filter");
  f.setAttribute("id", id); f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", String(w)); f.setAttribute("height", String(h));
  f.setAttribute("filterUnits", "userSpaceOnUse"); f.setAttribute("primitiveUnits", "userSpaceOnUse"); f.setAttribute("color-interpolation-filters", "sRGB");
  const el = (tag: string, a: Record<string, string>) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); f.appendChild(n); };
  // la smerigliatura del centro (edgeMode duplicate: ai margini il fondo continua, non sfuma nel trasparente)
  el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: String(frost), edgeMode: "duplicate", result: "frost" });
  el("feImage", { href, x: "0", y: "0", width: String(w), height: String(h), preserveAspectRatio: "none", result: "lente" });
  // il bordo: il fondo piegato verso l'interno, appena ammorbidito
  el("feDisplacementMap", { in: "SourceGraphic", in2: "lente", scale: (band * 1.4).toFixed(1), xChannelSelector: "R", yChannelSelector: "G", result: "piega" });
  el("feGaussianBlur", { in: "piega", stdDeviation: "1.6", edgeMode: "duplicate", result: "piega2" });
  // il peso del bordo (il blu della mappa) diventa la trasparenza del bordo piegato, posato sopra il centro
  el("feColorMatrix", { in: "lente", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0", result: "peso" });
  el("feComposite", { in: "piega2", in2: "peso", operator: "in", result: "bordo" });
  el("feComposite", { in: "bordo", in2: "frost", operator: "over" });
  ensureDefs().appendChild(f);
  made.set(key, { id, used: ++tick });
  // le misure che nessuno usa più da tempo se ne vanno (una pagina ridimensionata a lungo ne crea molte)
  if (made.size > MAX_FILTERS) {
    const old = Array.from(made.entries()).sort((a, b) => a[1].used - b[1].used).slice(0, made.size - MAX_FILTERS);
    for (const [k, m] of old) { document.getElementById(m.id)?.remove(); made.delete(k); }
  }
  return id;
};

const WINDOWS = ".cp, .settings-panel, .sc-sheet, .sc-pop, [role=status]";
const fit = (el: HTMLElement) => {
  // la misura di impaginazione, non quella disegnata: l'inclinazione al passaggio del mouse non deve cambiare la mappa
  const w = el.offsetWidth, h = el.offsetHeight;
  if (w < 24 || h < 24) { el.style.removeProperty("--lq-f"); return; }
  const cs = getComputedStyle(el);
  const r = Math.min(Math.round(parseFloat(cs.borderTopLeftRadius) || 0), Math.floor(Math.min(w, h) / 2));
  // la smerigliatura è quella del CSS: le finestre e le barre più fitte, le lastre e le schede più limpide
  const bar = el.classList.contains("shell-sidebar") || el.classList.contains("shell-dock");
  const frost = bar ? (window.innerWidth < 768 ? 12 : 14) : Math.round(parseFloat(cs.getPropertyValue(el.matches(WINDOWS) ? "--g-blur-pop" : "--g-blur")) || 9);
  const id = filterFor(w, h, r, frost);
  if (id) el.style.setProperty("--lq-f", `url(#${id})`);
};

// la luce del sito: un punto solo, in alto a sinistra a riposo; segue il puntatore con calma, a passi piccoli (le
// variabili cambiano solo quando la luce si sposta davvero, a passi di un decimo del suo giro e al massimo sei volte al
// secondo: ogni passo ridisegna i bordi di tutte le lastre)
const light = (root: HTMLElement) => {
  let raf = 0, last = 0, px = -0.55, py = -0.85, sx = "", sy = "";
  const apply = () => {
    raf = 0;
    const q = (v: number) => (Math.round(v * 5) / 5).toFixed(1);
    const nx = q(px), ny = q(py);
    if (nx !== sx) { sx = nx; root.style.setProperty("--lq-x", nx); }
    if (ny !== sy) { sy = ny; root.style.setProperty("--lq-y", ny); }
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const now = performance.now(); if (now - last < 160) return; last = now;
    // la luce sta oltre il puntatore, lontana: si sposta poco e non va mai sotto le lastre
    px = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.5) * 1.6));
    py = Math.max(-1, Math.min(-0.25, (e.clientY / window.innerHeight - 0.5) * 1.4 - 0.45));
    if (!raf) raf = requestAnimationFrame(apply);
  };
  apply();
  window.addEventListener("pointermove", move, { passive: true });
  return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); root.style.removeProperty("--lq-x"); root.style.removeProperty("--lq-y"); };
};

// avvia il vetro liquido sulla radice del sito; lens: false dove il browser non sa piegare il fondo (resta la luce)
export function startLiquid(root: HTMLElement, { lens, moving }: { lens: boolean; moving: boolean }) {
  const stops: (() => void)[] = [];
  if (moving) stops.push(light(root));
  if (lens && typeof ResizeObserver !== "undefined") {
    const seen = new Set<HTMLElement>();
    const ro = new ResizeObserver((es) => { for (const e of es) fit(e.target as HTMLElement); });
    let raf = 0;
    const scan = () => {
      raf = 0;
      const now = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(SEL).forEach((el) => { now.add(el); if (!seen.has(el)) { seen.add(el); ro.observe(el); fit(el); } });
      seen.forEach((el) => { if (!now.has(el)) { ro.unobserve(el); seen.delete(el); } });
    };
    // le lastre di una pagina nuova si trovano al fotogramma dopo il cambio, come le luci delle card
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    stops.push(() => {
      mo.disconnect(); ro.disconnect(); cancelAnimationFrame(raf);
      seen.forEach((el) => el.style.removeProperty("--lq-f")); seen.clear();
      made.forEach((m) => document.getElementById(m.id)?.remove()); made.clear();
    });
  }
  return () => stops.forEach((s) => s());
}
