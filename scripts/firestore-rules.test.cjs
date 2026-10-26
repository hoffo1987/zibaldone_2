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

// ===== Staffetta =====
const meseOf = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const thisMonth = meseOf(new Date());
const PAST = '2020-01';
const source = (over = {}) => ({ ...original(), title: 'Dal podio', content: '<p>Il treno partì all’alba, senza nessuno a bordo. Poi il resto, riservato, che nessuno deve leggere per intero mai: il viaggio, le stazioni vuote, il macchinista che non c’era e la neve che copriva i binari fino all’orizzonte.</p>', excerpt: 'Il treno partì all’alba, senza nessuno a bordo.', ...over });
// l'incipit e la sua fonte nascono insieme
const startRelay = (db, mese, frase, fonte) => {
  const b = writeBatch(db);
  b.set(doc(db, 'staffetta', mese), { frase, creato: Date.now() });
  b.set(doc(db, 'staffetta', mese, 'riservato', 'fonte'), { id: fonte });
  return b.commit();
};
const chapter = (over = {}) => ({ ...original(), userId: 'other', author: 'Altro autore', title: 'Capitolo', content: '<p>Il capitolo continua la frase, con il suo seguito integrale.</p>', excerpt: 'Il capitolo', staffetta: thisMonth, ...over });
const pubChapter = (d) => ({ ...projection(d), staffetta: d.staffetta });
const writeChapter = (db, id, d, pub = pubChapter(d)) => { const b = writeBatch(db); b.set(doc(db, 'pensieri', id), d); b.set(doc(db, 'testi', id), pub); return b.commit(); };
test('la staffetta: l’incipit viene solo da uno scritto completo svelato, con una frase del suo estratto pubblico', async () => {
  await assertSucceeds(publish(owner, 'relay-src', source()));
  await assertSucceeds(publish(owner, 'relay-hidden', source()));
  await assertSucceeds(setDoc(doc(admin, 'valutazioni', 'relay-src'), { voto: 4.5, updatedAt: 1 }));
  await assertSucceeds(updateDoc(doc(admin, 'pensieri', 'relay-src'), { rating: 4.5, svelato: true }));
  // non svelato, diario, frase fuori dall'estratto (anche se nel testo integrale), oltre la fine dell'estratto
  await assertFails(startRelay(admin, '2031-01', 'Il treno partì', 'relay-hidden'));
  await assertFails(startRelay(admin, '2031-01', 'testo integrale', 'diary'));
  await assertFails(startRelay(admin, '2031-01', 'nessuno deve leggere', 'relay-src'));
  await assertFails(startRelay(admin, '2031-01', 'Il treno partì all’alba, senza nessuno a bordo. Poi', 'relay-src'));
  // mese finto, spazi ai bordi
  await assertFails(startRelay(admin, '2031-13', 'Il treno partì', 'relay-src'));
  await assertFails(startRelay(admin, '2031-01', ' Il treno', 'relay-src'));
  // l'incipit non si pubblica senza fonte, né lo pubblica chi non è admin
  await assertFails(setDoc(doc(admin, 'staffetta', '2031-01'), { frase: 'Il treno partì', creato: 1 }));
  await assertFails(startRelay(owner, '2031-01', 'Il treno partì', 'relay-src'));
  await assertSucceeds(startRelay(admin, thisMonth, 'Il treno partì all’alba', 'relay-src'));
  // nell'incipit pubblico c'è solo la frase: la fonte la legge solo l'admin
  const pub = (await assertSucceeds(getDoc(doc(other, 'staffetta', thisMonth)))).data();
  assert.deepEqual(Object.keys(pub).sort(), ['creato', 'frase']);
  await assertFails(getDoc(doc(other, 'staffetta', thisMonth, 'riservato', 'fonte')));
  await assertFails(getDoc(doc(owner, 'staffetta', thisMonth, 'riservato', 'fonte')));
  await assertSucceeds(getDoc(doc(admin, 'staffetta', thisMonth, 'riservato', 'fonte')));
  const extra = writeBatch(admin);
  extra.set(doc(admin, 'staffetta', '2031-02'), { frase: 'Il treno partì', creato: 1, fonte: 'relay-src' });
  extra.set(doc(admin, 'staffetta', '2031-02', 'riservato', 'fonte'), { id: 'relay-src' });
  await assertFails(extra.commit());
  // il confronto è allineato ai byte: in «d$$ » (64 24 24 20) «BBB» (42 42 42) compare solo a metà dei byte
  await assertSucceeds(publish(owner, 'relay-odd', source({ excerpt: 'Ad$$ Z' })));
  await assertSucceeds(setDoc(doc(admin, 'valutazioni', 'relay-odd'), { voto: 3, updatedAt: 1 }));
  await assertSucceeds(updateDoc(doc(admin, 'pensieri', 'relay-odd'), { rating: 3, svelato: true }));
  await assertFails(startRelay(admin, '2031-03', 'BBB', 'relay-odd'));
  await assertSucceeds(startRelay(admin, '2031-03', 'd$$', 'relay-odd'));
  // cambiare la fonte con una che non contiene la frase non si può
  await assertFails(setDoc(doc(admin, 'staffetta', thisMonth, 'riservato', 'fonte'), { id: 'complete' }));
  await assertFails(getDoc(doc(guest, 'staffetta', thisMonth)));
});
test('un capitolo è uno scritto completo anonimo, legato all’incipit del mese e solo nel suo mese', async () => {
  await assertSucceeds(writeChapter(other, 'cap-1', chapter()));
  // gli altri lo trovano tra i capitoli, con il solo estratto e senza nome
  const list = await assertSucceeds(getDocs(query(collection(third, 'testi'), where('version', '==', 2), where('staffetta', '==', thisMonth))));
  assert.equal(list.size, 1);
  const pub = list.docs[0].data(); assert.equal(pub.content, undefined); assert.equal(pub.author, undefined); assert.equal(pub.userId, undefined); assert.equal(pub.excerpt, 'Il capitolo');
  await assertFails(getDoc(doc(third, 'pensieri', 'cap-1')));
  // la copia porta lo stesso legame; senza incipit, fuori dal mese, nel diario o con un mese finto non si scrive
  await assertFails(writeChapter(other, 'cap-nocopy', chapter(), projection(chapter())));
  await assertFails(writeChapter(other, 'cap-future', chapter({ staffetta: '2031-01' })));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'staffetta', PAST), { frase: 'Il treno partì', creato: 1 }));
  await assertFails(writeChapter(other, 'cap-past', chapter({ staffetta: PAST })));
  await assertFails(writeChapter(other, 'cap-diary', chapter({ kind: 'diary', excerpt: '' })));
  await assertFails(writeChapter(other, 'cap-bad', chapter({ staffetta: 'ottobre' })));
  const legacy = chapter(); delete legacy.kind;
  await assertFails(setDoc(doc(other, 'pensieri', 'cap-legacy'), legacy));
  // il legame non si cambia né si toglie; il resto si modifica come sempre, e voto e svelamento restano quelli di sempre
  await assertFails(writeChapter(other, 'cap-1', chapter({ staffetta: PAST })));
  const { staffetta, ...without } = chapter();
  await assertFails(writeChapter(other, 'cap-1', without, projection(without)));
  const edit = writeBatch(other);
  edit.update(doc(other, 'pensieri', 'cap-1'), { title: 'Capitolo primo', updatedAt: 5 });
  edit.update(doc(other, 'testi', 'cap-1'), { title: 'Capitolo primo' });
  await assertSucceeds(edit.commit());
  await assertSucceeds(setDoc(doc(admin, 'valutazioni', 'cap-1'), { voto: 4, updatedAt: 6 }));
  await assertSucceeds(updateDoc(doc(admin, 'pensieri', 'cap-1'), { rating: 4, svelato: true }));
  await assertFails(updateDoc(doc(admin, 'pensieri', 'cap-1'), { staffetta: PAST }));
});
test('il racconto collettivo: l’admin sceglie in privato e pubblica i capitoli per intero dal giorno dello svelamento', async () => {
  // la scelta resta dell'admin
  await assertSucceeds(setDoc(doc(admin, 'staffetta', thisMonth, 'riservato', 'scelta'), { ids: ['cap-1'] }));
  await assertFails(getDoc(doc(other, 'staffetta', thisMonth, 'riservato', 'scelta')));
  await assertFails(setDoc(doc(other, 'staffetta', thisMonth, 'riservato', 'scelta'), { ids: ['cap-1'] }));
  // prima dello svelamento il capitolo del mese non si pubblica, neppure dall'admin
  const cap = (await getDoc(doc(admin, 'pensieri', 'cap-1'))).data();
  const copy = (d, ordine = 0) => ({ ordine, title: d.title, content: d.content, firma: d.author, autoreId: d.userId });
  await assertFails(setDoc(doc(admin, 'staffetta', thisMonth, 'capitoli', 'cap-1'), copy(cap)));
  // un mese già svelato: capitoli scritti allora, pubblicati ora
  const old = chapter({ staffetta: PAST, title: 'Il capitolo vecchio' });
  await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), 'pensieri', 'cap-old'), old); await setDoc(doc(ctx.firestore(), 'testi', 'cap-old'), pubChapter(old)); });
  await assertFails(setDoc(doc(other, 'staffetta', PAST, 'capitoli', 'cap-old'), copy(old)));
  // il testo, il titolo e il nome sono quelli dell'originale; niente voti né altri campi
  await assertFails(setDoc(doc(admin, 'staffetta', PAST, 'capitoli', 'cap-old'), { ...copy(old), content: '<p>Riscritto</p>' }));
  await assertFails(setDoc(doc(admin, 'staffetta', PAST, 'capitoli', 'cap-old'), { ...copy(old), firma: 'Qualcun altro' }));
  await assertFails(setDoc(doc(admin, 'staffetta', PAST, 'capitoli', 'cap-old'), { ...copy(old), autoreId: 'third' }));
  await assertFails(setDoc(doc(admin, 'staffetta', PAST, 'capitoli', 'cap-old'), { ...copy(old), voto: 5 }));
  // solo i capitoli di quel mese
  await assertFails(setDoc(doc(admin, 'staffetta', PAST, 'capitoli', 'complete'), copy(original())));
  await assertSucceeds(setDoc(doc(admin, 'staffetta', PAST, 'capitoli', 'cap-old'), copy(old)));
  const read = (await assertSucceeds(getDoc(doc(third, 'staffetta', PAST, 'capitoli', 'cap-old')))).data();
  assert.equal(read.content, old.content); assert.equal(read.firma, 'Altro autore');
  await assertSucceeds(getDocs(collection(third, 'staffetta', PAST, 'capitoli')));
  await assertFails(getDocs(collection(guest, 'staffetta', PAST, 'capitoli')));
  // l'autore può ritirare il suo capitolo dal racconto, gli altri no
  await assertFails(deleteDoc(doc(third, 'staffetta', PAST, 'capitoli', 'cap-old')));
  await assertSucceeds(deleteDoc(doc(other, 'staffetta', PAST, 'capitoli', 'cap-old')));
});
