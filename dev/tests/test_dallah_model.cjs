// Blender dallah model: file budget for phones and the swap/fallback logic in the shipped game source.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(root+'/index.html','utf8');
const game=html.match(/<script id="damaGameSource" type="application\/x-dama-game">([\s\S]*?)<\/script>/)[1];
let passed=0;async function test(name,f){await f();passed++;console.log('PASS',name)}
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r))};
function glb(){const b=fs.readFileSync(root+'/models/dallah.glb');const jl=b.readUInt32LE(12);return{b,j:JSON.parse(b.subarray(20,20+jl).toString())}}
function block(){const a=game.indexOf('/* ================= v39: real dallah model'),z=game.indexOf('/* ================= end real dallah ================= */');assert(a>0&&z>a);return game.slice(a,z)}
function ctx(load){
  const made=[];class Obj{constructor(){this.children=[];this.visible=true;this.position={y:0,set(){}};this.rotation={y:0};this.scale={v:1,setScalar(v){this.v=v}};this.userData={};this.parent={}}add(c){this.children.push(c)}}
  const mat={color:{set(c){this.c=c}},emissive:{set(c){this.c=c}},clone(){made.push('clone');return{color:{set(c){this.c=c}},emissive:{set(){}},emissiveIntensity:0}}};
  const c=vm.createContext({console:{warn(){}},Math,Promise,W:{id:1},NIGHT:0,GC:{},THREE:{Mesh:class extends Obj{constructor(g,m){super();this.geo=g;this.mat=m}}},
    glbLoad:()=>load(mat),dallah:()=>{const g=new Obj();g.children.push(new Obj(),new Obj());return g}});
  vm.runInContext(block(),c);return{c,mat,made};
}
(async()=>{
await test('dallah.glb is a valid single-mesh glTF 2 within the phone budget',()=>{const{b,j}=glb();
  assert.equal(b.subarray(0,4).toString(),'glTF');assert.equal(b.readUInt32LE(4),2);assert(b.length<=400*1024,'size '+b.length);
  assert.equal(j.meshes.length,1);assert.equal(j.meshes[0].primitives.length,1);const p=j.meshes[0].primitives[0],a=j.accessors;
  for(const k of['POSITION','NORMAL','TEXCOORD_0'])assert(p.attributes[k]!=null,k);
  assert(a[p.indices].count/3<=3000,'triangles '+a[p.indices].count/3);
  for(const i of Object.values(p.attributes).concat(p.indices))assert([5126,5125,5123].includes(a[i].componentType),'type the game reader supports');
  for(const v of j.bufferViews)assert(!v.byteStride,'tightly packed, as glbLoad expects');
  const h=a[p.attributes.POSITION].max[1]-a[p.attributes.POSITION].min[1];assert(h>.3&&h<.35,'real 32 cm height '+h);
  assert(j.images.every(i=>/jpeg|png/.test(i.mimeType)));assert(j.materials[0].pbrMetallicRoughness.baseColorTexture)});
await test('the Blender source file ships with the model for future edits',()=>{assert(fs.statSync(root+'/dev/assets/dallah.blend').size>1000)});
await test('when the model loads, the simple shape hides and the real dallah stands on the same spot',async()=>{
  const w=ctx(mat=>Promise.resolve({geo:{boundingBox:{min:{y:0},max:{y:.324}}},mat}));const g=w.c.dallah(1,2,3,1.1);await settle();
  assert.equal(g.children.length,3);assert.equal(g.children[0].visible,false);assert.equal(g.children[1].visible,false);
  const m=g.children[2];assert(m.userData.dallah39);assert.equal(m.rotation.y,Math.PI);assert(Math.abs(m.scale.v-.44/.324)<1e-9);assert(Math.abs(m.position.y)<1e-12)});
await test('the silver variant reuses one cloned material',async()=>{
  const w=ctx(mat=>Promise.resolve({geo:{boundingBox:{min:{y:0},max:{y:.324}}},mat}));w.c.dallah(0,0,0,1,'#8a8f96');w.c.dallah(0,0,0,1,'#8a8f96');await settle();assert.deepEqual(w.made,['clone'])});
await test('if the model cannot load, the original dallah stays visible',async()=>{
  const w=ctx(()=>Promise.reject(Error('offline')));const g=w.c.dallah(0,0,0,1);await settle();assert.equal(g.children.length,2);assert(g.children.every(c=>c.visible))});
await test('a model arriving after travelling to another country is not added to the old world',async()=>{
  let res;const w=ctx(mat=>new Promise(r=>res=()=>r({geo:{boundingBox:{min:{y:0},max:{y:.324}}},mat})));const g=w.c.dallah(0,0,0,1);w.c.W={id:2};res();await settle();assert.equal(g.children.length,2)});
console.log('Dallah model: '+passed+' passed');
})().catch(e=>{console.error(e);process.exit(1)});
