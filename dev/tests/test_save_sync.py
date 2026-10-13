import asyncio,sys,json,time
from playwright.async_api import async_playwright
PAGE=sys.argv[1]
DAY=86400000
async def scenario(b,name,local_coins,local_at,cloud_coins,cloud_at,fail=False):
    ctx=await b.new_context(viewport={'width':844,'height':390})
    seed={'local':{'coins':local_coins,'savedAt':local_at,'name':'MASTER','lastLogin':'','tutAsked':True,'settings':{'quality':'low','noIntro':True}},
          'cloud':{'name':'MASTER','nameKey':'master','saveAt':cloud_at,'save':json.dumps({'coins':cloud_coins,'savedAt':cloud_at,'name':'MASTER','tutAsked':True,'settings':{'quality':'low','noIntro':True}})},'fail':fail}
    await ctx.add_init_script("""(seed=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');
      sessionStorage.setItem('shimTab','t1');sessionStorage.setItem('shim:auth:t1',JSON.stringify({uid:'u_test',email:'m@x.com',prov:'password'}));
      localStorage.setItem('shim:accts',JSON.stringify({'m@x.com':{pass:'123456',uid:'u_test'}}));
      localStorage.setItem('damaworld.v1',JSON.stringify(seed.local));localStorage.setItem('shim:users/u_test',JSON.stringify(seed.cloud));
      localStorage.setItem('shim:names/master',JSON.stringify({uid:'u_test',name:'MASTER'}));if(seed.fail)localStorage.setItem('shim:failGet','1')})("""+json.dumps(seed)+")")
    pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:120]))
    loads=[0];pg.on('load',lambda:loads.__setitem__(0,loads[0]+1))
    await pg.goto('http://localhost:8765/'+PAGE,wait_until='commit')
    await pg.wait_for_function("typeof S!=='undefined'&&typeof ACC!=='undefined'",timeout=120000)
    await pg.wait_for_timeout(9000)   # boot + account read + any reload + upload window
    await pg.wait_for_function("typeof S!=='undefined'&&typeof ACC!=='undefined'",timeout=120000);await pg.wait_for_timeout(4000)
    st=await pg.evaluate("""()=>{const c=JSON.parse(localStorage.getItem('shim:users/u_test')||'{}');let cc=null;try{cc=JSON.parse(c.save).coins}catch(e){}
      return {game_coins:S.coins,cloud_coins:cc,synced:ACC.synced===undefined?'(n/a)':ACC.synced}}""")
    print(f"{name}: page loads={loads[0]} ->",st,'errors',errs[:2])
    if fail:
        await pg.evaluate("localStorage.removeItem('shim:failGet');accSync()");await pg.wait_for_timeout(1500)
        await pg.wait_for_function("typeof S!=='undefined'&&typeof ACC!=='undefined'",timeout=120000);await pg.wait_for_timeout(4000)
        st=await pg.evaluate("""()=>{const c=JSON.parse(localStorage.getItem('shim:users/u_test')||'{}');let cc=null;try{cc=JSON.parse(c.save).coins}catch(e){}return {game_coins:S.coins,cloud_coins:cc,synced:ACC.synced}}""")
        print(f"   after server came back: page loads={loads[0]} ->",st)
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        now=int(time.time()*1000)
        await scenario(b,'A old local 150 / newer cloud 900',150,now-DAY,900,now-3600000)
        if len(sys.argv)>2:
            await scenario(b,'B cloud read fails (local 150, cloud 900)',150,now-DAY,900,now-3600000,fail=True)
            await scenario(b,'C newer local 500 / older cloud 900',500,now-60000,900,now-DAY)
        await b.close()
asyncio.run(main())
