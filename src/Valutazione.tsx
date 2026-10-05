import React, { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";

// Stato e nota privata di uno scritto: salvati in  valutazioni/{idScritto}, leggibili solo dagli admin.
export const STATI: [string, string][] = [["da_leggere", "Da leggere"], ["letto", "Letto"], ["shortlist", "Shortlist"], ["scelto", "Scelto"]];

export function PannelloAdmin({ db, id, notify }: { db: any; id: string; notify?: (m: string) => void }) {
  const [stato, setStato] = useState("da_leggere");
  const [nota, setNota] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const typing = useRef(false);

  useEffect(() => {
    setReady(false);
    return onSnapshot(doc(db, "valutazioni", id), (s: any) => {
      const d = s.exists() ? s.data() : null;
      setStato(d?.stato || "da_leggere");
      if (!typing.current) setNota(d?.nota || "");
      setReady(true);
    }, () => setReady(true));
  }, [db, id]);

  const save = async (st: string, nt: string) => {
    setBusy(true);
    try { await setDoc(doc(db, "valutazioni", id), { stato: st, nota: nt.trim(), updatedAt: Date.now() }); }
    catch { notify?.("Nota non salvata: pubblica le nuove regole di Firestore."); }
    setBusy(false);
  };

  return (
    <div className="px-4 py-3 border-b space-y-3" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}>
      <div className="flex items-center justify-between">
        <span className="mu text-xs">Stato e nota privata (solo admin)</span>
        {busy && <Loader2 size={14} className="animate-spin" style={{ color: "var(--ac)" }} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {STATI.map(([k, l]) => (
          <button type="button" key={k} disabled={!ready} className={`bt !text-xs ${stato === k ? "on" : ""}`}
            onClick={() => { setStato(k); save(k, nota); }}>{l}</button>
        ))}
      </div>
      <textarea className="inp min-h-[72px]" maxLength={2000} placeholder="Appunti per te: cosa funziona, cosa no…" value={nota}
        onFocus={() => { typing.current = true; }}
        onChange={(e) => setNota(e.target.value)}
        onBlur={() => { typing.current = false; save(stato, nota); }} />
    </div>
  );
}
