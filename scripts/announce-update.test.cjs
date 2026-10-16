const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { announcement, publish } = require('./announce-update.cjs');
const originalFetch=global.fetch, commit='a'.repeat(40), env={...process.env};
afterEach(()=>{global.fetch=originalFetch;process.env= {...env};});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function mock({latest=commit,state='success',exists=false}={}) {
 const writes=[];
 process.env.GH_TOKEN='test';process.env.FIREBASE_RELEASE_EMAIL='publisher@test.invalid';process.env.FIREBASE_RELEASE_PASSWORD='fake-test-password';delete process.env.GITHUB_ACTIONS;
 global.fetch=async(url,options={})=>{
  if(url.endsWith('/commits/main'))return response({sha:latest});
  if(url.endsWith('/status'))return response({statuses:[{context:'Vercel – ilcircuito',state}]});
  if(url.includes('signInWithPassword'))return response({idToken:'fake-token'});
  if(options.method==='PATCH') {writes.push(JSON.parse(options.body));return response({});}
  if(url.includes('/aggiornamenti/'))return response({},exists?200:404);
  throw Error('Unexpected URL');
 };return writes;
}
test('un deploy riuscito genera un solo annuncio con versione e commit corretti',async()=>{
 const writes=mock();await publish(commit);assert.equal(writes.length,1);assert.equal(writes[0].fields.commit.stringValue,commit);assert.match(writes[0].fields.versione.stringValue,/^\d+\.\d+\.\d+$/);
});
test('un deploy fallito non invia notifiche',async()=>{const writes=mock({state:'failure'});await assert.rejects(()=>publish(commit),/Production deployment failed/);assert.equal(writes.length,0);});
test('un commit superato da una revisione più recente non invia notifiche',async()=>{const writes=mock({latest:'b'.repeat(40)});await publish(commit);assert.equal(writes.length,0);});
test('ripetere la pipeline non duplica la notifica',async()=>{const writes=mock({exists:true});await publish(commit);assert.equal(writes.length,0);});
test('identificatori non validi non possono creare annunci',()=>{assert.throws(()=>announcement('../notifiche'),/Invalid release commit/);});
