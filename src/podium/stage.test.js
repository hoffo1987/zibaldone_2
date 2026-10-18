import { WINDOW, ROOM, STEP_X, STEP_TOP, STEP_D, TROPHY_TOP, CARPET, LIGHT_PLANE, LIGHT_DEPTH, Mat, camera, project, viewProj, celestial, lightMatrix, moodAt, DAY, NIGHT } from "./stage";
import { texgenShader, mipShader, cloudShader, shadowShader, giShader, sceneShader, volShader, postShader, combineMSShader, podiumQuality, GI_PROBES } from "./shaders";
import { buildScene, VERTEX_FLOATS } from "./meshes";
import { decodeDrape, encodeDrape, drape, podiumShapes, TELO } from "./cloth";
import { tierFor, capTier } from "./device";

// dentro il vano del finestrone (rettangolo con l'arco in cima), lontano dal telaio
const inWindow = (x, y) => (y > WINDOW.ya ? Math.hypot(x, y - WINDOW.ya) < WINDOW.r - WINDOW.frame : Math.abs(x) < WINDOW.r - WINDOW.frame && y > WINDOW.y0 + WINDOW.frame);
const toWindow = (p, L) => { const k = (ROOM.back - p[2]) / L[2]; return [p[0] + L[0] * k, p[1] + L[1] * k]; };

test("sun and moon are always visible through the arched window and light the trophies and the carpet", () => {
  const cam = camera(1440, 900, 240, 230);
  for (const night of [false, true]) {
    for (let t = 0; t < 900; t += 4.3) {
      const L = celestial(t, night);
      expect(Math.hypot(...L)).toBeCloseTo(1, 6);
      expect(L[2]).toBeLessThan(0);
      expect(L[1]).toBeGreaterThan(0.25); // dall'alto
      expect(inWindow(...toWindow(cam.pos, L))).toBe(true); // l'astro si vede nel vetro
      STEP_X.forEach((x, i) => expect(inWindow(...toWindow([x, TROPHY_TOP[i], -0.15], L))).toBe(true));
      expect(inWindow(...toWindow([0, 0, CARPET.z0 + 2], L))).toBe(true); // i fasci arrivano sul tappeto
    }
  }
});

test("the camera frames the podium inside the free area of the page, on desktop and on phones", () => {
  for (const [w, h, left, top] of [[1440, 900, 240, 230], [1920, 1080, 240, 230], [390, 844, 0, 150]]) {
    const c = camera(w, h, left, top);
    STEP_X.forEach((x, i) => {
      for (const sx of [-1.1, 1.1]) {
        const p = project(c, [x + sx, 0.36, STEP_D]);
        expect(p.x).toBeGreaterThan(left); expect(p.x).toBeLessThan(w);
        expect(p.y).toBeGreaterThan(top); expect(p.y).toBeLessThan(h);
      }
      expect(project(c, [x, TROPHY_TOP[i] + 0.22, -0.15]).y).toBeGreaterThan(top);
    });
    const tops = STEP_X.map((x, i) => project(c, [x, STEP_TOP[i], STEP_D]));
    expect(tops[0].y).toBeLessThan(tops[1].y); expect(tops[1].y).toBeLessThan(tops[2].y);
    expect(Math.abs(tops[0].x - (left + (w - left) / 2))).toBeLessThan(2); // al centro dell'area dei contenuti
  }
});

