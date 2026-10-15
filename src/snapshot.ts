// One instance per Firestore subscription. Preserve objects for unchanged documents, including large drawings
// and embedded photos. Only docChanges() needs deserializing after the first snapshot.
export function snapshotReader<T>(project: (doc: { id: string; data(): any }) => T) {
  const byId = new Map<string, T>();
  let last: T[] | undefined;
  return (snapshot: { docs: readonly { id: string }[]; docChanges(): readonly { type: string; doc: { id: string; data(): any } }[] }): T[] => {
    const changes = snapshot.docChanges();
    if (last && !changes.length) return last;
    for (const change of changes) {
      if (change.type === "removed") byId.delete(change.doc.id);
      else byId.set(change.doc.id, project(change.doc));
    }
    last = snapshot.docs.map((doc) => byId.get(doc.id)!);
    return last;
  };
}
