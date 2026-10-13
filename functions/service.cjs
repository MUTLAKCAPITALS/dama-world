'use strict';
const {randomInt, randomUUID}=require('node:crypto');
const {HttpsError}=require('firebase-functions/v2/https');
const {FieldValue}=require('firebase-admin/firestore');
const {initBoard,genMoves,applyMove}=require('./engine.cjs');
const OWNER='alomarmutlak@gmail.com',MAX_PLIES=2048;
const error=(code,message)=>{throw new HttpsError(code,message)};
const need=(ok,code,message)=>{if(!ok)error(code,message)};
const emptyProfile=()=>({rating:1000,coins:0,xp:0,wins:0,losses:0,draws:0,games:0,revision:0,activeRoom:null});
function identity(request){
  const a=request.auth,p=a?.token?.firebase?.sign_in_provider;
  need(a&&/^[A-Za-z0-9_-]{1,128}$/.test(a.uid),'unauthenticated','سجّل دخولك أولاً');
  need(p&&p!=='anonymous','permission-denied','اللعب يحتاج حساباً مسجلاً');
  return a.uid;
}
function shape(data,keys){need(data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).every(k=>keys.includes(k)),'invalid-argument','طلب غير صالح')}
const read=s=>s.exists?s.data():null;
const encode=a=>a.map(p=>p.join('')).join(',');
function decode(s,flip=false){return s?s.split(',').map(p=>flip?[7-+p[0],7-+p[1]]:[+p[0],+p[1]]):[]}
function wireMove(data){
  shape(data,['n','from','steps','caps']);
  need(Number.isInteger(data.n)&&data.n>=0&&data.n<MAX_PLIES,'invalid-argument','تسلسل نقلة غير صالح');
  need(typeof data.from==='string'&&/^[0-7]{2}$/.test(data.from),'invalid-argument','حجر غير صالح');
  for(const k of ['steps','caps'])need(typeof data[k]==='string'&&data[k].length<=256&&(k==='caps'&&data[k]===''||/^[0-7]{2}(,[0-7]{2})*$/.test(data[k])),'invalid-argument','مسار غير صالح');
  return data;
}
function terminal(r){
  const side=r.moves.length%2===0?1:-1;
  if(!r.board.some(p=>p>0))return {winner:r.guest,reason:'أُكلت كل أحجار المضيف'};
  if(!r.board.some(p=>p<0))return {winner:r.host,reason:'أُكلت كل أحجار الضيف'};
  if(!genMoves(r.board,side).length)return {winner:side===1?r.guest:r.host,reason:'لا توجد حركة متاحة'};
  if(r.noCap>=60)return {winner:null,reason:'60 نقلة بلا أكل'};
  if(r.moves.length>=MAX_PLIES)return {winner:null,reason:'وصلت المباراة إلى حد النقلات'};
  return null;
}
function award(profile,opponent,res,captures){
  const delta=Math.round(32*((res>0?1:res<0?0:.5)-1/(1+10**((opponent.rating-profile.rating)/400))));
  const coins=res>0?50+captures*2:res<0?10:25,xp=res>0?60:res<0?15:25;
  return {coins,xp,delta,rating:Math.max(100,profile.rating+delta)};
}
function makeService(db,auth,options={}){
  const now=options.now||Date.now;
  const newCode=options.newCode||(()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:4},()=>alphabet[randomInt(alphabet.length)]).join('')});
  const profileRef=uid=>db.doc('competitive/'+uid),jobRef=uid=>db.doc('accountDeletions/'+uid);
  async function guards(tx,uid){
    const [cfg,ctl,job,user,profile]=await tx.getAll(db.doc('cfg/backend'),db.doc('ctl/'+uid),jobRef(uid),db.doc('users/'+uid),profileRef(uid));
    need(!job.exists,'failed-precondition','طلب حذف الحساب قيد التنفيذ');
    need(!read(ctl)?.ban,'permission-denied','الحساب موقوف');
    return {cfg:read(cfg)||{},user:read(user)||{},profile:read(profile)||emptyProfile()};
  }
  async function settle(tx,ref,r,verdict){
    const [hs,gs,hj,gj]=await tx.getAll(profileRef(r.host),profileRef(r.guest),jobRef(r.host),jobRef(r.guest));
    need(!hj.exists&&!gj.exists,'failed-precondition','أحد الحسابات قيد الحذف');
    const hp=read(hs)||emptyProfile(),gp=read(gs)||emptyProfile();
    const hostRes=verdict.winner==null?0:verdict.winner===r.host?1:-1;
    const hostAward=award(hp,gp,hostRes,r.hostCaps),guestAward=award(gp,hp,-hostRes,r.guestCaps);
    const result={...verdict,plies:r.moves.length,hostAward,guestAward,verified:true};
    for(const [uid,p,a,res] of [[r.host,hp,hostAward,hostRes],[r.guest,gp,guestAward,-hostRes]]){
      tx.set(profileRef(uid),{...p,rating:a.rating,coins:p.coins+a.coins,xp:p.xp+a.xp,
        games:p.games+1,wins:p.wins+(res>0?1:0),losses:p.losses+(res<0?1:0),draws:p.draws+(res===0?1:0),revision:p.revision+1,activeRoom:null});
      tx.create(profileRef(uid).collection('receipts').doc(r.matchId),{...a,result:res,plies:r.moves.length,at:FieldValue.serverTimestamp()});
    }
    tx.update(ref,{...r,state:'done',result,finished:FieldValue.serverTimestamp()});
    return result;
  }
  async function create(request){
    const uid=identity(request),d=request.data;shape(d,['action','requestId']);
    need(typeof d.requestId==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(d.requestId),'invalid-argument','معرف طلب غير صالح');
    for(let attempt=0;attempt<5;attempt++){
      const code=newCode(),ref=db.doc('rooms/'+code),receipt=db.doc('_onlineRequests/'+uid+'/ids/'+d.requestId);
      try{return await db.runTransaction(async tx=>{
        const g=await guards(tx,uid);need(g.cfg.enabled===true&&g.cfg.protocol===3,'failed-precondition','الخدمة غير مفعّلة');
        const [seen,room]=await tx.getAll(receipt,ref);if(seen.exists)return seen.data();
        if(g.profile.activeRoom){const active=await tx.get(db.doc('rooms/'+g.profile.activeRoom));need(!active.exists||!['wait','play'].includes(active.data().state),'already-exists','عندك غرفة مفتوحة؛ استرجعها أولاً')}
        need(!room.exists,'aborted','تصادم رمز');
        const matchId=randomUUID(),response={code,matchId,protocol:3};
        tx.create(ref,{code,matchId,protocol:3,host:uid,hostName:String(g.user.name||'لاعب').slice(0,14),hostPhoto:null,hostRating:g.profile.rating,
          guest:null,guestName:'',state:'wait',moves:[],messages:[],voiceEpoch:1,resigned:null,board:initBoard(),noCap:0,hostCaps:0,guestCaps:0,created:now()});
        tx.set(profileRef(uid),{...g.profile,activeRoom:code});tx.create(receipt,response);return response;
      })}catch(e){if(e.code!=='aborted'||attempt===4)throw e}
    }
  }
  async function online(request){
    const uid=identity(request),d=request.data||{};
    if(d.action==='create')return create(request);
    if(d.action==='profile'){shape(d,['action']);return db.runTransaction(async tx=>{const g=await guards(tx,uid);return g.profile})}
    shape(d,['action','code','matchId','move']);
    need(['join','move','finish','resign','close'].includes(d.action),'invalid-argument','عملية غير صالحة');
    need(typeof d.code==='string'&&/^[A-Z0-9]{4}$/.test(d.code),'invalid-argument','رمز غرفة غير صالح');
    if(d.action==='move')wireMove(d.move);
    return db.runTransaction(async tx=>{
      const g=await guards(tx,uid);need(g.cfg.enabled===true&&g.cfg.protocol===3,'failed-precondition','الخدمة غير مفعّلة');
      const ref=db.doc('rooms/'+d.code),snap=await tx.get(ref);need(snap.exists,'not-found','الغرفة غير موجودة');const r=snap.data();
      need(r.protocol===3,'failed-precondition','حدّث اللعبة وافتح غرفة جديدة');
      if(d.action==='join'){
        if(r.guest===uid&&r.state==='play')return {code:d.code,matchId:r.matchId,protocol:3};
        need(r.host!==uid&&r.guest==null&&r.state==='wait','failed-precondition','الغرفة ممتلئة أو مغلقة');
        if(g.profile.activeRoom){const active=await tx.get(db.doc('rooms/'+g.profile.activeRoom));need(!active.exists||!['wait','play'].includes(active.data().state),'already-exists','عندك مباراة مفتوحة')}
        const hostJob=await tx.get(jobRef(r.host));need(!hostJob.exists,'failed-precondition','المضيف غير متاح');
        tx.update(ref,{guest:uid,guestProtocol:3,guestName:String(g.user.name||'لاعب').slice(0,14),guestPhoto:null,guestRating:g.profile.rating,state:'play'});
        tx.set(profileRef(uid),{...g.profile,activeRoom:d.code});return {code:d.code,matchId:r.matchId,protocol:3};
      }
      need([r.host,r.guest].includes(uid),'permission-denied','لست عضواً في الغرفة');
      need(d.matchId===r.matchId,'failed-precondition','المباراة تغيرت');
      if(d.action==='move'){
        const e={...d.move,by:uid},old=r.moves[e.n];
        if(old){need(['n','by','from','steps','caps'].every(k=>old[k]===e[k]),'already-exists','النقلة السابقة مختلفة');return {n:e.n,result:r.result||null}}
        need(r.state==='play'&&e.n===r.moves.length&&(e.n%2===0?r.host:r.guest)===uid,'failed-precondition','مو دورك أو المباراة انتهت');
        const side=uid===r.host?1:-1,flip=side===-1,from=decode(e.from,flip)[0],steps=decode(e.steps,flip),caps=decode(e.caps,flip);
        const legal=genMoves(r.board,side).find(m=>encode([m.from])===encode([from])&&encode(m.steps)===encode(steps)&&encode(m.caps)===encode(caps));
        need(legal,'invalid-argument','النقلة غير قانونية');
        const next={...r,board:applyMove(r.board,legal,side),moves:r.moves.concat(e),noCap:legal.caps.length?0:r.noCap+1};
        next[side===1?'hostCaps':'guestCaps']+=legal.caps.length;
        const verdict=terminal(next);if(verdict)return {n:e.n,result:await settle(tx,ref,next,verdict)};
        tx.update(ref,{board:next.board,moves:next.moves,noCap:next.noCap,hostCaps:next.hostCaps,guestCaps:next.guestCaps});return {n:e.n,result:null};
      }
      if(d.action==='close'){
        if(r.state==='done')return {closed:true,result:r.result};
        // Leaving an active rated game must not erase a losing result.
        if(r.state==='play')return {closed:true,result:await settle(tx,ref,r,{winner:uid===r.host?r.guest:r.host,reason:'مغادرة المباراة'})};
        if(r.state!=='wait')return {closed:true};
        const participants=[r.host,r.guest].filter(Boolean),ps=await tx.getAll(...participants.map(profileRef));
        ps.forEach((p,i)=>{if(p.exists&&p.data().activeRoom===d.code)tx.update(profileRef(participants[i]),{activeRoom:null})});
        tx.update(ref,{state:'closed',closedBy:uid});return {closed:true};
      }
      if(r.state==='done')return {result:r.result};
      need(r.state==='play','failed-precondition','المباراة مغلقة');
      const verdict=d.action==='resign'?{winner:uid===r.host?r.guest:r.host,reason:'استسلام'}:terminal(r);
      need(verdict,'failed-precondition','المباراة للحين ما انتهت');
      return {result:await settle(tx,ref,r,verdict)};
    });
  }
  async function requestDeletion(request){
    const uid=identity(request),d=request.data;shape(d,['confirmation']);
    need(d.confirmation==='DELETE_MY_ACCOUNT','invalid-argument','تأكيد الحذف مطلوب');
    const age=now()/1000-Number(request.auth.token.auth_time);
    need(Number.isFinite(age)&&age>=-30&&age<=300,'failed-precondition','أعد تسجيل الدخول لتأكيد ملكية الحساب');
    const user=await auth.getUser(uid);need(!user.disabled&&user.email!==OWNER,'permission-denied','لا يمكن حذف هذا الحساب من اللعبة');
    return db.runTransaction(async tx=>{
      const [cfg,job]=await tx.getAll(db.doc('cfg/backend'),jobRef(uid));
      need(read(cfg)?.accountDeletion===true,'failed-precondition','حذف الحساب غير مفعّل');
      if(!job.exists)tx.create(jobRef(uid),{state:'pending',requestedAt:FieldValue.serverTimestamp()});
      return {accepted:true,state:read(job)?.state||'pending'};
    });
  }
  async function cleanDeletion(uid){
    const job=await jobRef(uid).get();if(!job.exists||job.data().state==='done')return;
    // Auth is removed first. If it fails, all player data remains for a safe retry.
    try{await auth.deleteUser(uid)}catch(e){if(e.code!=='auth/user-not-found')throw e}
    await jobRef(uid).update({state:'cleaning'});
    async function drain(query,action){while(true){const page=await query.limit(100).get();if(page.empty)return;for(const doc of page.docs)await action(doc)}}
    await drain(db.collection('names').where('uid','==',uid),doc=>db.runTransaction(async tx=>{const s=await tx.get(doc.ref);if(s.exists&&s.data().uid===uid)tx.delete(doc.ref)}));
    for(const role of ['host','guest'])await drain(db.collection('rooms').where(role,'==',uid),doc=>db.runTransaction(async tx=>{
      const s=await tx.get(doc.ref);if(!s.exists||s.data()[role]!==uid)return;const r=s.data(),other=r[role==='host'?'guest':'host'];
      const otherRef=other?profileRef(other):null,p=otherRef?await tx.get(otherRef):null;
      if(p?.exists&&p.data().activeRoom===doc.id)tx.update(otherRef,{activeRoom:null});
      const result=r.result?{...r.result,winner:r.result.winner===uid?'deleted':r.result.winner}:null;
      tx.update(doc.ref,{[role]:null,[role+'Name']:'حساب محذوف',[role+'Photo']:null,state:'closed',closedBy:'account-deleted',result,
        matchId:String(r.matchId||'').startsWith(uid+'-')?'deleted-'+doc.id:r.matchId,
        moves:(r.moves||[]).map(m=>m.by===uid?{...m,by:'deleted'}:m),messages:(r.messages||[]).filter(m=>m.by!==uid),
        vOffer:null,vAnswer:null,hIce:[],gIce:[],voiceEpoch:(r.voiceEpoch||0)+1});
    }));
    for(const field of ['by','target'])await drain(db.collection('reports').where(field,'==',uid),doc=>db.runTransaction(async tx=>{
      const s=await tx.get(doc.ref);if(!s.exists||s.data()[field]!==uid)return;
      tx.update(doc.ref,{[field]:null,[field+'Name']:'حساب محذوف',...(field==='by'?{note:''}:{})});
    }));
    await db.recursiveDelete(db.doc('users/'+uid));
    await db.recursiveDelete(profileRef(uid));
    await db.recursiveDelete(db.doc('_onlineRequests/'+uid));
    await db.doc('ctl/'+uid).delete();
    // An access-denial tombstone prevents a still-valid old token from recreating the account.
    await jobRef(uid).set({state:'done',finishedAt:FieldValue.serverTimestamp()});
  }
  return {online,requestDeletion,cleanDeletion};
}
module.exports={makeService,terminal,wireMove,award,MAX_PLIES};
