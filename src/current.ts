// La corrente sullo sfondo: il disegno di ogni sezione (BgArt) registra qui le sue piste e i suoi nodi, e gli impulsi
// corrono proprio su quelle linee. Arrivati a una piazzola la fanno lampeggiare; dentro un chip o un nodo della rete
// possono ripartire su un'altra pista, così la corrente attraversa il disegno invece di scorrere su una griglia invisibile.

export type Trace = { p: number[][]; c: number[]; L: number; closed: boolean; am: boolean; a: number; b: number; y0: number; y1: number };
export type NetNode = { x: number; y: number; r: number; kind: "pad" | "chip" | "hub" | "tick" | "star"; box?: number[]; links: number[] };
export type Net = { traces: Trace[]; nodes: NetNode[]; W: number; H: number };

// raccoglitore passato alle funzioni di disegno: i nodi nello stesso punto diventano uno solo (le piste si toccano lì)
export const netBuilder = (W: number, H: number) => {
  const net: Net = { traces: [], nodes: [], W, H }, at = new Map<string, number>();
  const node = (x: number, y: number, kind: NetNode["kind"], r = 3, box?: number[]) => {
    const k = `${Math.round(x)},${Math.round(y)}`, old = at.get(k);
    if (old !== undefined) { const n = net.nodes[old]; if (kind === "chip") { n.kind = kind; n.box = box; } n.r = Math.max(n.r, r); return old; }
    at.set(k, net.nodes.length); net.nodes.push({ x, y, r, kind, box, links: [] });
    return net.nodes.length - 1;
  };
  const trace = (pts: number[][], o: { closed?: boolean; am?: boolean; a?: number; b?: number } = {}) => {
    if (pts.length < 2) return;
    const p = o.closed ? [...pts, pts[0]] : pts.slice(), c = [0];
    let y0 = p[0][1], y1 = y0;
    for (let i = 1; i < p.length; i++) { c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); y0 = Math.min(y0, p[i][1]); y1 = Math.max(y1, p[i][1]); }
    const L = c[c.length - 1]; if (L < 8) return;
    const t: Trace = { p, c, L, closed: !!o.closed, am: !!o.am, a: o.a ?? -1, b: o.b ?? -1, y0, y1 }, id = net.traces.length;
    net.traces.push(t);
    if (t.a >= 0) net.nodes[t.a].links.push(id);
    if (t.b >= 0 && t.b !== t.a) net.nodes[t.b].links.push(id);
  };
  return { net, node, trace };
};
export type NetPen = ReturnType<typeof netBuilder>;

// punto della pista a distanza s dall'inizio (le piste chiuse girano, quelle aperte si fermano agli estremi)
export const pointAt = (t: Trace, s: number, out: number[] = [0, 0]) => {
  s = t.closed ? ((s % t.L) + t.L) % t.L : Math.max(0, Math.min(t.L, s));
  let lo = 1, hi = t.c.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (t.c[m] < s) lo = m + 1; else hi = m; }
  const a = t.p[lo - 1], b = t.p[lo], k = (s - t.c[lo - 1]) / (t.c[lo] - t.c[lo - 1] || 1);
  out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k;
  return out;
};
// tratto di pista fra le distanze s0 e s1 (anche all'indietro), con gli spigoli: la scia segue le curve a 45° senza tagliarle
export const stretch = (t: Trace, s0: number, s1: number, out: number[][]) => {
  out.length = 0; out.push(pointAt(t, s0, []));
  const lo = Math.min(s0, s1), hi = Math.max(s0, s1), mid: number[] = [];
  if (t.closed) { for (let k = Math.floor(lo / t.L); k * t.L <= hi; k++) for (let i = 0; i < t.c.length - 1; i++) { const s = t.c[i] + k * t.L; if (s > lo && s < hi) mid.push(s); } }
  else for (let i = 1; i < t.c.length - 1; i++) if (t.c[i] > lo && t.c[i] < hi) mid.push(t.c[i]);
  if (s1 < s0) mid.reverse();
  mid.forEach((s) => out.push(pointAt(t, s, [])));
  out.push(pointAt(t, s1, []));
  return out;
};

