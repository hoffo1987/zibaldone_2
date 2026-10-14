// Shader WGSL della sala del podio. Tutta la scena è fatta di forme analitiche (scatole, cilindri, calici, piani, il
// finestrone ad arco) intersecate in forma chiusa e raggruppate in volumi di contenimento.
//  - shadow: tutta la luce dell'astro entra dal finestrone, quindi la sua visibilità si può tabulare sul piano del vetro:
//    per ogni punto del vetro, quanta luce passa (telaio, nuvole) e fin dove arriva nella sala prima di un ostacolo.
//    Ogni punto della sala si illumina con una lettura di texture e un confronto (ombre, fasci, rimbalzi);
//  - gi: illuminazione globale dinamica, una griglia di sonde (cubo ambientale) aggiornata a ogni fotogramma tracciando
//    raggi stratificati; riusando il fotogramma precedente i rimbalzi diventano multipli;
//  - fsVol: fasci di luce nel pulviscolo, a metà risoluzione, accumulati nel tempo (la camera è ferma: niente scie);
//  - fsMain: materiali, luce diretta con penombra, illuminazione globale, riflessi tracciati (pavimento, metalli);
//  - fsPresent: FXAA sull'immagine finale.
import { BOXES, CYLS, SPHS, ROOM, WINDOW, CARPET, BANNERS, PODIUM_PRIMS, M } from "./stage";

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : x.toFixed(4));
const v3 = (a: number[]) => `vec3f(${a.map(f).join(", ")})`;
const v4 = (a: number[]) => `vec4f(${a.map(f).join(", ")})`;
export const GI_DIM = [18, 10, 16], GI_MIN = [-8.6, 0.2, -6.6], GI_MAX = [8.6, 11.6, 13];
export const GI_PROBES = GI_DIM[0] * GI_DIM[1] * GI_DIM[2];
export const GI_RAYS = 8;
export const SHADOW_DIM = [512, 640];
const SMIN = [-WINDOW.r, WINDOW.y0], SMAX = [WINDOW.r, WINDOW.ya + WINDOW.r];
export const U_FLOATS = 19 * 4;
const NB = BOXES.length, NC = CYLS.length, NS = SPHS.length, PB = PODIUM_PRIMS.boxes, PC = PODIUM_PRIMS.cyls;
// il colonnato: metà a sinistra, metà a destra
const LB = PB + (NB - PB) / 2, LC = PC + (NC - PC) / 2;

