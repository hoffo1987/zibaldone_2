// Shader WGSL del podio. La scena è fatta di forme analitiche (scatole, piani, il finestrone a riquadri): ogni raggio si
// interseca in forma chiusa, senza marcia per passi, e così si possono tracciare molti raggi per pixel e per sonda.
//  - gi: compute shader che aggiorna una griglia di sonde di luce (cubo ambientale a 6 direzioni) tracciando raggi nella
//    sala; la luce del sole/luna e del cielo rimbalza su pavimento, pareti e podio, e con il riuso del fotogramma
//    precedente i rimbalzi diventano multipli (illuminazione globale dinamica);
//  - fsVol: i fasci di luce nel pulviscolo, a metà risoluzione, con la visibilità dell'astro attraverso i riquadri e le
//    nuvole che passano;
//  - fsMain: superfici con luce diretta, illuminazione globale, riflessi (pavimento lucido, metalli), antialiasing sui
//    bordi, poi la nebbia luminosa, la mappatura tonale e la codifica sRGB.
import { STEPS, PLINTH, ROOM, WINDOW } from "./stage";

const v3 = (a: number[]) => `vec3f(${a.map((x) => x.toFixed(4)).join(", ")})`;
export const GI_DIM = [16, 8, 12], GI_MIN = [-8, 0, -5], GI_MAX = [8, 8, 10];
export const GI_PROBES = GI_DIM[0] * GI_DIM[1] * GI_DIM[2];
export const GI_RAYS = 3;
export const U_FLOATS = 14 * 4;

