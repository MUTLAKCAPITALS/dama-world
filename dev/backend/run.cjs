const {spawnSync}=require('node:child_process');
const path=require('node:path');
const cli=require.resolve('../firebase/node_modules/firebase-tools/lib/bin/firebase.js');
{
  const r=spawnSync(process.execPath,[cli,'emulators:exec','--only','auth,firestore','--project','demo-dama-world-backend','node dev/backend/within-emulators.cjs'],{
    cwd:path.resolve(__dirname,'../..'),stdio:'inherit',env:{...process.env,CI:'true'}
  });
  if(r.error)throw r.error;if(r.status!==0)process.exitCode=r.status||1;
}
