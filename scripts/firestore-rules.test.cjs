const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, writeBatch, deleteDoc } = require('firebase/firestore');
let env, owner, other, admin, guest, publisher;
const original = (kind = 'complete') => ({ kind, title: 'Una pagina', content: '<p>Prima parte. CONTENUTO RISERVATO, testo integrale dello scritto.</p>', excerpt: kind === 'complete' ? 'Prima parte.' : '', strokes: [], w: 900, h: 600, author: 'Autore privato', userId: 'owner', timestamp: 1, isStarred: false });
const projection = d => d.kind === 'diary'
  ? { version: 2, kind: d.kind, title: d.title, content: d.content, strokes: d.strokes, w: d.w, h: d.h }
  : { version: 2, kind: 'complete', title: d.title, excerpt: d.excerpt };
const publish = (db, id, d) => { const b = writeBatch(db); b.set(doc(db, 'pensieri', id), d); b.set(doc(db, 'testi', id), projection(d)); return b.commit(); };
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-circuito', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':').pop() || 8180) } });
  await env.clearFirestore();
  owner = env.authenticatedContext('owner').firestore(); other = env.authenticatedContext('other').firestore(); admin = env.authenticatedContext('admin').firestore(); guest = env.unauthenticatedContext().firestore();
  publisher = env.authenticatedContext('publisher', { releasePublisher:true }).firestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'admin'), {});
    await setDoc(doc(db, 'app_config', 'admin_badge'), { uid: 'admin' });
    await setDoc(doc(db, 'release_publishers', 'publisher'), {});
    for (const [id, kind] of [['complete', 'complete'], ['diary', 'diary']]) { const d = original(kind); await setDoc(doc(db, 'pensieri', id), d); await setDoc(doc(db, 'testi', id), projection(d)); }
    await setDoc(doc(db, 'testi', 'legacy'), { title: 'Vecchia copia', content: 'INTEGRALE NON LEGGIBILE' });
    const legacy = original(); delete legacy.kind; delete legacy.excerpt;
    await setDoc(doc(db, 'pensieri', 'legacy'), legacy);
  });
});
after(async () => { await env?.cleanup(); });
test('originali leggibili solo da autore/admin', async () => {
  for (const id of ['complete', 'diary']) { await assertSucceeds(getDoc(doc(owner, 'pensieri', id))); await assertSucceeds(getDoc(doc(admin, 'pensieri', id))); await assertFails(getDoc(doc(other, 'pensieri', id))); }
});
test('query degli originali: autore filtrato, archivio completo solo admin', async () => {
  await assertSucceeds(getDocs(query(collection(owner, 'pensieri'), where('userId', '==', 'owner'))));
  await assertFails(getDocs(collection(other, 'pensieri'))); await assertSucceeds(getDocs(collection(admin, 'pensieri')));
});
test('feed pubblico sicuro: diario integrale e completi solo estratto', async () => {
  const result = await assertSucceeds(getDocs(query(collection(other, 'testi'), where('version', '==', 2))));
  assert.equal(result.size, 2);
  const d = (await getDoc(doc(other, 'testi', 'diary'))).data(); assert.equal(d.content, original('diary').content); assert.equal(d.userId, undefined); assert.equal(d.author, undefined);
  const c = (await getDoc(doc(other, 'testi', 'complete'))).data(); assert.equal(c.excerpt, 'Prima parte.'); assert.equal(c.content, undefined); assert.equal(c.strokes, undefined);
});
test('vecchie copie integrali e query senza filtro versione negate', async () => { await assertFails(getDoc(doc(other, 'testi', 'legacy'))); await assertFails(getDocs(collection(other, 'testi'))); });
test('nessuna lettura pubblica senza account', async () => { await assertFails(getDoc(doc(guest, 'testi', 'diary'))); });
test('pubblicazione atomica per entrambi i tipi', async () => { await assertSucceeds(publish(owner, 'new-complete', original())); await assertSucceeds(publish(owner, 'new-diary', original('diary'))); });
test('originale senza copia sicura rifiutato', async () => { await assertFails(setDoc(doc(owner, 'pensieri', 'unpaired'), original())); });
test('impossibile attribuire uno scritto a un altro utente', async () => { await assertFails(publish(other, 'forged', original())); });
test('nessun campo autore o data in una copia pubblica', async () => { await assertFails(setDoc(doc(owner, 'testi', 'diary'), { ...projection(original('diary')), userId: 'owner' })); await assertFails(updateDoc(doc(owner, 'testi', 'complete'), { timestamp: 1 })); });
test('nessun testo integrale o disegno nei completi pubblici', async () => { await assertFails(updateDoc(doc(owner, 'testi', 'complete'), { content: original().content })); await assertFails(updateDoc(doc(owner, 'testi', 'complete'), { strokes: [] })); });
test('estratto eccessivo o diverso dal privato rifiutato', async () => { await assertFails(updateDoc(doc(owner, 'testi', 'complete'), { excerpt: 'x'.repeat(481) })); await assertFails(updateDoc(doc(owner, 'testi', 'complete'), { excerpt: 'Altro' })); });
test('diario non valutabile o categorizzabile neppure da admin', async () => {
  for (const patch of [{ voto: 5 }, { segnalibro: true }, { stato: 'shortlist' }, { nota: 'nota' }]) await assertFails(setDoc(doc(admin, 'valutazioni', 'diary'), { ...patch, updatedAt: 2 }));
  await assertFails(updateDoc(doc(admin, 'pensieri', 'diary'), { rating: 5, svelato: true }));
});
test('diario non può nascere con un voto o essere convertito dopo la pubblicazione', async () => {
  await assertFails(publish(owner, 'rated-diary', { ...original('diary'), rating: 5 }));
  await assertFails(publish(owner, 'diary', original('complete'))); await assertFails(publish(admin, 'complete', original('diary')));
});
test('valutazioni private dei completi riservate agli admin', async () => {
  await assertSucceeds(setDoc(doc(admin, 'valutazioni', 'complete'), { voto: 4, stato: 'letto', updatedAt: 2 }));
  await assertFails(getDoc(doc(owner, 'valutazioni', 'complete'))); await assertFails(setDoc(doc(owner, 'valutazioni', 'complete'), { voto: 5, updatedAt: 2 }));
});
test('svelamento e voto definitivo dei completi restano funzionanti', async () => {
  await assertSucceeds(updateDoc(doc(admin, 'pensieri', 'complete'), { rating: 4, svelato: true }));
  await assertFails(updateDoc(doc(admin, 'pensieri', 'complete'), { rating: 5 }));
});
test('mezze stelle private, svelamento e notifica funzionano da 0,5 a 5', async () => {
  for (const voto of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
    const id = `half-${voto}`;
    await assertSucceeds(publish(owner, id, original()));
    await assertSucceeds(setDoc(doc(admin, 'valutazioni', id), { voto, updatedAt: 3 }));
    const b = writeBatch(admin);
    b.update(doc(admin, 'pensieri', id), { rating: voto, svelato: true });
    b.set(doc(admin, 'notifiche', id), { userId: 'owner', pensieroId: id, titolo: 'Una pagina', voto, timestamp: 3, letta: false });
    await assertSucceeds(b.commit());
    assert.equal((await getDoc(doc(owner, 'pensieri', id))).data().rating, voto);
    assert.equal((await getDoc(doc(owner, 'notifiche', id))).data().voto, voto);
    await assertFails(updateDoc(doc(admin, 'pensieri', id), { rating: voto === 5 ? 4.5 : 5 }));
  }
});
test('scritti storici senza campi del foglio: voto, svelamento e notifica in un solo salvataggio', async () => {
  for (const voto of [0.5, 3.5, 4.5, 5]) {
    const id = `legacy-text-only-${voto}`;
    // Forma realmente usata dalle prime versioni: niente kind, excerpt, strokes, w o h.
    const legacy = { title: 'Uno scritto storico', content: '<p>Solo testo</p>', author: 'Autore privato', userId: 'owner', timestamp: 1, isStarred: false, svelato: false };
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'pensieri', id), legacy));
    await assertSucceeds(setDoc(doc(admin, 'valutazioni', id), { voto, updatedAt: 3 }));
    const b = writeBatch(admin);
    b.update(doc(admin, 'pensieri', id), { rating: voto, svelato: true });
    b.set(doc(admin, 'notifiche', id), { userId: 'owner', pensieroId: id, titolo: legacy.title, voto, timestamp: 3, letta: false });
    await assertSucceeds(b.commit());
    const after = (await getDoc(doc(owner, 'pensieri', id))).data();
    assert.equal(after.rating, voto); assert.equal(after.svelato, true);
    assert.equal(after.content, legacy.content); assert.equal(after.author, legacy.author);
    assert.equal((await getDoc(doc(owner, 'notifiche', id))).data().voto, voto);
    await assertFails(updateDoc(doc(admin, 'pensieri', id), { rating: voto === 5 ? 4.5 : 5 }));
    await assertFails(updateDoc(doc(owner, 'pensieri', id), { rating: 1 }));
  }
});
test('campi del foglio obbligatori per gli scritti moderni, valori presenti sempre validati', async () => {
  const missing = original(); delete missing.strokes; delete missing.w; delete missing.h;
  await assertFails(publish(owner, 'modern-without-paper', missing));
  for (const patch of [{ strokes: 'non è un disegno' }, { w: -1 }, { h: 200001 }]) {
    await assertFails(publish(owner, 'bad-paper', { ...original(), ...patch }));
  }
});
test('voti fuori scala, frazioni diverse dalla metà e falsi tipi sono rifiutati ovunque', async () => {
  await assertSucceeds(publish(owner, 'invalid-rating', original()));
  for (const voto of [-0.5, 0.25, 1.2, 3.75, 5.5, '4.5', null]) {
    await assertFails(setDoc(doc(admin, 'valutazioni', 'invalid-rating'), { voto, updatedAt: 4 }));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'valutazioni', 'invalid-rating'), { voto, updatedAt: 4 }));
    await assertFails(updateDoc(doc(admin, 'pensieri', 'invalid-rating'), { rating: voto, svelato: true }));
    await assertFails(setDoc(doc(admin, 'notifiche', 'invalid-rating'), { userId: 'owner', pensieroId: 'invalid-rating', titolo: 'Una pagina', voto, timestamp: 4, letta: false }));
  }
});
test('un voto tolto è zero solo nella valutazione privata, mai nello scritto o nella notifica', async () => {
  await assertSucceeds(setDoc(doc(admin, 'valutazioni', 'invalid-rating'), { voto: 0.5, updatedAt: 5 }));
  await assertSucceeds(updateDoc(doc(admin, 'valutazioni', 'invalid-rating'), { voto: 0 }));
  await assertFails(updateDoc(doc(admin, 'pensieri', 'invalid-rating'), { rating: 0, svelato: true }));
  await assertFails(setDoc(doc(admin, 'notifiche', 'zero-rating'), { userId: 'owner', pensieroId: 'invalid-rating', titolo: 'Una pagina', voto: 0, timestamp: 5, letta: false }));
});
test('diario modificabile da autore e admin, mai da estranei', async () => {
  const next = { ...original('diary'), title: 'Titolo aggiornato' };
  await assertFails(publish(other, 'new-diary', next)); await assertSucceeds(publish(owner, 'new-diary', next));
  await assertSucceeds(publish(admin, 'new-diary', { ...next, content: 'Correzione' }));
});
test('aggiornare solo originale o solo copia non può creare divergenze', async () => {
  await assertFails(updateDoc(doc(owner, 'pensieri', 'diary'), { content: 'Nuovo testo' }));
  await assertFails(updateDoc(doc(owner, 'testi', 'diary'), { content: 'Nuovo testo' }));
});
test('migrazione dei vecchi scritti in anteprime senza cambiare gli originali', async () => {
  await assertSucceeds(setDoc(doc(admin, 'testi', 'legacy'), { version: 2, kind: 'complete', title: original().title, excerpt: 'Prima parte.' }));
  assert.equal((await getDoc(doc(owner, 'pensieri', 'legacy'))).data().content, original().content);
});
test('nessuno può promuoversi ad admin o cambiare proprietario', async () => {
  await assertFails(setDoc(doc(owner, 'admins', 'owner'), {})); await assertFails(updateDoc(doc(owner, 'pensieri', 'diary'), { userId: 'other' }));
});

