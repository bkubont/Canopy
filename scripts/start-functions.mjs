import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const built=spawnSync('node',['scripts/build-edge.mjs'],{stdio:'inherit'});
if(built.status!==0) process.exitCode=built.status||1;
else{
  const args=['--no-install','supabase','functions','serve','account-admin'];
  if(process.env.CANOPY_EDGE_ENV_FILE)args.push('--env-file',process.env.CANOPY_EDGE_ENV_FILE);
  const served=spawnSync('npx',args,{stdio:'inherit',env:process.env});
  process.exitCode=served.status??1;
}
