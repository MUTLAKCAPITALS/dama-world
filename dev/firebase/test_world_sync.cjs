// Six independent Firebase clients run the shipped world module with real native WebRTC data channels
// against loopback Firestore rules. This proves sync logic, not phones, Safari, WebGL or mobile networks.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');firebase.firestore.setLogLevel('silent');
const rtc=require(process.env.VOICE_WRTC_MODULE||'@roamhq/wrtc');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181')throw Error('Loopback emulator required');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(root+'/dev/world_mp.js','utf8'),rules=fs.readFileSync(root+'/firestore.rules','utf8');
const clients=[],nativePCs=[],timers=new Set();let env,passed=0,frames=null;
function wire(v){if(Array.isArray(v))return Array.from(v,wire);if(v&&typeof v==='object'&&v.constructor?.name==='Object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,wire(x)]));return v}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function snapshot(){return JSON.stringify(clients.map(w=>({uid:w.uid,slot:w.W.slot,err:w.W.error,notes:w.notices.slice(-3),avatars:[...w.W.avatars.keys()],peers:[...w.W.peers.values()].map(p=>({uid:p.uid,state:p.state,dc:p.dc&&p.dc.readyState,n:p.n,pc:p.pc&&p.pc.connectionState}))})))}
async function until(check,label,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(check())return;await sleep(50)}console.error('WORLD STATE',snapshot());throw Error(label+' timed out')}
function checked(name){passed++;console.log('PASS',name)}
const vec=(x=0,y=0,z=0)=>({x,y,z,set(a,b,c){this.x=a;this.y=b;this.z=c;return this},copy(o){this.x=o.x;this.y=o.y;this.z=o.z;return this},distanceToSquared(o){return(this.x-o.x)**2+(this.y-o.y)**2+(this.z-o.z)**2},addScaledVector(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this},project(){return this},clone(){return vec(this.x,this.y,this.z)}});
function client(uid,name,{webrtc=true}={}){
  const db=env.authenticatedContext(uid,{firebase:{sign_in_provider:'password'}}).firestore(),notices=[],rooms=[],closed=[];
  // Values built inside the vm realm are converted to plain objects, as a browser page would pass them.
  const raw=r=>r&&r._d||r,doc=d=>({_d:d,id:d.id,path:d.path,collection:n=>col(d.collection(n)),get:o=>d.get(o),set:(v,o)=>d.set(wire(v),o),update:v=>d.update(wire(v)),delete:()=>d.delete(),onSnapshot:(...a)=>d.onSnapshot(...a)});
  const query=q=>({limit:n=>query(q.limit(n)),where:(...a)=>query(q.where(...a)),get:o=>q.get(o),onSnapshot:(...a)=>q.onSnapshot(...a)});
  const col=c=>Object.assign(query(c),{doc:id=>doc(c.doc(id)),add:v=>c.add(wire(v))});
  const sdk={collection:n=>col(db.collection(n)),runTransaction:f=>db.runTransaction(tx=>f({get:r=>tx.get(raw(r)),set:(r,v)=>tx.set(raw(r),wire(v)),update:(r,v)=>tx.update(raw(r),wire(v)),delete:r=>tx.delete(raw(r))}))};
  const PC=webrtc?function(cfg){const pc=new rtc.RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle'});nativePCs.push(pc);return pc}:undefined;
  const c=vm.createContext({console,Date,Math,JSON,Set,Map,Array,Object,Number,String,Promise,Uint8Array,Error,crypto:require('node:crypto').webcrypto,performance,
    setTimeout,clearTimeout,setInterval:(f,ms)=>{const t=setInterval(f,ms);timers.add(t);return t},clearInterval,
    RTCPeerConnection:PC,window:{RTCPeerConnection:PC},document:{hidden:false,addEventListener(){}},navigator:{onLine:true},addEventListener(){},innerWidth:800,innerHeight:400,
    S:{country:'kw',name,look:{skin:2,face:1,hair:1,hairColor:0,outfit:'dishdasha',outfitColor:0,acc:'ghutra',eye:0,lash:0},settings:{}},ACC:{synced:true,key:name.toLowerCase(),name},CTL:{ban:false,mute:false},LOBBY:{on:false},
    W:{theme:{key:'kw'},bounds:[-102,102,-102,108],tables:[{c:vec(30,0,-30),a:vec(1,0,0)}]},mode:'explore',game:null,
    player:{pos:vec(30+clients.length,0,-9),rot:0,sitting:false,ch:{userData:{speed:0,action:'idle'}}},camera:{position:vec(0,2,0)},v3:vec(),
    scene:{add(){},remove(){}},groundY:()=>0,animChar(){},buildChar:look=>({look,visible:true,position:vec(),rotation:{y:0},userData:{}}),
    rsUid:()=>uid,rcBlocked:()=>false,requirePlayAccount:()=>true,toast:t=>notices.push(t),$:()=>null,esc:s=>String(s),ic:()=>'',persist(){},
    ONL:{db:sdk,user:{uid}},onlInit:async()=>({uid}),onlCode:()=>Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join(''),
    onlListen:ref=>{rooms.push(ref.id);c.ONL.ref=ref},onlClose:del=>{closed.push(del);const ref=c.ONL.ref;c.ONL.ref=null;c.ONL.code=null;if(del&&ref)ref.delete().catch(()=>{})},onlDlg(){},closeLayer(){},
    firebase});
  vm.runInContext(source,c);const W=vm.runInContext('WMP',c);c.wmpUI=()=>{};
  const w={uid,name,c,W,db,notices,rooms,closed};clients.push(w);return w}
function drive(){let last=performance.now();frames=setInterval(()=>{const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;for(const w of clients){if(w.dead)continue;try{w.c.wmpFrame(dt,now/1000)}catch(e){console.error(e)}}},33);timers.add(frames)}
const avatar=(w,uid)=>w.W.avatars.get(uid);
let finished=false;async function finish(){if(finished)return;finished=true;for(const w of clients)try{w.c.wmpStop()}catch{}await Promise.all(clients.map(w=>w.W.releasing));for(const t of timers)clearInterval(t);for(const p of nativePCs)try{p.close()}catch{}if(env)await env.cleanup();await sleep(200)}
(async()=>{env=await initializeTestEnvironment({projectId:'demo-dama-world-rules',firestore:{host:'127.0.0.1',port:8181,rules}});await env.clearFirestore();
  const people=[['p1','Fahad'],['p2','Salem'],['p3','Noura'],['p4','Mutlak'],['p5','Hessa'],['p6','Yousef']];
  await env.withSecurityRulesDisabled(async c=>{const b=c.firestore().batch();for(const [uid,name]of people)b.set(c.firestore().doc('names/'+name.toLowerCase()),{uid,name,at:1});await b.commit()});
try{
  const five=people.slice(0,5).map(([u,n])=>client(u,n));drive();
  await Promise.all(five.map((w,i)=>sleep(i*60).then(()=>w.c.wmpJoin(true))));
  for(const w of five)w.ticker=setInterval(()=>w.dead||w.c.wmpTick(),1000),timers.add(w.ticker);
  await until(()=>five.every(w=>w.W.slot!=null),'all seated');assert.equal(new Set(five.map(w=>w.W.slot)).size,5);
  checked('five registered players claim five distinct seats in the same channel through real rules');
  await until(()=>five.every(w=>w.W.avatars.size===4&&[...w.W.peers.values()].every(p=>p.dc&&p.dc.readyState==='open')),'direct mesh',30000);
  assert(five.every(w=>w.c.wmpCount()===5));checked('every player sees the other four real characters over a full direct data-channel mesh (10 connections)');
  for(const w of five)for(const a of w.W.avatars.values())assert.equal(a.name,people.find(p=>p[0]===a.uid)[1]);checked('names above characters come from the reserved names on authenticated seats');
  const seatBefore=(await five[0].db.doc('worlds/kw_1/seats/'+five[0].W.slot).get()).data();
  five[0].c.player.pos.set(12,0,-4);five[0].c.player.rot=1.2;five[0].c.player.ch.userData.speed=5;
  await until(()=>five.slice(1).every(w=>{const a=avatar(w,'p1');return a&&Math.abs(a.x-12)<.05&&Math.abs(a.z+4)<.05}),'movement over data channels',8000);
  const seatAfter=(await five[0].db.doc('worlds/kw_1/seats/'+five[0].W.slot).get()).data();assert.equal(seatAfter.x,seatBefore.x,'no Firestore pose write while direct channels are open');
  assert(five.slice(1).every(w=>avatar(w,'p1').st==='run'));checked('movement, rotation and running state reach all four players directly, with zero Firestore pose writes');
  five[0].c.player.ch.userData.speed=0;five[0].c.player.sitting=true;await until(()=>five.slice(1).every(w=>avatar(w,'p1').st==='sit'),'sit state');five[0].c.player.sitting=false;
  checked('sitting is synchronized as an animation state');
  // Relay-only phone: no WebRTC support, so it must use the throttled server fallback in both directions.
  const six=client(people[5][0],people[5][1],{webrtc:false});await six.c.wmpJoin(true);six.ticker=setInterval(()=>six.c.wmpTick(),1000);timers.add(six.ticker);
  await until(()=>six.W.avatars.size===5&&five.every(w=>avatar(w,'p6')),'sixth player visible',15000);assert(clients.every(w=>w.c.wmpCount()===6));
  checked('a sixth player without direct connectivity still appears for everyone (6 phones, one channel)');
  six.c.player.pos.set(-20,0,15);await until(()=>five.every(w=>{const a=avatar(w,'p6');return a&&a.relay.x===-20&&a.relay.z===15}),'fallback movement from relay-only player',20000);
  five[1].c.player.pos.set(40,0,-20);await until(()=>{const a=avatar(six,'p2');return a&&a.relay.x===40},'fallback movement to relay-only player',20000);
  checked('when direct connection is impossible, positions still travel through the rate-limited server fallback both ways');
  // Clean exit sends goodbye and releases the seat.
  const leaver=five[1];leaver.c.wmpStop();await leaver.W.releasing;
  await until(()=>clients.filter(w=>w!==leaver).every(w=>!avatar(w,'p2')),'leave removes character',5000);
  assert.equal((await five[0].db.collection('worlds/kw_1/seats').limit(8).get()).docs.filter(d=>d.data().uid==='p2').length,0);
  checked('leaving removes the character for every other player at once and frees the seat');
  // Abrupt disconnect: no goodbye, no release. Direct channels close and the avatar disappears within seconds.
  const lost=five[2];lost.dead=true;clearInterval(lost.ticker);lost.W.gen++;for(const p of lost.W.peers.values()){try{p.pc&&p.pc.close()}catch{}}
  await until(()=>[five[0],five[3],five[4]].every(w=>{const a=avatar(w,'p3');return !a||!w.c.wmpVisible(a)}),'crash hides character',15000);
  checked('a phone that drops without leaving disappears for others after the direct channel closes');
  // Reconnect with a new session: exactly one character again.
  leaver.c.wmpJoin(true);await until(()=>[five[0],five[3],five[4]].every(w=>{const a=avatar(w,'p2');return a&&w.c.wmpVisible(a)})&&leaver.W.avatars.has('p1'),'rejoin',20000);
  assert([five[0],five[3],five[4]].every(w=>[...w.W.avatars.keys()].filter(u=>u==='p2').length===1));checked('reconnecting shows the player again without duplicate characters');
  // Same account opened on another device replaces the old character.
  const twin=client('p5','Hessa');await twin.c.wmpJoin(true);
  await until(()=>five[4].W.kicked===true&&!five[4].W.uid,'old device replaced',10000);
  await until(()=>five[0].W.avatars.get('p5')?.session===twin.W.session,'others see the new device',15000);
  assert.equal([...five[0].W.avatars.keys()].filter(u=>u==='p5').length,1);five[4].dead=true;
  checked('the same account on a second phone replaces the first character; the old phone stops instead of fighting back');
  // Real challenge: room creation, invitation, acceptance and room join through the shipped functions.
  const host=five[0],guest=five[3];host.c.wmpChallenge('p4');
  await until(()=>[...guest.W.invites.values()].some(d=>guest.c.wmpInviteValid(d)),'invitation delivered',10000);
  const invite=[...guest.W.invites.values()].find(d=>guest.c.wmpInviteValid(d));assert.equal(invite.fromName,'Fahad');assert.equal(invite.code,host.W.challenge.code);
  await guest.c.wmpAccept(invite);
  const roomDoc=(await host.db.doc('rooms/'+invite.code).get()).data();assert.equal(roomDoc.host,'p1');assert.equal(roomDoc.guest,'p4');assert.equal(roomDoc.state,'play');
  await until(()=>host.W.challenge&&host.W.challenge.state==='accepted','host sees acceptance',8000);
  assert.equal(guest.W.matchOpp,'p1');assert.equal(host.W.matchOpp,'p4');assert.equal(guest.W.matchTable,host.W.matchTable);assert.deepEqual(guest.rooms,[invite.code]);
  checked('tap-to-challenge creates a real room, the friend accepts, and both are bound to the same room, opponent and table');
  // Decline path closes the waiting room.
  const h2=leaver,g2=twin;h2.c.game=null;h2.c.ONL.ref=null;h2.c.wmpChallenge('p5');
  await until(()=>[...g2.W.invites.values()].some(d=>g2.c.wmpInviteValid(d)),'second invitation',10000);const inv2=[...g2.W.invites.values()].find(d=>g2.c.wmpInviteValid(d));
  await g2.c.wmpDecline(inv2);await until(()=>!h2.W.challenge,'decline seen',8000);assert(h2.notices.some(t=>/اعتذر/.test(t)));assert(h2.closed.includes(true));
  assert.equal((await h2.db.doc('rooms/'+inv2.code).get()).exists,false);
  checked('declining notifies the challenger and deletes the waiting room');
}finally{await finish()}console.log(`World multiplayer sync: ${passed} passed. Native WebRTC data channels + Firestore emulator; phones/browsers not verified.`);
})().then(()=>process.exit(0),async e=>{console.error(e);await finish();process.exit(1)});
