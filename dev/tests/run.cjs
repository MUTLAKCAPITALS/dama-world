const {spawnSync}=require('node:child_process');const path=require('node:path');
for(const name of ['test_auth_start.cjs','test_guest_access.cjs','test_save_sync.cjs','test_reliability.cjs','test_free_usage.cjs','test_power_save.cjs','test_mobile_ui.cjs','test_real_social.cjs','test_community.cjs','test_voice.cjs','test_world_mp.cjs']){
  const result=spawnSync(process.execPath,[path.join(__dirname,name)],{stdio:'inherit'});
  if(result.error||result.status!==0)process.exit(result.status||1);
}
console.log('All suites passed. These tests use stand-ins, not the production Firebase project or a WebGL device.');
