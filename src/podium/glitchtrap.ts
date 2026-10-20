// Loaded only after the first correct window tap. Same lighting shader and GPU resources as the room; the skeleton is
// posed on the CPU (glitchtrapPose.ts) and the vertices are skinned here, identically in every pass.
import { modelLightingShader, type PodiumQuality } from './shaders';
import { attachWalk, EarSprings, makeRig, writeGlitchtrapPose, type JointInfo, type Rig, type WalkMeta } from './glitchtrapPose';

type Meta = { version: number; vertexCount: number; indexCount: number; stride: number; joints: JointInfo[] };
const objectStruct = (joints: number) => `struct Object { joints: array<mat4x4f, ${joints}>, params: vec4f };`;
const skinning = /* wgsl */ `
struct Input { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @location(3) j: vec4u, @location(4) w: vec4f };
struct Skinned { p: vec3f, n: vec3f };
fn skin(i: Input) -> Skinned {
  let m = O.joints[i.j.x] * i.w.x + O.joints[i.j.y] * i.w.y + O.joints[i.j.z] * i.w.z + O.joints[i.j.w] * i.w.w;
  return Skinned((m * vec4f(i.p, 1.0)).xyz, normalize((m * vec4f(i.n, 0.0)).xyz));
}`;
const shader = (q: PodiumQuality, joints: number) => /* wgsl */ `${modelLightingShader(q)}${objectStruct(joints)}
@group(2) @binding(0) var<uniform> O: Object;
@group(3) @binding(0) var color: texture_2d<f32>;
@group(3) @binding(1) var normalMap: texture_2d<f32>;
@group(3) @binding(2) var material: texture_2d<f32>;
@group(3) @binding(3) var smp: sampler;
${skinning}
struct Out { @builtin(position) pos: vec4f,
 @location(0) @interpolate(perspective, centroid) wp: vec3f,
 @location(1) @interpolate(perspective, centroid) n: vec3f,
 @location(2) @interpolate(perspective, centroid) uv: vec2f };
@vertex fn vs(i: Input) -> Out {
  let a = skin(i); var o: Out; o.wp = a.p; o.n = a.n; o.uv = i.uv;
  o.pos = P.vp * vec4f(select(a.p, vec3f(a.p.x, -a.p.y, a.p.z), P.misc.y == 1.0), 1.0);
  return o;
}
@fragment fn fs(i: Out) -> @location(0) vec4f {
  let base = textureSample(color, smp, i.uv).rgb;
  let nm = textureSample(normalMap, smp, i.uv).xyz * 2.0 - 1.0;
  let mat = textureSample(material, smp, i.uv).rgb;
  let n0 = normalize(i.n);
  let dx = dpdx(i.wp); let dy = dpdy(i.wp); let ux = dpdx(i.uv); let uy = dpdy(i.uv);
  let a = cross(dy, n0); let b = cross(n0, dx);
  let t = a * ux.x + b * uy.x; let bt = a * ux.y + b * uy.y;
  let inv = inverseSqrt(max(max(dot(t,t),dot(bt,bt)), 1e-12));
  // glTF UVs grow downwards; the normal map's green axis points up the image
  let n = normalize(t * inv * nm.x - bt * inv * nm.y + n0 * nm.z);
  var surface: Surf;
  // costume fur: rough, never metallic, with a soft velvet sheen at grazing angles
  surface.alb = base; surface.n = n; surface.rough = max(mat.r, 0.35); surface.metal = 0.0;
  surface.ao = 1.0; surface.kind = 2u; surface.sheen = 0.32;
  let nx = dpdx(n); let ny = dpdy(n); let kr = min(0.3 * (dot(nx, nx) + dot(ny, ny)), 0.2);
  var eye = P.pos.xyz; if (P.misc.y == 1.0) { eye.y = -eye.y; }
  // the purple irises glow on their own (the only light he brings into the room). The published emissive map is a
  // soft ring wider than the iris: keep the light on the lilac iris itself, never on the white, the rim or the pupil
  let iris = smoothstep(0.1, 0.18, (base.b - 0.5 * (base.r + base.g)) / max(base.b, 0.02)) * smoothstep(0.05, 0.12, base.b);
  let glow = vec3f(mat.g, 0.0, mat.b) * O.params.x * iris * 3.2;
  return vec4f(finite3(shadeSurface(surface, 0u, i.wp, n0, eye, i.pos.xy, kr) + glow), 1.0);
}`;
const shadowShader = (joints: number) => `${objectStruct(joints)}
@group(0) @binding(0) var<uniform> O: Object;
@group(1) @binding(0) var<uniform> light: mat4x4f;
${skinning}
@vertex fn shadow(i: Input) -> @builtin(position) vec4f { return light * vec4f(skin(i).p, 1.0); }`;

