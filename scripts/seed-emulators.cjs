// Riempie gli emulatori locali (firebase.json: Auth 9099, Firestore 8180, progetto demo-circuito) con una classe di prova:
// una prof amministratrice, alcuni studenti, scritti completi e pensieri del diario, voti e profili. Serve a provare l'app
// completa in locale senza toccare il progetto vero:
//   npx firebase-tools emulators:start --only auth,firestore --project demo-circuito
//   node scripts/seed-emulators.cjs
//   npm run start:emu
// Le password sono solo di prova e valgono solo negli emulatori.
const AUTH = 'http://127.0.0.1:9099', FS = 'http://127.0.0.1:8180', PROJECT = 'demo-circuito';
const PASSWORD = 'circuito-prova-1';
const PEOPLE = [
  { key: 'prof', name: 'Elena Marchi', email: 'prof@circuito.test', admin: true, banner: 'indigo', status: 'Leggo tutto, giuro', bio: 'Insegno lettere. Ogni mese scelgo gli scritti da portare in classe.' },
  { key: 'andrea', name: 'Andrea Conti', email: 'andrea@circuito.test', banner: 'teal', status: 'Scrivo di notte', bio: 'Quinto anno. Racconti brevi, qualche disegno, molti caffè.' },
  { key: 'giulia', name: 'Giulia Ferri', email: 'giulia@circuito.test', banner: 'rose', status: 'Lettere mai spedite', bio: 'Mi piacciono le parole che restano.' },
  { key: 'marco', name: 'Marco Lenti', email: 'marco@circuito.test', banner: 'amber', status: '', bio: 'Via Po, le scale, la città.' },
  { key: 'sara', name: 'Sara Bianchi', email: 'sara@circuito.test', banner: 'sky', status: 'In biblioteca', bio: '' },
];
const P = (...lines) => lines.map((l) => `<p>${l}</p>`).join('');
const day = (m, d, h = 17) => new Date(2026, m - 1, d, h, 12).getTime();
const WRITINGS = [
  { id: 'w-admin', who: 'prof', kind: 'complete', at: day(10, 21), title: 'Il filo che tiene insieme le parole', content: P('Ogni pagina comincia con una voce. Il Circuito è il posto in cui quelle voci si incontrano.', 'Scrivere significa anche trovare il tempo di ascoltare quello che gli altri hanno lasciato sul foglio.') },
  { id: 'd-admin', who: 'prof', kind: 'diary', firmato: true, at: day(10, 22), title: 'Tra una pagina e l’altra', content: P('Tra una pagina e l’altra c’è sempre una frase che torna. Oggi mi porto via il rumore della pioggia sui vetri e una parola che non avevo mai usato.') },
  { id: 'w-primo-mese', who: 'andrea', kind: 'complete', at: day(10, 3), title: 'Il primo mese del quinto anno', rating: 4, content: P('Settembre è passato come un treno che non ferma alle stazioni piccole. Ho contato le mattine con il cielo bianco sopra il cortile e le ho trovate tutte uguali, poi diverse.', 'C’è una cosa che nessuno dice del quinto anno: che si comincia a guardare la scuola come si guarda una casa da cui si trasloca. I corridoi diventano più lunghi, le porte più pesanti, i compagni più gentili.', 'Ho deciso di scrivere ogni sera una riga sola. Stasera la riga è questa: restare è anche un modo di partire.') },
  { id: 'w-lettera', who: 'giulia', kind: 'complete', at: day(10, 6), title: 'Lettera a chi resta', rating: 5, content: P('Caro te che resti, ti lascio le chiavi del cassetto in alto, quello che si apre solo tirando a sinistra.', 'Dentro ci sono i biglietti del cinema, una conchiglia, la ricevuta di un gelato diviso in due. Non sono ricordi: sono istruzioni.', 'Quando avrai paura di dimenticare, aprilo. Quando avrai paura di ricordare troppo, chiudilo piano.') },
  { id: 'w-scale', who: 'marco', kind: 'complete', at: day(10, 9), title: 'Le scale di via Po', rating: 4, content: P('Le scale di via Po hanno novantadue gradini e un pianerottolo dove la luce entra di traverso.', 'Mia nonna li saliva contando ad alta voce, e quando sbagliava ricominciava da capo, senza fretta. Io li salgo due alla volta e non conto mai.', 'Forse è per questo che non so mai a che piano sono.') },
  { id: 'w-orologio', who: 'sara', kind: 'complete', at: day(10, 11), title: 'L’orologio della biblioteca', content: P('L’orologio della biblioteca è fermo alle tre e venti da quando sono arrivata. Nessuno lo ripara, perché tutti hanno imparato a non guardarlo.', 'Ho pensato che il tempo, lì dentro, abbia deciso di prendersi una pausa insieme a noi.') },
  { id: 'w-pioggia', who: 'andrea', kind: 'complete', at: day(10, 14), title: 'Ritratto con pioggia', content: P('La pioggia sul vetro dell’autobus disegna strade che non esistono. Le seguo con il dito finché non arriva la mia fermata.', 'Ogni goccia sceglie una strada, poi si unisce a un’altra e smette di scegliere.') },
  { id: 'w-mappa', who: 'giulia', kind: 'complete', at: day(10, 16), title: 'Mappa di una città inventata', content: P('Nella mia città le piazze hanno il nome di chi ci ha pianto, e i ponti quello di chi ci ha fatto pace.', 'C’è un quartiere intero dedicato alle cose dette troppo tardi. È il più popolato.') },
  { id: 'w-settembre', who: 'marco', kind: 'complete', at: day(9, 22), title: 'Ultimo giorno d’estate', rating: 3, content: P('L’ultimo giorno d’estate ha l’odore della crema solare dimenticata nello zaino.', 'Lo riconosci solo dopo, quando apri lo zaino a novembre.') },
  // come scrivono davvero: titolo centrato a mano con gli spazi, paragrafi separati da righe vuote
  { id: 'w-stupore', who: 'sara', kind: 'complete', at: day(10, 18), title: 'La ricerca dello stupore', content: P(' '.repeat(28) + 'La ricerca dello Stupore', '', 'Introduzione:', 'Come l’autrice, anch’io ritengo che lo stupore vari a seconda dell’età, fino quasi a cessare del tutto, a causa dell’enorme quantità di cose già viste.') },
  { id: 'd-inizio', who: 'andrea', kind: 'diary', firmato: true, at: day(10, 18, 21), title: 'L’inizio non è il mio forte.', content: P('La', 'Tormenta Dell’Inizio', '', '', 'Introduzione:', '', 'Quest’anno, come anche gli scorsi, l’inizio della scuola è stato una tormenta di orari, facce nuove e promesse.') },
  { id: 'd-caffe', who: 'andrea', kind: 'diary', firmato: true, at: day(10, 12, 23), title: 'Caffè delle undici', content: P('Oggi il caffè della macchinetta sapeva di cartone e di speranza. Ho preso un sette in matematica e l’ho festeggiato da solo.') },
  { id: 'd-finestra', who: 'sara', kind: 'diary', at: day(10, 15, 22), title: 'Dalla finestra', content: P('Dalla finestra si vede un pezzo di collina e un pezzo di tangenziale. Io guardo sempre la collina, ma ascolto la tangenziale.') },
  { id: 'd-treno', who: 'giulia', kind: 'diary', firmato: true, at: day(10, 17, 8), title: 'Sul treno delle sette', content: P('Il treno delle sette è pieno di gente che dorme con la testa sul vetro. Sembriamo tutti in attesa di un sogno che parta in orario.') },
  { id: 'd-nonno', who: 'marco', kind: 'diary', at: day(10, 18, 9), title: 'Le mani del nonno', content: P('Mio nonno aggiusta le radio. Dice che il segreto è ascoltare il fruscio prima della voce.') },
  // un eco: nato da una frase del treno delle sette
  { id: 'd-eco-sogno', who: 'sara', kind: 'diary', at: day(10, 19, 22), title: 'Il sogno in ritardo', nataDa: { id: 'd-treno', cit: 'Sembriamo tutti in attesa di un sogno che parta in orario.' },
    content: P('«Sembriamo tutti in attesa di un sogno che parta in orario.»', 'Il mio sogno parte sempre in ritardo, ma almeno non salta mai le fermate piccole.') },
];
// Le scintille: chi le accende (mai scritto nella scintilla), su quale pensiero, la frase e l'emozione. Una frase non c'è
// più nel testo: finisce tra «Frasi che non ci sono più».
const SPARKS = [
  { by: 'andrea', on: 'd-treno', cit: 'pieno di gente che dorme con la testa sul vetro', tipo: 'riconosco', nota: 'Ogni mattina, identico. Anche io sono quello col vetro.', ago: 1 },
  { by: 'andrea', on: 'd-treno', cit: 'Il treno delle sette', tipo: 'ridere', ago: 0 },
  { by: 'sara', on: 'd-treno', cit: 'Sembriamo tutti in attesa di un sogno che parta in orario.', tipo: 'bellissima', ago: 1 },
  { by: 'marco', on: 'd-treno', cit: 'in attesa di un sogno', tipo: 'commosso', ago: 0 },
  { by: 'prof', on: 'd-treno', cit: 'in attesa di un sogno che parta', tipo: 'bellissima', nota: 'Da leggere in classe.', ago: 0 },
  { by: 'marco', on: 'd-treno', cit: 'una frase che non c’è più nel testo', pre: 'Il treno delle sette è ', post: '', tipo: 'bellissima', ago: 2 },
  { by: 'giulia', on: 'd-finestra', cit: 'Io guardo sempre la collina, ma ascolto la tangenziale.', tipo: 'riconosco', nota: 'Anch’io, dalla mia.', ago: 0 },
  { by: 'giulia', on: 'd-caffe', cit: 'Ho preso un sette in matematica e l’ho festeggiato da solo.', tipo: 'ridere', ago: 3 },
];

