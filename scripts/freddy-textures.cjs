// Prepare mip chains offline: no resizing/texture processing in the app's render loop.
const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node scripts/freddy-textures.cjs textures output');
(async () => {
  await fs.mkdir(output, { recursive: true });
  for (const [name, original, size] of [['body', 'Body', 2048], ['endo', 'Endoskeleton', 1024], ['eye', 'Eye', 512], ['microphone', 'Microphone', 512]]) {
    for (const [suffix, originalSuffix] of [['color', 'Color'], ['normal', 'Normal']]) {
      const input = path.join(source, `${original}-${originalSuffix}.png`);
      const chunks = [];
      // Lossless WebP encoding; source geometry and all UV seams are preserved.
      for (let level = 0, s = size; s >= 1; level++, s >>= 1) {
        const image = await sharp(input).resize(s, s).webp({ lossless: true, effort: 6 }).toBuffer();
        const header = Buffer.alloc(4); header.writeUInt32LE(image.length);
        chunks.push(header, image);
      }
      await fs.writeFile(path.join(output, `${name}-${suffix}.bin`), Buffer.concat(chunks));
    }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
