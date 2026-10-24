import { useEffect, useRef } from "react";
import { renderLoop, steadyFps } from "../renderLoop";
import { live, makeCurrent } from "../current";
import { palette, orbAt, orbPhases, ORB, fieldDevice, type RGB } from "./common";
import { FieldLines, FU } from "./fieldLines";
import { Emitter, EU_SIZE } from "./emitter";
import { Mipper } from "./mips";
import { lightCards, clearCards } from "./cardLight";

// Preset Cinema (solo computer): lo sfondo diventa una scheda elettronica vera, vista in prospettiva.
// - Il disegno della sezione (BgArt) è la texture della scheda, disegnata più fitta dello schermo e con le mipmap: con
//   il filtro anisotropico le piste restano nitide da vicino e non sfarfallano in lontananza.
// - Il rame è in rilievo (normali ricavate dal disegno) su vetronite lucida, o su carta da disegno nel tema chiaro.
// - Le quattro cariche galleggiano sopra la scheda come sfere di luce: illuminano il rame, si specchiano nel supporto
//   lucido (riflessi più forti radenti, come nel vero), proiettano un'ombra morbida; fra loro si tendono le linee del campo.
// - Gli impulsi di corrente (current.ts) li disegna la GPU (emitter.ts): nitidi sulla scheda in prospettiva, e su una
//   mappa di luce a un quarto di risoluzione le cui mipmap fanno da bagliore e da luce sulle piste vicine.
// - Rilievo, rame e ambra del disegno si calcolano una volta sola in una texture (con mipmap): la scheda costa un
//   campione per pixel.
// - Le card prendono la luce di cariche e impulsi sui bordi e sulla superficie (cardLight.ts): la luce è disegnata
//   dentro le card, in CSS, così si muove con loro allo stesso fotogramma anche mentre la pagina scorre.
// Qualità: Bilanciata (75% dei pixel), Alta (tutti), Massima (supersampling 2×, poi media 2×2 su ogni pixel).

const B_WGSL = /* wgsl */ `
struct B {
  eye: vec4f, right: vec4f, up: vec4f, fwd: vec4f,
  res: vec4f,   // pixel del bersaglio, pixel CSS
  art: vec4f,   // misure della scheda, visibilità del disegno, tema scuro
  misc: vec4f,  // tempo, intensità del campo, cariche accese
  colA: vec4f, colB: vec4f,
  orbs: array<vec4f, 4>,
};
@group(0) @binding(0) var<uniform> u: B;
`;

