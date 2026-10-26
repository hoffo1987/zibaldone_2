// Shader WGSL del logo. Il materiale fisico riproduce MeshPhysicalMaterial di three.js r160 (GGX + Smith correlato, strato
// trasparente "clearcoat", velluto Charlie, iridescenza a film sottile, luce ambientale con multiscattering), la stessa
// mappatura tonale ACES e la stessa codifica sRGB per materiale: i colori si fondono sul canvas esattamente come prima.

import { MAX_OBJ, MAX_SPRITE, MAX_PARTICLE, A0, PLATE_TOP } from "./anim";
import { AO_EXTENT } from "./scene";
// numeri massimi di elementi negli array uniform (le bozze per telefono ne usano meno)
export { MAX_OBJ, MAX_SPRITE, MAX_PARTICLE };
// le istanze dopo questi valori appartengono alla seconda fase trasparente (davanti al filetto)
export const OBJ_PHASE = 16, SPRITE_PHASE = 32, PARTICLE_PHASE = 128;
// atlante dell'ambiente prefiltrato, con la disposizione "cubeUV" di PMREMGenerator (livello più nitido a 128 px)
export const ENV_MAX_MIP = 7, ENV_W = 384, ENV_H = 512;

// Formato "cubeUV" di three.js: per ogni livello sei facce affiancate (tre per riga), ciascuna con un bordo di un texel
// che contiene la continuazione delle facce vicine; i livelli più sfocati stanno a 16 px uno accanto all'altro. Lettura
// con interpolazione bilineare nella faccia e lineare tra due livelli, come cube_uv_reflection_fragment: il risultato
// non dipende dal filtraggio dei bordi dei cubemap, che alcune implementazioni non gestiscono bene.
const cubeUV = /* wgsl */ `
const CUBEUV_MAX_MIP: f32 = ${ENV_MAX_MIP}.0;
const CUBEUV_TEXEL: vec2f = vec2f(1.0 / ${ENV_W}.0, 1.0 / ${ENV_H}.0);
fn cubeFace(d: vec3f) -> f32 {
  let a = abs(d);
  if (a.x > a.z) {
    if (a.x > a.y) { return select(3.0, 0.0, d.x > 0.0); }
    return select(4.0, 1.0, d.y > 0.0);
  }
  if (a.z > a.y) { return select(5.0, 2.0, d.z > 0.0); }
  return select(4.0, 1.0, d.y > 0.0);
}
fn cubeFaceUV(d: vec3f, face: f32) -> vec2f {
  var uv: vec2f;
  if (face == 0.0) { uv = vec2f(d.z, d.y) / abs(d.x); }
  else if (face == 1.0) { uv = vec2f(-d.x, -d.z) / abs(d.y); }
  else if (face == 2.0) { uv = vec2f(-d.x, d.y) / abs(d.z); }
  else if (face == 3.0) { uv = vec2f(-d.z, d.y) / abs(d.x); }
  else if (face == 4.0) { uv = vec2f(-d.x, d.z) / abs(d.y); }
  else { uv = vec2f(d.x, d.y) / abs(d.z); }
  return 0.5 * (uv + 1.0);
}
fn bilinearCubeUV(atlas: texture_2d<f32>, samp: sampler, d: vec3f, mipIn: f32) -> vec3f {
  var face = cubeFace(d);
  let filterInt = max(4.0 - mipIn, 0.0);
  let mipInt = max(mipIn, 4.0);
  let faceSize = exp2(mipInt);
  var uv = cubeFaceUV(d, face) * (faceSize - 2.0) + 1.0;
  if (face > 2.0) { uv.y += faceSize; face -= 3.0; }
  uv.x += face * faceSize + filterInt * 3.0 * 16.0;
  uv.y += 4.0 * (exp2(CUBEUV_MAX_MIP) - faceSize);
  return textureSampleLevel(atlas, samp, uv * CUBEUV_TEXEL, 0.0).rgb;
}
`;

