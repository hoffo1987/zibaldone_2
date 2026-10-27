import { buildScene, type Site, type SceneMesh } from './meshes';

const scope = self as unknown as { onmessage: (event: MessageEvent<{ mobile: boolean; site: Site | null }>) => void; postMessage: (mesh: SceneMesh, buffers: Transferable[]) => void };
scope.onmessage = ({ data }) => {
  const mesh = buildScene(data.mobile, data.site);
  scope.postMessage(mesh, [mesh.vertices.buffer, mesh.indices.buffer]);
};
