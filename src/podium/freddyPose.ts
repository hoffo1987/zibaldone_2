// Shared by the main view, shadows and reflections: the real viewer is always the gaze target.
export function writeFreddyPose(out: Float32Array, seconds: number, reduced: boolean, eye: number[], pivot: number[]) {
  const emerge = Math.min(1, Math.max(0, seconds) / (reduced ? 0.4 : 1.1));
  const e = 1 - (1 - emerge) ** 3;
  const yaw = 0.3, c = Math.cos(yaw), s = Math.sin(yaw);
  const x = -6.85 + 0.7 * e, y = 0, z = -2.8;
  const scale = 1.2;
  out.set([c * scale, 0, -s * scale, 0, 0, scale, 0, 0, s * scale, 0, c * scale, 0, x, y, z, 1]);
  const head = [(c * pivot[0] + s * pivot[2]) * scale + x, pivot[1] * scale + y, (-s * pivot[0] + c * pivot[2]) * scale + z];
  const dx = eye[0] - head[0], dy = eye[1] - head[1], dz = eye[2] - head[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  const f = [(c * dx - s * dz) / length, dy / length, (s * dx + c * dz) / length];
  const rl = Math.hypot(f[0], f[2]) || 1, r = [f[2] / rl, 0, -f[0] / rl];
  const u = [f[1] * r[2], f[2] * r[0] - f[0] * r[2], -f[1] * r[0]];
  out.set([...r, 0, ...u, 0, ...f, 0, 0, 0, 0, 1], 16);
  out.set([reduced ? 0.5 : (0.5 + 0.5 * Math.sin(Math.max(0, seconds - 1) * 2.8)) * e, 0, 0, 0, ...pivot, 0], 32);
}
