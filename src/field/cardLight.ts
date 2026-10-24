// Luce della scena 3D sulle card (preset Cinema). Ogni card della pagina riceve un elemento .lit al suo interno:
// un filo di luce sul bordo rivolto verso le cariche vicine, e un riflesso morbido sulla superficie.
// La card stessa prende un alone del colore delle cariche, come un pannello illuminato da dietro.
// Tutto vive dentro le card (variabili CSS): scorre e si inclina con loro nello stesso fotogramma, senza sdoppiarsi.
// Illuminano le card solo le cariche, le sfere che si vedono: girano piano e la luce scivola lenta lungo il bordo. Gli
// impulsi correvano troppo veloci e sparivano di colpo: la luce saltava da un punto all'altro della card.
// Le variabili cambiano solo quando la luce cambia davvero (valori arrotondati): i bordi al massimo 15 volte al
// secondo, l'alone (un'ombra larga, costosa da ridipingere) quattro volte al secondo.

type Lights = { orbs: number[][] }; // x, y, r, g, b (schermo, colore già pesato)
type Slot = { lit: HTMLElement; key: string; halo: string; glow: boolean };

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

const rgb = (c: number[], n: number) => c.map((v) => Math.round(Math.round(Math.min(1, v) * n) * 255 / n)).join(" ");

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
    let sw = 0, vx = 0, vy = 0, px = 0, py = 0;
    const col = [0, 0, 0];
    // distanza dal bordo della card, non dal centro: una carica accanto a una card larga la illumina davvero
    const out = (x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x - cx) - r.width / 2), Math.max(0, Math.abs(y - cy) - r.height / 2));
    for (const o of L.orbs) {
      const c = [o[2], o[3], o[4]], m = Math.max(...c), d = out(o[0], o[1]) / reach, w = m / (1 + d * d);
      if (w < 0.004) continue;
      const dx = o[0] - cx, dy = o[1] - cy, dl = Math.hypot(dx, dy) || 1;
      sw += w; vx += (dx / dl) * w; vy += (dy / dl) * w; px += o[0] * w; py += o[1] * w;
      for (let k = 0; k < 3; k++) col[k] += (c[k] / (m || 1)) * w;
    }
    const a = Math.min(1, sw * (dark ? 0.85 : 0.7));
    let key = "0";
    if (a > 0.02) {
      // la direzione è la media delle cariche, non normalizzata: con due cariche ai lati opposti il filo si spegne
      // piano su entrambi i lati invece di saltare dall'uno all'altro
      const q = (v: number, k: number) => Math.round(v / k) * k;
      const lx = q(Math.max(-60, Math.min(r.width + 60, px / sw - r.left)), 4), ly = q(Math.max(-60, Math.min(r.height + 60, py / sw - r.top)), 4);
      key = `${lx}|${ly}|${q(vx / sw, 0.05).toFixed(2)}|${q(vy / sw, 0.05).toFixed(2)}|${rgb(col.map((v) => v / sw), 32)}|${q(a, 0.02).toFixed(2)}`;
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
      const ha = Math.min(0.9, sw * 0.75), halo = ha > 0.05 ? `${rgb(col.map((v) => v / sw), 16)}|${(Math.round(ha * 20) / 20).toFixed(2)}` : "0";
      if (halo !== s.halo) {
        s.halo = halo;
        if (halo === "0") el.style.setProperty("--ha", "0");
        else { const [c, v] = halo.split("|"); el.style.setProperty("--hc", c); el.style.setProperty("--ha", v); }
      }
    }
  });
};
