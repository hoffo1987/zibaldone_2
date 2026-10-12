// Scenari in pixel art disegnati proceduralmente: il lungo corridoio e la sala del reattore.
// Bozza: forme e luci sono già al loro posto, i dettagli verranno definiti in seguito.

export const VH = 288;          // altezza virtuale dello schermo (px di gioco)
export const FLOOR = 244;       // quota del pavimento
export const CORR_END = 2240;   // fine del corridoio: qui c'è il portone
export const ARENA_X = 2300;    // la sala inizia qui
export const ARENA_W = 600;

type C2 = CanvasRenderingContext2D;
const mk = (w: number, h: number): [HTMLCanvasElement, C2] => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d")!; x.imageSmoothingEnabled = false; return [c, x];
};
// rumore deterministico: lo stesso muro ogni volta
const rnd = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const R = (x: C2, c: string, a: number, b: number, w: number, h: number) => { x.fillStyle = c; x.fillRect(a | 0, b | 0, w | 0, h | 0); };

// --- muro lontano con finestre gotiche e luna (si ripete ogni 192px) ---
const farTile = () => {
  const W = 192, [c, x] = mk(W, FLOOR);
  R(x, "#17142a", 0, 0, W, FLOOR);
  for (let y = 0; y < FLOOR; y += 10) for (let i = 0; i < 8; i++) {
    const o = (y / 10) % 2 ? 12 : 0, bx = i * 24 + o;
    R(x, rnd(y * 13 + i) > 0.5 ? "#1b1830" : "#191629", bx, y, 23, 9);
    R(x, "#110f1f", bx + 23, y, 1, 10); R(x, "#110f1f", bx, y + 9, 24, 1);
  }
  // finestra ad arco
  const wx = 76, wy = 40, ww = 40, wh = 118;
  for (let y = 0; y < wh; y++) {
    const top = y < 20 ? Math.round(20 - Math.sqrt(Math.max(0, 400 - (20 - y) * (20 - y)))) : 0;
    const k = y / wh;
    R(x, `rgb(${30 + 30 * k | 0},${42 + 40 * k | 0},${86 + 60 * k | 0})`, wx + top, wy + y, ww - top * 2, 1);
  }
  R(x, "#e9ecff", wx + 25, wy + 26, 7, 7); R(x, "#ffffff", wx + 26, wy + 27, 4, 4); // luna
  for (let i = 0; i < 9; i++) R(x, "#b8c4ff", wx + 4 + rnd(i) * 32, wy + 30 + rnd(i + 9) * 70, 1, 1);
  R(x, "#0d0b18", wx + ww / 2 - 1, wy + 8, 2, wh - 8); R(x, "#0d0b18", wx + 2, wy + 62, ww - 4, 2);
  R(x, "#2a2540", wx - 4, wy + wh, ww + 8, 6); R(x, "#36304f", wx - 4, wy + wh, ww + 8, 1);
  // fascio di luce lunare sul pavimento
  x.globalAlpha = 0.07; x.fillStyle = "#9fb4ff";
  x.beginPath(); x.moveTo(wx + 4, wy + wh); x.lineTo(wx + ww - 4, wy + wh); x.lineTo(wx + ww + 40, FLOOR); x.lineTo(wx + 14, FLOOR); x.fill();
  x.globalAlpha = 1;
  return c;
};

// --- colonna con torcia (piano intermedio) ---
const column = (torch: boolean) => {
  const [c, x] = mk(40, FLOOR);
  R(x, "#231f33", 8, 0, 24, FLOOR);
  R(x, "#2e2942", 10, 0, 6, FLOOR); R(x, "#3b3554", 11, 0, 2, FLOOR); R(x, "#1a1727", 28, 0, 4, FLOOR);
  for (let y = 16; y < FLOOR - 20; y += 22) R(x, "#1c1929", 8, y, 24, 1);
  R(x, "#2b2640", 4, 0, 32, 12); R(x, "#3a3452", 4, 10, 32, 2); R(x, "#15121f", 4, 12, 32, 2);
  R(x, "#2b2640", 4, FLOOR - 14, 32, 14); R(x, "#3a3452", 4, FLOOR - 14, 32, 2);
  if (torch) { R(x, "#3d2b1e", 18, 92, 4, 14); R(x, "#5a4030", 15, 90, 10, 3); R(x, "#24170f", 19, 106, 2, 6); }
  return c;
};