const common = /* wgsl */ `
struct U {
  cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f,      // camera; w: tan(fov/2), centro ottico x, y, altezza di riferimento (px)
  sun: vec4f, sunCol: vec4f, skyTop: vec4f, skyHor: vec4f, // astro (dir, intensità), colore e notte, cielo (w: esposizione, luce minima)
  wall: vec4f, wainscot: vec4f, tileA: vec4f, tileB: vec4f, stone: vec4f, dark: vec4f, column: vec4f, carpet: vec4f, banner: vec4f, frameC: vec4f,
  res: vec4f,                                            // risoluzione dell'immagine e dei fasci
};
// w dei colori: nebbia, pulviscolo, nuvole, tempo, fotogramma, passi della nebbia, fusione temporale
@group(0) @binding(0) var<uniform> u: U;

const PI = 3.14159265;
var<private> BOXC: array<vec4f, ${NB}> = array<vec4f, ${NB}>(${BOXES.map((b) => v4([...b.c, b.m])).join(", ")});
var<private> BOXH: array<vec3f, ${NB}> = array<vec3f, ${NB}>(${BOXES.map((b) => v3(b.h)).join(", ")});
var<private> CYLA: array<vec4f, ${NC}> = array<vec4f, ${NC}>(${CYLS.map((c) => v4([...c.c, c.r])).join(", ")});
var<private> CYLB: array<vec2f, ${NC}> = array<vec2f, ${NC}>(${CYLS.map((c) => `vec2f(${f(c.h)}, ${f(c.m)})`).join(", ")});
var<private> SPHA: array<vec4f, ${NS}> = array<vec4f, ${NS}>(${SPHS.map((s) => v4([...s.c, s.r])).join(", ")});
var<private> SPHB: array<vec2f, ${NS}> = array<vec2f, ${NS}>(${SPHS.map((s) => `vec2f(${f(s.cut)}, ${f(s.m)})`).join(", ")});
const RX = ${f(ROOM.x)}; const RY = ${f(ROOM.y)}; const RB = ${f(ROOM.back)}; const RF = ${f(ROOM.front)};
const WR = ${f(WINDOW.r)}; const WY0 = ${f(WINDOW.y0)}; const WYA = ${f(WINDOW.ya)}; const WBAR = ${f(WINDOW.bar)}; const WFR = ${f(WINDOW.frame)}; const WRING = ${f(WINDOW.ring)};
var<private> WCOL: array<f32, ${WINDOW.cols.length}> = array<f32, ${WINDOW.cols.length}>(${WINDOW.cols.map(f).join(", ")});
var<private> WROW: array<f32, ${WINDOW.rows.length}> = array<f32, ${WINDOW.rows.length}>(${WINDOW.rows.map(f).join(", ")});
const SMIN = vec2f(${f(SMIN[0])}, ${f(SMIN[1])}); const SMAX = vec2f(${f(SMAX[0])}, ${f(SMAX[1])}); const SDIM = vec2f(${f(SHADOW_DIM[0])}, ${f(SHADOW_DIM[1])});
const GD = vec3u(${GI_DIM.join("u, ")}u); const GMIN = ${v3(GI_MIN)}; const GMAX = ${v3(GI_MAX)};
const M_FLOOR = ${M.floor}u; const M_WALL = ${M.wall}u; const M_CEIL = ${M.ceiling}u; const M_SKY = ${M.sky}u; const M_FRAME = ${M.frame}u; const M_GOLD = ${M.gold}u;

// ---- rumore ----
fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn noise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1, 0)), w.x), mix(hash2(i + vec2f(0, 1)), hash2(i + vec2f(1, 1)), w.x), w.y);
}
fn noise3(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash3(i), hash3(i + vec3f(1, 0, 0)), w.x), mix(hash3(i + vec3f(0, 1, 0)), hash3(i + vec3f(1, 1, 0)), w.x), w.y);
  let b = mix(mix(hash3(i + vec3f(0, 0, 1)), hash3(i + vec3f(1, 0, 1)), w.x), mix(hash3(i + vec3f(0, 1, 1)), hash3(i + vec3f(1, 1, 1)), w.x), w.y);
  return mix(a, b, w.z);
}
fn fbm2(p: vec2f) -> f32 { return 0.55 * noise2(p) + 0.3 * noise2(p * 2.07 + 13.1) + 0.15 * noise2(p * 4.13 + 7.7); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

// ---- intersezioni ----
struct Hit { t: f32, n: vec3f, m: u32, prim: i32, p: vec3f };
fn boxT(ro: vec3f, rd: vec3f, c: vec3f, h: vec3f) -> vec4f {
  let m = 1.0 / rd; let n = m * (ro - c); let k = abs(m) * h;
  let t1 = -n - k; let t2 = -n + k;
  let tN = max(max(t1.x, t1.y), t1.z); let tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tN < 0.0) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  return vec4f(tN, -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz));
}
// il raggio attraversa il volume prima di tmax? (anche partendo da dentro)
fn aabb(ro: vec3f, rd: vec3f, c: vec3f, h: vec3f, tmax: f32) -> bool {
  let m = 1.0 / rd; let n = m * (ro - c); let k = abs(m) * h;
  let tN = max(max(-n.x - k.x, -n.y - k.y), -n.z - k.z); let tF = min(min(-n.x + k.x, -n.y + k.y), -n.z + k.z);
  return tN <= tF && tF > 0.0 && tN < tmax;
}
// cilindro verticale senza tappi (sono sempre coperti da basi, capitelli, piedistalli e calici)
fn cylT(ro: vec3f, rd: vec3f, c: vec4f, hh: f32) -> vec4f {
  let oc = ro.xz - c.xz; let d = rd.xz;
  let a = dot(d, d); let b = dot(oc, d); let cc = dot(oc, oc) - c.w * c.w;
  let disc = b * b - a * cc;
  if (disc < 0.0 || a < 1e-8) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let t = (-b - sqrt(disc)) / a;
  if (t < 1e-4 || abs(ro.y + rd.y * t - c.y) > hh) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let q = (oc + d * t) / c.w;
  return vec4f(t, q.x, 0.0, q.y);
}
// calice: sfera aperta sopra la quota cut; se il primo punto cade nell'apertura si vede l'interno
fn cupT(ro: vec3f, rd: vec3f, c: vec4f, cut: f32) -> vec4f {
  let oc = ro - c.xyz; let b = dot(oc, rd); let h = b * b - (dot(oc, oc) - c.w * c.w);
  if (h < 0.0) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let s = sqrt(h);
  let t1 = -b - s;
  if (t1 > 1e-4) { let p = oc + rd * t1; if (p.y <= cut) { return vec4f(t1, p / c.w); } }
  let t2 = -b + s;
  if (t2 > 1e-4) { let p = oc + rd * t2; if (p.y <= cut) { return vec4f(t2, -p / c.w); } }
  return vec4f(-1.0, 0.0, 0.0, 0.0);
}
fn winSdf(q: vec2f) -> f32 {
  if (q.y > WYA) { return length(q - vec2f(0.0, WYA)) - WR; }
  return max(abs(q.x) - WR, WY0 - q.y);
}
// vetro libero (1) o telaio, montanti, traverse e raggiera (0); s: morbidezza del bordo
fn windowOpen(q: vec2f, s: f32) -> f32 {
  var m = 1.0 - smoothstep(-WFR - s, -WFR + s, winSdf(q));
  if (m <= 0.0) { return 0.0; }
  for (var i = 0; i < ${WINDOW.cols.length}; i++) { m *= smoothstep(WBAR - s, WBAR + s, abs(q.x - WCOL[i])); }
  for (var i = 0; i < ${WINDOW.rows.length}; i++) { m *= smoothstep(WBAR - s, WBAR + s, abs(q.y - WROW[i])); }
  m *= smoothstep(WBAR - s, WBAR + s, abs(q.y - WYA));
  if (q.y > WYA) { m *= smoothstep(WBAR - s, WBAR + s, abs(length(q - vec2f(0.0, WYA)) - WR * WRING)); }
  return m;
}
fn hitBox(ro: vec3f, rd: vec3f, i: i32, h: ptr<function, Hit>) {
  let b = boxT(ro, rd, BOXC[i].xyz, BOXH[i]);
  if (b.x > 1e-4 && b.x < (*h).t) { (*h).t = b.x; (*h).n = b.yzw; (*h).m = u32(BOXC[i].w); (*h).prim = i; }
}
fn hitCyl(ro: vec3f, rd: vec3f, i: i32, h: ptr<function, Hit>) {
  let b = cylT(ro, rd, CYLA[i], CYLB[i].x);
  if (b.x > 0.0 && b.x < (*h).t) { (*h).t = b.x; (*h).n = b.yzw; (*h).m = u32(CYLB[i].y); (*h).prim = -1; }
}
fn trace(ro: vec3f, rd: vec3f) -> Hit {
  var h: Hit; h.t = 1e9; h.m = 0u; h.prim = -1;
  // la sala è una scatola convessa: si esce dal primo piano incontrato
  var t = 1e9; var n = vec3f(0.0); var m = M_WALL;
  if (rd.y < 0.0) { let tt = -ro.y / rd.y; if (tt < t) { t = tt; n = vec3f(0, 1, 0); m = M_FLOOR; } }
  if (rd.y > 0.0) { let tt = (RY - ro.y) / rd.y; if (tt < t) { t = tt; n = vec3f(0, -1, 0); m = M_CEIL; } }
  if (rd.x > 0.0) { let tt = (RX - ro.x) / rd.x; if (tt < t) { t = tt; n = vec3f(-1, 0, 0); m = M_WALL; } }
  if (rd.x < 0.0) { let tt = (-RX - ro.x) / rd.x; if (tt < t) { t = tt; n = vec3f(1, 0, 0); m = M_WALL; } }
  if (rd.z > 0.0) { let tt = (RF - ro.z) / rd.z; if (tt < t) { t = tt; n = vec3f(0, 0, -1); m = M_WALL; } }
  if (rd.z < 0.0) {
    let tt = (RB - ro.z) / rd.z;
    if (tt < t) {
      t = tt; n = vec3f(0, 0, 1); m = M_WALL;
      let q = (ro + rd * tt).xy;
      if (winSdf(q) < 0.0) { m = select(M_FRAME, M_SKY, windowOpen(q, 0.0) > 0.5); }
    }
  }
  h.t = t; h.n = n; h.m = m;
  // podio e coppe
  if (aabb(ro, rd, vec3f(0.0, 1.8, 0.1), vec3f(4.6, 1.85, 2.0), h.t)) {
    for (var i = 0; i < ${PB}; i++) { hitBox(ro, rd, i, &h); }
    for (var i = 0; i < ${PC}; i++) { hitCyl(ro, rd, i, &h); }
    for (var i = 0; i < ${NS}; i++) {
      let b = cupT(ro, rd, SPHA[i], SPHB[i].x);
      if (b.x > 0.0 && b.x < h.t) { h.t = b.x; h.n = b.yzw; h.m = u32(SPHB[i].y); h.prim = -1; }
    }
  }
  // colonnato sinistro e destro
  if (aabb(ro, rd, vec3f(-6.0, 6.0, 1.1), vec3f(0.7, 6.0, 6.7), h.t)) {
    for (var i = ${PB}; i < ${LB}; i++) { hitBox(ro, rd, i, &h); }
    for (var i = ${PC}; i < ${LC}; i++) { hitCyl(ro, rd, i, &h); }
  }
  if (aabb(ro, rd, vec3f(6.0, 6.0, 1.1), vec3f(0.7, 6.0, 6.7), h.t)) {
    for (var i = ${LB}; i < ${NB}; i++) { hitBox(ro, rd, i, &h); }
    for (var i = ${LC}; i < ${NC}; i++) { hitCyl(ro, rd, i, &h); }
  }
  h.p = ro + rd * h.t;
  return h;
}

// ---- nuvole e cielo ----
fn clouds(q: vec2f) -> f32 {
  let w = vec2f(u.tileB.w * 0.045, u.tileB.w * 0.011);
  return smoothstep(0.36, 0.7, fbm2(q * 0.3 + w));
}
// trasmissione delle nuvole per la luce che attraversa il vetro nel punto q (piano delle nuvole oltre il vetro)
fn cloudT(q: vec2f, L: vec3f) -> f32 { return 1.0 - u.tileA.w * clouds(q + L.xy / -L.z * 7.0); }
fn sky(d: vec3f) -> vec3f {
  let night = u.sunCol.w; let L = u.sun.xyz;
  let up = saturate(d.y * 1.5 + 0.08);
  var c = mix(u.skyHor.rgb, u.skyTop.rgb, pow(up, 0.6));
  let q = d.xy / max(-d.z, 0.06) * 7.0;
  let cl = clouds(q);
  let cd = max(dot(d, L), 0.0);
  let lit = mix(vec3f(1.6, 1.55, 1.48), vec3f(0.006, 0.009, 0.016) + u.sunCol.rgb * 0.6 * pow(cd, 60.0), night);
  c = mix(c, lit * (0.75 + 0.25 * fbm2(q * 0.9 + 3.0)), cl * mix(0.85, 0.7, night));
  let disk = smoothstep(mix(0.99955, 0.99962, night), mix(0.9998, 0.99985, night), cd);
  let spots = mix(1.0, 0.82 + 0.18 * noise2((d.xy - L.xy) * 900.0), night);
  c += u.sunCol.rgb * (disk * spots * mix(70.0, 18.0, night) * (1.0 - 0.75 * cl) + pow(cd, 900.0) * 6.0 + pow(cd, 30.0) * mix(0.6, 0.08, night));
  let sq = d.xy / max(-d.z, 0.06) * 90.0; let g = floor(sq);
  let sp = vec2f(hash2(g + 3.1), hash2(g + 9.7)) * 0.7 + 0.15;
  let st = step(0.975, hash2(g)) * (1.0 - smoothstep(0.0, 0.07, length(fract(sq) - sp))) * (0.6 + 0.4 * sin(u.tileB.w * 2.0 + hash2(g + 7.0) * 40.0));
  c += vec3f(0.8, 0.85, 1.0) * st * night * (1.0 - cl) * 0.9;
  return c;
}
`;