const BOARD = B_WGSL + /* wgsl */ `
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var prepT: texture_2d<f32>;
@group(0) @binding(3) var lightT: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[k], 0., 1.);
}
fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn orbCol(i: i32) -> vec3f { return select(u.colB.rgb, u.colA.rgb, u.orbs[i].w > 0.); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dark = u.art.w > .5;
  let ndc = vec2f(fc.x / u.res.x * 2. - 1., 1. - fc.y / u.res.y * 2.);
  let dir = normalize(u.fwd.xyz + ndc.x * u.fwd.w * u.right.w * u.right.xyz + ndc.y * u.fwd.w * u.up.xyz);
  let eye = u.eye.xyz;
  let t = -eye.z / min(dir.z, -1e-4);
  let P = eye + dir * t;
  let uv = P.xy / u.art.xy;
  // un solo campione della scheda precalcolata (pendenze del rilievo, rame, ambra), con mipmap e filtro anisotropico:
  // niente scalettature né sfarfallio sul piano inclinato
  let Bd = textureSample(prepT, smp, uv);
  let glowN = textureSampleLevel(lightT, smp, uv, 1.).rgb;
  let glowF = textureSampleLevel(lightT, smp, uv, 3.).rgb;
  let N = normalize(vec3f(-(Bd.x * 2. - 1.) * 1.2, -(Bd.y * 2. - 1.) * 1.2, 1.));
  let mask = clamp(Bd.z * u.art.z, 0., 1.);
  let am = Bd.w;
  let V = -dir;
  let NV = max(dot(N, V), 0.);
  // supporto: trama fine della vetronite (o della carta)
  let weave = .5 + .5 * sin(P.x * 1.1 + sin(P.y * .37) * 1.5) * sin(P.y * 1.1 + sin(P.x * .29) * 1.5);
  let grain = hash2(floor(P.xy * .8));
  var sub = vec3f(.02, .058, .053) * (.9 + .12 * weave + .05 * grain);
  var ink = mix(vec3f(.22, .68, .6), vec3f(.92, .64, .28), am) * .5;
  if (!dark) { sub = vec3f(.87, .895, .845) * (.985 + .012 * weave + .008 * grain); ink = mix(vec3f(.05, .47, .41), vec3f(.78, .5, .06), am); }
  let alb = mix(sub, ink, mask);
  let shin = mix(30., 90., mask);
  // riflessi: il supporto lucido ha il Fresnel dei dielettrici, il rame riflette tinto del suo colore
  let F0 = select(.02, .04, dark);
  let F = F0 + (1. - F0) * pow(1. - NV, 5.);
  let metal = mix(vec3f(1.), ink * 2.2, mask);
  let gloss = select(mix(.25, .5, mask), mix(.7, 1., mask), dark);
  let key = normalize(vec3f(-.3, -.5, 1.));
  var diff = vec3f(select(.9, .32, dark)) * max(dot(N, key), 0.);
  var spec = vec3f(select(.22, .14, dark)) * pow(max(dot(N, normalize(key + V)), 0.), shin) * metal;
  // sulla carta la luce delle cariche non si somma (schiarirebbe tutto verso il bianco): tinge, come inchiostro
  let diffK = diff;
  var refl = vec3f(0.); var tint = vec3f(0.); var tintA = 0.; var shadow = 0.;
  let R = u.res.w * .5;
  let Rv = reflect(dir, N);
  if (u.misc.z > .5) {
    for (var i = 0; i < 4; i++) {
      let o = u.orbs[i].xyz; let L = o - P; let d = length(L); let l = L / d;
      let att = 1. / (1. + (d / R) * (d / R)) * u.misc.y;
      let c = orbCol(i);
      diff += c * max(dot(N, l), 0.) * att * 1.5;
      spec += c * pow(max(dot(N, normalize(l + V)), 0.), shin) * metal * att * 2.4 * mix(.4, 1., mask);
      // la sfera specchiata nel supporto: distanza fra la carica e il raggio riflesso
      let b = dot(o - P, Rv);
      if (b > 0.) { let dr = distance(o, P + Rv * b); refl += c * (exp(-dr / 9.) + exp(-dr / 40.) * .25) * u.misc.y; }
      tint += c * att; tintA += att;
      let dz = distance(P.xy, o.xy); shadow += exp(-dz * dz / (o.z * o.z * .18)) * .32 * u.misc.y;
    }
  }
  // la corrente: luce piena sulla pista, alone dalle mipmap che accende il rame attorno e velatura larga
  let lightE = glowN * 3.2 + glowF * 5.;
  var col: vec3f;
  if (dark) {
    diff += lightE * (.35 + 2.2 * mask);
    col = alb * (vec3f(.5) + diff) + spec + refl * F * gloss * metal + glowN * 1.6 + glowF * 2.2;
  } else {
    col = alb * (vec3f(.84) + diffK * .2);
    col = mix(col, tint / max(tintA, 1e-4), clamp(tintA * .12, 0., .12));
    col += min(spec * .45, vec3f(.12)) + refl * F * gloss * .2;
    // sulla carta gli impulsi (disegnati sopra come inchiostro) hanno un alone del loro colore
    let gl = glowN * 2.4 + glowF * 3.5; let gm = clamp(max(gl.r, max(gl.g, gl.b)), 0., 1.);
    col = mix(col, gl / max(gm, 1e-4) * .75, gm * .4);
  }
  col *= 1. - clamp(shadow, 0., .5) * select(.5, 1., dark);
  // le cariche: sfere di luce sospese, con alone nel volume
  if (u.misc.z > .5) {
    for (var i = 0; i < 4; i++) {
      let o = u.orbs[i].xyz; let c = orbCol(i); let rad = 15.;
      let b = dot(o - eye, dir); let cp = eye + dir * b; let dp = distance(o, cp);
      let g = (exp(-dp / (rad * 1.2)) * .8 + exp(-dp / (rad * 5.)) * .28) * u.misc.y;
      if (dark) { col += c * g; } else { col = mix(col, c, clamp(g * .3, 0., .3)); }
      // bordo della sfera sfumato su un pixel e mezzo dello schermo: niente scalini
      let aa = 1.5 * b * u.fwd.w * 2. / u.res.y;
      if (dp < rad + aa) {
        let hit = cp - dir * sqrt(max(rad * rad - dp * dp, 0.)); let n = normalize(hit - o);
        let fr = pow(1. - max(dot(n, V), 0.), 2.5);
        let swirl = .5 + .5 * sin(n.x * 9. + u.misc.x * 1.7 * u.orbs[i].w) * sin(n.y * 7. - u.misc.x * 1.3);
        let glint = pow(max(dot(n, normalize(key + V)), 0.), 40.);
        let body = select(mix(c, vec3f(1.), .3 + .25 * swirl) * (.85 + .35 * fr), mix(c, vec3f(1.), .35 + .4 * swirl) * (1. + 1.2 * fr), dark);
        col = mix(col, body + glint, 1. - smoothstep(rad - aa, rad + aa, dp));
      }
    }
  }
  // nebbia: la scheda si perde verso l'alto nel colore della pagina
  let fogC = select(vec3f(.863, .886, .835), vec3f(.024, .055, .051), dark);
  col = mix(col, fogC, smoothstep(u.eye.w * 1.05, u.eye.w * 2.3, t) * .9);
  let vg = length((fc.xy / u.res.xy - .5) * vec2f(1., .8));
  col *= select(1. - vg * vg * .2, 1. - vg * vg * .5, dark);
  // un filo di rumore per non avere bande nei gradienti
  col += (hash2(fc.xy + u.misc.x) - .5) / 255.;
  return vec4f(col, 1.);
}`;