const vertexLayout: GPUVertexBufferLayout = { arrayStride: 40, attributes: [
  { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
  { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'uint8x4' },
  { shaderLocation: 4, offset: 36, format: 'unorm8x4' },
] };

export class Glitchtrap {
  private buffers: GPUBuffer[] = [];
  private textures: GPUTexture[] = [];
  private own!: GPUBindGroup;
  private uniform!: GPUBuffer;
  private vertex!: GPUBuffer;
  private index!: GPUBuffer;
  private material!: GPUBindGroup;
  private passes: GPUBindGroup[] = [];
  private pipes!: { main: GPURenderPipeline; flat: GPURenderPipeline; shadow: GPURenderPipeline };
  private meta!: Meta;
  private rig!: Rig;
  private ears = new EarSprings();
  private data = new Float32Array(4);
  private constructor(private device: GPUDevice) {}

  static async load(device: GPUDevice, passBuffers: GPUBuffer[], signal: AbortSignal, q: PodiumQuality, frameLayout: GPUBindGroupLayout, passLayout: GPUBindGroupLayout) {
    const result = new Glitchtrap(device);
    try { await result.init(passBuffers, signal, q, frameLayout, passLayout); return result; }
    catch (e) { result.destroy(); throw e; }
  }

  private async init(passBuffers: GPUBuffer[], signal: AbortSignal, q: PodiumQuality, frameLayout: GPUBindGroupLayout, passLayout: GPUBindGroupLayout) {
    const d = this.device, base = `${process.env.PUBLIC_URL || ''}/glitchtrap/`;
    const fetchFile = async (name: string) => {
      const r = await fetch(base + name, { signal });
      if (!r.ok) throw new Error(`Glitchtrap: ${name} (${r.status})`);
      return r;
    };
    const [meta, mesh, walkMeta, walk] = await Promise.all([fetchFile('glitchtrap.json').then(r => r.json()), fetchFile('glitchtrap.bin').then(r => r.arrayBuffer()),
      fetchFile('walk.json').then(r => r.json() as Promise<WalkMeta>), fetchFile('walk.bin').then(r => r.arrayBuffer())]);
    this.meta = meta;
    if (meta.version !== 1 || meta.stride !== 40 || !meta.joints?.length || mesh.byteLength !== meta.vertexCount * 40 + meta.indexCount * 2) throw new Error('Glitchtrap: modello incompleto');
    this.rig = makeRig(meta.joints);
    attachWalk(this.rig, walkMeta, new Float32Array(walk));
    this.data = new Float32Array(this.rig.n * 16 + 4);
    const buffer = (data: ArrayBuffer | Float32Array, usage: number) => {
      const b = d.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
      this.buffers.push(b); d.queue.writeBuffer(b, 0, data); return b;
    };
    this.vertex = buffer(mesh.slice(0, meta.vertexCount * 40), GPUBufferUsage.VERTEX);
    this.index = buffer(mesh.slice(meta.vertexCount * 40), GPUBufferUsage.INDEX);
    this.uniform = buffer(this.data, GPUBufferUsage.UNIFORM);
    const uni = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
    const tex = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ] });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [frameLayout, passLayout, uni, tex] });
    const module = d.createShaderModule({ label: 'glitchtrap', code: shader(q, this.rig.n) });
    const pipeline = (main: boolean) => d.createRenderPipelineAsync({ label: `glitchtrap-${main ? 'main' : 'reflection'}`, layout,
      vertex: { module, entryPoint: 'vs', buffers: [vertexLayout] }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: main ? 4 : 1 },
      depthStencil: { format: main ? 'depth32float' : 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    const [main, flat, shadow] = await Promise.all([pipeline(true), pipeline(false), d.createRenderPipelineAsync({ label: 'glitchtrap-shadow',
      layout: d.createPipelineLayout({ bindGroupLayouts: [uni, uni] }), vertex: { module: d.createShaderModule({ label: 'glitchtrap-shadow', code: shadowShader(this.rig.n) }), entryPoint: 'shadow', buffers: [vertexLayout] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    })]);
    this.pipes = { main, flat, shadow };
    this.own = d.createBindGroup({ layout: uni, entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.passes = passBuffers.map((b, i) => d.createBindGroup({ layout: i === 8 ? uni : passLayout, entries: [{ binding: 0, resource: { buffer: b } }] }));
    const sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 4 });
    const texture = async (name: string, srgb: boolean) => {
      const bytes = await (await fetchFile(name)).arrayBuffer(), sizes: { offset: number; length: number }[] = [];
      const view = new DataView(bytes);
      for (let offset = 0; offset < bytes.byteLength;) {
        const length = view.getUint32(offset, true); offset += 4;
        if (!length || offset + length > bytes.byteLength) throw new Error('Glitchtrap: texture incompleta');
        sizes.push({ offset, length }); offset += length;
      }
      let tex!: GPUTexture;
      for (let level = 0; level < sizes.length; level++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const { offset, length } = sizes[level];
        const img = await createImageBitmap(new Blob([bytes.slice(offset, offset + length)], { type: 'image/webp' }), { colorSpaceConversion: 'none' });
        try {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (!level) {
            tex = d.createTexture({ label: name, size: [img.width, img.height], mipLevelCount: sizes.length,
              format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
            this.textures.push(tex);
          }
          d.queue.copyExternalImageToTexture({ source: img }, { texture: tex, mipLevel: level }, [img.width, img.height]);
        } finally { img.close(); }
      }
      return tex.createView();
    };
    // Settle every upload before cleanup on failure; no late promise may allocate after destroy().
    const maps = await Promise.allSettled([texture('color.bin', true), texture('normal.bin', false), texture('material.bin', false)]);
    const bad = maps.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (bad) throw bad.reason;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const [color, normal, material] = maps.map(r => (r as PromiseFulfilledResult<GPUTextureView>).value);
    this.material = d.createBindGroup({ layout: tex, entries: [{ binding: 0, resource: color }, { binding: 1, resource: normal },
      { binding: 2, resource: material }, { binding: 3, resource: sampler }] });
  }

  update(seconds: number, reducedMotion: boolean, eye: number[]) {
    writeGlitchtrapPose(this.data, this.rig, seconds, reducedMotion, eye, this.ears);
    this.device.queue.writeBuffer(this.uniform, 0, this.data);
  }

  draw(p: GPURenderPassEncoder, pass: number, lighting?: GPUBindGroup) {
    p.setPipeline(pass === 0 ? this.pipes.main : pass === 8 ? this.pipes.shadow : this.pipes.flat);
    p.setBindGroup(0, pass === 8 ? this.own : lighting!); p.setBindGroup(1, this.passes[pass]);
    p.setVertexBuffer(0, this.vertex); p.setIndexBuffer(this.index, 'uint16');
    if (pass !== 8) { p.setBindGroup(2, this.own); p.setBindGroup(3, this.material); }
    p.drawIndexed(this.meta.indexCount);
  }

  destroy() { this.buffers.splice(0).forEach(b => b.destroy()); this.textures.splice(0).forEach(t => t.destroy()); }
}
