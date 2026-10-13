import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query); if (!media) return;
    const change = () => setMatches(media.matches);
    change();
    if (media.addEventListener) media.addEventListener("change", change); else media.addListener(change);
    return () => { if (media.removeEventListener) media.removeEventListener("change", change); else media.removeListener(change); };
  }, [query]);
  return matches;
}
