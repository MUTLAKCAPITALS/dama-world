/* بديل محلي لـ Firebase للاختبار فقط: صفحات بنفس المتصفح يتشاركون البيانات */
(function(){const bc=new BroadcastChannel('fbshim'),L={};
  const key=p=>'shim:'+p,read=p=>{const v=localStorage.getItem(key(p));return v?JSON.parse(v):null};
  const notify=p=>{(L[p]||[]).forEach(f=>f());bc.postMessage(p)};bc.onmessage=e=>(L[e.data]||[]).forEach(f=>f());
  function apply(old,d){const o=Object.assign({},old||{});for(const k in d){const v=d[k];if(v&&v.__au)o[k]=(o[k]||[]).concat(v.items.filter(x=>!(o[k]||[]).some(y=>JSON.stringify(y)===JSON.stringify(x))));else o[k]=v}return o}
  const snap=p=>{const d=read(p);return{id:p.split('/').pop(),exists:!!d,data:()=>d}};
  const W={set:(p,d,o)=>{localStorage.setItem(key(p),JSON.stringify(o&&o.merge?apply(read(p),d):apply(null,d)));notify(p)},
    update:(p,d)=>{const c=read(p);if(!c)throw new Error('not-found');localStorage.setItem(key(p),JSON.stringify(apply(c,d)));notify(p)},del:p=>{localStorage.removeItem(key(p));notify(p)}};
  function doc(p){return{_p:p,get:async(o)=>{const srv=o&&o.source==='server';if(srv)window.__shimServerGets=(window.__shimServerGets||0)+1;if(localStorage.getItem('shim:failGet'))throw{code:'unavailable',message:'offline'};if(localStorage.getItem('shim:serverDown')){if(srv)throw{code:'unavailable',message:'server unreachable'};const c=localStorage.getItem('shim:cache:'+p);const sn=snap(p);if(c){const d=JSON.parse(c);return{id:sn.id,exists:true,data:()=>d,metadata:{fromCache:true}}}return Object.assign(sn,{metadata:{fromCache:true}})}return Object.assign(snap(p),{metadata:{fromCache:false}})},set:async(d,o)=>W.set(p,d,o),update:async d=>W.update(p,d),delete:async()=>W.del(p),
    onSnapshot:(cb)=>{const f=()=>setTimeout(()=>cb(snap(p)),30);(L[p]=L[p]||[]).push(f);f();return()=>{L[p]=L[p].filter(x=>x!==f)}}}}
  const SK='shim:auth:'+(sessionStorage.getItem('shimTab')||(sessionStorage.setItem('shimTab',Math.random().toString(36).slice(2)),sessionStorage.getItem('shimTab')));
  const accts=()=>JSON.parse(localStorage.getItem('shim:accts')||'{}'),saveA=a=>localStorage.setItem('shim:accts',JSON.stringify(a));
  function mkUser(o){const u={uid:o.uid,isAnonymous:!!o.anon,email:o.email||null,providerData:o.prov?[{providerId:o.prov}]:[]};
    u.linkWithCredential=async cr=>{const a=accts();if(a[cr.email])throw{code:'auth/email-already-in-use'};a[cr.email]={pass:cr.pass,uid:u.uid};saveA(a);setU({uid:u.uid,email:cr.email,prov:'password'});return{user:auth.currentUser}};
    u.linkWithPopup=async()=>{setU({uid:u.uid,email:'g'+u.uid+'@gmail.com',prov:'google.com'});return{user:auth.currentUser}};
    u.delete=async()=>{sessionStorage.removeItem(SK);auth.currentUser=null};return u}
  const AL=[];function setU(o){sessionStorage.setItem(SK,JSON.stringify(o));auth.currentUser=mkUser(o);AL.forEach(f=>f(auth.currentUser))}
  const auth={currentUser:null,
    signInAnonymously:async()=>{setU({uid:'u'+Math.random().toString(36).slice(2,8),anon:true});return{user:auth.currentUser}},
    signInWithEmailAndPassword:async(e,p)=>{const a=accts()[e];if(!a)throw{code:'auth/user-not-found'};if(a.pass!==p)throw{code:'auth/wrong-password'};setU({uid:a.uid,email:e,prov:'password'});return{user:auth.currentUser}},
    createUserWithEmailAndPassword:async(e,p)=>{const a=accts();if(a[e])throw{code:'auth/email-already-in-use'};const uid='u'+Math.random().toString(36).slice(2,8);a[e]={pass:p,uid};saveA(a);setU({uid,email:e,prov:'password'});return{user:auth.currentUser}},
    onAuthStateChanged:cb=>{AL.push(cb);setTimeout(()=>cb(auth.currentUser),10);return()=>{const i=AL.indexOf(cb);if(i>=0)AL.splice(i,1)}},signInWithPopup:async()=>{setU({uid:'owner1',email:'alomarmutlak@gmail.com',prov:'google.com'});return{user:auth.currentUser}},signOut:async()=>{sessionStorage.removeItem(SK);auth.currentUser=null;AL.forEach(f=>f(null))},sendPasswordResetEmail:async()=>{}};
  const sv=sessionStorage.getItem(SK);if(sv)auth.currentUser=mkUser(JSON.parse(sv));
  function Q(c,fs,ob,lim){const run=()=>{let out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k.startsWith('shim:'+c+'/'))continue;const id=k.slice(('shim:'+c+'/').length);if(id.includes('/'))continue;const d=read(c+'/'+id);if(!d)continue;
      if(fs.every(([f,o,v])=>{const x=d[f];if(x===undefined||x===null)return false;return o==='=='?x===v:o==='>'?x>v:o==='>='?x>=v:o==='<'?x<v:o==='<='?x<=v:false}))out.push({id,exists:true,data:()=>d})}
    if(ob){out=out.filter(x=>x.data()[ob[0]]!=null);out.sort((a,b)=>{const x=a.data()[ob[0]],y=b.data()[ob[0]];return(x>y?1:x<y?-1:0)*(ob[1]==='desc'?-1:1)})}if(lim)out=out.slice(0,lim);return out};
  return{where:(f,o,v)=>Q(c,fs.concat([[f,o,v]]),ob,lim),orderBy:(f,dir)=>Q(c,fs,[f,dir||'asc'],lim),limit:n=>Q(c,fs,ob,n),get:async()=>{const d=run();return{docs:d,size:d.length}},count:()=>({get:async()=>{const n=run().length;return{data:()=>({count:n})}}})}}
  const db={collection:c=>Object.assign(Q(c,[],null,0),{doc:id=>doc(c+'/'+id),add:async d=>{const id='r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);W.set(c+'/'+id,d);return doc(c+'/'+id)}}),runTransaction:async fn=>{const ops=[];const tx={get:async r=>snap(r._p),set:(r,d,o)=>ops.push(()=>W.set(r._p,d,o)),update:(r,d)=>ops.push(()=>W.update(r._p,d)),delete:r=>ops.push(()=>W.del(r._p))};const res=await fn(tx);ops.forEach(f=>f());return res}};
  const firestore=()=>db;firestore.FieldValue={arrayUnion:(...items)=>({__au:1,items})};
  const authFn=()=>auth;authFn.GoogleAuthProvider=function(){};authFn.EmailAuthProvider={credential:(email,pass)=>({email,pass})};
  window.firebase={apps:[],initializeApp(){this.apps.push(1)},auth:authFn,firestore}})();