// ---- luce: visibilità dell'astro dalla mappa sul piano del vetro, materiali, sonde, superfici ----
const lighting = /* wgsl */ `
@group(0) @binding(1) var shadowMap: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> giPrev: array<vec4f>;
fn sunTap(q: vec2f, t: f32) -> f32 {
  let uv = (q - SMIN) / (SMAX - SMIN);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
  let fp = uv * SDIM - 0.5; let i = vec2i(floor(fp)); let w = fract(fp);
  let bias = 0.05 + t * 0.004;
  let mx = vec2i(SDIM) - 1;
  var v = vec4f(0.0);
  for (var k = 0; k < 4; k++) {
    let s = textureLoad(shadowMap, clamp(i + vec2i(k & 1, k >> 1u), vec2i(0), mx), 0).xy;
    v[k] = select(0.0, s.y, t <= s.x + bias);
  }
  return mix(mix(v[0], v[1], w.x), mix(v[2], v[3], w.x), w.y);
}
fn sunVis(p: vec3f) -> f32 {
  let L = u.sun.xyz;
  if (L.z > -0.02) { return 0.0; }
  let t = (RB - p.z) / L.z;
  return sunTap((p + L * t).xy, t);
}
// con penombra: un astro di mezzo grado sfuma le ombre in proporzione alla distanza dal vetro
fn sunVisSoft(p: vec3f) -> f32 {
  let L = u.sun.xyz;
  if (L.z > -0.02) { return 0.0; }
  let t = (RB - p.z) / L.z; let q = (p + L * t).xy; let r = 0.0045 * t + 0.01;
  return 0.25 * (sunTap(q + vec2f(r, 0.3 * r), t) + sunTap(q + vec2f(-0.3 * r, r), t) + sunTap(q + vec2f(-r, -0.3 * r), t) + sunTap(q + vec2f(0.3 * r, -r), t));
}

struct Mat { alb: vec3f, metal: f32, rough: f32, refl: bool, n: vec3f };
var<private> METALS: array<vec3f, 3> = array<vec3f, 3>(vec3f(1.0, 0.77, 0.34), vec3f(0.93, 0.94, 0.96), vec3f(0.82, 0.5, 0.31));
fn marble(p: vec3f, base: vec3f) -> vec3f {
  let v = fbm2(p.xz * 0.9 + p.y * 0.7);
  let vein = smoothstep(0.035, 0.0, abs(fbm2(p.xz * 0.45 + vec2f(p.y * 0.6, 3.0)) - 0.5));
  return base * (0.92 + 0.1 * v) * (1.0 - 0.18 * vein);
}
// materiale nel punto, con la normale di dettaglio (smussi, scanalature, pieghe)
fn material(h: Hit) -> Mat {
  var m: Mat; m.metal = 0.0; m.rough = 0.85; m.refl = false; m.n = h.n;
  let p = h.p;
  switch h.m {
    case ${M.floor}u: {
      if (abs(p.x) < ${f(CARPET.hw)} && p.z > ${f(CARPET.z0)}) {
        // tappeto di velluto con i bordi dorati
        let e = ${f(CARPET.hw)} - abs(p.x);
        m.alb = u.carpet.rgb * (0.9 + 0.1 * noise2(p.xz * 40.0)); m.rough = 0.95;
        if (e > 0.08 && e < 0.15) { m.alb = METALS[0] * 0.8; m.metal = 0.8; m.rough = 0.45; }
      } else {
        // marmo a scacchi con le fughe, lucidato a specchio
        let s = 1.5; let cell = floor(p.xz / s); let g = fract(p.xz / s);
        let chk = (i32(cell.x) + i32(cell.y)) & 1;
        m.alb = marble(p + vec3f(cell.x * 3.1, 0.0, cell.y * 1.7), select(u.tileA.rgb, u.tileB.rgb, chk == 1));
        if (min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) < 0.005) { m.alb *= 0.6; }
        m.rough = 0.1; m.refl = true;
      }
    }
    case ${M.ceiling}u: {
      let g = fract(p.xz / 2.0);
      m.alb = u.wall.rgb * select(0.55, 0.8, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) < 0.09);
    }
    case ${M.frame}u: { m.alb = u.frameC.rgb; m.metal = 0.6; m.rough = 0.35; }
    case ${M.stone}u: { m.alb = marble(p + vec3f(p.z, 0.0, p.x), u.stone.rgb); m.rough = 0.28; }
    case ${M.dark}u: { m.alb = u.dark.rgb; m.rough = 0.35; }
    case ${M.colBase}u: { m.alb = u.column.rgb * 0.92; m.rough = 0.5; }
    case ${M.column}u: {
      // scanalature: la normale ondeggia attorno alla colonna
      let a = atan2(h.n.z, h.n.x); let tg = vec3f(-h.n.z, 0.0, h.n.x);
      m.n = normalize(h.n + tg * sin(a * 24.0) * 0.28);
      m.alb = u.column.rgb * (0.94 + 0.06 * noise2(vec2f(a * 3.0, p.y * 2.0))); m.rough = 0.45;
    }
    case ${M.pedestal}u: { m.alb = vec3f(0.025, 0.04, 0.04); m.rough = 0.12; m.refl = true; }
    case ${M.gold}u, ${M.gold + 1}u, ${M.gold + 2}u: { m.alb = METALS[h.m - M_GOLD]; m.metal = 1.0; m.rough = select(0.08, 0.16, h.prim >= 0); m.refl = true; }
    default: {
      // pareti: zoccolatura, cornice, intonaco; sulla parete di fondo gli stendardi
      if (p.y < 1.3) { m.alb = u.wainscot.rgb; m.rough = 0.5; }
      else if (p.y < 1.42) { m.alb = u.wall.rgb * 0.82; }
      else { m.alb = u.wall.rgb * (0.95 + 0.05 * noise2(p.xy * 1.3 + p.z)); }
      if (h.n.z > 0.5) {
${BANNERS.map((b) => `        if (p.x > ${f(b.x0)} && p.x < ${f(b.x1)} && p.y > ${f(b.y0)} && p.y < ${f(b.y1)}) {
          let cx = ${f((b.x0 + b.x1) / 2)}; let e = min(min(p.x - ${f(b.x0)}, ${f(b.x1)} - p.x), min(p.y - ${f(b.y0)}, ${f(b.y1)} - p.y));
          let ring = abs(length(vec2f(p.x - cx, p.y - ${f(b.y1 - 1.9)})) - 0.55);
          m.alb = u.banner.rgb * (0.86 + 0.14 * cos((p.x - cx) * 9.0)); m.rough = 0.9;
          m.n = normalize(vec3f(sin((p.x - cx) * 9.0) * 0.25, 0.0, 1.0));
          if (e < 0.09 || ring < 0.05 || (abs(p.x - cx) < 0.04 && p.y < ${f(b.y1 - 2.6)} && p.y > ${f(b.y0 + 1.0)})) { m.alb = METALS[0] * 0.85; m.metal = 0.85; m.rough = 0.4; }
        }`).join("\n")}
      }
    }
  }
  // spigoli smussati delle scatole: la normale si piega vicino agli spigoli e prende la luce
  if (h.prim >= 0) {
    let q = p - BOXC[h.prim].xyz; let e = BOXH[h.prim] - abs(q); let bw = 0.03;
    var nn = m.n;
    if (abs(h.n.x) < 0.5 && e.x < bw) { nn += vec3f(sign(q.x), 0, 0) * (1.0 - e.x / bw); }
    if (abs(h.n.y) < 0.5 && e.y < bw) { nn += vec3f(0, sign(q.y), 0) * (1.0 - e.y / bw); }
    if (abs(h.n.z) < 0.5 && e.z < bw) { nn += vec3f(0, 0, sign(q.z)) * (1.0 - e.z / bw); }
    m.n = normalize(nn);
  }
  return m;
}

fn probeIndex(c: vec3u) -> u32 { return c.x + c.y * GD.x + c.z * GD.x * GD.y; }
fn probePos(i: u32) -> vec3f {
  let c = vec3f(f32(i % GD.x), f32((i / GD.x) % GD.y), f32(i / (GD.x * GD.y)));
  return GMIN + c / vec3f(GD - 1u) * (GMAX - GMIN);
}
fn giAt(p: vec3f, n: vec3f) -> vec3f {
  let g = clamp((p - GMIN) / (GMAX - GMIN) * vec3f(GD - 1u), vec3f(0.0), vec3f(GD - 1u) - 0.001);
  let b = vec3u(floor(g)); let fr = g - floor(g); let n2 = n * n;
  let sx = select(1u, 0u, n.x > 0.0); let sy = select(3u, 2u, n.y > 0.0); let sz = select(5u, 4u, n.z > 0.0);
  var sum = vec3f(0.0); var ws = 0.0;
  for (var k = 0u; k < 8u; k++) {
    let o = vec3u(k & 1u, (k >> 1u) & 1u, k >> 2u);
    let wv = mix(1.0 - fr, fr, vec3f(o));
    let base = probeIndex(b + o) * 6u;
    let px = giPrev[base + sx]; let py = giPrev[base + sy]; let pz = giPrev[base + sz];
    let w = wv.x * wv.y * wv.z * px.w;
    sum += (n2.x * px.rgb + n2.y * py.rgb + n2.z * pz.rgb) * w; ws += w;
  }
  return sum / max(ws, 1e-4);
}
fn ggx(nh: f32, r: f32) -> f32 { let a = r * r; let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
fn fresnel(f0: vec3f, c: f32) -> vec3f { return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }
// occlusione di contatto: angoli tra pavimento, pedana, colonne e pareti
fn contactAO(p: vec3f, n: vec3f) -> f32 {
  var ao = 1.0;
  if (n.y < 0.5) { ao *= 1.0 - 0.4 * exp(-p.y * 5.0); }
  if (n.y > 0.5 && p.y < 0.2) {
    let dp = length(max(abs(p.xz - vec2f(0.0, 0.1)) - vec2f(4.55, 1.95), vec2f(0.0)));
    ao *= 1.0 - 0.45 * exp(-dp * 4.0);
    ao *= 1.0 - 0.3 * exp(-max(abs(abs(p.x) - 6.0) - 0.62, 0.0) * 3.0);
  }
  if (abs(n.x) < 0.5) { ao *= 1.0 - 0.3 * exp(-(RX - abs(p.x)) * 2.0); }
  return ao;
}
// luce che lascia la superficie verso -rd, senza riflessi tracciati; soft: penombra delle ombre
fn surface(h: Hit, rd: vec3f, soft: bool) -> vec3f {
  if (h.m == M_SKY) { return sky(rd); }
  if (h.m == 0u) { return vec3f(0.0); }
  let m = material(h);
  let n = m.n; let L = u.sun.xyz; let V = -rd;
  let ndl = max(dot(n, L), 0.0);
  var vis = 0.0;
  if (ndl > 0.0) { vis = select(sunVis(h.p + h.n * 0.01), sunVisSoft(h.p + h.n * 0.01), soft); }
  let light = u.sunCol.rgb * u.sun.w * vis;
  let gi = (giAt(h.p + h.n * 0.35, n) + u.skyHor.w) * contactAO(h.p, n);
  let f0 = mix(vec3f(0.04), m.alb, m.metal);
  let H = normalize(L + V);
  let spec = light * ndl * fresnel(f0, max(dot(V, H), 0.0)) * ggx(max(dot(n, H), 0.0), max(m.rough, 0.06)) * 0.25 / max(dot(n, V), 0.15);
  let diff = m.alb * (1.0 - m.metal) * (light * ndl / PI + gi);
  let env = gi * fresnel(f0, max(dot(n, V), 0.0)) * (1.0 - m.rough * 0.5);
  return diff + spec + env;
}
`;

