// I suoni d'ambiente della sala del podio coperto: giorno (modalità chiara) e notte (modalità scura).
// Uso: npm run audio:ambience -- <daytime-ambience.mp3> <nighttime-ambience.mp3>   (serve ffmpeg nel PATH)
//
// Originali (freesound community): giorno 47 s stereo a 24 kHz, -54 LUFS, quasi tutta l'energia sotto i 200 Hz (vento e
// traffico lontano, folate tra 8 e 15 s) e uccelli tra 3 e 4 kHz; notte 121 s mono a 44,1 kHz, -37 LUFS, grilli fissi
// attorno ai 5 kHz e un fruscio basso.
// Cosa fa (gli originali non vengono toccati):
//   - filtra il rombo sotto i 110-140 Hz (in una sala chiusa suonerebbe come traffico ovattato) e ammorbidisce la riga
//     acuta dei grilli; il giorno prende un filo di presenza sugli uccelli
//   - la notte diventa stereo: a sinistra e a destra due tratti lontani della stessa registrazione (decorrelati, ma con
//     lo stesso carattere: i grilli sembrano tutto attorno)
//   - un anello perfetto: la coda si dissolve nella testa (dissolvenza a potenza costante, 4-6 s)
//   - mezzo secondo di anello prima e dopo: l'mp3 aggiunge qualche millesimo di silenzio ai bordi e ogni browser lo toglie
//     a modo suo; con l'anello che continua da entrambe le parti qualsiasi finestra lunga quanto l'anello è un ciclo
//     esatto, e il punto di giunzione non fa mai click (src/ambience.ts suona tra PAD e PAD + LOOP)
//   - loudness: giorno -24 LUFS, notte -26 (la notte è più quieta); il mix finale è in src/sound.ts
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const SR = 44100, PAD = 0.5;
const [dayFile, nightFile] = process.argv.slice(2);
if (!dayFile || !nightFile) { console.error("Uso: npm run audio:ambience -- <giorno.mp3> <notte.mp3>"); process.exit(1); }
const out = path.join(__dirname, "../public/audio");

// decodifica con i filtri ffmpeg, in float a 44,1 kHz
const decode = (file, ch, af) => {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-af", af, "-ac", String(ch), "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 29 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
};
// canale c (interleaved, ch canali) dal secondo a per n campioni
const channel = (x, ch, c, a, n) => { const o = new Float32Array(n), s = Math.round(a * SR); for (let i = 0; i < n; i++) o[i] = x[(s + i) * ch + c]; return o; };
// anello di L campioni con dissolvenza X: la coda (che continua) sfuma nella testa del tratto
const loop = (x, L, X) => {
  const o = new Float32Array(L);
  for (let i = 0; i < L; i++) {
    const a = x[X + i];
    if (i < L - X) { o[i] = a; continue; }
    const t = (i - (L - X)) / X, b = x[i - (L - X)];
    o[i] = a * Math.cos((t * Math.PI) / 2) + b * Math.sin((t * Math.PI) / 2);
  }
  return o;
};
const padded = (o) => { const P = Math.round(PAD * SR), L = o.length, y = new Float32Array(L + 2 * P); for (let i = 0; i < y.length; i++) y[i] = o[(((i - P) % L) + L) % L]; return y; };
const interleave = (l, r) => { const y = new Float32Array(l.length * 2); for (let i = 0; i < l.length; i++) { y[2 * i] = l[i]; y[2 * i + 1] = r[i]; } return y; };
const wavF32 = (file, x, ch) => {
  const data = Buffer.from(x.buffer, x.byteOffset, x.byteLength), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20);
  h.writeUInt16LE(ch, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * ch * 4, 28); h.writeUInt16LE(ch * 4, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
};
// loudness integrata (EBU R128): ffmpeg la ristampa a ogni blocco; vale l'ultima, quella del riepilogo finale
const lufs = (file) => { const all = [...spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)]; return Number(all[all.length - 1][1]); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ambience-"));
const make = (name, l, r, target) => {
  const raw = path.join(tmp, `${name}.wav`);
  wavF32(raw, interleave(padded(l), padded(r)), 2);
  const gain = target - lufs(raw);
  // mp3 stereo a 112 kb/s: per un ambiente basta e il file resta sul megabyte
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=5:release=80:level=false`, "-c:a", "libmp3lame", "-b:a", "112k", "-map_metadata", "-1", path.join(out, `ambience-${name}.mp3`)]);
  const loopS = (l.length / SR).toFixed(6);
  console.log(`ambience-${name}.mp3: anello ${loopS} s, ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB → ${target} LUFS`);
  return loopS;
};

// giorno: via il rombo, un filo di presenza sugli uccelli; anello di 40 s dal secondo 1 con 4 s di dissolvenza
const day = decode(dayFile, 2, "highpass=f=110:poles=2,highpass=f=110:poles=2,lowshelf=f=220:g=-3,equalizer=f=3400:t=q:w=1.2:g=2.5");
const dL = 40 * SR, dX = 4 * SR;
const dayLoop = make("day", loop(channel(day, 2, 0, 1, dL + dX), dL, dX), loop(channel(day, 2, 1, 1, dL + dX), dL, dX), -24);
// notte: via il rombo, la riga dei grilli un poco più morbida; stereo da due tratti a 37 s di distanza; anello di 64 s
const night = decode(nightFile, 1, "highpass=f=140:poles=2,highpass=f=140:poles=2,equalizer=f=5000:t=q:w=2:g=-3.5,lowpass=f=12000");
const nL = 64 * SR, nX = 6 * SR;
const nightLoop = make("night", loop(channel(night, 1, 0, 4, nL + nX), nL, nX), loop(channel(night, 1, 0, 41, nL + nX), nL, nX), -26);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`In src/ambience.ts: PAD ${PAD}, LOOP giorno ${dayLoop}, notte ${nightLoop}`);
