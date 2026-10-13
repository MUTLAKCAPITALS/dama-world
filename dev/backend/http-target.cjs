// Local Functions Framework routing only. Production exports stay in functions/index.cjs.
if(process.env.GCLOUD_PROJECT!=='demo-dama-world-backend'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Emulators required');
const entry=require('../../functions/index.cjs');
exports.backendHttp=(request,response)=>{
  const name=request.path.split('/').pop();
  if(name==='damaOnline'||name==='damaDeleteAccount')return entry[name](request,response);
  response.status(404).send('Not found');
};
