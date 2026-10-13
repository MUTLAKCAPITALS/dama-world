"""Save-sync tests for DAMA WORLD (Playwright + local Firebase stand-in).
Usage: python3 test_save_sync.py <page.html> [case ...]   (server: python3 -m http.server 8765)
Exits 1 if any expectation fails or the page throws an error."""
import asyncio, json, sys, time
from playwright.async_api import async_playwright

PAGE = sys.argv[1] if len(sys.argv) > 1 else 'test_onl.html'
ONLY = set(sys.argv[2:])
BASE = 'http://localhost:8765/'
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
FAILS = []

def save_obj(coins, at, **kw):
    o = {'coins': coins, 'savedAt': at, 'editAt': at, 'name': 'MASTER', 'tutAsked': True,
         'settings': {'quality': 'low', 'noIntro': True}}
    o.update(kw); return o

INIT = r"""(seed=>{
  /* QuotaExceededError simulation for the game save key */
  const _set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(this===window.localStorage&&k==='damaworld.v1'&&_get.call(this,'shim:quota')){const e=new DOMException('quota','QuotaExceededError');throw e}return _set.call(this,k,v)};
  const _get=Storage.prototype.getItem;
  if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');
  sessionStorage.setItem('shimTab','t1');
  sessionStorage.setItem('shim:auth:t1',JSON.stringify(seed.auth));
  localStorage.setItem('shim:accts',JSON.stringify({'m@x.com':{pass:'123456',uid:'u_test'}}));
  _set.call(localStorage,'damaworld.v1',JSON.stringify(seed.local));
  localStorage.setItem('shim:users/u_test',JSON.stringify(seed.cloud));
  localStorage.setItem('shim:names/master',JSON.stringify({uid:'u_test',name:'MASTER'}));
  for(const k in seed.flags)localStorage.setItem(k,seed.flags[k]);
})"""

STATE = r"""()=>{const c=JSON.parse(localStorage.getItem('shim:users/u_test')||'{}');let cc=null;try{cc=JSON.parse(c.save).coins}catch(e){}
  let lc=null,le=null;try{const l=JSON.parse(localStorage.getItem('damaworld.v1'));lc=l.coins;le=l.editAt}catch(e){}
  return {game:typeof S!=='undefined'?S.coins:null,cloud:cc,cloudAt:c.saveAt,local:lc,localEditAt:le,synced:ACC.synced,last:ACC.lastSync||null,
    pending:localStorage.getItem('acc.pendingRestore'),loadedAt:sessionStorage.getItem('accLoadedAt'),serverGets:window.__shimServerGets||0}}"""

class Run:
    def __init__(s, b, name): s.b, s.name, s.errs, s.navs = b, name, [], 0
    async def start(s, auth, local, cloud, flags=None):
        s.ctx = await s.b.new_context(viewport={'width': 844, 'height': 390})
        seed = {'auth': auth, 'local': local, 'cloud': cloud, 'flags': flags or {}}
        await s.ctx.add_init_script(INIT + '(' + json.dumps(seed) + ')')
        s.pg = await s.ctx.new_page()
        s.pg.on('pageerror', lambda e: s.errs.append(str(e)[:160]))
        s.pg.on('framenavigated', lambda f: setattr(s, 'navs', s.navs + (1 if f == s.pg.main_frame else 0)))
        await s.pg.goto(BASE + PAGE, wait_until='commit')
        await s.settle()
    async def settle(s, extra=2500):
        for _ in range(120):
            try:
                if await s.pg.evaluate("typeof ACC!=='undefined'&&ACC.ready&&!ACC.reloading&&!!ACC.lastSync||(typeof ACC!=='undefined'&&ACC.ready&&ACC.anon)"): break
            except Exception: pass
            await asyncio.sleep(0.5)
        await asyncio.sleep(extra / 1000)
    async def ev(s, js):
        for _ in range(20):
            try: return await s.pg.evaluate(js)
            except Exception: await asyncio.sleep(0.5)
        return await s.pg.evaluate(js)
    async def state(s): return await s.ev(STATE)
    async def reload(s):
        await s.pg.reload(wait_until='commit'); await s.settle()
    def check(s, label, st, **exp):
        bad = {k: (st.get(k), v) for k, v in exp.items() if st.get(k) != v}
        ok = not bad
        print(f"  {'PASS' if ok else 'FAIL'}  {label}: " + ', '.join(f"{k}={st.get(k)!r}" for k in exp) + ('' if ok else f"   expected {', '.join(f'{k}={v[1]!r}' for k, v in bad.items())}"))
        if not ok: FAILS.append(f"{s.name} / {label}")
    async def done(s):
        if s.errs: print('  FAIL  page errors:', s.errs[:3]); FAILS.append(f"{s.name} / page errors")
        await s.ctx.close()

REG = {'uid': 'u_test', 'email': 'm@x.com', 'prov': 'password'}
GUEST = {'uid': 'g_guest', 'anon': True}
def cloud(coins, at): return {'name': 'MASTER', 'nameKey': 'master', 'saveAt': at, 'save': json.dumps(save_obj(coins, at))}

async def case_A(b):
    r = Run(b, 'A old local / newer cloud'); print(r.name)
    await r.start(REG, save_obj(150, 10000), cloud(900, 20000))
    r.check('cloud wins', await r.state(), game=900, cloud=900, synced=True); await r.done()

