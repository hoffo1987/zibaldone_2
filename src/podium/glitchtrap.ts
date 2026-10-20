// Loaded only after the first correct window tap. Same lighting shader and GPU resources as the room; the skeleton is
// posed on the CPU (glitchtrapPose.ts) and the vertices are skinned here, identically in every pass.
// He looks the way he does in Help Wanted: the costume seen through a green phosphor with burning edges, lines of the
// scan climbing through him, blocks of corrupted pixels, and at every glitch his image tears into slices that jump aside
// and split into colours; green fragments of him float and blink around his body. When a heavy glitch takes him
// somewhere else (glitchtrapPose.ts) his image collapses like an old television switched off, into a line and then a
// point in a burst of fragments, and opens the same way where he reappears. The lamp over the place where he stands and
// his green glow on the room are in shaders.ts / engine.ts.
import { modelLightingShader, type PodiumQuality } from './shaders';
import { attachWalk, EarSprings, makeRig, placeAt, secretLights, writeGlitchtrapPose, SCALE, type JointInfo, type Rig, type WalkMeta } from './glitchtrapPose';

type Meta = { version: number; vertexCount: number; indexCount: number; stride: number; joints: JointInfo[] };
// params: eye glow, seconds since the reveal, glitch (0..1), vanish (0 there .. 1 gone); center: his chest (world), scale
const objectStruct = (joints: number) => `struct Object { joints: array<mat4x4f, ${joints}>, params: vec4f, center: vec4f };`;
const MOTES = 160;
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
  let a = skin(i); var o: Out; var p = a.p;
  // at every glitch his image tears: horizontal slices of him jump sideways for a few frames (across the view)
  let g = O.params.z;
  if (g > 0.001) {
    let tq = floor(O.params.y * 24.0);
    let band = floor(p.y / O.center.w * 6.0 + hash2(vec2f(tq, 1.0)) * 4.0);
    let jump = (hash2(vec2f(band * 3.1, tq)) - 0.5) * step(0.55, hash2(vec2f(band, tq + 7.0)));
    p += P.right.xyz * jump * 0.45 * O.center.w * g;
  }
  // a teleport: like an old television switched off, his image squashes into a line across the view at his chest,
  // then the line shrinks to a point; it opens the same way where he reappears
  let v = O.params.w;
  if (v > 0.0) {
    let squash = smoothstep(0.0, 0.62, v); let shrink = smoothstep(0.55, 1.0, v);
    let d = p - O.center.xyz; let side = P.right.xyz;
    let across = dot(d, side); let rest = d - side * across - vec3f(0.0, d.y, 0.0);
    p = O.center.xyz + (side * across * (1.0 + 0.8 * squash) + vec3f(0.0, d.y * (1.0 - 0.97 * squash), 0.0) + rest * (1.0 - squash)) * (1.0 - shrink);
  }
  o.wp = p; o.n = a.n; o.uv = i.uv;
  o.pos = P.vp * vec4f(select(p, vec3f(p.x, -p.y, p.z), P.misc.y == 1.0), 1.0);
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
  // lit like the room (the lamp's penumbra, the moon, the bounced light), but not by his own glow (255)
  let lit = shadeSurface(surface, 255u, i.wp, n0, eye, i.pos.xy, kr);
  let time = O.params.y; let g = O.params.z; let s = O.center.w;
  let V = normalize(eye - i.wp);
  // Help Wanted's glitch: the costume seen through a green phosphor (its light and shade kept, the shade deep), the
  // edges of his silhouette burning green, brighter where the lamp catches him
  let lum = dot(lit, vec3f(0.2126, 0.7152, 0.0722));
  var c = mix(lit, GLOW_COL * lum * 1.25, 0.6);
  let rim = pow(1.0 - saturate(abs(dot(n0, V))), 4.0) * (0.35 + min(lum * 4.0, 1.4));
  // lines of the scan climbing through him, a slow brighter sweep, blocks of corrupted pixels (more in a glitch)
  let y = i.wp.y / s;
  let scan = pow(0.5 + 0.5 * sin(y * 70.0 - time * 5.0), 16.0);
  let sweep = 1.0 - smoothstep(0.0, 0.05, abs(fract(y * 0.4 - time * 0.17) - 0.5));
  let cell = floor(i.pos.xy / 6.0); let tq = floor(time * 12.0);
  let corrupt = step(0.994 - 0.06 * g, hash2(cell + vec2f(tq * 7.13, tq * 3.71)));
  let hum = 0.88 + 0.12 * sin(time * 29.0) * sin(time * 11.0);
  c = c * (1.0 - 0.3 * scan) + GLOW_COL * (rim * 0.8 + scan * 0.03 + sweep * 0.1 + corrupt * 1.3) * hum * (1.0 + 0.8 * g);
  // the torn slices of a glitch split into colours (magenta and green, like a broken signal)
  let tear = g * step(0.62, hash2(vec2f(floor(i.pos.y / 9.0), tq + 3.0)));
  c = mix(c, vec3f(c.g * 1.3, c.r * 0.25, c.g * 1.5) + vec3f(0.35, 0.0, 0.45) * rim, tear * 0.75);
  // the purple irises glow on their own. The published emissive map is a soft ring wider than the iris: keep the light
  // on the lilac iris itself, never on the white, the rim or the pupil
  let iris = smoothstep(0.1, 0.18, (base.b - 0.5 * (base.r + base.g)) / max(base.b, 0.02)) * smoothstep(0.05, 0.12, base.b);
  c += vec3f(mat.g, 0.0, mat.b) * O.params.x * iris * 3.2;
  // collapsing into the line of light he burns white-green; at the strongest glitches a few blocks of him drop out
  let v = O.params.w;
  c += (GLOW_COL * 3.5 + vec3f(1.2)) * v * v;
  if (v > 0.985 || hash2(cell * 1.7 + vec2f(tq, 5.0)) < 0.3 * g * g) { discard; }
  return vec4f(finite3(c), 1.0);
}
// green fragments of him: small square pixels that float up around his body and blink on and off, more and bigger in a
// glitch (additive, in the room's light units)
struct MOut { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) col: vec3f };
@vertex fn vsMote(@builtin(vertex_index) k: u32, @builtin(instance_index) ii: u32) -> MOut {
  var o: MOut;
  let fi = f32(ii); let time = O.params.y; let s = O.center.w; let g = O.params.z;
  let life = 2.0 + 2.2 * hash2(vec2f(fi, 1.0));
  let clock = time / life + hash2(vec2f(fi, 2.0));
  let age = fract(clock); let gen = floor(clock);
  let a = 6.2831853 * hash2(vec2f(fi, gen + 3.0));
  // as he vanishes or reappears the fragments burst out round him
  let v = O.params.w;
  let r = s * (0.22 + 0.4 * sqrt(hash2(vec2f(fi, gen + 4.0)))) * (1.0 + 0.4 * age) * (1.0 + 2.5 * v);
  let p = O.center.xyz + vec3f(cos(a) * r, s * (-1.25 + 1.9 * hash2(vec2f(fi, gen + 5.0)) + 0.5 * age), sin(a) * r);
  let on = step(0.28, hash2(vec2f(fi, floor(time * 10.0) + 11.0)));
  let size = s * (0.007 + 0.014 * hash2(vec2f(fi, gen + 6.0))) * (1.0 + 1.2 * g + v);
  let c = vec2f(f32(k & 1u), f32(k >> 1u)) * 2.0 - 1.0;
  o.pos = P.vp * vec4f(p + (P.right.xyz * c.x + P.up.xyz * c.y) * size, 1.0);
  let white = step(0.88, hash2(vec2f(fi, gen + 8.0)));
  o.col = mix(GLOW_COL, vec3f(0.8, 1.0, 0.85), white) * on * sin(3.14159 * age) * (1.2 + 1.8 * g + 2.0 * v) * saturate(time / 2.0);
  return o;
}
@fragment fn fsMote(i: MOut) -> @location(0) vec4f { return vec4f(finite3(i.col), 0.0); }`;
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
  // 0 main, 1 floor reflection, 2–7 cubemap faces, 8 the moon's shadow, 9 the shadow from his lamp
  private passes: GPUBindGroup[] = [];
  private pipes!: { main: GPURenderPipeline; flat: GPURenderPipeline; shadow: GPURenderPipeline; motes: GPURenderPipeline };
  private meta!: Meta;
  private rig!: Rig;
  private ears = new EarSprings();
  private data = new Float32Array(4);
  // his chest now; where it is once he stands at his present place (the lamp is aimed there), and how that place is
  // turned from where his walk ended; how far gone he is in a teleport
  chest = [0, 0, 0];
  standing = [0, 0, 0];
  spotYaw = 0;
  vanish = 0;
  // how the secret's camera should frame his present (or next) place
  framing: { desk: number[]; phone: number[] } = { desk: [0, 0, 0], phone: [0, 0, 0] };
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
    this.data = new Float32Array(this.rig.n * 16 + 8);
    this.standing = placeAt(this.rig, 0, false).chest.slice();
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
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one' };
    const [main, flat, shadow, motes] = await Promise.all([pipeline(true), pipeline(false), d.createRenderPipelineAsync({ label: 'glitchtrap-shadow',
      layout: d.createPipelineLayout({ bindGroupLayouts: [uni, uni] }), vertex: { module: d.createShaderModule({ label: 'glitchtrap-shadow', code: shadowShader(this.rig.n) }), entryPoint: 'shadow', buffers: [vertexLayout] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    }), d.createRenderPipelineAsync({ label: 'glitchtrap-motes', layout,
      vertex: { module, entryPoint: 'vsMote' }, fragment: { module, entryPoint: 'fsMote', targets: [{ format: 'rgba16float', blend: { color: add, alpha: add } }] },
      primitive: { topology: 'triangle-strip' }, multisample: { count: 4 },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
    })]);
    this.pipes = { main, flat, shadow, motes };
    this.own = d.createBindGroup({ layout: uni, entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
    this.passes = passBuffers.map((b, i) => d.createBindGroup({ layout: i >= 8 ? uni : passLayout, entries: [{ binding: 0, resource: { buffer: b } }] }));
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
    // his chest: the joint's bind position through its skinning matrix
    const j = this.rig.spine[2], b = this.rig.bind[j], o = j * 16, m = this.data;
    this.chest = [0, 1, 2].map((k) => m[o + k] * b[0] + m[o + 4 + k] * b[1] + m[o + 8 + k] * b[2] + m[o + 12 + k]);
    m.set([...this.chest, SCALE], this.rig.n * 16 + 4);
    const place = placeAt(this.rig, seconds, reducedMotion);
    this.standing = place.chest; this.spotYaw = place.yaw; this.framing = place.framing; this.vanish = m[this.rig.n * 16 + 3];
    this.device.queue.writeBuffer(this.uniform, 0, this.data);
  }

  // the lamp, the glitches and his glow at this moment (each 0..1)
  lights(seconds: number, reducedMotion: boolean) { return secretLights(seconds, reducedMotion); }

  draw(p: GPURenderPassEncoder, pass: number, lighting?: GPUBindGroup) {
    const shadow = pass >= 8;
    // mid-teleport he casts no shadow, and once gone there is nothing of him to draw but his fragments
    if (shadow && this.vanish > 0.5) return;
    p.setPipeline(pass === 0 ? this.pipes.main : shadow ? this.pipes.shadow : this.pipes.flat);
    p.setBindGroup(0, shadow ? this.own : lighting!); p.setBindGroup(1, this.passes[pass]);
    p.setVertexBuffer(0, this.vertex); p.setIndexBuffer(this.index, 'uint16');
    if (!shadow) { p.setBindGroup(2, this.own); p.setBindGroup(3, this.material); }
    if (this.vanish < 0.985) p.drawIndexed(this.meta.indexCount);
    // the floating fragments, in the room's own view only
    if (pass === 0) { p.setPipeline(this.pipes.motes); p.draw(4, MOTES); }
  }

  destroy() { this.buffers.splice(0).forEach(b => b.destroy()); this.textures.splice(0).forEach(t => t.destroy()); }
}
