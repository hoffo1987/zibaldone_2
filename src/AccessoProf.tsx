import React, { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { Copy, Loader2, Trash2, Users } from "lucide-react";

// Accesso del professore: il titolare crea un link monouso; il professore lo apre e il suo dispositivo
// resta collegato in modalità admin, senza email né password.
//
// - il token ha 256 bit casuali ed è l'ID del documento  inviti/{token}  (nessuno può indovinarlo);
// - sta nel link dopo il "#", quindi non viene mai inviato a server, log o altri siti;
// - vale una volta sola e scade (le regole di Firestore lo impongono, non solo l'app);
// - il titolare vede chi è collegato e può revocare l'accesso in qualsiasi momento.

const DURATE: [number, string][] = [[3600000, "1 ora"], [86400000, "24 ore"], [604800000, "7 giorni"]];

const nuovoToken = (): string => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += ("0" + b[i].toString(16)).slice(-2);
  return s;
};

const linkDi = (token: string) => `${window.location.origin}${window.location.pathname}#prof=${token}`;

const quando = (ms: number) =>
  new Date(ms).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AccessoProf({ db, notify }: { db: any; notify: (m: string) => void }) {
  const [dur, setDur] = useState(86400000);
  const [inviti, setInviti] = useState<any[]>([]);
  const [prof, setProf] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState("");
  const [regole, setRegole] = useState(false);

  useEffect(() => {
    const a = onSnapshot(collection(db, "inviti"), (s: any) => {
      setRegole(false);
      setInviti(s.docs.map((d: any) => ({ id: d.id, ...d.data() })).sort((x: any, y: any) => y.creatoIl - x.creatoIl));
    }, () => setRegole(true));
    const b = onSnapshot(collection(db, "admins"), (s: any) => {
      setProf(s.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((x: any) => x.ruolo === "professore").sort((x: any, y: any) => y.creatoIl - x.creatoIl));
    }, () => setRegole(true));
    return () => { a(); b(); };
  }, [db]);

  const copia = async (testo: string) => {
    try { await navigator.clipboard.writeText(testo); notify("Link copiato."); }
    catch { notify("Copia non riuscita: tieni premuto sul link e copialo a mano."); }
  };

  const crea = async () => {
    setBusy(true);
    try {
      const t = nuovoToken();
      const now = Date.now();
      await setDoc(doc(db, "inviti", t), { creatoIl: now, scade: now + dur });
      setUltimo(linkDi(t));
      copia(linkDi(t));
    } catch { notify("Link non creato: pubblica le nuove regole di Firestore."); }
    setBusy(false);
  };

  const annulla = async (id: string) => {
    try { await deleteDoc(doc(db, "inviti", id)); if (ultimo.endsWith(id)) setUltimo(""); }
    catch { notify("Non sono riuscito ad annullare il link."); }
  };

  const revoca = async (id: string) => {
    if (!window.confirm("Revocare l'accesso di questo dispositivo? Il professore dovrà ricevere un nuovo link per rientrare.")) return;
    try { await deleteDoc(doc(db, "admins", id)); notify("Accesso revocato."); }
    catch { notify("Non sono riuscito a revocare l'accesso."); }
  };

  const attivi = inviti.filter((i) => i.scade > Date.now());
  const scaduti = inviti.filter((i) => i.scade <= Date.now());

  return (
    <div className="mt-6">
      <h4 className="text-xs mu mb-1 flex items-center gap-1.5"><Users size={13} />Accesso del professore</h4>
      <p className="text-xs mu mb-3">Crea un link e mandalo solo al professore: funziona una volta sola, poi si disattiva. Chi lo apre entra in modalità admin con questo dispositivo, senza account.</p>

      {regole && <p className="text-xs mb-3" style={{ color: "#b91c1c" }}>Non riesco a leggere gli accessi: pubblica le nuove regole di Firestore.</p>}

      <div className="flex gap-2 items-center">
        <select className="inp !w-auto" value={dur} onChange={(e) => setDur(Number(e.target.value))} aria-label="Durata del link">
          {DURATE.map(([ms, l]) => <option key={ms} value={ms}>Valido {l}</option>)}
        </select>
        <button type="button" className="bt pri flex-1" disabled={busy} onClick={crea}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}Crea link
        </button>
      </div>

      {ultimo && (
        <div className="mt-2">
          <input className="inp text-xs" readOnly value={ultimo} onFocus={(e) => e.target.select()} aria-label="Link per il professore" />
          <p className="text-xs mu mt-1">Non aprirlo tu: lo consumeresti. Mandalo in un messaggio diretto, non in un gruppo.</p>
        </div>
      )}

      {attivi.length > 0 && <h5 className="text-[11px] font-bold uppercase tracking-wider mu mt-4 mb-1">Link in attesa</h5>}
      {attivi.map((i) => (
        <div key={i.id} className="flex items-center gap-2 py-1.5">
          <span className="flex-1 min-w-0 text-sm">Creato {quando(i.creatoIl)}<span className="mu text-xs"> · scade {quando(i.scade)}</span></span>
          <button type="button" className="bt !p-2" title="Copia il link" aria-label="Copia il link" onClick={() => copia(linkDi(i.id))}><Copy size={14} /></button>
          <button type="button" className="bt !p-2" title="Annulla il link" aria-label="Annulla il link" onClick={() => annulla(i.id)}><Trash2 size={14} /></button>
        </div>
      ))}
      {scaduti.length > 0 && (
        <button type="button" className="mu text-xs lk mt-1" onClick={() => scaduti.forEach((i) => annulla(i.id))}>Elimina {scaduti.length === 1 ? "il link scaduto" : `i ${scaduti.length} link scaduti`}</button>
      )}

      <h5 className="text-[11px] font-bold uppercase tracking-wider mu mt-4 mb-1">Dispositivi collegati</h5>
      {prof.length === 0 && <p className="text-xs mu">Nessun professore collegato.</p>}
      {prof.map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-1.5">
          <span className="flex-1 min-w-0 text-sm">Professore<span className="mu text-xs"> · collegato {quando(p.creatoIl)}</span></span>
          <button type="button" className="bt !p-2" title="Revoca l'accesso" aria-label="Revoca l'accesso" onClick={() => revoca(p.id)}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}
