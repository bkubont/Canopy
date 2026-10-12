import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const cliEnv = { ...process.env, SUPABASE_HOME: process.env.SUPABASE_HOME || '/tmp/canopy-supabase-cli' };
const status = spawnSync('npx', ['--no-install','supabase','status','-o','json'], { encoding: 'utf8', env: cliEnv });
if (status.status !== 0) throw new Error('Start local Supabase before running integration tests.');
const settings = JSON.parse(status.stdout);
const url = settings.API_URL;
if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) {
  throw new Error('Integration tests refuse non-loopback APIs.');
}
const publicKey = settings.PUBLISHABLE_KEY || settings.ANON_KEY;
const adminKey = settings.SECRET_KEY || settings.SERVICE_ROLE_KEY;
if (!publicKey || !adminKey) throw new Error('Local public/admin key metadata unavailable.');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, adminKey, options);
const nonce = randomBytes(6).toString('hex');
const orgA = randomUUID(), orgB = randomUUID();
const users = [], signedIn = [];
let count = 0;
function pass(label) { count++; console.log(`PASS: ${label}`); }
async function result(request) {
  const response = await request;
  if (response.error) throw new Error(`Local integration request failed (${response.error.code || response.error.status || 'unknown'}).`);
  return response.data;
}
async function newUser(kind) {
  const email = `canopy-${nonce}-${kind}@example.test`;
  const password = `Sample-${randomBytes(24).toString('base64url')}`;
  const data = await result(admin.auth.admin.createUser({ email, password, email_confirm: true }));
  const fixture = { id: data.user.id, email, password };
  users.push(fixture);
  return fixture;
}
async function login(fixture) {
  const client = createClient(url, publicKey, options);
  signedIn.push(client);
  const data = await result(client.auth.signInWithPassword({ email: fixture.email, password: fixture.password }));
  assert.ok(data.session?.access_token, 'Actual Auth session must be issued.');
  return client;
}
try {
  const owner = await newUser('owner'), employee = await newUser('employee');
  const other = await newUser('other'), outsider = await newUser('outsider');
  const invites = {};
  for (const viewport of ['desktop','mobile']) {
    const email = `canopy-${nonce}-invite-${viewport}@example.test`;
    const invite = await result(admin.auth.admin.generateLink({ type: 'invite', email,
      options: { redirectTo: 'http://127.0.0.1:8765/dist/cloud.html' } }));
    users.push({ id: invite.user.id });
    invites[viewport] = { email, link: invite.properties.action_link,
      password: `Sample-${randomBytes(24).toString('base64url')}` };
  }
  await result(admin.from('organizations').insert([{ id: orgA, name: `Sample company ${nonce}` }, { id: orgB, name: `Other company ${nonce}` }]));
  await result(admin.from('memberships').insert([
    { organization_id: orgA, user_id: owner.id, role: 'owner' },
    { organization_id: orgA, user_id: employee.id, role: 'employee' },
    { organization_id: orgB, user_id: other.id, role: 'owner' },
  ]));
  const clientA = randomUUID(), clientB = randomUUID(), projectA = randomUUID(), hiddenA = randomUUID();
  await result(admin.from('clients').insert([
    { id: clientA, organization_id: orgA, name: `Assigned client ${nonce}` },
    { id: clientB, organization_id: orgB, name: `Other client ${nonce}` },
  ]));
  await result(admin.from('projects').insert([
    { id: projectA, organization_id: orgA, client_id: clientA, title: `Assigned job ${nonce}` },
    { id: hiddenA, organization_id: orgA, client_id: clientA, title: `Hidden job ${nonce}` },
  ]));
  const worker = randomUUID();
  await result(admin.from('workers').insert({ id: worker, organization_id: orgA, user_id: employee.id, name: 'Sample employee' }));
  await result(admin.from('project_assignments').insert({ organization_id: orgA, project_id: projectA, worker_id: worker }));

  const ownerClient = await login(owner), employeeClient = await login(employee);
  const otherClient = await login(other), outsiderClient = await login(outsider);
  pass('Real Supabase Auth signs in four synthetic provisioned accounts');
  const signup = await createClient(url, publicKey, options).auth.signUp({ email: `canopy-${nonce}-signup@example.test`, password: `Sample-${randomBytes(18).toString('hex')}` });
  assert.ok(signup.error, 'Public signup must be disabled'); pass('Public signup is disabled');
  const anon = createClient(url, publicKey, options);
  const anonymous = await anon.from('clients').select('id');
  assert.ok(anonymous.error); pass('Anonymous Data API read is denied');
  assert.equal((await result(ownerClient.from('clients').select('id'))).length, 1); pass('Owner REST reads are organization-scoped');
  assert.equal((await result(employeeClient.from('projects').select('id'))).length, 1); pass('Employee REST reads include only assigned jobs');
  assert.equal((await result(otherClient.from('clients').select('id'))).length, 1); pass('Other owner cannot read first company');
  assert.equal((await result(outsiderClient.from('memberships').select('user_id'))).length, 0); pass('Authenticated outsider has no company access');
  const employeeWrite = await employeeClient.from('clients').insert({ organization_id: orgA, name: 'Forbidden' });
  assert.equal(employeeWrite.error?.code, '42501'); pass('Employee REST write is denied by RLS');
  const foreignWrite = await ownerClient.from('clients').insert({ organization_id: orgB, name: 'Forbidden' });
  assert.equal(foreignWrite.error?.code, '42501'); pass('Forged organization in request is denied');
  const membershipWrite = await employeeClient.from('memberships').insert({ organization_id: orgB, user_id: employee.id, role: 'owner' });
  assert.equal(membershipWrite.error?.code, '42501'); pass('Self-provisioning/elevation is denied');
  const date = new Date().toISOString().slice(0,10);
  await result(ownerClient.rpc('change_project_stage', { target_project: projectA, new_stage: 'prep', event_date: date, expected_version: 1 }));
  const events = await result(employeeClient.from('events').select('kind,phase,work_date').eq('project_id', projectA));
  assert.ok(events.some(e => e.kind === 'stage' && e.phase === 'prep' && e.work_date === date));
  pass('Stage RPC persists a dated event visible on another authenticated device');
  const conflict = await ownerClient.rpc('change_project_stage', { target_project: projectA, new_stage: 'tree', event_date: date, expected_version: 1 });
  assert.equal(conflict.error?.code, '40001'); pass('REST stage RPC rejects stale version');
  const races = await Promise.all(['tree','cleanup'].map(new_stage => ownerClient.rpc('change_project_stage', {
    target_project: projectA, new_stage, event_date: date, expected_version: 2,
  })));
  assert.equal(races.filter(r => !r.error).length, 1);
  assert.equal(races.filter(r => r.error?.code === '40001').length, 1);
  pass('Concurrent stage writes commit exactly one change and reject the stale contender');
  const employeeStage = await employeeClient.rpc('change_project_stage', { target_project: projectA, new_stage: 'tree', event_date: date, expected_version: 2 });
  assert.equal(employeeStage.error?.code, '42501'); pass('Employee cannot bypass read-only policy through RPC');

  const buildEnv = { ...process.env, CANOPY_SUPABASE_URL: url, CANOPY_SUPABASE_PUBLISHABLE_KEY: publicKey };
  const build = spawnSync('node', ['scripts/build-cloud.mjs'], { env: buildEnv, encoding: 'utf8' });
  if (build.status !== 0) throw new Error('Local cloud build failed.');
  const browser = spawnSync('npx', ['--no-install','playwright','test','tests/browser'], {
    env: { ...buildEnv, CANOPY_TEST_FIXTURE: JSON.stringify({ owner, employee, outsider, invites,
      clientName: `Assigned client ${nonce}`, projectName: `Assigned job ${nonce}`, hiddenName: `Hidden job ${nonce}` }) },
    encoding: 'utf8', maxBuffer: 4*1024*1024,
  });
  // Test output never includes admin key or synthetic credentials; avoid provider status dumps.
  let output = browser.stdout;
  for (const secret of [adminKey, ...users.map(u => u.password),
    ...Object.values(invites).flatMap(i => [i.link, i.password])].filter(Boolean)) {
    output = output.split(secret).join('[redacted]');
  }
  output = output.replace(/(access_token|refresh_token|token|code)=([^&\s"']+)/g, '$1=[redacted]');
  process.stdout.write(output);
  if (browser.status !== 0) throw new Error('Browser smoke tests failed; inspect test-results locally.');
  pass('Desktop/mobile real-auth browser and V1 smoke tests pass');
  await result(admin.from('memberships').update({ active: false }).eq('organization_id', orgA).eq('user_id', employee.id));
  assert.equal((await result(employeeClient.from('projects').select('id'))).length, 0); pass('Membership revocation removes access with an existing JWT');
  await result(ownerClient.auth.signOut({ scope: 'local' }));
  const loggedOut = await ownerClient.from('clients').select('id');
  assert.ok(loggedOut.error); pass('SDK logout removes authenticated read capability');
  console.log(`${count} local Supabase integration assertions passed.`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  for (const client of signedIn) { await client.auth.signOut({ scope: 'local' }).catch(() => {}); }
  // Test cleanup requires privileged SQL because business history cannot be deleted by the API.
  // This targets only these random fixture organizations on the verified local stack.
  const tables = ['events','photos','notes','task_assignments','tasks','visit_assignments','visits',
    'phase_assignments','job_phases','project_assignments','projects','workers','clients','memberships'];
  const ids = `'${orgA}'::uuid,'${orgB}'::uuid`;
  const cleanup = `begin; set local session_replication_role=replica;\n${tables.map(table =>
    `delete from public.${table} where organization_id in (${ids});`).join('\n')}
    delete from public.organizations where id in (${ids}); commit;`;
  const removed = spawnSync('docker', ['exec','-i','supabase_db_Canopy','psql','-U','postgres','-v','ON_ERROR_STOP=1'], { input: cleanup, encoding: 'utf8' });
  if (removed.status !== 0) { console.error('Local fixture cleanup failed. Do not reset an unrelated database.'); process.exitCode = 1; }
  for (const user of users) {
    const response = await admin.auth.admin.deleteUser(user.id);
    if (response.error) { console.error('Local synthetic user cleanup failed.'); process.exitCode = 1; }
  }
}
