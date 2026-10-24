import { useEffect, useRef } from "react";
import { renderLoop } from "../renderLoop";
import { live, makeCurrent } from "../current";
import { palette, orbAt, orbPhases, ORB, fieldDevice, type RGB } from "./common";
import { FieldLines, FU } from "./fieldLines";

// Preset Cinema (solo computer): lo sfondo diventa una scheda elettronica vera, vista in prospettiva.
// - Il disegno della sezione (BgArt) è la texture della scheda: le piste sono rame in rilievo, con normali ricavate dal
//   disegno stesso, su un supporto di vetronite (sul tema chiaro, carta da disegno con l'inchiostro in rilievo).
// - Le quattro cariche del campo galleggiano sopra la scheda come sfere di luce: illuminano il rame (riflessi speculari),
//   proiettano un'ombra morbida e fra loro si tendono le linee del campo, archi in tre dimensioni percorsi dalla luce.
// - Gli impulsi di corrente (current.ts) si disegnano come luce su un canvas a parte, posato sul rame come emissione; le
//   loro teste sono piccole luci che accendono le piste vicine.
// - Le card della pagina restano 2D ma stanno "sopra" la scena: proiettano ombra e un alone del colore delle luci vicine
//   sulla scheda, e uno strato di vetro sopra di loro accende i bordi e la superficie dal lato delle cariche e degli
//   impulsi che passano accanto.
// Un solo raggio per pixel contro il piano della scheda (niente geometria), risoluzione che si adatta da sola.

const B_WGSL = /* wgsl */ `
struct B {
  eye: vec4f, right: vec4f, up: vec4f, fwd: vec4f,
  res: vec4f,   // pixel del canvas, pixel CSS
  art: vec4f,   // misure della scheda, visibilità del disegno, tema scuro
  misc: vec4f,  // tempo, intensità del campo, teste, card
  misc2: vec4f, // scala del vetro, cariche accese, impulsi accesi
  colA: vec4f, colB: vec4f,
  orbs: array<vec4f, 4>, orbS: array<vec4f, 4>,
  heads: array<vec4f, 24>, headS: array<vec4f, 24>,
  cards: array<vec4f, 24>, cardR: array<vec4f, 24>,
};
@group(0) @binding(0) var<uniform> u: B;
fn sdRR(p: vec2f, b: vec2f, r: f32) -> f32 { let q = abs(p) - b + r; return length(max(q, vec2f(0.))) + min(max(q.x, q.y), 0.) - r; }
fn orbCol(i: i32) -> vec3f { return select(u.colB.rgb, u.colA.rgb, u.orbs[i].w > 0.); }
const TEAL = vec3f(.2, .82, .73);
const AMBER = vec3f(.96, .72, .25);
// luce delle cariche e degli impulsi in un punto dello schermo (pixel CSS): serve all'alone delle card
fn screenLight(p: vec2f) -> vec3f {
  var c = vec3f(0.);
  if (u.misc2.y > .5) { for (var i = 0; i < 4; i++) { let d = distance(p, u.orbS[i].xy) / (u.res.w * .55); c += orbCol(i) / (1. + d * d); } }
  let nh = i32(u.misc.z);
  for (var k = 0; k < nh; k++) { let h = u.headS[k]; let d = distance(p, h.xy); c += select(TEAL, AMBER, h.w > .5) * h.z * exp(-d / 160.) * .5; }
  return c;
}
`;