test('sigillo personale: configurazione in sola lettura, nessuna autoassegnazione', async () => {
  await assertSucceeds(getDoc(doc(other, 'app_config', 'admin_badge')));
  await assertFails(setDoc(doc(other, 'app_config', 'admin_badge'), { uid: 'other' }));
  await assertFails(setDoc(doc(admin, 'app_config', 'admin_badge'), { uid: 'other' }));
  await assertFails(updateDoc(doc(owner, 'testi', 'diary'), { admin: true }));
  await assertFails(updateDoc(doc(admin, 'testi', 'diary'), { admin: true })); // Anche l'admin non può firmare il lavoro altrui.
});

test('sigillo sui soli scritti dell’Admin: nessuna identità aggiunta alla copia pubblica', async () => {
  for (const kind of ['diary', 'complete']) {
    const id = `admin-badge-${kind}`, d = { ...original(kind), userId: 'admin', author: 'Admin' };
    const b = writeBatch(admin); b.set(doc(admin, 'pensieri', id), d); b.set(doc(admin, 'testi', id), { ...projection(d), admin: true });
    await assertSucceeds(b.commit());
    const pub = (await assertSucceeds(getDoc(doc(other, 'testi', id)))).data();
    assert.equal(pub.admin, true); assert.equal(pub.userId, undefined); assert.equal(pub.autoreId, undefined); assert.equal(pub.author, undefined);
    await assertFails(updateDoc(doc(admin, 'testi', id), { admin: 'true' }));
    await assertFails(updateDoc(doc(admin, 'testi', id), { admin: false }));
    await assertFails(updateDoc(doc(other, 'testi', id), { admin: true }));
    await assertSucceeds(setDoc(doc(admin, 'testi', id), projection(d))); // Compatibilità con client precedenti.
  }
});
test('le vecchie app salvano ancora gli originali, senza poter pubblicare copie integrali', async () => {
  const d = original(); delete d.kind; delete d.excerpt;
  await assertSucceeds(setDoc(doc(owner, 'pensieri', 'legacy-client'), d));
  await assertSucceeds(updateDoc(doc(owner, 'pensieri', 'legacy-client'), { content: 'Una modifica privata' }));
  await assertFails(setDoc(doc(owner, 'testi', 'legacy-client'), { title:d.title, content:d.content, strokes:[], w:900, h:600 }));
});
test('non si possono inviare notifiche di voto per i pensieri del diario', async () => {
  await assertFails(setDoc(doc(admin, 'notifiche', 'diary-vote'), { userId:'owner', pensieroId:'diary', titolo:'Diario', voto:5, timestamp:3, letta:false }));
});
const releaseId = 'a'.repeat(40), release = { titolo:'App aggiornata',messaggio:'Le novità di Il Circuito.',versione:'1.0.5',timestamp:Date.now(),commit:releaseId };
test('il publisher crea un solo annuncio condiviso e gli utenti possono leggerlo', async () => {
  await assertSucceeds(setDoc(doc(publisher,'aggiornamenti',releaseId),release));
  await assertSucceeds(getDoc(doc(owner,'aggiornamenti',releaseId))); await assertSucceeds(getDoc(doc(other,'aggiornamenti',releaseId)));
  await assertFails(getDoc(doc(guest,'aggiornamenti',releaseId)));
  await assertFails(updateDoc(doc(publisher,'aggiornamenti',releaseId),{messaggio:'sostituito'}));
});
test('gli utenti non possono inviare falsi annunci o diventare publisher', async () => {
  const id='b'.repeat(40);await assertFails(setDoc(doc(owner,'aggiornamenti',id),{...release,commit:id}));
  await assertFails(setDoc(doc(owner,'release_publishers','owner'),{}));
  const bad='c'.repeat(40);await assertFails(setDoc(doc(publisher,'aggiornamenti',bad),{...release,commit:bad,messaggio:'x'.repeat(1601)}));
});
test('il publisher non può leggere originali o valutazioni, né diventare admin', async () => {
  await assertFails(getDoc(doc(publisher,'pensieri','complete')));await assertFails(getDoc(doc(publisher,'valutazioni','complete')));
  await assertFails(setDoc(doc(publisher,'admins','publisher'),{}));
  await assertFails(getDoc(doc(publisher,'testi','diary')));
  await assertFails(publish(publisher,'publisher-diary',{...original('diary'),userId:'publisher'}));
});
test('le ricevute di lettura sono private e modificabili soltanto dal proprietario', async () => {
  const receipt=doc(owner,'letture_aggiornamenti','owner','annunci',releaseId);
  await assertSucceeds(setDoc(receipt,{letta:true,timestamp:Date.now()}));
  await assertSucceeds(getDoc(receipt));
  await assertFails(getDoc(doc(other,'letture_aggiornamenti','owner','annunci',releaseId)));
  await assertFails(setDoc(doc(other,'letture_aggiornamenti','owner','annunci',releaseId),{letta:true,timestamp:1}));
  await assertFails(updateDoc(receipt,{letta:false}));
  await assertFails(setDoc(doc(owner,'letture_aggiornamenti','owner','annunci','d'.repeat(40)),{letta:true,timestamp:1}));
});
test('il foglio scelto viaggia con la copia pubblica, uguale all’originale e solo tra quelli previsti', async () => {
  const withPaper = (d, carta) => ({ ...d, carta });
  const pair = (db, id, d, pub) => { const b = writeBatch(db); b.set(doc(db, 'pensieri', id), d); b.set(doc(db, 'testi', id), pub); return b.commit(); };
  for (const kind of ['complete', 'diary']) {
    const d = withPaper(original(kind), 'bianco');
    await assertSucceeds(pair(owner, `paper-${kind}`, d, { ...projection(d), carta: 'bianco' }));
    assert.equal((await getDoc(doc(other, 'testi', `paper-${kind}`))).data().carta, 'bianco');
    // copia senza foglio, o con un foglio diverso dall'originale
    await assertFails(pair(owner, `paper-miss-${kind}`, d, projection(d)));
    await assertFails(pair(owner, `paper-diff-${kind}`, d, { ...projection(d), carta: 'righe' }));
  }
  const odd = withPaper(original(), 'pergamena');
  await assertFails(pair(owner, 'paper-odd', odd, { ...projection(odd), carta: 'pergamena' }));
  // cambiare foglio dopo: l'originale e la copia insieme, mai l'originale da solo
  await assertFails(updateDoc(doc(owner, 'pensieri', 'paper-complete'), { carta: 'righe' }));
  const b = writeBatch(owner); b.update(doc(owner, 'pensieri', 'paper-complete'), { carta: 'righe', updatedAt: 3 }); b.update(doc(owner, 'testi', 'paper-complete'), { carta: 'righe' });
  await assertSucceeds(b.commit());
});
test('diario firmato: il nome pubblico è quello vero e solo se l’autore lo sceglie', async () => {
  const signed = { ...original('diary'), firmato: true };
  const copy = d => ({ ...projection(d), firma: d.author, autoreId: d.userId });
  const pair = (db, id, d, pub) => { const b = writeBatch(db); b.set(doc(db, 'pensieri', id), d); b.set(doc(db, 'testi', id), pub); return b.commit(); };
  await assertSucceeds(pair(owner, 'signed-diary', signed, copy(signed)));
  const pub = (await getDoc(doc(other, 'testi', 'signed-diary'))).data(); assert.equal(pub.firma, 'Autore privato'); assert.equal(pub.autoreId, 'owner');
  await assertFails(pair(owner, 'forged-name', signed, { ...copy(signed), firma: 'Qualcun altro' }));
  await assertFails(pair(owner, 'forged-id', signed, { ...copy(signed), autoreId: 'other' }));
  await assertFails(pair(owner, 'leaked-name', original('diary'), copy(original('diary'))));
  await assertFails(pair(owner, 'unsigned-copy', signed, projection(signed)));
  await assertFails(pair(owner, 'signed-complete', { ...original(), firmato: true }, projection(original())));
  // togliere la firma: originale e copia insieme, mai l'originale da solo
  await assertFails(updateDoc(doc(owner, 'pensieri', 'signed-diary'), { firmato: false }));
  const unsigned = { ...signed, firmato: false };
  await assertSucceeds(pair(owner, 'signed-diary', unsigned, projection(unsigned)));
  const after = (await getDoc(doc(other, 'testi', 'signed-diary'))).data(); assert.equal(after.firma, undefined); assert.equal(after.autoreId, undefined);
  await assertFails(updateDoc(doc(admin, 'pensieri', 'signed-diary'), { firmato: true }));
});

