import { useEffect, useRef } from "react";
import { renderLoop } from "./renderLoop";

// Il campo elettrico dietro le pagine (prende il posto delle vecchie macchie d'aurora). Quattro cariche, due positive e
// due negative, vagano piano sullo schermo: attorno a ciascuna c'è un alone del suo colore, e tra loro si tendono le linee
// di campo come nella limatura di ferro di un quaderno di fisica. Lungo le linee scorrono piccoli treni di luce.
// Tutto in un solo shader WebGPU a bassa risoluzione (il bagliore è morbido per natura): costa pochissimo anche su
// telefono. Senza WebGPU restano le luci fisse dello sfondo.
// Le linee sono le curve di livello della funzione di flusso ψ = Σ q·atan2: con cariche intere il salto di atan2 vale
// un numero intero di linee e non si vede, e |∇ψ| = |E| dà lo spessore esatto in pixel senza derivate dello schermo.

const WGSL = /* wgsl */ `
struct U { res: vec2f, t: f32, i: f32, h: f32, l: f32, pad: vec2f, q: array<vec4f, 4>, a: vec4f, b: vec4f };
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[k], 0., 1.);
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy / u.res.y;
  var E = vec2f(0.); var psi = 0.; var phi = 0.; var ga = 0.; var gb = 0.; var rmin = 9.;
  for (var i = 0; i < 4; i++) {
    let d = p - u.q[i].xy; let r2 = dot(d, d) + 1e-5; let q = u.q[i].z;
    E += q * d / r2; psi += q * atan2(d.y, d.x); phi += q * .5 * log(r2);
    let g = exp(-r2 * 5.5); if (q > 0.) { ga += g; } else { gb += g; } rmin = min(rmin, r2);
  }
  let N = 9.; let TAU = 6.2831853;
  let a = abs(fract(psi * N / TAU + .5) - .5);
  let px = a / (max(length(E), 1e-4) * N / TAU / u.res.y);
  let line = (1. - smoothstep(.3, 1.2, px)) * smoothstep(.0012, .02, rmin) * smoothstep(.35, 1.5, length(E));
  let k = fract(phi * .8 - u.t * .16);
  let pk = .28 + .72 * pow(k, 6.);
  let lc = mix(u.a.rgb, u.b.rgb, smoothstep(-1.2, 1.2, phi));
  let col = (u.a.rgb * ga + u.b.rgb * gb) * u.h + lc * line * pk * u.l;
  let al = min(1., ga + gb) * u.h + line * pk * u.l;
  let n = (hash(fc.xy + u.t) - .5) / 255.;
  let A = min(1., al * u.i);
  return vec4f(clamp(col * u.i + n, vec3f(0.), vec3f(A)), A);
}`;

// un dispositivo WebGPU leggero tutto per lo sfondo, chiesto una volta per sessione: la GPU integrata basta, e un
// adattatore software non vale la pena (restano le luci fisse dello sfondo)
let gpu: Promise<GPUDevice | null> | null = null;
const fieldDevice = () => gpu || (gpu = (async () => {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const ad = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  const info: any = (ad as any)?.info || {};
  if (!ad || info.isFallbackAdapter || (ad as any).isFallbackAdapter) return null;
  const d = await ad.requestDevice({ label: "campo" });
  d.lost.then(() => { gpu = null; });
  return d;
})().catch(() => null));

type RGB = number[];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// colori delle cariche per sezione e tema: positiva, negativa
const PAL: Record<string, [string, string][]> = {
  home: [["#0B7F70", "#D99000"], ["#33D1BA", "#F4B73F"]],
  write: [["#0B7F70", "#B4652A"], ["#33D1BA", "#E39459"]],
  archive: [["#7956B6", "#B8476B"], ["#C0A5FA", "#F6A0BA"]],
  authors: [["#0B7F70", "#0284C7"], ["#33D1BA", "#38BDF8"]],
  podio: [["#D99000", "#B4652A"], ["#F4B73F", "#E39459"]],
};

