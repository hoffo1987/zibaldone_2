// Verify that the live renderer retains every pass and draw while avoiding redundant resource creation/work.
let PodiumView, podiumQuality;
const globals = ['GPUBuffer', 'GPUBufferUsage', 'GPUTextureUsage', 'GPUShaderStage'];
beforeAll(() => {
  global.GPUBuffer = class { constructor(desc) { Object.assign(this, desc); } destroy() {} };
  global.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8, INDEX: 16 };
  global.GPUTextureUsage = { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, STORAGE_BINDING: 4, COPY_DST: 8 };
  global.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  ({ PodiumView, podiumQuality } = require('./engine'));
});
afterAll(() => globals.forEach(k => delete global[k]));

function gpu() {
  const stats = { views: 0, bundles: 0, textures: 0, passes: [] };
  const texture = desc => {
    stats.textures++;
    return { width: Array.isArray(desc.size) ? desc.size[0] : 1, height: Array.isArray(desc.size) ? desc.size[1] : 1,
      mipLevelCount: desc.mipLevelCount || 1, createView: o => { stats.views++; return { texture: desc.label, ...o }; }, destroy() {} };
  };
  const encoder = desc => {
    const record = { label: desc?.label, dispatches: [], commands: [] };
    return { record, setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
      dispatchWorkgroups(...n) { record.dispatches.push(n); },
      draw(...args) { record.commands.push(['draw', ...args]); }, drawIndexed(...args) { record.commands.push(['indexed', ...args]); },
      executeBundles(bundles) { bundles.forEach(b => record.commands.push(...b.commands)); },
      end() {}, finish: () => record };
  };
  const device = {
    queue: { writeBuffer() {}, copyExternalImageToTexture() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: desc => new GPUBuffer(desc), createTexture: texture, createSampler: x => x,
    createBindGroup: desc => desc, createBindGroupLayout: x => x, createPipelineLayout: x => x, createShaderModule: x => x,
    createComputePipelineAsync: jest.fn(async () => ({ getBindGroupLayout: () => ({}) })),
    createRenderPipelineAsync: jest.fn(async () => ({ getBindGroupLayout: () => ({}) })),
    createRenderBundleEncoder(desc) { stats.bundles++; return encoder(desc); },
    createCommandEncoder: () => ({
      beginComputePass(desc) { const e = encoder(desc); stats.passes.push(e.record); return e; },
      beginRenderPass(desc) { const e = encoder(desc); stats.passes.push(e.record); return e; },
      finish() {},
    }), pushErrorScope() {}, popErrorScope: async () => null,
  };
  const canvasTexture = texture({ label: 'canvas', size: [800, 600] });
  const ctx = { configure() {}, unconfigure() {}, getCurrentTexture: () => canvasTexture };
  const gradient = { addColorStop() {} };
  const context2d = new Proxy({}, { get: (_, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => gradient : () => {} });
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(kind => kind === 'webgpu' ? ctx : context2d);
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { getPreferredCanvasFormat: () => 'bgra8unorm' } });
  return { device, stats };
}
afterEach(() => { jest.restoreAllMocks(); delete navigator.gpu; });

test('the secret shares scene passes only while revealed and clears every reflection when hidden', async () => {
  const { device, stats } = gpu();
  const view = new PodiumView(device, document.createElement('canvas'), podiumQuality('low', true));
  await view.ready(); view.resize(800, 600, 1, 1, 0, 0);
  view.render(20, 1); await device.queue.onSubmittedWorkDone();
  const model = { update: jest.fn(), draw: jest.fn(), destroy: jest.fn(), lights: () => ({ lamp: 1, glitch: 0, glow: 1 }), standing: [-4.6, 2.4, -4.2], chest: [-4.6, 2.4, -4.2], spotYaw: 0 };
  view.glitchtrap = model;
  view.render(21, 1); await device.queue.onSubmittedWorkDone();
  expect(model.draw).not.toHaveBeenCalled();
  stats.passes = [];
  view.render(22, 1, undefined, undefined, 0.5, true); await device.queue.onSubmittedWorkDone();
  expect(model.update).toHaveBeenCalledWith(0.5, true, view.camera.pos);
  expect(model.draw.mock.calls.map(args => args[1]).sort()).toEqual([0,1,2,3,4,5,6,7,8,9]);
  for (const [, pass, lighting] of model.draw.mock.calls) {
    if (pass < 8) expect(lighting).toBe(pass === 0 ? view.sized.frameMain : view.groups.frameOff);
  }
  expect(view.secretLight).toBeGreaterThan(0);
  // his lamp: a shadow pass of its own, its light and his glow in the frame uniforms
  expect(stats.passes.some(p => p.label === 'podium-spot')).toBe(true);
  expect(view.frameData[88 + 16 + 3]).toBeGreaterThan(0);
  expect(view.frameData[88 + 28 + 3]).toBeGreaterThan(0);
  model.draw.mockClear(); stats.passes = [];
  view.render(23, 0, undefined, undefined, -1); await device.queue.onSubmittedWorkDone();
  expect(model.draw).not.toHaveBeenCalled();
  expect(view.secretLight).toBe(0);
  expect(view.frameData[88 + 16 + 3]).toBe(0); expect(view.frameData[88 + 28 + 3]).toBe(0);
  expect(stats.passes.some(p => p.label === 'podium-spot')).toBe(false);
  expect(stats.passes.filter(p => p.label === 'podium-env')).toHaveLength(6);
  view.destroy(); expect(model.destroy).toHaveBeenCalledTimes(1);
});

