import { snapshotReader } from "./snapshot";

const doc = (id, value) => ({ id, data: jest.fn(() => ({ value })) });
const snapshot = (docs, changes) => ({ docs, docChanges: () => changes.map(([type, doc]) => ({ type, doc })) });
test("a realtime update deserializes only changed documents, retains order, and removes deleted records", () => {
  const a = doc('a', 'old'), b = doc('b', 'unchanged'), update = doc('a', 'new');
  const read = snapshotReader(d => ({ id: d.id, ...d.data() }));
  const initial = read(snapshot([a, b], [['added', a], ['added', b]]));
  const next = read(snapshot([b, update], [['modified', update]]));
  expect(next.map(d => d.id)).toEqual(['b', 'a']);
  expect(next[0]).toBe(initial[1]);
  expect(next[1].value).toBe('new');
  expect(b.data).toHaveBeenCalledTimes(1);
  expect(read(snapshot([b, update], []))).toBe(next);
  expect(read(snapshot([b], [['removed', update]]))).toEqual([initial[1]]);
  // A new query/account owns a new reader; objects never cross subscriptions.
  expect(snapshotReader(d => d.data())(snapshot([], []))).toEqual([]);
});