// ===== Scintille e pensieri nati da un altro =====
const today = () => Math.floor(Date.now() / 864e5);
const spark = (over = {}) => ({ cit: 'testo integrale dello scritto', pre: 'CONTENUTO RISERVATO, ', post: '.', tipo: 'bellissima', giorno: today(), ...over });
const sidOf = (name) => `sc-${name}`.padEnd(22, '0');
// accendere: la scintilla, la voce privata e l'elenco del tetto, tutto insieme
const light = (db, uid, id, sid, data = spark(), prev = []) => {
  const b = writeBatch(db);
  b.set(doc(db, 'pensieri', id, 'scintille', sid), data);
  b.set(doc(db, 'scintille_mie', uid, 'voci', sid), { pensieroId: id, giorno: data.giorno });
  b.set(doc(db, 'scintille_mie', uid, 'pezzi', id), { voci: [...prev, sid] });
  return b.commit();
};
const unlight = (db, uid, id, sid, rest) => {
  const b = writeBatch(db);
  b.delete(doc(db, 'pensieri', id, 'scintille', sid));
  b.delete(doc(db, 'scintille_mie', uid, 'voci', sid));
  b.set(doc(db, 'scintille_mie', uid, 'pezzi', id), { voci: rest });
  return b.commit();
};
let third;
test('un lettore accende una scintilla su un pensiero altrui: la legge l’autore, non gli altri lettori', async () => {
  third = env.authenticatedContext('third').firestore();
  await assertSucceeds(publish(owner, 'sp-diary', original('diary')));
  const sid = sidOf('base');
  await assertSucceeds(light(other, 'other', 'sp-diary', sid));
  const list = await assertSucceeds(getDocs(collection(owner, 'pensieri', 'sp-diary', 'scintille')));
  assert.equal(list.size, 1);
  const d = list.docs[0].data(); assert.equal(d.userId, undefined); assert.equal(d.tipo, 'bellissima');
  await assertSucceeds(getDocs(collection(admin, 'pensieri', 'sp-diary', 'scintille')));
  // chi l'ha accesa ritrova la propria, ma non vede quelle degli altri
  await assertSucceeds(getDoc(doc(other, 'pensieri', 'sp-diary', 'scintille', sid)));
  await assertFails(getDocs(collection(other, 'pensieri', 'sp-diary', 'scintille')));
  await assertFails(getDoc(doc(third, 'pensieri', 'sp-diary', 'scintille', sid)));
  await assertFails(getDocs(collection(third, 'pensieri', 'sp-diary', 'scintille')));
});
test('l’autore non sa chi ha acceso: scintille_mie è del lettore e degli admin', async () => {
  const sid = sidOf('base');
  await assertSucceeds(getDoc(doc(other, 'scintille_mie', 'other', 'voci', sid)));
  await assertSucceeds(getDocs(query(collection(other, 'scintille_mie', 'other', 'voci'), where('pensieroId', '==', 'sp-diary'))));
  await assertSucceeds(getDocs(query(collection(admin, 'scintille_mie', 'other', 'voci'), where('pensieroId', '==', 'sp-diary'))));
  await assertFails(getDoc(doc(owner, 'scintille_mie', 'other', 'voci', sid)));
  await assertFails(getDocs(collection(owner, 'scintille_mie', 'other', 'voci')));
  await assertFails(getDoc(doc(owner, 'scintille_mie', 'other', 'pezzi', 'sp-diary')));
});

