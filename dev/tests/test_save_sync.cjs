// Save-sync regressions for the actual account module, including legacy-save migration. No Firebase traffic.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=process.env.SAVE_REVIEW_ROOT||require('path').resolve(__dirname,'../..');
const src=fs.readFileSync(root+'/dev/v29_account.js','utf8');
const html=fs.readFileSync(root+'/index.html','utf8');
function fn(name){const m=new RegExp('(?:async )?function '+name+'\\s*\\(').exec(src);assert(m,name);for(let end=src.indexOf('}',m.index);end>=0;end=src.indexOf('}',end+1)){const code=src.slice(m.index,end+1);try{new vm.Script('('+code+')');return code}catch{}}throw Error('parse '+name)}
function slice(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert(i>=0&&j>i);return src.slice(i,j)}
const initial=({coins=150,at=10000}={})=>({name:'MASTER',coins,savedAt:at});
function world(local=initial(),remote=initial({coins:900,at:20000})){
  const disk=new Map([['damaworld.v1',JSON.stringify(local)]]),session=new Map(),writes=[];
  const cloud={name:remote.name,nameKey:'master',saveAt:remote.savedAt,save:JSON.stringify(remote)};
  return {disk,session,writes,cloud,failGet:false,failSet:false,cache:null,now:30000};
}
function boot(w){
  const timers=new Map();let next=0,loads=0;
  const user={uid:'u_test',isAnonymous:false};
  const st=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>{if(map===w.disk&&w.failSet)throw Error('QuotaExceededError');map.set(k,String(v))},removeItem:k=>map.delete(k)});
  const c=vm.createContext({console,JSON,Math,Promise,Date:{now:()=>w.now},S:JSON.parse(w.disk.get('damaworld.v1')),localStorage:st(w.disk),sessionStorage:st(w.session),
    window:{},location:{reload(){loads++}},toast(){},accUI(){},updateProfile(){},closeLayer(){},accNameDlg(){},accLoginDlg(){},
    setTimeout:(f,ms)=>{timers.set(++next,{f,ms});return next},clearTimeout:id=>timers.delete(id),
    ONL:{user,auth:{currentUser:user},db:{collection:()=>({doc:()=>({
      get:async()=>{if(w.failGet)throw Error('offline');return {exists:true,metadata:{fromCache:!!w.cache},data:()=>w.cache||{...w.cloud}}},
      set:async d=>{w.writes.push(structuredClone(d));Object.assign(w.cloud,d)}
    })})}},onlInit:async()=>{},level:()=>1});
  vm.runInContext(slice('const ACC=','(function(){const css='),c);
  vm.runInContext("function persist(){localStorage.setItem('damaworld.v1',JSON.stringify(S))}",c);
  for(const name of ['accBoot','accSync','accSync0','accAdopt','accRaw','accUpload','accAfterLogin','accMark'])vm.runInContext(fn(name),c);
  vm.runInContext(slice('const _persist29=','/* ---------- نافذة التسجيل'),c);
  return {c,timers,state:()=>vm.runInContext('({coins:S.coins,savedAt:S.savedAt,bootLocalAt:ACC.bootLocalAt,editAt:S.editAt,synced:ACC.synced,reloading:ACC.reloading})',c),loads:()=>loads};
}
function coins(w){return JSON.parse(w.cloud.save).coins}
const results=[];
async function run(name,f){const detail=await f();results.push({name,...detail});console.log(name,JSON.stringify(detail))}
const withEdit=(coins,at)=>({...initial({coins,at}),editAt:at});
(async()=>{
 await run('CONTROL_BUILT_MODULE_MATCHES',()=>{const start=html.indexOf('/* ================= v29:'),end=html.indexOf('/* v30:',start);assert.equal(html.slice(start,end).trim(),src.trim());new vm.Script(src);const game=html.match(/<script id="damaGameSource" type="application\/x-dama-game">([\s\S]*?)<\/script>/);assert(game);new vm.Script(game[1]);return{status:'pass'}});
 await run('CONTROL_LEGACY_OLDER_LOCAL_ADOPTS_CLOUD',async()=>{const w=world(),b=boot(w);b.c.persist();await b.c.accBoot();assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);assert.equal(coins(w),900);assert.equal(w.writes.length,0);return{status:'pass'}});
 await run('CONTROL_NEW_FORMAT_OFFLINE_RELOAD',async()=>{const w=world(withEdit(150,10000));w.failGet=true;const b=boot(w);b.c.S.stats={games:0};b.c.persist();await b.c.accBoot();assert.equal(w.writes.length,0);
   w.failGet=false;w.now=40000;const next=boot(w);next.c.persist();await next.c.accBoot();assert.equal(coins(w),900);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);return{status:'pass',cloud:coins(w),basis:next.state().bootLocalAt}});
 await run('CONTROL_NEWER_LOCAL',async()=>{const w=world(withEdit(500,25000)),b=boot(w);b.c.persist();await b.c.accBoot();assert.equal(coins(w),500);return{status:'pass',cloud:coins(w)}});
 await run('CONTROL_LOGIN_RETRY_PRESERVES_CONTEXT',async()=>{const w=world(withEdit(150,25000)),b=boot(w);vm.runInContext('ACC.ready=true;ACC.anon=true',b.c);w.failGet=true;await b.c.accAfterLogin(true);assert.equal(w.writes.length,0);assert.equal(w.disk.get('acc.pendingRestore'),'u_test');w.failGet=false;
   const retry=Array.from(b.timers.values()).find(t=>t.ms===5000);assert(retry);await retry.f();assert.equal(coins(w),900);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);return{status:'pass',cloud:coins(w)}});
 await run('CONTROL_LOGIN_RELOAD_PRESERVES_CONTEXT',async()=>{const w=world(withEdit(150,25000)),b=boot(w);vm.runInContext('ACC.ready=true;ACC.anon=true',b.c);w.failGet=true;await b.c.accAfterLogin(true);w.failGet=false;const next=boot(w);next.c.persist();await next.c.accBoot();assert.equal(coins(w),900);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);return{status:'pass',cloud:coins(w)}});
 await run('CONTROL_ADOPTION_LOCAL_WRITE_FAILURE',async()=>{const w=world(),b=boot(w);b.c.persist();w.failSet=true;await b.c.accBoot();assert.equal(b.loads(),0);assert.equal(w.session.get('accLoadedAt'),undefined);assert.equal(b.state().synced,false);assert.equal(coins(w),900);return{status:'pass',cloud:coins(w),reloads:b.loads()}});
 await run('CONTROL_CACHED_READ_REJECTED',async()=>{const w=world(withEdit(150,15000));w.cache={name:'MASTER',nameKey:'master',saveAt:10000,save:JSON.stringify(initial())};const b=boot(w);b.c.persist();await b.c.accBoot();assert.equal(b.state().synced,false);assert.equal(w.writes.length,0);return{status:'pass',cloud:coins(w)}});
 await run('CONTROL_TEST_SCRIPT_ENFORCES_FAILURES',()=>{const py=fs.readFileSync(root+'/dev/tests/test_save_sync.py','utf8');assert(py.includes('sys.exit(1 if FAILS else 0)'));assert(py.includes("FAILS.append(f\"{s.name} / page errors\")"));return{status:'pass'}});
 await run('REGRESSION_M_LEGACY_SAVE_OFFLINE_RELOAD_RECOVERY',async()=>{
   const w=world();assert.equal(JSON.parse(w.disk.get('damaworld.v1')).editAt,undefined);w.failGet=true;
   const b=boot(w);assert.equal(b.state().editAt,10000);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).editAt,10000);
   b.c.S.stats={games:0};b.c.persist();b.c.persist();await b.c.accBoot();assert.equal(w.writes.length,0);
   const diskAfterFailedRead=JSON.parse(w.disk.get('damaworld.v1'));assert.equal(diskAfterFailedRead.editAt,10000);assert.equal(diskAfterFailedRead.savedAt,30000);
   w.now=40000;const next=boot(w);next.c.persist();await next.c.accBoot();assert.equal(next.state().bootLocalAt,10000);assert.equal(next.state().synced,false);assert.equal(w.writes.length,0);assert.equal(coins(w),900);
   w.failGet=false;await next.c.accSync();assert.equal(coins(w),900);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);assert.equal(next.loads(),1);
   w.now=50000;const restored=boot(w);await restored.c.accBoot();assert.equal(restored.state().coins,900);assert.equal(restored.state().synced,true);assert.equal(coins(w),900);
   return{status:'pass',oldBasis:10000,diskAfterFailedRead,reloadedComparisonBasis:next.state().bootLocalAt,gameCoinsAfterRecovery:restored.state().coins,cloudCoinsAfterRecovery:coins(w)};
 });
 await run('REGRESSION_M3_LEGACY_NEWER_LOCAL',async()=>{
   const w=world(initial({coins:500,at:25000})),b=boot(w);assert.equal(b.state().bootLocalAt,25000);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).editAt,25000);
   b.c.S.stats={games:0};b.c.persist();assert.equal(b.state().editAt,25000);await b.c.accBoot();assert.equal(coins(w),500);assert.equal(b.state().coins,500);assert.equal(w.cloud.saveAt,b.state().editAt);assert.equal(b.state().editAt,30000);
   return{status:'pass',game:500,cloud:500,comparisonBasis:25000,uploadAt:w.cloud.saveAt};
 });
 await run('REGRESSION_MIGRATION_FIRST_WRITE_FAILS_THEN_PERSIST_SUCCEEDS',async()=>{
   const w=world();w.failGet=true;w.failSet=true;const b=boot(w);assert.equal(b.state().editAt,10000);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).editAt,undefined);
   w.failSet=false;b.c.S.stats={games:0};b.c.persist();await b.c.accBoot();assert.equal(JSON.parse(w.disk.get('damaworld.v1')).editAt,10000);assert.equal(w.writes.length,0);
   w.failGet=false;w.now=40000;const next=boot(w);await next.c.accBoot();assert.equal(next.state().bootLocalAt,10000);assert.equal(coins(w),900);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);
   return{status:'pass',cloud:900,basis:10000};
 });
 console.log(results.length+' sync checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
