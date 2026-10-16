import React, { useEffect, useRef } from "react";
import { Award, Sparkles } from "lucide-react";
const date = (timestamp: number) => new Date(timestamp).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export default function NotificationPanel({ list, onRead, onOpen, stars }: {
  list: any[]; onRead: (ids: string[]) => void; onOpen: () => void; stars: (v: number) => React.ReactNode;
}) {
  const seen = useRef(new Set<string>());
  const fresh = useRef(new Set<string>());
  for (const n of list) if (!n.letta && !seen.current.has(n.id)) fresh.current.add(n.id);
  const unread = list.filter(n => !n.letta && !seen.current.has(n.id)).map(n => n.id).join("|");
  const read = useRef(onRead); read.current = onRead;
  useEffect(() => {
    if (!unread) return;
    const ids = unread.split("|");
    const timer = setTimeout(() => { ids.forEach(id => seen.current.add(id)); read.current(ids); }, 1400);
    return () => clearTimeout(timer);
  }, [unread]);
  if (!list.length) return <p className="mu text-sm">Nessuna notifica per ora. Qui trovi i voti ai tuoi scritti e le novità dell’applicazione.</p>;
  return <div className="space-y-2 max-h-[55dvh] overflow-y-auto" aria-label="Elenco notifiche">
    {list.map(n => n.tipo === "aggiornamento" ? <article key={n.id} aria-label={`Aggiornamento ${n.versione}`} className="rounded-xl p-3 flex gap-3 items-start" style={{ background: fresh.current.has(n.id) ? "color-mix(in srgb,var(--ac) 12%,transparent)" : "var(--sf)", border: "1px solid var(--ln)" }}>
      <Sparkles size={18} style={{ color: "var(--ac)" }} className="shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{n.titolo}</p><p className="mu text-xs mt-1">{n.versione} · {date(n.timestamp)}</p><p className="text-sm mt-2 whitespace-pre-line" style={{ overflowWrap: "anywhere" }}>{n.messaggio}</p></div>
    </article> : <button type="button" key={n.id} onClick={onOpen} className="nv w-full text-left rounded-xl p-3 flex gap-3 items-start" style={{ background: fresh.current.has(n.id) ? "color-mix(in srgb,var(--ac) 12%,transparent)" : "var(--sf)", border: "1px solid var(--ln)" }}>
      <Award size={18} style={{ color: "var(--am)" }} className="shrink-0 mt-0.5" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">«{n.titolo}»</span><span className="block mu text-xs mb-1.5">Hai ricevuto un voto · {date(n.timestamp)}</span>{stars(n.voto)}</span>
    </button>)}
  </div>;
}
