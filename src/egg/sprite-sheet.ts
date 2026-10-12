/** Bitmap art and its exposure timings are independent of the gameplay skeleton. */
export interface SpriteFrame {
  rect: [number, number, number, number];
  anchor: [number, number];
}
export interface SpriteSheet { src: string; frames: Record<string, SpriteFrame> }
export interface Cel { t: number; frame: string; offset?: [number, number] }
export interface CelAnimation { len: number; loop?: boolean; cels?: Cel[] }
export type SpriteImages = Record<string, HTMLImageElement>;

export function celIndex(animation: CelAnimation, time: number): number {
  const { cels, len, loop } = animation;
  if (!cels?.length) return 0;
  const t = loop ? ((time % len) + len) % len : Math.max(0, Math.min(time, len));
  let index = 0;
  while (index < cels.length - 1 && cels[index + 1].t <= t + 1e-9) index++;
  return index;
}

/** Step between actual exposures; never step beyond a held, non-looping pose. */
export function stepCel(animation: CelAnimation, time: number, direction: number): number {
  const cels = animation.cels;
  if (!cels?.length) return time;
  let index = celIndex(animation, time) + direction;
  index = animation.loop ? (index + cels.length) % cels.length : Math.max(0, Math.min(index, cels.length - 1));
  return cels[index].t;
}

export function drawCel(ctx: CanvasRenderingContext2D, image: HTMLImageElement, sheet: SpriteSheet, cel: Cel, x: number, y: number) {
  const frame = sheet.frames[cel.frame];
  if (!frame) throw new Error(`Unknown sprite frame: ${cel.frame}`);
  const [sx, sy, w, h] = frame.rect, [ax, ay] = frame.anchor;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, w, h, Math.round(x - ax + (cel.offset?.[0] || 0)), Math.round(y - ay + (cel.offset?.[1] || 0)), w, h);
}

const pending = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = pending.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const finish = (error?: Error) => {
      clearTimeout(timeout); image.onload = image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    const timeout = setTimeout(() => finish(new Error("Sprite loading timed out")), 15000);
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Unable to load sprite sheet"));
    image.src = src;
  });
  pending.set(src, promise);
  // A failed request may be retried from the loading screen.
  promise.catch(() => pending.delete(src));
  return promise;
}

export async function loadSpriteSheets(sheets: SpriteSheet[]): Promise<SpriteImages> {
  const images: SpriteImages = {};
  await Promise.all(sheets.map(async sheet => { images[sheet.src] = await loadImage(sheet.src); }));
  return images;
}
