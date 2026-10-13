// Behavioral checks for the actual entry module. No network, Firebase project or browser credentials.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'auth_start.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const account = fs.readFileSync(path.join(root,'dev/v29_account.js'),'utf8');
function accountFunction(name){const m=new RegExp('(?:async )?function '+name+'\\s*\\(').exec(account);assert(m);for(let e=account.indexOf('}',m.index);e>=0;e=account.indexOf('}',e+1)){const s=account.slice(m.index,e+1);try{new vm.Script('('+s+')');return s}catch{}}throw Error(name)}
const accountProgram=account.slice(account.indexOf('const ACC='),account.indexOf('(function(){const css='))+'\n'+
  ['accBoot','accSync','accSync0','accAdopt','accRaw','accBytes','accBackup','accSaveStatus','accUpload'].map(accountFunction).join('\n')+'\nwindow.DAMA_AUTH.attach({retry:accBoot,enter:window.testHooks.enter});';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i=0;i<12;i++) await tick(); }

function make(options={}) {
  const disk = options.disk || new Map([['damaworld.v1', JSON.stringify({coins:150,savedAt:10000})]]);
  const calls = [], timers = new Map(), nodes = new Map();
  let ctx, authChanged, authFailed, timer=0, enters=0, gameLoads=0, reloads=0;
  let failStorage=!!options.failStorage;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const handlers = {}, classes = new Set();
    const el={id,hidden:false,disabled:false,value:'',dataset:{},textContent:'',required:true,
      classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},
      setAttribute(k,v){this[k]=v},addEventListener(k,f){handlers[k]=f},remove(){},
      reportValidity:()=>true,querySelectorAll:()=>['authEmail','authPassword','authGoogle','authSwitch','authForgot','authSubmit','authGuest'].map(node),
      fire:async k=>{if(handlers[k])return handlers[k]({preventDefault(){}})}};
    nodes.set(id,el);return el;
  }
  const auth = {
    currentUser: options.user || null,
    onAuthStateChanged(ok,fail){authChanged=ok;authFailed=fail;if(!options.deferRestore)queueMicrotask(()=>ok(auth.currentUser));return()=>{}},
    async setPersistence(value){calls.push(['persistence',value])},
    async signInWithEmailAndPassword(email,pass){calls.push(['login',email]);if(options.authError)throw{code:options.authError};auth.currentUser={uid:'existing',isAnonymous:false}},
    async createUserWithEmailAndPassword(email,pass){calls.push(['register',email]);auth.currentUser={uid:'new-user',isAnonymous:false}},
    async signInWithPopup(){calls.push(['google']);if(options.authError)throw{code:options.authError};auth.currentUser={uid:'google-user',isAnonymous:false}},
    async signInWithCredential(){calls.push(['credential']);auth.currentUser={uid:'existing-google',isAnonymous:false}},
    async sendPasswordResetEmail(email){calls.push(['reset',email])}
  };
  if(auth.currentUser?.isAnonymous){
    auth.currentUser.linkWithCredential=async()=>{calls.push(['link-email']);auth.currentUser={uid:auth.currentUser.uid,isAnonymous:false}};
    auth.currentUser.linkWithPopup=async()=>{calls.push(['link-google']);if(options.linkCollision)throw{code:'auth/credential-already-in-use',credential:{}};auth.currentUser={uid:auth.currentUser.uid,isAnonymous:false}};
  }
  const authFn=()=>auth;
  authFn.Auth={Persistence:{LOCAL:'local'}};
  authFn.GoogleAuthProvider=function(){};
  authFn.EmailAuthProvider={credential:(email,pass)=>({email,pass})};
  const firebase={apps:[{}],auth:authFn,firestore:()=>({})};
  const deps=[{dataset:{gameSrc:'test-three.js'}},{dataset:{gameSrc:'test-pass.js'}}];
  const hooks={retry:async()=>{calls.push(['sync']);ctx.DAMA_AUTH.syncResult(ctx.DAMA_AUTH.guest?'guest':options.syncResult||'local')},
    enter:async()=>{enters++;if(options.enterError)throw Error('WebGL')},afterEnter:()=>calls.push(['afterEnter'])};
  node('damaGameSource').textContent=options.actualAccount?accountProgram:options.gameError?'throw new Error("WebGL");':'window.DAMA_AUTH.attach(window.testHooks);';
  const cloud=options.cloud||{name:'MASTER',nameKey:'master',saveAt:20000,save:JSON.stringify({name:'MASTER',coins:900,savedAt:20000})};
  const session=options.session||new Map();
  ctx=vm.createContext({console,firebase,testHooks:hooks,Map,Promise,Error,Object,
    localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>{if(failStorage)throw Error('quota');disk.set(k,v)},removeItem:k=>disk.delete(k)},
    document:{getElementById:node,querySelectorAll:()=>deps,createElement:()=>node('script-'+(++timer)),
      body:{classList:{remove:()=>{}}},head:{appendChild(el){if(el.src){calls.push(['dependency',el.src]);queueMicrotask(()=>el.onload?.())}else{gameLoads++;if(options.actualAccount||ctx.DAMA_AUTH.guest)ctx.S=JSON.parse(disk.get(ctx.DAMA_AUTH.saveKey)||'{"name":"ضيف","coins":150}');try{vm.runInContext(el.textContent,ctx)}catch{}}}}},
    location:{reload(){reloads++}},
    S:JSON.parse(disk.get('damaworld.v1')||'{}'),Date,
    ONL:{user:auth.currentUser,auth,db:{runTransaction:async callback=>callback({get:ref=>ref.get(),set:(ref,data)=>ref.set(data)}),collection:()=>({doc:()=>({get:async()=>{calls.push(['cloud-read']);if(options.syncResult==='fail')throw Error('offline');return{exists:true,metadata:{fromCache:false},data:()=>cloud}},set:async data=>{calls.push(['cloud-write']);Object.assign(cloud,data)}})})}},
    onlInit:async()=>{calls.push(['onl-init']);ctx.ONL.user=auth.currentUser},accUI(){},updateProfile(){},toast(){},accNameDlg(){calls.push(['name-dialog'])},level:()=>1,
    sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},
    setTimeout:(f,ms)=>{timers.set(++timer,{f,ms});return timer},clearTimeout:id=>timers.delete(id)});
  ctx.window=ctx;
  vm.runInContext(source,ctx);
  return {ctx,node,auth,calls,disk,timers,hooks,cloud,
    restore:()=>authChanged(auth.currentUser),failRestore:()=>authFailed(Error('offline')),
    setStorageFail:v=>{failStorage=v},
    stats:()=>({enters,gameLoads,reloads,state:node('authGate').dataset.state,entered:ctx.DAMA_AUTH.entered}),
    click:async id=>{await node(id).fire('click');await settle()},
    submit:async()=>{node('authEmail').value='player@example.test';node('authPassword').value='test-only-password';await node('authForm').fire('submit');await settle()}};
}
let count=0;
async function test(name,fn){await fn();console.log('PASS',name);count++}
(async()=>{
  await test('HTML defers every game dependency and the game source',async()=>{
    const game=html.match(/<script id="damaGameSource" type="application\/x-dama-game">([\s\S]*?)<\/script>/);assert(game);new vm.Script(game[1]);new vm.Script(source);
    assert.equal((html.match(/data-game-src=/g)||[]).length,10);
    assert.equal((html.match(/<script src=/g)||[]).length,1);
    assert(html.includes('<body class="auth-pending">'));
    assert(!html.includes("document.body.classList.add('auth-pending')"));
    assert(game[1].includes('window.DAMA_AUTH.attach('));
  });
  await test('visitor gets sign-in; no game code or guest account is started',async()=>{
    const w=make();await settle();assert.equal(w.stats().state,'login');assert.equal(w.stats().gameLoads,0);assert.equal(w.stats().enters,0);
    assert(!w.calls.some(c=>c[0]==='dependency'));assert.equal(w.disk.get('damaworld.v1'),JSON.stringify({coins:150,savedAt:10000}));
  });
  await test('Firebase restore must finish before choosing login or auto-entry',async()=>{
    const w=make({user:{uid:'returning'},deferRestore:true});await settle();assert.equal(w.stats().state,'loading');assert.equal(w.stats().gameLoads,0);
    w.restore();await settle();assert.equal(w.stats().entered,true);assert.equal(w.stats().enters,1);
  });
  await test('restored guest still sees sign-in and keeps its local progress',async()=>{
    const w=make({user:{uid:'guest',isAnonymous:true}});await settle();assert.equal(w.stats().state,'login');assert.equal(w.stats().gameLoads,0);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,150);
  });
  await test('returning real account enters automatically exactly once after sync',async()=>{
    const w=make({user:{uid:'returning'}});await settle();assert.equal(w.stats().entered,true);assert.equal(w.stats().gameLoads,1);assert.equal(w.stats().enters,1);assert(w.node('authGate').hidden);
    w.ctx.DAMA_AUTH.syncResult('local');await settle();assert.equal(w.stats().enters,1);assert.equal(w.disk.get('acc.pendingRestore'),undefined);
  });
  await test('existing email login pins restore UID before loading game',async()=>{
    const w=make();await settle();await w.submit();assert.equal(w.disk.get('acc.pendingRestore'),'existing');assert.equal(w.stats().entered,true);assert.equal(w.node('authPassword').value,'');
    assert(!Array.from(w.disk.values()).some(v=>String(v).includes('test-only-password')));
  });
  await test('new account retains guest progress and links the guest identity',async()=>{
    const w=make({user:{uid:'guest',isAnonymous:true}});await settle();await w.click('authSwitch');await w.submit();assert(w.calls.some(c=>c[0]==='link-email'));assert.equal(w.disk.get('acc.pendingRestore'),undefined);assert.equal(w.stats().entered,true);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,150);
  });
  await test('Google existing-account collision restores the actual resulting UID',async()=>{
    const w=make({user:{uid:'guest',isAnonymous:true},linkCollision:true});await settle();await w.click('authGoogle');assert.equal(w.disk.get('acc.pendingRestore'),'existing-google');assert(w.calls.some(c=>c[0]==='credential'));assert.equal(w.stats().entered,true);
  });
  await test('wrong password restores the form without launching the game',async()=>{
    const w=make({authError:'auth/invalid-credential'});await settle();await w.submit();assert.equal(w.stats().state,'login');assert.equal(w.stats().gameLoads,0);assert.equal(w.node('authSubmit').disabled,false);assert(w.node('authFormStatus').textContent.includes('غير صحيحة'));assert.equal(w.disk.get('dama.auth.intent'),undefined);
  });
  await test('reset password stays at sign-in and never starts the game',async()=>{
    const w=make();await settle();await w.click('authForgot');await w.submit();assert(w.calls.some(c=>c[0]==='reset'));assert.equal(w.node('authPassword').required,false);assert.equal(w.stats().gameLoads,0);
  });
  await test('failed server read blocks entry; automatic recovery opens once',async()=>{
    const w=make({user:{uid:'returning'},syncResult:'fail'});await settle();assert.equal(w.stats().state,'error');assert.equal(w.stats().enters,0);assert.equal(w.node('authRetry').hidden,false);
    w.ctx.DAMA_AUTH.syncResult('local');await settle();assert.equal(w.stats().entered,true);assert.equal(w.stats().enters,1);
  });
  await test('cloud adoption waits for verified save and reload, never opens stale game',async()=>{
    const w=make({user:{uid:'returning'},syncResult:'cloud'});await settle();assert.equal(w.stats().enters,0);assert.equal(w.stats().state,'loading');
    w.ctx.DAMA_AUTH.syncResult('adopt-fail');assert.equal(w.stats().state,'error');assert.equal(w.stats().enters,0);
  });
  await test('storage failure blocks account switching before auth request',async()=>{
    const w=make({failStorage:true});await settle();await w.submit();assert(!w.calls.some(c=>c[0]==='login'));assert.equal(w.stats().gameLoads,0);
  });
  await test('sign-in intent survives reload before account handoff',async()=>{
    const disk=new Map([['dama.auth.intent','restore'],['damaworld.v1','{"coins":150}']]);const w=make({user:{uid:'existing'},disk});await settle();assert.equal(disk.get('acc.pendingRestore'),'existing');assert.equal(disk.get('dama.auth.intent'),undefined);
  });
  await test('sign-out then reload shows the login form instead of auto-entering',async()=>{
    const disk=new Map();const first=make({user:{uid:'returning'},disk});await settle();assert.equal(first.stats().entered,true);
    const next=make({user:null,disk});await settle();assert.equal(next.stats().state,'login');assert.equal(next.stats().gameLoads,0);
  });
  await test('graphics failure gives a retry that reloads without duplicate game scripts',async()=>{
    const w=make({user:{uid:'returning'},gameError:true});await settle();assert.equal(w.stats().state,'error');await w.click('authRetry');assert.equal(w.stats().reloads,1);assert.equal(w.stats().gameLoads,1);
  });
  await test('auth restore timeout exposes retry, no anonymous fallback',async()=>{
    const w=make({deferRestore:true});await settle();Array.from(w.timers.values()).find(t=>t.ms===15000).f();await settle();assert.equal(w.stats().state,'error');assert.equal(w.stats().gameLoads,0);
  });
  await test('actual account code adopts cloud 900, then next page automatically enters with 900',async()=>{
    const disk=new Map([['damaworld.v1',JSON.stringify({name:'MASTER',coins:150,savedAt:10000})]]);
    const first=make({actualAccount:true,user:{uid:'returning'},disk});await settle();assert.equal(first.stats().enters,0);assert.equal(first.stats().reloads,1);assert.equal(JSON.parse(disk.get('damaworld.v1')).coins,900);assert(!first.calls.some(c=>c[0]==='cloud-write'));
    const next=make({actualAccount:true,user:{uid:'returning'},disk,cloud:first.cloud});await settle();assert.equal(next.stats().entered,true);assert.equal(next.ctx.S.coins,900);assert.equal(JSON.parse(next.cloud.save).coins,900);
  });
  await test('actual account read failure keeps entry closed and does not upload local 150',async()=>{
    const opts={actualAccount:true,user:{uid:'returning'},syncResult:'fail'};const w=make(opts);await settle();assert.equal(w.stats().state,'error');assert.equal(w.stats().enters,0);assert(!w.calls.some(c=>c[0]==='cloud-write'));
    opts.syncResult='local';await w.click('authRetry');assert.equal(w.stats().reloads,1);assert.equal(w.stats().enters,0);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);
  });
  await test('account changed during sync: retry reloads rather than reusing another user save',async()=>{
    const w=make({user:{uid:'returning'},syncResult:'fail'});await settle();w.auth.currentUser={uid:'different'};await w.click('authRetry');assert.equal(w.stats().reloads,1);assert.equal(w.stats().enters,0);
  });
  await test('explicit login clears an old adoption marker before restoring this account',async()=>{
    const w=make({actualAccount:true,session:new Map([['accLoadedAt','20000']])});await settle();await w.submit();assert.equal(w.stats().reloads,1);assert.equal(JSON.parse(w.disk.get('damaworld.v1')).coins,900);assert.equal(w.stats().enters,0);
  });
  await test('explicit guest enters the lobby without a Firebase account or cloud access',async()=>{
    const w=make({actualAccount:true});await settle();await w.click('authGuest');
    assert.equal(w.stats().entered,true);assert.equal(w.stats().enters,1);assert.equal(w.auth.currentUser,null);
    assert.equal(w.ctx.DAMA_AUTH.guest,true);assert.equal(w.ctx.DAMA_AUTH.saveKey,'damaworld.guest.v1');
    assert(!w.calls.some(c=>['onl-init','cloud-read','cloud-write','name-dialog'].includes(c[0])));
    assert.equal(w.disk.get('damaworld.v1'),JSON.stringify({coins:150,savedAt:10000}));
    assert.match(JSON.parse(w.disk.get('damaworld.guest.v1')).name,/^ضيف_/);
    await vm.runInContext('accUpload(true)',w.ctx);assert(!w.calls.some(c=>c[0]==='cloud-write'));
  });
  await test('each guest play attempt opens registration; cancel returns to browsing',async()=>{
    const w=make();await settle();await w.click('authGuest');
    for(let i=0;i<2;i++){
      assert.equal(w.ctx.DAMA_AUTH.requireAccount(),false);assert.equal(w.node('authGate').hidden,false);
      assert.equal(w.node('authSubmit').textContent,'إنشاء حساب');assert(w.node('authTitle').textContent.includes('عشان تلعب'));
      assert.equal(w.ctx.DAMA_AUTH.promptOpen,true);await w.click('authGuest');
      assert.equal(w.node('authGate').hidden,true);assert.equal(w.ctx.DAMA_AUTH.promptOpen,false);
    }
    assert.equal(w.stats().gameLoads,1);assert.equal(w.stats().enters,1);
  });
  await test('member can play; switching the authenticated UID immediately closes play access',async()=>{
    const w=make({user:{uid:'member'}});await settle();assert.equal(w.ctx.DAMA_AUTH.requireAccount(),true);
    w.auth.currentUser={uid:'different'};assert.equal(w.ctx.DAMA_AUTH.requireAccount(),false);
  });
  await test('guest wrong-password error preserves browsing and does not overwrite member save',async()=>{
    const w=make({actualAccount:true,authError:'auth/invalid-credential'});await settle();await w.click('authGuest');
    w.ctx.DAMA_AUTH.openAccount('login');await w.submit();assert.equal(w.stats().reloads,0);
    assert(w.node('authFormStatus').textContent.includes('غير صحيحة'));await w.click('authGuest');
    assert.equal(w.node('authGate').hidden,true);assert.equal(w.ctx.DAMA_AUTH.guest,true);
    assert.equal(w.disk.get('damaworld.v1'),JSON.stringify({coins:150,savedAt:10000}));
  });
  await test('guest sign-in reloads before restoring existing cloud 900, with no guest upload',async()=>{
    const disk=new Map([['damaworld.v1','{"coins":150,"savedAt":10000}'],['damaworld.guest.v1','{"coins":250,"savedAt":90000}']]);
    const first=make({actualAccount:true,disk});await settle();await first.click('authGuest');
    first.ctx.DAMA_AUTH.openAccount('login');await first.submit();assert.equal(first.stats().reloads,1);
    assert.equal(first.stats().gameLoads,1);assert.equal(disk.get('dama.auth.intent'),'restore');
    assert.equal(JSON.parse(disk.get('damaworld.v1')).coins,150);assert(!first.calls.some(c=>c[0]==='cloud-write'));
    const next=make({actualAccount:true,disk,user:{uid:'existing'}});await settle();
    assert.equal(next.stats().reloads,1);assert.equal(JSON.parse(disk.get('damaworld.v1')).coins,900);
    assert(!next.calls.some(c=>c[0]==='cloud-write'));
  });
  await test('new member carries the isolated guest save through a clean reload',async()=>{
    const disk=new Map([['damaworld.v1','{"coins":999}'],['damaworld.guest.v1','{"coins":175}']]);
    const first=make({actualAccount:true,disk,cloud:{}});await settle();await first.click('authGuest');
    first.ctx.DAMA_AUTH.openAccount();await first.submit();assert.equal(first.stats().reloads,1);
    assert.equal(JSON.parse(disk.get('damaworld.v1')).coins,999);assert.equal(disk.get('dama.auth.intent'),'new-guest');
    assert(!first.calls.some(c=>c[0]==='cloud-write'));assert.equal(first.ctx.DAMA_AUTH.requireAccount(),false);
    const next=make({actualAccount:true,disk,user:{uid:'new-user'},cloud:{}});await settle();
    assert.equal(next.stats().entered,true);assert.equal(next.ctx.DAMA_AUTH.requireAccount(),true);
    assert.equal(JSON.parse(next.cloud.save).coins,175);
  });
  await test('guest upgrade storage failure retains its intent and cannot upload an unrelated local save',async()=>{
    const disk=new Map([['dama.auth.intent','new-guest'],['damaworld.v1','{"coins":999}'],['damaworld.guest.v1','{"coins":175}']]);
    const w=make({actualAccount:true,disk,user:{uid:'new-user'},cloud:{},failStorage:true});await settle();
    assert.equal(w.stats().state,'error');assert.equal(w.stats().gameLoads,0);assert.equal(disk.get('dama.auth.intent'),'new-guest');
    assert.equal(JSON.parse(disk.get('damaworld.v1')).coins,999);assert(!w.calls.some(c=>c[0]==='cloud-write'));
    w.setStorageFail(false);await w.click('authRetry');assert.equal(w.stats().entered,true);
    assert.equal(JSON.parse(w.cloud.save).coins,175);assert.equal(disk.get('dama.auth.intent'),undefined);
  });
  await test('restored anonymous session can browse without linking or cloud reads',async()=>{
    const w=make({actualAccount:true,user:{uid:'old-guest',isAnonymous:true}});await settle();await w.click('authGuest');
    assert.equal(w.stats().entered,true);assert.equal(w.auth.currentUser.isAnonymous,true);
    assert(!w.calls.some(c=>['link-email','link-google','cloud-read','cloud-write'].includes(c[0])));
  });
  await test('refreshing a guest offers the choice again; it does not bypass sign-in',async()=>{
    const disk=new Map();const first=make({disk});await settle();await first.click('authGuest');assert.equal(first.stats().entered,true);
    const next=make({disk});await settle();assert.equal(next.stats().state,'login');assert.equal(next.stats().gameLoads,0);
  });
  await test('DW24 context loss exposes reload and pauses world input',async()=>{
    const w=make({user:{uid:'member',isAnonymous:false}});await settle();assert(w.stats().entered);
    w.ctx.DAMA_AUTH.graphicsLost();assert.equal(w.stats().state,'error');assert.equal(w.ctx.DAMA_AUTH.promptOpen,true);
    await w.click('authRetry');assert.equal(w.stats().reloads,1);
  });
  await test('switching accounts backs up the previous owner before restoring the new one',async()=>{
    const old=JSON.stringify({coins:777,editAt:10000});const disk=new Map([['damaworld.v1',old],['acc.owner','old-user']]);
    const w=make({disk,user:{uid:'new-user',isAnonymous:false}});await settle();
    assert.equal(disk.get('acc.backup.old-user'),old);assert.equal(disk.get('acc.pendingRestore'),'new-user');assert.equal(disk.has('damaworld.v1'),false);
  });
  console.log(`${count} entry checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
