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
  env = await initializeTestEnvironment({ projectId: 'demo-circuito', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8180 } });
  await env.clearFirestore();
  owner = env.authenticatedContext('owner').firestore(); other = env.authenticatedContext('other').firestore(); admin = env.authenticatedContext('admin').firestore(); guest = env.unauthenticatedContext().firestore();
  publisher = env.authenticatedContext('publisher', { releasePublisher:true }).firestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'admin'), {});
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
