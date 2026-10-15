// Shader WGSL della sala del podio (rasterizzazione di mesh vere, illuminazione globale dinamica, ombre PCSS, riflessi).
//  - texgen: texture procedurali periodiche (marmo venato con normali, trama del tessuto), una volta all'avvio;
//  - clouds: trasmissione delle nuvole sul piano del vetro (rumore simplex 3D che evolve), con le mip per la penombra;
//  - shadow: profondità rasterizzata dal piano del vetro lungo la luce (tutta la luce entra dal finestrone): ombre di
//    telaio, montanti, colonne, podio e coppe; filtrate con PCSS (penombra che cresce con la distanza dall'ostacolo);
//  - gi: sonde di luce (cubo ambientale) aggiornate a turno, ognuna con 128 raggi fissi per direzione su forme
//    semplificate: niente casualità, niente sfarfallio; i rimbalzi multipli arrivano dal riuso delle sonde stesse;
//  - scene: materiali (marmo triplanare, numeri incisi con intarsio di metallo, velluto, stoffa, metalli), luce diretta,
//    illuminazione globale, riflessi planari del pavimento e della cubemap della sala, cielo, pulviscolo nei raggi;
//  - vol: fasci di luce a risoluzione ridotta accumulati nel tempo; post: bloom e composizione (ACES, sRGB, dithering).
import { ROOM, WINDOW, LIGHT_RECT, LIGHT_DEPTH, PROXY_BOXES, PROXY_CYLS, PROXY_SPHS, CARPET, Mat, STEP_H, STEP_X, STEP_TOP, STEP_D, TROPHY_Z, BANNERS } from "./stage";
import type { Tier } from "./device";

// qualità per fascia di potenza della GPU (device.ts). maxScale: risoluzione massima rispetto ai pixel del dispositivo
// (oltre 1 è supercampionamento); maxPixels: tetto dei pixel disegnati
export type PodiumQuality = { tier: Tier; mobile: boolean; shadow: [number, number]; planarScale: number; envSize: number; volScale: number; steps: number; giPeriod: number; dust: number; bloom: number; maxScale: number; maxPixels: number };
const QUALITY: Record<Tier, Omit<PodiumQuality, "tier" | "mobile">> = {
  low: { shadow: [768, 886], planarScale: 0.4, envSize: 128, volScale: 0.35, steps: 28, giPeriod: 24, dust: 200, bloom: 5, maxScale: 1, maxPixels: 1.1e6 },
  medium: { shadow: [1024, 1182], planarScale: 0.5, envSize: 256, volScale: 0.4, steps: 40, giPeriod: 16, dust: 500, bloom: 5, maxScale: 1, maxPixels: 3.7e6 },
  high: { shadow: [1536, 1772], planarScale: 0.6, envSize: 256, volScale: 0.5, steps: 48, giPeriod: 12, dust: 900, bloom: 6, maxScale: 1.25, maxPixels: 6.5e6 },
  ultra: { shadow: [2048, 2363], planarScale: 0.75, envSize: 512, volScale: 0.6, steps: 64, giPeriod: 6, dust: 1400, bloom: 6, maxScale: 1.5, maxPixels: 9.5e6 },
};
export const podiumQuality = (tier: Tier, mobile = false): PodiumQuality => ({ tier, mobile: mobile || tier === "low", ...QUALITY[tier] });

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : x.toFixed(5));
const v3 = (a: number[]) => `vec3f(${a.map(f).join(", ")})`;
export const GI_DIM = [18, 10, 16], GI_MIN = [-8.6, 0.25, -6.6], GI_MAX = [8.6, 11.6, 13];
export const GI_PROBES = GI_DIM[0] * GI_DIM[1] * GI_DIM[2];
export const FRAME_FLOATS = 16 + 15 * 4 + 3 * 4; // matrice della luce + 15 vec4 + le tre coppe
export const PASS_FLOATS = 16 + 5 * 4; // matrice + 5 vec4

// ---------------------------------------------------------------------------------------------------------------------
const structs = /* wgsl */ `
struct Frame {
  light: mat4x4f,
  sun: vec4f, sunCol: vec4f, skyTop: vec4f, skyHor: vec4f,
  wall: vec4f, wainscot: vec4f, ceiling: vec4f, tileA: vec4f, tileB: vec4f, stone: vec4f, darkStone: vec4f, carpet: vec4f, banner: vec4f, frameC: vec4f,
  res: vec4f,
  cups: array<vec4f, 3>, // per coppa: angolo, sollevamento, bagliore (puntatore sopra)
};
// w: sun.w intensità; sunCol.w notte; skyTop.w esposizione; skyHor.w luce minima; wall.w nebbia; wainscot.w pulviscolo;
//    ceiling.w nuvole; tileA.w tempo; tileB.w fotogramma; stone.w passi della nebbia; darkStone.w fusione temporale;
//    carpet.w turno delle sonde; res: immagine piena e nebbia
struct Pass { vp: mat4x4f, pos: vec4f, right: vec4f, up: vec4f, fwd: vec4f, misc: vec4f };
// pos.w tan(fov/2); right.w, up.w centro ottico (px); fwd.w altezza di riferimento (px); misc: -, modo (0 scena,
// 1 riflesso del pavimento, 2 cubemap), larghezza e altezza del bersaglio (px)
const PI = 3.14159265;
`;

const noise = /* wgsl */ `
fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// rumore simplex 3D (Ian McEwan, Ashima Arts, MIT)
fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute4(x: vec4f) -> vec4f { return mod289_4(((x * 34.0) + 10.0) * x); }
fn snoise3(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  var i = floor(v + dot(v, vec3f(C.y)));
  let x0 = v - i + dot(i, vec3f(C.x));
  let g = step(x0.yzx, x0.xyz); let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy); let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + C.x; let x2 = x0 - i2 + C.y; let x3 = x0 - 0.5;
  i = mod289_3(i);
  let p = permute4(permute4(permute4(i.z + vec4f(0.0, i1.z, i2.z, 1.0)) + i.y + vec4f(0.0, i1.y, i2.y, 1.0)) + i.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let ns = 0.142857142857 * vec3f(2.0, 0.5, 1.0) - vec3f(0.0, 1.0, 0.0);
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z); let y_ = floor(j - 7.0 * x_);
  let x = x_ * ns.x + ns.y; let y = y_ * ns.x + ns.y; let h = 1.0 - abs(x) - abs(y);
  let b0 = vec4f(x.xy, y.xy); let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0; let s1 = floor(b1) * 2.0 + 1.0; let sh = -step(h, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy; let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3f(a0.xy, h.x); var p1 = vec3f(a0.zw, h.y); var p2 = vec3f(a1.xy, h.z); var p3 = vec3f(a1.zw, h.w);
  let nrm = 1.79284291400159 - 0.85373472095314 * vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= nrm.x; p1 *= nrm.y; p2 *= nrm.z; p3 *= nrm.w;
  var m = max(0.5 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 105.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// nuvole: rumore frattale con le ottave ruotate (niente griglia visibile) che scorre e cambia forma
fn cloudDensity(q: vec2f, t: f32) -> f32 {
  var p = vec3f(q * 0.16 + vec2f(t * 0.055, t * 0.012), t * 0.025);
  var a = 0.55; var s = 0.0;
  for (var o = 0; o < 4; o++) {
    s += a * snoise3(p);
    p = vec3f(p.x * 1.6 - p.y * 1.2, p.x * 1.2 + p.y * 1.6, p.z * 1.7) + vec3f(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return smoothstep(-0.05, 0.55, s);
}
`;