// rilievo e materiali del disegno, una volta per sezione: pendenze dell'alfa in x e y, rame, ambra
const PREP = /* wgsl */ `
@group(0) @binding(0) var s: sampler; @group(0) @binding(1) var t: texture_2d<f32>;
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) k: u32) -> VO {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var o: VO; o.p = vec4f(p[k], 0., 1.); o.uv = vec2f(p[k].x * .5 + .5, .5 - p[k].y * .5); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let o = 2.6 / vec2f(textureDimensions(t));
  let A = textureSampleLevel(t, s, i.uv, 0.);
  let hx = textureSampleLevel(t, s, i.uv + vec2f(o.x, 0.), 0.).a - textureSampleLevel(t, s, i.uv - vec2f(o.x, 0.), 0.).a;
  let hy = textureSampleLevel(t, s, i.uv + vec2f(0., o.y), 0.).a - textureSampleLevel(t, s, i.uv - vec2f(0., o.y), 0.).a;
  return vec4f(hx * .5 + .5, hy * .5 + .5, A.a, smoothstep(.45, .8, A.r));
}`;

// media 2×2 del supersampling: un solo campione bilineare al centro di ogni blocco
const RESOLVE = /* wgsl */ `
@group(0) @binding(0) var s: sampler; @group(0) @binding(1) var t: texture_2d<f32>;
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) k: u32) -> VO {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var o: VO; o.p = vec4f(p[k], 0., 1.); o.uv = vec2f(p[k].x * .5 + .5, .5 - p[k].y * .5); return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f { return textureSampleLevel(t, s, i.uv, 0.); }`;

const BU = { eye: 0, right: 4, up: 8, fwd: 12, res: 16, art: 20, misc: 24, colA: 28, colB: 32, orbs: 36, size: 52 };
const QUIET = "input,textarea,select,[contenteditable],canvas,.inp,.rng,[data-fx=off],button,.bt,a[href],[role=switch],[role=button]:not(.card)";
export const Q3D: Record<string, { scale: number; ss: number }> = { bilanciata: { scale: 0.75, ss: 1 }, alta: { scale: 1, ss: 1 }, massima: { scale: 1, ss: 2 } };

