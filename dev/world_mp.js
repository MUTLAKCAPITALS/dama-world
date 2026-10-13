/* ================= v38: real multiplayer open world ================= */
// Only registered accounts appear as players. Firestore holds authenticated seats, signaling and challenges;
// movement runs over direct WebRTC data channels with a throttled Firestore fallback. NPCs are never listed as players.
const WMP={gen:0,uid:null,space:null,slot:null,session:null,channel:1,rows:[],peers:new Map(),avatars:new Map(),gone:new Set(),unsub:null,inviteUnsub:null,challengeUnsub:null,
  timer:0,busy:false,beatBusy:false,lastBeat:0,lastWrite:0,relayPose:null,relayLook:'',error:'',kicked:false,off:false,retryAt:0,skew:0,seq:0,lastSend:0,sent:null,
  near:null,nearText:'',challenge:null,invites:new Map(),handled:new Set(),matchOpp:null,matchTable:-1,voiceWas:null,initing:null,releasing:null,uiKey:'',labels:[],counts:null};
const WMP_SEATS=8,WMP_LEASE=70000,WMP_BEAT=25000,WMP_RELAY=3000,WMP_MIN_WRITE=2600,WMP_DELAY=140,WMP_INVITE=30000;
const WMP_COUNTRIES=['kw','sa','bh','in','tr'],WMP_ST=['idle','walk','run','sit','wave','match'];
const WMP_LOOK={skin:[0,5],face:[0,3],hair:[0,5],hairColor:[0,6],outfitColor:[0,9],eye:[0,4],lash:[0,1]};
const WMP_OUTFITS=['dishdasha','abaya','casual','jersey','kimono','suit'],WMP_ACCS=['none','ghutra','shayla','cap','headband','glasses','hat'];

function wmpClock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now()}
function wmpServerNow(){return Date.now()+WMP.skew}
function wmpTime(t){return t&&typeof t.toMillis==='function'?t.toMillis():0}
function wmpFresh(r,now=wmpServerNow()){return !!r&&wmpTime(r.at)>now-WMP_LEASE}
function wmpStamp(){return firebase.firestore.FieldValue.serverTimestamp()}
function wmpSeats(space=WMP.space){return ONL.db.collection('worlds').doc(space).collection('seats')}
function wmpId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
function wmpNum(v,lo,hi){return typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi}
function wmpAng(a){const T=Math.PI*2;return((a+Math.PI)%T+T)%T-Math.PI}
function wmpUid(){return typeof rsUid==='function'?rsUid():null}
function wmpBlocked(uid){try{return typeof rcBlocked==='function'&&rcBlocked(uid)}catch(e){return false}}
function wmpLook(src){const l=src||{},out={};for(const k in WMP_LOOK){const v=l[k],[a,b]=WMP_LOOK[k];out[k]=Number.isInteger(v)&&v>=a&&v<=b?v:a}
  out.outfit=WMP_OUTFITS.includes(l.outfit)?l.outfit:'dishdasha';out.acc=WMP_ACCS.includes(l.acc)?l.acc:'none';out.g=l.g==='f'?'f':'m';return out}
function wmpOwnLook(){return wmpLook(Object.assign({},S.look,{g:(S.look&&S.look.g)||S.gender||'m'}))}
function wmpLookKey(l){const x=wmpLook(l);return[x.skin,x.face,x.hair,x.hairColor,x.outfit,x.outfitColor,x.acc,x.eye,x.lash,x.g].join('|')}
function wmpValidPose(p){return !!p&&wmpNum(p.x,-200,200)&&wmpNum(p.z,-200,200)&&wmpNum(p.r,-4,4)&&WMP_ST.includes(p.st)}
function wmpPose(){const U=(player.ch&&player.ch.userData)||{};let st='idle';
  if(game&&(mode==='match'||mode==='toMatch'))st='match';else if(player.sitting||U.action==='sit')st='sit';else if(U.action==='wave')st='wave';else if((U.speed||0)>3.4)st='run';else if((U.speed||0)>.05)st='walk';
  const c=v=>Math.max(-199,Math.min(199,Math.round(v*100)/100));return{x:c(player.pos.x),z:c(player.pos.z),r:Math.round(wmpAng(player.rot)*1000)/1000,st}}
function wmpPoseMoved(a,b,far=.02){return !a||!b||a.st!==b.st||Math.abs(a.x-b.x)>far||Math.abs(a.z-b.z)>far||Math.abs(wmpAng(a.r-b.r))>.03}
function wmpDesiredSpace(){return S.country+'_'+WMP.channel}
function wmpError(e){return({'world-full':'القناة مكتملة (8 لاعبين)؛ اختَر قناة ثانية.','world-session':'حسابك انفتح بجهاز أو تبويب ثاني؛ اضغط «دخول العالم» هنا لو تبي تكمل من هالجهاز.','world-lost':'انقطع اتصال العالم؛ نحاول نرجع تلقائيًا.','permission-denied':'السيرفر رفض الطلب؛ تأكد من اسمك المسجّل وحسابك.','resource-exhausted':'السيرفر المجاني وصل حد الاستخدام اليومي؛ جرّب لاحقًا.','unavailable':'ما قدرنا نتصل بالسيرفر.'})[e&&(e.code||e.name)]||'تعذّر الاتصال بالعالم؛ نحاول مرة ثانية.'}

/* ---------- seat lifecycle ---------- */
function wmpCurrent(gen=WMP.gen){return !!WMP.uid&&WMP.gen===gen&&wmpUid()===WMP.uid&&!document.hidden&&navigator.onLine!==false&&!window.DAMA_CONTEXT_LOST&&!CTL.ban}
function wmpWanted(){if(!WMP.offTouched)WMP.off=!!(S.settings&&S.settings.wmpOff===true);if(!WMP.chosen&&S.settings&&Number.isInteger(S.settings.wmpCh)&&S.settings.wmpCh>=1&&S.settings.wmpCh<=10&&!WMP.uid&&!WMP.busy)WMP.channel=S.settings.wmpCh;
  return !WMP.off&&!WMP.kicked&&!!wmpUid()&&!!ACC.synced&&!!ACC.key&&!document.hidden&&navigator.onLine!==false&&!window.DAMA_CONTEXT_LOST&&!CTL.ban
  &&!(typeof LOBBY!=='undefined'&&LOBBY.on)&&!!W&&!!W.theme&&W.theme.key===S.country&&WMP_COUNTRIES.includes(S.country)
  &&['explore','card','sheet','request','toMatch','match','toExplore','wardrobe'].includes(mode)}
