// Multiplayer world rules with independent Firebase SDK clients and the shipped claim transaction.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');firebase.firestore.setLogLevel('silent');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181')throw Error('Loopback emulator required');
const root=path.resolve(__dirname,'../..'),rules=fs.readFileSync(root+'/firestore.rules','utf8'),source=fs.readFileSync(root+'/dev/world_mp.js','utf8');
const owner=rules.match(/request\.auth\.token\.email == '([^']+)'/)[1],stamp=()=>firebase.firestore.FieldValue.serverTimestamp(),ago=ms=>firebase.firestore.Timestamp.fromMillis(Date.now()-ms);
const sessions={a:'a'.repeat(32),b:'b'.repeat(32),x:'c'.repeat(32)},names={a:'Alice',b:'Bobby',x:'Other'},keys={a:'alice',b:'bobby',x:'other'};
const look={skin:2,face:1,hair:1,hairColor:0,outfit:'dishdasha',outfitColor:0,acc:'ghutra',eye:0,lash:0,g:'m'};
let env,db={},passed=0,failed=0;
const seat=(uid,extra={})=>({uid,name:names[uid],nameKey:keys[uid],session:sessions[uid],at:ago(5000),look,x:1,z:2,r:0,st:'idle',...extra});
const user=(uid,slot,space='kw_1')=>({space,slot,session:sessions[uid]});
const pair=(extra={})=>({'worlds/kw_1/seats/0':seat('a'),'worlds/kw_1/seats/1':seat('b'),'worldUsers/a':user('a','0'),'worldUsers/b':user('b','1'),...extra});
const room=(host='a',extra={})=>({code:'AB23',protocol:2,matchId:'m-1',host,hostName:'Alice',hostPhoto:null,hostRating:1000,guest:null,guestName:'',state:'wait',moves:[],messages:[],voiceEpoch:1,resigned:null,created:1,...extra});
const challenge=(extra={})=>({from:'a',fromName:'Alice',fromKey:'alice',to:'b',toName:'Bobby',space:'kw_1',toSlot:'1',code:'AB23',table:0,state:'pending',at:stamp(),...extra});
const signal=(extra={})=>({fromSession:sessions.a,toSession:sessions.b,n:1,sdp:'v=0',type:'offer',ice:[],at:stamp(),...extra});
const ref=(uid,p)=>db[uid].doc(p);
async function seed(extra={}){await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const batch=c.firestore().batch();const data={};for(const uid of ['a','b','x'])data['names/'+keys[uid]]={uid,name:names[uid],at:1};for(const [k,v]of Object.entries({...data,...extra}))batch.set(c.firestore().doc(k),v);await batch.commit()})}
async function test(name,f,extra={}){try{await seed(typeof extra==='function'?extra():extra);await f();passed++;console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.stack||e)}}
function claim(uid,slot='0',extra={},space='kw_1'){const b=db[uid].batch();b.set(ref(uid,'worlds/'+space+'/seats/'+slot),seat(uid,{at:stamp(),...extra}));b.set(ref(uid,'worldUsers/'+uid),{...user(uid,slot,space),session:extra.session||sessions[uid]});return b.commit()}
function wire(v){if(Array.isArray(v))return Array.from(v,wire);if(v&&typeof v==='object'&&v.constructor?.name==='Object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,wire(x)]));return v}
function client(uid){const c=vm.createContext({console,Date,Math,JSON,Set,Map,Array,Object,Number,String,Promise,Uint8Array,crypto:require('node:crypto').webcrypto,firebase,S:{settings:{}},
  ONL:{db:{collection:n=>db[uid].collection(n),runTransaction:f=>db[uid].runTransaction(tx=>f({get:r=>tx.get(r),set:(r,v)=>tx.set(r,wire(v)),update:(r,v)=>tx.update(r,wire(v)),delete:r=>tx.delete(r)}))}}});
  vm.runInContext(source,c);return c}
const pose={x:1,z:2,r:0,st:'idle'};
(async()=>{env=await initializeTestEnvironment({projectId:'demo-dama-world-rules',firestore:{host:'127.0.0.1',port:8181,rules}});
for(const uid of ['a','b','x'])db[uid]=env.authenticatedContext(uid,{firebase:{sign_in_provider:'password'}}).firestore();
db.anon=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();db.public=env.unauthenticatedContext().firestore();
try{
await test('world: shipped claim gives two concurrent registered players separate seats',async()=>{const a=client('a'),b=client('b');
  const slots=await Promise.all([a.wmpClaim('kw_1',sessions.a,'a','Alice','alice',look,pose),b.wmpClaim('kw_1',sessions.b,'b','Bobby','bobby',look,pose)]);
  assert.equal(new Set(slots).size,2);assert.equal((await db.a.collection('worlds/kw_1/seats').limit(8).get()).size,2)});
await test('world: the same account on two devices ends with exactly one live character',async()=>{const a=client('a');
  await a.wmpClaim('kw_1',sessions.a,'a','Alice','alice',look,pose);await a.wmpClaim('kw_1','d'.repeat(32),'a','Alice','alice',look,pose);
  const seats=(await db.a.collection('worlds/kw_1/seats').limit(8).get()).docs.map(d=>d.data());assert.equal(seats.length,1);assert.equal(seats[0].session,'d'.repeat(32))});
await test('world: moving to another channel deletes the old seat in the same transaction',async()=>{const a=client('a');
  await a.wmpClaim('kw_1',sessions.a,'a','Alice','alice',look,pose);await a.wmpClaim('kw_2','e'.repeat(32),'a','Alice','alice',look,pose);
  assert.equal((await db.a.collection('worlds/kw_1/seats').limit(8).get()).size,0);assert.equal((await db.a.collection('worlds/kw_2/seats').limit(8).get()).size,1)});
await test('world: impersonating a reserved name, another uid, a guest or an unsigned client is refused',async()=>{
  await assertFails(claim('x','0',{name:'Alice',nameKey:'alice'}));await assertFails(claim('x','0',{uid:'a'}));
  const b=db.anon.batch();b.set(db.anon.doc('worlds/kw_1/seats/0'),{...seat('a'),uid:'anon',at:stamp()});await assertFails(b.commit());
  await assertFails(db.public.collection('worlds/kw_1/seats').limit(8).get());await assertFails(db.anon.collection('worlds/kw_1/seats').limit(8).get())});
await test('world: banned accounts cannot claim a seat',async()=>{await assertFails(claim('a'))},{'ctl/a':{ban:true}});
await test('world: a live seat cannot be stolen, moved or renamed by another player',async()=>{
  await assertFails(claim('x','0'));await assertFails(ref('x','worlds/kw_1/seats/0').update({x:50,at:stamp()}));await assertFails(ref('x','worlds/kw_1/seats/0').delete());
  await assertFails(ref('a','worlds/kw_1/seats/0').update({name:'Other',at:stamp()}));await assertFails(ref('a','worlds/kw_1/seats/0').update({uid:'x',at:stamp()}))},pair());
await test('world: an older tab whose session was replaced cannot move the new character',async()=>{
  await assertFails(ref('a','worlds/kw_1/seats/0').update({session:'f'.repeat(32),x:9,at:stamp()}));
  await assertSucceeds(ref('a','worlds/kw_1/seats/0').update({session:sessions.a,x:9,z:3,r:1,st:'walk',at:stamp()}))},pair());
await test('world: pose writes are limited to one per two seconds',async()=>{
  await assertFails(ref('a','worlds/kw_1/seats/0').update({x:3,at:stamp()}))},pair({'worlds/kw_1/seats/0':seat('a',{at:ago(500)})}));
await test('world: positions, rotation, state and look are bounded and whitelisted',async()=>{const r=ref('a','worlds/kw_1/seats/0');
  for(const bad of [{x:500},{z:-201},{r:9},{st:'fly'},{x:'1'},{look:{...look,skin:9}},{look:{...look,extra:1}},{look:{...look,outfit:'cape'}},{extra:true}])await assertFails(r.update({...bad,at:stamp()}));
  await assertSucceeds(r.update({x:-101.5,z:107,r:-3.1,st:'run',look:{...look,outfit:'abaya',g:'f'},at:stamp()}))},pair());
await test('world: eight seats per channel; invalid channels, slots and large queries are refused',async()=>{
  await assertFails(claim('a','8'));await assertFails(claim('a','0',{},'kw_11'));await assertFails(claim('a','0',{},'xx_1'));
  await assertFails(db.a.collection('worlds/kw_1/seats').limit(9).get());await assertSucceeds(db.a.collection('worlds/kw_1/seats').limit(8).get())});
await test('world: a seat abandoned for 70 s can be reused by another real player',async()=>{await assertSucceeds(claim('x','0'))},pair({'worlds/kw_1/seats/0':seat('a',{at:ago(71000)})}));
await test('world: an account cannot keep a second seat alive without its single membership pointer',async()=>{
  await assertFails(ref('a','worlds/kw_2/seats/0').set({...seat('a'),at:stamp()}));
  await assertFails(ref('a','worldUsers/a').set(user('a','1')))},pair());
await test('world: direct-connection signaling is private to its two seated players',async()=>{
  await assertSucceeds(ref('a','worlds/kw_1/seats/0/signals/1').set(signal()));await assertSucceeds(ref('b','worlds/kw_1/seats/0/signals/1').get());
  await assertFails(ref('x','worlds/kw_1/seats/0/signals/1').get());await assertFails(ref('b','worlds/kw_1/seats/0/signals/1').set(signal()));
  await assertFails(ref('a','worlds/kw_1/seats/0/signals/1').set(signal({type:'answer'})));await assertFails(ref('a','worlds/kw_1/seats/0/signals/1').set(signal({sdp:'x'.repeat(17000)})));
  await assertFails(ref('a','worlds/kw_1/seats/0/signals/1').set(signal({toSession:'f'.repeat(32)})));await assertSucceeds(ref('b','worlds/kw_1/seats/1/signals/0').set(signal({fromSession:sessions.b,toSession:sessions.a,type:'answer'})))},pair());
await test('world: blocked players cannot exchange connection data',async()=>{await assertFails(ref('a','worlds/kw_1/seats/0/signals/1').set(signal()))},pair({'socialBlocks/b':{uids:['a'],at:ago(1)}}));
await test('challenge: a seated player can challenge a seated player in the same channel with their own waiting room',async()=>{
  await assertSucceeds(ref('a','worldChallenges/a').set(challenge()));await assertSucceeds(ref('b','worldChallenges/a').get());await assertFails(ref('x','worldChallenges/a').get());
  await assertSucceeds(db.b.collection('worldChallenges').where('to','==','b').limit(5).get());await assertFails(db.x.collection('worldChallenges').where('to','==','b').limit(5).get());
  await assertFails(db.b.collection('worldChallenges').where('to','==','b').limit(6).get())},pair({'rooms/AB23':room()}));
await test('challenge: spoofed names, absent targets, other channels and foreign rooms are refused',async()=>{
  await assertFails(ref('a','worldChallenges/a').set(challenge({fromName:'Bobby',fromKey:'bobby'})));await assertFails(ref('a','worldChallenges/a').set(challenge({toSlot:'2'})));
  await assertFails(ref('a','worldChallenges/a').set(challenge({toName:'Other'})));await assertFails(ref('a','worldChallenges/a').set(challenge({space:'kw_2'})));
  await assertFails(ref('a','worldChallenges/a').set(challenge({code:'ZZ99'})));await assertFails(ref('x','worldChallenges/x').set(challenge({from:'x',fromName:'Other',fromKey:'other'})));
  await assertFails(ref('a','worldChallenges/b').set(challenge()));await assertFails(ref('a','worldChallenges/a').set(challenge({to:'a',toName:'Alice',toSlot:'0'})))},
  pair({'rooms/AB23':room(),'rooms/ZZ99':room('x',{code:'ZZ99'})}));
await test('challenge: blocked or stale targets cannot be challenged',async()=>{await assertFails(ref('a','worldChallenges/a').set(challenge()))},pair({'rooms/AB23':room(),'socialBlocks/b':{uids:['a'],at:ago(1)}}));
await test('challenge: stale target seat refuses a challenge',async()=>{await assertFails(ref('a','worldChallenges/a').set(challenge()))},pair({'rooms/AB23':room(),'worlds/kw_1/seats/1':seat('b',{at:ago(80000)})}));
await test('challenge: only the recipient accepts or declines; the sender can only cancel',async()=>{
  await assertFails(ref('a','worldChallenges/a').update({state:'accepted'}));await assertFails(ref('x','worldChallenges/a').update({state:'declined'}));
  await assertFails(ref('b','worldChallenges/a').update({state:'accepted',code:'ZZ99'}));await assertSucceeds(ref('b','worldChallenges/a').update({state:'accepted'}));
  await assertFails(ref('b','worldChallenges/a').update({state:'declined'}))},pair({'rooms/AB23':room(),'worldChallenges/a':{...challenge(),at:ago(2000)}}));
await test('challenge: expired invitations cannot be accepted, and resending is throttled',async()=>{
  await assertFails(ref('b','worldChallenges/a').update({state:'accepted'}));await assertSucceeds(ref('b','worldChallenges/a').update({state:'declined'}))},pair({'rooms/AB23':room(),'worldChallenges/a':{...challenge(),at:ago(61000)}}));
await test('challenge: a pending challenge cannot be replaced within 10 s but can be cancelled',async()=>{
  await assertFails(ref('a','worldChallenges/a').set(challenge()));await assertSucceeds(ref('a','worldChallenges/a').update({state:'cancelled'}));await assertSucceeds(ref('a','worldChallenges/a').set(challenge()))},
  pair({'rooms/AB23':room(),'worldChallenges/a':{...challenge(),at:ago(2000)}}));
const playing=(moves,extra={})=>({'rooms/AB23':room('a',{guest:'b',guestProtocol:2,guestName:'Bobby',state:'play',moves,...extra})});
const mv=(n,by)=>({n,by,from:'52',steps:'43',caps:''});
await test('results: a player cannot claim a win unless they made the last move',async()=>{
  await assertFails(ref('a','rooms/AB23').update({state:'done',result:{winner:'a',reason:'لم يبقَ للخصم حركة',plies:2}}));
  await assertSucceeds(ref('b','rooms/AB23').update({state:'done',result:{winner:'a',reason:'لا توجد لديك حركة متاحة',plies:2}}))},playing([mv(0,'a'),mv(1,'b')]));
await test('results: winning after your own last move and draws remain possible',async()=>{
  await assertSucceeds(ref('a','rooms/AB23').update({state:'done',result:{winner:'a',reason:'أكلت كل أحجار الخصم',plies:1}}))},playing([mv(0,'a')]));
await test('results: resigning always names the opponent as winner',async()=>{
  await assertFails(ref('a','rooms/AB23').update({state:'done',result:{winner:'a',reason:'استسلام',plies:1}}));
  await assertFails(ref('a','rooms/AB23').update({state:'done',result:{winner:null,reason:'استسلام',plies:1}}));
  await assertSucceeds(ref('a','rooms/AB23').update({state:'done',result:{winner:'b',reason:'استسلام',plies:1}}))},playing([mv(0,'a')]));
}finally{await env.cleanup()}
console.log(`World multiplayer rules: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
