import { loadSceneMesh } from './meshLoader';
import { buildScene } from './meshes';
import { meshInWorker } from './meshWorkerFactory';
jest.mock('./meshes', () => ({ buildScene: jest.fn() }));
jest.mock('./meshWorkerFactory', () => ({ meshInWorker: jest.fn() }));

const original = global.Worker;
afterEach(() => { global.Worker = original; jest.clearAllMocks(); });

test('builds the room away from the page and returns the transferred buffers unchanged', async () => {
  global.Worker = class {};
  const mesh = { vertices: new Float32Array([1,2,3]), indices: new Uint32Array([0]), ranges: { floor: [0,1] } }, site = { cloth: {} };
  meshInWorker.mockResolvedValue(mesh);
  expect(await loadSceneMesh(false, site)).toBe(mesh);
  expect(meshInWorker).toHaveBeenCalledWith(false, site);
  expect(buildScene).not.toHaveBeenCalled();
});

test.each(['unsupported','failed'])('retains the full room when workers are %s', async mode => {
  global.Worker = mode === 'unsupported' ? undefined : class {};
  meshInWorker.mockRejectedValue(new Error('Worker unavailable'));
  const mesh = { vertices: new Float32Array(3), indices: new Uint32Array(1), ranges: {} };
  buildScene.mockReturnValue(mesh);
  expect(await loadSceneMesh(true, null)).toBe(mesh);
  expect(buildScene).toHaveBeenCalledWith(true, null);
});
