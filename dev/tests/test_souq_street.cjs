// Mubarakiya street test (v40): preview-only gate, collision/raised floors/ceilings, LOD assembly, asset budget.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(root+'/index.html','utf8');
const game=html.match(/<script id="damaGameSource" type="application\/x-dama-game">([\s\S]*?)<\/script>/)[1];
let passed=0;async function test(name,f){await f();passed++;console.log('PASS',name)}
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r))};
const A='/* ================= v40: Mubarakiya street test',Z='/* ================= end Mubarakiya street test ================= */';
function block(){const a=game.indexOf(A),z=game.indexOf(Z);assert(a>0&&z>a,'v40 block present');return game.slice(a,z+Z.length)}
const DATA=JSON.parse(fs.readFileSync(root+'/models/souq/souq_collision.json','utf8'));
const STUBS=`
let W=null,mode='explore',yaw=0,NIGHT=0,teleported=null;const GC={};const MC={};
const player={pos:{x:0,y:0,z:0,set(){}},rot:0,ch:{}};
function addBox(cx,cz,w,d,h){W.boxes.push({x0:cx-w/2,x1:cx+w/2,z0:cz-d/2,z1:cz+d/2,h})}
function groundY(x,z){return .12}
function souqCeil(x,z){return 0}
function resolve(p,r){const B=W.bounds;p.x=Math.min(Math.max(p.x,B[0]),B[1]);p.z=Math.min(Math.max(p.z,B[2]),B[3])}
function buildWorld(key){W={theme:{key},boxes:[],zones:[{id:'city'}],bounds:[-102,102,-102,108],root:{kids:[],add(o){this.kids.push(o)}}};return W}
function loop(){}
function teleport(z){teleported=z;return Promise.resolve()}
function pbr(k,o){return {k,o}}
`;
function ctx(url,fetchImpl,threeImpl){
  const c=vm.createContext({console:{log:console.log,error:console.error,warn(){}},Math,Promise,JSON,setInterval:()=>0,clearInterval(){},performance:{now:()=>0},
    location:{search:url.includes('?')?url.slice(url.indexOf('?')):'',hash:url.includes('#')?url.slice(url.indexOf('#')):''},
    window:{},document:{createElement:()=>({}),head:{appendChild(s){s.onload&&s.onload()}}},fetch:fetchImpl||(()=>Promise.reject(new Error('no fetch'))),
    renderer:{capabilities:{getMaxAnisotropy:()=>16},info:{render:{calls:0,triangles:0},memory:{geometries:0,textures:0}},getPixelRatio:()=>1},
    THREE:threeImpl||{}});
  c.window.THREE=c.THREE;
  vm.runInContext(STUBS+block()+'\n;this.__t={SOUQT,get W(){return W},groundY:(x,z)=>groundY(x,z),souqCeil:(x,z)=>souqCeil(x,z),resolve:(p,r)=>resolve(p,r),buildWorld:k=>buildWorld(k),sqtApplyWorld,get teleported(){return teleported}};',c);
  return c.__t;
}
(async()=>{
await test('the street test is off unless the URL asks for it, and the normal game paths are unchanged',()=>{
  const t=ctx('https://x/index.html');assert.equal(t.SOUQT.on,false);
  t.buildWorld('kw');assert.equal(t.groundY(0,150),.12);assert.equal(t.souqCeil(0,150),0);
  const p={x:0,z:500};t.resolve(p,.33);assert.equal(p.z,108,'normal world bounds still apply');
  assert.equal(t.W.boxes.length,0)});
await test('models load next to the page, or from jsDelivr on a commit-pinned githack preview',()=>{
  const c=u=>{const x=vm.createContext({location:new URL(u)});vm.runInContext(block().match(/function sqtBase\(\)\{[\s\S]*?\n.*?\n.*?'models\/souq\/'\}/)[0]+';this.b=sqtBase()',x);return x.b};
  assert.equal(c('https://x.web.app/?souqtest'),'models/souq/');
  assert.equal(c('https://raw.githack.com/MUTLAKCAPITALS/dama-world/d7237d4/index.html?souqtest=1'),'https://cdn.jsdelivr.net/gh/MUTLAKCAPITALS/dama-world@d7237d4/models/souq/');
  assert.equal(c('https://raw.githack.com/MUTLAKCAPITALS/dama-world/feat/souq-hero-v4/index.html?souqtest'),'models/souq/');
  assert.equal(c('https://x/?souqtest&souqbase=https%3A%2F%2Fcdn%2Fm'),'https://cdn/m/')});
await test('?souqtest turns it on (query or hash)',()=>{
  assert.equal(ctx('https://x/?souqtest=1').SOUQT.on,true);assert.equal(ctx('https://x/#souqtest').SOUQT.on,true)});
await test('collision, raised shop floors, ceilings and the test zone are applied to the Kuwait world only',async()=>{
  const fetchImpl=u=>u.endsWith('.json')?Promise.resolve({json:()=>Promise.resolve(DATA)}):Promise.reject(new Error('skip glb in this test'));
  const Obj=function(){this.children=[];this.position={set(){}};this.rotation={};this.add=o=>this.children.push(o)};
  const t=ctx('https://x/?souqtest',fetchImpl,{GLTFLoader:function(){},DRACOLoader:function(){},Group:Obj,Mesh:Obj,LOD:Obj,PlaneGeometry:function(){}});
  t.buildWorld('sa');await settle();assert.equal(t.W.boxes.length,0,'not in Saudi');
  t.buildWorld('kw');await settle();
  assert.equal(t.W.boxes.length,DATA.boxes.length);
  const z=t.W.zones.find(z=>z.id==='souqtest');assert(z,'zone registered');assert.deepEqual(z.rect,DATA.rect);
  const r=DATA.raised.reduce((a,b)=>b[4]>a[4]?b:a);const cx=(r[0]+r[1])/2,cz=(r[2]+r[3])/2;
  assert(t.groundY(cx,cz)>=r[4]-1e-9,'standing on a raised shop floor');
  assert.equal(t.groundY(0,0),.12,'outside the street the old ground rule is kept');
  const c=DATA.ceil[0];assert(t.souqCeil((c[0]+c[1])/2,(c[2]+c[3])/2)>0,'camera ceiling under the pergola');
  const p={x:DATA.spawn[0],z:DATA.spawn[1]+500};t.resolve(p,.33);assert(p.z<=DATA.rect[3],'inside the block the block is the boundary');
  assert.equal(t.W.root.kids.length,1,'the street group is added once');
  assert.equal(t.teleported,null,'no teleport before the player is in explore mode with a character')});
await test('a slow model holds the street back until everything has arrived (no half-built street)',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const fetchImpl=u=>u.endsWith('.json')?Promise.resolve({json:()=>Promise.resolve(DATA)}):
    (u.includes('bldC')?gate:Promise.resolve()).then(()=>({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))}));
  const Obj=function(){this.children=[];this.position={set(){}};this.rotation={};this.add=o=>this.children.push(o)};
  const GL=function(){this.parse=(b,base,ok)=>ok({scene:{traverse(){}}});this.setDRACOLoader=()=>{}};
  const t=ctx('https://x/?souqtest',fetchImpl,{GLTFLoader:GL,DRACOLoader:function(){this.setDecoderPath=()=>{}},Group:Obj,Mesh:Obj,LOD:Obj,PlaneGeometry:function(){}});
  t.buildWorld('kw');await settle();t.sqtApplyWorld();/* what the arrival poll does */assert.equal(t.W.boxes.length,0,'nothing applied while a building is still loading');
  release();await settle();assert.equal(t.W.boxes.length,DATA.boxes.length,'applied once all models are in')});