// distanza minima tra un punto e una pista: il tocco inietta corrente nella pista più vicina
export const nearest = (net: Net, x: number, y: number, max: number) => {
  let best = -1, bs = 0, bd = max * max;
  net.traces.forEach((t, i) => {
    if (y < t.y0 - max || y > t.y1 + max) return;
    for (let k = 1; k < t.p.length; k++) {
      const a = t.p[k - 1], b = t.p[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), ex = a[0] + dx * u - x, ey = a[1] + dy * u - y, d = ex * ex + ey * ey;
      if (d < bd) { bd = d; best = i; bs = t.c[k - 1] + Math.sqrt(l2) * u; }
    }
  });
  return best < 0 ? null : { t: best, s: bs };
};

// il disegno della sezione aperta: lo pubblica BgArt, lo legge l'animazione
export const live: { net: Net | null; el: HTMLElement | null; ver: number } = { net: null, el: null, ver: 0 };
export const publishNet = (net: Net | null, el: HTMLElement | null) => { live.net = net; live.el = el; live.ver++; };

type Pulse = { t: number; s0: number; dir: number; run: number; d: number; v: number; tail: number; am: boolean; hop: number; arrived: boolean };
type Flash = { x: number; y: number; t0: number; life: number; n: number; am: boolean };
type Cfg = { pulses: boolean; dens: number; spd: number };

// sprite del bagliore, disegnato una volta: drawImage costa molto meno di un gradiente a ogni frame
const glowSprite = (rgb: string, dark: boolean) => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${dark ? "255,255,255" : rgb},${dark ? 0.95 : 0.3})`); gr.addColorStop(0.12, `rgba(${rgb},${dark ? 0.8 : 0.22})`);
  gr.addColorStop(0.4, `rgba(${rgb},${dark ? 0.22 : 0.08})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
};