const BOARD = B_WGSL + /* wgsl */ `
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var artT: texture_2d<f32>;
@group(0) @binding(3) var emiT: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[k], 0., 1.);
}
fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dark = u.art.w > .5;
  let css = fc.xy / u.res.xy * u.res.zw;
  let ndc = vec2f(fc.x / u.res.x * 2. - 1., 1. - fc.y / u.res.y * 2.);
  let dir = normalize(u.fwd.xyz + ndc.x * u.fwd.w * u.right.w * u.right.xyz + ndc.y * u.fwd.w * u.up.xyz);
  let eye = u.eye.xyz;
  let t = -eye.z / min(dir.z, -1e-4);
  let P = eye + dir * t;
  let uv = P.xy / u.art.xy;
  let tx = 1. / u.art.xy;
  // il disegno: alfa = rame, rosso alto = pista ambra
  let A = textureSampleLevel(artT, smp, uv, 0.);
  let e1 = 1.6;
  let hx = textureSampleLevel(artT, smp, uv + vec2f(tx.x * e1, 0.), 0.).a - textureSampleLevel(artT, smp, uv - vec2f(tx.x * e1, 0.), 0.).a;
  let hy = textureSampleLevel(artT, smp, uv + vec2f(0., tx.y * e1), 0.).a - textureSampleLevel(artT, smp, uv - vec2f(0., tx.y * e1), 0.).a;
  let N = normalize(vec3f(-hx * 1.3, -hy * 1.3, 1.));
  let mask = clamp(A.a * u.art.z, 0., 1.);
  let am = smoothstep(.45, .8, A.r);
  // supporto: trama fine della vetronite (o della carta) che si vede solo da vicino
  let weave = .5 + .5 * sin(P.x * 1.1 + sin(P.y * .37) * 1.5) * sin(P.y * 1.1 + sin(P.x * .29) * 1.5);
  let grain = hash2(floor(P.xy * .8));
  var sub = vec3f(.02, .058, .053) * (.9 + .12 * weave + .05 * grain);
  var ink = mix(vec3f(.2, .66, .58), vec3f(.9, .62, .26), am) * .5;
  if (!dark) { sub = vec3f(.925, .935, .905) * (.985 + .012 * weave + .008 * grain); ink = mix(vec3f(.05, .47, .41), vec3f(.78, .5, .06), am); }
  let alb = mix(sub, ink, mask);
  let V = -dir;
  let shin = mix(18., 80., mask);
  let ks = select(mix(.1, .55, mask), mix(.18, 1.1, mask), dark);
  // luce chiave fissa dall'alto, poi le cariche e gli impulsi
  var diff = vec3f(0.); var spec = vec3f(0.); var tint = vec3f(0.); var tintA = 0.; var shadow = 0.;
  let key = normalize(vec3f(-.3, -.5, 1.));
  diff += vec3f(select(.9, .3, dark)) * max(dot(N, key), 0.);
  spec += vec3f(select(.25, .12, dark)) * pow(max(dot(N, normalize(key + V)), 0.), shin) * ks;
  let R = u.res.w * .5;
  if (u.misc2.y > .5) {
    for (var i = 0; i < 4; i++) {
      let o = u.orbs[i].xyz; let L = o - P; let d = length(L); let l = L / d;
      let att = 1. / (1. + (d / R) * (d / R)) * u.misc.y;
      let c = orbCol(i);
      diff += c * max(dot(N, l), 0.) * att * 1.6;
      spec += c * pow(max(dot(N, normalize(l + V)), 0.), shin) * ks * att * 2.2;
      tint += c * att; tintA += att;
      let dz = distance(P.xy, o.xy); shadow += exp(-dz * dz / (o.z * o.z * .18)) * .35 * u.misc.y;
    }
  }
  let nh = i32(u.misc.z);
  for (var k = 0; k < nh; k++) {
    let h = u.heads[k]; let L = vec3f(h.xy, 9.) - P; let d = length(L); let l = L / d;
    let att = exp(-d / 34.) * h.z;
    let c = select(TEAL, AMBER, h.w > .5);
    diff += c * att * (.4 + 1.6 * mask);
    spec += c * pow(max(dot(N, normalize(l + V)), 0.), shin) * att * ks * 2.;
  }
  // impulsi: luce posata sul rame, con un bagliore largo in due anelli di campioni
  var em = textureSampleLevel(emiT, smp, uv, 0.).rgb;
  var bloom = vec3f(0.);
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * .7853982; let o = vec2f(cos(a), sin(a));
    bloom += textureSampleLevel(emiT, smp, uv + o * tx * 5., 0.).rgb * .05 + textureSampleLevel(emiT, smp, uv + o * tx * 14., 0.).rgb * .022;
  }
  var col: vec3f;
  if (dark) {
    col = alb * (vec3f(.55) + diff) + spec + em * .95 + bloom;
  } else {
    col = alb * (vec3f(.82) + diff * .22);
    // sulla carta la luce è una velatura del suo colore, gli impulsi sono inchiostro acceso con un alone
    col = mix(col, tint / max(tintA, 1e-4), clamp(tintA * .13, 0., .16));
    col += spec * .5;
    let el = clamp(max(em.r, max(em.g, em.b)), 0., 1.);
    col = mix(col, em * .62, el * .9);
    let bl = clamp(max(bloom.r, max(bloom.g, bloom.b)), 0., 1.);
    col = mix(col, bloom / max(bl, 1e-4) * .7, bl * .55);
  }
  col *= 1. - clamp(shadow, 0., .5) * select(.5, 1., dark);
  // card: ombra sotto e alone del colore delle luci attorno, come pannelli sospesi davanti alla scheda
  let nc = i32(u.misc.w);
  var sh = 0.; var halo = vec3f(0.);
  for (var c = 0; c < nc; c++) {
    let r = u.cards[c]; let half = r.zw * .5; let ctr = r.xy + half; let rr = u.cardR[c].x;
    let s0 = sdRR(css - ctr - vec2f(0., 22.), half, rr);
    sh = max(sh, 1. - smoothstep(-26., 46., s0));
    let s1 = sdRR(css - ctr, half, rr);
    if (s1 > 0.) { halo += screenLight(clamp(css, r.xy, r.xy + r.zw)) * exp(-s1 / 22.); }
  }
  if (dark) { col = col * (1. - .55 * sh) + halo * .11; }
  else { col = col * (1. - .12 * sh * vec3f(1., .85, .88)); let hl = clamp(max(halo.r, max(halo.g, halo.b)), 0., 1.); col = mix(col, halo / max(hl, 1e-4), hl * .1); }
  // le cariche: sfere di luce sospese, con alone nel volume
  if (u.misc2.y > .5) {
    for (var i = 0; i < 4; i++) {
      let o = u.orbs[i].xyz; let c = orbCol(i); let rad = 15.;
      let b = dot(o - eye, dir); let cp = eye + dir * b; let dp = distance(o, cp);
      let g = (exp(-dp / (rad * 1.3)) * .8 + exp(-dp / (rad * 5.)) * .3) * u.misc.y;
      if (dark) { col += c * g; } else { col = mix(col, c, clamp(g * .45, 0., .5)); }
      if (dp < rad) {
        let hit = cp - dir * sqrt(rad * rad - dp * dp); let n = normalize(hit - o);
        let fr = pow(1. - max(dot(n, V), 0.), 2.5);
        let swirl = .5 + .5 * sin(n.x * 9. + u.misc.x * 1.7 * u.orbs[i].w) * sin(n.y * 7. - u.misc.x * 1.3);
        let glint = pow(max(dot(n, normalize(key + V)), 0.), 40.);
        let body = select(mix(c * .75, vec3f(1.), .15 + .2 * swirl) * (.7 + .5 * fr), mix(c, vec3f(1.), .35 + .4 * swirl) * (1. + 1.2 * fr), dark);
        col = mix(col, body + glint, smoothstep(rad, rad - 1.5, dp));
      }
    }
  }
  // nebbia: la scheda si perde verso l'alto nel colore della pagina
  let fogC = select(vec3f(.93, .937, .91), vec3f(.024, .055, .051), dark);
  col = mix(col, fogC, smoothstep(u.eye.w * 1.05, u.eye.w * 2.3, t) * .9);
  let vg = length((fc.xy / u.res.xy - .5) * vec2f(1., .8));
  col *= select(1. - vg * vg * .08, 1. - vg * vg * .5, dark);
  return vec4f(col, 1.);
}`;

