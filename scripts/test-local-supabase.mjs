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
let storagePath=null;
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
  const lead=await newUser('lead'), manager=await newUser('admin');
  const invites = {};
  const recovery={};
  for (const viewport of ['desktop','mobile']) {
    recovery[viewport]=await newUser(`recovery-${viewport}`);
    recovery[viewport].newPassword=`Sample-${randomBytes(24).toString('base64url')}`;
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
    { organization_id: orgA, user_id: employee.id, role: 'worker' },
    { organization_id: orgA, user_id: lead.id, role: 'crew_lead' },
    { organization_id: orgA, user_id: manager.id, role: 'admin' },
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
  const crew=randomUUID(),leadWorker=randomUUID();
  await result(admin.from('workers').insert({id:leadWorker,organization_id:orgA,user_id:lead.id,name:'Sample lead'}));
  await result(admin.from('crews').insert({id:crew,organization_id:orgA,name:'Sample independent crew'}));
  await result(admin.from('crew_memberships').insert([
    {organization_id:orgA,crew_id:crew,worker_id:worker},{organization_id:orgA,crew_id:crew,worker_id:leadWorker}]));
  await result(admin.from('project_crew_assignments').insert({organization_id:orgA,project_id:projectA,crew_id:crew}));

  const ownerClient = await login(owner), employeeClient = await login(employee);
  const otherClient = await login(other), outsiderClient = await login(outsider);
  const leadClient=await login(lead),managerClient=await login(manager);
  pass('Real Supabase Auth authenticates provisioned owner/admin/crew-lead/worker accounts');
  const signup = await createClient(url, publicKey, options).auth.signUp({ email: `canopy-${nonce}-signup@example.test`, password: `Sample-${randomBytes(18).toString('hex')}` });
  assert.ok(signup.error, 'Public signup must be disabled'); pass('Public signup is disabled');
  const anon = createClient(url, publicKey, options);
  const anonymous = await anon.from('clients').select('id');
  assert.ok(anonymous.error); pass('Anonymous Data API read is denied');
  assert.equal((await result(ownerClient.from('clients').select('id'))).length, 1); pass('Owner REST reads are organization-scoped');
  assert.equal((await result(employeeClient.from('projects').select('id'))).length, 1); pass('Worker REST reads include only assigned jobs');
  assert.equal((await result(employeeClient.from('clients').select('id,details,email'))).length,0);pass('Worker cannot read raw client private/contact data');
  assert.equal((await result(leadClient.from('projects').select('id'))).length,1);pass('Crew lead sees crew-assigned jobs without direct assignment');
  assert.equal((await result(outsiderClient.from('user_profiles').select('user_id'))).length,1);pass('Profile reads are limited to self or shared organization');
  storagePath=`${orgA}/${projectA}/${randomUUID()}.png`;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=','base64');
  await result(admin.storage.from('canopy-photos').upload(storagePath,png,{contentType:'image/png'}));
  for(const client of [ownerClient,employeeClient,outsiderClient]){
    const download=await client.storage.from('canopy-photos').download(storagePath);
    assert.ok(download.error,'Direct browser download must be blocked before verified server pipeline');
    const signed=await client.storage.from('canopy-photos').createSignedUrl(storagePath,3600);
    assert.ok(signed.error,'Browser must not mint revocation-bypassing long-lived signed URLs');
  }
  pass('Real Storage API denies private downloads and long-lived signing for browser roles');
  const directUpload=await employeeClient.storage.from('canopy-photos').upload(`${orgA}/forged.png`,png,{contentType:'image/png'});
  assert.ok(directUpload.error);pass('Real Storage API denies unverified worker uploads');
  const publicChange=await ownerClient.storage.updateBucket('canopy-photos',{public:true});
  assert.ok(publicChange.error,'Application owner must not be able to expose private bucket bytes');
  const protectedBucket=await result(admin.storage.getBucket('canopy-photos'));
  assert.equal(protectedBucket.public,false);pass('Real Storage API prevents application owner from making protected bucket public');
  assert.equal((await result(otherClient.from('clients').select('id'))).length, 1); pass('Other owner cannot read first company');
  assert.equal((await result(outsiderClient.from('memberships').select('user_id'))).length, 0); pass('Authenticated outsider has no company access');
  const employeeWrite = await employeeClient.from('clients').insert({ organization_id: orgA, name: 'Forbidden' });
  assert.equal(employeeWrite.error?.code, '42501'); pass('Worker client creation is denied by RLS');
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
  assert.equal(employeeStage.error?.code, '42501'); pass('Worker cannot bypass progress-change permission through RPC');
  await result(employeeClient.rpc('record_phase_work',{target_project:projectA,work_phase:'prep',event_date:date,description:'Authorized worker actual work'}));
  await result(employeeClient.rpc('add_project_note',{target_project:projectA,note_body:'Authorized worker note'}));
  pass('Real worker token can record actual work and notes for assigned job');
  const progressed=await result(ownerClient.from('projects').select('version').eq('id',projectA).single());
  await result(leadClient.rpc('change_project_progress',{target_project:projectA,new_progress:'complete',event_date:date,expected_version:progressed.version}));
  pass('Real crew-lead token can update authorized work progress');
  const leadSchedule=await leadClient.rpc('change_project_schedule',{target_project:projectA,new_status:'cancelled',event_date:date,expected_version:progressed.version+1});
  assert.equal(leadSchedule.error?.code,'42501');pass('Crew lead cannot change administrative scheduling status');
  const edge=async(client,body)=>{
    const {data:auth}=await client.auth.getSession();
    const response=await fetch(`${url}/functions/v1/account-admin`,{method:'POST',
      headers:{apikey:publicKey,Authorization:`Bearer ${auth.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  };
  const denied=await edge(employeeClient,{action:'membership',organization_id:orgA,user_id:employee.id,role:'owner',active:true,actor:owner.id});
  assert.equal(denied.status,403);pass('Real Edge Runtime denies worker escalation and ignores forged actor');
  const lastOwner=await edge(ownerClient,{action:'membership',organization_id:orgA,user_id:owner.id,role:'worker',active:true});
  assert.equal(lastOwner.status,409);pass('Real Edge Runtime protects last active owner');
  const adminPromote=await edge(managerClient,{action:'membership',organization_id:orgA,user_id:employee.id,role:'admin',active:true});
  assert.equal(adminPromote.status,403);pass('Admin cannot grant administrative privileges');
  const malformed=await edge(ownerClient,{action:'invite',organization_id:orgA,email:'invalid',role:'worker',request_id:randomUUID()});
  assert.equal(malformed.status,400);pass('Edge invitation validates input before delivery');
  const foreignInvite=await edge(ownerClient,{action:'invite',organization_id:orgB,email:`canopy-${nonce}-foreign@example.test`,role:'worker',request_id:randomUUID()});
  assert.equal(foreignInvite.status,403);pass('Edge invitation cannot target another company');
  const inviteEmail=`canopy-${nonce}-edge-invite@example.test`,requestId=randomUUID();
  const delivered=await edge(ownerClient,{action:'invite',organization_id:orgA,email:inviteEmail,role:'worker',request_id:requestId});
  assert.equal(delivered.status,200,`Local Edge invitation failed with status ${delivered.status}`);
  const invitation=await result(admin.from('organization_invitations').select('id,invited_user_id,status').eq('id',delivered.data.invitation_id).single());
  users.push({id:invitation.invited_user_id});
  assert.equal(invitation.status,'sent');
  assert.equal((await result(admin.from('memberships').select('user_id').eq('user_id',invitation.invited_user_id))).length,0);
  pass('Edge sends real local invitation without granting premature company access');
  const replay=await edge(ownerClient,{action:'invite',organization_id:orgA,email:inviteEmail,role:'worker',request_id:requestId});
  assert.equal(replay.status,200);assert.equal(replay.data.invitation_id,invitation.id);pass('Invitation request retry is idempotent');
  const mailOrigin=settings.MAILPIT_URL || settings.INBUCKET_URL;
  const messages=await (await fetch(`${mailOrigin}/api/v1/messages`)).json();
  const message=messages.messages.find(m=>m.To?.some(t=>t.Address===inviteEmail));
  assert.ok(message,'Invitation must actually reach local SMTP inbox.');
  const mail=await (await fetch(`${mailOrigin}/api/v1/message/${message.ID}`)).json();
  const link=mail.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll('&amp;','&');
  assert.ok(link,'Provider invitation email must include verification link');
  // Resolve the actual emailed one-time token through Auth (no synthetic session).
  const verified=await fetch(link,{redirect:'manual'});
  const callback=verified.headers.get('location');
  assert.ok(callback,'Auth should redirect to approved application after verification');
  const fragment=new URLSearchParams(new URL(callback).hash.slice(1));
  const recipient=createClient(url,publicKey,options);signedIn.push(recipient);
  await result(recipient.auth.setSession({access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token')}));
  await result(recipient.rpc('accept_organization_invitation',{invite:invitation.id}));
  assert.equal((await result(recipient.from('memberships').select('role')))[0].role,'worker');
  pass('Actual emailed invitation verifies identity and activates only the invited role');
  const revoked=await edge(ownerClient,{action:'membership',organization_id:orgA,user_id:invitation.invited_user_id,role:'worker',active:false});
  assert.equal(revoked.status,200);assert.equal((await result(recipient.from('memberships').select('role'))).length,0);
  pass('Admin Edge operation revokes access for an existing recipient session');

  const buildEnv = { ...process.env, CANOPY_SUPABASE_URL: url, CANOPY_SUPABASE_PUBLISHABLE_KEY: publicKey };
  const build = spawnSync('node', ['scripts/build-cloud.mjs'], { env: buildEnv, encoding: 'utf8' });
  if (build.status !== 0) throw new Error('Local cloud build failed.');
  const browser = spawnSync('npx', ['--no-install','playwright','test','tests/browser'], {
    env: { ...buildEnv, CANOPY_TEST_FIXTURE: JSON.stringify({ owner, employee, outsider, invites,recovery,mailOrigin,
      uiInvitePrefix:`canopy-${nonce}-ui-invite`,organizationName:`Sample company ${nonce}`,
      clientName: `Assigned client ${nonce}`, projectName: `Assigned job ${nonce}`, hiddenName: `Hidden job ${nonce}` }) },
    encoding: 'utf8', maxBuffer: 4*1024*1024,
  });
  // Test output never includes admin key or synthetic credentials; avoid provider status dumps.
  let output = browser.stdout;
  for (const secret of [adminKey, ...users.map(u => u.password),
    ...Object.values(invites).flatMap(i => [i.link, i.password]),...Object.values(recovery).map(r=>r.newPassword)].filter(Boolean)) {
    output = output.split(secret).join('[redacted]');
  }
  output = output.replace(/(access_token|refresh_token|token|code)=([^&\s"']+)/g, '$1=[redacted]');
  process.stdout.write(output);
  if (browser.status !== 0) throw new Error('Browser smoke tests failed; inspect test-results locally.');
  pass('Desktop/mobile real-auth browser and V1 smoke tests pass');
  await result(admin.from('memberships').update({ active: false }).eq('organization_id', orgA).eq('user_id', employee.id));
  assert.equal((await result(employeeClient.from('projects').select('id'))).length, 0); pass('Membership revocation removes access with an existing JWT');
  const revokedWork=await employeeClient.rpc('record_phase_work',{target_project:projectA,work_phase:'prep',event_date:date,description:'Revoked request'});
  assert.equal(revokedWork.error?.code,'42501');pass('Revoked real worker JWT cannot write through security-definer work RPC');
  await result(ownerClient.auth.signOut({ scope: 'local' }));
  const loggedOut = await ownerClient.from('clients').select('id');
  assert.ok(loggedOut.error); pass('SDK logout removes authenticated read capability');
  console.log(`${count} local Supabase integration assertions passed.`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  // Also collect accounts created by actual browser invitations, scoped to this run's random namespace.
  const owned=await admin.auth.admin.listUsers({page:1,perPage:1000});
  if(owned.error){console.error('Local synthetic account discovery failed.');process.exitCode=1;}
  else for(const user of owned.data.users){
    if(user.email?.startsWith(`canopy-${nonce}-`)&&!users.some(u=>u.id===user.id))users.push({id:user.id});
  }
  if(storagePath){const removedObject=await admin.storage.from('canopy-photos').remove([storagePath]);
    if(removedObject.error){console.error('Local private object cleanup failed.');process.exitCode=1;}}
  for (const client of signedIn) { await client.auth.signOut({ scope: 'local' }).catch(() => {}); }
  // Test cleanup requires privileged SQL because business history cannot be deleted by the API.
  // This targets only these random fixture organizations on the verified local stack.
  const tables = ['account_audit','organization_invitations','events','photos','notes','task_crew_assignments','task_assignments','tasks','visit_crew_assignments','visit_assignments','visits',
    'phase_assignments','job_phases','project_crew_assignments','project_assignments','projects','crew_memberships','crews','workers','clients','memberships'];
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