export const shadowShader = /* wgsl */ `${common}
@group(0) @binding(1) var shadowOut: texture_storage_2d<rg32float, write>;
// per ogni punto del vetro: quanta luce passa e fin dove arriva nella sala
@compute @workgroup_size(8, 8, 1) fn shadow(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= SDIM.x || f32(id.y) >= SDIM.y) { return; }
  let q = SMIN + (vec2f(id.xy) + 0.5) / SDIM * (SMAX - SMIN);
  let L = u.sun.xyz;
  var m = windowOpen(q, 0.012);
  if (m > 0.0 && L.z < -0.02) { m *= cloudT(q, L); }
  var d = 0.0;
  if (m > 0.0) { d = trace(vec3f(q, RB + 0.002), -L).t; }
  textureStore(shadowOut, id.xy, vec4f(d, m, 0.0, 0.0));
}
`;

export const giShader = /* wgsl */ `${common}${lighting}
@group(0) @binding(3) var<storage, read_write> giNext: array<vec4f>;
var<private> AXES: array<vec3f, 6> = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
fn inside(p: vec3f) -> bool {
  for (var i = 0; i < ${NB}; i++) { if (all(abs(p - BOXC[i].xyz) < BOXH[i] + 0.06)) { return true; } }
  for (var i = 0; i < ${NC}; i++) { if (length(p.xz - CYLA[i].xz) < CYLA[i].w + 0.06 && abs(p.y - CYLA[i].y) < CYLB[i].x) { return true; } }
  return false;
}
@compute @workgroup_size(64) fn gi(@builtin(global_invocation_id) id: vec3u) {
  let k = id.x;
  if (k >= ${GI_PROBES * 6}u) { return; }
  let ax = AXES[k % 6u];
  let pos = probePos(k / 6u);
  if (inside(pos)) { giNext[k] = vec4f(0.0); return; }
  let t1 = normalize(select(cross(ax, vec3f(0, 1, 0)), cross(ax, vec3f(1, 0, 0)), abs(ax.y) > 0.9));
  let t2 = cross(ax, t1);
  // raggi stratificati (4 fasce di inclinazione × 2 di azimut), ruotati a ogni fotogramma: poca varianza
  let rot = fract(hash2(vec2f(f32(k), 3.7)) + u.stone.w * 0.618034);
  var acc = vec3f(0.0);
  for (var r = 0u; r < ${GI_RAYS}u; r++) {
    let jx = hash2(vec2f(f32(k) + f32(r) * 7.1, u.stone.w));
    let u1 = (f32(r % 4u) + jx) / 4.0;
    let u2 = fract((f32(r / 4u) + 0.5) / 2.0 + rot);
    let rr = sqrt(u1); let ph = 2.0 * PI * u2;
    let d = normalize(t1 * (rr * cos(ph)) + t2 * (rr * sin(ph)) + ax * sqrt(max(0.0, 1.0 - u1)));
    let h = trace(pos, d);
    if (h.m == M_SKY) { acc += sky(d); continue; }
    let m = material(h);
    let ndl = max(dot(m.n, u.sun.xyz), 0.0);
    var vis = 0.0;
    if (ndl > 0.0) { vis = sunVis(h.p + h.n * 0.01); }
    acc += m.alb * (1.0 - 0.5 * m.metal) * (u.sunCol.rgb * u.sun.w * vis * ndl / PI + giAt(h.p + h.n * 0.35, m.n) * 0.9);
  }
  let est = acc / f32(${GI_RAYS}u);
  let old = giPrev[k];
  giNext[k] = vec4f(mix(old.rgb, est, select(0.035, 1.0, old.w == 0.0)), 1.0);
}
`;

