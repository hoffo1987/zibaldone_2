// Il vetro liquido (Opzioni › Aspetto › Vetro › Liquido), sul modello del Liquid Glass di Apple.
//
// Ogni lastra è un solo pezzo di vetro: piana al centro, con il bordo che scende a squircle convesso
// (y = ⁴√(1 − (1 − x)⁴), x = 0 sul bordo, 1 dove comincia il piano) e uno spessore di una volta e mezza il bordo.
// Tutto ciò che si vede viene da quella superficie, quindi non ci sono stacchi fra bordo e centro:
//  - la smerigliatura è la stessa su tutta la lastra e cresce con la lastra (i pulsanti sono quasi limpidi, le
//    finestre più velate: un vetro più grande disperde di più la luce);
//  - la rifrazione: un raggio verticale entra nella superficie inclinata, si piega (Snell, vetro n = 1,5) e arriva al
//    fondo spostato verso l'interno; lo spostamento è massimo sul bordo e scende continuo a zero sul piano. Nei
//    vetri piccoli (pulsanti) i tre colori si piegano appena diversi: il bordo si tinge di un filo d'arcobaleno;
//  - il volume: la faccia del bordo rivolta alla luce è un poco più chiara, quella opposta un poco più scura;
//  - il riflesso (Fresnel): dove la superficie è più inclinata il vetro riflette più che trasmettere e si schiarisce;
//  - la luce speculare: un filo bianco sulle facce del bordo che guardano la luce.
// La luce è una sola per tutto il sito, sempre dall'alto: sul computer ondeggia con calma da sinistra a destra
// seguendo il puntatore, sul telefono l'inclinazione. Sopra una scheda il puntatore porta anche una piccola lampada
// (liquid.css: luce che si somma al vetro, più forte sul bordo vicino).
// Le lastre nuove si formano davanti agli occhi: la piega cresce da zero su una molla.
//
// Il filtro sta nel backdrop-filter (solo i browser Chromium sanno usarci un filtro SVG) e fa poche cose, perché si
// ricalcola a ogni fotogramma per ogni lastra: cinque passaggi in tutto (oltre gli otto la pagina perde metà dei
// fotogrammi). Smeriglia il fondo, lo piega con l'unica immagine della lastra e ci posa la luce. L'immagine porta lo
// spostamento (rosso e verde: verso l'interno, quindi anche la direzione in cui guarda ogni faccia del bordo) e
// l'inclinazione della superficie (blu). La luce se ne ricava con una matrice di colore (un valore per punto: ½ sul
// piano, di più dove la faccia guarda la luce e dove la superficie è più inclinata, di meno dall'altra parte) e una
// composizione aritmetica che la applica al fondo due volte: moltiplicandolo (il volume) e sommandola (il filo di
// luce e il riflesso). Muovere la luce cambia soltanto quella matrice. La velatura resta nel CSS, sopra, dove non
// costa nulla. Il CSS dice quali elementi sono vetro (--lq-want: 1); il filtro arriva all'elemento in --lq-f, con
// l'attributo data-lq. Un attributo e non una classe: React riscrive le classi quando ridisegna.

const NS = "http://www.w3.org/2000/svg";
const N_GLASS = 1.5;
const MAX_FILTERS = 160;
const SEL = ".root .pn:not(.hero), .root .bt";
const BARS = ".shell-sidebar, .shell-dock, header.hdr";
const WINDOWS = ".cp, .settings-panel, .sc-sheet, .sc-pop, [role=status]";

type Kind = "btn" | "small" | "pane" | "bar" | "win";
type Glass = {
  id: string; used: number; scale: number; dark: boolean;
  disp: SVGElement[]; light: SVGElement;
  grow: number; // istante in cui ha cominciato a formarsi (0: formata, -1: mai mostrata)
};

// ---------------------------------------------------------------- la superficie
export const squircle = (x: number) => Math.pow(1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 4), 0.25);

// il profilo del bordo, dal bordo (x = 0) al piano (x = 1): spostamento in px e pendenza della superficie
export const bevel = (b: number, thick: number, steps = 96) => {
  const d = new Float32Array(steps), s = new Float32Array(steps);
  let max = 0;
  for (let i = 0; i < steps; i++) {
    const x = (i + 0.5) / steps, e = 0.5 / steps, x0 = Math.max(0, x - e), x1 = Math.min(1, x + e);
    const slope = ((squircle(x1) - squircle(x0)) / (x1 - x0)) * (thick / b);
    const t1 = Math.atan(slope), t2 = Math.asin(Math.sin(t1) / N_GLASS);
    d[i] = thick * squircle(x) * Math.tan(t1 - t2); s[i] = slope;
    if (d[i] > max) max = d[i];
  }
  return { d, s, max: max || 1, steps };
};

