// FrameTimeline works for both native surfaces and WebView; gfxinfo alone does not
// account for all Chromium rendering work. Run only on these isolated preview apps.
const fs=require('node:fs'),path=require('node:path'),{execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),root=path.resolve(__dirname,'../..');
const adb=process.env.ADB || path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe'),serial=process.env.ANDROID_SERIAL;
const pkg=process.argv[2],label=process.argv[3]||'sample';
if(!serial)throw Error('Set ANDROID_SERIAL to the authorized test phone.');
if(!['com.IlCircuito.nativepreview','com.IlCircuito.webbenchmark'].includes(pkg))throw Error('Only Circuito preview packages can be benchmarked.');
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid output label');
const output=path.join(root,'.optimization/native-measurements');fs.mkdirSync(output,{recursive:true});
const call=(args,options={})=>run(adb,['-s',serial,...args],{timeout:30000,maxBuffer:4e6,...options}).then(r=>r.stdout);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ui(){await call(['shell','uiautomator','dump','/sdcard/circuito-preview.xml']);const xml=await call(['shell','cat','/sdcard/circuito-preview.xml']);if(!xml.includes(`package="${pkg}"`))throw Error('Preview is not foreground; unlock the phone and retry.');return xml;}
async function offline(){
  let xml=await ui();
  const light=xml.match(/<node[^>]*content-desc="Attiva tema chiaro"[^>]*>/)?.[0];
  if(light){await tap(light);await sleep(500);xml=await ui();}
  const node=xml.match(/<node[^>]*content-desc="Esplora anteprima offline"[^>]*>/)?.[0];
  if(node){await tap(node);await sleep(1500);xml=await ui();}
  if(!xml.includes('Anteprima offline'))throw Error('Native benchmark requires the local offline preview, never a real account.');
}
async function tap(node){
  const b=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/).slice(1).map(Number);
  await call(['shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2))]);
}
(async()=>{
  const size=await call(['shell','wm','size']),matches=[...size.matchAll(/(\d+)x(\d+)/g)], [w,h]=matches[matches.length-1].slice(1).map(Number);
  const config=`buffers { size_kb: 8192 fill_policy: RING_BUFFER }\nduration_ms: 16000\ndata_sources { config { name: "android.surfaceflinger.frametimeline" } }\ndata_sources { config { name: "linux.process_stats" process_stats_config { scan_all_processes_on_start: true } } }`;
  const results=[];
  for(let trial=1;trial<=3;trial++){
    await call(['shell','am','force-stop',pkg]);
    const launch=await call(['shell','am','start','-W','-n',pkg+'/.MainActivity']);await sleep(2500);
    if(pkg.endsWith('nativepreview'))await offline();
    const remote=`/data/misc/perfetto-traces/circuito-${label}-${trial}.perfetto-trace`,local=path.join(output,`${label}-${trial}.perfetto-trace`);
    const trace=new Promise((resolve,reject)=>{
      const child=execFile(adb,['-s',serial,'shell','perfetto','--txt','-c','-','-o',remote],{timeout:25000,maxBuffer:1e6},(e,stdout,stderr)=>e?reject(Error(stderr||e.message)):resolve(stdout));
      child.stdin.end(config);
    });
    await sleep(1500);
    for(let i=0;i<12;i++){
      const up=i<8;await call(['shell','input','swipe',String(Math.round(w*.5)),String(Math.round(h*(up?.77:.3))),String(Math.round(w*.5)),String(Math.round(h*(up?.3:.77))),'450']);await sleep(160);
    }
    await trace;await call(['pull',remote,local]);
    const sql=`SELECT p.name, count(*) AS frames, round(100.0*sum(CASE WHEN jank_type != 'None' THEN 1 ELSE 0 END)/count(*),2) AS jank_percent, round(avg(dur)/1000000.0,2) AS mean_frame_duration_ms FROM actual_frame_timeline_slice f JOIN process p USING(upid) WHERE p.name = '${pkg}' AND f.dur>0 AND f.layer_name IS NOT NULL GROUP BY p.name;`;
    const csv=execFileSync(path.join(root,'.optimization/trace_processor_shell.exe'),['-Q',sql,local],{encoding:'utf8',timeout:30000});
    fs.writeFileSync(path.join(output,`${label}-${trial}.csv`),csv);
    const result={trial,activityLaunchMs:Number(launch.match(/TotalTime:\s*(\d+)/)?.[1]),csv:csv.trim()};results.push(result);console.log(JSON.stringify(result));
  }
  fs.writeFileSync(path.join(output,`${label}.json`),JSON.stringify({package:pkg,scenario:'Release, synthetic Diary dataset, 8 forward + 4 backward swipes per trial; no network',results},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
