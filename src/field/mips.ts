// Mipmap di una texture rgba8unorm: ogni livello è la media 2×2 del precedente (un campione bilineare al centro).
// Servono alla scheda 3D: le piste lontane non sfarfallano e la luce degli impulsi diventa un bagliore già sfocato.

const WGSL = /* wgsl */ `
@group(0) @binding(0) var s: sampler; @group(0) @binding(1) var t: texture_2d<f32>;
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) k: u32) -> VO {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var o: VO; o.p = vec4f(p[k], 0., 1.); o.uv = vec2f(p[k].x * .5 + .5, .5 - p[k].y * .5); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f { return textureSampleLevel(t, s, i.uv, 0.); }`;

export class Mipper {
  private readonly pipe: GPURenderPipeline;
  private readonly smp: GPUSampler;
  private readonly cache = new WeakMap<GPUTexture, { src: GPUBindGroup; dst: GPUTextureView }[]>();
  constructor(private readonly dev: GPUDevice) {
    const m = dev.createShaderModule({ label: "mipmap", code: WGSL });
    this.pipe = dev.createRenderPipeline({ label: "mipmap", layout: "auto", vertex: { module: m, entryPoint: "vs" }, fragment: { module: m, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
    this.smp = dev.createSampler({ magFilter: "linear", minFilter: "linear" });
  }
  generate(enc: GPUCommandEncoder, tex: GPUTexture) {
    let steps = this.cache.get(tex);
    if (!steps) {
      steps = [];
      for (let l = 1; l < tex.mipLevelCount; l++) {
        const src = this.dev.createBindGroup({ layout: this.pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.smp }, { binding: 1, resource: tex.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) }] });
        steps.push({ src, dst: tex.createView({ baseMipLevel: l, mipLevelCount: 1 }) });
      }
      this.cache.set(tex, steps);
    }
    for (const s of steps) {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: s.dst, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
      pass.setPipeline(this.pipe); pass.setBindGroup(0, s.src); pass.draw(3); pass.end();
    }
  }
  destroy() {}
}
