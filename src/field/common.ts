// Parti comuni del campo elettrico (FieldGlow in 2D, Backdrop3D nel preset Cinema): cariche, colori e dispositivo WebGPU.

export type RGB = number[];
export const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// colori delle cariche per sezione e tema: positiva, negativa (chiaro, scuro). Sul chiaro sono toni pieni da inchiostro,
// sul fondo scuro luci
export const PAL: Record<string, [string, string][]> = {
  home: [["#0A7A6B", "#C27C00"], ["#33D1BA", "#F4B73F"]],
  write: [["#0A7A6B", "#A2541C"], ["#33D1BA", "#E39459"]],
  archive: [["#6A45AD", "#B0365E"], ["#C0A5FA", "#F6A0BA"]],
  authors: [["#0A7A6B", "#0369A1"], ["#33D1BA", "#38BDF8"]],
  podio: [["#B87700", "#A2541C"], ["#F4B73F", "#E39459"]],
};
export const palette = (kind: string, dark: boolean): RGB[] => (PAL[kind] || PAL.home)[dark ? 1 : 0].map(hex);

// orbite lente delle cariche: segno, centro, ampiezza e periodo in secondi (in frazioni della larghezza e dell'altezza)
export const ORB = [
  { q: 1, c: [0.2, 0.24], a: [0.17, 0.14], p: [61, 43] },
  { q: -1, c: [0.8, 0.3], a: [0.16, 0.18], p: [71, 52] },
  { q: 1, c: [0.7, 0.82], a: [0.2, 0.12], p: [54, 78] },
  { q: -1, c: [0.28, 0.74], a: [0.15, 0.17], p: [84, 59] },
];
export const orbPhases = () => ORB.map(() => [Math.random() * 6.28, Math.random() * 6.28]);
export const orbAt = (i: number, t: number, ph: number[][]) => {
  const o = ORB[i];
  return [o.c[0] + o.a[0] * Math.sin((t * Math.PI * 2) / o.p[0] + ph[i][0]), o.c[1] + o.a[1] * Math.sin((t * Math.PI * 2) / o.p[1] + ph[i][1])];
};

// un dispositivo WebGPU tutto per lo sfondo, chiesto una volta per sessione e per tipo di GPU. Il campo 2D si accontenta
// della GPU integrata; il preset Cinema chiede quella più potente. Un adattatore software non vale la pena: restano le
// luci fisse dello sfondo
const devices: Record<string, Promise<GPUDevice | null>> = {};
// soft: accetta anche l'adattatore software (le scintille negli emulatori, per provarle in locale senza GPU)
export const fieldDevice = (power: GPUPowerPreference = "low-power", soft = false) => { const key = soft ? `${power}+soft` : power; return devices[key] || (devices[key] = (async () => {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const ad = await navigator.gpu.requestAdapter({ powerPreference: power });
  const info: any = (ad as any)?.info || {};
  if (!ad || (!soft && (info.isFallbackAdapter || (ad as any).isFallbackAdapter))) return null;
  const d = await ad.requestDevice({ label: `sfondo-${power}` });
  d.lost.then(() => { delete devices[key]; });
  return d;
})().catch(() => null)); };

export const webgpuReady = () => typeof navigator !== "undefined" && !!(navigator as any).gpu;
