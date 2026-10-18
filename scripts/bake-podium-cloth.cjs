// Simula una volta il telo che copre il podio (src/podium/cloth.ts) e lo salva in public/podium/telo.bin.
// npm run podium:cloth   (qualche decina di secondi; il risultato è sempre lo stesso)
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// i moduli TypeScript della sala, tradotti al volo in CommonJS
require.extensions['.ts'] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename });
  module._compile(out.outputText, filename);
};
const { drape, encodeDrape, TELO } = require('../src/podium/cloth.ts');

const options = { ...TELO, ...JSON.parse(process.env.TELO || '{}') };
const out = process.argv[2] || path.join(__dirname, '..', 'public', 'podium', 'telo.bin');
const t0 = Date.now();
let last = -1;
const result = drape({ ...options, onProgress: (k) => { const p = Math.floor(k * 10); if (p !== last) { last = p; process.stdout.write(`${p * 10}% `); } } });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(encodeDrape(result)));
console.log(`\nTelo ${result.nx}×${result.nz} punti in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${path.relative(process.cwd(), out)}`);
