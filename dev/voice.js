/* ================= v37: real opt-in world and match voice ================= */
// Firebase carries only authenticated signaling. Audio travels through WebRTC, never a save/document.
const VC={gen:0,uid:null,kind:null,space:null,slot:null,session:null,matchId:'',local:null,peers:new Map(),rows:[],unsub:null,timer:0,beatBusy:false,lastBeat:0,busy:false,micBusy:false,micGen:0,error:'',channel:1,muted:new Set(),pc:null};
const VC_ICE=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
function voiceStamp(){return firebase.firestore.FieldValue.serverTimestamp()}
function voiceTime(t){return t&&typeof t.toMillis==='function'?t.toMillis():0}
function voiceId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
function voiceSeats(kind=VC.kind,space=VC.space){return ONL.db.collection(kind).doc(space).collection('seats')}
function voiceCurrent(gen=VC.gen){return !!VC.uid&&VC.gen===gen&&rsUid()===VC.uid&&!document.hidden&&navigator.onLine!==false&&!window.DAMA_CONTEXT_LOST&&!CTL.ban}
function voiceAllowed(){if(VC.kind==='voiceMatches')return !!(game&&game.online&&!game.over&&ONL.room&&ONL.room.state==='play'&&ONL.room.matchId===VC.matchId&&ONL.code===VC.space);return mode==='explore'&&!LOBBY.on&&VC.space===S.country+'_'+VC.channel}
function voiceError(e){return ({'voice-full':'القناة مكتملة؛ اختَر قناة ثانية.','voice-session':'الصوت مفتوح بحسابك في جلسة ثانية.','voice-lost':'انتهى اتصال الصوت؛ اضغط إعادة الاتصال.','voice-name':'اختَر اسمك المسجّل أولًا.','permission-denied':'تعذّر السماح بالصوت؛ تأكد من الحساب وإعدادات الإدارة.','resource-exhausted':'خدمة الصوت وصلت حد الاستخدام مؤقتًا.','NotAllowedError':'اسمح للعبة باستخدام المايك من إعدادات المتصفح، ثم جرّب مرة ثانية.','NotFoundError':'ما لقينا مايك متصل بالجهاز.','NotReadableError':'المايك مشغول بتطبيق آخر؛ سكّره وجرّب.'})[e&&(e.code||e.name)]||'تعذّر اتصال الصوت؛ جرّب مرة ثانية.'}
async function voiceClaim(kind,space,session,uid,name,nameKey,matchId){
  const seats=voiceSeats(kind,space),own=ONL.db.collection('voiceUsers').doc(uid),count=kind==='voiceMatches'?2:8;
  return ONL.db.runTransaction(async tx=>{
    const mine=await tx.get(own),refs=Array.from({length:count},(_,i)=>seats.doc(String(i))),snaps=[];
    for(const ref of refs)snaps.push(await tx.get(ref));
    let oldRef=null,old=null;
    if(mine.exists){const m=mine.data();oldRef=voiceSeats(m.kind,m.space).doc(m.slot);old=await tx.get(oldRef);
      if(old.exists&&old.data().session===m.session&&voiceTime(old.data().at)>Date.now()-90000){if(m.session===session&&m.kind===kind&&m.space===space)return m.slot;throw{code:'voice-session'}}}
    const index=kind==='voiceMatches'?(ONL.role==='host'?0:1):snaps.findIndex(s=>!s.exists||voiceTime(s.data().at)<=Date.now()-90000);
    if(index<0)throw{code:'voice-full'};
    const current=snaps[index];if(current.exists&&voiceTime(current.data().at)>Date.now()-90000)throw{code:'voice-session'};
    tx.set(refs[index],{uid,name,nameKey,session,matchId,at:voiceStamp(),mic:false});
    tx.set(own,{kind,space,slot:String(index),session});return String(index);
  });
}
async function voiceRelease(kind,space,slot,session,uid){
  if(slot==null||!uid)return;const ref=voiceSeats(kind,space).doc(slot),own=ONL.db.collection('voiceUsers').doc(uid);
  try{await ONL.db.runTransaction(async tx=>{const s=await tx.get(ref),m=await tx.get(own);if(s.exists&&s.data().uid===uid&&s.data().session===session)tx.delete(ref);if(m.exists&&m.data().session===session)tx.delete(own)})}catch(e){}
}
async function voiceJoin(kind,space){
  if(VC.busy||VC.uid)return;if(!requirePlayAccount())return;
  if(!rsUid()||!ACC.synced||!ACC.key){toast('اختَر اسمك المسجّل أولًا');return}
  if(document.hidden||navigator.onLine===false||CTL.ban||!window.RTCPeerConnection){toast('الصوت غير متاح في هذه الجلسة');return}
  const gen=++VC.gen,uid=rsUid(),session=voiceId();Object.assign(VC,{busy:true,uid,kind,space,session,slot:null,matchId:kind==='voiceMatches'?ONL.room?.matchId||'':'',error:'',rows:[]});voiceUI();
  try{if(VC.releasing)await VC.releasing;if(!voiceCurrent(gen)||!voiceAllowed()){if(VC.gen===gen)voiceStop();return}
    let slot;try{slot=await voiceClaim(kind,space,session,uid,ACC.name,ACC.key,VC.matchId)}catch(e){if(!voiceCurrent(gen)||!['unavailable','deadline-exceeded','aborted'].includes(e.code))throw e;slot=await voiceClaim(kind,space,session,uid,ACC.name,ACC.key,VC.matchId)}
    if(!voiceCurrent(gen)||!voiceAllowed()){await voiceRelease(kind,space,slot,session,uid);if(VC.gen===gen)voiceStop();return}
    VC.slot=slot;VC.lastBeat=Date.now();VC.unsub=voiceSeats().limit(kind==='voiceMatches'?2:8).onSnapshot(s=>{
      if(!voiceCurrent(gen)||s.metadata.hasPendingWrites)return;
      VC.rows=s.docs.map(d=>({slot:d.id,...d.data()}));const me=VC.rows.find(r=>r.slot===slot&&r.uid===uid&&r.session===session);
      if(!me){voiceFail({code:'voice-lost'});return}voiceSync();voiceUI();
    },e=>{if(VC.gen===gen)voiceFail(e)});
    VC.timer=setInterval(voiceTick,1000);
  }catch(e){if(VC.gen===gen)voiceFail(e)}finally{if(VC.gen===gen){VC.busy=false;voiceUI()}}
}
function voicePeerCurrent(p){return voiceCurrent(p.gen)&&VC.peers.get(p.uid)===p&&!p.closed&&voiceAllowed()}
function voicePeerClose(p){p.closed=true;clearTimeout(p.iceTimer);clearTimeout(p.deadline);if(p.unsub)p.unsub();if(p.controlUnsub)p.controlUnsub();try{p.pc.close()}catch(e){}if(p.audio){p.audio.pause();p.audio.srcObject=null;p.audio.remove()}if(p.stream)for(const t of p.stream.getTracks())t.stop()}
function voicePeerError(p,e){if(!voicePeerCurrent(p))return;p.state='failed';p.error=voiceError(e);voicePeerClose(p);VC.peers.delete(p.uid);VC.error='تعذّر الصوت مع '+p.name+'؛ اضغط إعادة الاتصال.';VC.muted.add('failed:'+p.session);voiceUI()}
async function voicePublish(p,changes){
  if(!voicePeerCurrent(p))return;await ONL.db.runTransaction(async tx=>{
    const snap=await tx.get(p.out);if(!voicePeerCurrent(p))return;
    const old=snap.exists?snap.data():null,base=old&&old.fromSession===VC.session&&old.toSession===p.session?old:{fromSession:VC.session,toSession:p.session,sdp:'',type:p.offerer?'offer':'answer',ice:[]};
    const next={...base,...changes,at:voiceStamp()};if(changes.ice)next.ice=[...new Set([...base.ice,...changes.ice])].slice(0,32);tx.set(p.out,next);
  });
}
async function voiceFlushIce(p){if(!voicePeerCurrent(p)||!p.ice.length)return;const ice=p.ice.splice(0,32);try{await voicePublish(p,{ice})}catch(e){voicePeerError(p,e)}}
async function voiceRemote(p,data){
  if(!voicePeerCurrent(p)||!data||data.fromSession!==p.session||data.toSession!==VC.session)return;
  p.latest=data;if(p.signaling)return;p.signaling=true;
  try{while(voicePeerCurrent(p)&&p.latest){const r=p.latest;p.latest=null;
    if(r.sdp&&!p.pc.remoteDescription){const type=p.offerer?'answer':'offer';if(r.type!==type)throw Error('signal type');await p.pc.setRemoteDescription({type,sdp:r.sdp});if(!voicePeerCurrent(p))return;
      if(!p.offerer){p.sender=p.pc.getSenders().find(s=>s.track?.kind==='audio')||p.pc.getTransceivers().find(t=>t.receiver.track.kind==='audio')?.sender;if(!p.sender)throw Error('audio sender');
        const tr=p.pc.getTransceivers().find(t=>t.sender===p.sender);if(tr)tr.direction='sendrecv';
        await p.sender.replaceTrack(voiceTrack());if(!voicePeerCurrent(p))return;const a=await p.pc.createAnswer();if(!voicePeerCurrent(p))return;await p.pc.setLocalDescription(a);if(!voicePeerCurrent(p))return;await voicePublish(p,{sdp:a.sdp,type:'answer'})}}
    if(p.pc.remoteDescription)for(const raw of r.ice||[]){if(!voicePeerCurrent(p))return;if(p.got.has(raw))continue;p.got.add(raw);try{await p.pc.addIceCandidate(JSON.parse(raw))}catch(e){if(!voicePeerCurrent(p))return;throw e}}
  }}catch(e){voicePeerError(p,e)}finally{p.signaling=false}
}
function voiceTrack(){return !CTL.mute&&!CTL.ban&&VC.local?VC.local.getAudioTracks().find(t=>t.readyState!=='ended'&&t.enabled)||null:null}
function voiceAudio(p){if(!p.audio)return;const blocked=rcBlocked(p.uid)||VC.muted.has(p.uid)||p.adminMuted||p.banned,volume=Math.max(0,Math.min(1,(S.settings.opp??1)*(S.settings.vol??1)));p.audio.volume=volume;p.audio.muted=blocked||volume<=0.001||(VC.kind==='voiceMatches'?!S.settings.oppVoice:false)}
async function voicePeer(row){
  const p={uid:row.uid,name:row.name,slot:row.slot,session:row.session,gen:VC.gen,offerer:+VC.slot<+row.slot,pc:null,sender:null,state:'connecting',ice:[],got:new Set(),closed:false,signaling:false,latest:null};
  VC.peers.set(p.uid,p);
  try{p.pc=new RTCPeerConnection({iceServers:VC_ICE,bundlePolicy:'max-bundle'});p.out=voiceSeats().doc(VC.slot).collection('signals').doc(row.slot);p.input=voiceSeats().doc(row.slot).collection('signals').doc(VC.slot);
    p.pc.onicecandidate=e=>{if(!voicePeerCurrent(p)||!e.candidate||p.ice.length>=32)return;p.ice.push(JSON.stringify(e.candidate.toJSON()));clearTimeout(p.iceTimer);p.iceTimer=setTimeout(()=>voiceFlushIce(p),250)};
    p.pc.ontrack=e=>{if(!voicePeerCurrent(p)){e.track.stop();return}if(p.audio)return;
      p.stream=e.streams[0]||new MediaStream([e.track]);const a=p.audio=document.createElement('audio');a.autoplay=true;a.playsInline=true;a.setAttribute('playsinline','');a.srcObject=p.stream;document.body.appendChild(a);voiceAudio(p);a.play().catch(()=>{if(voicePeerCurrent(p)){p.needTap=true;voiceUI()}})};
    p.pc.onconnectionstatechange=()=>{if(!voicePeerCurrent(p))return;const s=p.pc.connectionState;p.state=s;if(s==='connected')clearTimeout(p.deadline);if(s==='failed'){voicePeerError(p,{code:'voice-lost'});return}voiceUI()};
    p.controlUnsub=ONL.db.collection('voiceControls').doc(p.uid).onSnapshot(s=>{if(!voicePeerCurrent(p))return;const c=s.exists?s.data():{};p.adminMuted=!!c.mute;p.banned=!!c.ban;voiceAudio(p);if(p.banned)voicePeerError(p,{code:'voice-lost'})},e=>voicePeerError(p,e));
    p.unsub=p.input.onSnapshot(s=>{if(voicePeerCurrent(p)&&s.exists&&!s.metadata.hasPendingWrites)voiceRemote(p,s.data())},e=>voicePeerError(p,e));
    p.deadline=setTimeout(()=>{if(voicePeerCurrent(p)&&p.pc.connectionState!=='connected')voicePeerError(p,{code:'voice-lost'})},25000);
    if(p.offerer){const trans=p.pc.addTransceiver('audio',{direction:'sendrecv'});p.sender=trans.sender;await p.sender.replaceTrack(voiceTrack());if(!voicePeerCurrent(p))return;const o=await p.pc.createOffer();if(!voicePeerCurrent(p))return;await p.pc.setLocalDescription(o);if(!voicePeerCurrent(p))return;await voicePublish(p,{sdp:o.sdp,type:'offer'})}
  }catch(e){voicePeerError(p,e)}
}
function voiceSync(){if(!voiceCurrent()||VC.slot==null)return;const rows=VC.rows.filter(r=>r.uid!==VC.uid&&r.session&&voiceTime(r.at)>Date.now()-90000&&r.matchId===VC.matchId&&!rcBlocked(r.uid));
  for(const [uid,p]of VC.peers)if(!rows.some(r=>r.uid===uid&&r.session===p.session)){voicePeerClose(p);VC.peers.delete(uid)}
  for(const r of rows)if(!VC.peers.has(r.uid)&&!VC.muted.has('failed:'+r.session))voicePeer(r);
}
async function voiceBeat(){if(VC.beatBusy||!voiceCurrent()||VC.slot==null)return;const gen=VC.gen,ref=voiceSeats().doc(VC.slot),session=VC.session;VC.beatBusy=true;
  try{await ONL.db.runTransaction(async tx=>{const s=await tx.get(ref);if(!voiceCurrent(gen))return;if(!s.exists||s.data().session!==session)throw{code:'voice-lost'};tx.update(ref,{at:voiceStamp(),mic:!!voiceTrack()})});if(voiceCurrent(gen))VC.lastBeat=Date.now()}
  catch(e){if(voiceCurrent(gen))voiceFail(e)}finally{if(VC.gen===gen)VC.beatBusy=false}
}
function voiceTick(){if(!voiceCurrent()||!voiceAllowed()){voiceStop();return}if(CTL.mute&&VC.local)voiceMicOff();if(Date.now()-VC.lastBeat>70000){voiceFail({code:'voice-lost'});return}if(Date.now()-VC.lastBeat>=30000)voiceBeat();voiceSync();for(const p of VC.peers.values())voiceAudio(p);voiceUI()}
function voiceMicOff(){VC.micGen++;VC.micBusy=false;const stream=VC.local;VC.local=null;if(stream)for(const t of stream.getTracks()){t.enabled=false;t.stop()}for(const p of VC.peers.values())if(p.sender)p.sender.replaceTrack(null).catch(e=>voicePeerError(p,e));S.settings.matchVoice=false;S.settings.mic=false;voiceUI()}
async function voiceMic(){
  if(voiceTrack()){voiceMicOff();voiceBeat();return}if(VC.micBusy){voiceMicOff();return}if(!voiceCurrent()||VC.slot==null)return;if(CTL.mute){toast('المايك مقفول عليك من الإدارة');return}
  const gen=VC.gen,micGen=++VC.micGen;VC.micBusy=true;voiceUI();
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    // Disable before the first await: permission may arrive after leaving, muting or switching accounts.
    for(const t of stream.getTracks())t.enabled=false;
    if(!voiceCurrent(gen)||!voiceAllowed()||VC.micGen!==micGen||CTL.mute){for(const t of stream.getTracks())t.stop();return}
    VC.local=stream;const track=stream.getAudioTracks()[0];if(!track)throw{ name:'NotFoundError'};track.enabled=true;track.onended=()=>{if(VC.local===stream){voiceMicOff();voiceBeat()}};
    for(const p of VC.peers.values()){if(!voiceCurrent(gen)||VC.micGen!==micGen)break;if(p.sender)await p.sender.replaceTrack(track)}
    if(!voiceCurrent(gen)||VC.micGen!==micGen||CTL.mute){for(const t of stream.getTracks())t.stop();return}
    S.settings.matchVoice=VC.kind==='voiceMatches';S.settings.mic=VC.kind==='voiceWorlds';VC.error='';await voiceBeat();
  }catch(e){if(VC.gen===gen&&VC.micGen===micGen){voiceMicOff();VC.error=voiceError(e);toast(VC.error)}}finally{if(VC.gen===gen&&VC.micGen===micGen)VC.micBusy=false;voiceUI()}
}
function voiceStop(message=''){
  const {kind,space,slot,session,uid}=VC;VC.gen++;clearInterval(VC.timer);if(VC.unsub)VC.unsub();VC.unsub=null;voiceMicOff();for(const p of VC.peers.values())voicePeerClose(p);VC.peers.clear();
  Object.assign(VC,{uid:null,kind:null,space:null,slot:null,session:null,matchId:'',rows:[],busy:false,beatBusy:false,lastBeat:0,error:message,timer:0});VC.muted.clear();voiceUI();if(uid)VC.releasing=voiceRelease(kind,space,slot,session,uid);
}
function voiceFail(e){const message=voiceError(e);voiceStop(message);toast(message)}
function voiceStatus(){if(VC.busy)return'جاري الاتصال بالصوت…';if(VC.error)return VC.error;if(!VC.uid)return'الصوت غير متصل';const connected=[...VC.peers.values()].filter(p=>p.state==='connected').length;if(connected)return'الصوت متصل مع '+connected+' '+(connected===1?'لاعب':'لاعبين');return VC.peers.size?'جاري توصيل اللاعبين…':'أنت وحدك في قناة الصوت';}
function voiceUI(){
  const track=voiceTrack(),modal=$('#realVoiceStatus'),key=JSON.stringify([VC.kind,!!track,VC.micBusy,VC.slot,CTL.mute,S.settings.oppVoice,voiceStatus(),VC.rows.map(r=>[r.uid,r.session,r.mic]),[...VC.peers.values()].map(p=>[p.uid,p.state,p.needTap,p.adminMuted]),[...VC.muted]]);
  if(VC.uiKey===key&&VC.uiModal===modal)return;VC.uiKey=key;VC.uiModal=modal;
  const b=$('#micB');if(b){b.classList.toggle('on',VC.kind==='voiceWorlds'&&!!track);b.innerHTML=ic(VC.kind==='voiceWorlds'&&track?'mic':'micoff');b.setAttribute('aria-label','صوت العالم')}
  const hear=$('#hearT');if(hear)hear.textContent=VC.kind==='voiceWorlds'?voiceStatus():'صوت العالم مغلق';
  const mic=$('#mMic');if(mic){const on=VC.kind==='voiceMatches'&&!!track;mic.classList.toggle('on',on);mic.innerHTML=ic(on?'mic':'micoff')+'<span>'+(VC.micBusy?'بانتظار إذن المايك':on?'مايكك مفتوح':VC.kind==='voiceMatches'?'افتح المايك':'توصيل صوت المباراة')+'</span>'}
  const mute=$('#mMute');if(mute){mute.classList.toggle('on',S.settings.oppVoice);mute.innerHTML=ic(S.settings.oppVoice?'speaker':'speakeroff')+'<span>'+(S.settings.oppVoice?'صوت الخصم مفعّل':'الخصم مكتوم')+'</span>'}
  const status=modal;if(status)status.textContent=voiceStatus()+([...VC.peers.values()].some(p=>p.needTap)?' · اضغط الشاشة لتفعيل السماع':'');const toggle=$('#realVoiceMic');if(toggle){toggle.textContent=VC.micBusy?'إلغاء طلب المايك':track?'إغلاق المايك':'فتح المايك';toggle.disabled=!VC.uid||VC.slot==null||CTL.mute}
  const list=$('#realVoicePlayers');if(list){const rows=VC.rows.filter(r=>voiceTime(r.at)>Date.now()-90000);list.innerHTML=rows.map(r=>'<div class="rv-player"><span>'+esc(r.name)+(r.uid===VC.uid?' (أنت)':'')+'</span><small>'+esc(r.uid===VC.uid?(track?'مايك مفتوح':'مايك مغلق'):VC.peers.get(r.uid)?.state==='connected'?'متصل':'غير متصل')+'</small>'+(r.uid===VC.uid?'':'<button class="sbtn" data-a="vcmute" data-uid="'+esc(r.uid)+'">'+(VC.muted.has(r.uid)?'سماع':'كتم')+'</button><button class="sbtn" data-a="vcreport" data-uid="'+esc(r.uid)+'">بلّغ</button>')+'</div>').join('')||'<p>ما فيه لاعبين بقناتك حاليًا.</p>'}
}
function voiceOpen(){
  const match=!!(game&&game.online&&!game.over&&ONL.ref&&ONL.room?.state==='play'),title=match?'صوت المباراة':'صوت العالم';
  onlDlg('<h3>'+title+'</h3><p id="realVoiceStatus"></p>'+(match?'':'<p>يسمعك المشاركون بنفس الدولة والقناة، بحد أقصى 8 لاعبين. الصوت مو مرتبط بالمسافة.</p><label>القناة <select id="voiceChannel">'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'"'+(VC.channel===i+1?' selected':'')+'>'+(i+1)+'</option>').join('')+'</select></label>')+'<div id="realVoicePlayers"></div><div class="row"><button class="gbtn" data-a="vcjoin">'+(VC.uid?'إعادة الاتصال':'دخول للاستماع')+'</button><button class="gbtn" id="realVoiceMic" data-a="vcmic">فتح المايك</button><button class="gbtn" data-a="vcleave">مغادرة الصوت</button><button class="gbtn" data-a="vcclose">إغلاق النافذة</button></div><p class="muted">المايك يبدأ مغلقًا. عند مغادرة العالم أو إخفاء اللعبة يتوقف الصوت.</p>',{
    vcjoin:async()=>{const channel=Number($('#voiceChannel')?.value||VC.channel);if(VC.uid||VC.busy){const old={kind:VC.kind,space:VC.space,slot:VC.slot,session:VC.session,uid:VC.uid};voiceStop();await voiceRelease(old.kind,old.space,old.slot,old.session,old.uid)}VC.channel=Math.max(1,Math.min(10,channel));if(match)await vcStart();else if(mode==='explore'&&!LOBBY.on)await voiceJoin('voiceWorlds',S.country+'_'+VC.channel);else toast('ادخل العالم عشان تستخدم صوته');voiceUI()},
    vcmic:voiceMic,vcleave:()=>voiceStop(),vcclose:closeLayer,
    vcmute:b=>{const uid=b.dataset.uid;if(VC.muted.has(uid))VC.muted.delete(uid);else VC.muted.add(uid);const p=VC.peers.get(uid);if(p)voiceAudio(p);voiceUI()},
    vcreport:async b=>{const row=VC.rows.find(r=>r.uid===b.dataset.uid);if(!row||!VC.uid)return;try{await ONL.db.collection('reports').add({by:VC.uid,byName:ACC.name,target:row.uid,targetName:row.name,reason:'voice',note:'بلاغ من قناة الصوت '+VC.space,at:Date.now(),createdAt:voiceStamp(),status:'open'});toast('وصل البلاغ للإدارة')}catch(e){toast(voiceError(e))}}
  });voiceUI();
}
async function vcStart(){if(!game||!game.online||game.over||!ONL.code||ONL.room?.state!=='play')return;if(VC.uid&&VC.kind==='voiceMatches'&&VC.space===ONL.code)return;if(VC.uid){const old={...VC};voiceStop();await voiceRelease(old.kind,old.space,old.slot,old.session,old.uid)}await voiceJoin('voiceMatches',ONL.code)}
function vcStop(){voiceStop()}
function vcSignal(){} // v2 room signaling remains readable for old saved games; v37 uses authenticated seats.
function voiceInstall(){
  S.settings.mic=false;S.settings.matchVoice=false;micUI=voiceUI;updateHear=function(){const el=$('#hearT'),text=VC.kind==='voiceWorlds'?voiceStatus():'صوت العالم مغلق';if(el&&el.textContent!==text)el.textContent=text};updMatchBtns=voiceUI;$('#micB').onclick=voiceOpen;
  $('#mMic').onclick=async()=>{if(!game||!game.online){toast('الصوت متاح مع لاعب حقيقي فقط');return}if(VC.kind!=='voiceMatches'){await vcStart();voiceOpen();return}await voiceMic()};
  $('#mMute').onclick=()=>{if(!game||!game.online){toast('ما فيه خصم بشري بهالمباراة');return}S.settings.oppVoice=!S.settings.oppVoice;persist();for(const p of VC.peers.values())voiceAudio(p);voiceUI()};
  const matchBar=$('#mLeft');if(matchBar){const btn=document.createElement('button');btn.className='mbtn glass';btn.id='voiceDetails';btn.textContent='حالة الصوت';btn.onclick=voiceOpen;matchBar.appendChild(btn)}
  const previousMute=ctlApplyMute;ctlApplyMute=function(){previousMute();if(CTL.ban)voiceStop();else if(CTL.mute){voiceMicOff();voiceBeat()}};
  const previousStop=rsStop;rsStop=function(clear){voiceStop();return previousStop.apply(this,arguments)};
  const previousLobby=enterLobby;enterLobby=function(){voiceStop();return previousLobby.apply(this,arguments)};
  const previousTravel=travelTo;travelTo=async function(){voiceStop();return previousTravel.apply(this,arguments)};
  const previousBegin=beginMatch;beginMatch=function(){if(!requirePlayAccount())return;voiceStop();return previousBegin.apply(this,arguments)};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)voiceStop('الصوت توقف بالخلفية؛ أعد الاتصال عند الرجوع.')});addEventListener('offline',()=>voiceStop('انقطع الإنترنت؛ أعد الاتصال بالصوت بعد رجوعه.'));addEventListener('pagehide',()=>voiceStop());
  document.addEventListener('pointerdown',()=>{for(const p of VC.peers.values())if(p.needTap&&p.audio)p.audio.play().then(()=>{p.needTap=false;voiceUI()}).catch(()=>{})},true);
  const style=document.createElement('style');style.textContent='.rv-player{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #c9933f44}.rv-player span{flex:1}.rv-player button{min-height:38px}.onl #voiceChannel{font:inherit;padding:8px;background:#142034;color:#ffe3a6}#realVoicePlayers{max-height:28dvh;overflow:auto}.onl:has(#realVoiceStatus) .dlg{max-height:calc(100dvh - 24px - env(safe-area-inset-bottom));overflow:auto}.onl #realVoiceStatus{font-weight:700;min-height:1.4em}';document.head.appendChild(style);voiceUI();
}
/* ================= end real voice ================= */