test('le scintille dell’Admin portano il solo sigillo, non imitabile da altri account', async () => {
  const sid = sidOf('admin-sigillo');
  await assertSucceeds(light(admin, 'admin', 'sp-diary', sid, spark({ admin: true })));
  const s = (await assertSucceeds(getDoc(doc(owner, 'pensieri', 'sp-diary', 'scintille', sid)))).data();
  assert.equal(s.admin, true); assert.equal(s.userId, undefined); assert.equal(s.author, undefined);
  await assertFails(light(other, 'other', 'sp-diary', sidOf('falso-sigillo'), spark({ admin: true }), [sidOf('base')]));
  await assertFails(light(admin, 'admin', 'sp-diary', sidOf('sigillo-stringa'), spark({ admin: 'true' }), [sid]));
  await assertFails(updateDoc(doc(admin, 'pensieri', 'sp-diary', 'scintille', sid), { nota: 'Riscritta' }));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'admins', 'second-admin'), {}));
  const secondAdmin = env.authenticatedContext('second-admin').firestore();
  await assertFails(light(secondAdmin, 'second-admin', 'sp-diary', sidOf('secondo-sigillo'), spark({ admin: true })));
  // Il ruolo senza il sigillo personale continua a funzionare: nessun nuovo permesso per il badge.
  await assertSucceeds(light(secondAdmin, 'second-admin', 'sp-diary', sidOf('secondo-normale')));
});
test('niente scintille sul proprio pensiero, sui completi o su pensieri che non esistono', async () => {
  await assertFails(light(owner, 'owner', 'sp-diary', sidOf('own')));
  await assertFails(light(other, 'other', 'complete', sidOf('complete')));
  await assertFails(light(other, 'other', 'nessuno', sidOf('ghost')));
});
test('la scintilla resta senza identità e con i soli campi ammessi', async () => {
  for (const [name, data] of [['uid', spark({ userId: 'other' })], ['ora', spark({ timestamp: Date.now() })], ['tipo', spark({ tipo: 'voto' })],
    ['corta', spark({ cit: 'ok' })], ['lunga', spark({ cit: 'x'.repeat(281) })], ['nota', spark({ nota: 'x'.repeat(141) })],
    ['pre', spark({ pre: 'x'.repeat(41) })], ['giorno', spark({ giorno: today() - 5 })], ['millis', spark({ giorno: Date.now() })]]) {
    await assertFails(light(third, 'third', 'sp-diary', sidOf(`bad-${name}`), data));
  }
  await assertFails(light(third, 'third', 'sp-diary', 'corto', spark()));
  await assertSucceeds(light(third, 'third', 'sp-diary', sidOf('nota'), spark({ nota: 'Mi ci ritrovo.' })));
});
test('la scintilla nasce solo con la sua voce privata e il suo posto nel tetto', async () => {
  const sid = sidOf('alone');
  await assertFails(setDoc(doc(third, 'pensieri', 'sp-diary', 'scintille', sid), spark()));
  await assertFails(setDoc(doc(third, 'scintille_mie', 'third', 'voci', sid), { pensieroId: 'sp-diary', giorno: today() }));
  const b = writeBatch(third);
  b.set(doc(third, 'pensieri', 'sp-diary', 'scintille', sid), spark());
  b.set(doc(third, 'scintille_mie', 'third', 'voci', sid), { pensieroId: 'sp-diary', giorno: today() });
  await assertFails(b.commit());
  // la voce privata deve dire il vero sul pensiero
  const c = writeBatch(third);
  c.set(doc(third, 'pensieri', 'sp-diary', 'scintille', sid), spark());
  c.set(doc(third, 'scintille_mie', 'third', 'voci', sid), { pensieroId: 'diary', giorno: today() });
  c.set(doc(third, 'scintille_mie', 'third', 'pezzi', 'sp-diary'), { voci: [sidOf('nota'), sid] });
  await assertFails(c.commit());
  // e non si scrive nella voce di un altro
  await assertFails(light(third, 'other', 'sp-diary', sidOf('forged'), spark(), [sidOf('base')]));
});
test('al massimo 5 scintille per lettore e per pensiero, e il tetto non si aggira', async () => {
  await assertSucceeds(publish(owner, 'sp-five', original('diary')));
  const sids = [1, 2, 3, 4, 5].map((n) => sidOf(`five-${n}`));
  for (let i = 0; i < 5; i++) await assertSucceeds(light(other, 'other', 'sp-five', sids[i], spark(), sids.slice(0, i)));
  await assertFails(light(other, 'other', 'sp-five', sidOf('five-6'), spark(), sids));
  // l'elenco non si accorcia senza togliere davvero una scintilla
  await assertFails(setDoc(doc(other, 'scintille_mie', 'other', 'pezzi', 'sp-five'), { voci: sids.slice(1) }));
  await assertFails(setDoc(doc(other, 'scintille_mie', 'other', 'pezzi', 'sp-five'), { voci: [] }));
  // né si sostituisce una voce con un'altra
  await assertFails(light(other, 'other', 'sp-five', sidOf('five-7'), spark(), sids.slice(1)));
  // togliendone una si libera un posto
  await assertSucceeds(unlight(other, 'other', 'sp-five', sids[0], sids.slice(1)));
  await assertSucceeds(light(other, 'other', 'sp-five', sidOf('five-6'), spark(), sids.slice(1)));
});
test('si toglie solo da chi l’ha accesa, dall’autore o da un admin, mai a metà', async () => {
  const sid = sidOf('base');
  await assertFails(deleteDoc(doc(third, 'pensieri', 'sp-diary', 'scintille', sid)));
  await assertFails(deleteDoc(doc(other, 'pensieri', 'sp-diary', 'scintille', sid)));
  await assertFails(deleteDoc(doc(other, 'scintille_mie', 'other', 'voci', sid)));
  await assertSucceeds(unlight(other, 'other', 'sp-diary', sid, []));
  await assertSucceeds(light(other, 'other', 'sp-diary', sidOf('again'), spark(), []));
  // nessun aggiornamento: si toglie e si rifà
  await assertFails(updateDoc(doc(other, 'pensieri', 'sp-diary', 'scintille', sidOf('again')), { tipo: 'ridere' }));
  await assertSucceeds(deleteDoc(doc(owner, 'pensieri', 'sp-diary', 'scintille', sidOf('again'))));
  // tolta dall'autore: il lettore riordina le sue voci e ritrova il posto
  const b = writeBatch(other);
  b.delete(doc(other, 'scintille_mie', 'other', 'voci', sidOf('again')));
  b.set(doc(other, 'scintille_mie', 'other', 'pezzi', 'sp-diary'), { voci: [] });
  await assertSucceeds(b.commit());
  await assertSucceeds(deleteDoc(doc(admin, 'pensieri', 'sp-diary', 'scintille', sidOf('nota'))));
});
test('un lettore non può creare notifiche, nemmeno per una scintilla', async () => {
  await assertFails(setDoc(doc(other, 'notifiche', 'spark-note'), { userId: 'owner', pensieroId: 'sp-diary', titolo: 'Una pagina', voto: 5, timestamp: 1, letta: false }));
  await assertFails(setDoc(doc(other, 'notifiche', 'spark-note-2'), { userId: 'owner', pensieroId: 'sp-diary', tipo: 'scintilla', giorno: today() }));
});
test('ciò che l’autore ha già visto delle scintille resta suo', async () => {
  const seen = doc(owner, 'letture_scintille', 'owner', 'viste', `s_sp-diary_${today()}`);
  await assertSucceeds(setDoc(seen, { giorno: today(), n: 2 }));
  await assertSucceeds(getDoc(seen));
  await assertFails(getDoc(doc(other, 'letture_scintille', 'owner', 'viste', `s_sp-diary_${today()}`)));
  await assertFails(setDoc(doc(other, 'letture_scintille', 'owner', 'viste', 'x'), { giorno: 1, n: 1 }));
  await assertFails(setDoc(seen, { giorno: today(), n: 2, chi: 'other' }));
});
const nato = (from, cit = 'testo integrale dello scritto') => ({ ...original('diary'), userId: 'other', author: 'Altro', nataDa: { id: from, cit } });
const pairOf = (db, id, d, pub = { ...projection(d), ...(d.nataDa ? { nataDa: d.nataDa } : {}) }) => { const b = writeBatch(db); b.set(doc(db, 'pensieri', id), d); b.set(doc(db, 'testi', id), pub); return b.commit(); };
test('un pensiero può nascere da una frase di un altro pensiero del diario', async () => {
  await assertSucceeds(pairOf(other, 'eco-1', nato('sp-diary')));
  const pub = (await getDoc(doc(third, 'testi', 'eco-1'))).data();
  assert.deepEqual(pub.nataDa, { id: 'sp-diary', cit: 'testo integrale dello scritto' });
  // l'autore dell'origine trova gli echi, senza sapere chi li ha scritti
  const echi = await assertSucceeds(getDocs(query(collection(owner, 'testi'), where('version', '==', 2), where('nataDa.id', 'in', ['sp-diary', 'diary']))));
  assert.equal(echi.size, 1); assert.equal(echi.docs[0].data().autoreId, undefined);
});
test('il legame nataDa vale solo nel diario, verso un pensiero del diario che esiste, ed è immutabile', async () => {
  await assertFails(pairOf(other, 'eco-complete', { ...original(), userId: 'other', nataDa: { id: 'sp-diary', cit: 'x' } }));
  await assertFails(pairOf(other, 'eco-ghost', nato('nessuno')));
  await assertFails(pairOf(other, 'eco-from-complete', nato('complete')));
  await assertFails(pairOf(other, 'eco-long', nato('sp-diary', 'x'.repeat(281))));
  await assertFails(pairOf(other, 'eco-extra', { ...nato('sp-diary'), nataDa: { id: 'sp-diary', cit: 'x', chi: 'other' } }));
  // la copia pubblica porta lo stesso legame dell'originale
  const d = nato('sp-diary');
  await assertFails(pairOf(other, 'eco-nocopy', d, projection(d)));
  await assertFails(pairOf(other, 'eco-diffcopy', d, { ...projection(d), nataDa: { id: 'diary', cit: 'altro' } }));
  // dopo la pubblicazione non si cambia, né si toglie; il resto si modifica come sempre
  await assertFails(pairOf(other, 'eco-1', { ...d, nataDa: { id: 'diary', cit: 'altro' } }));
  const { nataDa, ...without } = d;
  await assertFails(pairOf(other, 'eco-1', without, projection(without)));
  const edit = writeBatch(other);
  edit.update(doc(other, 'pensieri', 'eco-1'), { title: 'Risposta', updatedAt: 9 });
  edit.update(doc(other, 'testi', 'eco-1'), { title: 'Risposta' });
  await assertSucceeds(edit.commit());
  // se l'origine viene ritirata, l'eco resta modificabile
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'pensieri', 'eco-origin'), original('diary')); });
  await assertSucceeds(pairOf(other, 'eco-2', nato('eco-origin')));
  await env.withSecurityRulesDisabled(async (ctx) => { await deleteDoc(doc(ctx.firestore(), 'pensieri', 'eco-origin')); });
  const later = writeBatch(other);
  later.update(doc(other, 'pensieri', 'eco-2'), { content: '<p>Ancora</p>', updatedAt: 10 });
  later.update(doc(other, 'testi', 'eco-2'), { content: '<p>Ancora</p>' });
  await assertSucceeds(later.commit());
});

