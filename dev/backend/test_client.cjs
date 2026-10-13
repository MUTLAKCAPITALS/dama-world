const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8'),account=fs.readFileSync(path.join(root,'dev/v29_account.js'),'utf8');
function extract(name,s=source){const start=new RegExp('(?:async )?function '+name+'\\s*\\(').exec(s);assert(start);for(let end=s.indexOf('}',start.index);end>=0;end=s.indexOf('}',end+1)){const code=s.slice(start.index,end+1);try{new vm.Script('('+code+')');return code}catch{}}throw Error(name)}
function world(extra={}){return vm.createContext({console,JSON,Number,Math,Date,Promise,setTimeout,clearTimeout,toast(){},...extra})}
const add=(c,names,s)=>names.forEach(n=>vm.runInContext(extract(n,s),c));
let count=0;
async function test(name,run){await run();count++;console.log('PASS',name)}
function deletion(extra={}){
 const events=[],disk=new Map([['save','progress'],['acc.owner','h'],['acc.backup.h','backup']]),user={uid:'h',email:'h@example.invalid',providerData:[{providerId:'password'}],reauthenticateWithCredential:async()=>events.push('reauth'),getIdToken:async force=>{assert(force);events.push('token')}};
 const c=world({ACC:{deleteConfirmed:true,deleting:false,synced:true},ACC_KEY:'save',ACC_PEND:'pending',ONL:{auth:{currentUser:user,signOut:async()=>events.push('signout')}},
   firebase:{auth:{EmailAuthProvider:{credential:(email,password)=>{assert.equal(password,'emulator-only-password');return {email}}}}},
   $:selector=>selector==='#aDeletePassword'?{value:'emulator-only-password'}:null,
   onlCall:async(name,data)=>{assert.equal(name,'damaDeleteAccount');assert.equal(data.confirmation,'DELETE_MY_ACCOUNT');events.push('request');return {accepted:true,state:'pending'}},
   localStorage:{removeItem:key=>{events.push('clear');disk.delete(key)}},sessionStorage:{removeItem(){}},vcStop(){},onlClose(){},accDlg:html=>{c.html=html},accErr:e=>e.message,location:{reload(){}},...extra});
 add(c,['accDelete'],account);return {c,user,events,disk};
}
(async()=>{
 await test('missing activation config retains legacy mode',async()=>{const c=world({ONL:{db:{collection:()=>({doc:()=>({get:async()=>({exists:false})})})}}});add(c,['onlBackendConfig','onlServerEnabled']);assert.equal(await c.onlServerEnabled(),false)});
 await test('failed config read never silently downgrades authority',async()=>{const c=world({ONL:{db:{collection:()=>({doc:()=>({get:async()=>{throw Error('offline')}})})}}});add(c,['onlBackendConfig','onlServerEnabled']);await assert.rejects(c.onlServerEnabled(),/offline/)});
 await test('unknown backend protocol asks for updated client',async()=>{const c=world({ONL:{},onlBackendConfig:async()=>({enabled:true,protocol:99})});add(c,['onlServerEnabled']);await assert.rejects(c.onlServerEnabled())});
 await test('client resignation sends intent without chosen winner or reward',async()=>{let sent,applied;const c=world({ONL:{ref:{},user:{uid:'h'},room:{protocol:3},code:'ABCD'},game:{id:1,over:false,online:{id:'match'}},onlCall:async(name,data)=>{sent=JSON.parse(JSON.stringify(data));return {result:{winner:'g',verified:true}}},onlApplyResult:r=>applied=r});add(c,['onlFinish']);await c.onlFinish(1,'استسلمت');assert.deepEqual(sent,{action:'resign',code:'ABCD',matchId:'match'});assert.equal(applied.winner,'g')});
 await test('unverified protocol 3 result cannot reach client rewards',()=>{let granted=false,blocked=false;const c=world({S:{},ONL:{role:'host'},game:{online:{id:'m',protocol:3}},onlDisconnected:()=>blocked=true,_endGame25:()=>granted=true});add(c,['onlApplyResult']);c.onlApplyResult({winner:'h'});assert(blocked);assert(!granted)});
 await test('verified result uses authoritative rating and local receipt once',()=>{let grants=0;const c=world({S:{},ONL:{role:'host',user:{uid:'h'},room:{moves:[]}},game:{online:{id:'m',protocol:3},plies:0},onlForget(){},persist(){},_endGame25:()=>{grants++;c.game.over=true}});add(c,['onlApplyResult','saveBatch']);const result={winner:'h',verified:true,hostAward:{rating:1016,delta:16,coins:50,xp:60}};c.onlApplyResult(result);c.game.over=false;c.onlApplyResult(result);assert.equal(c.S.onlineRating,1016);assert.equal(grants,1)});
 await test('deletion reauthentication failure preserves all local data',async()=>{const {c,user,events,disk}=deletion();user.reauthenticateWithCredential=async()=>{throw Error('wrong password')};assert.equal(await c.accDelete(),false);assert.equal(disk.get('save'),'progress');assert(!events.includes('request'));assert(!events.includes('signout'))});
 await test('failed deletion request preserves data and sign-in',async()=>{const {c,events,disk}=deletion({onlCall:async()=>{throw Error('offline')}});assert.equal(await c.accDelete(),false);assert.equal(disk.get('save'),'progress');assert(!events.includes('signout'))});
 await test('accepted deletion clears local data only after fresh authentication and receipt',async()=>{const {c,events,disk}=deletion();assert.equal(await c.accDelete(),true);assert.deepEqual(events.slice(0,3),['reauth','token','request']);assert(events.indexOf('clear')>events.indexOf('request'));assert(!disk.has('save'));assert(!disk.has('acc.backup.h'));assert(c.html.includes('تم قبول طلب الحذف'));assert(!c.html.includes('تم حذف الحساب'))});
 await test('account switch during reauthentication prevents deletion',async()=>{const {c,user,events,disk}=deletion();user.getIdToken=async()=>{c.ONL.auth.currentUser={uid:'someone-else'}};assert.equal(await c.accDelete(),false);assert(!events.includes('request'));assert(disk.has('save'))});
 await test('missing explicit deletion confirmation never submits request',async()=>{const {c,events}=deletion();c.ACC.deleteConfirmed=false;assert.equal(await c.accDelete(),false);assert.equal(events.length,0)});
 console.log(`Backend client: ${count} passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
