const {spawnSync}=require('node:child_process');const path=require('node:path');
for(const file of ['test_rules.cjs','test_social_rules.cjs','test_community_rules.cjs']){const r=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit',env:process.env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1)}
