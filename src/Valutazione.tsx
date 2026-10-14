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
  // ultimo stato noto sul server: si scrive solo se qualcosa è cambiato davvero
  const saved = useRef({ stato: "da_leggere", nota: "" });
  const cur = useRef({ stato, nota }); cur.current = { stato, nota };
  const timer = useRef(0);

  useEffect(() => {
    setReady(false); setStato("da_leggere"); setNota(""); typing.current = false;
    const off = onSnapshot(doc(db, "valutazioni", id), (s: any) => {
      const d = s.exists() ? s.data() : null;
      saved.current = { stato: d?.stato || "da_leggere", nota: d?.nota || "" };
      setStato(saved.current.stato);
      if (!typing.current) setNota(saved.current.nota);
      setReady(true);
    }, () => setReady(true));
    // chiudendo il lettore (o passando a un altro scritto) mentre si scrive, la nota non va persa
    return () => {
      off(); clearTimeout(timer.current);
      const c = cur.current;
      if (c.stato !== saved.current.stato || c.nota.trim() !== saved.current.nota) setDoc(doc(db, "valutazioni", id), { stato: c.stato, nota: c.nota.trim(), updatedAt: Date.now() }, { merge: true }).catch(() => {});
    };
  }, [db, id]);

  const save = async (st: string, nt: string) => {
    clearTimeout(timer.current);
    if (st === saved.current.stato && nt.trim() === saved.current.nota) return;
    saved.current = { stato: st, nota: nt.trim() };
    setBusy(true);
    try { await setDoc(doc(db, "valutazioni", id), { stato: st, nota: nt.trim(), updatedAt: Date.now() }, { merge: true }); }
    catch { notify?.("Nota non salvata: pubblica le nuove regole di Firestore."); }
    setBusy(false);
  };

  return (
    <div className="px-4 py-3 border-b space-y-3" style={{ borderColor: "var(--ln)", background: "var(--sf)" }}>
      <div className="flex items-center justify-between">
        <span className="mu text-xs">Visibile solo agli admin</span>
        {busy && <Loader2 size={14} className="animate-spin" style={{ color: "var(--ac)" }} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {STATI.map(([k, l]) => (
          <button type="button" key={k} disabled={!ready} aria-pressed={stato === k} className={`bt !text-xs ${stato === k ? "on" : ""}`}
            onClick={() => { setStato(k); save(k, nota); }}>{l}</button>
        ))}
      </div>
      <textarea className="inp min-h-[72px]" maxLength={2000} placeholder="Appunti per te: cosa funziona, cosa no…" value={nota} aria-label="Nota privata"
        onFocus={() => { typing.current = true; }}
        onChange={(e) => { const v = e.target.value; setNota(v); clearTimeout(timer.current); timer.current = window.setTimeout(() => save(cur.current.stato, v), 1200); }}
        onBlur={() => { typing.current = false; save(stato, nota); }} />
    </div>
  );
}
