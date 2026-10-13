/* ================= v40: Mubarakiya street test (preview only: ?souqtest) ================= */
/* Loads the Blender-made street (3 buildings, pergola, paving) as baked GLBs into a separate test area
   south of the Kuwait map, with measured collision, raised shop floors and camera ceilings.
   Nothing here runs unless the page URL contains "souqtest"; the normal game is untouched. */
/* models load next to the page; on a raw.githack preview pinned to a commit they come from jsDelivr instead
   (githack proxies large binaries from GitHub slowly or not at all); ?souqbase=<url> overrides both */
/* commit whose models/souq/ matches this tree (a test checks it), so every preview shares one warm CDN copy */
const SOUQ_ASSET_REF='313936d';
function sqtBase(){const q=/[?&]souqbase=([^&#]+)/.exec(location.search);if(q)return decodeURIComponent(q[1]).replace(/\/?$/,'/');
  const m=location.hostname==='raw.githack.com'&&/^\/([^/]+)\/([^/]+)\//.exec(location.pathname);
  return m?'https://cdn.jsdelivr.net/gh/'+m[1]+'/'+m[2]+'@'+SOUQ_ASSET_REF+'/models/souq/':'models/souq/'}
/* phones and tablets (incl. iPadOS, which reports a Mac) get the light copies: same geometry, ~25 MB of textures */
function sqtMobile(){if(/[?&#]souqmobile=1/.test(location.search+location.hash))return true;if(/[?&#]souqmobile=0/.test(location.search+location.hash))return false;
  const ua=navigator.userAgent||'';return (typeof POWER!=='undefined'&&!!POWER.mobile)||/iPhone|iPad|iPod|Android/i.test(ua)||(/Macintosh/.test(ua)&&(navigator.maxTouchPoints||0)>1)}
const SOUQT={on:/(^|[?&#])souqtest\b/.test(location.search+location.hash),
  base:sqtBase(),files:['ground','hero','heroprops','bldB','bldC','endE','endW','street'],
  loaderUrl:'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  dracoUrl:'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js',
  dracoPath:'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/',draco:null,
  lod1:38,pad:12,mobile:typeof navigator!=='undefined'&&sqtMobile(),gltf:{},data:null,group:null,world:null,pending:null,arrived:false,
  stats:{t0:0,loader:0,json:0,files:{},bytes:0,ready:0,tris0:0,tris1:0,draws:0,errors:[]}};
/* the walkable test area: the street block plus a 12 m apron of sand all round, so the buildings can be seen from every side */
function sqtRect(){const d=SOUQT.data;if(!d)return null;const p=SOUQT.pad;return [d.rect[0]-p,d.rect[1]+p,d.rect[2]-p,d.rect[3]+p]}
function sqtIn(x,z,pad){const r=sqtRect();pad=pad||0;return !!r&&x>r[0]-pad&&x<r[1]+pad&&z>r[2]-pad&&z<r[3]+pad}
function sqtScript(src,have){return new Promise((res,rej)=>{if(window.THREE&&THREE[have])return res();const s=document.createElement('script');s.src=src;s.async=false;s.onload=()=>res();s.onerror=()=>rej(new Error(have));document.head.appendChild(s)})}
function sqtLoader(){const l=new THREE.GLTFLoader();if(THREE.DRACOLoader){if(!SOUQT.draco){SOUQT.draco=new THREE.DRACOLoader();SOUQT.draco.setDecoderPath(SOUQT.dracoPath)}l.setDRACOLoader(SOUQT.draco)}return l}
function sqtFetchGLB(name){const t=performance.now(),full=SOUQT.base+'souq_'+name+'.glb',url=SOUQT.mobile?SOUQT.base+'souq_'+name+'_m.glb':full;
  const get=u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u+' '+r.status);return r.arrayBuffer()});
  /* a missing light copy falls back to the full model rather than leaving a hole in the street */
  return (url===full?get(full):get(url).catch(()=>get(full))).then(buf=>new Promise((res,rej)=>{
    SOUQT.stats.bytes+=buf.byteLength;sqtLoader().parse(buf,SOUQT.base,g=>{SOUQT.stats.files[name]={ms:Math.round(performance.now()-t),kb:Math.round(buf.byteLength/1024)};res(g)},rej)}))}
function sqtLoad(){if(SOUQT.pending)return SOUQT.pending;SOUQT.stats.t0=performance.now();
  SOUQT.pending=sqtScript(SOUQT.loaderUrl,'GLTFLoader').then(()=>sqtScript(SOUQT.dracoUrl,'DRACOLoader')).then(()=>{SOUQT.stats.loader=Math.round(performance.now()-SOUQT.stats.t0);
    const j=fetch(SOUQT.base+'souq_collision.json').then(r=>r.json()).then(d=>{SOUQT._data=d;SOUQT.stats.json=Math.round(performance.now()-SOUQT.stats.t0)});
    return Promise.all([j].concat(SOUQT.files.map(n=>sqtFetchGLB(n).then(g=>{SOUQT.gltf[n]=g}).catch(e=>{SOUQT.stats.errors.push(String(e&&e.message||e))}))))})
   /* publish the collision only when every model is in, so the street is never built half-loaded */
   .then(()=>{SOUQT.data=SOUQT._data;SOUQT.stats.ready=Math.round(performance.now()-SOUQT.stats.t0)},e=>{SOUQT.stats.errors.push(String(e&&e.message||e));console.warn('souq test load failed',e)});
  return SOUQT.pending}
/* ---- street lighting (test area only; the game's sun, shadows and sky are untouched) ----
   The street runs east-west between 5-10 m buildings under a slatted pergola. With the game's low
   south-west sun (26 deg) the south row shades the whole floor, so the street lives on indirect light.
   The game only has a weak blue hemisphere for that, so here, on the street's own materials only:
   - sky fill: hemisphere-coloured light from above, scaled with the game's hemisphere;
   - bounce: warm sun-coloured light reflected off the sunlit upper walls and floor, strongest on
     walls and undersides (arcade ceilings, pergola undersides), weakest on the floor itself;
   both are multiplied by the baked sky-visibility (AO) map, so corners, arcades, passages and shop
   interiors stay darker than the open street. Direct sun and the beam shadows are not changed. */
const SQ_LIGHT={kSky:{value:.5},kBounce:{value:.3},sky:{value:THREE.Color?new THREE.Color():null},bounce:{value:THREE.Color?new THREE.Color():null}};
function sqtLightTick(){if(!SQ_LIGHT.sky.value)return;if(typeof hemi!=='undefined'&&hemi)SQ_LIGHT.sky.value.copy(hemi.color).multiplyScalar(hemi.intensity/.42);
  if(typeof sun!=='undefined'&&sun)SQ_LIGHT.bounce.value.copy(sun.color).multiplyScalar(Math.min(1.2,sun.intensity/2))}
function sqtFill(ma){if(ma.userData.sqFill)return;ma.userData.sqFill=true;ma.aoMapIntensity=1;
  ma.onBeforeCompile=sh=>{sh.uniforms.sqSky=SQ_LIGHT.sky;sh.uniforms.sqBounce=SQ_LIGHT.bounce;sh.uniforms.sqKSky=SQ_LIGHT.kSky;sh.uniforms.sqKB=SQ_LIGHT.kBounce;
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 sqSky;uniform vec3 sqBounce;uniform float sqKSky;uniform float sqKB;')
      .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n{vec3 nW=inverseTransformDirection(normal,viewMatrix);float up=nW.y*.5+.5;\n reflectedLight.indirectDiffuse+=material.diffuseColor*(sqSky*sqKSky*up+sqBounce*sqKB*(.6-.4*nW.y));}')};
  ma.customProgramCacheKey=()=>'souqfill1';ma.needsUpdate=true}
/* one THREE.LOD per building: LOD0 near, LOD1 (decimated, same atlas) beyond SOUQT.lod1 metres */
function sqtBuild(){const root=new THREE.Group();root.name='souqTest';
  /* the GLBs are in Blender street coordinates; the street sits at origin[2] metres south in the game */
  const geo=new THREE.Group();geo.name='souqGeo';const o=(SOUQT.data&&SOUQT.data.origin)||[0,0,150];geo.position.set(o[0],o[1],o[2]);root.add(geo);const maxAniso=Math.min(SOUQT.mobile?2:8,renderer.capabilities.getMaxAnisotropy());
  let t0=0,t1=0;
  for(const n of SOUQT.files){const g=SOUQT.gltf[n];if(!g)continue;const parts={};
    g.scene.traverse(o=>{if(!o.isMesh)return;const k=/LOD1/.test(o.name)?'lod1':/GLASS/i.test(o.name)?'glass':/EMIT/i.test(o.name)?'emit':'lod0';(parts[k]=parts[k]||[]).push(o)});
    const prep=(m,shadow)=>{m.updateMatrixWorld(true);const mesh=new THREE.Mesh(m.geometry,m.material);mesh.applyMatrix4(m.matrixWorld);mesh.castShadow=shadow;mesh.receiveShadow=shadow;
      GC['souq:'+n+':'+m.uuid]=m.geometry;const ma=m.material;
      /* the game renders without sRGB output, like its own hex-colour materials, so the baked colour stays linear */
      if(ma.map){ma.map.encoding=THREE.LinearEncoding;ma.map.anisotropy=maxAniso;ma.map.needsUpdate=true}if(ma.normalMap)ma.normalMap.anisotropy=maxAniso;
      if(ma.isMeshStandardMaterial&&!ma.transparent){ma.envMapIntensity=.55;ma.metalness=0;if(n!=='street'&&n!=='heroprops')ma.side=THREE.FrontSide;
        if(/^GM_(?!emit|glass)/.test(ma.name||'')){if(ma.aoMap&&!m.geometry.attributes.uv2&&m.geometry.attributes.uv)m.geometry.setAttribute('uv2',m.geometry.attributes.uv);sqtFill(ma)}}
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
  const R=sqtRect();W.zones=W.zones.filter(z=>!/^souqtest/.test(z.id)).concat([{id:'souqtest',name:'شارع المباركية (تجربة)',rect:R,spawn:[d.spawn[0],0,d.spawn[1]],col:'#c9a36a'},
    {id:'souqtest_out',name:'المباركية من الخارج (تجربة)',rect:R,spawn:[(d.rect[0]+d.rect[1])/2,0,d.rect[2]-11],col:'#c9a36a'}]);
  if(!SOUQT.group)SOUQT.group=sqtBuild();
  W.root.add(SOUQT.group)}
/* raised shop floors and platforms */
const _sqtGroundY=groundY;groundY=function(x,z){if(SOUQT.on&&SOUQT.data&&sqtIn(x,z)){let h=0;for(const r of SOUQT.data.raised)if(x>r[0]&&x<r[1]&&z>r[2]&&z<r[3]&&r[4]>h)h=r[4];return h}return _sqtGroundY(x,z)};
/* pergola, shop and passage ceilings keep the third-person camera inside */
function sqtCeilAt(x,z){let c=0;for(const r of SOUQT.data.ceil)if(x>r[0]&&x<r[1]&&z>r[2]&&z<r[3]&&(!c||r[4]<c))c=r[4];return c}
/* the game asks for the ceiling above the player only; here it is the lowest ceiling along the whole camera boom,
   so walking into a shop the camera stays under the awning outside, and walking out it stays under the shop ceiling */
const _sqtCeil=souqCeil;souqCeil=function(x,z){if(SOUQT.on&&SOUQT.data&&sqtIn(x,z)){const fx=-Math.sin(yaw),fz=-Math.cos(yaw),d=(typeof camDist==='number'?camDist:3)+.4;let c=0;
    for(let k=0;k<=8;k++){const h=sqtCeilAt(x-fx*d*k/8,z-fz*d*k/8);if(h&&(!c||h<c))c=h}return c}return _sqtCeil(x,z)};
/* inside the test block the world bounds are the block itself */
const _sqtResolve=resolve;resolve=function(p,r){if(SOUQT.on&&W&&SOUQT.data&&sqtIn(p.x,p.z,2)){const B=W.bounds;W.bounds=sqtRect();try{return _sqtResolve(p,r)}finally{W.bounds=B}}return _sqtResolve(p,r)};
const _sqtBuildWorld=buildWorld;buildWorld=function(key){const w=_sqtBuildWorld.apply(this,arguments);if(SOUQT.on&&key==='kw'){SOUQT.world=null;if(SOUQT.data)sqtApplyWorld();else sqtLoad().then(()=>{if(W===w)sqtApplyWorld()})}return w};
/* arriving at either test point faces the buildings: east along the street, or south at the block from outside */
const SQT_FACE={souqtest:-Math.PI/2,souqtest_out:Math.PI};
const _sqtTeleport=teleport;teleport=function(z){const r=_sqtTeleport.apply(this,arguments);if(z&&SQT_FACE[z.id]!==undefined)Promise.resolve(r).then(()=>{yaw=SQT_FACE[z.id];player.rot=yaw+Math.PI});return r};
function sqtGo(){const z=W&&W.zones&&W.zones.find(z=>z.id==='souqtest');if(z&&typeof teleport==='function'){SOUQT.arrived=true;teleport(z)}}
/* live numbers for testing: frame time, draw calls, triangles, memory (Chrome only), load timings */
const SQ_PERF={frames:[],last:0};
function sqtPerfTick(){sqtLightTick();const n=performance.now();if(SQ_PERF.last)SQ_PERF.frames.push(n-SQ_PERF.last);SQ_PERF.last=n;if(SQ_PERF.frames.length>600)SQ_PERF.frames.shift()}
window.souqTestReport=function(){const f=SQ_PERF.frames.slice().sort((a,b)=>a-b),avg=f.reduce((a,b)=>a+b,0)/Math.max(1,f.length);
  return {inStreet:!!(player&&sqtIn(player.pos.x,player.pos.z)),fpsAvg:+(1000/avg).toFixed(1),fps1pctLow:+(1000/(f[Math.floor(f.length*.99)]||avg)).toFixed(1),
    draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
    jsHeapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null,pixelRatio:renderer.getPixelRatio(),
    load:SOUQT.stats,boxes:SOUQT.data?SOUQT.data.boxes.length:0,light:{kSky:SQ_LIGHT.kSky.value,kBounce:SQ_LIGHT.kBounce.value}}};
window.souqLight=SQ_LIGHT;
/* ?souqdiag=1: one line on screen for testing on a phone without a computer attached */
let SQ_LOST=0;
function sqtDiag(){if(!/[?&#]souqdiag=1/.test(location.search+location.hash)||typeof document==='undefined'||!document.body)return;
  const el=document.createElement('div');el.style.cssText='position:fixed;left:6px;bottom:6px;z-index:99999;font:11px/1.3 monospace;color:#fff;background:rgba(0,0,0,.6);padding:3px 6px;border-radius:4px;pointer-events:none;direction:ltr';document.body.appendChild(el);
  renderer.domElement.addEventListener('webglcontextlost',()=>{SQ_LOST++});
  setInterval(()=>{const r=souqTestReport();el.textContent=(SOUQT.mobile?'mobile':'desktop')+' | files '+Object.keys(SOUQT.stats.files).length+'/'+SOUQT.files.length+(SOUQT.stats.ready?' ready '+(SOUQT.stats.ready/1000).toFixed(1)+'s':' loading')+' | '+(r.fpsAvg||0)+' fps | tex '+r.textures+' | lost '+SQ_LOST+(SOUQT.stats.errors.length?' | ERR '+SOUQT.stats.errors[0]:'')},1000)}
if(SOUQT.on){sqtLoad();setTimeout(sqtDiag,0);
  /* own frame clock: the game's loop is already wrapped elsewhere, so measure real presented frames */
  if(typeof requestAnimationFrame==='function'){const tick=()=>{sqtPerfTick();requestAnimationFrame(tick)};requestAnimationFrame(tick)}
  const iv=setInterval(()=>{if(SOUQT.arrived){clearInterval(iv);return}if(SOUQT.data&&W&&W.theme.key==='kw'&&mode==='explore'&&player.ch){sqtApplyWorld();sqtGo()}},500)}
/* ================= end Mubarakiya street test ================= */
