import { createClient } from '@supabase/supabase-js';

const config = __CANOPY_CONFIG__;
const supabase = createClient(config.url, config.key, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(15000) }) },
});
const root = document.getElementById('app');
let session = null, memberships = [], organization = null, generation = 0;
let busy = false, passwordSetup = false, passwordRecovery = false, pendingInvitations = [], profileName='';
const text = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function notice(message, error = false) {
  const el = document.getElementById(error ? 'error' : 'status');
  if (el) el.textContent = message;
}
function frame(body) {
  root.innerHTML = `<h1>Canopy</h1>${body}<p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>`;
  root.setAttribute('aria-busy', 'false');
}
function setBusy(value) {
  busy = value;
  root.setAttribute('aria-busy', String(value));
  root.querySelectorAll('button, input, select').forEach(el => { el.disabled = value; });
}
function login() {
  frame(`<h2>Sign in to your workspace</h2>
    <p>Accounts are provisioned by your administrator. Your local V1 records stay in this browser and are not uploaded.</p>
    <form id="login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254">
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button></form><button id="recover-password">Forgot password?</button>
    ${passwordRecovery ? `<form id="recovery-form"><label for="recovery-email">Recovery email</label>
      <input id="recovery-email" name="email" type="email" autocomplete="email" required maxlength="254">
      <button type="submit">Send recovery email</button></form>` : ''}`);
}
function workspace() {
  const member = memberships.find(m => m.organization_id === organization);
  const admin = member && ['owner', 'admin'].includes(member.role);
  frame(`<div class="toolbar"><h2>Shared workspace</h2><button id="logout">Sign out</button></div>
    <p class="muted">Authentication and shared records preview. The full planner remains in V1.</p>
    ${pendingInvitations.length ? `<section><h3>Workspace invitations</h3>${pendingInvitations.map(i =>
      `<div class="record">${text(i.organization_name)} · ${text(i.role)} <button data-accept="${text(i.id)}">Accept invitation</button></div>`).join('')}</section>` : ''}
    ${memberships.length ? `<label for="organization">Organization</label><select id="organization">${memberships.map(m =>
      `<option value="${text(m.organization_id)}" ${m.organization_id === organization ? 'selected' : ''}>${text(m.organizations.name)} · ${text(m.role)}</option>`).join('')}</select>` :
      '<p>No organization access. Ask your administrator to provision an active membership.</p>'}
    <button id="change-password">Set or change password</button>
    <form id="profile-form"><label for="display-name">Your display name</label>
    <input id="display-name" name="display_name" maxlength="160" value="${text(profileName)}">
    <button type="submit">Save display name</button></form>
    ${passwordSetup ? `<form id="password-form"><label for="new-password">New password (at least 12 characters)</label>
      <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" required>
      <button type="submit">Save password</button></form>` : ''}
    ${member ? `<button id="refresh">Refresh records</button>
      <section><h3>Clients</h3><div id="clients">Loading…</div></section>
      <section><h3>Projects</h3><div id="projects">Loading…</div></section>
      ${admin ? `<form id="client-form"><h3>Add client</h3><label for="client-name">Client name</label>
        <input id="client-name" name="name" required maxlength="160">
        <label for="client-phone">Phone</label><input id="client-phone" name="phone" type="tel" maxlength="80">
        <label for="client-email">Client email</label><input id="client-email" name="email" type="email" maxlength="254">
        <label for="client-address">Address</label><input id="client-address" name="address" maxlength="1000">
        <button type="submit">Save client</button></form>
        <form id="invite-form"><h3>Invite a team member</h3><label for="invite-email">Team member email</label>
        <input id="invite-email" name="email" type="email" required maxlength="254">
        <label for="invite-role">Team member role</label><select id="invite-role" name="role">
        <option value="worker">Worker</option><option value="crew_lead">Crew lead</option>
        ${member.role === 'owner' ? '<option value="admin">Admin</option>' : ''}</select>
        <button type="submit">Send invitation</button><button type="button" id="new-invitation-request">Start a new invitation request</button></form>
        <section><h3>Team access</h3><div id="members">Loading…</div></section>
        <section><h3>Sent invitations</h3><div id="sent-invitations">Loading…</div></section>` :
      '<p>Your assigned jobs are shown here.</p>'}` : ''}`);
}

