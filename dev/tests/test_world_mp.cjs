// Real multiplayer world client: runs the shipped v38 module with small stand-ins (no WebGL, no production Firebase).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(root+'/dev/world_mp.js','utf8'),html=fs.readFileSync(root+'/index.html','utf8');
const game=html.match(/<script id="damaGameSource" type="application\/x-dama-game">([\s\S]*?)<\/script>/)[1];
const ts=ms=>({toMillis:()=>ms});
function context(opts={}){
  let clock=opts.clock||1000;const writes=[],updates=[],notices=[],scene=new Set(),timers=new Map();let tid=0;
  const vec=(x=0,y=0,z=0)=>({x,y,z,set(a,b,c){this.x=a;this.y=b;this.z=c;return this},copy(o){this.x=o.x;this.y=o.y;this.z=o.z;return this},distanceToSquared(o){return(this.x-o.x)**2+(this.y-o.y)**2+(this.z-o.z)**2},addScaledVector(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this},project(){this.z=0;return this},clone(){return vec(this.x,this.y,this.z)}});
  const ref=(path)=>({path,update:async v=>{updates.push({path,v});if(opts.updateFail)throw opts.updateFail},set:async v=>{writes.push({path,v})},onSnapshot:()=>()=>{},collection:n=>({doc:d=>ref(path+'/'+n+'/'+d)}),limit:()=>({onSnapshot:()=>()=>{},get:async()=>({docs:[]})})});
  const c=vm.createContext({console,Date:{now:()=>clock},Math,JSON,Set,Map,Array,Object,Number,String,Promise,Uint8Array,Error,crypto:require('node:crypto').webcrypto,
    performance:{now:()=>clock},setTimeout:(f,ms)=>{timers.set(++tid,{f,ms});return tid},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){},
    window:{},document:{hidden:false,head:{appendChild(){}},body:{appendChild(){}},createElement:()=>({style:{},setAttribute(){},appendChild(){},querySelector:()=>({})}),addEventListener(){}},
    navigator:{onLine:true},addEventListener(){},innerWidth:800,innerHeight:400,
    S:{country:'kw',look:{skin:2,face:1,hair:1,hairColor:0,outfit:'dishdasha',outfitColor:0,acc:'ghutra',eye:0,lash:0},settings:{},name:'Alice'},
    ACC:{synced:true,key:'alice',name:'Alice'},CTL:{ban:false,mute:false},LOBBY:{on:false},W:{theme:{key:'kw'},bounds:[-102,102,-102,108],tables:[]},mode:'explore',game:null,
    player:{pos:vec(0,0,0),rot:0,sitting:false,ch:{userData:{speed:0,action:'idle'}}},camera:{position:vec(0,1,5)},v3:vec(),
    ONL:{db:{collection:n=>({doc:d=>ref(n+'/'+d),where:()=>({limit:()=>({onSnapshot:()=>()=>{}})})}),runTransaction:async f=>f({get:async()=>({exists:false}),set(){},update(){},delete(){}})}},
    firebase:{firestore:{FieldValue:{serverTimestamp:()=>'SERVER_TIME'}}},
    scene:{add:o=>scene.add(o),remove:o=>scene.delete(o)},groundY:()=>0,animChar(){},
    buildChar:look=>({look,visible:true,position:vec(),rotation:{y:0},userData:{}}),
    rsUid:()=>opts.uid===undefined?'alice':opts.uid,rcBlocked:uid=>(opts.blocked||[]).includes(uid),requirePlayAccount:()=>true,toast:t=>notices.push(t),$:()=>null,esc:s=>String(s),ic:()=>'',persist(){},onlInit:async()=>{},
    VC_ICE:[],RTCPeerConnection:undefined});
  vm.runInContext(source,c);const W=vm.runInContext('WMP',c);
  return{c,W,writes,updates,notices,scene,timers,tick:ms=>{clock+=ms},now:()=>clock,set:v=>{clock=v}};
}
function row(uid,slot,at,extra={}){return Object.assign({slot:String(slot),uid,name:uid.toUpperCase(),nameKey:uid,session:uid[0].repeat(32),at:ts(at),look:{skin:1,face:0,hair:1,hairColor:0,outfit:'casual',outfitColor:2,acc:'none',eye:0,lash:0,g:'m'},x:5,z:5,r:0,st:'idle'},extra)}
function joined(w){Object.assign(w.W,{uid:'alice',space:'kw_1',slot:'0',session:'a'.repeat(32),gen:1,lastBeat:w.now(),lastWrite:w.now()-10000});w.c.wmpPeer=r=>{const p={uid:r.uid,slot:r.slot,session:r.session,gen:1,state:'connecting',created:w.now(),dc:null,closed:false,seq:-1,n:0};w.W.peers.set(r.uid,p);return p}}
function openPeer(w,uid){const p=w.W.peers.get(uid),sent=[];p.dc={readyState:'open',bufferedAmount:0,send:m=>sent.push(m)};p.state='connected';return sent}
let passed=0;async function test(name,f){await f();passed++;console.log('PASS',name)}
(async()=>{
await test('world module is embedded exactly once, parses, and installs after voice',()=>{
  const start=source.indexOf('/* ================= v38'),body=source.slice(start).trim();assert(game.includes(body));assert.equal(game.split('/* ================= v38: real multiplayer open world').length,2);
  new vm.Script(source);const iv=game.indexOf('\nvoiceInstall();'),iw=game.indexOf('\nwmpInstall();');assert(iv>0&&iw>iv)});
await test('look data is whitelisted; hostile values never reach the character builder',()=>{const w=context();
  const out=w.c.wmpLook({skin:99,face:'1',hair:-1,hairColor:3,outfit:'<img>',outfitColor:2.5,acc:'ghutra',eye:4,lash:1,g:'x',extra:'drop',__proto__:{polluted:1}});
  assert.deepEqual(JSON.parse(JSON.stringify(out)),{skin:0,face:0,hair:0,hairColor:3,outfitColor:0,eye:4,lash:1,outfit:'dishdasha',acc:'ghutra',g:'m'})});
await test('wire packets reject malformed, oversized, NaN, out-of-world and unknown states',()=>{const w=context();const u=w.c.wmpUnpack;
  assert.equal(u('{"a":1}'),null);assert.equal(u('[1,1,0,0,0]'),null);assert.equal(u('x'.repeat(200)),null);assert.equal(u('[1,1,"0",0,0,0]'),null);
  assert.equal(u('[1,1,999,0,0,0]'),null);assert.equal(u('[1,1,0,0,9,0]'),null);assert.equal(u('[1,1,0,0,0,7]'),null);assert.equal(u('[1,-1,0,0,0,0]'),null);assert.equal(u(42),null);
  assert.deepEqual(JSON.parse(JSON.stringify(u('[1,7,1.5,-2,0.5,2]'))),{seq:7,pose:{x:1.5,z:-2,r:.5,st:'run'}});assert.equal(u('[0]').bye,true);
  const packed=w.c.wmpPack({x:1,z:2,r:.1,st:'walk'});assert(packed.length<60)});
await test('fresh real seats become avatars; own, stale, blocked and invalid seats never do',()=>{const w=context({clock:100000,blocked:['eve']});joined(w);
  w.W.rows=[row('alice',0,99000),row('bob',1,99000),row('old',2,10000),row('eve',3,99000),row('nan',4,99000,{x:NaN}),row('far',5,99000,{x:5000}),row('bad',6,99000,{st:'fly'})];
  w.c.wmpSync();assert.deepEqual([...w.W.avatars.keys()],['bob']);assert.deepEqual([...w.W.peers.keys()],['bob']);assert.equal(w.scene.size,1);assert.equal(w.c.wmpCount(),2)});
await test('leaving, lease expiry and a new session remove or replace the avatar without duplicates',()=>{const w=context({clock:100000});joined(w);
  w.W.rows=[row('bob',1,99000)];w.c.wmpSync();const first=w.W.avatars.get('bob');
  w.W.rows=[row('bob',1,99000,{session:'c'.repeat(32)})];w.c.wmpSync();assert.notEqual(w.W.avatars.get('bob'),first);assert.equal(w.W.avatars.size,1);assert.equal(w.scene.size,1);
  w.tick(80000);w.c.wmpSync();assert.equal(w.W.avatars.size,0);assert.equal(w.scene.size,0);assert.equal(w.W.peers.size,0)});
await test('a goodbye packet removes the character at once and the same session cannot reappear',()=>{const w=context({clock:100000});joined(w);
  w.W.rows=[row('bob',1,99000)];w.c.wmpSync();const p=w.W.peers.get('bob');p.pc=null;w.c.wmpReceive(p,'[0]');assert.equal(w.W.avatars.size,0);
  w.c.wmpSync();assert.equal(w.W.avatars.size,0);w.W.rows=[row('bob',1,99000,{session:'d'.repeat(32)})];w.c.wmpSync();assert.equal(w.W.avatars.size,1)});
await test('direct packets are applied in order; replayed or older packets are ignored',()=>{const w=context({clock:100000});joined(w);
  w.W.rows=[row('bob',1,99000)];w.c.wmpSync();const p=w.W.peers.get('bob'),a=w.W.avatars.get('bob');
  w.c.wmpReceive(p,'[1,5,10,10,0,1]');w.c.wmpReceive(p,'[1,4,90,90,0,1]');w.c.wmpReceive(p,'[1,5,90,90,0,1]');assert.equal(a.buf.length,1);assert.equal(a.buf[0].x,10)});
await test('interpolation renders 140 ms behind, extrapolates at most 250 ms, then falls back to server pose',()=>{const w=context({clock:0});joined(w);
  w.W.rows=[row('bob',1,0,{x:50,z:50})];w.W.skew=0;w.set(10000);w.W.rows=[row('bob',1,9000,{x:50,z:50})];w.c.wmpSync();const a=w.W.avatars.get('bob');
  for(const [t,x]of[[10000,0],[10100,1],[10200,2]]){w.set(t);w.c.wmpPush('bob',{x,z:0,r:0,st:'walk'})}
  let s=w.c.wmpSample(a,10240);assert(Math.abs(s.x-1)<1e-9,s.x);
  s=w.c.wmpSample(a,10200+140+1000);assert(s.x<=4.5&&s.x>2,'extrapolation capped '+s.x);
  s=w.c.wmpSample(a,10200+3000);assert.equal(s.src,'relay');assert.equal(s.x,50)});
await test('a large jump (map teleport) snaps instead of sliding across the world',()=>{const w=context({clock:10000});joined(w);w.W.rows=[row('bob',1,9000)];w.c.wmpSync();
  const a=w.W.avatars.get('bob');w.c.wmpPush('bob',{x:0,z:0,r:0,st:'walk'});w.tick(100);w.c.wmpPush('bob',{x:60,z:0,r:0,st:'walk'});assert.equal(a.buf.length,1)});
await test('positions outside the current world are clamped to its boundary',()=>{const w=context();const p=w.c.wmpClampPose({x:180,z:-150,r:0,st:'idle'});assert.equal(p.x,102);assert.equal(p.z,-102)});
await test('direct sends are capped: about 10 per second while moving, 1 per second idle',()=>{const w=context({clock:5000});joined(w);w.W.rows=[row('bob',1,4000)];w.c.wmpSync();const sent=openPeer(w,'bob');
  for(let i=0;i<60;i++){w.tick(16.7);w.c.player.pos.x+=.05;w.c.wmpSendTick(w.now())}assert(sent.length>=9&&sent.length<=11,'moving '+sent.length);
  sent.length=0;for(let i=0;i<120;i++){w.tick(16.7);w.c.wmpSendTick(w.now())}assert(sent.length>=1&&sent.length<=3,'idle '+sent.length)});
await test('server fallback is only used when a direct channel is missing, at most every 3 s and only after moving',async()=>{const w=context({clock:100000});joined(w);
  w.W.rows=[row('alice',0,99000,{session:'a'.repeat(32)}),row('bob',1,99000)];w.c.wmpSync();openPeer(w,'bob');w.W.lastBeat=w.now();w.W.relayPose=w.c.wmpPose();w.W.relayLook=w.c.wmpLookKey(w.c.wmpOwnLook());
  assert.equal(w.c.wmpNeedRelay(w.now()),false);w.c.player.pos.x=5;w.c.wmpTick();await null;assert.equal(w.updates.length,0);
  w.W.peers.get('bob').dc=null;w.W.peers.get('bob').created=w.now()-7000;assert.equal(w.c.wmpNeedRelay(w.now()),true);
  w.c.wmpTick();await null;await null;assert.equal(w.updates.length,1,'first fallback write on entering relay mode');const u=w.updates[0].v;assert.equal(u.session,'a'.repeat(32));assert.equal(u.x,5);
  w.tick(1000);w.c.player.pos.x=6.5;w.c.wmpTick();await null;assert.equal(w.updates.length,1,'no write within 3 s');
  w.tick(2500);w.c.player.pos.x=5.2;w.c.wmpTick();await null;assert.equal(w.updates.length,1,'tiny moves are not written');
  w.c.player.pos.x=8;w.c.wmpTick();await null;await null;assert.equal(w.updates.length,2)});
await test('heartbeat refreshes the 70 s lease every 25 s even without movement',async()=>{const w=context({clock:100000});joined(w);w.W.rows=[row('alice',0,99000,{session:'a'.repeat(32)})];
  w.W.lastBeat=w.now();w.W.relayPose=w.c.wmpPose();w.W.relayLook=w.c.wmpLookKey(w.c.wmpOwnLook());w.tick(24000);w.c.wmpTick();await null;assert.equal(w.updates.length,0);w.tick(1500);w.c.wmpTick();await null;await null;assert.equal(w.updates.length,1)});
await test('the same account opened on a second device replaces the first; the old device does not fight back',()=>{const w=context({clock:100000});joined(w);
  w.c.wmpStop=vm.runInContext('wmpStop',w.c);w.W.rows=[];const g=w.W.gen;
  // Simulate the seat listener seeing the account's newer session in our slot.
  const mine=row('alice',0,99000,{session:'z'.repeat(32)});w.W.rows=[mine];
  const handler=rows=>{const r=rows.find(r=>r.slot==='0');if(!r||r.uid!=='alice'||r.session!==w.W.session){if(rows.some(r=>r.uid==='alice'&&r.session!==w.W.session)){w.c.wmpStop('x');w.W.kicked=true}}};
  handler(w.W.rows);assert.equal(w.W.kicked,true);assert.equal(w.W.uid,null);assert.equal(w.c.wmpWanted(),false);
  assert(source.includes("if(WMP.rows.some(r=>r.uid===uid&&r.session!==session)){wmpStop(wmpError({code:'world-session'}));WMP.kicked=true"),'shipped listener uses the same rule');
  assert(source.includes('if(manual){WMP.kicked=false'))});
await test('only registered, named, visible, online, unbanned players in the open world join',()=>{
  for(const [setup,ok]of[[w=>{},true],[w=>{w.c.LOBBY.on=true},false],[w=>{w.c.ACC.key=null},false],[w=>{w.c.document.hidden=true},false],[w=>{w.c.navigator.onLine=false},false],[w=>{w.c.CTL.ban=true},false],[w=>{w.c.mode='lobby'},false],[w=>{w.c.S.country='xx';w.c.W.theme.key='xx'},false],[w=>{w.c.S.settings.wmpOff=true},false]]){
    const w=context();setup(w);assert.equal(w.c.wmpWanted(),ok)}
  const guest=context({uid:null});assert.equal(guest.c.wmpWanted(),false)});
await test('a dropped direct channel hides the player after 4 s unless the server shows a newer heartbeat',()=>{const w=context({clock:100000});joined(w);w.W.skew=0;
  w.W.rows=[row('bob',1,99000)];w.c.wmpSync();const a=w.W.avatars.get('bob');a.p2pLost=100000;assert.equal(w.c.wmpVisible(a),true);
  w.tick(5000);assert.equal(w.c.wmpVisible(a),false);w.W.rows=[row('bob',1,104500)];w.c.wmpSync();assert.equal(w.c.wmpVisible(a),true)});
await test('NPCs are never counted or labelled as real players',()=>{const w=context({clock:100000});joined(w);w.c.npcs=[{name:'NPC',pos:{x:0,z:0}}];
  w.W.rows=[row('bob',1,99000)];w.c.wmpSync();assert.equal(w.c.wmpCount(),2);assert.deepEqual([...w.W.avatars.values()].map(a=>a.name),['BOB'])});
await test('challenge invitations: only fresh, same-channel, unblocked, correctly addressed ones are shown',()=>{const w=context({clock:100000,blocked:['eve']});joined(w);w.W.skew=0;
  const base={id:'bob',from:'bob',fromName:'Bob',to:'alice',space:'kw_1',code:'AB23',table:0,state:'pending',at:ts(95000)};const v=d=>w.c.wmpInviteValid(Object.assign({},base,d));
  assert.equal(v({}),true);assert.equal(v({at:ts(60000)}),false);assert.equal(v({space:'kw_2'}),false);assert.equal(v({to:'carol'}),false);assert.equal(v({id:'mallory'}),false);
  assert.equal(v({code:'<b>'}),false);assert.equal(v({state:'accepted'}),false);assert.equal(v({id:'eve',from:'eve'}),false)});
await test('while busy in a match, incoming challenges are declined instead of interrupting',async()=>{const w=context({clock:100000});joined(w);w.W.skew=0;w.c.game={online:{}};
  w.W.invites=new Map([['bob',{id:'bob',from:'bob',fromName:'Bob',to:'alice',space:'kw_1',code:'AB23',table:0,state:'pending',at:ts(99000)}]]);w.c.wmpInvites();await null;
  assert.deepEqual(w.updates.map(u=>[u.path,u.v.state]),[['worldChallenges/bob','declined']])});
await test('a forged result that the replayed board does not support is not recorded as a loss',()=>{const w=context();
  w.c.ONL.user={uid:'alice'};let board=new Array(64).fill(0);board[0]=1;board[63]=-1;
  w.c.onlBoard=()=>({board,plies:4,noCap:2,turn:1});w.c.genMoves=(b,side)=>side===1?[{}]:[];
  const r={host:'alice',guest:'bob'};
  assert.equal(w.c.wmpResultTrusted(r,{winner:'bob',reason:'أكل',plies:4}),false,'board still has both sides and host can move');
  assert.equal(w.c.wmpResultTrusted(r,{winner:'alice',reason:'x',plies:4}),true);assert.equal(w.c.wmpResultTrusted(r,{winner:'bob',reason:'استسلام',plies:4}),true);
  assert.equal(w.c.wmpResultTrusted(r,{winner:'mallory',reason:'x',plies:4}),false);assert.equal(w.c.wmpResultTrusted(r,{winner:null,reason:'x',plies:4}),false);
  board=new Array(64).fill(0);board[63]=-1;assert.equal(w.c.wmpResultTrusted(r,{winner:'bob',reason:'أكل',plies:4}),true,'host really has no pieces');
  board=new Array(64).fill(0);board[0]=1;board[63]=-1;w.c.genMoves=()=>[];assert.equal(w.c.wmpResultTrusted(r,{winner:'bob',reason:'x',plies:4}),true,'host really has no move');
  assert.equal(w.c.wmpResultTrusted(r,{winner:'bob',reason:'x',plies:9}),false,'move count must match the server')});
await test('a challenge never auto-accepts: accepting requires the banner button and joins only the challenger\'s room',()=>{
  assert(!/wmpAccept\(/.test(source.slice(source.indexOf('function wmpInvites'),source.indexOf('function wmpInviteBanner'))));
  assert(source.includes("if(r.host!==host||r.host===uid)throw Error('غرفة التحدي غير صحيحة')"))});
await test('microphone is never opened by world multiplayer; voice return asks first and joins listen-only',()=>{
  assert(!/getUserMedia|voiceMic\(/.test(source));assert(source.includes("voiceJoin('voiceWorlds',S.country+'_'+voice)"));assert(source.includes('ترجع لصوت العالم؟'))});
await test('stopping releases the seat, sends goodbye, clears avatars and cancels a pending challenge',async()=>{const w=context({clock:100000});joined(w);
  w.W.rows=[row('bob',1,99000)];w.c.wmpSync();const sent=openPeer(w,'bob');let released=null;w.c.wmpRelease=async(...a)=>{released=a};
  w.W.challenge={state:'pending',code:'AB23',from:'alice',name:'BOB',timer:0};w.c.onlClose=()=>{};w.c.closeLayer=()=>{};
  w.c.wmpStop();await null;assert.deepEqual(sent,['[0]']);assert.equal(w.W.avatars.size,0);assert.equal(w.scene.size,0);assert.equal(w.W.peers.size,0);assert.deepEqual(released,['kw_1','0','a'.repeat(32),'alice']);
  assert.equal(w.W.challenge,null);assert(w.updates.some(u=>u.path==='worldChallenges/alice'&&u.v.state==='cancelled'))});
console.log('World multiplayer client: '+passed+' passed');
})().catch(e=>{console.error(e);process.exit(1)});
