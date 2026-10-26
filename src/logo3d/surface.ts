// Microtexture periodica, generata una volta come quelle del podio: smalto satinato e metallo spazzolato.
// R: grana del colore; GB: normale tangente; A: variazione della rugosità. Le mip eliminano lo scintillio da lontano.
export function bakeSurface(size = 256): Uint8Array[] {
  const height = new Float32Array(size * size);
  let seed = 73;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    height[y * size + x] = seed / 4294967296 * 0.65 + 0.35 * Math.sin(x / size * Math.PI * 48);
  }
  let data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4, h = at(x, y);
    data[o] = Math.round(128 + h * 90);
    data[o + 1] = Math.round(128 + (at(x - 1, y) - at(x + 1, y)) * 70);
    data[o + 2] = Math.round(128 + (at(x, y - 1) - at(x, y + 1)) * 70);
    data[o + 3] = Math.round(128 + h * 65);
  }
  const levels = [data];
  for (let s = size / 2; s >= 1; s /= 2) {
    const next = new Uint8Array(s * s * 4), prev = s * 2;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) for (let c = 0; c < 4; c++) {
      const o = (2 * y * prev + 2 * x) * 4 + c;
      next[(y * s + x) * 4 + c] = Math.round((data[o] + data[o + 4] + data[o + prev * 4] + data[o + prev * 4 + 4]) / 4);
    }
    levels.push(next); data = next;
  }
  return levels;
}