const common = /* wgsl */ `
struct U {
  cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f,   // posizione e assi della camera; w: tan(fov/2), aspetto, tempo, fotogramma
  sun: vec4f, sunCol: vec4f,                          // direzione verso l'astro e intensità; colore e notte (0..1)
  skyTop: vec4f, skyHor: vec4f,                       // cielo; w: esposizione, luce ambiente minima
  wall: vec4f, floorC: vec4f, stone: vec4f, plinth: vec4f, frameC: vec4f,  // colori; w: nebbia, pulviscolo, nuvole, passi, campioni AA
  res: vec4f,                                         // risoluzione piena e della nebbia
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> giPrev: array<vec4f>;

const PI = 3.14159265;
var<private> BC: array<vec3f, 4> = array<vec3f, 4>(${STEPS.map((s) => v3(s.c)).join(", ")}, ${v3(PLINTH.c)});
var<private> BH: array<vec3f, 4> = array<vec3f, 4>(${STEPS.map((s) => v3(s.h)).join(", ")}, ${v3(PLINTH.h)});
const RX = ${ROOM.x.toFixed(2)}; const RY = ${ROOM.y.toFixed(2)}; const RB = ${ROOM.back.toFixed(2)}; const RF = ${ROOM.front.toFixed(2)};
const WX0 = ${WINDOW.x0.toFixed(3)}; const WX1 = ${WINDOW.x1.toFixed(3)}; const WY0 = ${WINDOW.y0.toFixed(3)}; const WY1 = ${WINDOW.y1.toFixed(3)};
const WBAR = ${WINDOW.bar.toFixed(3)}; const WFR = ${WINDOW.frame.toFixed(3)};
var<private> WCOL: array<f32, ${WINDOW.cols.length}> = array<f32, ${WINDOW.cols.length}>(${WINDOW.cols.map((x) => x.toFixed(3)).join(", ")});
var<private> WROW: array<f32, ${WINDOW.rows.length}> = array<f32, ${WINDOW.rows.length}>(${WINDOW.rows.map((x) => x.toFixed(3)).join(", ")});
const GD = vec3u(${GI_DIM.join("u, ")}u); const GMIN = ${v3(GI_MIN)}; const GMAX = ${v3(GI_MAX)};

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
// rumore a gradiente interlacciato: scompone le sfumature senza bande
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

// ---- intersezioni ----
struct Hit { t: f32, n: vec3f, id: u32, p: vec3f };
// distanza d'ingresso nella scatola e normale (t < 0: mancata)
fn boxT(ro: vec3f, rd: vec3f, c: vec3f, h: vec3f) -> vec4f {
  let m = 1.0 / rd; let n = m * (ro - c); let k = abs(m) * h;
  let t1 = -n - k; let t2 = -n + k;
  let tN = max(max(t1.x, t1.y), t1.z); let tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tN < 0.0) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let nor = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  return vec4f(tN, nor);
}
fn inWindow(q: vec2f) -> bool { return q.x > WX0 && q.x < WX1 && q.y > WY0 && q.y < WY1; }
// vetro libero (1) o telaio e montanti (0), con un bordo morbido largo s (penombra dei fasci)
fn windowOpen(q: vec2f, s: f32) -> f32 {
  var m = smoothstep(WX0 + WFR - s, WX0 + WFR + s, q.x) * (1.0 - smoothstep(WX1 - WFR - s, WX1 - WFR + s, q.x));
  m *= smoothstep(WY0 + WFR - s, WY0 + WFR + s, q.y) * (1.0 - smoothstep(WY1 - WFR - s, WY1 - WFR + s, q.y));
  for (var i = 0; i < ${WINDOW.cols.length}; i++) { m *= smoothstep(WBAR - s, WBAR + s, abs(q.x - WCOL[i])); }
  for (var i = 0; i < ${WINDOW.rows.length}; i++) { m *= smoothstep(WBAR - s, WBAR + s, abs(q.y - WROW[i])); }
  return m;
}
// id: 0 nulla, 1 pavimento, 2 parete, 3 soffitto, 6 cielo (oltre il vetro), 7 telaio, 10 + i gradini e basamento
fn trace(ro: vec3f, rd: vec3f) -> Hit {
  var h: Hit; h.t = 1e9; h.id = 0u;
  for (var i = 0; i < 4; i++) {
    let b = boxT(ro, rd, BC[i], BH[i]);
    if (b.x > 1e-4 && b.x < h.t) { h.t = b.x; h.n = b.yzw; h.id = 10u + u32(i); }
  }
  // la sala è una scatola convessa: si esce dal primo piano incontrato
  var t = 1e9; var n = vec3f(0.0); var id = 2u;
  if (rd.y < 0.0) { let tt = -ro.y / rd.y; if (tt < t) { t = tt; n = vec3f(0, 1, 0); id = 1u; } }
  if (rd.y > 0.0) { let tt = (RY - ro.y) / rd.y; if (tt < t) { t = tt; n = vec3f(0, -1, 0); id = 3u; } }
  if (rd.x > 0.0) { let tt = (RX - ro.x) / rd.x; if (tt < t) { t = tt; n = vec3f(-1, 0, 0); id = 2u; } }
  if (rd.x < 0.0) { let tt = (-RX - ro.x) / rd.x; if (tt < t) { t = tt; n = vec3f(1, 0, 0); id = 2u; } }
  if (rd.z > 0.0) { let tt = (RF - ro.z) / rd.z; if (tt < t) { t = tt; n = vec3f(0, 0, -1); id = 2u; } }
  if (rd.z < 0.0) {
    let tt = (RB - ro.z) / rd.z;
    if (tt < t) {
      t = tt; n = vec3f(0, 0, 1); id = 2u;
      let q = (ro + rd * tt).xy;
      if (inWindow(q)) { id = select(7u, 6u, windowOpen(q, 0.0) > 0.5); }
    }
  }
  if (t < h.t) { h.t = t; h.n = n; h.id = id; }
  h.p = ro + rd * h.t;
  return h;
}
fn occluded(ro: vec3f, rd: vec3f) -> bool {
  for (var i = 0; i < 4; i++) { if (boxT(ro, rd, BC[i], BH[i]).x > 0.0) { return true; } }
  return false;
}

// ---- l'astro, le nuvole, il cielo ----
fn clouds(q: vec2f) -> f32 {
  let w = vec2f(u.up.w * 0.045, u.up.w * 0.011);
  return smoothstep(0.36, 0.68, fbm2(q * 0.3 + w));
}
// luce dell'astro che arriva in p: entra solo dal vetro, filtrata dalle nuvole che passano; s: morbidezza dei bordi
fn sunVis(p: vec3f, s: f32) -> f32 {
  let L = u.sun.xyz;
  if (L.z > -0.02) { return 0.0; }
  let t = (RB - p.z) / L.z;
  let q = (p + L * t).xy;
  var m = windowOpen(q, s + t * 0.011);
  if (m <= 0.0) { return 0.0; }
  if (occluded(p, L)) { return 0.0; }
  // le nuvole stanno su un piano qualche metro oltre il vetro: si spostano e i fasci respirano
  let cq = q + L.xy / -L.z * 7.0;
  return m * (1.0 - u.stone.w * clouds(cq));
}
fn sky(d: vec3f) -> vec3f {
  let night = u.sunCol.w;
  let L = u.sun.xyz;
  let up = saturate(d.y * 1.5 + 0.08);
  var c = mix(u.skyHor.rgb, u.skyTop.rgb, pow(up, 0.6));
  let q = d.xy / max(-d.z, 0.06) * 7.0;
  let cl = clouds(q);
  let cd = max(dot(d, L), 0.0);
  // nuvole: bianche e luminose di giorno, grigio-blu con il bordo d'argento vicino alla luna di notte
  let lit = mix(vec3f(1.6, 1.55, 1.48), vec3f(0.006, 0.009, 0.016) + u.sunCol.rgb * 0.6 * pow(cd, 60.0), night);
  c = mix(c, lit * (0.75 + 0.25 * fbm2(q * 0.9 + 3.0)), cl * mix(0.85, 0.7, night));
  // disco dell'astro e alone (la luna ha qualche macchia)
  let disk = smoothstep(mix(0.99955, 0.99962, night), mix(0.9998, 0.99985, night), cd);
  let spots = mix(1.0, 0.82 + 0.18 * noise2((d.xy - L.xy) * 900.0), night);
  c += u.sunCol.rgb * (disk * spots * mix(70.0, 18.0, night) * (1.0 - 0.75 * cl) + pow(cd, 900.0) * 6.0 + pow(cd, 30.0) * mix(0.6, 0.08, night));
  // stelle, solo di notte e solo dove non ci sono nuvole
  let sq = d.xy / max(-d.z, 0.06) * 90.0;
  let g = floor(sq);
  let sp = vec2f(hash2(g + 3.1), hash2(g + 9.7)) * 0.7 + 0.15;
  let st = step(0.975, hash2(g)) * (1.0 - smoothstep(0.0, 0.07, length(fract(sq) - sp))) * (0.6 + 0.4 * sin(u.up.w * 2.0 + hash2(g + 7.0) * 40.0));
  c += vec3f(0.8, 0.85, 1.0) * st * night * (1.0 - cl) * 0.9;
  return c;
}

// ---- materiali ----
struct Mat { alb: vec3f, metal: f32, rough: f32 };
const METALS = array<vec3f, 3>(vec3f(1.0, 0.76, 0.33), vec3f(0.9, 0.92, 0.95), vec3f(0.82, 0.5, 0.31));
fn material(id: u32, p: vec3f, n: vec3f) -> Mat {
  var m: Mat; m.metal = 0.0; m.rough = 0.85;
  switch id {
    case 1u: { m.alb = u.floorC.rgb; m.rough = 0.16; }
    case 3u: { m.alb = u.wall.rgb * 0.6; }
    case 7u: { m.alb = u.frameC.rgb; m.metal = 0.5; m.rough = 0.35; }
    case 10u, 11u, 12u: {
      let i = id - 10u;
      let top = BC[i].y + BH[i].y;
      if (n.y > 0.5 || p.y > top - 0.085) { m.alb = METALS[i]; m.metal = 1.0; m.rough = select(0.3, 0.2, n.y > 0.5); }
      else { m.alb = u.stone.rgb * (0.9 + 0.1 * fbm2(p.xy * vec2f(2.3, 4.1) + p.z * 1.7) + 0.06 * smoothstep(0.62, 0.7, noise2(p.xy * vec2f(1.1, 3.5) + p.z * 2.0))); m.rough = 0.35; }
    }
    case 13u: { m.alb = u.plinth.rgb; m.rough = 0.55; }
    default: { m.alb = u.wall.rgb; }
  }
  return m;
}
// spigoli smussati dei gradini: la normale si piega vicino agli spigoli e cattura la luce
fn bevel(id: u32, p: vec3f, n: vec3f) -> vec3f {
  if (id < 10u) { return n; }
  let i = id - 10u;
  let q = p - BC[i]; let e = BH[i] - abs(q); let bw = 0.035;
  var nn = n;
  if (abs(n.x) < 0.5 && e.x < bw) { nn += vec3f(sign(q.x), 0, 0) * (1.0 - e.x / bw); }
  if (abs(n.y) < 0.5 && e.y < bw) { nn += vec3f(0, sign(q.y), 0) * (1.0 - e.y / bw); }
  if (abs(n.z) < 0.5 && e.z < bw) { nn += vec3f(0, 0, sign(q.z)) * (1.0 - e.z / bw); }
  return normalize(nn);
}

// ---- illuminazione globale: interpolazione delle sonde (cubo ambientale) ----
fn probeIndex(c: vec3u) -> u32 { return c.x + c.y * GD.x + c.z * GD.x * GD.y; }
fn probePos(i: u32) -> vec3f {
  let c = vec3f(f32(i % GD.x), f32((i / GD.x) % GD.y), f32(i / (GD.x * GD.y)));
  return GMIN + c / vec3f(GD - 1u) * (GMAX - GMIN);
}
fn giAt(p: vec3f, n: vec3f) -> vec3f {
  let g = clamp((p - GMIN) / (GMAX - GMIN) * vec3f(GD - 1u), vec3f(0.0), vec3f(GD - 1u) - 0.001);
  let b = vec3u(floor(g)); let f = g - floor(g);
  let n2 = n * n;
  let sx = select(1u, 0u, n.x > 0.0); let sy = select(3u, 2u, n.y > 0.0); let sz = select(5u, 4u, n.z > 0.0);
  var sum = vec3f(0.0); var ws = 0.0;
  for (var k = 0u; k < 8u; k++) {
    let o = vec3u(k & 1u, (k >> 1u) & 1u, k >> 2u);
    let wv = mix(1.0 - f, f, vec3f(o));
    let base = probeIndex(b + o) * 6u;
    let px = giPrev[base + sx]; let py = giPrev[base + sy]; let pz = giPrev[base + sz];
    let w = wv.x * wv.y * wv.z * px.w;
    sum += (n2.x * px.rgb + n2.y * py.rgb + n2.z * pz.rgb) * w; ws += w;
  }
  return sum / max(ws, 1e-4);
}
fn insideBox(p: vec3f) -> bool {
  for (var i = 0; i < 4; i++) { if (all(abs(p - BC[i]) < BH[i] + 0.05)) { return true; } }
  return false;
}
// occlusione di contatto: angoli tra pavimento e gradini, e tra pareti e pavimento
fn contactAO(p: vec3f, n: vec3f, id: u32) -> f32 {
  var ao = 1.0;
  for (var i = 0; i < 4; i++) {
    if (id == 10u + u32(i)) { continue; }
    let d = length(max(abs(p - BC[i]) - BH[i], vec3f(0.0)));
    ao *= 1.0 - 0.55 * exp(-d * 3.5) * saturate(0.6 + 0.4 * n.y);
  }
  if (n.y < 0.5) { ao *= 1.0 - 0.35 * exp(-p.y * 4.0); }
  return ao;
}

fn ggx(nh: f32, r: f32) -> f32 { let a = r * r; let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
fn fresnel(f0: vec3f, c: f32) -> vec3f { return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }

// luce che lascia una superficie verso -rd, senza riflessi tracciati (si usa anche per le superfici viste nei riflessi)
fn surface(h: Hit, rd: vec3f) -> vec3f {
  if (h.id == 6u) { return sky(rd); }
  if (h.id == 0u) { return vec3f(0.0); }
  let n = bevel(h.id, h.p, h.n);
  let m = material(h.id, h.p, n);
  let L = u.sun.xyz; let V = -rd;
  let ndl = max(dot(n, L), 0.0);
  var vis = 0.0;
  if (ndl > 0.0) { vis = sunVis(h.p + n * 0.004, 0.01); }
  let light = u.sunCol.rgb * u.sun.w * vis;
  let ao = contactAO(h.p, n, h.id);
  let gi = (giAt(h.p + n * 0.3, n) + u.skyHor.w) * ao;
  let f0 = mix(vec3f(0.04), m.alb, m.metal);
  let H = normalize(L + V);
  let F = fresnel(f0, max(dot(V, H), 0.0));
  let spec = light * ndl * F * ggx(max(dot(n, H), 0.0), max(m.rough, 0.08)) * 0.25 / max(dot(n, V), 0.15);
  let diff = m.alb * (1.0 - m.metal) * (light * ndl / PI + gi);
  // riflesso ambientale approssimato con le sonde (i riflessi veri li aggiunge shadeFull)
  let env = gi * fresnel(f0, max(dot(n, V), 0.0)) * (1.0 - m.rough * 0.5);
  return diff + spec + env;
}
`;