async function wmpClaim(space,session,uid,name,nameKey,look,pose){
  const seats=wmpSeats(space),own=ONL.db.collection('worldUsers').doc(uid);
  return ONL.db.runTransaction(async tx=>{
    const mine=await tx.get(own),refs=Array.from({length:WMP_SEATS},(_,i)=>seats.doc(String(i))),snaps=[];
    for(const ref of refs)snaps.push(await tx.get(ref));
    let oldRef=null,old=null,m=null;
    if(mine.exists){m=mine.data();if(m.space&&m.space!==space&&/^[0-7]$/.test(m.slot||'')){oldRef=wmpSeats(m.space).doc(m.slot);old=await tx.get(oldRef)}}
    const now=wmpServerNow();
    // The newest device of one account replaces the older one: one character per account.
    let index=snaps.findIndex(s=>s.exists&&s.data().uid===uid);
    if(index<0)index=snaps.findIndex(s=>!s.exists||!wmpFresh(s.data(),now));
    if(index<0)throw{code:'world-full'};
    if(old&&old.exists&&old.data().uid===uid)tx.delete(oldRef);
    tx.set(refs[index],{uid,name,nameKey,session,at:wmpStamp(),look,x:pose.x,z:pose.z,r:pose.r,st:pose.st});
    tx.set(own,{space,slot:String(index),session});
    return String(index);
  });
}
async function wmpRelease(space,slot,session,uid){
  if(slot==null||!uid||!ONL.db)return;const ref=wmpSeats(space).doc(slot),own=ONL.db.collection('worldUsers').doc(uid);
  try{await ONL.db.runTransaction(async tx=>{const s=await tx.get(ref),m=await tx.get(own);if(s.exists&&s.data().uid===uid&&s.data().session===session)tx.delete(ref);if(m.exists&&m.data().session===session)tx.delete(own)})}catch(e){}
}
async function wmpJoin(manual){
  if(WMP.busy||WMP.uid)return;if(manual){WMP.kicked=false;WMP.off=false;WMP.offTouched=true;if(S.settings.wmpOff){S.settings.wmpOff=false;persist()}}if(!wmpWanted())return;
  if(!ONL.db){if(!WMP.initing)WMP.initing=onlInit().catch(()=>{}).finally(()=>{WMP.initing=null});return}
  const gen=++WMP.gen,uid=wmpUid(),session=wmpId(),first=WMP.channel;
  Object.assign(WMP,{busy:true,uid,space:wmpDesiredSpace(),session,slot:null,rows:[],error:''});wmpUI();
  try{if(WMP.releasing)await WMP.releasing;if(!wmpCurrent(gen)||!wmpWanted()){if(WMP.gen===gen)wmpStop();return}
    let slot=null;
    for(let i=0;i<10&&slot==null;i++){
      WMP.space=wmpDesiredSpace();
      try{slot=await wmpClaim(WMP.space,session,uid,ACC.name,ACC.key,wmpOwnLook(),wmpPose())}
      catch(e){if(!wmpCurrent(gen))throw e;if(e.code==='world-full'&&!manual){WMP.channel=WMP.channel%10+1;if(WMP.channel===first)throw e;continue}
        if(['unavailable','deadline-exceeded','aborted'].includes(e.code)&&i<2)continue;throw e}
    }
    if(!wmpCurrent(gen)||!wmpWanted()){await wmpRelease(WMP.space,slot,session,uid);if(WMP.gen===gen)wmpStop();return}
    WMP.slot=slot;WMP.lastBeat=WMP.lastWrite=Date.now();WMP.relayPose=wmpPose();WMP.relayLook=wmpLookKey(wmpOwnLook());
    if(S.settings.wmpCh!==WMP.channel){S.settings.wmpCh=WMP.channel;persist()}
    if(typeof VC!=='undefined'&&!VC.uid)VC.channel=WMP.channel;
    const space=WMP.space;
    WMP.unsub=wmpSeats(space).limit(WMP_SEATS).onSnapshot(s=>{
      if(!wmpCurrent(gen)||s.metadata&&s.metadata.hasPendingWrites)return;
      WMP.rows=s.docs.map(d=>({slot:d.id,...d.data()}));
      const mine=WMP.rows.find(r=>r.slot===slot);
      // A cached snapshot may still show this account's previous session; only server data can end the session.
      if((!mine||mine.uid!==uid||mine.session!==session)&&s.metadata&&s.metadata.fromCache)return;
      if(!mine||mine.uid!==uid||mine.session!==session){
        if(WMP.rows.some(r=>r.uid===uid&&r.session!==session)){wmpStop(wmpError({code:'world-session'}));WMP.kicked=true;wmpUI();return}
        wmpFail({code:'world-lost'});return}
      const at=wmpTime(mine.at);if(at)WMP.skew=at-Date.now();
      wmpSync();wmpUI();
    },e=>{if(WMP.gen===gen)wmpFail(e)});
    WMP.inviteUnsub=ONL.db.collection('worldChallenges').where('to','==',uid).limit(5).onSnapshot(s=>{
      if(!wmpCurrent(gen))return;WMP.invites=new Map(s.docs.map(d=>[d.id,{id:d.id,...d.data()}]));wmpInvites();
    },()=>{});
  }catch(e){if(WMP.gen===gen)wmpFail(e)}finally{if(WMP.gen===gen){WMP.busy=false;wmpUI()}}
}
function wmpStop(message=''){
  const {space,slot,session,uid}=WMP;WMP.gen++;
  if(WMP.unsub)WMP.unsub();if(WMP.inviteUnsub)WMP.inviteUnsub();WMP.unsub=WMP.inviteUnsub=null;
  for(const p of WMP.peers.values()){wmpSendRaw(p,'[0]');wmpPeerClose(p)}WMP.peers.clear();
  for(const uid2 of [...WMP.avatars.keys()])wmpAvatarRemove(uid2);
  wmpInviteBanner(null);if(WMP.challenge&&WMP.challenge.state==='pending')wmpCancelChallenge(true);
  Object.assign(WMP,{uid:null,space:null,slot:null,session:null,rows:[],busy:false,beatBusy:false,lastBeat:0,error:message,near:null,invites:new Map(),relayMode:false,sent:null});WMP.gone.clear();
  wmpNearUI();wmpUI();if(uid)WMP.releasing=wmpRelease(space,slot,session,uid).finally(()=>{WMP.releasing=null});
}
function wmpFail(e){const message=wmpError(e);wmpStop(message);WMP.retryAt=Date.now()+(e&&e.code==='resource-exhausted'?600000:e&&e.code==='permission-denied'?60000:4000)}
// Heartbeat and fallback pose share one bounded write. The session field makes a stale tab's write fail instead of moving another device's character.
async function wmpWrite(){
  if(WMP.beatBusy||!wmpCurrent()||WMP.slot==null)return false;const now=Date.now();if(now-WMP.lastWrite<WMP_MIN_WRITE)return false;
  const gen=WMP.gen,pose=wmpPose(),look=wmpOwnLook(),ref=wmpSeats().doc(WMP.slot);WMP.beatBusy=true;WMP.lastWrite=now;
  try{await ref.update({session:WMP.session,at:wmpStamp(),look,x:pose.x,z:pose.z,r:pose.r,st:pose.st});
    if(wmpCurrent(gen)){WMP.lastBeat=Date.now();WMP.relayPose=pose;WMP.relayLook=wmpLookKey(look)}return true}
  catch(e){if(wmpCurrent(gen))wmpFail(e.code==='permission-denied'||e.code==='not-found'?{code:'world-lost'}:e);return false}
  finally{if(WMP.gen===gen)WMP.beatBusy=false}
}
function wmpNeedRelay(now=Date.now()){
  for(const r of WMP.rows){if(r.uid===WMP.uid||!wmpFresh(r)||wmpBlocked(r.uid))continue;const p=WMP.peers.get(r.uid);
    if(!p||p.session!==r.session||!wmpOpen(p)){if(!p||now-p.created>6000||p.state==='failed')return true}}
  return false}
function wmpTick(){
  const now=Date.now();
  if(WMP.uid){
    if(!wmpCurrent()||!wmpWanted()||(!WMP.busy&&WMP.space!==wmpDesiredSpace())){wmpStop();return}
    if(WMP.busy||WMP.slot==null)return;
    if(now-WMP.lastBeat>WMP_LEASE-8000){wmpFail({code:'world-lost'});return}
    const pose=wmpPose(),lookChanged=wmpLookKey(wmpOwnLook())!==WMP.relayLook;
    const relay=wmpNeedRelay(now),entered=relay&&!WMP.relayMode;WMP.relayMode=relay;
    if(now-WMP.lastBeat>=WMP_BEAT||lookChanged||entered||(relay&&wmpPoseMoved(WMP.relayPose,pose,.4)&&now-WMP.lastWrite>=WMP_RELAY))wmpWrite().then(ok=>{if(!ok&&entered)WMP.relayMode=false});
    wmpSync();wmpInvites();wmpUI();
  }else if(!WMP.busy&&now>=WMP.retryAt&&wmpWanted())wmpJoin(false);
  else wmpUI();
}

