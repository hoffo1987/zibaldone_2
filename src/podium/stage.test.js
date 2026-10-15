import { WINDOW, ROOM, STEP_X, STEP_TOP, STEP_D, TROPHY_TOP, CARPET, LIGHT_PLANE, LIGHT_DEPTH, Mat, camera, project, viewProj, celestial, lightMatrix, moodAt, DAY, NIGHT } from "./stage";
import { texgenShader, mipShader, cloudShader, shadowShader, giShader, sceneShader, volShader, postShader, combineMSShader, podiumQuality, GI_PROBES } from "./shaders";
import { buildScene, VERTEX_FLOATS } from "./meshes";
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

test("the hall is built from clean meshes: finite vertices, valid indices, outward winding, known materials", () => {
  const mats = new Set(Object.values(Mat));
  for (const mobile of [false, true]) {
    const { vertices, indices, ranges } = buildScene(mobile);
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
    expect(wrong).toEqual({ normal: 0, material: 0, ao: 0, below: 0 });
    // i gruppi coprono tutti i triangoli, in ordine, e il pavimento è il primo (escluso dal riflesso)
    const list = Object.values(ranges); let next = 0;
    for (const [first, count] of list) { expect(first).toBe(next); next += count; }
    expect(next).toBe(indices.length);
    expect(ranges.floor[0]).toBe(0);
    for (const k of ["room", "window", "columns", "podium", "trophies", "banners"]) expect(ranges[k][1]).toBeGreaterThan(0);
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
    if (!mobile) expect(n).toBeLessThan(400000);
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