export const giShader = /* wgsl */ `${common}
@group(0) @binding(2) var<storage, read_write> giNext: array<vec4f>;
var<private> AXES: array<vec3f, 6> = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
@compute @workgroup_size(64) fn gi(@builtin(global_invocation_id) id: vec3u) {
  let k = id.x;
  if (k >= ${GI_PROBES * 6}u) { return; }
  let pi = k / 6u; let ax = AXES[k % 6u];
  let pos = probePos(pi);
  if (insideBox(pos)) { giNext[k] = vec4f(0.0); return; }
  // base ortonormale attorno all'asse e raggi distribuiti come il coseno, diversi a ogni fotogramma
  let t1 = normalize(select(cross(ax, vec3f(0, 1, 0)), cross(ax, vec3f(1, 0, 0)), abs(ax.y) > 0.9));
  let t2 = cross(ax, t1);
  var acc = vec3f(0.0);
  for (var r = 0u; r < ${GI_RAYS}u; r++) {
    let s = vec2f(f32(k) * 0.7548 + f32(r) * 0.31, u.fwd.w * 0.5698 + f32(r) * 0.11);
    let u1 = fract(hash2(s) + u.fwd.w * 0.618034); let u2 = fract(hash2(s + 17.3) + u.fwd.w * 0.754878);
    let rr = sqrt(u1); let ph = 2.0 * PI * u2;
    let d = normalize(t1 * (rr * cos(ph)) + t2 * (rr * sin(ph)) + ax * sqrt(max(0.0, 1.0 - u1)));
    let h = trace(pos, d);
    if (h.id == 6u) { acc += sky(d); continue; }
    if (h.id == 0u) { continue; }
    let m = material(h.id, h.p, h.n);
    let ndl = max(dot(h.n, u.sun.xyz), 0.0);
    var vis = 0.0;
    if (ndl > 0.0) { vis = sunVis(h.p + h.n * 0.004, 0.02); }
    // luce che rimbalza dal punto colpito: diretta più quella già raccolta dalle sonde (rimbalzi successivi)
    acc += m.alb * (1.0 - 0.5 * m.metal) * (u.sunCol.rgb * u.sun.w * vis * ndl / PI + giAt(h.p + h.n * 0.3, h.n) * 0.9);
  }
  let est = acc / f32(${GI_RAYS}u);
  let old = giPrev[k];
  let a = select(0.07, 1.0, old.w == 0.0);
  giNext[k] = vec4f(mix(old.rgb, est, a), 1.0);
}
`;