test("day and night blend smoothly and the shaders embed the scene", () => {
  expect(moodAt(0).sunI).toBeCloseTo(DAY.sunI, 9); expect(moodAt(1).sunI).toBeCloseTo(NIGHT.sunI, 9);
  expect(moodAt(0.5).sun[2]).toBeCloseTo((DAY.sun[2] + NIGHT.sun[2]) / 2, 6);
  for (const q of [podiumQuality("low", true), podiumQuality("medium"), podiumQuality("high"), podiumQuality("ultra")]) {
    const all = [texgenShader, mipShader("rgba8unorm", false), mipShader("rgba16float", true), cloudShader, shadowShader, giShader(q), sceneShader(q), volShader(q), postShader, combineMSShader];
    for (const src of all) expect(src).not.toMatch(/NaN|undefined|Infinity|\$\{/);
    for (const src of [giShader(q), sceneShader(q), volShader(q)]) expect(src).toContain("fn sunLight(");
    // le sonde si aggiornano a turno, ognuna con raggi fissi: nessun numero casuale nel calcolo
    expect(giShader(q)).toContain(`slot * ${q.giPeriod}u`);
    expect(giShader(q)).toContain(`${GI_PROBES}u`);
    const body = giShader(q).slice(giShader(q).indexOf("fn gi("));
    expect(body).not.toMatch(/ign\(|hash2\(|tileB\.w|tileA\.w/);
  }
  for (const e of ["vsScene", "fsScene", "vsSky", "fsSky", "vsDust", "fsDust"]) expect(sceneShader(podiumQuality("high"))).toContain(`fn ${e}(`);
  for (const e of ["fsCombine", "fsDown", "fsUp", "fsTone", "fsFinal"]) expect(postShader).toContain(`fn ${e}(`);
  expect(combineMSShader).toContain("fn fsCombineMS(");
});

test("no pixel turns NaN in the shading, and none could reach the bloom (where it became a black square)", () => {
  for (const q of [podiumQuality("low", true), podiumQuality("ultra")]) {
    const scene = sceneShader(q);
    // MSAA: the fragment of a partly covered pixel is computed inside the triangle, never extrapolated past an edge-on one
    for (const v of ["wp: vec3f", "n: vec3f", "uv: vec2f", "ao: f32"]) expect(scene).toContain(`@interpolate(perspective, centroid) ${v}`);
    // no power of a base that rounding can push below zero (1 - n·v)
    expect(scene).not.toMatch(/pow\(1\.0 - /);
    expect(scene).toContain("finite3(shade("); expect(scene).toContain("finite3(sky(");
    expect(giShader(q)).toContain("finite3(acc[0]");
    expect(volShader(q)).toContain("finite3(mix(prev.rgb");
  }
  expect(postShader.slice(postShader.indexOf("fn fsCombine("), postShader.indexOf("fn fsDown("))).toContain("finite3(");
  expect(combineMSShader).toContain("finite3(textureLoad(msTex");
});

test("the light map follows the light from the window plane, and the camera matrix agrees with the projection", () => {
  const mul = (m, p) => [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  for (const night of [false, true]) {
    const L = celestial(37, night), m = lightMatrix(L);
    for (const p of [[0, 0, 4], [-2.35, 1.4, 0], [3, 6, -7.2], [0, 11, 15]]) {
      const c = mul(m, p), k = (LIGHT_PLANE - p[2]) / L[2];
      const q = [p[0] + L[0] * k, p[1] + L[1] * k], back = mul(m, [q[0], q[1], LIGHT_PLANE]);
      // stesso punto sul piano del vetro, risalendo lungo la luce; la profondità cresce con la distanza percorsa
      expect(c[0]).toBeCloseTo(back[0], 5); expect(c[1]).toBeCloseTo(back[1], 5); expect(c[3]).toBeCloseTo(1, 9);
      expect(c[2]).toBeCloseTo(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - LIGHT_PLANE) / LIGHT_DEPTH, 5);
      expect(c[2]).toBeGreaterThan(0); expect(c[2]).toBeLessThan(1);
    }
  }
  const cam = camera(1440, 900, 240, 230, { x: 0.3, y: -0.1, z: -0.5, yaw: 0.2 }), vp = viewProj(cam);
  for (const p of [[0, 1.9, 0.9], [-2.35, 0.36, 0.92], [6, 10.6, -4.9]]) {
    const c = mul(vp, p), s = project(cam, p);
    expect(((c[0] / c[3]) * 0.5 + 0.5) * 1440).toBeCloseTo(s.x, 2);
    expect((0.5 - (c[1] / c[3]) * 0.5) * 900).toBeCloseTo(s.y, 2);
    expect(c[2] / c[3]).toBeGreaterThan(0); expect(c[2] / c[3]).toBeLessThan(1);
  }
});

// the baked cloth over the podium (public/podium/telo.bin)
const fs = require("fs"), path = require("path");
const telo = () => { const b = fs.readFileSync(path.join(__dirname, "../../public/podium/telo.bin")); return decodeDrape(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };

test("the hall is built from clean meshes: finite vertices, valid indices, outward winding, known materials", () => {
  const mats = new Set(Object.values(Mat));
  for (const [mobile, site] of [[false, null], [true, null], [false, { cloth: telo() }], [true, { cloth: telo() }]]) {
    const { vertices, indices, ranges } = buildScene(mobile, site);
    const n = vertices.length / VERTEX_FLOATS;
    expect(Number.isInteger(n)).toBe(true);
    expect(indices.length % 3).toBe(0);
    expect(vertices.every(Number.isFinite)).toBe(true);
    let maxI = 0; for (const i of indices) maxI = Math.max(maxI, i);
    expect(maxI).toBeLessThan(n);
    const wrong = { normal: 0, material: 0, ao: 0, below: 0 };
    for (let v = 0; v < n; v++) {
      const o = v * VERTEX_FLOATS;
      if (Math.abs(Math.hypot(vertices[o + 3], vertices[o + 4], vertices[o + 5]) - 1) > 1e-3) wrong.normal++;
      if (!mats.has(vertices[o + 8])) wrong.material++;
      if (!(vertices[o + 9] > 0 && vertices[o + 9] <= 1)) wrong.ao++;
      if (vertices[o + 1] < -1e-6) wrong.below++; // nulla sotto il pavimento (il riflesso planare lo presuppone)
    }
    expect([mobile, !!site, wrong]).toEqual([mobile, !!site, { normal: 0, material: 0, ao: 0, below: 0 }]);
    // i gruppi coprono tutti i triangoli, in ordine, e il pavimento è il primo (escluso dal riflesso)
    const list = Object.values(ranges); let next = 0;
    for (const [first, count] of list) { expect(first).toBe(next); next += count; }
    expect(next).toBe(indices.length);
    expect(ranges.floor[0]).toBe(0);
    // covered: the cloth and the works take the place of the trophies
    for (const k of ["room", "window", "columns", "podium", "banners", ...(site ? ["cloth", "site"] : ["trophies"])]) expect(ranges[k][1]).toBeGreaterThan(0);
    if (site) expect(ranges.trophies).toBeUndefined();
    // avvolgimento antiorario visto dal lato della normale (scarto delle facce posteriori)
    let bad = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const P = (i) => [vertices[i * VERTEX_FLOATS], vertices[i * VERTEX_FLOATS + 1], vertices[i * VERTEX_FLOATS + 2]];
      const [a, b, c] = [P(indices[t]), P(indices[t + 1]), P(indices[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const nn = [0, 1, 2].map((k) => vertices[indices[t] * VERTEX_FLOATS + 3 + k] + vertices[indices[t + 1] * VERTEX_FLOATS + 3 + k] + vertices[indices[t + 2] * VERTEX_FLOATS + 3 + k]);
      if (g[0] * nn[0] + g[1] * nn[1] + g[2] * nn[2] < 0) bad++;
    }
    expect(bad).toBe(0);
    if (!mobile) expect(n).toBeLessThan(site ? 450000 : 400000);
  }
});

test("the GPU tier follows the measured power, phones stay at most medium, and quality grows with the tier", () => {
  expect([300, 1500, 4000, 12000].map(tierFor)).toEqual(["low", "medium", "high", "ultra"]);
  expect(capTier("ultra", true)).toBe("medium"); expect(capTier("ultra", false)).toBe("ultra"); expect(capTier("low", true)).toBe("low");
  const order = ["low", "medium", "high", "ultra"].map((t) => podiumQuality(t));
  for (let i = 1; i < order.length; i++) {
    expect(order[i].shadow[0]).toBeGreaterThanOrEqual(order[i - 1].shadow[0]);
    expect(order[i].maxPixels).toBeGreaterThan(order[i - 1].maxPixels);
    expect(order[i].giPeriod).toBeLessThanOrEqual(order[i - 1].giPeriod);
    expect(order[i].minScale).toBeGreaterThanOrEqual(order[i - 1].minScale);
  }
  // the scene never drops below its tier's floor, and every tier can reach the screen's own pixels
  for (const q of order) { expect(q.minScale).toBeLessThan(1); expect(q.maxScale).toBeGreaterThanOrEqual(1); }
  expect(podiumQuality("low").mobile).toBe(true); expect(podiumQuality("ultra").mobile).toBe(false);
});

test("while the camera breathes and turns, the podium stays in the free area of the page", () => {
  for (const m of [{ x: 0.45 + 0.6, y: 0.44, z: -0.7, yaw: 0.42 + 0.035 }, { x: -1.05, y: -0.44, z: 0, yaw: -0.455 }]) {
    const c = camera(1440, 900, 240, 230, m);
    STEP_X.forEach((x) => {
      for (const sx of [-1.1, 1.1]) {
        const p = project(c, [x + sx, 0.36, STEP_D]);
        expect(p.x).toBeGreaterThan(240); expect(p.x).toBeLessThan(1440); expect(p.y).toBeGreaterThan(230); expect(p.y).toBeLessThan(900);
      }
    });
  }
});

test("the cloth covers the whole podium without passing through it, and the bake is repeatable", () => {
  const d = telo();
  expect(d.nx * d.nz).toBeGreaterThan(10000);
  expect(d.spacing).toBeCloseTo(TELO.spacing, 6);
  // every point of the three step tops has cloth above it (towards the highest step the cloth bridges the drop)
  STEP_X.forEach((x, i) => {
    for (let u = -0.9; u <= 0.9; u += 0.3) for (let w = -0.75; w <= 0.75; w += 0.25) {
      let above = -1;
      for (let p = 0; p < d.nx * d.nz; p++) if (Math.abs(d.pos[p * 3] - x - u) < 0.08 && Math.abs(d.pos[p * 3 + 2] - w) < 0.08) above = Math.max(above, d.pos[p * 3 + 1]);
      expect(above).toBeGreaterThan(STEP_TOP[i]);
      // resting on the middle of the highest step and on the outer half of the lower ones
      const rests = i === 0 ? Math.abs(u) < 0.4 : u * x > 0 && Math.abs(u) >= 0.3;
      expect(above).toBeLessThan(rests ? STEP_TOP[i] + 0.12 : STEP_TOP[0] + 0.12);
    }
  });
  // no point of the cloth inside the steps, the dais or the floor
  const shapes = podiumShapes(), hit = { d: 0, gx: 0, gy: 0, gz: 0 };
  let inside = 0;
  for (let p = 0; p < d.nx * d.nz; p++) {
    const [x, y, z] = [d.pos[p * 3], d.pos[p * 3 + 1], d.pos[p * 3 + 2]];
    if (y < 0.005) inside++;
    for (const sh of shapes) { sh.dist(x, y, z, hit); if (hit.d < 0.005) { inside++; break; } }
  }
  expect(inside).toBe(0);
  // the file keeps the positions to a tenth of a millimetre or better
  const again = decodeDrape(encodeDrape(d));
  let err = 0; for (let k = 0; k < d.pos.length; k++) err = Math.max(err, Math.abs(again.pos[k] - d.pos[k]));
  expect(err).toBeLessThan(1e-4);
  // a quick small throw: same input, same cloth (the bake is deterministic), and it comes to rest on the podium
  const small = { ...TELO, spacing: 0.3, seconds: 1.5 };
  const a = drape(small), b = drape(small);
  expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
  expect(Math.max(...Array.from(a.pos).filter((_, k) => k % 3 === 1))).toBeLessThan(STEP_TOP[0] + 0.2);
});

test("temporal antialiasing: the jitter stays inside the pixel and moves the image by exactly that much", () => {
  const { JITTER, jittered, invert4 } = require("./stage");
  expect(JITTER).toHaveLength(8);
  for (const [x, y] of JITTER) { expect(Math.abs(x)).toBeLessThan(0.5); expect(Math.abs(y)).toBeLessThan(0.5); }
  expect(JITTER.reduce((s, [x]) => s + x, 0) / 8).toBeCloseTo(0, 6); expect(JITTER.reduce((s, [, y]) => s + y, 0) / 8).toBeCloseTo(0, 6);
  const c = camera(1200, 800, 200, 100), vp = viewProj(c), vpj = jittered(vp, 0.25, -0.4, 1200, 800);
  const clip = (m, p) => [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
  const px = (m, p) => { const k = clip(m, p); return [(k[0] / k[3] * 0.5 + 0.5) * 1200, (0.5 - k[1] / k[3] * 0.5) * 800]; };
  const a = px(vp, [0.3, 2.1, -1]), b = px(vpj, [0.3, 2.1, -1]);
  expect(b[0] - a[0]).toBeCloseTo(0.25, 3); expect(b[1] - a[1]).toBeCloseTo(-0.4, 3);
  // the inverse brings a pixel's depth back to the world point
  const k = clip(vpj, [1.5, 3.0, -2.0]), inv = invert4(vpj), ndc = [k[0] / k[3], k[1] / k[3], k[2] / k[3], 1];
  const w = clip(inv, ndc);
  expect(w[0] / w[3]).toBeCloseTo(1.5, 3); expect(w[1] / w[3]).toBeCloseTo(3.0, 3); expect(w[2] / w[3]).toBeCloseTo(-2.0, 3);
});

test("the refined cloth passes through every simulated point and keeps its size", () => {
  const { refineDrape } = require("./cloth");
  const nx = 6, nz = 5, pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) pos.set([i * 0.1, Math.sin(i) * 0.05 + j * 0.02, j * 0.1], (j * nx + i) * 3);
  const d = refineDrape({ nx, nz, spacing: 0.1, pos }, 2);
  expect([d.nx, d.nz, d.spacing]).toEqual([11, 9, 0.05]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) for (let c = 0; c < 3; c++) expect(d.pos[(j * 2 * d.nx + i * 2) * 3 + c]).toBeCloseTo(pos[(j * nx + i) * 3 + c], 5);
  // in between: on the curve, not on the chord (Catmull-Rom), and still inside the cloth
  expect(d.pos[(0 * d.nx + 3) * 3]).toBeCloseTo(0.15, 5);
});
