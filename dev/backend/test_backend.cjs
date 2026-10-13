'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const serverRequire=createRequire(path.resolve(__dirname,'../../functions/package.json'));
const {initializeApp,deleteApp}=serverRequire('firebase-admin/app');
const {getFirestore}=serverRequire('firebase-admin/firestore');
const {getAuth}=serverRequire('firebase-admin/auth');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('../firebase/node_modules/@firebase/rules-unit-testing');
const {makeService}=require('../../functions/service.cjs');
const engine=require('../../functions/engine.cjs');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.GCLOUD_PROJECT!=='demo-dama-world-backend')throw Error('Local demo emulators are required');
const PROJECT='demo-dama-world-backend',app=initializeApp({projectId:PROJECT}),db=getFirestore(app),auth=getAuth(app),service=makeService(db,auth);
const source=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8'),rules=fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8');
const now=()=>Date.now(),ctx=uid=>({uid,token:{email:uid+'@example.invalid',auth_time:Math.floor(now()/1000),firebase:{sign_in_provider:'password'}}});
const request=(uid,data)=>({auth:ctx(uid),data});
const call=(uid,data)=>service.online(request(uid,data));
const defaults=()=>({rating:1000,coins:0,xp:0,wins:0,losses:0,draws:0,games:0,revision:0,activeRoom:'ABCD'});
const waiting=()=>({code:'ABCD',protocol:3,matchId:'match-test',host:'h',hostName:'Host',hostPhoto:null,hostRating:1000,guest:null,guestName:'',state:'wait',moves:[],messages:[],voiceEpoch:1,resigned:null,board:engine.initBoard(),noCap:0,hostCaps:0,guestCaps:0,created:1});
const playing=extra=>({...waiting(),guest:'g',guestProtocol:3,guestName:'Guest',guestPhoto:null,guestRating:1000,state:'play',...extra});
const enc=a=>a.map(p=>p.join('')).join(',');
const wire=(m,n=0)=>({n,from:enc([m.from]),steps:enc(m.steps),caps:enc(m.caps)});
const action=(kind,more={})=>({action:kind,code:'ABCD',matchId:'match-test',...more});
let env,passed=0,failed=0;
async function seed(extra={}){
  await env.clearFirestore();
  for(const uid of ['h','g','x'])try{await auth.createUser({uid,email:uid+'@example.invalid',password:'emulator-only-password'})}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e}
  const batch=db.batch();for(const [p,v] of Object.entries({'cfg/backend':{enabled:true,protocol:3,accountDeletion:true},'users/h':{name:'Host',save:'{"coins":321}',rating:9000},'users/g':{name:'Guest',save:'{}'},'names/host':{uid:'h',name:'Host',at:1},'names/guest':{uid:'g',name:'Guest',at:1},...extra}))batch.set(db.doc(p),v);await batch.commit();
}
async function test(name,fn,extra={}){if(process.env.ONLY&&!name.includes(process.env.ONLY))return;try{await seed(extra);await fn();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.stack||e)}}
const reject=(promise,code)=>assert.rejects(promise,e=>e.code===code);
function extract(name){const start=new RegExp('(?:async )?function '+name+'\\s*\\(').exec(source);assert(start);for(let end=source.indexOf('}',start.index);end>=0;end=source.indexOf('}',end+1)){const text=source.slice(start.index,end+1);try{new vm.Script('('+text+')');return text}catch{}}throw Error(name)}
function client(uid){const c=vm.createContext({console,JSON,Math,Date,Promise,Set,Map,Number,Object,Array,
  ONL:{user:{uid},db,room:playing(),ref:db.doc('rooms/ABCD'),code:'ABCD',seq:0,role:uid==='h'?'host':'guest'},S:{name:uid},
  requirePlayAccount:()=>true,onlServerEnabled:async()=>true,onlCall:async(name,data)=>call(uid,JSON.parse(JSON.stringify(data))),
  onlEnc:enc,onlDlg(){},onlListen:ref=>{c.listened=ref},closeLayer(){},toast:t=>{c.notice=t},onlErr:e=>e.message,$:()=>null,esc:String,ic:()=>'',location:{href:'https://example.invalid/game/'}});
  for(const name of ['onlHost','onlJoin','onlSend','onlFinish','onlApplyResult','saveBatch'])vm.runInContext(extract(name),c);return c;
}
(async()=>{try{
  env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8181,rules}});
  const player=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'password'}}).firestore();
  const live={'rooms/ABCD':playing(),'competitive/h':defaults(),'competitive/g':defaults()};
  await test('movement engine exactly matches shipped board rules',()=>{const block=source.slice(source.indexOf('const DIRS='),source.indexOf('function evalB('));assert(fs.readFileSync(path.resolve(__dirname,'../../functions/engine.cjs'),'utf8').includes(block))});
  await test('unauthenticated callable denied',()=>reject(service.online({data:{action:'profile'}}),'unauthenticated'));
  await test('anonymous callable denied',()=>reject(service.online({auth:{uid:'h',token:{firebase:{sign_in_provider:'anonymous'}}},data:{action:'profile'}}),'permission-denied'));
  await test('disabled backend fails closed',()=>reject(call('h',{action:'create',requestId:'create_request_1234'}),'failed-precondition'),{'cfg/backend':{enabled:false}});
  await test('banned caller denied',()=>reject(call('h',{action:'profile'}),'permission-denied'),{'ctl/h':{ban:true}});
  await test('authoritative rating does not trust legacy user rating',async()=>{const r=await call('h',{action:'create',requestId:'create_request_1234'});assert.equal((await db.doc('rooms/'+r.code).get()).data().hostRating,1000);assert.equal((await db.doc('users/h').get()).data().rating,9000)});
  await test('lost create acknowledgement reuses one room',async()=>{const data={action:'create',requestId:'create_request_1234'},a=await call('h',data),b=await call('h',data);assert.deepEqual(a,b);assert.equal((await db.collection('rooms').get()).size,1)});
  await test('one active room per player',async()=>{await call('h',{action:'create',requestId:'create_request_1234'});await reject(call('h',{action:'create',requestId:'create_request_5678'}),'already-exists')});
  await test('actual client create and join use server authority',async()=>{const h=client('h');await h.onlHost();assert(h.listened);const g=client('g');await g.onlJoin(h.ONL.code);assert(g.listened);assert.equal((await db.doc('rooms/'+h.ONL.code).get()).data().guest,'g')});
  await test('simultaneous guests cannot take same seat',async()=>{const results=await Promise.allSettled(['g','x'].map(uid=>call(uid,{action:'join',code:'ABCD'})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1)},{'rooms/ABCD':waiting(),'competitive/h':defaults()});
  await test('joining cannot supply host, rating, result or moves',()=>reject(call('g',{action:'join',code:'ABCD',host:'g',rating:9999}),'invalid-argument'),{'rooms/ABCD':waiting()});
  await test('own host cannot take guest seat',()=>reject(call('h',{action:'join',code:'ABCD'}),'failed-precondition'),{'rooms/ABCD':waiting()});
  await test('caller cannot submit a chosen winner',()=>reject(call('h',{...action('finish'),winner:'h'}),'invalid-argument'),live);
  await test('unfinished board cannot award a win',()=>reject(call('h',action('finish')),'failed-precondition'),live);
  await test('outsider cannot resign for another player',()=>reject(call('x',action('resign')),'permission-denied'),live);
  await test('wrong match identifier denied',()=>reject(call('h',action('resign',{matchId:'old'})),'failed-precondition'),live);
  await test('out-of-turn move denied',()=>reject(call('g',action('move',{move:wire(engine.genMoves(engine.initBoard(),1)[0])})),'failed-precondition'),live);
  await test('illegal teleport denied by board engine',()=>reject(call('h',action('move',{move:{n:0,from:'10',steps:'70',caps:''}})),'invalid-argument'),live);
  await test('move impersonation field rejected',()=>reject(call('h',action('move',{move:{...wire(engine.genMoves(engine.initBoard(),1)[0]),by:'g'}})),'invalid-argument'),live);
  await test('actual client move retry is idempotent and guest coordinates work',async()=>{const h=client('h');await h.onlSend(engine.genMoves(engine.initBoard(),1)[0]);h.ONL.seq=0;await h.onlSend(engine.genMoves(engine.initBoard(),1)[0]);const r=(await db.doc('rooms/ABCD').get()).data(),canonical=engine.genMoves(r.board,-1)[0],flip=p=>[7-p[0],7-p[1]],m={from:flip(canonical.from),steps:canonical.steps.map(flip),caps:canonical.caps.map(flip)};const g=client('g');g.ONL.seq=1;await g.onlSend(m);assert.equal((await db.doc('rooms/ABCD').get()).data().moves.length,2)},live);
  await test('duplicate sequence with different move rejected',async()=>{const moves=engine.genMoves(engine.initBoard(),1);await call('h',action('move',{move:wire(moves[0])}));await reject(call('h',action('move',{move:wire(moves[1])})),'already-exists')},live);
  const captureBoard=()=>{const b=Array(64).fill(0);b[18]=1;b[19]=-1;b[21]=-1;b[26]=-1;return b};
  await test('mandatory maximum capture enforced',()=>reject(call('h',action('move',{move:{n:0,from:'22',steps:'42',caps:'32'}})),'invalid-argument'),{...live,'rooms/ABCD':playing({board:captureBoard()})});
  await test('legal multiple capture removes only confirmed pieces',async()=>{await call('h',action('move',{move:{n:0,from:'22',steps:'24,26',caps:'23,25'}}));const r=(await db.doc('rooms/ABCD').get()).data();assert.equal(r.hostCaps,2);assert.equal(r.board[26],-1);assert.equal(r.board[22],1)},{...live,'rooms/ABCD':playing({board:captureBoard()})});
  const winBoard=Array(64).fill(0);winBoard[51]=1;winBoard[52]=-1;
  await test('last capture settles result and both wallets atomically',async()=>{const out=await call('h',action('move',{move:{n:0,from:'63',steps:'65',caps:'64'}}));assert.equal(out.result.winner,'h');assert.equal(out.result.hostAward.coins,52);assert.equal((await db.doc('competitive/h').get()).data().coins,52);assert.equal((await db.doc('competitive/g').get()).data().coins,10);assert.equal((await db.collection('competitive/h/receipts').get()).size,1)},{...live,'rooms/ABCD':playing({board:winBoard})});
  await test('concurrent resign and retry grant exactly once',async()=>{await Promise.all([call('h',action('resign')),call('h',action('resign'))]);await call('g',action('finish'));assert.equal((await db.doc('competitive/g').get()).data().coins,50);assert.equal((await db.doc('competitive/h').get()).data().revision,1);assert.equal((await db.collection('competitive/g/receipts').get()).size,1)},live);
  await test('move after finished result rejected',async()=>{await call('h',action('resign'));await reject(call('h',action('move',{move:wire(engine.genMoves(engine.initBoard(),1)[0])})),'failed-precondition')},live);
  const drawBoard=Array(64).fill(0);drawBoard[0]=2;drawBoard[63]=-2;
  await test('60 non-capturing plies produce a verified draw',async()=>{const out=await call('h',action('move',{move:{n:0,from:'00',steps:'01',caps:''}}));assert.equal(out.result.winner,null);assert.equal(out.result.hostAward.coins,25)},{...live,'rooms/ABCD':playing({board:drawBoard,noCap:59})});
  await test('canceling an empty waiting room does not generate a reward',async()=>{await call('h',action('close'));assert.equal((await db.doc('competitive/h').get()).data().coins,0);assert.equal((await db.doc('competitive/h').get()).data().activeRoom,null);assert.equal((await db.doc('rooms/ABCD').get()).data().state,'closed')},{'rooms/ABCD':waiting(),'competitive/h':defaults()});
  await test('leaving an active room counts as a loss exactly once',async()=>{const first=await call('g',action('close'));assert.equal(first.result.winner,'h');await call('g',action('close'));await call('h',action('finish'));assert.equal((await db.doc('competitive/h').get()).data().coins,50);assert.equal((await db.doc('competitive/g').get()).data().losses,1);assert.equal((await db.doc('competitive/g').get()).data().activeRoom,null);assert.equal((await db.collection('competitive/h/receipts').get()).size,1)},live);
  await test('client cannot write authoritative wallet or receipts',async()=>{await assertFails(player('h').doc('competitive/h').update({coins:9999}));await assertFails(player('h').doc('competitive/h/receipts/fake').set({coins:9999}))},live);
  await test('client cannot create a protocol 3 room directly',()=>assertFails(player('h').doc('rooms/ABCD').set(waiting())));
  await test('client cannot bypass server moves or results',async()=>{await assertFails(player('h').doc('rooms/ABCD').update({moves:[{...wire(engine.genMoves(engine.initBoard(),1)[0]),by:'h'}]}));await assertFails(player('h').doc('rooms/ABCD').update({state:'done',result:{winner:'h',plies:0,reason:'fake'}}))},live);
  await test('client cannot downgrade or modify canonical board',async()=>{await assertFails(player('h').doc('rooms/ABCD').update({protocol:2}));await assertFails(player('h').doc('rooms/ABCD').update({board:[]}))},live);
  await test('voice and quick chat remain available to real participants',async()=>{await assertSucceeds(player('h').doc('rooms/ABCD').update({vOffer:'test'}));await assertSucceeds(player('g').doc('rooms/ABCD').update({messages:[{id:'m',by:'g',q:1,at:1}]}))},live);
  await test('activated backend blocks old protocol bypass',()=>assertFails(player('h').doc('rooms/ABCD').update({moves:[{n:0,by:'h',from:'10',steps:'70',caps:''}]})),{'rooms/ABCD':{...playing(),protocol:2}});
  await test('other player cannot read wallet',()=>assertFails(player('g').doc('competitive/h').get()),live);
  await test('deletion requires recent reauthentication',async()=>{const r=request('h',{confirmation:'DELETE_MY_ACCOUNT'});r.auth.token.auth_time-=301;await reject(service.requestDeletion(r),'failed-precondition');assert(!(await db.doc('accountDeletions/h').get()).exists)});
  await test('deletion confirmation cannot target another UID',()=>reject(service.requestDeletion(request('h',{confirmation:'DELETE_MY_ACCOUNT',uid:'g'})),'invalid-argument'));
  await test('deletion requires explicit final confirmation',()=>reject(service.requestDeletion(request('h',{})),'invalid-argument'));
  await test('deletion job cannot be forged from the client',()=>assertFails(player('h').doc('accountDeletions/h').set({state:'pending'})));
  await test('accepted deletion immediately freezes old tokens',async()=>{await service.requestDeletion(request('h',{confirmation:'DELETE_MY_ACCOUNT'}));await assertFails(player('h').doc('users/h').update({save:'new'}));await assertFails(player('h').doc('names/newhost').set({uid:'h',name:'NewHost',at:1}));await reject(call('h',{action:'profile'}),'failed-precondition');await assertSucceeds(player('h').doc('accountDeletions/h').get())});
  await test('Auth deletion failure leaves all save data intact for retry',async()=>{await service.requestDeletion(request('h',{confirmation:'DELETE_MY_ACCOUNT'}));const flaky=makeService(db,{deleteUser:async()=>{throw Object.assign(Error('injected transient failure'),{code:'auth/internal-error'})}});await assert.rejects(flaky.cleanDeletion('h'));assert((await db.doc('users/h').get()).exists);assert((await db.doc('names/host').get()).exists);await service.cleanDeletion('h');assert.equal((await db.doc('accountDeletions/h').get()).data().state,'done')});
  await test('cleanup failure resumes after Auth was already removed',async()=>{await service.requestDeletion(request('h',{confirmation:'DELETE_MY_ACCOUNT'}));let failedOnce=false;const proxy=new Proxy(db,{get(target,k){if(k==='recursiveDelete')return async ref=>{if(!failedOnce){failedOnce=true;throw Error('injected cleanup failure')}return target.recursiveDelete(ref)};const value=target[k];return typeof value==='function'?value.bind(target):value}});await assert.rejects(makeService(proxy,auth).cleanDeletion('h'));await reject(auth.getUser('h'),'auth/user-not-found');await service.cleanDeletion('h');assert(!(await db.doc('users/h').get()).exists);assert.equal((await db.doc('accountDeletions/h').get()).data().state,'done')});
  await test('completed deletion preserves opponent and removes owned name/save/wallet',async()=>{await service.requestDeletion(request('h',{confirmation:'DELETE_MY_ACCOUNT'}));await service.cleanDeletion('h');await service.cleanDeletion('h');assert(!(await db.doc('users/h').get()).exists);assert(!(await db.doc('names/host').get()).exists);assert(!(await db.doc('competitive/h').get()).exists);assert((await db.doc('users/g').get()).exists);assert((await db.doc('names/guest').get()).exists);const room=(await db.doc('rooms/ABCD').get()).data();assert.equal(room.host,null);assert.equal(room.guest,'g');assert.equal(room.state,'closed');await assertFails(player('h').doc('users/h').set({save:'resurrected'}))},live);
 }finally{if(env)await env.cleanup();await deleteApp(app)}
 console.log(`Backend: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
