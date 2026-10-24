// Gli impulsi di corrente sulla scheda 3D, disegnati dalla GPU a partire dalle istanze di current.ts (emit).
// Ogni istanza è un tratto di scia, una testa, un anello, il contorno di un chip o la croce di una stella, con la sua
// forma calcolata nel fragment shader (distanza dal bordo, bordi sfumati su un pixel). Due bersagli:
// - la scena: forme nitide posate sul piano della scheda in prospettiva, alla risoluzione dello schermo;
// - la mappa di luce: le stesse forme a un quarto di risoluzione, le cui mipmap fanno da bagliore e da luce sul rame.
// Niente canvas 2D da ricopiare a ogni frame: solo un buffer di poche decine di KB.

import { EMIT_STRIDE } from "../current";

const WGSL = /* wgsl */ `
struct EU { v0: vec4f, v1: vec4f, v2: vec4f, misc: vec4f, tex: vec4f }; // misc: scena, luce piena, margine, intensità
struct I { p: vec4f, q: vec4f, c: vec4f };
@group(0) @binding(0) var<uniform> u: EU;
@group(0) @binding(1) var<storage, read> ins: array<I>;
const TEAL = vec3f(.2, .82, .73); const AMBER = vec3f(.96, .72, .25);
const TEAL_INK = vec3f(.024, .44, .384); const AMBER_INK = vec3f(.79, .486, 0.);
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec2f, @location(1) @interpolate(flat) id: u32 };
fn clip(p: vec2f) -> vec4f {
  if (u.misc.x < .5) { return vec4f(p.x / u.tex.x * 2. - 1., 1. - p.y / u.tex.y * 2., 0., 1.); }
  let P = vec4f(p, u.tex.z, 1.); let w = dot(u.v2, P); return vec4f(dot(u.v0, P), dot(u.v1, P), .5 * w, w);
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let it = ins[ii]; let kind = u32(it.q.w); let pad = u.misc.z;
  var cs = array(vec2f(0., 0.), vec2f(1., 0.), vec2f(0., 1.), vec2f(0., 1.), vec2f(1., 0.), vec2f(1., 1.));
  let c = cs[vi];
  var wp: vec2f;
  if (kind == 0u) {
    let a = it.p.xy; let b = it.p.zw; let d = b - a; let l = length(d);
    let dir = select(vec2f(1., 0.), d / l, l > 1e-4); let nrm = vec2f(-dir.y, dir.x);
    let h = it.q.x * .5 + pad;
    wp = mix(a - dir * h, b + dir * h, c.x) + nrm * (c.y * 2. - 1.) * h;
  } else if (kind == 3u) {
    wp = mix(it.p.xy - pad, it.p.xy + it.c.yz + pad, c);
  } else {
    wp = it.p.xy + (c * 2. - 1.) * (it.p.z + it.p.w + pad);
  }
  var o: VO; o.pos = clip(wp); o.w = wp; o.id = ii; return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let it = ins[i.id]; let kind = u32(it.q.w); let p = i.w;
  // distanza dal bordo della forma per ogni tipo; un solo fwidth fuori dai rami, così il bordo è sempre di un pixel
  let ba = it.p.zw - it.p.xy; let pa = p - it.p.xy;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  let r = length(pa); let dd = abs(pa);
  let qb = abs(p - (it.p.xy + it.c.yz * .5)) - it.c.yz * .5; let box = length(max(qb, vec2f(0.))) + min(max(qb.x, qb.y), 0.);
  var d = length(pa - ba * h) - it.q.x * .5; var a = mix(it.q.y, it.q.z, h); var core = h * h * h;
  if (kind == 1u) { d = r - it.p.z * .2; a = it.q.y; core = 1.; }
  if (kind == 2u) { d = abs(r - it.p.z) - it.p.w * .5; a = it.q.y; core = 0.; }
  if (kind == 3u) { d = abs(box) - it.q.x * .5; a = it.q.y; core = 0.; }
  if (kind == 4u) { d = max(min(dd.x, dd.y) - it.p.w * .5, max(dd.x, dd.y) - it.p.z); a = it.q.y; core = 0.; }
  let e = max(fwidth(d), 1e-3);
  var cov = clamp(.5 - d / e, 0., 1.);
  // la testa: nucleo pieno e un bagliore che sfuma fino al raggio intero
  if (kind == 1u) { cov = max(cov, exp(-r * r / (it.p.z * it.p.z) * 3.5) * .6); }
  let A = clamp(a * cov * u.misc.w, 0., 1.);
  if (u.misc.y > .5) {
    let col = select(TEAL, AMBER, it.c.x > .5);
    return vec4f(mix(col, vec3f(1.), core * .65 * cov) * A, A);
  }
  // sulla carta: inchiostro acceso, niente bianco; la scia resta piena più a lungo, se no sulla carta sparisce
  let ink = select(TEAL_INK, AMBER_INK, it.c.x > .5);
  let Ai = clamp(pow(a, .55) * cov * u.misc.w * 1.15, 0., 1.);
  return vec4f(ink * Ai, Ai);
}`;