// ===== Bozze salvate nel Circuito =====
const bozza = (over = {}) => ({ userId: 'owner', title: 'Un inizio', content: '<p>Ancora da finire</p>', strokes: [], w: 900, h: 600, kind: 'complete', createdAt: 1, updatedAt: 1, ...over });
test('una bozza la legge, la modifica e la cancella solo chi la scrive, nemmeno l’admin', async () => {
  await assertSucceeds(setDoc(doc(owner, 'bozze', 'b1'), bozza()));
  await assertSucceeds(getDoc(doc(owner, 'bozze', 'b1')));
  await assertSucceeds(getDocs(query(collection(owner, 'bozze'), where('userId', '==', 'owner'))));
  await assertFails(getDoc(doc(other, 'bozze', 'b1')));
  await assertFails(getDoc(doc(admin, 'bozze', 'b1')));
  await assertFails(getDocs(collection(other, 'bozze')));
  await assertFails(getDocs(query(collection(other, 'bozze'), where('userId', '==', 'owner'))));
  await assertFails(updateDoc(doc(other, 'bozze', 'b1'), { title: 'Mia' }));
  await assertFails(deleteDoc(doc(admin, 'bozze', 'b1')));
  await assertSucceeds(updateDoc(doc(owner, 'bozze', 'b1'), { content: '<p>Più avanti</p>', updatedAt: 2 }));
  await assertSucceeds(deleteDoc(doc(owner, 'bozze', 'b1')));
  await assertFails(getDoc(doc(guest, 'bozze', 'b1')));
});
test('una bozza non si intesta ad altri e rispetta i limiti di uno scritto', async () => {
  await assertFails(setDoc(doc(other, 'bozze', 'b2'), bozza()));
  for (const over of [{ kind: 'voto' }, { title: 'x'.repeat(201) }, { carta: 'pergamena' }, { rating: 5 }, { strokes: 'no' }, { nataDa: { id: 'x', cit: 'y', chi: 'z' } }]) {
    await assertFails(setDoc(doc(owner, 'bozze', 'b2'), bozza(over)));
  }
  await assertSucceeds(setDoc(doc(owner, 'bozze', 'b2'), bozza({ kind: 'diary', firmato: true, carta: 'righe', nataDa: { id: 'diary', cit: 'una frase' } })));
  await assertFails(updateDoc(doc(owner, 'bozze', 'b2'), { userId: 'other' }));
  await assertFails(updateDoc(doc(owner, 'bozze', 'b2'), { createdAt: 9 }));
});
test('pubblicare da una bozza: lo scritto nasce e la bozza se ne va, insieme', async () => {
  await assertSucceeds(setDoc(doc(owner, 'bozze', 'b3'), bozza()));
  const d = original(), b = writeBatch(owner);
  b.set(doc(owner, 'pensieri', 'from-draft'), d); b.set(doc(owner, 'testi', 'from-draft'), projection(d)); b.delete(doc(owner, 'bozze', 'b3'));
  await assertSucceeds(b.commit());
  assert.equal((await getDoc(doc(owner, 'pensieri', 'from-draft'))).exists(), true);
});
