import { netBuilder, pointAt, stretch, nearest } from "./current";

// una pista a L: 100 a destra, poi 50 in giù
const lNet = () => {
  const pen = netBuilder(400, 400);
  const a = pen.node(0, 0, "pad"), b = pen.node(100, 50, "pad");
  pen.trace([[0, 0], [100, 0], [100, 50]], { a, b });
  return pen.net;
};

test("measures traces and links their end nodes", () => {
  const net = lNet(), t = net.traces[0];
  expect(t.L).toBe(150);
  expect(net.nodes[t.a].links).toEqual([0]);
  expect(net.nodes[t.b].links).toEqual([0]);
});

test("nodes at the same point are shared, so current can hop between traces", () => {
  const pen = netBuilder(400, 400);
  const chip = pen.node(10, 10, "chip", 3, [0, 0, 40, 30]);
  pen.trace([[10, 10], [60, 10]], { a: chip, b: pen.node(60, 10, "pad") });
  pen.trace([[10, 10], [10, 80]], { a: pen.node(10.2, 9.8, "pad"), b: pen.node(10, 80, "pad") });
  expect(pen.net.nodes[chip].kind).toBe("chip");
  expect(pen.net.nodes[chip].links).toEqual([0, 1]);
});

test("pointAt follows the corners and clamps open traces", () => {
  const t = lNet().traces[0];
  expect(pointAt(t, 50)).toEqual([50, 0]);
  expect(pointAt(t, 125)).toEqual([100, 25]);
  expect(pointAt(t, 999)).toEqual([100, 50]);
  expect(pointAt(t, -5)).toEqual([0, 0]);
});

test("stretch keeps the corner in both directions", () => {
  const t = lNet().traces[0], out = [];
  expect(stretch(t, 80, 120, out)).toEqual([[80, 0], [100, 0], [100, 20]]);
  expect(stretch(t, 120, 80, out)).toEqual([[100, 20], [100, 0], [80, 0]]);
  expect(stretch(t, 10, 40, out)).toEqual([[10, 0], [40, 0]]);
});

test("closed traces wrap around their start", () => {
  const pen = netBuilder(400, 400);
  pen.trace([[0, 0], [10, 0], [10, 10], [0, 10]], { closed: true });
  const t = pen.net.traces[0], out = [];
  expect(t.L).toBe(40);
  expect(pointAt(t, 45)).toEqual([5, 0]);
  expect(stretch(t, 35, 45, out)).toEqual([[0, 5], [0, 0], [5, 0]]);
  expect(stretch(t, 5, -5, out)).toEqual([[5, 0], [0, 0], [0, 5]]);
});

test("nearest finds the trace under a tap within reach", () => {
  const net = lNet();
  expect(nearest(net, 60, 8, 20)).toEqual({ t: 0, s: 60 });
  expect(nearest(net, 300, 300, 20)).toBeNull();
});
