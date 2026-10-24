// Linee di campo: a ogni frame un compute shader le traccia partendo dalle cariche positive e seguendo il campo
// (Runge-Kutta al secondo ordine) finché arrivano a una negativa o escono dalla scena. Un render shader le disegna
// come nastri sottili e tenui, percorsi da treni di luce che vanno dal + al −. Vicino alle cariche le linee si
// spengono, così non fanno raggiere: restano gli archi fra una carica e l'altra.
// Le stesse pipeline servono il campo piatto (pixel dello schermo, z = 0) e lo sfondo 3D (coordinate della scheda).

// uniform condivisi: 14 vec4
export const FIELD_WGSL = /* wgsl */ `
struct F {
  q: array<vec4f, 4>,  // posizione, carica
  colA: vec4f, colB: vec4f,
  bounds: vec4f,       // x0, y0, x1, y1: fuori da qui la linea si ferma
  r0: vec4f,           // raggio di partenza, raggio di arrivo, passo, lunghezza oltre cui la linea sfuma
  v0: vec4f, v1: vec4f, v2: vec4f, // righe della proiezione (clip x, clip y, w)
  misc: vec4f,         // dt, tempo, 3D, tema scuro
  res: vec4f,          // pixel del canvas, spessore, intensità
  aux: vec4f,          // distanza fra due treni di luce, profondità di riferimento, scala dei pixel, velocità dei treni
};
@group(0) @binding(0) var<uniform> f: F;
fn field(p: vec3f) -> vec3f {
  var E = vec3f(0.);
  for (var i = 0; i < 4; i++) { let d = p - f.q[i].xyz; let r2 = dot(d, d) + 1.; E += f.q[i].w * d / (r2 * sqrt(r2)); }
  return E;
}
fn clipOf(p: vec3f) -> vec4f { let P = vec4f(p, 1.); let w = dot(f.v2, P); return vec4f(dot(f.v0, P), dot(f.v1, P), .5 * w, w); }
`;

export const STEPS = 128;