async function refresh() {
  const ticket = generation, org = organization;
  if (!org || !session) return;
  notice('Loading records…');
  const [clients, projects] = await Promise.all([
    ['owner','admin'].includes(memberships.find(m=>m.organization_id===org)?.role)
      ? supabase.from('clients').select('id,name,phone,email,address').eq('organization_id',org).order('name').limit(100)
      : Promise.resolve({data:[],error:null}),
    supabase.from('projects').select('id,title,schedule_status,work_progress,version').eq('organization_id', org).order('created_at', { ascending: false }).limit(100),
  ]);
  if (ticket !== generation || org !== organization || !session) return;
  if (clients.error || projects.error) {
    document.getElementById('clients').textContent = 'Records unavailable.';
    document.getElementById('projects').textContent = 'Records unavailable.';
    throw clients.error || projects.error;
  }
  document.getElementById('clients').innerHTML = clients.data.map(c =>
    `<div class="record"><strong>${text(c.name)}</strong><p>${text([c.phone, c.email, c.address].filter(Boolean).join(' · '))}</p></div>`).join('') || '<p>No permitted clients.</p>';
  document.getElementById('projects').innerHTML = projects.data.map(p =>
    `<div class="record"><strong>${text(p.title)}</strong><p>${text(p.schedule_status)} · ${text(p.work_progress || 'No work progress')}</p></div>`).join('') || '<p>No permitted projects.</p>';
  const member = memberships.find(m=>m.organization_id===org);
  if (['owner','admin'].includes(member?.role)) {
    const team=await supabase.rpc('admin_team_members',{org});
    if (ticket!==generation || org!==organization) return;
    if(team.error) throw team.error;
    document.getElementById('members').innerHTML=team.data.map(m=>{
      const name=m.display_name || m.email;
      const manageable=member.role==='owner' || !['owner','admin'].includes(m.role);
      return `<div class="record"><strong>${text(name)}</strong> · ${text(m.role)} · ${m.active?'Active':'Revoked'}
        ${manageable ? `<select aria-label="Role for ${text(name)}" data-member-role="${text(m.user_id)}">
          ${(member.role==='owner'?['owner','admin','crew_lead','worker']:['crew_lead','worker']).map(r=>`<option value="${r}" ${r===m.role?'selected':''}>${r}</option>`).join('')}</select>
          <button data-member="${text(m.user_id)}" data-active="${m.active}">${m.active?'Revoke access':'Restore access'}</button>
          <button data-save-role="${text(m.user_id)}" data-active="${m.active}">Save role</button>`:''}</div>`;
    }).join('');
    const invitations=await supabase.from('organization_invitations').select('id,email,role,status').eq('organization_id',org).order('created_at',{ascending:false}).limit(100);
    if(ticket!==generation || org!==organization) return;
    if(invitations.error) throw invitations.error;
    document.getElementById('sent-invitations').innerHTML=invitations.data.map(i=>
      `<div class="record">${text(i.email)} · ${text(i.role)} · ${text(i.status)}
      ${['pending','sent'].includes(i.status)&&(member.role==='owner'||i.role!=='admin')?`<button data-revoke-invite="${text(i.id)}">Revoke invitation</button>`:''}</div>`).join('') || '<p>No invitations.</p>';
  } else {
    const jobs=await supabase.rpc('field_jobs',{org});
    if(ticket!==generation || org!==organization) return;
    if(jobs.error) throw jobs.error;
    document.getElementById('clients').innerHTML=jobs.data.map(j=>`<div class="record">${text(j.client_name)} · ${text(j.address)}</div>`).join('') || '<p>No assigned client sites.</p>';
  }
  notice('Records refreshed. Showing up to 100 clients and 100 projects.');
}

async function applySession(next, event) {
  // Token refresh changes no account or membership. Recheck membership on manual refresh.
  if (session?.user.id === next?.user.id && event === 'TOKEN_REFRESHED') { session = next; return; }
  const ticket = ++generation;
  session = next;
  memberships = []; organization = null; pendingInvitations=[]; busy = false;
  if (!next) { passwordSetup = false; login(); return; }
  if (event === 'PASSWORD_RECOVERY') passwordSetup = true;
  frame('<h2>Checking organization access…</h2><button id="logout">Sign out</button>');
  try {
    const { data, error } = await supabase.from('memberships')
      .select('organization_id,role,organizations(name)').eq('user_id', next.user.id).eq('active', true);
    if (ticket !== generation) return;
    if (error) throw error;
    memberships = data;
    const invitations=await supabase.rpc('available_invitations');
    if(ticket!==generation) return;
    if(invitations.error) throw invitations.error;
    pendingInvitations=invitations.data;
    const profile=await supabase.from('user_profiles').select('display_name').eq('user_id',next.user.id).single();
    if(ticket!==generation) return;
    if(profile.error) throw profile.error;
    profileName=profile.data.display_name;
    organization = memberships[0]?.organization_id || null;
    workspace();
  } catch {
    if (ticket !== generation) return;
    workspace();
    notice('Could not load organization access. Try signing out and signing in again.', true);
    return;
  }
  try { await refresh(); }
  catch { if (ticket === generation) notice('Could not load shared records. Use Refresh records to retry.', true); }
}

