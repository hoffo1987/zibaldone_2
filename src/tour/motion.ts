// Tangenti limitate: una curva non supera le inquadrature ai cambi di direzione.
// Hermite di quinto grado mantiene anche l'accelerazione continua tra le chiavi.
// d: velocità imposta in quella chiave (unità al secondo, per asse): la camera ci passa senza fermarsi.
// extend: dopo l'ultima chiave si prosegue con la sua velocità invece di restare fermi.
export type Key = { t: number; v: number[]; hold?: boolean; still?: number[]; d?: (number | undefined)[] };
export const track = (keys: Key[], extend = false) => {
  const tangents = keys.map((key, i) => key.v.map((_, axis) => {
    const forced = key.d?.[axis];
    if (forced != null) return forced;
    if (key.hold || !i || i === keys.length - 1 || key.still?.includes(axis)) return 0;
    const before = keys[i - 1], after = keys[i + 1];
    const a = (key.v[axis] - before.v[axis]) / (key.t - before.t);
    const b = (after.v[axis] - key.v[axis]) / (after.t - key.t);
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  }));
  const first = keys[0], last = keys[keys.length - 1], lastD = tangents[keys.length - 1];
  return (t: number): number[] => {
    if (t <= first.t) return first.v.slice();
    if (t >= last.t) return extend ? last.v.map((v, axis) => v + lastD[axis] * (t - last.t)) : last.v.slice();
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

// Passaggio tra due inquadrature: parte e arriva con velocità e accelerazione nulle, ma non è simmetrico.
// È la funzione beta regolarizzata I_s(a, b): con a < b lo scatto è nella prima parte e l'arrivo è una lunga coda morbida,
// come un operatore che lancia la camera e la lascia posare. Il picco di velocità cade a (a - 1) / (a + b - 2).
const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
export const glide = (s: number, a = 3, b = 5) => {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const n = a + b - 1;
  let sum = 0;
  for (let j = a; j <= n; j++) sum += binom(n, j) * Math.pow(s, j) * Math.pow(1 - s, n - j);
  return sum;
};

// Regia per inquadrature: ogni inquadratura è viva (orbita, deriva, si avvicina) e il passaggio alla successiva
// fonde le due mentre entrambe continuano a muoversi. Così la camera non è mai ferma: all'arrivo ha già la velocità
// dell'inquadratura nuova, alla partenza conserva quella della vecchia.
export type Shot = (t: number) => number[];
export type Blend = { at: number; len: number; shot: Shot; a?: number; b?: number };
export const direct = (first: Shot, blends: Blend[]) => (t: number): number[] => {
  let v = first(t);
  for (const c of blends) {
    if (t <= c.at) break;
    const w = c.shot(t), e = glide((t - c.at) / c.len, c.a ?? 3, c.b ?? 5);
    v = e >= 1 ? w : v.map((x, i) => x + (w[i] - x) * e);
  }
  return v;
};

// Inerzia di una camera vera (sistema del secondo ordine): f frequenza propria in Hz, z smorzamento, r risposta.
// Con r > 1 a velocità costante il ritardo quasi sparisce; restano solo un piccolo sorpasso e l'assestamento
// quando il movimento cambia. dt troppo grande o negativo (scheda in pausa, film riavviato): si riparte dal bersaglio.
export const follower = (f: number, z: number, r: number) => {
  const w = 2 * Math.PI * f, k1 = z / (Math.PI * f), k2 = 1 / (w * w), k3 = (r * z) / w;
  let y: number[] | null = null, yd: number[] = [], xp: number[] = [];
  const reset = (x: number[]) => { y = x.slice(); yd = x.map(() => 0); xp = x.slice(); return x.slice(); };
  return {
    reset,
    step: (x: number[], dt: number): number[] => {
      if (!y || dt < 0 || dt > 0.12) return reset(x);
      if (dt === 0) return y.slice();
      // con fotogrammi lunghi il sistema resta stabile (Euler semi-implicito con k2 minimo)
      const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
      for (let i = 0; i < x.length; i++) {
        const xd = (x[i] - xp[i]) / dt;
        y[i] += dt * yd[i];
        yd[i] += (dt * (x[i] + k3 * xd - y[i] - k1 * yd[i])) / k2s;
      }
      xp = x.slice();
      return y.slice();
    },
  };
};

// Tremolio della camera a mano: tre seni a frequenze non multiple tra loro, regolare ma mai ripetitivo (da -1 a 1).
export const wander = (t: number, seed: number) =>
  Math.sin(t * 1.13 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 4.07 + seed * 2.9) * 0.2;

// Una molla colpita: oscilla e si spegne (0 prima del colpo). Serve alle lettere che ballano sul ritmo.
export const jiggle = (age: number, hz = 4.6, decay = 6.5) => (age < 0 ? 0 : Math.exp(-age * decay) * Math.sin(2 * Math.PI * hz * age));