/* ---------- direct peer connections (data only; voice keeps its own connections) ---------- */
function wmpOpen(p){return !!p&&!p.closed&&!!p.dc&&p.dc.readyState==='open'}
function wmpPeerCurrent(p){return wmpCurrent(p.gen)&&WMP.peers.get(p.uid)===p&&!p.closed}
function wmpPeerTeardown(p){clearTimeout(p.iceTimer);clearTimeout(p.deadline);if(p.dc){p.dc.onopen=p.dc.onmessage=p.dc.onclose=null;try{p.dc.close()}catch(e){}}if(p.pc){p.pc.onicecandidate=p.pc.onconnectionstatechange=null;try{p.pc.close()}catch(e){}}p.dc=p.pc=null}
function wmpPeerClose(p){p.closed=true;clearTimeout(p.retry);if(p.unsub)p.unsub();p.unsub=null;wmpPeerTeardown(p)}
function wmpPeerDrop(p,why){
  if(!wmpPeerCurrent(p))return;const wasOpen=p.state==='connected';wmpPeerTeardown(p);p.state=why==='closed'?'closed':'failed';
  // A closed channel usually means the player left; the avatar disappears until the server shows a fresh seat or a new channel opens.
  if(wasOpen){const a=WMP.avatars.get(p.uid);if(a)a.p2pLost=wmpServerNow()}
  if(p.offerer&&p.n<3){clearTimeout(p.retry);p.retry=setTimeout(()=>{if(wmpPeerCurrent(p))wmpPeerOffer(p)},2500*p.n)}
}
async function wmpPublish(p,changes){
  if(!wmpPeerCurrent(p))return;await ONL.db.runTransaction(async tx=>{
    const snap=await tx.get(p.out);if(!wmpPeerCurrent(p))return;const old=snap.exists?snap.data():null;
    const base=old&&old.fromSession===WMP.session&&old.toSession===p.session&&old.n===p.n?old:{fromSession:WMP.session,toSession:p.session,n:p.n,sdp:'',type:p.offerer?'offer':'answer',ice:[]};
    const next={...base,...changes,n:p.n,at:wmpStamp()};if(changes.ice)next.ice=[...new Set([...base.ice,...changes.ice])].slice(0,32);tx.set(p.out,next);
  });
}
async function wmpFlushIce(p){if(!wmpPeerCurrent(p)||!p.ice.length)return;const ice=p.ice.splice(0,32);try{await wmpPublish(p,{ice})}catch(e){wmpPeerDrop(p,'failed')}}
function wmpPeerPC(p){
  wmpPeerTeardown(p);p.ice=[];p.got=new Set();p.state='connecting';p.created=Date.now();
  const pc=p.pc=new RTCPeerConnection({iceServers:typeof VC_ICE!=='undefined'?VC_ICE:[],bundlePolicy:'max-bundle'});
  const dc=p.dc=pc.createDataChannel('pose',{negotiated:true,id:0,ordered:false,maxRetransmits:0});
  dc.onopen=()=>{if(!wmpPeerCurrent(p)||p.dc!==dc)return;p.state='connected';clearTimeout(p.deadline);const a=WMP.avatars.get(p.uid);if(a)a.p2pLost=0;wmpSendTo(p,wmpPose())};
  dc.onmessage=e=>{if(p.dc===dc)wmpReceive(p,e.data)};
  dc.onclose=()=>{if(p.dc===dc)wmpPeerDrop(p,'closed')};
  pc.onicecandidate=e=>{if(!wmpPeerCurrent(p)||p.pc!==pc||!e.candidate||p.ice.length>=32)return;p.ice.push(JSON.stringify(e.candidate.toJSON()));clearTimeout(p.iceTimer);p.iceTimer=setTimeout(()=>wmpFlushIce(p),250)};
  pc.onconnectionstatechange=()=>{if(wmpPeerCurrent(p)&&p.pc===pc&&pc.connectionState==='failed')wmpPeerDrop(p,'failed')};
  clearTimeout(p.deadline);p.deadline=setTimeout(()=>{if(wmpPeerCurrent(p)&&p.pc===pc&&!wmpOpen(p))wmpPeerDrop(p,'failed')},20000);
  return pc}
async function wmpPeerOffer(p){
  try{p.n++;const pc=wmpPeerPC(p),o=await pc.createOffer();if(!wmpPeerCurrent(p)||p.pc!==pc)return;await pc.setLocalDescription(o);if(!wmpPeerCurrent(p)||p.pc!==pc)return;await wmpPublish(p,{sdp:o.sdp,type:'offer'})}
  catch(e){wmpPeerDrop(p,'failed')}
}
async function wmpRemote(p,data){
  if(!wmpPeerCurrent(p)||!data||data.fromSession!==p.session||data.toSession!==WMP.session||!Number.isInteger(data.n))return;
  p.latest=data;if(p.signaling)return;p.signaling=true;
  try{while(wmpPeerCurrent(p)&&p.latest){const r=p.latest;p.latest=null;
    if(p.offerer){if(r.n!==p.n||!p.pc)continue;
      if(r.sdp&&r.type==='answer'&&!p.pc.remoteDescription)await p.pc.setRemoteDescription({type:'answer',sdp:r.sdp})}
    else{if(r.type!=='offer'||!r.sdp)continue;
      if(r.n!==p.n||!p.pc){p.n=r.n;const pc=wmpPeerPC(p);await pc.setRemoteDescription({type:'offer',sdp:r.sdp});if(!wmpPeerCurrent(p)||p.pc!==pc)return;
        const a=await pc.createAnswer();if(!wmpPeerCurrent(p)||p.pc!==pc)return;await pc.setLocalDescription(a);if(!wmpPeerCurrent(p)||p.pc!==pc)return;await wmpPublish(p,{sdp:a.sdp,type:'answer'})}}
    if(p.pc&&p.pc.remoteDescription&&r.n===p.n)for(const raw of r.ice||[]){if(!wmpPeerCurrent(p))return;if(p.got.has(raw))continue;p.got.add(raw);try{await p.pc.addIceCandidate(JSON.parse(raw))}catch(e){}}
  }}catch(e){wmpPeerDrop(p,'failed')}finally{p.signaling=false}
}
function wmpPeer(row){
  const p={uid:row.uid,name:row.name,slot:row.slot,session:row.session,gen:WMP.gen,offerer:+WMP.slot<+row.slot,pc:null,dc:null,state:'connecting',n:0,ice:[],got:new Set(),closed:false,signaling:false,latest:null,created:Date.now(),seq:-1,lastMsg:0};
  WMP.peers.set(row.uid,p);
  if(typeof RTCPeerConnection==='undefined'&&!(window&&window.RTCPeerConnection)){p.state='failed';return p}
  p.out=wmpSeats().doc(WMP.slot).collection('signals').doc(row.slot);p.input=wmpSeats().doc(row.slot).collection('signals').doc(WMP.slot);
  p.unsub=p.input.onSnapshot(s=>{if(wmpPeerCurrent(p)&&s.exists&&!s.metadata.hasPendingWrites)wmpRemote(p,s.data())},()=>wmpPeerDrop(p,'failed'));
  if(p.offerer)wmpPeerOffer(p);
  else{p.deadline=setTimeout(()=>{if(wmpPeerCurrent(p)&&!wmpOpen(p))p.state='failed'},20000)}
  return p}
function wmpSync(){
  if(!wmpCurrent()||WMP.slot==null)return;const now=wmpServerNow();
  const rows=WMP.rows.filter(r=>r.uid!==WMP.uid&&r.session&&wmpFresh(r,now)&&!wmpBlocked(r.uid)&&!WMP.gone.has(r.uid+':'+r.session)&&wmpValidPose(r)&&/^[0-7]$/.test(r.slot));
  for(const [uid,p]of WMP.peers)if(!rows.some(r=>r.uid===uid&&r.session===p.session&&r.slot===p.slot)){wmpPeerClose(p);WMP.peers.delete(uid)}
  for(const uid of [...WMP.avatars.keys()]){const a=WMP.avatars.get(uid);if(!rows.some(r=>r.uid===uid&&r.session===a.session))wmpAvatarRemove(uid)}
  for(const r of rows){if(!WMP.peers.has(r.uid))wmpPeer(r);wmpAvatarRow(r)}
}

/* ---------- wire format: [1,seq,x,z,rot,state] at 10/s while moving, 1/s idle; [0]=leaving ---------- */
function wmpPack(pose){return JSON.stringify([1,++WMP.seq,pose.x,pose.z,pose.r,WMP_ST.indexOf(pose.st)])}
function wmpUnpack(raw){if(typeof raw!=='string'||raw.length>160)return null;let m;try{m=JSON.parse(raw)}catch(e){return null}
  if(!Array.isArray(m))return null;if(m.length===1&&m[0]===0)return{bye:true};
  if(m.length!==6||m[0]!==1||!Number.isInteger(m[1])||m[1]<0||!Number.isInteger(m[5]))return null;const pose={x:m[2],z:m[3],r:m[4],st:WMP_ST[m[5]]};return wmpValidPose(pose)?{seq:m[1],pose}:null}
