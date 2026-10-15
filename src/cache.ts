// A bounded LRU for expensive string transformations. Account content cannot accumulate without limit,
// even while editing large documents; keys and values both count towards the UTF-16 character budget.
export function memoText(transform: (input: string) => string, maxChars = 512 * 1024, maxEntries = 128) {
  const entries = new Map<string, string>();
  let chars = 0;
  return (input: string): string => {
    const key = input || "";
    const hit = entries.get(key);
    if (hit !== undefined) { entries.delete(key); entries.set(key, hit); return hit; }
    const value = transform(key), cost = key.length + value.length;
    if (cost <= maxChars) {
      while (entries.size && (chars + cost > maxChars || entries.size >= maxEntries)) {
        const oldest = entries.keys().next().value as string;
        chars -= oldest.length + entries.get(oldest)!.length;
        entries.delete(oldest);
      }
      entries.set(key, value); chars += cost;
    }
    return value;
  };
}