const sky = /* wgsl */ `
// sun: con il disco dell'astro (le sonde lo escludono: la luce diretta arriva già dalla mappa d'ombra, e un disco così
// piccolo preso da pochi raggi fissi farebbe saltare le sonde mentre si muove)
fn sky(d: vec3f, sun: bool) -> vec3f {
  let night = F.sunCol.w; let L = F.sun.xyz;
  let up = saturate(d.y * 1.5 + 0.08);
  var c = mix(F.skyHor.rgb, F.skyTop.rgb, pow(up, 0.6));
  let q = d.xy / max(-d.z, 0.06) * 7.0;
  let cl = cloudDensity(q, F.tileA.w) * F.ceiling.w / 0.6;
  let cd = max(dot(d, L), 0.0);
  let lit = mix(vec3f(1.25, 1.22, 1.17), vec3f(0.006, 0.009, 0.016) + F.sunCol.rgb * 0.7 * pow(cd, 60.0), night);
  c = mix(c, lit * (0.8 + 0.2 * snoise3(vec3f(q * 0.9, 3.0))), saturate(cl) * mix(0.8, 0.65, night));
  let disk = smoothstep(mix(0.99955, 0.99962, night), mix(0.9998, 0.99985, night), cd);
  let spots = mix(1.0, 0.8 + 0.2 * snoise3(vec3f((d.xy - L.xy) * 300.0, 1.0)), night);
  c += F.sunCol.rgb * pow(cd, 40.0) * mix(0.7, 0.1, night);
  if (sun) { c += F.sunCol.rgb * (disk * spots * mix(90.0, 22.0, night) * (1.0 - 0.8 * saturate(cl)) + pow(cd, 900.0) * 7.0); }
  let sq = d.xy / max(-d.z, 0.06) * 110.0; let g = floor(sq);
  let sp = vec2f(hash2(g + 3.1), hash2(g + 9.7)) * 0.7 + 0.15;
  let st = step(0.975, hash2(g)) * (1.0 - smoothstep(0.0, 0.06, length(fract(sq) - sp))) * (0.6 + 0.4 * sin(F.tileA.w * 2.0 + hash2(g + 7.0) * 40.0));
  c += vec3f(0.85, 0.9, 1.0) * st * night * (1.0 - saturate(cl)) * 1.2;
  return c;
}
`;