function wmpSendRaw(p,raw){if(!wmpOpen(p)||p.dc.bufferedAmount>8192)return false;try{p.dc.send(raw);return true}catch(e){return false}}
function wmpSendTo(p,pose){return wmpSendRaw(p,wmpPack(pose))}
function wmpSendTick(now=wmpClock()){
  if(!WMP.uid||WMP.slot==null)return 0;const pose=wmpPose(),moving=wmpPoseMoved(WMP.sent,pose);
  if(now-WMP.lastSend<(moving?100:1000))return 0;let n=0;const raw=wmpPack(pose);
  for(const p of WMP.peers.values())if(wmpSendRaw(p,raw))n++;
  WMP.lastSend=now;WMP.sent=pose;return n}
function wmpReceive(p,raw){
  if(!wmpPeerCurrent(p))return;const m=wmpUnpack(raw);if(!m)return;
  if(m.bye){WMP.gone.add(p.uid+':'+p.session);wmpPeerClose(p);WMP.peers.delete(p.uid);wmpAvatarRemove(p.uid);wmpUI();return}
  if(m.seq<=p.seq)return;p.seq=m.seq;p.lastMsg=Date.now();wmpPush(p.uid,m.pose)}

/* ---------- avatars and interpolation ---------- */
function wmpClampPose(p){const B=(W&&W.bounds)||[-200,200,-200,200];return{x:Math.max(B[0],Math.min(B[1],p.x)),z:Math.max(B[2],Math.min(B[3],p.z)),r:p.r,st:p.st}}
function wmpAvatarRow(r){
  let a=WMP.avatars.get(r.uid);const key=wmpLookKey(r.look);
  if(a&&a.lookKey!==key){const keep=a;wmpAvatarRemove(r.uid);a=null;WMP._keep=keep}
  if(!a){const look=wmpLook(r.look),ch=buildChar(look);ch.userData.wmp=r.uid;const pose=wmpClampPose(r),prev=WMP._keep&&WMP._keep.uid===r.uid?WMP._keep:null;WMP._keep=null;
    a={uid:r.uid,session:r.session,name:r.name,nameKey:r.nameKey,slot:r.slot,look,lookKey:key,ch,buf:[],relay:pose,relayAt:Date.now(),x:prev?prev.x:pose.x,z:prev?prev.z:pose.z,r:prev?prev.r:pose.r,st:pose.st,speed:0,p2pLost:0,hiddenForMatch:false};
    ch.position.set(a.x,groundY(a.x,a.z),a.z);ch.rotation.y=a.r;scene.add(ch);WMP.avatars.set(r.uid,a)}
  a.name=r.name;a.slot=r.slot;a.rowAt=wmpTime(r.at);
  const pose=wmpClampPose(r);if(wmpPoseMoved(a.relay,pose,.01)){a.relay=pose;a.relayAt=Date.now()}
  return a}
function wmpAvatarRemove(uid){const a=WMP.avatars.get(uid);if(!a)return;WMP.avatars.delete(uid);try{scene.remove(a.ch)}catch(e){}
  if(WMP.near===uid){WMP.near=null;wmpNearUI()}}
function wmpPush(uid,pose){const a=WMP.avatars.get(uid);if(!a)return;const t=wmpClock(),c=wmpClampPose(pose),last=a.buf[a.buf.length-1];
  if(last&&Math.hypot(c.x-last.x,c.z-last.z)>14)a.buf.length=0;// teleport/map travel: snap instead of sliding across the map
  a.buf.push({t,x:c.x,z:c.z,r:c.r,st:c.st});if(a.buf.length>24)a.buf.splice(0,a.buf.length-24);a.p2pLost=0}
// Interpolate WMP_DELAY ms in the past; extrapolate briefly; otherwise walk toward the latest server fallback position.
function wmpSample(a,now=wmpClock()){
  const b=a.buf,tr=now-WMP_DELAY;
  if(b.length&&now-b[b.length-1].t<2500){
    if(tr<=b[0].t)return{x:b[0].x,z:b[0].z,r:b[0].r,st:b[0].st,src:'p2p'};
    for(let i=b.length-1;i>0;i--){const p=b[i-1],q=b[i];if(tr>=p.t&&tr<=q.t){const k=(tr-p.t)/Math.max(1,q.t-p.t);return{x:p.x+(q.x-p.x)*k,z:p.z+(q.z-p.z)*k,r:p.r+wmpAng(q.r-p.r)*k,st:k<.5?p.st:q.st,src:'p2p'}}}
    const q=b[b.length-1],p=b[b.length-2],ex=Math.min(250,tr-q.t);
    if(p&&ex>0&&q.t>p.t){const k=ex/(q.t-p.t);return{x:q.x+(q.x-p.x)*k,z:q.z+(q.z-p.z)*k,r:q.r,st:q.st,src:'p2p'}}
    return{x:q.x,z:q.z,r:q.r,st:q.st,src:'p2p'}}
  return{x:a.relay.x,z:a.relay.z,r:a.relay.r,st:a.relay.st,src:'relay'}}
// A dropped direct channel hides the avatar after 4 s unless the server shows a newer heartbeat from that player.
function wmpVisible(a){if(!a||a.hiddenForMatch||wmpBlocked(a.uid))return false;const now=wmpServerNow();return !a.p2pLost||now-a.p2pLost<4000||(a.rowAt||0)>a.p2pLost}
function wmpFrame(dt,t){
  if(!WMP.avatars.size){wmpSendTick();return}
  const now=wmpClock();
  const R=(W&&W.cullR)||60;
  for(const a of WMP.avatars.values()){const ch=a.ch,U=ch.userData;
    const s=wmpSample(a,now),px=a.x,pz=a.z;
    if(s.src==='relay'){const dx=s.x-a.x,dz=s.z-a.z,d=Math.hypot(dx,dz);
      if(d>25){a.x=s.x;a.z=s.z}else if(d>.03){const step=Math.min(d,Math.max(2.5,d*1.2)*dt);a.x+=dx/d*step;a.z+=dz/d*step;a.r=wmpAng(a.r+wmpAng(Math.atan2(dx,dz)-a.r)*Math.min(1,dt*8))}
      else a.r=wmpAng(a.r+wmpAng(s.r-a.r)*Math.min(1,dt*6))}
    else{if(Math.hypot(s.x-a.x,s.z-a.z)>14){a.x=s.x;a.z=s.z}else{a.x+=(s.x-a.x)*Math.min(1,dt*18);a.z+=(s.z-a.z)*Math.min(1,dt*18)}a.r=wmpAng(a.r+wmpAng(s.r-a.r)*Math.min(1,dt*14))}
    a.st=s.st;const sp=dt>0?Math.hypot(a.x-px,a.z-pz)/dt:0;a.speed+=(sp-a.speed)*Math.min(1,dt*10);
    ch.position.set(a.x,groundY(a.x,a.z),a.z);ch.rotation.y=a.r;
    const cd=typeof camera!=='undefined'&&ch.position.distanceToSquared?ch.position.distanceToSquared(camera.position):0,vis=wmpVisible(a)&&cd<R*R;if(ch.visible!==vis)ch.visible=vis;if(!vis)continue;
    const seated=a.st==='sit'||a.st==='match';U.seated=seated;U.sitBack=seated;
    if(seated){U.action='sit';U.speed=0}else{U.speed=a.speed<.08?0:a.speed;if(a.st==='wave'&&U.action!=='wave'){U.action='wave';U.actT=1.4}else if(U.action!=='wave'||!(U.actT>0))U.action=U.speed>0?'walk':'idle'}
    try{animChar(ch,dt,t,cd<400)}catch(e){}}
  wmpSendTick(now);
}
function wmpNearest(maxD=3.2){let best=null,bd=maxD;for(const a of WMP.avatars.values()){if(!wmpVisible(a)||a.st==='match')continue;const d=Math.hypot(a.x-player.pos.x,a.z-player.pos.z);if(d<bd){bd=d;best=a}}return best?{a:best,d:bd}:null}
function wmpNearUI(){const el=$('#actMain'),t=$('#actT');if(!el||!t)return;
  if(WMP.near){const a=WMP.avatars.get(WMP.near);const text=a?'تحدَّ '+a.name+' 🟢':'';WMP.nearText=text;if(t.textContent!==text)t.textContent=text;if(el.classList.contains('off'))el.classList.remove('off')}
  else if(WMP.nearText){WMP.nearText='';t.textContent=typeof nearNPC!=='undefined'&&nearNPC?'تحدَّ '+nearNPC.name:'اقترب من لاعب';el.classList.toggle('off',!(typeof nearNPC!=='undefined'&&nearNPC))}}
