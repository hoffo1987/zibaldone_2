// La misura della scheda video per la sala del podio, salvata per una settimana (device.ts la scrive). Sta qui, fuori
// dal modulo della scena, perché le Opzioni possano mostrarla e cancellarla senza scaricare il 3D.
export type Tier = "low" | "medium" | "high" | "ultra";
export const SCORE_KEY = "circuito:podium-gpu";
// soglie sulla potenza misurata (GFLOPS effettivi della prova, non quelli di targa): una scheda integrata recente fa
// 1000-3000, una dedicata di fascia media 5000-9000, le dedicate recenti di fascia alta ben oltre
export const tierFor = (gflops: number): Tier => (gflops >= 7000 ? "ultra" : gflops >= 3000 ? "high" : gflops >= 900 ? "medium" : "low");
export const TIER_LABEL: Record<Tier, string> = { low: "bassa", medium: "media", high: "alta", ultra: "massima" };
// l'ultima misura (null se non c'è o è scaduta)
export function savedScore(): { gflops: number; tier: Tier; at: number } | null {
  try {
    const s = JSON.parse(localStorage.getItem(SCORE_KEY) || "null");
    if (!s || !(s.gflops > 0) || Date.now() - s.at > 7 * 864e5) return null;
    return { gflops: s.gflops, tier: tierFor(s.gflops), at: s.at };
  } catch { return null; }
}
// alla prossima apertura del podio la scheda si rimisura
export function forgetScore() { try { localStorage.removeItem(SCORE_KEY); } catch {} }
