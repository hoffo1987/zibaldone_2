// Sound design: prepara i suoni originali per il web e li mette in public/audio.
// Uso: npm run audio:build -- <cartella con i file originali>   (serve ffmpeg nel PATH)
// Originali: "Klick.wav", "Enter & Back.wav", "Loading.wav" e il jingle di benvenuto (l'mp3 "Suono Per Un Sito Web…").
//
// Cosa fa (i file originali non vengono mai modificati):
//   klick.wav       tick al passaggio: picco a -1 dBFS, 1 ms di dissolvenza finale, mono 16 bit
//   nav-enter.wav   i due click di "Enter & Back" nell'ordine originale (2,1 kHz → 3,0 kHz: sale, si entra)
//   nav-back.wav    gli stessi due click scambiati (3,0 kHz → 2,1 kHz: scende, si torna indietro), stesso intervallo
//   loading.mp3     silenzio iniziale tolto, picco a -1 dBFS (l'originale è molto basso: -18 dBFS)
//   intro.mp3       copertina e metadati tolti, loudness normalizzata a -16 LUFS con true peak -1,5 dB
// I livelli di ascolto tra un suono e l'altro (il mix) sono in src/sound.ts: qui si porta solo ogni file a un riferimento comune.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const SR = 48000;
const src = process.argv[2];
if (!src) { console.error("Uso: npm run audio:build -- <cartella con i file originali>"); process.exit(1); }
const out = path.join(__dirname, "../public/audio");
const find = (re) => {
  const f = fs.readdirSync(src).find((n) => re.test(n));
  if (!f) throw new Error(`File non trovato in ${src}: ${re}`);
  return path.join(src, f);
};

const decode = (file, ch) => {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-ac", String(ch), "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
};
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const db = (v) => 20 * Math.log10(v || 1e-12);
const gain = (x, k) => x.map((v) => v * k);
// primo campione (frame) sopra la soglia relativa al picco
const onset = (x, ch, relDb, from = 0) => {
  const th = peak(x) * Math.pow(10, relDb / 20);
  for (let i = from * ch; i < x.length; i++) if (Math.abs(x[i]) > th) return Math.floor(i / ch);
  return 0;
};
const frames = (x, ch, a, b) => x.slice(a * ch, b * ch);
const join = (...parts) => { const o = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let k = 0; parts.forEach((p) => { o.set(p, k); k += p.length; }); return o; };
const fadeOut = (x, ch, n) => { const len = x.length / ch; for (let i = 0; i < n; i++) { const k = 0.5 - 0.5 * Math.cos((Math.PI * i) / n); for (let c = 0; c < ch; c++) x[(len - 1 - i) * ch + c] *= k; } return x; };
const wav = (file, x, ch, bits = 16) => {
  const bytes = bits / 8, data = Buffer.alloc(x.length * bytes);
  if (bits === 16) x.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  else x.forEach((v, i) => data.writeFloatLE(v, i * 4));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(bits === 16 ? 1 : 3, 20); h.writeUInt16LE(ch, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * ch * bytes, 28); h.writeUInt16LE(ch * bytes, 32); h.writeUInt16LE(bits, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
};
const ms = (n) => `${((n / SR) * 1000).toFixed(1)} ms`;
fs.mkdirSync(out, { recursive: true });

// --- klick: è già un transiente di 6,6 ms che parte dal primo campione ---
{
  const x = decode(find(/^klick\.wav$/i), 1);
  const y = fadeOut(gain(x, Math.pow(10, -1 / 20) / peak(x)), 1, 48);
  wav(path.join(out, "klick.wav"), y, 1);
  console.log(`klick.wav       ${ms(y.length)} · picco originale ${db(peak(x)).toFixed(1)} dBFS → -1 dBFS`);
}

// --- Enter & Back: due click a ~42 ms di distanza ---
{
  const ch = 2, x = decode(find(/^enter.*back\.wav$/i), ch), len = x.length / ch;
  const a = Math.max(0, onset(x, ch, -50) - 24); // 0,5 ms prima del primo click
  const b = Math.max(a + 1, onset(x, ch, -12, onset(x, ch, -50) + Math.round(0.02 * SR)) - 24); // secondo click
  const k = Math.pow(10, -1 / 20) / peak(x);
  const A = frames(x, ch, a, b), B = frames(x, ch, b, len), gap = new Float32Array(Math.max(0, (b - a) - (len - b)) * ch);
  wav(path.join(out, "nav-enter.wav"), fadeOut(gain(join(A, B), k), ch, 48), ch);
  wav(path.join(out, "nav-back.wav"), fadeOut(gain(join(B, gap, A), k), ch, 48), ch);
  console.log(`nav-enter.wav   ${ms(len - a)} · primo click a ${ms(a)} tolto il silenzio · secondo a +${ms(b - a)}`);
  console.log(`nav-back.wav    stessi click in ordine inverso, stesso intervallo`);
}

// --- Loading: ping, quattro cicli da 1 s, ping finale ---
{
  const ch = 2, file = find(/^loading\.wav$/i), x = decode(file, ch);
  const a = Math.max(0, onset(x, ch, -50) - Math.round(0.01 * SR));
  const y = gain(frames(x, ch, a, x.length / ch), Math.pow(10, -1 / 20) / peak(x));
  const tmp = path.join(os.tmpdir(), `circuito-loading-${process.pid}.wav`);
  wav(tmp, y, ch, 32);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", path.join(out, "loading.mp3")]);
  fs.unlinkSync(tmp);
  console.log(`loading.mp3     ${ms(y.length / ch)} · tolti ${ms(a)} di silenzio iniziale · +${(-1 - db(peak(x))).toFixed(1)} dB (picco -1 dBFS)`);
}

// --- jingle di benvenuto: loudness a -16 LUFS in due passate ---
{
  const file = find(/^suono per un sito/i);
  const pass1 = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(pass1.slice(pass1.lastIndexOf("{"), pass1.lastIndexOf("}") + 1));
  const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-map", "0:a:0", "-af", ln, "-ar", String(SR), "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", "-id3v2_version", "0", path.join(out, "intro.mp3")]);
  console.log(`intro.mp3       ${m.input_i} LUFS → -16 LUFS · copertina e metadati tolti`);
}
