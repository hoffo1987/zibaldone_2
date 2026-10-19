// Converts the supplied Sketchfab glTF (Glitchtrap | Help Wanted, by JuztAndy, CC BY-ND 4.0) into the podium's
// formats. Only technical changes for the web: units, vertex packing, texture size and encoding. The mesh, UVs,
// skin weights and skeleton are kept as published; the app poses the skeleton at runtime.
// Usage: node scripts/export-glitchtrap.cjs <folder with scene.gltf, scene.bin, textures/> public/glitchtrap
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node scripts/export-glitchtrap.cjs source public/glitchtrap');
const gltf = JSON.parse(fs.readFileSync(path.join(source, 'scene.gltf'), 'utf8'));
const bin = fs.readFileSync(path.join(source, gltf.buffers[0].uri));

const read = (index) => {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
  const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const size = n * Type.BYTES_PER_ELEMENT, stride = v.byteStride || size, base = bin.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Type(a.count * n);
  for (let k = 0; k < a.count; k++) out.set(new Type(bin.buffer.slice(base + k * stride, base + k * stride + size)), k * n);
  return out;
};
// inverse of a column-major affine 4×4
const invert = (m) => {
  const a = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const cof = (r, c) => {
    const rs = [0, 1, 2].filter((k) => k !== r), cs = [0, 1, 2].filter((k) => k !== c);
    return ((r + c) % 2 ? -1 : 1) * (a[rs[0]][cs[0]] * a[rs[1]][cs[1]] - a[rs[0]][cs[1]] * a[rs[1]][cs[0]]);
  };
  const det = a[0][0] * cof(0, 0) + a[0][1] * cof(0, 1) + a[0][2] * cof(0, 2);
  const inv = [0, 1, 2].map((r) => [0, 1, 2].map((c) => cof(c, r) / det)); // row-major
  const t = [0, 1, 2].map((r) => -(inv[r][0] * m[12] + inv[r][1] * m[13] + inv[r][2] * m[14]));
  return [inv[0][0], inv[1][0], inv[2][0], 0, inv[0][1], inv[1][1], inv[2][1], 0, inv[0][2], inv[1][2], inv[2][2], 0, ...t, 1];
};

const prim = gltf.meshes[0].primitives[0], skin = gltf.skins[0];
// Mesh units: the skeleton's centimetres scaled by 38.336 (Y up, the character faces +Z, its left is +X).
const METRES = 1 / 3833.6;
const P = read(prim.attributes.POSITION), N = read(prim.attributes.NORMAL), UV = read(prim.attributes.TEXCOORD_0);
const J = read(prim.attributes.JOINTS_0), W = read(prim.attributes.WEIGHTS_0), I = read(prim.indices);
const count = P.length / 3;
if (count > 65535) throw new Error('Glitchtrap: too many vertices for 16-bit indices');

// Bind pose of every joint (inverse of its inverse bind matrix): position in metres and parent within the skin.
const ibm = read(skin.inverseBindMatrices);
const parentOf = {};
gltf.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parentOf[c] = i)));
const joints = skin.joints.map((node, k) => {
  const bind = invert(Array.from(ibm.slice(k * 16, k * 16 + 16)));
  return { name: gltf.nodes[node].name.replace(/_\d+$/, ''), parent: skin.joints.indexOf(parentOf[node]), bind: [bind[12], bind[13], bind[14]].map((v) => +(v * METRES).toFixed(5)) };
});

// 40-byte vertices: position, normal (float32), uv (float32), four joint indices (uint8), four weights (unorm8).
const STRIDE = 40;
const vertices = Buffer.alloc(count * STRIDE);
for (let v = 0; v < count; v++) {
  const o = v * STRIDE;
  for (let k = 0; k < 3; k++) vertices.writeFloatLE(P[v * 3 + k] * METRES, o + k * 4);
  const nl = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
  for (let k = 0; k < 3; k++) vertices.writeFloatLE(N[v * 3 + k] / nl, o + 12 + k * 4);
  vertices.writeFloatLE(UV[v * 2], o + 24); vertices.writeFloatLE(UV[v * 2 + 1], o + 28);
  // weights to bytes with the rounding error given to the largest, so every vertex still sums to exactly 255
  const w = [0, 1, 2, 3].map((k) => W[v * 4 + k]), sum = w.reduce((a, b) => a + b, 0) || 1;
  const q = w.map((x) => Math.round((x / sum) * 255));
  q[w.indexOf(Math.max(...w))] += 255 - q.reduce((a, b) => a + b, 0);
  for (let k = 0; k < 4; k++) { vertices.writeUInt8(q[k] ? J[v * 4 + k] : 0, o + 32 + k); vertices.writeUInt8(q[k], o + 36 + k); }
}
const indices = Buffer.from(new Uint16Array(I).buffer);

fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'glitchtrap.bin'), Buffer.concat([vertices, indices]));
fs.writeFileSync(path.join(output, 'glitchtrap.json'), JSON.stringify({ version: 1, vertexCount: count, indexCount: I.length, stride: STRIDE, joints }));
console.log(`Glitchtrap: ${count} vertices, ${I.length / 3} triangles, ${joints.length} joints`);

// Mip chains of lossless WebP, each image preceded by its uint32 length (same container as the room's other models).
const chain = async (name, size, image) => {
  const chunks = [];
  for (let s = size; s >= 1; s >>= 1) {
    const level = await image().resize(s, s, { kernel: 'lanczos3' }).webp({ lossless: true, effort: 6 }).toBuffer();
    const header = Buffer.alloc(4); header.writeUInt32LE(level.length);
    chunks.push(header, level);
  }
  const data = Buffer.concat(chunks);
  fs.writeFileSync(path.join(output, `${name}.bin`), data);
  console.log(`  ${name}.bin ${size}px ${(data.length / 1048576).toFixed(2)} MB`);
};
const tex = (file) => path.join(source, 'textures', file);
(async () => {
  await chain('color', 2048, () => sharp(tex('pskmat0_baseColor.png')).removeAlpha());
  await chain('normal', 2048, () => sharp(tex('pskmat0_normal.png')).removeAlpha());
  // material: roughness (the published single-channel map) in R, the emissive irises' red and blue in G and B
  const [rough, emissive] = await Promise.all([
    sharp(tex('pskmat0_metallicRoughness.png')).extractChannel(0).raw().toBuffer({ resolveWithObject: true }),
    sharp(tex('pskmat0_emissive.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height } = rough.info, packed = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    packed[p * 3] = rough.data[p];
    packed[p * 3 + 1] = emissive.data[p * emissive.info.channels];
    packed[p * 3 + 2] = emissive.data[p * emissive.info.channels + 2];
  }
  await chain('material', 1024, () => sharp(packed, { raw: { width, height, channels: 3 } }));
})().catch((e) => { console.error(e); process.exitCode = 1; });
