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
  ['accBoot','accSync','accSync0','accAdopt','accRaw','accUpload'].map(accountFunction).join('\n')+'\nwindow.DAMA_AUTH.attach({retry:accBoot,enter:window.testHooks.enter});';
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
      reportValidity:()=>true,querySelectorAll:()=>['authEmail','authPassword','authGoogle','authSwitch','authForgot','authSubmit'].map(node),
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
  const hooks={retry:async()=>{calls.push(['sync']);ctx.DAMA_AUTH.syncResult(options.syncResult||'local')},
    enter:async()=>{enters++;if(options.enterError)throw Error('WebGL')},afterEnter:()=>calls.push(['afterEnter'])};
  node('damaGameSource').textContent=options.actualAccount?accountProgram:options.gameError?'throw new Error("WebGL");':'window.DAMA_AUTH.attach(window.testHooks);';
  const cloud=options.cloud||{name:'MASTER',nameKey:'master',saveAt:20000,save:JSON.stringify({name:'MASTER',coins:900,savedAt:20000})};
  const session=options.session||new Map();
  ctx=vm.createContext({console,firebase,testHooks:hooks,Map,Promise,Error,Object,
    localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>{if(failStorage)throw Error('quota');disk.set(k,v)},removeItem:k=>disk.delete(k)},
    document:{getElementById:node,querySelectorAll:()=>deps,createElement:()=>node('script-'+(++timer)),
      body:{classList:{remove:()=>{}}},head:{appendChild(el){if(el.src){calls.push(['dependency',el.src]);queueMicrotask(()=>el.onload?.())}else{gameLoads++;try{vm.runInContext(el.textContent,ctx)}catch{}}}}},
    location:{reload(){reloads++}},
    S:JSON.parse(disk.get('damaworld.v1')||'{}'),Date,
    ONL:{user:auth.currentUser,auth,db:{collection:()=>({doc:()=>({get:async()=>{if(options.syncResult==='fail')throw Error('offline');return{exists:true,metadata:{fromCache:false},data:()=>cloud}},set:async data=>{calls.push(['cloud-write']);Object.assign(cloud,data)}})})}},
    onlInit:async()=>{ctx.ONL.user=auth.currentUser},accUI(){},updateProfile(){},toast(){},accNameDlg(){},level:()=>1,
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
  console.log(`${count} entry checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
