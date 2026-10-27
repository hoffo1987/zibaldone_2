import { signalSize, Segnale } from './scintilleGpu';

test.each([1, 2, 3])('long mobile writings use a viewport-sized backing store at DPR %s', dpr => {
  const size = signalSize(390, 100000, 700, dpr);
  expect(size.height).toBe(1084);
  expect(size.width * size.pixelsHigh).toBeLessThanOrEqual(4e6);
  expect(size.width).toBeLessThanOrEqual(8192);
  expect(size.pixelsHigh).toBeLessThanOrEqual(8192);
});

test('even extreme dimensions respect the GPU limit, without a minimum scale overriding it', () => {
  const s = signalSize(30000, 100000, 20000, 3, 4096);
  expect(s.width).toBeLessThanOrEqual(4096);
  expect(s.pixelsHigh).toBeLessThanOrEqual(4096);
  expect(s.width * s.pixelsHigh).toBeLessThanOrEqual(4e6);
});

test('scrolling draws only intersecting lines, preserving their position along the phrase, then sleeps', () => {
  global.GPUBufferUsage = { UNIFORM: 1, COPY_DST: 2, STORAGE: 4 };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { getPreferredCanvasFormat: () => 'bgra8unorm' } });
  const pass = { setPipeline() {}, setBindGroup() {}, draw: jest.fn(), end() {} };
  const context = { configure() {}, unconfigure() {}, getCurrentTexture: () => ({ createView() {} }) };
  const dev = { limits: { maxTextureDimension2D: 8192 },
    createBuffer: () => ({ destroy() {} }), createShaderModule() {}, createRenderPipeline: () => ({ getBindGroupLayout() {} }), createBindGroup() {},
    createCommandEncoder: () => ({ beginRenderPass: () => pass, finish() {} }), queue: { writeBuffer() {}, submit: jest.fn() } };
  const c = document.createElement('canvas'); c.getContext = () => context;
  const paper = { clientWidth: 700, clientHeight: 100000 };
  const clock = jest.spyOn(performance, 'now').mockReturnValue(100);
  const e = new Segnale(dev, c, paper); e.fit(600);
  e.set([{ key: 'phrase', canali: [{ tipo: 'bellissima', n: 1 }], focus: false, boxes: [{ x: 20, y: 20, w: 100, h: 20 }, { x: 20, y: 5000, w: 150, h: 20 }] }]);
  e.draw(100); expect(pass.draw).toHaveBeenLastCalledWith(6, 1);
  e.viewport(5000); e.draw(120);
  expect(pass.draw).toHaveBeenLastCalledWith(6, 1);
  expect(e.ld[1]).toBe(192); expect(e.ld[4]).toBe(100);
  expect(c.height).toBe(984); expect(c.style.transform).toBe('translateY(4808px)');
  for (let now = 400; now < 10000; now += 250) e.draw(now);
  expect(e.fps()).toBe(0);
  const submits = dev.queue.submit.mock.calls.length; e.draw(20000);
  expect(dev.queue.submit).toHaveBeenCalledTimes(submits);
  e.destroy(); clock.mockRestore(); delete global.GPUBufferUsage; delete navigator.gpu;
});
