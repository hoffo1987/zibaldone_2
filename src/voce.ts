// ===== ASCOLTA: lo scritto letto ad alta voce =====
// La voce è quella del sistema (Web Speech API), in italiano. Si legge una frase alla volta: un'enunciazione per
// frase si ferma, salta e cambia velocità in modo affidabile ovunque (Chrome per Android non sa mettere in pausa, e le
// enunciazioni lunghe si interrompono da sole dopo una quindicina di secondi).
// Le cuffie: perché i tasti delle cuffie e il riquadro multimediale del telefono arrivino alla pagina, il sistema deve
// vederla «in riproduzione». Mentre la voce parla suona quindi un audio muto in loop, e la Media Session porta titolo e
// comandi (riproduci, pausa, frase precedente e successiva). La musica di sottofondo si abbassa finché la voce parla.
import * as sound from "./sound";

export const voceDisponibile = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof (window as any).SpeechSynthesisUtterance === "function";

// --- le frasi ---
// Intl.Segmenter dove c'è; altrimenti punto, punto esclamativo, interrogativo e puntini seguiti da spazio. Le frasi
// lunghe si spezzano alle virgole e ai punti e virgola, così la voce riparte in fretta e l'evidenziazione non resta
// ferma su mezza pagina.
export type Frase = { a: number; b: number; testo: string };
const LUNGA = 220;
export const frasiDi = (t: string): Frase[] => {
  const out: Frase[] = [];
  const push = (a: number, b: number) => {
    while (a < b && /\s/.test(t[a])) a++;
    while (b > a && /\s/.test(t[b - 1])) b--;
    if (b - a < 1 || !/[\p{L}\p{N}]/u.test(t.slice(a, b))) return;
    if (b - a <= LUNGA) { out.push({ a, b, testo: t.slice(a, b) }); return; }
    // spezzata dopo l'ultima virgola o punto e virgola prima del limite (o all'ultimo spazio)
    const part = t.slice(a, a + LUNGA), cut = Math.max(part.lastIndexOf(", "), part.lastIndexOf("; "), part.lastIndexOf(": "));
    const at = cut > 60 ? a + cut + 1 : a + Math.max(60, part.lastIndexOf(" "));
    push(a, at); push(at, b);
  };
  const Seg = (Intl as any).Segmenter;
  if (Seg) {
    for (const s of new Seg("it", { granularity: "sentence" }).segment(t)) push(s.index, s.index + s.segment.length);
  } else {
    const re = /[^.!?…]+(?:[.!?…]+["»”’)]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) && m[0]) push(m.index, m.index + m[0].length);
  }
  return out;
};

// --- le voci italiane, dalla più naturale ---
const BUONE = /natural|neural|online|premium|enhanced|google|siri|alice|federica|elsa|isabella|diego|luca|paola/i;
export const vociItaliane = () => {
  if (!voceDisponibile()) return [] as SpeechSynthesisVoice[];
  return speechSynthesis.getVoices().filter((v) => /^it([-_]|$)/i.test(v.lang))
    .sort((x, y) => Number(BUONE.test(y.name)) - Number(BUONE.test(x.name)) || Number(y.localService === false) - Number(x.localService === false) || x.name.localeCompare(y.name));
};
// le voci arrivano dopo il caricamento (Chrome): si aspetta voiceschanged, al massimo un secondo e mezzo
export const attendiVoci = () => new Promise<SpeechSynthesisVoice[]>((res) => {
  if (!voceDisponibile()) return res([]);
  const now = vociItaliane();
  if (now.length || speechSynthesis.getVoices().length) return res(now);
  const done = () => { clearTimeout(t); speechSynthesis.removeEventListener("voiceschanged", done); res(vociItaliane()); };
  const t = setTimeout(done, 1500);
  speechSynthesis.addEventListener("voiceschanged", done);
});

// --- l'audio muto per le cuffie: un secondo di silenzio in WAV, in loop ---
let muto: HTMLAudioElement | null = null;
const silenzio = () => {
  if (muto) return muto;
  const n = 8000, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  muto = new Audio(URL.createObjectURL(new Blob([b], { type: "audio/wav" })));
  muto.loop = true; muto.volume = 0.01;
  return muto;
};

export type Stato = { i: number; playing: boolean; parola: [number, number] | null };
type Opz = { titolo: string; album: string; frasi: Frase[]; onStato: (s: Stato) => void };

// Il lettore: parla dalla frase i in poi; pausa = fermarsi alla frase corrente (e ripartire da lì)
export class Lettore {
  private i = 0; private playing = false; private tok = 0;
  private rate = 1; private voce: SpeechSynthesisVoice | null = null;
  constructor(private o: Opz) {}
  get stato(): Stato { return { i: this.i, playing: this.playing, parola: null }; }
  setRate(r: number) { this.rate = r; if (this.playing) this.parla(this.i); }
  setVoce(v: SpeechSynthesisVoice | null) { this.voce = v; if (this.playing) this.parla(this.i); }
  play(from = this.i) {
    if (!this.o.frasi.length) return;
    this.playing = true; this.i = Math.max(0, Math.min(this.o.frasi.length - 1, from));
    this.sessione(true); this.parla(this.i);
  }
  pause() { this.playing = false; this.tok++; speechSynthesis.cancel(); this.sessione(false); this.emit(); }
  toggle() { if (this.playing) this.pause(); else this.play(this.i); }
  vai(i: number) { this.i = Math.max(0, Math.min(this.o.frasi.length - 1, i)); if (this.playing) this.parla(this.i); else this.emit(); }
  stop() { this.playing = false; this.tok++; try { speechSynthesis.cancel(); } catch {} this.sessione(false, true); }

  private emit(parola: [number, number] | null = null) { this.o.onStato({ i: this.i, playing: this.playing, parola }); }
  private parla(i: number) {
    const tok = ++this.tok, f = this.o.frasi[i];
    speechSynthesis.cancel();
    this.i = i; this.emit();
    const u = new SpeechSynthesisUtterance(f.testo);
    u.lang = this.voce?.lang || "it-IT"; if (this.voce) u.voice = this.voce;
    u.rate = this.rate; u.pitch = 1;
    // le parole, dove la voce le annuncia (le voci locali; quelle in rete di Chrome no)
    u.onboundary = (e: SpeechSynthesisEvent) => {
      if (tok !== this.tok || e.name !== "word") return;
      const rest = f.testo.slice(e.charIndex), m = /^[\p{L}\p{N}'’-]+/u.exec(rest);
      this.emit(m ? [f.a + e.charIndex, f.a + e.charIndex + m[0].length] : null);
    };
    u.onend = () => {
      if (tok !== this.tok) return;
      if (this.i < this.o.frasi.length - 1) this.parla(this.i + 1);
      else { this.playing = false; this.i = 0; this.sessione(false); this.emit(); }
    };
    u.onerror = (e: any) => { if (tok !== this.tok || e?.error === "interrupted" || e?.error === "canceled") return; this.pause(); };
    // Chrome a volte resta in pausa da una sessione precedente
    try { speechSynthesis.resume(); } catch {}
    speechSynthesis.speak(u);
  }
  // la sessione multimediale: titolo, comandi e l'audio muto che tiene la pagina «in riproduzione»
  private sessione(on: boolean, fine = false) {
    const ms: any = (navigator as any).mediaSession;
    sound.duck("voce", on ? 0.18 : null);
    const a = silenzio();
    if (on) a.play().catch(() => {}); else a.pause();
    if (!ms) return;
    if (fine) {
      ["play", "pause", "stop", "previoustrack", "nexttrack", "seekbackward", "seekforward"].forEach((k) => { try { ms.setActionHandler(k, null); } catch {} });
      ms.playbackState = "none"; ms.metadata = null; return;
    }
    try { ms.metadata = new (window as any).MediaMetadata({ title: this.o.titolo, artist: "Il Circuito", album: this.o.album, artwork: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }] }); } catch {}
    const set = (k: string, f: () => void) => { try { ms.setActionHandler(k, f); } catch {} };
    set("play", () => this.play()); set("pause", () => this.pause()); set("stop", () => this.pause());
    set("previoustrack", () => this.vai(this.i - 1)); set("nexttrack", () => this.vai(this.i + 1));
    set("seekbackward", () => this.vai(this.i - 1)); set("seekforward", () => this.vai(this.i + 1));
    ms.playbackState = on ? "playing" : "paused";
  }
}
