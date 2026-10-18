// ===== L'AMBIENTE DELLA SALA DEL PODIO COPERTO =====
// Di giorno (modalità chiara) il cortile oltre il finestrone: aria, vento leggero, uccelli; di notte (scura) i grilli.
// I file (scripts/build-ambience.cjs) sono anelli esatti di LOOP secondi con PAD secondi di anello prima e dopo: si suona
// tra PAD e PAD + LOOP, così il punto di giunzione non si sente mai.
// Sullo stesso mixer degli altri suoni (limitatore in fondo), ma con un volume suo:
//   - giorno e notte suonano insieme e si scambiano con una dissolvenza a potenza costante, con i tempi della luce
//     della scena (cambiando tema la sala si scurisce e i grilli salgono insieme)
//   - la stanza gira (trascinamento): il suono si sposta appena tra sinistra e destra
//   - una finestra aperta sopra la sala (Opzioni, un testo da leggere): il suono si ovatta, come da dietro una porta
//   - ogni visita parte da un punto diverso dell'anello; entrando sale in 2-3 secondi, uscendo si spegne in 1 secondo
//   - la musica di sottofondo, se accesa, si abbassa finché si è nella sala
import * as sound from "./sound";

type Part = "day" | "night";
const FILE: Record<Part, string> = { day: "ambience-day.mp3", night: "ambience-night.mp3" };
const LOOP: Record<Part, number> = { day: 40, night: 64 }, PAD = 0.5;
// i file sono a -24 (giorno) e -26 LUFS (notte): qui scendono ancora, l'ambiente è un letto e non deve mai stare davanti
const MIX_DB = -9;
const DUCK_MUSIC = 0.3;

let vol = 0.7;
let want = false, night = 0, muffled = false, building = false;
let chain: { c: AudioContext; master: GainNode; pan: StereoPannerNode | null; lp: BiquadFilterNode; gains: Record<Part, GainNode>; srcs: AudioBufferSourceNode[] } | null = null;
const bytes: Partial<Record<Part, Promise<ArrayBuffer | null>>> = {};
const buffers = new WeakMap<AudioContext, Partial<Record<Part, Promise<AudioBuffer | null>>>>();

const level = () => (vol * vol) * Math.pow(10, MIX_DB / 20);
const fetchPart = (k: Part) => bytes[k] || (bytes[k] = fetch(`${process.env.PUBLIC_URL || ""}/audio/${FILE[k]}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
function bufferOf(c: AudioContext, k: Part) {
  let m = buffers.get(c); if (!m) { m = {}; buffers.set(c, m); }
  // decodeAudioData consuma i byte: se ne decodifica una copia, così un nuovo contesto può rifarlo
  return m[k] || (m[k] = fetchPart(k).then((d) => (d ? sound.decodeBytes(c, d.slice(0)) : null)).catch(() => null));
}
const mixFor = (n: number) => ({ day: Math.cos((n * Math.PI) / 2), night: Math.sin((n * Math.PI) / 2) });

// scarica i due file in anticipo (si chiama entrando nella pagina: la decodifica arriva col primo gesto)
export function preloadAmbience() { fetchPart("day"); fetchPart("night"); }

async function build() {
  const m = sound.mixer(); if (!m || chain || building) return;
  const { c, dest } = m;
  // il contesto nasce sospeso finché non c'è un gesto: si riprova appena parte
  if (c.state !== "running") { const retry = () => { if (c.state === "running") { c.removeEventListener("statechange", retry); if (want && !chain) build(); } }; c.addEventListener("statechange", retry); return; }
  building = true;
  const [day, nightBuf] = await Promise.all([bufferOf(c, "day"), bufferOf(c, "night")]).finally(() => { building = false; });
  if (!want || chain || (!day && !nightBuf)) return;
  const master = c.createGain(); master.gain.value = 0;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = muffled ? 900 : 18000; lp.Q.value = 0.5;
  const pan = typeof c.createStereoPanner === "function" ? c.createStereoPanner() : null;
  master.connect(lp); (pan ? (lp.connect(pan), pan) : lp).connect(dest);
  const mix = mixFor(night), gains = { day: c.createGain(), night: c.createGain() } as Record<Part, GainNode>, srcs: AudioBufferSourceNode[] = [];
  ([["day", day], ["night", nightBuf]] as [Part, AudioBuffer | null][]).forEach(([k, b]) => {
    gains[k].gain.value = mix[k]; gains[k].connect(master);
    if (!b) return;
    const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = PAD; s.loopEnd = PAD + LOOP[k];
    s.connect(gains[k]); s.start(c.currentTime + 0.05, PAD + Math.random() * LOOP[k]); srcs.push(s);
  });
  chain = { c, master, pan, lp, gains, srcs };
  // ingresso morbido: sale in 2-3 secondi
  master.gain.setTargetAtTime(level(), c.currentTime + 0.05, 0.8);
}

// entra nella sala (n: 0 giorno … 1 notte)
export function startAmbience(n: number) {
  night = n; want = true;
  sound.duck("podio", DUCK_MUSIC);
  build();
}
export function stopAmbience() {
  want = false; sound.duck("podio", null);
  const ch = chain; chain = null; if (!ch) return;
  const t = ch.c.currentTime;
  ch.master.gain.cancelScheduledValues(t); ch.master.gain.setTargetAtTime(0, t, 0.3);
  ch.srcs.forEach((s) => { try { s.stop(t + 1.6); } catch {} });
  setTimeout(() => { try { ch.master.disconnect(); ch.lp.disconnect(); ch.pan?.disconnect(); } catch {} }, 1800);
}
// cambio di tema: lo stesso passo della luce della scena (che segue a circa 2 secondi)
export function setAmbienceNight(n: number) {
  night = n; const ch = chain; if (!ch) return;
  const m = mixFor(n), t = ch.c.currentTime;
  (["day", "night"] as Part[]).forEach((k) => ch.gains[k].gain.setTargetAtTime(m[k], t, 0.6));
}
// -1 sinistra … 1 destra (la camera che gira attorno al podio)
let lastPan = 0;
export function setAmbiencePan(p: number) {
  const ch = chain; if (!ch?.pan) return;
  const v = Math.max(-0.6, Math.min(0.6, p));
  if (Math.abs(v - lastPan) < 0.01) return; lastPan = v;
  ch.pan.pan.setTargetAtTime(v, ch.c.currentTime, 0.25);
}
// una finestra sopra la sala: il suono passa da dietro una porta
export function setAmbienceMuffle(on: boolean) {
  muffled = on; const ch = chain; if (!ch) return;
  const t = ch.c.currentTime;
  ch.lp.frequency.setTargetAtTime(on ? 900 : 18000, t, on ? 0.15 : 0.35);
  ch.master.gain.setTargetAtTime(level() * (on ? 0.6 : 1), t, 0.3);
}
// volume dalle Opzioni (0 … 1, al quadrato come gli altri cursori)
export function setAmbienceVolume(v: number) {
  vol = Math.max(0, Math.min(1, v)); const ch = chain; if (!ch) return;
  ch.master.gain.setTargetAtTime(level() * (muffled ? 0.6 : 1), ch.c.currentTime, 0.1);
}
// solo in sviluppo: lo stato dell'ambiente, per le prove automatiche
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as any).__ambience = () => ({ want, playing: !!chain, sources: chain?.srcs.length || 0, gain: chain?.master.gain.value, day: chain?.gains.day.gain.value, night: chain?.gains.night.gain.value, muffle: chain?.lp.frequency.value });
