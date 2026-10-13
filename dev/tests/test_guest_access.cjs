// Run the actual game entry functions with small world/UI stand-ins. No production requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const game=html.match(/<script id="damaGameSource" type="application\/x-dama-game">([\s\S]*?)<\/script>/)[1];
function extract(name,assignment=false){
  const re=assignment?new RegExp(name+'=(?:async )?function\\('):new RegExp('(?:async )?function '+name+'\\(');
  const matches=[...game.matchAll(new RegExp(re.source,'g'))];assert(matches.length,name);
  return matches.map(m=>{const start=m.index+(assignment?name.length+1:0);
    for(let end=game.indexOf('}',start);end>=0;end=game.indexOf('}',end+1)){
      const s=game.slice(start,end+1);try{new vm.Script('('+s+')');return s}catch{}
    }throw Error('Cannot extract '+name);
  });
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name)}
function setup(member=false){
  let prompts=0;const ctx=vm.createContext({window:{DAMA_AUTH:{guest:!member,requireAccount(){if(!member)prompts++;return member}}}});
  vm.runInContext(extract('requirePlayAccount')[0],ctx);return{ctx,prompts:()=>prompts};
}
(async()=>{
  for(const name of ['requestChallenge','beginMatch','rematch','playVs','vsBegin','tourStart','mbTap','onlMenu','onlHost','onlJoinDlg','onlJoin','onlStart']){
    await test(name+' stops guests before any game, timer or room effect',async()=>{
      for(const s of extract(name)){
        const w=setup();const fn=vm.runInContext('('+s+')',w.ctx);await fn();assert.equal(w.prompts(),1);
      }
    });
  }
  for(const name of ['beginMatch','onlStart']){
    await test(name+' wrappers also stop before animations or voice setup',async()=>{
      for(const s of extract(name,true)){const w=setup();await vm.runInContext('('+s+')',w.ctx)();assert.equal(w.prompts(),1)}
    });
  }
  await test('quick matchmaking is blocked before changing the lobby',async()=>{
    const w=setup();await vm.runInContext('('+extract('lbStartMM')[0]+')',w.ctx)(true);assert.equal(w.prompts(),1);
  });
  await test('direct quick launch and queued opponent both require a member',async()=>{
    for(const [quick,vs]of[[true,null],[false,{name:'opponent'}]]){
      const w=setup();w.ctx.LOBBY={vs};await vm.runInContext('('+extract('lbLaunch')[0]+')',w.ctx)(quick);assert.equal(w.prompts(),1);
    }
  });
  await test('guest can use ordinary lobby departure to explore the open world',async()=>{
    const w=setup(),nodes=new Map(),pos=[];let shows=[];
    Object.assign(w.ctx,{
      LOBBY:{team:[],on:true,vs:null,firstDone:true},LB_KEY:{intensity:1},S:{country:'kw'},W:{theme:{}},
      LB_SPAWN:{souq:[80,0,-43,0]},lbDest:()=>({k:'kw',z:'souq'}),lbShow:v=>shows.push(v),
      document:{body:{classList:{remove(){}}}},fade:async()=>{},
      player:{pos:{set(...v){pos.push(v)}},ch:{userData:{}}},joyEl:{hidden:true},
      camera:{position:{},quaternion:{}},explorePose(){},resize(){},camDist:4,
      $:id=>{if(!nodes.has(id))nodes.set(id,{hidden:true});return nodes.get(id)}
    });
    await vm.runInContext('('+extract('lbLaunch')[0]+')',w.ctx)(false);
    assert.equal(w.ctx.mode,'explore');assert.equal(w.ctx.LOBBY.on,false);assert.equal(w.prompts(),0);
    assert.deepEqual(pos,[[80,0,-43]]);assert.equal(w.ctx.joyEl.hidden,false);assert.equal(nodes.get('#hud').hidden,false);
    assert.deepEqual(shows,[false]);
  });
  await test('guest can start the normal world entry timer without matchmaking',async()=>{
    const w=setup();let scheduled=0;Object.assign(w.ctx,{
      LOBBY:{},lbDest:()=>({k:'kw',z:'souq'}),lbZones:()=>[{id:'souq',name:'السوق'}],
      $:()=>({classList:{add(){}},style:{}}),performance:{now:()=>1},requestAnimationFrame:()=>scheduled++,SFX:{tap(){}}
    });
    vm.runInContext('('+extract('lbStartMM')[0]+')',w.ctx)(false);
    assert.equal(w.ctx.LOBBY.mm.quick,false);assert.equal(w.prompts(),0);assert.equal(scheduled,1);
  });
  await test('tournament browsing works; joining, registering and playing are guarded',async()=>{
    const w=setup();let act;Object.assign(w.ctx,{S:{},PANEL:{},openPanel:(...a)=>{act=a.at(-1)}});
    vm.runInContext('('+extract('openTour')[0]+')',w.ctx)('list');assert.equal(w.prompts(),0);
    for(const k of ['join','reg','play'])assert.equal(act(k),false);
    assert.equal(w.prompts(),3);assert.equal(w.ctx.S.tour,undefined);assert.equal(w.ctx.S.friReg,undefined);
  });
  await test('private-room browsing works; guest room actions have no effects',async()=>{
    const w=setup();let act;Object.assign(w.ctx,{ROOM:null,roomTab:'new',openPanel:(...a)=>{act=a.at(-1)}});
    vm.runInContext('('+extract('openRoom')[0]+')',w.ctx)('new');assert.equal(w.prompts(),0);
    for(const k of ['create','joincode','inv','start','hstart'])assert.equal(act(k),false);
    assert.equal(w.prompts(),5);assert.equal(w.ctx.ROOM,null);
  });
  await test('guest cannot initialize online services in the background',async()=>{
    const w=setup();await assert.rejects(()=>vm.runInContext('('+extract('onlInit')[0]+')',w.ctx)(),e=>e.code==='session');
  });
  await test('guest raw save and reset use a separate key from the member save',async()=>{
    const disk=new Map([['damaworld.v1','{"coins":900}'],['damaworld.guest.v1','{"coins":150}']]);
    const w=setup();w.ctx.window.DAMA_AUTH.saveKey='damaworld.guest.v1';Object.assign(w.ctx,{
      S:{coins:175},localStorage:{setItem:(k,v)=>disk.set(k,v)}
    });
    const key=game.match(/const SAVE_KEY=[^;]+;/)[0];vm.runInContext(key+'\n'+extract('persist')[0]+'\npersist()',w.ctx);
    assert.equal(disk.get('damaworld.v1'),'{"coins":900}');assert.equal(JSON.parse(disk.get('damaworld.guest.v1')).coins,175);
    assert(game.includes("if(k==='reset'){try{localStorage.removeItem(SAVE_KEY)}"));
  });
  await test('member checks stay allowed and guest registration pauses world movement',async()=>{
    const member=setup(true);assert.equal(vm.runInContext('requirePlayAccount()',member.ctx),true);assert.equal(member.prompts(),0);
    const guest=setup();guest.ctx.window.DAMA_AUTH.promptOpen=true;
    vm.runInContext('('+extract('updatePlayer')[0]+')',guest.ctx)(1);
  });
  console.log(`${count} guest access checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
