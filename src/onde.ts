// ===== IL SEGNALE DELLE SCINTILLE =====
// Ogni emozione di una scintilla è una forma d'onda, come un canale dell'oscilloscopio:
//   riconosco   risonanza  un seno calmo: la frase vibra alla stessa frequenza di chi legge
//   bellissima  fioritura  un seno che si gonfia e si stringe, a fusi
//   ridere      rimbalzo   archi che saltano e toccano terra, come una palla (un seno raddrizzato)
//   commosso    tremito    un fremito rapido che arriva di colpo e si spegne piano
// Sul foglio la frase accesa porta la traccia sotto le parole (scintilleGpu.ts, o in SVG senza WebGPU); in «Le tue
// scintille» lo schermo mostra i quattro canali. Tutte le onde si ripetono identiche ogni FRAME pixel: scorrendo di un
// FRAME l'onda torna su sé stessa, così l'animazione che la fa correre non ha salti. Lo shader ha le stesse funzioni (WGSL).
import type { Tipo } from "./scintille";

export const FRAME = 96;
const TAU = Math.PI * 2;
export const CODICE: Record<Tipo, number> = { riconosco: 0, bellissima: 1, ridere: 2, commosso: 3 };
export const NOME: Record<Tipo, string> = { riconosco: "risonanza", bellissima: "fioritura", ridere: "rimbalzo", commosso: "tremito" };
// l'altezza dell'onda in x (pixel), tra -1 e 1, verso l'alto
export const onda = (tipo: Tipo, x: number): number => {
  switch (tipo) {
    case "riconosco": return Math.sin((TAU * x) / 24);
    case "bellissima": { const e = Math.sin((Math.PI * x) / 48); return Math.sin((TAU * x) / 16) * (0.22 + 0.78 * e * e); }
    case "ridere": return 2 * Math.abs(Math.sin((Math.PI * x) / 12)) - 1;
    default: { const f = ((x % 48) + 48) % 48 / 48; return Math.sin((TAU * x) / 6) * Math.exp(-2.4 * f) * Math.min(1, f * 14); }
  }
};
// i colori dei canali sul foglio (la carta è chiara anche nel tema scuro): inchiostri pieni, non pastelli
export const INCHIOSTRO: Record<Tipo, [number, number, number]> = {
  riconosco: [11, 127, 112], bellissima: [214, 140, 0], ridere: [180, 101, 42], commosso: [184, 71, 107],
};
// il seme di una frase (stabile: la stessa frase ha sempre la stessa traccia) e la fase del suo canale c, come nello shader
export const seme = (k: string) => { let h = 2166136261; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
export const faseCanale = (seed: number, c: number) => { const x = seed * (c * 7 + 3) * 1.618; return (x - Math.floor(x)) * FRAME; };
// i canali di una frase: uno per emozione, con quante persone l'hanno scelta; prima il più scelto
export type Canale = { tipo: Tipo; n: number };
export const canaliDi = (tipi: Tipo[]): Canale[] => {
  const m = new Map<Tipo, number>();
  tipi.forEach((t) => m.set(t, (m.get(t) || 0) + 1));
  return Array.from(m.entries()).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n || CODICE[a.tipo] - CODICE[b.tipo]);
};

// Il percorso SVG di un'onda: da x0 a x0 + w, centrata su y, ampiezza a pixel. Le estremità si posano sullo zero (taper
// pixel all'inizio e alla fine), così la traccia nasce e muore sulla linea, senza tagli.
export const percorso = (tipo: Tipo, w: number, y: number, a: number, ph = 0, taper = 10, x0 = 0, passo = tipo === "ridere" || tipo === "commosso" ? 0.75 : 1.25) => {
  const n = Math.max(2, Math.ceil(w / passo));
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n, t = taper > 0 ? Math.min(1, x / taper, (w - x) / taper) : 1, e = t * t * (3 - 2 * t);
    d += `${i ? "L" : "M"}${(x0 + x).toFixed(2)} ${(y - a * e * onda(tipo, x + ph)).toFixed(2)}`;
  }
  return d;
};

// Un pezzo della traccia di una frase che va a capo: la riga comincia a s0 lungo la frase (lunga tot), così l'onda
// continua da una riga all'altra e si posa sullo zero solo all'inizio e alla fine della frase intera.
export const tratto = (tipo: Tipo, s0: number, w: number, tot: number, y: number, a: number, ph = 0, taper = 10) => {
  const passo = tipo === "ridere" || tipo === "commosso" ? 0.75 : 1.25, n = Math.max(2, Math.ceil(w / passo));
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n, s = s0 + x, t = Math.max(0, Math.min(1, s / taper, (tot - s) / taper)), e = t * t * (3 - 2 * t);
    d += `${i ? "L" : "M"}${x.toFixed(2)} ${(y - a * e * onda(tipo, s + ph)).toFixed(2)}`;
  }
  return d;
};