const fullscreen = /* wgsl */ `
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
// raggio di vista dal pixel (in pixel dell'immagine piena), con il centro ottico decentrato
fn camRay(px: vec2f) -> vec3f {
  let k = u.cam.w / (u.fwd.w * 0.5);
  return normalize(u.fwd.xyz + (px.x - u.right.w) * k * u.right.xyz + (u.up.w - px.y) * k * u.up.xyz);
}
`;

export const volShader = /* wgsl */ `${common}${lighting}${fullscreen}
@group(0) @binding(3) var volPrev: texture_2d<f32>;
@fragment fn fsVol(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let rd = camRay(fc.xy * (u.res.x / u.res.z));
  let ro = u.cam.xyz;
  let h = trace(ro, rd);
  let tmax = min(h.t, 45.0);
  let steps = u.dark.w;
  let dt = tmax / steps;
  // origine dei passi diversa a ogni fotogramma (sequenza aurea su un rumore spaziale): l'accumulo ne fa la media
  let j = fract(ign(fc.xy) + u.stone.w * 0.618034);
  let L = u.sun.xyz;
  let g = 0.38; let mu = dot(rd, L);
  let phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  let sunC = u.sunCol.rgb * u.sun.w;
  let amb = u.skyHor.rgb * mix(0.02, 0.01, u.sunCol.w);
  let time = u.tileB.w;
  var T = 1.0; var acc = vec3f(0.0);
  for (var i = 0.0; i < steps; i += 1.0) {
    let p = ro + rd * ((i + j) * dt);
    let dust = 0.65 * noise3(p * 0.45 + vec3f(time * 0.025, -time * 0.05, time * 0.018)) + 0.35 * noise3(p * 1.7 + vec3f(0.0, -time * 0.12, 0.0));
    let dens = u.wall.w * max(0.0, 1.0 + u.wainscot.w * (dust - 0.5) * 1.8);
    // nella nebbia le ombre dei montanti si sfumano (spostamento a rotazione, mediato nel tempo): le loro lame, viste di
    // taglio vicino alla camera, altrimenti diventerebbero righe scure che attraversano lo schermo
    var vis = 0.0;
    if (L.z < -0.02) {
      let tw = (RB - p.z) / L.z; let a = i * 2.39996 + j * 6.2832;
      vis = sunTap((p + L * tw).xy + vec2f(cos(a), sin(a)) * (0.16 + 0.012 * tw), tw);
    }
    acc += T * dens * dt * (sunC * vis * phase + amb);
    T *= exp(-dens * dt);
  }
  let prev = textureLoad(volPrev, vec2i(fc.xy), 0);
  return mix(prev, vec4f(acc, T), u.column.w);
}
`;