await test('collision data is sane: spawn is clear, the street lane is walkable, boxes are well formed',()=>{
  for(const b of DATA.boxes){assert(b[1]>b[0]&&b[3]>b[2]&&b[4]>0,'box '+b)}
  const inBox=(x,z)=>DATA.boxes.some(b=>x>b[0]-.33&&x<b[1]+.33&&z>b[2]-.33&&z<b[3]+.33);
  assert(!inBox(DATA.spawn[0],DATA.spawn[1]),'spawn point is not inside a wall');
  const oz=DATA.origin[2];let free=0,n=0;for(let x=-4;x<=13;x+=.5){n++;if(!inBox(x,oz+3.5))free++}
  assert(free/n>.9,'the alley centreline is walkable end to end ('+free+'/'+n+')')});
await test('the open shops can be walked into from the spawn point (flood fill with the player radius)',()=>{
  const R=DATA.rect,r=.33,c=.1,nx=Math.round((R[1]-R[0])/c),nz=Math.round((R[3]-R[2])/c),free=new Uint8Array(nx*nz),seen=new Uint8Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=R[0]+(i+.5)*c,z=R[2]+(j+.5)*c;let ok=x>R[0]+r&&x<R[1]-r&&z>R[2]+r&&z<R[3]-r;
    if(ok)for(const b of DATA.boxes){const cx=Math.min(Math.max(x,b[0]),b[1]),cz=Math.min(Math.max(z,b[2]),b[3]);if((x-cx)**2+(z-cz)**2<r*r){ok=false;break}}free[j*nx+i]=ok?1:0}
  const k0=Math.floor((DATA.spawn[1]-R[2])/c)*nx+Math.floor((DATA.spawn[0]-R[0])/c),st=[k0];seen[k0]=1;
  while(st.length){const k=st.pop(),i=k%nx,j=(k/nx)|0;for(const [a,b] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]){if(a<0||b<0||a>=nx||b>=nz)continue;const kk=b*nx+a;if(free[kk]&&!seen[kk]){seen[kk]=1;st.push(kk)}}}
  const at=(x,z)=>seen[Math.floor((z-R[2])/c)*nx+Math.floor((x-R[0])/c)];
  const anyIn=(x0,x1,z0,z1)=>{for(let x=x0;x<=x1;x+=.1)for(let z=z0;z<=z1;z+=.1)if(at(x,z))return true;return false};
  assert(anyIn(-4.3,-3.4,147.5,148.6),'hero spice shop, 1.5 m inside');
  for(const [a,b] of [[7,9],[10,12],[13,14.5]])assert(anyIn(a,b,146.2,147.5),'arcade shop '+a);
  assert(anyIn(1.4,3.1,158.2,158.9)&&anyIn(-1.3,.2,158.2,158.9),'C1 glazed shops up to the counter');
  assert(anyIn(19.5,20.3,153,154)&&anyIn(-10.9,-10.2,153,154),'both covered passages up to their doors')});
await test('each GLB holds LOD0 + LOD1 with baked textures and stays inside the size budget',()=>{
  let total=0;
  for(const n of ['ground','hero','heroprops','bldB','bldC','endE','endW','street']){
    const b=fs.readFileSync(root+'/models/souq/souq_'+n+'.glb');total+=b.length;
    assert.equal(b.subarray(0,4).toString(),'glTF');const jl=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+jl).toString());
    const names=j.nodes.map(x=>x.name);assert(names.some(x=>/LOD0/.test(x)),n+' LOD0');if(n!=='ground')assert(names.some(x=>/LOD1/.test(x)),n+' LOD1');
    assert(j.images&&j.images.length>=3&&j.images.every(i=>i.mimeType==='image/jpeg'),n+' baked JPEG maps');
    assert((j.extensionsUsed||[]).includes('KHR_draco_mesh_compression'),n+' Draco geometry');
    assert(b.length<3.5*1024*1024,n+' size '+b.length)}
  assert(total<16*1024*1024,'whole street '+total)});
console.log('Souq street test: '+passed+' passed');
})().catch(e=>{console.error(e);process.exit(1)});