const fullscreen = /* wgsl */ `
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn camRay(px: vec2f, size: vec2f) -> vec3f {
  let uv = px / size;
  let x = (uv.x * 2.0 - 1.0) * u.cam.w * u.right.w;
  let y = (1.0 - uv.y * 2.0) * u.cam.w;
  return normalize(u.fwd.xyz + x * u.right.xyz + y * u.up.xyz);
}
`;

export const volShader = /* wgsl */ `${common}${fullscreen}
// fasci di luce: diffusione nel pulviscolo lungo il raggio di vista, con la visibilità dell'astro in ogni punto
@fragment fn fsVol(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let rd = camRay(fc.xy, u.res.zw);
  let ro = u.cam.xyz;
  let h = trace(ro, rd);
  let tmax = min(h.t, 40.0);
  let steps = u.plinth.w;
  let dt = tmax / steps;
  let j = ign(fc.xy + vec2f(u.fwd.w * 5.588, u.fwd.w * 3.17));
  let L = u.sun.xyz;
  let mu = dot(rd, L);
  let g = 0.38;
  let phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  let sunC = u.sunCol.rgb * u.sun.w;
  let amb = u.skyHor.rgb * mix(0.02, 0.01, u.sunCol.w);
  var T = 1.0; var acc = vec3f(0.0);
  let time = u.up.w;
  for (var i = 0.0; i < steps; i += 1.0) {
    let p = ro + rd * ((i + j) * dt);
    // pulviscolo che sale lentamente e si sposta: la densità varia e i fasci luccicano
    let dust = 0.65 * noise3(p * 0.45 + vec3f(time * 0.025, -time * 0.05, time * 0.018)) + 0.35 * noise3(p * 1.7 + vec3f(0.0, -time * 0.12, 0.0));
    let dens = u.wall.w * max(0.0, 1.0 + u.floorC.w * (dust - 0.5) * 1.8);
    let vis = sunVis(p, 0.03);
    acc += T * dens * dt * (sunC * vis * phase + amb);
    T *= exp(-dens * dt);
  }
  return vec4f(acc, T);
}
`;

