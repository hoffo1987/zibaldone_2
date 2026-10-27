import { buildScene, type SceneMesh, type Site } from './meshes';

export async function loadSceneMesh(mobile: boolean, site: Site | null): Promise<SceneMesh> {
  if (typeof Worker !== 'undefined') {
    try {
      const { meshInWorker } = await import('./meshWorkerFactory');
      return await meshInWorker(mobile, site);
    } catch {
      // Older embedded browsers can prohibit workers; retain the complete room there as well.
    }
  }
  return buildScene(mobile, site);
}
