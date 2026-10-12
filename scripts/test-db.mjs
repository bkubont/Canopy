import { spawnSync } from 'node:child_process';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const container = `canopy-policy-test-${process.pid}`;
// Digest verified during development. Disposable instance: no published ports or network.
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `docker exited ${result.status}`);
  return result.stdout;
}
try {
  docker(['run', '--rm', '-d', '--name', container, '--network', 'none',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  const deadline = Date.now() + 60000;
  while (true) {
    const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h','127.0.0.1','-U', 'postgres'], { stdio: 'ignore' });
    if (ready.status === 0) break;
    if (Date.now() > deadline) throw new Error('Disposable PostgreSQL did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const upgrades=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!f.startsWith('202610120001')).sort().map(f=>`supabase/migrations/${f}`);
  const files=['tests/database/bootstrap.sql','supabase/migrations/202610120001_foundation.sql',
    'tests/database/authorization.sql','tests/database/upgrade-fixture.sql',...upgrades,'tests/database/step2-authorization.sql'];
  for (const file of files) {
    const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
      input: readFileSync(file, 'utf8'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(`${file}:\n${result.stderr}`);
    if (file.endsWith('authorization.sql')) {
      const passes = result.stderr.match(/NOTICE:  PASS:/g) || [];
      if (!passes.length) throw new Error('No database assertions ran.');
      console.log(result.stderr.trim());
      console.log(`${passes.length} PostgreSQL authorization/business-rule assertions passed.`);
    }
  }
  docker(['exec',container,'createdb','-U','postgres','canopy_fresh']);
  for(const file of ['tests/database/bootstrap.sql','supabase/migrations/202610120001_foundation.sql',...upgrades,'tests/database/fresh-install.sql']){
    const checked=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','canopy_fresh','-v','ON_ERROR_STOP=1'],{
      input:readFileSync(file,'utf8'),encoding:'utf8',maxBuffer:4*1024*1024});
    if(checked.status!==0) throw new Error(`Fresh install ${file}:\n${checked.stderr}`);
    if(file.endsWith('fresh-install.sql')){
      const passes=checked.stderr.match(/NOTICE:  PASS:/g)||[];
      if(!passes.length)throw new Error('Fresh-install assertions did not run.');
      console.log(checked.stderr.trim());console.log(`${passes.length} fresh-install assertions passed.`);
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' }); }
