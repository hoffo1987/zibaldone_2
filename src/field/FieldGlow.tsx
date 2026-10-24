import { useEffect, useRef } from "react";
import { renderLoop } from "../renderLoop";
import { palette, orbAt, orbPhases, ORB, fieldDevice, type RGB } from "./common";
import { FieldLines, FIELD_WGSL, FU } from "./fieldLines";

// Il campo elettrico dietro le pagine, in piano. Quattro cariche vagano piano: ciascuna ha un nucleo, una corona sottile
// che gira come la ghiera di uno strumento e un alone raccolto. Fra le positive e le negative si tendono poche linee di
// campo tenui, percorse da treni di luce (fieldLines.ts): archi fra le cariche, non un tratteggio su tutto lo schermo.
// Tutto in WebGPU; senza WebGPU restano le luci fisse dello sfondo.

const HALO = FIELD_WGSL + /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[k], 0., 1.);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy / f.aux.z; let R = f.r0.x; let t = f.misc.y;
  var col = vec3f(0.); var a = 0.;
  for (var i = 0; i < 4; i++) {
    let q = f.q[i]; let d = p - q.xy; let r = length(d);
    let c = select(f.colB.rgb, f.colA.rgb, q.w > 0.);
    let core = exp(-r * r / (R * R * .45));
    let halo = exp(-r / (R * 4.2));
    // corona: anello sottile a tratti che gira (le positive in un verso, le negative nell'altro)
    let ang = atan2(d.y, d.x) * 7. + t * .5 * q.w + f32(i);
    let ring = exp(-pow((r - R * 1.75) / (R * .1), 2.)) * (.35 + .65 * smoothstep(.2, .9, sin(ang)));
    let ring2 = exp(-pow((r - R * 2.6) / (R * .06), 2.)) * .45 * (.5 + .5 * sin(atan2(d.y, d.x) * 3. - t * .3 * q.w));
    let k = core * .9 + halo * .3 + (ring + ring2) * .55;
    col += c * k; a += k;
  }
  let I = f.res.w;
  if (f.misc.w > .5) { let A = clamp(max(col.r, max(col.g, col.b)) * I, 0., 1.); return vec4f(min(col * I, vec3f(A)), A); }
  // sulla carta: tinta piena ma trasparente, mai una macchia scura
  let A = clamp(a * .42 * I, 0., .55);
  return vec4f(col / max(a, 1e-4) * A, A);
}`;

const FieldGlow = ({ kind, dark, g }: { kind: string; dark: boolean; g: any }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const gr = useRef(g); gr.current = g;
  const want = useRef<RGB[]>([]);
  want.current = palette(kind, dark);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let stop = () => {}, off = false;
    fieldDevice("low-power").then((dev) => {
      const ctx = !off && dev ? cv.getContext("webgpu") : null;
      if (!dev || !ctx) return;
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: dev, format, alphaMode: "premultiplied" });
      const small = window.innerWidth < 768;
      const uni = dev.createBuffer({ label: "campo", size: FU.size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const data = new Float32Array(FU.size);
      const blend: GPUBlendState = dark
        ? { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } }
        : { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
      const hm = dev.createShaderModule({ label: "campo-aloni", code: HALO });
      const halo = dev.createRenderPipeline({ label: "campo-aloni", layout: "auto", vertex: { module: hm, entryPoint: "vs" }, fragment: { module: hm, entryPoint: "fs", targets: [{ format, blend }] }, primitive: { topology: "triangle-list" } });
      const hBind = dev.createBindGroup({ layout: halo.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uni } }] });
      let W = window.innerWidth, H = window.innerHeight, scale = 1;
      const parts = new FieldLines(dev, uni, format, small ? 10 : 14, dark);
      const fit = () => {
        W = window.innerWidth; H = window.innerHeight;
        scale = Math.min(window.devicePixelRatio || 1, W < 768 ? 1.25 : 1.5);
        cv.width = Math.max(1, Math.round(W * scale)); cv.height = Math.max(1, Math.round(H * scale));
      };
      fit(); window.addEventListener("resize", fit);
      const ph = orbPhases(), cur = want.current.map((c) => c.slice());
      const att: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" };
      let t = 0, last = 0;
      const draw = (now: number) => {
        const cfg = gr.current, raw = Math.min(0.1, last ? (now - last) / 1000 : 0), dt = raw * (cfg.spd || 1); last = now;
        t += dt;
        const mix = 1 - Math.exp(-raw * 2.2);
        cur.forEach((c, i) => c.forEach((v, j) => { c[j] = v + (want.current[i][j] - v) * mix; }));
        const R = Math.max(14, Math.min(30, Math.min(W, H) * 0.03));
        ORB.forEach((o, i) => { const [x, y] = orbAt(i, t, ph); data.set([x * W, y * H, 0, o.q], FU.q + i * 4); });
        data.set([...cur[0], 1], FU.colA); data.set([...cur[1], 1], FU.colB);
        data.set([-40, -40, W + 40, H + 40], FU.bounds);
        data.set([R, R * 0.9, 10, Math.max(W, H) * 0.95], FU.r0);
        data.set([2 / W, 0, 0, -1], FU.v0); data.set([0, -2 / H, 0, 1], FU.v1); data.set([0, 0, 0, 1], FU.v2);
        data.set([dt, t, 0, dark ? 1 : 0], FU.misc);
        data.set([cv.width, cv.height, 1.2 * scale, (cfg.auroraI ?? 1) * (dark ? 0.9 : 0.8)], FU.res);
        data.set([170, 1, scale, 0.32], FU.aux);
        dev.queue.writeBuffer(uni, 0, data);
        const enc = dev.createCommandEncoder();
        parts.trace(enc);
        att.view = ctx.getCurrentTexture().createView();
        const pass = enc.beginRenderPass({ colorAttachments: [att] });
        pass.setPipeline(halo); pass.setBindGroup(0, hBind); pass.draw(3);
        parts.draw(pass);
        pass.end();
        dev.queue.submit([enc.finish()]);
      };
      const halt = renderLoop(draw, () => Math.min(small ? 30 : 60, gr.current.fps || 30), undefined, () => { last = performance.now(); });
      stop = () => { halt(); window.removeEventListener("resize", fit); parts.destroy(); uni.destroy(); ctx.unconfigure(); };
    });
    return () => { off = true; stop(); };
  }, [dark]);
  return <canvas ref={ref} className="bd-field" aria-hidden="true" />;
};
export default FieldGlow;