// un punto della lastra: distanza dal bordo arrotondato (dentro, in px) e direzione verso l'esterno
export const edgeAt = (px: number, py: number, w: number, h: number, r: number): [number, number, number] => {
  const cx = w / 2, cy = h / 2, sx = px < cx ? -1 : 1, sy = py < cy ? -1 : 1;
  const qx = Math.abs(px - cx) - (w / 2 - r), qy = Math.abs(py - cy) - (h / 2 - r);
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; return [r - l, (sx * qx) / l, (sy * qy) / l]; }
  return qx > qy ? [r - qx, sx, 0] : [r - qy, 0, sy];
};

// lo spostamento (verso l'interno, sul massimo del profilo) e la normale in un punto della lastra
export const surfaceAt = (px: number, py: number, w: number, h: number, r: number, b: number, P: ReturnType<typeof bevel>) => {
  const [din, gx, gy] = edgeAt(px, py, w, h, r);
  const u = Math.max(0, din) / b;
  if (u >= 1) return { vx: 0, vy: 0, nx: 0, ny: 0, nz: 1 };
  const f = Math.min(P.steps - 1, u * P.steps), k = Math.floor(f), t = f - k, k1 = Math.min(P.steps - 1, k + 1);
  const m = (P.d[k] * (1 - t) + P.d[k1] * t) / P.max, sl = P.s[k] * (1 - t) + P.s[k1] * t, l = Math.sqrt(1 + sl * sl);
  return { vx: -gx * m, vy: -gy * m, nx: (gx * sl) / l, ny: (gy * sl) / l, nz: 1 / l };
};

// quanto è largo il bordo curvo e quanto è smerigliata ciascuna specie di lastra
export const shapeOf = (kind: Kind, w: number, h: number) => {
  const m = Math.min(w, h);
  const b = kind === "btn" || kind === "small" ? Math.max(8, Math.min(22, m * 0.42)) : Math.max(12, Math.min(22, m * 0.11));
  const frost = kind === "btn" ? 0.8 : kind === "small" ? 2.5 : kind === "bar" ? 7 : kind === "win" ? 11 : 6;
  return { b, thick: b * 1.5, frost };
};

// ---------------------------------------------------------------- la luce
// La faccia del bordo guarda verso l'esterno, lo spostamento va verso l'interno: d = −(v · l) è quanto la faccia guarda
// la luce (l, la direzione della luce sul piano), già pesato dall'inclinazione (|v| è massimo sul bordo e scende a zero
// sul piano). Con v = 2·((R, G) − 128/255) sulla mappa, la luce di un punto è
//   λ = ½ + kd·d + kf·B           (½ sul piano; B, l'inclinazione, è il riflesso che cresce verso il bordo)
// e il vetro diventa  fondo · (1 + ks·(2λ − 1)) + ka·(λ − ½): più chiaro e più luminoso dove la faccia guarda la luce,
// appena più scuro dall'altra parte, identico al fondo sul piano. Il riflesso (kf, uguale da ogni lato) pesa più della
// direzione (kd): i bordi restano luminosi tutt'intorno e la luce che si sposta li fa solo ondeggiare, senza zone
// troppo scure o troppo chiare (nel tema scuro, dove ogni ombra pesa di più, la direzione è ancora più lieve).
export const lightRows = (az: number, dark: boolean) => {
  const lx = Math.cos(az), ly = Math.sin(az);
  const kd = dark ? 0.3 : 0.4, kf = dark ? 0.72 : 0.58;
  const n = (v: number) => v.toFixed(4), c = 128 / 255; // lo zero della mappa è 128, non 127,5
  const row = `${n(-2 * kd * lx)} ${n(-2 * kd * ly)} ${n(kf)} 0 ${n(0.5 + 2 * kd * c * (lx + ly))}`;
  return `${row}  ${row}  ${row}  0 0 0 0 1`;
};
// quanto la luce moltiplica (ks) e quanto somma (ka): la composizione aritmetica k1·fondo·λ + k2·fondo + k3·λ + k4
export const lightMix = (dark: boolean) => {
  const ks = 0.24, ka = dark ? 0.7 : 0.6;
  return { k1: 2 * ks, k2: 1 - ks, k3: ka, k4: -ka / 2 };
};

