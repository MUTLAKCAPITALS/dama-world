// Runs only against a loopback emulator and synthetic identities. Never use production credentials.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {createMockUserToken}=require('@firebase/util');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');
firebase.firestore.setLogLevel('silent');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181')throw Error('Use the isolated emulator on 127.0.0.1:8181');
const PROJECT='demo-dama-world-rules',root=path.resolve(__dirname,'../..');
const rules=fs.readFileSync(process.env.RULES_FILE||path.join(root,'firestore.rules'),'utf8');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
function fn(name,text=source){const start=new RegExp('(?:async )?function '+name+'\\s*\\(').exec(text);assert(start,name);for(let end=text.indexOf('}',start.index);end>=0;end=text.indexOf('}',end+1)){const code=text.slice(start.index,end+1);try{new vm.Script('('+code+')');return code}catch{}}throw Error(name)}
function section(a,b){const start=source.indexOf(a),end=source.indexOf(b,start+a.length);assert(start>=0&&end>start);return source.slice(start,end)}
const ownerRule=rules.match(/request\.auth\.token\.email == '([^']+)'/);assert(ownerRule,'owner rule fixture');
const OWNER=ownerRule[1];
function counter(claims={sub:'admin',email:OWNER,email_verified:true}){
 const token=claims?createMockUserToken({...claims,firebase:{sign_in_provider:'google.com'}},PROJECT):'';
 // Spoofing the displayed email cannot grant the token permission in Firestore rules.
 const user={uid:claims?.sub||'public',email:OWNER,getIdToken:async()=>token};
 const c=vm.createContext({console,JSON,Number,String,Array,AbortController,encodeURIComponent,setTimeout,clearTimeout,OWNER,auth:{currentUser:user},FB_CFG:{projectId:PROJECT},
  fetch:(url,opts)=>{assert.equal(url,'https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents:runAggregationQuery');return fetch(url.replace('https://firestore.googleapis.com','http://127.0.0.1:8181'),opts)}});
 vm.runInContext(fn('cnt',fs.readFileSync(path.join(root,'admin.html'),'utf8')),c);return c;
}
const waiting=(extra={})=>({code:'ABCD',protocol:2,matchId:'test-match',host:'h',hostName:'Host',hostPhoto:null,hostRating:1200,guest:null,guestName:'',state:'wait',moves:[],messages:[],voiceEpoch:1,resigned:null,created:1791870000000,...extra});
const playing=(extra={})=>waiting({guest:'g',guestProtocol:2,guestName:'Guest',guestPhoto:null,guestRating:1300,state:'play',...extra});
const join=(uid='g')=>({guest:uid,guestProtocol:2,guestName:'Guest',guestPhoto:null,guestRating:1300,state:'play'});
const m=(n=0,by='h')=>({n,by,from:'50',steps:'40',caps:''});
let env,db={},passed=0,failed=0;
async function seed(extra={}){await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{const raw=context.firestore(),batch=raw.batch();for(const [p,d]of Object.entries({'users/h':{name:'Host',nameKey:'host',rating:1200,save:'{"coins":100}',saveRev:1},'users/g':{name:'Guest',rating:1300},'names/host':{uid:'h',name:'Host',at:1},'cfg/global':{maint:false},'ctl/b':{ban:true},...extra}))batch.set(raw.doc(p),d);await batch.commit()})}
async function test(name,action,data={}){if(process.env.ONLY&&!name.includes(process.env.ONLY))return;try{await seed(data);await action();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message||e)}}
const room=uid=>db[uid].doc('rooms/ABCD');
function client(uid,extra={}){const notices=[],plain=value=>JSON.parse(JSON.stringify(value));
 // The VM has a separate Object prototype; normalize its wire payloads at the SDK boundary.
 const sdk={collection:name=>db[uid].collection(name),runTransaction:action=>db[uid].runTransaction(tx=>action({
  get:ref=>tx.get(ref),set:(ref,data,opts)=>opts?tx.set(ref,plain(data),plain(opts)):tx.set(ref,plain(data)),
  update:(ref,data)=>tx.update(ref,plain(data)),delete:ref=>tx.delete(ref)
 }))};
 const c=vm.createContext({console,JSON,Math,Date,Promise,Set,Map,Number,Object,Array,
 ONL:{db:sdk,user:{uid},role:uid==='h'?'host':'guest',ref:room(uid),room:playing(),seq:0,epoch:0,chatSeen:new Set()},
 S:{name:uid,rating:1200},game:{online:{}},QUICK:['hi','nice','thinking','wow'],requirePlayAccount:()=>true,
 onlErr:e=>e.code||e.message,onlDlg(){},onlListen(ref){c.listened=ref},closeLayer(){},meSay(){},toast:t=>notices.push(t),
 location:{href:'https://example.invalid/game/'},esc:x=>String(x),ic:()=>'',$:()=>null,...extra});
 vm.runInContext(section('const DIRS=','/* ---------------- match'),c);
 vm.runInContext(section('const onlEnc=','function onlCode'),c);
 for(const name of ['onlBoard','onlSend','onlHost','onlJoin','onlChat'])vm.runInContext(fn(name),c);
 c.notices=notices;return c}
