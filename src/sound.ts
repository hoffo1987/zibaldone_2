// ===== IL SUONO DEL CIRCUITO =====
// Un solo mixer (Web Audio) per tutti i suoni del sito:
//   klick    passi sopra qualcosa di interattivo (col mouse); su telefono, dove il "sopra" non esiste, al tocco
//   enter    cambi sezione andando avanti nel menu: i due click salgono (2,1 → 3,0 kHz)
//   back     torni a una sezione precedente: gli stessi click, in discesa
//   loading  il passaggio dal sito al gioco segreto
//   intro    il jingle della presentazione al primo accesso
// I file in public/audio sono già portati a un riferimento comune da scripts/build-audio.cjs (picco a -1 dBFS,
// jingle a -16 LUFS): qui si decide quanto suona ciascuno rispetto agli altri. Il tick al passaggio è il più basso
// perché si sente di continuo e deve solo sfiorare; il cambio di sezione sta un gradino sopra; caricamento e jingle
// sono momenti, possono stare davanti. In fondo alla catena un limitatore evita che più suoni insieme saturino.
// La musica di sottofondo (useMusic) non passa da qui: quando parla un suono lungo si abbassa (duck) e poi risale.

export type Cue = "klick" | "enter" | "back" | "loading" | "intro";
const FILE: Record<Cue, string> = { klick: "klick.wav", enter: "nav-enter.wav", back: "nav-back.wav", loading: "loading.mp3", intro: "intro.mp3" };
export const MIX: Record<Cue, number> = { klick: -16, enter: -9, back: -10, loading: -5, intro: -3 };
// quanto scende la musica di sottofondo mentre suonano i momenti lunghi (1 = niente)
export const DUCK = { intro: 0.12, egg: 0.3 };

// at: istante (orologio audio) in cui parte; off: da che punto del file parte
export type Voice = { at: number; off: number; stop: (fade?: number) => void };
// force: suona anche con gli effetti spenti (solo per un gesto esplicito, come il pulsante audio della presentazione)
export type PlayOpts = { rate?: number; db?: number; when?: number; offset?: number; force?: boolean };

const cfg = { on: true, vol: 1 };
let ctx: AudioContext | null = null, out: GainNode | null = null, lim: DynamicsCompressorNode | null = null;
const bytes: Partial<Record<Cue, Promise<ArrayBuffer | null>>> = {};
const decoded: Partial<Record<Cue, Promise<AudioBuffer | null>>> = {};
const ready: Partial<Record<Cue, AudioBuffer>> = {};

const dbGain = (db: number) => Math.pow(10, db / 20);
// il cursore del volume lavora al quadrato: a metà corsa il suono è già nettamente più basso, come ci si aspetta
const level = () => (cfg.on ? cfg.vol * cfg.vol : 0);
const Ctor = (): any => typeof window !== "undefined" ? (window as any).AudioContext || (window as any).webkitAudioContext : null;

function context(create: boolean): AudioContext | null {
  if (ctx || !create) return ctx;
  const C = Ctor(); if (!C) return null;
  try { ctx = new C({ latencyHint: "interactive" }); } catch { try { ctx = new C(); } catch { return null; } }
  const c = ctx!;
  const l = (lim = c.createDynamicsCompressor());
  l.threshold.value = -2; l.knee.value = 0; l.ratio.value = 20; l.attack.value = 0.002; l.release.value = 0.12;
  out = c.createGain(); out.gain.value = level();
  out.connect(l); l.connect(c.destination);
  (Object.keys(bytes) as Cue[]).forEach((k) => { load(k); }); // decodifica ciò che era già stato scaricato
  return c;
}

export function configure(on: boolean, vol: number) {
  cfg.on = on; cfg.vol = Math.max(0, Math.min(1, vol));
  if (ctx && out) out.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
}
export const enabled = () => cfg.on && cfg.vol > 0;

// Da chiamare dentro un gesto dell'utente (tocco, clic, tasto): crea o riattiva il contesto audio.
// Su iPhone serve anche far partire un suono nello stesso gesto: un campione di silenzio basta.
export function unlock() {
  const c = context(true); if (!c) return;
  if (c.state !== "running") { try { c.resume().catch(() => {}); } catch {} }
  try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch {}
}
export const running = () => !!ctx && ctx.state === "running";
// per chi ha una catena sua (l'ambiente del podio): il contesto e l'ingresso del limitatore, a valle del volume degli
// effetti (l'ambiente ha un volume suo e non si spegne con gli effetti sonori)
export function mixer(): { c: AudioContext; dest: AudioNode } | null { const c = context(true); return c && lim ? { c, dest: lim } : null; }
export const decodeBytes = (c: AudioContext, data: ArrayBuffer) => decode(c, data);
export const now = () => (ctx ? ctx.currentTime : 0);