const ADD: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } };
const OVER: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
export const EU_SIZE = 20;

export class Emitter {
  readonly data: Float32Array;
  private readonly buf: GPUBuffer;
  private readonly uLight: GPUBuffer;
  private readonly uScene: GPUBuffer;
  private readonly pLight: GPURenderPipeline;
  private readonly pScene: GPURenderPipeline;
  private readonly bLight: GPUBindGroup;
  private readonly bScene: GPUBindGroup;
  private n = 0;
  constructor(private readonly dev: GPUDevice, sceneFormat: GPUTextureFormat, dark: boolean, readonly max = 2048) {
    this.data = new Float32Array(max * EMIT_STRIDE);
    this.buf = dev.createBuffer({ label: "impulsi", size: this.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.uLight = dev.createBuffer({ label: "impulsi-luce", size: EU_SIZE * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uScene = dev.createBuffer({ label: "impulsi-scena", size: EU_SIZE * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const m = dev.createShaderModule({ label: "impulsi", code: WGSL });
    const layout = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
    ] });
    const pl = dev.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipe = (format: GPUTextureFormat, blend: GPUBlendState) => dev.createRenderPipeline({ label: "impulsi", layout: pl, vertex: { module: m, entryPoint: "vs" }, fragment: { module: m, entryPoint: "fs", targets: [{ format, blend }] }, primitive: { topology: "triangle-list" } });
    this.pLight = pipe("rgba8unorm", ADD);
    this.pScene = pipe(sceneFormat, dark ? ADD : OVER);
    this.bLight = dev.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.uLight } }, { binding: 1, resource: { buffer: this.buf } }] });
    this.bScene = dev.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.uScene } }, { binding: 1, resource: { buffer: this.buf } }] });
  }
  // n istanze già scritte in data; light e scene sono gli uniform dei due bersagli (EU_SIZE float)
  upload(n: number, light: Float32Array, scene: Float32Array) {
    this.n = n;
    if (n) this.dev.queue.writeBuffer(this.buf, 0, this.data, 0, n * EMIT_STRIDE);
    this.dev.queue.writeBuffer(this.uLight, 0, light); this.dev.queue.writeBuffer(this.uScene, 0, scene);
  }
  drawLight(pass: GPURenderPassEncoder) { if (this.n) { pass.setPipeline(this.pLight); pass.setBindGroup(0, this.bLight); pass.draw(6, this.n); } }
  drawScene(pass: GPURenderPassEncoder) { if (this.n) { pass.setPipeline(this.pScene); pass.setBindGroup(0, this.bScene); pass.draw(6, this.n); } }
  destroy() { this.buf.destroy(); this.uLight.destroy(); this.uScene.destroy(); }
}
