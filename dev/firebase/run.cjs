const {spawnSync}=require('node:child_process');
const path=require('node:path');
const cli=require.resolve('firebase-tools/lib/bin/firebase.js');
const result=spawnSync(process.execPath,[cli,'emulators:exec','--only','firestore','--project','demo-dama-world-rules','node dev/firebase/test_rules.cjs'],{
  cwd:path.resolve(__dirname,'../..'),stdio:'inherit',env:{...process.env,CI:'true'}
});
if(result.error)throw result.error;
process.exitCode=result.status??1;
