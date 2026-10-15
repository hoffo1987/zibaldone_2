// Loaded only after the first correct window tap. Uses the room's depth, HDR, bloom and reflections.
const shader = /* wgsl */ `
struct Object { model: mat4x4f, params: vec4f };
struct Pass { vp: mat4x4f, pos: vec4f, right: vec4f, up: vec4f, fwd: vec4f, misc: vec4f };
@group(0) @binding(0) var<uniform> O: Object;
@group(1) @binding(0) var<uniform> P: Pass;
@group(2) @binding(0) var color: texture_2d<f32>;
@group(2) @binding(1) var normalMap: texture_2d<f32>;
@group(2) @binding(2) var smp: sampler;
@group(2) @binding(3) var<uniform> material: vec4f;
struct Out { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f };
@vertex fn vs(@location(0) pos: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
              @location(3) dp: vec3f, @location(4) dn: vec3f) -> Out {
  var o: Out;
  let wp = (O.model * vec4f(pos + dp * O.params.x, 1.0)).xyz;
  o.wp = wp; o.n = (O.model * vec4f(normalize(n + dn * O.params.x), 0.0)).xyz; o.uv = uv;
  let cp = select(wp, vec3f(wp.x, -wp.y, wp.z), P.misc.y == 1.0);
  o.pos = P.vp * vec4f(cp, 1.0); return o;
}
@vertex fn shadow(@location(0) pos: vec3f, @location(3) dp: vec3f) -> @builtin(position) vec4f {
  return P.vp * O.model * vec4f(pos + dp * O.params.x, 1.0);
}
@fragment fn fs(i: Out) -> @location(0) vec4f {
  let base = textureSample(color, smp, i.uv).rgb;
  let nm = textureSample(normalMap, smp, i.uv).xyz * 2.0 - 1.0;
  let n0 = normalize(i.n);
  let dx = dpdx(i.wp); let dy = dpdy(i.wp); let ux = dpdx(i.uv); let uy = dpdy(i.uv);
  let a = cross(dy, n0); let b = cross(n0, dx);
  let t = a * ux.x + b * uy.x; let bt = a * ux.y + b * uy.y;
  let inv = inverseSqrt(max(max(dot(t,t),dot(bt,bt)), 1e-12));
  // Exported UVs flip V for image upload; invert the tangent-space green axis with them.
  let n = normalize(t * inv * nm.x - bt * inv * nm.y + n0 * nm.z);
  let moon = max(dot(n, normalize(vec3f(0.15,0.45,-1.0))),0.0);
  // A faint cold fill reveals the face in the unlit aisle; the room's exposure and bloom finish the image.
  let fill = max(dot(n, normalize(vec3f(0.4,0.5,1.0))),0.0);
  let rim = pow(1.0 - abs(dot(n, normalize(P.pos.xyz - i.wp))),3.0);
  var light = base * (vec3f(0.012,0.018,0.028) + moon * vec3f(0.06,0.12,0.21) + fill * vec3f(0.16,0.18,0.22));
  light += rim * vec3f(0.008,0.017,0.03);
  if (material.x == 2.0) { light += base * 0.1; }
  return vec4f(light * O.params.y, 1.0);
}`;