// vetro sopra le card: bordi e superficie che riflettono le luci della scena, una istanza per card
const GLASS = B_WGSL + /* wgsl */ `
struct VO { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) id: u32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var cs = array(vec2f(0., 0.), vec2f(1., 0.), vec2f(0., 1.), vec2f(0., 1.), vec2f(1., 0.), vec2f(1., 1.));
  let r = u.cards[ii]; let p = r.xy - 2. + cs[vi] * (r.zw + 4.);
  var o: VO; o.pos = vec4f(p.x / u.res.z * 2. - 1., 1. - p.y / u.res.w * 2., 0., 1.); o.id = ii; return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.pos.xy / u.misc2.x;
  let r = u.cards[i.id]; let half = r.zw * .5; let ctr = r.xy + half; let rr = u.cardR[i.id].x;
  let sd = sdRR(p - ctr, half, rr);
  if (sd > .5) { discard; }
  let n = normalize(vec2f(sdRR(p - ctr + vec2f(.5, 0.), half, rr) - sdRR(p - ctr - vec2f(.5, 0.), half, rr), sdRR(p - ctr + vec2f(0., .5), half, rr) - sdRR(p - ctr - vec2f(0., .5), half, rr)) + 1e-6);
  let rim = smoothstep(-2.6, -.4, sd) * (1. - smoothstep(-.2, .5, sd));
  let inner = smoothstep(-90., -2., sd);
  var rc = vec3f(0.); var sc = vec3f(0.);
  if (u.misc2.y > .5) {
    for (var k = 0; k < 4; k++) {
      let L = u.orbS[k].xy - p; let d = length(L); let att = 1. / (1. + (d / (u.res.w * .5)) * (d / (u.res.w * .5)));
      let c = orbCol(k) * u.misc.y;
      rc += c * max(dot(n, L / d), 0.) * att;
      let np = clamp(u.orbS[k].xy, r.xy, r.xy + r.zw);
      let ds = distance(p, np); sc += c * exp(-ds * ds / (170. * 170.)) * att;
    }
  }
  let nh = i32(u.misc.z);
  for (var k = 0; k < nh; k++) {
    let h = u.headS[k]; let L = h.xy - p; let d = length(L);
    let c = select(TEAL, AMBER, h.w > .5) * h.z;
    let att = exp(-d / 150.);
    rc += c * max(dot(n, L / max(d, 1e-3)), 0.) * att * 1.4;
    let np = clamp(h.xy, r.xy, r.xy + r.zw); let ds = distance(p, np); sc += c * exp(-ds * ds / (60. * 60.)) * att * 1.2;
  }
  if (u.art.w > .5) {
    let c = rc * rim * 1.1 + sc * inner * .09;
    return vec4f(c, 0.);
  }
  let rl = clamp(max(rc.r, max(rc.g, rc.b)), 0., 1.); let sl = clamp(max(sc.r, max(sc.g, sc.b)), 0., 1.);
  let a = clamp(rim * rl * .85 + inner * sl * .1, 0., 1.);
  let c = (rc / max(rl, 1e-4) * rim * rl * .85 + sc / max(sl, 1e-4) * inner * sl * .1);
  return vec4f(c, a);
}`;

