import type { SceneMesh, Site } from './meshes';

export function meshInWorker(mobile: boolean, site: Site | null): Promise<SceneMesh> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./meshWorker.ts', import.meta.url));
    const done = () => { clearTimeout(timeout); worker.terminate(); };
    const timeout = setTimeout(() => { done(); reject(new Error('Podium mesh worker timed out')); }, 15000);
    worker.onmessage = (event: MessageEvent<SceneMesh>) => { done(); resolve(event.data); };
    worker.onerror = (event) => { event.preventDefault(); done(); reject(new Error(event.message)); };
    worker.onmessageerror = () => { done(); reject(new Error('Podium mesh transfer failed')); };
    try { worker.postMessage({ mobile, site }); } catch (error) { done(); reject(error); }
  });
}