test.each([['low', true], ['high', false]])('keeps the complete %s scene and updates mipmaps only for the changed cube face', async (tier, mobile) => {
  const { device, stats } = gpu(), q = podiumQuality(tier, mobile);
  const view = new PodiumView(device, document.createElement('canvas'), q);
  await view.ready(); view.resize(800, 600, 1, 1, 0, 0);
  view.render(20, 0); await device.queue.onSubmittedWorkDone();
  const initialMain = stats.passes.find(p => p.label === 'podium-main');
  expect(initialMain.commands.filter(c => c[0] === 'indexed').length).toBeGreaterThan(4);
  expect(initialMain.commands.slice(-2)).toEqual([['draw', 3], ['draw', 4, q.dust]]);
  expect(stats.passes.filter(p => p.label === 'podium-env')).toHaveLength(6);
  expect(stats.bundles).toBe(8); // six reflection cameras, floor reflection, main scene
  stats.passes = []; const views = stats.views, textures = stats.textures;
  view.render(20 + 1 / 60, 1); await device.queue.onSubmittedWorkDone();
  expect(stats.passes.filter(p => p.label === 'podium-env')).toHaveLength(1);
  expect(stats.passes.find(p => p.label === 'podium-mips').dispatches).toHaveLength(7 + 5); // cube + floor
  expect(stats.passes.find(p => p.label === 'podium-main').commands).toEqual(initialMain.commands);
  expect(stats.passes.some(p => p.label === 'podium-shadow')).toBe(true);
  expect(stats.passes.some(p => p.label === 'podium-gi')).toBe(true);
  expect(stats.passes.some(p => p.label === 'podium-planar')).toBe(true);
  expect(stats.views - views).toBe(1); // only the swapchain image; all other texture views are reused
  expect(stats.textures).toBe(textures); expect(stats.bundles).toBe(8);
  view.resize(800, 600, 1, 1, 0, 0); expect(stats.bundles).toBe(8);
  view.resize(800, 600, 0.9, 1, 0, 0); expect(stats.bundles).toBe(9);
  view.destroy();
  const pipelines = device.createRenderPipelineAsync.mock.calls.length;
  stats.passes = [];
  const second = new PodiumView(device, document.createElement('canvas'), q);
  await second.ready();
  expect(stats.passes).toHaveLength(0); // procedural materials were already generated for this device
  expect(second.marble).toBe(view.marble); expect(second.fabric).toBe(view.fabric); expect(second.decal).toBe(view.decal);
  expect(device.createRenderPipelineAsync).toHaveBeenCalledTimes(pipelines);
  expect(second.vbuf).toBe(view.vbuf); expect(second.ibuf).toBe(view.ibuf);
  second.destroy();
});

test('the covered podium draws the cloth and the works instead of the trophies, with its own geometry and the site flag', async () => {
  const { device, stats } = gpu(), q = podiumQuality('low', true);
  const pos = new Float32Array(4 * 4 * 3);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pos.set([i * 0.5 - 0.75, 2.0, j * 0.5 - 0.75], (j * 4 + i) * 3);
  const site = { cloth: { nx: 4, nz: 4, spacing: 0.5, pos } };
  const covered = new PodiumView(device, document.createElement('canvas'), q, false, site);
  await covered.ready(); covered.resize(800, 600, 1, 1, 0, 0);
  expect(Object.keys(covered.ranges)).toEqual(expect.arrayContaining(['cloth', 'site']));
  expect(covered.ranges.trophies).toBeUndefined();
  covered.render(20, 0); await device.queue.onSubmittedWorkDone();
  expect(covered.frameData[16 + 13 * 4 + 3]).toBe(1); // frameC.w: the shaders add dust, plaster patches and haze
  const main = stats.passes.find(p => p.label === 'podium-main');
  expect(main.commands.filter(c => c[0] === 'indexed')).toHaveLength(Object.keys(covered.ranges).length);
  const plain = new PodiumView(device, document.createElement('canvas'), q);
  await plain.ready(); plain.resize(800, 600, 1, 1, 0, 0); plain.render(20, 0); await device.queue.onSubmittedWorkDone();
  expect(plain.frameData[16 + 13 * 4 + 3]).toBe(0);
  expect(plain.vbuf).not.toBe(covered.vbuf); // two cached variants of the room
  covered.destroy(); plain.destroy();
});
