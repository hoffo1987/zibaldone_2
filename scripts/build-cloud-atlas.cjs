// Asset compiler: isolate connected sprites, reduce them to game resolution as clean pixel art and pack the atlas.
// Pipeline: Lanczos reduction + light sharpening, binary alpha, shared 64-colour palette (deterministic k-means),
// isolated-pixel cleanup, 1px dark outline. Run with `npm run sprites:cloud`. Source art is never modified.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const root = path.join(__dirname, '../src/egg/assets');
const CELL = [160, 128], PIVOT = [80, 110], COLS = 6, PALETTE = 64, EYE = [[48, 128, 255], [150, 215, 255]];
// Source, connected-component seed(s), foot/root anchor in source pixels, reduction.
const frames = [
  ['idle0', 'locomotion', [[170, 305]], [157, 489], 5],
  ['idle1', 'locomotion', [[546, 305]], [533, 489], 5],
  // corsa: ciclo di 12 pose in sequenza (cloud-run.png, scontornato dalla scacchiera disegnata)
  ['run0', 'run', [[103, 228]], [90, 339], 3],
  ['run1', 'run', [[276, 243]], [260, 339], 3],
  ['run2', 'run', [[438, 243]], [422, 339], 3],
  ['run3', 'run', [[609, 240]], [592, 339], 3],
  ['run4', 'run', [[777, 217]], [760, 339], 3],
  ['run5', 'run', [[946, 211]], [933, 339], 3],
  ['run6', 'run', [[102, 487]], [91, 610], 3],
  ['run7', 'run', [[277, 514]], [261, 610], 3],
  ['run8', 'run', [[439, 513]], [422, 610], 3],
  ['run9', 'run', [[610, 501]], [591, 610], 3],
  ['run10', 'run', [[778, 489]], [762, 610], 3],
  ['run11', 'run', [[945, 484]], [932, 610], 3],
  ['jump', 'combat', [[195, 157]], [201, 320], 4],
  ['fall', 'combat', [[505, 176]], [510, 334], 4],
  ['land', 'combat', [[800, 259]], [795, 320], 4],
  ['windup', 'combat', [[1150, 216]], [1134, 320], 4],
  ['slash', 'combat', [[126, 515]], [123, 635], 4],
  ['follow', 'combat', [[514, 551]], [500, 635], 4],
  ['uppercut', 'combat', [[809, 553], [937, 486]], [808, 655], 4],
  ['heavyWindup', 'combat', [[1146, 517]], [1138, 654], 4],
  ['heavySlash', 'combat', [[133, 809]], [126, 925], 4],
  ['heavyRecover', 'combat', [[490, 826]], [476, 925], 4],
  ['roll0', 'combat', [[825, 793]], [834, 880], 4],
  ['roll1', 'combat', [[1134, 797]], [1100, 928], 4],
  ['air', 'combat', [[205, 1088]], [225, 1213], 4],
  ['hurt', 'hurt', [[635, 440]], [670, 945], 13],
  ['death', 'combat', [[800, 1173]], [800, 1213], 4],
  ['win', 'combat', [[1118, 1060]], [1108, 1213], 4],
];

