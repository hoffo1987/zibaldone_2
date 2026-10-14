// Tangenti limitate: una curva non supera le inquadrature ai cambi di direzione.
// Hermite di quinto grado mantiene anche l'accelerazione continua tra le chiavi.
export type Key = { t: number; v: number[]; hold?: boolean; still?: number[] };
export const track = (keys: Key[]) => {
  const tangents = keys.map((key, i) => key.v.map((_, axis) => {
    if (key.hold || !i || i === keys.length - 1 || key.still?.includes(axis)) return 0;
    const before = keys[i - 1], after = keys[i + 1];
    const a = (key.v[axis] - before.v[axis]) / (key.t - before.t);
    const b = (after.v[axis] - key.v[axis]) / (after.t - key.t);
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  }));
  return (t: number): number[] => {
    if (t <= keys[0].t) return keys[0].v.slice();
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v.slice();
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1], h = b.t - a.t, s = (t - a.t) / h;
    const s2 = s * s, s3 = s2 * s, s4 = s3 * s, s5 = s4 * s;
    const blend = 10 * s3 - 15 * s4 + 6 * s5;
    const leave = s - 6 * s3 + 8 * s4 - 3 * s5, arrive = -4 * s3 + 7 * s4 - 3 * s5;
    return a.v.map((v, axis) => v * (1 - blend) + b.v[axis] * blend + h * (leave * tangents[i][axis] + arrive * tangents[i + 1][axis]));
  };
};

// Un impulso parte da zero: il ritmo muove la camera senza un salto al primo frame.
export const impulse = (t: number, at: number) => {
  const age = t - at;
  return age < 0 || age > 0.65 ? 0 : Math.sin(Math.PI * age / 0.65) * Math.exp(-age * 7);
};