// ---------------------------------------------------------------- le mappe di una lastra
// la mappa: lo spostamento (rosso e verde) e l'inclinazione (blu, che cresce verso il bordo: 1 − nz, ammorbidita). A
// mezza risoluzione al più (640 px di lato): è liscia, il filtro la riporta alla misura vera.
// Si calcola soltanto la fascia del bordo: dove la lastra è piana (più lontano dal bordo sia del raggio sia della curva)
// il punto vale sempre (128, 128, 0), e lì la mappa si riempie in un colpo. Stessi pixel, una frazione del lavoro.
export const surfaceData = (w: number, h: number, r: number, b: number, thick: number) => {
  const P = bevel(b, thick);
  const res = Math.min(0.5, 640 / Math.max(w, h));
  const W = Math.max(2, Math.round(w * res)), H = Math.max(2, Math.round(h * res));
  const D = new Uint8ClampedArray(W * H * 4);
  new Uint32Array(D.buffer).fill(new Uint32Array(new Uint8ClampedArray([128, 128, 0, 255]).buffer)[0]);
  const R2 = Math.max(r, b) + 1, cx = w / 2, cy = h / 2;
  const at = (x: number, y: number) => {
    const s = surfaceAt((x + 0.5) / res, (y + 0.5) / res, w, h, r, b, P), i = (y * W + x) * 4;
    D[i] = Math.round(128 + s.vx * 127); D[i + 1] = Math.round(128 + s.vy * 127);
    D[i + 2] = Math.round(Math.pow(1 - s.nz, 1.4) * 255);
  };
  for (let y = 0; y < H; y++) {
    const py = (y + 0.5) / res;
    if (Math.abs(py - cy) > cy - R2) { for (let x = 0; x < W; x++) at(x, y); continue; }
    for (let x = 0; x < W; x++) {
      if (Math.abs((x + 0.5) / res - cx) <= cx - R2) { // piano fino all'altra fascia: salta
        const xr = Math.ceil((cx + (cx - R2)) * res - 0.5); x = Math.max(x, Math.min(W - 1, xr) - 1); continue;
      }
      at(x, y);
    }
  }
  return { W, H, data: D, max: P.max };
};
// le mappe non dipendono dal tema: la stessa lastra chiara o scura usa la stessa immagine
const maps = new Map<string, { disp: string; max: number }>();
const surface = (w: number, h: number, r: number, b: number, thick: number) => {
  const key = `${w}x${h}r${r}b${b}`;
  const hit = maps.get(key); if (hit) return hit;
  const S = surfaceData(w, h, r, b, thick);
  // un canvas in memoria (willReadFrequently): con quello della GPU leggere l'immagine per l'href costringeva la pagina
  // ad aspettare la scheda video, qualche millisecondo per ogni lastra nuova
  const c = document.createElement("canvas"); c.width = S.W; c.height = S.H;
  const g = c.getContext("2d", { willReadFrequently: true }); if (!g) return null;
  g.putImageData(new ImageData(S.data, S.W, S.H), 0, 0);
  const out = { disp: c.toDataURL(), max: S.max };
  if (maps.size > MAX_FILTERS) maps.delete(maps.keys().next().value as string);
  maps.set(key, out);
  return out;
};

// ---------------------------------------------------------------- i filtri
let defs: SVGDefsElement | null = null, seq = 0, tick = 0;
const ensureDefs = () => {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "vetro-defs"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
  defs = document.createElementNS(NS, "defs") as SVGDefsElement;
  svg.appendChild(defs); document.body.appendChild(svg);
  return defs;
};

// la luce viene sempre dall'alto, da sinistra a destra entro un arco di 80° attorno a −115°
const AZ0 = (-115 * Math.PI) / 180, AZ_SPAN = (40 * Math.PI) / 180;
let az = AZ0 - AZ_SPAN * 0.25, azGoal = az;
const glasses = new Map<string, Glass>();
const DISPERSION = 0.07; // nei vetri piccoli il rosso si piega il 7% più del verde, il blu il 7% meno