type V3 = number[];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const Backdrop3D = ({ kind, dark, g, quality = "alta" }: { kind: string; dark: boolean; g: any; quality?: string }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const gr = useRef(g); gr.current = g;
  const qr = useRef(quality); qr.current = quality;
  const want = useRef<RGB[]>([]);
  want.current = palette(kind, dark);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    let stop = () => {}, off = false;
    fieldDevice("high-performance").then((dev) => {
      const ctx = !off && dev ? cv.getContext("webgpu") : null;
      if (!dev || !ctx) return;
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: dev, format, alphaMode: "opaque" });
      const uni = dev.createBuffer({ label: "scheda", size: BU.size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const fUni = dev.createBuffer({ label: "scheda-campo", size: FU.size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const data = new Float32Array(BU.size), fData = new Float32Array(FU.size);
      const smp = dev.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear", maxAnisotropy: 16, addressModeU: "mirror-repeat", addressModeV: "mirror-repeat" });
      const lin = dev.createSampler({ magFilter: "linear", minFilter: "linear" });
      const bm = dev.createShaderModule({ label: "scheda", code: BOARD });
      const board = dev.createRenderPipeline({ label: "scheda", layout: "auto", vertex: { module: bm, entryPoint: "vs" }, fragment: { module: bm, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
      const rm = dev.createShaderModule({ label: "media", code: RESOLVE });
      const resolve = dev.createRenderPipeline({ label: "media", layout: "auto", vertex: { module: rm, entryPoint: "vs" }, fragment: { module: rm, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
      const pm = dev.createShaderModule({ label: "rilievo", code: PREP });
      const prep = dev.createRenderPipeline({ label: "rilievo", layout: "auto", vertex: { module: pm, entryPoint: "vs" }, fragment: { module: pm, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
      const lines = new FieldLines(dev, fUni, format, 18, dark);
      const mips = new Mipper(dev);
      const emitter = new Emitter(dev, format, dark);
      const eLight = new Float32Array(EU_SIZE), eScene = new Float32Array(EU_SIZE);

      // la scheda precalcolata (dal disegno) e la mappa di luce degli impulsi, entrambe con le mipmap
      let prepTex: GPUTexture | null = null, lightTex: GPUTexture | null = null, bind: GPUBindGroup | null = null, ver = -1;
      let AW = 1, AH = 1;
      const cur = makeCurrent(dark);
      const levels = (w: number, h: number, max = 32) => Math.min(max, Math.floor(Math.log2(Math.max(w, h))) + 1);
      const upload = () => {
        const el = live.el as HTMLCanvasElement | null, net = live.net;
        if (!el || !net || live.ver === ver || el.width < 2) return;
        ver = live.ver;
        if (!prepTex || prepTex.width !== el.width || prepTex.height !== el.height) {
          prepTex?.destroy(); lightTex?.destroy();
          prepTex = dev.createTexture({ size: [el.width, el.height], mipLevelCount: levels(el.width, el.height), format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
          lightTex = dev.createTexture({ size: [Math.ceil(net.W / 4), Math.ceil(net.H / 4)], mipLevelCount: 5, format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
          bind = dev.createBindGroup({ layout: board.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: smp }, { binding: 2, resource: prepTex.createView() }, { binding: 3, resource: lightTex.createView() },
          ] });
        }
        // il disegno passa sulla GPU, diventa rilievo e materiali, e il canvas nascosto si svuota (decine di MB in meno)
        const art = dev.createTexture({ size: [el.width, el.height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        dev.queue.copyExternalImageToTexture({ source: el }, { texture: art }, [el.width, el.height]);
        const enc = dev.createCommandEncoder();
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: prepTex.createView({ baseMipLevel: 0, mipLevelCount: 1 }), loadOp: "clear", storeOp: "store", clearValue: [0.5, 0.5, 0, 0] }] });
        pass.setPipeline(prep); pass.setBindGroup(0, dev.createBindGroup({ layout: prep.getBindGroupLayout(0), entries: [{ binding: 0, resource: lin }, { binding: 1, resource: art.createView() }] })); pass.draw(3); pass.end();
        mips.generate(enc, prepTex);
        dev.queue.submit([enc.finish()]);
        art.destroy();
        el.width = el.height = 1;
        AW = net.W; AH = net.H;
      };

      // bersaglio del supersampling (solo in qualità Massima)
      let ssTex: GPUTexture | null = null, ssBind: GPUBindGroup | null = null;
      let W = 0, H = 0, RW = 1, RH = 1, q = "";
      const fit = () => {
        W = window.innerWidth; H = window.innerHeight; q = qr.current;
        const Q = Q3D[q] || Q3D.alta, dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.max(1, Math.round(W * dpr * Q.scale)); cv.height = Math.max(1, Math.round(H * dpr * Q.scale));
        ssTex?.destroy(); ssTex = null; ssBind = null;
        if (Q.ss > 1) {
          const k = Math.min(Q.ss, 8192 / cv.width, 8192 / cv.height);
          ssTex = dev.createTexture({ size: [Math.round(cv.width * k), Math.round(cv.height * k)], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          ssBind = dev.createBindGroup({ layout: resolve.getBindGroupLayout(0), entries: [{ binding: 0, resource: lin }, { binding: 1, resource: ssTex.createView() }] });
        }
        RW = ssTex ? ssTex.width : cv.width; RH = ssTex ? ssTex.height : cv.height;
      };
      fit(); window.addEventListener("resize", fit);

      // camera: guarda il centro della scheda inclinata di 24°, scorre con la pagina e si sposta appena col mouse
      const FOV = (35 * Math.PI) / 180, tanH = Math.tan(FOV / 2);
      let mx = 0, my = 0, sx = 0, sy = 0;
      const cam = { eye: [0, 0, 0], right: [1, 0, 0], up: [0, -1, 0], fwd: [0, 0, -1], D: 1 };
      const aim = () => {
        const pitch = ((24 + sy * 1.6) * Math.PI) / 180, yaw = (sx * 2.2 * Math.PI) / 180;
        const D = H / 2 / tanH, T = [AW / 2, H * 0.92 + window.scrollY * 0.15, 0];
        const cy = Math.cos(yaw), syw = Math.sin(yaw);
        const f0 = [0, -Math.sin(pitch), -Math.cos(pitch)], u0 = [0, -Math.cos(pitch), Math.sin(pitch)], r0 = [1, 0, 0];
        const rot = (v: V3) => [v[0] * cy - v[1] * syw, v[0] * syw + v[1] * cy, v[2]];
        cam.fwd = rot(f0); cam.up = rot(u0); cam.right = rot(r0); cam.D = D;
        cam.eye = [T[0] - cam.fwd[0] * D, T[1] - cam.fwd[1] * D, T[2] - cam.fwd[2] * D];
        return T;
      };
      // dal mondo allo schermo (pixel CSS); null se dietro la camera
      const project = (p: V3, out: number[]) => {
        const d = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]], z = dot(d, cam.fwd);
        if (z < 1) return null;
        out[0] = (dot(d, cam.right) / (z * tanH * (W / H)) * 0.5 + 0.5) * W; out[1] = (0.5 - dot(d, cam.up) / (z * tanH) * 0.5) * H;
        return out;
      };
      // dallo schermo alla scheda: per il tocco e per sapere quale parte del disegno si vede
      const toBoard = (x: number, y: number) => {
        const nx = (x / W) * 2 - 1, ny = 1 - (y / H) * 2;
        const d = [0, 1, 2].map((k) => cam.fwd[k] + nx * tanH * (W / H) * cam.right[k] + ny * tanH * cam.up[k]);
        if (d[2] >= -1e-4) return null;
        const t = -cam.eye[2] / d[2];
        return [cam.eye[0] + d[0] * t, cam.eye[1] + d[1] * t];
      };
      const move = (e: PointerEvent) => { if (e.pointerType === "mouse") { mx = (e.clientX / W) * 2 - 1; my = (e.clientY / H) * 2 - 1; } };
      const down = (e: PointerEvent) => {
        if ((e.target as Element)?.closest?.(QUIET) || !gr.current.pulses) return;
        const b = toBoard(e.clientX, e.clientY); if (b) cur.inject(b[0], b[1]);
      };
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("pointerdown", down, { passive: true });

      const ph = orbPhases(), colors = want.current.map((c) => c.slice());
      const att: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" };
      const out: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" };
      const tmp = [0, 0];
      const lights = { orbs: [] as number[][] };
      let t = 0, last = 0;
      const draw = (now: number) => {
        const cfg = gr.current, raw = Math.min(0.1, last ? (now - last) / 1000 : 0), dt = raw * (cfg.spd || 1);
        last = now; t += dt;
        if (qr.current !== q) fit();
        upload();
        if (!bind || !lightTex) return;
        const mix = 1 - Math.exp(-raw * 2.2);
        colors.forEach((c, i) => c.forEach((v, j) => { c[j] = v + (want.current[i][j] - v) * mix; }));
        sx += (mx - sx) * Math.min(1, raw * 2.5); sy += (my - sy) * Math.min(1, raw * 2.5);
        const T = aim();
        // impulsi: la simulazione scrive le istanze, la GPU le disegna nella mappa di luce e poi sulla scheda
        const top = toBoard(W / 2, 0), bot = toBoard(W / 2, H);
        const n = cur.emit(emitter.data, now, { pulses: !!cfg.pulses, dens: Math.round((cfg.dens || 14) * 1.4), spd: cfg.spd || 1 }, top ? top[1] : 0, bot ? bot[1] : AH);
        const enc = dev.createCommandEncoder();

        // cariche sospese sopra la scheda, attorno al punto inquadrato
        const on = !!cfg.aurora, I = cfg.auroraI ?? 1;
        lights.orbs.length = 0;
        ORB.forEach((o, i) => {
          const [fx, fy] = orbAt(i, t, ph);
          const p = [T[0] + (fx - 0.5) * W * 1.05, T[1] + (fy - 0.55) * H * 1.1, 120 + 40 * Math.sin(t * 0.21 + i * 1.7)];
          data.set([...p, o.q], BU.orbs + i * 4); fData.set([...p, o.q], FU.q + i * 4);
          const s = on && project(p, tmp);
          if (s) lights.orbs.push([s[0], s[1], ...(o.q > 0 ? colors[0] : colors[1]).map((v) => v * I)]);
        });
        lightCards(lights, dark, W, H, now);

        data.set([...cam.eye, cam.D], BU.eye); data.set([...cam.right, W / H], BU.right); data.set([...cam.up, 0], BU.up); data.set([...cam.fwd, tanH], BU.fwd);
        data.set([RW, RH, W, H], BU.res);
        data.set([AW, AH, cfg.art ? Math.min(1.6, cfg.artI ?? 1) : 0, dark ? 1 : 0], BU.art);
        data.set([t, I, on ? 1 : 0, 0], BU.misc);
        data.set([...colors[0], 1], BU.colA); data.set([...colors[1], 1], BU.colB);
        dev.queue.writeBuffer(uni, 0, data);

        // campo in 3D: proiezione della camera nelle righe v0, v1, v2
        const a = tanH * (W / H), ex = cam.eye;
        fData.set([...colors[0], 1], FU.colA); fData.set([...colors[1], 1], FU.colB);
        fData.set([T[0] - W * 1.1, T[1] - H * 1.3, T[0] + W * 1.1, T[1] + H * 1.1], FU.bounds);
        fData.set([24, 20, 14, W * 1.4], FU.r0);
        fData.set([...cam.right.map((v) => v / a), -dot(cam.right, ex) / a], FU.v0);
        fData.set([...cam.up.map((v) => v / tanH), -dot(cam.up, ex) / tanH], FU.v1);
        fData.set([...cam.fwd, -dot(cam.fwd, ex)], FU.v2);
        eScene.set(fData.subarray(FU.v0, FU.v0 + 12), 0); eScene.set([1, dark ? 1 : 0, 2, 1], 12); eScene.set([AW, AH, 0.4, 0], 16);
        eLight.set([0, 1, 6, 1], 12); eLight.set([AW, AH, 0, 0], 16);
        emitter.upload(n, eLight, eScene);
        const lp = enc.beginRenderPass({ colorAttachments: [{ view: lightTex.createView({ baseMipLevel: 0, mipLevelCount: 1 }), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
        emitter.drawLight(lp); lp.end();
        mips.generate(enc, lightTex);
        fData.set([dt, t, 1, dark ? 1 : 0], FU.misc);
        fData.set([RW, RH, 1.25 * (RH / H), I * (dark ? 0.85 : 0.7)], FU.res);
        fData.set([260, cam.D, 1, 0.3], FU.aux);
        dev.queue.writeBuffer(fUni, 0, fData);

        if (on) lines.trace(enc);
        const target = ctx.getCurrentTexture().createView();
        att.view = ssTex ? ssTex.createView() : target;
        const pass = enc.beginRenderPass({ colorAttachments: [att] });
        pass.setPipeline(board); pass.setBindGroup(0, bind); pass.draw(3);
        emitter.drawScene(pass);
        if (on) lines.draw(pass);
        pass.end();
        if (ssTex && ssBind) {
          out.view = target;
          const rp = enc.beginRenderPass({ colorAttachments: [out] });
          rp.setPipeline(resolve); rp.setBindGroup(0, ssBind); rp.draw(3); rp.end();
        }
        dev.queue.submit([enc.finish()]);
      };
      // passo regolare: 60 al secondo o il multiplo esatto del refresh più vicino (72 su 144 Hz)
      const halt = renderLoop(draw, (vsync) => steadyFps(60, vsync), undefined, () => { last = performance.now(); });
      stop = () => {
        halt(); clearCards();
        window.removeEventListener("resize", fit); window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down);
        lines.destroy(); mips.destroy(); emitter.destroy(); uni.destroy(); fUni.destroy(); prepTex?.destroy(); lightTex?.destroy(); ssTex?.destroy(); ctx.unconfigure();
      };
    });
    return () => { off = true; stop(); };
  }, [dark]);
  return <canvas ref={ref} className="bd-3d" aria-hidden="true" />;
};
export default Backdrop3D;
