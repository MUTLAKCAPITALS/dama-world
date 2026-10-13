'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const firebase=require('../firebase/node_modules/firebase/compat/app');
require('../firebase/node_modules/firebase/compat/auth');require('../firebase/node_modules/firebase/compat/functions');
const {initBoard,genMoves}=require('../../functions/engine.cjs');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.GCLOUD_PROJECT!=='demo-dama-world-backend')throw Error('Local demo emulators are required');
const projectId='demo-dama-world-backend',admin=initializeApp({projectId}),db=getFirestore(admin),apps=[];
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name)}
function client(name){const app=firebase.initializeApp({projectId,apiKey:'emulator-only-key',appId:'emulator-only-app'},name);apps.push(app);app.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true});const f=app.functions('us-central1');f.useEmulator('127.0.0.1',5001);return {app,call:async(name,data)=>(await f.httpsCallable(name,{timeout:10000})(data)).data}}
(async()=>{try{
 await db.doc('cfg/backend').set({enabled:true,protocol:3,accountDeletion:true});
 const h=client('host'),g=client('guest'),anon=client('anonymous');
 await test('HTTP callable rejects a missing Firebase Auth token',()=>assert.rejects(h.call('damaOnline',{action:'profile'}),e=>e.code==='functions/unauthenticated'));
 await anon.app.auth().signInAnonymously();
 await test('HTTP callable rejects a real anonymous token',()=>assert.rejects(anon.call('damaOnline',{action:'profile'}),e=>e.code==='functions/permission-denied'));
 const hu=(await h.app.auth().createUserWithEmailAndPassword('host@example.invalid','emulator-only-password')).user;
 const gu=(await g.app.auth().createUserWithEmailAndPassword('guest@example.invalid','emulator-only-password')).user;
 await db.doc('users/'+hu.uid).set({name:'Host',save:'{}'});await db.doc('users/'+gu.uid).set({name:'Guest',save:'{}'});
 let room;
 await test('HTTP callable creates a room with authenticated owner',async()=>{room=await h.call('damaOnline',{action:'create',requestId:'http_create_request_1234'});assert.equal((await db.doc('rooms/'+room.code).get()).data().host,hu.uid)});
 await test('HTTP callable preserves create idempotency',async()=>assert.deepEqual(await h.call('damaOnline',{action:'create',requestId:'http_create_request_1234'}),room));
 await test('HTTP callable joins a real second account',async()=>{await g.call('damaOnline',{action:'join',code:room.code});assert.equal((await db.doc('rooms/'+room.code).get()).data().guest,gu.uid)});
 const base={code:room.code,matchId:room.matchId};
 await test('HTTP callable rejects a forged result',()=>assert.rejects(h.call('damaOnline',{...base,action:'finish',winner:hu.uid}),e=>e.code==='functions/invalid-argument'));
 await test('HTTP callable rejects board-illegal coordinates',()=>assert.rejects(h.call('damaOnline',{...base,action:'move',move:{n:0,from:'10',steps:'70',caps:''}}),e=>e.code==='functions/invalid-argument'));
 await test('HTTP callable commits a legal move',async()=>{const m=genMoves(initBoard(),1)[0],enc=a=>a.map(p=>p.join('')).join(',');await h.call('damaOnline',{...base,action:'move',move:{n:0,from:enc([m.from]),steps:enc(m.steps),caps:enc(m.caps)}});assert.equal((await db.doc('rooms/'+room.code).get()).data().moves.length,1)});
 await test('HTTP callable settles resignation and one reward receipt',async()=>{const r=await g.call('damaOnline',{...base,action:'resign'});assert.equal(r.result.winner,hu.uid);await g.call('damaOnline',{...base,action:'resign'});assert.equal((await db.doc('competitive/'+hu.uid).get()).data().coins,50);assert.equal((await db.collection('competitive/'+hu.uid+'/receipts').get()).size,1)});
 await test('HTTP deletion requires explicit confirmation',()=>assert.rejects(g.call('damaDeleteAccount',{}),e=>e.code==='functions/invalid-argument'));
 await test('HTTP deletion request and CloudEvent worker complete cleanup',async()=>{
   const r=await g.call('damaDeleteAccount',{confirmation:'DELETE_MY_ACCOUNT'});assert(r.accepted);
   const document='accountDeletions/'+gu.uid,event={specversion:'1.0',id:'local-deletion-event',source:'//firestore.googleapis.com/projects/'+projectId+'/databases/(default)',type:'google.cloud.firestore.document.v1.created',time:new Date().toISOString(),datacontenttype:'application/json',document,database:'(default)',namespace:'(default)',location:'us-central1',project:projectId,data:{value:{name:'projects/'+projectId+'/databases/(default)/documents/'+document,fields:{state:{stringValue:'pending'}},createTime:new Date().toISOString(),updateTime:new Date().toISOString()}}};
   for(let i=0;i<2;i++){const out=await fetch('http://127.0.0.1:5003/',{method:'POST',headers:{'content-type':'application/cloudevents+json'},body:JSON.stringify(event)});assert(out.ok,await out.text())}
   assert.equal((await db.doc(document).get()).data().state,'done');assert(!(await db.doc('users/'+gu.uid).get()).exists);assert((await db.doc('users/'+hu.uid).get()).exists)
 });
 console.log(`Callable integration: ${passed} passed`);
 }finally{for(const app of apps)await app.delete();await deleteApp(admin)}
})().catch(e=>{console.error(e);process.exitCode=1});