const build = (w: number, h: number, r: number, kind: Kind, dark: boolean): Glass | null => {
  const { b, thick, frost } = shapeOf(kind, w, h);
  const S = surface(w, h, r, b, thick); if (!S) return null;
  const id = `lq${++seq}`, f = document.createElementNS(NS, "filter");
  f.setAttribute("id", id); f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", String(w)); f.setAttribute("height", String(h));
  f.setAttribute("filterUnits", "userSpaceOnUse"); f.setAttribute("primitiveUnits", "userSpaceOnUse"); f.setAttribute("color-interpolation-filters", "sRGB");
  const add = (tag: string, a: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag) as SVGElement; for (const k in a) n.setAttribute(k, String(a[k])); f.appendChild(n); return n;
  };
  const img = { x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none" };
  // 1. la smerigliatura, uguale su tutta la lastra (ai margini il fondo continua: edgeMode duplicate)
  add("feGaussianBlur", { in: "SourceGraphic", stdDeviation: frost, edgeMode: "duplicate", result: "fondo" });
  add("feImage", { ...img, href: S.disp, result: "piega" });
  // 2. la rifrazione (nei vetri piccoli un colore alla volta)
  const disp: SVGElement[] = [];
  if (kind === "btn" || kind === "small") {
    const iso = ["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"];
    [1 + DISPERSION, 1, 1 - DISPERSION].forEach((k, c) => {
      disp.push(add("feDisplacementMap", { in: "fondo", in2: "piega", scale: 0, "data-k": k, xChannelSelector: "R", yChannelSelector: "G", result: `d${c}` }));
      add("feColorMatrix", { in: `d${c}`, type: "matrix", values: iso[c], result: `c${c}` });
    });
    add("feComposite", { in: "c0", in2: "c1", operator: "arithmetic", k2: 1, k3: 1, result: "c01" });
    add("feComposite", { in: "c01", in2: "c2", operator: "arithmetic", k2: 1, k3: 1, result: "rifratto" });
  } else {
    disp.push(add("feDisplacementMap", { in: "fondo", in2: "piega", scale: 0, "data-k": 1, xChannelSelector: "R", yChannelSelector: "G", result: "rifratto" }));
  }
  // 3. la luce, ricavata dalla mappa e posata sul fondo piegato
  const light = add("feColorMatrix", { in: "piega", type: "matrix", values: lightRows(az, dark), result: "luce" });
  add("feComposite", { in: "rifratto", in2: "luce", operator: "arithmetic", ...lightMix(dark) });
  ensureDefs().appendChild(f);
  return { id, used: ++tick, scale: S.max, dark, disp, light, grow: -1 };
};

// la luce di una lastra per la direzione attuale
const paintGlass = (gl: Glass) => { gl.light.setAttribute("values", lightRows(az, gl.dark)); };

// la piega di una lastra, da 0 (appena nata) a 1 (formata)
const setForm = (g: Glass, k: number) => {
  g.disp.forEach((d) => d.setAttribute("scale", (g.scale * k * +(d.getAttribute("data-k") || 1)).toFixed(2)));
};

let moving = true, raf = 0, painted = 0;
// t in secondi: sale, supera appena la misura e si ferma, come una goccia che si posa
export const spring = (t: number) => (t >= 0.9 ? 1 : 1 - Math.exp(-6.5 * t) * Math.cos(7.5 * t));
const frame = () => {
  raf = 0;
  const now = performance.now();
  let busy = false;
  // la luce scivola verso la sua meta, lenta e rilassata (un ventesimo della strada ogni sessantesimo di secondo). Si
  // ridipinge al più 30 volte al secondo: ogni volta tutti i filtri si rifanno, e a quella lentezza l'occhio non vede
  // la differenza
  const dz = azGoal - az;
  if (Math.abs(dz) > 0.002) {
    busy = true;
    if (now - painted >= 32) { az += dz * (1 - Math.pow(0.95, (now - painted) / 16.7)); painted = now; glasses.forEach(paintGlass); }
  }
  glasses.forEach((g) => {
    if (g.grow <= 0) return;
    const t = (now - g.grow) / 1000;
    if (t >= 0.9) { g.grow = 0; setForm(g, 1); } else { setForm(g, spring(t)); busy = true; }
  });
  if (busy) raf = requestAnimationFrame(frame);
};
const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

const filterFor = (w: number, h: number, r: number, kind: Kind, dark: boolean) => {
  const key = `${w}x${h}r${r}${kind}${dark ? "d" : "c"}`;
  let g = glasses.get(key);
  if (!g) {
    const made = build(w, h, r, kind, dark); if (!made) return null;
    g = made; glasses.set(key, g);
    if (glasses.size > MAX_FILTERS) {
      const old = Array.from(glasses.entries()).filter(([k]) => k !== key).sort((a, b) => a[1].used - b[1].used).slice(0, glasses.size - MAX_FILTERS);
      for (const [k, o] of old) { document.getElementById(o.id)?.remove(); glasses.delete(k); }
    }
  }
  g.used = ++tick;
  return g;
};

const kindOf = (el: HTMLElement): Kind => {
  if (el.matches(BARS)) return "bar";
  if (el.classList.contains("bt")) return "btn";
  if (el.matches(WINDOWS)) return "win";
  return Math.min(el.offsetWidth, el.offsetHeight) < 90 ? "small" : "pane";
};

