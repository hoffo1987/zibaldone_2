// Luce della scena 3D sulle card (preset Cinema). Ogni card della pagina riceve un elemento .lit al suo interno:
// un filo di luce sul bordo rivolto verso le cariche e gli impulsi vicini, e un riflesso morbido sulla superficie.
// La card stessa prende un alone del colore delle cariche, come un pannello illuminato da dietro.
// Tutto vive dentro le card (variabili CSS): scorre e si inclina con loro nello stesso fotogramma, senza sdoppiarsi.
// Le variabili cambiano solo quando la luce cambia davvero (valori arrotondati): i bordi al massimo 15 volte al
// secondo, l'alone (un'ombra larga, costosa da ridipingere) quattro volte al secondo.

type Lights = { orbs: number[][]; heads: number[][] }; // orbs: x, y, r, g, b (schermo, colore già pesato); heads: x, y, intensità, ambra
type Slot = { lit: HTMLElement; key: string; halo: string; glow: boolean };

const TEAL = [0.2, 0.82, 0.73], AMBER = [0.96, 0.72, 0.25];
const slots = new Map<HTMLElement, Slot>();
let lastScan = -1e9, lastPaint = -1e9, lastHalo = -1e9;

const scan = () => {
  const found = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>(".shell-main .pn, .shell-main .card").forEach((el) => {
    if (el.parentElement?.closest(".pn, .card")) return; // solo le card più esterne
    found.add(el);
    if (slots.has(el)) { const s = slots.get(el)!; if (!s.lit.isConnected || s.lit.parentElement !== el) el.appendChild(s.lit); return; }
    if (getComputedStyle(el).position === "static") return;
    const lit = document.createElement("i");
    lit.className = "lit"; lit.setAttribute("aria-hidden", "true");
    el.appendChild(lit);
    const glow = !el.classList.contains("hero"); // il riquadro iniziale ha già il suo bagliore
    if (glow) el.classList.add("lit-on");
    slots.set(el, { lit, key: "", halo: "", glow });
  });
  slots.forEach((s, el) => { if (!found.has(el)) { s.lit.remove(); el.classList.remove("lit-on"); el.style.removeProperty("--hc"); el.style.removeProperty("--ha"); slots.delete(el); } });
};

export const clearCards = () => {
  slots.forEach((s, el) => { s.lit.remove(); el.classList.remove("lit-on"); el.style.removeProperty("--hc"); el.style.removeProperty("--ha"); });
  slots.clear(); lastScan = -1e9;
};

const rgb = (c: number[]) => c.map((v) => Math.round(Math.min(1, v) * 15) * 17).join(" ");

export const lightCards = (L: Lights, dark: boolean, W: number, H: number, now: number) => {
  if (now - lastScan > 500) { lastScan = now; scan(); }
  if (now - lastPaint < 66) return;
  lastPaint = now;
  const halos = now - lastHalo > 250; if (halos) lastHalo = now;
  const reach = H * 0.45;
  slots.forEach((s, el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let sw = 0, ow = 0, vx = 0, vy = 0, px = 0, py = 0;
    const col = [0, 0, 0], oc = [0, 0, 0];
    const add = (x: number, y: number, c: number[], w: number, orb: boolean) => {
      if (w < 0.004) return;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
      sw += w; vx += (dx / d) * w; vy += (dy / d) * w; px += x * w; py += y * w;
      for (let k = 0; k < 3; k++) col[k] += c[k] * w;
      if (orb) { ow += w; for (let k = 0; k < 3; k++) oc[k] += c[k] * w; }
    };
    // distanza dal bordo della card, non dal centro: una carica accanto a una card larga la illumina davvero
    const out = (x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x - cx) - r.width / 2), Math.max(0, Math.abs(y - cy) - r.height / 2));
    for (const o of L.orbs) { const d = out(o[0], o[1]) / reach, c = [o[2], o[3], o[4]], m = Math.max(...c); add(o[0], o[1], c.map((v) => v / (m || 1)), m / (1 + d * d), true); }
    for (const h of L.heads) add(h[0], h[1], h[3] > 0.5 ? AMBER : TEAL, h[2] * Math.exp(-out(h[0], h[1]) / 130) * 1.3, false);
    const a = Math.min(1, sw * (dark ? 0.85 : 0.7));
    let key = "0";
    if (a > 0.02) {
      const vl = Math.hypot(vx, vy) || 1, q = (v: number, k: number) => Math.round(v / k) * k;
      const lx = q(Math.max(-60, Math.min(r.width + 60, px / sw - r.left)), 6), ly = q(Math.max(-60, Math.min(r.height + 60, py / sw - r.top)), 6);
      key = `${lx}|${ly}|${q(vx / vl, 0.1).toFixed(1)}|${q(vy / vl, 0.1).toFixed(1)}|${rgb(col.map((v) => v / sw))}|${q(a, 0.04).toFixed(2)}`;
    }
    if (key !== s.key) {
      s.key = key;
      const st = s.lit.style;
      if (key === "0") st.setProperty("--la", "0");
      else {
        const [lx, ly, dx, dy, c, la] = key.split("|");
        st.setProperty("--lx", `${lx}px`); st.setProperty("--ly", `${ly}px`); st.setProperty("--dx", dx); st.setProperty("--dy", dy); st.setProperty("--lc", c); st.setProperty("--la", la);
      }
    }
    if (s.glow && halos) {
      const ha = Math.min(0.9, ow * 0.75), halo = ha > 0.05 ? `${rgb(oc.map((v) => v / ow))}|${(Math.round(ha * 10) / 10).toFixed(1)}` : "0";
      if (halo !== s.halo) {
        s.halo = halo;
        if (halo === "0") el.style.setProperty("--ha", "0");
        else { const [c, v] = halo.split("|"); el.style.setProperty("--hc", c); el.style.setProperty("--ha", v); }
      }
    }
  });
};