const common = /* wgsl */ `
const PI: f32 = 3.141592653589793;
const RECIPROCAL_PI: f32 = 0.3183098861837907;
const EPSILON: f32 = 1e-6;

struct Obj { model: mat4x4f, color: vec4f, emissive: vec4f, pbr: vec4f, sheen: vec4f, irid: vec4f, cur: vec4f };
struct Sprite { pos: vec4f, col: vec4f, misc: vec4f };
struct Frame {
  view: mat4x4f, proj: mat4x4f, root: mat4x4f,
  camPos: vec4f, hemiSky: vec4f, hemiGround: vec4f, hemiDir: vec4f,
  dirDir: array<vec4f, 2>, dirCol: array<vec4f, 2>, ptPos: array<vec4f, 2>, ptCol: array<vec4f, 2>,
  params: vec4f,
  objs: array<Obj, ${MAX_OBJ}>,
  sprites: array<Sprite, ${MAX_SPRITE}>,
};
struct Particle { v: vec4f, b: vec4f };
struct Particles { p: array<Particle, ${MAX_PARTICLE}> };

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<uniform> PS: Particles;
@group(0) @binding(2) var envAtlas: texture_2d<f32>;
@group(0) @binding(3) var envSamp: sampler;
@group(0) @binding(4) var glowTex: texture_2d<f32>;
@group(0) @binding(5) var glowSamp: sampler;
@group(0) @binding(6) var aoTex: texture_2d<f32>;

fn pow2(x: f32) -> f32 { return x * x; }
fn pow2v(x: vec3f) -> vec3f { return x * x; }
fn pow4(x: f32) -> f32 { let x2 = x * x; return x2 * x2; }
fn max3(v: vec3f) -> f32 { return max(max(v.x, v.y), v.z); }

fn RRTAndODTFit(v: vec3f) -> vec3f {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
// ACESFilmicToneMapping + sRGBTransferOETF di three.js r160
fn outColor(c: vec3f) -> vec3f {
  let inM = mat3x3f(vec3f(0.59719, 0.07600, 0.02840), vec3f(0.35458, 0.90834, 0.13383), vec3f(0.04823, 0.01566, 0.83777));
  let outM = mat3x3f(vec3f(1.60475, -0.10208, -0.00327), vec3f(-0.53108, 1.10813, -0.07276), vec3f(-0.07367, -0.00605, 1.07602));
  var col = c * (F.params.x / 0.6);
  col = outM * RRTAndODTFit(inM * col);
  col = saturate(col);
  return select(pow(col, vec3f(0.41666)) * 1.055 - vec3f(0.055), col * 12.92, col <= vec3f(0.0031308));
}

const OFF = vec4f(2.0, 2.0, 2.0, 1.0); // fuori dal volume di vista: il triangolo viene scartato
`;