const TRACE = (per: number) => FIELD_WGSL + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> pts: array<vec4f>;
const PER = ${per}u;
const STEPS = ${STEPS}u;
@compute @workgroup_size(64) fn trace(@builtin(global_invocation_id) id: vec3u) {
  let line = id.x; if (line >= arrayLength(&pts) / STEPS) { return; }
  // carica di partenza: la n-esima positiva
  let nth = line / PER; let j = line % PER;
  var c = -1; var seen = 0u;
  for (var i = 0; i < 4; i++) { if (f.q[i].w > 0.) { if (seen == nth) { c = i; } seen++; } }
  let base = line * STEPS;
  if (c < 0) { for (var k = 0u; k < STEPS; k++) { pts[base + k] = vec4f(0., 0., 0., -1.); } return; }
  // direzioni di partenza ben distribuite, che ruotano piano: le linee si muovono anche quando le cariche stanno ferme
  let t = f.misc.y * .05 * f.q[c].w;
  var d: vec3f;
  if (f.misc.z > .5) {
    let z = 1. - (f32(j) + .5) / f32(PER) * 1.7; let r = sqrt(max(0., 1. - z * z)); let a = f32(j) * 2.3999632 + t;
    d = vec3f(cos(a) * r, sin(a) * r, z);
  } else {
    let a = (f32(j) + .5) / f32(PER) * 6.2831853 + t; d = vec3f(cos(a), sin(a), 0.);
  }
  var p = f.q[c].xyz + d * f.r0.x;
  var s = 0.; var alive = true;
  let h = f.r0.z; let b = f.bounds;
  for (var k = 0u; k < STEPS; k++) {
    if (!alive) { pts[base + k] = vec4f(p, -1.); continue; }
    pts[base + k] = vec4f(p, s);
    let e1 = normalize(field(p) + vec3f(1e-9));
    let e2 = normalize(field(p + e1 * h * .5) + vec3f(1e-9));
    p += e2 * h; s += h;
    for (var i = 0; i < 4; i++) { if (f.q[i].w < 0. && distance(p, f.q[i].xyz) < f.r0.y) { alive = false; } }
    if (p.x < b.x || p.y < b.y || p.x > b.z || p.y > b.w || (f.misc.z > .5 && p.z < 1.)) { alive = false; }
  }
}`;

const RENDER = FIELD_WGSL + /* wgsl */ `
@group(0) @binding(1) var<storage, read> pts: array<vec4f>;
const STEPS = ${STEPS}u;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) s: f32, @location(3) seed: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let line = ii / (STEPS - 1u); let k = ii % (STEPS - 1u);
  let A = pts[line * STEPS + k]; let Bp = pts[line * STEPS + k + 1u];
  if (A.w < 0. || Bp.w < 0.) { o.pos = vec4f(2., 2., 2., 1.); return o; }
  let half = f.res.xy * .5;
  let a = clipOf(A.xyz); let b = clipOf(Bp.xyz);
  if (a.w < 1e-3 || b.w < 1e-3) { o.pos = vec4f(2., 2., 2., 1.); return o; }
  let sa = a.xy / a.w * half; let sb = b.xy / b.w * half;
  let dv = sb - sa; let len = length(dv);
  let dir = select(vec2f(1., 0.), dv / len, len > 1e-3);
  let nrm = vec2f(-dir.y, dir.x);
  var w = f.res.z;
  if (f.misc.z > .5) { w = clamp(w * f.aux.y / a.w, .5, 3.5); }
  var cs = array(vec2f(0., -1.), vec2f(1., -1.), vec2f(0., 1.), vec2f(0., 1.), vec2f(1., -1.), vec2f(1., 1.));
  let corner = cs[vi];
  // il nastro sporge di mezzo spessore ai lati del segmento, così i segmenti si saldano senza buchi
  let pt = mix(sa - dir * w * .5, sb + dir * w * .5, corner.x) + nrm * corner.y * w;
  o.pos = vec4f(pt / half, .5, 1.);
  o.uv = corner;
  let P = mix(A.xyz, Bp.xyz, corner.x);
  var phi = 0.; var dmin = 1e9;
  for (var i = 0; i < 4; i++) { let d = distance(P, f.q[i].xyz); phi += f.q[i].w / (d + 1.); dmin = min(dmin, d); }
  let mixv = smoothstep(-.35, .35, phi * f.r0.x);
  let s = mix(A.w, Bp.w, corner.x);
  // spenta vicino alle cariche e sulle linee che scappano lontano
  let near = select(1., 2.8, f.misc.z > .5); // in 3D le linee si vedono di scorcio: si spengono più lontano dalle sfere
  let env = smoothstep(f.r0.x * 1.2 * near, f.r0.x * 4. * near, dmin) * (1. - smoothstep(f.r0.w * .55, f.r0.w, s));
  o.col = vec4f(mix(f.colB.rgb, f.colA.rgb, mixv), env * f.res.w);
  o.s = s; o.seed = fract(f32(line) * .618034);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let across = 1. - i.uv.y * i.uv.y;
  // treni di luce: testa netta, coda lunga, che scorrono dal + al −
  let ph = fract(i.s / f.aux.x - f.misc.y * f.aux.w + i.seed);
  let pk = pow(ph, 9.);
  let line = .16 + pk * 1.6;
  let a = clamp(i.col.a * across * across * line, 0., 1.);
  var rgb = i.col.rgb;
  if (f.misc.w > .5) { rgb = mix(rgb, vec3f(1.), pk * .55); }
  return vec4f(rgb * a, a);
}`;

export class FieldLines {
  private readonly buf: GPUBuffer;
  private readonly cPipe: GPUComputePipeline;
  private readonly rPipe: GPURenderPipeline;
  private readonly cBind: GPUBindGroup;
  private readonly rBind: GPUBindGroup;
  readonly lines: number;
  // per: linee che partono da ogni carica positiva (le positive sono due)
  constructor(dev: GPUDevice, uni: GPUBuffer, format: GPUTextureFormat, per: number, additive: boolean) {
    this.lines = per * 2;
    this.buf = dev.createBuffer({ label: "campo-linee", size: this.lines * STEPS * 16, usage: GPUBufferUsage.STORAGE });
    const cl = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ] });
    const rl = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ] });
    this.cPipe = dev.createComputePipeline({ label: "campo-traccia", layout: dev.createPipelineLayout({ bindGroupLayouts: [cl] }), compute: { module: dev.createShaderModule({ code: TRACE(per) }), entryPoint: "trace" } });
    const rm = dev.createShaderModule({ code: RENDER });
    const blend: GPUBlendState = additive
      ? { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } }
      : { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
    this.rPipe = dev.createRenderPipeline({
      label: "campo-linee", layout: dev.createPipelineLayout({ bindGroupLayouts: [rl] }),
      vertex: { module: rm, entryPoint: "vs" },
      fragment: { module: rm, entryPoint: "fs", targets: [{ format, blend }] },
      primitive: { topology: "triangle-list" },
    });
    this.cBind = dev.createBindGroup({ layout: cl, entries: [{ binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: this.buf } }] });
    this.rBind = dev.createBindGroup({ layout: rl, entries: [{ binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: this.buf } }] });
  }
  trace(enc: GPUCommandEncoder) {
    const pass = enc.beginComputePass();
    pass.setPipeline(this.cPipe); pass.setBindGroup(0, this.cBind); pass.dispatchWorkgroups(Math.ceil(this.lines / 64)); pass.end();
  }
  draw(pass: GPURenderPassEncoder) { pass.setPipeline(this.rPipe); pass.setBindGroup(0, this.rBind); pass.draw(6, this.lines * (STEPS - 1)); }
  destroy() { this.buf.destroy(); }
}

// layout dell'uniform F (in float): offset di ogni campo
export const FU = { q: 0, colA: 16, colB: 20, bounds: 24, r0: 28, v0: 32, v1: 36, v2: 40, misc: 44, res: 48, aux: 52, size: 56 };