// --- pavimento di pietra (si ripete ogni 64px) ---
const floorTile = (metal: boolean) => {
  const W = 64, H = VH - FLOOR, [c, x] = mk(W, H);
  if (metal) {
    R(x, "#151d20", 0, 0, W, H); R(x, "#3c5559", 0, 0, W, 1); R(x, "#24333a", 0, 1, W, 2);
    for (let i = 0; i < W; i += 4) R(x, "#0e1416", i, 4, 1, H);
    for (let y = 6; y < H; y += 6) R(x, "#1c272b", 0, y, W, 1);
    R(x, "#0b1012", 31, 0, 2, H);
  } else {
    R(x, "#221d30", 0, 0, W, H); R(x, "#5b5272", 0, 0, W, 1); R(x, "#3a3350", 0, 1, W, 1);
    for (let row = 0; row < 4; row++) {
      const y = 3 + row * 11, o = row % 2 ? 16 : 0;
      for (let i = -1; i < 3; i++) {
        const bx = i * 32 + o; R(x, rnd(row * 7 + i + 3) > 0.5 ? "#2a2439" : "#262134", bx + 1, y, 30, 10);
        R(x, "#30293f", bx + 1, y, 30, 1);
      }
    }
  }
  return c;
};

// --- sala del reattore: vasca di mako, tubi, passerelle ---
const arenaBack = () => {
  const [c, x] = mk(ARENA_W + 200, FLOOR);
  R(x, "#0a1012", 0, 0, ARENA_W + 200, FLOOR);
  for (let i = 0; i < ARENA_W + 200; i += 48) {
    R(x, "#0f181b", i + 1, 0, 46, FLOOR); R(x, "#13202a", i + 1, 0, 1, FLOOR);
    for (let y = 30; y < FLOOR; y += 60) { R(x, "#1b2a30", i + 4, y, 2, 2); R(x, "#1b2a30", i + 42, y, 2, 2); }
  }
  // tubi orizzontali
  [[34, 6], [52, 3], [176, 5]].forEach(([y, h]) => { R(x, "#1f3036", 0, y, ARENA_W + 200, h); R(x, "#36525a", 0, y, ARENA_W + 200, 1); R(x, "#0b1214", 0, y + h, ARENA_W + 200, 1); });
  // la grande vasca di mako al centro
  const cx = (ARENA_W + 200) / 2, tw = 84, ty = 46, th = 150;
  const g = x.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
  g.addColorStop(0, "#0e3b2c"); g.addColorStop(0.3, "#1f8f63"); g.addColorStop(0.5, "#4dffb0"); g.addColorStop(0.7, "#1f8f63"); g.addColorStop(1, "#0e3b2c");
  x.fillStyle = g; x.fillRect(cx - tw / 2, ty, tw, th);
  // sagoma nella vasca
  x.fillStyle = "rgba(6,30,22,.75)";
  x.beginPath(); x.ellipse(cx, ty + 52, 9, 11, 0, 0, 7); x.fill(); x.fillRect(cx - 12, ty + 62, 24, 46); x.fillRect(cx - 18, ty + 66, 6, 30); x.fillRect(cx + 12, ty + 66, 6, 30);
  for (let i = 0; i < 18; i++) R(x, "#b8ffe0", cx - 36 + rnd(i * 3) * 72, ty + 10 + rnd(i * 5) * (th - 20), 1, 2);
  R(x, "#33464c", cx - tw / 2 - 8, ty - 14, tw + 16, 14); R(x, "#56747c", cx - tw / 2 - 8, ty - 14, tw + 16, 2);
  R(x, "#33464c", cx - tw / 2 - 8, ty + th, tw + 16, 16); R(x, "#56747c", cx - tw / 2 - 8, ty + th, tw + 16, 2);
  for (let i = 0; i < 5; i++) R(x, "#26363b", cx - tw / 2 + 4 + i * 19, ty, 2, th);
  // passerelle laterali
  [[40, 130], [ARENA_W + 200 - 200, 130]].forEach(([px, py]) => {
    R(x, "#1b282c", px, py, 160, 4); R(x, "#3f5a61", px, py, 160, 1);
    for (let i = 0; i < 160; i += 10) R(x, "#1b282c", px + i, py - 14, 1, 14);
    R(x, "#2b3e44", px, py - 14, 160, 1);
  });
  return c;
};

export interface Stage { draw(x: C2, camX: number, W: number, t: number, gate: number, inArena: boolean): void; fore(x: C2, camX: number, W: number, t: number): void }

