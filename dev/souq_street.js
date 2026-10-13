/* ================= v40: Mubarakiya street test (preview only: ?souqtest) ================= */
/* Loads the Blender-made street (3 buildings, pergola, paving) as baked GLBs into a separate test area
   south of the Kuwait map, with measured collision, raised shop floors and camera ceilings.
   Nothing here runs unless the page URL contains "souqtest"; the normal game is untouched. */
/* models load next to the page; on a raw.githack preview pinned to a commit they come from jsDelivr instead
   (githack proxies large binaries from GitHub slowly or not at all); ?souqbase=<url> overrides both */
function sqtBase(){const q=/[?&]souqbase=([^&#]+)/.exec(location.search);if(q)return decodeURIComponent(q[1]).replace(/\/?$/,'/');
  const m=location.hostname==='raw.githack.com'&&/^\/([^/]+)\/([^/]+)\/([0-9a-f]{7,40})\//.exec(location.pathname);
  return m?'https://cdn.jsdelivr.net/gh/'+m[1]+'/'+m[2]+'@'+m[3]+'/models/souq/':'models/souq/'}
const SOUQT={on:/(^|[?&#])souqtest\b/.test(location.search+location.hash),
  base:sqtBase(),files:['ground','hero','heroprops','bldB','bldC','endE','endW','street'],
  loaderUrl:'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  dracoUrl:'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js',
  dracoPath:'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/',draco:null,
  lod1:38,gltf:{},data:null,group:null,world:null,pending:null,arrived:false,
  stats:{t0:0,loader:0,json:0,files:{},bytes:0,ready:0,tris0:0,tris1:0,draws:0,errors:[]}};
function sqtRect(){const d=SOUQT.data;return d&&d.rect}
function sqtIn(x,z,pad){const r=sqtRect();pad=pad||0;return !!r&&x>r[0]-pad&&x<r[1]+pad&&z>r[2]-pad&&z<r[3]+pad}
function sqtScript(src,have){return new Promise((res,rej)=>{if(window.THREE&&THREE[have])return res();const s=document.createElement('script');s.src=src;s.async=false;s.onload=()=>res();s.onerror=()=>rej(new Error(have));document.head.appendChild(s)})}
function sqtLoader(){const l=new THREE.GLTFLoader();if(THREE.DRACOLoader){if(!SOUQT.draco){SOUQT.draco=new THREE.DRACOLoader();SOUQT.draco.setDecoderPath(SOUQT.dracoPath)}l.setDRACOLoader(SOUQT.draco)}return l}
function sqtFetchGLB(name){const t=performance.now(),url=SOUQT.base+'souq_'+name+'.glb';
  return fetch(url).then(r=>{if(!r.ok)throw new Error(url+' '+r.status);return r.arrayBuffer()}).then(buf=>new Promise((res,rej)=>{
    SOUQT.stats.bytes+=buf.byteLength;sqtLoader().parse(buf,SOUQT.base,g=>{SOUQT.stats.files[name]={ms:Math.round(performance.now()-t),kb:Math.round(buf.byteLength/1024)};res(g)},rej)}))}
function sqtLoad(){if(SOUQT.pending)return SOUQT.pending;SOUQT.stats.t0=performance.now();
  SOUQT.pending=sqtScript(SOUQT.loaderUrl,'GLTFLoader').then(()=>sqtScript(SOUQT.dracoUrl,'DRACOLoader')).then(()=>{SOUQT.stats.loader=Math.round(performance.now()-SOUQT.stats.t0);
    const j=fetch(SOUQT.base+'souq_collision.json').then(r=>r.json()).then(d=>{SOUQT.data=d;SOUQT.stats.json=Math.round(performance.now()-SOUQT.stats.t0)});
    return Promise.all([j].concat(SOUQT.files.map(n=>sqtFetchGLB(n).then(g=>{SOUQT.gltf[n]=g}).catch(e=>{SOUQT.stats.errors.push(String(e&&e.message||e))}))))})
   .then(()=>{SOUQT.stats.ready=Math.round(performance.now()-SOUQT.stats.t0)},e=>{SOUQT.stats.errors.push(String(e&&e.message||e));console.warn('souq test load failed',e)});
  return SOUQT.pending}
/* one THREE.LOD per building: LOD0 near, LOD1 (decimated, same atlas) beyond SOUQT.lod1 metres */
function sqtBuild(){const root=new THREE.Group();root.name='souqTest';
  /* the GLBs are in Blender street coordinates; the street sits at origin[2] metres south in the game */
  const geo=new THREE.Group();geo.name='souqGeo';const o=(SOUQT.data&&SOUQT.data.origin)||[0,0,150];geo.position.set(o[0],o[1],o[2]);root.add(geo);const maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  let t0=0,t1=0;
  for(const n of SOUQT.files){const g=SOUQT.gltf[n];if(!g)continue;const parts={};
    g.scene.traverse(o=>{if(!o.isMesh)return;const k=/LOD1/.test(o.name)?'lod1':/GLASS/i.test(o.name)?'glass':/EMIT/i.test(o.name)?'emit':'lod0';(parts[k]=parts[k]||[]).push(o)});
    const prep=(m,shadow)=>{m.updateMatrixWorld(true);const mesh=new THREE.Mesh(m.geometry,m.material);mesh.applyMatrix4(m.matrixWorld);mesh.castShadow=shadow;mesh.receiveShadow=shadow;
      GC['souq:'+n+':'+m.uuid]=m.geometry;const ma=m.material;
      /* the game renders without sRGB output, like its own hex-colour materials, so the baked colour stays linear */
      if(ma.map){ma.map.encoding=THREE.LinearEncoding;ma.map.anisotropy=maxAniso;ma.map.needsUpdate=true}if(ma.normalMap)ma.normalMap.anisotropy=maxAniso;
      if(ma.isMeshStandardMaterial&&!ma.transparent){ma.envMapIntensity=.55;ma.metalness=0;if(n!=='street'&&n!=='heroprops')ma.side=THREE.FrontSide}
      if(ma.transparent){ma.depthWrite=false;mesh.renderOrder=2}
      return mesh};
    if(parts.lod0){const lod=new THREE.LOD();const a=new THREE.Group();for(const m of parts.lod0){a.add(prep(m,true));t0+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3}
      lod.addLevel(a,0);
      if(parts.lod1){const b=new THREE.Group();for(const m of parts.lod1){b.add(prep(m,true));t1+=(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3}lod.addLevel(b,SOUQT.lod1)}
      lod.name='souq_'+n;geo.add(lod)}
    for(const m of (parts.glass||[]))geo.add(prep(m,false));
    for(const m of (parts.emit||[])){const me=prep(m,false);if(me.material.emissive)me.material.emissiveIntensity=NIGHT?2.2:.9;geo.add(me)}}
  /* sand around the test block so nothing floats over the void */
  const r=sqtRect();if(r){const sand=new THREE.Mesh(new THREE.PlaneGeometry(r[1]-r[0]+60,r[3]-r[2]+60),pbr('souqSand',{color:'#c9b08a',roughness:1}));
    sand.rotation.x=-Math.PI/2;sand.position.set((r[0]+r[1])/2,-.03,(r[2]+r[3])/2);sand.receiveShadow=true;root.add(sand);GC['souq:sand']=sand.geometry}
  SOUQT.stats.tris0=Math.round(t0);SOUQT.stats.tris1=Math.round(t1);
  return root}
function sqtApplyWorld(){if(!SOUQT.on||!W||W.theme.key!=='kw'||!SOUQT.data)return;if(SOUQT.world===W)return;SOUQT.world=W;
  const d=SOUQT.data;
  for(const b of d.boxes){const [x0,x1,z0,z1,h]=b;addBox((x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,h)}
  W.zones=W.zones.filter(z=>z.id!=='souqtest').concat([{id:'souqtest',name:'شارع المباركية (تجربة)',rect:d.rect,spawn:[d.spawn[0],0,d.spawn[1]],col:'#c9a36a'}]);
  if(!SOUQT.group)SOUQT.group=sqtBuild();
  W.root.add(SOUQT.group)}
/* raised shop floors and platforms */
const _sqtGroundY=groundY;groundY=function(x,z){if(SOUQT.on&&SOUQT.data&&sqtIn(x,z)){let h=0;for(const r of SOUQT.data.raised)if(x>r[0]&&x<r[1]&&z>r[2]&&z<r[3]&&r[4]>h)h=r[4];return h}return _sqtGroundY(x,z)};
/* pergola, shop and passage ceilings keep the third-person camera inside */
const _sqtCeil=souqCeil;souqCeil=function(x,z){if(SOUQT.on&&SOUQT.data&&sqtIn(x,z)){let c=0;for(const r of SOUQT.data.ceil)if(x>r[0]&&x<r[1]&&z>r[2]&&z<r[3]&&(!c||r[4]<c))c=r[4];return c}return _sqtCeil(x,z)};
/* inside the test block the world bounds are the block itself */
const _sqtResolve=resolve;resolve=function(p,r){if(SOUQT.on&&W&&SOUQT.data&&sqtIn(p.x,p.z,2)){const B=W.bounds;W.bounds=SOUQT.data.rect;try{return _sqtResolve(p,r)}finally{W.bounds=B}}return _sqtResolve(p,r)};
const _sqtBuildWorld=buildWorld;buildWorld=function(key){const w=_sqtBuildWorld.apply(this,arguments);if(SOUQT.on&&key==='kw'){SOUQT.world=null;if(SOUQT.data)sqtApplyWorld();else sqtLoad().then(()=>{if(W===w)sqtApplyWorld()})}return w};
function sqtGo(){const z=W&&W.zones&&W.zones.find(z=>z.id==='souqtest');if(z&&typeof teleport==='function'){SOUQT.arrived=true;teleport(z).then(()=>{yaw=-Math.PI/2;player.rot=yaw+Math.PI})}}
/* live numbers for testing: frame time, draw calls, triangles, memory (Chrome only), load timings */
const SQ_PERF={frames:[],last:0};
function sqtPerfTick(){const n=performance.now();if(SQ_PERF.last)SQ_PERF.frames.push(n-SQ_PERF.last);SQ_PERF.last=n;if(SQ_PERF.frames.length>600)SQ_PERF.frames.shift()}
window.souqTestReport=function(){const f=SQ_PERF.frames.slice().sort((a,b)=>a-b),avg=f.reduce((a,b)=>a+b,0)/Math.max(1,f.length);
  return {inStreet:!!(player&&sqtIn(player.pos.x,player.pos.z)),fpsAvg:+(1000/avg).toFixed(1),fps1pctLow:+(1000/(f[Math.floor(f.length*.99)]||avg)).toFixed(1),
    draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
    jsHeapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null,pixelRatio:renderer.getPixelRatio(),
    load:SOUQT.stats,boxes:SOUQT.data?SOUQT.data.boxes.length:0}};
if(SOUQT.on){sqtLoad();
  /* own frame clock: the game's loop is already wrapped elsewhere, so measure real presented frames */
  if(typeof requestAnimationFrame==='function'){const tick=()=>{sqtPerfTick();requestAnimationFrame(tick)};requestAnimationFrame(tick)}
  const iv=setInterval(()=>{if(SOUQT.arrived){clearInterval(iv);return}if(SOUQT.data&&W&&W.theme.key==='kw'&&mode==='explore'&&player.ch){sqtApplyWorld();sqtGo()}},500)}
/* ================= end Mubarakiya street test ================= */