async function source(name) {
  const { data, info } = await sharp(path.join(root, `source/cloud-${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info, labels = new Int32Array(w * h), parts = [null];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] || data[i * 4 + 3] < 128) continue;
    const id = parts.length, pixels = [i]; labels[i] = id;
    for (let j = 0; j < pixels.length; j++) {
      const p = pixels[j], x = p % w, y = Math.floor(p / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * w + X;
        if (X >= 0 && X < w && Y >= 0 && Y < h && !labels[k] && data[k * 4 + 3] >= 128) { labels[k] = id; pixels.push(k); }
      }
    }
    parts.push(pixels);
  }
  return { data, w, h, labels, parts };
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Riduzione di una posa: si isola la figura scelta (componenti connesse), si ritaglia attorno all'ancora e si
// riduce con un filtro Lanczos (alpha premoltiplicata). Rispetto al campionamento di un pixel per blocco non c'è
// rumore, e rispetto alla media semplice restano capelli oro, occhio azzurro, impugnatura rossa e cuoio marrone.
// Poi l'alpha diventa netta (copertura >= 50%).
async function reduceFrame(s, selected, anchor, reduce, name) {
  const W = CELL[0] * reduce, H = CELL[1] * reduce, x0 = anchor[0] - PIVOT[0] * reduce, y0 = anchor[1] - PIVOT[1] * reduce;
  const crop = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx < 0 || sx >= s.w || sy < 0 || sy >= s.h || !selected.has(s.labels[sy * s.w + sx])) continue;
    const k = (sy * s.w + sx) * 4, o = (y * W + x) * 4;
    s.data.copy(crop, o, k, k + 3); crop[o + 3] = 255;
  }
  const out = await sharp(crop, { raw: { width: W, height: H, channels: 4 } })
    .resize(CELL[0], CELL[1], { kernel: 'lanczos3' }).sharpen({ sigma: 0.7 }).raw().toBuffer();
  for (let y = 0; y < CELL[1]; y++) for (let x = 0; x < CELL[0]; x++) {
    const o = (y * CELL[0] + x) * 4;
    if (out[o + 3] < 128) { out[o + 3] = 0; continue; }
    if (!x || !y || x === CELL[0] - 1 || y === CELL[1] - 1) throw new Error(`Clipped frame: ${name}`);
    out[o + 3] = 255;
  }
  return out;
}

// Occhi: a questa scala l'iride (circa 10x14 px nella sorgente) diventa 2-3 pixel che la riduzione mescola alle
// ciglia e la palette assorbe nel blu del maglione. Qui si cercano le iridi nella sorgente, cioè piccoli gruppi
// di pixel azzurri con della pelle accanto (le scie dei fendenti sono grandi e lontane dalla pelle), e si
// ridipingono i pixel finali che coprono con un azzurro acceso; il pixel più chiaro fa da riflesso.
const isIris = (r, g, b) => b > 70 && b > r + 40 && b > g + 12 && ((b - Math.min(r, g)) / b > 0.55 || (b > 190 && b > r + 50));
// iride grigio-azzurra (poco satura): vale solo se accanto c'è il bianco dell'occhio
const isIrisSoft = (r, g, b) => b >= 60 && b > r + 28 && b > g + 12;
const isWhite = (r, g, b) => r > 195 && g > 195 && b > 195 && b >= r - 15 && Math.abs(r - g) < 30;
const isHair = (r, g, b) => r > 190 && g > 130 && r >= g && b < g * 0.62;
const isSkin = (r, g, b) => r > 190 && g > 120 && r > b + 45 && g < r && b >= g * 0.62;
function eyes(s, selected, anchor, reduce) {
  const x0 = anchor[0] - PIVOT[0] * reduce, y0 = anchor[1] - PIVOT[1] * reduce;
  const W = CELL[0] * reduce, H = CELL[1] * reduce, seen = new Uint8Array(W * H), found = [];
  // cima dei capelli: l'occhio sta al massimo 22 pixel finali più sotto (il resto è maglione)
  let hairTop = 1e9;
  const at = (x, y) => {
    const sx = x0 + x, sy = y0 + y;
    if (sx < 0 || sx >= s.w || sy < 0 || sy >= s.h || !selected.has(s.labels[sy * s.w + sx])) return null;
    const k = (sy * s.w + sx) * 4; return [s.data[k], s.data[k + 1], s.data[k + 2]];
  };
  for (let y = 0; y < H && hairTop === 1e9; y++) for (let x = 0; x < W; x++) { const q = at(x, y); if (q && isHair(...q)) { hairTop = y; break; } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (seen[y * W + x]) continue;
    const c = at(x, y); if (!c || !isIrisSoft(...c)) continue;
    const pix = [[x, y]]; seen[y * W + x] = 1;
    for (let i = 0; i < pix.length && pix.length < 800; i++) {
      const [px, py] = pix[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = px + dx, Y = py + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || seen[Y * W + X]) continue;
        const q = at(X, Y); if (q && isIrisSoft(...q)) { seen[Y * W + X] = 1; pix.push([X, Y]); }
      }
    }
    if (pix.length < 6 || pix.length > 500) continue;
    if (pix.reduce((m, [, py]) => m + py, 0) / pix.length - hairTop > 22 * reduce) continue;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    pix.forEach(([px, py]) => { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); });
    // un occhio sta fra pelle e capelli; i riflessi del maglione blu hanno accanto solo pelle
    let skin = 0, hair = 0, white = 0;
    const R = Math.round(reduce * 2.4); // circa 2,4 pixel finali attorno al gruppo, a qualunque riduzione
    for (let y2 = by0 - R; y2 <= by1 + R; y2++) for (let x2 = bx0 - R; x2 <= bx1 + R; x2++) {
      const q = at(x2, y2); if (!q) continue;
      if (isSkin(...q)) skin++; else if (isHair(...q)) hair++;
      else if (isWhite(...q) && Math.abs(x2 - (bx0 + bx1) / 2) <= reduce * 1.2 + (bx1 - bx0) / 2 && Math.abs(y2 - (by0 + by1) / 2) <= reduce * 1.2 + (by1 - by0) / 2) white++;
    }
    const strong = pix.filter(([px, py]) => isIris(...at(px, py))).length;
    const k = (reduce * reduce) / 25; // soglie pensate per la riduzione 5
    if (skin < 15 * k || hair < 8 * k || (strong < 4 * k && white < 2)) continue;
    // copertura dei pixel finali
    const cov = new Map();
    pix.forEach(([px, py]) => {
      const q = at(px, py), key = Math.floor(py / reduce) * CELL[0] + Math.floor(px / reduce), e = cov.get(key) || { n: 0, l: 0 };
      e.n++; e.l += q[0] + q[1] + q[2]; cov.set(key, e);
    });
    const list = [...cov.entries()].sort((a, b) => b[1].n - a[1].n);
    const keep = list.filter(([, e]) => e.n >= reduce * reduce * 0.22);
    (keep.length ? keep : list.slice(0, 1)).slice(0, 3).forEach(([key, e]) => found.push({ x: key % CELL[0], y: Math.floor(key / CELL[0]), l: e.l / e.n }));
  }
  if (!found.length) found.push(...eyeWhites(s, at, W, H, reduce));
  return found;
}

// occhi disegnati senza iride blu (pupilla scura e bianco): piccolo gruppo bianco con pelle accanto e un pixel
// molto scuro vicino; l'azzurro va sul pixel finale della pupilla
function eyeWhites(s, at, W, H, reduce) {
  const R = Math.round(reduce * 1.4), out = [], seen = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (seen[y * W + x]) continue;
    const c = at(x, y); if (!c || !isWhite(...c)) continue;
    const pix = [[x, y]]; seen[y * W + x] = 1;
    for (let i = 0; i < pix.length && pix.length < 200; i++) {
      const [px, py] = pix[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = px + dx, Y = py + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || seen[Y * W + X]) continue;
        const q = at(X, Y); if (q && isWhite(...q)) { seen[Y * W + X] = 1; pix.push([X, Y]); }
      }
    }
    if (pix.length < 2 || pix.length > reduce * reduce * 3) continue;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    pix.forEach(([px, py]) => { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); });
    let skin = 0, hair = 0, dark = null, dl = 1e9;
    for (let y2 = by0 - R * 2; y2 <= by1 + R * 2; y2++) for (let x2 = bx0 - R * 2; x2 <= bx1 + R * 2; x2++) {
      const q = at(x2, y2); if (!q) continue;
      if (isSkin(...q)) skin++; else if (isHair(...q)) hair++;
      const l = lum(...q);
      if (l < 45 && Math.abs(x2 - (bx0 + bx1) / 2) <= R + (bx1 - bx0) / 2 && Math.abs(y2 - (by0 + by1) / 2) <= R + (by1 - by0) / 2 && l < dl) { dl = l; dark = [x2, y2]; }
    }
    const k = (reduce * reduce) / 25;
    if (!dark || skin < 20 * k || hair < 4 * k) continue;
    out.push({ x: Math.floor(dark[0] / reduce), y: Math.floor(dark[1] / reduce), l: 0 });
  }
  return out.slice(0, 1);
}

// palette comune a tutte le pose: k-means deterministico (k-means++ con seme fisso) sui pixel pieni,
// distanza pesata sulla luminosità percepita; ogni pixel viene poi agganciato al colore più vicino
function quantize(buf, k) {
  const px = [];
  for (let i = 0; i < buf.length; i += 4) if (buf[i + 3]) px.push(buf[i], buf[i + 1], buf[i + 2]);
  const n = px.length / 3, d2 = (i, c, C) => { const r = px[i * 3] - C[c * 3], g = px[i * 3 + 1] - C[c * 3 + 1], b = px[i * 3 + 2] - C[c * 3 + 2]; return r * r * 0.3 + g * g * 0.59 + b * b * 0.11; };
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const C = new Float64Array(k * 3), best = new Float64Array(n).fill(1e18);
  let pick = Math.floor(rnd() * n);
  for (let c = 0; c < k; c++) {
    C[c * 3] = px[pick * 3]; C[c * 3 + 1] = px[pick * 3 + 1]; C[c * 3 + 2] = px[pick * 3 + 2];
    let sum = 0;
    for (let i = 0; i < n; i++) { best[i] = Math.min(best[i], d2(i, c, C)); sum += best[i]; }
    let t = rnd() * sum; pick = 0;
    for (let i = 0; i < n; i++) { t -= best[i]; if (t <= 0) { pick = i; break; } }
  }
  const lab = new Int32Array(n);
  for (let it = 0; it < 16; it++) {
    const acc = new Float64Array(k * 4);
    for (let i = 0; i < n; i++) {
      let bc = 0, bd = 1e18;
      for (let c = 0; c < k; c++) { const d = d2(i, c, C); if (d < bd) { bd = d; bc = c; } }
      lab[i] = bc; acc[bc * 4] += px[i * 3]; acc[bc * 4 + 1] += px[i * 3 + 1]; acc[bc * 4 + 2] += px[i * 3 + 2]; acc[bc * 4 + 3]++;
    }
    for (let c = 0; c < k; c++) if (acc[c * 4 + 3]) for (let j = 0; j < 3; j++) C[c * 3 + j] = acc[c * 4 + j] / acc[c * 4 + 3];
  }
  for (let i = 0, p = 0; i < buf.length; i += 4) {
    if (!buf[i + 3]) continue;
    const c = lab[p++]; buf[i] = Math.round(C[c * 3]); buf[i + 1] = Math.round(C[c * 3 + 1]); buf[i + 2] = Math.round(C[c * 3 + 2]);
  }
}

// pixel isolato (diverso da tutti e 4 i vicini pieni) → colore del vicino più simile: toglie il "puntinato"
function despeckle(buf, width, height) {
  const src = Buffer.from(buf);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = (y * width + x) * 4; if (!src[i + 3]) continue;
    let same = 0, best = -1, bd = 1e9, solid = 0;
    for (const j of [i - 4, i + 4, i - width * 4, i + width * 4]) {
      if (!src[j + 3]) continue; solid++;
      const d = Math.abs(src[j] - src[i]) + Math.abs(src[j + 1] - src[i + 1]) + Math.abs(src[j + 2] - src[i + 2]);
      if (!d) same++; else if (d < bd) { bd = d; best = j; }
    }
    if (solid >= 3 && !same && best >= 0) src.copy(buf, i, best, best + 3);
  }
}

// contorno esterno di 1px: tono molto scuro del pixel vicino, come gli altri personaggi del gioco
function outline(buf, width, height) {
  const src = Buffer.from(buf);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = (y * width + x) * 4; if (src[i + 3]) continue;
    const j = [i - 4, i + 4, i - width * 4, i + width * 4].find((k) => src[k + 3]);
    if (j == null) continue;
    if (lum(src[j], src[j + 1], src[j + 2]) < 45) continue; // c'è già un bordo scuro
    buf[i] = Math.round(src[j] * 0.18 + 6); buf[i + 1] = Math.round(src[j + 1] * 0.16 + 5); buf[i + 2] = Math.round(src[j + 2] * 0.2 + 12); buf[i + 3] = 255;
  }
}

(async () => {
  // fotogrammi intermedi generati da scripts/tween-cloud.py: ogni cella contiene una sola figura, si prende tutta
  const tweensFile = path.join(root, 'source/tweens.json');
  const tweens = fs.existsSync(tweensFile) ? JSON.parse(fs.readFileSync(tweensFile, 'utf8')) : [];
  tweens.forEach((t) => frames.push([t.name, t.sheet, null, t.anchor, t.reduce]));
  const sources = {};
  for (const name of new Set(frames.map((f) => f[1]))) sources[name] = await source(name);
  const width = CELL[0] * COLS, height = CELL[1] * Math.ceil(frames.length / COLS);
  const atlas = Buffer.alloc(width * height * 4), manifest = {}, eyeSpots = [];
  for (let n = 0; n < frames.length; n++) {
    const [name, sheet, seeds, anchor, reduce] = frames[n], s = sources[sheet];
    const selected = !seeds ? { has: (id) => id > 0 } : new Set(seeds.map(([x, y]) => {
      for (let radius = 0; radius <= 16; radius++) {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const id = s.labels[(y + dy) * s.w + x + dx];
          if (id) return id;
        }
      }
      return 0;
    }));
    if (seeds && selected.has(0)) throw new Error(`Seed outside artwork: ${name}`);
    const cellX = (n % COLS) * CELL[0], cellY = Math.floor(n / COLS) * CELL[1];
    const px = await reduceFrame(s, selected, anchor, reduce, name);
    eyeSpots.push(...eyes(s, selected, anchor, reduce).map((e) => ({ ...e, x: e.x + cellX, y: e.y + cellY, frame: name })));
    let count = 0;
    for (let y = 0; y < CELL[1]; y++) for (let x = 0; x < CELL[0]; x++) {
      const o = (y * CELL[0] + x) * 4; if (!px[o + 3]) continue;
      const d = ((cellY + y) * width + cellX + x) * 4;
      atlas[d] = px[o]; atlas[d + 1] = px[o + 1]; atlas[d + 2] = px[o + 2]; atlas[d + 3] = 255; count++;
    }
    if (count < 700) throw new Error(`Incomplete frame: ${name} (${count} pixels)`);
    manifest[name] = { rect: [cellX, cellY, ...CELL], anchor: PIVOT };
  }
  // palette ridotta senza dithering, poi pulizia dei pixel isolati e contorno
  const raw = { raw: { width, height, channels: 4 } };
  const q = atlas;
  quantize(q, PALETTE);
  despeckle(q, width, height);
  // iridi: azzurro acceso, il pixel più chiaro di ogni occhio fa da riflesso
  const byFrame = {};
  eyeSpots.forEach((e) => { (byFrame[e.frame] = byFrame[e.frame] || []).push(e); });
  Object.values(byFrame).forEach((list) => {
    const top = list.reduce((m, e) => (e.l > m.l ? e : m), list[0]);
    list.forEach((e) => {
      const i = (e.y * width + e.x) * 4, c = list.length > 1 && e === top ? EYE[1] : EYE[0];
      q[i] = c[0]; q[i + 1] = c[1]; q[i + 2] = c[2]; q[i + 3] = 255;
    });
  });
  console.log('Eyes:', Object.entries(byFrame).map(([f, l]) => `${f}:${l.length}`).join(' '));
  outline(q, width, height);
  await sharp(q, raw).png({ compressionLevel: 9 }).toFile(path.join(root, 'cloud.png'));
  fs.writeFileSync(path.join(root, 'cloud-frames.ts'), '// Generated by scripts/build-cloud-atlas.cjs. Do not edit by hand.\nimport type { SpriteFrame } from "../sprite-sheet";\n\nexport const CLOUD_FRAMES: Record<string, SpriteFrame> = ' + JSON.stringify(manifest, null, 2) + ';\n');
  console.log(`Packed ${frames.length} frames into ${width}x${height} cloud.png`);
})().catch(e => { console.error(e); process.exitCode = 1; });
