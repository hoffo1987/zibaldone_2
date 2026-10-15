// Compare identical work against an unmodified checkout, e.g. node scripts/benchmark.cjs ../baseline.
// Timing is informational; exact geometry and shading equality are required and fail the command otherwise.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { performance } = require('perf_hooks'), ts = require('typescript');
require.extensions['.ts'] = (mod, name) => mod._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, name);
const root = path.resolve(__dirname, '..'), baseline = path.resolve(process.argv[2] || '.optimization/baseline');
const load = (dir, file) => require(path.join(dir, 'src', file));
const median = a => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
function measure(fn, n = 7) {
  fn(); const times = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); fn(); times.push(performance.now() - t); }
  return +median(times).toFixed(3);
}
const before = load(baseline, 'podium/meshes.ts'), after = load(root, 'podium/meshes.ts');
for (const mobile of [false, true]) {
  const a = before.buildScene(mobile), b = after.buildScene(mobile);
  assert.deepEqual(b.vertices, a.vertices); assert.deepEqual(b.indices, a.indices); assert.deepEqual(b.ranges, a.ranges);
  console.log(JSON.stringify({ test: 'podium geometry', mobile, vertices: a.vertices.length / 10, triangles: a.indices.length / 3,
    beforeMs: measure(() => before.buildScene(mobile)), afterMs: measure(() => after.buildScene(mobile)), identical: true }));
}
const oldLogo = load(baseline, 'logo2d/render2d.ts'), newLogo = load(root, 'logo2d/render2d.ts');
const norm = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
const samples = Array.from({ length: 4000 }, (_, i) => ({
  mat: { color: [0.2, 0.8, 0.4], metal: (i % 11) / 10, rough: (i % 10) / 10, cc: 0.95, ccRough: 0.1, envI: 0.95 },
  n: norm([Math.sin(i * 0.3), Math.cos(i * 0.2), 0.5]), v: norm([Math.sin(i * 0.4), 0.5, 1]), ao: (i % 100) / 100,
}));
for (const s of samples) assert.deepEqual(newLogo.shade(s.mat, s.n, s.v, [0,0,0], s.ao), oldLogo.shade(s.mat, s.n, s.v, [0,0,0], s.ao));
const shade = logo => () => { const out = [0,0,0]; for (const s of samples) logo.shade(s.mat, s.n, s.v, out, s.ao); };
console.log(JSON.stringify({ test: 'Canvas physical materials', samples: samples.length,
  beforeMs: measure(shade(oldLogo), 21), afterMs: measure(shade(newLogo), 21), identical: true }));
