import { useEffect, useState } from "react";

// Il focus su un campo non basta a dire che la tastiera è aperta: su Android il tasto Indietro la chiude
// lasciando il cursore nel campo. Si guarda quindi anche lo spazio visibile: la tastiera c'è solo se
// l'area visibile si è ristretta in modo netto rispetto all'altezza piena della pagina.
const GAP = 150;

export function useKeyboardOpen(focused: boolean) {
  const [shrunk, setShrunk] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return;
    // altezza piena per la larghezza corrente (una rotazione la azzera); si misura sempre, anche prima del focus,
    // così vale anche nelle WebView che ridimensionano la pagina insieme alla tastiera
    let width = window.innerWidth, full = 0, raf = 0;
    const check = () => {
      raf = 0;
      if (window.innerWidth !== width) { width = window.innerWidth; full = 0; }
      full = Math.max(full, vv.height, window.innerHeight);
      setShrunk(full - vv.height > GAP);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    vv.addEventListener("resize", on);
    return () => { vv.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);
  // senza visualViewport non si può distinguere: la barra resta visibile
  return focused && shrunk;
}