// orbite lente delle cariche: centro, ampiezza e periodo in secondi (x in multipli della larghezza, y dell'altezza)
const ORB = [
  { q: 1, c: [0.18, 0.2], a: [0.2, 0.16], p: [60, 42] },
  { q: -1, c: [0.82, 0.3], a: [0.18, 0.22], p: [70, 50] },
  { q: 1, c: [0.72, 0.86], a: [0.22, 0.14], p: [53, 77] },
  { q: -1, c: [0.26, 0.74], a: [0.17, 0.2], p: [83, 58] },
];

const FieldGlow = ({ kind, dark, g }: { kind: string; dark: boolean; g: any }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const gr = useRef(g); gr.current = g;
  const want = useRef<RGB[]>([]);
  const pal = (PAL[kind] || PAL.home)[dark ? 1 : 0];
  want.current = [hex(pal[0]), hex(pal[1])];
  const dk = useRef(dark); dk.current = dark;
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let stop = () => {}, off = false;
    fieldDevice().then((dev) => {
      const ctx = !off && dev ? cv.getContext("webgpu") : null;
      if (!dev || !ctx) return;
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: dev, format, alphaMode: "premultiplied" });
      const mod = dev.createShaderModule({ label: "campo", code: WGSL });
      const pipe = dev.createRenderPipeline({
        label: "campo", layout: "auto",
        vertex: { module: mod, entryPoint: "vs" },
        fragment: { module: mod, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      const data = new Float32Array(32), buf = dev.createBuffer({ label: "campo", size: data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
      const att: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" };
      // risoluzione bassa di proposito: lo schermo la allarga con un filtro morbido
      let W = 0, H = 0;
      const fit = () => {
        const k = window.innerWidth < 768 ? 0.42 : 0.5;
        W = Math.max(1, Math.round(window.innerWidth * k)); H = Math.max(1, Math.round(window.innerHeight * k));
        cv.width = W; cv.height = H;
      };
      fit(); window.addEventListener("resize", fit);
      const ph = ORB.map(() => [Math.random() * 6.28, Math.random() * 6.28]);
      const cur = want.current.map((c) => c.slice());
      let t = 0, last = 0;
      const draw = (now: number) => {
        const cfg = gr.current, dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
        t += dt * (cfg.spd || 1);
        // al cambio di sezione o di tema i colori si fondono, non scattano
        const mix = 1 - Math.exp(-dt * 2.2);
        cur.forEach((c, i) => c.forEach((v, j) => { c[j] = v + (want.current[i][j] - v) * mix; }));
        const d = dk.current;
        data[0] = W; data[1] = H; data[2] = t; data[3] = cfg.auroraI ?? 1; data[4] = d ? 0.34 : 0.2; data[5] = d ? 0.38 : 0.28;
        ORB.forEach((o, i) => {
          data[8 + i * 4] = (o.c[0] + o.a[0] * Math.sin((t * Math.PI * 2) / o.p[0] + ph[i][0])) * (W / H);
          data[9 + i * 4] = o.c[1] + o.a[1] * Math.sin((t * Math.PI * 2) / o.p[1] + ph[i][1]);
          data[10 + i * 4] = o.q;
        });
        data.set(cur[0], 24); data.set(cur[1], 28);
        dev.queue.writeBuffer(buf, 0, data);
        att.view = ctx.getCurrentTexture().createView();
        const enc = dev.createCommandEncoder(), pass = enc.beginRenderPass({ colorAttachments: [att] });
        pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
        dev.queue.submit([enc.finish()]);
      };
      const halt = renderLoop(draw, () => Math.min(30, gr.current.fps || 30), undefined, () => { last = performance.now(); });
      stop = () => { halt(); window.removeEventListener("resize", fit); buf.destroy(); ctx.unconfigure(); };
    });
    return () => { off = true; stop(); };
  }, []);
  return <canvas ref={ref} className="bd-field" aria-hidden="true" />;
};
export default FieldGlow;