function wmpCount(){return WMP.uid?1+[...WMP.avatars.values()].filter(a=>!wmpBlocked(a.uid)).length:0}

/* ---------- names above real players, minimap dots, taps ---------- */
function wmpLabels(){
  const root=$('#wmpLabels');if(!root)return;let i=0;
  if(['explore','request','card','sheet'].includes(mode)&&typeof camera!=='undefined'){
    for(const a of WMP.avatars.values()){if(!a.ch.visible)continue;const d=Math.hypot(a.x-player.pos.x,a.z-player.pos.z);if(d>40)continue;
      v3.copy(a.ch.position);v3.y+=(a.st==='sit'||a.st==='match'?1.5:2.15);v3.project(camera);if(v3.z>1||v3.x<-1.1||v3.x>1.1||v3.y<-1.1||v3.y>1.2)continue;
      let L=WMP.labels[i];if(!L){const el=document.createElement('button');el.type='button';el.className='wlbl';el.innerHTML='<span class="dot"></span><span class="tx"></span>';root.appendChild(el);L=WMP.labels[i]={el,tx:el.querySelector('.tx'),text:'',uid:''};
        el.addEventListener('pointerdown',e=>e.stopPropagation());el.onclick=e=>{e.stopPropagation();if(L.uid)wmpCard(L.uid)}}
      i++;const text=a.name+(a.st==='match'?' · يلعب دامة':'');if(L.text!==text){L.tx.textContent=text;L.text=text}L.uid=a.uid;
      L.el.style.transform='translate('+((v3.x*.5+.5)*innerWidth).toFixed(1)+'px,'+((-v3.y*.5+.5)*innerHeight).toFixed(1)+'px) translate(-50%,-100%)';L.el.style.display=''}}
  for(let k=i;k<WMP.labels.length;k++)WMP.labels[k].el.style.display='none'}
function wmpMini(){if(!WMP.avatars.size||typeof mctx==='undefined'||!miniC)return;const W2=miniC.width,R=34*MAP.s,k=W2/(R*2),px=mx(player.pos.x),pz=mz(player.pos.z);
  for(const a of WMP.avatars.values()){if(!a.ch.visible)continue;const x=(mx(a.x)-px)*k+W2/2,y=(mz(a.z)-pz)*k+W2/2;if(x<0||y<0||x>W2||y>W2)continue;
    mctx.fillStyle='#ffcf5a';mctx.strokeStyle='#2a1606';mctx.lineWidth=2;mctx.beginPath();mctx.arc(x,y,6,0,Math.PI*2);mctx.fill();mctx.stroke()}}
function wmpPick(cx,cy){let best=null,bd=56;for(const a of WMP.avatars.values()){if(!a.ch.visible)continue;if(Math.hypot(a.x-player.pos.x,a.z-player.pos.z)>30)continue;
    for(const h of [.9,1.6]){v3.set(a.x,a.ch.position.y+h,a.z);v3.project(camera);if(v3.z>1)continue;const d=Math.hypot((v3.x*.5+.5)*innerWidth-cx,(-v3.y*.5+.5)*innerHeight-cy);if(d<bd){bd=d;best=a}}}
  return best}

/* ---------- player card and challenges ---------- */
function wmpRow(uid){const a=WMP.avatars.get(uid);return a?WMP.rows.find(r=>r.uid===uid&&r.session===a.session&&wmpFresh(r))||null:null}
function wmpCard(uid){
  const a=WMP.avatars.get(uid);if(!a||!WMP.uid||!['explore','card'].includes(mode))return;const p=WMP.peers.get(uid),d=Math.hypot(a.x-player.pos.x,a.z-player.pos.z);
  const link=wmpOpen(p)?'اتصال مباشر':'عبر السيرفر (أبطأ)';mode='card';
  onlDlg('<span class="tag">لاعب حقيقي متصل 🟢</span><h3>'+esc(a.name)+'</h3><p class="muted">'+esc(WMP_NAMES[S.country]||'')+' · القناة '+WMP.channel+' · يبعد '+Math.round(d)+' م · '+link+'</p>'+
    (a.st==='match'?'<p>يلعب مباراة دامة الحين</p>':'')+
    '<div class="row"><button class="pbtn" data-a="ch"'+(a.st==='match'?' disabled':'')+'>'+ic('board')+'تحدي دامة</button><button class="gbtn" data-a="prof">الملف والصداقة</button></div>'+
    '<div class="row"><button class="gbtn" data-a="rep">'+ic('report')+'بلّغ</button><button class="gbtn" data-a="x">إغلاق</button></div>',
    {ch:()=>{closeLayer();wmpChallenge(uid)},prof:()=>{closeLayer();if(typeof rsPerson==='function'){const pr=rsPerson(uid,a.name,a.nameKey);rsProfile(pr.id)}},
     rep:async()=>{try{await ONL.db.collection('reports').add({by:WMP.uid,byName:ACC.name,target:uid,targetName:a.name,reason:'other',note:'بلاغ من العالم المفتوح '+WMP.space,at:Date.now(),createdAt:wmpStamp(),status:'open'});toast('وصل البلاغ للإدارة')}catch(e){toast(wmpError(e))}},
     x:()=>closeLayer()},()=>{if(mode==='card')mode='explore'})}
async function wmpCreateRoom(){
  await onlInit();const uid=ONL.user.uid;if(uid!==WMP.uid)throw Error('الحساب تغيّر');
  const profile=await ONL.db.collection('users').doc(uid).get({source:'server'}),rating=+(profile.exists&&profile.data().rating)||1000;let code,ref,created=false;
  for(let i=0;i<5&&!created;i++){code=onlCode();ref=ONL.db.collection('rooms').doc(code);
    created=await ONL.db.runTransaction(async tx=>{let d;try{d=await tx.get(ref)}catch(e){if(e.code==='permission-denied')return false;throw e}if(d.exists)return false;
      tx.set(ref,{code,protocol:2,matchId:uid+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),host:uid,hostName:S.name||'لاعب',hostPhoto:S.avatarImg||null,hostRating:rating,guest:null,guestName:'',state:'wait',moves:[],messages:[],voiceEpoch:1,resigned:null,created:Date.now()});return true})}
  if(!created)throw Error('ما قدرنا نسوي غرفة؛ حاول مرة ثانية');
  ONL.code=code;ONL.role='host';ONL.seq=0;ONL.started=false;ONL.pending=null;onlListen(ref);return code}
async function wmpJoinRoom(code,host){
  await onlInit();const ref=ONL.db.collection('rooms').doc(code),uid=ONL.user.uid;if(uid!==WMP.uid)throw Error('الحساب تغيّر');
  const profile=await ONL.db.collection('users').doc(uid).get({source:'server'}),rating=+(profile.exists&&profile.data().rating)||1000;
  await ONL.db.runTransaction(async tx=>{const d=await tx.get(ref);if(!d.exists)throw Error('التحدي انتهى');const r=d.data();
    if(r.protocol!==2||!r.matchId)throw Error('حدّثوا اللعبة وجرّبوا مرة ثانية');if(r.host!==host||r.host===uid)throw Error('غرفة التحدي غير صحيحة');if(r.guest||r.state!=='wait')throw Error('التحدي انتهى');
    tx.update(ref,{guest:uid,guestProtocol:2,guestName:S.name||'لاعب',guestPhoto:S.avatarImg||null,guestRating:rating,state:'play'})});
  ONL.code=code;ONL.role='guest';ONL.seq=0;ONL.started=false;ONL.pending=null;onlListen(ref)}