// motore degli impulsi: frame() disegna su ctx (in pixel CSS della finestra) e restituisce il rettangolo sporcato
export const makeCurrent = (dark: boolean) => {
  const TEAL = dark ? "51,209,186" : "11,127,112", AMB = dark ? "244,183,63" : "217,144,0";
  const spr = { t: glowSprite(TEAL, dark), a: glowSprite(AMB, dark) };
  let pulses: Pulse[] = [], flashes: Flash[] = [], ver = -1, last = 0, twinkleAt = 0;
  const pts: number[][] = [], P = [0, 0];

  const start = (net: Net, ti: number, s0: number, dir: number, run: number, hop = 0) => {
    const t = net.traces[ti];
    pulses.push({ t: ti, s0, dir, run, d: 0, v: (150 + Math.random() * 110) * (t.closed ? 0.8 : 1), tail: t.closed ? 190 : 120 + Math.random() * 60, am: t.am || Math.random() < 0.18, hop, arrived: false });
  };
  // un impulso da una pista che si vede, dall'estremo che preferisce (dai chip la corrente esce)
  const spawn = (net: Net, vy0: number, vy1: number) => {
    for (let tries = 0; tries < 12; tries++) {
      const ti = Math.floor(Math.random() * net.traces.length), t = net.traces[ti];
      if (t.y1 < vy0 || t.y0 > vy1) continue;
      if (t.closed) { start(net, ti, Math.random() * t.L, Math.random() < 0.5 ? 1 : -1, t.L * (0.35 + Math.random() * 0.5)); return; }
      const fromB = t.b >= 0 && net.nodes[t.b].kind === "chip" ? true : t.a >= 0 && net.nodes[t.a].kind === "chip" ? false : Math.random() < 0.5;
      start(net, ti, fromB ? t.L : 0, fromB ? -1 : 1, t.L);
      const n = fromB ? t.b : t.a;
      if (n >= 0 && net.nodes[n].kind === "chip") flashes.push({ x: net.nodes[n].x, y: net.nodes[n].y, t0: performance.now(), life: 700, n, am: true });
      return;
    }
  };
  // tocco in coordinate del disegno: due impulsi partono dal punto toccato, uno per verso
  const inject = (x: number, y: number) => {
    const net = live.net; if (!net) return false;
    const hit = nearest(net, x, y, 46); if (!hit) return false;
    const t = net.traces[hit.t];
    [1, -1].forEach((dir) => start(net, hit.t, hit.s, dir, t.closed ? t.L * 0.5 : dir > 0 ? t.L - hit.s : hit.s));
    return true;
  };

  // map: dal disegno alla finestra (scala e spostamento verticale della parallasse); fade: velatura in basso come lo sfondo
  const frame = (g: CanvasRenderingContext2D, now: number, cfg: Cfg, map: { sx: number; sy: number; oy: number; vw: number; vh: number }) => {
    const net = live.net;
    if (live.ver !== ver) { ver = live.ver; pulses = []; flashes = []; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0) * (cfg.spd || 1); last = now;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    if (!net) return null;
    const X = (x: number) => x * map.sx, Y = (y: number) => y * map.sy + map.oy;
    const grow = (x: number, y: number, r: number) => { box[0] = Math.min(box[0], x - r); box[1] = Math.min(box[1], y - r); box[2] = Math.max(box[2], x + r); box[3] = Math.max(box[3], y + r); };
    const fade = (y: number) => 1 - 0.55 * Math.max(0, Math.min(1, (y / map.vh - 0.3) / 0.7));
    const vy0 = (0 - map.oy) / map.sy, vy1 = (map.vh - map.oy) / map.sy;
    const small = map.vw < 600, want = cfg.pulses ? Math.max(1, Math.round(cfg.dens * (small ? 0.5 : 1))) : 0;

    // stelle del podio: niente piste, la luce si accende sulle stelle più grandi
    if (!net.traces.length) {
      const stars = net.nodes;
      if (stars.length && now > twinkleAt && flashes.length < want) { const n = Math.floor(Math.random() * stars.length), s = stars[n]; if (s.y > vy0 && s.y < vy1) flashes.push({ x: s.x, y: s.y, t0: now, life: 1400 + Math.random() * 900, n, am: Math.random() < 0.3 }); twinkleAt = now + 2600 / Math.max(1, want); }
    } else {
      let moving = 0; for (const p of pulses) if (!p.arrived) moving++;
      for (; moving < want; moving++) spawn(net, vy0, vy1);
    }
    if (dark) g.globalCompositeOperation = "lighter";
    g.lineCap = "round"; g.lineJoin = "round";

    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i], t = net.traces[q.t];
      q.d += q.v * dt;
      if (!q.arrived && q.d >= q.run) {
        q.arrived = true;
        // arrivo: la piazzola si accende; da un chip o da un nodo della rete la corrente può proseguire
        const end = t.closed ? -1 : q.dir > 0 ? t.b : t.a;
        if (end >= 0) {
          const n = net.nodes[end];
          flashes.push({ x: n.x, y: n.y, t0: now, life: n.kind === "chip" ? 800 : 650, n: end, am: q.am });
          const go = n.kind === "chip" ? 0.85 : n.kind === "hub" ? 0.7 : 0.3;
          const others = n.links.filter((k) => k !== q.t);
          if (others.length && q.hop < 5 && Math.random() < go && cfg.pulses) {
            const k = others[Math.floor(Math.random() * others.length)], o = net.traces[k], fromA = o.a === end;
            start(net, k, fromA ? 0 : o.L, fromA ? 1 : -1, o.L, q.hop + 1);
            pulses[pulses.length - 1].am = q.am;
          }
        }
      }
      const head = Math.min(q.d, q.run), tail0 = Math.max(0, q.d - q.tail);
      if (tail0 >= q.run) { pulses.splice(i, 1); continue; }
      // scia: rame acceso dietro la testa, sfuma in sei tratti; sotto, un alone largo e tenue
      stretch(t, q.s0 + q.dir * tail0, q.s0 + q.dir * head, pts);
      const col = q.am ? AMB : TEAL, n = pts.length, k6 = 6;
      const total = head - tail0, life = q.arrived ? 1 - (q.d - q.run) / q.tail : 1;
      if (n >= 2 && total > 0.5) {
        let acc = 0; const seg: number[] = [0];
        for (let j = 1; j < n; j++) seg.push((acc += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])));
        const yF = fade(Y(pts[n - 1][1]));
        g.strokeStyle = `rgba(${col},${(0.1 * yF * life).toFixed(3)})`; g.lineWidth = 6;
        g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let j = 1; j < n; j++) g.lineTo(X(pts[j][0]), Y(pts[j][1])); g.stroke();
        let j = 0;
        for (let c = 0; c < k6; c++) {
          const a0 = (acc * c) / k6, a1 = (acc * (c + 1)) / k6, f = (c + 1) / k6;
          g.strokeStyle = `rgba(${col},${(f * f * (dark ? 0.9 : 0.75) * yF).toFixed(3)})`; g.lineWidth = 1.1 + f * 1.3;
          g.beginPath();
          while (j < n - 1 && seg[j + 1] <= a0) j++;
          const lerp = (a: number, jj: number) => { const u = (a - seg[jj]) / (seg[jj + 1] - seg[jj] || 1); return [pts[jj][0] + (pts[jj + 1][0] - pts[jj][0]) * u, pts[jj][1] + (pts[jj + 1][1] - pts[jj][1]) * u]; };
          const s = lerp(a0, Math.min(j, n - 2)); g.moveTo(X(s[0]), Y(s[1]));
          let jj = j; while (jj < n - 1 && seg[jj + 1] < a1) { jj++; g.lineTo(X(pts[jj][0]), Y(pts[jj][1])); }
          const e = lerp(a1, Math.min(jj, n - 2)); g.lineTo(X(e[0]), Y(e[1]));
          g.stroke();
        }
        pts.forEach((p) => grow(X(p[0]), Y(p[1]), 6));
      }
      if (!q.arrived) {
        pointAt(t, q.s0 + q.dir * head, P);
        const x = X(P[0]), y = Y(P[1]), r = 13, a = fade(y);
        g.globalAlpha = a; g.drawImage(q.am ? spr.a : spr.t, x - r, y - r, r * 2, r * 2);
        // nucleo nitido: sulla carta il bagliore da solo sembrerebbe una macchia
        if (!dark) { g.fillStyle = `rgb(${q.am ? AMB : TEAL})`; g.beginPath(); g.arc(x, y, 2.1, 0, 7); g.fill(); }
        g.globalAlpha = 1;
        grow(x, y, r);
      }
    }

    // lampi: la piazzola raggiunta si accende con un anello; il chip accende il suo LED e il contorno
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], k = (now - f.t0) / f.life;
      if (k >= 1) { flashes.splice(i, 1); continue; }
      const n = net.nodes[f.n], x = X(f.x), y = Y(f.y), col = f.am ? AMB : TEAL, a = fade(y);
      const env = n.kind === "star" ? Math.sin(Math.PI * k) : (1 - k) * (1 - k);
      if (n.kind === "chip" && n.box) {
        const [bx, by, bw, bh] = n.box;
        g.strokeStyle = `rgba(${TEAL},${(0.45 * env * a).toFixed(3)})`; g.lineWidth = 1.8;
        g.strokeRect(X(bx), Y(by), bw * map.sx, bh * map.sy);
        grow(X(bx + bw / 2), Y(by + bh / 2), Math.max(bw * map.sx, bh * map.sy) / 2 + 4);
        g.globalAlpha = env * a; g.drawImage(spr.a, x - 10, y - 10, 20, 20); g.globalAlpha = 1;
        grow(x, y, 10);
        continue;
      }
      if (n.kind === "star") {
        const r = 10 + n.r * 5, l = (8 + n.r * 6) * env;
        g.globalAlpha = env * a; g.drawImage(f.am ? spr.a : spr.t, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
        g.strokeStyle = `rgba(${col},${(0.7 * env * a).toFixed(3)})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - l, y); g.lineTo(x + l, y); g.moveTo(x, y - l); g.lineTo(x, y + l); g.stroke();
        grow(x, y, Math.max(r, l));
        continue;
      }
      const ring = n.r + 3 + 16 * (1 - (1 - k) * (1 - k) * (1 - k));
      g.strokeStyle = `rgba(${col},${(0.6 * env * a).toFixed(3)})`; g.lineWidth = 1.4;
      g.beginPath(); g.arc(x, y, ring, 0, 7); g.stroke();
      const r = 9 + n.r * 2;
      g.globalAlpha = env * a; g.drawImage(f.am ? spr.a : spr.t, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
      grow(x, y, Math.max(ring + 2, r));
    }
    g.globalCompositeOperation = "source-over";
    return box[0] === Infinity ? null : box;
  };
  return { frame, inject, clear: () => { pulses = []; flashes = []; } };
};