export const renderShader = /* wgsl */ `${common}${cubeUV}
override SHEEN: bool = false;
override IRID: bool = false;
override TRANSPARENT: bool = false;
override PLATE: bool = false;

struct MeshOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) aux: f32,
  @location(3) @interpolate(flat) obj: u32,
  @location(4) vcol: vec3f,
  @location(5) lp: vec3f, // posizione nello spazio della targa (per l'occlusione d'ambiente)
};

fn mesh(p: vec3f, n: vec3f, aux: f32, ii: u32, vcol: vec3f) -> MeshOut {
  let m = F.objs[ii].model;
  let w = m * vec4f(p, 1.0);
  var o: MeshOut;
  o.pos = F.proj * (F.view * w);
  o.wpos = w.xyz;
  o.nrm = normalize((m * vec4f(n, 0.0)).xyz);
  o.aux = aux; o.obj = ii; o.vcol = vcol;
  // la targa ha rotazione e scala uniforme: le coordinate locali sono proiezioni sui suoi assi
  let pm = F.objs[0].model;
  let rel = w.xyz - pm[3].xyz;
  let s2 = dot(pm[0].xyz, pm[0].xyz);
  o.lp = vec3f(dot(rel, pm[0].xyz), dot(rel, pm[1].xyz), dot(rel, pm[2].xyz)) / s2;
  return o;
}
@vertex fn vsMesh(@location(0) p: vec3f, @location(1) na: vec4f, @builtin(instance_index) ii: u32) -> MeshOut {
  return mesh(p, na.xyz, na.w, ii, vec3f(1.0));
}
@vertex fn vsMeshColor(@location(0) p: vec3f, @location(1) na: vec4f, @location(2) c: vec3f, @builtin(instance_index) ii: u32) -> MeshOut {
  return mesh(p, na.xyz, na.w, ii, c);
}

// ---- BRDF (lights_physical_pars_fragment) ----
fn F_Schlick(f0: vec3f, f90: f32, dotVH: f32) -> vec3f {
  let fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
  return f0 * (1.0 - fresnel) + (f90 * fresnel);
}
fn F_Schlick1(f0: f32, f90: f32, dotVH: f32) -> f32 {
  let fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
  return f0 * (1.0 - fresnel) + (f90 * fresnel);
}
fn V_GGX_SmithCorrelated(alpha: f32, dotNL: f32, dotNV: f32) -> f32 {
  let a2 = pow2(alpha);
  let gv = dotNL * sqrt(a2 + (1.0 - a2) * pow2(dotNV));
  let gl = dotNV * sqrt(a2 + (1.0 - a2) * pow2(dotNL));
  return 0.5 / max(gv + gl, EPSILON);
}
fn D_GGX(alpha: f32, dotNH: f32) -> f32 {
  let a2 = pow2(alpha);
  let denom = pow2(dotNH) * (a2 - 1.0) + 1.0;
  return RECIPROCAL_PI * a2 / pow2(denom);
}
fn BRDF_GGX(L: vec3f, V: vec3f, N: vec3f, f0: vec3f, f90: f32, roughness: f32, iridF: vec3f, irid: f32) -> vec3f {
  let alpha = pow2(roughness);
  let H = normalize(L + V);
  let dotNL = saturate(dot(N, L)); let dotNV = saturate(dot(N, V));
  let dotNH = saturate(dot(N, H)); let dotVH = saturate(dot(V, H));
  var Fr = F_Schlick(f0, f90, dotVH);
  if (IRID) { Fr = mix(Fr, iridF, irid); }
  return Fr * (V_GGX_SmithCorrelated(alpha, dotNL, dotNV) * D_GGX(alpha, dotNH));
}
fn D_Charlie(roughness: f32, dotNH: f32) -> f32 {
  let alpha = pow2(roughness);
  let invAlpha = 1.0 / alpha;
  let cos2h = dotNH * dotNH;
  let sin2h = max(1.0 - cos2h, 0.0078125);
  return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * PI);
}
fn V_Neubelt(dotNV: f32, dotNL: f32) -> f32 {
  return saturate(1.0 / max(4.0 * (dotNL + dotNV - dotNL * dotNV), 1e-7));
}
fn BRDF_Sheen(L: vec3f, V: vec3f, N: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> vec3f {
  let H = normalize(L + V);
  let dotNL = saturate(dot(N, L)); let dotNV = saturate(dot(N, V)); let dotNH = saturate(dot(N, H));
  return sheenColor * (D_Charlie(sheenRoughness, dotNH) * V_Neubelt(dotNV, dotNL));
}
fn IBLSheenBRDF(N: vec3f, V: vec3f, roughness: f32) -> f32 {
  let dotNV = saturate(dot(N, V));
  let r2 = roughness * roughness;
  let lo = roughness < 0.25;
  let a = select(-8.48 * r2 + 14.3 * roughness - 9.95, -339.2 * r2 + 161.4 * roughness - 25.9, lo);
  let b = select(1.97 * r2 - 3.27 * roughness + 0.72, 44.0 * r2 - 23.7 * roughness + 3.26, lo);
  let DG = exp(a * dotNV + b) + select(0.1 * (roughness - 0.25), 0.0, lo);
  return saturate(DG * RECIPROCAL_PI);
}
fn DFGApprox(N: vec3f, V: vec3f, roughness: f32) -> vec2f {
  let dotNV = saturate(dot(N, V));
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * dotNV)) * r.x + r.y;
  return vec2f(-1.04, 1.04) * a004 + r.zw;
}

// ---- iridescenza (iridescence_fragment) ----
fn Fresnel0ToIor(f0: vec3f) -> vec3f { let s = sqrt(f0); return (vec3f(1.0) + s) / (vec3f(1.0) - s); }
fn evalSensitivity(OPD: f32, shift: vec3f) -> vec3f {
  let phase = 2.0 * PI * OPD * 1.0e-9;
  let val = vec3f(5.4856e-13, 4.4201e-13, 5.2481e-13);
  let pos = vec3f(1.6810e+06, 1.7953e+06, 2.2084e+06);
  let vr = vec3f(4.3278e+09, 9.3046e+09, 6.6121e+09);
  var xyz = val * sqrt(2.0 * PI * vr) * cos(pos * phase + shift) * exp(-pow2(phase) * vr);
  xyz.x += 9.7470e-14 * sqrt(2.0 * PI * 4.5282e+09) * cos(2.2399e+06 * phase + shift.x) * exp(-4.5282e+09 * pow2(phase));
  xyz /= 1.0685e-7;
  let XYZ_TO_REC709 = mat3x3f(vec3f(3.2404542, -0.9692660, 0.0556434), vec3f(-1.5371385, 1.8760108, -0.2040259), vec3f(-0.4985314, 0.0415560, 1.0572252));
  return XYZ_TO_REC709 * xyz;
}
fn evalIridescence(outsideIOR: f32, eta2: f32, cosTheta1: f32, thickness: f32, baseF0: vec3f) -> vec3f {
  let iridIOR = mix(outsideIOR, eta2, smoothstep(0.0, 0.03, thickness));
  let sinTheta2Sq = pow2(outsideIOR / iridIOR) * (1.0 - pow2(cosTheta1));
  let cosTheta2Sq = 1.0 - sinTheta2Sq;
  if (cosTheta2Sq < 0.0) { return vec3f(1.0); }
  let cosTheta2 = sqrt(cosTheta2Sq);
  let R0 = pow2((iridIOR - outsideIOR) / (iridIOR + outsideIOR));
  let R12 = F_Schlick1(R0, 1.0, cosTheta1);
  let T121 = 1.0 - R12;
  let phi12 = select(0.0, PI, iridIOR < outsideIOR);
  let phi21 = PI - phi12;
  let baseIOR = Fresnel0ToIor(clamp(baseF0, vec3f(0.0), vec3f(0.9999)));
  let R1 = pow2v((baseIOR - vec3f(iridIOR)) / (baseIOR + vec3f(iridIOR)));
  let R23 = F_Schlick(R1, 1.0, cosTheta2);
  let phi23 = select(vec3f(0.0), vec3f(PI), baseIOR < vec3f(iridIOR));
  let OPD = 2.0 * iridIOR * thickness * cosTheta2;
  let phi = vec3f(phi21) + phi23;
  let R123 = clamp(R12 * R23, vec3f(1e-5), vec3f(0.9999));
  let r123 = sqrt(R123);
  let Rs = pow2(T121) * R23 / (vec3f(1.0) - R123);
  var I = R12 + Rs;
  var Cm = Rs - T121;
  for (var m = 1; m <= 2; m++) {
    Cm *= r123;
    I += Cm * (2.0 * evalSensitivity(f32(m) * OPD, f32(m) * phi));
  }
  return max(I, vec3f(0.0));
}

// ---- ambiente prefiltrato: textureCubeUV di cube_uv_reflection_fragment ----
fn roughnessToMip(r: f32) -> f32 {
  if (r >= 0.8) { return (1.0 - r) * 1.0 / 0.2 - 2.0; }
  if (r >= 0.4) { return (0.8 - r) * 3.0 / 0.4 - 1.0; }
  if (r >= 0.305) { return (0.4 - r) * 1.0 / 0.095 + 2.0; }
  if (r >= 0.21) { return (0.305 - r) * 1.0 / 0.095 + 3.0; }
  return -2.0 * log2(1.16 * r);
}
fn envSample(dir: vec3f, roughness: f32) -> vec3f {
  let mip = clamp(roughnessToMip(roughness), -2.0, CUBEUV_MAX_MIP);
  let mipF = fract(mip);
  let mipInt = floor(mip);
  let c0 = bilinearCubeUV(envAtlas, envSamp, dir, mipInt);
  if (mipF == 0.0) { return c0; }
  return mix(c0, bilinearCubeUV(envAtlas, envSamp, dir, mipInt + 1.0), mipF);
}
fn iblRadiance(V: vec3f, N: vec3f, roughness: f32) -> vec3f {
  let R = normalize(mix(reflect(-V, N), N, roughness * roughness));
  return envSample(R, roughness);
}

struct Direct { diff: vec3f, spec: vec3f, cc: vec3f, sheen: vec3f };
struct Mat { diffuse: vec3f, f0: vec3f, roughness: f32, ccRough: f32, iridF: vec3f, irid: f32, sheenColor: vec3f, sheenRough: f32 };

fn direct(L: vec3f, color: vec3f, N: vec3f, V: vec3f, m: Mat) -> Direct {
  let irradiance = saturate(dot(N, L)) * color;
  var d: Direct;
  d.diff = irradiance * RECIPROCAL_PI * m.diffuse;
  d.spec = irradiance * BRDF_GGX(L, V, N, m.f0, 1.0, m.roughness, m.iridF, m.irid);
  d.cc = irradiance * BRDF_GGX(L, V, N, vec3f(0.04), 1.0, m.ccRough, vec3f(0.0), 0.0);
  if (SHEEN) { d.sheen = irradiance * BRDF_Sheen(L, V, N, m.sheenColor, m.sheenRough); }
  return d;
}

// ---- occlusione d'ambiente (precalcolata sulla faccia della targa, di contatto sugli oggetti che la toccano) ----
fn occlusion(in: MeshOut, N: vec3f, o: Obj) -> f32 {
  if (PLATE) {
    let lid = smoothstep(${(PLATE_TOP - 0.7).toFixed(2)}, ${(PLATE_TOP - 0.05).toFixed(2)}, in.lp.z); // faccia anteriore e inizio della smussatura
    if (lid <= 0.0) { return 1.0; }
    let s = textureSampleLevel(aoTex, envSamp, vec2f(in.lp.x, -in.lp.y) / ${(2 * AO_EXTENT).toFixed(1)} + 0.5, 0.0);
    // durante l'entrata ogni ombra segue l'oggetto che la proietta (cur: crescita di C, pista, perle)
    var ang = atan2(in.lp.y, in.lp.x);
    if (ang < 0.0) { ang += 2.0 * PI; }
    let tArc = (ang - ${A0.toFixed(7)}) / (2.0 * PI - ${(2 * A0).toFixed(7)});
    let arcOn = saturate((o.cur.x - tArc) * 25.0 + 0.5);
    let lineOn = saturate((o.cur.z - (in.lp.x + 1.0) / 16.0) * 25.0 + 0.5);
    let occ = 0.8 * (s.r + s.g * arcOn + s.b * lineOn + s.a * o.cur.w);
    return 1.0 - lid * min(occ, 0.85);
  }
  let k = o.irid.w;
  if (k <= 0.0) { return 1.0; }
  // parte bassa degli oggetti appoggiati sulla faccia: più scura vicino al contatto e dove la normale guarda la targa
  let pn = normalize(F.objs[0].model[2].xyz);
  let h = in.lp.z - ${PLATE_TOP.toFixed(2)};
  return 1.0 - k * (1.0 - smoothstep(0.0, 2.6, h)) * saturate(0.6 - 0.8 * dot(N, pn));
}

@fragment fn fsPhysical(in: MeshOut) -> @location(0) vec4f {
  let N = normalize(in.nrm);
  let dxy = max(abs(dpdx(N)), abs(dpdy(N)));
  let geometryRoughness = max(max(dxy.x, dxy.y), dxy.z);
  let o = F.objs[in.obj];
  let ao = occlusion(in, N, o);
  let V = normalize(F.camPos.xyz - in.wpos);
  let dotNV = saturate(dot(N, V));

  let diffuseColor = o.color.rgb * in.vcol;
  let metal = o.pbr.y;
  var m: Mat;
  m.diffuse = diffuseColor * (1.0 - metal);
  m.roughness = min(max(o.pbr.x, 0.0525) + geometryRoughness, 1.0);
  m.f0 = mix(vec3f(0.04), diffuseColor, metal);
  m.ccRough = min(max(o.pbr.w, 0.0525) + geometryRoughness, 1.0);
  let clearcoat = saturate(o.pbr.z);
  if (IRID) {
    m.irid = select(saturate(o.irid.x), 0.0, o.irid.z == 0.0);
    if (m.irid > 0.0) { m.iridF = evalIridescence(1.0, o.irid.y, dotNV, o.irid.z, m.f0); }
  }
  if (SHEEN) { m.sheenColor = o.sheen.rgb; m.sheenRough = clamp(o.sheen.a, 0.07, 1.0); }

  // luci puntiformi (puntatore, lampada ambra), poi direzionali (chiave, controluce)
  var acc: Direct;
  for (var i = 0; i < 2; i++) {
    let lv = F.ptPos[i].xyz - in.wpos;
    let d = length(lv);
    var falloff = 1.0 / max(pow(d, F.ptCol[i].w), 0.01);
    if (F.ptPos[i].w > 0.0) { falloff *= pow2(saturate(1.0 - pow4(d / F.ptPos[i].w))); }
    let r = direct(lv / d, F.ptCol[i].rgb * falloff, N, V, m);
    acc.diff += r.diff; acc.spec += r.spec; acc.cc += r.cc; acc.sheen += r.sheen;
  }
  for (var i = 0; i < 2; i++) {
    let r = direct(F.dirDir[i].xyz, F.dirCol[i].rgb, N, V, m);
    acc.diff += r.diff; acc.spec += r.spec; acc.cc += r.cc; acc.sheen += r.sheen;
  }

  // luce indiretta: emisfero (diffusa) e ambiente prefiltrato (diffusa e speculare con multiscattering)
  let irradiance = mix(F.hemiGround.rgb, F.hemiSky.rgb, 0.5 * dot(N, F.hemiDir.xyz) + 0.5);
  let envI = o.emissive.a;
  let iblIrradiance = PI * envSample(N, 1.0) * envI;
  let radiance = iblRadiance(V, N, m.roughness) * envI;
  let ccRadiance = iblRadiance(V, N, m.ccRough) * envI;
  let fabCc = DFGApprox(N, V, m.ccRough);
  let ccIndirect = ccRadiance * (vec3f(0.04) * fabCc.x + fabCc.y);
  var sheenIndirect = vec3f(0.0);
  if (SHEEN) { sheenIndirect = iblIrradiance * m.sheenColor * IBLSheenBRDF(N, V, m.sheenRough); }
  let fab = DFGApprox(N, V, m.roughness);
  var Fr = m.f0;
  if (IRID) { Fr = mix(m.f0, m.iridF, m.irid); }
  let FssEss = Fr * fab.x + fab.y;
  let Ess = fab.x + fab.y;
  let Ems = 1.0 - Ess;
  let Favg = Fr + (1.0 - Fr) * 0.047619;
  let Fms = FssEss * Favg / (1.0 - Ems * Favg);
  let multi = Fms * Ems;
  let cosineWeightedIrradiance = iblIrradiance * RECIPROCAL_PI;
  let diffuseIbl = m.diffuse * (1.0 - max3(FssEss + multi));
  // occlusione: piena sulla luce indiretta (riflessi compresi, con la formula di Lagarde), attenuata su quella diretta
  // perché faccia da ombra morbida di contatto senza spegnere le superfici
  let specAO = saturate(pow(dotNV + ao, exp2(-16.0 * m.roughness - 1.0)) - 1.0 + ao);
  let directAO = mix(1.0, ao, 0.45);
  let indirectDiffuse = (irradiance * RECIPROCAL_PI * m.diffuse + diffuseIbl * cosineWeightedIrradiance) * ao;
  let indirectSpecular = (radiance * FssEss + multi * cosineWeightedIrradiance) * specAO;

  var outgoing = (acc.diff + acc.spec) * directAO + indirectDiffuse + indirectSpecular + o.emissive.rgb;
  if (SHEEN) { outgoing = outgoing * (1.0 - 0.157 * max3(m.sheenColor)) + acc.sheen * directAO + sheenIndirect * ao; }
  let Fcc = F_Schlick(vec3f(0.04), 1.0, dotNV);
  outgoing = outgoing * (1.0 - clearcoat * Fcc) + (acc.cc * directAO + ccIndirect * specAO) * clearcoat;

  var rgb = outColor(outgoing);
  // la "corrente" che percorre la C e la pista: testa calda e scia, fusa sul colore già in sRGB (come prima)
  let gain = o.cur.y;
  if (gain > 0.0) {
    let d = o.cur.x - in.aux;
    let head = exp(-d * d * 1400.0);
    let tail = select(0.0, exp(-d * 6.0) * 0.78, d > 0.0);
    let k = clamp((head + tail) * gain, 0.0, 1.0);
    let hot = mix(vec3f(1.0, 0.56, 0.08), vec3f(1.0, 0.95, 0.78), clamp(head * 1.25, 0.0, 1.0));
    rgb = mix(rgb, hot, k * 0.94);
  }
  return vec4f(rgb, select(1.0, o.color.a, TRANSPARENT));
}

// ---- anelli delle orbite (MeshBasicMaterial additivo) ----
struct FlatOut { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) rgba: vec4f };
// il tubo dell'orbita è sottile (0,2) e a schermo misura meno di un pixel: si allarga fino a un pixel e mezzo e
// l'opacità scende in proporzione, così la linea resta continua e uniforme invece di spezzarsi in trattini
const RING_R: f32 = 0.2;
@vertex fn vsRing(@location(0) p: vec3f, @location(1) na: vec4f, @builtin(instance_index) ii: u32) -> FlatOut {
  let o = F.objs[ii % ${OBJ_PHASE}u];
  var out: FlatOut;
  if (f32(ii / ${OBJ_PHASE}u) != o.irid.w || o.color.a <= 0.0) { out.pos = OFF; return out; }
  let center = p - na.xyz * RING_R;
  let depth = -(F.view * (o.model * vec4f(center, 1.0))).z;
  let r = max(RING_R, 0.75 * F.camPos.w * depth);
  out.pos = F.proj * (F.view * (o.model * vec4f(center + na.xyz * r, 1.0)));
  out.rgba = vec4f(outColor(o.color.rgb), o.color.a * RING_R / r);
  return out;
}
@fragment fn fsFlat(in: FlatOut) -> @location(0) vec4f { return in.rgba; }

// ---- bagliori (Sprite) e scintille (Points): quadrati rivolti alla camera con la stessa texture radiale ----
struct GlowOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) rgba: vec4f };
fn quad(center: vec3f, size: f32, vi: u32, rgb: vec3f, a: f32) -> GlowOut {
  let c = vec2f(f32(vi & 1u), f32(vi >> 1u)) - 0.5; // striscia di 4 vertici: (-,-) (+,-) (-,+) (+,+)
  var mv = F.view * vec4f(center, 1.0);
  mv.x += c.x * size; mv.y += c.y * size;
  var out: GlowOut;
  out.pos = F.proj * mv;
  out.uv = c + 0.5;
  out.rgba = vec4f(outColor(rgb), a);
  return out;
}
@vertex fn vsSprite(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlowOut {
  let s = F.sprites[ii % ${SPRITE_PHASE}u];
  if (f32(ii / ${SPRITE_PHASE}u) != s.misc.x || s.col.a <= 0.0) { var out: GlowOut; out.pos = OFF; return out; }
  return quad(s.pos.xyz, s.pos.w, vi, s.col.rgb, s.col.a);
}
// scintille: moto in forma chiusa (velocità che decade come exp(-2.2 t)), niente simulazione fotogramma per fotogramma
@vertex fn vsParticle(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlowOut {
  let p = PS.p[ii % ${PARTICLE_PHASE}u];
  let age = F.params.y - p.b.x;
  let life = p.v.w - age;
  if (life <= 0.0 || age < 0.0 || f32(ii / ${PARTICLE_PHASE}u) != F.params.z) { var out: GlowOut; out.pos = OFF; return out; }
  let local = vec3f(0.0, 0.0, 6.0) + p.v.xyz * ((1.0 - exp(-2.2 * age)) / 2.2);
  let l = min(life, 1.0);
  return quad((F.root * vec4f(local, 1.0)).xyz, F.params.w, vi, vec3f(l, l * 0.75, l * 0.3), 1.0);
}
@fragment fn fsGlow(in: GlowOut) -> @location(0) vec4f {
  return vec4f(in.rgba.rgb, textureSample(glowTex, glowSamp, in.uv).r * in.rgba.a);
}
`;