(async()=>{try{
 env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8181,rules}});
 for(const uid of ['h','g','x','b'])db[uid]=env.authenticatedContext(uid,{email:uid+'@example.invalid',email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
 db.anon=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 db.public=env.unauthenticatedContext().firestore();
 db.admin=env.authenticatedContext('admin',{email:OWNER,email_verified:true,firebase:{sign_in_provider:'google.com'}}).firestore();
 db.fakeAdmin=env.authenticatedContext('fake-admin',{email:OWNER,email_verified:false,firebase:{sign_in_provider:'password'}}).firestore();
 await test('private save: owner reads own save',()=>assertSucceeds(db.h.doc('users/h').get()));
 await test('private save: other player cannot read complete save',()=>assertFails(db.g.doc('users/h').get()));
 await test('private save: unauthenticated reads denied',()=>assertFails(db.public.doc('users/h').get()));
 await test('private save: legacy anonymous owner can still recover own data',()=>assertSucceeds(db.anon.doc('users/anon').get()),{'users/anon':{save:'{}'}});
 await test('private save: owner transaction and heartbeat still work',async()=>{await assertSucceeds(db.h.runTransaction(async tx=>{const ref=db.h.doc('users/h'),snap=await tx.get(ref);tx.set(ref,{save:'{"coins":150}',saveRev:snap.data().saveRev+1,saveId:'attempt',saveAt:100},{merge:true})}));await assertSucceeds(db.h.doc('users/h').set({seen:100},{merge:true}))});
 await test('private save: other player writes denied',()=>assertFails(db.g.doc('users/h').update({save:'{}'})));
 await test('private save: verified owner administration retains read and listing',async()=>{await assertSucceeds(db.admin.doc('users/h').get());await assertSucceeds(db.admin.collection('users').limit(10).get())});
 await test('private save: ordinary list denied',()=>assertFails(db.h.collection('users').get()));
 await test('private save: unverified owner email cannot grant administration',()=>assertFails(db.fakeAdmin.collection('users').get()));
 await test('counts: owner gets an aggregate without reading private save documents',async()=>{assert.equal(await counter().cnt('users'),2)});
 await test('counts: numeric and string filters return exact totals',async()=>{const c=counter();assert.equal(await c.cnt('users','seen','GREATER_THAN',100),1);assert.equal(await c.cnt('users','nameKey','GREATER_THAN',''),1);assert.equal(await c.cnt('reports','status','EQUAL','open'),1)},{'users/h':{seen:200,nameKey:'host'},'users/g':{seen:50},'reports/open':{status:'open'},'reports/done':{status:'done'}});
 await test('counts: empty matching collection returns zero',async()=>{assert.equal(await counter().cnt('reports','status','EQUAL','open'),0)});
 await test('counts: ordinary Firebase token cannot read administrator counts',()=>assert.rejects(counter({sub:'h',email:'h@example.invalid',email_verified:true}).cnt('users'),e=>e.code==='permission-denied'));
 await test('counts: unverified owner email remains denied',()=>assert.rejects(counter({sub:'fake-owner',email:OWNER,email_verified:false}).cnt('users'),e=>e.code==='permission-denied'));
 await test('counts: unauthenticated REST request remains denied',()=>assert.rejects(counter(null).cnt('users')));
 await test('name: owner can reapply same normalized name',()=>assertSucceeds(db.h.doc('names/host').set({uid:'h',name:'HOST',at:2})));
 await test('name: changing reservation owner denied',()=>assertFails(db.h.doc('names/host').set({uid:'g',name:'Host',at:2})));
 await test('name: other player cannot update reservation',()=>assertFails(db.g.doc('names/host').set({uid:'g',name:'Host',at:2})));
 await test('name: extra fields rejected on update',()=>assertFails(db.h.doc('names/host').update({admin:true})));
 await test('name: invalid display size rejected',()=>assertFails(db.h.doc('names/host').update({name:'a'})));
 await test('name: real atomic rename preserves save and ownership',async()=>{await assertSucceeds(db.h.runTransaction(async tx=>{const old=db.h.doc('names/host'),next=db.h.doc('names/newhost');await tx.get(old);await tx.get(next);tx.set(next,{uid:'h',name:'NewHost',at:2});tx.delete(old);tx.set(db.h.doc('users/h'),{name:'NewHost',nameKey:'newhost'},{merge:true})}));assert.equal((await db.h.doc('users/h').get()).data().save,'{"coins":100}')});
 await test('name: anonymous registration denied',()=>assertFails(db.anon.doc('names/anonymous').set({uid:'anon',name:'Anonymous',at:1})));
 await test('controls: player reads own controls but cannot change them',async()=>{await assertSucceeds(db.h.doc('ctl/h').get());await assertFails(db.h.doc('ctl/h').set({ban:false}));await assertFails(db.h.doc('ctl/g').get())});
 await test('controls: verified administrator updates controls',()=>assertSucceeds(db.admin.doc('ctl/h').set({ban:true})));
 await test('config: guest browsing reads public config but cannot change it',async()=>{await assertSucceeds(db.public.doc('cfg/global').get());await assertFails(db.h.doc('cfg/global').update({maint:true}))});
 await test('reports: authenticated sender submits own open report',()=>assertSucceeds(db.h.collection('reports').add({by:'h',status:'open',at:1,target:'g'})));
 await test('reports: sender impersonation denied',()=>assertFails(db.h.collection('reports').add({by:'g',status:'open',at:1,target:'x'})));
 await test('reports: owner query permitted, ordinary player list denied',async()=>{await assertSucceeds(db.admin.collection('reports').orderBy('at','desc').limit(50).get());await assertFails(db.h.collection('reports').get())},{'reports/r':{by:'h',status:'open',at:1}});
 await test('room: registered host creates waiting room',()=>assertSucceeds(room('h').set(waiting())));
 await test('room: anonymous guest cannot create room',()=>assertFails(room('anon').set(waiting({host:'anon'}))));
 await test('room: banned account cannot create room',()=>assertFails(room('b').set(waiting({host:'b'}))));
 await test('room: cannot create a match already awarding a result',()=>assertFails(room('h').set(waiting({state:'done',result:{winner:'h',reason:'fake',plies:0}}))));
 await test('room: mismatched code denied',()=>assertFails(room('h').set(waiting({code:'ZZZZ'}))));
 await test('room: host cannot preassign another guest',()=>assertFails(room('h').set(waiting({guest:'g'}))));
 await test('room: waiting room readable by registered invitee',()=>assertSucceeds(room('g').get()),{'rooms/ABCD':waiting()});
 await test('room: active room hidden from third player',()=>assertFails(room('x').get()),{'rooms/ABCD':playing()});
 await test('room: anonymous read denied',()=>assertFails(room('anon').get()),{'rooms/ABCD':waiting()});
 await test('room: registered code collision check can read absent room',()=>assertSucceeds(room('h').get()));
 await test('room: ordinary collection enumeration denied',()=>assertFails(db.h.collection('rooms').get()),{'rooms/ABCD':waiting()});
 await test('room: actual host function retries an unreadable active code',async()=>{const codes=['PRIV','ABCD'],c=client('h',{onlCode:()=>codes.shift()});await c.onlHost();assert.equal(c.ONL.code,'ABCD');assert(c.listened);assert.equal((await room('h').get()).data().host,'h')},{'rooms/PRIV':playing({code:'PRIV',host:'x',guest:'g'})});
 await test('room: actual join function claims guest seat',async()=>{const c=client('g');await c.onlJoin('ABCD');assert(c.listened);assert.equal((await room('g').get()).data().guest,'g')},{'rooms/ABCD':waiting()});
 await test('room: joining cannot change host identity',()=>assertFails(room('g').update({...join(),host:'g'})),{'rooms/ABCD':waiting()});
 await test('room: joining cannot inject moves',()=>assertFails(room('g').update({...join(),moves:[m()]})),{'rooms/ABCD':waiting()});
 await test('room: two simultaneous joins keep one guest',async()=>{const a=client('g'),b=client('x');await Promise.all([a.onlJoin('ABCD'),b.onlJoin('ABCD')]);assert.equal([a,b].filter(c=>c.listened).length,1);assert(['g','x'].includes((await room('h').get()).data().guest))},{'rooms/ABCD':waiting()});
 await test('room: member cannot change host or guest after joining',async()=>{await assertFails(room('h').update({host:'x'}));await assertFails(room('h').update({guest:'x'}))},{'rooms/ABCD':playing()});
 await test('room: actual legal moves from both clients and ACK retry work',async()=>{const h=client('h'),g=client('g'),move=h.genMoves(h.initBoard(),1)[0];await h.onlSend(move);h.ONL.seq=0;await h.onlSend(move);g.ONL.seq=1;g.ONL.room=(await room('g').get()).data();const st=g.onlBoard(g.ONL.room,'g');await g.onlSend(g.genMoves(st.board,1)[0]);assert.equal((await room('h').get()).data().moves.length,2)},{'rooms/ABCD':playing()});
 await test('room: out-of-turn append denied',()=>assertFails(room('g').update({moves:[m(0,'g')]})),{'rooms/ABCD':playing()});
 await test('room: opponent impersonation denied',()=>assertFails(room('h').update({moves:[m(0,'g')]})),{'rooms/ABCD':playing()});
 await test('room: history rewrite denied',()=>assertFails(room('g').update({moves:[{...m(),steps:'41'},m(1,'g')]})),{'rooms/ABCD':playing({moves:[m()]})});
 await test('room: two moves in one request denied',()=>assertFails(room('h').update({moves:[m(),m(1,'g')]})),{'rooms/ABCD':playing()});
 await test('room: clearing history denied',()=>assertFails(room('h').update({moves:[]})),{'rooms/ABCD':playing({moves:[m()]})});
 await test('room: actual quick chat retains newest 40 messages',async()=>{const h=client('h');for(let i=0;i<41;i++)await h.onlChat(i%4);const messages=(await room('h').get()).data().messages;assert.equal(messages.length,40);assert(messages.every(e=>e.by==='h'))},{'rooms/ABCD':playing()});
 await test('room: quick chat cannot impersonate opponent',()=>assertFails(room('h').update({messages:[{id:'test',by:'g',q:1,at:1}]})),{'rooms/ABCD':playing()});
 await test('room: host can only update own heartbeat',async()=>{await assertSucceeds(room('h').update({hostSeen:firebase.firestore.FieldValue.serverTimestamp()}));await assertFails(room('h').update({guestSeen:firebase.firestore.FieldValue.serverTimestamp()}));await assertFails(room('h').update({hostSeen:1}))},{'rooms/ABCD':playing()});
 await test('room: both voice directions and ICE work',async()=>{await assertSucceeds(room('h').update({vOffer:'offer'}));await assertSucceeds(room('g').update({vAnswer:'answer'}));await assertSucceeds(room('h').update({hIce:firebase.firestore.FieldValue.arrayUnion('host-ice')}));await assertSucceeds(room('g').update({gIce:firebase.firestore.FieldValue.arrayUnion('guest-ice')}))},{'rooms/ABCD':playing()});
 await test('room: peer voice signal cannot be overwritten',async()=>{await assertFails(room('h').update({vAnswer:'fake'}));await assertFails(room('g').update({hIce:['fake']}))},{'rooms/ABCD':playing()});
 await test('room: reconnect resets voice epoch and clears both peers',()=>assertSucceeds(room('g').update({voiceEpoch:2,vOffer:null,vAnswer:null,hIce:[],gIce:[]})),{'rooms/ABCD':playing({vOffer:'old',vAnswer:'old',hIce:['a'],gIce:['b']})});
 await test('room: stale voice reset denied',()=>assertFails(room('g').update({voiceEpoch:1,vOffer:null,vAnswer:null,hIce:[],gIce:[]})),{'rooms/ABCD':playing()});
 await test('room: member can persist structurally valid result',()=>assertSucceeds(room('h').update({state:'done',result:{winner:'g',reason:'resignation',plies:0}})),{'rooms/ABCD':playing()});
 await test('room: persisted result cannot be rewritten or reopened',async()=>{await assertFails(room('h').update({result:{winner:'h',reason:'fake',plies:0}}));await assertFails(room('h').update({state:'play'}))},{'rooms/ABCD':playing({state:'done',result:{winner:'g',reason:'resignation',plies:0}})});
 await test('room: result cannot award a third player',()=>assertFails(room('h').update({state:'done',result:{winner:'x',reason:'fake',plies:0}})),{'rooms/ABCD':playing()});
 await test('room: result must refer to current move count',()=>assertFails(room('h').update({state:'done',result:{winner:'h',reason:'fake',plies:100}})),{'rooms/ABCD':playing()});
 await test('room: participant closes match without awarding result',()=>assertSucceeds(room('g').update({state:'closed',closedBy:'g'})),{'rooms/ABCD':playing()});
 await test('room: third player cannot close match',()=>assertFails(room('x').update({state:'closed',closedBy:'x'})),{'rooms/ABCD':playing()});
 await test('room: host cancels own waiting room',()=>assertSucceeds(room('h').delete()),{'rooms/ABCD':waiting()});
 await test('room: guest cannot delete room',()=>assertFails(room('g').delete()),{'rooms/ABCD':waiting()});
 await test('room: host cannot erase active match history',()=>assertFails(room('h').delete()),{'rooms/ABCD':playing()});
 }finally{if(env)await env.cleanup()}
 console.log(`Firestore rules: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
