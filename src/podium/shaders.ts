// Shader WGSL della sala del podio (rasterizzazione di mesh vere, illuminazione globale dinamica, ombre PCSS, riflessi).
//  - texgen: texture procedurali periodiche (marmo venato con normali, trama del tessuto), una volta all'avvio;
//  - clouds: trasmissione delle nuvole sul piano del vetro (rumore simplex 3D che evolve), con le mip per la penombra;
//  - shadow: profondità rasterizzata dal piano del vetro lungo la luce (tutta la luce entra dal finestrone): ombre di
//    telaio, montanti, colonne, podio e coppe; filtrate con PCSS (penombra che cresce con la distanza dall'ostacolo);
//  - gi: sonde di luce (cubo ambientale) aggiornate a turno, ognuna con 128 raggi fissi per direzione su forme
//    semplificate: niente casualità, niente sfarfallio; i rimbalzi multipli arrivano dal riuso delle sonde stesse;
//  - scene: materiali (marmo triplanare, numeri incisi con intarsio di metallo, velluto, stoffa, metalli), luce diretta,
//    illuminazione globale, riflessi planari del pavimento e della cubemap della sala, cielo, pulviscolo nei raggi; contro
//    lo sfarfallio: lobo speculare allargato dove la normale cambia dentro il pixel, bordi e incisioni filtrati
//    sull'impronta del pixel, granelli e stelle mai più piccoli di un pixel;
//  - vol: fasci di luce a risoluzione ridotta accumulati nel tempo; post: risoluzione dell'MSAA pesata sulla luminanza,
//    bloom, ACES e sRGB, poi il passaggio ai pixel dello schermo (Catmull-Rom) con il dithering.
import { ROOM, WINDOW, LIGHT_RECT, LIGHT_DEPTH, PROXY_BOXES, PROXY_CYLS, PROXY_SPHS, CARPET, Mat, STEP_H, STEP_X, STEP_TOP, STEP_D, TROPHY_Z, BANNERS } from "./stage";
import type { Tier } from "./device";

// qualità per fascia di potenza della GPU (device.ts). minScale, maxScale: risoluzione della scena rispetto ai pixel del
// dispositivo (oltre 1 è supercampionamento; il passaggio finale la riporta ai pixel dello schermo); maxPixels: tetto dei
// pixel disegnati
export type PodiumQuality = { tier: Tier; mobile: boolean; shadow: [number, number]; planarScale: number; envSize: number; volScale: number; steps: number; giPeriod: number; dust: number; bloom: number; minScale: number; maxScale: number; maxPixels: number };
const QUALITY: Record<Tier, Omit<PodiumQuality, "tier" | "mobile">> = {
  low: { shadow: [768, 886], planarScale: 0.4, envSize: 128, volScale: 0.35, steps: 28, giPeriod: 24, dust: 200, bloom: 5, minScale: 0.5, maxScale: 1, maxPixels: 1.1e6 },
  medium: { shadow: [1024, 1182], planarScale: 0.5, envSize: 256, volScale: 0.4, steps: 40, giPeriod: 16, dust: 500, bloom: 5, minScale: 0.6, maxScale: 1, maxPixels: 3.7e6 },
  high: { shadow: [1536, 1772], planarScale: 0.6, envSize: 256, volScale: 0.5, steps: 48, giPeriod: 12, dust: 900, bloom: 6, minScale: 0.7, maxScale: 1.25, maxPixels: 6.5e6 },
  ultra: { shadow: [2048, 2363], planarScale: 0.75, envSize: 512, volScale: 0.6, steps: 64, giPeriod: 6, dust: 1400, bloom: 6, minScale: 0.8, maxScale: 1.5, maxPixels: 9.5e6 },
};
export const podiumQuality = (tier: Tier, mobile = false): PodiumQuality => ({ tier, mobile: mobile || tier === "low", ...QUALITY[tier] });

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : x.toFixed(5));
const v3 = (a: number[]) => `vec3f(${a.map(f).join(", ")})`;
export const GI_DIM = [18, 10, 16], GI_MIN = [-8.6, 0.25, -6.6], GI_MAX = [8.6, 11.6, 13];
export const GI_PROBES = GI_DIM[0] * GI_DIM[1] * GI_DIM[2];
export const FRAME_FLOATS = 16 + 15 * 4 + 3 * 4 + 16 + 4 * 4; // matrice della luce + 15 vec4 + le tre coppe + il faro e il bagliore della sorpresa
// The night guest's lamp (engine.ts aims it where he stops): perspective shadow map of the guest alone, near and far
// planes, half-angle of its frustum and the radius of the lamp (the softness of the penumbra)
export const SPOT = { near: 2.0, far: 20.0, tan: Math.tan((27 * Math.PI) / 180), radius: 0.35 };
export const PASS_FLOATS = 16 + 5 * 4; // matrice + 5 vec4