export const mainShader = /* wgsl */ `${common}${lighting}${fullscreen}
@group(0) @binding(3) var volTex: texture_2d<f32>;
@group(0) @binding(4) var linSamp: sampler;
@fragment fn fsMain(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let ro = u.cam.xyz;
  let rd = camRay(fc.xy);
  let h = trace(ro, rd);
  var col = surface(h, rd, true);
  // riflessi tracciati: pavimento di marmo, metalli, piedistalli lucidi
  if (h.m != M_SKY && h.m != 0u) {
    let m = material(h);
    if (m.refl) {
      let rr = reflect(rd, m.n);
      let rh = trace(h.p + h.n * 0.004, rr);
      let f0 = mix(vec3f(0.04), m.alb, m.metal);
      let F = fresnel(f0, max(dot(m.n, -rd), 0.0));
      let approx = (giAt(h.p + h.n * 0.35, m.n) + u.skyHor.w) * contactAO(h.p, m.n) * F * (1.0 - m.rough * 0.5);
      col += surface(rh, rr, false) * F * (1.0 - m.rough * 0.6) - approx;
    }
  }
  let v = textureSampleLevel(volTex, linSamp, fc.xy / u.res.xy, 0.0);
  col = col * v.a + v.rgb;
  col *= u.skyTop.w;
  let uv = fc.xy / u.res.xy - 0.5;
  col *= 1.0 - 0.22 * dot(uv, uv);
  col = saturate(col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14));
  var s = select(1.055 * pow(col, vec3f(1.0 / 2.4)) - 0.055, col * 12.92, col <= vec3f(0.0031308));
  s += (ign(fc.xy + u.stone.w * 7.0) - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
`;