export const mainShader = /* wgsl */ `${common}${fullscreen}
@group(0) @binding(2) var volTex: texture_2d<f32>;
@group(0) @binding(3) var linSamp: sampler;

// superficie con i riflessi tracciati: pavimento lucido e metalli riflettono davvero la sala, il finestrone, il cielo
fn shadeFull(h: Hit, rd: vec3f, px: vec2f) -> vec3f {
  var c = surface(h, rd);
  if (h.id == 1u || (h.id >= 10u && h.id <= 12u)) {
    let n = bevel(h.id, h.p, h.n);
    let m = material(h.id, h.p, n);
    if (m.metal > 0.5 || h.id == 1u) {
      // un po' di rugosità: la direzione riflessa oscilla di poco da pixel a pixel
      let jit = (vec3f(ign(px), ign(px + 31.7), ign(px + 57.3)) - 0.5) * m.rough * 0.08;
      let rr = normalize(reflect(rd, n) + jit);
      let rh = trace(h.p + n * 0.004, rr);
      let f0 = mix(vec3f(0.04), m.alb, m.metal);
      let F = fresnel(f0, max(dot(n, -rd), 0.0));
      let rc = surface(rh, rr);
      // il riflesso sostituisce quello approssimato dalle sonde
      c += (rc - (giAt(h.p + n * 0.3, n) + u.skyHor.w)) * F * (1.0 - m.rough * 0.7);
    }
  }
  return c;
}

@fragment fn fsMain(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let ro = u.cam.xyz;
  let rd = camRay(fc.xy, u.res.xy);
  let h = trace(ro, rd);
  // antialiasing analitico: si confrontano gli oggetti colpiti da quattro sottocampioni (intersezioni economiche);
  // solo sui bordi si ombreggiano tutti e quattro
  var o = array<vec2f, 4>(vec2f(-0.125, -0.375), vec2f(0.375, -0.125), vec2f(0.125, 0.375), vec2f(-0.375, 0.125));
  var edge = false;
  var hs: array<Hit, 4>;
  var ds: array<vec3f, 4>;
  for (var i = 0; i < 4; i++) {
    ds[i] = camRay(fc.xy + o[i], u.res.xy);
    hs[i] = trace(ro, ds[i]);
    if (hs[i].id != h.id || abs(hs[i].t - h.t) > 0.25 * h.t * 0.05 + 0.05) { edge = true; }
  }
  var col = vec3f(0.0);
  if (edge && u.frameC.w > 0.5) {
    for (var i = 0; i < 4; i++) { col += shadeFull(hs[i], ds[i], fc.xy + o[i]); }
    col *= 0.25;
  } else {
    col = shadeFull(h, rd, fc.xy);
  }
  // nebbia luminosa (metà risoluzione, interpolata)
  let v = textureSampleLevel(volTex, linSamp, fc.xy / u.res.xy, 0.0);
  col = col * v.a + v.rgb;
  // esposizione, mappatura tonale ACES (approssimazione di Narkowicz), leggera vignetta, sRGB e dithering
  col *= u.skyTop.w;
  let uv = fc.xy / u.res.xy - 0.5;
  col *= 1.0 - 0.28 * dot(uv, uv);
  col = saturate(col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14));
  var s = select(1.055 * pow(col, vec3f(1.0 / 2.4)) - 0.055, col * 12.92, col <= vec3f(0.0031308));
  s += (ign(fc.xy + u.fwd.w * 7.0) - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
`;
