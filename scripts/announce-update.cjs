// Run by CI only after verification, native builds and the production deployment succeed.
// The publisher is a dedicated Firebase Auth user with permission to create announcements only.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const project = 'zibaldone-1-prova';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const version = () => fs.readFileSync('android/app/build.gradle','utf8').match(/versionName\s+"([^"]+)"/)[1];
function announcement(commit, timestamp = Date.now()) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid release commit');
  const v = version(), notes = JSON.parse(fs.readFileSync('release-notes.json','utf8'))[v];
  return { titolo: notes?.titolo || 'Il Circuito si è aggiornato', messaggio: notes?.messaggio || 'È disponibile un aggiornamento di Il Circuito, con correzioni e miglioramenti. Apri il sito aggiornato o usa l’ultima versione dell’app.', versione: v, timestamp, commit };
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
  if(process.env.GITHUB_ACTIONS==='true') {
    const changed=execFileSync('git',['diff','--name-only','HEAD^','HEAD'],{encoding:'utf8'}).trim().split('\n');
    if(!changed.some(p=>/^(src\/|public\/|android\/|ios\/|capacitor\.config|package(-lock)?\.json|release-notes\.json|firestore\.rules|scripts\/(build|announce-update\.cjs))/.test(p))) {
      console.log('No application changes; no announcement.'); return;
    }
  }
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
  const body={fields:encode(announcement(commit))};
  const response=await fetch(url+'?currentDocument.exists=false',{method:'PATCH',headers,body:JSON.stringify(body)});
  if(!response.ok)throw Error(`Announcement publication failed (${response.status})`);
  console.log(`Update announcement published for ${version()}.`);
}
module.exports={announcement,encode,waitForProduction,publish};
if(require.main===module)publish(process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()).catch(e=>{console.error(e.message);process.exitCode=1;});