const value = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
};
const put = async (path, data) => {
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)])) }),
  });
  if (!r.ok) throw Error(`${path}: ${r.status} ${await r.text()}`);
};
const excerptOf = (html) => {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), chars = Array.from(text);
  return chars.slice(0, Math.min(480, Math.floor(chars.length * 0.3))).join('').trimEnd();
};

(async () => {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const uid = {};
  for (const p of PEOPLE) {
    const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, password: PASSWORD, displayName: p.name, returnSecureToken: true }) });
    const j = await r.json(); if (!r.ok) throw Error(JSON.stringify(j));
    uid[p.key] = j.localId;
    const now = day(9, 1);
    await put(`profili/${j.localId}`, { displayName: p.name, handle: p.name.split(' ')[0].toLowerCase(), status: p.status, bio: p.bio, avatar: '', banner: p.banner, createdAt: now, updatedAt: now });
    if (p.admin) await put(`admins/${j.localId}`, { nome: p.name });
  }
  await put('app_config/admin_badge', { uid: uid.prof });
  for (const w of WRITINGS) {
    const person = PEOPLE.find((p) => p.key === w.who);
    const o = { title: w.title, content: w.content, strokes: [], w: 900, h: 600, author: person.name, timestamp: w.at, userId: uid[w.who], isStarred: false, kind: w.kind };
    if (w.kind === 'complete') { o.excerpt = excerptOf(w.content); if (w.rating) { o.rating = w.rating; o.svelato = true; } }
    else { o.firmato = !!w.firmato; if (w.nataDa) o.nataDa = w.nataDa; }
    await put(`pensieri/${w.id}`, o);
    const pub = w.kind === 'diary'
      ? { version: 2, kind: 'diary', title: w.title, content: w.content, strokes: [], w: 900, h: 600, ...(w.firmato ? { firma: person.name, autoreId: uid[w.who] } : {}) }
      : { version: 2, kind: 'complete', title: w.title, excerpt: o.excerpt };
    if (w.nataDa) pub.nataDa = w.nataDa;
    if (w.who === 'prof') pub.admin = true;
    await put(`testi/${w.id}`, pub);
    if (w.kind === 'complete') await put(`valutazioni/${w.id}`, { stato: w.rating ? 'scelto' : 'da_leggere', nota: '', voto: w.rating || 0, segnalibro: w.rating === 5, updatedAt: w.at });
    if (w.rating) await put(`notifiche/n-${w.id}`, { userId: uid[w.who], pensieroId: w.id, titolo: w.title, voto: w.rating, timestamp: w.at + 86400000, letta: false });
  }
  // scintille: la scintilla senza identità, la voce privata di chi l'ha accesa e il suo posto nel tetto di 5
  const flat = (t) => t.replace(/[\s\u00a0]+/g, ' ').trim();
  const textOf = (html) => flat(html.replace(/<\/(p|div)>/g, ' ').replace(/<[^>]+>/g, ''));
  const today = Math.floor(Date.now() / 864e5), pezzi = {};
  for (const [i, sp] of SPARKS.entries()) {
    const w = WRITINGS.find((x) => x.id === sp.on), text = textOf(w.content), at = text.indexOf(sp.cit);
    const pre = sp.pre ?? (at > 0 ? text.slice(Math.max(0, at - 40), at) : ''), post = sp.post ?? (at >= 0 ? text.slice(at + sp.cit.length, at + sp.cit.length + 40) : '');
    const sid = `seed${String(i).padStart(2, '0')}${Math.random().toString(36).slice(2, 12)}`.padEnd(20, 'x'), giorno = today - sp.ago;
    await put(`pensieri/${sp.on}/scintille/${sid}`, { cit: sp.cit, pre, post, tipo: sp.tipo, giorno, ...(sp.nota ? { nota: sp.nota } : {}), ...(sp.by === 'prof' ? { admin: true } : {}) });
    await put(`scintille_mie/${uid[sp.by]}/voci/${sid}`, { pensieroId: sp.on, giorno });
    const k = `${uid[sp.by]}/pezzi/${sp.on}`; pezzi[k] = [...(pezzi[k] || []), sid];
  }
  for (const [k, voci] of Object.entries(pezzi)) await put(`scintille_mie/${k}`, { voci });
  console.log(`Emulatori pronti: ${PEOPLE.length} persone (${PEOPLE.map((p) => p.email).join(', ')}), ${WRITINGS.length} scritti, ${SPARKS.length} scintille.`);
})().catch((e) => { console.error(e); process.exit(1); });