export const makeStage = (): Stage => {
  const far = farTile(), colT = column(true), col = column(false), fl = floorTile(false), flM = floorTile(true), arena = arenaBack();
  const torches: number[] = []; for (let i = 0; i < 12; i++) torches.push(140 + i * 180);
  const motes = Array.from({ length: 40 }, (_, i) => ({ x: rnd(i) * ARENA_W, y: rnd(i + 50) * FLOOR, s: 6 + rnd(i + 99) * 14 }));
  const flame = (x: C2, fx: number, fy: number, t: number, i: number) => {
    const f = Math.floor(t * 12 + i * 3) % 4, h = [7, 9, 8, 10][f], w = [5, 4, 5, 4][f];
    R(x, "#ff5a1f", fx - w / 2, fy - h, w, h); R(x, "#ffb13b", fx - w / 2 + 1, fy - h + 2, w - 2, h - 2); R(x, "#fff3b0", fx - 1, fy - 3, 2, 3);
    if (f % 2) R(x, "#ff8a2a", fx - 1 + (f - 2), fy - h - 2, 1, 2);
  };
  const glow = (x: C2, gx: number, gy: number, r: number, col: string, a: number) => {
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, col.replace("A", String(a))); g.addColorStop(1, col.replace("A", "0"));
    x.fillStyle = g; x.fillRect(gx - r, gy - r, r * 2, r * 2);
  };
  return {
    draw(x, camX, W, t, gate, inArena) {
      // cielo/fondo
      const sky = x.createLinearGradient(0, 0, 0, FLOOR);
      sky.addColorStop(0, "#07060f"); sky.addColorStop(1, "#151126");
      x.fillStyle = sky; x.fillRect(0, 0, W, VH);
      // muro lontano (parallasse 0.4)
      const fx = -((camX * 0.4) % 192) - 192;
      for (let px = fx; px < W; px += 192) x.drawImage(far, Math.round(px), 0);
      // sala del reattore (sostituisce il muro quando ci si arriva)
      const ax = ARENA_X - 100 - camX;
      if (ax < W) {
        x.drawImage(arena, Math.round(ax), 0);
        x.globalCompositeOperation = "lighter";
        glow(x, ax + (ARENA_W + 200) / 2, 120, 150, "rgba(60,255,170,A)", 0.16 + Math.sin(t * 2) * 0.03);
        motes.forEach((m, i) => {
          const my = (m.y - t * m.s) % FLOOR, py = my < 0 ? my + FLOOR : my;
          R(x, i % 3 ? "#2a7a5a" : "#5dffbf", ax + 100 + m.x + Math.sin(t + i) * 3, py, 1, 1);
        });
        x.globalCompositeOperation = "source-over";
      }
      // colonne e torce (parallasse 1)
      for (let i = 0; i < torches.length; i++) {
        const cx = torches[i] - camX; if (cx < -60 || cx > W + 20 || torches[i] > CORR_END - 40) continue;
        x.drawImage(i % 2 ? col : colT, Math.round(cx - 20), 0);
      }
      x.globalCompositeOperation = "lighter";
      for (let i = 0; i < torches.length; i += 2) {
        const cx = torches[i] - camX; if (cx < -80 || cx > W + 80 || torches[i] > CORR_END - 40) continue;
        glow(x, cx, 84, 70 + Math.sin(t * 9 + i) * 3, "rgba(255,140,60,A)", 0.22);
      }
      x.globalCompositeOperation = "source-over";
      for (let i = 0; i < torches.length; i += 2) {
        const cx = torches[i] - camX; if (cx < -20 || cx > W + 20 || torches[i] > CORR_END - 40) continue;
        flame(x, Math.round(cx), 90, t, i);
      }
      // portone fra corridoio e sala, con la luce verde che filtra
      const gx = CORR_END - camX;
      if (gx > -120 && gx < W + 120) {
        if (!inArena) { x.globalCompositeOperation = "lighter"; glow(x, gx + 30, 170, 110, "rgba(70,255,170,A)", 0.25); x.globalCompositeOperation = "source-over"; }
        R(x, "#1d1a2a", gx - 18, 0, 18, FLOOR); R(x, "#2c2740", gx - 18, 0, 3, FLOOR);
        R(x, "#1d1a2a", gx + 60, 0, 18, FLOOR); R(x, "#2c2740", gx + 60, 0, 3, FLOOR);
        R(x, "#2a2540", gx - 22, 60, 104, 14); R(x, "#3d3758", gx - 22, 60, 104, 2);
        // grata che cala
        const gh = Math.round((FLOOR - 74) * gate);
        for (let i = 0; i < 6; i++) R(x, "#3a3f4a", gx + 2 + i * 10, 74, 3, gh);
        for (let y = 74 + 12; y < 74 + gh; y += 24) R(x, "#4a505c", gx, y, 60, 3);
        if (gh > 6) for (let i = 0; i < 6; i++) R(x, "#8a92a3", gx + 2 + i * 10, 74 + gh - 4, 3, 4);
      }
      // pavimento
      const lx = -((camX % 64) + 64) % 64 - 64;
      for (let px = lx; px < W; px += 64) {
        const wx = px + camX;
        x.drawImage(wx > CORR_END + 20 ? flM : fl, Math.round(px), FLOOR);
      }
    },
    fore(x, camX, W, t) {
      // primo piano: catene e travi scure con parallasse > 1
      for (let i = 0; i < 9; i++) {
        const wx = 300 + i * 290, sx = wx - camX * 1.3;
        if (sx < -30 || sx > W + 30) continue;
        const sw = Math.sin(t * 1.2 + i) * 2;
        for (let y = 0; y < 40 + (i % 3) * 18; y += 4) R(x, "#05040a", sx + (y / 40) * sw, y, 3, 3);
      }
    },
  };
};