// ---------------------------------------------------------------------------------------------------------------------
// valori non finiti a zero e un tetto alla luce (sotto il massimo dei float a 16 bit): un solo pixel NaN, allargato dal
// bloom, diventerebbe un quadrato nero sullo schermo
const finite = /* wgsl */ `
fn finite3(c: vec3f) -> vec3f {
  let bad = (bitcast<vec3u>(c) & vec3u(0x7f800000u)) == vec3u(0x7f800000u);
  return clamp(select(c, vec3f(0.0), bad), vec3f(0.0), vec3f(4096.0));
}
`;
const structs = /* wgsl */ `
struct Frame {
  light: mat4x4f,
  sun: vec4f, sunCol: vec4f, skyTop: vec4f, skyHor: vec4f,
  wall: vec4f, wainscot: vec4f, ceiling: vec4f, tileA: vec4f, tileB: vec4f, stone: vec4f, darkStone: vec4f, carpet: vec4f, banner: vec4f, frameC: vec4f,
  res: vec4f,
  cups: array<vec4f, 3>, // per coppa: angolo, sollevamento, bagliore (puntatore sopra)
  // the night guest: the lamp over the place where he stops (shadow map of the guest), and his own green glow
  spotVP: mat4x4f, spotPos: vec4f, spotDir: vec4f, spotCol: vec4f, glow: vec4f,
};
// w: sun.w intensità; sunCol.w notte; skyTop.w esposizione; skyHor.w luce minima; wall.w nebbia; wainscot.w pulviscolo;
//    ceiling.w nuvole; tileA.w tempo; tileB.w fotogramma; stone.w passi della nebbia; darkStone.w fusione temporale;
//    carpet.w turno delle sonde; banner.w libero; frameC.w cantiere (podio coperto); res: immagine piena e
//    nebbia; spotPos.w intensità del faro (0 spento); spotDir.w coseno del bordo del cono; spotCol.w coseno del pieno;
//    glow: petto dell'ospite e intensità del suo bagliore verde
struct Pass { vp: mat4x4f, pos: vec4f, right: vec4f, up: vec4f, fwd: vec4f, misc: vec4f };
// pos.w tan(fov/2); right.w, up.w centro ottico (px); fwd.w altezza di riferimento (px); misc: -, modo (0 scena,
// 1 riflesso del pavimento, 2 cubemap), larghezza e altezza del bersaglio (px)
const PI = 3.14159265;
${finite}`;

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
// piccolo preso da pochi raggi fissi farebbe saltare le sonde mentre si muove). fp: celle delle stelle per pixel
fn sky(d: vec3f, sun: bool, fp: f32) -> vec3f {
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
  // stelle più piccole di un pixel: si allargano e si attenuano (niente sfarfallio)
  let rs = clamp(fp * 0.7, 0.06, 0.15);
  let st = step(0.975, hash2(g)) * (1.0 - smoothstep(0.0, rs, length(fract(sq) - sp))) * (0.0036 / (rs * rs)) * (0.6 + 0.4 * sin(F.tileA.w * 2.0 + hash2(g + 7.0) * 40.0));
  c += vec3f(0.85, 0.9, 1.0) * st * night * (1.0 - saturate(cl)) * 1.2;
  // nel cantiere, di giorno, il cielo oltre il finestrone è velato: la sala non abbaglia
  return c * (1.0 - 0.3 * F.frameC.w * (1.0 - night));
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
    let t = F.tileA.w; let w = pow(saturate(uv.y), 1.4);
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
@group(0) @binding(12) var spotTex: texture_depth_2d;
`;

const lightFns = (q: PodiumQuality) => /* wgsl */ `
const LIGHT_DEPTH = ${f(LIGHT_DEPTH)};
const LRECT = vec2f(${f(LIGHT_RECT.x1 - LIGHT_RECT.x0)}, ${f(LIGHT_RECT.y1 - LIGHT_RECT.y0)});
const SDIM = vec2f(${f(q.shadow[0])}, ${f(q.shadow[1])});
const CLOUD_TEXEL = ${f((LIGHT_RECT.x1 - LIGHT_RECT.x0) / 512)};
var<private> POISSON: array<vec2f, 12> = array<vec2f, 12>(vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621), vec2f(0.962, -0.195), vec2f(0.473, -0.480), vec2f(0.519, 0.767), vec2f(0.185, -0.893), vec2f(0.507, 0.064), vec2f(0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598));
// rotazione dei campioni della penombra, diversa per pixel e per fotogramma (la imposta fsScene): l'antialiasing
// temporale ne fa la media, così la penombra larga del cantiere è liscia invece che a gradini
var<private> SPIN: vec2f = vec2f(1.0, 0.0);
fn spun(v: vec2f) -> vec2f { return vec2f(v.x * SPIN.x - v.y * SPIN.y, v.x * SPIN.y + v.y * SPIN.x); }
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
  // ricerca degli ostacoli e loro distanza media: la penombra cresce con la distanza dall'ostacolo (astro di mezzo grado;
  // nel cantiere il sole è velato dalla polvere e l'astro sembra più grande: ombre più morbide)
  let veil = 1.0 + 0.9 * F.frameC.w;
  let search = (0.012 * s + 0.02) * veil / LRECT;
  var blk = 0.0; var nb = 0.0;
  for (var i = 0; i < 12; i++) {
    let uv = clamp(sc.xy + spun(POISSON[i]) * search, vec2f(0.0), vec2f(0.9999));
    let d = textureLoad(shadowTex, vec2i(uv * SDIM), 0);
    if (d < sc.z - bias) { blk += d; nb += 1.0; }
  }
  var vis = 1.0;
  if (nb > 0.0) {
    let pen = clamp(((s - blk / nb * LIGHT_DEPTH) * 0.0095 + 0.004) * veil, 0.004, 0.45) / LRECT;
    vis = 0.0;
    for (var i = 0; i < 12; i++) { vis += textureSampleCompareLevel(shadowTex, cmpSamp, sc.xy + spun(POISSON[i]) * pen, sc.z - bias); }
    vis /= 12.0;
  }
  return vis * cloudAt(sc.xy, s * 0.0047 + 0.01);
}
// the guest's lamp: depth from a perspective projection (WebGPU: z = A - B / distance)
const SPOT_A = ${f(SPOT.far / (SPOT.far - SPOT.near))}; const SPOT_B = ${f((SPOT.far * SPOT.near) / (SPOT.far - SPOT.near))};
const SPOT_DIM = ${f(q.mobile ? 512 : 1024)}; const SPOT_TAN = ${f(SPOT.tan)}; const SPOT_R = ${f(SPOT.radius)};
const GLOW_COL = vec3f(0.2, 1.0, 0.4);
fn spotDist(z: f32) -> f32 { return SPOT_B / max(SPOT_A - z, 1e-5); }
fn spotDepth(d: f32) -> f32 { return SPOT_A - SPOT_B / max(d, 1e-3); }
// how much of the lamp reaches p past the guest (0..1). soft: PCSS, the penumbra widens with the distance from his body
// to what he shades (his shadow on the floor and the wall is sharp at the feet, soft further away)
fn spotShadow(p: vec3f, soft: bool) -> f32 {
  let c = F.spotVP * vec4f(p, 1.0);
  if (c.w <= 0.0) { return 1.0; }
  let q = c.xyz / c.w; let uv = vec2f(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
  if (any(uv <= vec2f(0.0)) || any(uv >= vec2f(1.0)) || q.z >= 1.0 || q.z <= 0.0) { return 1.0; }
  let dR = spotDist(q.z); let bias = 0.012 + 0.002 * dR;
  if (!soft) { return textureSampleCompareLevel(spotTex, cmpSamp, uv, spotDepth(dR - bias)); }
  let perM = 1.0 / (2.0 * dR * SPOT_TAN); // uv per metre at the receiver
  var blk = 0.0; var nb = 0.0;
  for (var i = 0; i < 12; i++) {
    let s = clamp(uv + spun(POISSON[i]) * SPOT_R * perM * 1.5, vec2f(0.0), vec2f(0.9999));
    let d = spotDist(textureLoad(spotTex, vec2i(s * SPOT_DIM), 0));
    if (d < dR - bias) { blk += d; nb += 1.0; }
  }
  if (nb == 0.0) { return 1.0; }
  let dB = blk / nb;
  let pen = clamp(SPOT_R * (dR - dB) / dB * perM, 1.5 / SPOT_DIM, 0.05);
  var vis = 0.0;
  for (var i = 0; i < 12; i++) { vis += textureSampleCompareLevel(spotTex, cmpSamp, uv + spun(POISSON[i]) * pen, spotDepth(dR - bias)); }
  return vis / 12.0;
}
// light of the lamp arriving at p from direction *dir (radiance before the cosine), zero outside its cone
fn spotAt(p: vec3f, soft: bool, dir: ptr<function, vec3f>) -> vec3f {
  if (F.spotPos.w <= 0.0) { return vec3f(0.0); }
  let ld = F.spotPos.xyz - p; let dd = max(dot(ld, ld), 0.25); let L = ld * inverseSqrt(dd);
  *dir = L;
  let cone = smoothstep(F.spotDir.w, F.spotCol.w, dot(-L, F.spotDir.xyz));
  if (cone <= 0.0) { return vec3f(0.0); }
  return F.spotCol.rgb * F.spotPos.w * cone * spotShadow(p, soft) / dd;
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
      if (h.m == 0u) { sum += sky(d, false, 0.0); continue; }
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
      let est = finite3(acc[0] / 128.0); let old = giBuf[k];
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
// i colori dei materiali del cantiere seguono le due atmosfere come il marmo e le pareti (di notte scuri e freddi)
fn moody(c: vec3f) -> vec3f { return c * mix(vec3f(1.0), vec3f(0.2, 0.25, 0.27), F.sunCol.w); }
// la tavolozza delle vernici (site.ts, PAINT): bianco caldo, terracotta, verde petrolio, ocra, rosso, giallo, blu, nero
var<private> PAINTS: array<vec3f, 8> = array<vec3f, 8>(vec3f(0.82, 0.8, 0.74), vec3f(0.46, 0.11, 0.05), vec3f(0.02, 0.2, 0.19), vec3f(0.62, 0.38, 0.07),
  vec3f(0.5, 0.025, 0.02), vec3f(0.78, 0.5, 0.02), vec3f(0.04, 0.1, 0.32), vec3f(0.02, 0.02, 0.022));
// direzione della venatura nel mondo (la u della tavola), dalle derivate
fn woodGrain(g: Grads, n0: vec3f) -> vec3f {
  let ta = cross(g.py, n0); let tb = cross(n0, g.px); let tu = ta * g.ux.x + tb * g.uy.x;
  return tu * inverseSqrt(max(dot(tu, tu), 1e-12));
}
// impronte di scarpe impolverate da A a B, un passo ogni 36 cm, sinistro e destro alternati; svaniscono camminando
fn footprints(q: vec2f, A: vec2f, B: vec2f, k0: f32) -> f32 {
  let L = length(B - A); let D = (B - A) / L; let r = q - A;
  let along = dot(r, D); let side = dot(r, vec2f(-D.y, D.x));
  let k = floor(along / 0.36); let lr = select(-1.0, 1.0, (i32(k + k0) & 1) == 0);
  let fp = vec2f(along - (k + 0.5) * 0.36, side - lr * 0.09 + 0.02 * sin((k + k0) * 1.7));
  let sole = length((fp - vec2f(0.045, 0.0)) / vec2f(0.075, 0.045)); let heel = length((fp + vec2f(0.1, 0.0)) / vec2f(0.04, 0.038));
  return (1.0 - smoothstep(0.85, 1.0, min(sole, heel))) * step(0.0, along) * step(along, L) * (1.0 - (along + k0 * 0.36) / 14.0);
}
// grinze della tela (altezza, in metri di stoffa): due ottave di rumore allungate in direzioni diverse
fn crinkle(uv: vec2f) -> f32 {
  return snoise3(vec3f(uv.x * 2.1 + uv.y * 0.8, uv.y * 3.4 - uv.x * 0.6, 1.0)) * 0.7 + snoise3(vec3f(uv * vec2f(6.3, 4.1), 7.0)) * 0.3;
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
      if (F.frameC.w > 0.5) {
        // cantiere: polvere di gesso a chiazze, più fitta sotto il ponteggio e attorno ai cavalletti, e le impronte di
        // chi è andato avanti e indietro; dove c'è polvere il marmo non luccica
        let a = p.xz - vec2f(3.0, -5.3); let b = p.xz - vec2f(-4.2, -5.6);
        let zone = snoise3(vec3f(p.xz * 0.45, 5.0)) * 0.6 + 1.1 * exp(-dot(a, a) / 4.0) + 0.9 * exp(-dot(b, b) / 3.0) - 0.15;
        var dust = smoothstep(0.0, 0.7, zone) * (0.55 + 0.45 * snoise3(vec3f(p.xz * 7.0, 1.0)));
        // impronte: dal ponteggio, lungo il corridoio tra la pedana e le colonne, verso il davanti della sala
        let print = max(footprints(p.xz, vec2f(2.4, -4.4), vec2f(4.95, -2.2), 0.0), footprints(p.xz, vec2f(4.95, -2.2), vec2f(5.0, 5.0), 7.0));
        dust = max(dust, print * 0.5 * (0.6 + 0.4 * snoise3(vec3f(p.xz * 25.0, 4.0))));
        s.alb = mix(s.alb, moody(vec3f(0.8, 0.78, 0.74)), saturate(dust));
        s.rough = mix(s.rough, 0.8, saturate(dust * 1.4));
      }
    }
    case ${Mat.carpet}u: {
      // velluto con il gallone d'oro
      let t = textureSampleGrad(fabricTex, anisoSamp, p.xz * 6.0, g.px.xz * 6.0, g.py.xz * 6.0);
      let e = ${f(CARPET.hw)} - abs(p.x);
      s.n = normalize(vec3f((t.g - 0.5) * 0.5, 1.0, (t.b - 0.5) * 0.5));
      // il gallone con i bordi filtrati sull'impronta del pixel (un taglio netto fa i gradini lungo tutto il tappeto)
      let fw = max(abs(g.px.x) + abs(g.py.x), 1e-5);
      let gal = saturate((e - 0.07) / fw + 0.5) * saturate((0.17 - e) / fw + 0.5) * step(0.5, n0.y);
      s.alb = mix(F.carpet.rgb * t.r, METALS[0] * (0.7 + 0.3 * t.r), gal); s.metal = 0.85 * gal; s.rough = mix(0.95, 0.4, gal); s.sheen = 0.6 * (1.0 - gal);
    }
    case ${Mat.wall}u: {
      let t = triMarble(p * 0.55, n0, 0.35, 0.15, g, &nn);
      s.alb = F.wall.rgb * (0.93 + 0.07 * t.y); s.n = nn; s.rough = 0.9;
      if (F.frameC.w > 0.5) {
        // rappezzi di stucco ancora da carteggiare: rettangoli più chiari e opachi (uno ogni tanto, nella sua cella di
        // muro), con i bordi sfumati dalla spatola
        let wq = vec2f(select(p.x, p.z, abs(n0.x) > 0.5), p.y);
        let wc = floor(wq / vec2f(1.7, 1.3)); let wf = fract(wq / vec2f(1.7, 1.3)) * vec2f(1.7, 1.3);
        let wh = vec2f(hash2(wc + 2.0), hash2(wc + 6.0));
        let half = vec2f(0.25, 0.18) + wh * vec2f(0.4, 0.3); let mid = vec2f(0.85, 0.65) + (vec2f(hash2(wc + 9.0), hash2(wc + 4.0)) - 0.5) * 0.4;
        let edge = max(abs(wf.x - mid.x) - half.x, abs(wf.y - mid.y) - half.y) + 0.03 * snoise3(vec3f(wq * 6.0, 3.0));
        let on = step(0.72, hash2(wc + 13.0)) * (1.0 - smoothstep(5.5, 6.5, p.y));
        let spack = on * (1.0 - smoothstep(-0.04, 0.0, edge));
        let halo = on * (1.0 - smoothstep(0.0, 0.12, edge)) * (1.0 - spack) * 0.5;
        s.alb = mix(s.alb, moody(vec3f(0.88, 0.86, 0.82)), spack * 0.85 + halo * 0.35);
        s.n = normalize(mix(s.n, n0, spack));
      }
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
          // atlante con le mip letto sull'impronta del pixel: da lontano l'incisione si ammorbidisce invece di sfarfallare
          let J = vec2f(0.54 / gh, -0.5 * fh / gh); let cx = g.ux * J; let cy = g.uy * J;
          let mk = textureSampleGrad(decalTex, linSamp, c, cx, cy).r;
          let gx = textureSampleGrad(decalTex, linSamp, c + du * 3.0, cx, cy).r - textureSampleGrad(decalTex, linSamp, c - du * 3.0, cx, cy).r;
          let gy = textureSampleGrad(decalTex, linSamp, c + dv * 3.0, cx, cy).r - textureSampleGrad(decalTex, linSamp, c - dv * 3.0, cx, cy).r;
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
      let ek = vec2f(0.5, 1.3);
      let em = textureSampleGrad(decalTex, linSamp, vec2f(uv.x * 0.5, 0.5 + clamp((uv.y - 0.06) * 2.6, 0.0, 1.0) * 0.5), g.ux * ek, g.uy * ek).r * step(uv.y, 0.44);
      let fw = max(abs(g.ux) + abs(g.uy), vec2f(1e-5));
      let edge = saturate((0.045 - min(uv.x, 1.0 - uv.x)) / fw.x + 0.5) + saturate((0.025 - uv.y) / fw.y + 0.5);
      let gold = saturate(em + edge);
      s.alb = mix(s.alb, METALS[0] * (0.75 + 0.25 * t.r), gold); s.metal = gold * 0.85; s.rough = mix(s.rough, 0.45, gold);
      s.n = normalize(n0 + vec3f((t.g - 0.5), 0.0, (t.b - 0.5)) * 0.4);
    }
    case ${Mat.cloth}u: {
      // tela di cotone grezzo: trama fitta, grinze fini (rumore fissato alla stoffa, in metri), qualche macchia di
      // vernice ormai asciutta e la polvere posata sulle parti in piano
      let sc = vec2f(24.0);
      let t = textureSampleGrad(fabricTex, anisoSamp, uv * sc, g.ux * sc, g.uy * sc);
      let e = vec2f(0.012, 0.0);
      let c0 = crinkle(uv); let cu = crinkle(uv + e.xy); let cv = crinkle(uv + e.yx);
      // la base tangente dalle derivate (come per i modelli importati): u e v della stoffa nello spazio del mondo
      let ta = cross(g.py, n0); let tb = cross(n0, g.px);
      let tu = ta * g.ux.x + tb * g.uy.x; let tv = ta * g.ux.y + tb * g.uy.y;
      let inv = inverseSqrt(max(max(dot(tu, tu), dot(tv, tv)), 1e-12));
      let bump = vec2f(cu - c0, cv - c0) / e.x * 0.01 + (t.gb - 0.5) * 0.3;
      s.n = normalize(n0 - (tu * bump.x + tv * bump.y) * inv);
      let fw = max(length(g.ux) + length(g.uy), 1e-5);
      var alb = vec3f(0.74, 0.68, 0.56) * (0.86 + 0.14 * t.r) * (0.95 + 0.05 * c0);
      // macchie: chiazze irregolari e schizzi a gocce, nei colori di cantiere
      let blot = snoise3(vec3f(uv * 0.5, 17.0)) + 0.4 * snoise3(vec3f(uv * 2.6, 4.0));
      let stain = smoothstep(0.82, 0.84 + fw * 2.0, blot);
      // gli schizzi cadono a gruppi (dove si è lavorato con il pennello), ogni gruppo del suo colore
      let zone = snoise3(vec3f(uv * 0.3, 23.0));
      let cell = floor(uv * 11.0); let r = hash2(cell);
      let rad = 0.003 + 0.01 * hash2(cell + 3.0); let off = vec2f(hash2(cell + 5.0), hash2(cell + 8.0)) * 0.6 + 0.2;
      let drop = step(0.9 - 0.25 * smoothstep(0.3, 0.7, zone), r) * step(0.3, zone) * (1.0 - smoothstep(rad - fw, rad + fw, length(fract(uv * 11.0) - off) / 11.0));
      let pc = PAINTS[u32(floor(snoise3(vec3f(uv * 0.12, 31.0)) * 2.0 + 2.0)) % 4u];
      alb = mix(alb, pc, saturate(stain * 0.7 + drop * 0.9));
      alb = mix(alb, vec3f(0.8, 0.78, 0.74), 0.16 * saturate(n0.y) * (0.5 + 0.5 * snoise3(vec3f(uv * 1.7, 2.0))));
      // di notte la tela chiara resta un po' più leggibile del marmo
      s.alb = alb * mix(vec3f(1.0), vec3f(0.3, 0.36, 0.4), F.sunCol.w); s.rough = mix(0.93, 0.5, saturate(stain + drop)); s.sheen = 0.35 * (1.0 - stain);
    }
    case ${Mat.wood}u: {
      // abete grezzo: venatura lungo la tavola (u), anelli spostati dal rumore, nodi radi, schizzi di vernice
      let w = uv.y * 11.0 + 0.9 * snoise3(vec3f(uv.x * 0.35, uv.y * 2.0, 1.0)) + 0.25 * snoise3(vec3f(uv.x * 3.0, uv.y * 9.0, 5.0));
      let fwv = max(length(vec2f(g.ux.y, g.uy.y)) * 11.0, 1e-4);
      let ring = smoothstep(0.35 - fwv, 0.65 + fwv, abs(fract(w) * 2.0 - 1.0));
      let streak = 0.5 + 0.5 * snoise3(vec3f(uv.x * 0.8, uv.y * 40.0, 3.0));
      var alb = mix(vec3f(0.5, 0.33, 0.17), vec3f(0.34, 0.2, 0.09), ring * 0.55 + streak * 0.2);
      alb *= 0.85 + 0.15 * snoise3(vec3f(uv * vec2f(0.6, 3.0), 9.0));
      let cell = floor(uv * vec2f(5.0, 14.0)); let r = hash2(cell + 2.0);
      let dd = length((fract(uv * vec2f(5.0, 14.0)) - 0.5) / vec2f(5.0, 14.0));
      let fw = max(length(g.ux) + length(g.uy), 1e-5);
      let spl = step(0.86, r) * (1.0 - smoothstep(0.006 - fw, 0.006 + 0.01 * hash2(cell) + fw, dd));
      alb = mix(alb, PAINTS[u32(r * 13.0) % 4u], spl);
      s.alb = moody(alb); s.rough = mix(0.78, 0.45, spl);
      s.n = normalize(n0 + cross(n0, woodGrain(g, n0)) * (streak - 0.5) * 0.12);
    }
    case ${Mat.steel}u: {
      // acciaio zincato: grigio a chiazze, opaco, un po' sporco di calce in basso
      let mot = snoise3(p * 6.0) * 0.5 + snoise3(p * 23.0) * 0.25;
      var alb = vec3f(0.56, 0.57, 0.58) * (0.85 + 0.15 * mot);
      alb = mix(alb, vec3f(0.78, 0.76, 0.72), 0.35 * saturate(1.0 - p.y * 1.5) * saturate(mot + 0.6));
      s.alb = moody(alb); s.metal = 0.85; s.rough = 0.38 + 0.12 * mot; s.kind = 2u;
    }
    case ${Mat.bucket}u: {
      // secchio di plastica bianca: etichetta a fascia e colature del colore che contiene (indice nella parte intera di v)
      let k = u32(floor(uv.y)); let v = fract(uv.y);
      var alb = vec3f(0.78, 0.78, 0.75);
      let fw = max(length(vec2f(g.ux.y, g.uy.y)), 1e-4);
      let label = smoothstep(0.32 - fw, 0.32 + fw, v) * (1.0 - smoothstep(0.7 - fw, 0.7 + fw, v));
      alb = mix(alb, mix(vec3f(0.05, 0.14, 0.32), PAINTS[k % 8u], 0.35), label * 0.9);
      let col = floor(uv.x * 30.0); let h = hash2(vec2f(col, f32(k)));
      let drip = step(0.45, h) * smoothstep(1.0 - (0.12 + 0.55 * hash2(vec2f(col, 7.0))) - fw * 2.0, 1.0 - (0.12 + 0.55 * hash2(vec2f(col, 7.0))), v)
        * (1.0 - smoothstep(0.3, 0.5, abs(fract(uv.x * 30.0) - 0.5) * 2.0 + (1.0 - v) * 0.2));
      alb = mix(alb, PAINTS[k % 8u], saturate(drip));
      s.alb = moody(alb); s.rough = mix(0.42, 0.3, drip);
    }
    case ${Mat.paint}u: {
      // vernice (anche lucida e bagnata dentro i secchi) e metallo verniciato: il colore nella parte intera di v
      s.alb = moody(PAINTS[u32(floor(uv.y)) % 8u]); s.rough = 0.32;
    }
    case ${Mat.cardboard}u: {
      // cartone ondulato: le onde sotto la carta, le macchie di umido e d'unto
      let mot = snoise3(p * 3.0) * 0.5 + snoise3(p * 11.0) * 0.25;
      s.alb = moody(vec3f(0.44, 0.29, 0.15) * (0.88 + 0.12 * mot)); s.rough = 0.9;
    }
    case ${Mat.cone}u: {
      // cono stradale arancione con le due fasce bianche rifrangenti
      let fw = max(length(g.px), length(g.py));
      let band = (smoothstep(0.34 - fw, 0.34 + fw, p.y) - smoothstep(0.44 - fw, 0.44 + fw, p.y)) + (smoothstep(0.51 - fw, 0.51 + fw, p.y) - smoothstep(0.57 - fw, 0.57 + fw, p.y));
      let dirt = saturate(1.0 - p.y * 4.0) * 0.4;
      s.alb = moody(mix(mix(vec3f(0.85, 0.16, 0.015), vec3f(0.88, 0.88, 0.86), band), vec3f(0.25, 0.2, 0.15), dirt)); s.rough = mix(0.45, 0.25, band);
    }
    case ${Mat.tape}u: {
      // nastro bianco e rosso a strisce oblique (u: metri lungo il nastro, v: di traverso)
      let fw = max(abs(g.ux.x) + abs(g.uy.x), 1e-4) / 0.16;
      let x = fract((uv.x + uv.y * 0.075) / 0.16);
      let red = smoothstep(0.5 - fw, 0.5 + fw, x) * (1.0 - smoothstep(1.0 - fw, 1.0, x)) + (1.0 - smoothstep(0.0, fw, x));
      s.alb = moody(mix(vec3f(0.86, 0.86, 0.84), vec3f(0.62, 0.02, 0.02), saturate(red))); s.rough = 0.4; s.sheen = 0.3;
    }
    case ${Mat.masking}u: { s.alb = moody(vec3f(0.74, 0.64, 0.42) * (0.92 + 0.08 * snoise3(p * 30.0))); s.rough = 0.8; }
    case ${Mat.rubber}u: { s.alb = moody(vec3f(0.03, 0.03, 0.032)); s.rough = 0.62; }
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
// potenze come prodotti: pow con la base negativa (1 - n·v appena sotto zero per arrotondamento) non dà un numero
fn fresnel(f0: vec3f, c: f32) -> vec3f { let m = 1.0 - saturate(c); let m2 = m * m; return f0 + (1.0 - f0) * (m2 * m2 * m); }
fn dfg(nv: f32, r: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022); let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let q = r * c0 + c1; let a = min(q.x * q.x, exp2(-9.28 * nv)) * q.x + q.y;
  return vec2f(-1.04, 1.04) * a + q.zw;
}
// luce che lascia la superficie verso l'osservatore in eye; px: pixel (per il riflesso planare); kr: allargamento del
// lobo speculare dove la normale cambia molto dentro il pixel
fn shade(m: u32, p: vec3f, n0: vec3f, uv: vec2f, vao: f32, eye: vec3f, px: vec2f, g: Grads, kr: f32) -> vec3f {
  let s = surfaceAt(m, p, n0, uv, vao, g);
  return shadeSurface(s, m, p, n0, eye, px, kr);
}
// Imported meshes use exactly the room's BRDF, probe irradiance, PCSS shadows and environment reflections.
fn shadeSurface(s: Surf, m: u32, p: vec3f, n0: vec3f, eye: vec3f, px: vec2f, kr: f32) -> vec3f {
  let a = s.rough * s.rough; let rough = sqrt(sqrt(saturate(a * a + kr)));
  let n = s.n; let V = normalize(eye - p); let L = F.sun.xyz;
  let nv = clamp(dot(n, V), 1e-3, 1.0); let ndl = max(dot(n, L), 0.0);
  var vis = 0.0;
  if (ndl > 0.0 && dot(n0, L) > -0.05) { vis = sunLight(p + n0 * 0.012, P.misc.y == 0.0); }
  let light = F.sunCol.rgb * F.sun.w * vis * ndl;
  // il telo ha la sua occlusione (pieghe e orlo): l'ombra di contatto della pedana lo scurirebbe tutto dove ci si posa
  let ao = s.ao * select(contactAO(p, n0), 1.0, m == ${Mat.cloth}u);
  // (the night guest takes less of the room's bounced light: the lamp's penumbra on him stays deep)
  let gi = (giAt(p + n0 * 0.3, n) + F.skyHor.w) * ao * select(1.0, 0.45, m == 255u);
  let f0 = mix(vec3f(0.04), s.alb, s.metal);
  let hv = L + V; let H = hv * inverseSqrt(max(dot(hv, hv), 1e-12)); // astro esattamente dietro il punto: niente 0/0
  var spec = light * fresnel(f0, dot(V, H)) * ggx(saturate(dot(n, H)), max(rough, 0.05)) * 0.25 / nv;
  // the night guest's lamp: a pool of cold light where he stops, with his soft shadow (on himself too)
  var lamp = vec3f(0.0); var Ls = vec3f(0.0, 1.0, 0.0);
  let lampIn = spotAt(p + n0 * 0.015, P.misc.y == 0.0, &Ls);
  if (dot(n0, Ls) > -0.05) {
    lamp = lampIn * max(dot(n, Ls), 0.0);
    let hs = normalize(Ls + V);
    spec += lamp * fresnel(f0, dot(V, hs)) * ggx(saturate(dot(n, hs)), max(rough, 0.05)) * 0.25 / nv;
  }
  var col = s.alb * (1.0 - s.metal) * ((light + lamp) / PI + gi) + spec;
  // and his own green glow on everything around him (not on himself: m 255)
  if (F.glow.w > 0.0 && m != 255u) {
    let lg = F.glow.xyz - p; let dg = max(dot(lg, lg), 0.05); let Lg = lg * inverseSqrt(dg);
    let fade = saturate(1.0 - dg / 42.0);
    col += s.alb * (1.0 - s.metal * 0.7) * GLOW_COL * F.glow.w * saturate((dot(n, Lg) + 0.2) / 1.2) * fade * fade / (1.0 + dg);
  }
  // velluto e stoffa: riflesso radente
  let g1 = 1.0 - nv; let g2 = g1 * g1;
  col += s.sheen * g2 * g2 * (gi + light * 0.1) * s.alb * 2.0;
  // riflessi: pavimento (planare), superfici lucide (cubemap della sala), altrimenti l'ambiente delle sonde
  let ab = dfg(nv, rough);
  let spF = f0 * ab.x + ab.y;
  var refl = gi * 0.6;
  if (P.misc.y == 0.0) {
    if (s.kind == 1u) {
      let uvp = px / P.misc.zw + n.xz * 0.04;
      refl = textureSampleLevel(planarTex, linSamp, uvp, rough * 8.0).rgb;
    } else if (s.kind == 2u) {
      refl = textureSampleLevel(envTex, linSamp, reflect(-V, n), rough * 7.0).rgb;
    }
  }
  col += refl * spF * ao;
  // coppa sotto il puntatore: un bagliore del suo metallo sui bordi
  if (m >= ${Mat.cupGold}u && m <= ${Mat.cupBronze}u) {
    let k = m - ${Mat.cupGold}u;
    col += METALS[k] * METALS[k] * F.cups[k].z * (0.04 + 0.9 * g2 * g1) * mix(0.55, 0.3, F.sunCol.w);
  }
  return col;
}
`;

export const modelLightingShader = (q: PodiumQuality) => `${structs}${noise}${frameBindings("read")}${passBinding}${lightFns(q)}${giFns}${material}`;

export const sceneShader = (q: PodiumQuality) => /* wgsl */ `${structs}${noise}${frameBindings("read")}${passBinding}${sky}${lightFns(q)}${giFns}${material}${animFns}
// centroid: con l'MSAA un pixel coperto solo in parte si calcola dentro il triangolo; al centro del pixel, fuori da un
// triangolo visto di taglio (i fianchi dei montanti), la posizione interpolata può smettere di essere un numero
struct VOut { @builtin(position) pos: vec4f, @location(0) @interpolate(perspective, centroid) wp: vec3f, @location(1) @interpolate(perspective, centroid) n: vec3f, @location(2) @interpolate(perspective, centroid) uv: vec2f, @location(3) @interpolate(flat) m: u32, @location(4) @interpolate(perspective, centroid) ao: f32 };
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
  let spin = 6.2831853 * fract(ign(i.pos.xy) + F.tileB.w * 0.618034); SPIN = vec2f(cos(spin), sin(spin));
  let n = normalize(i.n);
  // antialiasing speculare (Kaplanyan, Tokuyoshi): la varianza della normale nel pixel allarga il lobo, così i riflessi
  // di coppe, scanalature e modanature non sfarfallano
  let dnx = dpdx(n); let dny = dpdy(n);
  let kr = min(0.3 * (dot(dnx, dnx) + dot(dny, dny)), 0.2);
  var eye = P.pos.xyz;
  if (P.misc.y == 1.0) { eye.y = -eye.y; }
  return vec4f(finite3(shade(i.m, i.wp, n, i.uv, i.ao, eye, i.pos.xy, g, kr)), 1.0);
}
// cielo: solo dove nessuna superficie è stata disegnata (profondità 1)
@vertex fn vsSky(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((k << 1u) & 2u), f32(k & 2u));
  return vec4f(p * 2.0 - 1.0, 1.0, 1.0);
}
@fragment fn fsSky(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  var d = camRay(fc.xy);
  if (P.misc.y == 1.0) { d.y = -d.y; }
  return vec4f(finite3(sky(d, true, 220.0 * P.pos.w / P.fwd.w)), 1.0);
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
  // granelli più piccoli di un pixel e mezzo: si allargano e si attenuano (stessa luce, niente sfarfallio)
  let size0 = 0.006 + 0.006 * seed.z;
  let size = max(size0, 1.5 * max(dot(p - P.pos.xyz, P.fwd.xyz), 0.1) * P.pos.w / P.fwd.w);
  o.pos = P.vp * vec4f(p + (P.right.xyz * c.x + P.up.xyz * c.y) * size, 1.0);
  if (vis < 0.02) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  o.c = c; o.col = F.sunCol.rgb * F.sun.w * vis * tw * 0.08 * (size0 / size) * (size0 / size);
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
    var extra = vec3f(0.0);
    // the guest's lamp: its cone shows in the dust (with his shadow cut out of it), and a green haze around him
    if (F.spotPos.w > 0.0) {
      var Ls = vec3f(0.0);
      let lampIn = spotAt(p, false, &Ls);
      let ms = dot(rd, Ls);
      extra += lampIn * 7.0 * (1.0 - 0.36) / (4.0 * PI * pow(1.36 - 1.2 * ms, 1.5));
    }
    if (F.glow.w > 0.0) { let lg = F.glow.xyz - p; extra += GLOW_COL * F.glow.w * 0.35 / (dot(lg, lg) + 0.8); }
    acc += T * dens * dt * (sunC * fogLight(p) * phase + amb + extra);
    T *= exp(-dens * dt);
  }
  let prev = textureLoad(volPrev, vec2i(fc.xy), 0);
  return vec4f(finite3(mix(prev.rgb, acc, F.darkStone.w)), saturate(mix(prev.a, T, F.darkStone.w)));
}
`;

// ---------------------------------------------------------------------------------------------------------------------
// composizione: scena + nebbia, bloom (riduzione a 13 campioni, ricostruzione a tenda), ACES e sRGB alla risoluzione della
// scena; poi il passaggio ai pixel dello schermo (Catmull-Rom) con il dithering
const postHead = /* wgsl */ `
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var auxTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> post: vec4f; // esposizione, intensità del bloom, fotogramma, primo livello (1); nel passaggio finale: larghezza e altezza dello schermo, fotogramma
@vertex fn vsFull(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((k << 1u) & 2u), f32(k & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
${finite}`;
export const postShader = /* wgsl */ `${postHead}
@group(0) @binding(0) var srcTex: texture_2d<f32>;
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// scena risolta + fasci di luce (risoluzione ridotta, interpolati)
@fragment fn fsCombine(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(srcTex));
  let c = textureLoad(srcTex, vec2i(fc.xy), 0).rgb;
  let v = textureSampleLevel(auxTex, samp, fc.xy / size, 0.0);
  return vec4f(finite3(c * v.a + v.rgb), 1.0);
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
// bloom, esposizione, vignettatura, ACES e sRGB, alla risoluzione della scena: il ricampionamento che segue lavora su
// valori già compressi (attorno al disco del sole un filtro nitido su valori HDR farebbe aloni scuri)
@fragment fn fsTone(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(srcTex)); let uv = fc.xy / size;
  var c = textureLoad(srcTex, vec2i(fc.xy), 0).rgb;
  c = mix(c, textureSampleLevel(auxTex, samp, uv, 0.0).rgb, post.y);
  c *= post.x;
  let q = uv - 0.5; c *= 1.0 - 0.25 * dot(q, q);
  c = saturate(c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14));
  return vec4f(select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308)), 1.0);
}
// dall'immagine della scena (risoluzione adattiva, anche oltre i pixel dello schermo) ai pixel veri: Catmull-Rom con nove
// letture bilineari, più nitido del bilineare del browser e senza scalini; il dithering ai pixel dello schermo
@fragment fn fsFinal(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let src = vec2f(textureDimensions(srcTex));
  let sp = fc.xy / post.xy * src;
  let t1 = floor(sp - 0.5) + 0.5; let f = sp - t1;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f)); let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f)); let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let a = (t1 - 1.0) / src; let b = (t1 + w2 / w12) / src; let d = (t1 + 2.0) / src;
  var c = (textureSampleLevel(srcTex, samp, vec2f(a.x, a.y), 0.0).rgb * w0.x + textureSampleLevel(srcTex, samp, vec2f(b.x, a.y), 0.0).rgb * w12.x + textureSampleLevel(srcTex, samp, vec2f(d.x, a.y), 0.0).rgb * w3.x) * w0.y;
  c += (textureSampleLevel(srcTex, samp, vec2f(a.x, b.y), 0.0).rgb * w0.x + textureSampleLevel(srcTex, samp, vec2f(b.x, b.y), 0.0).rgb * w12.x + textureSampleLevel(srcTex, samp, vec2f(d.x, b.y), 0.0).rgb * w3.x) * w12.y;
  c += (textureSampleLevel(srcTex, samp, vec2f(a.x, d.y), 0.0).rgb * w0.x + textureSampleLevel(srcTex, samp, vec2f(b.x, d.y), 0.0).rgb * w12.x + textureSampleLevel(srcTex, samp, vec2f(d.x, d.y), 0.0).rgb * w3.x) * w3.y;
  return vec4f(saturate(c) + (ign(fc.xy + post.z * 7.0) - 0.5) / 255.0, 1.0);
}
`;
// antialiasing temporale: ogni fotogramma la camera si sposta di una frazione di pixel (sequenza di Halton) e il risultato
// si fonde con la storia riproiettata (profondità più vicina nell'intorno, posizione del mondo, camera del fotogramma
// prima). La storia si stringe nella nuvola dei colori attorno al pixel (YCoCg, media e deviazione), così niente scie;
// la fusione lavora su valori compressi (Karis), come la risoluzione dell'MSAA: i riflessi forti non si allargano.
// Sopra i quattro campioni dell'MSAA, l'accumulo dà a bordi sottili, tubi, scritte e riflessi decine di campioni
export const taaShader = /* wgsl */ `${finite}
@group(0) @binding(0) var curTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var histTex: texture_2d<f32>;
@group(0) @binding(3) var depthTex: texture_depth_multisampled_2d;
struct Taa { invVP: mat4x4f, prevVP: mat4x4f, misc: vec4f }; // misc: esposizione, ricomincia (1), -, -
@group(0) @binding(4) var<uniform> U: Taa;
@vertex fn vsFull(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((k << 1u) & 2u), f32(k & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn squash(c: vec3f) -> vec3f { return c / (1.0 + max(max(c.r, c.g), c.b) * U.misc.x); }
fn unsquash(c: vec3f) -> vec3f { return c / max(1.0 - max(max(c.r, c.g), c.b) * U.misc.x, 1e-3); }
fn ycocg(c: vec3f) -> vec3f { return vec3f(dot(c, vec3f(0.25, 0.5, 0.25)), dot(c, vec3f(0.5, 0.0, -0.5)), dot(c, vec3f(-0.25, 0.5, -0.25))); }
fn rgbOf(c: vec3f) -> vec3f { return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
// la storia letta con Catmull-Rom (nove letture bilineari): la riproiezione non ammorbidisce l'immagine fotogramma dopo
// fotogramma come farebbe il bilineare
fn history(uv: vec2f) -> vec3f {
  let src = vec2f(textureDimensions(histTex));
  let sp = uv * src; let t1 = floor(sp - 0.5) + 0.5; let f = sp - t1;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f)); let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f)); let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let a = (t1 - 1.0) / src; let b = (t1 + w2 / w12) / src; let d = (t1 + 2.0) / src;
  var c = (textureSampleLevel(histTex, samp, vec2f(a.x, a.y), 0.0).rgb * w0.x + textureSampleLevel(histTex, samp, vec2f(b.x, a.y), 0.0).rgb * w12.x + textureSampleLevel(histTex, samp, vec2f(d.x, a.y), 0.0).rgb * w3.x) * w0.y;
  c += (textureSampleLevel(histTex, samp, vec2f(a.x, b.y), 0.0).rgb * w0.x + textureSampleLevel(histTex, samp, vec2f(b.x, b.y), 0.0).rgb * w12.x + textureSampleLevel(histTex, samp, vec2f(d.x, b.y), 0.0).rgb * w3.x) * w12.y;
  c += (textureSampleLevel(histTex, samp, vec2f(a.x, d.y), 0.0).rgb * w0.x + textureSampleLevel(histTex, samp, vec2f(b.x, d.y), 0.0).rgb * w12.x + textureSampleLevel(histTex, samp, vec2f(d.x, d.y), 0.0).rgb * w3.x) * w3.y;
  return max(c, vec3f(0.0));
}
@fragment fn fsTaa(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(curTex)); let p = vec2i(fc.xy); let fs = vec2f(size);
  let cur = squash(finite3(textureLoad(curTex, p, 0).rgb));
  // intorno 3×3: media e varianza dei colori, e la superficie più vicina (i bordi seguono chi sta davanti)
  var m1 = vec3f(0.0); var m2 = vec3f(0.0); var dz = 1.0; var best = p;
  for (var k = 0; k < 9; k++) {
    let q = clamp(p + vec2i(k % 3 - 1, k / 3 - 1), vec2i(0), size - 1);
    let c = ycocg(squash(finite3(textureLoad(curTex, q, 0).rgb)));
    m1 += c; m2 += c * c;
    let d = textureLoad(depthTex, q, 0);
    if (d < dz) { dz = d; best = q; }
  }
  if (U.misc.y > 0.5) { return vec4f(unsquash(cur), 1.0); }
  let ub = (vec2f(best) + 0.5) / fs;
  let w = U.invVP * vec4f(ub.x * 2.0 - 1.0, 1.0 - ub.y * 2.0, dz, 1.0);
  let pc = U.prevVP * vec4f(w.xyz / w.w, 1.0);
  if (pc.w <= 1e-4) { return vec4f(unsquash(cur), 1.0); }
  let prev = vec2f(pc.x / pc.w * 0.5 + 0.5, 0.5 - pc.y / pc.w * 0.5);
  let uv = fc.xy / fs + (prev - ub);
  if (any(uv <= vec2f(0.0)) || any(uv >= vec2f(1.0))) { return vec4f(unsquash(cur), 1.0); }
  let mean = m1 / 9.0; let sd = sqrt(max(m2 / 9.0 - mean * mean, vec3f(0.0)));
  var h = ycocg(squash(history(uv)));
  // la storia che esce dalla nuvola dei vicini si riporta sul suo bordo, lungo la retta verso la media
  let off = h - mean; let r = abs(off) / (sd * 1.25 + vec3f(1e-4)); let mx = max(r.x, max(r.y, r.z));
  if (mx > 1.0) { h = mean + off / mx; }
  // ferma: un decimo di nuovo a ogni fotogramma; quando la camera si sposta in fretta (trascinamento) di più
  let speed = length((prev - ub) * fs);
  let a = mix(0.09, 0.3, saturate(speed / 8.0));
  return vec4f(finite3(unsquash(max(rgbOf(mix(h, ycocg(cur), a)), vec3f(0.0)))), 1.0);
}
`;
// risoluzione dell'MSAA pesata sulla luminanza (Karis), al posto della media dell'hardware: dove un bordo scuro passa
// davanti al finestrone o a un riflesso, la media lineare dei valori HDR dà al campione chiaro tutto il pixel (bordi a
// gradini); pesati, i quattro campioni contano come li vede l'occhio dopo il tonemapping
export const combineMSShader = /* wgsl */ `${postHead}
@group(0) @binding(0) var msTex: texture_multisampled_2d<f32>;
@fragment fn fsCombineMS(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy);
  var sum = vec3f(0.0); var ws = 0.0;
  for (var k = 0; k < 4; k++) {
    let c = finite3(textureLoad(msTex, p, k).rgb);
    let w = 1.0 / (1.0 + max(max(c.r, c.g), c.b) * post.x);
    sum += c * w; ws += w;
  }
  let v = textureSampleLevel(auxTex, samp, fc.xy / vec2f(textureDimensions(msTex)), 0.0);
  return vec4f(finite3(sum / ws * v.a + v.rgb), 1.0);
}
`;