function wmpTableIndex(){if(!W||!W.tables||!W.tables.length)return 0;let best=0,bd=1e9;W.tables.forEach((t,i)=>{const d=Math.hypot(t.c.x-player.pos.x,t.c.z-player.pos.z);if(d<bd){bd=d;best=i}});return Math.min(63,best)}
function wmpChallengeDlg(){const c=WMP.challenge;if(!c)return;
  const body=c.state==='accepted'?'<p><span class="spin"></span>'+esc(c.name)+' قبل التحدي! جاري تجهيز الطاولة…</p>':'<p class="muted"><span class="spin"></span>'+(c.state==='creating'?'جاري تجهيز الطاولة…':'بانتظار رد '+esc(c.name)+'…')+'</p>';
  onlDlg('<span class="tag">تحدي دامة</span><h3>'+esc(c.name)+'</h3>'+body+'<div class="row"><button class="gbtn danger" data-a="cancel">إلغاء التحدي</button></div>',{cancel:()=>wmpCancelChallenge(false)},()=>{if(WMP.challenge===c&&!ONL.started)wmpCancelChallenge(true)})}
function wmpChallengeEnd(message){const c=WMP.challenge;if(!c)return;WMP.challenge=null;clearTimeout(c.timer);if(c.unsub)c.unsub();
  if(!ONL.started){if(ONL.code&&ONL.code===c.code)onlClose(true);WMP.matchOpp=null;WMP.matchTable=-1}
  if($('#layer')&&$('#layer').innerHTML&&/تحدي دامة/.test($('#layer').textContent||''))closeLayer();if(mode==='card')mode='explore';if(message)toast(message,3200)}
async function wmpCancelChallenge(silent,message){const c=WMP.challenge;if(!c)return;const uid=c.from||WMP.uid;
  if(c.code&&uid&&ONL.db)ONL.db.collection('worldChallenges').doc(uid).update({state:'cancelled'}).catch(()=>{});
  wmpChallengeEnd(silent?'':message||'تم إلغاء التحدي')}
async function wmpChallenge(uid){
  if(!requirePlayAccount())return;const row=wmpRow(uid);
  if(!row||!WMP.uid){toast('اللاعب مو متصل بالعالم الحين');return}
  if(row.st==='match'){toast(row.name+' يلعب مباراة الحين');return}
  if(WMP.challenge){toast('عندك تحدي ينتظر رد');return}
  if(game||ONL.ref){toast('سكّر المباراة أو الغرفة المفتوحة أول');return}
  if(mode==='card')mode='explore';if(mode!=='explore'){toast('ارجع للعالم المفتوح أول');return}
  const gen=WMP.gen,from=WMP.uid,c=WMP.challenge={to:uid,from,name:row.name,state:'creating',gen,code:null,timer:0,unsub:null};wmpChallengeDlg();
  try{const code=await wmpCreateRoom();if(WMP.challenge!==c||!wmpCurrent(gen)){if(ONL.code===code&&!ONL.started)onlClose(true);return}c.code=code;
    const table=wmpTableIndex(),ref=ONL.db.collection('worldChallenges').doc(from);
    await ref.set({from,fromName:ACC.name,fromKey:ACC.key,to:uid,toName:row.name,space:WMP.space,toSlot:row.slot,code,table,state:'pending',at:wmpStamp()});
    if(WMP.challenge!==c){ref.update({state:'cancelled'}).catch(()=>{});return}
    c.state='pending';WMP.matchOpp=uid;WMP.matchTable=table;wmpChallengeDlg();
    c.unsub=ref.onSnapshot(s=>{if(WMP.challenge!==c)return;const d=s.exists?s.data():null;if(!d||d.code!==code)return;
      if(d.state==='declined')wmpChallengeEnd('اعتذر '+c.name+' عن التحدي');else if(d.state==='accepted'&&c.state!=='accepted'){c.state='accepted';clearTimeout(c.timer);c.timer=setTimeout(()=>{if(WMP.challenge===c&&!ONL.started)wmpCancelChallenge(false,'ما اكتمل دخول '+c.name+' للمباراة')},20000);if(!ONL.started)wmpChallengeDlg()}},()=>{});
    c.timer=setTimeout(()=>{if(WMP.challenge===c&&c.state==='pending')wmpCancelChallenge(false,'ما رد '+c.name+' على التحدي')},WMP_INVITE);
  }catch(e){if(WMP.challenge===c)wmpChallengeEnd(e&&e.code?wmpError(e):(e&&e.message)||'تعذّر إرسال التحدي')}}

/* ---------- incoming challenges: a banner, never a silent auto-accept ---------- */
function wmpInviteValid(d,now=wmpServerNow()){return !!d&&d.state==='pending'&&d.to===WMP.uid&&d.from===d.id&&d.space===WMP.space&&/^[A-Z0-9]{4}$/.test(d.code||'')&&wmpTime(d.at)>now-WMP_INVITE&&!wmpBlocked(d.from)&&!WMP.handled.has(d.from+':'+d.code)}
function wmpInvites(){
  if(!WMP.uid)return;const list=[...WMP.invites.values()].filter(d=>wmpInviteValid(d)).sort((a,b)=>wmpTime(a.at)-wmpTime(b.at));
  const busy=!!(game||ONL.ref||WMP.challenge);
  if(busy){for(const d of list){WMP.handled.add(d.from+':'+d.code);ONL.db.collection('worldChallenges').doc(d.from).update({state:'declined'}).catch(()=>{})}wmpInviteBanner(null);return}
  wmpInviteBanner(list[0]||null)}
function wmpInviteBanner(d){const el=$('#wmpInvite');if(!el)return;const key=d?d.from+':'+d.code:'';if(el.dataset.key===key)return;el.dataset.key=key;
  if(!d){el.hidden=true;el.innerHTML='';return}
  el.innerHTML='<b>⚔️ '+esc(d.fromName)+'</b><span>يتحداك دامة</span><button class="pbtn" data-a="ok">قبول</button><button class="gbtn" data-a="no">رفض</button>';el.hidden=false;
  el.onclick=e=>{const b=e.target.closest('[data-a]');if(!b)return;e.stopPropagation();if(b.dataset.a==='ok')wmpAccept(d);else wmpDecline(d)};try{SFX.pop()}catch(e){}}
async function wmpDecline(d){WMP.handled.add(d.from+':'+d.code);wmpInviteBanner(null);try{await ONL.db.collection('worldChallenges').doc(d.from).update({state:'declined'})}catch(e){}wmpInvites()}
async function wmpAccept(d){
  WMP.handled.add(d.from+':'+d.code);wmpInviteBanner(null);
  if(d.state!=='pending'||wmpTime(d.at)<=wmpServerNow()-WMP_INVITE){toast('انتهى وقت التحدي');return}
  if(game||ONL.ref||WMP.challenge){toast('عندك مباراة مفتوحة');return}
  if(mode==='card'||mode==='sheet'){closeLayer();if(mode==='card')mode='explore'}
  if(mode!=='explore'){toast('ارجع للعالم المفتوح وبعدين اقبل التحدي');wmpDecline(d);return}
  const ref=ONL.db.collection('worldChallenges').doc(d.from);WMP.matchOpp=d.from;WMP.matchTable=Number.isInteger(d.table)?d.table:-1;
  onlDlg('<span class="tag">تحدي دامة</span><h3>'+esc(d.fromName)+'</h3><p class="muted"><span class="spin"></span>جاري الدخول للطاولة…</p>',{});
  try{await ref.update({state:'accepted'});await wmpJoinRoom(d.code,d.from)}
  catch(e){WMP.matchOpp=null;WMP.matchTable=-1;closeLayer();toast(e&&e.code?wmpError(e):(e&&e.message)||'تعذّر قبول التحدي')}}

/* ---------- a real opponent's body sits at the shared table ---------- */
function wmpBody(a){const look=wmpLook(a.look),ch=buildChar(look);scene.add(ch);
  return{id:'rp-'+a.uid,name:ONL.oppName||a.name,from:'لاعب حقيقي',look,ch,pos:new THREE.Vector3(a.x,0,a.z),rot:a.r,state:'wander',lvl:10,real:a.uid,target:null,wait:0,talkT:0,line:'',sayT:0,home:[a.x-1,a.x+1,a.z-1,a.z+1]}}