async function action(operation, success = '') {
  if (busy) return;
  const ticket = generation;
  notice('', true); setBusy(true);
  try { await operation(); if (ticket === generation && success) notice(success); }
  catch (error) {
    if (ticket === generation) notice(error.message || 'Request failed. Please retry.', true);
  } finally { if (ticket === generation) setBusy(false); }
}

root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, values = Object.fromEntries(new FormData(form));
  if (form.id === 'login') action(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) throw new Error('Sign-in failed. Check your credentials or contact your administrator.');
  });
  if (form.id === 'password-form') action(async () => {
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) throw error;
    form.reset(); passwordSetup = false;
  }, 'Password updated.');
  if(form.id==='recovery-form') action(async()=>{
    const {error}=await supabase.auth.resetPasswordForEmail(values.email,{redirectTo:location.origin+location.pathname});
    if(error) throw new Error('Recovery request unavailable. Try again or contact your administrator.');
    form.reset();
  },'If this email belongs to an eligible account, a recovery link will arrive shortly.');
  if(form.id==='invite-form') action(async()=>{
    const payload=JSON.stringify([organization,values.email,values.role]);
    if(form.dataset.requestPayload!==payload){delete form.dataset.requestId;form.dataset.requestPayload=payload;}
    const requestId=form.dataset.requestId || (form.dataset.requestId=crypto.randomUUID());
    await accountOperation({action:'invite',organization_id:organization,email:values.email,role:values.role,request_id:requestId});
    delete form.dataset.requestId; form.reset(); await refresh();
  },'Invitation sent. Company access is granted only after acceptance.');
  if(form.id==='profile-form') action(async()=>{
    const {error}=await supabase.from('user_profiles').update({display_name:values.display_name}).eq('user_id',session.user.id);
    if(error) throw error;
    profileName=values.display_name;
  },'Display name saved.');
  if (form.id === 'client-form') action(async () => {
    const { error } = await supabase.from('clients').insert({ organization_id: organization, ...values });
    if (error) throw error;
    form.reset(); await refresh();
  }, 'Client saved to the shared database.');
});
root.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || busy) return;
  if(button.id==='recover-password'){passwordRecovery=true;login();}
  if(button.id==='new-invitation-request'){delete document.getElementById('invite-form').dataset.requestId;notice('A new invitation request will be created when you send.');}
  if(button.dataset.revokeInvite) action(async()=>{
    await accountOperation({action:'revoke_invitation',invitation_id:button.dataset.revokeInvite});await refresh();
  },'Invitation revoked.');
  if(button.dataset.accept) action(async()=>{
    const {error}=await supabase.rpc('accept_organization_invitation',{invite:button.dataset.accept});
    if(error) throw error;
    await applySession(session,'INVITATION_ACCEPTED');
  });
  if(button.dataset.member || button.dataset.saveRole) action(async()=>{
    const userId=button.dataset.member || button.dataset.saveRole;
    const role=root.querySelector(`[data-member-role="${userId}"]`).value;
    const active=button.dataset.member?button.dataset.active!=='true':button.dataset.active==='true';
    await accountOperation({action:'membership',organization_id:organization,user_id:userId,role,active});
    await applySession(session,'MEMBERSHIP_UPDATED');
  });
  if (button.id === 'logout') action(async () => {
    // Revoke the server refresh session before clearing this UI. An error is shown on failure.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await applySession(null, 'SIGNED_OUT');
  });
  if (button.id === 'refresh') action(async () => {
    const previous = organization;
    await applySession(session, 'MANUAL_REFRESH');
    if (memberships.some(m => m.organization_id === previous) && previous !== organization) {
      organization = previous; generation++; workspace(); await refresh();
    }
  });
  if (button.id === 'change-password') { passwordSetup = true; workspace(); action(refresh); }
});

async function accountOperation(body){
  const {data,error}=await supabase.functions.invoke('account-admin',{body});
  if(error || data?.error){
    let message=data?.error;
    if(error?.context)try{message=(await error.context.json()).error;}catch{/* Generic provider failure. */}
    throw new Error(message || 'Account operation failed. Check permissions and retry.');
  }
  return data;
}
root.addEventListener('change', event => {
  if (event.target.id !== 'organization') return;
  const value = event.target.value;
  if (!memberships.some(m => m.organization_id === value)) return;
  organization = value; generation++; workspace(); action(refresh);
});

supabase.auth.onAuthStateChange((event, next) => {
  // Do not await SDK operations inside the Auth callback (it holds an internal lock).
  setTimeout(() => { void applySession(next, event); }, 0);
});
