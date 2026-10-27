const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { announcement, publish, validateNotes, validateReleaseNotes } = require('./announce-update.cjs');
const originalFetch=global.fetch, commit='a'.repeat(40), env={...process.env};
afterEach(()=>{global.fetch=originalFetch;process.env= {...env};});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function mock({latest=commit,state='success',exists=false,context='Vercel'}={}) {
 const writes=[];
 process.env.GH_TOKEN='test';process.env.FIREBASE_RELEASE_EMAIL='publisher@test.invalid';process.env.FIREBASE_RELEASE_PASSWORD='fake-test-password';delete process.env.GITHUB_ACTIONS;
 global.fetch=async(url,options={})=>{
  if(url.endsWith('/commits/main'))return response({sha:latest});
  if(url.endsWith('/status'))return response({statuses:[{context,state}]});
  if(url.includes('signInWithPassword'))return response({idToken:'fake-token'});
  if(options.method==='PATCH') {writes.push(JSON.parse(options.body));return response({});}
  if(url.includes('/aggiornamenti/'))return response({},exists?200:404);
  throw Error('Unexpected URL');
 };return writes;
}
test('un deploy riuscito genera un solo annuncio con versione e commit corretti',async()=>{
 const writes=mock();await publish(commit);assert.equal(writes.length,1);assert.equal(writes[0].fields.commit.stringValue,commit);assert.match(writes[0].fields.versione.stringValue,/^\d+\.\d+\.\d+$/);
});
test('vale anche il vecchio nome dello stato di Vercel',async()=>{const writes=mock({context:'Vercel – ilcircuito'});await publish(commit);assert.equal(writes.length,1);});
test('un deploy fallito non invia notifiche',async()=>{const writes=mock({state:'failure'});await assert.rejects(()=>publish(commit),/Production deployment failed/);assert.equal(writes.length,0);});
test('un commit superato da una revisione più recente non invia notifiche',async()=>{const writes=mock({latest:'b'.repeat(40)});await publish(commit);assert.equal(writes.length,0);});
test('ripetere la pipeline non duplica la notifica',async()=>{const writes=mock({exists:true});await publish(commit);assert.equal(writes.length,0);});
test('identificatori non validi non possono creare annunci',()=>{assert.throws(()=>announcement('../notifiche'),/Invalid release commit/);});

const notes = { titolo: 'Diario e Scritti nella barra', messaggio: 'Diario e Scritti sono ora vicini nella barra mobile. I miei scritti si trova nel menu Altro.' };
test('due aggiornamenti della stessa versione usano i rispettivi riepiloghi',()=>{
 const next={titolo:'Lettore mobile corretto',messaggio:'Il foglio ora segue la lunghezza del testo e il lettore mobile occupa lo schermo intero.'};
 const first=announcement(commit,1,notes),second=announcement('b'.repeat(40),2,next);
 assert.equal(first.versione,second.versione);assert.equal(first.messaggio,notes.messaggio);assert.equal(second.messaggio,next.messaggio);
});
test('ogni modifica all’app richiede le note nello stesso commit',()=>{
 assert.throws(()=>validateReleaseNotes(['src/Navigation.tsx'],notes,null),/stesso commit/);
 assert.equal(validateReleaseNotes(['src/Navigation.tsx','release-notes.json'],notes,null),true);
});
test('cambiare titolo, spazi o maiuscole non permette di riusare lo stesso riepilogo',()=>{
 assert.throws(()=>validateReleaseNotes(['src/App.tsx','release-notes.json'],{...notes,titolo:'Titolo diverso',messaggio:'  '+notes.messaggio.toUpperCase()+'  '},notes),/uguale al precedente/);
});
test('il vecchio formato per versione e i messaggi generici non hanno un fallback',()=>{
 assert.throws(()=>validateNotes({'1.0.5':notes}),/senza chiavi per versione/);
 assert.throws(()=>validateNotes({...notes,messaggio:'È disponibile un aggiornamento di Il Circuito, con correzioni e miglioramenti. Apri il sito aggiornato o usa l’ultima versione dell’app.'}),/generici/);
 assert.throws(()=>validateNotes({...notes,messaggio:''}),/riepilogo/);
});
test('documentazione e soli test non generano annunci',()=>{
 assert.equal(validateReleaseNotes(['README.md','AGENTS.md','src/Navigation.test.js','scripts/announce-update.test.cjs'],null,null),false);
});
test('un riepilogo troppo lungo non può arrivare a Firestore',()=>{
 assert.throws(()=>validateNotes({...notes,messaggio:'x'.repeat(1601)}),/1600/);
});
