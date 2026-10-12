// Pezzi di corpo riutilizzabili da tutti i personaggi
import { Raster, Arm, Leg, Ramp, V, along, lerpV, frameAt } from "./rig";

export interface LegLook { th: [number, number]; sh: [number, number]; boot: number; bw: [number, number]; rT: Ramp; rS: Ramp; rB: Ramp; foot: number[]; cuff?: Ramp }
export const drawLeg = (r: Raster, L: Leg, o: LegLook, g: number, dim = 0) => {
  r.limb(L.h, L.k, o.th[0], o.th[1], o.rT, g, dim);
  const bt = lerpV(L.k, L.a, o.boot);
  r.limb(L.k, bt, o.sh[0], o.sh[1], o.rS, g, dim);
  r.limb(bt, L.a, o.bw[0], o.bw[1], o.rB, g, dim);
  r.poly(frameAt(L.a, L.fa), o.foot, o.rB, g, { dim });
  if (o.cuff) r.limb(bt, along(bt, L.a2, 1.2), o.bw[0] + 0.8, o.bw[0] + 0.6, o.cuff, g, dim, 0);
};

export interface ArmLook { u: [number, number]; l: [number, number]; rU: Ramp; rL: Ramp; rH: Ramp; cuff?: number; rC?: Ramp; cw?: number; fist?: number }
export const drawArm = (r: Raster, A: Arm, o: ArmLook, g: number, dim = 0) => {
  r.limb(A.s, A.e, o.u[0], o.u[1], o.rU, g, dim);
  if (o.cuff != null && o.rC) {
    const c = lerpV(A.e, A.w, o.cuff);
    r.limb(A.e, c, o.l[0], o.l[1], o.rL, g, dim);
    r.limb(c, A.w, o.cw || o.l[1] + 0.6, (o.cw || o.l[1] + 0.6) - 0.4, o.rC, g, dim);
  } else r.limb(A.e, A.w, o.l[0], o.l[1], o.rL, g, dim);
  const f = o.fist || 3.6;
  r.limb(A.w, along(A.w, A.a2, 1.6), f, f - 0.6, o.rH, g, dim);
};

// telo (code del cappotto, ciocche): segmenti a sezione cilindrica, giunti arrotondati e orlo dritto
export const drawStrip = (r: Raster, pts: V[], w0: number, w1: number, rp: Ramp, g: number, dim = 0) => {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = w0 + ((w1 - w0) * i) / n, b = w0 + ((w1 - w0) * (i + 1)) / n;
    r.limb(pts[i], pts[i + 1], a, b, rp, g, dim, i ? 1 : 0);
  }
};

// lama generica: impugnatura + guardia + lama, ombreggiata a fasce (filo chiaro, dorso scuro)
export interface BladeLook {
  pommel: [number, number, Ramp]; grip: [number, number, number, Ramp]; guard: [number, number, number, Ramp];
  blade: number[]; rB: Ramp; edge: number; spine: number; holes?: [number, number][]; fuller?: [number, number];
}
export const drawBlade = (r: Raster, at: V, ang: number, o: BladeLook, g: number) => {
  const F = frameAt(at, ang);
  r.limb(along(at, ang, o.grip[0]), along(at, ang, o.grip[1]), o.grip[2], o.grip[2], o.grip[3], g);
  r.limb(along(at, ang, o.pommel[0]), along(at, ang, o.pommel[0] - 0.5), o.pommel[1], o.pommel[1], o.pommel[2], g);
  const [g0, g1, gw, gr] = o.guard;
  r.poly(F, [g0, -gw, g1, -gw, g1, gw, g0, gw], gr, g, { sh: "cy" });
  r.poly(F, o.blade, o.rB, g, {
    fn: (X, Y) => {
      if (o.holes && o.holes.some(([hx, hr]) => Math.hypot(X - hx, Y) < hr)) return 0;
      if (Y > o.edge) return 3;
      if (Y < o.spine) return 1;
      if (o.fuller && X > o.fuller[0] && X < o.fuller[1] && Math.abs(Y + 0.2) < 0.7) return 1;
      return 2;
    },
  });
};