// ---- ambiente: lo "studio" di pannelli luminosi, poi la catena di sfocature gaussiane di PMREMGenerator ----
export const envShader = /* wgsl */ `${cubeUV}
// direzione (non normalizzata) del texel di una faccia, bordo compreso: getDirection di PMREMGenerator
fn faceDirection(uvIn: vec2f, face: u32) -> vec3f {
  let uv = 2.0 * uvIn - 1.0;
  switch face {
    case 0u: { return vec3f(1.0, uv.y, uv.x); }
    case 1u: { return vec3f(-uv.x, 1.0, -uv.y); }
    case 2u: { return vec3f(-uv.x, uv.y, 1.0); }
    case 3u: { return vec3f(-1.0, uv.y, -uv.x); }
    case 4u: { return vec3f(-uv.x, -1.0, uv.y); }
    default: { return vec3f(uv.x, uv.y, -1.0); }
  }
}
// un texel dell'atlante per invocazione: n.x = lato della faccia (bordo compreso), n.zw = origine del livello
struct Tile { face: u32, uv: vec2f, ok: bool };
fn tile(id: vec2u, n: vec4u) -> Tile {
  var t: Tile;
  let fs = n.x;
  t.ok = id.x < 3u * fs && id.y < 2u * fs;
  t.face = id.x / fs + 3u * (id.y / fs);
  t.uv = (vec2f(f32(id.x % fs), f32(id.y % fs)) + 0.5 - 1.0) / f32(fs - 2u);
  return t;
}

struct Panel { c: vec4f, ex: vec4f, ey: vec4f, n: vec4f, col: vec4f };
struct Studio { bg: vec4f, n: vec4u, panels: array<Panel, 6> };
@group(0) @binding(0) var<uniform> S: Studio;
@group(0) @binding(1) var studioOut: texture_storage_2d<rgba16float, write>;

// radianza vista dall'origine: il pannello più vicino colpito dal raggio, altrimenti lo sfondo
fn radiance(d: vec3f) -> vec3f {
  var best = 1e30;
  var col = S.bg.rgb;
  for (var i = 0u; i < 6u; i++) {
    let P = S.panels[i];
    let den = dot(d, P.n.xyz);
    if (abs(den) < 1e-8) { continue; }
    let t = dot(P.c.xyz, P.n.xyz) / den;
    if (t <= 0.0 || t >= best) { continue; }
    let q = d * t - P.c.xyz;
    if (abs(dot(q, P.ex.xyz)) <= P.ex.w && abs(dot(q, P.ey.xyz)) <= P.ey.w) { best = t; col = P.col.rgb; }
  }
  return col;
}
// livello più nitido: 2×2 campioni per texel (come la scena resa in un cubemap a 256 px)
@compute @workgroup_size(8, 8, 1) fn studio(@builtin(global_invocation_id) id: vec3u) {
  let t = tile(id.xy, S.n);
  if (!t.ok) { return; }
  let texel = 1.0 / f32(S.n.x - 2u);
  var acc = vec3f(0.0);
  for (var sy = 0u; sy < 2u; sy++) {
    for (var sx = 0u; sx < 2u; sx++) {
      acc += radiance(normalize(faceDirection(t.uv + (vec2f(f32(sx), f32(sy)) - 0.5) * 0.5 * texel, t.face)));
    }
  }
  textureStore(studioOut, id.xy + S.n.zw, vec4f(acc * 0.25, 1.0));
}

struct Blur { pole: vec4f, misc: vec4f, n: vec4u, weights: array<vec4f, 5> };
@group(0) @binding(0) var<uniform> B: Blur;
@group(0) @binding(1) var blurIn: texture_2d<f32>;
@group(0) @binding(2) var blurSamp: sampler;
@group(0) @binding(3) var blurOut: texture_storage_2d<rgba16float, write>;

fn weight(i: u32) -> f32 { return B.weights[i / 4u][i % 4u]; }
fn getSample(theta: f32, axis: vec3f, dir: vec3f) -> vec3f {
  let c = cos(theta);
  let sd = dir * c + cross(axis, dir) * sin(theta) + axis * dot(axis, dir) * (1.0 - c);
  return bilinearCubeUV(blurIn, blurSamp, sd, B.misc.y);
}
// mezza sfocatura lungo i cerchi massimi: "latitudinale" attorno all'asse polare, "longitudinale" verso il polo
@compute @workgroup_size(8, 8, 1) fn blur(@builtin(global_invocation_id) id: vec3u) {
  let t = tile(id.xy, B.n);
  if (!t.ok) { return; }
  let dir = faceDirection(t.uv, t.face);
  var axis = select(cross(B.pole.xyz, dir), B.pole.xyz, B.pole.w > 0.5);
  if (all(axis == vec3f(0.0))) { axis = vec3f(dir.z, 0.0, -dir.x); }
  axis = normalize(axis);
  var acc = weight(0u) * getSample(0.0, axis, dir);
  for (var i = 1u; i < 20u; i++) {
    if (i >= B.n.y) { break; }
    let th = B.misc.x * f32(i);
    acc += weight(i) * getSample(-th, axis, dir);
    acc += weight(i) * getSample(th, axis, dir);
  }
  textureStore(blurOut, id.xy + B.n.zw, vec4f(acc, 1.0));
}
`;