async function wmpStartMatch(){
  const opp=WMP.matchOpp,a=WMP.avatars.get(opp),room=ONL.room;
  if(!requirePlayAccount())return;if(mode==='card'){closeLayer();mode='explore'}
  if(mode!=='explore'){ONL.started=false;toast('ارجع للعالم المفتوح عشان تبدأ المباراة');return}
  if(WMP.challenge){const c=WMP.challenge;WMP.challenge=null;clearTimeout(c.timer);if(c.unsub)c.unsub()}
  const ref=ONL.ref,table=W.tables[WMP.matchTable]||nearestTable(),side=ONL.role==='host'?1:-1;
  // Host takes the +axis seat and guest the opposite seat, so third players see both at the same table.
  player.pos.copy(table.c).addScaledVector(table.a,side*1.4);player.pos.y=0;
  const body=wmpBody(a);a.hiddenForMatch=true;NEXT={quick:false};await beginMatch(body,table);
  if(ONL.ref!==ref||!game){wmpReleaseBody(body);a.hiddenForMatch=false;return}
  game.online={code:ONL.code,role:ONL.role,id:room.matchId,opponentRating:ONL.role==='host'?room.guestRating:room.hostRating,selfRating:ONL.role==='host'?room.hostRating:room.guestRating};game.diff=1;game.realOpponent=opp;
  onlRebuild(ONL.room);if(ONL.room.result)onlApplyResult(ONL.room.result)}
function wmpReleaseBody(n){if(!n||!n.real)return;try{scene.remove(n.ch)}catch(e){}const a=WMP.avatars.get(n.real);if(a)a.hiddenForMatch=false}

/* ---------- result check: a loss is recorded only if the replayed board really ended ---------- */
function wmpResultTrusted(r,result){
  if(!r||!result)return false;const me=ONL.user&&ONL.user.uid;if(result.winner!=null&&result.winner!==r.host&&result.winner!==r.guest)return false;
  // Rules only let the resigning player write a resignation, and only for the other player.
  if(result.winner===me||result.reason==='استسلام')return true;
  let st;try{st=onlBoard(r,r.host)}catch(e){return false}if(result.plies!==st.plies)return false;
  const hostGone=!st.board.some(x=>x>0),guestGone=!st.board.some(x=>x<0),stuck=!genMoves(st.board,st.turn).length;
  if(result.winner==null)return st.noCap>=60;
  const loser=result.winner===r.host?r.guest:r.host,loserSide=loser===r.host?1:-1;
  return (loserSide===1?hostGone:guestGone)||(stuck&&st.turn===loserSide)}

/* ---------- world panel ---------- */
const WMP_NAMES={kw:'الكويت',sa:'السعودية',bh:'البحرين',in:'الهند',tr:'تركيا'};
function wmpStatus(){if(WMP.off)return'أنت مخفي عن العالم';if(WMP.busy)return'جاري الدخول للعالم…';if(!WMP.uid)return WMP.error||(wmpUid()?(ACC.key?'العالم غير متصل':'اختَر اسمك المسجّل عشان تظهر للاعبين'):'سجّل دخولك عشان تشوف ربعك بالعالم');
  const n=wmpCount();return(WMP_NAMES[S.country]||'')+' · القناة '+WMP.channel+' · '+(n===1?'أنت وحدك هنا':n+' لاعبين حقيقيين')}
function wmpUI(){
  const n=wmpCount(),key=[n,WMP.uid?1:0,WMP.busy?1:0,WMP.off?1:0,WMP.channel,WMP.error].join('|');
  if(key!==WMP.uiKey){WMP.uiKey=key;const b=$('#wmpN');if(b)b.textContent=WMP.uid?String(n):'–';const bt=$('#bWorld');if(bt)bt.classList.toggle('on',!!WMP.uid)}
  const st=$('#wmpStatus');if(st&&st.textContent!==wmpStatus())st.textContent=wmpStatus();
  const list=$('#wmpPlayers');if(list){const html=[...WMP.avatars.values()].filter(a=>!wmpBlocked(a.uid)).map(a=>{const p=WMP.peers.get(a.uid),d=Math.round(Math.hypot(a.x-player.pos.x,a.z-player.pos.z));
      return'<div class="wmp-row"><span>'+esc(a.name)+'</span><small>'+(a.st==='match'?'يلعب دامة':d+' م')+' · '+(wmpOpen(p)?'مباشر':p&&p.state==='connecting'?'جاري التوصيل':'عبر السيرفر')+'</small><button class="sbtn" data-a="wch" data-uid="'+esc(a.uid)+'"'+(a.st==='match'?' disabled':'')+'>تحدي</button><button class="sbtn" data-a="wcard" data-uid="'+esc(a.uid)+'">الملف</button></div>'}).join('')||'<p class="muted">ما فيه لاعبين ثانيين بقناتك. أرسل رابط القناة لربعك 👇</p>';
    if(list.dataset.html!==html){list.dataset.html=html;list.innerHTML=html}}}
async function wmpCounts(){if(!ONL.db||!wmpUid())return;const counts={},now=wmpServerNow();
  await Promise.all(Array.from({length:10},(_,i)=>wmpSeats(S.country+'_'+(i+1)).limit(WMP_SEATS).get().then(s=>{counts[i+1]=s.docs.filter(d=>wmpFresh(d.data(),now)).length}).catch(()=>{})));
  WMP.counts=counts;const sel=$('#wmpChannels');if(sel)sel.querySelectorAll('[data-ch]').forEach(b=>{const c=counts[+b.dataset.ch];b.querySelector('small').textContent=c==null?'':c+'/8'})}
function wmpInviteURL(){return location.href.split('#')[0]+'#world='+S.country+'-'+WMP.channel}
function wmpPanel(){
  if(!requirePlayAccount())return;if(LOBBY.on||!['explore','card'].includes(mode)){toast('ادخل العالم المفتوح أول');return}mode='card';
  onlDlg('<span class="tag">العالم أونلاين</span><h3>اللاعبين بقناتك</h3><p id="wmpStatus"></p><div id="wmpPlayers"></div>'+
    '<p class="muted">القنوات (الكل بنفس الدولة والقناة يشوف بعض، 8 لاعبين بالقناة):</p><div id="wmpChannels" class="wmp-ch">'+Array.from({length:10},(_,i)=>'<button class="sbtn'+(WMP.channel===i+1?' on':'')+'" data-a="wchan" data-ch="'+(i+1)+'">'+(i+1)+'<small></small></button>').join('')+'</div>'+
    '<div class="row"><a class="pbtn" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent('تعال العالم معي بـ عالم الدامة — '+(WMP_NAMES[S.country]||'')+' القناة '+WMP.channel+'\n'+wmpInviteURL())+'">دعوة ربعك بالواتساب</a><button class="gbtn" data-a="wvoice">'+ic('mic')+'صوت القناة</button></div>'+
    '<div class="row"><button class="gbtn" data-a="wjoin">'+(WMP.uid?'إعادة الاتصال':'دخول العالم')+'</button><button class="gbtn" data-a="whide">'+(WMP.off?'إظهار نفسي':'إخفاء نفسي')+'</button><button class="gbtn" data-a="x">إغلاق</button></div>'+
    '<p class="muted">المايك مغلق دائمًا إلى أن تفتحه بنفسك من «صوت القناة».</p>',
    {wch:b=>{closeLayer();wmpChallenge(b.dataset.uid)},wcard:b=>{closeLayer();setTimeout(()=>wmpCard(b.dataset.uid),30)},
     wchan:b=>{const ch=+b.dataset.ch;if(ch===WMP.channel&&WMP.uid)return;WMP.channel=ch;WMP.chosen=true;S.settings.wmpCh=ch;persist();if(WMP.uid)wmpStop();WMP.kicked=false;WMP.off=false;WMP.retryAt=0;wmpJoin(true);closeLayer();setTimeout(wmpPanel,60)},
     wvoice:()=>{closeLayer();if(typeof VC!=='undefined'&&!VC.uid)VC.channel=WMP.channel;voiceOpen()},
     wjoin:()=>{if(WMP.uid)wmpStop();WMP.retryAt=0;wmpJoin(true);closeLayer();setTimeout(wmpPanel,60)},
     whide:()=>{WMP.offTouched=true;WMP.off=!WMP.off;S.settings.wmpOff=WMP.off;persist();if(WMP.off)wmpStop();else{WMP.kicked=false;WMP.retryAt=0;wmpJoin(true)}closeLayer();setTimeout(wmpPanel,60)},
     x:()=>closeLayer()},()=>{if(mode==='card')mode='explore'});
  WMP.uiKey='';wmpUI();wmpCounts()}