// animazione dei vertici: coppe che girano e si sollevano, stendardi che ondeggiano
const animFns = /* wgsl */ `
struct Moved { p: vec3f, n: vec3f };
var<private> CUP_X: array<f32, 3> = array<f32, 3>(${STEP_X.map(f).join(", ")});
fn animate(p: vec3f, n: vec3f, m: u32, uv: vec2f) -> Moved {
  var o: Moved; o.p = p; o.n = n;
  if (m >= ${Mat.cupGold}u && m <= ${Mat.cupBronze}u) {
    let k = m - ${Mat.cupGold}u; let a = F.cups[k];
    let c = vec2f(CUP_X[k], ${f(TROPHY_Z)}); let cs = cos(a.x); let sn = sin(a.x);
    let q = p.xz - c;
    o.p = vec3f(c.x + q.x * cs - q.y * sn, p.y + a.y, c.y + q.x * sn + q.y * cs);
    o.n = vec3f(n.x * cs - n.z * sn, n.y, n.x * sn + n.z * cs);
  } else if (m == ${Mat.banner}u) {
    let t = F.tileA.w; let w = pow(uv.y, 1.4);
    let ph = t * 0.9 + uv.x * 4.0 + uv.y * 2.0; let ph2 = t * 1.9 + uv.x * 9.0 + uv.y * 4.0;
    let dz = w * (0.07 * sin(ph) + 0.025 * sin(ph2));
    let dzu = w * (0.28 * cos(ph) + 0.225 * cos(ph2)); let dzv = w * (0.14 * cos(ph) + 0.1 * cos(ph2));
    o.p = p + vec3f(w * 0.03 * sin(t * 0.7 + uv.y * 1.5), 0.0, dz);
    o.n = normalize(n - vec3f(dzu / ${f(BANNERS[0].x1 - BANNERS[0].x0)}, -dzv / ${f(BANNERS[0].y1 - BANNERS[0].y0)}, 0.0) * sign(n.z));
  }
  return o;
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// texture procedurali (periodiche: si ripetono senza giunte)
export const texgenShader = /* wgsl */ `${noise}
@group(0) @binding(0) var marbleOut: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var fabricOut: texture_storage_2d<rgba8unorm, write>;
// rumore a gradiente periodico (periodo intero) e il suo frattale
fn grad(i: vec2f, per: f32) -> vec2f { let w = (i % per + per) % per; let a = hash2(w) * 6.2831853; return vec2f(cos(a), sin(a)); }
fn pnoise(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let fr = fract(p); let u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  let a = dot(grad(i, per), fr); let b = dot(grad(i + vec2f(1, 0), per), fr - vec2f(1, 0));
  let c = dot(grad(i + vec2f(0, 1), per), fr - vec2f(0, 1)); let d = dot(grad(i + vec2f(1, 1), per), fr - vec2f(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn pfbm(p: vec2f, per: f32, oct: i32) -> f32 {
  var s = 0.0; var a = 0.5; var q = p; var pp = per;
  for (var o = 0; o < oct; o++) { s += a * pnoise(q, pp); q *= 2.0; pp *= 2.0; a *= 0.5; }
  return s;
}
// marmo: venature ripiegate (rumore deformato) e macchie fini
fn marble(uv: vec2f) -> vec2f {
  let p = uv * 4.0;
  let w = vec2f(pfbm(p, 4.0, 5), pfbm(p + vec2f(5.0, 1.0), 4.0, 5));
  let v1 = abs(pfbm(p * 0.5 + w * 1.7, 2.0, 6));
  let v2 = abs(pfbm(p + w * 2.4 + vec2f(3.0, 7.0), 4.0, 5));
  let vein = 1.0 - (1.0 - smoothstep(0.0, 0.05, v1)) * 0.85 - (1.0 - smoothstep(0.0, 0.02, v2)) * 0.35;
  let cloud = 0.5 + 0.5 * pfbm(p * 2.0 + vec2f(9.0, 2.0), 8.0, 5);
  return vec2f(clamp(0.82 + 0.1 * cloud - 0.55 * (1.0 - vein), 0.0, 1.0), cloud);
}
@compute @workgroup_size(8, 8, 1) fn texgen(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2f(textureDimensions(marbleOut));
  if (f32(id.x) < size.x && f32(id.y) < size.y) {
    let uv = (vec2f(id.xy) + 0.5) / size; let e = 1.0 / size.x;
    let m = marble(uv); let mx = marble(uv + vec2f(e, 0.0)).x; let my = marble(uv + vec2f(0.0, e)).x;
    let n = normalize(vec3f((m.x - mx) * 6.0, (m.x - my) * 6.0, 1.0));
    textureStore(marbleOut, id.xy, vec4f(m.x, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, m.y));
  }
  let fs = vec2f(textureDimensions(fabricOut));
  if (f32(id.x) < fs.x && f32(id.y) < fs.y) {
    // velluto e stoffa: fili alternati con un poco di irregolarità
    let uv = (vec2f(id.xy) + 0.5) / fs * 32.0;
    let odd = (i32(floor(uv.x)) + i32(floor(uv.y))) % 2 == 0;
    let wx = 0.5 + 0.5 * sin(uv.x * 6.2831853); let wy = 0.5 + 0.5 * sin(uv.y * 6.2831853);
    let irr = 0.5 + 0.5 * pfbm(uv * 0.25, 8.0, 3);
    let h = select(wy, wx, odd) * 0.8 + irr * 0.2;
    let gx = cos(uv.x * 6.2831853) * select(0.0, 1.0, odd); let gy = cos(uv.y * 6.2831853) * select(1.0, 0.0, odd);
    let n = normalize(vec3f(-gx * 0.6, -gy * 0.6, 1.0));
    textureStore(fabricOut, id.xy, vec4f(0.75 + 0.25 * h, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, irr));
  }
}
`;

// riduzione 2×2 per le mip (formato e dimensione dati)
export const mipShader = (format: "rgba8unorm" | "rgba16float", array: boolean) => /* wgsl */ `
@group(0) @binding(0) var src: ${array ? "texture_2d_array<f32>" : "texture_2d<f32>"};
@group(0) @binding(1) var dst: ${array ? `texture_storage_2d_array<${format}, write>` : `texture_storage_2d<${format}, write>`};
@compute @workgroup_size(8, 8, 1) fn mip(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst);
  if (id.x >= d.x || id.y >= d.y) { return; }
  let s = vec2i(id.xy) * 2; let sd = vec2i(textureDimensions(src)) - 1;
  var c = vec4f(0.0);
  for (var k = 0; k < 4; k++) {
    let q = min(s + vec2i(k & 1, k >> 1u), sd);
    c += ${array ? "textureLoad(src, q, i32(id.z), 0)" : "textureLoad(src, q, 0)"};
  }
  ${array ? "textureStore(dst, vec2i(id.xy), i32(id.z), c * 0.25);" : "textureStore(dst, vec2i(id.xy), c * 0.25);"}
}
`;

// ---------------------------------------------------------------------------------------------------------------------
const frameBindings = (gi: "read" | "read_write") => /* wgsl */ `
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var cmpSamp: sampler_comparison;
@group(0) @binding(3) var cloudTex: texture_2d<f32>;
@group(0) @binding(4) var linSamp: sampler;
@group(0) @binding(5) var<storage, ${gi}> giBuf: array<vec4f>;
@group(0) @binding(6) var marbleTex: texture_2d<f32>;
@group(0) @binding(7) var fabricTex: texture_2d<f32>;
@group(0) @binding(8) var decalTex: texture_2d<f32>;
@group(0) @binding(9) var anisoSamp: sampler;
@group(0) @binding(10) var envTex: texture_cube<f32>;
@group(0) @binding(11) var planarTex: texture_2d<f32>;
`;

const lightFns = (q: PodiumQuality) => /* wgsl */ `
const LIGHT_DEPTH = ${f(LIGHT_DEPTH)};
const LRECT = vec2f(${f(LIGHT_RECT.x1 - LIGHT_RECT.x0)}, ${f(LIGHT_RECT.y1 - LIGHT_RECT.y0)});
const SDIM = vec2f(${f(q.shadow[0])}, ${f(q.shadow[1])});
const CLOUD_TEXEL = ${f((LIGHT_RECT.x1 - LIGHT_RECT.x0) / 512)};
var<private> POISSON: array<vec2f, 12> = array<vec2f, 12>(vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621), vec2f(0.962, -0.195), vec2f(0.473, -0.480), vec2f(0.519, 0.767), vec2f(0.185, -0.893), vec2f(0.507, 0.064), vec2f(0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598));
fn shadowCoord(p: vec3f) -> vec3f { let c = F.light * vec4f(p, 1.0); return vec3f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5, c.z); }
fn cloudAt(uv: vec2f, blurWorld: f32) -> f32 {
  return textureSampleLevel(cloudTex, linSamp, uv, clamp(log2(max(blurWorld, 1e-4) / CLOUD_TEXEL), 0.0, 8.0)).r;
}
// luce dell'astro in p (0..1). soft: penombra PCSS; altrimenti un solo campione filtrato dall'hardware
fn sunLight(p: vec3f, soft: bool) -> f32 {
  if (F.sun.z > -0.02) { return 0.0; }
  let sc = shadowCoord(p);
  if (any(sc.xy <= vec2f(0.0)) || any(sc.xy >= vec2f(1.0)) || sc.z <= 0.0) { return 0.0; }
  let s = sc.z * LIGHT_DEPTH;
  let bias = (0.015 + s * 0.0012) / LIGHT_DEPTH;
  if (!soft) { return textureSampleCompareLevel(shadowTex, cmpSamp, sc.xy, sc.z - bias) * cloudAt(sc.xy, s * 0.006 + 0.05); }
  // ricerca degli ostacoli e loro distanza media: la penombra cresce con la distanza dall'ostacolo (astro di mezzo grado)
  let search = (0.012 * s + 0.02) / LRECT;
  var blk = 0.0; var nb = 0.0;
  for (var i = 0; i < 12; i++) {
    let uv = clamp(sc.xy + POISSON[i] * search, vec2f(0.0), vec2f(0.9999));
    let d = textureLoad(shadowTex, vec2i(uv * SDIM), 0);
    if (d < sc.z - bias) { blk += d; nb += 1.0; }
  }
  var vis = 1.0;
  if (nb > 0.0) {
    let pen = clamp((s - blk / nb * LIGHT_DEPTH) * 0.0095 + 0.004, 0.004, 0.3) / LRECT;
    vis = 0.0;
    for (var i = 0; i < 12; i++) { vis += textureSampleCompareLevel(shadowTex, cmpSamp, sc.xy + POISSON[i] * pen, sc.z - bias); }
    vis /= 12.0;
  }
  return vis * cloudAt(sc.xy, s * 0.0047 + 0.01);
}
`;

const giFns = /* wgsl */ `
const GD = vec3u(${GI_DIM.join("u, ")}u); const GMIN = ${v3(GI_MIN)}; const GMAX = ${v3(GI_MAX)};
fn probeIndex(c: vec3u) -> u32 { return c.x + c.y * GD.x + c.z * GD.x * GD.y; }
fn probePos(i: u32) -> vec3f {
  let c = vec3f(f32(i % GD.x), f32((i / GD.x) % GD.y), f32(i / (GD.x * GD.y)));
  return GMIN + c / vec3f(GD - 1u) * (GMAX - GMIN);
}
// irradianza dalle sonde: interpolazione trilineare del cubo ambientale, pesata dalla validità (sonde dentro gli oggetti)
fn giAt(p: vec3f, n: vec3f) -> vec3f {
  let g = clamp((p - GMIN) / (GMAX - GMIN) * vec3f(GD - 1u), vec3f(0.0), vec3f(GD - 1u) - 0.001);
  let b = vec3u(floor(g)); let fr = g - floor(g); let n2 = n * n;
  let sx = select(1u, 0u, n.x > 0.0); let sy = select(3u, 2u, n.y > 0.0); let sz = select(5u, 4u, n.z > 0.0);
  var sum = vec3f(0.0); var ws = 0.0;
  for (var k = 0u; k < 8u; k++) {
    let o = vec3u(k & 1u, (k >> 1u) & 1u, k >> 2u);
    let wv = mix(1.0 - fr, fr, vec3f(o));
    let base = probeIndex(b + o) * 6u;
    let px = giBuf[base + sx]; let py = giBuf[base + sy]; let pz = giBuf[base + sz];
    let w = wv.x * wv.y * wv.z * px.w;
    sum += (n2.x * px.rgb + n2.y * py.rgb + n2.z * pz.rgb) * w; ws += w;
  }
  return sum / max(ws, 1e-4);
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// nuvole sul piano del vetro (con lo spostamento di parallasse dell'astro)
export const cloudShader = /* wgsl */ `${structs}${noise}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8, 1) fn clouds(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(outTex);
  if (id.x >= d.x || id.y >= d.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(d);
  let q = vec2f(${f(LIGHT_RECT.x0)} + uv.x * ${f(LIGHT_RECT.x1 - LIGHT_RECT.x0)}, ${f(LIGHT_RECT.y1)} - uv.y * ${f(LIGHT_RECT.y1 - LIGHT_RECT.y0)});
  let L = F.sun.xyz;
  let t = 1.0 - F.ceiling.w * cloudDensity(q + L.xy / max(-L.z, 0.05) * 7.0, F.tileA.w);
  textureStore(outTex, id.xy, vec4f(t, 0.0, 0.0, 1.0));
}
`;

// profondità dal piano del vetro
export const shadowShader = /* wgsl */ `${structs}
@group(0) @binding(0) var<uniform> F: Frame;
${animFns}
@vertex fn vsShadow(@location(0) p: vec3f, @location(2) uv: vec2f, @location(3) m: f32) -> @builtin(position) vec4f {
  let a = animate(p, vec3f(0.0, 0.0, 1.0), u32(m + 0.5), uv);
  return F.light * vec4f(a.p, 1.0);
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// illuminazione globale: forme semplificate, intersezioni in forma chiusa
const proxies = /* wgsl */ `
const RX = ${f(ROOM.x)}; const RY = ${f(ROOM.y)}; const RB = ${f(ROOM.back)}; const RF = ${f(ROOM.front)};
const WR = ${f(WINDOW.r)}; const WY0 = ${f(WINDOW.y0)}; const WYA = ${f(WINDOW.ya)};
var<private> PBC: array<vec4f, ${PROXY_BOXES.length}> = array<vec4f, ${PROXY_BOXES.length}>(${PROXY_BOXES.map((b) => `vec4f(${b.c.map(f).join(", ")}, ${f(b.m)})`).join(", ")});
var<private> PBH: array<vec3f, ${PROXY_BOXES.length}> = array<vec3f, ${PROXY_BOXES.length}>(${PROXY_BOXES.map((b) => v3(b.h)).join(", ")});
var<private> PCY: array<vec4f, ${PROXY_CYLS.length}> = array<vec4f, ${PROXY_CYLS.length}>(${PROXY_CYLS.map((c) => `vec4f(${c.c.map(f).join(", ")}, ${f(c.r)})`).join(", ")});
var<private> PSP: array<vec4f, ${PROXY_SPHS.length}> = array<vec4f, ${PROXY_SPHS.length}>(${PROXY_SPHS.map((s) => `vec4f(${s.c.map(f).join(", ")}, ${f(s.r)})`).join(", ")});
const CYL_H = ${f(PROXY_CYLS[0].h)};
struct PHit { t: f32, n: vec3f, m: u32 };
fn boxT(ro: vec3f, rd: vec3f, c: vec3f, h: vec3f) -> vec4f {
  let m = 1.0 / rd; let n = m * (ro - c); let k = abs(m) * h;
  let t1 = -n - k; let t2 = -n + k;
  let tN = max(max(t1.x, t1.y), t1.z); let tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tN < 0.0) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  return vec4f(tN, -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz));
}
fn inOpening(q: vec2f) -> bool {
  if (q.y > WYA) { return length(q - vec2f(0.0, WYA)) < WR; }
  return abs(q.x) < WR && q.y > WY0;
}
fn traceProxy(ro: vec3f, rd: vec3f) -> PHit {
  var h: PHit; h.t = 1e9; h.m = ${Mat.wall}u;
  if (rd.y < 0.0) { let t = -ro.y / rd.y; if (t < h.t) { h.t = t; h.n = vec3f(0, 1, 0); h.m = ${Mat.floor}u; } }
  if (rd.y > 0.0) { let t = (RY - ro.y) / rd.y; if (t < h.t) { h.t = t; h.n = vec3f(0, -1, 0); h.m = ${Mat.ceiling}u; } }
  if (rd.x > 0.0) { let t = (RX - ro.x) / rd.x; if (t < h.t) { h.t = t; h.n = vec3f(-1, 0, 0); h.m = ${Mat.wall}u; } }
  if (rd.x < 0.0) { let t = (-RX - ro.x) / rd.x; if (t < h.t) { h.t = t; h.n = vec3f(1, 0, 0); h.m = ${Mat.wall}u; } }
  if (rd.z > 0.0) { let t = (RF - ro.z) / rd.z; if (t < h.t) { h.t = t; h.n = vec3f(0, 0, -1); h.m = ${Mat.wall}u; } }
  if (rd.z < 0.0) { let t = (RB - ro.z) / rd.z; if (t < h.t) { h.t = t; h.n = vec3f(0, 0, 1); h.m = select(${Mat.wall}u, 0u, inOpening((ro + rd * t).xy)); } }
  for (var i = 0; i < ${PROXY_BOXES.length}; i++) {
    let b = boxT(ro, rd, PBC[i].xyz, PBH[i]);
    if (b.x > 1e-4 && b.x < h.t) { h.t = b.x; h.n = b.yzw; h.m = u32(PBC[i].w); }
  }
  for (var i = 0; i < ${PROXY_CYLS.length}; i++) {
    let c = PCY[i]; let oc = ro.xz - c.xz; let d = rd.xz;
    let a = dot(d, d); let bb = dot(oc, d); let disc = bb * bb - a * (dot(oc, oc) - c.w * c.w);
    if (disc > 0.0 && a > 1e-8) {
      let t = (-bb - sqrt(disc)) / a;
      if (t > 1e-4 && t < h.t && abs(ro.y + rd.y * t - c.y) < CYL_H) { h.t = t; let q = (oc + d * t) / c.w; h.n = vec3f(q.x, 0.0, q.y); h.m = ${Mat.stone}u; }
    }
  }
  for (var i = 0; i < ${PROXY_SPHS.length}; i++) {
    let s = PSP[i]; let oc = ro - s.xyz; let b = dot(oc, rd); let disc = b * b - (dot(oc, oc) - s.w * s.w);
    if (disc > 0.0) { let t = -b - sqrt(disc); if (t > 1e-4 && t < h.t) { h.t = t; h.n = (oc + rd * t) / s.w; h.m = ${Mat.gold}u + u32(i); } }
  }
  return h;
}
fn insideProxy(p: vec3f) -> bool {
  for (var i = 0; i < ${PROXY_BOXES.length}; i++) { if (all(abs(p - PBC[i].xyz) < PBH[i] + 0.08)) { return true; } }
  for (var i = 0; i < ${PROXY_CYLS.length}; i++) { if (length(p.xz - PCY[i].xz) < PCY[i].w + 0.08 && abs(p.y - PCY[i].y) < CYL_H) { return true; } }
  return false;
}
fn proxyAlbedo(m: u32) -> vec3f {
  switch m {
    case ${Mat.floor}u: { return mix(F.tileA.rgb, F.tileB.rgb, 0.4); }
    case ${Mat.ceiling}u: { return F.ceiling.rgb * 0.8; }
    case ${Mat.stone}u, ${Mat.step1}u, ${Mat.step2}u, ${Mat.step3}u: { return F.stone.rgb; }
    case ${Mat.darkStone}u: { return F.darkStone.rgb; }
    case ${Mat.gold}u: { return vec3f(1.0, 0.77, 0.34) * 0.5; }
    case ${Mat.silver}u: { return vec3f(0.9, 0.92, 0.95) * 0.5; }
    case ${Mat.bronze}u: { return vec3f(0.8, 0.5, 0.3) * 0.5; }
    default: { return F.wall.rgb; }
  }
}
`;

export const giShader = (q: PodiumQuality) => /* wgsl */ `${structs}${noise}${frameBindings("read_write")}${sky}${lightFns(q)}${giFns}${proxies}
var<private> AXES: array<vec3f, 6> = array<vec3f, 6>(vec3f(1, 0, 0), vec3f(-1, 0, 0), vec3f(0, 1, 0), vec3f(0, -1, 0), vec3f(0, 0, 1), vec3f(0, 0, -1));
var<workgroup> acc: array<vec3f, 64>;
// un gruppo di lavoro per (sonda, direzione): 64 fili × 2 raggi fissi (spirale di Fibonacci con densità del coseno)
@compute @workgroup_size(64) fn gi(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let slot = wg.x / 6u; let axis = wg.x % 6u;
  let probe = slot * ${q.giPeriod}u + u32(F.carpet.w);
  let valid = probe < ${GI_PROBES}u;
  let pos = probePos(min(probe, ${GI_PROBES - 1}u));
  let ax = AXES[axis];
  let t1 = normalize(select(cross(ax, vec3f(0, 1, 0)), cross(ax, vec3f(1, 0, 0)), abs(ax.y) > 0.9));
  let t2 = cross(ax, t1);
  let inside = insideProxy(pos);
  var sum = vec3f(0.0);
  if (valid && !inside) {
    for (var r = 0u; r < 2u; r++) {
      let i = f32(li * 2u + r) + 0.5;
      let u1 = i / 128.0; let ph = 6.2831853 * fract(i * 0.6180339887);
      let st = sqrt(u1); let ct = sqrt(1.0 - u1);
      let d = normalize(t1 * (st * cos(ph)) + t2 * (st * sin(ph)) + ax * ct);
      let h = traceProxy(pos, d);
      if (h.m == 0u) { sum += sky(d, false); continue; }
      let hp = pos + d * h.t;
      let alb = proxyAlbedo(h.m);
      let ndl = max(dot(h.n, F.sun.xyz), 0.0);
      var vis = 0.0;
      if (ndl > 0.0) { vis = sunLight(hp + h.n * 0.03, false); }
      sum += alb * (F.sunCol.rgb * F.sun.w * vis * ndl / PI + giAt(hp + h.n * 0.35, h.n) * 0.92);
    }
  }
  acc[li] = sum;
  workgroupBarrier();
  for (var s = 32u; s > 0u; s >>= 1u) {
    if (li < s) { acc[li] += acc[li + s]; }
    workgroupBarrier();
  }
  if (li == 0u && valid) {
    let k = probe * 6u + axis;
    if (inside) { giBuf[k] = vec4f(0.0); }
    else {
      let est = acc[0] / 128.0; let old = giBuf[k];
      giBuf[k] = vec4f(mix(old.rgb, est, select(0.5, 1.0, old.w == 0.0)), 1.0);
    }
  }
}
`;

// ---------------------------------------------------------------------------------------------------------------------
const passBinding = /* wgsl */ `@group(1) @binding(0) var<uniform> P: Pass;
fn camRay(px: vec2f) -> vec3f {
  let k = P.pos.w / (P.fwd.w * 0.5);
  return normalize(P.fwd.xyz + (px.x - P.right.w) * k * P.right.xyz + (P.up.w - px.y) * k * P.up.xyz);
}
`;

const material = /* wgsl */ `
struct Surf { alb: vec3f, rough: f32, metal: f32, n: vec3f, ao: f32, kind: u32, sheen: f32 };
// kind: 0 diffuso (riflesso dalle sonde), 1 pavimento (riflesso planare), 2 lucido (riflesso dalla cubemap)
struct Grads { px: vec3f, py: vec3f, ux: vec2f, uy: vec2f };
var<private> METALS: array<vec3f, 3> = array<vec3f, 3>(vec3f(1.0, 0.76, 0.33), vec3f(0.92, 0.93, 0.95), vec3f(0.8, 0.49, 0.3));
fn unpackN(t: vec4f, s: f32) -> vec3f { let xy = (t.gb * 2.0 - 1.0) * s; return vec3f(xy, sqrt(max(0.0, 1.0 - dot(xy, xy)))); }
// marmo in proiezione triplanare con le normali fuse (whiteout): x = colore, y = finezza
fn triMarble(p: vec3f, n: vec3f, sc: f32, bump: f32, g: Grads, nOut: ptr<function, vec3f>) -> vec2f {
  var w = pow(abs(n), vec3f(4.0)); w /= (w.x + w.y + w.z);
  let tx = textureSampleGrad(marbleTex, anisoSamp, p.zy * sc, g.px.zy * sc, g.py.zy * sc);
  let ty = textureSampleGrad(marbleTex, anisoSamp, p.xz * sc, g.px.xz * sc, g.py.xz * sc);
  let tz = textureSampleGrad(marbleTex, anisoSamp, p.xy * sc, g.px.xy * sc, g.py.xy * sc);
  let nx = unpackN(tx, bump); let ny = unpackN(ty, bump); let nz = unpackN(tz, bump);
  let ax = vec3f(nx.xy + n.zy, abs(nx.z) * n.x); let ay = vec3f(ny.xy + n.xz, abs(ny.z) * n.y); let az = vec3f(nz.xy + n.xy, abs(nz.z) * n.z);
  *nOut = normalize(ax.zyx * w.x + ay.xzy * w.y + az.xyz * w.z);
  return vec2f(tx.r * w.x + ty.r * w.y + tz.r * w.z, tx.a * w.x + ty.a * w.y + tz.a * w.z);
}
fn surfaceAt(m: u32, p: vec3f, n0: vec3f, uv: vec2f, vao: f32, g: Grads) -> Surf {
  var s: Surf; s.rough = 0.85; s.metal = 0.0; s.n = n0; s.ao = vao; s.kind = 0u; s.sheen = 0.0;
  var nn = n0;
  switch m {
    case ${Mat.floor}u: {
      // scacchiera di marmo chiaro e verde, ogni lastra con il suo taglio di venatura, fughe sottili
      let tile = 1.2; let cell = floor(p.xz / tile); let gq = fract(p.xz / tile);
      let chk = (i32(cell.x) + i32(cell.y)) & 1;
      let off = vec2f(hash2(cell), hash2(cell + 17.0)) * 4.0;
      let t = textureSampleGrad(marbleTex, anisoSamp, p.xz * 0.38 + off, g.px.xz * 0.38, g.py.xz * 0.38);
      let tint = select(F.tileA.rgb, F.tileB.rgb, chk == 1);
      s.alb = tint * mix(0.62, 1.04, t.r);
      let gd = min(min(gq.x, 1.0 - gq.x), min(gq.y, 1.0 - gq.y)) * tile;
      let fw = max(length(g.px), length(g.py)) * 0.7;
      let grout = 1.0 - smoothstep(0.002, 0.004 + fw, gd);
      s.alb = mix(s.alb, tint * 0.35, grout);
      s.n = normalize(vec3f((t.g - 0.5) * 0.03, 1.0, (t.b - 0.5) * 0.03));
      s.rough = mix(0.06, 0.6, grout); s.kind = 1u;
    }
    case ${Mat.carpet}u: {
      // velluto con il gallone d'oro
      let t = textureSampleGrad(fabricTex, anisoSamp, p.xz * 6.0, g.px.xz * 6.0, g.py.xz * 6.0);
      let e = ${f(CARPET.hw)} - abs(p.x);
      s.alb = F.carpet.rgb * t.r; s.rough = 0.95; s.sheen = 0.6;
      s.n = normalize(vec3f((t.g - 0.5) * 0.5, 1.0, (t.b - 0.5) * 0.5));
      if (e > 0.07 && e < 0.17 && n0.y > 0.5) { s.alb = METALS[0] * (0.7 + 0.3 * t.r); s.metal = 0.85; s.rough = 0.4; s.sheen = 0.0; }
    }
    case ${Mat.wall}u: {
      let t = triMarble(p * 0.55, n0, 0.35, 0.15, g, &nn);
      s.alb = F.wall.rgb * (0.93 + 0.07 * t.y); s.n = nn; s.rough = 0.9;
    }
    case ${Mat.coffer}u: { s.alb = F.ceiling.rgb * 0.6; }
    case ${Mat.ceiling}u: { s.alb = F.ceiling.rgb; s.rough = 0.7; }
    case ${Mat.wainscot}u: {
      let t = triMarble(p, n0, 0.5, 0.08, g, &nn);
      s.alb = F.wainscot.rgb * mix(0.75, 1.05, t.x); s.n = nn; s.rough = 0.35; s.kind = 2u;
    }
    case ${Mat.stone}u, ${Mat.step1}u, ${Mat.step2}u, ${Mat.step3}u: {
      let t = triMarble(p, n0, 0.42, 0.07, g, &nn);
      s.alb = F.stone.rgb * mix(0.62, 1.03, t.x); s.n = nn; s.rough = 0.22 + 0.15 * t.y; s.kind = 2u;
      if (m >= ${Mat.step1}u && n0.z > 0.9) {
        // numero inciso sul fronte del gradino, con l'intarsio del metallo del posto
        let i = m - ${Mat.step1}u;
        let fh = select(select(${f(STEP_H[2] - 0.2)}, ${f(STEP_H[1] - 0.2)}, i == 1u), ${f(STEP_H[0] - 0.2)}, i == 0u);
        let gh = min(fh * 0.82, 0.95);
        let lx = (uv.x - 0.5) * 2.16; let ly = (uv.y - 0.5) * fh;
        let gu = lx / (gh * 0.5) * 0.5 + 0.5; let gv = 0.5 - ly / gh;
        if (gu > 0.0 && gu < 1.0 && gv > 0.0 && gv < 1.0) {
          let du = vec2f(0.5 / 1024.0, 0.0); let dv = vec2f(0.0, 0.5 / 1024.0);
          let c = vec2f((f32(i) + gu) * 0.25, gv * 0.5);
          let mk = textureSampleLevel(decalTex, linSamp, c, 0.0).r;
          let gx = textureSampleLevel(decalTex, linSamp, c + du * 3.0, 0.0).r - textureSampleLevel(decalTex, linSamp, c - du * 3.0, 0.0).r;
          let gy = textureSampleLevel(decalTex, linSamp, c + dv * 3.0, 0.0).r - textureSampleLevel(decalTex, linSamp, c - dv * 3.0, 0.0).r;
          s.n = normalize(s.n + vec3f(-gx, gy, 0.0) * 1.4);
          s.alb = mix(s.alb, METALS[i], mk); s.metal = mk * 0.7; s.rough = mix(s.rough, 0.32, mk);
          s.ao *= 1.0 - 0.6 * saturate((abs(gx) + abs(gy)) * 1.5);
        }
      }
    }
    case ${Mat.darkStone}u: {
      let t = triMarble(p, n0, 0.5, 0.06, g, &nn);
      s.alb = F.darkStone.rgb * mix(0.7, 1.6, t.x); s.n = nn; s.rough = 0.18; s.kind = 2u;
    }
    case ${Mat.frame}u: { s.alb = F.frameC.rgb; s.metal = 0.6; s.rough = 0.38; s.kind = 2u; }
    case ${Mat.pedestal}u: {
      let t = triMarble(p, n0, 1.0, 0.05, g, &nn);
      s.alb = F.darkStone.rgb * mix(0.5, 1.2, t.x); s.n = nn; s.rough = 0.1; s.kind = 2u;
    }
    case ${Mat.banner}u: {
      // stoffa con l'emblema e il bordo ricamati d'oro
      let sc = vec2f(10.0, 30.0);
      let t = textureSampleGrad(fabricTex, anisoSamp, uv * sc, g.ux * sc, g.uy * sc);
      s.alb = F.banner.rgb * t.r; s.rough = 0.92; s.sheen = 0.5;
      let em = textureSampleLevel(decalTex, linSamp, vec2f(uv.x * 0.5, 0.5 + clamp((uv.y - 0.06) * 2.6, 0.0, 1.0) * 0.5), 0.0).r * step(uv.y, 0.44);
      let edge = step(min(uv.x, 1.0 - uv.x), 0.045) + step(uv.y, 0.025);
      let gold = saturate(em + edge);
      s.alb = mix(s.alb, METALS[0] * (0.75 + 0.25 * t.r), gold); s.metal = gold * 0.85; s.rough = mix(s.rough, 0.45, gold);
      s.n = normalize(n0 + vec3f((t.g - 0.5), 0.0, (t.b - 0.5)) * 0.4);
    }
    case ${Mat.cupGold}u, ${Mat.cupSilver}u, ${Mat.cupBronze}u: { s.alb = METALS[m - ${Mat.cupGold}u]; s.metal = 1.0; s.rough = 0.1; s.kind = 2u; }
    case ${Mat.gold}u, ${Mat.silver}u, ${Mat.bronze}u: {
      let k = m - ${Mat.gold}u;
      s.alb = METALS[k]; s.metal = 1.0; s.rough = 0.12; s.kind = 2u;
      // cima del gradino: lastra di marmo lucidato incorniciata dal metallo del posto (la cornice gira anche sui fianchi)
      let sx = select(select(${f(STEP_X[2])}, ${f(STEP_X[1])}, k == 1u), ${f(STEP_X[0])}, k == 0u);
      let top = select(select(${f(STEP_TOP[2])}, ${f(STEP_TOP[1])}, k == 1u), ${f(STEP_TOP[0])}, k == 0u);
      if (n0.y > 0.97 && abs(p.y - top) < 0.02) {
        let e = min(1.125 - abs(p.x - sx), ${f(STEP_D + 0.045)} - abs(p.z));
        let fw = max(length(g.px), length(g.py));
        let w = smoothstep(0.075 - fw, 0.075 + fw, e);
        let t = triMarble(p, n0, 0.42, 0.04, g, &nn);
        s.alb = mix(s.alb, F.stone.rgb * mix(0.72, 1.04, t.x), w); s.metal = 1.0 - w; s.rough = mix(0.2, 0.1, w);
        s.n = normalize(mix(n0, nn, w));
      }
    }
    default: { s.alb = F.wall.rgb; }
  }
  return s;
}
// occlusione di contatto: pavimento attorno alla pedana e alle colonne, angoli tra pareti e pavimento
fn contactAO(p: vec3f, n: vec3f) -> f32 {
  var ao = 1.0;
  if (n.y > 0.5 && p.y < 0.4) {
    let dp = length(max(abs(p.xz - vec2f(0.0, 0.1)) - vec2f(4.55, 1.95), vec2f(0.0)));
    ao *= 1.0 - 0.5 * exp(-dp * 5.0);
    for (var sd = -1.0; sd <= 1.0; sd += 2.0) { ao *= 1.0 - 0.35 * exp(-max(abs(p.x - sd * 6.0) - 0.62, 0.0) * 4.0) * step(abs(p.x - sd * 6.0), 1.6); }
  }
  if (n.y < 0.5) { ao *= 1.0 - 0.35 * exp(-p.y * 6.0); }
  return ao;
}
fn ggx(nh: f32, r: f32) -> f32 { let a = r * r; let a2 = a * a; let d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
fn fresnel(f0: vec3f, c: f32) -> vec3f { return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }
fn dfg(nv: f32, r: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022); let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let q = r * c0 + c1; let a = min(q.x * q.x, exp2(-9.28 * nv)) * q.x + q.y;
  return vec2f(-1.04, 1.04) * a + q.zw;
}
// luce che lascia la superficie verso l'osservatore in eye; px: pixel (per il riflesso planare)
fn shade(m: u32, p: vec3f, n0: vec3f, uv: vec2f, vao: f32, eye: vec3f, px: vec2f, g: Grads) -> vec3f {
  let s = surfaceAt(m, p, n0, uv, vao, g);
  let n = s.n; let V = normalize(eye - p); let L = F.sun.xyz;
  let nv = max(dot(n, V), 1e-3); let ndl = max(dot(n, L), 0.0);
  var vis = 0.0;
  if (ndl > 0.0 && dot(n0, L) > -0.05) { vis = sunLight(p + n0 * 0.012, P.misc.y == 0.0); }
  let light = F.sunCol.rgb * F.sun.w * vis * ndl;
  let ao = s.ao * contactAO(p, n0);
  let gi = (giAt(p + n0 * 0.3, n) + F.skyHor.w) * ao;
  let f0 = mix(vec3f(0.04), s.alb, s.metal);
  let H = normalize(L + V);
  let spec = light * fresnel(f0, max(dot(V, H), 0.0)) * ggx(max(dot(n, H), 0.0), max(s.rough, 0.05)) * 0.25 / nv;
  var col = s.alb * (1.0 - s.metal) * (light / PI + gi) + spec;
  // velluto e stoffa: riflesso radente
  col += s.sheen * pow(1.0 - nv, 4.0) * (gi + light * 0.1) * s.alb * 2.0;
  // riflessi: pavimento (planare), superfici lucide (cubemap della sala), altrimenti l'ambiente delle sonde
  let ab = dfg(nv, s.rough);
  let spF = f0 * ab.x + ab.y;
  var refl = gi * 0.6;
  if (P.misc.y == 0.0) {
    if (s.kind == 1u) {
      let uvp = px / P.misc.zw + n.xz * 0.04;
      refl = textureSampleLevel(planarTex, linSamp, uvp, s.rough * 8.0).rgb;
    } else if (s.kind == 2u) {
      refl = textureSampleLevel(envTex, linSamp, reflect(-V, n), s.rough * 7.0).rgb;
    }
  }
  col += refl * spF * ao;
  // coppa sotto il puntatore: un bagliore del suo metallo sui bordi
  if (m >= ${Mat.cupGold}u && m <= ${Mat.cupBronze}u) {
    let k = m - ${Mat.cupGold}u;
    col += METALS[k] * METALS[k] * F.cups[k].z * (0.04 + 0.9 * pow(1.0 - nv, 3.0)) * mix(0.55, 0.3, F.sunCol.w);
  }
  return col;
}
`;

export const sceneShader = (q: PodiumQuality) => /* wgsl */ `${structs}${noise}${frameBindings("read")}${passBinding}${sky}${lightFns(q)}${giFns}${material}${animFns}
struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) @interpolate(flat) m: u32, @location(4) ao: f32 };
@vertex fn vsScene(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) m: f32, @location(4) ao: f32) -> VOut {
  var o: VOut;
  let mi = u32(m + 0.5);
  let a = animate(p, n, mi, uv);
  // riflesso del pavimento: la sala capovolta sotto il piano y = 0, vista dalla camera vera
  let cp = select(a.p, vec3f(a.p.x, -a.p.y, a.p.z), P.misc.y == 1.0);
  o.pos = P.vp * vec4f(cp, 1.0);
  o.wp = a.p; o.n = a.n; o.uv = uv; o.m = mi; o.ao = ao;
  return o;
}
@fragment fn fsScene(i: VOut) -> @location(0) vec4f {
  // derivate calcolate qui, nel flusso uniforme: i materiali le usano per filtrare le texture
  var g: Grads; g.px = dpdx(i.wp); g.py = dpdy(i.wp); g.ux = dpdx(i.uv); g.uy = dpdy(i.uv);
  let n = normalize(i.n);
  var eye = P.pos.xyz;
  if (P.misc.y == 1.0) { eye.y = -eye.y; }
  return vec4f(shade(i.m, i.wp, n, i.uv, i.ao, eye, i.pos.xy, g), 1.0);
}
// cielo: solo dove nessuna superficie è stata disegnata (profondità 1)
@vertex fn vsSky(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((k << 1u) & 2u), f32(k & 2u));
  return vec4f(p * 2.0 - 1.0, 1.0, 1.0);
}
@fragment fn fsSky(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  var d = camRay(fc.xy);
  if (P.misc.y == 1.0) { d.y = -d.y; }
  return vec4f(sky(d, true), 1.0);
}
// pulviscolo: granelli che fluttuano e brillano solo dentro i raggi
struct DOut { @builtin(position) pos: vec4f, @location(0) c: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsDust(@builtin(vertex_index) k: u32, @builtin(instance_index) ii: u32) -> DOut {
  var o: DOut;
  let fi = f32(ii); let t = F.tileA.w;
  let seed = vec3f(hash2(vec2f(fi, 1.3)), hash2(vec2f(fi, 7.1)), hash2(vec2f(fi, 3.7)));
  let drift = vec3f(sin(t * 0.13 + fi) * 0.25, -t * 0.035 * (0.5 + seed.x), sin(t * 0.09 + fi * 1.7) * 0.25);
  let box = vec3f(9.0, 9.0, 13.0); let lo = vec3f(-4.5, 0.4, -6.4);
  let p = lo + fract(seed + drift / box) * box;
  let vis = sunLight(p, false);
  let tw = 0.55 + 0.45 * sin(t * (1.5 + seed.y * 2.0) + fi);
  let c = vec2f(f32(k & 1u), f32(k >> 1u)) * 2.0 - 1.0;
  let size = 0.006 + 0.006 * seed.z;
  o.pos = P.vp * vec4f(p + (P.right.xyz * c.x + P.up.xyz * c.y) * size, 1.0);
  if (vis < 0.02) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  o.c = c; o.col = F.sunCol.rgb * F.sun.w * vis * tw * 0.08;
  return o;
}
@fragment fn fsDust(i: DOut) -> @location(0) vec4f {
  let a = max(0.0, 1.0 - dot(i.c, i.c));
  return vec4f(i.col * a * a, 0.0);
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// fasci di luce: diffusione nel pulviscolo lungo il raggio di vista fino alla superficie visibile
export const volShader = (q: PodiumQuality) => /* wgsl */ `${structs}${noise}${frameBindings("read")}${passBinding}${lightFns(q)}
@group(2) @binding(0) var depthTex: texture_depth_multisampled_2d;
@group(2) @binding(1) var volPrev: texture_2d<f32>;
@vertex fn vsFull(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((k << 1u) & 2u), f32(k & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
// visibilità dell'astro nella nebbia: quattro campioni fissi attorno al punto (le lame d'ombra sottili dei montanti,
// viste di taglio, altrimenti diventerebbero righe scure sullo schermo)
fn fogLight(p: vec3f) -> f32 {
  if (F.sun.z > -0.02) { return 0.0; }
  let sc = shadowCoord(p);
  if (any(sc.xy <= vec2f(0.0)) || any(sc.xy >= vec2f(1.0)) || sc.z <= 0.0) { return 0.0; }
  let s = sc.z * LIGHT_DEPTH; let r = (0.09 + s * 0.006) / LRECT; let b = (0.03 + s * 0.002) / LIGHT_DEPTH;
  var v = 0.0;
  for (var i = 0; i < 4; i++) { v += textureSampleCompareLevel(shadowTex, cmpSamp, sc.xy + POISSON[i * 3] * r, sc.z - b); }
  return v * 0.25 * cloudAt(sc.xy, s * 0.008 + 0.1);
}
@fragment fn fsVol(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let scale = F.res.x / F.res.z;
  let full = fc.xy * scale;
  let rd = camRay(full);
  let ro = P.pos.xyz;
  // distanza della superficie visibile dalla profondità della scena (proiezione con near 0,1 e far 90)
  let dz = textureLoad(depthTex, vec2i(min(full, F.res.xy - 1.0)), 0);
  let lin = 0.1 * 90.0 / (90.0 - dz * (90.0 - 0.1));
  let tmax = min(lin / max(dot(rd, P.fwd.xyz), 0.05), 45.0);
  let steps = F.stone.w; let dt = tmax / steps;
  let j = fract(ign(fc.xy) + F.tileB.w * 0.618034);
  let L = F.sun.xyz; let g = 0.4; let mu = dot(rd, L);
  let phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  let sunC = F.sunCol.rgb * F.sun.w; let amb = F.skyHor.rgb * mix(0.02, 0.01, F.sunCol.w);
  let t = F.tileA.w;
  var T = 1.0; var acc = vec3f(0.0);
  for (var i = 0.0; i < steps; i += 1.0) {
    let p = ro + rd * ((i + j) * dt);
    let dust = 0.6 + 0.4 * snoise3(p * 0.35 + vec3f(t * 0.02, -t * 0.04, t * 0.015));
    let dens = F.wall.w * max(0.0, 1.0 + F.wainscot.w * (dust - 0.6) * 1.6);
    acc += T * dens * dt * (sunC * fogLight(p) * phase + amb);
    T *= exp(-dens * dt);
  }
  let prev = textureLoad(volPrev, vec2i(fc.xy), 0);
  return mix(prev, vec4f(acc, T), F.darkStone.w);
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// composizione: scena + nebbia, bloom (riduzione a 13 campioni, ricostruzione a tenda), ACES, sRGB, dithering
export const postShader = /* wgsl */ `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var auxTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> post: vec4f; // esposizione, intensità del bloom, fotogramma, primo livello (1)
@vertex fn vsFull(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((k << 1u) & 2u), f32(k & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// scena risolta + fasci di luce (risoluzione ridotta, interpolati)
@fragment fn fsCombine(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(srcTex));
  let c = textureLoad(srcTex, vec2i(fc.xy), 0).rgb;
  let v = textureSampleLevel(auxTex, samp, fc.xy / size, 0.0);
  return vec4f(c * v.a + v.rgb, 1.0);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(srcTex));
  let S = (fc.xy * 2.0) * ts;
  let a = textureSampleLevel(srcTex, samp, S + ts * vec2f(-2, -2), 0.0).rgb; let b = textureSampleLevel(srcTex, samp, S + ts * vec2f(0, -2), 0.0).rgb; let c = textureSampleLevel(srcTex, samp, S + ts * vec2f(2, -2), 0.0).rgb;
  let d = textureSampleLevel(srcTex, samp, S + ts * vec2f(-2, 0), 0.0).rgb; let e = textureSampleLevel(srcTex, samp, S, 0.0).rgb; let f = textureSampleLevel(srcTex, samp, S + ts * vec2f(2, 0), 0.0).rgb;
  let g = textureSampleLevel(srcTex, samp, S + ts * vec2f(-2, 2), 0.0).rgb; let h = textureSampleLevel(srcTex, samp, S + ts * vec2f(0, 2), 0.0).rgb; let i = textureSampleLevel(srcTex, samp, S + ts * vec2f(2, 2), 0.0).rgb;
  let j = textureSampleLevel(srcTex, samp, S + ts * vec2f(-1, -1), 0.0).rgb; let k = textureSampleLevel(srcTex, samp, S + ts * vec2f(1, -1), 0.0).rgb;
  let l = textureSampleLevel(srcTex, samp, S + ts * vec2f(-1, 1), 0.0).rgb; let m = textureSampleLevel(srcTex, samp, S + ts * vec2f(1, 1), 0.0).rgb;
  var o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (post.w > 0.5) { o = o / (1.0 + max(max(o.r, o.g), o.b) * 0.25); } // primo livello: niente lucciole dai riflessi
  return vec4f(o, 1.0);
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(srcTex)); let uv = fc.xy / (vec2f(textureDimensions(srcTex)) * 2.0);
  var o = textureSampleLevel(srcTex, samp, uv, 0.0).rgb * 4.0;
  o += (textureSampleLevel(srcTex, samp, uv + ts * vec2f(-1, 0), 0.0).rgb + textureSampleLevel(srcTex, samp, uv + ts * vec2f(1, 0), 0.0).rgb + textureSampleLevel(srcTex, samp, uv + ts * vec2f(0, -1), 0.0).rgb + textureSampleLevel(srcTex, samp, uv + ts * vec2f(0, 1), 0.0).rgb) * 2.0;
  o += textureSampleLevel(srcTex, samp, uv + ts * vec2f(-1, -1), 0.0).rgb + textureSampleLevel(srcTex, samp, uv + ts * vec2f(1, -1), 0.0).rgb + textureSampleLevel(srcTex, samp, uv + ts * vec2f(-1, 1), 0.0).rgb + textureSampleLevel(srcTex, samp, uv + ts * vec2f(1, 1), 0.0).rgb;
  return vec4f(o / 16.0, 1.0);
}
@fragment fn fsFinal(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(srcTex)); let uv = fc.xy / size;
  var c = textureLoad(srcTex, vec2i(fc.xy), 0).rgb;
  c = mix(c, textureSampleLevel(auxTex, samp, uv, 0.0).rgb, post.y);
  c *= post.x;
  let q = uv - 0.5; c *= 1.0 - 0.25 * dot(q, q);
  c = saturate(c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14));
  var s = select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
  s += (ign(fc.xy + post.z * 7.0) - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
`;