// ---------------------------------------------------------------- le lastre della pagina
const fit = (el: HTMLElement, dark: boolean, fresh: boolean) => {
  const cs = getComputedStyle(el);
  // vetro solo dove il CSS lo vuole; un pulsante solo se non sta su un'altra lastra (niente vetro sul vetro)
  let want = cs.getPropertyValue("--lq-want").trim() === "1";
  if (want && el.classList.contains("bt")) want = !el.parentElement?.closest(".pn");
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!want || w < 20 || h < 20 || w > 4000 || h > 6000) { el.style.removeProperty("--lq-f"); el.removeAttribute("data-lq"); return; }
  const r = Math.min(Math.round(parseFloat(cs.borderTopLeftRadius) || 0), Math.floor(Math.min(w, h) / 2));
  const g = filterFor(w, h, r, kindOf(el), dark);
  if (!g) return;
  if (fresh && moving) { if (g.grow <= 0) { g.grow = performance.now(); setForm(g, 0); wake(); } }
  else if (g.grow === -1) { g.grow = 0; setForm(g, 1); }
  el.style.setProperty("--lq-f", `url(#${g.id})`);
  el.setAttribute("data-lq", "");
};

// la luce: sul computer il puntatore (lontano, oltre lo schermo: la luce cambia direzione, non si avvicina), sul
// telefono l'inclinazione; sempre dall'alto. Le variabili CSS (--lq-x/--lq-y, per i bordi disegnati nel CSS) a passi
const follow = (root: HTMLElement) => {
  let sx = "", sy = "", last = 0;
  const css = () => {
    const q = (v: number) => (Math.round(v * 5) / 5).toFixed(1);
    const nx = q(Math.cos(azGoal) * 0.95), ny = q(Math.min(-0.25, Math.sin(azGoal) * 0.95));
    if (nx !== sx) { sx = nx; root.style.setProperty("--lq-x", nx); }
    if (ny !== sy) { sy = ny; root.style.setProperty("--lq-y", ny); }
  };
  // u fra −1 (luce da sinistra) e 1 (da destra)
  const aim = (u: number) => { azGoal = AZ0 + Math.max(-1, Math.min(1, u)) * AZ_SPAN; wake(); const now = performance.now(); if (now - last > 160) { last = now; css(); } };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    aim((e.clientX / window.innerWidth - 0.5) * 2);
  };
  const tilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null) return;
    aim(Math.max(-30, Math.min(30, e.gamma)) / 30);
  };
  css();
  window.addEventListener("pointermove", move, { passive: true });
  const phone = typeof window.matchMedia === "function" && window.matchMedia("(pointer:coarse)").matches;
  if (phone) window.addEventListener("deviceorientation", tilt, { passive: true });
  return () => {
    window.removeEventListener("pointermove", move); window.removeEventListener("deviceorientation", tilt);
    root.style.removeProperty("--lq-x"); root.style.removeProperty("--lq-y");
  };
};

// avvia il vetro liquido: lens false dove il browser non sa usare un filtro SVG nel backdrop-filter (resta il resto
// del vetro, disegnato nel CSS); motion false senza animazioni (niente luce che si muove, lastre già formate)
export function startLiquid(root: HTMLElement, { lens, motion, dark }: { lens: boolean; motion: boolean; dark: boolean }) {
  const stops: (() => void)[] = [];
  moving = motion;
  if (motion) stops.push(follow(root));
  if (lens && typeof ResizeObserver !== "undefined") {
    const seen = new Set<HTMLElement>();
    const ro = new ResizeObserver((es) => { for (const e of es) fit(e.target as HTMLElement, dark, false); });
    let pend = 0;
    const scan = () => {
      pend = 0;
      const now = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
        now.add(el);
        if (!seen.has(el)) { seen.add(el); ro.observe(el); fit(el, dark, true); }
      });
      seen.forEach((el) => { if (!now.has(el)) { ro.unobserve(el); seen.delete(el); el.removeAttribute("data-lq"); } });
    };
    // le lastre di una pagina nuova si trovano al fotogramma dopo il cambio, e si formano davanti agli occhi
    const mo = new MutationObserver(() => { if (!pend) pend = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    stops.push(() => {
      mo.disconnect(); ro.disconnect(); cancelAnimationFrame(pend);
      seen.forEach((el) => { el.style.removeProperty("--lq-f"); el.removeAttribute("data-lq"); }); seen.clear();
      glasses.forEach((g) => document.getElementById(g.id)?.remove()); glasses.clear();
    });
  }
  return () => { stops.forEach((s) => s()); cancelAnimationFrame(raf); raf = 0; };
}