function wmpFromURL(){const m=/[#&]world=(kw|sa|bh|in|tr)-([1-9]|10)\b/i.exec(location.hash||'');if(!m)return;const c=m[1].toLowerCase(),ch=+m[2];
  WMP.channel=ch;WMP.chosen=true;S.settings.wmpCh=ch;if(c!==S.country)setTimeout(()=>toast('ربعك في '+(WMP_NAMES[c]||c)+' — القناة '+ch+'. سافر لها من «الرحلة»',6000),4000)}

/* ---------- install: wraps existing systems without replacing them ---------- */
function wmpInstall(){
  wmpFromURL();
  const st=document.createElement('style');st.textContent='#wmpLabels{position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden}body.inLobby #wmpLabels,body.inIntro #wmpLabels{display:none}'+
    '.wlbl{position:absolute;left:0;top:0;pointer-events:auto;display:flex;align-items:center;gap:5px;white-space:nowrap;font-weight:700;font-size:12.5px;line-height:1.2;padding:4px 10px;min-height:28px;border-radius:999px;border:1.5px solid #ffd27e;background:rgba(40,24,8,.78);color:#ffe7b0;text-shadow:0 1px 2px #000;will-change:transform;cursor:pointer}'+
    '.wlbl .dot{width:8px;height:8px;border-radius:50%;background:#4fe08a;box-shadow:0 0 6px #4fe08a}'+
    '#wmpInvite{position:fixed;z-index:30;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;padding:10px 14px;border-radius:16px;background:rgba(30,18,6,.94);border:2px solid #ffd27e;color:#fff1d2;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:92vw}#wmpInvite[hidden]{display:none}#wmpInvite button{min-height:40px}'+
    '#bWorld b{position:absolute;top:2px;inset-inline-end:4px;min-width:18px;height:18px;border-radius:9px;background:#4fe08a;color:#06210f;font-weight:800;font-size:11px;line-height:18px;text-align:center;padding:0 4px}#bWorld:not(.on) b{background:#777;color:#fff}#bWorld{position:relative}'+
    '.wmp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #c9933f44}.wmp-row span{flex:1;font-weight:700}.wmp-row button{min-height:38px}#wmpPlayers{max-height:30dvh;overflow:auto}'+
    '.wmp-ch{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:6px 0}.wmp-ch button{min-height:40px;display:flex;flex-direction:column;align-items:center}.wmp-ch button.on{outline:2px solid #ffd27e}.wmp-ch small{font-size:10px;opacity:.8;min-height:1em}'+
    '.onl:has(#wmpStatus) .dlg{max-height:calc(100dvh - 24px - env(safe-area-inset-bottom));overflow:auto}#wmpStatus{font-weight:700}';
  document.head.appendChild(st);
  const labels=document.createElement('div');labels.id='wmpLabels';document.body.appendChild(labels);
  const inv=document.createElement('div');inv.id='wmpInvite';inv.hidden=true;inv.setAttribute('role','alert');document.body.appendChild(inv);
  const bar=$('#topR');if(bar&&!$('#bWorld')){const b=document.createElement('button');b.className='ibtn glass';b.id='bWorld';b.setAttribute('aria-label','لاعبين العالم');b.innerHTML='<svg class="ic" data-ic="flag"></svg><small>العالم</small><b id="wmpN">–</b>';bar.insertBefore(b,bar.firstChild);hydrateIcons(b);b.onclick=()=>wmpPanel()}
  // Real players render, label and animate alongside NPCs; their nearest one takes the challenge button.
  const prevNPCs=updateNPCs;updateNPCs=function(dt,t){const r=prevNPCs.apply(this,arguments);try{wmpFrame(dt,t)}catch(e){}return r};
  const prevLabels=updateLabels;updateLabels=function(){const r=prevLabels.apply(this,arguments);try{wmpLabels()}catch(e){}return r};
  const prevMini=drawMini;drawMini=function(){const r=prevMini.apply(this,arguments);try{wmpMini()}catch(e){}return r};
  const prevPlayer=updatePlayer;updatePlayer=function(){const r=prevPlayer.apply(this,arguments);const n=wmpNearest(),npcD=typeof nearNPC!=='undefined'&&nearNPC?Math.hypot(nearNPC.pos.x-player.pos.x,nearNPC.pos.z-player.pos.z):1e9;
    const uid=n&&n.d<=npcD+.4?n.a.uid:null;if(uid!==WMP.near){WMP.near=uid;WMP.nearText='~'}if(WMP.near||WMP.nearText)wmpNearUI();return r};
  const act=$('#actMain');if(act){const prevAct=act.onclick;act.onclick=function(e){if(mode==='explore'&&WMP.near&&WMP.avatars.has(WMP.near)){try{SFX.tap()}catch(_){}wmpCard(WMP.near);return}return prevAct&&prevAct.call(this,e)}}
  const touchEl=$('#touch');if(touchEl){let down=null;touchEl.addEventListener('pointerdown',e=>{down=mode==='explore'?[e.clientX,e.clientY,Date.now(),e.pointerId]:null},true);
    touchEl.addEventListener('pointerup',e=>{if(!down||down[3]!==e.pointerId)return;const d=down;down=null;if(mode!=='explore'||Date.now()-d[2]>350||Math.hypot(e.clientX-d[0],e.clientY-d[1])>12)return;const a=wmpPick(e.clientX,e.clientY);if(a)wmpCard(a.uid)},true)}
  // Character models that finish downloading later also upgrade real players.
  const prevUp=skUpgradeAll;skUpgradeAll=function(){const r=prevUp.apply(this,arguments);for(const a of WMP.avatars.values())try{skAttach(a.ch)}catch(e){}return r};
  // Online room start uses the real opponent's character when the match came from a world challenge.
  const prevStart=onlStart;onlStart=async function(){if(!requirePlayAccount())return;const room=ONL.room,opp=WMP.matchOpp;if(opp&&WMP.avatars.has(opp)&&room&&[room.host,room.guest].includes(opp))return wmpStartMatch();return prevStart.apply(this,arguments)};
  const prevBegin=beginMatch;beginMatch=function(){if(!requirePlayAccount())return;WMP.voiceWas=typeof VC!=='undefined'&&VC.kind==='voiceWorlds'?VC.channel:null;return prevBegin.apply(this,arguments)};
  const prevLeave=leaveMatch;leaveMatch=async function(){const n=game&&game.npc,real=!!(n&&n.real),voice=WMP.voiceWas;const r=await prevLeave.apply(this,arguments);
    if(real){wmpReleaseBody(n)}WMP.matchOpp=null;WMP.matchTable=-1;WMP.voiceWas=null;
    if(voice&&real)setTimeout(()=>{if(mode!=='explore'||(typeof VC!=='undefined'&&VC.uid))return;onlDlg('<h3>ترجع لصوت العالم؟</h3><p class="muted">القناة '+voice+' · المايك بيبقى مغلق إلى أن تفتحه.</p><div class="row"><button class="pbtn" data-a="y">رجوع للصوت</button><button class="gbtn" data-a="x">لا</button></div>',{y:()=>{closeLayer();VC.channel=voice;voiceJoin('voiceWorlds',S.country+'_'+voice)},x:()=>closeLayer()})},1800);return r};
  // A loss is recorded only after this client replays the server moves and sees a finished board.
  const prevApply=onlApplyResult;onlApplyResult=function(result){if(game&&game.online&&ONL.room&&!game.over&&!ONL.pending&&!wmpResultTrusted(ONL.room,result)){game.over=true;game.busy=true;onlForget();toast('النتيجة ما تطابق نقلات الطاولة؛ ما انحسبت',4200);return}return prevApply.apply(this,arguments)};
  const prevStop=rsStop;rsStop=function(){wmpStop();return prevStop.apply(this,arguments)};
  const prevLobby=enterLobby;enterLobby=function(){wmpStop();return prevLobby.apply(this,arguments)};
  const prevTravel=travelTo;travelTo=async function(){wmpStop();return prevTravel.apply(this,arguments)};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)wmpStop();else{WMP.retryAt=0;wmpTick()}});
  addEventListener('offline',()=>wmpStop('انقطع الإنترنت؛ بنرجعك للعالم أول ما يرجع.'));addEventListener('online',()=>{WMP.retryAt=0;wmpTick()});addEventListener('pagehide',()=>wmpStop());
  WMP.timer=setInterval(wmpTick,1000);
}
/* ================= end real world multiplayer ================= */
