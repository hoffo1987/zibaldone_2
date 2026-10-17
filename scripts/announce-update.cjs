// Run by CI only after verification, native builds and the production deployment succeed.
// The publisher is a dedicated Firebase Auth user with permission to create announcements only.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const project = 'zibaldone-1-prova';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const version = () => fs.readFileSync('android/app/build.gradle','utf8').match(/versionName\s+"([^"]+)"/)[1];
// Every application commit needs its OWN user-facing summary. Never reuse a version's
// announcement or fall back to generic text. See AGENTS.md before changing this policy.
const normalized = text => text.trim().replace(/\s+/g, ' ').toLowerCase().replace(/[.!]+$/, '');
function validateNotes(notes) {
  if (!notes || typeof notes.titolo !== 'string' || typeof notes.messaggio !== 'string') {
    throw Error('release-notes.json deve contenere titolo e messaggio dell’aggiornamento corrente, senza chiavi per versione.');
  }
  const titolo = notes.titolo.trim(), messaggio = notes.messaggio.trim();
  if (titolo.length < 5 || titolo.length > 140 || messaggio.length < 40 || messaggio.length > 1600) {
    throw Error('Il riepilogo deve avere un titolo di 5–140 caratteri e un messaggio di 40–1600 caratteri.');
  }
  if (/^(?:è disponibile un aggiornamento di il circuito,? con )?(?:correzioni e miglioramenti|miglioramenti e correzioni)(?:[.,].*)?$/.test(normalized(messaggio)) ||
      normalized(messaggio) === normalized('Da oggi trovi qui anche gli aggiornamenti di Il Circuito. Gli annunci arrivano a tutti gli utenti; leggerli sul tuo account non li segna come letti per gli altri.')) {
    throw Error('Scrivi un riepilogo specifico delle modifiche: i messaggi generici non sono ammessi.');
  }
  return { titolo, messaggio };
}
const applicationChanged = paths => paths.some(p =>
  !/(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\.(?:md|txt)$|(?:^|\/)__tests__\/)/.test(p) &&
  /^(?:src\/|public\/|native\/|android\/|ios\/|capacitor\.config|package(?:-lock)?\.json$|release-notes\.json$|firestore\.rules$|scripts\/(?:build\.cjs|announce-update\.cjs)$)/.test(p));
function validateReleaseNotes(paths, notes, previous) {
  if (!applicationChanged(paths)) return false;
  if (!paths.includes('release-notes.json')) throw Error('Aggiorna release-notes.json nello stesso commit delle modifiche all’app.');
  const current = validateNotes(notes);
  const older = previous?.messaggio ? [previous] : Object.values(previous || {});
  if (older.some(note => typeof note?.messaggio === 'string' && normalized(note.messaggio) === normalized(current.messaggio))) {
    throw Error('Il riepilogo è uguale al precedente: descrivi il nuovo aggiornamento in release-notes.json.');
  }
  return true;
}
function checkReleaseNotes({ committed = process.env.GITHUB_ACTIONS === 'true' } = {}) {
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const paths = git(['diff', '--name-only', ...(committed ? ['HEAD^', 'HEAD'] : ['HEAD'])]).split(/\r?\n/).filter(Boolean);
  if (!applicationChanged(paths)) { console.log('No application changes; no announcement.'); return false; }
  const notes = JSON.parse(fs.readFileSync('release-notes.json', 'utf8'));
  const previous = JSON.parse(git(['show', `${committed ? 'HEAD^' : 'HEAD'}:release-notes.json`]));
  validateReleaseNotes(paths, notes, previous);
  console.log('Release summary verified for this update.');
  return true;
}
function announcement(commit, timestamp = Date.now(), notes = JSON.parse(fs.readFileSync('release-notes.json', 'utf8'))) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid release commit');
  return { ...validateNotes(notes), versione: version(), timestamp, commit };
}
const encode = data => Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));
async function waitForProduction(commit) {
  const token=process.env.GH_TOKEN, repo=process.env.GITHUB_REPOSITORY || 'hoffo1987/zibaldone_2';
  const get = async path => { const r=await fetch(`https://api.github.com/repos/${repo}/${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'}}); if(!r.ok)throw Error(`GitHub status check failed (${r.status})`); return r.json(); };
  for(let attempt=0;attempt<18;attempt++) {
    const current=await get('commits/main');
    if(current.sha!==commit) { console.log('A newer revision superseded this deployment; no announcement.'); return false; }
    const status=await get(`commits/${commit}/status`), deploy=status.statuses.find(s=>s.context==='Vercel – ilcircuito');
    if(deploy?.state==='success')return true;
    if(['failure','error'].includes(deploy?.state))throw Error('Production deployment failed; announcement not published');
    await new Promise(resolve=>setTimeout(resolve,20000));
  }
  throw Error('Production deployment not confirmed; announcement not published');
}
async function publish(commit) {
  if(process.env.GITHUB_ACTIONS==='true' && !checkReleaseNotes({ committed: true })) return;
  const message = announcement(commit);
  if(!await waitForProduction(commit))return;
  const email=process.env.FIREBASE_RELEASE_EMAIL, password=process.env.FIREBASE_RELEASE_PASSWORD;
  if(!email||!password)throw Error('Missing release publisher credentials');
  const app=fs.readFileSync('src/App.tsx','utf8'), key=app.match(/apiKey:\s*"([^"]+)"/)[1];
  const auth=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  if(!auth.ok)throw Error(`Publisher authentication failed (${auth.status})`);
  const { idToken }=await auth.json(), headers={Authorization:`Bearer ${idToken}`,'Content-Type':'application/json'};
  const url=`${base}/aggiornamenti/${commit}`;
  const previous=await fetch(url,{headers});
  if(previous.ok) {console.log('Announcement already published; no duplicate.');return;}
  if(previous.status!==404)throw Error(`Cannot check existing announcement (${previous.status})`);
  const body={fields:encode({...message, timestamp: Date.now()})};
  const response=await fetch(url+'?currentDocument.exists=false',{method:'PATCH',headers,body:JSON.stringify(body)});
  if(!response.ok)throw Error(`Announcement publication failed (${response.status})`);
  console.log(`Update announcement published for ${version()}.`);
}
module.exports={announcement,encode,waitForProduction,publish,validateNotes,validateReleaseNotes,checkReleaseNotes};
if(require.main===module) {
  Promise.resolve().then(() => process.argv.includes('--check') ? checkReleaseNotes() : publish(process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()))
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
