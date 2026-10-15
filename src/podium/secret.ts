import { ROOM, WINDOW, type Cam } from './stage';

// The two inner columns of glass, top to bottom, left then right at each height.
// Intersect the actual glass plane: remains accurate during parallax, drag and resizing.
export function pickSecretPane(c: Cam, x: number, y: number): number {
  const k = 2 * c.tan / c.h;
  const ray = c.fwd.map((v, i) => v + c.right[i] * (x - c.cx) * k - c.up[i] * (y - c.cy) * k);
  if (ray[2] >= -1e-6) return -1;
  const t = (ROOM.back - WINDOW.depth / 2 - c.pos[2]) / ray[2];
  if (t <= 0) return -1;
  const px = c.pos[0] + t * ray[0], py = c.pos[1] + t * ray[1];
  const b = WINDOW.bar, inner = WINDOW.cols[2];
  if (Math.abs(px) <= b || Math.abs(px) >= inner - b) return -1;
  let row = -1;
  if (py > WINDOW.ya + b && px * px + (py - WINDOW.ya) ** 2 < (WINDOW.r * WINDOW.ring - b) ** 2) row = 0;
  else if (py > WINDOW.rows[0] + b && py < WINDOW.ya - b) row = 1;
  else if (py > WINDOW.y0 + WINDOW.frame && py < WINDOW.rows[0] - b) row = 2;
  return row < 0 ? -1 : row * 2 + (px > 0 ? 1 : 0);
}

export class WindowSecret {
  progress = 0;
  revealed = false;
  reset() { this.progress = 0; this.revealed = false; }
  tap(pane: number, dark: boolean) {
    if (!dark) { this.reset(); return false; }
    if (this.revealed) return false;
    this.progress = pane === this.progress ? this.progress + 1 : pane === 0 ? 1 : 0;
    if (this.progress !== 6) return false;
    this.revealed = true;
    return true;
  }
}