const BU = { eye: 0, right: 4, up: 8, fwd: 12, res: 16, art: 20, misc: 24, misc2: 28, colA: 32, colB: 36, orbs: 40, orbS: 56, heads: 72, headS: 168, cards: 264, cardR: 360, size: 456 };
const MAXH = 24, MAXC = 24;
const QUIET = "input,textarea,select,[contenteditable],canvas,.inp,.rng,[data-fx=off],button,.bt,a[href],[role=switch],[role=button]:not(.card)";

type V3 = number[];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const Backdrop3D = ({ kind, dark, g }: { kind: string; dark: boolean; g: any }) => {
  const bgRef = useRef<HTMLCanvasElement>(null), glRef = useRef<HTMLCanvasElement>(null);
  const gr = useRef(g); gr.current = g;
  const want = useRef<RGB[]>([]);
  want.current = palette(kind, dark);
  useEffect(() => {
    const cv = bgRef.current, gv = glRef.current; if (!cv || !gv) return;
    let stop = () => {}, off = false;
    fieldDevice("high-performance").then((dev) => {
      const ctx = !off && dev ? cv.getContext("webgpu") : null, gtx = !off && dev ? gv.getContext("webgpu") : null;
      if (!dev || !ctx || !gtx) return;
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: dev, format, alphaMode: "opaque" });
      gtx.configure({ device: dev, format, alphaMode: "premultiplied" });
      const uni = dev.createBuffer({ label: "scheda", size: BU.size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const fUni = dev.createBuffer({ label: "scheda-campo", size: FU.size * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const data = new Float32Array(BU.size), fData = new Float32Array(FU.size);
      const smp = dev.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "mirror-repeat", addressModeV: "mirror-repeat" });
      const bm = dev.createShaderModule({ label: "scheda", code: BOARD });
      const board = dev.createRenderPipeline({ label: "scheda", layout: "auto", vertex: { module: bm, entryPoint: "vs" }, fragment: { module: bm, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
      const glm = dev.createShaderModule({ label: "vetro", code: GLASS });
      const glassBlend: GPUBlendState = dark
        ? { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } }
        : { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
      const glass = dev.createRenderPipeline({ label: "vetro", layout: "auto", vertex: { module: glm, entryPoint: "vs" }, fragment: { module: glm, entryPoint: "fs", targets: [{ format, blend: glassBlend }] }, primitive: { topology: "triangle-list" } });
      const glassBind = dev.createBindGroup({ layout: glass.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uni } }] });
      // linee del campo in 3D: sulla scheda scura si sommano come luce, su quella chiara si posano come inchiostro
      const parts = new FieldLines(dev, fUni, format, 18, dark);

      // texture della scheda (il disegno) e dell'emissione (gli impulsi, a metà risoluzione)
      let artTex: GPUTexture | null = null, emiTex: GPUTexture | null = null, bind: GPUBindGroup | null = null, ver = -1;
      let AW = 1, AH = 1;
      const emi = document.createElement("canvas"), eg = emi.getContext("2d")!;
      const cur = makeCurrent(dark, true);
      const upload = () => {
        const el = live.el as HTMLCanvasElement | null, net = live.net;
        if (!el || !net || live.ver === ver || !el.width) return;
        ver = live.ver;
        if (!artTex || artTex.width !== el.width || artTex.height !== el.height) {
          artTex?.destroy(); emiTex?.destroy();
          artTex = dev.createTexture({ size: [el.width, el.height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
          emi.width = Math.ceil(net.W / 2); emi.height = Math.ceil(net.H / 2);
          emiTex = dev.createTexture({ size: [emi.width, emi.height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
          dev.queue.copyExternalImageToTexture({ source: emi }, { texture: emiTex }, [emi.width, emi.height]);
          bind = dev.createBindGroup({ layout: board.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: smp }, { binding: 2, resource: artTex.createView() }, { binding: 3, resource: emiTex.createView() },
          ] });
        }
        dev.queue.copyExternalImageToTexture({ source: el }, { texture: artTex }, [el.width, el.height]);
        AW = net.W; AH = net.H;
        eg.clearRect(0, 0, emi.width, emi.height); dirty = [0, 0, emi.width, emi.height];
      };

      let W = 0, H = 0, scale = 1, gScale = 1;
      const fit = () => {
        W = window.innerWidth; H = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        gScale = dpr;
        cv.width = Math.max(1, Math.round(W * dpr * scale * 0.8)); cv.height = Math.max(1, Math.round(H * dpr * scale * 0.8));
        gv.width = Math.max(1, Math.round(W * gScale)); gv.height = Math.max(1, Math.round(H * gScale));
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
        // inclinazione attorno all'asse x, poi una piccola rotazione attorno alla verticale della scheda
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

      // card visibili: si rilegge l'elenco ogni tanto, le posizioni a ogni frame
      let els: HTMLElement[] = [];
      const radius = new WeakMap<Element, number>();
      const scan = () => {
        els = Array.from(document.querySelectorAll<HTMLElement>(".shell-main .pn, .shell-main .card"))
          .filter((el) => !el.parentElement?.closest(".pn, .card"));
      };
      scan();
      const scanT = window.setInterval(scan, 500);

      const ph = orbPhases(), colors = want.current.map((c) => c.slice());
      const att: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" };
      const gAtt: GPURenderPassColorAttachment = { view: null as unknown as GPUTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" };
      const heads = new Float32Array(MAXH * 4), tmp = [0, 0];
      let dirty: number[] | null = null, t = 0, last = 0, slow = 0, quick = 0;
      const draw = (now: number) => {
        const cfg = gr.current, raw = Math.min(0.1, last ? (now - last) / 1000 : 0), dt = raw * (cfg.spd || 1);
        // risoluzione adattiva: se i frame arrivano lenti per un secondo si scende del 15%, se restano rapidi si risale
        if (last) { if (now - last > 24) slow++; else { slow = Math.max(0, slow - 1); quick++; } }
        if (slow > 40 && scale > 0.5) { scale = Math.max(0.5, scale * 0.85); slow = 0; quick = 0; fit(); }
        if (quick > 600 && scale < 1) { scale = Math.min(1, scale * 1.1); quick = 0; fit(); }
        last = now; t += dt;
        upload();
        if (!bind || !emiTex) return;
        const mix = 1 - Math.exp(-raw * 2.2);
        colors.forEach((c, i) => c.forEach((v, j) => { c[j] = v + (want.current[i][j] - v) * mix; }));
        sx += (mx - sx) * Math.min(1, raw * 2.5); sy += (my - sy) * Math.min(1, raw * 2.5);
        const T = aim();
        // la parte di scheda inquadrata: lì nascono gli impulsi
        const top = toBoard(W / 2, 0), bot = toBoard(W / 2, H);
        if (dirty) eg.clearRect(dirty[0] - 2, dirty[1] - 2, dirty[2] - dirty[0] + 4, dirty[3] - dirty[1] + 4);
        const prev = dirty;
        dirty = cur.frame(eg, now, { pulses: !!cfg.pulses, dens: Math.round((cfg.dens || 14) * 1.4), spd: cfg.spd || 1 }, { sx: 0.5, sy: 0.5, oy: 0, vw: emi.width, vh: emi.height, y0: top ? top[1] : 0, y1: bot ? bot[1] : AH });
        const up = prev && dirty ? [Math.min(prev[0], dirty[0]), Math.min(prev[1], dirty[1]), Math.max(prev[2], dirty[2]), Math.max(prev[3], dirty[3])] : prev || dirty;
        if (up) {
          const x0 = Math.max(0, Math.floor(up[0] - 3)), y0 = Math.max(0, Math.floor(up[1] - 3)), x1 = Math.min(emi.width, Math.ceil(up[2] + 3)), y1 = Math.min(emi.height, Math.ceil(up[3] + 3));
          if (x1 > x0 && y1 > y0) dev.queue.copyExternalImageToTexture({ source: emi, origin: { x: x0, y: y0 } }, { texture: emiTex, origin: { x: x0, y: y0 } }, [x1 - x0, y1 - y0]);
        }

        // cariche sospese sopra la scheda, attorno al punto inquadrato
        const on = !!cfg.aurora, I = cfg.auroraI ?? 1;
        ORB.forEach((o, i) => {
          const [fx, fy] = orbAt(i, t, ph);
          const p = [T[0] + (fx - 0.5) * W * 1.05, T[1] + (fy - 0.55) * H * 1.1, 120 + 40 * Math.sin(t * 0.21 + i * 1.7)];
          data.set([...p, o.q], BU.orbs + i * 4); fData.set([...p, o.q], FU.q + i * 4);
          const s = project(p, tmp);
          data.set(s ? [s[0], s[1], 0, o.q] : [-9999, -9999, 0, o.q], BU.orbS + i * 4);
        });
        const nh = cfg.pulses ? cur.lights(heads, MAXH) : 0;
        for (let k = 0; k < nh; k++) {
          data.set(heads.subarray(k * 4, k * 4 + 4), BU.heads + k * 4);
          const s = project([heads[k * 4], heads[k * 4 + 1], 4], tmp);
          data.set(s ? [s[0], s[1], heads[k * 4 + 2], heads[k * 4 + 3]] : [-9999, -9999, 0, 0], BU.headS + k * 4);
        }
        // le card più grandi fra quelle a schermo
        const rects: number[][] = [];
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width < 60 || r.height < 40 || r.bottom < -60 || r.top > H + 60 || r.right < 0 || r.left > W) continue;
          let rad = radius.get(el); if (rad === undefined) { rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 16; radius.set(el, rad); }
          rects.push([r.left, r.top, r.width, r.height, rad]);
        }
        rects.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
        const nc = Math.min(MAXC, rects.length);
        for (let c = 0; c < nc; c++) { data.set(rects[c].slice(0, 4), BU.cards + c * 4); data[BU.cardR + c * 4] = rects[c][4]; }

        data.set([...cam.eye, cam.D], BU.eye); data.set([...cam.right, W / H], BU.right); data.set([...cam.up, 0], BU.up); data.set([...cam.fwd, tanH], BU.fwd);
        data.set([cv.width, cv.height, W, H], BU.res);
        data.set([AW, AH, cfg.art ? Math.min(1.6, cfg.artI ?? 1) : 0, dark ? 1 : 0], BU.art);
        data.set([t, I, nh, nc], BU.misc); data.set([gScale, on ? 1 : 0, cfg.pulses ? 1 : 0, 0], BU.misc2);
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
        fData.set([dt, t, 1, dark ? 1 : 0], FU.misc);
        fData.set([cv.width, cv.height, 1.4 * scale, I * (dark ? 0.85 : 0.7)], FU.res);
        fData.set([260, cam.D, 1, 0.3], FU.aux);
        dev.queue.writeBuffer(fUni, 0, fData);

        const enc = dev.createCommandEncoder();
        if (on) parts.trace(enc);
        att.view = ctx.getCurrentTexture().createView();
        const pass = enc.beginRenderPass({ colorAttachments: [att] });
        pass.setPipeline(board); pass.setBindGroup(0, bind); pass.draw(3);
        if (on) parts.draw(pass);
        pass.end();
        gAtt.view = gtx.getCurrentTexture().createView();
        const gp = enc.beginRenderPass({ colorAttachments: [gAtt] });
        if (nc) { gp.setPipeline(glass); gp.setBindGroup(0, glassBind); gp.draw(6, nc); }
        gp.end();
        dev.queue.submit([enc.finish()]);
      };
      const halt = renderLoop(draw, () => 60, undefined, () => { last = performance.now(); });
      stop = () => {
        halt(); window.clearInterval(scanT);
        window.removeEventListener("resize", fit); window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down);
        parts.destroy(); uni.destroy(); fUni.destroy(); artTex?.destroy(); emiTex?.destroy(); ctx.unconfigure(); gtx.unconfigure();
      };
    });
    return () => { off = true; stop(); };
  }, [dark]);
  return (<>
    <canvas ref={bgRef} className="bd-3d" aria-hidden="true" />
    <canvas ref={glRef} className="bd-glass" aria-hidden="true" />
  </>);
};
export default Backdrop3D;
