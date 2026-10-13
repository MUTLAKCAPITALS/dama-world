/* ================= v29: حسابات حقيقية — ضيف باسم تلقائي، تسجيل Google/إيميل، اسم فريد مع اقتراحات، حفظ بالسيرفر ================= */
const ACC={ready:false,anon:true,name:null,key:null,lastUp:0,upT:0,busy:false,synced:false,reloading:false,retryT:0,pendingCtx:null};
/* أساس المقارنة: editAt = وقت آخر تعديل حقيقي للتقدم، وينحفظ مع التقدم فيبقى صحيح بعد إعادة التشغيل.
   ما يتحرك وقت التشغيل ولا وقت ما يكون الحساب مو متزامن مع السيرفر. (الحفظات القديمة بدون editAt: نستخدم savedAt) */
const ACC_KEY=(window.DAMA_AUTH&&window.DAMA_AUTH.saveKey)||'damaworld.v1',ACC_PEND='acc.pendingRestore';
/* ترحيل الحفظ القديم (قبل editAt): نثبّت الأساس من savedAt الأصلي الحين — قبل أي حفظ أثناء التشغيل —
   ونكتبه بالتخزين فوراً عشان يصمد لو انعادت الصفحة قبل ما نقرأ السيرفر */
ACC.bootLocalAt=(()=>{let v=null,raw=null;try{raw=localStorage.getItem(ACC_KEY);v=raw?JSON.parse(raw):null}catch(e){v=null}
  if(!v)return 0;
  if(v.editAt==null){v.editAt=+v.savedAt||0;try{localStorage.setItem(ACC_KEY,JSON.stringify(v))}catch(e){}}
  return +v.editAt||0})();
