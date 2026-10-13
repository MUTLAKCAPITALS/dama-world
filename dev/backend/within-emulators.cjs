const {spawn,spawnSync}=require('node:child_process');
const path=require('node:path');
const net=require('node:net');
if(process.env.GCLOUD_PROJECT!=='demo-dama-world-backend'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8181'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Emulators required');
const root=path.resolve(__dirname,'../..'),servers=[];
function run(file){const r=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:root,stdio:'inherit',env:process.env});if(r.error)throw r.error;if(r.status!==0)throw Error(file+' failed')}
(async()=>{try{
  run('test_backend.cjs');run('test_client.cjs');
  const framework=path.join(__dirname,'node_modules/.bin/functions-framework');
  for(const [source,target,port,signature] of [['dev/backend','backendHttp',5001,'http'],['functions','damaCleanDeletedAccount',5003,'cloudevent']]){
    const child=spawn(process.execPath,[framework,'--source='+source,'--target='+target,'--port='+port,'--signature-type='+signature],{cwd:root,stdio:'inherit',env:process.env});servers.push(child);
    let ready=false;for(let attempt=0;attempt<60;attempt++){if(child.exitCode!==null)throw Error('Functions Framework exited');ready=await new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});const done=ok=>{socket.destroy();resolve(ok)};socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(500,()=>done(false))});if(ready)break;await new Promise(resolve=>setTimeout(resolve,100))}if(!ready)throw Error('Functions Framework startup timed out');
  }
  run('test_callable.cjs');
 }catch(e){console.error(e);process.exitCode=1}finally{for(const server of servers)server.kill('SIGTERM')}
})();