async def case_B(b):
    r = Run(b, 'B read fails then recovers'); print(r.name)
    await r.start(REG, save_obj(150, 10000), cloud(900, 20000), {'shim:failGet': '1'})
    r.check('read failed: keep local, do not write', await r.state(), game=150, cloud=900, synced=False, last='fail')
    await r.ev("localStorage.removeItem('shim:failGet');accSync()"); await r.settle()
    r.check('after recovery', await r.state(), game=900, cloud=900, synced=True); await r.done()

async def case_D(b):
    r = Run(b, 'D read fails + startup/real saves + page reload (review #1)'); print(r.name)
    await r.start(REG, save_obj(150, 10000), cloud(900, 20000), {'shim:failGet': '1'})
    await r.ev("persist();persist()")                 # startup-style saves with no progress change
    r.check('startup saves do not move editAt', await r.state(), local=150, localEditAt=10000, cloud=900)
    await r.ev("S.coins+=5;persist()")                 # a real edit while not synced
    r.check('unsynced real edit kept locally, base unchanged', await r.state(), local=155, localEditAt=10000, cloud=900)
    await r.reload()
    r.check('after reload (still offline)', await r.state(), game=155, cloud=900, synced=False)
    await r.ev("localStorage.removeItem('shim:failGet');accSync()"); await r.settle()
    r.check('connection back: newer cloud wins', await r.state(), game=900, cloud=900, synced=True); await r.done()

async def case_E(b, with_reload):
    tag = 'E2 restore + reload before recovery' if with_reload else 'E1 restore retry keeps context'
    r = Run(b, tag + ' (review #2)'); print(r.name)
    now = int(time.time() * 1000)
    await r.start(GUEST, save_obj(150, now), cloud(900, 20000), {'shim:failGet': '1'})
    await r.ev("(async()=>{await ONL.auth.signInWithEmailAndPassword('m@x.com','123456');await accAfterLogin(true)})()")
    await asyncio.sleep(1.5)
    r.check('login read failed: nothing uploaded, context saved', await r.state(), game=150, cloud=900, synced=False, pending='u_test')
    if with_reload:
        await r.reload()
        r.check('after reload (still offline)', await r.state(), cloud=900, synced=False, pending='u_test')
        await r.ev("localStorage.removeItem('shim:failGet');accSync()"); await r.settle()
    else:
        await r.ev("localStorage.removeItem('shim:failGet')"); await asyncio.sleep(7); await r.settle()
    r.check('account restored, guest data not uploaded', await r.state(), game=900, cloud=900, synced=True, pending=None); await r.done()

async def case_F(b):
    r = Run(b, 'F QuotaExceededError while restoring (review #3)'); print(r.name)
    await r.start(REG, save_obj(150, 10000), cloud(900, 20000), {'shim:quota': '1'})
    await asyncio.sleep(3)
    st = await r.state()
    r.check('no reload, no success recorded, nothing uploaded', st, local=150, cloud=900, synced=False, loadedAt=None, last='adopt-fail')
    r.check('page did not reload', {'navs': r.navs}, navs=1); await r.done()

async def case_G(b):
    r = Run(b, 'G server unreachable, stale cache available (review #4)'); print(r.name)
    stale = {'name': 'MASTER', 'nameKey': 'master', 'saveAt': 5, 'save': json.dumps(save_obj(150, 5))}
    await r.start(REG, save_obj(150, 10000), cloud(900, 20000), {'shim:serverDown': '1', 'shim:cache:users/u_test': json.dumps(stale)})
    st = await r.state()
    r.check('cache not trusted: no upload', st, game=150, cloud=900, synced=False, last='fail')
    r.check('read was requested from server', {'srv': st['serverGets'] > 0}, srv=True); await r.done()

async def case_C(b):
    r = Run(b, 'C newer local / older cloud'); print(r.name)
    now = int(time.time() * 1000)
    await r.start(REG, save_obj(500, now - 60000), cloud(900, 20000))
    r.check('local wins and uploads', await r.state(), game=500, cloud=500, synced=True); await r.done()

async def case_H(b):
    r = Run(b, 'H guest registers a new account (no regression)'); print(r.name)
    now = int(time.time() * 1000)
    await r.start(GUEST, save_obj(150, now - 1000), cloud(900, 20000))
    await r.ev("(async()=>{const cr=firebase.auth.EmailAuthProvider.credential('new@x.com','123456');await ONL.auth.currentUser.linkWithCredential(cr);await accAfterLogin(false)})()")
    await asyncio.sleep(2)
    st = await r.ev("""()=>{let c=null;try{c=JSON.parse(JSON.parse(localStorage.getItem('shim:users/g_guest')).save).coins}catch(e){}return {game:S.coins,newCloud:c,synced:ACC.synced,existing:JSON.parse(JSON.parse(localStorage.getItem('shim:users/u_test')).save).coins}}""")
    r.check('guest progress saved to the new account; other account untouched', st, game=150, newCloud=150, synced=True, existing=900); await r.done()

CASES = {'A': case_A, 'B': case_B, 'C': case_C, 'D': case_D, 'E1': lambda b: case_E(b, False),
         'E2': lambda b: case_E(b, True), 'F': case_F, 'G': case_G, 'H': case_H}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for k, fn in CASES.items():
            if ONLY and k not in ONLY: continue
            await fn(b)
        await b.close()
    print('\nRESULT:', 'ALL PASSED' if not FAILS else f'{len(FAILS)} FAILED -> ' + '; '.join(FAILS))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