if(S.editAt==null)S.editAt=ACC.bootLocalAt;
/* بصمة محتوى التقدم بدون الحقول المتغيرة — عشان نفرّق بين "حفظ بدون تغيير" و"تعديل حقيقي" */
function accFp(){const a=S.savedAt,b=S.editAt,c=S.unsyncedDirty;S.savedAt=0;S.editAt=0;delete S.unsyncedDirty;let js='';try{js=JSON.stringify(S)}catch(e){}S.savedAt=a;S.editAt=b;if(c)S.unsyncedDirty=c;return js}
ACC.lastFp=accFp();
/* سياق "استرجاع حساب موجود" ينحفظ بالتخزين عشان يصمد لو انعادت الصفحة قبل ما نقرأ السيرفر */
function accPendGet(){try{return localStorage.getItem(ACC_PEND)}catch(e){return null}}
function accPendSet(uid){try{if(uid)localStorage.setItem(ACC_PEND,uid);else localStorage.removeItem(ACC_PEND)}catch(e){}}
(function(){const css=`
.acc .dlg{text-align:center;max-width:360px}
.acc input.ain{width:100%;font:600 16px var(--f-body);padding:10px 12px;border-radius:12px;border:1.5px solid #b98a3e;background:rgba(0,0,0,.35);color:#fff6e2;margin:5px 0;text-align:center}
.acc input.ain:focus{outline:none;border-color:#ffd98a;box-shadow:0 0 0 3px rgba(255,200,110,.25)}
.acc .st{min-height:20px;font-size:13px;margin:2px 0 6px}.acc .st.ok{color:#7be0a2}.acc .st.bad{color:#ff9a8a}
.acc .sug{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:4px 0 8px}
.acc .sug button{padding:6px 12px;border-radius:16px;border:1px solid #d9a54c;background:rgba(255,200,110,.12);color:#ffe3a6;font:600 13px var(--f-body)}
.acc .row{flex-wrap:wrap;justify-content:center}.acc .muted{opacity:.8;font-size:13px}
.acc .gbt{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:6px 0;padding:11px;border-radius:12px;border:0;font:700 15px var(--f-body);background:#fff;color:#222}
.acc .gbt.em{background:rgba(255,255,255,.08);color:#fff1d2;border:1px solid rgba(255,214,140,.4)}
.acc .lnk{background:none;border:0;color:#ffd98a;font:600 13px var(--f-body);text-decoration:underline;padding:4px}
#accBan{position:fixed;z-index:60;padding:6px 12px;border-radius:14px;border:1px solid #e2b04a;background:rgba(30,18,8,.82);color:#ffe3a6;font:700 12px var(--f-body);box-shadow:0 0 12px rgba(255,190,90,.35);pointer-events:auto;cursor:pointer}
`;const s=document.createElement('style');s.textContent=css;document.head.appendChild(s)})();
const G_SVG='<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"/></svg>';
/* مفتاح الاسم: ما يفرق بين كبير وصغير ولا المسافات والتشكيل */
function accKey(n){return(n||'').toLowerCase().replace(/[ً-ٟـ]/g,'').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s_.\-]+/g,'').replace(/\//g,'')}
function accValid(n){n=(n||'').trim();if(n.length<3)return'الاسم لازم 3 حروف أو أكثر';if(n.length>14)return'الاسم لازم 14 حرف أو أقل';
  if(!/^[؀-ۿa-zA-Z0-9 _.\-]+$/.test(n))return'حروف عربي أو إنجليزي وأرقام بس';if(BADW.some(w=>accKey(n).includes(accKey(w))))return'هذا الاسم غير مسموح';if(/^ضيف/.test(n))return'اختر اسم غير "ضيف"';return''}
function accErr(e){const c=(e&&e.code)||'';return({'auth/email-already-in-use':'هذا الإيميل مسجّل — اضغط "دخول"','auth/invalid-email':'الإيميل غير صحيح','auth/weak-password':'الباسوورد لازم 6 حروف أو أكثر',
  'auth/wrong-password':'الباسوورد غلط','auth/invalid-credential':'الإيميل أو الباسوورد غلط','auth/user-not-found':'ما فيه حساب بهالإيميل','auth/popup-closed-by-user':'سكّرت نافذة Google',
  'auth/unauthorized-domain':'رابط اللعبة مو مضاف بإعدادات Firebase','auth/operation-not-allowed':'هالطريقة مو مفعّلة بإعدادات Firebase','auth/network-request-failed':'ما فيه اتصال بالسيرفر','auth/too-many-requests':'محاولات كثيرة، جرّب بعد شوي'})[c]||onlErr(e)}

/* ---------- بداية التشغيل ---------- */
async function accBoot(){if(window.DAMA_AUTH&&window.DAMA_AUTH.guest){ACC.ready=true;ACC.anon=true;ACC.synced=false;
    if(!S.guestName)S.guestName='ضيف_'+(1000+Math.floor(Math.random()*9000));S.name=ACC.name=S.guestName;
    accRaw();accUI();window.DAMA_AUTH.syncResult('guest');return 'guest'}
  try{await onlInit()}catch(e){if(window.DAMA_AUTH)throw e;return}const u=ONL.auth.currentUser;if(window.DAMA_AUTH&&(!u||u.isAnonymous||u.uid!==window.DAMA_AUTH.uid)){window.DAMA_AUTH.syncResult('skip');return 'skip'}ACC.anon=!!u.isAnonymous;
  if(ACC.anon){if(!S.guestName)S.guestName='ضيف_'+(1000+Math.floor(Math.random()*9000));if(S.name!==S.guestName){if(!/^ضيف/.test(S.name||''))S.wantName=S.name;S.name=S.guestName}ACC.name=S.name;ACC.ready=true;
    if(S.unsyncedDirty){delete S.unsyncedDirty;S.editAt=Date.now()}accRaw();accUI();return}
  ACC.ready=true;ACC.name=S.name;accUI();return await accSync({uid:u.uid})}
/* نقرأ حفظ الحساب من السيرفر نفسه (مو من الكاش)، ونقارنه بأساس المقارنة المحلي.
   ما نفتح باب الرفع قبل ما تنجح القراءة. لو فشلت: التقدم المحلي يبقى، وما نكتب شي، ونعيد المحاولة بنفس السياق. */
async function accSync(ctx){const r=await accSync0(ctx);ACC.lastSync=r;if(window.DAMA_AUTH)window.DAMA_AUTH.syncResult(r);return r}
async function accSync0(ctx){clearTimeout(ACC.retryT);ctx=ctx||ACC.pendingCtx||{};const u=ONL.auth.currentUser;
  if(!u||u.isAnonymous)return 'skip';if(ctx.uid&&ctx.uid!==u.uid){ACC.pendingCtx=null;return 'skip'}
  const uid=u.uid,restore=!!ctx.restore||accPendGet()===uid;ACC.synced=false;ACC.pendingCtx={uid,restore,retryMs:ctx.retryMs};
  let snap=null;try{snap=await ONL.db.collection('users').doc(uid).get({source:'server'})}catch(e){snap=null}
  if(!snap||(snap.metadata&&snap.metadata.fromCache)){ACC.retryT=setTimeout(()=>accSync(ACC.pendingCtx),ctx.retryMs||30000);return 'fail'}
  if(!ONL.auth.currentUser||ONL.auth.currentUser.uid!==uid)return 'skip';
  ACC.pendingCtx=null;
  const d=snap.exists?snap.data():null,cloudAt=+(d&&d.saveAt)||0;
  /* حساب موجود رجعنا له: حفظ السيرفر هو الأساس دايماً. غير كذا: الأحدث يفوز */
  if(d&&d.save&&(restore||cloudAt>ACC.bootLocalAt))return accAdopt(d.save,cloudAt)?'cloud':'adopt-fail';
  accPendSet(null);
  if(d&&d.nameKey){ACC.name=d.name;ACC.key=d.nameKey;if(S.name!==d.name){S.name=d.name;accRaw()}}else{ACC.name=S.name;if(!window.DAMA_AUTH||window.DAMA_AUTH.entered)setTimeout(()=>accNameDlg(true,S.wantName),600)}
  /* المحلي هو الأحدث: التعديلات اللي صارت وقت عدم التزامن تنحسب الحين */
  if(S.unsyncedDirty){delete S.unsyncedDirty;S.editAt=Date.now();accRaw()}
  ACC.synced=true;accUI();accUpload(true);return 'local'}
/* نعتمد حفظ السيرفر: ما نسجّل نجاح ولا نعيد التحميل إلا بعد ما تنكتب النسخة الصحيحة فعلاً */
function accAdopt(js,cloudAt){let sv;try{sv=JSON.parse(js)}catch(e){ACC.synced=false;toast('حفظك بالسيرفر فيه مشكلة — ما لمسنا شي');return false}
  if(sessionStorage.getItem('accLoadedAt')===String(cloudAt)){ACC.synced=false;toast('ما قدرنا نرجّع حفظك — تقدمك بالسيرفر سليم');return false}
  sv.editAt=cloudAt;delete sv.unsyncedDirty;const out=JSON.stringify(sv);ACC.reloading=true;
  try{localStorage.setItem(ACC_KEY,out);if(localStorage.getItem(ACC_KEY)!==out)throw new Error('verify')}
  catch(e){ACC.reloading=false;ACC.synced=false;
    toast(e&&(e.name==='QuotaExceededError'||e.code===22)?'مساحة التخزين بالجوال ممتلئة — ما قدرنا نرجّع حفظك. تقدمك بالسيرفر سليم':'ما قدرنا نرجّع حفظك — تقدمك بالسيرفر سليم',5000);return false}
  accPendSet(null);try{sessionStorage.setItem('accLoadedAt',String(cloudAt))}catch(e){}
  if(!window.__accNoReload)location.reload();return true}
function accRaw(){if(ACC.reloading)return;try{S.savedAt=Date.now();localStorage.setItem(ACC_KEY,JSON.stringify(S))}catch(e){}try{updateProfile()}catch(e){}}
/* ---------- الحفظ بالسيرفر (كل 20 ثانية كحد أقصى) — بس بعد ما يتأكد التزامن ---------- */
function accUpload(now){if(!ACC.ready||ACC.anon||!ACC.synced||ACC.reloading||!ONL.user)return;if(window.DAMA_AUTH&&(!ONL.auth.currentUser||ONL.auth.currentUser.uid!==window.DAMA_AUTH.uid||ONL.user.uid!==window.DAMA_AUTH.uid))return;const t=Date.now();clearTimeout(ACC.upT);
  if(!now&&t-ACC.lastUp<20000){ACC.upT=setTimeout(()=>accUpload(true),20000-(t-ACC.lastUp));return}ACC.lastUp=t;
  if(!S.editAt)S.editAt=S.savedAt||t;
  const sv=Object.assign({},S);let js=JSON.stringify(sv);if(js.length>700000){delete sv.replays;js=JSON.stringify(sv)}
  ONL.db.collection('users').doc(ONL.user.uid).set({name:S.name,nameKey:ACC.key||null,photo:S.avatarImg||null,lvl:(typeof level==='function'?level():1),rating:S.rating||1000,wins:S.wins||0,save:js,saveAt:S.editAt,seen:t},{merge:true}).catch(()=>{})}
document.addEventListener('visibilitychange',()=>{if(document.hidden)accUpload(true)});
/* تعديل حقيقي؟ نحرّك editAt بس لو المحتوى تغيّر والحساب متزامن (أو ضيف). غير كذا نعلّم إن فيه تعديل معلّق */
function accMark(){const fp=accFp();if(fp===ACC.lastFp)return;ACC.lastFp=fp;
  if(ACC.ready&&(ACC.anon||ACC.synced))S.editAt=Date.now();else S.unsyncedDirty=true}
/* أي تغيير للاسم من أي مكان يمر من هنا */
const _persist29=persist;persist=function(){if(ACC.reloading)return;if(ACC.ready&&ACC.name&&S.name!==ACC.name){const want=S.name;S.name=ACC.name;_persist29.apply(this,arguments);try{updateProfile()}catch(e){}setTimeout(()=>{if(ACC.anon){S.wantName=want;accLoginDlg('عشان تختار اسمك لازم تسجّل — وتقدمك ينحفظ معك')}else accNameDlg(false,want)},300);return}
  accMark();S.savedAt=Date.now();_persist29.apply(this,arguments);accUpload(false)};

/* ---------- نافذة التسجيل ---------- */
function accDlg(inner,acts,onClose){showLayer('<div class="scrim acc" data-x="1"><div class="card dlg">'+inner+'</div></div>',acts,onClose)}
function accLoginDlg(why){if(window.DAMA_AUTH&&window.DAMA_AUTH.guest)return window.DAMA_AUTH.openAccount();accDlg('<span class="tag">حسابك</span><h3>سجّل واحفظ تقدمك</h3><p class="muted">'+esc(why||'تقدمك ينحفظ بالسيرفر وتقدر تدخل من أي جوال')+'</p>'+
  '<button class="gbt" data-a="g">'+G_SVG+'متابعة بـ Google</button><button class="gbt em" data-a="em">✉️ بالإيميل والباسوورد</button><button class="lnk" data-a="x">بعدين</button>',
  {g:()=>accGoogle(),em:()=>accEmailDlg(),x:()=>closeLayer()})}
function accEmailDlg(err){accDlg('<span class="tag">بالإيميل</span><h3>تسجيل أو دخول</h3><input class="ain" id="aE" type="email" placeholder="الإيميل" autocomplete="email" dir="ltr"><input class="ain" id="aP" type="password" placeholder="الباسوورد (6 حروف أو أكثر)" autocomplete="current-password" dir="ltr"><div class="st bad" id="aS">'+esc(err||'')+'</div>'+
  '<div class="row"><button class="pbtn" data-a="reg">حساب جديد</button><button class="gbtn" data-a="in">دخول</button></div><button class="lnk" data-a="fg">نسيت الباسوورد؟</button> <button class="lnk" data-a="b">رجوع</button>',
  {reg:()=>accEmail(true),in:()=>accEmail(false),fg:()=>accForgot(),b:()=>accLoginDlg()})}
const accVals=()=>[($('#aE')&&$('#aE').value||'').trim(),($('#aP')&&$('#aP').value)||''];
const accSay=(t,ok)=>{const s=$('#aS');if(s){s.textContent=t;s.className='st '+(ok?'ok':'bad')}};
async function accGoogle(){try{await onlInit();const p=new firebase.auth.GoogleAuthProvider();let switched=false;
    try{if(ONL.auth.currentUser&&ONL.auth.currentUser.isAnonymous)await ONL.auth.currentUser.linkWithPopup(p);else await ONL.auth.signInWithPopup(p)}
    catch(e){if(e.code==='auth/credential-already-in-use'&&e.credential){await ONL.auth.signInWithCredential(e.credential);switched=true}else throw e}
    await accAfterLogin(switched)}catch(e){closeLayer();toast(accErr(e))}}
async function accEmail(isNew){const[em,pw]=accVals();if(!em||!pw){accSay('اكتب الإيميل والباسوورد');return}accSay('…',true);
  try{await onlInit();let switched=false;
    if(isNew){const cr=firebase.auth.EmailAuthProvider.credential(em,pw);if(ONL.auth.currentUser&&ONL.auth.currentUser.isAnonymous)await ONL.auth.currentUser.linkWithCredential(cr);else await ONL.auth.createUserWithEmailAndPassword(em,pw)}
    else{await ONL.auth.signInWithEmailAndPassword(em,pw);switched=true}
    await accAfterLogin(switched)}catch(e){accSay(accErr(e))}}
async function accForgot(){const[em]=accVals();if(!em){accSay('اكتب إيميلك فوق أول');return}try{await ONL.auth.sendPasswordResetEmail(em);accSay('أرسلنا لك رابط بإيميلك ✅',true)}catch(e){accSay(accErr(e))}}
/* بعد الدخول: حساب موجود ← نجيب تقدمه، حساب جديد ← نختار الاسم */
async function accAfterLogin(switched){const u=ONL.user=ONL.auth.currentUser;ACC.anon=false;ACC.synced=false;
  /* رجع لحساب موجود: نحفظ السياق (بالـuid) عشان أي إعادة محاولة أو إعادة تحميل ما ترفع بيانات الضيف فوق الحساب */
  if(switched)accPendSet(u.uid);
  const r=await accSync({uid:u.uid,restore:!!switched,retryMs:5000});
  if(r==='fail'){closeLayer();toast('دخلت ✅ بس ما قدرنا نقرأ حفظك الحين — بنحاول مرة ثانية');return}
  if(r==='cloud'){closeLayer();toast('أهلاً! نرجّع حسابك…');return}
  if(r==='adopt-fail'){closeLayer();return}
  if(r==='local'){if(ACC.key){closeLayer();toast('تم تسجيل الدخول ✅')}else toast('تم ✅ تقدمك محفوظ بحسابك')}}
/* ---------- اختيار الاسم مع فحص مباشر واقتراحات ---------- */
let accCk=0;
function accNameDlg(first,pref){accDlg('<span class="tag">'+(first?'خطوة أخيرة':'تغيير الاسم')+'</span><h3>اختر اسمك</h3><p class="muted">الاسم يكون لك بروحك — ما يقدر أحد ثاني ياخذه</p><input class="ain" id="aN" maxlength="14" autocomplete="off" value="'+esc(pref&&!/^ضيف/.test(pref)?pref:'')+'" placeholder="مثال: بو ناصر"><div class="st" id="aS"></div><div class="sug" id="aG"></div>'+
  '<div class="row"><button class="pbtn" data-a="ok" id="aOk" disabled>اعتمد الاسم</button>'+(first?'':'<button class="gbtn" data-a="x">إلغاء</button>')+'</div>',
  {ok:()=>accClaim(($('#aN').value||'').trim()),x:()=>closeLayer()},first?()=>{if(!ACC.key)setTimeout(()=>accNameDlg(true),200)}:null);
  const i=$('#aN');i.addEventListener('input',()=>{clearTimeout(accCk);accCk=setTimeout(accCheck,380)});document.getElementById('aG').onclick=e=>{const b=e.target.closest('button[data-n]');if(b){i.value=b.dataset.n;accCheck()}};if(i.value)accCheck();setTimeout(()=>i.focus(),60)}
async function accFree(n){const k=accKey(n);if(!k)return false;try{const d=await ONL.db.collection('names').doc(k).get();return !d.exists||d.data().uid===ONL.user.uid}catch(e){return false}}
function accSugs(n){const b=n.trim().slice(0,10),r=()=>Math.floor(Math.random()*90+10);const ar=/[؀-ۿ]/.test(b);
  const f=(x,suf)=>x.slice(0,14-suf.length)+suf;return[f(b,' '+r()),f(b,ar?' الكويتي':'_kw'),f(b,'_965'),(ar?'ال':'the_')+b,f(b,ar?' الذهبي':'_gold'),f(b,''+r()+r())].map(x=>x.slice(0,14)).filter((x,i,a)=>!accValid(x)&&a.indexOf(x)===i)}
async function accCheck(){const i=$('#aN'),ok=$('#aOk'),G=$('#aG');if(!i)return;const n=i.value.trim();G.innerHTML='';ok.disabled=true;
  const v=accValid(n);if(v){accSay(n?v:'');return}accSay('نشيك…',true);const mine=n;
  const free=await accFree(n);if(($('#aN')||{}).value!==undefined&&$('#aN').value.trim()!==mine)return;
  if(free){accSay('✅ الاسم متاح',true);ok.disabled=false;return}
  accSay('❌ هذا الاسم مستخدم — اختر اسم ثاني');const c=accSugs(n),av=[];for(const x of c){if(av.length>=3)break;if(await accFree(x))av.push(x)}
  G.innerHTML=av.map(x=>'<button data-n="'+esc(x)+'">'+esc(x)+'</button>').join('')}
async function accClaim(n){const v=accValid(n);if(v){accSay(v);return}const k=accKey(n),uid=ONL.user.uid,db=ONL.db,old=ACC.key;$('#aOk').disabled=true;accSay('نحجز الاسم…',true);
  try{await db.runTransaction(async tx=>{const ref=db.collection('names').doc(k),d=await tx.get(ref);if(d.exists&&d.data().uid!==uid)throw{code:'taken'};
      tx.set(ref,{uid,name:n,at:Date.now()});if(old&&old!==k)tx.delete(db.collection('names').doc(old));
      tx.set(db.collection('users').doc(uid),{name:n,nameKey:k},{merge:true})});
    ACC.key=k;ACC.name=n;S.name=n;delete S.wantName;accRaw();accUpload(true);closeLayer();toast('أهلاً '+n+' 🎉 الاسم صار لك');accUI()}
  catch(e){if(e&&e.code==='taken'){accSay('❌ أحد سبقك عليه — اختر اسم ثاني');accCheck()}else accSay(accErr(e))}}
/* ---------- حسابي: الحالة، تغيير الاسم، خروج، حذف ---------- */
function accMenu(){if(!ACC.ready){toast('الحسابات تشتغل من رابط اللعبة الخاص');return}if(ACC.anon)return accLoginDlg();
  const u=ONL.auth.currentUser,how=(u.providerData&&u.providerData[0]&&u.providerData[0].providerId)==='google.com'?'Google':'الإيميل';
  accDlg('<span class="tag">حسابي</span><h3>'+esc(S.name)+'</h3><p class="muted">مسجّل بـ '+how+(u.email?' · <span dir="ltr">'+esc(u.email)+'</span>':'')+'<br>تقدمك محفوظ بالسيرفر ✅</p>'+
    '<div class="row"><button class="pbtn" data-a="nm">✏️ تغيير الاسم</button><button class="gbtn" data-a="out">تسجيل خروج</button></div><button class="lnk" data-a="del" style="color:#ff9a8a">حذف الحساب نهائياً</button>',
    {nm:()=>accNameDlg(false,S.name),out:()=>accSignOut(),del:()=>accDelDlg()})}
async function accSignOut(){accUpload(true);try{await ONL.auth.signOut()}catch(e){}try{localStorage.removeItem('damaworld.v1');sessionStorage.removeItem('accLoadedAt');localStorage.removeItem(ACC_PEND)}catch(e){}toast('سجّلت خروج');setTimeout(()=>location.reload(),600)}
function accDelDlg(){accDlg('<span class="tag" style="color:#ff9a8a">تحذير</span><h3>حذف الحساب؟</h3><p class="muted">بينحذف حسابك واسمك وكل تقدمك نهائياً، وما نقدر نرجّعه.</p><div class="row"><button class="gbtn danger" data-a="y">احذف نهائياً</button><button class="pbtn" data-a="n">لا، رجوع</button></div>',{y:()=>accDelete(),n:()=>accMenu()})}
async function accDelete(){const u=ONL.auth.currentUser,db=ONL.db;try{if(ACC.key)await db.collection('names').doc(ACC.key).delete();await db.collection('users').doc(u.uid).delete();await u.delete();
    localStorage.removeItem('damaworld.v1');toast('انحذف حسابك');setTimeout(()=>location.reload(),800)}
  catch(e){if(e.code==='auth/requires-recent-login')toast('لأمانك: سجّل خروج وادخل من جديد، وبعدها احذف');else toast(accErr(e))}}
/* ---------- مداخل الواجهة ---------- */
function accUI(){let b=$('#accBan');const lb=$('#lbProf');if(!ACC.ready||!ACC.anon||!lb||mode!=='lobby'||document.querySelector('.scrim')){if(b)b.remove();return}
  if(!b){b=document.createElement('button');b.id='accBan';b.textContent='💾 سجّل واحفظ تقدمك';b.onclick=e=>{e.stopPropagation();accLoginDlg()};document.body.appendChild(b)}
  const r=lb.getBoundingClientRect();b.style.left=(r.right+6)+'px';b.style.top=(r.top+r.height/2-14)+'px'}
setInterval(accUI,1500);
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#hud #prof')){e.preventDefault();accMenu()}},true);
/* زر الحساب بالأونلاين بدال زر Google القديم */
const _onlGoogle29=onlGoogle;onlGoogle=function(){return accLoginDlg()};
if(!window.DAMA_AUTH)setTimeout(accBoot,800);