// scarica subito i byte (anche prima che esista il contesto); la decodifica avviene appena il contesto c'è
export function preload(...cues: Cue[]) {
  cues.forEach((k) => {
    if (bytes[k]) return;
    bytes[k] = fetch(`${process.env.PUBLIC_URL || ""}/audio/${FILE[k]}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    if (ctx) load(k);
  });
}
const decode = (c: AudioContext, data: ArrayBuffer) => new Promise<AudioBuffer>((res, rej) => {
  // Safari vecchi conoscono solo la forma con le callback
  const p: any = c.decodeAudioData(data, res, rej); if (p && typeof p.then === "function") p.then(res, rej);
});
export function load(k: Cue): Promise<AudioBuffer | null> {
  preload(k);
  const c = ctx; if (!c) return Promise.resolve(null);
  return decoded[k] || (decoded[k] = bytes[k]!.then((d) => (d ? decode(c, d) : null)).then((b) => { if (b) ready[k] = b; return b; }).catch(() => null));
}
export const buffer = (k: Cue) => ready[k] || null;

export function play(k: Cue, o: PlayOpts = {}): Voice | null {
  const c = ctx, b = ready[k], bus = cfg.on ? out : o.force ? lim : null;
  if (!c || !bus || c.state !== "running") return null;
  if (!b) { load(k); return null; }
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = b; src.playbackRate.value = o.rate || 1;
  g.gain.value = dbGain(MIX[k] + (o.db || 0));
  src.connect(g); g.connect(bus);
  const at = Math.max(c.currentTime, o.when || 0), off = Math.max(0, Math.min(b.duration - 0.01, o.offset || 0));
  src.start(at, off);
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch {} };
  return {
    at, off,
    stop(fade = 0.08) {
      try { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.02); } catch {}
    },
  };
}

// --- ducking della musica di sottofondo: ogni momento chiede un livello, vale il più basso ---
const ducks = new Map<string, number>();
const duckSubs = new Set<(k: number) => void>();
export const duckLevel = () => { let k = 1; ducks.forEach((v) => { k = Math.min(k, v); }); return k; };
export function duck(key: string, k: number | null) {
  if (k == null) ducks.delete(key); else ducks.set(key, Math.max(0, Math.min(1, k)));
  const v = duckLevel(); duckSubs.forEach((f) => f(v));
}
export const onDuck = (f: (k: number) => void) => { duckSubs.add(f); return () => { duckSubs.delete(f); }; };

// --- installazione: sblocco al primo gesto, pausa quando la scheda è nascosta ---
let installed = false;
export function installSound() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  // pointerdown col dito non conta come gesto per i browser: per questo anche pointerup, touchend e click
  ["pointerdown", "pointerup", "touchend", "click", "keydown"].forEach((t) => document.addEventListener(t, () => { if (!running()) unlock(); }, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    try { if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); } catch {}
  });
}

// --- suoni dell'interfaccia: tick al passaggio, al tocco e con la tastiera ---
const HOT = "button,a[href],[role=button],[role=switch],[role=tab],select,summary,label.bt,input[type=range],input[type=checkbox],input[type=radio],.card,.stat";
const hot = (t: EventTarget | null): Element | null => {
  const el = t && (t as Element).closest ? (t as Element).closest(HOT) : null;
  if (!el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || el.closest('[data-snd="off"],.eg')) return null;
  return el;
};
export function bindUiSounds() {
  let last: Element | null = null, lastAt = 0, keys = false;
  // mai due tick a meno di 40 ms: scorrendo veloce su una lista non diventa una raffica
  const tick = (o: PlayOpts) => { const t = performance.now(); if (t - lastAt < 40) return; lastAt = t; play("klick", o); };
  // leggere variazioni di intonazione e livello: lo stesso suono ripetuto non sembra una macchina
  const over = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = hot(e.target); if (el === last) return;
    last = el; if (el) tick({ rate: 0.97 + Math.random() * 0.06, db: -Math.random() * 1.5 });
  };
  const leave = (e: PointerEvent) => { if (e.pointerType === "mouse" && !e.relatedTarget) last = null; };
  // pressione: col mouse un tick più grave e più basso sotto quello del passaggio; col dito il tick è l'unico riscontro.
  // Le voci del menu non lo fanno: lì parla il suono del cambio di sezione.
  const down = (e: PointerEvent) => {
    keys = false;
    const el = hot(e.target); if (!el || el.closest('[data-snd="nav"]')) return;
    if (e.pointerType === "mouse") play("klick", { rate: 0.82, db: -2 }); else tick({ rate: 1 });
  };
  const key = (e: KeyboardEvent) => { if (e.key === "Tab") keys = true; };
  const focus = (e: FocusEvent) => { if (keys && hot(e.target)) tick({ rate: 1.04 }); };
  document.addEventListener("pointerover", over, { passive: true });
  document.addEventListener("pointerout", leave, { passive: true });
  document.addEventListener("pointerdown", down, { passive: true });
  document.addEventListener("keydown", key, true);
  document.addEventListener("focusin", focus);
  preload("klick", "enter", "back");
  return () => {
    document.removeEventListener("pointerover", over); document.removeEventListener("pointerout", leave); document.removeEventListener("pointerdown", down);
    document.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus);
  };
}