// FXAA (variante "console" di Timothy Lottes) sull'immagine già codificata in sRGB
export const presentShader = /* wgsl */ `
@group(0) @binding(0) var img: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
@fragment fn fsPresent(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = 1.0 / vec2f(textureDimensions(img)); let uv = fc.xy * px;
  let rgbM = textureSampleLevel(img, smp, uv, 0.0).rgb;
  let lNW = luma(textureSampleLevel(img, smp, uv + vec2f(-0.5, -0.5) * px, 0.0).rgb);
  let lNE = luma(textureSampleLevel(img, smp, uv + vec2f(0.5, -0.5) * px, 0.0).rgb);
  let lSW = luma(textureSampleLevel(img, smp, uv + vec2f(-0.5, 0.5) * px, 0.0).rgb);
  let lSE = luma(textureSampleLevel(img, smp, uv + vec2f(0.5, 0.5) * px, 0.0).rgb);
  let lM = luma(rgbM);
  let lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  let lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.1)) { return vec4f(rgbM, 1.0); }
  var dir = vec2f(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  let red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2f(-8.0), vec2f(8.0)) * px;
  let a = 0.5 * (textureSampleLevel(img, smp, uv - dir / 6.0, 0.0).rgb + textureSampleLevel(img, smp, uv + dir / 6.0, 0.0).rgb);
  let b = a * 0.5 + 0.25 * (textureSampleLevel(img, smp, uv - dir * 0.5, 0.0).rgb + textureSampleLevel(img, smp, uv + dir * 0.5, 0.0).rgb);
  let lB = luma(b);
  return vec4f(select(b, a, lB < lMin || lB > lMax), 1.0);
}
`;