type Meta = { version: number; vertexCount: number; indexCount: number; stride: number; ranges: { first: number; count: number }[]; materials: string[] };
const vertexLayout: GPUVertexBufferLayout = { arrayStride: 56, attributes: [
  { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
  { shaderLocation: 2, offset: 24, format: 'float32x2' }, { shaderLocation: 3, offset: 32, format: 'float32x3' },
  { shaderLocation: 4, offset: 44, format: 'float32x3' },
] };

export class Freddy {
  private buffers: GPUBuffer[] = [];
  private textures: GPUTexture[] = [];
  private own!: GPUBindGroup;
  private uniform!: GPUBuffer;
  private vertex!: GPUBuffer;
  private index!: GPUBuffer;
  private materials: GPUBindGroup[] = [];
  private passes: GPUBindGroup[] = [];
  private pipes!: { main: GPURenderPipeline; flat: GPURenderPipeline; shadow: GPURenderPipeline };
  private meta!: Meta;
  private data = new Float32Array(20);
  private constructor(private device: GPUDevice) {}

  static async load(device: GPUDevice, passBuffers: GPUBuffer[], signal: AbortSignal) {
    const result = new Freddy(device);
    try { await result.init(passBuffers, signal); return result; }
    catch (e) { result.destroy(); throw e; }
  }

  private async init(passBuffers: GPUBuffer[], signal: AbortSignal) {
    const d = this.device, base = `${process.env.PUBLIC_URL || ''}/freddy/`;
    const fetchFile = async (name: string) => {
      const r = await fetch(base + name, { signal });
      if (!r.ok) throw new Error(`Freddy: ${name} (${r.status})`);
      return r;
    };
    const [meta, mesh] = await Promise.all([fetchFile('freddy.json').then(r => r.json()), fetchFile('freddy.bin').then(r => r.arrayBuffer())]);
    this.meta = meta;
    if (meta.version !== 1 || meta.stride !== 56 || mesh.byteLength !== meta.vertexCount * 56 + meta.indexCount * 4) throw new Error('Freddy: modello incompleto');
    const buffer = (data: ArrayBuffer | Float32Array, usage: number) => {
      const b = d.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
      this.buffers.push(b); d.queue.writeBuffer(b, 0, data); return b;
    };
    this.vertex = buffer(mesh.slice(0, meta.vertexCount * 56), GPUBufferUsage.VERTEX);
    this.index = buffer(mesh.slice(meta.vertexCount * 56), GPUBufferUsage.INDEX);
    this.uniform = buffer(this.data, GPUBufferUsage.UNIFORM);
    const uni = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
    const tex = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ] });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [uni, uni, tex] });
    const module = d.createShaderModule({ label: 'freddy', code: shader });
    const pipeline = (main: boolean) => d.createRenderPipelineAsync({ label: `freddy-${main ? 'main' : 'reflection'}`, layout,
      vertex: { module, entryPoint: 'vs', buffers: [vertexLayout] }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: main ? 4 : 1 },
      depthStencil: { format: main ? 'depth32float' : 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    const [main, flat, shadow] = await Promise.all([pipeline(true), pipeline(false), d.createRenderPipelineAsync({ label: 'freddy-shadow',
      layout: d.createPipelineLayout({ bindGroupLayouts: [uni, uni] }), vertex: { module, entryPoint: 'shadow', buffers: [vertexLayout] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    })]);
    this.pipes = { main, flat, shadow };
    this.own = d.createBindGroup({ layout: uni, entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.passes = passBuffers.map(b => d.createBindGroup({ layout: uni, entries: [{ binding: 0, resource: { buffer: b } }] }));
    const sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 4 });
    const texture = async (name: string, srgb: boolean) => {
      const bytes = await (await fetchFile(name)).arrayBuffer(), sizes: { offset: number; length: number }[] = [];
      const view = new DataView(bytes);
      for (let offset = 0; offset < bytes.byteLength;) {
        const length = view.getUint32(offset, true); offset += 4;
        if (!length || offset + length > bytes.byteLength) throw new Error('Freddy: texture incompleta');
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
    const uploads = await Promise.allSettled((meta.materials as string[]).map(async (name, i) => {
      const maps = await Promise.allSettled([texture(`${name}-color.bin`, true), texture(`${name}-normal.bin`, false)]);
      const bad = maps.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (bad) throw bad.reason;
      const [color, normal] = maps.map(r => (r as PromiseFulfilledResult<GPUTextureView>).value);
      return d.createBindGroup({ layout: tex, entries: [{ binding: 0, resource: color }, { binding: 1, resource: normal },
        { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: buffer(new Float32Array([i, 0, 0, 0]), GPUBufferUsage.UNIFORM) } }] });
    }));
    const bad = uploads.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (bad) throw bad.reason;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    this.materials = uploads.map(r => (r as PromiseFulfilledResult<GPUBindGroup>).value);
  }

  update(seconds: number, reducedMotion: boolean) {
    const emerge = Math.min(1, seconds / (reducedMotion ? 0.4 : 0.9));
    const e = 1 - (1 - emerge) ** 3, lean = 0.1 * e, c = Math.cos(lean) * 1.6, s = Math.sin(lean) * 1.6;
    this.data.set([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1.6, 0, -7.2 + 0.8 * e, 0.03, -5.7, 1,
      reducedMotion ? 0.5 : (0.5 + 0.5 * Math.sin(Math.max(0, seconds - 0.8) * 2.8)) * e, 0.15 + 0.85 * e, 0, 0]);
    this.device.queue.writeBuffer(this.uniform, 0, this.data);
  }

  draw(p: GPURenderPassEncoder, pass: number) {
    p.setPipeline(pass === 0 ? this.pipes.main : pass === 8 ? this.pipes.shadow : this.pipes.flat);
    p.setBindGroup(0, this.own); p.setBindGroup(1, this.passes[pass]);
    p.setVertexBuffer(0, this.vertex); p.setIndexBuffer(this.index, 'uint32');
    if (pass === 8) { p.drawIndexed(this.meta.indexCount); return; }
    this.meta.ranges.forEach((range, i) => { p.setBindGroup(2, this.materials[i]); p.drawIndexed(range.count, 1, range.first); });
  }

  destroy() { this.buffers.splice(0).forEach(b => b.destroy()); this.textures.splice(0).forEach(t => t.destroy()); }
}
