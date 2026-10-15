// Vendor the exact WOFF2 resources from the existing Google Fonts stylesheets, including every Unicode subset.
// Run intentionally when updating fonts; ordinary builds use the committed files and need no font CDN.
const fs = require('fs/promises'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'public', 'fonts');
const sources = [
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@600&text=Il%20Circuito&display=swap',
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Instrument+Sans:wght@400;500;600&display=swap',
];
const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
async function get(url) { const r = await fetch(url, { headers: { 'User-Agent': agent } }); if (!r.ok) throw Error(`${r.status} ${url}`); return r; }
(async () => {
  await fs.mkdir(out, { recursive: true });
  const files = new Map(), manifest = [];
  let css = '/* Same Google Fonts faces, weights and Unicode ranges, served locally. See OFL licenses in this directory. */\n';
  for (const source of sources) {
    const original = await (await get(source)).text();
    const blocks = original.match(/(?:\/\*[^*]*\*\/\s*)?@font-face\s*\{[^}]+\}/g) || [];
    if (!blocks.length) throw Error(`No fonts in ${source}`);
    for (let block of blocks) {
      const url = block.match(/url\(([^)]+)\)/)?.[1], family = block.match(/font-family:\s*'([^']+)'/)?.[1];
      if (!url || !family || !block.includes("format('woff2')")) throw Error('Expected a WOFF2 font');
      let file = files.get(url);
      if (!file) {
        const subset = block.match(/\/\*\s*([^*]+?)\s*\*\//)?.[1] || 'logo';
        const weight = block.match(/font-weight:\s*([^;]+);/)[1].trim().replaceAll(' ', '-');
        file = `${family.toLowerCase().replaceAll(' ', '-')}-${subset}-${weight}.woff2`;
        const data = Buffer.from(await (await get(url)).arrayBuffer());
        await fs.writeFile(path.join(out, file), data); files.set(url, file);
        manifest.push({ file, source: url, sha256: crypto.createHash('sha256').update(data).digest('hex'), bytes: data.length });
      }
      css += block.replace(url, `./${file}`) + '\n';
    }
  }
  for (const family of ['unbounded', 'bricolagegrotesque', 'instrumentsans']) {
    const text = await (await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`)).text();
    await fs.writeFile(path.join(out, `${family}-OFL.txt`), text);
  }
  await fs.writeFile(path.join(out, 'fonts.css'), css);
  await fs.writeFile(path.join(out, 'sources.json'), JSON.stringify({ stylesheets: sources, fonts: manifest }, null, 2) + '\n');
  console.log(`Vendored ${files.size} unchanged WOFF2 files (${manifest.reduce((n, f) => n + f.bytes, 0)} bytes).`);
})().catch(e => { console.error(e); process.exitCode = 1; });
